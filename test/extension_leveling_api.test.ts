import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';

let server: any;
let baseUrl = '';
let token = '';

test.before(async () => {
  const authService = new AuthService(getDb());
  await authService.ensureDefaultAccounts();
  const login = await authService.login('cadete', process.env.CADET_PASSWORD || 'fixture-cadet-password-2026');
  assert.ok(login.token, 'É necessário token de fixture para testar a rota protegida.');
  token = login.token;
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(resolve));
});

test('EXT-API-01: API armazena v3 na chave da extensão, valida o snapshot e rejeita revisão antiga', async () => {
  const now = new Date().toISOString();
  const snapshot = {
    schemaVersion: 3,
    sessionId: 'session-extension-api-test',
    revision: 2,
    startedAt: now,
    updatedAt: now,
    questionsAnswered: 2,
    answerLog: [
      { questionId: 'q-1', answer: 'correct', answeredAt: now },
      { questionId: 'q-2', answer: 'wrong', answeredAt: now },
    ],
    batteryNumber: 1,
    activeBattery: {
      batteryId: 'battery-extension-api-test',
      batteryNumber: 1,
      questionIds: ['q-1', 'q-2', 'q-3', 'q-4', 'q-5'],
      answers: ['correct', 'wrong'],
      currentQuestionIndex: 2,
      status: 'in_progress',
      startedAt: now,
      updatedAt: now,
    },
    history: [],
    levelingCompleted: false,
    achievement: null,
    bestScore: 0,
    completedAt: null,
  };
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const saved = await fetch(`${baseUrl}/api/leveling/session?client=extension`, {
    method: 'POST', headers, body: JSON.stringify(snapshot),
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).accepted, true);

  const extensionRead = await fetch(`${baseUrl}/api/leveling/session?client=extension`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.deepEqual((await extensionRead.json()).session, snapshot);

  const webRead = await fetch(`${baseUrl}/api/leveling/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal((await webRead.json()).session, null, 'Salvar estado v3 não deve substituir o nivelamento web legado.');

  const stale = await fetch(`${baseUrl}/api/leveling/session?client=extension`, {
    method: 'POST', headers, body: JSON.stringify({ ...snapshot, revision: 1, questionsAnswered: 1,
      answerLog: snapshot.answerLog.slice(0, 1), activeBattery: { ...snapshot.activeBattery,
        answers: ['correct'], currentQuestionIndex: 1 } }),
  });
  assert.equal(stale.status, 200);
  const staleResult = await stale.json();
  assert.equal(staleResult.accepted, false);
  assert.equal(staleResult.session.revision, 2);

  const malformed = await fetch(`${baseUrl}/api/leveling/session?client=extension`, {
    method: 'POST', headers, body: JSON.stringify({ ...snapshot, answerLog: [{ questionId: 'q', answer: 'reveal' }] }),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'INVALID_LEVELING_SNAPSHOT');
});
