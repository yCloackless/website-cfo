process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../src/db/database';
import { UserRepository, ExamPaperRepository } from '../src/db/repositories';
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

test('perfil e busca e-MEC funcionam e persistem campus, curso e nome', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-estudos-perfil-'));
  const db = getDb(path.join(dir, 'student_perfil.sqlite'));
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const repo = new StudentStudyRepository(raw);
  const user = users.create({ username: 'aluno-ifrj', email: 'aluno@ifrj.edu.br', passwordHash: 'hash' });

  // 1. Salvar dados parciais no Onboarding (nome, campus, curso)
  const initialProfile = repo.upsertProfile(user.id, {
    displayName: 'Carlos Silva',
    campus: 'Maracanã',
    course: 'Química Industrial',
    onboardingCompleted: true,
  });
  assert.equal(initialProfile.displayName, 'Carlos Silva');
  assert.equal(initialProfile.campus, 'Maracanã');
  assert.equal(initialProfile.course, 'Química Industrial');
  assert.equal(initialProfile.institution, 'IFRJ');

  // 2. Atualizar apenas o curso mantendo o campus e nome intactos
  const updatedCourse = repo.upsertProfile(user.id, {
    course: 'Biotecnologia',
  });
  assert.equal(updatedCourse.displayName, 'Carlos Silva');
  assert.equal(updatedCourse.campus, 'Maracanã');
  assert.equal(updatedCourse.course, 'Biotecnologia');

  // 3. Busca no e-MEC por instituições
  const ifrjResults = repo.searchInstitutions(user.id, 'IFRJ');
  assert.ok(ifrjResults.length > 0, 'Deve encontrar pelo menos 1 campus do IFRJ');
  assert.ok(ifrjResults.some((inst) => inst.name.includes('Maracanã') || inst.city === 'Rio de Janeiro'));

  const uerjResults = repo.searchInstitutions(user.id, 'UERJ');
  assert.ok(uerjResults.length > 0, 'Deve encontrar a UERJ no MEC');

  // 4. Busca no e-MEC por cursos
  const coursesResults = repo.searchCourses(user.id, 'Engenharia');
  assert.ok(coursesResults.length > 0, 'Deve encontrar cursos de Engenharia');

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Banco de Provas: armazena provas diretamente com status READY e permite organização por nome', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banco-provas-'));
  const db = getDb(path.join(dir, 'exams.sqlite'));
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const examPapers = new ExamPaperRepository(raw);

  const user = users.create({ username: 'cadete-provas', email: 'cadete@cfo.test', passwordHash: 'hash' });

  // 1. Cadastra provas anteriores
  const p1 = examPapers.create({
    userId: user.id,
    title: 'CFO CBMERJ 2024 - Oficial Bombeiro Militar',
    institution: 'VUNESP',
    examYear: 2024,
    status: 'READY',
  });
  const p2 = examPapers.create({
    userId: user.id,
    title: 'UERJ 2024 - 1º Exame de Qualificação',
    institution: 'UERJ',
    examYear: 2024,
    status: 'READY',
  });
  const p3 = examPapers.create({
    userId: user.id,
    title: 'CFO CBMERJ 2021 - Cadete Bombeiro',
    institution: 'FGV',
    examYear: 2021,
    status: 'READY',
  });

  assert.equal(p1.status, 'READY');
  assert.equal(p2.status, 'READY');
  assert.equal(p3.status, 'READY');

  // 2. Organização por nome (A-Z)
  const list = examPapers.findByUserId(user.id);
  assert.equal(list.length, 3);
  const sortedByName = [...list].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  assert.equal(sortedByName[0].title, 'CFO CBMERJ 2021 - Cadete Bombeiro');
  assert.equal(sortedByName[1].title, 'CFO CBMERJ 2024 - Oficial Bombeiro Militar');
  assert.equal(sortedByName[2].title, 'UERJ 2024 - 1º Exame de Qualificação');

  // 3. Atualização de nome (renomear prova)
  const updated = examPapers.update(p3.id, { title: 'CFO CBMERJ 2021 - Prova Oficial Retificada' });
  assert.equal(updated?.title, 'CFO CBMERJ 2021 - Prova Oficial Retificada');

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});


