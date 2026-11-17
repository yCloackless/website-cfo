export interface Subject {
  id: string;
  name: string;
  category: string;
  color: string; // Tailwind color class or hex
  isCustom?: boolean;
}

export type StudyEntryType = 'studied' | 'reviewing';

export interface StudyEntry {
  id: string;
  subjectId: string;
  dayIndex: number; // 0: Segunda, 1: Terça, ..., 6: Domingo
  dateStr: string; // YYYY-MM-DD
  completed: boolean;
  completedAt?: string;
  entryType?: StudyEntryType; // 'studied' = Estudado no dia (Azul), 'reviewing' = Revisando (Verde)
  topic?: string;
  durationMinutes?: number;
  notes?: string;
  googleCalendarSynced?: boolean;
  calendarEventId?: string;
  calendarRevision1dId?: string;
  calendarRevision7dId?: string;
  calendarRevision30dId?: string;
  calendarRevision60dId?: string;
  calendarRevision90dId?: string;
  revisionScheduled?: boolean;
}

export interface WeeklyCycle {
  id: string; // e.g. "cycle_2026-08-31"
  weekNumber?: number;
  startDate: string; // YYYY-MM-DD (Monday)
  endDate: string; // YYYY-MM-DD (Sunday)
  label: string; // e.g. "Semana 31/08 a 06/09"
  entries: Record<string, StudyEntry>; // key: `${subjectId}_${dayIndex}`
  updatedAt: string;
}

export type RevisionInterval = '1d' | '7d' | '30d' | '60d' | '90d';

export interface SmartRevisionItem {
  id: string;
  entryId: string;
  subjectId: string;
  subjectName: string;
  topic: string;
  studiedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  interval: RevisionInterval;
  intervalLabel: string;
  completed: boolean;
  completedAt?: string;
  calendarSynced: boolean;
  calendarEventId?: string;
}

export interface CalendarSyncResult {
  success: boolean;
  eventId?: string;
  revisionsCreated?: number;
  error?: string;
}

export type AppTheme = 'dark' | 'light';

export interface AIAnalysisResult {
  topStudiedSubject: {
    name: string;
    hours: number;
    sessions: number;
    analysis: string;
    status: string;
  };
  prioritySubjectsForNextWeek: {
    name: string;
    reason: string;
    recommendedHours: number;
    urgency: 'alta' | 'media' | 'baixa' | string;
    topicsSuggested: string[];
  }[];
  balanceDiagnosis: string;
  weeklyActionPlan: {
    day: string;
    focusSubject: string;
    goal: string;
    suggestedMinutes: number;
  }[];
  tacticalTip: string;
  equilibriumScore: number;
}

export interface BizuItem {
  id: string;
  title: string;
  subjectName: string;
  category?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageAlt?: string;
  /** Título expandido / Enunciado da questão exibido ao abrir o tópico */
  statement?: string;
  notes?: string;
  /** Text written by the student stays plain; AI notes may keep structure. */
  notesMode?: 'plain' | 'ai';
  keyPoints?: string[];
  tags: string[];
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RevisionCycleKey =
  | 'semana'
  | 'mes1'
  | 'mes2'
  | 'mes3'
  | 'mes4'
  | 'mes5'
  | 'mes6'
  | 'mes7'
  | 'mes8'
  | 'mes9'
  | 'mes10';

export const NOTION_CYCLE_ORDER: RevisionCycleKey[] = [
  'semana',
  'mes1',
  'mes2',
  'mes3',
  'mes4',
  'mes5',
  'mes6',
  'mes7',
  'mes8',
  'mes9',
  'mes10',
];

export const NOTION_CYCLE_LABELS: Record<RevisionCycleKey, string> = {
  semana: 'Semana',
  mes1: 'Mês 1',
  mes2: 'Mês 2',
  mes3: 'Mês 3',
  mes4: 'Mês 4',
  mes5: 'Mês 5',
  mes6: 'Mês 6',
  mes7: 'Mês 7',
  mes8: 'Mês 8',
  mes9: 'Mês 9',
  mes10: 'Mês 10',
};

export interface NotionRevisionItem {
  id: string;
  assunto: string;
  materia: string;
  data: string; // YYYY-MM-DD
  tipoRevisao: string[]; // ex: ['Questões', 'LDI', 'Apostila', 'Qcon']
  proximaRevisao?: string; // YYYY-MM-DD
  semana: boolean; // 7 dias
  mes1: boolean; // 30 dias
  mes2: boolean; // 60 dias
  mes3: boolean; // 90 dias
  mes4?: boolean;
  mes5?: boolean;
  mes6?: boolean;
  mes7?: boolean;
  mes8?: boolean;
  mes9?: boolean;
  mes10?: boolean;
  url?: string;
  updatedAt?: string;
}

export interface MonthlyStudySessionDay {
  dateStr: string;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    durationSeconds: number;
  }>;
}

export type BalanceTier = 'neutral' | 'critical' | 'attention' | 'balanced';

export interface SubjectMonthlyBalance {
  subjectId: string;
  name: string;
  category: string;
  originalColor: string;
  minutes: number;
  hours: number;
  sessions: number;
  sharePct: number;
  ratioToAvg: number;
  tier: BalanceTier;
  statusLabel: string;
  accentColor: string;
}

export interface MonthlyStudySummary {
  yearMonth: string;
  totalSessions: number;
  totalMinutes: number;
  totalHours: number;
  equilibriumScore: number;
  subjectsStudied: {
    id: string;
    name: string;
    category: string;
    color: string;
    sessions: number;
    minutes: number;
    topics: string[];
  }[];
  subjectsNotStudied: {
    id: string;
    name: string;
    category: string;
    color: string;
  }[];
  allSubjects: {
    id: string;
    name: string;
    category: string;
  }[];
  bySubject: Record<string, SubjectMonthlyBalance>;
}

export interface NotionCalendarEvent {
  id: string;
  notionId: string;
  title: string;
  materia: string;
  tipo: 'estudo' | 'revisao_24h' | 'revisao_7d' | 'revisao_30d' | 'revisao_60d' | 'revisao_90d' | 'proxima';
  cycleKey?: RevisionCycleKey;
  dateStr: string; // YYYY-MM-DD
  isCompleted: boolean;
  tipoRevisao: string[];
}

export interface MilitaryRankDef {
  id: string;
  order: number;
  name: string;
  shortName: string;
  badgeColor: string;
  minEffectiveHours: number;
  minStreakDays: number;
  targetDailyHours: number;
}

export interface ShieldSaveEvent {
  savedStreakDays: number;
  missedDates: string[];
  remainingShields: number;
  activatedAt: string;
}

export interface NextRankProgress {
  id: string;
  name: string;
  targetDailyHours: number;
  minStreakDays: number;
  daysRemaining: number;
  hoursDeficitPerDay: number;
}

export interface GamificationStatus {
  currentStreakDays: number;
  bestStreakDays: number;
  iceShields: number;
  maxIceShields: number;
  nextShieldInDays: number;
  studiedTodaySeconds: number;
  qualifiedToday: boolean;
  avgDailyHours14d: number;
  effectiveDailyPaceHours: number;
  consistencyFactor: number;
  rank: MilitaryRankDef;
  nextRank: NextRankProgress | null;
  pendingShieldEvent: ShieldSaveEvent | null;
  todayStr: string;
}

