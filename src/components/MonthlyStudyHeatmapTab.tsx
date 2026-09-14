import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar as CalendarIcon,
  Flame,
  Sparkles,
  RefreshCw,
  BookOpen,
  X,
  TrendingUp,
  Plus,
} from 'lucide-react';
import { AppTheme, Subject } from '../types';
import { apiFetch } from '../services/apiFetch';

interface DayStudySummary {
  dateStr: string; // YYYY-MM-DD
  totalSeconds: number;
  totalHours: number;
  sessionsCount: number;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    durationSeconds: number;
    durationHours: number;
  }>;
}

interface MonthlyStudyHeatmapTabProps {
  theme: AppTheme;
  subjects: Subject[];
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToTimer?: () => void;
  onStudySessionLogged?: (entry: {
    subjectId: string;
    subjectName: string;
    dateStr: string;
    durationMinutes: number;
    topic?: string;
  }) => void;
}

const WEEK_DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

const MONTH_NAMES = [
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

export const MonthlyStudyHeatmapTab: React.FC<MonthlyStudyHeatmapTabProps> = ({
  theme,
  subjects,
  showToast = (_msg: string, _type?: 'success' | 'error' | 'info') => {},
  onNavigateToTimer,
  onStudySessionLogged,
}) => {
  const isDark = theme === 'dark';

  // Ano e Mês exibidos no calendário
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const yearMonth = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [currentDate]);

  const [dailySummaries, setDailySummaries] = useState<Record<string, DayStudySummary>>(() => {
    try {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const cached = localStorage.getItem(`cfo_monthly_study_sessions_${ym}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.summary || {};
      }
    } catch (e) {}
    return {};
  });

  const [monthTotals, setMonthTotals] = useState<{ totalSeconds: number; totalHours: number; totalSessions: number }>(() => {
    try {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const cached = localStorage.getItem(`cfo_monthly_study_sessions_${ym}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.totals || { totalSeconds: 0, totalHours: 0, totalSessions: 0 };
      }
    } catch (e) {}
    return { totalSeconds: 0, totalHours: 0, totalSessions: 0 };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [selectedDaySummary, setSelectedDaySummary] = useState<DayStudySummary | null>(null);
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [manualSubjectId, setManualSubjectId] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualTopic, setManualTopic] = useState('');
  const [isSavingManual, setIsSavingManual] = useState(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Carrega do cache local imediatamente ao trocar de mês para eliminar qualquer flash
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`cfo_monthly_study_sessions_${yearMonth}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.summary) setDailySummaries(parsed.summary);
        if (parsed.totals) setMonthTotals(parsed.totals);
      }
    } catch (e) {}
  }, [yearMonth]);

  // Carrega dados da API com invalidação rigorosa de cache
  const fetchMonthlyData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch(`/api/study-sessions/daily-summary?month=${yearMonth}&_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) throw new Error('Falha ao carregar horas do mês');
      const data = await res.json();
      const loadedSummary = data.summary || {};
      const loadedTotals = data.totals || { totalSeconds: 0, totalHours: 0, totalSessions: 0 };

      setDailySummaries(loadedSummary);
      setMonthTotals(loadedTotals);

      // Atualiza também o modal detalhado caso esteja aberto
      setSelectedDaySummary((currentModal) => {
        if (currentModal && loadedSummary[currentModal.dateStr]) {
          return loadedSummary[currentModal.dateStr];
        }
        return currentModal;
      });

      try {
        localStorage.setItem(
          `cfo_monthly_study_sessions_${yearMonth}`,
          JSON.stringify({ summary: loadedSummary, totals: loadedTotals })
        );
      } catch (e) {}
    } catch (err: any) {
      console.warn('Erro ao carregar dados do heatmap:', err);
      try {
        const cached = localStorage.getItem(`cfo_monthly_study_sessions_${yearMonth}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.summary) setDailySummaries(parsed.summary);
          if (parsed.totals) setMonthTotals(parsed.totals);
        }
      } catch (e) {}
    } finally {
      setIsLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

  // Controles de navegação de mês
  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    setCurrentDate(new Date());
  };

  const openManualEntry = (dateStr: string) => {
    setManualDate(dateStr);
    setManualSubjectId(subjects[0]?.id || '');
    setManualHours('');
    setManualMinutes('');
    setManualTopic('');
  };

  const handleSaveManualEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualDate || !manualSubjectId) {
      showToast('Selecione uma matéria para registrar as horas.', 'info');
      return;
    }

    const hours = Number(manualHours || 0);
    const minutes = Number(manualMinutes || 0);
    const totalMinutes = Math.round(hours * 60 + minutes);
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0 || totalMinutes > 1440) {
      showToast('Informe um tempo entre 1 minuto e 24 horas.', 'info');
      return;
    }

    const subject = subjects.find((item) => item.id === manualSubjectId);
    if (!subject) return;

    const targetDate = manualDate;
    const addedSeconds = totalMinutes * 60;
    const addedHours = Math.round((addedSeconds / 3600) * 10) / 10;
    const cleanTopic = manualTopic.trim();

    // 🚀 ATUALIZAÇÃO OTIMISTA IMEDIATA (Zero Latência): Reflete na página instantaneamente sem refresh
    setDailySummaries((prev) => {
      const existingDay = prev[targetDate] || {
        dateStr: targetDate,
        totalSeconds: 0,
        totalHours: 0,
        sessionsCount: 0,
        subjects: [],
      };

      const newSeconds = existingDay.totalSeconds + addedSeconds;
      const newHours = Math.round((newSeconds / 3600) * 10) / 10;

      const existingSubIndex = existingDay.subjects.findIndex((s) => s.subjectId === subject.id);
      let updatedSubjects = [...existingDay.subjects];
      if (existingSubIndex >= 0) {
        const prevSub = updatedSubjects[existingSubIndex];
        const subSec = prevSub.durationSeconds + addedSeconds;
        updatedSubjects[existingSubIndex] = {
          ...prevSub,
          durationSeconds: subSec,
          durationHours: Math.round((subSec / 3600) * 10) / 10,
        };
      } else {
        updatedSubjects.push({
          subjectId: subject.id,
          subjectName: subject.name,
          durationSeconds: addedSeconds,
          durationHours: addedHours,
        });
      }

      const updatedDay: DayStudySummary = {
        dateStr: targetDate,
        totalSeconds: newSeconds,
        totalHours: newHours,
        sessionsCount: existingDay.sessionsCount + 1,
        subjects: updatedSubjects,
      };

      // Atualiza também o modal detalhado do dia caso aberto
      setSelectedDaySummary((currentModal) => {
        if (currentModal && currentModal.dateStr === targetDate) {
          return updatedDay;
        }
        return currentModal;
      });

      const nextMap = {
        ...prev,
        [targetDate]: updatedDay,
      };

      try {
        localStorage.setItem(
          `cfo_monthly_study_sessions_${yearMonth}`,
          JSON.stringify({
            summary: nextMap,
            totals: {
              totalSeconds: monthTotals.totalSeconds + addedSeconds,
              totalHours: Math.round(((monthTotals.totalSeconds + addedSeconds) / 3600) * 10) / 10,
              totalSessions: monthTotals.totalSessions + 1,
            },
          })
        );
      } catch (e) {}

      return nextMap;
    });

    setMonthTotals((prev) => {
      const newSec = prev.totalSeconds + addedSeconds;
      return {
        totalSeconds: newSec,
        totalHours: Math.round((newSec / 3600) * 10) / 10,
        totalSessions: prev.totalSessions + 1,
      };
    });

    // Notifica ciclo semanal imediatamente
    if (onStudySessionLogged) {
      onStudySessionLogged({
        subjectId: subject.id,
        subjectName: subject.name,
        dateStr: targetDate,
        durationMinutes: totalMinutes,
        topic: cleanTopic,
      });
    }

    // Fecha o modal de inserção imediatamente
    setManualDate(null);
    setManualHours('');
    setManualMinutes('');
    setManualTopic('');

    showToast(`+${formatDurationFriendly(addedSeconds)} de ${subject.name} registradas na Agenda!`, 'success');

    try {
      setIsSavingManual(true);
      const response = await apiFetch('/api/study-sessions/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
        body: JSON.stringify({
          entryId: `monthly_${targetDate}_${subject.id}_${Date.now()}`,
          subjectId: subject.id,
          subjectName: subject.name,
          topic: cleanTopic,
          dateStr: targetDate,
          durationMinutes: totalMinutes,
          notes: 'Lançamento manual pela Agenda Mensal',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Não foi possível salvar as horas.');
      }

      // Revalida em background com o banco
      await fetchMonthlyData();
    } catch (error: any) {
      console.warn('Persistência remota em processamento ou offline:', error);
    } finally {
      setIsSavingManual(false);
    }
  };

  // Mapeamento dos 35 a 42 dias para o grid do calendário
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Dom, 1 = Seg...
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Dias do mês anterior
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const dateStr = `${y}-${m}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const dStr = String(i).padStart(2, '0');
      const mStr = String(month + 1).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      days.push({
        dayNumber: i,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Dias do próximo mês para completar semanas
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const dateStr = `${y}-${m}-${String(i).padStart(2, '0')}`;
      days.push({
        dayNumber: i,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [currentDate, todayStr]);

  // Cálculo de intensidade do Heatmap Azul:
  // 0h: neutro
  // >0h e <= 1h: Azul nível 1
  // >1h e <= 2.5h: Azul nível 2
  // >2.5h e <= 4.5h: Azul nível 3
  // >4.5h: Azul nível 4 (azul vívido / mais forte)
  const getBlueIntensityStyle = (hours: number, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) {
      return isDark
        ? 'bg-[#060B14]/40 border-slate-900/40 text-slate-600 opacity-40'
        : 'bg-slate-100/40 border-slate-200/40 text-slate-400 opacity-40';
    }

    if (hours === 0) {
      return isDark
        ? 'bg-[#0B1528]/60 border-blue-950/60 text-slate-400 hover:border-blue-800/60 hover:bg-[#0E1A33]'
        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-slate-50';
    }

    if (hours > 0 && hours <= 1) {
      // Nível 1: Azul Suave
      return isDark
        ? 'bg-blue-950/40 border-blue-800/50 text-blue-300 hover:border-blue-600 shadow-sm'
        : 'bg-blue-50 border-blue-200 text-blue-800 hover:border-blue-300 shadow-sm';
    }

    if (hours > 1 && hours <= 2.5) {
      // Nível 2: Azul Médio
      return isDark
        ? 'bg-blue-900/60 border-blue-600/70 text-blue-100 hover:border-blue-500 shadow-md'
        : 'bg-blue-100 border-blue-300 text-blue-900 hover:border-blue-400 shadow-sm';
    }

    if (hours > 2.5 && hours <= 4.5) {
      // Nível 3: Azul Forte
      return isDark
        ? 'bg-blue-700/80 border-blue-400 text-white hover:border-blue-300 shadow-lg shadow-blue-950/50'
        : 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700 shadow-md';
    }

    // Nível 4: Azul Intenso / Máximo (CBMERJ Oficial)
    return isDark
      ? 'bg-[#0056D2] border-sky-300 text-white font-extrabold shadow-[0_0_20px_rgba(0,86,210,0.6)] hover:border-white'
      : 'bg-[#0056D2] border-blue-800 text-white font-extrabold shadow-[0_0_15px_rgba(0,86,210,0.5)] hover:bg-[#0047B3]';
  };

  // Formatação de minutos para "Xh Ym"
  const formatDurationFriendly = (totalSeconds: number) => {
    const totalMinutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  // Dias com estudo ativo no mês
  const activeDaysCount = useMemo(() => {
    return (Object.values(dailySummaries) as DayStudySummary[]).filter((s) => s && s.totalSeconds > 0).length;
  }, [dailySummaries]);

  // Média diária (baseada em dias com estudo)
  const averageDailyHours = useMemo(() => {
    if (activeDaysCount === 0) return 0;
    return Math.round((monthTotals.totalHours / activeDaysCount) * 10) / 10;
  }, [monthTotals.totalHours, activeDaysCount]);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Banner & Indicador do Heatmap */}
      <div
        className={`p-5 rounded-3xl border shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
          isDark
            ? 'bg-gradient-to-r from-[#0B1528] via-[#070D18] to-[#040810] border-blue-900/40 text-slate-100 shadow-black/40'
            : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/60'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#0056D2]/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold tracking-tight">Agenda Mensal de Horas</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Heatmap Azul
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visualização das horas líquidas cronometradas diariamente. Quanto mais você estuda, mais azul fica o dia.
            </p>
          </div>
        </div>

        {/* Legenda do Heatmap Azul */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-medium text-slate-400">
          <span>Menos</span>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md bg-[#0B1528] border border-blue-950/60" title="0h" />
            <div className="w-4 h-4 rounded-md bg-blue-950/70 border border-blue-800/60" title="Até 1h" />
            <div className="w-4 h-4 rounded-md bg-blue-900/80 border border-blue-600/70" title="1h a 2.5h" />
            <div className="w-4 h-4 rounded-md bg-blue-700/90 border border-blue-400" title="2.5h a 4.5h" />
            <div className="w-4 h-4 rounded-md bg-[#0056D2] border border-sky-300 shadow-[0_0_8px_rgba(0,86,210,0.8)]" title="Mais de 4.5h" />
          </div>
          <span>Mais Azul</span>
        </div>
      </div>

      {/* Cards de Métricas do Mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-4 rounded-2xl border shadow-md flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-blue-900/30' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total no Mês</p>
            <p className="text-2xl font-black mt-0.5 text-blue-400">
              {monthTotals.totalHours}h
            </p>
            <p className="text-[11px] text-slate-500">{monthTotals.totalSessions} sessões registradas</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-md flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-blue-900/30' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dias com Estudo</p>
            <p className="text-2xl font-black mt-0.5 text-emerald-400">
              {activeDaysCount} <span className="text-xs font-normal text-slate-400">dias</span>
            </p>
            <p className="text-[11px] text-slate-500">frequência ativa no mês</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-md flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-blue-900/30' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Média Diária Ativa</p>
            <p className="text-2xl font-black mt-0.5 text-sky-400">
              {averageDailyHours}h<span className="text-xs font-normal text-slate-400">/dia</span>
            </p>
            <p className="text-[11px] text-slate-500">nos dias em que estudou</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border shadow-md flex items-center justify-between ${
            isDark ? 'bg-[#0B1528] border-blue-900/30' : 'bg-white border-slate-200 shadow-slate-100'
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cronômetro Tático</p>
            <button
              onClick={onNavigateToTimer}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0056D2] hover:bg-[#0047B3] text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              <Clock className="w-3 h-3" />
              <span>Abrir Cronômetro</span>
            </button>
            <p className="text-[10px] text-slate-500 mt-1">Conta e persiste no banco</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Calendário Mensal Tático */}
      <div
        className={`rounded-3xl border shadow-2xl overflow-hidden transition-all ${
          isDark
            ? 'bg-[#0B1528] border-blue-900/40 shadow-blue-950/30'
            : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}
      >
        {/* Header de Navegação do Mês */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between flex-wrap gap-3 ${
            isDark ? 'bg-[#070D18] border-blue-900/30' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-black tracking-tight text-slate-100 flex items-center gap-2">
              <span>{MONTH_NAMES[currentDate.getMonth()]}</span>
              <span className="text-blue-400 font-normal">{currentDate.getFullYear()}</span>
            </h3>

            {isLoading && (
              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGoToToday}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Hoje
            </button>

            <button
              onClick={handlePrevMonth}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleNextMonth}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
              title="Próximo Mês"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dias da Semana (DOM a SÁB) */}
        <div
          className={`grid grid-cols-7 border-b text-center text-xs font-bold uppercase tracking-wider py-2.5 ${
            isDark ? 'bg-[#070D18]/70 border-blue-900/30 text-slate-400' : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          {WEEK_DAYS.map((d) => (
            <div key={d} className="truncate">
              {d}
            </div>
          ))}
        </div>

        {/* Grade de Células (Heatmap Azul) */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 p-3 sm:p-5">
          {calendarDays.map((day, idx) => {
            const summary = dailySummaries[day.dateStr];
            const hours = summary ? summary.totalHours : 0;
            const sessionsCount = summary ? summary.sessionsCount : 0;
            const styleClass = getBlueIntensityStyle(hours, day.isCurrentMonth);

            return (
              <div
                key={`${day.dateStr}_${idx}`}
                onClick={() => {
                  if (summary && summary.totalSeconds > 0) setSelectedDaySummary(summary);
                  else if (day.isCurrentMonth) openManualEntry(day.dateStr);
                }}
                className={`min-h-[75px] sm:min-h-[95px] p-2 sm:p-2.5 rounded-2xl border flex flex-col justify-between transition-all select-none relative group cursor-pointer ${styleClass} ${
                  day.isToday ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-[#070D18]' : ''
                }`}
              >
                {/* Header da Célula: Número do Dia + Indicador "Hoje" */}
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs font-extrabold ${
                      day.isToday ? 'text-sky-400' : ''
                    }`}
                  >
                    {day.dayNumber}
                  </span>
                  {day.isToday && (
                    <span className="text-[8px] font-black uppercase tracking-tighter px-1 py-0.2 rounded bg-sky-400 text-slate-950">
                      Hoje
                    </span>
                  )}
                </div>

                {/* Conteúdo Central: Horas líquidas estudadas */}
                <div className="my-auto flex flex-col items-center justify-center text-center">
                  {hours > 0 ? (
                    <>
                      <span className="text-sm sm:text-base font-black tracking-tight drop-shadow-sm">
                        {hours}h
                      </span>
                      <span className="text-[9px] opacity-85 font-medium hidden sm:inline">
                        {sessionsCount} {sessionsCount === 1 ? 'sessão' : 'sessões'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] opacity-30 font-medium">0h</span>
                  )}
                </div>

                {/* Micro indicador se houver matérias */}
                {summary && summary.subjects && summary.subjects.length > 0 && (
                  <div className="w-full flex items-center gap-1 justify-center overflow-hidden">
                    {summary.subjects.slice(0, 3).map((sub, sIdx) => (
                      <span
                        key={sIdx}
                        className="w-1.5 h-1.5 rounded-full bg-white/70"
                        title={`${sub.subjectName}: ${sub.durationHours}h`}
                      />
                    ))}
                    {summary.subjects.length > 3 && (
                      <span className="text-[8px] font-bold opacity-75">+{summary.subjects.length - 3}</span>
                    )}
                  </div>
                )}
                {day.isCurrentMonth && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openManualEntry(day.dateStr);
                    }}
                    className="absolute right-1.5 bottom-1.5 rounded-md p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-black/20 hover:bg-black/30 transition-opacity"
                    title="Adicionar horas manualmente"
                    aria-label={`Adicionar horas em ${day.dateStr}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal / Detalhamento de Sessões do Dia Selecionado */}
      {selectedDaySummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-4 animate-scale-up ${
              isDark ? 'bg-[#0B1528] border-blue-900/60 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#0056D2] text-white flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Estudos em {selectedDaySummary.dateStr}</h3>
                  <p className="text-xs text-blue-400 font-semibold">
                    Total: {selectedDaySummary.totalHours} horas ({formatDurationFriendly(selectedDaySummary.totalSeconds)})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDaySummary(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Disciplinas Estudadas:
              </p>
              {selectedDaySummary.subjects.map((sub, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-[#070D18] border-blue-900/40' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold">{sub.subjectName}</span>
                  </div>
                  <span className="text-xs font-bold text-blue-400">
                    {formatDurationFriendly(sub.durationSeconds)}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={() => openManualEntry(selectedDaySummary.dateStr)}
              className="w-full py-2.5 rounded-xl border border-blue-500/50 text-blue-300 hover:bg-blue-950/50 font-bold text-xs cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5 inline mr-1" />
              Adicionar horas neste dia
            </button>

            <button
              onClick={() => setSelectedDaySummary(null)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer transition-colors"
            >
              Fechar Detalhes
            </button>
          </div>
        </div>
      )}

      {manualDate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleSaveManualEntry}
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl space-y-4 ${
              isDark ? 'bg-[#0B1528] border-blue-900/60 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-700/50 pb-3">
              <div>
                <h3 className="text-sm font-bold">Adicionar horas estudadas</h3>
                <p className="text-xs text-blue-400 font-semibold mt-1">Data: {manualDate}</p>
              </div>
              <button type="button" onClick={() => setManualDate(null)} className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              Matéria
              <select
                value={manualSubjectId}
                onChange={(event) => setManualSubjectId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-blue-900/60 bg-[#0F1D38] px-3 py-2.5 text-xs text-slate-100"
              >
                <option value="">Selecione uma matéria</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-slate-300">
                Horas
                <input type="number" min="0" max="24" value={manualHours} onChange={(event) => setManualHours(event.target.value)} placeholder="Ex.: 5" className="mt-1.5 w-full rounded-xl border border-blue-900/60 bg-[#0F1D38] px-3 py-2.5 text-xs text-slate-100" />
              </label>
              <label className="block text-xs font-semibold text-slate-300">
                Minutos
                <input type="number" min="0" max="59" value={manualMinutes} onChange={(event) => setManualMinutes(event.target.value)} placeholder="Ex.: 30" className="mt-1.5 w-full rounded-xl border border-blue-900/60 bg-[#0F1D38] px-3 py-2.5 text-xs text-slate-100" />
              </label>
            </div>

            <label className="block text-xs font-semibold text-slate-300">
              Assunto (opcional)
              <input type="text" value={manualTopic} onChange={(event) => setManualTopic(event.target.value)} placeholder="Ex.: Equações do 2º grau" className="mt-1.5 w-full rounded-xl border border-blue-900/60 bg-[#0F1D38] px-3 py-2.5 text-xs text-slate-100" />
            </label>

            <button type="submit" disabled={isSavingManual || subjects.length === 0} className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition-colors">
              {isSavingManual ? 'Salvando...' : 'Salvar horas estudadas'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
