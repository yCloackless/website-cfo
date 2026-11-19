/**
 * CFO CBMERJ - Real Anki Scheduler Engine
 * 
 * Implements the official Anki FSRS (Free Spaced Repetition Scheduler v5/v6)
 * via `ts-fsrs` (with optional SM-2 fallback when `enableFSRS` is false):
 * New (0) -> Learn (1) -> Review (2) -> Relearn (3)
 * Dynamic previews: <1m, 6m, 10m, 4d
 * Full previous state snapshots for atomic Undo (Ctrl+Z)
 * Bury (-3 / -2) vs Suspend (-1)
 */

import {
  fsrs,
  generatorParameters,
  checkParameters,
  createEmptyCard,
  default_w,
  Rating as FSRSRating,
  State as FSRSState,
  Card as FSRSCard,
  FSRSHistory,
  Grade,
  RecordLogItem,
} from 'ts-fsrs';
import {
  AnkiCard,
  AnkiCardStateSnapshot,
  AnkiRevlog,
  CardQueue,
  CardType,
  DeckConfigOptions,
  DEFAULT_DECK_CONFIG,
  FSRSCardMemoryState,
  Rating,
  ScheduleIntervalPreview,
} from './ankiTypes';

export const DEFAULT_FSRS_WEIGHTS: readonly number[] = [...default_w];

export function parseFsrsWeights(
  input: unknown
): { valid: true; weights?: number[] } | { valid: false; error: string } {
  if (input === undefined || input === null) {
    return { valid: true, weights: undefined };
  }
  if (!Array.isArray(input)) {
    return { valid: false, error: 'Pesos FSRS devem ser uma lista numérica.' };
  }
  if (input.length === 0) {
    return { valid: true, weights: undefined };
  }

  const nums = input.map((v) => Number(v));
  if (nums.some((n) => !Number.isFinite(n))) {
    return { valid: false, error: 'Todos os pesos FSRS devem ser números válidos.' };
  }

  try {
    checkParameters(nums);
  } catch (err: any) {
    return {
      valid: false,
      error: err?.message || 'Quantidade ou valores de pesos FSRS inválidos (esperado 17, 19 ou 21).',
    };
  }

  return {
    valid: true,
    weights: nums.map((n) => Number(n.toFixed(6))),
  };
}

export function formatIntervalPreview(diffSeconds: number): string {
  if (diffSeconds < 60) {
    return '<1m';
  }
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(diffSeconds / 3600);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(diffSeconds / 86400);
  if (days < 30) {
    return `${days}d`;
  }
  const months = (diffSeconds / (30 * 86400)).toFixed(1);
  if (days < 365) {
    return `${months.replace('.0', '')}m`;
  }
  const years = (diffSeconds / (365 * 86400)).toFixed(1);
  return `${years.replace('.0', '')}y`;
}

function mapFSRSStateToAnki(state: FSRSState): { queue: CardQueue; cardType: CardType } {
  if (state === FSRSState.Learning) {
    return { queue: CardQueue.Learn, cardType: CardType.Learn };
  }
  if (state === FSRSState.Relearning) {
    return { queue: CardQueue.Relearn, cardType: CardType.Relearn };
  }
  if (state === FSRSState.New) {
    return { queue: CardQueue.New, cardType: CardType.New };
  }
  return { queue: CardQueue.Review, cardType: CardType.Review };
}

function encodeDueForQueue(queue: CardQueue, scheduledDue: Date): number {
  return queue === CardQueue.Learn || queue === CardQueue.Relearn
    ? Math.floor(scheduledDue.getTime() / 1000)
    : Math.floor(scheduledDue.getTime() / 86400000);
}

export class AnkiScheduler {
  private fsrsInstance: ReturnType<typeof fsrs>;
  private config: DeckConfigOptions;

