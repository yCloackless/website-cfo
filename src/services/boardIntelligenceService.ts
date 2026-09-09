import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDb } from '../db/database';
import {
  DbBoardIntelligenceExam,
  DbBoardIntelligenceProfile,
  DbBoardProfileVersion,
  DbExamQuestion,
} from '../db/schema';

const PROMPT_VERSION = 'board_analysis_v1';
const ALGORITHM_VERSION = 'board_profile_stats_v1';
const MODEL_META = {
  provider: 'heuristic-ai-provider-compatible',
  model: 'deterministic-classifier-first',
  modelVersion: 'v1',
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function pct(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function normalizeText(value: string): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mapProfile(row: any): DbBoardIntelligenceProfile {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    board: row.board,
    contest: row.contest ?? null,
    roleName: row.role_name ?? null,
    periodStart: row.period_start === null ? null : Number(row.period_start),
    periodEnd: row.period_end === null ? null : Number(row.period_end),
    description: row.description ?? null,
    status: row.status,
    activeVersion: Number(row.active_version || 0),
    examCount: Number(row.exam_count || 0),
    questionCount: Number(row.question_count || 0),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExam(row: any): DbBoardIntelligenceExam {
  return {
    id: row.id,
    profileId: row.profile_id,
    examPaperId: row.exam_paper_id,
    status: row.status,
    name: row.name,
    examYear: Number(row.exam_year),
    board: row.board ?? null,
    roleName: row.role_name ?? null,
    phase: row.phase ?? null,
    discipline: row.discipline ?? null,
    examType: row.exam_type ?? null,
    officialAnswerKeyJson: row.official_answer_key_json ?? null,
    notes: row.notes ?? null,
    approvedByUserId: row.approved_by_user_id ?? null,
    approvedAt: row.approved_at ?? null,
    rejectedByUserId: row.rejected_by_user_id ?? null,
    rejectedAt: row.rejected_at ?? null,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: any): DbBoardProfileVersion {
  return {
    id: row.id,
    profileId: row.profile_id,
    version: Number(row.version),
    status: row.status,
    snapshotId: row.snapshot_id,
    profileJson: row.profile_json,
    changeSummaryJson: row.change_summary_json,
    styleSummary: row.style_summary,
    confidence: Number(row.confidence),
    generatedByUserId: row.generated_by_user_id,
    publishedByUserId: row.published_by_user_id ?? null,
    publishedAt: row.published_at ?? null,
    restoredFromVersionId: row.restored_from_version_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BoardIntelligenceService {
  constructor(private db: DatabaseSync) {}

  public isEnabled(): boolean {
    return String(process.env.ADMIN_BOARD_INTELLIGENCE || 'true').toLowerCase() !== 'false';
  }

  public createProfile(data: {
    name: string;
    institution?: string;
    board?: string;
    contest?: string | null;
    roleName?: string | null;
    periodStart?: number | null;
    periodEnd?: number | null;
    description?: string | null;
    actorUserId: string;
  }): DbBoardIntelligenceProfile {
    const id = crypto.randomUUID();
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO board_intelligence_profiles (
        id, name, institution, board, contest, role_name, period_start, period_end,
        description, status, active_version, exam_count, question_count,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 0, 0, 0, ?, ?, ?)
    `).run(
      id,
      data.name.trim(),
      (data.institution || data.name).trim(),
      (data.board || data.name).trim(),
      data.contest ?? null,
      data.roleName ?? null,
      data.periodStart ?? null,
      data.periodEnd ?? null,
      data.description ?? null,
      data.actorUserId,
      now,
      now,
    );
    return this.getProfile(id)!;
  }

  public listProfiles(): DbBoardIntelligenceProfile[] {
    const rows = this.db.prepare('SELECT * FROM board_intelligence_profiles ORDER BY updated_at DESC').all() as any[];
    return rows.map(mapProfile);
  }

  public getProfile(id: string): DbBoardIntelligenceProfile | null {
    const row = this.db.prepare('SELECT * FROM board_intelligence_profiles WHERE id = ?').get(id) as any;
    return row ? mapProfile(row) : null;
  }

  public registerImportedExam(data: {
    profileId: string;
    examPaperId: string;
    name: string;
    examYear: number;
    board?: string | null;
    roleName?: string | null;
    phase?: string | null;
    discipline?: string | null;
    examType?: string | null;
    officialAnswerKey?: Record<string, any> | null;
    notes?: string | null;
    actorUserId: string;
  }): DbBoardIntelligenceExam {
    const id = crypto.randomUUID();
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO board_intelligence_exams (
        id, profile_id, exam_paper_id, status, name, exam_year, board, role_name,
        phase, discipline, exam_type, official_answer_key_json, notes,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'EXTRACTED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.profileId,
      data.examPaperId,
      data.name,
      data.examYear,
      data.board ?? null,
      data.roleName ?? null,
      data.phase ?? null,
      data.discipline ?? null,
      data.examType ?? null,
      data.officialAnswerKey ? JSON.stringify(data.officialAnswerKey) : null,
      data.notes ?? null,
      data.actorUserId,
      now,
      now,
    );
    return this.getExam(id)!;
  }

  public listExams(profileId: string): DbBoardIntelligenceExam[] {
    const rows = this.db.prepare('SELECT * FROM board_intelligence_exams WHERE profile_id = ? ORDER BY exam_year DESC, created_at DESC').all(profileId) as any[];
    return rows.map(mapExam);
  }

  public getExam(id: string): DbBoardIntelligenceExam | null {
    const row = this.db.prepare('SELECT * FROM board_intelligence_exams WHERE id = ?').get(id) as any;
    return row ? mapExam(row) : null;
  }

  public getReview(examId: string): any {
    const exam = this.getExam(examId);
    if (!exam) return null;
    const questions = this.getQuestionsForBoardExam(exam.id);
    const lowConfidence = questions.filter((q) => q.confidenceScore < 0.82 || q.status === 'NEEDS_REVIEW');
    return {
      exam,
      questionCount: questions.length,
      disciplines: this.countBy(questions, (q) => q.discipline),
      lowConfidenceQuestions: lowConfidence.map((q) => ({
        id: q.id,
        questionNumber: q.questionNumber,
        confidenceScore: q.confidenceScore,
        status: q.status,
      })),
      suspiciousCrops: lowConfidence.length,
      answerKey: parseJson(exam.officialAnswerKeyJson, {}),
      errors: questions.filter((q) => !q.statement || q.optionsJson === '[]').map((q) => q.id),
      unknownCategories: questions.filter((q) => q.discipline === 'Conhecimentos Gerais' || q.topic === 'Geral').length,
      canApproveForLearning: questions.length > 0,
    };
  }

  public approveExam(examId: string, actorUserId: string): { exam: DbBoardIntelligenceExam; analysesCreated: number } {
    return getDb().transaction(() => {
      const exam = this.getExam(examId);
      if (!exam) throw new Error('BOARD_EXAM_NOT_FOUND');
      if (exam.status === 'REJECTED') throw new Error('REJECTED_EXAM_CANNOT_BE_APPROVED');
      const questions = this.getQuestionsForBoardExam(exam.id);
      if (questions.length === 0) throw new Error('EXAM_HAS_NO_QUESTIONS');

      let analysesCreated = 0;
      for (const question of questions) {
        const created = this.ensureQuestionAnalysis(exam, question);
        if (created) analysesCreated += 1;
      }

      const now = nowIso();
      this.db.prepare(`
        UPDATE board_intelligence_exams
        SET status = 'APPROVED', approved_by_user_id = ?, approved_at = ?, updated_at = ?
        WHERE id = ?
      `).run(actorUserId, now, now, exam.id);
      this.recomputeProfileCounters(exam.profileId);
      return { exam: this.getExam(exam.id)!, analysesCreated };
    });
  }

  public rejectExam(examId: string, actorUserId: string): DbBoardIntelligenceExam {
    const now = nowIso();
    const exam = this.getExam(examId);
    if (!exam) throw new Error('BOARD_EXAM_NOT_FOUND');
    this.db.prepare(`
      UPDATE board_intelligence_exams
      SET status = 'REJECTED', rejected_by_user_id = ?, rejected_at = ?, updated_at = ?
      WHERE id = ?
    `).run(actorUserId, now, now, examId);
    this.recomputeProfileCounters(exam.profileId);
    return this.getExam(examId)!;
  }

  public generateDraftVersion(profileId: string, actorUserId: string): DbBoardProfileVersion {
    return getDb().transaction(() => {
      const profile = this.getProfile(profileId);
      if (!profile) throw new Error('PROFILE_NOT_FOUND');
      const stats = this.calculateStats(profileId);
      if (stats.examCount === 0 || stats.questionCount === 0) throw new Error('NO_APPROVED_EXAMS_FOR_PROFILE');

      const latestRow = this.db.prepare('SELECT MAX(version) as max_version FROM board_profile_versions WHERE profile_id = ?').get(profileId) as any;
      const versionNumber = Number(latestRow?.max_version || 0) + 1;
      const snapshotId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const now = nowIso();

      const profilePayload = {
        board: profile.board,
        version: versionNumber,
        examCount: stats.examCount,
        questionCount: stats.questionCount,
        difficulty: stats.difficulty,
        subjectDistribution: stats.subjectDistribution,
        topicDistribution: stats.topicDistribution,
        subtopicDistribution: stats.subtopicDistribution,
        commandPatterns: stats.commandPatterns,
        reasoningPatterns: stats.reasoningPatterns,
        commonTraps: stats.commonTraps,
        visualPatterns: stats.visualPatterns,
        frequencyByYear: stats.frequencyByYear,
        frequencyByPeriod: stats.frequencyByPeriod,
        dna: stats.dna,
        recentTrends: stats.recentTrends,
        styleMetrics: stats.styleMetrics,
        sampleConfidence: stats.sampleConfidence,
        styleSummary: this.buildStyleSummary(stats),
        generatedAt: now,
        sourceSnapshotId: snapshotId,
      };

      this.db.prepare(`
        INSERT INTO board_profile_snapshots (
          id, profile_id, source_exam_ids_json, source_question_ids_json, source_analysis_ids_json,
          stats_json, algorithm_version, prompt_version, provider, model, model_version,
          created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        snapshotId,
        profileId,
        JSON.stringify(stats.sourceExamIds),
        JSON.stringify(stats.sourceQuestionIds),
        JSON.stringify(stats.sourceAnalysisIds),
        JSON.stringify(stats),
        ALGORITHM_VERSION,
        PROMPT_VERSION,
        MODEL_META.provider,
        MODEL_META.model,
        MODEL_META.modelVersion,
        actorUserId,
        now,
      );

      this.db.prepare(`
        INSERT INTO board_profile_versions (
          id, profile_id, version, status, snapshot_id, profile_json, change_summary_json,
          style_summary, confidence, generated_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        profileId,
        versionNumber,
        snapshotId,
        JSON.stringify(profilePayload),
        JSON.stringify(this.compareWithActive(profileId, profilePayload)),
        profilePayload.styleSummary,
        stats.sampleConfidence,
        actorUserId,
        now,
        now,
      );
      return this.getVersion(versionId)!;
    });
  }

  public publishVersion(versionId: string, actorUserId: string): DbBoardProfileVersion {
    return getDb().transaction(() => {
      const version = this.getVersion(versionId);
      if (!version) throw new Error('VERSION_NOT_FOUND');
      if (version.status !== 'DRAFT') throw new Error('ONLY_DRAFT_CAN_BE_PUBLISHED');
      const now = nowIso();
      this.db.prepare("UPDATE board_profile_versions SET status = 'SUPERSEDED', updated_at = ? WHERE profile_id = ? AND status = 'ACTIVE'")
        .run(now, version.profileId);
      this.db.prepare(`
        UPDATE board_profile_versions
        SET status = 'ACTIVE', published_by_user_id = ?, published_at = ?, updated_at = ?
        WHERE id = ?
      `).run(actorUserId, now, now, versionId);
      this.db.prepare(`
        UPDATE board_intelligence_profiles
        SET status = 'ACTIVE', active_version = ?, updated_at = ?
        WHERE id = ?
      `).run(version.version, now, version.profileId);
      return this.getVersion(versionId)!;
    });
  }

  public rollbackToVersion(profileId: string, versionNumber: number, actorUserId: string): DbBoardProfileVersion {
    return getDb().transaction(() => {
      const target = this.getVersionByNumber(profileId, versionNumber);
      if (!target) throw new Error('TARGET_VERSION_NOT_FOUND');
      const now = nowIso();
      this.db.prepare("UPDATE board_profile_versions SET status = 'SUPERSEDED', updated_at = ? WHERE profile_id = ? AND status = 'ACTIVE'")
        .run(now, profileId);
      this.db.prepare(`
        UPDATE board_profile_versions
        SET status = 'ACTIVE', published_by_user_id = ?, published_at = ?, restored_from_version_id = ?, updated_at = ?
        WHERE id = ?
      `).run(actorUserId, now, target.id, now, target.id);
      this.db.prepare('UPDATE board_intelligence_profiles SET active_version = ?, status = ?, updated_at = ? WHERE id = ?')
        .run(target.version, 'ACTIVE', now, profileId);
      return this.getVersion(target.id)!;
    });
  }

  public listVersions(profileId: string): DbBoardProfileVersion[] {
    const rows = this.db.prepare('SELECT * FROM board_profile_versions WHERE profile_id = ? ORDER BY version DESC').all(profileId) as any[];
    return rows.map(mapVersion);
  }

  public getActiveProfileContext(profileId: string): any | null {
    const row = this.db.prepare("SELECT * FROM board_profile_versions WHERE profile_id = ? AND status = 'ACTIVE'").get(profileId) as any;
    if (!row) return null;
    return parseJson(row.profile_json, null);
  }

  public getRelevantHistoricalQuestions(profileId: string, query: string, topK = 5): any[] {
    const normalizedTerms = normalizeText(query).split(/\s+/).filter((term) => term.length >= 4);
    const questions = this.getApprovedQuestions(profileId);
    return questions
      .map((q) => {
        const haystack = normalizeText(`${q.statement} ${q.supportText || ''} ${q.discipline} ${q.topic} ${q.subtopic}`);
        const score = normalizedTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { question: q, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(20, Math.max(1, topK)))
      .map(({ question, score }) => ({ score, question }));
  }

  public getOverview(profileId: string): any {
    const profile = this.getProfile(profileId);
    if (!profile) return null;
    return {
      profile,
      exams: this.listExams(profileId),
      versions: this.listVersions(profileId),
      stats: this.calculateStats(profileId),
    };
  }

  private getVersion(id: string): DbBoardProfileVersion | null {
    const row = this.db.prepare('SELECT * FROM board_profile_versions WHERE id = ?').get(id) as any;
    return row ? mapVersion(row) : null;
  }

  private getVersionByNumber(profileId: string, version: number): DbBoardProfileVersion | null {
    const row = this.db.prepare('SELECT * FROM board_profile_versions WHERE profile_id = ? AND version = ?').get(profileId, version) as any;
    return row ? mapVersion(row) : null;
  }

  private getQuestionsForBoardExam(boardExamId: string): DbExamQuestion[] {
    const exam = this.getExam(boardExamId);
    if (!exam) return [];
    const rows = this.db.prepare('SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY question_number ASC').all(exam.examPaperId) as any[];
    return rows.map((row) => ({
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      questionNumber: Number(row.question_number),
      statement: row.statement,
      supportText: row.support_text ?? null,
      optionsJson: row.options_json || '[]',
      correctOption: row.correct_option ?? null,
      discipline: row.discipline,
      topic: row.topic,
      subtopic: row.subtopic,
      difficulty: row.difficulty,
      difficultyScore: Number(row.difficulty_score || 0.5),
      confidenceScore: Number(row.confidence_score || 0.95),
      imagesJson: row.images_json ?? null,
      aiSolutionJson: row.ai_solution_json ?? null,
      status: row.status,
      reviewStatus: row.review_status || 'PENDING',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private getApprovedQuestions(profileId: string): DbExamQuestion[] {
    const rows = this.db.prepare(`
      SELECT q.*
      FROM board_intelligence_exams bie
      JOIN exam_questions q ON q.exam_id = bie.exam_paper_id
      WHERE bie.profile_id = ? AND bie.status = 'APPROVED'
      ORDER BY bie.exam_year DESC, q.question_number ASC
    `).all(profileId) as any[];
    return rows.map((row) => ({
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      questionNumber: Number(row.question_number),
      statement: row.statement,
      supportText: row.support_text ?? null,
      optionsJson: row.options_json || '[]',
      correctOption: row.correct_option ?? null,
      discipline: row.discipline,
      topic: row.topic,
      subtopic: row.subtopic,
      difficulty: row.difficulty,
      difficultyScore: Number(row.difficulty_score || 0.5),
      confidenceScore: Number(row.confidence_score || 0.95),
      imagesJson: row.images_json ?? null,
      aiSolutionJson: row.ai_solution_json ?? null,
      status: row.status,
      reviewStatus: row.review_status || 'PENDING',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private ensureQuestionAnalysis(exam: DbBoardIntelligenceExam, question: DbExamQuestion): boolean {
    const options = parseJson<any[]>(question.optionsJson, []);
    const source = `${question.statement}|${question.supportText || ''}|${question.optionsJson}`;
    const questionHash = crypto.createHash('sha256').update(source).digest('hex');
    const existing = this.db.prepare(`
      SELECT id FROM board_question_analysis
      WHERE profile_id = ? AND question_id = ? AND prompt_version = ? AND model_version = ?
    `).get(exam.profileId, question.id, PROMPT_VERSION, MODEL_META.modelVersion);
    if (existing) return false;

    const text = normalizeText(`${question.statement} ${question.supportText || ''}`);
    const optionText = normalizeText(options.map((o) => o.text).join(' '));
    const command = this.detectCommand(question.statement);
    const metrics = {
      statementLength: question.statement.split(/\s+/).filter(Boolean).length,
      alternativeCount: options.length,
      hasImage: parseJson<any[]>(question.imagesJson, []).length > 0,
      hasGraph: /grafico|gráfico|diagrama|figura/.test(text),
      hasTable: /tabela|quadro/.test(text),
      hasSupportText: Boolean(question.supportText && question.supportText.trim()),
      hasMath: /(\d+\s*[%=+\-*/]|calcule|formula|equacao|função|funcao|raz[aã]o|propor)/i.test(question.statement),
      hasChemistry: /quimic|mol|substancia|reacao|co2|h2o|carbono/.test(text),
      requiresCalculation: /calcule|determine|quanto|valor|percentual|equacao|km\/h|m\/s|\d/.test(text),
      requiresInterpretation: /texto|infere|interpreta|analise|com base|considere|correto afirmar/.test(text),
      requiresMemorization: /assinale|conceito|defini|norma|lei|regra/.test(text),
      requiresMultipleSteps: /em seguida|ap[óo]s|sucessiv|duas etapas|primeiro/.test(text),
      interdisciplinary: /(fisica|quimica|biologia|historia|geografia|matematica|portugues)/.test(text) && question.discipline === 'Conhecimentos Gerais',
      hasSimilarAlternatives: this.hasSimilarAlternatives(options),
      hasAllNoneAlternative: /todas as anteriores|nenhuma das anteriores/.test(optionText),
    };
    const taxonomy = {
      discipline: question.discipline,
      topic: question.topic,
      subtopic: question.subtopic,
      difficulty: question.difficulty,
      difficultyScore: question.difficultyScore,
      questionType: this.detectQuestionTypes(question, metrics),
      commandType: command,
      reasoningType: this.detectReasoningTypes(metrics, text),
      commonTraps: this.detectTraps(text, optionText),
      officialAnswer: question.correctOption || null,
      answerStatus: 'UNKNOWN',
    };
    const confidence = Math.max(0.35, Math.min(0.98, question.confidenceScore * (question.discipline === 'Conhecimentos Gerais' ? 0.75 : 1)));
    const now = nowIso();
    this.db.prepare(`
      INSERT INTO board_question_analysis (
        id, profile_id, exam_id, question_id, question_hash, prompt_version, provider,
        model, model_version, taxonomy_json, metrics_json, confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      exam.profileId,
      exam.id,
      question.id,
      questionHash,
      PROMPT_VERSION,
      MODEL_META.provider,
      MODEL_META.model,
      MODEL_META.modelVersion,
      JSON.stringify(taxonomy),
      JSON.stringify(metrics),
      confidence,
      confidence < 0.7 ? 'LOW_CONFIDENCE' : 'READY',
      now,
      now,
    );
    return true;
  }

  private calculateStats(profileId: string): any {
    const rows = this.db.prepare(`
      SELECT bie.id as board_exam_id, bie.exam_year, q.id as question_id, q.question_number,
             q.discipline, q.topic, q.subtopic, q.difficulty, q.difficulty_score,
             bqa.id as analysis_id, bqa.taxonomy_json, bqa.metrics_json, bqa.confidence
      FROM board_intelligence_exams bie
      JOIN exam_questions q ON q.exam_id = bie.exam_paper_id
      LEFT JOIN board_question_analysis bqa ON bqa.question_id = q.id AND bqa.profile_id = bie.profile_id
      WHERE bie.profile_id = ? AND bie.status = 'APPROVED'
      ORDER BY bie.exam_year ASC, q.question_number ASC
    `).all(profileId) as any[];

    const total = rows.length;
    const sourceExamIds = Array.from(new Set(rows.map((r) => r.board_exam_id)));
    const sourceQuestionIds = rows.map((r) => r.question_id);
    const sourceAnalysisIds = rows.map((r) => r.analysis_id).filter(Boolean);
    const difficultyCounts = this.countRows(rows, (r) => r.difficulty || 'Médio');
    const subjectCounts = this.countRows(rows, (r) => r.discipline || 'Conhecimentos Gerais');
    const topicCounts = this.countRows(rows, (r) => r.topic || 'Geral');
    const subtopicCounts = this.countRows(rows, (r) => r.subtopic || 'Geral');
    const byYear: Record<string, any> = {};

    for (const row of rows) {
      const year = String(row.exam_year);
      byYear[year] ||= { total: 0, topics: {}, disciplines: {}, difficulty: {} };
      byYear[year].total += 1;
      byYear[year].topics[row.topic] = (byYear[year].topics[row.topic] || 0) + 1;
      byYear[year].disciplines[row.discipline] = (byYear[year].disciplines[row.discipline] || 0) + 1;
      byYear[year].difficulty[row.difficulty] = (byYear[year].difficulty[row.difficulty] || 0) + 1;
    }

    const analyses = rows.map((r) => ({
      taxonomy: parseJson<any>(r.taxonomy_json, {}),
      metrics: parseJson<any>(r.metrics_json, {}),
      confidence: Number(r.confidence || 0.7),
      year: Number(r.exam_year),
      questionId: r.question_id,
      questionNumber: Number(r.question_number),
    }));

    return {
      examCount: sourceExamIds.length,
      questionCount: total,
      sourceExamIds,
      sourceQuestionIds,
      sourceAnalysisIds,
      difficulty: this.toDistribution(difficultyCounts, total),
      subjectDistribution: this.toDistribution(subjectCounts, total),
      topicDistribution: this.toDistribution(topicCounts, total),
      subtopicDistribution: this.toDistribution(subtopicCounts, total),
      commandPatterns: this.patternDistribution(analyses, (a) => a.taxonomy.commandType || 'OUTRO'),
      reasoningPatterns: this.patternDistribution(analyses.flatMap((a) => (a.taxonomy.reasoningType || []).map((type: string) => ({ ...a, type }))), (a: any) => a.type),
      commonTraps: this.commonTrapDistribution(analyses),
      visualPatterns: this.visualDistribution(analyses, total),
      frequencyByYear: byYear,
      frequencyByPeriod: this.periodDistribution(byYear),
      dna: this.calculateDna(analyses, total),
      recentTrends: this.calculateTrends(byYear),
      styleMetrics: this.calculateStyleMetrics(analyses),
      sampleConfidence: total >= 100 ? 0.92 : total >= 40 ? 0.8 : total >= 10 ? 0.65 : 0.45,
    };
  }

  private recomputeProfileCounters(profileId: string): void {
    const stats = this.calculateStats(profileId);
    const years = Object.keys(stats.frequencyByYear).map(Number).filter(Boolean);
    this.db.prepare(`
      UPDATE board_intelligence_profiles
      SET exam_count = ?, question_count = ?, period_start = COALESCE(?, period_start),
          period_end = COALESCE(?, period_end), updated_at = ?
      WHERE id = ?
    `).run(stats.examCount, stats.questionCount, years.length ? Math.min(...years) : null, years.length ? Math.max(...years) : null, nowIso(), profileId);
  }

  private countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of items) {
      const key = keyFn(item) || 'Indefinido';
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }

  private countRows(rows: any[], keyFn: (item: any) => string): Record<string, number> {
    return this.countBy(rows, keyFn);
  }

  private toDistribution(counts: Record<string, number>, total: number): any[] {
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, percent: pct(count, total) }))
      .sort((a, b) => b.count - a.count);
  }

  private patternDistribution(items: any[], keyFn: (item: any) => string): any[] {
    const total = items.length;
    return this.toDistribution(this.countBy(items, keyFn), total);
  }

  private commonTrapDistribution(analyses: any[]): any[] {
    const examples: Record<string, any[]> = {};
    for (const item of analyses) {
      for (const trap of item.taxonomy.commonTraps || []) {
        examples[trap] ||= [];
        if (examples[trap].length < 5) examples[trap].push({ questionId: item.questionId, questionNumber: item.questionNumber, year: item.year });
      }
    }
    return Object.entries(examples).map(([description, refs]) => ({
      description,
      frequency: refs.length,
      percent: pct(refs.length, analyses.length),
      examples: refs,
      confidence: refs.length >= 3 ? 0.85 : 0.55,
    })).sort((a, b) => b.frequency - a.frequency);
  }

  private visualDistribution(analyses: any[], total: number): any {
    const flags = ['hasImage', 'hasGraph', 'hasTable', 'hasSupportText'];
    return Object.fromEntries(flags.map((flag) => {
      const count = analyses.filter((a) => Boolean(a.metrics[flag])).length;
      return [flag, { count, percent: pct(count, total) }];
    }));
  }

  private periodDistribution(byYear: Record<string, any>): any {
    const periods: Record<string, number> = {};
    for (const [year, data] of Object.entries(byYear)) {
      const numeric = Number(year);
      const period = `${Math.floor(numeric / 3) * 3}-${Math.floor(numeric / 3) * 3 + 2}`;
      periods[period] = (periods[period] || 0) + (data as any).total;
    }
    return periods;
  }

  private calculateDna(analyses: any[], total: number): any {
    const score = (flag: string) => Math.round(pct(analyses.filter((a) => Boolean(a.metrics[flag])).length, total));
    const avgLen = analyses.reduce((sum, a) => sum + Number(a.metrics.statementLength || 0), 0) / Math.max(1, total);
    return {
      interpretation: score('requiresInterpretation'),
      calculation: score('requiresCalculation'),
      memorization: score('requiresMemorization'),
      contextualization: Math.round(pct(analyses.filter((a) => a.metrics.hasSupportText || Number(a.metrics.statementLength || 0) > 60).length, total)),
      traps: Math.round(pct(analyses.filter((a) => (a.taxonomy.commonTraps || []).length > 0).length, total)),
      graphUsage: score('hasGraph'),
      longQuestions: Math.min(100, Math.round((avgLen / 90) * 100)),
    };
  }

  private calculateTrends(byYear: Record<string, any>): any[] {
    const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
    if (years.length < 3) return [{ label: 'Base histórica insuficiente', confidence: 0.4, evidence: byYear }];
    const topics = new Set<string>();
    for (const data of Object.values(byYear) as any[]) Object.keys(data.topics || {}).forEach((topic) => topics.add(topic));
    const trends: any[] = [];
    for (const topic of topics) {
      const firstYears = years.slice(0, Math.ceil(years.length / 2));
      const lastYears = years.slice(Math.floor(years.length / 2));
      const firstPct = firstYears.reduce((sum, y) => sum + pct(byYear[String(y)].topics[topic] || 0, byYear[String(y)].total), 0) / firstYears.length;
      const lastPct = lastYears.reduce((sum, y) => sum + pct(byYear[String(y)].topics[topic] || 0, byYear[String(y)].total), 0) / lastYears.length;
      const delta = Number((lastPct - firstPct).toFixed(2));
      if (Math.abs(delta) >= 5) {
        trends.push({
          label: `${topic} ${delta > 0 ? 'crescendo' : 'reduzindo'}`,
          direction: delta > 0 ? 'UP' : 'DOWN',
          deltaPercentPoints: delta,
          confidence: Math.min(0.9, 0.55 + Math.abs(delta) / 100),
          evidence: years.map((year) => ({ year, percent: pct(byYear[String(year)].topics[topic] || 0, byYear[String(year)].total) })),
        });
      }
    }
    return trends.slice(0, 8);
  }

  private calculateStyleMetrics(analyses: any[]): any {
    const total = Math.max(1, analyses.length);
    const avgStatementWords = analyses.reduce((sum, a) => sum + Number(a.metrics.statementLength || 0), 0) / total;
    const avgAlternatives = analyses.reduce((sum, a) => sum + Number(a.metrics.alternativeCount || 0), 0) / total;
    return {
      averageStatementWords: Number(avgStatementWords.toFixed(1)),
      averageAlternatives: Number(avgAlternatives.toFixed(1)),
      lowConfidenceCount: analyses.filter((a) => a.confidence < 0.7).length,
      sampleSize: analyses.length,
    };
  }

  private compareWithActive(profileId: string, nextPayload: any): any {
    const active = this.getActiveProfileContext(profileId);
    if (!active) {
      return { type: 'INITIAL_VERSION', addedExams: nextPayload.examCount, addedQuestions: nextPayload.questionCount };
    }
    return {
      type: 'VERSION_DELTA',
      examCount: { from: active.examCount, to: nextPayload.examCount },
      questionCount: { from: active.questionCount, to: nextPayload.questionCount },
      difficulty: { from: active.difficulty, to: nextPayload.difficulty },
      topTopics: { from: active.topicDistribution?.slice?.(0, 5) || [], to: nextPayload.topicDistribution.slice(0, 5) },
    };
  }

  private buildStyleSummary(stats: any): string {
    if (stats.questionCount < 10) return 'Base histórica insuficiente para conclusões fortes. Use como rascunho auditável.';
    const topSubject = stats.subjectDistribution[0]?.name || 'disciplinas variadas';
    const topCommand = stats.commandPatterns[0]?.name || 'comandos variados';
    return `Perfil baseado em ${stats.examCount} prova(s) aprovada(s) e ${stats.questionCount} questão(ões). Maior incidência em ${topSubject}, comando mais frequente: ${topCommand}.`;
  }

  private detectCommand(statement: string): string {
    const text = normalizeText(statement);
    const patterns = [
      ['ASSINALE', /assinale/],
      ['MARQUE', /marque/],
      ['DETERMINE', /determine/],
      ['CALCULE', /calcule/],
      ['ANALISE', /analise/],
      ['CONSIDERE', /considere/],
      ['COM_BASE_NO_TEXTO', /com base no texto/],
      ['CORRETO_AFIRMAR', /correto afirmar/],
      ['INCORRETO_AFIRMAR', /incorreto afirmar/],
    ] as const;
    return patterns.find(([, re]) => re.test(text))?.[0] || 'OUTRO';
  }

  private detectQuestionTypes(question: DbExamQuestion, metrics: any): string[] {
    const types = ['OBJETIVA'];
    if (metrics.requiresCalculation) types.push('CÁLCULO');
    if (metrics.requiresInterpretation) types.push('INTERPRETAÇÃO');
    if (metrics.hasGraph) types.push('ANÁLISE DE GRÁFICO');
    if (metrics.hasTable) types.push('ANÁLISE DE TABELA');
    if (metrics.hasSupportText) types.push('TEXTO DE APOIO');
    if (metrics.interdisciplinary) types.push('MULTIDISCIPLINAR');
    if (question.optionsJson === '[]') types.push('DISCURSIVA');
    return types;
  }

  private detectReasoningTypes(metrics: any, text: string): string[] {
    const result: string[] = [];
    if (metrics.requiresMemorization) result.push('memorizaçao direta');
    if (metrics.requiresInterpretation) result.push('interpretaçao');
    if (metrics.requiresCalculation) result.push('aplicação de fórmula');
    if (metrics.hasGraph) result.push('análise gráfica');
    if (/infer|conclui|depreende/.test(text)) result.push('inferência');
    if (metrics.requiresMultipleSteps) result.push('cálculo em múltiplas etapas');
    if (result.length === 0) result.push('aplicação conceitual');
    return result;
  }

  private detectTraps(text: string, optionText: string): string[] {
    const traps: string[] = [];
    if (/incorreto|exceto|nao|não/.test(text)) traps.push('negação no enunciado');
    if (/sinal|positivo|negativo/.test(text + optionText)) traps.push('troca de sinal');
    if (/unidade|km\/h|m\/s|litro|mol|metro/.test(text + optionText)) traps.push('unidade incorreta');
    if (/percentual|porcentagem|%/.test(text)) traps.push('erro percentual');
    if (/semelhante|conceitos/.test(optionText)) traps.push('confundir conceitos semelhantes');
    return traps;
  }

  private hasSimilarAlternatives(options: any[]): boolean {
    const texts = options.map((option) => normalizeText(option.text || ''));
    for (let i = 0; i < texts.length; i += 1) {
      for (let j = i + 1; j < texts.length; j += 1) {
        if (texts[i] && texts[j] && (texts[i].includes(texts[j].slice(0, 24)) || texts[j].includes(texts[i].slice(0, 24)))) {
          return true;
        }
      }
    }
    return false;
  }
}

let singleton: BoardIntelligenceService | null = null;
export function getBoardIntelligenceService(): BoardIntelligenceService {
  if (!singleton) singleton = new BoardIntelligenceService(getDb().getRawDb());
  return singleton;
}
