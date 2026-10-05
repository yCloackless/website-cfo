process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET ||= 'idor-test-session-secret-2026';
process.env.ADMIN_PASSWORD ||= 'fixture-admin-password-2026';
process.env.CADET_PASSWORD ||= 'fixture-cadet-password-2026';
process.env.DATA_ENCRYPTION_KEY ||= 'idor-test-encryption-key-not-for-production';
delete process.env.RESEND_API_KEY;

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDir = mkdtempSync(path.join(tmpdir(), 'cfo-idor-'));
const originalCwd = process.cwd();
process.env.SQLITE_DB_PATH = path.join(tempDir, 'idor.sqlite');
process.chdir(tempDir);
const { app } = await import('../server');
const { getDb } = await import('../src/db/database');
const { SessionRepository, UserRepository } = await import('../src/db/repositories');
const { AuthService } = await import('../src/db/authService');

let server: http.Server;
let baseUrl = '';
let tokenA = '';
let tokenB = '';
let userAId = '';
let userBId = '';

async function request(token: string, url: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* empty responses are valid for deletes */ }
  return { response, data };
}

test.before(async () => {
  const rawDb = getDb().getRawDb();
  const users = new UserRepository(rawDb);
  const sessions = new SessionRepository(rawDb);
  const userA = users.create({ username: 'idor_user_a', email: 'idor-a@example.test', passwordHash: 'fixture-hash', role: 'cadet', canAccessIfrj: true });
  const userB = users.create({ username: 'idor_user_b', email: 'idor-b@example.test', passwordHash: 'fixture-hash', role: 'cadet', canAccessIfrj: true });
  userAId = userA.id;
  userBId = userB.id;
  tokenA = sessions.createSession({ userId: userA.id, role: 'cadet' }).rawToken;
  tokenB = sessions.createSession({ userId: userB.id, role: 'cadet' }).rawToken;
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    resolve();
  }));
});

test.after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  getDb().close();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

test('two authenticated users cannot read, mutate, or delete each other’s private resources by ID', async () => {
  // Whiteboards: GET, PATCH, DELETE are all owner-scoped.
  const boardCreate = await request(tokenA, '/api/whiteboards', 'POST', { title: 'A private board', userId: userBId });
  assert.equal(boardCreate.response.status, 201);
  const boardId = boardCreate.data.board.id;
  for (const [method, body] of [['GET', undefined], ['PATCH', { title: 'B changed this', ownerId: userBId }], ['DELETE', undefined]] as const) {
    const blocked = await request(tokenB, `/api/whiteboards/${boardId}`, method, body);
    assert.equal(blocked.response.status, 404, `User B ${method} whiteboard must be hidden`);
  }
  assert.equal((await request(tokenA, `/api/whiteboards/${boardId}`)).response.status, 200);

  // Flashcards: authenticated identity overrides userId/ownerId in the body.
  const subject = await request(tokenA, '/api/flashcards/subjects', 'POST', { name: 'A subject', userId: userBId });
  assert.equal(subject.response.status, 201);
  const deck = await request(tokenA, '/api/flashcards/decks', 'POST', { subjectId: subject.data.subject.id, name: 'A deck', ownerId: userBId });
  assert.equal(deck.response.status, 201);
  const card = await request(tokenA, '/api/flashcards/cards', 'POST', { deckId: deck.data.deck.id, front: 'A front', back: 'A back', userId: userBId });
  assert.equal(card.response.status, 201);
  const cardId = card.data.card.id;
  assert.equal((await request(tokenB, `/api/flashcards/cards/${cardId}`)).response.status, 404);
  assert.equal((await request(tokenB, `/api/flashcards/cards/${cardId}`, 'PATCH', { front: 'B changed this', ownerId: userBId })).response.status, 404);
  assert.equal((await request(tokenB, `/api/flashcards/cards/${cardId}`, 'DELETE')).response.status, 404);
  assert.equal((await request(tokenA, `/api/flashcards/cards/${cardId}`)).response.status, 200);

  // Anki notes/cards: render, update and delete use the authenticated user's repository scope.
  const ankiDeck = await request(tokenA, '/api/anki/decks', 'POST', { name: 'A Anki deck', userId: userBId });
  assert.equal(ankiDeck.response.status, 201);
  const noteTypes = await request(tokenA, '/api/anki/notetypes');
  assert.equal(noteTypes.response.status, 200);
  const note = await request(tokenA, '/api/anki/notes', 'POST', {
    deckId: ankiDeck.data.deck.id,
    notetypeId: noteTypes.data.notetypes[0].id,
    fields: ['A private question', 'A private answer'],
    userId: userBId,
  });
  assert.equal(note.response.status, 201);
  const noteId = note.data.note.id;
  const cardAnkiId = note.data.cards[0].id;
  assert.equal((await request(tokenB, `/api/anki/cards/${cardAnkiId}/render`)).response.status, 404);
  assert.equal((await request(tokenB, `/api/anki/notes/${noteId}`, 'PATCH', { fields: ['B changed', 'B answer'] })).response.status, 404);
  assert.equal((await request(tokenB, `/api/anki/notes/${noteId}`, 'DELETE')).response.status, 404);
  assert.equal((await request(tokenA, `/api/anki/cards/${cardAnkiId}/render`)).response.status, 200);

  // User-owned exam/calendar records are scoped to the authenticated account.
  const exam = await request(tokenA, '/api/rumo-estudos/exams', 'POST', { name: 'A exam', examDate: '2026-10-15', userId: userBId });
  assert.equal(exam.response.status, 201);
  const examId = exam.data.exam.id;
  assert.equal((await request(tokenB, '/api/rumo-estudos/exams')).data.exams.some((item: any) => item.id === examId), false);
  assert.equal((await request(tokenB, `/api/rumo-estudos/exams/${examId}`, 'PATCH', { name: 'B changed this' })).response.status, 404);
  assert.equal((await request(tokenB, `/api/rumo-estudos/exams/${examId}`, 'DELETE')).response.status, 404);

  // Study sessions: cross-user deletion is denied and the owner's row remains.
  const dateStr = '2026-10-05';
  const session = await request(tokenA, '/api/study-sessions/manual', 'POST', {
    entryId: 'idor-session-a', subjectId: 'math', subjectName: 'Matemática', dateStr,
    durationMinutes: 25, userId: userBId,
  });
  assert.equal(session.response.status, 200);
  const sessionId = session.data.session.id;
  const deleteSession = await request(tokenB, `/api/study-sessions/${sessionId}`, 'DELETE');
  assert.ok([403, 404].includes(deleteSession.response.status));
  assert.equal((await request(tokenA, `/api/study-sessions/day/${dateStr}`)).data.sessions.some((item: any) => item.id === sessionId), true);

  // Timer and schedule state have no client-selected owner ID.
  await request(tokenA, '/api/user/state', 'PUT', { state: { cfo_schedule_idor: 'private-A' }, userId: userBId });
  assert.equal((await request(tokenB, '/api/user/state')).data.state.cfo_schedule_idor, undefined);
  await request(tokenA, '/api/timer/start', 'POST', { subjectId: 'math', subjectName: 'Matemática', userId: userBId });
  assert.equal((await request(tokenA, '/api/timer/status')).data.status, 'RUNNING');
  assert.notEqual((await request(tokenB, '/api/timer/status')).data.status, 'RUNNING');
});

