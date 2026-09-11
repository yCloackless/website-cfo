import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  Sparkles,
  Trophy,
  Activity,
  Flame,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Subject, WeeklyCycle, AppTheme, StudyEntry } from '../types';
import {
  getAllStudyEntries,
  getEntriesForCycle,
  getAvailableWeeks,
  getAvailableMonths,
  getEntriesForMonth,
  aggregateBySubject,
  aggregateDaysOfWeek,
  SubjectChartData,
  DayComparisonData,
} from '../utils/studyChartUtils';

export type ChartPeriodMode = 'daily' | 'weekly' | 'monthly' | 'total';

interface StudyColumnChartsProps {
  subjects: Subject[];
  currentCycle: WeeklyCycle | null;
  cyclesHistory: WeeklyCycle[];
  theme: AppTheme;
}

export const StudyColumnCharts: React.FC<StudyColumnChartsProps> = ({
  subjects,
  currentCycle,
  cyclesHistory,
  theme,
}) => {
  const isDark = theme === 'dark';

  // Active Period Mode: 'daily' | 'weekly' | 'monthly' | 'total'
  const [periodMode, setPeriodMode] = useState<ChartPeriodMode>('weekly');

  // Filter option: only subjects with >0 hours vs all curriculum subjects
  const [onlyStudied, setOnlyStudied] = useState<boolean>(false);

  // Daily Mode States
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    // Default to today's dayIndex (0 = Monday, 6 = Sunday)
    const day = new Date().getDay();
    return day === 0 ? 6 : day - 1;
  });
  const [dailyViewType, setDailyViewType] = useState<'bySubject' | 'dayComparison'>('bySubject');

  // Available Weeks & Selected Week
  const availableWeeks = useMemo(() => {
    return getAvailableWeeks(currentCycle, cyclesHistory);
  }, [currentCycle, cyclesHistory]);

  const [selectedWeekId, setSelectedWeekId] = useState<string>(() => {
    return currentCycle?.id || (availableWeeks[0]?.id ?? '');
  });

  // Selected Week Cycle Object
  const selectedCycle = useMemo(() => {
    if (!selectedWeekId) return currentCycle;
    const found = availableWeeks.find((w) => w.id === selectedWeekId);
    return found ? found.cycle : currentCycle;
  }, [selectedWeekId, availableWeeks, currentCycle]);

  // Available Months & Selected Month
  const availableMonths = useMemo(() => {
    return getAvailableMonths(currentCycle, cyclesHistory);
  }, [currentCycle, cyclesHistory]);

  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    return availableMonths[0]?.yearMonth || '';
  });

  // All completed study entries across history + current
  const allEntries = useMemo(() => {
    return getAllStudyEntries(currentCycle, cyclesHistory);
  }, [currentCycle, cyclesHistory]);

  // Entries for the selected period
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
      case 'weekly': {
        return getEntriesForCycle(selectedCycle);
      }
      case 'monthly': {
        return getEntriesForMonth(allEntries, selectedYearMonth);
      }
      case 'total': {
        return allEntries;
      }
      default:
        return [];
    }
  }, [periodMode, selectedCycle, selectedDayIndex, allEntries, selectedYearMonth]);

  // Aggregated data for Subject columns
  const subjectChartData = useMemo<SubjectChartData[]>(() => {
    return aggregateBySubject(periodEntries, subjects, onlyStudied);
  }, [periodEntries, subjects, onlyStudied]);

  // Aggregated data for Day Comparison (Seg a Dom) in daily mode
  const dayComparisonData = useMemo<DayComparisonData[]>(() => {
    return aggregateDaysOfWeek(selectedCycle, subjects);
  }, [selectedCycle, subjects]);

  // Summary Metrics
  const totalMinutes = useMemo(() => {
    return periodEntries.reduce(
      (acc, curr) => acc + (curr.durationMinutes && curr.durationMinutes > 0 ? curr.durationMinutes : 0),
      0
    );
  }, [periodEntries]);

  const totalHoursFormatted = Math.round((totalMinutes / 60) * 10) / 10;
  const totalSessions = periodEntries.length;

  const topSubject = useMemo(() => {
    return subjectChartData.find((s) => s.hours > 0) || null;
  }, [subjectChartData]);

  // Stepper handlers for Week
  const handlePrevWeek = () => {
    const currentIndex = availableWeeks.findIndex((w) => w.id === selectedWeekId);
    if (currentIndex < availableWeeks.length - 1) {
      setSelectedWeekId(availableWeeks[currentIndex + 1].id);
    }
  };

  const handleNextWeek = () => {
    const currentIndex = availableWeeks.findIndex((w) => w.id === selectedWeekId);
    if (currentIndex > 0) {
      setSelectedWeekId(availableWeeks[currentIndex - 1].id);
    }
  };

  // Stepper handlers for Month
  const handlePrevMonth = () => {
    const currentIndex = availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth);
    if (currentIndex < availableMonths.length - 1) {
      setSelectedYearMonth(availableMonths[currentIndex + 1].yearMonth);
    }
  };

  const handleNextMonth = () => {
    const currentIndex = availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth);
    if (currentIndex > 0) {
      setSelectedYearMonth(availableMonths[currentIndex - 1].yearMonth);
    }
  };

  // Day names labels for daily filter
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

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl border transition-colors shadow-xl space-y-6 min-w-0 ${
        isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}
    >
      {/* Header & Main Period Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800/60">
        <div className="space-y-1">
          <div className="flex items-start gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                className={`text-base sm:text-lg font-bold tracking-tight break-words ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Gráfico em Coluna de Matérias Estudadas
              </h3>
              <p
                className={`text-xs break-words ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Acompanhe o volume de horas por disciplina com visualização diária, semanal, mensal ou total acumulado.
              </p>
            </div>
          </div>
        </div>

        {/* 4 Mode Tabs: Diariamente, Semanalmente, Mensalmente, Total */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setPeriodMode('daily')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              periodMode === 'daily'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Diariamente
          </button>

          <button
            onClick={() => setPeriodMode('weekly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              periodMode === 'weekly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Semanalmente
          </button>

          <button
            onClick={() => setPeriodMode('monthly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              periodMode === 'monthly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Mensalmente
          </button>

          <button
            onClick={() => setPeriodMode('total')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              periodMode === 'total'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            Total Geral
          </button>
        </div>
      </div>

      {/* Granularity Sub-Controls & Period Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
        
        {/* 1. Daily Controls */}
        {periodMode === 'daily' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full justify-between">
            {/* Day of Week Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
              <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Dia:
              </span>
              {dayNamesShort.map((shortName, idx) => {
                const isSelected = selectedDayIndex === idx;
                // check if has studies on that day
                const dayData = dayComparisonData[idx];
                const hasHours = dayData && dayData.totalHours > 0;

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedDayIndex(idx);
                      setDailyViewType('bySubject');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isDark
                        ? 'bg-slate-900 border border-slate-800 text-slate-300 hover:text-white'
                        : 'bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{shortName}</span>
                    {hasHours && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-emerald-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Toggle between By Subject vs 7-Days comparison */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-400 font-medium">Visualização:</span>
              <div className="flex p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                <button
                  onClick={() => setDailyViewType('bySubject')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    dailyViewType === 'bySubject'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Matérias no Dia
                </button>
                <button
                  onClick={() => setDailyViewType('dayComparison')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                    dailyViewType === 'dayComparison'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  7 Dias da Semana
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Weekly Controls: Choose Week */}
        {periodMode === 'weekly' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-slate-300">Escolha a Semana:</span>
              
              {/* Stepper buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevWeek}
                  disabled={availableWeeks.findIndex((w) => w.id === selectedWeekId) >= availableWeeks.length - 1}
                  title="Semana anterior"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Dropdown Selector */}
                <select
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer max-w-[280px] truncate"
                >
                  {availableWeeks.map((week) => (
                    <option key={week.id} value={week.id}>
                      {week.isCurrent ? `📌 ${week.label} (Atual)` : week.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleNextWeek}
                  disabled={availableWeeks.findIndex((w) => w.id === selectedWeekId) <= 0}
                  title="Próxima semana"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick reset to current week */}
            {currentCycle && selectedWeekId !== currentCycle.id && (
              <button
                onClick={() => setSelectedWeekId(currentCycle.id)}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline cursor-pointer"
              >
                Voltar para Semana Atual
              </button>
            )}
          </div>
        )}

        {/* 3. Monthly Controls: Choose Month */}
        {periodMode === 'monthly' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-xs font-bold text-slate-300">Escolha o Mês:</span>

              {/* Stepper buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevMonth}
                  disabled={availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth) >= availableMonths.length - 1}
                  title="Mês anterior"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <select
                  value={selectedYearMonth}
                  onChange={(e) => setSelectedYearMonth(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {availableMonths.map((m) => (
                    <option key={m.yearMonth} value={m.yearMonth}>
                      📅 {m.label}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleNextMonth}
                  disabled={availableMonths.findIndex((m) => m.yearMonth === selectedYearMonth) <= 0}
                  title="Próximo mês"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <span className="text-[11px] text-slate-400">
              Acumulado mensal de todas as semanas do mês
            </span>
          </div>
        )}

        {/* 4. Total Controls */}
        {periodMode === 'total' && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-slate-200">
                Histórico Total Acumulado (Todas as Semanas &amp; Meses)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">
              Base completa de estudos no CFO CBMERJ
            </span>
          </div>
        )}

        {/* Common Right Toggle: Only Studied vs All Subjects */}
        {!(periodMode === 'daily' && dailyViewType === 'dayComparison') && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 shrink-0">
            <button
              onClick={() => setOnlyStudied((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                onlyStudied
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 font-bold'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Alternar entre mostrar apenas matérias com horas ou todas as matérias"
            >
              <Filter className="w-3 h-3" />
              <span>{onlyStudied ? 'Apenas Estudadas' : 'Todas as Matérias'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Summary Stat Cards for this period */}
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-blue-400">
            <Clock className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Carga no Período</span>
          </div>
          <p className="text-2xl font-black text-slate-100 mt-1">
            {totalHoursFormatted}h
          </p>
          <span className="text-[10px] text-slate-500">
            {periodMode === 'daily'
              ? dayNamesFull[selectedDayIndex]
              : periodMode === 'weekly'
              ? 'Nesta semana'
              : periodMode === 'monthly'
              ? 'Neste mês'
              : 'Total acumulado'}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-blue-400">
            <Trophy className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Disciplina Líder</span>
          </div>
          <p className="text-sm font-bold text-slate-100 mt-1 truncate">
            {topSubject ? topSubject.shortName : 'Nenhuma'}
          </p>
          <span className="text-[10px] text-blue-400 font-semibold">
            {topSubject ? `${topSubject.hours}h (${topSubject.percentage}%)` : 'Sem registros'}
          </span>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Sessões Concluídas</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 mt-1">
            {totalSessions}
          </p>
          <span className="text-[10px] text-slate-500">Blocos de estudo</span>
        </div>

        <div
          className={`p-3.5 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 text-purple-400">
            <Activity className="w-4 h-4" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Disciplinas Estudadas</span>
          </div>
          <p className="text-2xl font-black text-purple-400 mt-1">
            {subjectChartData.filter((s) => s.hours > 0).length}{' '}
            <span className="text-xs text-slate-500 font-normal">/ {subjects.length}</span>
          </p>
          <span className="text-[10px] text-slate-500">
            {subjectChartData.filter((s) => s.hours > 0).length === subjects.length
              ? '100% da grade coberta!'
              : 'Cobertura parcial'}
          </span>
        </div>
      </div>

      {/* Main Column Chart Container */}
      <div className="p-4 sm:p-5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-3 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider break-words min-w-0">
              {periodMode === 'daily' && dailyViewType === 'bySubject' && `Horas Estudadas por Matéria (${dayNamesFull[selectedDayIndex]})`}
              {periodMode === 'daily' && dailyViewType === 'dayComparison' && 'Comparativo Diário da Semana (Segunda a Domingo)'}
              {periodMode === 'weekly' && `Horas por Matéria na ${selectedCycle?.label || 'Semana Selecionada'}`}
              {periodMode === 'monthly' && `Horas por Matéria no Mês de ${availableMonths.find((m) => m.yearMonth === selectedYearMonth)?.label || selectedYearMonth}`}
              {periodMode === 'total' && 'Horas por Matéria no Histórico Geral (Total Acumulado)'}
            </span>
          </div>

          <span className="text-[11px] font-mono font-semibold text-slate-400 break-words">
            Eixo Vertical: Horas (h)
          </span>
        </div>

        {/* The Recharts Bar / Column Chart */}
        {periodMode === 'daily' && dailyViewType === 'dayComparison' ? (
          /* Daily Comparison View (7 Days of the Week as Columns) */
          <div className="h-72 sm:h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dayComparisonData}
                margin={{ top: 20, right: 15, left: -10, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="shortDay"
                  stroke="#94a3b8"
                  fontSize={11}
                  fontWeight={600}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => `${val}h`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as DayComparisonData;
                      return (
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-xs space-y-1.5 text-slate-100 max-w-xs">
                          <p className="font-bold text-sm text-blue-400">
                            {data.dayLabel} {data.dateStr && `(${data.dateStr})`}
                          </p>
                          <div className="flex items-center justify-between gap-4 font-semibold">
                            <span className="text-slate-400">Carga Total:</span>
                            <span className="text-blue-400 text-sm font-bold">{data.totalHours}h</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-slate-400">Sessões:</span>
                            <span className="text-slate-200">{data.sessions} sessões</span>
                          </div>
                          {data.subjectsSummary.length > 0 && (
                            <div className="pt-1.5 border-t border-slate-800 space-y-1">
                              <p className="text-[10px] uppercase font-bold text-slate-400">
                                Matérias Estudadas:
                              </p>
                              {data.subjectsSummary.map((sub, idx) => (
                                <div key={idx} className="flex items-center justify-between text-[11px]">
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="w-2 h-2 rounded-full"
                                      style={{ backgroundColor: sub.color }}
                                    />
                                    <span>{sub.name}</span>
                                  </span>
                                  <span className="font-bold text-slate-300">{sub.hours}h</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="totalHours"
                  radius={[6, 6, 0, 0]}
                  name="Horas Estudadas"
                >
                  {dayComparisonData.map((day) => (
                    <Cell
                      key={`day-${day.dayIndex}`}
                      fill={
                        day.dayIndex === selectedDayIndex
                          ? '#3b82f6'
                          : day.totalHours > 0
                          ? '#0ea5e9'
                          : '#334155'
                      }
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
        ) : (
          /* Standard Subject Columns Chart */
          <div className="h-72 sm:h-84 w-full pt-2">
            {subjectChartData.every((s) => s.hours === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <BarChart3 className="w-10 h-10 text-slate-600 animate-pulse" />
                <p className="text-sm font-bold text-slate-400">
                  Nenhum estudo registrado neste período selecionado
                </p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Preencha os tópicos e horas no cronograma semanal para visualizar as colunas de cada matéria.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={subjectChartData}
                  margin={{ top: 25, right: 15, left: -10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="shortName"
                    stroke="#94a3b8"
                    fontSize={11}
                    fontWeight={600}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                    tickFormatter={(val) => `${val}h`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as SubjectChartData;
                        return (
                          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-xs space-y-2 text-slate-100 max-w-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: data.color }}
                              />
                              <p className="font-bold text-sm text-slate-100 leading-snug">
                                {data.subjectName}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                              <div>
                                <span className="text-slate-400 block">Tempo Total:</span>
                                <span className="text-blue-400 font-bold text-sm">
                                  {data.hours}h ({data.minutes} min)
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">% do Período:</span>
                                <span className="text-[#0056D2] dark:text-sky-400 font-bold text-sm">
                                  {data.percentage}%
                                </span>
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-400">
                              <span>Sessões no período: </span>
                              <strong className="text-slate-200">{data.sessions}</strong>
                            </div>

                            {data.topics && data.topics.length > 0 && (
                              <div className="pt-1.5 border-t border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                                  Tópicos estudados:
                                </span>
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto scrollbar-thin">
                                  {data.topics.map((t, idx) => (
                                    <span
                                      key={idx}
                                      className="px-1.5 py-0.5 rounded text-[9.5px] bg-slate-800 text-slate-300 font-mono"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="hours"
                    radius={[6, 6, 0, 0]}
                    name="Horas"
                  >
                    {subjectChartData.map((entry) => (
                      <Cell
                        key={`cell-${entry.subjectId}`}
                        fill={entry.color || '#3b82f6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </div>

      {/* Breakdown List / Table of Subjects for the Selected Period */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            Detalhamento por Matéria no Período Selecionado
          </p>
          <span className="text-[11px] text-slate-500">
            Ordenado por maior dedicação de horas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {subjectChartData.map((item) => (
            <div
              key={item.subjectId}
              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                item.hours > 0
                  ? isDark
                    ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  : isDark
                  ? 'bg-slate-950/30 border-slate-900 opacity-60'
                  : 'bg-slate-50/60 border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate leading-snug">
                    {item.subjectName}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {item.sessions} {item.sessions === 1 ? 'sessão' : 'sessões'}
                    {item.topics.length > 0 && ` • ${item.topics.length} tópicos`}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p
                  className={`text-sm font-black ${
                    item.hours > 0 ? 'text-slate-100' : 'text-slate-500'
                  }`}
                >
                  {item.hours}h
                </p>
                <span
                  className={`text-[10px] font-bold ${
                    item.hours > 0 ? 'text-[#0056D2] dark:text-sky-400' : 'text-slate-600'
                  }`}
                >
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
