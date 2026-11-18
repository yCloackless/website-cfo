export type MillionDifficultyBlock = 1 | 2 | 3 | 4;
export type MillionHelpType = 'cards' | 'skip' | 'universitarios';
export type MillionMatchStatus = 'IN_PROGRESS' | 'WON' | 'LOST' | 'STOPPED';

export interface PrizeStep {
  level: number;
  block: MillionDifficultyBlock;
  blockLabel: string;
  winPrize: number;
  stopPrize: number;
  wrongPrize: number;
}

export const PRIZE_LADDER: ReadonlyArray<PrizeStep> = [
  { level: 1, block: 1, blockLabel: 'Bloco 1 · Aquecimento', winPrize: 1_000, stopPrize: 0, wrongPrize: 0 },
  { level: 2, block: 1, blockLabel: 'Bloco 1 · Aquecimento', winPrize: 2_000, stopPrize: 1_000, wrongPrize: 500 },
  { level: 3, block: 1, blockLabel: 'Bloco 1 · Aquecimento', winPrize: 3_000, stopPrize: 2_000, wrongPrize: 1_000 },
  { level: 4, block: 1, blockLabel: 'Bloco 1 · Aquecimento', winPrize: 4_000, stopPrize: 3_000, wrongPrize: 1_500 },
  { level: 5, block: 1, blockLabel: 'Bloco 1 · Aquecimento', winPrize: 5_000, stopPrize: 4_000, wrongPrize: 2_000 },
  { level: 6, block: 2, blockLabel: 'Bloco 2 · Intermediário UERJ/CFO', winPrize: 10_000, stopPrize: 5_000, wrongPrize: 2_500 },
  { level: 7, block: 2, blockLabel: 'Bloco 2 · Intermediário UERJ/CFO', winPrize: 20_000, stopPrize: 10_000, wrongPrize: 5_000 },
  { level: 8, block: 2, blockLabel: 'Bloco 2 · Intermediário UERJ/CFO', winPrize: 30_000, stopPrize: 20_000, wrongPrize: 10_000 },
  { level: 9, block: 2, blockLabel: 'Bloco 2 · Intermediário UERJ/CFO', winPrize: 40_000, stopPrize: 30_000, wrongPrize: 15_000 },
  { level: 10, block: 2, blockLabel: 'Bloco 2 · Intermediário UERJ/CFO', winPrize: 50_000, stopPrize: 40_000, wrongPrize: 20_000 },
  { level: 11, block: 3, blockLabel: 'Bloco 3 · Avançado CFO', winPrize: 100_000, stopPrize: 50_000, wrongPrize: 25_000 },
  { level: 12, block: 3, blockLabel: 'Bloco 3 · Avançado CFO', winPrize: 200_000, stopPrize: 100_000, wrongPrize: 50_000 },
  { level: 13, block: 3, blockLabel: 'Bloco 3 · Avançado CFO', winPrize: 300_000, stopPrize: 200_000, wrongPrize: 100_000 },
  { level: 14, block: 3, blockLabel: 'Bloco 3 · Avançado CFO', winPrize: 400_000, stopPrize: 300_000, wrongPrize: 150_000 },
  { level: 15, block: 3, blockLabel: 'Bloco 3 · Avançado CFO', winPrize: 500_000, stopPrize: 400_000, wrongPrize: 200_000 },
  { level: 16, block: 4, blockLabel: 'Bloco 4 · Pergunta do Milhão', winPrize: 1_000_000, stopPrize: 500_000, wrongPrize: 0 },
];

export interface UniversitariosHint {
  votes: [number, number, number, number];
  summary: string;
}

export interface SanitizedMillionQuestion {
  id: string;
  level: number;
  block: MillionDifficultyBlock;
  blockLabel: string;
  statement: string;
  options: [string, string, string, string];
  discipline: string;
  eliminatedIndices: number[];
  universitariosHint: UniversitariosHint | null;
}

export interface SanitizedActiveMatch {
  id: string;
  topic: string;
  focusHint: string;
  status: MillionMatchStatus;
  currentLevel: number;
  earnedPrize: number;
  prizeInfo: PrizeStep;
  helps: {
    cardsAvailable: boolean;
    universitariosAvailable: boolean;
    skipsRemainingTotal: number;
    skipAvailableInCurrentBlock: boolean;
    disabledAtMillion: boolean;
  };
  currentQuestion: SanitizedMillionQuestion;
  createdAt: string;
}

export interface MillionHistoryEntry {
  id: string;
  topic: string;
  status: Exclude<MillionMatchStatus, 'IN_PROGRESS'>;
  earnedPrize: number;
  reachedLevel: number;
  correctCount: number;
  finishedAt: string;
}

export interface MillionStateResponse {
  activeMatch: SanitizedActiveMatch | null;
  stats: {
    bestPrize: number;
    totalMatches: number;
    wins: number;
  };
  history: MillionHistoryEntry[];
}

export interface AnswerResult {
  isCorrect: boolean;
  correctIndex: number;
  explanation: string;
  referenceTip: string;
  status: MillionMatchStatus;
  earnedPrize: number;
  nextQuestion: SanitizedMillionQuestion | null;
  prizeInfo: PrizeStep | null;
  helps: SanitizedActiveMatch['helps'] | null;
}

export interface StopResult {
  status: 'STOPPED';
  earnedPrize: number;
  correctIndex: number;
  explanation: string;
  referenceTip: string;
}