  constructor(config: DeckConfigOptions = DEFAULT_DECK_CONFIG) {
    this.config = { ...DEFAULT_DECK_CONFIG, ...config };
    const parsedWeights = parseFsrsWeights(this.config.fsrsWeights);
    const params = generatorParameters({
      request_retention: this.config.desiredRetention ?? 0.9,
      maximum_interval: this.config.maximumInterval ?? 36500,
      enable_fuzz: true,
      enable_short_term: true,
      ...(parsedWeights.valid && parsedWeights.weights ? { w: parsedWeights.weights } : {}),
      learning_steps: (this.config.learningSteps && this.config.learningSteps.length > 0
        ? this.config.learningSteps.map((m) => `${m}m`)
        : ['1m', '10m']) as any,
      relearning_steps: (this.config.relearningSteps && this.config.relearningSteps.length > 0
        ? this.config.relearningSteps.map((m) => `${m}m`)
        : ['10m']) as any,
    });

    this.fsrsInstance = fsrs(params);
  }

  private isFSRSEnabled(): boolean {
    return this.config.enableFSRS !== false;
  }

  /**
   * Converts an AnkiCard to a ts-fsrs Card instance
   */
  private toFSRSCard(card: AnkiCard, now: Date): FSRSCard {
    let state: FSRSState = FSRSState.New;
    if (card.cardType === CardType.Learn) state = FSRSState.Learning;
    else if (card.cardType === CardType.Review) state = FSRSState.Review;
    else if (card.cardType === CardType.Relearn) state = FSRSState.Relearning;

    const due = card.due > 0
      ? (card.queue === CardQueue.Learn || card.queue === CardQueue.Relearn
          ? new Date(card.due * 1000)
          : new Date(card.due * 86400000))
      : now;

    return {
      due,
      stability: card.stability > 0 ? card.stability : 0,
      difficulty: card.difficulty > 0 ? card.difficulty : 0,
      elapsed_days: card.lastReviewAt
        ? Math.max(0, Math.floor((now.getTime() - new Date(card.lastReviewAt).getTime()) / 86400000))
        : 0,
      scheduled_days: card.intervalDays,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: card.learningSteps ?? 0,
      state,
      last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
    };
  }

