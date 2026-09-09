import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getDb } from '../src/db/database';
import { UserRepository, ExamPaperRepository, ExamQuestionRepository, ExamJobRepository } from '../src/db/repositories';

test('Fase 1: estados de revisao/publicacao e fila persistente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-phase1-'));
  const db = getDb(path.join(dir, 'phase1.sqlite'));
  const raw = db.getRawDb();
  const users = new UserRepository(raw);
  const papers = new ExamPaperRepository(raw);
  const questions = new ExamQuestionRepository(raw);
  const jobs = new ExamJobRepository(raw);

  const user = users.create({
    username: 'phase1-user',
    email: 'phase1@example.test',
    passwordHash: 'hash',
  });
  const paper = papers.create({
    userId: user.id,
    title: 'Prova de contrato',
    institution: 'Banca',
    examYear: 2026,
    totalQuestions: 1,
  });
  assert.equal(paper.publicationStatus, 'DRAFT');

  const question = questions.create({
    examId: paper.id,
    userId: user.id,
    questionNumber: 1,
    statement: 'Enunciado de teste',
    options: [{ letter: 'A', text: 'Resposta' }, { letter: 'B', text: 'Distrator' }],
    discipline: 'Matematica',
  });
  assert.equal(question.reviewStatus, 'PENDING');
  assert.equal(questions.setReviewStatus(question.id, 'APPROVED')?.reviewStatus, 'APPROVED');
  assert.equal(papers.setPublicationStatus(paper.id, 'PUBLISHED')?.publicationStatus, 'PUBLISHED');

  const job = jobs.create({
    userId: user.id,
    examId: paper.id,
    jobType: 'EXTRACTION',
    payload: { title: 'retomavel', userId: user.id },
  });
  assert.deepEqual(JSON.parse(job.payloadJson || '{}'), { title: 'retomavel', userId: user.id });
  const claimed = jobs.claimNextQueued();
  assert.equal(claimed?.id, job.id);
  assert.equal(jobs.findById(job.id)?.status, 'processing');
  jobs.updateStatus(job.id, 'completed', 1, { paperId: paper.id });
  assert.equal(jobs.findById(job.id)?.status, 'completed');

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
