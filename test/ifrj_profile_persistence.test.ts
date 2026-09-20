process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { SessionRepository, UserRepository } from '../src/db/repositories';
import { StudentStudyRepository } from '../src/db/studentStudyRepository';
import { postgresParams } from '../src/db/postgresSync';

let server: http.Server;
let baseUrl: string;
let studentProfiles: StudentStudyRepository;
let aliceToken: string;
let brunoToken: string;
let aliceId: string;
let brunoId: string;

const campuses = ['Maracanã', 'Nilópolis', 'Duque de Caxias', 'Paracambi', 'Volta Redonda', 'São Gonçalo'];
const courses = ['Química', 'Informática', 'Biotecnologia', 'Meio Ambiente', 'Mecânica'];

async function profileRequest(token: string | null, body?: unknown, method = 'PATCH') {
  return fetch(`${baseUrl}/api/rumo-estudos/profile`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.before(async () => {
  const db = getDb();
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const sessions = new SessionRepository(raw);
  studentProfiles = new StudentStudyRepository(raw);

  const alice = users.create({ username: 'ifrj-alice', email: 'ifrj-alice@test.local', passwordHash: 'hash', role: 'cadet', canAccessIfrj: true });
  const bruno = users.create({ username: 'ifrj-bruno', email: 'ifrj-bruno@test.local', passwordHash: 'hash', role: 'cadet', canAccessIfrj: true });
  aliceId = alice.id;
  brunoId = bruno.id;
  aliceToken = sessions.createSession({ userId: alice.id, role: 'cadet' }).rawToken;
  brunoToken = sessions.createSession({ userId: bruno.id, role: 'cadet' }).rawToken;

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${(address as any).port}`;
    resolve();
  }));
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('perfil IFRJ: PATCH autenticado persiste todos os campus/cursos com acentos', async () => {
  const unauthenticated = await profileRequest(null, { displayName: 'admin', campus: 'Nilópolis', course: 'Química', onboardingCompleted: true });
  assert.equal(unauthenticated.status, 401);

  for (const campus of campuses) {
    for (const course of courses) {
      const response = await profileRequest(aliceToken, {
        displayName: 'admin',
        campus,
        course,
        onboardingCompleted: true,
        userId: brunoId,
      });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(
        { displayName: data.profile.displayName, campus: data.profile.campus, course: data.profile.course, onboardingCompleted: data.profile.onboardingCompleted },
        { displayName: 'admin', campus, course, onboardingCompleted: true },
      );
    }
  }

  const reloaded = await fetch(`${baseUrl}/api/rumo-estudos/profile`, { headers: { Authorization: `Bearer ${aliceToken}` } });
  assert.equal(reloaded.status, 200);
  const reloadedData = await reloaded.json();
  assert.equal(reloadedData.profile.userId, aliceId);
  assert.equal(reloadedData.profile.campus, 'São Gonçalo');
  assert.equal(reloadedData.profile.course, 'Mecânica');
  assert.equal(studentProfiles.getProfile(brunoId), undefined);
  assert.equal(Number((getDb().getRawDb().prepare('SELECT COUNT(*) AS count FROM student_profiles WHERE user_id = ?').get(aliceId) as any).count), 1);
});

test('perfil IFRJ: atualização, duplicidade, validação e isolamento usam apenas a sessão', async () => {
  const [first, duplicate] = await Promise.all([
    profileRequest(aliceToken, { displayName: 'admin', campus: 'Nilópolis', course: 'Química', onboardingCompleted: true }),
    profileRequest(aliceToken, { displayName: 'admin', campus: 'Nilópolis', course: 'Química', onboardingCompleted: true }),
  ]);
  assert.equal(first.status, 200);
  assert.equal(duplicate.status, 200);

  const incomplete = await profileRequest(aliceToken, { displayName: 'admin', campus: 'Nilópolis', course: '', onboardingCompleted: true });
  assert.equal(incomplete.status, 400);
  assert.equal((await incomplete.json()).error, 'INCOMPLETE_PROFILE');

  const invalid = await profileRequest(aliceToken, { displayName: 'admin', campus: { label: 'Nilópolis' }, course: 'Química' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'INVALID_PROFILE_FIELD');

  const brunoUpdate = await profileRequest(brunoToken, { displayName: 'Bruno', campus: 'Maracanã', course: 'Informática', onboardingCompleted: true });
  assert.equal(brunoUpdate.status, 200);
  assert.equal(studentProfiles.getProfile(aliceId)?.displayName, 'admin');
  assert.equal(studentProfiles.getProfile(brunoId)?.displayName, 'Bruno');
});

test('adaptador PostgreSQL preserva placeholders ao converter onboarding_completed', () => {
  const converted = postgresParams(
    'INSERT INTO student_profiles (id,user_id,display_name,institution,campus,course,school_year,class_name,shift,available_time_json,onboarding_completed,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['id', 'user', 'admin', 'IFRJ', 'Nilópolis', 'Química', null, null, null, null, 1, 'created', 'updated'],
  );

  assert.match(converted.text, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13\)/);
  assert.equal(converted.values[10], true);
});