  /**
   * SM-2 fallback used only when `config.enableFSRS === false`.
   */
  private computeNextSM2(
    card: AnkiCard,
    rating: Rating,
    now: Date
  ): {
    queue: CardQueue;
    cardType: CardType;
    due: number;
    scheduledDue: Date;
    intervalDays: number;
    easeFactor: number;
    reps: number;
    lapses: number;
    learningSteps: number;
  } {
    const learningSteps = this.config.learningSteps?.length ? this.config.learningSteps : [1, 10];
    const relearningSteps = this.config.relearningSteps?.length ? this.config.relearningSteps : [10];
    const maxInterval = Math.max(1, this.config.maximumInterval || 36500);
    const intervalModifier = this.config.intervalModifier || 1.0;
    const easyBonus = this.config.easyBonus || 1.3;
    const graduatingInterval = Math.max(1, this.config.graduatingInterval || 1);
    const easyInterval = Math.max(1, this.config.easyInterval || 4);

    let ease = card.easeFactor > 0 ? card.easeFactor : (this.config.startingEase || 2.5);
    const reps = card.reps + 1;
    let lapses = card.lapses;

    const clampDays = (days: number) => Math.max(1, Math.min(maxInterval, Math.round(days)));

    if (card.cardType === CardType.Review) {
      const ivl = Math.max(1, card.intervalDays || 1);
      if (rating === Rating.Again) {
        lapses += 1;
        ease = Math.max(1.3, Number((ease - 0.2).toFixed(2)));
        const stepMins = relearningSteps[0];
        const scheduledDue = new Date(now.getTime() + stepMins * 60000);
        return {
          queue: CardQueue.Relearn,
          cardType: CardType.Relearn,
          due: Math.floor(scheduledDue.getTime() / 1000),
          scheduledDue,
          intervalDays: clampDays(Math.max(1, ivl * 0.5)),
          easeFactor: ease,
          reps,
          lapses,
          learningSteps: 0,
        };
      }

      let days = ivl;
      if (rating === Rating.Hard) {
        ease = Math.max(1.3, Number((ease - 0.15).toFixed(2)));
        days = clampDays(Math.max(ivl + 1, ivl * 1.2 * intervalModifier));
      } else if (rating === Rating.Good) {
        days = clampDays(Math.max(ivl + 1, ivl * ease * intervalModifier));
      } else {
        ease = Number((ease + 0.15).toFixed(2));
        days = clampDays(Math.max(ivl + 2, ivl * ease * easyBonus * intervalModifier));
      }

      const scheduledDue = new Date(now.getTime() + days * 86400000);
      return {
        queue: CardQueue.Review,
        cardType: CardType.Review,
        due: Math.floor(scheduledDue.getTime() / 86400000),
        scheduledDue,
        intervalDays: days,
        easeFactor: ease,
        reps,
        lapses,
        learningSteps: 0,
      };
    }

    // New, Learn, or Relearn
    const isRelearn = card.cardType === CardType.Relearn;
    const steps = isRelearn ? relearningSteps : learningSteps;
    const currentStep = Math.max(0, Math.min(steps.length - 1, card.learningSteps ?? 0));
    const activeQueue = isRelearn ? CardQueue.Relearn : CardQueue.Learn;
    const activeType = isRelearn ? CardType.Relearn : CardType.Learn;

    if (rating === Rating.Again) {
      const scheduledDue = new Date(now.getTime() + steps[0] * 60000);
      return {
        queue: activeQueue,
        cardType: activeType,
        due: Math.floor(scheduledDue.getTime() / 1000),
        scheduledDue,
        intervalDays: card.intervalDays,
        easeFactor: ease,
        reps,
        lapses,
        learningSteps: 0,
      };
    }

    if (rating === Rating.Hard) {
      const hardMinutes =
        currentStep === 0 && steps.length > 1
          ? Math.max(1, Math.round((steps[0] + steps[1]) / 2))
          : Math.max(1, Math.round(steps[currentStep] * 1.5));
      const scheduledDue = new Date(now.getTime() + hardMinutes * 60000);
      return {
        queue: activeQueue,
        cardType: activeType,
        due: Math.floor(scheduledDue.getTime() / 1000),
        scheduledDue,
        intervalDays: card.intervalDays,
        easeFactor: ease,
        reps,
        lapses,
        learningSteps: currentStep,
      };
    }

    if (rating === Rating.Good) {
      const nextStep = currentStep + 1;
      if (nextStep < steps.length) {
        const scheduledDue = new Date(now.getTime() + steps[nextStep] * 60000);
        return {
          queue: activeQueue,
          cardType: activeType,
          due: Math.floor(scheduledDue.getTime() / 1000),
          scheduledDue,
          intervalDays: card.intervalDays,
          easeFactor: ease,
          reps,
          lapses,
          learningSteps: nextStep,
        };
      }

      const days = clampDays(
        (isRelearn ? Math.max(1, card.intervalDays) : graduatingInterval) * intervalModifier
      );
      const scheduledDue = new Date(now.getTime() + days * 86400000);
      return {
        queue: CardQueue.Review,
        cardType: CardType.Review,
        due: Math.floor(scheduledDue.getTime() / 86400000),
        scheduledDue,
        intervalDays: days,
        easeFactor: ease,
        reps,
        lapses,
        learningSteps: 0,
      };
    }

    // Easy -> graduate immediately
    const days = clampDays(
      (isRelearn ? Math.max(easyInterval, card.intervalDays + 1) : easyInterval) * intervalModifier
    );
    const scheduledDue = new Date(now.getTime() + days * 86400000);
    return {
      queue: CardQueue.Review,
      cardType: CardType.Review,
      due: Math.floor(scheduledDue.getTime() / 86400000),
      scheduledDue,
      intervalDays: days,
      easeFactor: ease,
      reps,
      lapses,
      learningSteps: 0,
    };
  }

