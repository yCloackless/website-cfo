process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'timer-deploy-persistence-test-session-secret';
process.env.DESKTOP_TIMER_API_KEY = 'desktop-timer-test-key';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
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
  process.env.DESKTOP_TIMER_USER_ID = (getDb().getRawDb().prepare("SELECT id FROM users WHERE username = 'cadete'").get() as { id: string }).id;
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
  const started = await request('/api/timer/start', { method: 'POST', headers, body: JSON.stringify({ subjectId: 'fisica', subjectName: 'Física', resetAccumulated: true }) });
  const studySessionId = started.body.studySessionId;
  assert.match(studySessionId, /^[a-f\d-]{36}$/i);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const saved = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ studySessionId, durationSeconds: 1 }),
  });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.body.session.subject_id, 'fisica');
  assert.ok(saved.body.session.duration_seconds >= 1);
  assert.equal(saved.body.timerState.status, 'STOPPED');
  const duplicate = await request('/api/timer/save-session', {
    method: 'POST', headers, body: JSON.stringify({ studySessionId, durationSeconds: 1 }),
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.body.duplicate, true);
  const stored = getDb().getRawDb().prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE source = 'website_timer' AND local_session_id LIKE ?").get(`${studySessionId}:%`) as { count: number };
  assert.equal(stored.count, 1);
  const range = await request(`/api/study-sessions/range?startDate=${saved.body.session.date_str}&endDate=${saved.body.session.date_str}`, { headers });
  const physics = range.body.summary[saved.body.session.date_str].subjects.find((subject: any) => subject.subjectId === 'fisica');
  assert.equal(physics.durationSeconds, saved.body.session.duration_seconds);
  const status = await request('/api/timer/status', { headers });
  assert.equal(status.body.status, 'STOPPED');
});

test('a integração desktop autentica, persiste por matéria e é idempotente', async () => {
  const preflight = await fetch(`${baseUrl}/api/study-sessions/desktop/subjects`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://tauri.localhost',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://tauri.localhost');

  const devPreflight = await fetch(`${baseUrl}/api/study-sessions/desktop/subjects`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:1420',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  assert.equal(devPreflight.status, 204);
  assert.equal(devPreflight.headers.get('access-control-allow-origin'), 'http://localhost:1420');

  const linuxPreflight = await fetch(`${baseUrl}/api/study-sessions/desktop/subjects`, {
    method: 'OPTIONS', headers: { Origin: 'tauri://localhost', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(linuxPreflight.status, 204);
  assert.equal(linuxPreflight.headers.get('access-control-allow-origin'), 'tauri://localhost');

  const unauthorized = await fetch(`${baseUrl}/api/study-sessions/desktop/subjects`, {
    headers: { Authorization: 'Bearer chave-incorreta' },
  });
  assert.equal(unauthorized.status, 401);

  const headers = { Authorization: `Bearer ${process.env.DESKTOP_TIMER_API_KEY}` };
  const subjectList = await request('/api/study-sessions/desktop/subjects', { headers });
  assert.equal(subjectList.response.status, 200);
  const physics = subjectList.body.subjects.find((subject: any) => subject.id === 'fisica');
  assert.ok(physics, 'Física deve vir da lista real associada ao usuário');

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 60_000);
  const localSessionId = randomUUID();
  const payload = { localSessionId, subjectId: physics.id, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), durationSeconds: 60 };
  const saved = await request('/api/study-sessions/desktop', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.session.subject_id, 'fisica');
  assert.equal(saved.body.session.duration_seconds, 60);

  // Testa tolerância a pequenos desvios de sub-segundos entre o relógio de parede e a medição do cronômetro
  const driftEnd = new Date();
  const driftStart = new Date(driftEnd.getTime() - 59_200); // 59.2s de relógio de parede, mas cronômetro marcou 60s
  const driftLocalId = randomUUID();
  const driftSaved = await request('/api/study-sessions/desktop', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      localSessionId: driftLocalId,
      subjectId: 'fisica',
      startedAt: driftStart.toISOString(),
      endedAt: driftEnd.toISOString(),
      durationSeconds: 60,
    }),
  });
  assert.equal(driftSaved.response.status, 200);
  assert.equal(driftSaved.body.session.duration_seconds, 60);

  // Testa busca tolerante por nome de matéria (ex.: "Física Aplicada")
  const nameMappingSaved = await request('/api/study-sessions/desktop', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      localSessionId: randomUUID(),
      subjectId: 'Física Aplicada',
      startedAt: new Date(Date.now() - 30_000).toISOString(),
      endedAt: new Date().toISOString(),
      durationSeconds: 30,
    }),
  });
  assert.equal(nameMappingSaved.response.status, 200);
  assert.equal(nameMappingSaved.body.session.subject_id, 'fisica');

  const duplicate = await request('/api/study-sessions/desktop', { method: 'POST', headers, body: JSON.stringify(payload) });
  assert.equal(duplicate.response.status, 200);
  const count = getDb().getRawDb().prepare("SELECT COUNT(*) AS count FROM study_sessions WHERE source = 'desktop_timer' AND local_session_id = ?").get(localSessionId) as { count: number };
  assert.equal(count.count, 1);
  const range = await request(`/api/study-sessions/range?startDate=${saved.body.session.date_str}&endDate=${saved.body.session.date_str}`, { headers: { Authorization: `Bearer ${token}` } });
  const subjectSummary = range.body.summary[saved.body.session.date_str].subjects.find((subject: any) => subject.subjectId === 'fisica');
  assert.ok(subjectSummary.durationSeconds >= 60);
});
