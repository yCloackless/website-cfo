process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { StudentStudyRepository } from '../src/db/studentStudyRepository';
import { calculatePriorityScore, classifyPriority, weightedAverage } from '../src/services/studentStudyPriority';

test('Rumo Estudos mantém dados acadêmicos isolados por usuário', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-estudos-'));
  const db = getDb(path.join(dir, 'student.sqlite'));
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const repo = new StudentStudyRepository(raw);
  const alice = users.create({ username: 'alice-estudos', email: 'alice-estudos@test.local', passwordHash: 'hash' });
  const bia = users.create({ username: 'bia-estudos', email: 'bia-estudos@test.local', passwordHash: 'hash' });

  assert.equal(alice.canAccessIfrj, false);
  users.updateIfrjAccess(alice.id, true);
  assert.equal(users.findById(alice.id)?.canAccessIfrj, true);

  repo.ensureDefaults(alice.id);
  repo.ensureDefaults(bia.id);
  const subject = repo.listSubjects(alice.id).find((item) => item.name === 'Matemática')!;
  const period = repo.listPeriods(alice.id)[0];
  const grade = repo.createGrade(alice.id, { subjectId: subject.id, periodId: period.id, assessmentName: 'P1', score: 4, weight: 2 });

  assert.ok(grade);
  assert.equal(repo.listGrades(bia.id).length, 0);
  assert.equal(repo.getSubject(bia.id, subject.id), null);
  assert.equal(repo.updateGrade(bia.id, grade.id, { score: 10 }), null);
  assert.equal(repo.deleteGrade(bia.id, grade.id), false);
  assert.equal(repo.createGrade(bia.id, { subjectId: subject.id, periodId: period.id, assessmentName: 'invasão', score: 10 }), null);
  assert.equal(weightedAverage([{ score: 4, weight: 2 }, { score: 8, weight: 1 }]), 5.33);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('prioridade considera nota, peso e proximidade da prova', () => {
  const urgent = calculatePriorityScore({ currentAverage: 4, targetGrade: 8, daysUntilExam: 2, examWeight: 2, difficulty: 7 });
  const relaxed = calculatePriorityScore({ currentAverage: 9, targetGrade: 8, daysUntilExam: 45 });
  assert.ok(urgent > relaxed);
  assert.equal(classifyPriority(urgent), 'critical');
  assert.notEqual(classifyPriority(relaxed), 'critical');
});
