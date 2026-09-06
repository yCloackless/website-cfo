import { Subject, WeeklyCycle, StudyEntry, SmartRevisionItem } from '../types';
import { DEFAULT_CFO_SUBJECTS } from '../data/cfoSubjects';
import { getMondayOfWeek, toISODate, addDays, getWeekRangeLabel } from '../utils/dateUtils';

const STORAGE_KEYS = {
  SUBJECTS: 'cfo_cbmerj_subjects_v1',
  ACTIVE_CYCLE: 'cfo_cbmerj_active_cycle_v1',
  CYCLES_HISTORY: 'cfo_cbmerj_cycles_history_v1',
  REVISIONS: 'cfo_cbmerj_revisions_v1',
  WEEKLY_GOAL: 'cfo_cbmerj_weekly_goal_hours_v1',
};

export function loadWeeklyGoalHours(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WEEKLY_GOAL);
    if (raw) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar meta semanal:', e);
  }
  return 25; // Default: 25 hours per week
}

export function saveWeeklyGoalHours(hours: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_GOAL, String(hours));
  } catch (e) {
    console.error('Erro ao salvar meta semanal:', e);
  }
}

export function loadSubjects(): Subject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure removed subjects (like 'legislacao' / 'noções de direito') are purged from existing local storage
        const filtered = parsed.filter(
          (s: Subject) =>
            s.id !== 'legislacao' &&
            !s.name?.toLowerCase().includes('legislação cbmerj') &&
            !s.name?.toLowerCase().includes('noções de direito')
        );
        if (filtered.length !== parsed.length) {
          saveSubjects(filtered);
        }
        return filtered;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar matérias:', e);
  }
  return DEFAULT_CFO_SUBJECTS;
}

export function saveSubjects(subjects: Subject[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
  } catch (e) {
    console.error('Erro ao salvar matérias:', e);
  }
}

export function resetDefaultSubjects(): Subject[] {
  saveSubjects(DEFAULT_CFO_SUBJECTS);
  return DEFAULT_CFO_SUBJECTS;
}

/**
 * Returns current week cycle. If today's Monday is after the stored cycle's Monday,
 * it archives the old cycle and initializes a fresh reset cycle for the new Monday.
 */
export function getOrCreateCurrentCycle(): { cycle: WeeklyCycle; wasReset: boolean } {
  const currentMonday = getMondayOfWeek(new Date());
  const currentMondayStr = toISODate(currentMonday);
  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentSunday.getDate() + 6);
  const currentSundayStr = toISODate(currentSunday);

  let storedCycle: WeeklyCycle | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_CYCLE);
    if (raw) {
      storedCycle = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erro ao carregar ciclo ativo:', e);
  }

  // If no cycle or stored cycle is from a past Monday (New Monday reached!)
  if (!storedCycle || storedCycle.startDate < currentMondayStr) {
    if (storedCycle) {
      archiveCycle(storedCycle);
    }

    const newCycle: WeeklyCycle = {
      id: `cycle_${currentMondayStr}`,
      startDate: currentMondayStr,
      endDate: currentSundayStr,
      label: getWeekRangeLabel(currentMonday),
      entries: {},
      updatedAt: new Date().toISOString(),
    };

    saveActiveCycle(newCycle);
    return { cycle: newCycle, wasReset: Boolean(storedCycle) };
  }

  // Purge any removed subject entries (like 'legislacao') from existing cycle
  if (storedCycle.entries) {
    let purged = false;
    const sanitizedEntries: Record<string, StudyEntry> = {};
    for (const [key, val] of Object.entries(storedCycle.entries)) {
      if (key.startsWith('legislacao_') || val.subjectId === 'legislacao') {
        purged = true;
      } else {
        sanitizedEntries[key] = val;
      }
    }
    if (purged) {
      storedCycle.entries = sanitizedEntries;
      saveActiveCycle(storedCycle);
    }
  }

  return { cycle: storedCycle, wasReset: false };
}

export function saveActiveCycle(cycle: WeeklyCycle): void {
  try {
    cycle.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CYCLE, JSON.stringify(cycle));
  } catch (e) {
    console.error('Erro ao salvar ciclo:', e);
  }
}

export function archiveCycle(cycle: WeeklyCycle): void {
  try {
    const history = getCyclesHistory();
    const existingIndex = history.findIndex((c) => c.id === cycle.id);
    if (existingIndex >= 0) {
      history[existingIndex] = cycle;
    } else {
      history.unshift(cycle);
    }
    localStorage.setItem(STORAGE_KEYS.CYCLES_HISTORY, JSON.stringify(history.slice(0, 52))); // Keep up to 1 year
  } catch (e) {
    console.error('Erro ao arquivar ciclo:', e);
  }
}

export function getCyclesHistory(): WeeklyCycle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CYCLES_HISTORY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
  }
  return [];
}

/**
 * Manually starts a fresh cycle for testing or when the user wants to restart.
 */
export function forceResetCycle(): WeeklyCycle {
  const currentMonday = getMondayOfWeek(new Date());
  const currentMondayStr = toISODate(currentMonday);
  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentSunday.getDate() + 6);
  const currentSundayStr = toISODate(currentSunday);

  const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_CYCLE);
  if (raw) {
    try {
      const old = JSON.parse(raw);
      archiveCycle(old);
    } catch (e) {
      // ignore
    }
  }

  const newCycle: WeeklyCycle = {
    id: `cycle_${currentMondayStr}_${Date.now()}`,
    startDate: currentMondayStr,
    endDate: currentSundayStr,
    label: getWeekRangeLabel(currentMonday),
    entries: {},
    updatedAt: new Date().toISOString(),
  };

  saveActiveCycle(newCycle);
  return newCycle;
}

