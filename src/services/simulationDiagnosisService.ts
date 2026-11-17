import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  AnswerOption,
  SubjectScoreEntry,
  clampQuestionCount,
  gradeAnswerSheet,
} from '../utils/answerSheet';
import { sanitizeSubjectScores } from './examRadarService';

export interface SubjectGapItem {
  subject: string;
  accuracyPct: number;
  studiedHours: number;
  daysSinceLastStudy: number | null;
  reason: string;
}

export interface SimulationDiagnosisResult {
  source: 'gemini' | 'heuristic';
  summary: string;
  firstTime: SubjectGapItem[]; // Ver pela primeira vez
  review: SubjectGapItem[];    // Rever
  deepen: SubjectGapItem[];    // Aprofundar
  actionPlan: string[];
  generatedAt: string;
}

export interface UserSimulationDTO {
  id: string;
  clientLegacyId?: string | null;
  dateStr: string;
  title: string;
  examType: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  targetCutoffPct: number;
  concept: 'A' | 'B' | 'C' | 'D' | 'Risco';
  selfEvaluation: string;
  reviewTargets: string[];
  studentAnswers: AnswerOption[];
  officialKey: AnswerOption[];
  subjectScores: SubjectScoreEntry[];
  aiDiagnosis: SimulationDiagnosisResult | null;
  aiAnalyzedAt: string | null;
  createdAt: string;
}

export interface CreateSimulationInput {
  clientLegacyId?: string;
  dateStr: string;
  title: string;
  examType?: string;
  totalQuestions: number;
  correctCount?: number;
  targetCutoffPct?: number;
  selfEvaluation?: string;
  reviewTargets?: string[];
  studentAnswers?: AnswerOption[];
  officialKey?: AnswerOption[];
  subjectScores?: SubjectScoreEntry[];
  createdAt?: string;
}

