/**
 * CFO CBMERJ - Flashcard Importance & Priority System
 * 
 * Centralized, authoritative configuration and calculation module for
 * Content Importance vs Student Memory Difficulty.
 * 
 * Invariants:
 * - Content Importance (Baixa, Normal, Alta, Essencial) is NOT the same as Memory Difficulty.
 * - An overdue card or a card with errors MUST outrank an on-track Essential card.
 * - FSRS scheduler determines WHEN a card is due.
 * - Importance determines WHICH card has higher priority among candidates.
 * - Single source of truth: `anki_notes.importance` (cards inherit importance from their note).
 */

import { AnkiCard, CardQueue, CardType, FlashcardImportance } from './ankiTypes';

export type { FlashcardImportance };

export const VALID_IMPORTANCES: readonly FlashcardImportance[] = [
  'low',
  'normal',
  'high',
  'essential',
] as const;

export interface ImportanceConfig {
  label: string;
  priorityWeight: number;
  intervalMultiplier: number;
}

/**
 * Centralized weights and parameters.
 * Note: intervalMultiplier is set conservatively to 1.0 (disabled by default)
 * so that FSRS retention math is strictly preserved unless deliberately enabled.
 */
export const IMPORTANCE_CONFIG: Record<FlashcardImportance, ImportanceConfig> = {
  low: {
    label: 'Baixa',
    priorityWeight: 0.70,
    intervalMultiplier: 1.00, // Safe default; can be 1.15 when interval scaling is enabled
  },
  normal: {
    label: 'Normal',
    priorityWeight: 1.00,
    intervalMultiplier: 1.00,
  },
  high: {
    label: 'Alta',
    priorityWeight: 1.35,
    intervalMultiplier: 1.00, // Safe default; can be 0.90 when interval scaling is enabled
  },
  essential: {
    label: 'Essencial',
    priorityWeight: 1.70,
    intervalMultiplier: 1.00, // Safe default; can be 0.80 when interval scaling is enabled
  },
};

const IMPORTANCE_ALIASES: Record<string, FlashcardImportance> = {
  low: 'low',
  baixa: 'low',
  normal: 'normal',
  high: 'high',
  alta: 'high',
  essential: 'essential',
  essencial: 'essential',
};

/**
 * Validates if a string is a valid FlashcardImportance (canonical or localized).
 */
export function isValidImportance(val: unknown): val is FlashcardImportance {
  if (typeof val !== 'string') return false;
  const key = val.trim().toLowerCase();
  return key in IMPORTANCE_ALIASES;
}

/**
 * Normalizes any value to a valid FlashcardImportance with fallback to 'normal'.
 */
export function normalizeImportance(val: unknown, fallback: FlashcardImportance = 'normal'): FlashcardImportance {
  if (typeof val !== 'string') return fallback;
  const key = val.trim().toLowerCase();
  return IMPORTANCE_ALIASES[key] || fallback;
}

/**
 * Computes a multidimensional Review Priority score for scheduling flashcards.
 * 
 * Order of conceptual precedence:
 * 1. Cards needing review right now (Learning/Relearning due intraday, Review due/overdue);
 * 2. Overdue amount (dias de atraso);
 * 3. Error history (lapses) & user difficulty;
 * 4. User-assigned content importance (priorityWeight);
 * 5. Other FSRS stability/mastery metrics.
 * 
 * Guarantees:
 * - A non-due card (even Essential) will NEVER outrank an overdue Normal card or a card with lapses.
 * - An Essential card outranks a Normal card when other conditions are equal.
 * - High lapses significantly boost priority regardless of importance level.
 * - Low importance cards are never eliminated from study.
 */
export function calculateCardPriority(card: AnkiCard, now: Date = new Date()): number {
  const importance = normalizeImportance(card.importance);
  const { priorityWeight } = IMPORTANCE_CONFIG[importance];

  const todayEpochDays = Math.floor(now.getTime() / 86400000);
  const nowSeconds = Math.floor(now.getTime() / 1000);

  let urgencyScore = 0;

  // 1. Queue Urgency & Due Status
  if (card.queue === CardQueue.Learn || card.queue === CardQueue.Relearn) {
    // Learning / Relearning cards due right now
    const overdueSeconds = Math.max(0, nowSeconds - card.due);
    const overdueMinutes = Math.min(120, Math.floor(overdueSeconds / 60));
    // Highly urgent: intraday learning cards need quick feedback
    urgencyScore = 2000 + overdueMinutes * 5;
  } else if (card.queue === CardQueue.Review) {
    if (card.due <= todayEpochDays) {
      // Due today or overdue
      const overdueDays = Math.max(0, todayEpochDays - card.due);
      // Base review score 1000 + 75 per overdue day
      urgencyScore = 1000 + overdueDays * 75;
    } else {
      // Not due yet (future card)
      const daysUntilDue = card.due - todayEpochDays;
      // Drastically lower urgency (ranges from 50 down to 10)
      urgencyScore = Math.max(10, 100 - daysUntilDue * 15);
    }
  } else if (card.queue === CardQueue.New || card.cardType === CardType.New) {
    // New cards waiting to be learned
    urgencyScore = 400;
  } else {
    // Suspended or buried
    urgencyScore = 0;
  }

  // 2. Lapse & Error History Component
  // Each lapse indicates the student struggled to remember this content
  const lapses = Math.max(0, card.lapses || 0);
  const lapseMultiplier = 1.0 + Math.min(lapses, 10) * 0.40; // 0 lapses = 1.0; 5 lapses = 3.0; 10+ lapses = 5.0

  // 3. FSRS Difficulty Component
  // Difficulty is in [0, 10]
  const difficulty = Math.max(0, Math.min(10, card.difficulty || 0));
  const difficultyMultiplier = 1.0 + (difficulty / 10) * 0.30; // 0 = 1.0; 10 = 1.30

  // 4. Mastery / Stability Discount
  // If card has many successful reps and zero lapses, it is well mastered
  let masteryDiscount = 1.0;
  if (lapses === 0 && card.reps > 3 && card.stability > 10) {
    masteryDiscount = Math.max(0.70, 1.0 - Math.min(card.reps, 15) * 0.02);
  }

  // Combined Priority Score
  // Note: For non-due cards (card.due > todayEpochDays), importance cannot multiply them into the overdue range!
  const isFutureCard = card.queue === CardQueue.Review && card.due > todayEpochDays;
  
  if (isFutureCard) {
    // Keep future cards strictly in the low range (< 300) so they NEVER outrank overdue/due cards
    return Number((urgencyScore * priorityWeight).toFixed(2));
  }

  const finalPriority = urgencyScore * lapseMultiplier * difficultyMultiplier * masteryDiscount * priorityWeight;
  return Number(finalPriority.toFixed(2));
}

/**
 * Optionally applies importance multiplier to review intervals.
 * In this version, intervalMultiplier is 1.0 by default to keep FSRS math conservative.
 */
export function applyImportanceToInterval(
  scheduledDays: number,
  importance: FlashcardImportance,
  enableScaling: boolean = false
): number {
  if (!enableScaling || scheduledDays < 1) {
    return scheduledDays;
  }
  const config = IMPORTANCE_CONFIG[normalizeImportance(importance)];
  const scaled = Math.round(scheduledDays * config.intervalMultiplier);
  // Guarantee a minimum interval of 1 day and non-negative
  return Math.max(1, scaled);
}
