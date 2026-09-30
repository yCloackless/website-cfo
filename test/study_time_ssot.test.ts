process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'study-time-ssot-test-session-secret-2026';
process.env.DATA_ENCRYPTION_KEY ||= 'readiness-only-data-encryption-key-never-use-in-production';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-study-ssot-'));
process.env.SQLITE_DB_PATH = path.join(tempDir, 'study_ssot.sqlite');

const { app } = await import('../server');
const { AuthService } = await import('../src/db/authService');
const { getDb } = await import('../src/db/database');
const { UserRepository } = await import('../src/db/repositories');

let server: http.Server;
let baseUrl = '';
let cadetToken = '';
let otherUserToken = '';
let cadetUserId = '';
let otherUserId = '';

const testDateStr = '2026-09-30';

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

  // Create another test user for cross-account authorization tests
  const rawDb = db.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const otherUser = userRepo.create({
    username: 'other_cadete_ssot',
    email: 'other_cadete@cfo.test',
    passwordHash: 'fixture_hash_other',
  });
  otherUserId = otherUser.id;

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  // Log in as default cadet
  const loginCadet = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  cadetToken = loginCadet.body.token;
  assert.ok(cadetToken, 'cadete deve autenticar com sucesso');

  const cadetUser = userRepo.findByUsername('cadete');
  assert.ok(cadetUser, 'usuario cadete deve existir no banco');
  cadetUserId = cadetUser.id;

  // Sign token for otherUser via SessionRepository
  const { SessionRepository } = await import('../src/db/repositories');
  const sessionRepo = new SessionRepository(rawDb);
  const { rawToken } = sessionRepo.createSession({ userId: otherUserId, role: 'cadet' });
  otherUserToken = rawToken;
  assert.ok(otherUserToken, 'token do segundo usuario gerado com sucesso');
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  getDb().close();
  rmSync(tempDir, { recursive: true, force: true });
});

let session1PhysicsId = '';
let session2PhysicsId = '';
let session3MathId = '';

test('1. First saved session: Physics 1h -> Save. Hour Bank = 1h, Schedule = 1h, Daily total = 1h', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  session1PhysicsId = crypto.randomUUID();

  // Save 1 hour (3600 seconds) of Physics
  const res = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: session1PhysicsId,
      dateStr: testDateStr,
      subjectId: 'fisica',
      subjectName: 'Física',
      durationSeconds: 3600,
    }),
  });

  assert.ok([200, 201].includes(res.response.status), `Esperado 200/201, obtido ${res.response.status}`);
  assert.equal(res.body.success, true);

  // Check GET /api/study-sessions/day/:dateStr (authoritative aggregate)
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayRes.response.status, 200);
  assert.equal(dayRes.body.totalSeconds, 3600, 'Total do dia deve ser 3600s (1h)');
  assert.equal(dayRes.body.totalHours, 1, 'Total de horas deve ser 1h');
  assert.equal(dayRes.body.bySubject?.fisica?.durationSeconds, 3600, 'Física deve ter 3600s');

  // Hour bank check via range endpoint
  const rangeRes = await request(`/api/study-sessions/range?startDate=${testDateStr}&endDate=${testDateStr}`, { headers });
  assert.equal(rangeRes.response.status, 200);
  const dayData = rangeRes.body.summary?.[testDateStr];
  assert.ok(dayData, 'Dia deve constar no resumo de sessões');
  assert.equal(dayData.totalSeconds, 3600);
  assert.equal(dayData.totalHours, 1);
  const sub = dayData.subjects.find((s: any) => s.subjectId === 'fisica');
  assert.ok(sub);
  assert.equal(sub.durationSeconds, 3600);
});

test('2. Same subject again: Physics +2h -> Save. Physics aggregate = 3h, Daily total = 3h, exactly 2 sessions', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  session2PhysicsId = crypto.randomUUID();

  // Save additional 2 hours (7200 seconds) of Physics
  const res = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: session2PhysicsId,
      dateStr: testDateStr,
      subjectId: 'fisica',
      subjectName: 'Física',
      durationSeconds: 7200,
    }),
  });

  assert.ok([200, 201].includes(res.response.status));
  assert.equal(res.body.success, true);

  // Check aggregate totals
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayRes.response.status, 200);
  assert.equal(dayRes.body.totalSeconds, 10800, 'Total do dia deve ser 10800s (3h)');
  assert.equal(dayRes.body.totalHours, 3, 'Total de horas deve ser 3h');
  assert.equal(dayRes.body.bySubject?.fisica?.durationSeconds, 10800, 'Física deve ter 10800s');

  // Verify sessions count
  assert.equal(dayRes.body.sessions.length, 2, 'Devem existir exatamente 2 sessões válidas salvas');
});