/**
 * Revisions stored across cycles
 */
export function loadRevisions(): SmartRevisionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REVISIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let filtered = parsed.filter(
          (r: SmartRevisionItem) =>
            r.subjectId !== 'legislacao' &&
            !r.subjectName?.toLowerCase().includes('legislação cbmerj') &&
            !r.subjectName?.toLowerCase().includes('noções de direito')
        );

        // Auto-generate missing 1d (next day) revision for any entries previously registered
        const has1d = new Set(filtered.filter((r) => r.interval === '1d').map((r) => r.entryId));
        const missing1d: SmartRevisionItem[] = [];
        filtered.forEach((r) => {
          if (r.interval === '7d' && !has1d.has(r.entryId) && r.studiedDate) {
            has1d.add(r.entryId);
            missing1d.push({
              id: `rev_1d_${r.entryId}`,
              entryId: r.entryId,
              subjectId: r.subjectId,
              subjectName: r.subjectName,
              topic: r.topic,
              studiedDate: r.studiedDate,
              dueDate: addDays(r.studiedDate, 1),
              interval: '1d',
              intervalLabel: 'Próximo Dia (24h)',
              completed: false,
              calendarSynced: false,
            });
          }
        });

        if (missing1d.length > 0 || filtered.length !== parsed.length) {
          filtered = [...filtered, ...missing1d];
          saveRevisions(filtered);
        }
        return filtered;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar revisões:', e);
  }
  return [];
}

export function saveRevisions(revisions: SmartRevisionItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.REVISIONS, JSON.stringify(revisions));
  } catch (e) {
    console.error('Erro ao salvar revisões:', e);
  }
}

/**
 * Generates smart revision items for a completed study session:
 * - Próximo dia (+1d)
 * - 1 semana (+7d)
 * - De mês em mês: 1 mês (+30d), 2 meses (+60d), 3 meses (+90d)
 */
export function registerSmartRevisionsForEntry(
  entry: StudyEntry,
  subject: Subject,
  calendarResult?: { revision1dId?: string; revision7dId?: string; revision30dId?: string; revision60dId?: string; revision90dId?: string }
): void {
  const existing = loadRevisions();
  const baseTopic = entry.topic?.trim() || 'Conteúdo geral';

  const newItems: SmartRevisionItem[] = [
    {
      id: `rev_1d_${entry.id}`,
      entryId: entry.id,
      subjectId: subject.id,
      subjectName: subject.name,
      topic: baseTopic,
      studiedDate: entry.dateStr,
      dueDate: addDays(entry.dateStr, 1),
      interval: '1d',
      intervalLabel: 'Próximo Dia (24h)',
      completed: false,
      calendarSynced: Boolean(calendarResult?.revision1dId),
      calendarEventId: calendarResult?.revision1dId,
    },
    {
      id: `rev_7d_${entry.id}`,
      entryId: entry.id,
      subjectId: subject.id,
      subjectName: subject.name,
      topic: baseTopic,
      studiedDate: entry.dateStr,
      dueDate: addDays(entry.dateStr, 7),
      interval: '7d',
      intervalLabel: '1 Semana (7 dias)',
      completed: false,
      calendarSynced: Boolean(calendarResult?.revision7dId),
      calendarEventId: calendarResult?.revision7dId,
    },
    {
      id: `rev_30d_${entry.id}`,
      entryId: entry.id,
      subjectId: subject.id,
      subjectName: subject.name,
      topic: baseTopic,
      studiedDate: entry.dateStr,
      dueDate: addDays(entry.dateStr, 30),
      interval: '30d',
      intervalLabel: '1 Mês (30 dias)',
      completed: false,
      calendarSynced: Boolean(calendarResult?.revision30dId),
      calendarEventId: calendarResult?.revision30dId,
    },
    {
      id: `rev_60d_${entry.id}`,
      entryId: entry.id,
      subjectId: subject.id,
      subjectName: subject.name,
      topic: baseTopic,
      studiedDate: entry.dateStr,
      dueDate: addDays(entry.dateStr, 60),
      interval: '60d',
      intervalLabel: '2 Meses (60 dias)',
      completed: false,
      calendarSynced: Boolean(calendarResult?.revision60dId),
      calendarEventId: calendarResult?.revision60dId,
    },
    {
      id: `rev_90d_${entry.id}`,
      entryId: entry.id,
      subjectId: subject.id,
      subjectName: subject.name,
      topic: baseTopic,
      studiedDate: entry.dateStr,
      dueDate: addDays(entry.dateStr, 90),
      interval: '90d',
      intervalLabel: '3 Meses (90 dias)',
      completed: false,
      calendarSynced: Boolean(calendarResult?.revision90dId),
      calendarEventId: calendarResult?.revision90dId,
    },
  ];

  // Filter out any existing revisions for this entry
  const updated = existing.filter((r) => r.entryId !== entry.id);
  updated.push(...newItems);
  saveRevisions(updated);
}
