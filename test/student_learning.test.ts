import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../src/db/database';
import { UserRepository, ExamPaperRepository, ExamQuestionRepository } from '../src/db/repositories';
import { StudentLearningService } from '../src/services/studentLearningService';

test('Release 2: registra tentativa e calcula mastery/radar com dados reais', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-learning-'));
  const db = getDb(path.join(dir, 'learning.sqlite'));
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const papers = new ExamPaperRepository(raw);
  const questions = new ExamQuestionRepository(raw);
  const learning = new StudentLearningService(raw);
  const user = users.create({ username: 'learner', email: 'learner@example.test', passwordHash: 'hash' });
  const paper = papers.create({ userId: user.id, title: 'Historico', institution: 'Banca', examYear: 2026 });
  const question = questions.create({
    examId: paper.id,
    userId: user.id,
    questionNumber: 1,
    statement: 'Quanto e 1 + 1?',
    options: [{ letter: 'A', text: '2' }, { letter: 'B', text: '3' }],
    correctOption: 'A',
    discipline: 'Matematica',
    topic: 'Aritmetica',
    subtopic: 'Operacoes',
  });
  const first = learning.recordAttempt({ userId: user.id, questionId: question.id, selectedOption: 'A', responseSeconds: 20, confidenceScore: 0.9 });
  const second = learning.recordAttempt({ userId: user.id, questionId: question.id, selectedOption: 'B', responseSeconds: 40, confidenceScore: 0.4, errorType: 'CONTENT_GAP' });
  assert.equal(second.knowledge.attempts, 2);
  assert.equal(second.knowledge.correctAttempts, 1);
  assert.ok(second.knowledge.masteryScore >= 0 && second.knowledge.masteryScore <= 100);
  assert.equal(learning.listKnowledge(user.id).length, 1);
  const radar = learning.getRadar(user.id);
  assert.equal(radar[0].topic, 'Aritmetica');
  assert.equal(radar[0].attempts, 2);
  assert.ok(first.attemptId !== second.attemptId);
  const revisions = learning.listRevisions(user.id);
  assert.equal(revisions.length, 2);
  assert.equal(learning.completeRevision(user.id, revisions[0].id)?.status, 'COMPLETED');
  assert.equal(learning.recommendQuestions(user.id, 5).length, 1);
  const simulation = learning.createSimulation(user.id, 'ADAPTIVE', 5);
  assert.equal(simulation.mode, 'ADAPTIVE');
  assert.equal(learning.updateSimulationStatus(user.id, simulation.id, 'IN_PROGRESS')?.status, 'IN_PROGRESS');
  assert.equal(learning.updateSimulationStatus(user.id, simulation.id, 'COMPLETED')?.status, 'COMPLETED');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