test('3. Different subject: Mathematics 2h -> Save. Physics = 3h, Mathematics = 2h, Daily total = 5h', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  session3MathId = crypto.randomUUID();

  // Save 2 hours (7200 seconds) of Mathematics
  const res = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: session3MathId,
      dateStr: testDateStr,
      subjectId: 'matematica',
      subjectName: 'Matemática',
      durationSeconds: 7200,
    }),
  });

  assert.ok([200, 201].includes(res.response.status));
  assert.equal(res.body.success, true);

  // Check aggregate totals
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayRes.response.status, 200);
  assert.equal(dayRes.body.totalSeconds, 18000, 'Total do dia deve ser 18000s (5h)');
  assert.equal(dayRes.body.totalHours, 5, 'Total de horas deve ser 5h');
  assert.equal(dayRes.body.bySubject?.fisica?.durationSeconds, 10800, 'Física permanece com 3h (10800s)');
  assert.equal(dayRes.body.bySubject?.matematica?.durationSeconds, 7200, 'Matemática possui 2h (7200s)');
  assert.equal(dayRes.body.sessions.length, 3, 'Devem existir 3 sessões');
});

test('4. Delete session: Delete 1h Physics session. Physics = 2h, Math = 2h, Daily total = 4h', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // Identify the 1h session id (session1PhysicsId)
  const dayResBefore = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  const sessionToDelete = dayResBefore.body.sessions.find(
    (s: any) => s.subjectId === 'fisica' && s.durationSeconds === 3600
  );
  assert.ok(sessionToDelete, 'Sessão de 1h de Física deve existir para exclusão');

  // Delete via DELETE /api/study-sessions/:id
  const deleteRes = await request(`/api/study-sessions/${sessionToDelete.id}`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(deleteRes.response.status, 200);
  assert.equal(deleteRes.body.success, true);
  assert.equal(deleteRes.body.removed, true);

  // Verify recalculation in Day API
  const dayResAfter = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayResAfter.response.status, 200);
  assert.equal(dayResAfter.body.totalSeconds, 14400, 'Total do dia deve ser 14400s (4h)');
  assert.equal(dayResAfter.body.totalHours, 4, 'Total de horas deve ser 4h');
  assert.equal(dayResAfter.body.bySubject?.fisica?.durationSeconds, 7200, 'Física recalculada para 2h (7200s)');
  assert.equal(dayResAfter.body.bySubject?.matematica?.durationSeconds, 7200, 'Matemática permanece 2h (7200s)');
  assert.equal(dayResAfter.body.sessions.length, 2, 'Apenas 2 sessões restantes no banco');

  // Verify Schedule reconciliation logic derives 4h (2h Physics + 2h Math)
  const rangeRes = await request(`/api/study-sessions/range?startDate=${testDateStr}&endDate=${testDateStr}`, { headers });
  const daySummary = rangeRes.body.summary?.[testDateStr];
  assert.equal(daySummary.totalHours, 4);
  const fisicaSub = daySummary.subjects.find((s: any) => s.subjectId === 'fisica');
  const mathSub = daySummary.subjects.find((s: any) => s.subjectId === 'matematica');
  assert.equal(fisicaSub.durationSeconds / 3600, 2, 'Cronograma recebe 2h de Física');
  assert.equal(mathSub.durationSeconds / 3600, 2, 'Cronograma recebe 2h de Matemática');
});

