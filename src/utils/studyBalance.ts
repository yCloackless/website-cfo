import {
  BalanceTier,
  MonthlyStudySessionDay,
  MonthlyStudySummary,
  StudyEntry,
  Subject,
  SubjectMonthlyBalance,
  WeeklyCycle,
} from '../types';

const TIER_COLORS: Record<Exclude<BalanceTier, 'neutral'>, string> = {
  critical: '#f43f5e',
  attention: '#f59e0b',
  balanced: '#10b981',
};

const TIER_LABELS: Record<BalanceTier, string> = {
  neutral: 'Sem estudo no mês',
  critical: 'Em baixa no mês',
  attention: 'Atenção no mês',
  balanced: 'Equilibrada no mês',
};

/**
 * Returns current YYYY-MM, first day of month, and today YYYY-MM-DD in America/Sao_Paulo.
 */
export function getCurrentYearMonthAndToday(now: Date = new Date()): {
  yearMonth: string;
  monthStart: string;
  todayStr: string;
} {
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const yearMonth = todayStr.slice(0, 7);
  return {
    yearMonth,
    monthStart: `${yearMonth}-01`,
    todayStr,
  };
}

function collectMonthEntriesMap(
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[],
  yearMonth: string
): Map<string, StudyEntry> {
  const cycleEntriesBySubjectDay = new Map<string, StudyEntry>();
  const allCycles = [...cyclesHistory, ...(currentCycle ? [currentCycle] : [])];

  for (const cycle of allCycles) {
    if (!cycle?.entries) continue;
    for (const entry of Object.values(cycle.entries) as StudyEntry[]) {
      if (!entry?.subjectId || !entry?.dateStr || !entry.dateStr.startsWith(yearMonth)) continue;
      if (!entry.completed && !(entry.durationMinutes && entry.durationMinutes > 0)) continue;
      cycleEntriesBySubjectDay.set(`${entry.subjectId}::${entry.dateStr}`, entry);
    }
  }
  return cycleEntriesBySubjectDay;
}

/**
 * Merges authoritative DB study_sessions with completed schedule entries for a single month
 * without double-counting the same (subjectId, dateStr).
 */
export function buildMonthlyEntriesForCharts(
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[],
  sessionDays: Record<string, MonthlyStudySessionDay>,
  yearMonth: string
): StudyEntry[] {
  const cycleMap = collectMonthEntriesMap(currentCycle, cyclesHistory, yearMonth);
  const merged = new Map<string, StudyEntry>();

  for (const [key, entry] of cycleMap.entries()) {
    merged.set(key, entry);
  }

  for (const day of Object.values(sessionDays || {})) {
    if (!day?.dateStr || !day.dateStr.startsWith(yearMonth)) continue;
    for (const s of day.subjects || []) {
      const minutes = Math.round((s.durationSeconds / 60) * 10) / 10;
      if (minutes <= 0) continue;
      const key = `${s.subjectId}::${day.dateStr}`;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          completed: true,
          durationMinutes: minutes,
        });
      } else {
        const [y, m, d] = day.dateStr.split('-').map(Number);
        const jsDay = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
        const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
        merged.set(key, {
          id: `session_${s.subjectId}_${day.dateStr}`,
          subjectId: s.subjectId,
          dayIndex,
          dateStr: day.dateStr,
          completed: true,
          durationMinutes: minutes,
        });
      }
    }
  }

  return Array.from(merged.values());
}

/**
 * Computes real per-user monthly study balance, equilibrium score (0-100), and schedule color tiers.
 */
