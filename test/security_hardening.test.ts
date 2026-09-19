process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;
delete process.env.RESEND_API_KEY;
process.env.NOTION_API_KEY = 'synthetic-notion-key';
process.env.NOTION_DATABASE_ID = 'synthetic-notion-database';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateSync } from 'otplib';

const nativeFetch = globalThis.fetch;
let notionFetches = 0;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (target.startsWith('https://api.notion.com/')) {
    notionFetches += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return nativeFetch(input, init);
};

const { app } = await import('../server');
const { getDb } = await import('../src/db/database');
const { AuthService } = await import('../src/db/authService');
const { updateCheckinInNotion } = await import('../notionBackend');
const { sendPasswordResetEmail } = await import('../src/services/emailService');

let server: http.Server;
let baseUrl: string;
let adminToken = '';
let cadetToken = '';
let adminCookie = '';

async function request(path: string, options: RequestInit = {}) {
  const response = await nativeFetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { response, body, text };
}

test.before(async () => {
  const authService = new AuthService(getDb());
  await authService.ensureDefaultAccounts();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  const adminLogin = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_PASSWORD }),
  });
  adminToken = adminLogin.body.token;
  assert.ok(adminToken, 'Fixture must initially issue the setup session while 2FA is disabled');
  adminCookie = adminLogin.response.headers.get('set-cookie') || '';

  const cadetLogin = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  cadetToken = cadetLogin.body.token;
  assert.ok(cadetToken, 'Cadet fixture login must succeed');
});

test.after(async () => {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('F-01: 2FA activation remains enabled after configuration is reloaded', async () => {
  const activation = await request('/api/auth/activate-2fa', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ token: generateSync({ secret: process.env.TOTP_SECRET! }) }),
  });
  assert.equal(activation.response.status, 200);
  assert.equal(activation.body.is2faActive, true);

  const status = await request('/api/auth/2fa-status');
  assert.equal(status.body.is2faActive, true, 'Persisted activation must not silently revert to false');
});

test('F-02: active 2FA secret cannot be retrieved with a bearer session', async () => {
  const setup = await request('/api/auth/2fa-setup', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(setup.response.status, 409);
  assert.equal('secret' in setup.body, false);
  assert.equal('otpauthUrl' in setup.body, false);
  assert.equal('qrCode' in setup.body, false);
});

test('F-03: Notion rejects a page outside the server-known revision set', async () => {
  const before = notionFetches;
  const result = await updateCheckinInNotion('../databases/arbitrary-target', 'semana', true);
  assert.equal(result.success, false);
  assert.equal(notionFetches, before, 'Rejected identifiers must never reach the provider API');
});

test('F-04: AI prompt fields are bounded before provider invocation', async () => {
  const oversized = await request('/api/ai/flashcards', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({ subjectOrTopic: 'A'.repeat(5000) }),
  });
  assert.equal(oversized.response.status, 413);
  assert.equal(oversized.body.error, 'AI_INPUT_TOO_LARGE');
});

test('F-04: AI routes enforce a dedicated authenticated-account quota', async () => {
  let lastStatus = 0;
  for (let index = 0; index < 35; index += 1) {
    const result = await request('/api/ai/flashcards', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cadetToken}` },
      body: JSON.stringify({ subjectOrTopic: `topic-${index}` }),
    });
    lastStatus = result.response.status;
    if (lastStatus === 429) break;
  }
  assert.equal(lastStatus, 429);
});

test('F-05: reset delivery never logs the recovery code', async () => {
  const syntheticCode = '947251';
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };
  try {
    const result = await sendPasswordResetEmail('audit@example.invalid', 'audit-user', syntheticCode);
    assert.equal(result.sent, false);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.some((line) => line.includes(syntheticCode)), false);
});

test('F-06: cookie-authenticated mutations reject cross-site origins', async () => {
  assert.match(adminCookie, /(?:^|;)\s*cfo_session=/);
  const rejected = await request('/api/auth/logout', {
    method: 'POST',
    headers: {
      Cookie: adminCookie,
      Origin: 'https://attacker.example',
    },
  });
  assert.equal(rejected.response.status, 403);
  assert.equal(rejected.body.error, 'CSRF_ORIGIN_REJECTED');
});

test('F-07: extension token is restricted to extension synchronization routes', async () => {
  const issued = await request('/api/user/extension-token', {
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(issued.response.status, 200);
  assert.ok(issued.body.token);

  const timer = await request('/api/timer/status', {
    headers: { Authorization: `Bearer ${issued.body.token}` },
  });
  assert.equal(timer.response.status, 200);

  const profile = await request('/api/user/profile', {
    headers: { Authorization: `Bearer ${issued.body.token}` },
  });
  assert.equal(profile.response.status, 401);
  assert.equal(profile.body.error, 'UNAUTHORIZED');
});