  /**
   * Computes current FSRS memory state (Retrievability, Stability, Difficulty).
   */
  public getMemoryState(card: AnkiCard, now: Date = new Date()): FSRSCardMemoryState | null {
    if (card.cardType === CardType.New || card.stability <= 0 || !card.lastReviewAt) {
      return null;
    }

    const fsrsCard = this.toFSRSCard(card, now);
    const retrievability = this.fsrsInstance.get_retrievability(fsrsCard, now, false);
    return {
      retrievability: Number(Math.max(0, Math.min(1, retrievability)).toFixed(4)),
      stability: Number(card.stability.toFixed(2)),
      difficulty: Number(card.difficulty.toFixed(2)),
      state: card.cardType,
    };
  }

  /**
   * Calculates the 4 projected intervals for display above Again/Hard/Good/Easy buttons.
   */
  public getPreviewIntervals(card: AnkiCard, now: Date = new Date()): ScheduleIntervalPreview[] {
    const ratings = [
      { rating: Rating.Again, fsrsR: FSRSRating.Again, label: 'Again' },
      { rating: Rating.Hard, fsrsR: FSRSRating.Hard, label: 'Hard' },
      { rating: Rating.Good, fsrsR: FSRSRating.Good, label: 'Good' },
      { rating: Rating.Easy, fsrsR: FSRSRating.Easy, label: 'Easy' },
    ];

    if (!this.isFSRSEnabled()) {
      return ratings.map(({ rating, label }) => {
        const next = this.computeNextSM2(card, rating, now);
        const diffSeconds = Math.max(1, Math.floor((next.scheduledDue.getTime() - now.getTime()) / 1000));
        return {
          rating,
          label,
          intervalFormatted: formatIntervalPreview(diffSeconds),
          intervalDays: next.intervalDays,
          newQueue: next.queue,
          newDue: next.due,
        };
      });
    }

    const fsrsCard = this.toFSRSCard(card, now);
    const repeatRecord = this.fsrsInstance.repeat(fsrsCard, now);

    return ratings.map(({ rating, fsrsR, label }) => {
      const recordItem: RecordLogItem = repeatRecord[fsrsR];
      const scheduledDue = recordItem.card.due;
      const diffSeconds = Math.max(1, Math.floor((scheduledDue.getTime() - now.getTime()) / 1000));
      const intervalDays = recordItem.card.scheduled_days;
      const { queue: newQueue } = mapFSRSStateToAnki(recordItem.card.state);

      return {
        rating,
        label,
        intervalFormatted: formatIntervalPreview(diffSeconds),
        intervalDays,
        newQueue,
        newDue: encodeDueForQueue(newQueue, scheduledDue),
      };
    });
  }