test('repeated reset requests keep a generic response and do not replace the active code', async () => {
  const first = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'idor-a@example.test' }),
  });
  const firstBody: any = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.success, true);

  const unknown = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `unknown-${Date.now()}@example.test` }),
  });
  const unknownBody: any = await unknown.json();
  assert.equal(unknown.status, first.status);
  assert.equal(unknownBody.success, firstBody.success);
  assert.equal(unknownBody.message, firstBody.message);
  assert.equal(unknownBody.debugCode, undefined);

  const before = getDb().getRawDb().prepare(
    'SELECT id, is_used FROM password_resets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(userAId) as any;
  assert.ok(before);
  assert.equal(before.is_used, 0);

  const second = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'idor_user_a' }),
  });
  const secondBody: any = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.message, firstBody.message);
  assert.equal(secondBody.debugCode, undefined);

  const after = getDb().getRawDb().prepare(
    'SELECT id, is_used FROM password_resets WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
  ).get(userAId) as any;
  assert.deepEqual(after, before, 'a repeat request must not create a new code or invalidate the active one');
});

test('email and username login attempts share the same distributed-account backoff bucket', async () => {
  const auth = new AuthService(getDb());
  for (const alias of ['idor_user_a', '  IDOR_USER_A  ', 'idor-a@example.test', '  IDOR-A@EXAMPLE.TEST  ', 'idor-a']) {
    assert.equal(auth.resolveAccountId(alias), userAId);
  }
  const attempt = async (body: unknown) => {
    const start = Date.now();
    const response = await fetch(`${baseUrl}/api/auth/check-credentials`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    await response.arrayBuffer();
    assert.equal(response.status, 401);
    return Date.now() - start;
  };
  await attempt({ username: '  IDOR_USER_A  ', password: 'wrong-password' });
  await attempt({ email: 'idor-a@example.test', password: 'wrong-password' });
  assert.ok(await attempt({ email: '  IDOR-A@EXAMPLE.TEST  ', password: 'wrong-password' }) >= 200);
});
