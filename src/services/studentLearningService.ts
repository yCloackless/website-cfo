import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type StudentErrorType =
  | 'CONTENT_GAP' | 'INTERPRETATION' | 'CALCULATION' | 'FORMULA' | 'UNIT'
  | 'SIGN' | 'MEMORIZATION' | 'ATTENTION' | 'TIME_PRESSURE' | 'UNKNOWN';

export interface KnowledgeRow {
  discipline: string;
  topic: string;
  subtopic: string;
  masteryScore: number;
  attempts: number;
  correctAttempts: number;
  averageResponseSeconds: number | null;
  averageConfidence: number | null;
  consistencyScore: number;
  lastAttemptAt: string | null;
}

export interface RevisionRow {
  id: string;
  questionId: string | null;
  discipline: string;
  topic: string;
  subtopic: string;
  dueAt: string;
  intervalDays: number;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  source: string;
}

export class StudentLearningService {
  constructor(private db: DatabaseSync) {}

  public recordAttempt(data: {
    userId: string;
    questionId: string;
    selectedOption: string;
    simulationId?: string | null;
    responseSeconds?: number | null;
    confidenceScore?: number | null;
    errorType?: StudentErrorType | null;
  }): { attemptId: string; isCorrect: boolean; knowledge: KnowledgeRow } {
    const question = this.db.prepare('SELECT * FROM exam_questions WHERE id = ?').get(data.questionId) as any;
    if (!question) throw new Error('QUESTION_NOT_FOUND');
    if (!question.correct_option) throw new Error('QUESTION_HAS_NO_OFFICIAL_ANSWER');
    const selected = String(data.selectedOption || '').trim().toUpperCase();
    if (!/^[A-E]$/.test(selected)) throw new Error('INVALID_SELECTED_OPTION');
    const responseSeconds = data.responseSeconds == null ? null : Math.max(0, Math.round(Number(data.responseSeconds)));
    const confidence = data.confidenceScore == null ? null : Math.min(1, Math.max(0, Number(data.confidenceScore)));
    const isCorrect = selected === question.correct_option ? 1 : 0;
    const errorType = isCorrect ? null : (data.errorType || 'UNKNOWN');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    if (data.simulationId) {
      const simulation = this.db.prepare('SELECT id FROM student_simulations WHERE id = ? AND user_id = ?').get(data.simulationId, data.userId);
      if (!simulation) throw new Error('SIMULATION_NOT_FOUND');
    }

    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      this.db.prepare(`
        INSERT INTO student_question_attempts (
          id, user_id, question_id, exam_id, discipline, topic, subtopic,
          selected_option, is_correct, response_seconds, confidence_score, error_type, simulation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.userId, question.id, question.exam_id, question.discipline, question.topic, question.subtopic,
        selected, isCorrect, responseSeconds, confidence, errorType, data.simulationId || null, now);
      const knowledge = this.recalculate(data.userId, question.discipline, question.topic, question.subtopic);
      const intervalDays = isCorrect ? 3 : 1;
      const dueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();
      this.db.prepare(`INSERT INTO student_revisions (id, user_id, question_id, discipline, topic, subtopic, due_at, interval_days, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'PERFORMANCE', ?, ?)`)
        .run(crypto.randomUUID(), data.userId, question.id, question.discipline, question.topic, question.subtopic, dueAt, intervalDays, now, now);
      this.db.exec('COMMIT;');
      return { attemptId: id, isCorrect: Boolean(isCorrect), knowledge };
    } catch (error) {
      try { this.db.exec('ROLLBACK;'); } catch {}
      throw error;
    }
  }

  public listKnowledge(userId: string): KnowledgeRow[] {
    const rows = this.db.prepare('SELECT * FROM student_knowledge_profiles WHERE user_id = ? ORDER BY mastery_score ASC, discipline, topic, subtopic').all(userId) as any[];
    return rows.map((row) => this.mapKnowledge(row));
  }

  public getRadar(userId: string, boardProfileId?: string | null): any[] {
    const knowledge = this.listKnowledge(userId);
    const frequency = this.getBoardFrequency(boardProfileId);
    const keys = new Set([...knowledge.map((row) => this.key(row.discipline, row.topic, row.subtopic)), ...frequency.keys()]);
    return Array.from(keys).map((key) => {
      const student = knowledge.find((row) => this.key(row.discipline, row.topic, row.subtopic) === key);
      const board = frequency.get(key) || { frequencyPercent: 0, recentFrequencyPercent: 0, trend: 'UNKNOWN', sampleSize: 0 };
      const mastery = student?.masteryScore ?? 0;
      const trendBoost = board.trend === 'UP' ? 10 : board.trend === 'DOWN' ? -3 : 0;
      const priorityScore = Math.round(Math.min(100, Math.max(0,
        (100 - mastery) * 0.55 + board.frequencyPercent * 2.2 + board.recentFrequencyPercent * 0.8 + trendBoost
      )));
      return {
        discipline: student?.discipline || board.discipline,
        topic: student?.topic || board.topic,
        subtopic: student?.subtopic || board.subtopic,
        masteryScore: Math.round(mastery * 100) / 100,
        frequencyPercent: board.frequencyPercent,
        recentFrequencyPercent: board.recentFrequencyPercent,
        trend: board.trend,
        priorityScore,
        attempts: student?.attempts || 0,
        sampleSize: board.sampleSize,
        reason: student
          ? `Voce acertou ${student.correctAttempts} de ${student.attempts} tentativas neste conteudo; a banca representa ${board.frequencyPercent}% do historico analisado.`
          : `Ainda nao ha tentativas suas; o conteudo representa ${board.frequencyPercent}% do historico analisado pela banca.`,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }

  public listRevisions(userId: string, dueOnly = false): RevisionRow[] {
    const condition = dueOnly ? 'AND due_at <= ?' : '';
    const params = dueOnly ? [userId, new Date().toISOString()] : [userId];
    const rows = this.db.prepare(`SELECT * FROM student_revisions WHERE user_id = ? AND status = 'PENDING' ${condition} ORDER BY due_at ASC LIMIT 100`).all(...params) as any[];
    return rows.map((row) => ({ id: row.id, questionId: row.question_id ?? null, discipline: row.discipline, topic: row.topic, subtopic: row.subtopic, dueAt: row.due_at, intervalDays: Number(row.interval_days), status: row.status, source: row.source }));
  }

  public completeRevision(userId: string, id: string): RevisionRow | null {
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE student_revisions SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'PENDING'").run(now, now, id, userId);
    if (Number(result.changes) === 0) return null;
    const row = this.db.prepare('SELECT * FROM student_revisions WHERE id = ?').get(id) as any;
    return { id: row.id, questionId: row.question_id ?? null, discipline: row.discipline, topic: row.topic, subtopic: row.subtopic, dueAt: row.due_at, intervalDays: Number(row.interval_days), status: row.status, source: row.source };
  }

  public recommendQuestions(userId: string, limit = 10): any[] {
    const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
    const rows = this.db.prepare(`
      SELECT q.*, COALESCE(k.mastery_score, 0) AS learner_mastery,
        (SELECT COUNT(*) FROM student_question_attempts a WHERE a.user_id = ? AND a.question_id = q.id) AS attempts
      FROM exam_questions q
      LEFT JOIN student_knowledge_profiles k ON k.user_id = ? AND k.discipline = q.discipline AND k.topic = q.topic AND k.subtopic = q.subtopic
      WHERE q.user_id = ? AND q.review_status IN ('PENDING', 'APPROVED')
      ORDER BY learner_mastery ASC, attempts ASC, q.difficulty_score DESC, q.updated_at DESC
      LIMIT ?
    `).all(userId, userId, userId, safeLimit) as any[];
    return rows.map((row) => ({ id: row.id, examId: row.exam_id, questionNumber: Number(row.question_number), discipline: row.discipline, topic: row.topic, subtopic: row.subtopic, difficulty: row.difficulty, masteryScore: Number(row.learner_mastery || 0), attempts: Number(row.attempts || 0), reason: Number(row.attempts || 0) === 0 ? 'Conteudo ainda nao praticado.' : `Mastery atual de ${Math.round(Number(row.learner_mastery || 0))}; recomendado para reforco.` }));
  }

  public createSimulation(userId: string, mode: 'TRADITIONAL' | 'ADAPTIVE', count = 10): any {
    const questions = this.recommendQuestions(userId, Math.min(50, Math.max(1, count)));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO student_simulations (id, user_id, mode, status, question_ids_json, created_at) VALUES (?, ?, ?, \'CREATED\', ?, ?)')
      .run(id, userId, mode, JSON.stringify(questions.map((question) => question.id)), now);
    return this.getSimulation(userId, id);
  }

  public createReinforcementSimulation(userId: string, questionIds: string[]): any {
    const safeIds = Array.from(new Set(questionIds)).slice(0, 20);
    if (safeIds.length === 0) throw new Error('NO_REINFORCEMENT_QUESTIONS');
    const placeholders = safeIds.map(() => '?').join(',');
    const owned = this.db.prepare(`SELECT id FROM exam_questions WHERE user_id = ? AND id IN (${placeholders})`).all(userId, ...safeIds) as any[];
    const ownedIds = owned.map((question) => question.id);
    if (ownedIds.length === 0) throw new Error('NO_REINFORCEMENT_QUESTIONS');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO student_simulations (id, user_id, mode, status, question_ids_json, created_at) VALUES (?, ?, \'ADAPTIVE\', \'CREATED\', ?, ?)')
      .run(id, userId, JSON.stringify(ownedIds), now);
    return this.getSimulation(userId, id);
  }

  public getSimulation(userId: string, id: string): any | null {
    const row = this.db.prepare('SELECT * FROM student_simulations WHERE id = ? AND user_id = ?').get(id, userId) as any;
    if (!row) return null;
    const questionIds = JSON.parse(row.question_ids_json || '[]') as string[];
    const questions = questionIds.map((questionId) => {
      const question = this.db.prepare('SELECT id, statement, support_text, options_json, discipline, topic, subtopic, difficulty FROM exam_questions WHERE id = ? AND user_id = ?').get(questionId, userId) as any;
      if (!question) return null;
      let options: any[] = [];
      try { options = JSON.parse(question.options_json || '[]'); } catch { options = []; }
      return { id: question.id, statement: question.statement, supportText: question.support_text, options, discipline: question.discipline, topic: question.topic, subtopic: question.subtopic, difficulty: question.difficulty };
    }).filter(Boolean);
    const attemptRows = this.db.prepare('SELECT discipline, topic, is_correct, response_seconds FROM student_question_attempts WHERE user_id = ? AND simulation_id = ? ORDER BY created_at ASC').all(userId, id) as any[];
    const correct = attemptRows.filter((attempt) => Number(attempt.is_correct) === 1).length;
    const responseValues = attemptRows.filter((attempt) => attempt.response_seconds != null).map((attempt) => Number(attempt.response_seconds));
    const byDiscipline = new Map<string, { total: number; correct: number }>();
    for (const attempt of attemptRows) {
      const current = byDiscipline.get(attempt.discipline) || { total: 0, correct: 0 };
      current.total += 1;
      current.correct += Number(attempt.is_correct);
      byDiscipline.set(attempt.discipline, current);
    }
    const weakTopics = new Set(attemptRows.filter((attempt) => Number(attempt.is_correct) === 0).map((attempt) => `${attempt.discipline}\u0000${attempt.topic}`));
    const recommendations: any[] = [];
    for (const topicKey of weakTopics) {
      const [discipline, topic] = topicKey.split('\u0000');
      const candidate = this.db.prepare(`SELECT q.id, q.discipline, q.topic, q.subtopic, COALESCE(k.mastery_score, 0) AS mastery_score FROM exam_questions q LEFT JOIN student_knowledge_profiles k ON k.user_id = ? AND k.discipline = q.discipline AND k.topic = q.topic AND k.subtopic = q.subtopic WHERE q.user_id = ? AND q.discipline = ? AND q.topic = ? AND q.id NOT IN (${questionIds.map(() => '?').join(',')}) ORDER BY mastery_score ASC, q.updated_at DESC LIMIT 2`).all(userId, userId, discipline, topic, ...questionIds) as any[];
      recommendations.push(...candidate.map((candidateQuestion) => ({ id: candidateQuestion.id, discipline: candidateQuestion.discipline, topic: candidateQuestion.topic, subtopic: candidateQuestion.subtopic, masteryScore: Number(candidateQuestion.mastery_score || 0), reason: 'Reforço recomendado após erro neste tópico.' })));
    }
    return { id: row.id, mode: row.mode, status: row.status, questionIds, questions, startedAt: row.started_at, completedAt: row.completed_at, createdAt: row.created_at, analysis: { answered: attemptRows.length, correct, wrong: attemptRows.length - correct, accuracyPercent: attemptRows.length ? Math.round((correct / attemptRows.length) * 100) : 0, averageResponseSeconds: responseValues.length ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length) : null, byDiscipline: Array.from(byDiscipline.entries()).map(([discipline, score]) => ({ discipline, ...score })), recommendations } };
  }

  public updateSimulationStatus(userId: string, id: string, status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'): any | null {
    const now = new Date().toISOString();
    const fields = status === 'IN_PROGRESS' ? 'status = ?, started_at = COALESCE(started_at, ?)' : 'status = ?, completed_at = ?';
    const result = this.db.prepare(`UPDATE student_simulations SET ${fields} WHERE id = ? AND user_id = ?`).run(status, now, id, userId);
    if (Number(result.changes) === 0) return null;
    return this.getSimulation(userId, id);
  }

  public adaptSimulation(userId: string, id: string, answeredQuestionId: string, isCorrect: boolean): any | null {
    const row = this.db.prepare('SELECT * FROM student_simulations WHERE id = ? AND user_id = ? AND mode = \'ADAPTIVE\'').get(id, userId) as any;
    if (!row) return null;
    const ids = JSON.parse(row.question_ids_json || '[]') as string[];
    const answered = this.db.prepare('SELECT topic, discipline FROM exam_questions WHERE id = ? AND user_id = ?').get(answeredQuestionId, userId) as any;
    const remaining = ids.filter((questionId) => questionId !== answeredQuestionId);
    const knowledge = this.listKnowledge(userId);
    const score = (questionId: string) => {
      const question = this.db.prepare('SELECT topic, discipline FROM exam_questions WHERE id = ? AND user_id = ?').get(questionId, userId) as any;
      if (!question) return 0;
      const profile = knowledge.find((item) => item.discipline === question.discipline && item.topic === question.topic);
      const sameTopicBoost = !isCorrect && answered && question.topic === answered.topic ? 1000 : 0;
      return sameTopicBoost + (100 - (profile?.masteryScore || 0));
    };
    remaining.sort((a, b) => score(b) - score(a));
    this.db.prepare('UPDATE student_simulations SET question_ids_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify([answeredQuestionId, ...remaining]), id, userId);
    return this.getSimulation(userId, id);
  }

  private recalculate(userId: string, discipline: string, topic: string, subtopic: string): KnowledgeRow {
    const attempts = this.db.prepare(`SELECT is_correct, response_seconds, confidence_score, created_at FROM student_question_attempts WHERE user_id = ? AND discipline = ? AND topic = ? AND subtopic = ? ORDER BY created_at ASC`).all(userId, discipline, topic, subtopic) as any[];
    const now = Date.now();
    let weightedTotal = 0;
    let weightedCorrect = 0;
    for (const attempt of attempts) {
      const ageDays = Math.max(0, (now - Date.parse(attempt.created_at)) / 86400000);
      const weight = Math.exp(-ageDays / 45);
      weightedTotal += weight;
      weightedCorrect += weight * Number(attempt.is_correct);
    }
    const recencyAccuracy = weightedTotal ? (weightedCorrect / weightedTotal) * 100 : 0;
    const volumeFactor = Math.min(1, Math.log1p(attempts.length) / Math.log1p(20));
    const values = attempts.map((attempt) => Number(attempt.is_correct));
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const variance = values.length ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length : 0;
    const consistency = Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 200));
    const confidenceValues = attempts.map((attempt) => attempt.confidence_score).filter((value) => value != null).map(Number);
    const averageConfidence = confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null;
    const responseValues = attempts.map((attempt) => attempt.response_seconds).filter((value) => value != null).map(Number);
    const averageResponseSeconds = responseValues.length ? responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length : null;
    const masteryScore = Math.min(100, Math.max(0, recencyAccuracy * (0.55 + 0.45 * volumeFactor) * 0.75 + consistency * 0.15 + (averageConfidence == null ? 50 : averageConfidence * 100) * 0.10));
    const last = attempts.at(-1);
    this.db.prepare(`
      INSERT INTO student_knowledge_profiles (
        id, user_id, discipline, topic, subtopic, mastery_score, attempts, correct_attempts,
        average_response_seconds, average_confidence, consistency_score, last_attempt_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, discipline, topic, subtopic) DO UPDATE SET
        mastery_score = excluded.mastery_score, attempts = excluded.attempts,
        correct_attempts = excluded.correct_attempts, average_response_seconds = excluded.average_response_seconds,
        average_confidence = excluded.average_confidence, consistency_score = excluded.consistency_score,
        last_attempt_at = excluded.last_attempt_at, updated_at = excluded.updated_at
    `).run(crypto.randomUUID(), userId, discipline, topic, subtopic, masteryScore, attempts.length,
      values.reduce((sum, value) => sum + value, 0), averageResponseSeconds, averageConfidence, consistency, last?.created_at || null, new Date().toISOString());
    return this.listKnowledge(userId).find((row) => this.key(row.discipline, row.topic, row.subtopic) === this.key(discipline, topic, subtopic))!;
  }

  private getBoardFrequency(profileId?: string | null): Map<string, any> {
    const where = profileId ? 'AND bie.profile_id = ?' : '';
    const params = profileId ? [profileId] : [];
    const rows = this.db.prepare(`
      SELECT q.discipline, q.topic, q.subtopic, bie.exam_year
      FROM board_intelligence_exams bie
      JOIN exam_questions q ON q.exam_id = bie.exam_paper_id
      WHERE bie.status = 'APPROVED' ${where}
    `).all(...params) as any[];
    const result = new Map<string, any>();
    const total = rows.length;
    const recent = rows.filter((row) => Number(row.exam_year) >= new Date().getFullYear() - 4);
    for (const row of rows) {
      const key = this.key(row.discipline, row.topic, row.subtopic);
      const current = result.get(key) || { discipline: row.discipline, topic: row.topic, subtopic: row.subtopic, count: 0, recentCount: 0, sampleSize: 0 };
      current.count += 1;
      if (Number(row.exam_year) >= new Date().getFullYear() - 4) current.recentCount += 1;
      current.sampleSize += 1;
      result.set(key, current);
    }
    for (const value of result.values()) {
      value.frequencyPercent = total ? Number(((value.count / total) * 100).toFixed(2)) : 0;
      value.recentFrequencyPercent = recent.length ? Number(((value.recentCount / recent.length) * 100).toFixed(2)) : 0;
      value.trend = value.recentFrequencyPercent > value.frequencyPercent * 1.15 ? 'UP' : value.recentFrequencyPercent < value.frequencyPercent * 0.85 ? 'DOWN' : 'STABLE';
    }
    return result;
  }

  private key(discipline: string, topic: string, subtopic: string): string {
    return `${discipline}\u0000${topic}\u0000${subtopic}`;
  }

  private mapKnowledge(row: any): KnowledgeRow {
    return {
      discipline: row.discipline,
      topic: row.topic,
      subtopic: row.subtopic,
      masteryScore: Number(row.mastery_score || 0),
      attempts: Number(row.attempts || 0),
      correctAttempts: Number(row.correct_attempts || 0),
      averageResponseSeconds: row.average_response_seconds == null ? null : Number(row.average_response_seconds),
      averageConfidence: row.average_confidence == null ? null : Number(row.average_confidence),
      consistencyScore: Number(row.consistency_score || 0),
      lastAttemptAt: row.last_attempt_at ?? null,
    };
  }
}
