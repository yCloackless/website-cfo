export type StudyPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PriorityInput {
  currentAverage: number;
  targetGrade?: number | null;
  daysUntilExam?: number | null;
  examWeight?: number;
  difficulty?: number;
  historicalAverage?: number | null;
  vestibularWeight?: number;
}

export function calculatePriorityScore(input: PriorityInput): number {
  const average = Math.max(0, Math.min(10, Number(input.currentAverage) || 0));
  const target = input.targetGrade == null ? 7 : Math.max(0, Math.min(10, Number(input.targetGrade) || 0));
  const gradeGap = Math.max(0, target - average);
  const days = input.daysUntilExam == null ? 45 : Math.max(0, Number(input.daysUntilExam));
  const urgency = days <= 3 ? 30 : days <= 7 ? 25 : days <= 14 ? 18 : days <= 30 ? 10 : 3;
  const historicalGap = input.historicalAverage == null ? 0 : Math.max(0, Number(input.historicalAverage) - average) * 2;
  const score = gradeGap * 8 + urgency + Math.min(10, Math.max(0, Number(input.examWeight) || 1) * 3) + Math.min(10, Math.max(0, Number(input.difficulty) || 0)) + Math.min(10, Math.max(0, Number(input.vestibularWeight) || 0)) + historicalGap;
  return Math.round(Math.min(100, score));
}

export function classifyPriority(score: number): StudyPriority {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export function weightedAverage(grades: Array<{ score: number; weight?: number }>): number | null {
  if (!grades.length) return null;
  const totalWeight = grades.reduce((sum, grade) => sum + Math.max(0.01, Number(grade.weight) || 1), 0);
  const total = grades.reduce((sum, grade) => sum + Number(grade.score) * Math.max(0.01, Number(grade.weight) || 1), 0);
  return Number((total / totalWeight).toFixed(2));
}

export function priorityDemo(): void {
  const urgent = calculatePriorityScore({ currentAverage: 4, targetGrade: 8, daysUntilExam: 3, examWeight: 2, difficulty: 8 });
  const relaxed = calculatePriorityScore({ currentAverage: 9, targetGrade: 8, daysUntilExam: 45 });
  if (classifyPriority(urgent) !== 'critical' || classifyPriority(relaxed) === 'critical') throw new Error('priority engine regression');
}

if (typeof process !== 'undefined' && process.argv[1]?.endsWith('studentStudyPriority.ts')) priorityDemo();
