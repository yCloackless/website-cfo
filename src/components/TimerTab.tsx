import { apiFetch } from '../services/apiFetch';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Cloud,
  CloudOff,
  Flame,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { Subject, AppTheme } from '../types';

interface TimerTabProps {
  theme: AppTheme;
  subjects: Subject[];
  onLogStudySession?: (subjectId: string, minutes: number, notes?: string) => void;
  onOpenStudyModal?: (subjectId: string, durationMinutes: number) => void;
  weeklyGoalHours?: number;
}

interface TimerState {
  status: 'STOPPED' | 'RUNNING' | 'PAUSED';
  accumulatedTime: number;
  startTime: number | null;
  activeSubjectId?: string;
  activeSubjectName?: string;
  serverTime?: number;
}

export const TimerTab: React.FC<TimerTabProps> = ({
  theme,
  subjects,
  onLogStudySession,
  onOpenStudyModal,
  weeklyGoalHours = 25,
}) => {
  const isDark = theme === 'dark';

  const [timerState, setTimerState] = useState<TimerState>({
    status: 'STOPPED',
    accumulatedTime: 0,
    startTime: null,
  });

  const [displayMs, setDisplayMs] = useState(0);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id || 'matematica'
  );
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro25' | 'pomodoro50'>('stopwatch');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [sessionSuccessMsg, setSessionSuccessMsg] = useState<string | null>(null);

  // Sincroniza estado com o backend
  const fetchTimerStatus = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/status');
      if (!res.ok) throw new Error('Falha ao obter status');
      const data = await res.json();

      setTimerState(data);
      setIsOnline(true);

      if (data.activeSubjectId) {
        setSelectedSubjectId(data.activeSubjectId);
      }

      const now = Date.now();
      if (data.status === 'RUNNING' && data.startTime) {
        const elapsed = data.accumulatedTime + Math.max(0, now - data.startTime);
        setDisplayMs(elapsed);
      } else {
        setDisplayMs(data.accumulatedTime || 0);
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchTimerStatus();

    const handleFocus = () => fetchTimerStatus();
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchTimerStatus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const syncInterval = setInterval(fetchTimerStatus, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [fetchTimerStatus]);

  // Tick contínuo em tempo real
  useEffect(() => {
    if (timerState.status !== 'RUNNING' || !timerState.startTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const currentElapsed =
        timerState.accumulatedTime + Math.max(0, now - (timerState.startTime || now));
      setDisplayMs(currentElapsed);
    }, 100);

    return () => clearInterval(interval);
  }, [timerState.status, timerState.startTime, timerState.accumulatedTime]);

  const activeSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || subjects[0];
  }, [subjects, selectedSubjectId]);

  // Iniciar
  const handleStart = async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: activeSubject?.id,
          subjectName: activeSubject?.name,
        }),
      });
      const data = await res.json();
      setTimerState(data);
      const now = Date.now();
      setDisplayMs(data.accumulatedTime + (data.startTime ? Math.max(0, now - data.startTime) : 0));
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Pausar
  const handlePause = async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setTimerState(data);
      setDisplayMs(data.accumulatedTime || 0);
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Resetar
  const handleReset = async () => {
    if (displayMs > 60000) {
      const minutes = Math.round(displayMs / 60000);
      const confirmReset = window.confirm(
        `Deseja zerar o cronômetro? Foram contabilizados ${minutes} minutos nesta sessão.`
      );
      if (!confirmReset) return;
    }

    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setTimerState(data);
      setDisplayMs(0);
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Salvar sessão direto no cronograma
  const handleSaveToSchedule = () => {
    const minutes = Math.max(1, Math.round(displayMs / 60000));
    if (onLogStudySession && activeSubject) {
      onLogStudySession(activeSubject.id, minutes, `Estudo registrado via Cronômetro de Foco`);
      setSessionSuccessMsg(`Sessão de ${minutes} min registrada em ${activeSubject.name}!`);
      setTimeout(() => setSessionSuccessMsg(null), 5000);
    } else {
      setSessionSuccessMsg(`Sessão de ${minutes} min salva com sucesso!`);
      setTimeout(() => setSessionSuccessMsg(null), 4000);
    }
  };

  // Formatação HH:MM:SS
  const totalSeconds = Math.floor(displayMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((displayMs % 1000) / 100);

  const pad = (n: number) => String(n).padStart(2, '0');

  const isRunning = timerState.status === 'RUNNING';
  const isPaused = timerState.status === 'PAUSED';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Banner de Status e Sincronização */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md transition-all ${
          isDark
            ? 'bg-[#0B1528] border-blue-900/40 text-slate-200 shadow-black/40'
            : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Cronômetro Tático de Foco
              {isRunning && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                  EM ANDAMENTO
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">
              Contagem de horas líquidas sincronizada em tempo real entre computador e celular.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isOnline ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Cloud className="w-3.5 h-3.5" />
              <span>Nuvem Conectada</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <CloudOff className="w-3.5 h-3.5" />
              <span>Modo Local</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Focus Room Card */}
      <div
        className={`p-8 sm:p-12 rounded-3xl border relative overflow-hidden flex flex-col items-center justify-center text-center transition-all ${
          isDark
            ? 'bg-gradient-to-b from-[#0B1528] via-[#070D18] to-[#040810] border-blue-900/50 shadow-2xl shadow-blue-950/30'
            : 'bg-gradient-to-b from-white via-slate-50 to-blue-50/30 border-slate-200 shadow-xl'
        }`}
      >
        {/* Background Ambient Glow */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            background: isRunning
              ? 'radial-gradient(circle at 50% 40%, rgba(0, 86, 210, 0.4) 0%, transparent 65%)'
              : 'radial-gradient(circle at 50% 40%, rgba(0, 86, 210, 0.15) 0%, transparent 65%)',
          }}
        />

        {/* Feedback Alert */}
        {sessionSuccessMsg && (
          <div className="mb-6 p-3 px-5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fade-in shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{sessionSuccessMsg}</span>
          </div>
        )}

        {/* Matéria Ativa Selector */}
        <div className="mb-6 w-full max-w-xs relative z-10">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Disciplina em Estudo
          </label>
          <div className="relative">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={isRunning}
              className={`w-full py-2.5 pl-4 pr-10 rounded-xl text-xs font-bold border transition-all appearance-none cursor-pointer ${
                isDark
                  ? 'bg-[#0F1D38] border-blue-900/60 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
              } ${isRunning ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Big Digital Display */}
        <div className="relative my-4 z-10 select-none">
          <div
            className={`font-mono font-extrabold tracking-tight text-5xl sm:text-7xl md:text-8xl flex items-baseline justify-center drop-shadow-lg ${
              isRunning
                ? 'text-white'
                : isPaused
                ? 'text-sky-300'
                : isDark
                ? 'text-slate-300'
                : 'text-slate-800'
            }`}
          >
            <span>{pad(hours)}</span>
            <span className="text-blue-500/80 mx-1 sm:mx-2 animate-pulse">:</span>
            <span>{pad(minutes)}</span>
            <span className="text-blue-500/80 mx-1 sm:mx-2 animate-pulse">:</span>
            <span>{pad(seconds)}</span>
            <span className="text-sm sm:text-2xl font-semibold text-slate-500 ml-2">.{tenths}</span>
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning
                  ? 'bg-blue-500 animate-ping'
                  : isPaused
                  ? 'bg-blue-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {isRunning
                ? `Foco Ativo em ${activeSubject?.name || 'Estudos'}`
                : isPaused
                ? 'Cronômetro em Pausa'
                : 'Pronto para Iniciar'}
            </span>
          </div>
        </div>

        {/* Primary Controls */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 relative z-10">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={isSyncing}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold text-sm tracking-wider uppercase shadow-[0_10px_30px_rgba(0,86,210,0.4)] hover:shadow-[0_15px_35px_rgba(0,86,210,0.6)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>{displayMs > 0 ? 'RETOMAR ESTUDO' : 'INICIAR ESTUDO'}</span>
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={isSyncing}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 hover:from-blue-600 hover:to-indigo-500 text-white font-bold text-sm tracking-wider uppercase shadow-[0_10px_30px_rgba(30,58,138,0.5)] hover:shadow-[0_15px_35px_rgba(30,58,138,0.7)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-5 h-5 fill-current" />
              <span>PAUSAR CRONÔMETRO</span>
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={isSyncing || displayMs === 0}
            className={`inline-flex items-center gap-2 px-5 py-4 rounded-2xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>ZERAR</span>
          </button>

          {/* Botão de Finalizar e Abrir Modal com Submatérias */}
          <button
            onClick={async () => {
              if (isRunning) {
                await handlePause();
              }
              const mins = Math.max(1, Math.round(displayMs / 60000));
              if (onOpenStudyModal && activeSubject) {
                onOpenStudyModal(activeSubject.id, mins);
              } else {
                handleSaveToSchedule();
              }
            }}
            className="inline-flex items-center gap-2.5 px-7 py-4 rounded-2xl bg-[#0056D2] hover:bg-[#0047B3] text-white text-xs font-extrabold uppercase tracking-wider shadow-[0_10px_25px_rgba(0,86,210,0.5)] hover:shadow-[0_15px_35px_rgba(0,86,210,0.7)] transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <CheckCircle2 className="w-4 h-4 text-sky-300" />
            <span>CONCLUIR &amp; REGISTRAR NO CRONOGRAMA →</span>
          </button>
        </div>

        {/* Dica de produtividade */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center justify-center gap-2 text-slate-400 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>
            Dica de Oficial: Mantenha blocos de 50 minutos de estudo intenso com 10 minutos de intervalo.
          </span>
        </div>
      </div>
    </div>
  );
};
