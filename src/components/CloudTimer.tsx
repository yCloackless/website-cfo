import { apiFetch } from '../services/apiFetch';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Cloud, CloudOff, Timer, Sparkles } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';

interface TimerState {
  status: 'STOPPED' | 'RUNNING' | 'PAUSED';
  accumulatedTime: number;
  startTime: number | null;
  activeSubjectId?: string;
  activeSubjectName?: string;
  serverTime?: number;
  restAccumulatedMs?: number;
  restStartTime?: number | null;
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
  const [restDisplayMs, setRestDisplayMs] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Offset entre o relógio local do cliente e o relógio do servidor
  const serverOffsetRef = useRef<number>(0);

  // Consulta o estado do cronômetro no servidor
  const fetchTimerStatus = useCallback(async () => {
    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/status');
      if (!res.ok) throw new Error('Falha ao obter status');
      const data = await res.json();

      if (typeof data.serverTime === 'number') {
        serverOffsetRef.current = data.serverTime - Date.now();
      }

      setTimerState(data);
      setIsOnline(true);

      if (data.status === 'RUNNING' && data.startTime) {
        const estimatedServerNow = Date.now() + serverOffsetRef.current;
        const elapsed = data.accumulatedTime + Math.max(0, estimatedServerNow - data.startTime);
        setDisplayMs(elapsed);
      } else if (typeof data.totalElapsedMs === 'number') {
        setDisplayMs(data.totalElapsedMs);
      } else {
        setDisplayMs(data.accumulatedTime || 0);
      }

      const baseRest = typeof data.restAccumulatedMs === 'number' ? data.restAccumulatedMs : (typeof data.totalRestMs === 'number' ? data.totalRestMs : 0);
      if (data.status === 'PAUSED' && data.restStartTime) {
        const estimatedServerNow = Date.now() + serverOffsetRef.current;
        const currentRest = Math.max(0, estimatedServerNow - data.restStartTime);
        setRestDisplayMs(baseRest + currentRest);
      } else {
        setRestDisplayMs(baseRest);
      }

      // Sincroniza estado com a extensão Chrome via ponte instantânea (window + document)
      if (typeof window !== 'undefined') {
        window.postMessage(
          {
            source: 'cfo-web',
            type: 'TIMER_SYNC_FROM_WEB',
            payload: data,
          },
          '*'
        );
        try {
          document.dispatchEvent(
            new CustomEvent('cfo-timer-web-event', {
              detail: {
                source: 'cfo-web',
                type: 'TIMER_SYNC_FROM_WEB',
                payload: data,
              },
            })
          );
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Ouve eventos instantâneos disparados pela extensão Chrome (< 5ms) via postMessage e CustomEvent
  useEffect(() => {
    const handleExtensionData = (ext: any) => {
      if (!ext) return;

      setTimerState((prev) => {
        const nextStatus = ext.status || prev.status;
        const nextAcc = typeof ext.accumulatedTime === 'number'
          ? ext.accumulatedTime
          : (typeof ext.accumulatedMs === 'number' ? ext.accumulatedMs : prev.accumulatedTime);
        const nextRestAcc = typeof ext.restAccumulatedMs === 'number'
          ? ext.restAccumulatedMs
          : (typeof ext.totalRestMs === 'number' ? ext.totalRestMs : prev.restAccumulatedMs || 0);

        const now = Date.now();
        if (nextStatus === 'RUNNING' && ext.startTime) {
          const estimatedServerNow = now + serverOffsetRef.current;
          setDisplayMs(nextAcc + Math.max(0, estimatedServerNow - ext.startTime));
        } else {
          setDisplayMs(nextAcc);
        }

        if (nextStatus === 'PAUSED' && ext.restStartTime) {
          const estimatedServerNow = now + serverOffsetRef.current;
          setRestDisplayMs(nextRestAcc + Math.max(0, estimatedServerNow - ext.restStartTime));
        } else {
          setRestDisplayMs(nextRestAcc);
        }

        return {
          status: nextStatus,
          accumulatedTime: nextAcc,
          startTime: ext.startTime || null,
          restAccumulatedMs: nextRestAcc,
          restStartTime: ext.restStartTime || null,
        };
      });
    };

    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data?.source === 'cfo-extension' && event.data?.type === 'TIMER_SYNC_FROM_EXTENSION') {
        handleExtensionData(event.data.payload);
      }
    };

    const handleCustomExtEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail && detail.source === 'cfo-extension' && detail.type === 'TIMER_SYNC_FROM_EXTENSION') {
        handleExtensionData(detail.payload);
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    document.addEventListener('cfo-timer-ext-event', handleCustomExtEvent);

    return () => {
      window.removeEventListener('message', handleExtensionMessage);
      document.removeEventListener('cfo-timer-ext-event', handleCustomExtEvent);
    };
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

    // Polling calibrado de 3s para sincronização cross-device / fallback
    const syncInterval = setInterval(fetchTimerStatus, 3000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [fetchTimerStatus]);

  // Tick contínuo de exibição quando RUNNING (calculado com compensação de offset)
  useEffect(() => {
    if (timerState.status !== 'RUNNING' || !timerState.startTime) {
      return;
    }

    const interval = setInterval(() => {
      const estimatedServerNow = Date.now() + serverOffsetRef.current;
      const currentElapsed = timerState.accumulatedTime + Math.max(0, estimatedServerNow - (timerState.startTime || estimatedServerNow));
      setDisplayMs(currentElapsed);
    }, 250);

    return () => clearInterval(interval);
  }, [timerState.status, timerState.startTime, timerState.accumulatedTime]);

  // Tick contínuo do cronômetro de descanso quando PAUSED
  useEffect(() => {
    if (timerState.status !== 'PAUSED') {
      return;
    }

    if (!timerState.restStartTime) {
      const nowEstimated = Date.now() + serverOffsetRef.current;
      setTimerState((prev) => ({ ...prev, restStartTime: nowEstimated }));
    }

    const interval = setInterval(() => {
      const estimatedServerNow = Date.now() + serverOffsetRef.current;
      const start = timerState.restStartTime || estimatedServerNow;
      const currentRest = (timerState.restAccumulatedMs || 0) + Math.max(0, estimatedServerNow - start);
      setRestDisplayMs(currentRest);
    }, 100);

    return () => clearInterval(interval);
  }, [timerState.status, timerState.restStartTime, timerState.restAccumulatedMs]);

  // Iniciar contagem no servidor
  const handleStart = async () => {
    const now = Date.now();
    const estimatedServerNow = now + serverOffsetRef.current;

    // Transição otimista imediata
    setTimerState((prev) => {
      const prevRestAcc = prev.restAccumulatedMs || 0;
      const restDelta = prev.status === 'PAUSED' && prev.restStartTime ? Math.max(0, estimatedServerNow - prev.restStartTime) : 0;
      const totalRest = prevRestAcc + restDelta;
      setRestDisplayMs(totalRest);
      return {
        ...prev,
        status: 'RUNNING',
        startTime: estimatedServerNow,
        restStartTime: null,
        restAccumulatedMs: totalRest,
      };
    });

    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          source: 'cfo-web',
          type: 'TIMER_SYNC_FROM_WEB',
          payload: {
            status: 'RUNNING',
            startTime: estimatedServerNow,
            restStartTime: null,
          },
        },
        '*'
      );
    }

    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (typeof data.serverTime === 'number') {
        serverOffsetRef.current = data.serverTime - Date.now();
      }
      setTimerState(data);
      if (typeof window !== 'undefined') {
        window.postMessage({ source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload: data }, '*');
      }
      if (typeof data.totalElapsedMs === 'number') {
        setDisplayMs(data.totalElapsedMs);
      } else {
        const estNow = Date.now() + serverOffsetRef.current;
        setDisplayMs(data.accumulatedTime + (data.startTime ? Math.max(0, estNow - data.startTime) : 0));
      }
      if (typeof data.totalRestMs === 'number') {
        setRestDisplayMs(data.totalRestMs);
      } else {
        setRestDisplayMs(data.restAccumulatedMs || 0);
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Pausar contagem no servidor
  const handlePause = async () => {
    const now = Date.now();
    const currentRestStart = now + serverOffsetRef.current;

    // Transição otimista imediata para início imediato da contagem de descanso
    setTimerState((prev) => {
      const elapsed = prev.startTime ? Math.max(0, currentRestStart - prev.startTime) : 0;
      return {
        ...prev,
        status: 'PAUSED',
        startTime: null,
        restStartTime: currentRestStart,
        accumulatedTime: (prev.accumulatedTime || 0) + elapsed,
        restAccumulatedMs: prev.restAccumulatedMs || 0,
      };
    });

    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          source: 'cfo-web',
          type: 'TIMER_SYNC_FROM_WEB',
          payload: {
            status: 'PAUSED',
            startTime: null,
            restStartTime: currentRestStart,
          },
        },
        '*'
      );
    }

    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (typeof data.serverTime === 'number') {
        serverOffsetRef.current = data.serverTime - Date.now();
      }
      setTimerState(data);
      if (typeof window !== 'undefined') {
        window.postMessage({ source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload: data }, '*');
      }
      setDisplayMs(typeof data.totalElapsedMs === 'number' ? data.totalElapsedMs : (data.accumulatedTime || 0));
      if (typeof data.totalRestMs === 'number') {
        setRestDisplayMs(data.totalRestMs);
      } else if (data.status === 'PAUSED' && data.restStartTime) {
        const estNow = Date.now() + serverOffsetRef.current;
        setRestDisplayMs((data.restAccumulatedMs || 0) + Math.max(0, estNow - data.restStartTime));
      } else {
        setRestDisplayMs(data.restAccumulatedMs || 0);
      }
    } catch (err) {
      setIsOnline(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const [resetModal, setResetModal] = useState<{ isOpen: boolean; minutes: number } | null>(null);

  // Resetar contadores no servidor com modal de confirmação bonito
  const handleResetClick = () => {
    if (displayMs > 60000) {
      const minutes = Math.round(displayMs / 60000);
      setResetModal({ isOpen: true, minutes });
    } else {
      void executeReset(false);
    }
  };

  const executeReset = async (shouldLogTime: boolean = false) => {
    if (shouldLogTime && resetModal && onLogStudyTime) {
      onLogStudyTime(resetModal.minutes);
    }
    setResetModal(null);

    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          source: 'cfo-web',
          type: 'TIMER_SYNC_FROM_WEB',
          payload: {
            status: 'STOPPED',
            accumulatedTime: 0,
            accumulatedMs: 0,
            startTime: null,
            restAccumulatedMs: 0,
            restStartTime: null,
          },
        },
        '*'
      );
    }

