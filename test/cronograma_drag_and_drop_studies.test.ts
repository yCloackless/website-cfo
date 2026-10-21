process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'drag-drop-test-session-secret-2026';
process.env.DATA_ENCRYPTION_KEY ||= 'readiness-only-data-encryption-key-never-use-in-production';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-drag-drop-'));
const originalCwd = process.cwd();
process.env.SQLITE_DB_PATH = path.join(tempDir, 'drag_drop.sqlite');
process.chdir(tempDir);

const { app } = await import('../server');
const { AuthService } = await import('../src/db/authService');
const { getDb } = await import('../src/db/database');

let server: http.Server;
let baseUrl = '';
let cadetToken = '';

async function request(pathUrl: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + pathUrl, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body: any = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

test.before(async () => {
  const db = getDb();
  await new AuthService(db).ensureDefaultAccounts();

  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });

  const loginRes = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  cadetToken = loginRes.body?.token;
  assert.ok(cadetToken, 'Token do cadete deve estar disponível');
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  getDb().close();
  process.chdir(originalCwd);
  try { rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

test('1. Drag & Drop no Cronograma: Mover Geografia de Terça para Segunda vazia', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const tuesday = '2026-10-20';
  const monday = '2026-10-19';

  // 1. Inserção em Terça-feira: 90 minutos (5400s) de Geografia
  const initRes = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${tuesday}_geografia`,
      subjectId: 'geografia',
      subjectName: 'Geografia',
      topic: 'Geopolítica e Climatologia',
      dateStr: tuesday,
      durationMinutes: 90,
      replaceSubjectTime: true,
      notes: 'Estudo de Terça',
    }),
  });
  assert.equal(initRes.response.status, 200);

  // Verifica estado inicial de terça e segunda
  const dayTueBefore = await request(`/api/study-sessions/day/${tuesday}`, { headers });
  assert.equal(dayTueBefore.body.totalSeconds, 5400);

  const dayMonBefore = await request(`/api/study-sessions/day/${monday}`, { headers });
  assert.equal(dayMonBefore.body.totalSeconds, 0);

  // 2. Mover: Deleta da terça e persiste na segunda
  const deleteTue = await request(`/api/study-sessions/day-subject?dateStr=${tuesday}&subjectId=geografia`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleteTue.response.status, 200);
  assert.equal(deleteTue.body.removed, true);

  const saveMon = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${monday}_geografia_moved`,
      subjectId: 'geografia',
      subjectName: 'Geografia',
      topic: 'Geopolítica e Climatologia',
      dateStr: monday,
      durationMinutes: 90,
      replaceSubjectTime: true,
      notes: 'Movido de Terça',
    }),
  });
  assert.equal(saveMon.response.status, 200);

  // Verifica que terça foi limpa e segunda recebeu os 90 minutos
  const dayTueAfter = await request(`/api/study-sessions/day/${tuesday}`, { headers });
  assert.equal(dayTueAfter.body.totalSeconds, 0, 'Terça-feira deve ter 0s após a movimentação');

  const dayMonAfter = await request(`/api/study-sessions/day/${monday}`, { headers });
  assert.equal(dayMonAfter.body.totalSeconds, 5400, 'Segunda-feira deve ter 5400s (1h30m)');
  assert.equal(dayMonAfter.body.sessions[0].topic, 'Geopolítica e Climatologia');
});

test('2. Drag & Drop no Cronograma: Mover de Quarta para Sexta somando horas pré-existentes', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const wednesday = '2026-10-21';
  const friday = '2026-10-23';

  // Sexta já possui 60 minutos (3600s) de Geografia
  await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${friday}_geografia`,
      subjectId: 'geografia',
      subjectName: 'Geografia',
      topic: 'Urbanização',
      dateStr: friday,
      durationMinutes: 60,
      replaceSubjectTime: true,
    }),
  });

  // Quarta possui 45 minutos (2700s) de Geografia
  await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${wednesday}_geografia`,
      subjectId: 'geografia',
      subjectName: 'Geografia',
      topic: 'Relevo Brasileiro',
      dateStr: wednesday,
      durationMinutes: 45,
      replaceSubjectTime: true,
    }),
  });

  // Puxar Geografia de Quarta para Sexta (somar 60 + 45 = 105 min = 6300s)
  const delWed = await request(`/api/study-sessions/day-subject?dateStr=${wednesday}&subjectId=geografia`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(delWed.response.status, 200);

  const saveFri = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${friday}_geografia_merged`,
      subjectId: 'geografia',
      subjectName: 'Geografia',
      topic: 'Urbanização + Relevo Brasileiro',
      dateStr: friday,
      durationMinutes: 105,
      replaceSubjectTime: true,
      notes: 'Horas somadas via arrasto',
    }),
  });
  assert.equal(saveFri.response.status, 200);

  // Quarta agora é 0s
  const dayWed = await request(`/api/study-sessions/day/${wednesday}`, { headers });
  assert.equal(dayWed.body.totalSeconds, 0, 'Quarta deve estar zerada');

  // Sexta agora tem 105 minutos (6300s)
  const dayFri = await request(`/api/study-sessions/day/${friday}`, { headers });
  assert.equal(dayFri.body.totalSeconds, 6300, 'Sexta deve ter 105 min (6300s)');
  assert.equal(dayFri.body.bySubject.geografia.durationSeconds, 6300);
});
