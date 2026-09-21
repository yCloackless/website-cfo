/**
 * CFO CBMERJ - Real Anki Engine Types & Contracts
 * 
 * Based on the official Open-Source Anki architecture (ankitects/anki - AGPL-3.0-or-later)
 * Models Notes, NoteTypes, Fields, CardTemplates, Cards, Decks, Revlog, Media and FSRS.
 */

export enum CardQueue {
  UserBuried = -3,
  SchedBuried = -2,
  Suspended = -1,
  New = 0,
  Learn = 1,
  Review = 2,
  Relearn = 3,
}

export enum CardType {
  New = 0,
  Learn = 1,
  Review = 2,
  Relearn = 3,
}

export enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum CardFlag {
  None = 0,
  Red = 1,
  Orange = 2,
  Green = 3,
  Blue = 4,
  Pink = 5,
  Turquoise = 6,
  Purple = 7,
}

export type NoteTypeKind = 'standard' | 'cloze';

export interface AnkiDeckConfig {
  id: string;
  userId: string;
  name: string;
  config: DeckConfigOptions;
  createdAt: string;
  updatedAt: string;
}

export interface DeckConfigOptions {
  newPerDay: number;
  maxReviewsPerDay: number;
  learningSteps: number[]; // in minutes, e.g. [1, 10]
  relearningSteps: number[]; // in minutes, e.g. [10]
  graduatingInterval: number; // in days, e.g. 1
  easyInterval: number; // in days, e.g. 4
  startingEase: number; // e.g. 2.5
  easyBonus: number; // e.g. 1.3
  intervalModifier: number; // e.g. 1.0
  maximumInterval: number; // e.g. 36500 days
  buryNewSiblings: boolean;
  buryReviewSiblings: boolean;
  enableFSRS: boolean;
  desiredRetention: number; // e.g. 0.90 (90%)
  fsrsWeights?: number[]; // FSRS v5 19 parameters
}

export const DEFAULT_DECK_CONFIG: DeckConfigOptions = {
  newPerDay: 20,
  maxReviewsPerDay: 200,
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maximumInterval: 36500,
  buryNewSiblings: true,
  buryReviewSiblings: true,
  enableFSRS: true,
  desiredRetention: 0.90,
};

export interface AnkiDeck {
  id: string;
  userId: string;
  name: string; // Hierarchical, e.g. "Matemática::Álgebra::Logaritmos" or simple name "Canudos"
  parentDeckId?: string | null;
  description?: string | null;
  configId?: string | null;
  isCollapsed: boolean;
  depth?: number; // 1 to 5 (1 = root deck)
  createdAt: string;
  updatedAt: string;
  // Computed statistics
  newCount?: number;
  learnCount?: number;
  reviewCount?: number;
  totalCards?: number;
  subdecks?: AnkiDeck[];
}

export interface AnkiNoteType {
  id: string;
  userId: string;
  name: string;
  kind: NoteTypeKind;
  css: string;
  isSystem: boolean;
  fields: AnkiField[];
  templates: AnkiCardTemplate[];
  createdAt: string;
  updatedAt: string;
}

export interface AnkiField {
  id: string;
  userId: string;
  notetypeId: string;
  name: string;
  ordinal: number;
  fontSize?: number;
  fontName?: string;
  createdAt: string;
}

export interface AnkiCardTemplate {
  id: string;
  userId: string;
  notetypeId: string;
  name: string;
  ordinal: number;
  qfmt: string; // Question format HTML / Mustache
  afmt: string; // Answer format HTML / Mustache
  bqfmt?: string | null;
  bafmt?: string | null;
  createdAt: string;
}

export interface AnkiNote {
  id: string;
  userId: string;
  notetypeId: string;
  guid: string;
  fields: string[]; // Values in field ordinal order
  tags: string[]; // Parsed tag array
  createdAt: string;
  updatedAt: string;
  notetype?: AnkiNoteType;
  cards?: AnkiCard[];
}

export interface AnkiCard {
  id: string;
  userId: string;
  noteId: string;
  deckId: string;
  templateOrd: number;
  queue: CardQueue;
  cardType: CardType;
  due: number; // Day number (relative to epoch) for review, unix timestamp in seconds for learn, ord for new
  intervalDays: number;
  easeFactor: number;
  reps: number;
  lapses: number;
  difficulty: number; // FSRS difficulty (D)
  stability: number; // FSRS stability (S)
  lastReviewAt?: string | null;
  flags: CardFlag;
  isMarked: boolean;
  createdAt: string;
  updatedAt: string;
  // Hydrated references
  note?: AnkiNote;
  deck?: AnkiDeck;
}

export interface AnkiRevlog {
  id: string;
  userId: string;
  cardId: string;
  rating: Rating;
  reviewedAt: string;
  elapsedTimeMs: number;
  previousInterval: number;
  newInterval: number;
  previousState: AnkiCardStateSnapshot;
  reviewType: number; // 0=learn, 1=review, 2=relearn, 3=filtered
}

export interface AnkiCardStateSnapshot {
  queue: CardQueue;
  cardType: CardType;
  due: number;
  intervalDays: number;
  easeFactor: number;
  reps: number;
  lapses: number;
  difficulty: number;
  stability: number;
  lastReviewAt?: string | null;
}

export interface ScheduleIntervalPreview {
  rating: Rating;
  label: string; // "Again", "Hard", "Good", "Easy"
  intervalFormatted: string; // "<1m", "6m", "10m", "4d", "1.2m"
  intervalDays: number;
  newQueue: CardQueue;
  newDue: number;
}

export interface RenderedCardContent {
  questionHtml: string;
  answerHtml: string;
  css: string;
  cardOrd: number;
  tags: string[];
}

export interface AnkiMedia {
  id: string;
  userId: string;
  filename: string;
  hash: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  createdAt: string;
}

export interface AnkiBrowserQuery {
  search?: string;
  deckId?: string;
  tag?: string;
  cardType?: CardType;
  queue?: CardQueue;
  flag?: CardFlag;
  isMarked?: boolean;
  limit?: number;
  offset?: number;
  sortField?: 'due' | 'created' | 'interval' | 'reps' | 'lapses' | 'deck' | 'note';
  sortOrder?: 'asc' | 'desc';
}

export interface AnkiStatsSummary {
  totalCards: number;
  newCards: number;
  learnCards: number;
  reviewCards: number;
  relearnCards: number;
  suspendedCards: number;
  buriedCards: number;
  matureCards: number; // interval >= 21 days
  youngCards: number; // interval < 21 days
  reviewsToday: number;
  timeSpentTodayMinutes: number;
  retentionRatePercent: number;
  againPercent: number;
  hardPercent: number;
  goodPercent: number;
  easyPercent: number;
  futureWorkload: Array<{ dayOffset: number; date: string; dueCount: number }>;
  intervalDistribution: Array<{ intervalRange: string; count: number }>;
  studyHeatmap: Array<{ date: string; count: number }>;
}
