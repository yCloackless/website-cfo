process.env.NODE_ENV = 'test';
process.env.ADMIN_BOARD_INTELLIGENCE = 'true';
process.env.GEMINI_API_KEY = '';
process.env.VITE_GEMINI_API_KEY = '';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { app } = await import('../server');
const { getDb } = await import('../src/db/database');
const { AuthService } = await import('../src/db/authService');
const { UserRepository, SessionRepository } = await import('../src/db/repositories');
const bcrypt = await import('bcryptjs');

let server: http.Server;
let baseUrl: string;
let authService: any;
let adminToken: string;
let cadetToken: string;

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

test.before(async () => {
  process.env.ADMIN_PASSWORD = 'fixture-admin-password-2026';
  process.env.CADET_PASSWORD = 'fixture-cadet-password-2026';
  const db = getDb();
  authService = new AuthService(db);
  await authService.ensureDefaultAccounts();
  const userRepo = new UserRepository(db.getRawDb());
  const sessionRepo = new SessionRepository(db.getRawDb());
  const cadetFixture = userRepo.findByUsername('cadete');
  if (cadetFixture) {
    userRepo.updateStatus(cadetFixture.id, 'active');
    userRepo.updatePasswordHash(cadetFixture.id, await bcrypt.hash('fixture-cadet-password-2026', 10));
  }
  const admin = await authService.login('admin@cbmerj.com', 'fixture-admin-password-2026');
  assert.equal(admin.success, true);
  adminToken = admin.token!;
  assert.ok(cadetFixture);
  cadetToken = sessionRepo.createSession({ userId: cadetFixture.id, role: 'cadet', expiresInDays: 1 }).rawToken;

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.after(() => {
  if (server) server.close();
});

test('BI-01: cadete e anonimo nao acessam endpoints administrativos da inteligencia da banca', async () => {
  const cadetRes = await request('/api/admin/board-intelligence/profiles', {
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(cadetRes.status, 403);

  const anonRes = await request('/api/admin/board-intelligence/profiles');
  assert.equal(anonRes.status, 403);
});

test('BI-02: admin cria perfil, importa prova, revisa, aprova e publica versao draft sem contaminar antes da aprovacao', async () => {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const createProfile = await request('/api/admin/board-intelligence/profiles', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `CEDERJ Test ${Date.now()}`,
      institution: 'CEDERJ',
      board: 'CEDERJ',
      contest: 'Vestibular',
      roleName: 'Aluno',
    }),
  });
  assert.equal(createProfile.status, 201);
  const profileId = createProfile.body.profile.id;

  const importExam = await request(`/api/admin/board-intelligence/profiles/${profileId}/import-exam`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'CEDERJ 2026.1',
      examYear: 2026,
      rawTextContent: [
        'Questão 1. Assinale a alternativa correta sobre porcentagem sucessiva.',
        'A) 10%',
        'B) 20%',
        'C) 30%',
        'D) 40%',
        'E) 50%',
        'Questão 2. Com base no texto, é correto afirmar que estatística exige interpretação.',
        'A) sempre',
        'B) nunca',
        'C) raramente',
        'D) somente em geometria',
        'E) impossível',
      ].join('\n'),
    }),
  });
  assert.equal(importExam.status, 201);
  assert.equal(importExam.body.exam.status, 'EXTRACTED');
  assert.ok(importExam.body.questionsCount >= 2);

  const beforeApprove = await request(`/api/admin/board-intelligence/profiles/${profileId}`, { headers });
  assert.equal(beforeApprove.status, 200);
  assert.equal(beforeApprove.body.stats.questionCount, 0, 'prova extraida ainda nao aprovada nao entra no perfil');

  const review = await request(`/api/admin/board-intelligence/exams/${importExam.body.exam.id}/review`, { headers });
  assert.equal(review.status, 200);
  assert.ok(review.body.review.questionCount >= 2);
  assert.equal(review.body.review.canApproveForLearning, true);

  const approve = await request(`/api/admin/board-intelligence/exams/${importExam.body.exam.id}/approve`, {
    method: 'POST',
    headers,
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.body.exam.status, 'APPROVED');
  assert.ok(approve.body.analysesCreated >= 2);

  const draft = await request(`/api/admin/board-intelligence/profiles/${profileId}/generate-version`, {
    method: 'POST',
    headers,
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.version.status, 'DRAFT');
  assert.equal(draft.body.version.version, 1);

  const publish = await request(`/api/admin/board-intelligence/versions/${draft.body.version.id}/publish`, {
    method: 'POST',
    headers,
  });
  assert.equal(publish.status, 200);
  assert.equal(publish.body.version.status, 'ACTIVE');

  const retrieval = await request(`/api/admin/board-intelligence/profiles/${profileId}/retrieval?q=porcentagem`, { headers });
  assert.equal(retrieval.status, 200);
  assert.ok(retrieval.body.context);
  assert.ok(Array.isArray(retrieval.body.questions));
  assert.ok(retrieval.body.questions.length >= 1);
});

test('BI-03: prova rejeitada nao entra em snapshot, estatisticas ou retrieval oficial', async () => {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const createProfile = await request('/api/admin/board-intelligence/profiles', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: `UERJ Reject ${Date.now()}`, institution: 'UERJ', board: 'UERJ' }),
  });
  const profileId = createProfile.body.profile.id;
  const importExam = await request(`/api/admin/board-intelligence/profiles/${profileId}/import-exam`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'UERJ Rejeitada',
      examYear: 2025,
      rawTextContent: 'Questão 1. Calcule 2+2. A) 1 B) 2 C) 3 D) 4 E) 5',
    }),
  });
  assert.equal(importExam.status, 201);

  const reject = await request(`/api/admin/board-intelligence/exams/${importExam.body.exam.id}/reject`, {
    method: 'POST',
    headers,
  });
  assert.equal(reject.status, 200);
  assert.equal(reject.body.exam.status, 'REJECTED');

  const overview = await request(`/api/admin/board-intelligence/profiles/${profileId}`, { headers });
  assert.equal(overview.body.stats.questionCount, 0);

  const draft = await request(`/api/admin/board-intelligence/profiles/${profileId}/generate-version`, {
    method: 'POST',
    headers,
  });
  assert.equal(draft.status, 400);
});
