process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'timer-deploy-persistence-test-session-secret';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-timer-deploy-'));
process.env.SQLITE_DB_PATH = path.join(tempDir, 'timer.sqlite');

const { app } = await import('../server');
const { AuthService } = await import('../src/db/authService');
const { getDb } = await import('../src/db/database');

let server: http.Server;
let baseUrl = '';
let token = '';

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

test.before(async () => {
  await new AuthService(getDb()).ensureDefaultAccounts();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const login = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  token = login.body.token;
  assert.ok(token, 'o cadete de teste deve autenticar');
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  getDb().close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('o estado ativo do cronômetro persiste no banco e sobrevive à sincronização do usuário', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const started = await request('/api/timer/start', { method: 'POST', headers, body: JSON.stringify({ subjectId: 'fisica', subjectName: 'Física' }) });
  assert.equal(started.response.status, 200);

  const beforeSync = await request('/api/user/state', { headers });
  const persistedTimer = JSON.parse(beforeSync.body.state.cfo_timer_state_v1);
  assert.equal(persistedTimer.status, 'RUNNING');

  const sync = await request('/api/user/state', { method: 'PUT', headers, body: JSON.stringify({ state: { cfo_theme: 'dark' } }) });
  assert.equal(sync.response.status, 200);

  const restored = await request('/api/timer/status', { headers });
  assert.equal(restored.body.status, 'RUNNING');
  assert.equal(restored.body.startTime, persistedTimer.startTime);
});

test('a pausa preserva o acumulado mais recente recebido da extensão', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  await request('/api/timer/start', { method: 'POST', headers, body: JSON.stringify({ accumulatedTime: 12 * 60_000 }) });

  const paused = await request('/api/timer/pause', {
    method: 'POST',
    headers,
    body: JSON.stringify({ accumulatedTime: 34 * 60_000 }),
  });

  assert.equal(paused.response.status, 200);
  assert.ok(paused.body.accumulatedTime >= 34 * 60_000);
});

test('30 transições autenticadas de Start/Pause/Resume/Stop mantêm o status esperado', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  const reset = await request('/api/timer/reset', { method: 'POST', headers });
  assert.equal(reset.response.status, 200);
  const sequence = [
    ['/api/timer/start', 'RUNNING'],
    ['/api/timer/pause', 'PAUSED'],
    ['/api/timer/start', 'RUNNING'],
    ['/api/timer/pause', 'PAUSED'],
    ['/api/timer/start', 'RUNNING'],
    ['/api/timer/reset', 'STOPPED'],
  ] as const;

  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const [route, expectedStatus] of sequence) {
      const result = await request(route, { method: 'POST', headers });
      assert.equal(result.response.status, 200, `${route} ciclo ${cycle + 1}`);
      assert.equal(result.body.status, expectedStatus, `${route} ciclo ${cycle + 1}`);
    }
  }
});

test('finalizar e gravar a sessão deixa o cronômetro parado no servidor', async () => {
  const headers = { Authorization: `Bearer ${token}` };
  await request('/api/timer/start', { method: 'POST', headers, body: JSON.stringify({ subjectId: 'fisica', subjectName: 'Física' }) });
  const saved = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId: 'fisica', subjectName: 'Física', durationSeconds: 1 }),
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.body.timerState.status, 'STOPPED');
  const status = await request('/api/timer/status', { headers });
  assert.equal(status.body.status, 'STOPPED');
});
