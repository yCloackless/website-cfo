/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  Flame,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  Info,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  LayoutGrid,
  Target,
} from 'lucide-react';

import { Subject, StudyEntry, WeeklyCycle, SmartRevisionItem, AppTheme, AIAnalysisResult, BizuItem } from './types';
import {
  loadSubjects,
  saveSubjects,
  resetDefaultSubjects,
  getOrCreateCurrentCycle,
  saveActiveCycle,
  forceResetCycle,
  loadRevisions,
  saveRevisions,
  registerSmartRevisionsForEntry,
  getCyclesHistory,
  loadWeeklyGoalHours,
  saveWeeklyGoalHours,
} from './services/storageService';
import { loadBizuItems, initBizuStorageAsync, subscribeBizuItems } from './utils/bizuarioStorage';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/firebaseAuth';
import {
  syncStudySessionAndRevisions,
  createGoogleCalendarEvent,
  getBackendCalendarStatus,
  initiateGoogleCalendarAuth,
  disconnectBackendCalendar,
  saveClientTokenToBackend,
} from './services/calendarService';
import { buildWeeklyStudySummary, fetchAIStudyAnalysis } from './services/aiService';
import { getMondayOfWeek, getWeekDaysList, isTodayDate, formatBRDate, toISODate } from './utils/dateUtils';

import { Header } from './components/Header';
import { HorizontalWeeklyTable } from './components/HorizontalWeeklyTable';
import { AIBalanceTab } from './components/AIBalanceTab';
import { BizuarioTab } from './components/BizuarioTab';
import { HighYieldTab } from './components/HighYieldTab';
import { StudyDetailModal } from './components/StudyDetailModal';
import { SmartRevisionsModal } from './components/SmartRevisionsModal';
import { AddCustomSubjectModal } from './components/AddCustomSubjectModal';
import { CycleHistoryModal } from './components/CycleHistoryModal';
import { WeeklyGoalModal } from './components/WeeklyGoalModal';
import { SecurityGate } from './components/SecurityGate';
import { LandingPage } from './components/LandingPage';
import { TimerTab } from './components/TimerTab';
import { NotionAgendaTab } from './components/NotionAgendaTab';