export function buildMonthlyStudySummary(
  subjects: Subject[],
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[],
  sessionDays: Record<string, MonthlyStudySessionDay>,
  now: Date = new Date()
): MonthlyStudySummary {
  const { yearMonth } = getCurrentYearMonthAndToday(now);
  const mergedEntries = buildMonthlyEntriesForCharts(currentCycle, cyclesHistory, sessionDays, yearMonth);

  const subjectMap = new Map<string, { sessions: number; minutes: number; topics: string[] }>();

  for (const entry of mergedEntries) {
    const prev = subjectMap.get(entry.subjectId) || { sessions: 0, minutes: 0, topics: [] };
    prev.sessions += 1;
    prev.minutes += entry.durationMinutes && entry.durationMinutes > 0 ? entry.durationMinutes : 0;
    if (entry.topic && entry.topic.trim() && !prev.topics.includes(entry.topic.trim())) {
      prev.topics.push(entry.topic.trim());
    }
    subjectMap.set(entry.subjectId, prev);
  }

  const subjectsStudied: MonthlyStudySummary['subjectsStudied'] = [];
  const subjectsNotStudied: MonthlyStudySummary['subjectsNotStudied'] = [];
  let totalMinutes = 0;
  let totalSessions = 0;

  for (const subject of subjects) {
    const stats = subjectMap.get(subject.id);
    if (stats && (stats.sessions > 0 || stats.minutes > 0)) {
      const roundedMinutes = Math.round(stats.minutes * 10) / 10;
      subjectsStudied.push({
        id: subject.id,
        name: subject.name,
        category: subject.category,
        color: subject.color,
        sessions: stats.sessions,
        minutes: roundedMinutes,
        topics: stats.topics,
      });
      totalMinutes += roundedMinutes;
      totalSessions += stats.sessions;
    } else {
      subjectsNotStudied.push({
        id: subject.id,
        name: subject.name,
        category: subject.category,
        color: subject.color,
      });
    }
  }

  subjectsStudied.sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
  totalMinutes = Math.round(totalMinutes * 10) / 10;
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  // Determine balance tiers (red -> amber -> green) relative to the monthly average per subject
  const subjectCount = subjects.length || 1;
  const avgMinutes = totalMinutes / subjectCount;
  const bySubject: Record<string, SubjectMonthlyBalance> = {};

  for (const subject of subjects) {
    const stats = subjectMap.get(subject.id);
    const minutes = Math.round((stats?.minutes || 0) * 10) / 10;
    const sessions = stats?.sessions || 0;
    const hours = Math.round((minutes / 60) * 10) / 10;
    const sharePct = totalMinutes > 0 ? Math.round((minutes / totalMinutes) * 100) : 0;
    const ratioToAvg = avgMinutes > 0 ? minutes / avgMinutes : 0;

    let tier: BalanceTier = 'neutral';
    if (totalMinutes > 0) {
      if (minutes === 0 || ratioToAvg < 0.4) {
        tier = 'critical';
      } else if (ratioToAvg < 0.85) {
        tier = 'attention';
      } else {
        tier = 'balanced';
      }
    }

    bySubject[subject.id] = {
      subjectId: subject.id,
      name: subject.name,
      category: subject.category,
      originalColor: subject.color,
      minutes,
      hours,
      sessions,
      sharePct,
      ratioToAvg: Math.round(ratioToAvg * 100) / 100,
      tier,
      statusLabel: TIER_LABELS[tier],
      accentColor: tier === 'neutral' ? subject.color : TIER_COLORS[tier],
    };
  }

  // Honest deterministic equilibrium score (0..100): 0 when no real study exists
  let equilibriumScore = 0;
  if (totalMinutes > 0 && subjects.length > 0) {
    const coverageRatio = subjectsStudied.filter((s) => s.minutes > 0).length / subjects.length;
    const values = subjects.map((s) => bySubject[s.id]?.minutes || 0);
    const mean = totalMinutes / subjects.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / subjects.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const evennessRatio = Math.max(0, 1 - Math.min(cv, 1.5) / 1.5);
    equilibriumScore = Math.max(1, Math.min(100, Math.round(coverageRatio * 55 + evennessRatio * 45)));
  } else if (totalSessions > 0 && subjects.length > 0) {
    const coverageRatio = subjectsStudied.length / subjects.length;
    equilibriumScore = Math.max(1, Math.min(100, Math.round(coverageRatio * 40)));
  }

  return {
    yearMonth,
    totalSessions,
    totalMinutes,
    totalHours,
    equilibriumScore,
    subjectsStudied,
    subjectsNotStudied,
    allSubjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
    bySubject,
  };
}
