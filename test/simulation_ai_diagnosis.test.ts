import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { SimulationDiagnosisService } from '../src/services/simulationDiagnosisService';

function createTempEnv() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-sim-ai-'));
  const dbService = new DatabaseService(path.join(tempDir, 'test.sqlite'));
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);

  const userA = userRepo.create({
    email: 'cadeteA_sim@cbmerj.com',
    username: 'cadeteAsim',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    role: 'cadet',
  });
  const userB = userRepo.create({
    email: 'cadeteB_sim@cbmerj.com',
    username: 'cadeteBsim',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    role: 'cadet',
  });

  const insertStudySession = (userId: string, subjectId: string, subjectName: string, dateStr: string, durationSeconds: number) => {
    rawDb.prepare(`
      INSERT INTO study_sessions (
        id, user_id, subject_id, subject_name, topic, date_str, duration_seconds, started_at, ended_at, notes, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?)
    `).run(
      `ss_${subjectId}_${dateStr}_${Math.random()}`,
      userId,
      subjectId,
      subjectName,
      dateStr,
      durationSeconds,
      `${dateStr}T10:00:00Z`,
      `${dateStr}T14:00:00Z`,
      `${dateStr}T14:00:00Z`
    );
  };

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { rawDb, userA, userB, insertStudySession, cleanup };
}

test('1. Ownership estrito: usuário B não exclui nem diagnostica simulado do usuário A', async () => {
  const { rawDb, userA, userB, cleanup } = createTempEnv();
  try {
    const svc = new SimulationDiagnosisService(rawDb);
    const created = svc.createSimulation(userA.id, {
      dateStr: '2026-11-16',
      title: 'Simulado UERJ 01',
      examType: 'UERJ',
      totalQuestions: 50,
      correctCount: 35,
      targetCutoffPct: 75,
    });

    assert.equal(svc.listSimulations(userA.id).length, 1);
    assert.equal(svc.listSimulations(userB.id).length, 0);
    assert.equal(svc.deleteSimulation(userB.id, created.id), false);

    await assert.rejects(
      () => svc.diagnose(userB.id, created.id, null),
      /SIMULATION_NOT_FOUND/
    );
  } finally {
    cleanup();
  }
});

test('2. Classifica matérias em Ver pela 1ª vez, Rever e Aprofundar cruzando com study_sessions', async () => {
  const { rawDb, userA, insertStudySession, cleanup } = createTempEnv();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);

    // Física: estudada intensamente hoje (6h), ainda abaixo do corte -> Aprofundar
    insertStudySession(userA.id, 'fis', 'Física Aplicada', today, 6 * 3600);
    // Biologia: estudada há 20 dias (1.5h) -> Rever
    insertStudySession(userA.id, 'bio', 'Biologia', oldDate, 5400);
    // Química: 0h em study_sessions -> Ver pela primeira vez

    const svc = new SimulationDiagnosisService(rawDb);
    const sim = svc.createSimulation(userA.id, {
      dateStr: today,
      title: 'Simulado Geral CBMERJ',
      examType: 'CBMERJ',
      totalQuestions: 30,
      targetCutoffPct: 75,
      studentAnswers: ['A', 'B', 'C', 'D'],
      officialKey: ['A', 'E', 'C', 'A'],
      subjectScores: [
        { subjectId: 'fis', subjectName: 'Física Aplicada', correctCount: 5, totalCount: 10 },
        { subjectId: 'bio', subjectName: 'Biologia', correctCount: 5, totalCount: 10 },
        { subjectId: 'qui', subjectName: 'Química', correctCount: 4, totalCount: 10 },
      ],
    });

    assert.equal(sim.totalQuestions, 30);
    assert.equal(sim.correctCount, 2); // Calculado pelo gabarito oficial quando há officialKey!

    // Salva outro simulado usando apenas acertos por matéria (sem gabarito oficial)
    const simBySubjects = svc.createSimulation(userA.id, {
      dateStr: today,
      title: 'Simulado Por Matéria',
      examType: 'UERJ',
      totalQuestions: 30,
      targetCutoffPct: 75,
      subjectScores: [
        { subjectId: 'fis', subjectName: 'Física Aplicada', correctCount: 5, totalCount: 10 },
        { subjectId: 'bio', subjectName: 'Biologia', correctCount: 5, totalCount: 10 },
        { subjectId: 'qui', subjectName: 'Química', correctCount: 4, totalCount: 10 },
      ],
    });

    const diag = await svc.diagnose(userA.id, simBySubjects.id, null);
    assert.equal(diag.source, 'heuristic');
    assert.ok(diag.firstTime.some((i) => i.subject === 'Química'), 'Química sem estudo prévio deve ir para Ver pela 1ª vez');
    assert.ok(diag.review.some((i) => i.subject === 'Biologia'), 'Biologia estudada há 20 dias deve ir para Rever');
    assert.ok(diag.deepen.some((i) => i.subject === 'Física Aplicada'), 'Física com 6h recentes e <75% deve ir para Aprofundar');

    // Visão consolidada (sem simId)
    const consolidated = await svc.diagnose(userA.id, undefined, null);
    assert.ok(consolidated.summary.length > 10);
    assert.ok(consolidated.firstTime.some((i) => i.subject === 'Química'));
  } finally {
    cleanup();
  }
});
