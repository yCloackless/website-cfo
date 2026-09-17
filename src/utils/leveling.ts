export const MAX_LEVELING_QUESTIONS = 300;

export function clampLevelingCount(
  value: string | number | null | undefined,
  maximum = MAX_LEVELING_QUESTIONS,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(0, Math.trunc(parsed)), Math.max(0, maximum));
}

export function calculateLevelingAccuracy(correct: number, answered: number): number {
  if (answered <= 0) return 0;
  return Math.round((clampLevelingCount(correct, answered) / answered) * 100);
}

export function requiredLevelingCorrect(total: number, goalPercent = 80): number {
  if (total <= 0) return 0;
  return Math.ceil(total * (goalPercent / 100));
}

export function hasPassedLeveling(correct: number, total: number, goalPercent = 80): boolean {
  if (total <= 0) return false;
  const safeCorrect = clampLevelingCount(correct, total);
  return safeCorrect >= requiredLevelingCorrect(total, goalPercent) && safeCorrect > total - safeCorrect;
}
