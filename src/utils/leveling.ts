export const MAX_LEVELING_QUESTIONS = 300;

export function clampLevelingCount(
  value: string | number | null | undefined,
  maximum = MAX_LEVELING_QUESTIONS,
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(0, Math.trunc(parsed)), Math.max(0, maximum));
}
