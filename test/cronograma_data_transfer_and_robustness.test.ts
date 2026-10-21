process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.SESSION_SECRET ||= 'data-transfer-test-session-secret-2026';
process.env.DATA_ENCRYPTION_KEY ||= 'readiness-only-data-encryption-key-never-use-in-production';
process.env.DESKTOP_TIMER_API_KEY = 'desktop-timer-robustness-key';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-data-transfer-'));
const originalCwd = process.cwd();
process.env.SQLITE_DB_PATH = path.join(tempDir, 'data_transfer.sqlite');
process.chdir(tempDir);

const { app } = await import('../server');
const { AuthService } = await import('../src/db/authService');
const { getDb } = await import('../src/db/database');
const { SessionRepository, UserRepository } = await import('../src/db/repositories');

let server: http.Server;
let baseUrl = '';
let cadetToken = '';
let cadetUserId = '';
let otherUserToken = '';

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
  const rawDb = db.getRawDb();
  await new AuthService(db).ensureDefaultAccounts();

  const cadetRow = rawDb.prepare("SELECT id FROM users WHERE username = 'cadete'").get() as { id: string };
  cadetUserId = cadetRow.id;
  process.env.DESKTOP_TIMER_USER_ID = cadetUserId;

  // Cria um segundo usuário para testes de isolamento de inquilino (IDOR)
  const users = new UserRepository(rawDb);
  const sessions = new SessionRepository(rawDb);
  const otherUser = users.create({
    username: 'outro_aluno',
    email: 'outro@cbmerj.com',
    passwordHash: 'fixture-hash',
    role: 'cadet',
    canAccessIfrj: true,
  });
  otherUserToken = sessions.createSession({ userId: otherUser.id, role: 'cadet' }).rawToken;

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

  const loginCadet = await request('/api/auth/check-credentials', {
    method: 'POST',
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  cadetToken = loginCadet.body?.token;
  assert.ok(cadetToken, 'Token do cadete deve estar disponível');
  assert.ok(otherUserToken, 'Token do segundo usuário deve estar disponível');
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try { getDb().close(); } catch {}
  process.chdir(originalCwd);
  try { rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
});

test('1. Transferência de Dados: Arrastar e Mover Estudos entre Dias com Integridade Exata', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const tuesday = '2026-10-20';
  const monday = '2026-10-19';

  // 1. Registra 120 minutos de Física na Terça-feira
  const resTue = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${tuesday}_fisica`,
      subjectId: 'fisica',
      subjectName: 'Física',
      topic: 'Termodinâmica e Leis de Newton',
      dateStr: tuesday,
      durationMinutes: 120, // 2h (7200s)
      replaceSubjectTime: true,
      notes: 'Notas detalhadas com LaTeX: $Q = mc\\Delta T$',
    }),
  });
  assert.equal(resTue.response.status, 200);

  // Confirma 7200s na terça e 0s na segunda
  const checkTueBefore = await request(`/api/study-sessions/day/${tuesday}`, { headers });
  assert.equal(checkTueBefore.body.totalSeconds, 7200);

  const checkMonBefore = await request(`/api/study-sessions/day/${monday}`, { headers });
  assert.equal(checkMonBefore.body.totalSeconds, 0);

  // 2. Simula o arraste (Drag & Drop) de Terça para Segunda:
  // Remove de terça-feira
  const delTue = await request(`/api/study-sessions/day-subject?dateStr=${tuesday}&subjectId=fisica`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(delTue.response.status, 200);

  // Grava na segunda-feira com replaceSubjectTime: true
  const saveMon = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${monday}_fisica_transferred`,
      subjectId: 'fisica',
      subjectName: 'Física',
      topic: 'Termodinâmica e Leis de Newton',
      dateStr: monday,
      durationMinutes: 120,
      replaceSubjectTime: true,
      notes: 'Notas detalhadas com LaTeX: $Q = mc\\Delta T$',
    }),
  });
  assert.equal(saveMon.response.status, 200);

  // Validação: Terça deve ter 0s e Segunda deve ter exatamente 7200s
  const checkTueAfter = await request(`/api/study-sessions/day/${tuesday}`, { headers });
  assert.equal(checkTueAfter.body.totalSeconds, 0, 'Terça deve estar limpa');

  const checkMonAfter = await request(`/api/study-sessions/day/${monday}`, { headers });
  assert.equal(checkMonAfter.body.totalSeconds, 7200, 'Segunda deve ter exatamente 7200s');
  assert.equal(checkMonAfter.body.sessions[0].topic, 'Termodinâmica e Leis de Newton');
  assert.equal(checkMonAfter.body.sessions[0].notes, 'Notas detalhadas com LaTeX: $Q = mc\\Delta T$');
});