  /**
   * Rates a card with 1 (Again), 2 (Hard), 3 (Good) or 4 (Easy).
   * Generates:
   * 1. Updated AnkiCard state
   * 2. AnkiRevlog entry with full previous state snapshot for instant Undo
   */
  public rateCard(
    card: AnkiCard,
    rating: Rating,
    now: Date = new Date(),
    elapsedTimeMs: number = 0
  ): { updatedCard: AnkiCard; revlog: Omit<AnkiRevlog, 'id'> } {
    // 1. Snapshot previous state for perfect rollback / Undo
    const previousState: AnkiCardStateSnapshot = {
      queue: card.queue,
      cardType: card.cardType,
      due: card.due,
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
      reps: card.reps,
      lapses: card.lapses,
      learningSteps: card.learningSteps ?? 0,
      difficulty: card.difficulty,
      stability: card.stability,
      lastReviewAt: card.lastReviewAt,
    };

    let updatedCard: AnkiCard;

    if (!this.isFSRSEnabled()) {
      const next = this.computeNextSM2(card, rating, now);
      updatedCard = {
        ...card,
        queue: next.queue,
        cardType: next.cardType,
        due: next.due,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        reps: next.reps,
        lapses: next.lapses,
        learningSteps: next.learningSteps,
        lastReviewAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    } else {
      const fsrsCard = this.toFSRSCard(card, now);
      const fsrsRating = rating as unknown as FSRSRating;
      const repeatRecord = this.fsrsInstance.repeat(fsrsCard, now);
      const nextRecord = repeatRecord[fsrsRating];
      const nextFSRSCard = nextRecord.card;

      const { queue: newQueue, cardType: newCardType } = mapFSRSStateToAnki(nextFSRSCard.state);
      const newDue = encodeDueForQueue(newQueue, nextFSRSCard.due);

      updatedCard = {
        ...card,
        queue: newQueue,
        cardType: newCardType,
        due: newDue,
        intervalDays: nextFSRSCard.scheduled_days,
        difficulty: Number(nextFSRSCard.difficulty.toFixed(4)),
        stability: Number(nextFSRSCard.stability.toFixed(4)),
        reps: nextFSRSCard.reps,
        lapses: nextFSRSCard.lapses,
        learningSteps: nextFSRSCard.learning_steps,
        lastReviewAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }

    const revlog: Omit<AnkiRevlog, 'id'> = {
      userId: card.userId,
      cardId: card.id,
      rating,
      reviewedAt: now.toISOString(),
      elapsedTimeMs,
      previousInterval: previousState.intervalDays,
      newInterval: updatedCard.intervalDays,
      previousState,
      reviewType: card.cardType === CardType.Learn || card.cardType === CardType.New ? 0 : (card.cardType === CardType.Review ? 1 : 2),
    };

    return { updatedCard, revlog };
  }

  /**
   * Recomputes a card's FSRS memory state and next due date from its review history
   * using the current scheduler configuration (desiredRetention / fsrsWeights / steps).
   */
  public rescheduleFromHistory(
    card: AnkiCard,
    revlogs: Array<{ rating: Rating; reviewedAt: string }>,
    now: Date = new Date()
  ): AnkiCard | null {
    if (!this.isFSRSEnabled() || revlogs.length === 0) {
      return null;
    }

    const sorted = [...revlogs].sort(
      (a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime()
    );
    const history: FSRSHistory[] = sorted.map((rl) => ({
      rating: rl.rating as Grade,
      review: new Date(rl.reviewedAt),
    }));

    const firstReviewAt = new Date(sorted[0].reviewedAt);
    const res = this.fsrsInstance.reschedule(createEmptyCard(firstReviewAt), history, {
      now,
      update_memory_state: false,
      skipManual: true,
    });

    const lastItem = res.collections.at(-1);
    if (!lastItem) {
      return null;
    }

    const nextFSRSCard = lastItem.card;
    const { queue: newQueue, cardType: newCardType } = mapFSRSStateToAnki(nextFSRSCard.state);
    const preserveBuriedOrSuspended =
      card.queue === CardQueue.Suspended ||
      card.queue === CardQueue.UserBuried ||
      card.queue === CardQueue.SchedBuried;

    return {
      ...card,
      queue: preserveBuriedOrSuspended ? card.queue : newQueue,
      cardType: newCardType,
      due: encodeDueForQueue(newQueue, nextFSRSCard.due),
      intervalDays: nextFSRSCard.scheduled_days,
      difficulty: Number(nextFSRSCard.difficulty.toFixed(4)),
      stability: Number(nextFSRSCard.stability.toFixed(4)),
      reps: nextFSRSCard.reps,
      lapses: nextFSRSCard.lapses,
      learningSteps: nextFSRSCard.learning_steps,
      lastReviewAt: nextFSRSCard.last_review ? nextFSRSCard.last_review.toISOString() : card.lastReviewAt,
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Reverts a card to its exact snapshot state recorded in the revlog.
   */
  public undoReview(card: AnkiCard, previousState: AnkiCardStateSnapshot): AnkiCard {
    return {
      ...card,
      queue: previousState.queue,
      cardType: previousState.cardType,
      due: previousState.due,
      intervalDays: previousState.intervalDays,
      easeFactor: previousState.easeFactor,
      reps: previousState.reps,
      lapses: previousState.lapses,
      learningSteps: previousState.learningSteps ?? 0,
      difficulty: previousState.difficulty,
      stability: previousState.stability,
      lastReviewAt: previousState.lastReviewAt,
      updatedAt: new Date().toISOString(),
    };
  }
}
