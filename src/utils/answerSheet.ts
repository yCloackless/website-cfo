export type AnswerOption = 'A' | 'B' | 'C' | 'D' | 'E' | 'U' | null;

export interface SubjectScoreEntry {
  subjectId?: string;
  subjectName: string;
  correctCount: number;
  totalCount: number;
}

export interface GradedSheetResult {
  totalQuestions: number;
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  wrongQuestions: number[];
  blankQuestions: number[];
  accuracyPct: number;
}

const VALID_LETTERS = new Set(['A', 'B', 'C', 'D', 'E', 'U']);

export function clampQuestionCount(totalQuestions: number): number {
  const n = Math.round(Number(totalQuestions) || 0);
  return Math.max(1, Math.min(200, n));
}

export function parseAnswerTokens(
  input: string,
  totalQuestions: number,
  allowU = true
): AnswerOption[] {
  const limit = clampQuestionCount(totalQuestions);
  const rawTokens = String(input || '')
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);

  const result: AnswerOption[] = new Array(limit).fill(null);

  for (let i = 0; i < Math.min(rawTokens.length, limit); i += 1) {
    // Suporta prefixos opcionais como "1)a", "2.b", "03:C"
    const cleaned = rawTokens[i]
      .replace(/^\d+[).:\-/\s]*/, '')
      .replace(/[^a-zA-Z?\-_]/g, '')
      .toUpperCase();

    if (cleaned === '?' || cleaned === '-' || cleaned === '_') {
      result[i] = allowU ? 'U' : null;
      continue;
    }

    if (cleaned.length === 1 && VALID_LETTERS.has(cleaned)) {
      if (cleaned === 'U' && !allowU) {
        result[i] = null;
      } else {
        result[i] = cleaned as AnswerOption;
      }
    } else {
      result[i] = null;
    }
  }

  return result;
}

export function formatAnswerTokens(answers: AnswerOption[]): string {
  return answers.map((opt) => (opt ? opt : '-')).join(' ');
}

export function gradeAnswerSheet(
  studentAnswers: AnswerOption[],
  officialKey: AnswerOption[]
): GradedSheetResult {
  const totalQuestions = Math.max(studentAnswers.length, officialKey.length);
  let totalAnswered = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  const wrongQuestions: number[] = [];
  const blankQuestions: number[] = [];

  for (let i = 0; i < totalQuestions; i += 1) {
    const key = officialKey[i] ?? null;
    const student = studentAnswers[i] ?? null;

    if (!key || key === 'U') {
      if (student && student !== 'U') totalAnswered += 1;
      continue;
    }

    if (!student || student === 'U') {
      blankCount += 1;
      blankQuestions.push(i + 1);
      continue;
    }

    totalAnswered += 1;
    if (student === key) {
      correctCount += 1;
    } else {
      wrongCount += 1;
      wrongQuestions.push(i + 1);
    }
  }

  const keyTotal = officialKey.filter((k) => k && k !== 'U').length || totalQuestions;
  const accuracyPct = keyTotal > 0 ? Number(((correctCount / keyTotal) * 100).toFixed(1)) : 0;

  return {
    totalQuestions,
    totalAnswered,
    correctCount,
    wrongCount,
    blankCount,
    wrongQuestions,
    blankQuestions,
    accuracyPct,
  };
}