test('2. Transferência de Dados: Somar horas ao arrastar para um dia com estudo já existente', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const thursday = '2026-10-22';
  const friday = '2026-10-23';

  // Sexta já possui 90 minutos de Química
  await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${friday}_quimica`,
      subjectId: 'quimica',
      subjectName: 'Química',
      topic: 'Estequiometria',
      dateStr: friday,
      durationMinutes: 90,
      replaceSubjectTime: true,
    }),
  });

  // Quinta possui 60 minutos de Química
  await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${thursday}_quimica`,
      subjectId: 'quimica',
      subjectName: 'Química',
      topic: 'Termoquímica',
      dateStr: thursday,
      durationMinutes: 60,
      replaceSubjectTime: true,
    }),
  });

  // Arrastar Química de Quinta para Sexta (90 + 60 = 150 min = 9000s)
  const delThu = await request(`/api/study-sessions/day-subject?dateStr=${thursday}&subjectId=quimica`, {
    method: 'DELETE',
    headers,
  });
  assert.equal(delThu.response.status, 200);

  const saveMergedFri = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${friday}_quimica_merged`,
      subjectId: 'quimica',
      subjectName: 'Química',
      topic: 'Estequiometria + Termoquímica',
      dateStr: friday,
      durationMinutes: 150,
      replaceSubjectTime: true,
      notes: 'Horas somadas via Drag & Drop',
    }),
  });
  assert.equal(saveMergedFri.response.status, 200);

  // Quinta agora é 0s
  const checkThu = await request(`/api/study-sessions/day/${thursday}`, { headers });
  assert.equal(checkThu.body.totalSeconds, 0);

  // Sexta agora possui exatamente 150 minutos (9000s)
  const checkFri = await request(`/api/study-sessions/day/${friday}`, { headers });
  assert.equal(checkFri.body.totalSeconds, 9000);
  assert.equal(checkFri.body.bySubject.quimica.durationSeconds, 9000);
  assert.equal(checkFri.body.sessions[0].topic, 'Estequiometria + Termoquímica');
});

test('3. Desktop Timer: Sessão de virada de madrugada persiste no dia ativo e é idempotente', async () => {
  const desktopHeaders = { Authorization: 'Bearer desktop-timer-robustness-key' };
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const studyStartDate = '2026-10-24'; // Sábado à noite
  const nextDay = '2026-10-25'; // Domingo de madrugada

  // Aluno iniciou às 23:15 do sábado e estudou até as 01:45 de domingo (2h 30m = 9000s)
  // O app desktop envia dateStr = '2026-10-24' (dia ativo da jornada)
  const payload = {
    localSessionId: 'desktop-virada-madrugada-101',
    subjectId: 'matematica',
    subjectName: 'Matemática',
    startedAt: '2026-10-24T23:15:00.000Z',
    endedAt: '2026-10-25T01:45:00.000Z',
    durationSeconds: 9000,
    dateStr: studyStartDate,
    topic: 'Geometria Analítica e Cônicas',
  };

  const res = await request('/api/study-sessions/desktop', {
    method: 'POST',
    headers: desktopHeaders,
    body: JSON.stringify(payload),
  });
  assert.equal(res.response.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.session.date_str, studyStartDate);

  // Verifica que o dia 24 recebeu as 2h 30m (9000s)
  const day24 = await request(`/api/study-sessions/day/${studyStartDate}`, { headers });
  assert.equal(day24.body.totalSeconds, 9000);
  assert.equal(day24.body.bySubject.matematica.durationSeconds, 9000);

  // Verifica que o dia 25 não recebeu as horas da madrugada de sábado
  const day25 = await request(`/api/study-sessions/day/${nextDay}`, { headers });
  assert.equal(day25.body.totalSeconds, 0);

  // Teste de Idempotência: re-envio com mesmo localSessionId não deve duplicar
  const resDup = await request('/api/study-sessions/desktop', {
    method: 'POST',
    headers: desktopHeaders,
    body: JSON.stringify(payload),
  });
  assert.equal(resDup.response.status, 200);

  const day24AfterDup = await request(`/api/study-sessions/day/${studyStartDate}`, { headers });
  assert.equal(day24AfterDup.body.totalSeconds, 9000, 'Não deve duplicar horas em re-envio do mesmo checkpoint');
});

test('4. Robustez: Suporte a caracteres especiais, fórmulas LaTeX e sanitização de XSS em tópicos', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };
  const testDate = '2026-10-26';

  const specialTopic = 'Equação $H_2SO_4 + 2 NaOH -> Na_2SO_4 + 2 H_2O$ & <script>alert("xss")</script>';
  const specialNotes = 'Observações: 100% de rendimento; R$ 50,00; "aspas" & símbolos #1';

  const res = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: `entry_${testDate}_quimica_special`,
      subjectId: 'quimica',
      subjectName: 'Química',
      topic: specialTopic,
      dateStr: testDate,
      durationMinutes: 45,
      replaceSubjectTime: true,
      notes: specialNotes,
    }),
  });
  assert.equal(res.response.status, 200);

  const dayRes = await request(`/api/study-sessions/day/${testDate}`, { headers });
  assert.equal(dayRes.response.status, 200);
  assert.equal(dayRes.body.sessions.length, 1);
  assert.equal(dayRes.body.sessions[0].topic, specialTopic);
  assert.equal(dayRes.body.sessions[0].notes, specialNotes);
});

test('5. Robustez e Validações de Entrada: Rejeição de durações inválidas e datas malformatadas', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // Duração negativa
  const resNeg = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: 'entry_invalid_neg',
      subjectId: 'fisica',
      dateStr: '2026-10-27',
      durationMinutes: -10,
    }),
  });
  assert.equal(resNeg.response.status, 400);

  // Duração superior a 24 horas (1440 minutos)
  const resOver = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: 'entry_invalid_over',
      subjectId: 'fisica',
      dateStr: '2026-10-27',
      durationMinutes: 1500,
    }),
  });
  assert.equal(resOver.response.status, 400);

  // Formato de data inválido
  const resBadDate = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      entryId: 'entry_invalid_date',
      subjectId: 'fisica',
      dateStr: '27/10/2026', // Errado, deve ser YYYY-MM-DD
      durationMinutes: 60,
    }),
  });
  assert.equal(resBadDate.response.status, 400);
});

test('6. Segurança e Isolamento Multi-Inquilino (IDOR): Usuário B não pode acessar nem excluir estudos do Usuário A', async () => {
  const cadetHeaders = { Authorization: `Bearer ${cadetToken}` };
  const otherHeaders = { Authorization: `Bearer ${otherUserToken}` };
  const testDate = '2026-10-28';

  // Cadete grava uma sessão
  const saveRes = await request('/api/study-sessions/manual', {
    method: 'POST',
    headers: cadetHeaders,
    body: JSON.stringify({
      entryId: `entry_${testDate}_historia_cadete`,
      subjectId: 'historia',
      subjectName: 'História',
      topic: 'Revolução Constitucionalista',
      dateStr: testDate,
      durationMinutes: 60,
      replaceSubjectTime: true,
    }),
  });
  assert.equal(saveRes.response.status, 200);
  const sessionId = saveRes.body.session.id;

  // Outro usuário consulta o dia: deve ver 0s
  const otherDay = await request(`/api/study-sessions/day/${testDate}`, { headers: otherHeaders });
  assert.equal(otherDay.body.totalSeconds, 0, 'Outro usuário não deve ver as horas do cadete');
  assert.equal(otherDay.body.sessions.length, 0);

  // Outro usuário tenta excluir a sessão do cadete por ID
  const unauthorizedDelete = await request(`/api/study-sessions/${sessionId}`, {
    method: 'DELETE',
    headers: otherHeaders,
  });
  assert.equal(unauthorizedDelete.response.status, 404, 'Exclusão por outro usuário deve falhar (não encontrado para seu userId)');

  // Confirma que a sessão do cadete continua intacta
  const cadetDay = await request(`/api/study-sessions/day/${testDate}`, { headers: cadetHeaders });
  assert.equal(cadetDay.body.totalSeconds, 3600, 'Sessão do cadete deve permanecer intacta');
});