export default function App() {
  // 🛡️ Security Gate (2FA TOTP Terminal) State
  const [isTerminalUnlocked, setIsTerminalUnlocked] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Validação automática de sessão 2FA persistente (30 dias)
  useEffect(() => {
    let isMounted = true;
    const verifySavedSession = async () => {
      try {
        const savedToken = localStorage.getItem('cfo_terminal_session');
        const expiresAt = Number(localStorage.getItem('cfo_terminal_expires_at'));

        if (!savedToken) {
          if (isMounted) setIsCheckingSession(false);
          return;
        }

        // Se localmente já expirou
        if (expiresAt && Date.now() > expiresAt) {
          localStorage.removeItem('cfo_terminal_session');
          localStorage.removeItem('cfo_terminal_expires_at');
          localStorage.removeItem('cfo_terminal_user');
          if (isMounted) setIsCheckingSession(false);
          return;
        }

        // Valida token com o backend
        const res = await fetch('/api/auth/verify-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${savedToken}`,
          },
          body: JSON.stringify({ token: savedToken }),
        });

        const data = await res.json();
        if (res.ok && data.valid) {
          if (isMounted) {
            setIsTerminalUnlocked(true);
          }
        } else {
          localStorage.removeItem('cfo_terminal_session');
          localStorage.removeItem('cfo_terminal_expires_at');
          localStorage.removeItem('cfo_terminal_user');
        }
      } catch (err) {
        // Fallback para contingência caso backend offline mas token válido
        const savedToken = localStorage.getItem('cfo_terminal_session');
        const expiresAt = Number(localStorage.getItem('cfo_terminal_expires_at'));
        if (savedToken && expiresAt && Date.now() < expiresAt) {
          if (isMounted) setIsTerminalUnlocked(true);
        }
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    };

    verifySavedSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLockTerminal = useCallback(() => {
    localStorage.removeItem('cfo_terminal_session');
    localStorage.removeItem('cfo_terminal_expires_at');
    localStorage.removeItem('cfo_terminal_user');
    setIsTerminalUnlocked(false);
    setShowLoginModal(false);
  }, []);

  // Theme state ('dark' | 'light')
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('cfo_theme');
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('cfo_theme', theme);
    document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Active Tab ('table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar')
  const [activeTab, setActiveTab] = useState<'table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar'>('table');

  // Preset topic for creating a Bizu from HighYield tab
  const [presetTopicForBizu, setPresetTopicForBizu] = useState<{
    subject: string;
    title: string;
  } | null>(null);

  // Bizuario state
  const [bizuItems, setBizuItems] = useState<BizuItem[]>(() => loadBizuItems());
  const handleRefreshBizuItems = useCallback(() => {
    setBizuItems(loadBizuItems());
  }, []);

  // Synchronize Bizu items with IndexedDB extended store (apenas se terminal destravado)
  useEffect(() => {
    if (!isTerminalUnlocked) return;
    initBizuStorageAsync((items) => {
      setBizuItems(items);
    });
    const unsubscribe = subscribeBizuItems((items) => {
      setBizuItems(items);
    });
    return () => unsubscribe();
  }, [isTerminalUnlocked]);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Backend Google Calendar connection status (permanent session) com cache síncrono local
  const [backendCalendar, setBackendCalendar] = useState<{
    connected: boolean;
    permanent: boolean;
    email: string | null;
    name: string | null;
  }>(() => {
    try {
      const saved = localStorage.getItem('cfo_calendar_status');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      connected: false,
      permanent: false,
      email: null,
      name: null,
    };
  });

  const refreshCalendarStatus = useCallback(async () => {
    const status = await getBackendCalendarStatus();
    const newStatus = {
      connected: status.connected,
      permanent: status.permanent,
      email: status.email,
      name: status.name,
    };
    setBackendCalendar(newStatus);
    try {
      localStorage.setItem('cfo_calendar_status', JSON.stringify(newStatus));
    } catch (_) {}
    return status;
  }, []);



  // Data state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [currentCycle, setCurrentCycle] = useState<WeeklyCycle | null>(null);
  const [revisions, setRevisions] = useState<SmartRevisionItem[]>([]);
  const [cyclesHistory, setCyclesHistory] = useState<WeeklyCycle[]>([]);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(() => {
    try {
      const cached = localStorage.getItem('cfo_ai_analysis');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [analysisSource, setAnalysisSource] = useState<string | null>(() => {
    return localStorage.getItem('cfo_ai_source') || 'gemini';
  });
  const [lastAIUpdated, setLastAIUpdated] = useState<Date | null>(() => {
    const t = localStorage.getItem('cfo_ai_updated');
    return t ? new Date(t) : null;
  });

  // Modals state
  const [isStudyModalOpen, setIsStudyModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    subject: Subject;
    dayIndex: number;
    dateStr: string;
  } | null>(null);
  const [initialStudyDurationMinutes, setInitialStudyDurationMinutes] = useState<number | null>(null);
  const [isSavingStudy, setIsSavingStudy] = useState(false);

  const [isRevisionsModalOpen, setIsRevisionsModalOpen] = useState(false);
  const [isAddSubjectModalOpen, setIsAddSubjectModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [weeklyGoalHours, setWeeklyGoalHours] = useState<number>(() => loadWeeklyGoalHours());
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  // Compute weekly study summary
  const studySummary = useMemo(() => {
    return buildWeeklyStudySummary(subjects, currentCycle);
  }, [subjects, currentCycle]);

  // Run AI Analysis function (supports automated background execution)
  const runAIAnalysis = useCallback(
    async (isManual = false) => {
      if (subjects.length === 0) return;
      setIsLoadingAI(true);
      try {
        const summary = buildWeeklyStudySummary(subjects, currentCycle);
        const result = await fetchAIStudyAnalysis(summary);
        setAiAnalysis(result.data);
        setAnalysisSource(result.source);
        const now = new Date();
        setLastAIUpdated(now);
        localStorage.setItem('cfo_ai_analysis', JSON.stringify(result.data));
        localStorage.setItem('cfo_ai_source', result.source);
        localStorage.setItem('cfo_ai_updated', now.toISOString());
        if (isManual) {
          showToast('Análise de Equilíbrio da IA atualizada com sucesso!', 'success');
        }
      } catch (err: any) {
        console.warn('Atualização de análise pedagógica em contingência:', err?.message || err);
        if (isManual) {
          showToast('Análise de Equilíbrio atualizada pelo algoritmo tático.', 'info');
        }
      } finally {
        setIsLoadingAI(false);
      }
    },
    [subjects, currentCycle, showToast]
  );

  // Initialize Auth & Data on Mount (apenas se terminal destravado)
  useEffect(() => {
    if (!isTerminalUnlocked) return;

    // 1. Load subjects
    const loadedSubs = loadSubjects();
    setSubjects(loadedSubs);

    // 2. Load or reset weekly cycle (Auto resets on Monday!)
    const { cycle, wasReset } = getOrCreateCurrentCycle();
    setCurrentCycle(cycle);

    if (wasReset) {
      showToast('Segunda-feira detectada: Novo ciclo semanal de estudos iniciado!', 'info');
    }

    // 3. Load smart revisions & history
    setRevisions(loadRevisions());
    setCyclesHistory(getCyclesHistory());

    // 4. Setup Firebase Auth listener with token persistence
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      },
      (currentUser) => {
        setUser(currentUser);
        setAccessToken(null);
      }
    );

    // 5. Check backend Google Calendar permanent session status
    refreshCalendarStatus();

    // BroadcastChannel para captura instantânea do login no popup
    let authChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        authChannel = new BroadcastChannel('cfo_google_calendar_auth');
        authChannel.onmessage = (event) => {
          if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
            const newStatus = {
              connected: true,
              permanent: true,
              email: event.data.email || null,
              name: event.data.name || null,
            };
            setBackendCalendar(newStatus);
            try {
              localStorage.setItem('cfo_calendar_status', JSON.stringify(newStatus));
            } catch (_) {}
            refreshCalendarStatus();
          }
        };
      }
    } catch (_) {}

    // Storage event para captura instantânea caso o popup rode em outra aba ou janela
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cfo_calendar_status' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed.connected === 'boolean') {
            setBackendCalendar(parsed);
          }
        } catch (_) {}
      }
      if (e.key === 'cfo_calendar_auth_success') {
        refreshCalendarStatus();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Listen for OAuth callback messages if completed in popup
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
        const newStatus = {
          connected: true,
          permanent: true,
          email: event.data.email || null,
          name: event.data.name || null,
        };
        setBackendCalendar(newStatus);
        try {
          localStorage.setItem('cfo_calendar_status', JSON.stringify(newStatus));
        } catch (_) {}
        refreshCalendarStatus();
        showToast(
          `Google Agenda conectado permanentemente com sucesso! (${event.data.name || event.data.email || 'Conta vinculada'})`,
          'success'
        );
      }
    };
    window.addEventListener('message', handleAuthMessage);

    return () => {
      unsubscribe();
      window.removeEventListener('message', handleAuthMessage);
      window.removeEventListener('storage', handleStorageChange);
      if (authChannel) {
        authChannel.close();
      }
    };

  }, [isTerminalUnlocked, showToast, refreshCalendarStatus]);

  // Trigger automated AI analysis whenever cycle entries change or subjects load
  useEffect(() => {
    if (subjects.length > 0 && currentCycle) {
      const timer = setTimeout(() => {
        runAIAnalysis(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentCycle?.updatedAt, subjects.length, runAIAnalysis]);

  // Google Sign In Handler (Inicia OAuth 2.0 offline do backend)
  const handleSignIn = async () => {
    // Previne tentativas repetidas ou duplo login
    if (backendCalendar.connected || (user && accessToken)) {
      showToast('O Google Agenda já está conectado permanentemente!', 'info');
      return;
    }

    try {
      setIsSigningIn(true);

      // Tentar fluxo oficial do backend com Refresh Token permanente
      try {
        const authResult = await initiateGoogleCalendarAuth();
        if (authResult.success) {
          const newStatus = {
            connected: true,
            permanent: true,
            email: authResult.email || backendCalendar.email,
            name: authResult.name || backendCalendar.name,
          };
          setBackendCalendar(newStatus);
          try {
            localStorage.setItem('cfo_calendar_status', JSON.stringify(newStatus));
          } catch (_) {}

          await refreshCalendarStatus();
          const welcomeName = authResult.name?.split(' ')[0] || authResult.email?.split('@')[0] || 'você';
          showToast(
            `Google Agenda conectado permanentemente para ${welcomeName}! Seus estudos agora serão sincronizados.`,
            'success'
          );
          return;
        } else {
          // O pop-up foi fechado ou cancelado pelo usuário
          return;
        }
      } catch (backendOAuthErr: any) {
        if (backendOAuthErr?.message?.includes('bloqueada')) {
          showToast(
            'Pop-up bloqueado pelo navegador. Habilite pop-ups para conectar ao Google Agenda.',
            'info'
          );
          return;
        }
        console.warn('Erro na abertura do OAuth:', backendOAuthErr?.message || backendOAuthErr);
        showToast(backendOAuthErr?.message || 'Falha ao abrir autenticação com Google.', 'error');
        return;
      }
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível conectar com o Google Calendar.', 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Google Sign Out Handler
  const handleSignOut = async () => {
    await disconnectBackendCalendar();
    await logout();
    setUser(null);
    setAccessToken(null);
    setBackendCalendar({ connected: false, permanent: false, email: null, name: null });
    try {
      localStorage.removeItem('cfo_calendar_status');
    } catch (_) {}
    showToast('Desconectado do Google Agenda.', 'info');
  };



  // Week days calculation
  const weekDays = useMemo(() => {
    if (!currentCycle) return [];
    const monday = getMondayOfWeek(new Date(currentCycle.startDate + 'T12:00:00'));
    return getWeekDaysList(monday);
  }, [currentCycle]);

  // Handle cell click (open detailed edit modal)
  const handleCellClick = (subject: Subject, dayIndex: number, dateStr: string) => {
    setInitialStudyDurationMinutes(null);
    setSelectedCell({ subject, dayIndex, dateStr });
    setIsStudyModalOpen(true);
  };

  // Open detailed study modal directly from Timer with pre-filled subject and time
  const handleOpenStudyDetailFromTimer = (subjectId: string, durationMinutes: number) => {
    const subject = subjects.find((s) => s.id === subjectId) || subjects[0];
    if (!subject) return;

    const todayISO = toISODate(new Date());
    const matchedDay = weekDays.find((d) => d.dateStr === todayISO);
    const dayIndex = matchedDay
      ? matchedDay.index
      : new Date().getDay() === 0
      ? 6
      : new Date().getDay() - 1;
    const dateStr = matchedDay ? matchedDay.dateStr : todayISO;

    setInitialStudyDurationMinutes(durationMinutes);
    setSelectedCell({
      subject,
      dayIndex,
      dateStr,
    });
    setIsStudyModalOpen(true);
  };

  // Quick toggle checkbox from table
  const handleQuickToggle = async (
    subject: Subject,
    dayIndex: number,
    dateStr: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!currentCycle) return;

    const cellKey = `${subject.id}_${dayIndex}`;
    const existingEntry = currentCycle.entries[cellKey];
    const willBeCompleted = !existingEntry?.completed;

    if (!willBeCompleted) {
      // Unmarking
      const updatedEntries = {
        ...currentCycle.entries,
        [cellKey]: {
          ...existingEntry,
          completed: false,
          completedAt: undefined,
        },
      };

      const updatedCycle = { ...currentCycle, entries: updatedEntries, updatedAt: new Date().toISOString() };
      setCurrentCycle(updatedCycle);
      saveActiveCycle(updatedCycle);
      showToast(`${subject.name}: Marcado como pendente.`, 'info');
      return;
    }

    // Marking as completed
    const cleanDuration = existingEntry?.durationMinutes
      ? Math.max(60, Math.round(existingEntry.durationMinutes / 60) * 60)
      : 60;

    const newEntry: StudyEntry = {
      id: existingEntry?.id || `entry_${Date.now()}`,
      subjectId: subject.id,
      dayIndex,
      dateStr,
      completed: true,
      completedAt: new Date().toISOString(),
      topic: existingEntry?.topic || '',
      durationMinutes: cleanDuration,
      notes: existingEntry?.notes || '',
      googleCalendarSynced: false,
      revisionScheduled: false,
    };

    // If Google Calendar is connected (either client token or backend permanent session)
    const token = accessToken || (await getAccessToken());
    let calendarResult: any = null;

    if (token || backendCalendar.connected) {
      try {
        calendarResult = await syncStudySessionAndRevisions(
          token,
          subject,
          newEntry,
          true // schedule smart revisions: 1d (próximo dia), 7d (1 semana) e mensais (30d, 60d, 90d)
        );
        newEntry.googleCalendarSynced = true;
        newEntry.calendarEventId = calendarResult.studyEventId;
        newEntry.calendarRevision1dId = calendarResult.revision1dId;
        newEntry.calendarRevision7dId = calendarResult.revision7dId;
        newEntry.calendarRevision30dId = calendarResult.revision30dId;
        newEntry.calendarRevision60dId = calendarResult.revision60dId;
        newEntry.calendarRevision90dId = calendarResult.revision90dId;
        newEntry.revisionScheduled = true;
      } catch (err: any) {
        if (err?.code === 'TOKEN_EXPIRED' || err?.name === 'GoogleCalendarAuthError') {
          const status = await refreshCalendarStatus();
          if (!status.connected) {
            setAccessToken(null);
            showToast('Sessão do Google Agenda expirou. Conecte sua conta para renovar.', 'info');
          }
        } else {
          console.warn('Falha ao sincronizar com Google Agenda:', err);
          showToast('Estudo salvo localmente. Não foi possível conectar ao Google Agenda.', 'info');
        }
      }
    }

    // Save in cycle
    const updatedEntries = {
      ...currentCycle.entries,
      [cellKey]: newEntry,
    };
    const updatedCycle = { ...currentCycle, entries: updatedEntries, updatedAt: new Date().toISOString() };
    setCurrentCycle(updatedCycle);
    saveActiveCycle(updatedCycle);

    // Register smart revisions (+7d, +30d, +60d) in local tracker
    registerSmartRevisionsForEntry(newEntry, subject, calendarResult);
    setRevisions(loadRevisions());

    if (newEntry.googleCalendarSynced) {
      showToast(
        `✅ ${subject.name} concluído! Evento criado no Google Calendar com revisões inteligentes agendadas!`,
        'success'
      );
    } else {
      showToast(
        `✅ ${subject.name} marcado como concluído! Revisões inteligentes registradas.`,
        'success'
      );
    }
  };

  // Save from detailed StudyDetailModal
  const handleSaveStudyDetail = async (data: {
    completed: boolean;
    topic: string;
    durationMinutes: number;
    notes: string;
    syncWithCalendar: boolean;
  }) => {
    if (!currentCycle || !selectedCell) return;

    setIsSavingStudy(true);
    const cellKey = `${selectedCell.subject.id}_${selectedCell.dayIndex}`;
    const existingEntry = currentCycle.entries[cellKey];

    const newEntry: StudyEntry = {
      id: existingEntry?.id || `entry_${Date.now()}`,
      subjectId: selectedCell.subject.id,
      dayIndex: selectedCell.dayIndex,
      dateStr: selectedCell.dateStr,
      completed: data.completed,
      completedAt: data.completed ? (existingEntry?.completedAt || new Date().toISOString()) : undefined,
      topic: data.topic,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
      googleCalendarSynced: existingEntry?.googleCalendarSynced || false,
      revisionScheduled: existingEntry?.revisionScheduled || false,
    };

    let calendarResult: any = null;

    if (data.completed && data.syncWithCalendar) {
      const token = accessToken || (await getAccessToken());
      if (token || backendCalendar.connected) {
        try {
          calendarResult = await syncStudySessionAndRevisions(
            token,
            selectedCell.subject,
            newEntry,
            true
          );
          newEntry.googleCalendarSynced = true;
          newEntry.calendarEventId = calendarResult.studyEventId;
          newEntry.calendarRevision1dId = calendarResult.revision1dId;
          newEntry.calendarRevision7dId = calendarResult.revision7dId;
          newEntry.calendarRevision30dId = calendarResult.revision30dId;
          newEntry.calendarRevision60dId = calendarResult.revision60dId;
          newEntry.calendarRevision90dId = calendarResult.revision90dId;
          newEntry.revisionScheduled = true;
        } catch (err: any) {
          if (err?.code === 'TOKEN_EXPIRED' || err?.name === 'GoogleCalendarAuthError') {
            const status = await refreshCalendarStatus();
            if (!status.connected) {
              setAccessToken(null);
              showToast('Sessão do Google Agenda expirou. Conecte sua conta para renovar.', 'info');
            }
          } else {
            console.warn('Erro ao sincronizar com Google Agenda:', err);
            showToast('Erro ao sincronizar com Google Agenda: ' + (err?.message || err), 'error');
          }
        }
      }
    }

    const updatedEntries = {
      ...currentCycle.entries,
      [cellKey]: newEntry,
    };
    const updatedCycle = { ...currentCycle, entries: updatedEntries, updatedAt: new Date().toISOString() };
    setCurrentCycle(updatedCycle);
    saveActiveCycle(updatedCycle);

    if (data.completed) {
      registerSmartRevisionsForEntry(newEntry, selectedCell.subject, calendarResult);
      setRevisions(loadRevisions());
    }

    setIsSavingStudy(false);
    setIsStudyModalOpen(false);

    if (newEntry.googleCalendarSynced) {
      showToast('Estudo e revisões inteligentes sincronizados na Google Agenda!', 'success');
    } else {
      showToast('Estudo salvo com sucesso!', 'success');
    }
  };

  // Add custom subject handler
  const handleAddCustomSubject = (newSubject: Subject) => {
    const updated = [...subjects, newSubject];
    setSubjects(updated);
    saveSubjects(updated);
    showToast(`Matéria "${newSubject.name}" adicionada ao cronograma!`, 'success');
  };

  // Handle logging study time from dedicated Timer Tab
  const handleLogTimerStudySession = useCallback(
    (subjectId: string, minutes: number, notes?: string) => {
      if (!currentCycle) return;
      const todayISO = toISODate(new Date());
      const matchedDay = weekDays.find((d) => d.dateStr === todayISO);
      const dayIndex = matchedDay
        ? matchedDay.index
        : new Date().getDay() === 0
        ? 6
        : new Date().getDay() - 1;
      const dateStr = matchedDay ? matchedDay.dateStr : todayISO;
      const cellKey = `${subjectId}_${dayIndex}`;
      const existing = currentCycle.entries[cellKey];

      const newEntry: StudyEntry = {
        id: existing?.id || `study_${Date.now()}`,
        subjectId,
        dayIndex,
        dateStr,
        durationMinutes: (existing?.durationMinutes || 0) + minutes,
        completed: true,
        completedAt: existing?.completedAt || new Date().toISOString(),
        topic: existing?.topic || 'Sessão via Cronômetro de Foco',
        notes: notes || existing?.notes || 'Sessão registrada via Cronômetro de Foco',
        googleCalendarSynced: existing?.googleCalendarSynced || false,
        revisionScheduled: existing?.revisionScheduled || false,
      };

      const updatedCycle: WeeklyCycle = {
        ...currentCycle,
        entries: {
          ...currentCycle.entries,
          [cellKey]: newEntry,
        },
        updatedAt: new Date().toISOString(),
      };

      setCurrentCycle(updatedCycle);
      saveActiveCycle(updatedCycle);
      showToast(`Sessão de ${minutes} min registrada no cronograma de hoje!`, 'success');
    },
    [currentCycle, weekDays, showToast]
  );

  // Delete/remove subject handler (supports removing default subjects like Química or custom ones)
  const handleDeleteCustomSubject = (subjectId: string) => {
    const updated = subjects.filter((s) => s.id !== subjectId);
    setSubjects(updated);
    saveSubjects(updated);
    showToast('Matéria retirada do cronograma. Você pode reativá-la em "Matéria" no topo.', 'info');
  };

  // Reset default subjects handler
  const handleResetDefaultSubjects = () => {
    const defaults = resetDefaultSubjects();
    setSubjects(defaults);
    showToast('Grade padrão de matérias do CFO CBMERJ restaurada com sucesso!', 'success');
  };

  // Force reset weekly cycle
  const handleForceResetCycle = () => {
    if (window.confirm('Deseja reiniciar a tabela semanal agora? As anotações da semana atual serão salvas no Histórico e a nova semana começará zerada.')) {
      const freshCycle = forceResetCycle();
      setCurrentCycle(freshCycle);
      setCyclesHistory(getCyclesHistory());
      showToast('Novo ciclo semanal iniciado com sucesso!', 'success');
    }
  };

  // Toggle revision done
  const handleToggleRevisionDone = (revisionId: string) => {
    const updated = revisions.map((r) => {
      if (r.id === revisionId) {
        return {
          ...r,
          completed: !r.completed,
          completedAt: !r.completed ? new Date().toISOString() : undefined,
        };
      }
      return r;
    });
    setRevisions(updated);
    saveRevisions(updated);
  };

  // Sync individual revision to calendar
  const handleSyncRevisionToCalendar = async (revision: SmartRevisionItem) => {
    const token = accessToken || (await getAccessToken());
    if (!token && !backendCalendar.connected) {
      showToast('Conecte sua conta do Google Agenda no topo primeiro.', 'error');
      return;
    }

    try {
      const eventId = await createGoogleCalendarEvent(token, {
        summary: `🎯 [Revisão ${revision.intervalLabel} • CFO CBMERJ] ${revision.subjectName}`,
        description: `Sessão de Revisão Espaçada para o concurso CFO CBMERJ.\nMatéria: ${revision.subjectName}\nTópico: ${revision.topic}\nData original de estudo: ${formatBRDate(revision.studiedDate)}`,
        dateStr: revision.dueDate,
        colorId: '6',
      });

      const updated = revisions.map((r) =>
        r.id === revision.id ? { ...r, calendarSynced: true, calendarEventId: eventId } : r
      );
      setRevisions(updated);
      saveRevisions(updated);
      showToast('Revisão agendada na sua Google Agenda!', 'success');
    } catch (err: any) {
      if (err?.code === 'TOKEN_EXPIRED' || err?.name === 'GoogleCalendarAuthError') {
        const status = await refreshCalendarStatus();
        if (!status.connected) {
          setAccessToken(null);
          showToast('Sessão do Google Agenda expirou. Conecte sua conta no topo.', 'info');
        }
      } else {
        showToast('Erro ao sincronizar revisão: ' + (err?.message || err), 'error');
      }
    }
  };

  // Pending revisions count (due today or overdue)
  const pendingRevisionsCount = useMemo(() => {
    return revisions.filter((r) => !r.completed && (isTodayDate(r.dueDate) || r.dueDate <= new Date().toISOString().split('T')[0])).length;
  }, [revisions]);

  // Overall weekly progress stats
  const weeklyStats = useMemo(() => {
    if (!currentCycle) return { totalSessions: 0, totalHours: 0, distinctSubjects: 0 };
    const allEntries = Object.values(currentCycle.entries || {}) as StudyEntry[];
    const completedEntries = allEntries.filter((e) => e.completed);
    const totalSessions = completedEntries.length;
    const totalMinutes = completedEntries.reduce((acc, curr) => acc + (curr.durationMinutes || 60), 0);
    const distinctSubjects = new Set(completedEntries.map((e) => e.subjectId)).size;
    const totalHours = Math.round(totalMinutes / 60);

    return {
      totalSessions,
      totalHours,
      distinctSubjects,
    };
  }, [currentCycle]);

  // Handle saving weekly study goal
  const handleSaveGoalHours = useCallback(
    (hours: number) => {
      setWeeklyGoalHours(hours);
      saveWeeklyGoalHours(hours);
      showToast(`Meta semanal definida para ${hours}h de estudos!`, 'success');
    },
    [showToast]
  );

  // Goal Progress tracking
  const goalProgress = useMemo(() => {
    const total = weeklyStats.totalHours;
    const goal = weeklyGoalHours > 0 ? weeklyGoalHours : 25;
    const percentage = Math.min(100, Math.round((total / goal) * 100));
    const isMet = total >= goal;
    const remaining = Math.max(0, Number((goal - total).toFixed(1)));
    const surplus = isMet ? Number((total - goal).toFixed(1)) : 0;
    return {
      total,
      goal,
      percentage,
      isMet,
      remaining,
      surplus,
    };
  }, [weeklyStats.totalHours, weeklyGoalHours]);

  const isDark = theme === 'dark';

  // 🛡️ Tela de Bloqueio Obrigatória (Security Gate 2FA)
  if (isCheckingSession) {
    return (
      <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center font-mono select-none">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-red-500 font-bold text-xs">
            CFO
          </div>
        </div>
        <p className="mt-4 text-xs tracking-widest text-red-500/80 uppercase">
          Verificando Terminal de Acesso...
        </p>
      </div>
    );
  }

  // Se o terminal não estiver desbloqueado (visitante ou deslogado)
  if (!isTerminalUnlocked) {
    if (showLoginModal) {
      return (
        <SecurityGate
          onAuthenticated={() => {
            setIsTerminalUnlocked(true);
            setShowLoginModal(false);
          }}
          onBackToLanding={() => {
            setShowLoginModal(false);
          }}
        />
      );
    }

    return (
      <LandingPage
        onOpenLogin={() => {
          setShowLoginModal(true);
        }}
      />
    );
  }

  // Flag global consolidada de conexão do Google Calendar (persistente backend ou Firebase)
  const isCalendarLinked = Boolean(backendCalendar.connected || (user && accessToken));

  return (
    <div
      className={`min-h-screen flex flex-col antialiased selection:bg-[#0056D2] selection:text-white transition-colors duration-200 ${
        isDark ? 'bg-[#070D18] text-slate-100' : 'bg-[#F1F4F9] text-slate-900'
      }`}
    >
      {/* Top Header with Tab Selector and Theme Toggle */}
      <Header
        user={user}
        hasCalendarAccess={isCalendarLinked}
        calendarEmail={backendCalendar.email || user?.email}
        calendarName={backendCalendar.name || user?.displayName}
        isPermanentCalendar={backendCalendar.permanent}

        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isSigningIn={isSigningIn}
        cycleLabel={currentCycle?.label || 'Ciclo Semanal'}
        onOpenRevisions={() => setIsRevisionsModalOpen(true)}
        onOpenAddSubject={() => setIsAddSubjectModalOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onForceReset={handleForceResetCycle}
        pendingRevisionsCount={pendingRevisionsCount}
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLockTerminal={handleLockTerminal}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Render Tab 1: Cronograma Semanal */}
        {activeTab === 'table' && (
          <>
            {/* Dedicated Weekly Goal & Progress Card */}
            <div
              className={`p-5 rounded-2xl border transition-all shadow-xl ${
                isDark
                  ? 'bg-[#0B1528] border-slate-800/90 shadow-black/40'
                  : 'bg-white border-slate-200 shadow-slate-200/50'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                      goalProgress.isMet
                        ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-950/40'
                        : 'bg-gradient-to-tr from-[#0056D2] via-blue-600 to-[#FF6B00] text-white shadow-blue-950/40'
                    }`}
                  >
                    {goalProgress.isMet ? (
                      <Flame className="w-6 h-6 animate-pulse" />
                    ) : (
                      <Target className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        className={`text-base font-bold tracking-tight ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        Meta Semanal de Horas Estudadas
                      </h3>
                      {goalProgress.isMet ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          🔥 Meta Batida! (+{goalProgress.surplus}h)
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Faltam {goalProgress.remaining}h para bater a meta
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-0.5 ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      {goalProgress.isMet
                        ? `Excelente! Você atingiu ${goalProgress.total.toFixed(1)}h das ${goalProgress.goal}h planejadas para o concurso CFO CBMERJ.`
                        : `Você cumpriu ${goalProgress.total.toFixed(1)}h das ${goalProgress.goal}h planejadas para esta semana.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span
                      className={`text-2xl font-black tracking-tight ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      {goalProgress.total.toFixed(1)}h
                    </span>
                    <span
                      className={`text-xs font-semibold ml-1 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      / {goalProgress.goal}h
                    </span>
                  </div>

                  <button
                    onClick={() => setIsGoalModalOpen(true)}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-xs ${
                      isDark
                        ? 'border-slate-700 bg-slate-800/90 hover:bg-slate-800 text-slate-200 hover:border-slate-600'
                        : 'border-slate-300 bg-slate-100 hover:bg-slate-200/80 text-slate-800'
                    }`}
                  >
                    <Target className="w-3.5 h-3.5 text-[#0056D2]" />
                    <span>Definir Meta</span>
                  </button>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="mt-4">
                <div
                  className={`w-full h-3 rounded-full overflow-hidden p-0.5 border ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      goalProgress.isMet
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-[#0056D2] via-blue-500 to-sky-400'
                    }`}
                    style={{ width: `${goalProgress.percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1.5 font-medium">
                  <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                    0h (Início da semana)
                  </span>
                  <span className="font-bold text-[#0056D2] dark:text-sky-400">
                    {goalProgress.percentage}% da meta alcançada
                  </span>
                  <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                    Meta Semanal: {goalProgress.goal}h
                  </span>
                </div>
              </div>
            </div>

            {/* Weekly Metric Summary Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Metric 1 */}
              <div
                className={`p-4 rounded-xl border transition-colors shadow-xl flex items-center justify-between ${
                  isDark ? 'bg-[#111218] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Sessões Concluídas
                  </p>
                  <p
                    className={`text-2xl font-light mt-0.5 ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {weeklyStats.totalSessions}{' '}
                    <span
                      className={`text-xs font-normal ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      nesta semana
                    </span>
                  </p>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    isDark
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                      : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              {/* Metric 2 */}
              <div
                className={`p-4 rounded-xl border transition-colors shadow-xl flex items-center justify-between ${
                  isDark ? 'bg-[#111218] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Carga Horária Acumulada
                  </p>
                  <p
                    className={`text-2xl font-light mt-0.5 ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {weeklyStats.totalHours}h{' '}
                    <span
                      className={`text-xs font-normal ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      / {weeklyGoalHours}h
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setIsGoalModalOpen(true)}
                  title="Ajustar meta de horas"
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all hover:scale-105 ${
                    isDark
                      ? 'bg-blue-950/40 text-blue-400 border-blue-800/40 hover:bg-blue-900/50'
                      : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                </button>
              </div>

              {/* Metric 3 */}
              <div
                className={`p-4 rounded-xl border transition-colors shadow-xl flex items-center justify-between ${
                  isDark ? 'bg-[#111218] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Matérias Atendidas
                  </p>
                  <p
                    className={`text-2xl font-light mt-0.5 ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {weeklyStats.distinctSubjects}/{subjects.length}{' '}
                    <span
                      className={`text-xs font-normal ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      disciplinas
                    </span>
                  </p>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    isDark
                      ? 'bg-blue-950/40 text-blue-400 border-blue-800/40'
                      : 'bg-blue-50 text-blue-600 border-blue-200'
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                </div>
              </div>

              {/* Metric 4 */}
              <div
                className={`p-4 rounded-xl border transition-colors shadow-xl flex items-center justify-between ${
                  isDark ? 'bg-[#111218] border-slate-800/90' : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                <div>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Revisão Espaçada
                  </p>
                  <p
                    className={`text-2xl font-light mt-0.5 ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {revisions.filter((r) => !r.completed).length}{' '}
                    <span
                      className={`text-xs font-normal ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      programadas
                    </span>
                  </p>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    isDark
                      ? 'bg-blue-950/40 text-blue-400 border-blue-800/40'
                      : 'bg-blue-50 text-blue-600 border-blue-200'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Integration Callout (Oculto permanentemente após vincular o Google Calendar) */}
            {!isCalendarLinked && (

              <div
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl ${
                  isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0056D2] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-blue-950/40">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h2
                      className={`text-xs font-bold uppercase tracking-wide ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      Vincule seu cronograma ao Google Calendar
                    </h2>
                    <p
                      className={`text-[11px] mt-0.5 max-w-2xl ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Ao marcar que você estudou uma matéria em um determinado dia, o aplicativo adiciona a sessão na sua agenda e programa automaticamente suas revisões inteligentes (1 semana após e de mês em mês).
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] shadow-md shadow-blue-950/40 transition-colors shrink-0 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Conectar Google Agenda</span>
                </button>
              </div>
            )}

            {/* The Requested Horizontal Table */}
            <section className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2
                    className={`text-sm uppercase tracking-widest font-semibold ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    Cronograma Semanal
                  </h2>
                  <p
                    className={`text-xs mt-0.5 ${
                      isDark ? 'text-slate-500' : 'text-slate-500'
                    }`}
                  >
                    Marque o status de conclusão clicando no botão rápido ou abra a célula para preencher o tópico estudado e sincronizar na Google Agenda.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 font-semibold transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ver Análise de Equilíbrio da IA →</span>
                  </button>

                  <span
                    className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-red-500" />
                    Reset semanal automático toda 2ª feira
                  </span>
                </div>
              </div>

              <HorizontalWeeklyTable
                subjects={subjects}
                weekDays={weekDays}
                entries={currentCycle?.entries || {}}
                onCellClick={handleCellClick}
                onQuickToggle={handleQuickToggle}
                onDeleteCustomSubject={handleDeleteCustomSubject}
                hasGoogleCalendar={isCalendarLinked}
                theme={theme}

              />
            </section>
          </>
        )}

        {/* Render Tab: Agenda Mensal Contínua & Revisões Notion */}
        {activeTab === 'calendar' && (
          <NotionAgendaTab
            theme={theme}
            showToast={showToast}
          />
        )}

        {/* Render Tab: Cronômetro & Foco Tático */}
        {activeTab === 'timer' && (
          <TimerTab
            theme={theme}
            subjects={subjects}
            onLogStudySession={handleLogTimerStudySession}
            onOpenStudyModal={handleOpenStudyDetailFromTimer}
            weeklyGoalHours={weeklyGoalHours}
          />
        )}

        {/* Render Tab 2: Bizuário de Fotos & Matérias */}
        {activeTab === 'bizuario' && (
          <BizuarioTab
            bizuItems={bizuItems}
            onRefreshBizuItems={handleRefreshBizuItems}
            subjects={subjects}
            theme={theme}
            showToast={showToast}
            presetTopicToCreate={presetTopicForBizu}
            onClearPresetTopic={() => setPresetTopicForBizu(null)}
          />
        )}

        {/* Render Tab 3: Conteúdos que Mais Caem (Raio-X CFO CBMERJ) */}
        {activeTab === 'highyield' && (
          <HighYieldTab
            theme={theme}
            onOpenNewBizuWithTopic={(subjectName, topicName) => {
              setPresetTopicForBizu({ subject: subjectName, title: topicName });
              setActiveTab('bizuario');
              showToast(`Tópico "${topicName}" preparado no Bizuário. Clique em ✨ Gerar Anotações com Gemini AI!`, 'info');
            }}
            onNavigateToSchedule={() => setActiveTab('table')}
          />
        )}

        {/* Render Tab 4: Equilíbrio & IA Gemini */}
        {activeTab === 'ai' && (
          <AIBalanceTab
            theme={theme}
            summary={studySummary}
            analysis={aiAnalysis}
            isLoading={isLoadingAI}
            onRefresh={() => runAIAnalysis(true)}
            analysisSource={analysisSource}
            lastUpdated={lastAIUpdated}
            subjects={subjects}
            currentCycle={currentCycle}
            cyclesHistory={cyclesHistory}
          />
        )}

        {/* Footer */}
        <footer
          className={`mt-8 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] uppercase tracking-[0.2em] pb-4 transition-colors ${
            isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}
        >
          <span>Conselho: Disciplina é a ponte entre metas e conquistas.</span>
          <span>Versão 1.1.0 • CFO CBMERJ Dashboard</span>
        </footer>

      </main>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2.5 max-w-md animate-in slide-in-from-bottom-5 duration-200 ${
            toastMessage.type === 'success'
              ? isDark
                ? 'bg-[#111218] text-slate-100 border-slate-700 shadow-emerald-950/20'
                : 'bg-white text-slate-900 border-slate-200 shadow-slate-200'
              : toastMessage.type === 'error'
              ? 'bg-red-950 text-red-100 border-red-800'
              : isDark
              ? 'bg-[#111218] text-slate-100 border-slate-700'
              : 'bg-white text-slate-900 border-slate-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Modals */}
      <StudyDetailModal
        isOpen={isStudyModalOpen}
        onClose={() => {
          setIsStudyModalOpen(false);
          setInitialStudyDurationMinutes(null);
        }}
        subject={selectedCell?.subject || null}
        dayInfo={
          selectedCell
            ? {
                index: selectedCell.dayIndex,
                name: ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'][
                  selectedCell.dayIndex
                ],
                dateStr: selectedCell.dateStr,
              }
            : null
        }
        existingEntry={
          selectedCell && currentCycle
            ? currentCycle.entries[`${selectedCell.subject.id}_${selectedCell.dayIndex}`] || null
            : null
        }
        hasGoogleCalendar={isCalendarLinked}
        initialDurationMinutes={initialStudyDurationMinutes || undefined}
        onSave={handleSaveStudyDetail}
        isSaving={isSavingStudy}
      />

      <SmartRevisionsModal
        isOpen={isRevisionsModalOpen}
        onClose={() => setIsRevisionsModalOpen(false)}
        revisions={revisions}
        onToggleRevisionDone={handleToggleRevisionDone}
        onSyncRevisionToCalendar={handleSyncRevisionToCalendar}
        hasGoogleCalendar={isCalendarLinked}

      />

      <AddCustomSubjectModal
        isOpen={isAddSubjectModalOpen}
        onClose={() => setIsAddSubjectModalOpen(false)}
        subjects={subjects}
        onAddSubject={handleAddCustomSubject}
        onRemoveSubject={handleDeleteCustomSubject}
        onResetDefaultSubjects={handleResetDefaultSubjects}
      />

      <CycleHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        cycles={cyclesHistory}
        activeCycleId={currentCycle?.id || ''}
      />

      <WeeklyGoalModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        currentGoalHours={weeklyGoalHours}
        onSaveGoal={handleSaveGoalHours}
        theme={theme}
      />
    </div>
  );
}