function normalizeSubjectName(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function computeConcept(correct: number, total: number): 'A' | 'B' | 'C' | 'D' | 'Risco' {
  if (total <= 0) return 'Risco';
  const ratio = correct / total;
  if (ratio >= 0.8) return 'A';
  if (ratio >= 0.7) return 'B';
  if (ratio >= 0.6) return 'C';
  if (ratio >= 0.5) return 'D';
  return 'Risco';
}

function sanitizeAnswersArray(raw: unknown, totalQuestions: number): AnswerOption[] {
  const valid = new Set(['A', 'B', 'C', 'D', 'E', 'U']);
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: totalQuestions }, (_, i) => {
    const val = typeof arr[i] === 'string' ? arr[i].trim().toUpperCase() : '';
    return valid.has(val) ? (val as AnswerOption) : null;
  });
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class SimulationDiagnosisService {
  constructor(private readonly db: DatabaseSync) {}

  public listSimulations(userId: string): UserSimulationDTO[] {
    const rows = this.db.prepare(
      `SELECT * FROM user_simulations
       WHERE user_id = ?
       ORDER BY date_str DESC, created_at DESC
       LIMIT 100`
    ).all(userId) as any[];
    return rows.map((row) => this.mapRow(row));
  }

  public createSimulation(userId: string, input: CreateSimulationInput): UserSimulationDTO {
    const title = String(input.title || '').trim().slice(0, 180);
    if (!title) throw new Error('INVALID_TITLE');

    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(String(input.dateStr || ''))
      ? String(input.dateStr)
      : new Date().toISOString().slice(0, 10);
    const examType = String(input.examType || 'Geral').trim().slice(0, 60) || 'Geral';
    const totalQuestions = clampQuestionCount(input.totalQuestions);
    const targetCutoffPct = Math.max(40, Math.min(100, Number(input.targetCutoffPct) || 70));
    const studentAnswers = sanitizeAnswersArray(input.studentAnswers, totalQuestions);
    const officialKey = sanitizeAnswersArray(input.officialKey, totalQuestions);
    const subjectScores = sanitizeSubjectScores(input.subjectScores);
    const reviewTargets = Array.isArray(input.reviewTargets)
      ? input.reviewTargets.map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 30)
      : [];

    const hasOfficialKey = officialKey.some((k) => k && k !== 'U');
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;

    if (hasOfficialKey) {
      const graded = gradeAnswerSheet(studentAnswers, officialKey);
      correctCount = graded.correctCount;
      wrongCount = graded.wrongCount;
      blankCount = graded.blankCount;
    } else if (subjectScores.length > 0 && input.correctCount == null) {
      correctCount = Math.min(
        totalQuestions,
        subjectScores.reduce((sum, s) => sum + s.correctCount, 0)
      );
      wrongCount = Math.max(0, totalQuestions - correctCount);
    } else {
      correctCount = Math.max(0, Math.min(totalQuestions, Math.round(Number(input.correctCount) || 0)));
      wrongCount = Math.max(0, totalQuestions - correctCount);
    }

    const concept = computeConcept(correctCount, totalQuestions);
    const clientLegacyId = input.clientLegacyId ? String(input.clientLegacyId).slice(0, 120) : null;
    const now = new Date().toISOString();
    const createdAt = input.createdAt && !Number.isNaN(Date.parse(input.createdAt)) ? input.createdAt : now;

    if (clientLegacyId) {
      const existing = this.db.prepare(
        'SELECT * FROM user_simulations WHERE user_id = ? AND client_legacy_id = ?'
      ).get(userId, clientLegacyId) as any;
      if (existing) return this.mapRow(existing);
    }

    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO user_simulations (
        id, user_id, client_legacy_id, date_str, title, exam_type,
        total_questions, correct_count, wrong_count, blank_count, target_cutoff_pct,
        concept, self_evaluation, review_targets_json,
        student_answers_json, official_key_json, subject_scores_json,
        ai_diagnosis_json, ai_analyzed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      id,
      userId,
      clientLegacyId,
      dateStr,
      title,
      examType,
      totalQuestions,
      correctCount,
      wrongCount,
      blankCount,
      targetCutoffPct,
      concept,
      String(input.selfEvaluation || '').trim().slice(0, 2000),
      JSON.stringify(reviewTargets),
      JSON.stringify(studentAnswers),
      JSON.stringify(officialKey),
      JSON.stringify(subjectScores),
      createdAt,
      now
    );

    const created = this.db.prepare('SELECT * FROM user_simulations WHERE id = ?').get(id) as any;
    return this.mapRow(created);
  }

  public deleteSimulation(userId: string, simId: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM user_simulations WHERE id = ? AND user_id = ?'
    ).run(simId, userId);
    return Number(result.changes) > 0;
  }

  public async diagnose(
    userId: string,
    simId: string | undefined,
    geminiClient: any | null
  ): Promise<SimulationDiagnosisResult> {
    let targetSims: UserSimulationDTO[] = [];
    if (simId) {
      const row = this.db.prepare(
        'SELECT * FROM user_simulations WHERE id = ? AND user_id = ?'
      ).get(simId, userId) as any;
      if (!row) throw new Error('SIMULATION_NOT_FOUND');
      targetSims = [this.mapRow(row)];
    } else {
      targetSims = this.listSimulations(userId).slice(0, 12);
      if (targetSims.length === 0) throw new Error('NO_SIMULATIONS_FOUND');
    }

    // Agrega histórico real de study_sessions por matéria
    const sessionRows = this.db.prepare(`
      SELECT subject_id, subject_name, SUM(duration_seconds) AS total_seconds, MAX(date_str) AS last_date
      FROM study_sessions
      WHERE user_id = ?
      GROUP BY subject_id, subject_name
    `).all(userId) as Array<{ subject_id: string; subject_name: string; total_seconds: number; last_date: string }>;

    const studyHistoryById = new Map<string, { seconds: number; lastDate: string }>();
    const studyHistoryByName = new Map<string, { seconds: number; lastDate: string }>();

    for (const row of sessionRows) {
      const secs = Number(row.total_seconds) || 0;
      const lastDate = row.last_date;
      if (row.subject_id) {
        const cur = studyHistoryById.get(row.subject_id);
        studyHistoryById.set(row.subject_id, {
          seconds: (cur?.seconds || 0) + secs,
          lastDate: cur && cur.lastDate > lastDate ? cur.lastDate : lastDate,
        });
      }
      const norm = normalizeSubjectName(row.subject_name);
      if (norm) {
        const cur = studyHistoryByName.get(norm);
        studyHistoryByName.set(norm, {
          seconds: (cur?.seconds || 0) + secs,
          lastDate: cur && cur.lastDate > lastDate ? cur.lastDate : lastDate,
        });
      }
    }

    const aggregated = new Map<string, { subjectId?: string; subjectName: string; correct: number; total: number; targetCutoff: number }>();
    for (const sim of targetSims) {
      for (const s of sim.subjectScores) {
        const key = normalizeSubjectName(s.subjectName);
        const cur = aggregated.get(key) || {
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          correct: 0,
          total: 0,
          targetCutoff: sim.targetCutoffPct,
        };
        cur.correct += s.correctCount;
        cur.total += s.totalCount;
        cur.targetCutoff = Math.max(cur.targetCutoff, sim.targetCutoffPct);
        aggregated.set(key, cur);
      }
      // Se não lançou acertos por matéria, aproveita reviewTargets explícitos
      if (sim.subjectScores.length === 0 && sim.reviewTargets.length > 0) {
        for (const tag of sim.reviewTargets) {
          const key = normalizeSubjectName(tag);
          if (!aggregated.has(key)) {
            aggregated.set(key, {
              subjectName: tag,
              correct: 0,
              total: 10,
              targetCutoff: sim.targetCutoffPct,
            });
          }
        }
      }
    }

    const todayMs = Date.now();
    const firstTime: SubjectGapItem[] = [];
    const review: SubjectGapItem[] = [];
    const deepen: SubjectGapItem[] = [];

    for (const [normKey, entry] of aggregated.entries()) {
      const accuracyPct = Number(((entry.correct / Math.max(1, entry.total)) * 100).toFixed(1));
      const history =
        (entry.subjectId ? studyHistoryById.get(entry.subjectId) : undefined) ||
        studyHistoryByName.get(normKey) ||
        Array.from(studyHistoryByName.entries()).find(([name]) => name.includes(normKey) || normKey.includes(name))?.[1];

      const studiedSeconds = history?.seconds || 0;
      const studiedHours = Number((studiedSeconds / 3600).toFixed(1));
      const daysSinceLastStudy = history?.lastDate
        ? Math.max(0, Math.round((todayMs - Date.parse(`${history.lastDate}T12:00:00Z`)) / 86400000))
        : null;

      if (accuracyPct >= entry.targetCutoff && studiedSeconds >= 1800) {
        continue;
      }

      if (studiedSeconds < 1800) {
        firstTime.push({
          subject: entry.subjectName,
          accuracyPct,
          studiedHours,
          daysSinceLastStudy,
          reason: `Rendimento de ${accuracyPct}% e menos de 30 min registrados na grade — precisa ver a base teórica pela primeira vez.`,
        });
      } else if ((daysSinceLastStudy !== null && daysSinceLastStudy > 7) || studiedSeconds < 3 * 3600) {
        review.push({
          subject: entry.subjectName,
          accuracyPct,
          studiedHours,
          daysSinceLastStudy,
          reason: `Você já acumulou ${studiedHours}h (último contato há ${daysSinceLastStudy ?? 0} dia(s)), mas caiu para ${accuracyPct}% — precisa rever para fixar.`,
        });
      } else {
        deepen.push({
          subject: entry.subjectName,
          accuracyPct,
          studiedHours,
          daysSinceLastStudy,
          reason: `Mesmo com ${studiedHours}h recentes de estudo, segue em ${accuracyPct}% (abaixo da meta de ${entry.targetCutoff}%) — hora de aprofundar em questões difíceis.`,
        });
      }
    }

    const avgPct = targetSims.length
      ? Number(
          (
            (targetSims.reduce((sum, s) => sum + s.correctCount, 0) /
              Math.max(1, targetSims.reduce((sum, s) => sum + s.totalQuestions, 0))) *
            100
          ).toFixed(1)
        )
      : 0;

    let result: SimulationDiagnosisResult = {
      source: 'heuristic',
      summary: simId
        ? `Análise do simulado "${targetSims[0].title}": ${targetSims[0].correctCount}/${targetSims[0].totalQuestions} (${avgPct}%).`
        : `Visão consolidada de ${targetSims.length} simulado(s): aproveitamento médio de ${avgPct}%.`,
      firstTime,
      review,
      deepen,
      actionPlan: [
        ...(firstTime[0] ? [`Começar teoria base de ${firstTime[0].subject} (${firstTime[0].accuracyPct}%).`] : []),
        ...(review[0] ? [`Fazer revisão espaçada e bateria rápida de ${review[0].subject}.`] : []),
        ...(deepen[0] ? [`Resolver questões de nível superior e caderno de erros em ${deepen[0].subject}.`] : []),
      ],
      generatedAt: new Date().toISOString(),
    };

    if (geminiClient) {
      try {
        const prompt = `Você é o Coordenador Tático do concurso CFO CBMERJ.
Com base EXCLUSIVAMENTE nos dados reais de simulados e horas estudadas abaixo:
- Escopo: ${result.summary}
- Matérias sem base estudada (Ver pela 1ª vez): ${JSON.stringify(firstTime)}
- Matérias para Rever: ${JSON.stringify(review)}
- Matérias para Aprofundar: ${JSON.stringify(deepen)}
- Autoavaliações / alvos anotados: ${JSON.stringify(targetSims.map((s) => ({ title: s.title, selfEvaluation: s.selfEvaluation, targets: s.reviewTargets })))}

Gere JSON puro:
{
  "summary": "síntese objetiva e motivadora baseada nos números reais",
  "actionPlan": ["passo 1", "passo 2", "passo 3", "passo 4"]
}`;
        const models = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
        for (const model of models) {
          try {
            const response = await geminiClient.models.generateContent({
              model,
              contents: [{ text: prompt }],
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            });
            const parsed = JSON.parse(String(response.text || '{}'));
            if (parsed && typeof parsed.summary === 'string') {
              result = {
                ...result,
                source: 'gemini',
                summary: parsed.summary,
                actionPlan: Array.isArray(parsed.actionPlan) && parsed.actionPlan.length > 0
                  ? parsed.actionPlan.slice(0, 6)
                  : result.actionPlan,
              };
              break;
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[SimulationDiagnosis Gemini Error]:', err);
      }
    }

    if (simId) {
      const now = new Date().toISOString();
      this.db.prepare(
        'UPDATE user_simulations SET ai_diagnosis_json = ?, ai_analyzed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
      ).run(JSON.stringify(result), now, now, simId, userId);
    }

    return result;
  }

  private mapRow(row: any): UserSimulationDTO {
    return {
      id: row.id,
      clientLegacyId: row.client_legacy_id ?? null,
      dateStr: row.date_str,
      title: row.title,
      examType: row.exam_type || 'Geral',
      totalQuestions: Number(row.total_questions) || 0,
      correctCount: Number(row.correct_count) || 0,
      wrongCount: Number(row.wrong_count) || 0,
      blankCount: Number(row.blank_count) || 0,
      targetCutoffPct: Number(row.target_cutoff_pct) || 70,
      concept: row.concept || 'Risco',
      selfEvaluation: row.self_evaluation || '',
      reviewTargets: parseJsonSafe<string[]>(row.review_targets_json, []),
      studentAnswers: parseJsonSafe<AnswerOption[]>(row.student_answers_json, []),
      officialKey: parseJsonSafe<AnswerOption[]>(row.official_key_json, []),
      subjectScores: parseJsonSafe<SubjectScoreEntry[]>(row.subject_scores_json, []),
      aiDiagnosis: parseJsonSafe<SimulationDiagnosisResult | null>(row.ai_diagnosis_json, null),
      aiAnalyzedAt: row.ai_analyzed_at ?? null,
      createdAt: row.created_at,
    };
  }
}
