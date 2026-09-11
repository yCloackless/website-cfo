import { Subject, WeeklyCycle, StudyEntry } from '../types';
import { WEEK_DAYS } from '../data/cfoSubjects';

export interface SubjectChartData {
  subjectId: string;
  subjectName: string;
  shortName: string;
  color: string;
  category: string;
  hours: number;
  minutes: number;
  sessions: number;
  topics: string[];
  percentage: number;
}

export interface DayComparisonData {
  dayIndex: number;
  dayLabel: string;
  shortDay: string;
  dateStr: string;
  totalHours: number;
  totalMinutes: number;
  sessions: number;
  subjectsCount: number;
  entries: StudyEntry[];
  subjectsSummary: { name: string; color: string; hours: number }[];
}

export interface WeekOption {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  cycle: WeeklyCycle;
  isCurrent: boolean;
}

export interface MonthOption {
  yearMonth: string; // YYYY-MM
  label: string; // e.g. "Setembro 2026"
  year: number;
  month: number;
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Returns a shortened subject name for chart X-axis labels
 */
export function getShortSubjectName(fullName: string): string {
  if (fullName.includes('Língua Portuguesa')) return 'Português';
  if (fullName.includes('Redação')) return 'Redação';
  if (fullName.includes('Matemática')) return 'Matemática';
  if (fullName.includes('Física')) return 'Física';
  if (fullName.includes('Química')) return 'Química';
  if (fullName.includes('Biologia')) return 'Biologia';
  if (fullName.includes('História')) return 'História';
  if (fullName.includes('Geografia')) return 'Geografia';
  if (fullName.includes('Inglês')) return 'Inglês';
  if (fullName.includes('Legislação')) return 'Legislação';
  
  // Custom subject: take first 12 characters or first 2 words
  const words = fullName.split(' ');
  if (words.length > 1 && words[0].length < 10) {
    return `${words[0]} ${words[1]}`.slice(0, 14);
  }
  return fullName.slice(0, 12);
}

/**
 * Extracts all completed study entries from all cycles
 */
export function getAllStudyEntries(
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[] = []
): StudyEntry[] {
  const map = new Map<string, StudyEntry>();

  // Add historical cycles first
  cyclesHistory.forEach((cycle) => {
    if (cycle && cycle.entries) {
      (Object.values(cycle.entries) as StudyEntry[]).forEach((entry) => {
        if (entry.completed || (entry.durationMinutes && entry.durationMinutes > 0)) {
          map.set(`${cycle.id}_${entry.id}`, entry);
        }
      });
    }
  });

  // Overwrite or add current cycle
  if (currentCycle && currentCycle.entries) {
    (Object.values(currentCycle.entries) as StudyEntry[]).forEach((entry) => {
      if (entry.completed || (entry.durationMinutes && entry.durationMinutes > 0)) {
        map.set(`${currentCycle.id}_${entry.id}`, entry);
      }
    });
  }

  return Array.from(map.values());
}

/**
 * Extracts completed entries for a specific cycle
 */
export function getEntriesForCycle(cycle: WeeklyCycle | null): StudyEntry[] {
  if (!cycle || !cycle.entries) return [];
  return (Object.values(cycle.entries) as StudyEntry[]).filter(
    (e) => e.completed || (e.durationMinutes && e.durationMinutes > 0)
  );
}

/**
 * Extracts available week options for the selector
 */
export function getAvailableWeeks(
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[] = []
): WeekOption[] {
  const options: WeekOption[] = [];

  if (currentCycle) {
    options.push({
      id: currentCycle.id,
      label: currentCycle.label || 'Semana Atual',
      startDate: currentCycle.startDate,
      endDate: currentCycle.endDate,
      cycle: currentCycle,
      isCurrent: true,
    });
  }

  cyclesHistory.forEach((hist) => {
    // avoid duplicates if currentCycle is also in history
    if (!currentCycle || hist.id !== currentCycle.id) {
      options.push({
        id: hist.id,
        label: hist.label || `Semana de ${hist.startDate}`,
        startDate: hist.startDate,
        endDate: hist.endDate,
        cycle: hist,
        isCurrent: false,
      });
    }
  });

  // Sort chronological descending (most recent first)
  options.sort((a, b) => (b.startDate > a.startDate ? 1 : -1));

  return options;
}

/**
 * Extracts all unique available months (YYYY-MM) from entries and current date
 */
export function getAvailableMonths(
  currentCycle: WeeklyCycle | null,
  cyclesHistory: WeeklyCycle[] = []
): MonthOption[] {
  const monthsSet = new Set<string>();

  // Always include current month
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(currentYM);

  // Extract from current cycle
  if (currentCycle) {
    if (currentCycle.startDate) monthsSet.add(currentCycle.startDate.slice(0, 7));
    if (currentCycle.endDate) monthsSet.add(currentCycle.endDate.slice(0, 7));
    if (currentCycle.entries) {
      (Object.values(currentCycle.entries) as StudyEntry[]).forEach((e) => {
        if (e.dateStr) monthsSet.add(e.dateStr.slice(0, 7));
      });
    }
  }

  // Extract from history
  cyclesHistory.forEach((hist) => {
    if (hist.startDate) monthsSet.add(hist.startDate.slice(0, 7));
    if (hist.endDate) monthsSet.add(hist.endDate.slice(0, 7));
    if (hist.entries) {
      (Object.values(hist.entries) as StudyEntry[]).forEach((e) => {
        if (e.dateStr) monthsSet.add(e.dateStr.slice(0, 7));
      });
    }
  });

  const sorted = Array.from(monthsSet).sort().reverse(); // most recent first

  return sorted.map((ym) => {
    const [yearStr, monthStr] = ym.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const name = MONTH_NAMES_PT[m - 1] || 'Mês';
    return {
      yearMonth: ym,
      label: `${name} de ${y}`,
      year: y,
      month: m,
    };
  });
}

/**
 * Filter entries by month (YYYY-MM)
 */
export function getEntriesForMonth(
  entries: StudyEntry[],
  yearMonth: string
): StudyEntry[] {
  return entries.filter((e) => e.dateStr && e.dateStr.startsWith(yearMonth));
}

/**
 * Aggregates study entries by Subject
 */
export function aggregateBySubject(
  entries: StudyEntry[],
  subjects: Subject[],
  onlyStudied: boolean = false
): SubjectChartData[] {
  // Map of subject id to data
  const subjectMap = new Map<
    string,
    {
      subject: Subject;
      totalMinutes: number;
      sessions: number;
      topics: Set<string>;
    }
  >();

  // Initialize all subjects
  subjects.forEach((subj) => {
    subjectMap.set(subj.id, {
      subject: subj,
      totalMinutes: 0,
      sessions: 0,
      topics: new Set(),
    });
  });

  // Sum entries
  entries.forEach((entry) => {
    let item = subjectMap.get(entry.subjectId);
    if (!item) {
      // If subject was custom or missing, construct fallback
      const fallbackSubject: Subject = {
        id: entry.subjectId,
        name: entry.subjectId,
        category: 'Outras',
        color: '#64748b',
      };
      item = {
        subject: fallbackSubject,
        totalMinutes: 0,
        sessions: 0,
        topics: new Set(),
      };
      subjectMap.set(entry.subjectId, item);
    }

    const duration = entry.durationMinutes && entry.durationMinutes > 0 ? entry.durationMinutes : 0;
    item.totalMinutes += duration;
    item.sessions += 1;
    if (entry.topic && entry.topic.trim()) {
      item.topics.add(entry.topic.trim());
    }
  });

  // Calculate overall grand total for percentage
  let grandTotalMinutes = 0;
  subjectMap.forEach((val) => {
    grandTotalMinutes += val.totalMinutes;
  });

  const result: SubjectChartData[] = [];

  subjectMap.forEach((val) => {
    if (onlyStudied && val.totalMinutes === 0) {
      return;
    }

    const hours = Math.round((val.totalMinutes / 60) * 10) / 10;
    const percentage =
      grandTotalMinutes > 0 ? Math.round((val.totalMinutes / grandTotalMinutes) * 100) : 0;

    result.push({
      subjectId: val.subject.id,
      subjectName: val.subject.name,
      shortName: getShortSubjectName(val.subject.name),
      color: val.subject.color || '#3b82f6',
      category: val.subject.category || 'Geral',
      hours,
      minutes: val.totalMinutes,
      sessions: val.sessions,
      topics: Array.from(val.topics),
      percentage,
    });
  });

  // Sort descending by study hours, or by curriculum if all 0
  result.sort((a, b) => b.minutes - a.minutes);

  return result;
}

/**
 * Aggregates a cycle's entries across the 7 days of the week (Seg a Dom)
 */
export function aggregateDaysOfWeek(
  cycle: WeeklyCycle | null,
  subjects: Subject[]
): DayComparisonData[] {
  if (!cycle) return [];

  const subjectLookup = new Map<string, Subject>();
  subjects.forEach((s) => subjectLookup.set(s.id, s));

  // Generate 7 days
  const daysData: DayComparisonData[] = [];
  const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const shortNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  for (let i = 0; i < 7; i++) {
    // Find all entries for this day index in cycle
    const dayEntries: StudyEntry[] = [];
    if (cycle.entries) {
      (Object.values(cycle.entries) as StudyEntry[]).forEach((e) => {
        if (e.dayIndex === i && (e.completed || (e.durationMinutes && e.durationMinutes > 0))) {
          dayEntries.push(e);
        }
      });
    }

    let totalMinutes = 0;
    const subjectsMap = new Map<string, { name: string; color: string; hours: number }>();

    dayEntries.forEach((entry) => {
      const duration = entry.durationMinutes && entry.durationMinutes > 0 ? entry.durationMinutes : 0;
      totalMinutes += duration;

      const sub = subjectLookup.get(entry.subjectId);
      const name = sub ? getShortSubjectName(sub.name) : entry.subjectId;
      const color = sub?.color || '#3b82f6';
      const existing = subjectsMap.get(entry.subjectId) || { name, color, hours: 0 };
      existing.hours += Math.round((duration / 60) * 10) / 10;
      subjectsMap.set(entry.subjectId, existing);
    });

    // compute dateStr for this day index
    let dateStr = '';
    if (cycle.startDate) {
      try {
        const [y, m, d] = cycle.startDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d + i);
        const yStr = dateObj.getFullYear();
        const mStr = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dStr = String(dateObj.getDate()).padStart(2, '0');
        dateStr = `${yStr}-${mStr}-${dStr}`;
      } catch {
        dateStr = '';
      }
    }

    daysData.push({
      dayIndex: i,
      dayLabel: dayNames[i],
      shortDay: shortNames[i],
      dateStr,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      totalMinutes,
      sessions: dayEntries.length,
      subjectsCount: subjectsMap.size,
      entries: dayEntries,
      subjectsSummary: Array.from(subjectsMap.values()),
    });
  }

  return daysData;
}
