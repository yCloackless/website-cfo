import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  PieChart as PieChartIcon,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Trophy,
  Activity,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Subject, WeeklyCycle, AppTheme, StudyEntry, MonthlyStudySessionDay } from '../types';
import {
  getAllStudyEntries,
  getEntriesForCycle,
  getAvailableWeeks,
  getAvailableMonths,
  aggregateBySubject,
  aggregateDaysOfWeek,
  SubjectChartData,
  DayComparisonData,
} from '../utils/studyChartUtils';
import { buildMonthlyEntriesForCharts } from '../utils/studyBalance';

export type ChartPeriodMode = 'daily' | 'weekly' | 'monthly' | 'total';
export type ChartVisualMode = 'bar' | 'pie';

interface StudyColumnChartsProps {
  subjects: Subject[];
  currentCycle: WeeklyCycle | null;
  cyclesHistory: WeeklyCycle[];
  monthlySessionDays?: Record<string, MonthlyStudySessionDay>;
  theme: AppTheme;
}

export const StudyColumnCharts: React.FC<StudyColumnChartsProps> = ({
  subjects,
  currentCycle,
  cyclesHistory,
  monthlySessionDays = {},
  theme,
}) => {
  const isDark = theme === 'dark';

  const [periodMode, setPeriodMode] = useState<ChartPeriodMode>('monthly');
  const [chartVisualMode, setChartVisualMode] = useState<ChartVisualMode>('bar');
  const [onlyStudied, setOnlyStudied] = useState<boolean>(false);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  });
  const [dailyViewType, setDailyViewType] = useState<'bySubject' | 'dayComparison'>('bySubject');

  const availableWeeks = useMemo(() => {
    return getAvailableWeeks(currentCycle, cyclesHistory);
  }, [currentCycle, cyclesHistory]);

  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => {
    return currentCycle?.id || (availableWeeks[0]?.id ?? '');
  });

  const selectedCycle = useMemo(() => {
    if (!selectedWeekId) return currentCycle;
    const found = availableWeeks.find((w) => w.id === selectedWeekId);
    return found ? found.cycle : currentCycle;
  }, [selectedWeekId, availableWeeks, currentCycle]);

  const availableMonths = useMemo(() => {
    const base = getAvailableMonths(currentCycle, cyclesHistory);
    const known = new Set(base.map((m) => m.yearMonth));
    const extras: typeof base = [];
    for (const dateStr of Object.keys(monthlySessionDays)) {
      const ym = dateStr.slice(0, 7);
      if (ym.length === 7 && !known.has(ym)) {
        known.add(ym);
        const [y, m] = ym.split('-').map(Number);
        const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
          new Date(y, (m || 1) - 1, 1)
        );
        extras.push({ yearMonth: ym, label: label.charAt(0).toUpperCase() + label.slice(1), year: y, month: m });
      }
    }
    return [...base, ...extras].sort((a, b) => (b.yearMonth > a.yearMonth ? 1 : -1));
  }, [currentCycle, cyclesHistory, monthlySessionDays]);

  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    return availableMonths[0]?.yearMonth || '';
  });

  const allEntries = useMemo(() => {
    const map = new Map<string, StudyEntry>();
    for (const entry of getAllStudyEntries(currentCycle, cyclesHistory)) {
      if (entry.dateStr) map.set(`${entry.subjectId}::${entry.dateStr}`, entry);
    }
    for (const m of availableMonths) {
      for (const entry of buildMonthlyEntriesForCharts(currentCycle, cyclesHistory, monthlySessionDays, m.yearMonth)) {
        if (entry.dateStr) map.set(`${entry.subjectId}::${entry.dateStr}`, entry);
      }
    }
    return Array.from(map.values());
  }, [currentCycle, cyclesHistory, monthlySessionDays, availableMonths]);

  const periodEntries = useMemo<StudyEntry[]>(() => {
    switch (periodMode) {
      case 'daily': {
        if (!selectedCycle || !selectedCycle.entries) return [];
        return (Object.values(selectedCycle.entries) as StudyEntry[]).filter(
          (e) =>
            e.dayIndex === selectedDayIndex &&
            (e.completed || (e.durationMinutes && e.durationMinutes > 0))
        );
      }
      case 'weekly':
        return getEntriesForCycle(selectedCycle);
      case 'monthly':
        return buildMonthlyEntriesForCharts(
          currentCycle,
          cyclesHistory,
          monthlySessionDays,
          selectedYearMonth
        );
      case 'total':
        return allEntries;
      default:
        return [];
    }
  }, [
    periodMode,
    selectedCycle,
    selectedDayIndex,
    currentCycle,
    cyclesHistory,
    monthlySessionDays,
    selectedYearMonth,
    allEntries,
  ]);

  const subjectChartData = useMemo<SubjectChartData[]>(() => {
    return aggregateBySubject(periodEntries, subjects, onlyStudied);
  }, [periodEntries, subjects, onlyStudied]);

  const pieChartData = useMemo<SubjectChartData[]>(() => {
    return subjectChartData.filter((s) => s.minutes > 0);
  }, [subjectChartData]);

  const dayComparisonData = useMemo<DayComparisonData[]>(() => {
    return aggregateDaysOfWeek(selectedCycle, subjects);
  }, [selectedCycle, subjects]);

  const totalMinutes = useMemo(() => {
    return periodEntries.reduce(
      (acc, curr) => acc + (curr.durationMinutes && curr.durationMinutes > 0 ? curr.durationMinutes : 0),
      0
    );
  }, [periodEntries]);

  const totalHoursFormatted = Math.round((totalMinutes / 60) * 10) / 10;
  const totalSessions = periodEntries.length;

  const topSubject = useMemo(() => {
    return subjectChartData.find((s) => s.minutes > 0) || null;
  }, [subjectChartData]);

  const handlePrevWeek = () => {
    const currentIndex = availableWeeks.findIndex((w) => w.id === selectedWeekId);
    if (currentIndex < availableWeeks.length - 1) setSelectedWeekId(availableWeeks[currentIndex + 1].id);
  };
  const handleNextWeek = () => {
    const currentIndex = availableWeeks.findIndex((w) => w.id === selectedWeekId);
    if (currentIndex > 0) setSelectedWeekId(availableWeeks[currentIndex - 1].id);
  };
  const handlePrevMonth = () => {
    const currentIndex = availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth);
    if (currentIndex < availableMonths.length - 1) setSelectedYearMonth(availableMonths[currentIndex + 1].yearMonth);
  };
  const handleNextMonth = () => {
    const currentIndex = availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth);
    if (currentIndex > 0) setSelectedYearMonth(availableMonths[currentIndex - 1].yearMonth);
  };

  const dayNamesShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const dayNamesFull = [
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo',
  ];

  const surfaceInner = isDark
    ? 'bg-slate-950/70 border-slate-800/80'
    : 'bg-slate-50/90 border-slate-200';
  const controlBtnBase = isDark
    ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100';

  const renderSubjectTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload as SubjectChartData;
    return (
      <div
        className={`p-3.5 rounded-xl border shadow-2xl text-xs space-y-2 max-w-xs ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
          <p className="font-bold text-sm leading-snug">{data.subjectName}</p>
        </div>
        <div
          className={`grid grid-cols-2 gap-2 pt-1.5 border-t text-[11px] ${
            isDark ? 'border-slate-800' : 'border-slate-100'
          }`}
        >
          <div>
            <span className={isDark ? 'text-slate-400 block' : 'text-slate-500 block'}>Tempo Real:</span>
            <span className="text-[#0056D2] dark:text-sky-400 font-bold text-sm tabular-nums">
              {data.hours}h ({Math.round(data.minutes)} min)
            </span>
          </div>
          <div>
            <span className={isDark ? 'text-slate-400 block' : 'text-slate-500 block'}>Participação:</span>
            <span className="text-emerald-500 font-bold text-sm tabular-nums">{data.percentage}%</span>
          </div>
        </div>
        <div className={isDark ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500'}>
          Sessões registradas: <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{data.sessions}</strong>
        </div>
      </div>
    );
  };

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl border transition-colors shadow-xl space-y-5 min-w-0 ${
        isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}
    >
      {/* Header + Period & Visual Mode Switchers */}
      <div
        className={`flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4 border-b ${
          isDark ? 'border-slate-800/70' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            {chartVisualMode === 'pie' ? <PieChartIcon className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <h3 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Distribuição Real de Estudos por Matéria
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Dados consolidados do cronômetro e cronograma, sem duplicação. Alterne entre Barras e Pizza.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Bar vs Pie Toggle */}
          <div
            className={`inline-flex items-center p-1 rounded-xl border ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
            role="group"
            aria-label="Tipo de gráfico"
          >
            <button
              type="button"
              onClick={() => setChartVisualMode('bar')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartVisualMode === 'bar'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Barras</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setChartVisualMode('pie');
                if (periodMode === 'daily' && dailyViewType === 'dayComparison') {
                  setDailyViewType('bySubject');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                chartVisualMode === 'pie'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Pizza</span>
            </button>
          </div>

          {/* 4 Period Tabs */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border overflow-x-auto ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {(
              [
                ['daily', 'Diário'],
                ['weekly', 'Semanal'],
                ['monthly', 'Mensal'],
                ['total', 'Total'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPeriodMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  periodMode === mode
                    ? 'bg-[#0056D2] text-white shadow-sm'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period Sub-Controls */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border ${surfaceInner}`}>
        {periodMode === 'daily' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
              <span className={`text-[11px] font-bold shrink-0 mr-1 flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <Calendar className="w-3.5 h-3.5 text-[#0056D2] dark:text-sky-400" />
                Dia:
              </span>
              {dayNamesShort.map((shortName, idx) => {
                const isSelected = selectedDayIndex === idx;
                const dayData = dayComparisonData[idx];
                const hasHours = dayData && dayData.totalHours > 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedDayIndex(idx);
                      setDailyViewType('bySubject');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border cursor-pointer ${
                      isSelected
                        ? 'bg-[#0056D2] border-[#0056D2] text-white shadow-xs'
                        : controlBtnBase
                    }`}
                  >
                    <span>{shortName}</span>
                    {hasHours && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'}`} />}
                  </button>
                );
              })}
            </div>

            {chartVisualMode === 'bar' && (
              <div className={`flex p-0.5 rounded-lg border shrink-0 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => setDailyViewType('bySubject')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    dailyViewType === 'bySubject'
                      ? 'bg-[#0056D2] text-white'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Matérias no Dia
                </button>
                <button
                  type="button"
                  onClick={() => setDailyViewType('dayComparison')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    dailyViewType === 'dayComparison'
                      ? 'bg-[#0056D2] text-white'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  7 Dias da Semana
                </button>
              </div>
            )}
          </div>
        )}

        {periodMode === 'weekly' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0056D2] dark:text-sky-400 shrink-0" />
              <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Semana:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  disabled={availableWeeks.findIndex((w) => w.id === selectedWeekId) >= availableWeeks.length - 1}
                  className={`p-1 rounded-lg border disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${controlBtnBase}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border focus:outline-none focus:border-[#0056D2] cursor-pointer max-w-[260px] truncate ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {availableWeeks.map((week) => (
                    <option key={week.id} value={week.id}>
                      {week.isCurrent ? `📌 ${week.label} (Atual)` : week.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  disabled={availableWeeks.findIndex((w) => w.id === selectedWeekId) <= 0}
                  className={`p-1 rounded-lg border disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${controlBtnBase}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {periodMode === 'monthly' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0056D2] dark:text-sky-400 shrink-0" />
              <span className={`text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Mês:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  disabled={availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth) >= availableMonths.length - 1}
                  className={`p-1 rounded-lg border disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${controlBtnBase}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={selectedYearMonth}
                  onChange={(e) => setSelectedYearMonth(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border focus:outline-none focus:border-[#0056D2] cursor-pointer ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {availableMonths.map((m) => (
                    <option key={m.yearMonth} value={m.yearMonth}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  disabled={availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth) <= 0}
                  className={`p-1 rounded-lg border disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed ${controlBtnBase}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Cronômetro + cronograma consolidados no mês
            </span>
          </div>
        )}

        {periodMode === 'total' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0056D2] dark:text-sky-400 shrink-0" />
              <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Histórico Total Acumulado
              </span>
            </div>
          </div>
        )}

        {!(periodMode === 'daily' && dailyViewType === 'dayComparison') && (
          <button
            type="button"
            onClick={() => setOnlyStudied((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all shrink-0 cursor-pointer ${
              onlyStudied
                ? 'bg-[#0056D2]/15 text-[#0056D2] dark:text-sky-400 border-[#0056D2]/30'
                : controlBtnBase
            }`}
          >
            <Filter className="w-3 h-3" />
            <span>{onlyStudied ? 'Apenas Estudadas' : 'Todas as Matérias'}</span>
          </button>
        )}
      </div>

      {/* Period KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className={`p-3.5 rounded-xl border ${surfaceInner}`}>
          <div className="flex items-center gap-2 text-[#0056D2] dark:text-sky-400">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Carga no Período</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{totalHoursFormatted}h</p>
          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            {Math.round(totalMinutes)} minutos reais
          </span>
        </div>

        <div className={`p-3.5 rounded-xl border ${surfaceInner}`}>
          <div className="flex items-center gap-2 text-emerald-500">
            <Trophy className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Disciplina Líder</span>
          </div>
          <p className={`text-sm font-bold mt-1.5 truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {topSubject ? topSubject.shortName : 'Nenhuma'}
          </p>
          <span className="text-[10px] text-emerald-500 font-semibold">
            {topSubject ? `${topSubject.hours}h (${topSubject.percentage}%)` : '0h registradas'}
          </span>
        </div>

        <div className={`p-3.5 rounded-xl border ${surfaceInner}`}>
          <div className="flex items-center gap-2 text-sky-500">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Sessões Reais</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{totalSessions}</p>
          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Blocos registrados</span>
        </div>

        <div className={`p-3.5 rounded-xl border ${surfaceInner}`}>
          <div className="flex items-center gap-2 text-amber-500">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Cobertura</span>
          </div>
          <p className={`text-2xl font-black mt-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {subjectChartData.filter((s) => s.minutes > 0).length}
            <span className="text-xs text-slate-500 font-normal"> / {subjects.length}</span>
          </p>
          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Matérias ativas</span>
        </div>
      </div>

      {/* Main Chart Surface */}
      <div className={`p-4 sm:p-5 rounded-xl border space-y-3 min-w-0 ${surfaceInner}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#0056D2]" />
            <span className={`text-xs font-bold uppercase tracking-wider truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {periodMode === 'daily' && dailyViewType === 'bySubject' && `Horas por Matéria (${dayNamesFull[selectedDayIndex]})`}
              {periodMode === 'daily' && dailyViewType === 'dayComparison' && 'Comparativo Diário (Segunda a Domingo)'}
              {periodMode === 'weekly' && `Horas por Matéria — ${selectedCycle?.label || 'Semana'}`}
              {periodMode === 'monthly' && `Horas por Matéria — ${availableMonths.find((m) => m.yearMonth === selectedYearMonth)?.label || selectedYearMonth}`}
              {periodMode === 'total' && 'Horas por Matéria — Histórico Acumulado'}
            </span>
          </div>
          <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {chartVisualMode === 'pie' ? 'Proporção (%)' : 'Eixo Vertical: Horas (h)'}
          </span>
        </div>

        {periodMode === 'daily' && dailyViewType === 'dayComparison' && chartVisualMode === 'bar' ? (
          <div className="h-72 sm:h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayComparisonData} margin={{ top: 20, right: 15, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis dataKey="shortDay" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val) => `${val}h`} />
                <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} />
                <Bar dataKey="totalHours" radius={[6, 6, 0, 0]} name="Horas Estudadas">
                  {dayComparisonData.map((day) => (
                    <Cell
                      key={`day-${day.dayIndex}`}
                      fill={day.dayIndex === selectedDayIndex ? '#0056D2' : day.totalHours > 0 ? '#0ea5e9' : isDark ? '#334155' : '#cbd5e1'}
                      cursor="pointer"
                      onClick={() => {
                        setSelectedDayIndex(day.dayIndex);
                        setDailyViewType('bySubject');
                      }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : subjectChartData.every((s) => s.minutes === 0) ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-2">
            {chartVisualMode === 'pie' ? (
              <PieChartIcon className={`w-10 h-10 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
            ) : (
              <BarChart3 className={`w-10 h-10 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
            )}
            <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              0h registradas neste período
            </p>
            <p className={`text-xs max-w-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              Nenhuma sessão fictícia é exibida. Use o cronômetro ou marque seus estudos no cronograma para visualizar seus gráficos reais.
            </p>
          </div>
        ) : chartVisualMode === 'pie' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center pt-2">
            <div className="lg:col-span-7 h-72 sm:h-80 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    dataKey="minutes"
                    nameKey="shortName"
                    cx="50%"
                    cy="50%"
                    innerRadius="54%"
                    outerRadius="82%"
                    paddingAngle={3}
                    stroke={isDark ? '#0B0F17' : '#ffffff'}
                    strokeWidth={2}
                  >
                    {pieChartData.map((entry) => (
                      <Cell key={`pie-${entry.subjectId}`} fill={entry.color || '#3b82f6'} />
                    ))}
                  </Pie>
                  <Tooltip content={renderSubjectTooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Real
                </span>
                <span className={`text-2xl font-black tabular-nums ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {totalHoursFormatted}h
                </span>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {pieChartData.map((item) => (
                <div
                  key={`legend-${item.subjectId}`}
                  className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border ${
                    isDark ? 'bg-slate-900/70 border-slate-800/80' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {item.subjectName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums text-xs">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{item.hours}h</span>
                    <span className="px-1.5 py-0.5 rounded-md font-bold bg-[#0056D2]/15 text-[#0056D2] dark:text-sky-400">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-72 sm:h-84 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectChartData} margin={{ top: 20, right: 15, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis
                  dataKey="shortName"
                  stroke="#94a3b8"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(val) => `${val}h`} />
                <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} content={renderSubjectTooltip} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]} name="Horas">
                  {subjectChartData.map((entry) => (
                    <Cell key={`cell-${entry.subjectId}`} fill={entry.color || '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Subject Breakdown Cards */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <TrendingUp className="w-3.5 h-3.5 text-[#0056D2] dark:text-sky-400" />
            Detalhamento por Matéria no Período
          </p>
          <span className="text-[11px] text-slate-500">Ordenado por tempo real</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 tabular-nums">
          {subjectChartData.map((item) => (
            <div
              key={item.subjectId}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                item.minutes > 0
                  ? isDark
                    ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  : isDark
                    ? 'bg-slate-950/30 border-slate-900 opacity-60'
                    : 'bg-slate-50/70 border-slate-200/70 opacity-65'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate leading-snug ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                    {item.subjectName}
                  </p>
                  <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {item.sessions} {item.sessions === 1 ? 'sessão' : 'sessões'}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-black ${item.minutes > 0 ? (isDark ? 'text-slate-100' : 'text-slate-900') : 'text-slate-500'}`}>
                  {item.hours}h
                </p>
                <span className={`text-[10px] font-bold ${item.minutes > 0 ? 'text-[#0056D2] dark:text-sky-400' : 'text-slate-500'}`}>
                  {item.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