test('5. Refresh: DB state reconstruction confirms Physics = 2h, Math = 2h, Daily total = 4h', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // Simulate refresh by querying pristine endpoints without local state
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, {
    headers: { ...headers, 'Cache-Control': 'no-cache, no-store' },
  });
  assert.equal(dayRes.response.status, 200);
  assert.equal(dayRes.body.totalSeconds, 14400);
  assert.equal(dayRes.body.totalHours, 4);
  assert.equal(dayRes.body.bySubject?.fisica?.durationSeconds, 7200);
  assert.equal(dayRes.body.bySubject?.matematica?.durationSeconds, 7200);
  assert.equal(dayRes.body.sessions.length, 2);
});

test('6. Subject switching: Switch between Physics, Math, Chemistry preserves persisted sessions and totals', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // Switch timer active subject back and forth
  const subjects = [
    { id: 'fisica', name: 'Física' },
    { id: 'matematica', name: 'Matemática' },
    { id: 'quimica', name: 'Química' },
    { id: 'fisica', name: 'Física' },
  ];

  for (const s of subjects) {
    const res = await request('/api/timer/subject', {
      method: 'POST',
      headers,
      body: JSON.stringify({ subjectId: s.id, subjectName: s.name }),
    });
    assert.equal(res.response.status, 200);
  }

  // Re-verify persisted totals remain strictly identical
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayRes.body.totalSeconds, 14400);
  assert.equal(dayRes.body.totalHours, 4);
  assert.equal(dayRes.body.bySubject?.fisica?.durationSeconds, 7200);
  assert.equal(dayRes.body.bySubject?.matematica?.durationSeconds, 7200);
  assert.equal(dayRes.body.sessions.length, 2);
});

test('7. Double Save: Burst save requests with same sessionId persist exactly one session', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const doubleSaveSessionId = crypto.randomUUID();

  // Burst 2 identical save requests simultaneously
  const p1 = request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: doubleSaveSessionId,
      dateStr: testDateStr,
      subjectId: 'quimica',
      subjectName: 'Química',
      durationSeconds: 1800, // 30 min
    }),
  });

  const p2 = request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: doubleSaveSessionId,
      dateStr: testDateStr,
      subjectId: 'quimica',
      subjectName: 'Química',
      durationSeconds: 1800,
    }),
  });

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok([200, 201].includes(r1.response.status));
  assert.ok([200, 201].includes(r2.response.status));

  // Exactly one session for Química must exist with this duration
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers });
  assert.equal(dayRes.body.bySubject?.quimica?.durationSeconds, 1800, 'Química deve ter exatamente 1800s, sem duplicação');
  const quimicaSessions = dayRes.body.sessions.filter((s: any) => s.subjectId === 'quimica');
  assert.equal(quimicaSessions.length, 1, 'Deve existir exatamente 1 sessão de Química persistida');
});

test('8. Unauthorized ownership attempt: User B cannot delete User A study session', async () => {
  // Get User A's session id
  const cadetHeaders = { Authorization: `Bearer ${cadetToken}` };
  const dayRes = await request(`/api/study-sessions/day/${testDateStr}`, { headers: cadetHeaders });
  const userASession = dayRes.body.sessions[0];
  assert.ok(userASession, 'Sessão do usuário A deve existir');

  // User B tries to delete User A's session
  const otherHeaders = { Authorization: `Bearer ${otherUserToken}` };
  const deleteAttempt = await request(`/api/study-sessions/${userASession.id}`, {
    method: 'DELETE',
    headers: otherHeaders,
  });

  // Must be rejected with 403 Forbidden
  assert.equal(deleteAttempt.response.status, 403, 'Acesso não autorizado deve retornar 403');
  assert.equal(deleteAttempt.body.error, 'FORBIDDEN');

  // Verify User A's session still exists untouched
  const dayResAfter = await request(`/api/study-sessions/day/${testDateStr}`, { headers: cadetHeaders });
  const stillExists = dayResAfter.body.sessions.some((s: any) => s.id === userASession.id);
  assert.ok(stillExists, 'Sessão do usuário A não deve ter sido excluída');
});

