import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  AnswerOption,
  SubjectScoreEntry,
  clampQuestionCount,
  gradeAnswerSheet,
} from '../utils/answerSheet';

export interface ExamDiagnosisResult {
  source: 'gemini' | 'heuristic';
  summary: string;
  wrongQuestions: number[];
  blankQuestions: number[];
  weakTopics: Array<{
    subject: string;
    topic: string;
    errorPattern: string;
    recommendation: string;
    questionNumbers: number[];
  }>;
  prioritySubjects: Array<{
    subject: string;
    accuracyPct: number;
    correctCount: number;
    totalCount: number;
    priority: 'CRÍTICA' | 'ALTA' | 'MÉDIA';
    reason: string;
  }>;
  studyPlan: string[];
  generatedAt: string;
}

export interface ExamAttemptDTO {
  id: string;
  examPaperId: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  accuracyPct: number;
  studentAnswers: AnswerOption[];
  officialKey: AnswerOption[];
  subjectScores: SubjectScoreEntry[];
  aiDiagnosis: ExamDiagnosisResult | null;
  aiAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RadarExamItem {
  examPaperId: string;
  title: string;
  institution: string;
  examYear: number;
  totalQuestions: number;
  hasPdf: boolean;
  attemptsCount: number;
  latestAttempt: ExamAttemptDTO | null;
}

export interface SaveExamAttemptInput {
  totalQuestions: number;
  correctCount?: number;
  studentAnswers?: AnswerOption[];
  officialKey?: AnswerOption[];
  subjectScores?: SubjectScoreEntry[];
}

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function sanitizeSubjectScores(scores: unknown): SubjectScoreEntry[] {
  if (!Array.isArray(scores)) return [];
  return scores
    .map((entry: any): SubjectScoreEntry | null => {
      const subjectName = String(entry?.subjectName || '').trim().slice(0, 120);
      if (!subjectName) return null;
      const totalCount = Math.max(1, Math.min(200, Math.round(Number(entry?.totalCount) || 0)));
      const correctCount = Math.max(0, Math.min(totalCount, Math.round(Number(entry?.correctCount) || 0)));
      const subjectId = entry?.subjectId ? String(entry.subjectId).trim().slice(0, 80) : undefined;
      return { subjectId, subjectName, correctCount, totalCount };
    })
    .filter((item): item is SubjectScoreEntry => item !== null)
    .slice(0, 40);
}

function sanitizeAnswersArray(raw: unknown, totalQuestions: number): AnswerOption[] {
  const valid = new Set(['A', 'B', 'C', 'D', 'E', 'U']);
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: totalQuestions }, (_, i) => {
    const val = typeof arr[i] === 'string' ? arr[i].trim().toUpperCase() : '';
    return valid.has(val) ? (val as AnswerOption) : null;
  });
}

export class ExamRadarService {
  constructor(private readonly db: DatabaseSync) {}

  public listRadarExams(userId: string): RadarExamItem[] {
    const papers = this.db.prepare(`
      SELECT id, user_id, title, institution, exam_year, total_questions, file_id, created_at
      FROM exam_papers
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    const attempts = this.db.prepare(`
      SELECT * FROM exam_attempts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as any[];

    const byPaper = new Map<string, any[]>();
    for (const row of attempts) {
      const list = byPaper.get(row.exam_paper_id) || [];
      list.push(row);
      byPaper.set(row.exam_paper_id, list);
    }

    return papers.map((paper) => {
      const paperAttempts = byPaper.get(paper.id) || [];
      const latestRow = paperAttempts[0] || null;
      return {
        examPaperId: paper.id,
        title: paper.title,
        institution: paper.institution,
        examYear: Number(paper.exam_year) || new Date().getFullYear(),
        totalQuestions: Number(latestRow?.total_questions || paper.total_questions || 0),
        hasPdf: Boolean(paper.file_id),
        attemptsCount: paperAttempts.length,
        latestAttempt: latestRow ? this.mapAttempt(latestRow) : null,
      };
    });
  }

  public saveAttempt(userId: string, examPaperId: string, input: SaveExamAttemptInput): ExamAttemptDTO {
    const paper = this.db.prepare('SELECT * FROM exam_papers WHERE id = ? AND user_id = ?').get(examPaperId, userId) as any;
    if (!paper) {
      throw new Error('EXAM_NOT_FOUND');
    }

    const totalQuestions = clampQuestionCount(input.totalQuestions || paper.total_questions || 50);
    const studentAnswers = sanitizeAnswersArray(input.studentAnswers, totalQuestions);
    const officialKey = sanitizeAnswersArray(input.officialKey, totalQuestions);
    const subjectScores = sanitizeSubjectScores(input.subjectScores);

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

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO exam_attempts (
        id, user_id, exam_paper_id, total_questions, correct_count, wrong_count, blank_count,
        student_answers_json, official_key_json, subject_scores_json, ai_diagnosis_json, ai_analyzed_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      id,
      userId,
      examPaperId,
      totalQuestions,
      correctCount,
      wrongCount,
      blankCount,
      JSON.stringify(studentAnswers),
      JSON.stringify(officialKey),
      JSON.stringify(subjectScores),
      now,
      now
    );

    if (!paper.total_questions || Number(paper.total_questions) === 0) {
      this.db.prepare('UPDATE exam_papers SET total_questions = ?, updated_at = ? WHERE id = ?').run(totalQuestions, now, paper.id);
    }

    const saved = this.db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id) as any;
    return this.mapAttempt(saved);
  }

