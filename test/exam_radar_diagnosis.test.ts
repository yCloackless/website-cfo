import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../src/db/database';
import { UserRepository, ExamPaperRepository } from '../src/db/repositories';
import { ExamRadarService } from '../src/services/examRadarService';

function createTempEnv() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-exam-radar-'));
  const dbService = new DatabaseService(path.join(tempDir, 'test.sqlite'));
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const paperRepo = new ExamPaperRepository(rawDb);

  const userA = userRepo.create({
    email: 'cadeteA_radar@cbmerj.com',
    username: 'cadeteAradar',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    role: 'cadet',
  });
  const userB = userRepo.create({
    email: 'cadeteB_radar@cbmerj.com',
    username: 'cadeteBradar',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    role: 'cadet',
  });

  const paperA = paperRepo.create({
    userId: userA.id,
    title: 'CFO CBMERJ 2024',
    institution: 'UERJ',
    examYear: 2024,
    status: 'READY',
    totalQuestions: 10,
  });

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { rawDb, userA, userB, paperA, cleanup };
}

test('1. Ownership estrito: usuário B não acessa nem salva tentativa/diagnóstico em prova do usuário A', async () => {
  const { rawDb, userA, userB, paperA, cleanup } = createTempEnv();
  try {
    const svc = new ExamRadarService(rawDb);
    assert.equal(svc.listRadarExams(userA.id).length, 1);
    assert.equal(svc.listRadarExams(userB.id).length, 0);

    assert.throws(() => {
      svc.saveAttempt(userB.id, paperA.id, {
        totalQuestions: 10,
        studentAnswers: ['A', 'B', 'C'],
        officialKey: ['A', 'D', 'C'],
      });
    }, /EXAM_NOT_FOUND/);

    await assert.rejects(
      () => svc.diagnoseExam(userB.id, paperA.id, undefined, null, async () => null),
      /EXAM_NOT_FOUND/
    );
  } finally {
    cleanup();
  }
});

test('2. Salva cartão-resposta com gabarito + acertos por matéria e gera diagnóstico heurístico sob demanda', async () => {
  const { rawDb, userA, paperA, cleanup } = createTempEnv();
  try {
    const svc = new ExamRadarService(rawDb);
    const attempt = svc.saveAttempt(userA.id, paperA.id, {
      totalQuestions: 6,
      studentAnswers: ['E', 'A', 'B', 'B', 'C', 'U'],
      officialKey: ['E', 'D', 'B', 'A', 'C', 'E'],
      subjectScores: [
        { subjectName: 'Matemática', correctCount: 1, totalCount: 3 },
        { subjectName: 'Física', correctCount: 2, totalCount: 3 },
      ],
    });

    assert.equal(attempt.correctCount, 3);
    assert.equal(attempt.wrongCount, 2);
    assert.equal(attempt.blankCount, 1);

    const diagnosed = await svc.diagnoseExam(userA.id, paperA.id, attempt.id, null, async () => null);
    assert.equal(diagnosed.source, 'heuristic');
    assert.ok(diagnosed.prioritySubjects.length >= 1);
    assert.equal(diagnosed.prioritySubjects[0].subject, 'Matemática');
    assert.deepEqual(diagnosed.wrongQuestions, [2, 4]);

    const items = svc.listRadarExams(userA.id);
    assert.equal(items[0].latestAttempt?.id, attempt.id);
    assert.ok(items[0].latestAttempt?.aiDiagnosis);
  } finally {
    cleanup();
  }
});
