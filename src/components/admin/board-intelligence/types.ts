import { AppTheme } from '../../../types';

export interface BoardProfile {
  id: string;
  name: string;
  institution?: string;
  board?: string;
  contest?: string | null;
  roleName?: string | null;
  periodStart?: number | null;
  periodEnd?: number | null;
  description?: string | null;
  status?: string;
  activeVersion?: number;
  examCount?: number;
  questionCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BoardExam {
  id: string;
  profileId: string;
  examPaperId?: string;
  name: string;
  examYear: number;
  status: 'UPLOADED' | 'EXTRACTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'REJECTED';
  board?: string | null;
  roleName?: string | null;
  phase?: string | null;
  discipline?: string | null;
  examType?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
}

export interface BoardVersion {
  id: string;
  profileId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'DISCARDED';
  styleSummary?: string;
  confidence?: number;
  publishedAt?: string | null;
  createdAt?: string;
  changeSummaryJson?: string;
}

export interface BoardStats {
  examCount: number;
  questionCount: number;
  sampleConfidence?: number;
  dna?: {
    interpretation?: number;
    calculation?: number;
    memorization?: number;
    contextualization?: number;
    traps?: number;
    graphUsage?: number;
    longQuestions?: number;
    [key: string]: number | undefined;
  };
  styleMetrics?: {
    averageStatementWords?: number;
    averageAlternatives?: number;
    lowConfidenceCount?: number;
    sampleSize?: number;
  };
  difficulty?: Record<string, number>;
  subjectDistribution?: Record<string, number>;
  topicDistribution?: Record<string, number>;
  recentTrends?: Array<{
    label: string;
    direction: 'UP' | 'DOWN';
    deltaPercentPoints?: number;
    confidence?: number;
  }>;
}

export interface BoardOverview {
  profile: BoardProfile;
  exams: BoardExam[];
  versions: BoardVersion[];
  stats: BoardStats;
}

export interface FeedbackMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}
