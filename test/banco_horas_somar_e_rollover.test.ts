process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'banco-horas-test-session-secret-2026';
process.env.DATA_ENCRYPTION_KEY ||= 'readiness-only-data-encryption-key-never-use-in-production';
process.env.DESKTOP_TIMER_API_KEY = 'desktop-timer-test-key';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-banco-horas-'));
const originalCwd = process.cwd();
process.env.SQLITE_DB_PATH = path.join(tempDir, 'banco_horas.sqlite');
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
  process.env.DESKTOP_TIMER_USER_ID = (db.getRawDb().prepare("SELECT id FROM users WHERE username = 'cadete'").get() as { id: string }).id;

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

test('1. Banco de Horas: Adicionar Biologia com tempo pré-existente deve SOMAR, não substituir', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const targetDate = '2026-10-08';

  // 1. Inserção inicial: 2 horas e 15 minutos (135 min) de Biologia
  const res1 = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `monthly_${targetDate}_biologia_init`,
      subjectId: 'biologia',
      subjectName: 'Biologia',
      dateStr: targetDate,
      durationMinutes: 135, // 2h 15min
      replaceSubjectTime: false,
      notes: 'Primeiro bloco de Biologia',
    }),
  });
  assert.equal(res1.response.status, 200);

  // Consulta do dia
  const day1 = await request(`/api/study-sessions/day/${targetDate}`, { headers });
  assert.equal(day1.response.status, 200);
  assert.equal(day1.body.totalSeconds, 8100, 'Total inicial deve ser 8100s (2h15m)');
  assert.equal(day1.body.bySubject.biologia.durationSeconds, 8100);

  // 2. Adiciona mais 45 minutos (45 min) de Biologia (SEM substituir)
  const res2 = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `monthly_${targetDate}_biologia_add1`,
      subjectId: 'biologia',
      subjectName: 'Biologia',
      dateStr: targetDate,
      durationMinutes: 45, // +45min
      replaceSubjectTime: false,
      notes: 'Segundo bloco de Biologia',
    }),
  });
  assert.equal(res2.response.status, 200);

  // Consulta do dia deve SOMAR: 135 + 45 = 180 min (10800s / 3 horas)
  const day2 = await request(`/api/study-sessions/day/${targetDate}`, { headers });
  assert.equal(day2.response.status, 200);
  assert.equal(day2.body.totalSeconds, 10800, 'Total deve ser exatamente 3 horas (8100 + 2700)');
  assert.equal(day2.body.bySubject.biologia.durationSeconds, 10800);

  // Consulta do resumo diário mensal também deve somar
  const summaryRes = await request(`/api/study-sessions/daily-summary?month=2026-10`, { headers });
  assert.equal(summaryRes.response.status, 200);
  const daySummary = summaryRes.body.summary[targetDate];
  assert.ok(daySummary, 'Resumo do dia deve existir');
  assert.equal(daySummary.totalSeconds, 10800, 'Resumo mensal deve registrar 10800s');
  const bioSub = daySummary.subjects.find((s: any) => s.subjectId === 'biologia');
  assert.equal(bioSub.durationSeconds, 10800, 'Biologia deve somar 10800s no resumo mensal');

  // 3. Adiciona mais 30 minutos (30 min) de Biologia
  const res3 = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `monthly_${targetDate}_biologia_add2`,
      subjectId: 'biologia',
      subjectName: 'Biologia',
      dateStr: targetDate,
      durationMinutes: 30, // +30min
      replaceSubjectTime: false,
      notes: 'Terceiro bloco de Biologia',
    }),
  });
  assert.equal(res3.response.status, 200);

  // Total deve ser 180 + 30 = 210 min (12600s / 3h 30min)
  const day3 = await request(`/api/study-sessions/day/${targetDate}`, { headers });
  assert.equal(day3.body.totalSeconds, 12600, 'Total deve ser 3h 30min (12600s)');
  assert.equal(day3.body.bySubject.biologia.durationSeconds, 12600);
});

test('2. Banco de Horas: Modo replace (ajuste manual) substitui o tempo de forma precisa', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const targetDate = '2026-10-08';

  // Usuário clica em Editar e ajusta Biologia para 2h 00m (120 min)
  const resEdit = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `monthly_${targetDate}_biologia`,
      subjectId: 'biologia',
      subjectName: 'Biologia',
      dateStr: targetDate,
      durationMinutes: 120, // 2 horas
      replaceSubjectTime: true,
      notes: 'Ajuste manual de horas',
    }),
  });
  assert.equal(resEdit.response.status, 200);

  const day = await request(`/api/study-sessions/day/${targetDate}`, { headers });
  assert.equal(day.body.totalSeconds, 7200, 'Total deve ser exatamente 2 horas (7200s)');
  assert.equal(day.body.bySubject.biologia.durationSeconds, 7200);
});

test('3. Desktop Sync: Sessão que virou a noite (startedAt no dia 8, endedAt no dia 9) com dateStr=2026-10-08 é gravada no dia 8', async () => {
  const desktopHeaders = { Authorization: 'Bearer desktop-timer-test-key' };
  const headers = { Authorization: `Bearer ${cadetToken}` };

  const res = await request('/api/study-sessions/desktop', {
    method: 'POST',
    headers: desktopHeaders,
    body: JSON.stringify({
      localSessionId: 'desktop-overnight-sess-1',
      subjectId: 'fisica',
      startedAt: '2026-10-08T23:00:00.000Z',
      endedAt: '2026-10-09T01:30:00.000Z',
      durationSeconds: 9000, // 2h 30m
      dateStr: '2026-10-08', // Explicitamente atribuído ao dia 08 (antes de resetar)
    }),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.session.date_str, '2026-10-08', 'Sessão desktop deve ser persistida no dia 08');

  // Verifica no endpoint diário do dia 08
  const day08 = await request('/api/study-sessions/day/2026-10-08', { headers });
  const fisicaSession = day08.body.sessions.find((s: any) => s.subjectId === 'fisica');
  assert.ok(fisicaSession, 'Sessão da madrugada deve estar listada no dia 08');
  assert.equal(fisicaSession.durationSeconds, 9000);
});
