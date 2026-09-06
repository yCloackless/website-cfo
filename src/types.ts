export interface Subject {
  id: string;
  name: string;
  category: string;
  color: string; // Tailwind color class or hex
  isCustom?: boolean;
}

export interface StudyEntry {
  id: string;
  subjectId: string;
  dayIndex: number; // 0: Segunda, 1: Terça, ..., 6: Domingo
  dateStr: string; // YYYY-MM-DD
  completed: boolean;
  completedAt?: string;
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
  imageAlt?: string;
  notes?: string;
  keyPoints?: string[];
  tags: string[];
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

