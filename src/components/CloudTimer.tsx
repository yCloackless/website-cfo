import { apiFetch } from '../services/apiFetch';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Cloud, CloudOff, Timer, Sparkles } from 'lucide-react';

interface TimerState {
  status: 'STOPPED' | 'RUNNING' | 'PAUSED';
  accumulatedTime: number;
  startTime: number | null;
  activeSubjectId?: string;
  activeSubjectName?: string;
  serverTime?: number;
}

interface CloudTimerProps {
  onLogStudyTime?: (minutes: number) => void;
  className?: string;
}

export const CloudTimer: React.FC<CloudTimerProps> = ({ onLogStudyTime, className = '' }) => {
  const [timerState, setTimerState] = useState<TimerState>({
    status: 'STOPPED',
    accumulatedTime: 0,
    startTime: null,
  });

  const [displayMs, setDisplayMs] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Consulta o estado do cronômetro no servidor
  const fetchTimerStatus = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/status');
      if (!res.ok) throw new Error('Falha ao obter status');
      const data = await res.json();

      setTimerState(data);
      setIsOnline(true);

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

  // Sincronização inicial e ao trocar/focar na aba
  useEffect(() => {
    fetchTimerStatus();

    const handleFocus = () => {
      fetchTimerStatus();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchTimerStatus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Polling de sincronização com o servidor a cada 15 segundos
    const syncInterval = setInterval(fetchTimerStatus, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [fetchTimerStatus]);

  // Tick contínuo de exibição quando RUNNING (calculado via Date.now() - startTime)
  useEffect(() => {
    if (timerState.status !== 'RUNNING' || !timerState.startTime) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const currentElapsed = timerState.accumulatedTime + Math.max(0, now - (timerState.startTime || now));
      setDisplayMs(currentElapsed);
    }, 250);

    return () => clearInterval(interval);
  }, [timerState.status, timerState.startTime, timerState.accumulatedTime]);

  // Iniciar contagem no servidor
  const handleStart = async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Pausar contagem no servidor
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

  // Resetar contadores no servidor
  const handleReset = async () => {
    if (displayMs > 60000 && onLogStudyTime) {
      const minutes = Math.round(displayMs / 60000);
      const confirmLog = window.confirm(`Deseja registrar ${minutes} minutos de estudo no seu cronograma antes de resetar?`);
      if (confirmLog) {
        onLogStudyTime(minutes);
      }
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

  // Formatação de tempo em HH:MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => String(n).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const isRunning = timerState.status === 'RUNNING';

  return (
    <div
      className={`inline-flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-xl border border-red-900/50 bg-black/60 backdrop-blur-md shadow-lg transition-all ${className}`}
    >
      {/* Sincronização & Status da Nuvem */}
      <div className="flex items-center gap-1.5" title={isOnline ? 'Sincronizado na Nuvem (PC e Celular)' : 'Servidor Offline'}>
        <span className="relative flex h-2 w-2">
          {isRunning && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              !isOnline ? 'bg-red-500' : isRunning ? 'bg-emerald-500' : timerState.status === 'PAUSED' ? 'bg-amber-500' : 'bg-zinc-600'
            }`}
          ></span>
        </span>
        {isOnline ? (
          <Cloud className={`w-3.5 h-3.5 ${isRunning ? 'text-emerald-400' : 'text-zinc-500'} ${isSyncing ? 'animate-pulse' : ''}`} />
        ) : (
          <CloudOff className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>

      {/* Display do Cronômetro Digital */}
      <div className="flex items-center gap-1">
        <Timer className="w-3.5 h-3.5 text-red-500 shrink-0" />
        <span className="font-mono text-sm sm:text-base font-extrabold text-white tracking-wider tabular-nums">
          {formatTime(displayMs)}
        </span>
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center gap-1">
        {isRunning ? (
          <button
            onClick={handlePause}
            title="Pausar Cronômetro"
            className="p-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleStart}
            title="Iniciar Estudo Sincronizado"
            className="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        )}

        <button
          onClick={handleReset}
          title="Resetar Cronômetro"
          className="p-1 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-white border border-zinc-700/40 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
