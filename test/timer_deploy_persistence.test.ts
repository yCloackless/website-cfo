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
