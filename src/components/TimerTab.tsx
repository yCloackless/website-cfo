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
import { ConfirmModal } from './ConfirmModal';
import {
  StopwatchState,
  StopwatchStatus,
  transitionStopwatchState,
  switchStopwatchSubject,
  getElapsedStudyMs,
  getElapsedRestMs,
} from '../utils/stopwatchState';

interface TimerTabProps {
  theme: AppTheme;
  subjects: Subject[];
  onLogStudySession?: (subjectId: string, minutes: number, notes?: string) => void;
  onOpenStudyModal?: (subjectId: string, durationMinutes: number) => void;
  isFloating?: boolean;
  onNavigateToTimer?: () => void;
  weeklyGoalHours?: number;
}

interface TimerInterval {
  type: 'study' | 'rest';
  durationMs: number;
  startTime: number;
  endTime: number;
  subjectId?: string;
}

interface TimerState {
  status: 'STOPPED' | 'RUNNING' | 'PAUSED';
  studySessionId?: string;
  accumulatedTime: number;
  startTime: number | null;
  activeSubjectId?: string;
  activeSubjectName?: string;
  serverTime?: number;
  restAccumulatedMs?: number;
  restStartTime?: number | null;
  intervals?: TimerInterval[];
}

export const TimerTab: React.FC<TimerTabProps> = ({
  theme,
  subjects,
  onOpenStudyModal,
  isFloating = false,
  onNavigateToTimer,
  weeklyGoalHours = 25,
}) => {
  const isDark = theme === 'dark';

  const [timerState, setTimerState] = useState<TimerState>({
    status: 'STOPPED',
    accumulatedTime: 0,
    startTime: null,
  });

  const [displayMs, setDisplayMs] = useState(0);
  const [restDisplayMs, setRestDisplayMs] = useState(0);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    subjects[0]?.id || 'matematica'
  );
  const [selectedMode, setSelectedMode] = useState<'stopwatch' | 'pomodoro25' | 'pomodoro50'>('stopwatch');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [sessionSuccessMsg, setSessionSuccessMsg] = useState<string | null>(null);
  const [todayTotalSeconds, setTodayTotalSeconds] = useState(0);
  const [todayPerSubject, setTodayPerSubject] = useState<Record<string, number>>({});

  const formatDurationHMS = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const fetchTodayStudySessions = useCallback(async () => {
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const today = `${y}-${m}-${d}`;
      const res = await apiFetch(`/api/study-sessions/day/${today}?_t=${Date.now()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.totalSeconds === 'number') {
        setTodayTotalSeconds(data.totalSeconds);
      }
      if (data.bySubject) {
        const perSub: Record<string, number> = {};
        for (const [subId, val] of Object.entries(data.bySubject as Record<string, any>)) {
          perSub[subId] = Number(val.durationSeconds) || 0;
        }
        setTodayPerSubject(perSub);
      } else if (Array.isArray(data.sessions)) {
        const totalSec = data.sessions.reduce((acc: number, s: any) => acc + (Number(s.durationSeconds) || 0), 0);
        const perSub: Record<string, number> = {};
        for (const s of data.sessions) {
          perSub[s.subjectId] = (perSub[s.subjectId] || 0) + (Number(s.durationSeconds) || 0);
        }
        setTodayTotalSeconds(totalSec);
        setTodayPerSubject(perSub);
      }
    } catch {
      // offline fallback
    }
  }, []);

  useEffect(() => {
    fetchTodayStudySessions();
    const handleSync = () => fetchTodayStudySessions();
    window.addEventListener('cfo:study-sessions-saved', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      window.removeEventListener('cfo:study-sessions-saved', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [fetchTodayStudySessions]);

  // Offset entre o relógio local do cliente e o relógio do servidor
  const serverOffsetRef = useRef<number>(0);
  // Identificador único da aba para neutralizar loops de eco com a extensão
  const clientInstanceIdRef = useRef<string>(
    `cfo_tab_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`
  );
  // Revisão sequencial de ações do usuário: descarta respostas HTTP antigas out-of-order
  const actionRevisionRef = useRef<number>(0);
  const lastUserActionTimeRef = useRef<number>(0);

  // Timestamps de guarda para consistência de foco
  const lastPauseActionTimeRef = useRef<number>(0);
  const lastStartActionTimeRef = useRef<number>(0);
  const lastResetActionTimeRef = useRef<number>(0);
  const mutationPendingRef = useRef(false);
  const syncRevisionRef = useRef(0);
  const lastExtensionSyncAtRef = useRef(0);
  const latestExtensionTimerRef = useRef<any>(null);

  // Referência síncrona ao estado atual para os tickers e callbacks
  const timerStateRef = useRef<TimerState>(timerState);
  useEffect(() => {
    timerStateRef.current = timerState;
  }, [timerState]);

  const [floatingPosition, setFloatingPosition] = useState(() => {
    try {
      const saved = window.localStorage.getItem('study-timer-floating-position');
      return saved ? (JSON.parse(saved) as { right: number; bottom: number }) : { right: 20, bottom: 20 };
    } catch {
      return { right: 20, bottom: 20 };
    }
  });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; right: number; bottom: number } | null>(null);

  const handleFloatingPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      right: floatingPosition.right,
      bottom: floatingPosition.bottom,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleFloatingPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = {
      right: Math.max(8, Math.min(window.innerWidth - 190, drag.right - (event.clientX - drag.startX))),
      bottom: Math.max(8, Math.min(window.innerHeight - 54, drag.bottom - (event.clientY - drag.startY))),
    };
    setFloatingPosition(next);
  };

  const handleFloatingPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      window.localStorage.setItem('study-timer-floating-position', JSON.stringify(floatingPosition));
    } catch {
      // Posição flutuante opcional
    }
  };

  // Emite estado atual para a extensão Chrome com tag de cliente para neutralizar ecos
  const emitToExtension = useCallback((stateToEmit: any) => {
    if (typeof window === 'undefined') return;
    const payload = {
      ...stateToEmit,
      serverOffset: serverOffsetRef.current,
      sourceClientId: clientInstanceIdRef.current,
    };
    window.postMessage({ source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload }, '*');
    try {
      document.dispatchEvent(
        new CustomEvent('cfo-timer-web-event', {
          detail: { source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload },
        })
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Sincroniza estado com o backend (polling de contingência e foco)
  const fetchTimerStatus = useCallback(async () => {
    // Se o usuário interagiu nos últimos 3.5 segundos, não sobrescreve a ação otimista
    if (Date.now() - lastUserActionTimeRef.current < 3500) return;
    const revision = syncRevisionRef.current;
    try {
      const res = await apiFetch('/api/timer/status');
      if (!res.ok) throw new Error('Falha ao obter status');
      const data = await res.json();
      if (Date.now() - lastUserActionTimeRef.current < 3500 || revision !== syncRevisionRef.current) return;

      const extensionTimer = latestExtensionTimerRef.current;
      const cloudStartTime = Number(data.startTime);
      const pauseRefTime = Number(extensionTimer?.restStartTime || timerStateRef.current.restStartTime);
      const resetRefTime = Number(extensionTimer?.resetAt || lastResetActionTimeRef.current);

      // Se o cronômetro local ou da extensão está STOPPED (resetado), snapshots RUNNING ou PAUSED antigos não podem reverter!
      if (
        (timerStateRef.current.status === 'STOPPED' || extensionTimer?.status === 'STOPPED') &&
        (data.status === 'RUNNING' || data.status === 'PAUSED') &&
        (
          (Number.isFinite(cloudStartTime) && Number.isFinite(resetRefTime) && cloudStartTime <= resetRefTime) ||
          Date.now() - lastResetActionTimeRef.current < 5000
        )
      ) {
        return;
      }

      if (
        (timerStateRef.current.status === 'PAUSED' || extensionTimer?.status === 'PAUSED') &&
        data.status === 'RUNNING' &&
        Number.isFinite(cloudStartTime) &&
        Number.isFinite(pauseRefTime) &&
        cloudStartTime <= pauseRefTime
      ) {
        return;
      }

      const currentStudyStart = Number(extensionTimer?.startTime || timerStateRef.current.startTime);
      const cloudRestTime = Number(data.restStartTime);
      if (
        (timerStateRef.current.status === 'RUNNING' || extensionTimer?.status === 'RUNNING') &&
        data.status === 'PAUSED' &&
        ((Number.isFinite(cloudRestTime) && Number.isFinite(currentStudyStart) && cloudRestTime <= currentStudyStart) ||
          Date.now() - lastStartActionTimeRef.current < 4000)
      ) {
        return;
      }

      if (
        Date.now() - lastExtensionSyncAtRef.current < 4000 &&
        extensionTimer &&
        (data.status !== extensionTimer.status ||
          Number(data.accumulatedTime) < Number(extensionTimer.accumulatedTime ?? extensionTimer.accumulatedMs ?? 0) ||
          (extensionTimer.status === 'RUNNING' && data.startTime !== extensionTimer.startTime))
      ) {
        return;
      }

      if (typeof data.serverTime === 'number') {
        serverOffsetRef.current = data.serverTime - Date.now();
      }

      if (Date.now() - lastPauseActionTimeRef.current < 4000 && data.status === 'RUNNING') return;
      if (Date.now() - lastStartActionTimeRef.current < 4000 && data.status === 'PAUSED') return;

      setTimerState(data);
      setIsOnline(true);

      // Não sobrescreve a matéria se o usuário acabou de trocar
      if (data.activeSubjectId && Date.now() - lastUserActionTimeRef.current >= 4000) {
        setSelectedSubjectId(data.activeSubjectId);
      }

      const estimatedServerNow = Date.now() + serverOffsetRef.current;
      if (data.status === 'RUNNING' && data.startTime) {
        setDisplayMs(getElapsedStudyMs(data as any, estimatedServerNow));
      } else if (typeof data.totalElapsedMs === 'number') {
        setDisplayMs(data.totalElapsedMs);
      } else {
        setDisplayMs(data.accumulatedTime || 0);
      }

      if (data.status === 'PAUSED') {
        setRestDisplayMs(getElapsedRestMs(data as any, estimatedServerNow));
      } else {
        setRestDisplayMs(typeof data.restAccumulatedMs === 'number' ? data.restAccumulatedMs : (data.totalRestMs || 0));
      }

      emitToExtension(data);
    } catch {
      setIsOnline(false);
    }
  }, [emitToExtension]);

  // Ouve eventos instantâneos disparados pela extensão Chrome (< 5ms) via postMessage e CustomEvent
  useEffect(() => {
    const handleExtensionData = (ext: any) => {
      if (!ext) return;
      // NEUTRALIZAÇÃO DE ECO: se o evento veio desta mesma aba, ignora para não redisparar requisições
      if (ext.sourceClientId === clientInstanceIdRef.current) {
        return;
      }

      const accumulatedTime = ext.accumulatedTime ?? ext.accumulatedMs;
      if (!['RUNNING', 'PAUSED', 'STOPPED'].includes(ext.status) || !Number.isFinite(accumulatedTime)) return;
      syncRevisionRef.current += 1;
      lastExtensionSyncAtRef.current = Date.now();
      latestExtensionTimerRef.current = ext;

      if (ext.status === 'PAUSED' && timerStateRef.current.status !== 'PAUSED') {
        lastPauseActionTimeRef.current = Date.now();
        lastStartActionTimeRef.current = 0;
        // Persiste a pausa no backend usando a sessão autenticada com cookies da aba web
        apiFetch('/api/timer/pause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accumulatedTime }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((serverData) => {
            if (serverData && serverData.status === 'PAUSED') {
              setTimerState(serverData);
            }
          })
          .catch(() => {});
      } else if (ext.status === 'RUNNING' && timerStateRef.current.status !== 'RUNNING') {
        lastStartActionTimeRef.current = Date.now();
        lastPauseActionTimeRef.current = 0;
        // Persiste o início/retomada no backend usando a sessão autenticada com cookies da aba web
        apiFetch('/api/timer/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId: ext.activeSubjectId || ext.subjectId,
            subjectName: ext.activeSubjectName || ext.subjectName,
            accumulatedTime,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((serverData) => {
            if (serverData && serverData.status === 'RUNNING') {
              setTimerState(serverData);
            }
          })
          .catch(() => {});
      } else if (ext.status === 'STOPPED') {
        lastResetActionTimeRef.current = Date.now();
        lastStartActionTimeRef.current = 0;
        lastPauseActionTimeRef.current = 0;
        // Persiste o reset no backend usando a sessão autenticada com cookies da aba web
        apiFetch('/api/timer/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((serverData) => {
            if (serverData && serverData.status === 'STOPPED') {
              setTimerState(serverData);
            }
          })
          .catch(() => {});
      }

      if (Number.isFinite(ext.serverOffset)) serverOffsetRef.current = ext.serverOffset;
      const now = Date.now() + serverOffsetRef.current;
      setTimerState((prev) => ({
        ...prev,
        ...ext,
        accumulatedTime,
        activeSubjectId: ext.activeSubjectId || ext.subjectId || prev.activeSubjectId,
        activeSubjectName: ext.activeSubjectName || ext.subjectName || prev.activeSubjectName,
      }));
      setDisplayMs(getElapsedStudyMs({ ...ext, accumulatedTime }, now));
      setRestDisplayMs(getElapsedRestMs(ext, now));
      if (ext.subjectId || ext.activeSubjectId) {
        setSelectedSubjectId(ext.subjectId || ext.activeSubjectId);
      }
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

    // Auto-pareia token com a extensão se autenticado
    try {
      const session = localStorage.getItem('cfo_terminal_session');
      if (session && session !== 'cookie') {
        window.postMessage(
          {
            source: 'cfo-web',
            type: 'AUTH_SESSION_SYNC',
            payload: { token: session, serverUrl: window.location.origin },
          },
          '*'
        );
      }
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener('message', handleExtensionMessage);
      document.removeEventListener('cfo-timer-ext-event', handleCustomExtEvent);
    };
  }, []);

  useEffect(() => {
    fetchTimerStatus();

    const handleFocus = () => fetchTimerStatus();
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchTimerStatus();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Polling minimizado de 3s para sincronização cross-device / fallback
    const syncInterval = setInterval(fetchTimerStatus, 3000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(syncInterval);
    };
  }, [fetchTimerStatus]);

  // Único ticker unificado e estável: não reconstrói o interval a cada mudança de estado
  useEffect(() => {
    if (timerState.status === 'STOPPED') {
      setDisplayMs(0);
      setRestDisplayMs(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now() + serverOffsetRef.current;
      const current = timerStateRef.current;
      if (current.status === 'RUNNING') {
        setDisplayMs(getElapsedStudyMs(current as any, now));
      } else if (current.status === 'PAUSED') {
        setRestDisplayMs(getElapsedRestMs(current as any, now));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [timerState.status]);

  const activeSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || subjects[0];
  }, [subjects, selectedSubjectId]);

  // Transição atômica de troca de matéria com resposta visual instantânea (< 10ms)
  const handleSubjectChange = (subjectId: string) => {
    const subject = subjects.find((item) => item.id === subjectId);
    if (!subject) return;

    setSelectedSubjectId(subject.id);
    const now = Date.now() + serverOffsetRef.current;
    const current = timerStateRef.current;
    const next = switchStopwatchSubject(current as any, { id: subject.id, name: subject.name }, now);

    const actionRev = ++actionRevisionRef.current;
    lastUserActionTimeRef.current = Date.now();

    setTimerState(next as any);
    emitToExtension(next);

    apiFetch('/api/timer/subject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId: subject.id, subjectName: subject.name }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao trocar disciplina');
        return res.json();
      })
      .then((data) => {
        if (actionRev !== actionRevisionRef.current) return;
        setTimerState((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {
        setIsOnline(false);
      });
  };

  // Iniciar / Retomar: resposta visual instantânea (otimista) sem bloqueio de cliques
  const handleStart = () => {
    const now = Date.now() + serverOffsetRef.current;
    const current = timerStateRef.current;
    const next = transitionStopwatchState(current as any, 'RUNNING', now, {
      id: activeSubject?.id,
      name: activeSubject?.name,
    });
    if (!next) return;

    const actionRev = ++actionRevisionRef.current;
    lastUserActionTimeRef.current = Date.now();
    lastStartActionTimeRef.current = Date.now();
    lastPauseActionTimeRef.current = 0;

    setTimerState(next as any);
    setDisplayMs(getElapsedStudyMs(next as any, now));
    emitToExtension(next);

    apiFetch('/api/timer/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId: activeSubject?.id,
        subjectName: activeSubject?.name,
        accumulatedTime: next.accumulatedTime,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao sincronizar cronômetro');
        return res.json();
      })
      .then((data) => {
        if (actionRev !== actionRevisionRef.current) return;
        if (typeof data.serverTime === 'number') {
          serverOffsetRef.current = data.serverTime - Date.now();
        }
        setTimerState((prev) => ({ ...prev, ...data }));
        emitToExtension(data);
      })
      .catch(() => {
        setIsOnline(false);
      });
  };

  // Pausar: resposta visual instantânea (otimista) sem bloqueio de cliques
  const handlePause = () => {
    const now = Date.now() + serverOffsetRef.current;
    const current = timerStateRef.current;
    const next = transitionStopwatchState(current as any, 'PAUSED', now);
    if (!next) return;

    const actionRev = ++actionRevisionRef.current;
    lastUserActionTimeRef.current = Date.now();
    lastPauseActionTimeRef.current = Date.now();
    lastStartActionTimeRef.current = 0;

    setTimerState(next as any);
    setDisplayMs(next.accumulatedTime);
    setRestDisplayMs(next.restAccumulatedMs || 0);
    emitToExtension(next);

    apiFetch('/api/timer/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accumulatedTime: next.accumulatedTime }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao sincronizar cronômetro');
        return res.json();
      })
      .then((data) => {
        if (actionRev !== actionRevisionRef.current) return;
        if (typeof data.serverTime === 'number') {
          serverOffsetRef.current = data.serverTime - Date.now();
        }
        setTimerState((prev) => ({ ...prev, ...data }));
        emitToExtension(data);
      })
      .catch(() => {
        setIsOnline(false);
      });
  };

  const [resetModal, setResetModal] = useState<{ isOpen: boolean; minutes: number } | null>(null);

  // Resetar com modal de confirmação personalizado de alto padrão
  const handleResetClick = () => {
    if (displayMs > 60000) {
      const minutes = Math.round(displayMs / 60000);
      setResetModal({ isOpen: true, minutes });
    } else {
      executeReset();
    }
  };

  const executeReset = () => {
    setResetModal(null);
    lastResetActionTimeRef.current = Date.now();
    lastStartActionTimeRef.current = 0;
    lastPauseActionTimeRef.current = 0;
    const now = Date.now() + serverOffsetRef.current;
    const next = transitionStopwatchState(timerStateRef.current as any, 'STOPPED', now);
    if (!next) return;

    const actionRev = ++actionRevisionRef.current;
    lastUserActionTimeRef.current = Date.now();

    setTimerState(next as any);
    setDisplayMs(0);
    setRestDisplayMs(0);
    emitToExtension(next);

    apiFetch('/api/timer/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao resetar cronômetro');
        return res.json();
      })
      .then((data) => {
        if (actionRev !== actionRevisionRef.current) return;
        setTimerState(data);
        emitToExtension(data);
      })
      .catch(() => {
        setIsOnline(false);
      });
  };

  // Salvar sessão direto no banco de dados e sincronizar com cronograma
  const [isSavingDb, setIsSavingDb] = useState(false);

  const handleSaveToDatabase = async () => {
    const durationSeconds = Math.max(1, Math.round(displayMs / 1000));
    const mins = Math.round(durationSeconds / 60);
    const studySessionId = timerStateRef.current.studySessionId || timerState.studySessionId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined);
    if (!studySessionId) {
      alert('Não foi possível identificar esta sessão. Inicie o cronômetro novamente antes de salvar.');
      return;
    }

    try {
      setIsSavingDb(true);
      if (isRunning) {
        await handlePause();
      }

      const res = await apiFetch('/api/timer/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studySessionId,
          durationSeconds,
          subjectId: activeSubject?.id,
          subjectName: activeSubject?.name,
          notes: `Sessão cronometrada em ${activeSubject?.name || 'Estudo Geral'}`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Falha ao gravar sessão no banco');
      }

      const data = await res.json();
      if (data.timerState) {
        setTimerState(data.timerState);
      }
      setDisplayMs(0);
      setRestDisplayMs(0);

      await fetchTodayStudySessions();
      window.dispatchEvent(new Event('cfo:study-sessions-saved'));

      setSessionSuccessMsg(
        durationSeconds < 60
          ? `Sessão de ${durationSeconds}s salva com sucesso no Banco de Dados e contabilizada na sua Agenda!`
          : `Sessão de ${mins} min salva com sucesso no Banco de Dados e contabilizada na sua Agenda!`
      );
      setTimeout(() => setSessionSuccessMsg(null), 6000);
    } catch (err: any) {
      console.error('Falha ao salvar sessão no banco:', err);
      alert(err.message || 'Erro ao salvar estudo no banco de dados.');
    } finally {
      setIsSavingDb(false);
    }
  };

  // Formatação HH:MM:SS
  const totalSeconds = Math.floor(displayMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((displayMs % 1000) / 100);

  const pad = (n: number) => String(n).padStart(2, '0');

  // Formatação de Descanso e Métricas de Balanço
  const restTotalSeconds = Math.floor(restDisplayMs / 1000);
  const restHours = Math.floor(restTotalSeconds / 3600);
  const restMinutes = Math.floor((restTotalSeconds % 3600) / 60);
  const restSecs = restTotalSeconds % 60;
  const formattedRestTime = restHours > 0
    ? `${pad(restHours)}:${pad(restMinutes)}:${pad(restSecs)}`
    : `${pad(restMinutes)}:${pad(restSecs)}`;

  const totalCycleMs = displayMs + restDisplayMs;
  const focusPercentage = totalCycleMs > 0 ? Math.round((displayMs / totalCycleMs) * 100) : 100;
  const restPercentage = 100 - focusPercentage;

  const tenMinsMs = 10 * 60 * 1000;
  const twentyMinsMs = 20 * 60 * 1000;
  let restZone: 'green' | 'amber' | 'red' = 'green';
  let restZoneLabel = 'Recuperação Ativa';
  let restZoneDesc = 'Pausa ideal para assimilação e oxigenação mental.';

  if (restDisplayMs >= twentyMinsMs) {
    restZone = 'red';
    restZoneLabel = 'Dispersão Detectada';
    restZoneDesc = 'Descanso prolongado detectado. Retome o foco para manter o rendimento da missão!';
  } else if (restDisplayMs >= tenMinsMs) {
    restZone = 'amber';
    restZoneLabel = 'Limite Operacional';
    restZoneDesc = 'Atenção: Seu ritmo de estudo está esfriando. Prepare-se para retornar.';
  }

  const isRunning = timerState.status === 'RUNNING';
  const isPaused = timerState.status === 'PAUSED';

  // Atualiza título da aba do navegador para visibilidade contínua em tempo real fora da aplicação
  useEffect(() => {
    const originalTitle = 'Cronograma CFO CBMERJ';
    if (isRunning) {
      document.title = `▶ [${pad(hours)}:${pad(minutes)}:${pad(seconds)}] ${activeSubject?.name || 'Estudo'} · CFO`;
    } else if (isPaused) {
      document.title = `☕ [${formattedRestTime} Descanso] ${activeSubject?.name || 'Estudo'} · CFO`;
    } else {
      document.title = originalTitle;
    }
    return () => {
      document.title = originalTitle;
    };
  }, [isRunning, isPaused, hours, minutes, seconds, formattedRestTime, activeSubject?.name]);

  if (isFloating) {
    // Exibe o relógio minimizado no canto se o cronômetro estiver em andamento ou em pausa
    const isSessionActive = isRunning || isPaused;
    if (!isSessionActive) {
      return null;
    }

    return (
      <div
        className={`fixed z-[70] flex items-center gap-2 rounded-2xl border px-3 py-2 shadow-2xl backdrop-blur-xl select-none cursor-grab active:cursor-grabbing ${
          isDark ? 'border-blue-500/40 bg-[#081326]/95 text-white' : 'border-slate-300 bg-white/95 text-slate-800'
        }`}
        style={{ right: floatingPosition.right, bottom: floatingPosition.bottom, touchAction: 'none' }}
        onPointerDown={handleFloatingPointerDown}
        onPointerMove={handleFloatingPointerMove}
        onPointerUp={handleFloatingPointerUp}
        onPointerCancel={handleFloatingPointerUp}
        title="Arraste para mover o cronômetro"
      >
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${
          isRunning
            ? 'bg-emerald-400 animate-pulse'
            : isPaused
            ? restZone === 'red'
              ? 'bg-red-400 animate-ping'
              : restZone === 'amber'
              ? 'bg-amber-400'
              : 'bg-emerald-400 animate-pulse'
            : 'bg-slate-400'
        }`} />

        {isPaused ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStart}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs font-bold border transition-all cursor-pointer ${
                restZone === 'red'
                  ? 'bg-red-500/20 border-red-500/50 text-red-300 animate-pulse'
                  : restZone === 'amber'
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              }`}
              title="Clique para retomar o foco"
              aria-label="Retomar foco"
            >
              <Pause className="w-3 h-3" />
              <span>{formattedRestTime}</span>
            </button>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              ({pad(hours)}:{pad(minutes)}:{pad(seconds)})
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={isRunning ? handlePause : handleStart}
            className="flex items-center gap-2 rounded-lg px-1 py-1 font-mono text-base font-bold hover:bg-white/10 cursor-pointer"
            aria-label={isRunning ? 'Pausar cronômetro' : 'Iniciar cronômetro'}
          >
            {pad(hours)}:{pad(minutes)}:{pad(seconds)}
          </button>
        )}

        <button
          type="button"
          onClick={onNavigateToTimer}
          className="rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-300 hover:bg-blue-500/15 cursor-pointer"
          aria-label="Abrir cronômetro completo"
        >
          Abrir
        </button>
      </div>
    );
  }

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
        className={`p-4 sm:p-8 md:p-12 rounded-2xl sm:rounded-3xl border relative overflow-hidden flex flex-col items-center justify-center text-center transition-all ${
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
              onChange={(e) => handleSubjectChange(e.target.value)}
              className={`w-full py-2.5 pl-4 pr-10 rounded-xl text-xs font-bold border transition-all appearance-none cursor-pointer ${
                isDark
                  ? 'bg-[#0F1D38] border-blue-900/60 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  : 'bg-white border-slate-300 text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600'
              }`}
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

        {/* Métricas Consolidadas do Dia (Single Source of Truth) */}
        <div className="mb-4 w-full max-w-md grid grid-cols-2 gap-2.5 relative z-10">
          <div
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
              isDark ? 'bg-[#0B1528]/80 border-blue-900/40 text-slate-200' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Estudado Hoje</span>
            <span className="font-mono font-extrabold text-sm sm:text-base text-blue-400 mt-0.5">
              {formatDurationHMS(todayTotalSeconds)}
            </span>
          </div>

          <div
            className={`p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all ${
              isDark ? 'bg-[#0B1528]/80 border-blue-900/40 text-slate-200' : 'bg-white border-slate-200 text-slate-700 shadow-xs'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[160px]">
              {activeSubject?.name || 'Matéria'} Hoje
            </span>
            <span className="font-mono font-extrabold text-sm sm:text-base text-emerald-400 mt-0.5">
              {formatDurationHMS(todayPerSubject[selectedSubjectId] || 0)}
            </span>
          </div>
        </div>

        {/* Big Digital Display */}
        <div className="relative my-4 z-10 select-none w-full">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
            Tempo da Sessão Atual
          </div>
          <div
            className={`font-mono font-extrabold tracking-tight text-3xl min-[360px]:text-4xl min-[420px]:text-5xl sm:text-7xl md:text-8xl flex items-baseline justify-center drop-shadow-lg ${
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
            <span className="text-blue-500/80 mx-0.5 min-[360px]:mx-1 sm:mx-2 animate-pulse">:</span>
            <span>{pad(minutes)}</span>
            <span className="text-blue-500/80 mx-0.5 min-[360px]:mx-1 sm:mx-2 animate-pulse">:</span>
            <span>{pad(seconds)}</span>
            <span className="text-xs min-[360px]:text-sm sm:text-2xl font-semibold text-slate-500 ml-1 sm:ml-2">.{tenths}</span>
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

          {/* Recovery Pill — Micro-cronômetro de Descanso na Pausa */}
          {isPaused && (
            <div className="mt-4 mb-2 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div
                className={`inline-flex items-center gap-3 px-4 py-2 rounded-full border shadow-lg backdrop-blur-md transition-all ${
                  restZone === 'red'
                    ? 'bg-red-500/15 border-red-500/50 text-red-300 animate-pulse'
                    : restZone === 'amber'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      restZone === 'red'
                        ? 'bg-red-400 animate-ping'
                        : restZone === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  <span>{restZoneLabel}</span>
                </div>
                <div className="h-3 w-px bg-white/20" />
                <div className="flex items-baseline gap-1.5 font-mono">
                  <span className="text-[11px] text-slate-400 font-sans font-medium">Descanso:</span>
                  <span className="text-sm sm:text-base font-bold tracking-tight text-white tabular-nums">
                    {formattedRestTime}
                  </span>
                </div>
              </div>
              <p className={`mt-2 text-xs text-center font-medium max-w-sm ${
                restZone === 'red' ? 'text-red-400 font-bold' : restZone === 'amber' ? 'text-amber-400' : 'text-slate-400'
              }`}>
                {restZoneDesc}
              </p>
            </div>
          )}

          {/* Barra Tática de Proporção Foco vs. Descanso (Focus Ratio) */}
          {totalCycleMs > 0 && (
            <div
              className={`mt-4 mx-auto max-w-md w-full p-3.5 rounded-2xl border transition-all ${
                isDark
                  ? 'bg-slate-900/60 border-slate-800 text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold tracking-wide uppercase text-[11px] text-slate-400">
                  Balanço de Sessão
                </span>
                <span className="font-mono font-bold text-xs text-white">
                  {focusPercentage}% Foco <span className="text-slate-500">·</span> {restPercentage}% Pausa
                </span>
              </div>

              <div className="h-2 w-full rounded-full overflow-hidden bg-slate-800 flex shadow-inner">
                <div
                  style={{ width: `${focusPercentage}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-300"
                  title={`Estudo: ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`}
                />
                <div
                  style={{ width: `${restPercentage}%` }}
                  className={`h-full transition-all duration-300 ${
                    restZone === 'red'
                      ? 'bg-red-500'
                      : restZone === 'amber'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  title={`Descanso: ${formattedRestTime}`}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] mt-2 text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Estudo: {pad(hours)}h {pad(minutes)}m
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${restZone === 'red' ? 'bg-red-500' : restZone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  Pausas: {pad(restHours)}h {pad(restMinutes)}m
                </span>
              </div>

              {/* Timeline de blocos */}
              {timerState.intervals && timerState.intervals.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                    Timeline de Ciclos
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                    {timerState.intervals.map((int, idx) => {
                      const durationSecs = Math.round(int.durationMs / 1000);
                      const durationLabel = durationSecs < 60
                        ? `${durationSecs}s`
                        : `${Math.floor(durationSecs / 60)}m${durationSecs % 60 > 0 ? ` ${durationSecs % 60}s` : ''}`;
                      const isStudy = int.type === 'study';
                      return (
                        <div
                          key={idx}
                          title={`${isStudy ? 'Estudo' : 'Descanso'}: ${durationLabel}`}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 flex items-center gap-1 border ${
                            isStudy
                              ? 'bg-blue-950/70 border-blue-600/40 text-blue-300'
                              : 'bg-amber-950/70 border-amber-600/40 text-amber-300'
                          }`}
                        >
                          {isStudy ? <BookOpen className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                          <span>{durationLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Controls */}
        <div className="mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-4 relative z-10 w-full max-w-xl">
          {!isRunning ? (
            <button
              type="button"
              onClick={handleStart}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white font-bold text-xs sm:text-sm tracking-wider uppercase shadow-[0_10px_30px_rgba(0,86,210,0.4)] hover:shadow-[0_15px_35px_rgba(0,86,210,0.6)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />
              <span>{displayMs > 0 ? 'RETOMAR ESTUDO' : 'INICIAR ESTUDO'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 hover:from-blue-600 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm tracking-wider uppercase shadow-[0_10px_30px_rgba(30,58,138,0.5)] hover:shadow-[0_15px_35px_rgba(30,58,138,0.7)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <Pause className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />
              <span>PAUSAR CRONÔMETRO</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetClick}
            disabled={displayMs === 0}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3.5 sm:py-4 rounded-2xl border text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              isDark
                ? 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>ZERAR</span>
          </button>

          {/* Botão de Finalizar e Gravar no Banco de Dados / Cronograma */}
          <button
            onClick={async () => {
              if (displayMs < 1000) {
                return;
              }
              await handleSaveToDatabase();
            }}
            disabled={isSavingDb || displayMs === 0}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-[#0056D2] hover:bg-[#0047B3] text-white text-xs font-extrabold uppercase tracking-wider shadow-[0_10px_25px_rgba(0,86,210,0.5)] hover:shadow-[0_15px_35px_rgba(0,86,210,0.7)] transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4 text-sky-300" />
            <span>{isSavingDb ? 'GRAVANDO...' : 'SALVAR SESSÃO'}</span>
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

      {/* Modal de Confirmação Personalizado (Substitui window.confirm nativo) */}
      <ConfirmModal
        isOpen={!!resetModal?.isOpen}
        title="Deseja zerar o cronômetro?"
        description="Esta ação irá reiniciar o tempo de foco da sua sessão atual para 00:00:00."
        badgeText={resetModal ? `${resetModal.minutes} minutos contabilizados nesta sessão` : undefined}
        confirmLabel="Zerar Cronômetro"
        cancelLabel="Cancelar"
        variant="warning"
        iconType="reset"
        theme={theme}
        onConfirm={executeReset}
        onClose={() => setResetModal(null)}
      />
    </div>
  );
};