  public async diagnoseExam(
    userId: string,
    examPaperId: string,
    attemptId: string | undefined,
    geminiClient: any | null,
    pdfBufferProvider: (ownerUserId: string, fileId: string) => Promise<Buffer | null>
  ): Promise<ExamDiagnosisResult> {
    const paper = this.db.prepare('SELECT * FROM exam_papers WHERE id = ? AND user_id = ?').get(examPaperId, userId) as any;
    if (!paper) {
      throw new Error('EXAM_NOT_FOUND');
    }

    const attemptRow = attemptId
      ? (this.db.prepare('SELECT * FROM exam_attempts WHERE id = ? AND exam_paper_id = ? AND user_id = ?').get(attemptId, examPaperId, userId) as any)
      : (this.db.prepare('SELECT * FROM exam_attempts WHERE exam_paper_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(examPaperId, userId) as any);

    if (!attemptRow) {
      throw new Error('ATTEMPT_NOT_FOUND');
    }

    const attempt = this.mapAttempt(attemptRow);
    const graded = gradeAnswerSheet(attempt.studentAnswers, attempt.officialKey);
    const sortedSubjects = [...attempt.subjectScores].sort(
      (a, b) => (a.correctCount / a.totalCount) - (b.correctCount / b.totalCount)
    );

    let diagnosis: ExamDiagnosisResult | null = null;

    if (geminiClient) {
      try {
        const pdfBuffer = paper.file_id ? await pdfBufferProvider(paper.user_id, paper.file_id) : null;
        const dbQuestions = this.db.prepare(
          'SELECT question_number, discipline, topic, statement FROM exam_questions WHERE exam_id = ? ORDER BY question_number ASC LIMIT 120'
        ).all(paper.id) as any[];

        const parts: any[] = [];
        if (pdfBuffer && pdfBuffer.length > 0 && pdfBuffer.length <= 20 * 1024 * 1024) {
          parts.push({ inlineData: { mimeType: 'application/pdf', data: pdfBuffer.toString('base64') } });
        }

        const promptText = `Você é o Especialista Tático do concurso CFO CBMERJ.
Analise a prova real "${paper.title}" (${paper.institution}, ${paper.exam_year}) cruzando com o desempenho real do candidato:
- Total de questões: ${attempt.totalQuestions}
- Acertos: ${attempt.correctCount} | Erros: ${attempt.wrongCount} | Em branco (U): ${attempt.blankCount}
- Números exatos das questões erradas pelo cartão-resposta: ${JSON.stringify(graded.wrongQuestions)}
- Números das questões deixadas em branco/chute (U): ${JSON.stringify(graded.blankQuestions)}
- Desempenho por matéria informado pelo candidato: ${JSON.stringify(sortedSubjects)}
${dbQuestions.length > 0 ? `- Questões catalogadas no banco: ${JSON.stringify(dbQuestions.map((q) => ({ n: q.question_number, materia: q.discipline, assunto: q.topic, enunciado: String(q.statement).slice(0, 140) })))}` : ''}

Instruções obrigatórias:
1. Se o PDF da prova estiver anexado, leia as questões específicas que o candidato errou/deixou em branco para identificar exatamente o assunto cobrado em cada questão errada.
2. Nunca invente acertos ou matérias não informadas se o PDF não tiver questões correspondentes.
3. Responda EXCLUSIVAMENTE JSON válido com o formato:
{
  "summary": "visão geral objetiva do desempenho",
  "weakTopics": [{"subject": "Matéria", "topic": "Assunto cobrado", "errorPattern": "Onde o candidato mais errou", "recommendation": "O que estudar/treinar", "questionNumbers": [2, 4]}],
  "prioritySubjects": [{"subject": "Matéria", "accuracyPct": 40, "correctCount": 4, "totalCount": 10, "priority": "CRÍTICA", "reason": "Motivo claro baseado nos erros"}],
  "studyPlan": ["Passo tático 1", "Passo tático 2", "Passo tático 3"]
}`;
        parts.push({ text: promptText });

        const models = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
        for (const model of models) {
          try {
            const response = await geminiClient.models.generateContent({
              model,
              contents: parts,
              config: { responseMimeType: 'application/json', temperature: 0.15 },
            });
            const parsed = JSON.parse(String(response.text || '{}'));
            if (parsed && typeof parsed.summary === 'string') {
              diagnosis = {
                source: 'gemini',
                summary: parsed.summary,
                wrongQuestions: graded.wrongQuestions,
                blankQuestions: graded.blankQuestions,
                weakTopics: Array.isArray(parsed.weakTopics) ? parsed.weakTopics.slice(0, 12) : [],
                prioritySubjects: Array.isArray(parsed.prioritySubjects) ? parsed.prioritySubjects.slice(0, 12) : [],
                studyPlan: Array.isArray(parsed.studyPlan) ? parsed.studyPlan.slice(0, 8) : [],
                generatedAt: new Date().toISOString(),
              };
              break;
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[ExamRadar Gemini Error]:', err);
      }
    }

    if (!diagnosis) {
      diagnosis = this.buildHeuristicDiagnosis(paper.title, attempt, graded.wrongQuestions, graded.blankQuestions, sortedSubjects);
    }

    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE exam_attempts SET ai_diagnosis_json = ?, ai_analyzed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(JSON.stringify(diagnosis), now, now, attempt.id, userId);

    return diagnosis;
  }

  private buildHeuristicDiagnosis(
    paperTitle: string,
    attempt: ExamAttemptDTO,
    wrongQuestions: number[],
    blankQuestions: number[],
    sortedSubjects: SubjectScoreEntry[]
  ): ExamDiagnosisResult {
    const prioritySubjects = sortedSubjects.map((s) => {
      const pct = Number(((s.correctCount / s.totalCount) * 100).toFixed(1));
      const priority: 'CRÍTICA' | 'ALTA' | 'MÉDIA' = pct < 50 ? 'CRÍTICA' : pct < 70 ? 'ALTA' : 'MÉDIA';
      return {
        subject: s.subjectName,
        accuracyPct: pct,
        correctCount: s.correctCount,
        totalCount: s.totalCount,
        priority,
        reason: `Aproveitamento de ${pct}% (${s.correctCount}/${s.totalCount} acertos) em "${paperTitle}".`,
      };
    });

    const weakTopics = prioritySubjects
      .filter((p) => p.accuracyPct < 75)
      .slice(0, 5)
      .map((p) => ({
        subject: p.subject,
        topic: 'Reforço por desempenho abaixo da meta',
        errorPattern: `${p.totalCount - p.correctCount} erro(s) registrados nesta matéria.`,
        recommendation: `Revisar teoria base e refazer baterias focadas de ${p.subject}.`,
        questionNumbers: wrongQuestions.slice(0, 10),
      }));

    const studyPlan: string[] = [];
    if (prioritySubjects[0]) {
      studyPlan.push(`Prioridade máxima em ${prioritySubjects[0].subject} (${prioritySubjects[0].accuracyPct}% de acerto).`);
    }
    if (wrongQuestions.length > 0) {
      studyPlan.push(`Refazer com consulta comentada as questões erradas: Q${wrongQuestions.slice(0, 15).join(', Q')}.`);
    }
    if (blankQuestions.length > 0) {
      studyPlan.push(`Trabalhar velocidade e segurança nas questões deixadas em branco (U): Q${blankQuestions.slice(0, 10).join(', Q')}.`);
    }
    if (studyPlan.length === 0) {
      studyPlan.push('Registre o cartão-resposta + gabarito ou os acertos por matéria para mapear os pontos críticos.');
    }

    return {
      source: 'heuristic',
      summary: `Diagnóstico de "${paperTitle}": ${attempt.correctCount}/${attempt.totalQuestions} acertos (${attempt.accuracyPct}%).`,
      wrongQuestions,
      blankQuestions,
      weakTopics,
      prioritySubjects,
      studyPlan,
      generatedAt: new Date().toISOString(),
    };
  }

  private mapAttempt(row: any): ExamAttemptDTO {
    const totalQuestions = Number(row.total_questions) || 0;
    const correctCount = Number(row.correct_count) || 0;
    return {
      id: row.id,
      examPaperId: row.exam_paper_id,
      totalQuestions,
      correctCount,
      wrongCount: Number(row.wrong_count) || 0,
      blankCount: Number(row.blank_count) || 0,
      accuracyPct: totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 100).toFixed(1)) : 0,
      studentAnswers: parseJsonSafe<AnswerOption[]>(row.student_answers_json, []),
      officialKey: parseJsonSafe<AnswerOption[]>(row.official_key_json, []),
      subjectScores: parseJsonSafe<SubjectScoreEntry[]>(row.subject_scores_json, []),
      aiDiagnosis: parseJsonSafe<ExamDiagnosisResult | null>(row.ai_diagnosis_json, null),
      aiAnalyzedAt: row.ai_analyzed_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
