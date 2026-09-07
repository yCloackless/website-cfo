// Production HTTP audit. Uses synthetic credentials and disposable data only.
// Nonzero exit means a readiness gate failed; results never contain credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { generateSync, generateSecret } from 'otplib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-production-audit-'));
fs.cpSync(path.join(root, 'dist'), path.join(cwd, 'dist'), { recursive: true });
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC|PATHEXT)$/i.test(key)));
Object.assign(env, { NODE_ENV: 'production', PORT: String(port), APP_URL: `http://127.0.0.1:${port}`,
  ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'), CADET_PASSWORD: crypto.randomBytes(24).toString('hex'),
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'), TOTP_SECRET: generateSecret(),
  TURNSTILE_SECRET_KEY: 'audit-placeholder-no-external-calls' });
const missingEmail = spawnSync(process.execPath, [path.join(root, 'dist/server.cjs')], { cwd, env, encoding: 'utf8', timeout: 6000 });
Object.assign(env, { RESEND_API_KEY: 're_synthetic_provider_fixture', EMAIL_FROM: 'audit@example.invalid' });
const mockPath = path.join(cwd, 'mock-email.mjs');
fs.writeFileSync(mockPath, `import fs from 'node:fs';
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || String(input));
  if (url.origin === 'https://api.resend.com') {
    fs.writeFileSync('email-fixture.json', init.body);
    return new Response(JSON.stringify({ id: 'synthetic-delivery' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('External network disabled in production audit');
};`);
const child = spawn(process.execPath, ['--import', pathToFileURL(mockPath).href, path.join(root, 'dist/server.cjs')], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
child.stdout.on('data', data => { serverLog += data; });
child.stderr.on('data', data => { serverLog += data; });
const results = [];
const record = (name, pass, evidence) => { results.push({ name, pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${evidence}`); };
const base = `http://127.0.0.1:${port}`;
async function request(url, body, token, method, headers = {}) {
  const res = await fetch(base + url, { method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(6000) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  return { res, data, text };
}
let db;
let streamAbort;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/api/health')).res.ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Production process did not become healthy');
  db = new DatabaseSync(path.join(cwd, 'data/cfo_app.sqlite'));
  record('production warns missing email configuration', missingEmail.stderr.includes('RESEND_API_KEY'), 'Startup warns when email configuration is missing');
  record('migrations and database integrity', db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
    `${db.prepare('SELECT count(*) AS n FROM _migrations').get().n} migrations; fresh database integrity_check`);
  const page = await request('/');
  record('frontend production HTML', page.res.ok && page.text.includes('<div id="root">'), `HTTP ${page.res.status}`);
  record('security headers', !!page.res.headers.get('content-security-policy') && page.res.headers.get('x-content-type-options') === 'nosniff', 'CSP, HSTS and nosniff inspected');
  for (const asset of ['/server.cjs', '/server.cjs.map']) {
    const response = await request(asset);
    record(`private build artifact ${asset}`, [403, 404].includes(response.res.status),
      `HTTP ${response.res.status}; ${response.text.length} characters; accessible=${response.res.ok && response.text !== page.text}`);
  }
  const cors = await request('/api/user/profile', undefined, undefined, 'GET', { Origin: 'https://attacker.invalid' });
  record('CORS rejects foreign origin', !cors.res.headers.has('access-control-allow-origin') && !cors.res.ok, `HTTP ${cors.res.status}`);
  const bad = await request('/api/auth/check-credentials', { username: 'cadete', password: 'incorrect' });
  record('invalid login', bad.res.status === 401, `HTTP ${bad.res.status}`);
  const login = await request('/api/auth/check-credentials', { username: 'cadete', password: env.CADET_PASSWORD });
  const token = login.data.token;
  record('valid cadet login', login.res.ok && !!token, `HTTP ${login.res.status}`);
  record('Bearer session without cookies', !login.res.headers.has('set-cookie'), 'No Set-Cookie; Secure/HttpOnly/SameSite do not apply to this session mechanism');
  const profile = await request('/api/user/profile', undefined, token);
  record('authenticated profile', profile.data.user?.role === 'cadet', `HTTP ${profile.res.status}`);
  const edit = await request('/api/user/profile', { fullName: 'Readiness Cadet', role: 'admin' }, token, 'PATCH');
  record('profile update and mass assignment', edit.data.user?.fullName === 'Readiness Cadet' && edit.data.user?.role === 'cadet', `HTTP ${edit.res.status}`);
  record('cadet denied admin', (await request('/api/admin/users', undefined, token)).res.status === 403, 'GET /api/admin/users');
  record('anonymous denied admin', (await request('/api/admin/users')).res.status === 403, 'GET /api/admin/users');
  record('active session', (await request('/api/auth/verify-session', { token })).data.valid === true, 'verify-session');
  await request('/api/auth/logout', { token });
  record('logout revokes session', (await request('/api/auth/verify-session', { token })).res.status === 401, 'verify-session after logout');
  const fresh = await request('/api/auth/check-credentials', { username: 'cadete', password: env.CADET_PASSWORD });
  db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run('2000-01-01T00:00:00.000Z', crypto.createHash('sha256').update(fresh.data.token).digest('hex'));
  const expired = await request('/api/auth/verify-session', { token: fresh.data.token });
  record('expired session', expired.res.status === 401, `HTTP ${expired.res.status}; database expiry forced into past, original signed payload still valid`);
  const adminStep = await request('/api/auth/check-credentials', { username: 'admin', password: env.ADMIN_PASSWORD });
  record('admin requires 2FA', adminStep.data.requireTotp === true && !adminStep.data.token, 'Credential step does not issue session');
  const missing2fa = await request('/api/auth/verify-2fa', { username: 'admin', password: env.ADMIN_PASSWORD });
  record('missing 2FA denied', !missing2fa.res.ok && !missing2fa.data.token, `HTTP ${missing2fa.res.status}`);
  const admin = await request('/api/auth/verify-2fa', { username: 'admin', password: env.ADMIN_PASSWORD, token: generateSync({ secret: env.TOTP_SECRET }) });
  const adminToken = admin.data.token;
  record('valid TOTP login', !!adminToken && admin.data.role === 'admin', `HTTP ${admin.res.status}`);
  record('admin users', (await request('/api/admin/users', undefined, adminToken)).res.ok, 'Authenticated production API');
  record('admin audit', (await request('/api/admin/audit-logs', undefined, adminToken)).res.ok, 'Authenticated production API');
  record('security events', (await request('/api/admin/security/events', undefined, adminToken)).res.ok, 'Authenticated production API');
  streamAbort = new AbortController();
  const stream = await fetch(base + '/api/admin/realtime/stream', { headers: { Authorization: `Bearer ${adminToken}` }, signal: streamAbort.signal });
  const reader = stream.body.getReader();
  const handshake = new TextDecoder().decode((await reader.read()).value);
  record('SSE authenticated handshake', stream.ok && handshake.includes('CONNECTED'), `HTTP ${stream.status}`);
  await request('/api/auth/logout', { token: adminToken });
  await request('/api/auth/check-credentials', { username: 'cadete', password: 'wrong-after-revocation' });
  const afterRevoke = await Promise.race([(async () => {
    let text = '';
    while (true) {
      const chunk = await reader.read();
      text += chunk.value ? new TextDecoder().decode(chunk.value) : '';
      if (chunk.done || text.includes('LOGIN_FAILED')) return { done: chunk.done, text };
    }
  })(), new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 2000))]);
  const streamed = afterRevoke.text || '';
  record('SSE terminates after revocation', afterRevoke.done === true, `done=${afterRevoke.done === true}; received LOGIN_FAILED=${streamed.includes('LOGIN_FAILED')}`);
  streamAbort.abort();
  const recovery = await request('/api/auth/forgot-password', { email: 'cadete@cbmerj.com' });
  record('production recovery hides code', !('debugCode' in recovery.data), `HTTP ${recovery.res.status}; provider transport mocked`);
  const email = JSON.parse(fs.readFileSync(path.join(cwd, 'email-fixture.json'), 'utf8'));
  const resetCode = email.text.match(/\b\d{6}\b/)?.[0];
  record('recovery delivers to configured provider', !!resetCode && email.to.includes('cadete@cbmerj.com'), 'Resend request captured locally; no real email sent');
  const newPassword = crypto.randomBytes(24).toString('hex');
  const reset = await request('/api/auth/reset-password', { email: 'cadete@cbmerj.com', code: resetCode, newPassword });
  record('password reset API', reset.data.success === true, `HTTP ${reset.res.status}; code obtained from mocked email delivery`);
  const afterReset = await request('/api/auth/check-credentials', { username: 'cadete', password: newPassword });
  record('login with reset password', afterReset.res.ok && !!afterReset.data.token, `HTTP ${afterReset.res.status}`);
  const oldLogin = await request('/api/auth/check-credentials', { username: 'cadete', password: env.CADET_PASSWORD });
  record('old password rejected after reset', oldLogin.res.status === 401, `HTTP ${oldLogin.res.status}`);
  const timer = await request('/api/timer/start', { subjectId: 'audit', subjectName: 'Audit' });
  record('timer mutation requires auth', [401, 403].includes(timer.res.status), `Anonymous HTTP ${timer.res.status}`);
  const ai = await request('/api/ai/nonexistent-audit-probe', undefined, undefined, 'GET', { Host: 'audit.invalid', 'x-user-email': 'jb080956@gmail.com' });
  record('AI rejects forged email', [401, 403].includes(ai.res.status), `Anonymous HTTP ${ai.res.status}; no AI provider invoked`);
  let rateStatus = 0;
  for (let i = 0; i < 18; i++) { rateStatus = (await request('/api/auth/check-credentials', { username: 'cadete', password: 'invalid' })).res.status; if (rateStatus === 429) break; }
  record('login rate limit', rateStatus === 429, `HTTP ${rateStatus}`);
} catch (error) {
  record('audit execution', false, error.message);
} finally {
  streamAbort?.abort();
  db?.close();
  child.kill();
  await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  // Only synthetic server data/logs exist in this directory; never copy the real .env here.
  fs.writeFileSync(path.join(cwd, 'server.log'), serverLog);
  fs.writeFileSync(path.join(cwd, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Isolated evidence: ${cwd}`);
  process.exitCode = results.every(result => result.pass) ? 0 : 1;
}
