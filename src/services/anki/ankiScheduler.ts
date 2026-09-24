/**
 * CFO CBMERJ - Real Anki Scheduler Engine
 * 
 * Implements the official Anki FSRS (Free Spaced Repetition Scheduler) v5 algorithm
 * via `ts-fsrs` with exact state machine transitions:
 * New (0) -> Learn (1) -> Review (2) -> Relearn (3)
 * Dynamic previews: <1m, 6m, 10m, 4d
 * Full previous state snapshots for atomic Undo (Ctrl+Z)
 * Bury (-3 / -2) vs Suspend (-1)
 */

import {
  fsrs,
  generatorParameters,
  Rating as FSRSRating,
  State as FSRSState,
  Card as FSRSCard,
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
  Rating,
  ScheduleIntervalPreview,
} from './ankiTypes';

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

export class AnkiScheduler {
  private fsrsInstance: ReturnType<typeof fsrs>;
  private config: DeckConfigOptions;

  constructor(config: DeckConfigOptions = DEFAULT_DECK_CONFIG) {
    this.config = config;
    const params = generatorParameters({
      request_retention: config.desiredRetention ?? 0.9,
      maximum_interval: config.maximumInterval ?? 36500,
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: (config.learningSteps && config.learningSteps.length > 0 
        ? config.learningSteps.map(m => `${m}m`)
        : ['1m', '10m']) as any,
      relearning_steps: (config.relearningSteps && config.relearningSteps.length > 0
        ? config.relearningSteps.map(m => `${m}m`)
        : ['10m']) as any,
    });

    this.fsrsInstance = fsrs(params);
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
      elapsed_days: card.lastReviewAt ? Math.max(0, Math.floor((now.getTime() - new Date(card.lastReviewAt).getTime()) / 86400000)) : 0,
      scheduled_days: card.intervalDays,
      reps: card.reps,
      lapses: card.lapses,
      learning_steps: 0,
      state,
      last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
    };
  }

  /**
   * Calculates the 4 projected intervals for display above Again/Hard/Good/Easy buttons.
   */
  public getPreviewIntervals(card: AnkiCard, now: Date = new Date()): ScheduleIntervalPreview[] {
    const fsrsCard = this.toFSRSCard(card, now);
    const repeatRecord = this.fsrsInstance.repeat(fsrsCard, now);

    const ratings = [
      { rating: Rating.Again, fsrsR: FSRSRating.Again, label: 'Again' },
      { rating: Rating.Hard, fsrsR: FSRSRating.Hard, label: 'Hard' },
      { rating: Rating.Good, fsrsR: FSRSRating.Good, label: 'Good' },
      { rating: Rating.Easy, fsrsR: FSRSRating.Easy, label: 'Easy' },
    ];

    return ratings.map(({ rating, fsrsR, label }) => {
      const recordItem: RecordLogItem = repeatRecord[fsrsR];
      const scheduledDue = recordItem.card.due;
      const diffSeconds = Math.max(1, Math.floor((scheduledDue.getTime() - now.getTime()) / 1000));
      const intervalDays = recordItem.card.scheduled_days;

      let newQueue = CardQueue.Review;
      if (recordItem.card.state === FSRSState.Learning) newQueue = CardQueue.Learn;
      else if (recordItem.card.state === FSRSState.Relearning) newQueue = CardQueue.Relearn;

      const newDue = (newQueue === CardQueue.Learn || newQueue === CardQueue.Relearn)
        ? Math.floor(scheduledDue.getTime() / 1000)
        : Math.floor(scheduledDue.getTime() / 86400000);

      return {
        rating,
        label,
        intervalFormatted: formatIntervalPreview(diffSeconds),
        intervalDays,
        newQueue,
        newDue,
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
      difficulty: card.difficulty,
      stability: card.stability,
      lastReviewAt: card.lastReviewAt,
    };

    const fsrsCard = this.toFSRSCard(card, now);
    const fsrsRating = rating as unknown as FSRSRating;
    const repeatRecord = this.fsrsInstance.repeat(fsrsCard, now);
    const nextRecord = repeatRecord[fsrsRating];
    const nextFSRSCard = nextRecord.card;

    let newQueue = CardQueue.Review;
    let newCardType = CardType.Review;

    if (nextFSRSCard.state === FSRSState.Learning) {
      newQueue = CardQueue.Learn;
      newCardType = CardType.Learn;
    } else if (nextFSRSCard.state === FSRSState.Relearning) {
      newQueue = CardQueue.Relearn;
      newCardType = CardType.Relearn;
    }

    const scheduledDue = nextFSRSCard.due;
    const newDue = (newQueue === CardQueue.Learn || newQueue === CardQueue.Relearn)
      ? Math.floor(scheduledDue.getTime() / 1000)
      : Math.floor(scheduledDue.getTime() / 86400000);

    const updatedCard: AnkiCard = {
      ...card,
      queue: newQueue,
      cardType: newCardType,
      due: newDue,
      intervalDays: nextFSRSCard.scheduled_days,
      difficulty: Number(nextFSRSCard.difficulty.toFixed(4)),
      stability: Number(nextFSRSCard.stability.toFixed(4)),
      reps: nextFSRSCard.reps,
      lapses: nextFSRSCard.lapses,
      lastReviewAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const revlog: Omit<AnkiRevlog, 'id'> = {
      userId: card.userId,
      cardId: card.id,
      rating,
      reviewedAt: now.toISOString(),
      elapsedTimeMs,
      previousInterval: previousState.intervalDays,
      newInterval: updatedCard.intervalDays,
      previousState,
      reviewType: card.cardType === CardType.Learn ? 0 : (card.cardType === CardType.Review ? 1 : 2),
    };

    return { updatedCard, revlog };
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
      difficulty: previousState.difficulty,
      stability: previousState.stability,
      lastReviewAt: previousState.lastReviewAt,
      updatedAt: new Date().toISOString(),
    };
  }
}
