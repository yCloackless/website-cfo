process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'timer-subject-switching-test-session-secret';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-timer-switch-'));
process.env.SQLITE_DB_PATH = path.join(tempDir, 'timer_switch.sqlite');

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

test('SW-1: Alternância sequencial repetida A -> B -> C -> A -> B -> A -> C com timer RUNNING preserva tempo e gera intervalos atômicos', async () => {
  const headers = { Authorization: `Bearer ${token}` };

  // 1. Zera o cronômetro
  await request('/api/timer/reset', { method: 'POST', headers });

  // 2. Inicia estudo na matéria A (Física)
  const startA = await request('/api/timer/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId: 'fisica', subjectName: 'Física' }),
  });
  assert.equal(startA.response.status, 200);
  assert.equal(startA.body.status, 'RUNNING');
  assert.equal(startA.body.activeSubjectId, 'fisica');

  // Aguarda 100ms para acumular tempo
  await new Promise((r) => setTimeout(r, 100));

  const subjects = [
    { id: 'quimica', name: 'Química' },
    { id: 'matematica', name: 'Matemática' },
    { id: 'fisica', name: 'Física' },
    { id: 'quimica', name: 'Química' },
    { id: 'fisica', name: 'Física' },
    { id: 'matematica', name: 'Matemática' },
  ];

  // Alterna repetidamente enquanto RUNNING
  for (const sub of subjects) {
    const res = await request('/api/timer/subject', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subjectId: sub.id, subjectName: sub.name }),
    });
    assert.equal(res.response.status, 200);
    assert.equal(res.body.activeSubjectId, sub.id);
    assert.equal(res.body.status, 'RUNNING');
    await new Promise((r) => setTimeout(r, 50));
  }

  // Pausa o cronômetro
  const paused = await request('/api/timer/pause', { method: 'POST', headers });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.status, 'PAUSED');

  // Verifica se o tempo total acumulado é coerente (> 350ms) e nenhum segundo foi perdido
  assert.ok(paused.body.totalElapsedMs >= 300, `totalElapsedMs esperado >= 300, obtido ${paused.body.totalElapsedMs}`);
  assert.equal(paused.body.activeSubjectId, 'matematica');

  // Verifica se os intervalos no banco de dados registraram cada troca de disciplina
  const status = await request('/api/timer/status', { headers });
  assert.equal(status.response.status, 200);
  assert.ok(Array.isArray(status.body.intervals), 'intervals deve ser um array');
  assert.ok(status.body.intervals.length >= 6, `deve conter pelo menos 6 intervalos de estudo das disciplinas trocadas, obtido ${status.body.intervals.length}`);
});

test('SW-2: Alternância de matérias em estado PAUSED e STOPPED não reverte status nem perde contadores', async () => {
  const headers = { Authorization: `Bearer ${token}` };

  // Timer está PAUSED. Troca para História
  const switchPaused = await request('/api/timer/subject', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId: 'historia', subjectName: 'História' }),
  });
  assert.equal(switchPaused.response.status, 200);
  assert.equal(switchPaused.body.status, 'PAUSED');
  assert.equal(switchPaused.body.activeSubjectId, 'historia');

  // Zera cronômetro
  await request('/api/timer/reset', { method: 'POST', headers });

  // Timer está STOPPED. Troca para Geografia
  const switchStopped = await request('/api/timer/subject', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId: 'geografia', subjectName: 'Geografia' }),
  });
  assert.equal(switchStopped.response.status, 200);
  assert.equal(switchStopped.body.status, 'STOPPED');
  assert.equal(switchStopped.body.activeSubjectId, 'geografia');
  assert.equal(switchStopped.body.accumulatedTime, 0);
});

test('SW-3: Trocas rápidas em rajada concorrente (burst de 10 requests simultâneas) resultam em estado consistente', async () => {
  const headers = { Authorization: `Bearer ${token}` };

  await request('/api/timer/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({ subjectId: 'base', subjectName: 'Matéria Base' }),
  });

  const burstSubjects = [
    { id: 'sub_1', name: 'Disciplina 1' },
    { id: 'sub_2', name: 'Disciplina 2' },
    { id: 'sub_3', name: 'Disciplina 3' },
    { id: 'sub_4', name: 'Disciplina 4' },
    { id: 'sub_5', name: 'Disciplina 5' },
    { id: 'sub_6', name: 'Disciplina 6' },
    { id: 'sub_7', name: 'Disciplina 7' },
    { id: 'sub_8', name: 'Disciplina 8' },
    { id: 'sub_9', name: 'Disciplina 9' },
    { id: 'sub_10', name: 'Disciplina 10' },
  ];

  // Dispara em paralelo simultaneamente
  const promises = burstSubjects.map((sub) =>
    request('/api/timer/subject', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subjectId: sub.id, subjectName: sub.name }),
    })
  );

  const results = await Promise.all(promises);
  for (const r of results) {
    assert.equal(r.response.status, 200);
  }

  // Verifica estado final no servidor
  const finalStatus = await request('/api/timer/status', { headers });
  assert.equal(finalStatus.response.status, 200);
  assert.equal(finalStatus.body.status, 'RUNNING');
  assert.ok(burstSubjects.some((s) => s.id === finalStatus.body.activeSubjectId));
});
