import {
  NOTION_CYCLE_LABELS,
  NOTION_CYCLE_ORDER,
  NotionRevisionItem,
  RevisionCycleKey,
} from '../types';
import { getCurrentYearMonthAndToday } from './studyBalance';

export interface PendingNotionTopic {
  item: NotionRevisionItem;
  pendingCycleKey: RevisionCycleKey;
  pendingCycleLabel: string;
  nextCycleLabel: string | null;
  dueDate: string;
  isOverdue: boolean;
}

export interface PendingNotionSubjectGroup {
  materia: string;
  count: number;
  overdueCount: number;
  dueTodayCount: number;
  earliestDueDate: string;
  items: PendingNotionTopic[];
}

export interface NotionOverdueSummary {
  todayStr: string;
  totalPending: number;
  subjects: PendingNotionSubjectGroup[];
}

/**
 * Returns the first unchecked revision cycle (Semana -> Mês 1 -> ... -> Mês 10).
 */
export function getNextPendingNotionCycle(item: Partial<NotionRevisionItem>): RevisionCycleKey | null {
  for (const key of NOTION_CYCLE_ORDER) {
    if (!item[key]) return key;
  }
  return null;
}

/**
 * Returns the human label of the cycle that follows `cycleKey`, or null if it is the last (Mês 10).
 */
export function getNextCycleLabelAfter(cycleKey: RevisionCycleKey): string | null {
  const idx = NOTION_CYCLE_ORDER.indexOf(cycleKey);
  if (idx === -1 || idx + 1 >= NOTION_CYCLE_ORDER.length) return null;
  return NOTION_CYCLE_LABELS[NOTION_CYCLE_ORDER[idx + 1]];
}

/**
 * Groups Notion revision items whose Próxima Revisão is due on or before `todayStr`
 * and still have an unchecked cycle, ordered by highest accumulated count first.
 */
export function summarizeOverdueNotionRevisions(
  items: NotionRevisionItem[],
  todayStr: string = getCurrentYearMonthAndToday().todayStr
): NotionOverdueSummary {
  const byMateria = new Map<string, PendingNotionSubjectGroup>();
  let totalPending = 0;

  for (const item of items) {
    const dueDate = item.proximaRevisao?.slice(0, 10);
    if (!dueDate || dueDate > todayStr) continue;

    const pendingCycleKey = getNextPendingNotionCycle(item);
    if (!pendingCycleKey) continue;

    const materia = (item.materia || 'Geral').trim() || 'Geral';
    const isOverdue = dueDate < todayStr;
    const topic: PendingNotionTopic = {
      item,
      pendingCycleKey,
      pendingCycleLabel: NOTION_CYCLE_LABELS[pendingCycleKey],
      nextCycleLabel: getNextCycleLabelAfter(pendingCycleKey),
      dueDate,
      isOverdue,
    };

    const group = byMateria.get(materia) || {
      materia,
      count: 0,
      overdueCount: 0,
      dueTodayCount: 0,
      earliestDueDate: dueDate,
      items: [],
    };
    group.count += 1;
    if (isOverdue) group.overdueCount += 1;
    else group.dueTodayCount += 1;
    if (dueDate < group.earliestDueDate) group.earliestDueDate = dueDate;
    group.items.push(topic);
    byMateria.set(materia, group);
    totalPending += 1;
  }

  const subjects = Array.from(byMateria.values()).map((group) => ({
    ...group,
    items: [...group.items].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  }));

  subjects.sort(
    (a, b) =>
      b.count - a.count ||
      b.overdueCount - a.overdueCount ||
      a.earliestDueDate.localeCompare(b.earliestDueDate)
  );

  return {
    todayStr,
    totalPending,
    subjects,
  };
}