test('9. Invalid duration: Negative, zero, NaN, or excessive durations are safely rejected', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // Negative duration
  const neg = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      dateStr: testDateStr,
      subjectId: 'fisica',
      durationSeconds: -3600,
    }),
  });
  assert.equal(neg.response.status, 400, 'Duração negativa deve retornar 400');

  // Zero duration
  const zero = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      dateStr: testDateStr,
      subjectId: 'fisica',
      durationSeconds: 0,
    }),
  });
  assert.equal(zero.response.status, 400, 'Duração zero deve retornar 400');

  // Excessive duration (> 86400s / 24h)
  const excessive = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      dateStr: testDateStr,
      subjectId: 'fisica',
      durationSeconds: 100000,
    }),
  });
  assert.equal(excessive.response.status, 400, 'Duração excessiva deve retornar 400');

  // NaN duration
  const nanRes = await request('/api/timer/save-session', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId: crypto.randomUUID(),
      dateStr: testDateStr,
      subjectId: 'fisica',
      durationSeconds: 'invalid_number',
    }),
  });
  assert.equal(nanRes.response.status, 400, 'Duração NaN deve retornar 400');
});

test('10. Schedule Reconciliation: Deleting hours reduces the weekly table cell duration from 3h down to 2h and does not ratchet', () => {
  // Simula estado inicial da semana onde Física tinha 3 horas (180 min) salvas no cronograma
  const initialScheduleEntries: Record<string, any> = {
    'fisica_2': {
      id: 'entry_fisica_2',
      subjectId: 'fisica',
      dayIndex: 2,
      dateStr: testDateStr,
      durationMinutes: 180, // 3h
      completed: true,
    },
    'matematica_2': {
      id: 'entry_mat_2',
      subjectId: 'matematica',
      dayIndex: 2,
      dateStr: testDateStr,
      durationMinutes: 120, // 2h
      completed: true,
    },
  };

  // Resumo do banco após exclusão de 1h de Física: Física agora tem 120 min (2h)
  const dailySummaryFromDb = {
    [testDateStr]: {
      dateStr: testDateStr,
      totalSeconds: 14400,
      totalHours: 4,
      subjects: [
        { subjectId: 'fisica', subjectName: 'Física', durationSeconds: 7200 }, // 120 min
        { subjectId: 'matematica', subjectName: 'Matemática', durationSeconds: 7200 }, // 120 min
      ],
    },
  };

  const weekDays = [{ index: 2, dateStr: testDateStr }];
  const subjects = [{ id: 'fisica' }, { id: 'matematica' }, { id: 'quimica' }];

  // Executa a lógica autoritativa de reconciliação idêntica à de App.tsx
  const updatedEntries = { ...initialScheduleEntries };
  for (const day of weekDays) {
    const dayData = dailySummaryFromDb[day.dateStr];
    const dbSubjectDurations = new Map<string, number>();
    if (dayData?.subjects) {
      for (const s of dayData.subjects) {
        dbSubjectDurations.set(s.subjectId, s.durationSeconds / 60);
      }
    }

    for (const sub of subjects) {
      const cellKey = `${sub.id}_${day.index}`;
      const existing = updatedEntries[cellKey];
      const dbMinutes = dbSubjectDurations.get(sub.id) || 0;

      if (dbMinutes > 0) {
        const roundedDbMinutes = Math.round(dbMinutes * 10) / 10;
        if (!existing || existing.durationMinutes !== roundedDbMinutes || !existing.completed) {
          updatedEntries[cellKey] = {
            id: existing?.id || `study_db_${day.dateStr}_${sub.id}`,
            subjectId: sub.id,
            dayIndex: day.index,
            dateStr: day.dateStr,
            durationMinutes: roundedDbMinutes,
            completed: true,
          };
        }
      } else {
        if (existing && (existing.completed || (existing.durationMinutes || 0) > 0)) {
          delete updatedEntries[cellKey];
        }
      }
    }
  }

  // Verifica que Física foi reduzida de 180 min (3h) para 120 min (2h) e NÃO manteve o valor antigo
  assert.equal(updatedEntries['fisica_2'].durationMinutes, 120, 'Física no cronograma deve ter sido atualizada para 120 min (2h)');
  assert.equal(updatedEntries['matematica_2'].durationMinutes, 120, 'Matemática permanece com 120 min (2h)');
  const totalScheduleHours = (updatedEntries['fisica_2'].durationMinutes + updatedEntries['matematica_2'].durationMinutes) / 60;
  assert.equal(totalScheduleHours, 4, 'Total no cronograma deve ser 4h exatas');
});