    try {
      setIsSyncing(true);
      const res = await apiFetch('/api/timer/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (typeof data.serverTime === 'number') {
        serverOffsetRef.current = data.serverTime - Date.now();
      }
      setTimerState(data);
      if (typeof window !== 'undefined') {
        window.postMessage({ source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload: data }, '*');
      }
      setDisplayMs(0);
      setRestDisplayMs(0);
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

      {/* Display do Cronômetro Digital com indicador de descanso na pausa */}
      <div className="flex items-center gap-1.5">
        <Timer className="w-3.5 h-3.5 text-red-500 shrink-0" />
        <span className="font-mono text-sm sm:text-base font-extrabold text-white tracking-wider tabular-nums">
          {formatTime(displayMs)}
        </span>
        {timerState.status === 'PAUSED' && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-400 font-mono text-xs font-bold animate-pulse"
            title="Pausa em andamento"
          >
            <Pause className="w-3 h-3" />
            <span>{formatTime(restDisplayMs)}</span>
          </span>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center gap-1">
        {isRunning ? (
          <button
            onClick={handlePause}
            title="Pausar Cronômetro (Inicia contagem de descanso)"
            className="p-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleStart}
            title={timerState.status === 'PAUSED' ? 'Retomar Estudo (Finaliza descanso)' : 'Iniciar Estudo Sincronizado'}
            className="p-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
        )}

        <button
          onClick={handleResetClick}
          title="Resetar Cronômetro"
          className="p-1 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-400 hover:text-white border border-zinc-700/40 transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal de Confirmação Personalizado */}
      <ConfirmModal
        isOpen={!!resetModal?.isOpen}
        title="Zerar Cronômetro?"
        description={onLogStudyTime ? "Deseja salvar estes minutos de estudo no seu cronograma antes de zerar?" : "Esta ação irá reiniciar o tempo do cronômetro."}
        badgeText={resetModal ? `⏱️ ${resetModal.minutes} min nesta sessão` : undefined}
        confirmLabel={onLogStudyTime ? "Salvar & Zerar" : "Zerar"}
        cancelLabel="Apenas Zerar"
        variant="warning"
        iconType="reset"
        onConfirm={() => void executeReset(true)}
        onClose={() => void executeReset(false)}
      />
    </div>
  );
};
