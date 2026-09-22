/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import type { User } from 'firebase/auth';
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
  ArrowLeftRight,
  Loader2,
  X,
  ShieldAlert,
} from 'lucide-react';

import { Subject, StudyEntry, StudyEntryType, WeeklyCycle, SmartRevisionItem, AppTheme, AIAnalysisResult, BizuItem } from './types';
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
  loadAutoSpacedRevisionsEnabled,
  saveAutoSpacedRevisionsEnabled,
} from './services/storageService';
import { loadBizuItems, initBizuStorageAsync, subscribeBizuItems } from './utils/bizuarioStorage';
const getFirebaseAuthService = () => import('./services/firebaseAuth');
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
import { hydratePersistentState, startPersistentStateSync, clearPersistentStateCache } from './services/remotePersistence';
import { apiFetch } from './services/apiFetch';

import { Header } from './components/Header';
const HorizontalWeeklyTable = lazy(() => import('./components/HorizontalWeeklyTable').then(({ HorizontalWeeklyTable }) => ({ default: HorizontalWeeklyTable })));
const AIBalanceTab = lazy(() => import('./components/AIBalanceTab').then(({ AIBalanceTab }) => ({ default: AIBalanceTab })));
const BizuarioTab = lazy(() => import('./components/BizuarioTab').then(({ BizuarioTab }) => ({ default: BizuarioTab })));
const HighYieldTab = lazy(() => import('./components/HighYieldTab').then(({ HighYieldTab }) => ({ default: HighYieldTab })));
const StudyDetailModal = lazy(() => import('./components/StudyDetailModal').then(({ StudyDetailModal }) => ({ default: StudyDetailModal })));
const SmartRevisionsModal = lazy(() => import('./components/SmartRevisionsModal').then(({ SmartRevisionsModal }) => ({ default: SmartRevisionsModal })));
const AddCustomSubjectModal = lazy(() => import('./components/AddCustomSubjectModal').then(({ AddCustomSubjectModal }) => ({ default: AddCustomSubjectModal })));
const CycleHistoryModal = lazy(() => import('./components/CycleHistoryModal').then(({ CycleHistoryModal }) => ({ default: CycleHistoryModal })));
const WeeklyGoalModal = lazy(() => import('./components/WeeklyGoalModal').then(({ WeeklyGoalModal }) => ({ default: WeeklyGoalModal })));
const SecurityGate = lazy(() => import('./components/SecurityGate').then(({ SecurityGate }) => ({ default: SecurityGate })));
import { LandingPage } from './components/LandingPage';
const TimerTab = lazy(() => import('./components/TimerTab').then(({ TimerTab }) => ({ default: TimerTab })));
const NotionAgendaTab = lazy(() => import('./components/NotionAgendaTab').then(({ NotionAgendaTab }) => ({ default: NotionAgendaTab })));
const MonthlyStudyHeatmapTab = lazy(() => import('./components/MonthlyStudyHeatmapTab').then(({ MonthlyStudyHeatmapTab }) => ({ default: MonthlyStudyHeatmapTab })));
import { CookieConsent } from './components/CookieConsent';
const TacticalSimulations = lazy(() => import('./components/TacticalSimulations').then(({ TacticalSimulations }) => ({ default: TacticalSimulations })));
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { TacticalSidebar, TabType, TAB_ROUTE_MAP, ROUTE_TAB_MAP } from './components/TacticalSidebar';
const StudentRadarTab = lazy(() => import('./components/StudentRadarTab').then(({ StudentRadarTab }) => ({ default: StudentRadarTab })));
const StudentCoachPanel = lazy(() => import('./components/StudentCoachPanel').then(({ StudentCoachPanel }) => ({ default: StudentCoachPanel })));
const StudentAnalyticsPanel = lazy(() => import('./components/StudentAnalyticsPanel').then(({ StudentAnalyticsPanel }) => ({ default: StudentAnalyticsPanel })));
const Release3StudyPanel = lazy(() => import('./components/Release3StudyPanel').then(({ Release3StudyPanel }) => ({ default: Release3StudyPanel })));
const ErrorNotebookTab = lazy(() => import('./components/ErrorNotebookTab').then(({ ErrorNotebookTab }) => ({ default: ErrorNotebookTab })));
const ExamBankTab = lazy(() => import('./components/ExamBankTab').then(({ ExamBankTab }) => ({ default: ExamBankTab })));
const LevelingTab = lazy(() => import('./components/LevelingTab').then(({ LevelingTab }) => ({ default: LevelingTab })));
const MyAccountModal = lazy(() => import('./components/MyAccountModal').then(({ MyAccountModal }) => ({ default: MyAccountModal })));
const ExtensionModal = lazy(() => import('./components/ExtensionModal').then(({ ExtensionModal }) => ({ default: ExtensionModal })));
const AdminSecurityPanelModal = lazy(() => import('./components/AdminSecurityPanelModal').then(({ AdminSecurityPanelModal }) => ({ default: AdminSecurityPanelModal })));
const UpdateNoticeModal = lazy(() => import('./components/UpdateNoticeModal').then(({ UpdateNoticeModal }) => ({ default: UpdateNoticeModal })));
const NotificationCenterDrawer = lazy(() => import('./components/NotificationCenterDrawer').then(({ NotificationCenterDrawer }) => ({ default: NotificationCenterDrawer })));
import type { NotificationItem } from './components/NotificationCenterDrawer';
const SecurityAlertPopup = lazy(() => import('./components/SecurityAlertPopup').then(({ SecurityAlertPopup }) => ({ default: SecurityAlertPopup })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then(({ AdminDashboard }) => ({ default: AdminDashboard })));
const MaintenanceScreen = lazy(() => import('./components/MaintenanceScreen').then(({ MaintenanceScreen }) => ({ default: MaintenanceScreen })));
const NotFound = lazy(() => import('./components/NotFound').then(({ NotFound }) => ({ default: NotFound })));
const IfriStudyTab = lazy(() => import('./components/IfriStudyTab').then(({ IfriStudyTab }) => ({ default: IfriStudyTab })));
import { ConfirmModal } from './components/ConfirmModal';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Active Tab derivado diretamente da URL
  const activeTab = useMemo<TabType>(() => {
    return ROUTE_TAB_MAP[location.pathname] || 'table';
  }, [location.pathname]);

  const handleSelectTab = useCallback((tab: TabType) => {
    const targetRoute = TAB_ROUTE_MAP[tab] || '/cronograma';
    navigate(targetRoute);
  }, [navigate]);

  // Redirecionamento transparente de rota legada /caderno-de-erros -> /flashcards
  useEffect(() => {
    if (location.pathname === '/caderno-de-erros') {
      navigate('/flashcards', { replace: true });
    }
  }, [location.pathname, navigate]);

  // 🛡️ Security Gate (2FA TOTP Terminal) State
  const [isTerminalUnlocked, setIsTerminalUnlocked] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isPersistentStateReady, setIsPersistentStateReady] = useState(false);
  const [canAccessNotion, setCanAccessNotion] = useState<boolean>(() => {
    const saved = localStorage.getItem('cfo_can_access_notion');
    return saved === null ? true : saved === 'true';
  });
  const [canAccessIfrj, setCanAccessIfrj] = useState<boolean>(() => localStorage.getItem('cfo_can_access_ifrj') === 'true');

  // 👤 Minha Conta & Perfil do Aluno & Configurações
  const [isMyAccountOpen, setIsMyAccountOpen] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [accountInitialTab, setAccountInitialTab] = useState<'profile' | 'settings' | 'email' | 'password' | 'extension'>('profile');
  const [autoSpacedRevisions, setAutoSpacedRevisions] = useState<boolean>(() => loadAutoSpacedRevisionsEnabled());
  const [userProfile, setUserProfile] = useState<{
    id?: string;
    fullName?: string;
    username?: string;
    email?: string;
    avatarUrl?: string | null;
    role?: string;
  } | null>(null);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [switchableAccounts, setSwitchableAccounts] = useState<Array<{ id: string; username: string; fullName?: string | null; role: string; status: string; avatarUrl?: string | null }>>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const [switchStepUpOpen, setSwitchStepUpOpen] = useState(false);
  const [switchStepUpPassword, setSwitchStepUpPassword] = useState('');
  const [switchStepUpTotp, setSwitchStepUpTotp] = useState('');
  const [switchStepUpError, setSwitchStepUpError] = useState('');

  const isImpersonating = typeof window !== 'undefined' && Boolean(sessionStorage.getItem('cfo_admin_original_session'));
  const isCurrentAdmin = userProfile?.role === 'admin' || localStorage.getItem('cfo_terminal_role') === 'admin';

  // 🛡️ Monitoramento de Segurança e Auditoria (Admin)
  const [isAdminSecurityOpen, setIsAdminSecurityOpen] = useState(false);

  // 🔔 Central de Notificações & Alertas em Tempo Real
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [activeAlertPopup, setActiveAlertPopup] = useState<NotificationItem | null>(null);

  const canViewSecurityAlertIp = userProfile?.role === 'admin'
    || userProfile?.role === 'support'
    || ['admin', 'support'].includes(localStorage.getItem('cfo_terminal_role') || '');

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('cfo_terminal_session');
    if (!token) return;
    try {
      const res = await fetch('/api/admin/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          const items = data.items as NotificationItem[];
          setNotifications(items);
          setActiveAlertPopup((current) => {
            if (current && items.some((item) => item.id === current.id && !item.isRead)) return current;
            return items.find((item) => item.type === 'CADET_SECURITY_ALERT' && !item.isRead) || null;
          });
          return items;
        }
      }
    } catch (_) {}
    return [] as NotificationItem[];
  }, []);

  const handleMarkNotificationAsRead = useCallback(async (id: string) => {
    const token = localStorage.getItem('cfo_terminal_session');
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setActiveAlertPopup((current) => (current?.id === id ? null : current));
    if (!token) return;
    try {
      await fetch(`/api/admin/notifications/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (_) {}
  }, []);

  const handleMarkAllNotificationsAsRead = useCallback(async () => {
    const token = localStorage.getItem('cfo_terminal_session');
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setActiveAlertPopup(null);
    if (!token) return;
    try {
      await fetch('/api/admin/notifications/read-all', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch (_) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  useEffect(() => {
    if (isTerminalUnlocked) {
      fetchNotifications();

      const token = localStorage.getItem('cfo_terminal_session');
      if (token) {
        const abortController = new AbortController();
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        const connect = async () => {
          try {
            const response = await fetch('/api/admin/realtime/stream', {
              headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
              signal: abortController.signal,
            });
            if (!response.ok || !response.body) return;
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (!abortController.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';
              for (const event of events) {
                const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
                if (!dataLine) continue;
                const payload = JSON.parse(dataLine.slice(5).trim());
                if (payload.type !== 'SECURITY_ALERT' || !payload.data?.notificationId) continue;
                const latest = await fetchNotifications();
                const alert = latest.find((item) => item.id === payload.data.notificationId) || null;
                if (alert) setActiveAlertPopup(alert);
              }
            }
          } catch (_) {
            // The server revalidates the session on every broadcast; retry only while mounted.
          }
          if (!abortController.signal.aborted) {
            reconnectTimer = setTimeout(connect, 2000);
          }
        };
        connect();
        return () => {
          abortController.abort();
          if (reconnectTimer) clearTimeout(reconnectTimer);
        };
      }
    }
  }, [isTerminalUnlocked, fetchNotifications]);

  // 🧭 Estado do Menu Lateral de Abas Táticas (expandido, recolhido ou oculto)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cfo_sidebar_open');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('cfo_sidebar_collapsed');
      return saved !== null ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [appConfirmState, setAppConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cfo_sidebar_open', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cfo_sidebar_collapsed', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

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
          localStorage.removeItem('cfo_terminal_role');
          localStorage.removeItem('cfo_can_access_notion');
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
            localStorage.setItem('cfo_terminal_session', 'cookie');
            if (data.expiresAt) localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
            if (data.canAccessNotion !== undefined) {
              setCanAccessNotion(Boolean(data.canAccessNotion));
              localStorage.setItem('cfo_can_access_notion', String(Boolean(data.canAccessNotion)));
            }
            if (data.canAccessIfrj !== undefined) {
              setCanAccessIfrj(Boolean(data.canAccessIfrj));
              localStorage.setItem('cfo_can_access_ifrj', String(Boolean(data.canAccessIfrj)));
            }
          }
        } else {
          localStorage.removeItem('cfo_terminal_session');
          localStorage.removeItem('cfo_terminal_expires_at');
          localStorage.removeItem('cfo_terminal_user');
          localStorage.removeItem('cfo_terminal_role');
          localStorage.removeItem('cfo_can_access_notion');
          localStorage.removeItem('cfo_can_access_ifrj');
        }
      } catch (err) {
        // Fallback para contingência caso backend offline mas token válido
        // Local storage is not proof of authentication. Fail closed while the
        // backend cannot validate the HttpOnly session cookie.
        if (isMounted) setIsTerminalUnlocked(false);
      } finally {
        if (isMounted) setIsCheckingSession(false);
      }
    };

    verifySavedSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Carrega perfil autenticado do aluno
  useEffect(() => {
    if (!isTerminalUnlocked || !isPersistentStateReady) return;
    const token = localStorage.getItem('cfo_terminal_session');
    if (!token) return;
    let isMounted = true;
    fetch('/api/user/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.user) {
          setUserProfile(data.user);
          setCanAccessIfrj(Boolean(data.user.canAccessIfrj || data.user.role === 'admin'));
          localStorage.setItem('cfo_can_access_ifrj', String(Boolean(data.user.canAccessIfrj || data.user.role === 'admin')));
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isTerminalUnlocked, isPersistentStateReady]);

  // 🌐 Monitoramento de Conexão e Estados de Rede (Offline / Reconnecting)
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(true);
      const timer = setTimeout(() => {
        setIsReconnecting(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsReconnecting(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLockTerminal = useCallback(() => {
    const token = localStorage.getItem('cfo_terminal_session');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }

    localStorage.removeItem('cfo_terminal_session');
    localStorage.removeItem('cfo_terminal_expires_at');
    localStorage.removeItem('cfo_terminal_user');
    localStorage.removeItem('cfo_terminal_role');
    localStorage.removeItem('cfo_can_access_notion');
    localStorage.removeItem('cfo_can_access_ifrj');
    setUserProfile(null);
    setCanAccessNotion(true);
    setCanAccessIfrj(false);
    setIsTerminalUnlocked(false);
    navigate('/login');
  }, [navigate]);

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

  // Modo de Manutenção
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    global: boolean;
    pages: Record<string, boolean>;
    message?: string;
  }>({ global: false, pages: {} });

  const fetchMaintenanceStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance/status');
      const data = await res.json();
      if (data?.success) {
        setMaintenanceStatus({
          global: Boolean(data.global),
          pages: data.pages || {},
          message: data.message || '',
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMaintenanceStatus();
    if (!isTerminalUnlocked) return;
    const interval = setInterval(fetchMaintenanceStatus, 45000);
    return () => clearInterval(interval);
  }, [fetchMaintenanceStatus, isTerminalUnlocked]);

  // Preset topic for creating a Bizu from HighYield tab
  const [presetTopicForBizu, setPresetTopicForBizu] = useState<{
    subject: string;
    title: string;
  } | null>(null);

  // Bizuario state
  // Aguarda a hidratação da conta atual antes de carregar o Bizuário, evitando
  // que o cache de outra conta apareça durante a troca de usuário.
  const [bizuItems, setBizuItems] = useState<BizuItem[]>([]);
  const handleRefreshBizuItems = useCallback(() => {
    setBizuItems(loadBizuItems());
  }, []);

  // Synchronize Bizu items with IndexedDB extended store (apenas se terminal destravado)
  useEffect(() => {
    if (!isTerminalUnlocked || !isPersistentStateReady) return;
    initBizuStorageAsync((items) => {
      setBizuItems(items);
    });
    const unsubscribe = subscribeBizuItems((items) => {
      setBizuItems(items);
    });
    return () => unsubscribe();
  }, [isTerminalUnlocked, isPersistentStateReady]);

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
    apiOperational?: boolean | null;
    apiErrorMessage?: string | null;
    enableUrl?: string | null;
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
      apiOperational: null,
      apiErrorMessage: null,
      enableUrl: null,
    };
  });

  const refreshCalendarStatus = useCallback(async () => {
    const status = await getBackendCalendarStatus();
    const newStatus = {
      connected: status.connected,
      permanent: status.permanent,
      email: status.email,
      name: status.name,
      apiOperational: status.apiOperational,
      apiErrorMessage: status.apiErrorMessage,
      enableUrl: status.enableUrl,
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

  const openAccountSwitcher = useCallback(async () => {
    if (!isCurrentAdmin) return;
    setAccountSwitcherOpen(true);
    setIsLoadingAccounts(true);
    const token = localStorage.getItem('cfo_terminal_session');
    try {
      const response = await fetch('/api/admin/users?limit=100', { headers: { Authorization: `Bearer ${token || ''}` } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Nao foi possivel carregar as contas.');
      setSwitchableAccounts((data.items || []).filter((account: any) => account.role !== 'admin' && account.status === 'active'));
    } catch (error: any) {
      setAccountSwitcherOpen(false);
      showToast(error?.message || 'Nao foi possivel carregar as contas.', 'error');
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [isCurrentAdmin, showToast]);

  const startAccountSwitch = useCallback(async (targetUserId: string, stepUpToken?: string) => {
    const adminToken = localStorage.getItem('cfo_terminal_session');
    if (!adminToken || !isCurrentAdmin) return;
    setIsSwitchingAccount(true);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
      if (stepUpToken) headers['x-admin-step-up-token'] = stepUpToken;
      const response = await fetch('/api/admin/impersonation/start', { method: 'POST', headers, body: JSON.stringify({ targetUserId }) });
      const data = await response.json();
      if (response.status === 403 && data.error === 'STEP_UP_REQUIRED' && !stepUpToken) {
        setPendingAccountId(targetUserId);
        setSwitchStepUpError('');
        setSwitchStepUpOpen(true);
        return;
      }
      if (!response.ok || !data.success || !data.token) throw new Error(data.message || 'Nao foi possivel trocar de conta.');

      sessionStorage.setItem('cfo_admin_original_session', adminToken);
      sessionStorage.setItem('cfo_admin_original_expires_at', localStorage.getItem('cfo_terminal_expires_at') || '');
      sessionStorage.setItem('cfo_admin_original_user', localStorage.getItem('cfo_terminal_user') || 'admin');
      sessionStorage.setItem('cfo_admin_original_role', localStorage.getItem('cfo_terminal_role') || 'admin');
      sessionStorage.setItem('cfo_admin_original_notion', localStorage.getItem('cfo_can_access_notion') || 'true');
      sessionStorage.setItem('cfo_admin_original_ifrj', localStorage.getItem('cfo_can_access_ifrj') || 'true');

      localStorage.setItem('cfo_terminal_session', 'cookie');
      localStorage.setItem('cfo_terminal_expires_at', String(data.expiresAt));
      localStorage.setItem('cfo_terminal_user', data.username);
      localStorage.setItem('cfo_terminal_role', data.role);
      localStorage.setItem('cfo_can_access_notion', String(Boolean(data.canAccessNotion)));
      localStorage.setItem('cfo_can_access_ifrj', String(Boolean(data.canAccessIfrj)));
      setUserProfile({ ...data.profile, username: data.username, role: data.role });
      setCanAccessNotion(Boolean(data.canAccessNotion));
      setCanAccessIfrj(Boolean(data.canAccessIfrj));
      setAccountSwitcherOpen(false);
      setSwitchStepUpOpen(false);
      setPendingAccountId(null);
      setIsPersistentStateReady(false);
      clearPersistentStateCache();
      await hydratePersistentState();
      setIsPersistentStateReady(true);
      showToast(`Voce entrou na conta @${data.username}.`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Nao foi possivel trocar de conta.', 'error');
    } finally {
      setIsSwitchingAccount(false);
    }
  }, [isCurrentAdmin, showToast]);

  const confirmAccountSwitchStepUp = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingAccountId) return;
    setSwitchStepUpError('');
    try {
      const token = localStorage.getItem('cfo_terminal_session');
      const response = await fetch('/api/admin/step-up', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: switchStepUpPassword || undefined, totpCode: switchStepUpTotp || undefined }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.stepUpToken) {
        setSwitchStepUpError(data.message || 'Confirmacao invalida.');
        return;
      }
      const target = pendingAccountId;
      setSwitchStepUpPassword('');
      setSwitchStepUpTotp('');
      await startAccountSwitch(target, data.stepUpToken);
    } catch {
      setSwitchStepUpError('Erro de comunicacao ao confirmar a troca.');
    }
  }, [pendingAccountId, startAccountSwitch, switchStepUpPassword, switchStepUpTotp]);

  const returnToAdminAccount = useCallback(async () => {
    const targetToken = localStorage.getItem('cfo_terminal_session');
    const originalToken = sessionStorage.getItem('cfo_admin_original_session');
    if (!targetToken || !originalToken) return;
    try {
      await fetch('/api/auth/impersonation/stop', { method: 'POST', headers: { Authorization: `Bearer ${targetToken}` } });
      localStorage.setItem('cfo_terminal_session', 'cookie');
      localStorage.setItem('cfo_terminal_expires_at', String((await fetch('/api/auth/verify-session', { method: 'POST' }).then((response) => response.json()).catch(() => ({}))).expiresAt || Date.now() + 86400000));
      localStorage.setItem('cfo_terminal_user', sessionStorage.getItem('cfo_admin_original_user') || 'admin');
      localStorage.setItem('cfo_terminal_role', sessionStorage.getItem('cfo_admin_original_role') || 'admin');
      localStorage.setItem('cfo_can_access_notion', sessionStorage.getItem('cfo_admin_original_notion') || 'true');
      localStorage.setItem('cfo_can_access_ifrj', sessionStorage.getItem('cfo_admin_original_ifrj') || 'true');
      ['cfo_admin_original_session', 'cfo_admin_original_expires_at', 'cfo_admin_original_user', 'cfo_admin_original_role', 'cfo_admin_original_notion', 'cfo_admin_original_ifrj'].forEach((key) => sessionStorage.removeItem(key));
      setUserProfile(null);
      setCanAccessNotion(true);
      setCanAccessIfrj(true);
      setIsPersistentStateReady(false);
      clearPersistentStateCache();
      await hydratePersistentState();
      setIsPersistentStateReady(true);
      showToast('Voce voltou para a conta ADM.', 'success');
    } catch {
      showToast('Nao foi possivel voltar para a conta ADM.', 'error');
    }
  }, [showToast]);

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

  // Hydrate server-side user state before loading the study stores. This makes the
  // database the source of truth after a browser reset, rebuild, or redeploy.
  useEffect(() => {
    if (!isTerminalUnlocked) return;
    let cancelled = false;
    void hydratePersistentState().finally(() => {
      if (!cancelled) {
        startPersistentStateSync();
        setIsPersistentStateReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [isTerminalUnlocked]);

  // Initialize Auth & Data on Mount (apenas se terminal destravado)
  useEffect(() => {
    if (!isTerminalUnlocked || !isPersistentStateReady) return;

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
    let unsubscribe: (() => void) | undefined;
    getFirebaseAuthService().then(({ initAuth }) => {
      unsubscribe = initAuth(
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
    });

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
      // 🛡️ Segurança: Validação estrita de origem para proteção contra Cross-Site Scripting (XSS)
      if (event.origin !== window.location.origin) return;
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
      if (unsubscribe) unsubscribe();
      window.removeEventListener('message', handleAuthMessage);
      window.removeEventListener('storage', handleStorageChange);
      if (authChannel) {
        authChannel.close();
      }
    };

  }, [isTerminalUnlocked, isPersistentStateReady, showToast, refreshCalendarStatus]);

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
        // Cadetes usam seu próprio token OAuth no fallback direto; a sessão persistente do backend é administrativa.
        const { googleSignIn } = await getFirebaseAuthService();
        const result = await googleSignIn();
        if (!result) return;
        setUser(result.user);
        setAccessToken(result.accessToken);
        showToast('Google Agenda conectada para esta sessão. Seus estudos serão sincronizados.', 'success');
        return;
      }
    } catch (error: any) {
      showToast(error?.message || 'Não foi possível conectar com o Google Calendar.', 'error');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Google Agenda disconnect keeps the calendar state without ending the app session.
  const handleDisconnectCalendar = async () => {
    await disconnectBackendCalendar();
    setBackendCalendar({ connected: false, permanent: false, email: null, name: null });
    try {
      localStorage.removeItem('cfo_calendar_status');
    } catch (_) {}
    showToast('Google Agenda desconectada.', 'info');
  };

  // Account logout keeps the real existing authentication/session invalidation flow.
  const handleSignOut = async () => {
    await handleDisconnectCalendar();
    try {
      const { logout } = await getFirebaseAuthService();
      await logout();
    } catch (_) {}
    setUser(null);
    setAccessToken(null);
  };

  const getStoredOrFreshToken = useCallback(async () => {
    if (accessToken) return accessToken;
    try {
      const { getAccessToken } = await getFirebaseAuthService();
      return await getAccessToken();
    } catch (_) {
      return null;
    }
  }, [accessToken]);

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

    // A conclusão rápida abre o mesmo formulário para impedir o registro implícito de 1 hora.
    handleCellClick(subject, dayIndex, dateStr);
    return;

    /* Legacy direct-save path retained below only until removed in the next cleanup. */
    const newEntry: StudyEntry = {
      id: existingEntry?.id || `entry_${Date.now()}`,
      subjectId: subject.id,
      dayIndex,
      dateStr,
      completed: true,
      completedAt: new Date().toISOString(),
      entryType: existingEntry?.entryType || 'studied',
      topic: existingEntry?.topic || '',
      durationMinutes: existingEntry?.durationMinutes || 0,
      notes: existingEntry?.notes || '',
      googleCalendarSynced: false,
      revisionScheduled: false,
    };

    // If Google Calendar is connected (either client token or backend permanent session)
    const token = await getStoredOrFreshToken();
    let calendarResult: any = null;

    if (token || backendCalendar.connected) {
      try {
        calendarResult = await syncStudySessionAndRevisions(
          token,
          subject,
          newEntry,
          autoSpacedRevisions
        );
        newEntry.googleCalendarSynced = true;
        newEntry.calendarEventId = calendarResult.studyEventId;
      } catch (err: any) {
        if (err?.code === 'TOKEN_EXPIRED' || err?.name === 'GoogleCalendarAuthError') {
          const status = await refreshCalendarStatus();
          if (!status.connected) {
            setAccessToken(null);
            showToast('Sessão do Google Agenda expirou. Conecte sua conta para renovar.', 'info');
          }
        } else {
          console.warn('Falha ao sincronizar com Google Agenda:', err);
          showToast(err?.message || 'Estudo salvo localmente. Não foi possível conectar ao Google Agenda.', 'error');
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

    if (newEntry.googleCalendarSynced) {
      showToast(
        `✅ ${subject.name} registrado no Google Calendar (${newEntry.entryType === 'reviewing' ? 'Verde • Revisando' : 'Azul • Estudado'})!`,
        'success'
      );
    } else {
      showToast(
        `✅ ${subject.name} marcado como ${newEntry.entryType === 'reviewing' ? 'Revisando' : 'Estudado'}!`,
        'success'
      );
    }
  };

  // Save from detailed StudyDetailModal
  const handleSaveStudyDetail = async (data: {
    completed: boolean;
    entryType: StudyEntryType;
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
      entryType: data.entryType,
      topic: data.topic,
      durationMinutes: data.durationMinutes,
      notes: data.notes,
      googleCalendarSynced: existingEntry?.googleCalendarSynced || false,
      revisionScheduled: false,
    };

    // Sincroniza o registro manual com a Agenda Mensal / Banco de Horas
    try {
      const response = await apiFetch('/api/study-sessions/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store',
        },
        body: JSON.stringify({
          entryId: newEntry.id,
          subjectId: selectedCell.subject.id,
          subjectName: selectedCell.subject.name,
          topic: newEntry.topic,
          dateStr: newEntry.dateStr,
          durationMinutes: newEntry.durationMinutes || 0,
          notes: newEntry.notes,
        }),
      });
      if (!response.ok) throw new Error('Falha ao sincronizar o tempo com o banco de horas.');
    } catch (err) {
      console.warn('Falha ao sincronizar estudo manual com o banco de horas:', err);
    }

    let calendarResult: any = null;

    if (data.completed && data.syncWithCalendar) {
      const token = await getStoredOrFreshToken();
      if (token || backendCalendar.connected) {
        try {
          calendarResult = await syncStudySessionAndRevisions(
            token,
            selectedCell.subject,
            newEntry,
            autoSpacedRevisions
          );
          newEntry.googleCalendarSynced = true;
          newEntry.calendarEventId = calendarResult.studyEventId;
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

    setIsSavingStudy(false);
    setIsStudyModalOpen(false);

    if (newEntry.googleCalendarSynced) {
      showToast(`Evento sincronizado no Google Agenda (${data.entryType === 'reviewing' ? 'Verde • Revisando' : 'Azul • Estudado'})!`, 'success');
    } else {
      showToast('Registro salvo com sucesso!', 'success');
    }
  };

  // Clear a single cell entry (subject + day) completely
  const handleClearCellEntry = async (subjectId: string, dayIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentCycle) return;

    const cellKey = `${subjectId}_${dayIndex}`;
    const entry = currentCycle.entries[cellKey];
    const dateStr = entry?.dateStr || weekDays.find((d) => d.index === dayIndex)?.dateStr;

    const updatedEntries = { ...currentCycle.entries };
    delete updatedEntries[cellKey];

    const updatedCycle = { ...currentCycle, entries: updatedEntries, updatedAt: new Date().toISOString() };
    setCurrentCycle(updatedCycle);
    saveActiveCycle(updatedCycle);
    showToast('Registro de estudo limpo com sucesso!', 'info');

    if (dateStr) {
      try {
        await apiFetch(`/api/study-sessions/day-subject?dateStr=${dateStr}&subjectId=${subjectId}`, {
          method: 'DELETE',
          headers: { 'Cache-Control': 'no-cache, no-store' },
        });
      } catch (err) {
        console.warn('Falha ao sincronizar exclusão com o banco de horas:', err);
      }
    }
  };

  // Clear ALL entries in weekly schedule
  const handleClearAllWeeklyEntries = () => {
    if (!currentCycle) return;
    const count = Object.keys(currentCycle.entries).length;
    if (count === 0) {
      showToast('O cronograma semanal já está limpo.', 'info');
      return;
    }
    setAppConfirmState({
      isOpen: true,
      title: 'Limpar Cronograma Semanal',
      description: 'Tem certeza de que deseja apagar TODOS os estudos marcados nesta semana? Esta ação limpará os tópicos e horas registradas.',
      confirmLabel: 'Apagar Tudo',
      isDestructive: true,
      onConfirm: () => {
        setAppConfirmState(null);
        const updatedCycle = { ...currentCycle, entries: {}, updatedAt: new Date().toISOString() };
        setCurrentCycle(updatedCycle);
        saveActiveCycle(updatedCycle);
        showToast('Todos os registros de estudo do cronograma foram limpos!', 'info');
      },
    });
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
      const secs = Math.round(minutes * 60);
      const toastMsg = minutes < 1 && secs < 60
        ? `Sessão de ${secs}s registrada no cronograma de hoje!`
        : `Sessão de ${Math.round(minutes)} min registrada no cronograma de hoje!`;
      showToast(toastMsg, 'success');
    },
    [currentCycle, weekDays, showToast]
  );

  // Handle study session logged from Agenda de Horas (Heatmap Mensal)
  const handleStudySessionLoggedFromAgenda = useCallback(
    (entry: {
      subjectId: string;
      subjectName: string;
      dateStr: string;
      durationMinutes: number;
      topic?: string;
    }) => {
      if (!currentCycle) return;

      const matchedDay = weekDays.find((d) => d.dateStr === entry.dateStr);
      if (matchedDay) {
        const dayIndex = matchedDay.index;
        const cellKey = `${entry.subjectId}_${dayIndex}`;
        const existing = currentCycle.entries[cellKey];

        const newEntry: StudyEntry = {
          id: existing?.id || `study_agenda_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          subjectId: entry.subjectId,
          dayIndex,
          dateStr: entry.dateStr,
          durationMinutes: (existing?.durationMinutes || 0) + entry.durationMinutes,
          completed: true,
          completedAt: existing?.completedAt || new Date().toISOString(),
          topic: existing?.topic || entry.topic || 'Sessão via Agenda de Horas',
          notes: existing?.notes || 'Sessão registrada via Agenda de Horas',
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
        showToast(
          `Horas contabilizadas na sua Meta Semanal (+${(entry.durationMinutes / 60).toFixed(1)}h)!`,
          'success'
        );
      } else {
        // Se pertencer a semanas anteriores no histórico
        const history = getCyclesHistory();
        let historyUpdated = false;
        const updatedHistory = history.map((histCycle) => {
          if (entry.dateStr >= histCycle.startDate && entry.dateStr <= histCycle.endDate) {
            const histDays = getWeekDaysList(getMondayOfWeek(new Date(histCycle.startDate + 'T12:00:00')));
            const matchedHistDay = histDays.find((d) => d.dateStr === entry.dateStr);
            if (matchedHistDay) {
              const dayIndex = matchedHistDay.index;
              const cellKey = `${entry.subjectId}_${dayIndex}`;
              const existing = histCycle.entries[cellKey];
              historyUpdated = true;
              return {
                ...histCycle,
                entries: {
                  ...histCycle.entries,
                  [cellKey]: {
                    id: existing?.id || `study_agenda_${Date.now()}`,
                    subjectId: entry.subjectId,
                    dayIndex,
                    dateStr: entry.dateStr,
                    durationMinutes: (existing?.durationMinutes || 0) + entry.durationMinutes,
                    completed: true,
                    completedAt: existing?.completedAt || new Date().toISOString(),
                    topic: existing?.topic || entry.topic || 'Sessão via Agenda de Horas',
                    notes: existing?.notes || 'Sessão registrada via Agenda de Horas',
                  },
                },
                updatedAt: new Date().toISOString(),
              };
            }
          }
          return histCycle;
        });

        if (historyUpdated) {
          localStorage.setItem('cfo_cbmerj_cycles_history_v1', JSON.stringify(updatedHistory.slice(0, 52)));
          setCyclesHistory(updatedHistory);
        }
      }
    },
    [currentCycle, weekDays, showToast]
  );

  // Sincroniza sessões de estudo registradas no backend (Agenda de Horas / Banco) com o Ciclo Semanal atual
  const syncWeeklyStudySessionsWithBackend = useCallback(async () => {
    if (!currentCycle || !isTerminalUnlocked) return;
    try {
      const startDate = currentCycle.startDate;
      const endDate = currentCycle.endDate;
      if (!startDate || !endDate) return;

      const res = await apiFetch(`/api/study-sessions/range?startDate=${startDate}&endDate=${endDate}&_t=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) return;

      const data = await res.json();
      const dailySummary = data.summary as Record<
        string,
        {
          dateStr: string;
          totalSeconds: number;
          subjects: Array<{ subjectId: string; subjectName: string; durationSeconds: number }>;
        }
      >;
      if (!dailySummary || Object.keys(dailySummary).length === 0) return;

      let hasChanges = false;
      const updatedEntries = { ...(currentCycle.entries || {}) };

      for (const [dateStr, dayData] of Object.entries(dailySummary)) {
        const matchedDay = weekDays.find((d) => d.dateStr === dateStr);
        if (!matchedDay) continue;

        for (const sub of dayData.subjects || []) {
          const cellKey = `${sub.subjectId}_${matchedDay.index}`;
          const existing = updatedEntries[cellKey];
          const dbMinutes = Math.round(sub.durationSeconds / 60);

          if (dbMinutes > 0) {
            const currentMins = existing?.durationMinutes || 0;
            if (!existing || currentMins < dbMinutes || !existing.completed) {
              hasChanges = true;
              updatedEntries[cellKey] = {
                id: existing?.id || `study_db_${dateStr}_${sub.subjectId}`,
                subjectId: sub.subjectId,
                dayIndex: matchedDay.index,
                dateStr,
                durationMinutes: Math.max(currentMins, dbMinutes),
                completed: true,
                completedAt: existing?.completedAt || new Date().toISOString(),
                topic: existing?.topic || 'Sessão registrada na Agenda de Horas',
                notes: existing?.notes || 'Sincronizado do banco de horas',
                googleCalendarSynced: existing?.googleCalendarSynced || false,
                revisionScheduled: existing?.revisionScheduled || false,
              };
            }
          }
        }
      }

      if (hasChanges) {
        const updatedCycle: WeeklyCycle = {
          ...currentCycle,
          entries: updatedEntries,
          updatedAt: new Date().toISOString(),
        };
        setCurrentCycle(updatedCycle);
        saveActiveCycle(updatedCycle);
      }
    } catch (err) {
      console.warn('[Sync] Falha ao sincronizar horas do banco com ciclo semanal:', err);
    }
  }, [currentCycle, isTerminalUnlocked, weekDays]);

  // Sincroniza sessões de estudo da semana com o backend ao inicializar ou alternar abas
  useEffect(() => {
    if (isTerminalUnlocked && currentCycle?.startDate) {
      syncWeeklyStudySessionsWithBackend();
    }
  }, [isTerminalUnlocked, currentCycle?.startDate, syncWeeklyStudySessionsWithBackend, activeTab]);

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
    setAppConfirmState({
      isOpen: true,
      title: 'Reiniciar Tabela Semanal',
      description: 'Deseja reiniciar a tabela semanal agora? As anotações da semana atual serão salvas no Histórico e a nova semana começará zerada.',
      confirmLabel: 'Iniciar Nova Semana',
      isDestructive: false,
      onConfirm: () => {
        setAppConfirmState(null);
        const freshCycle = forceResetCycle();
        setCurrentCycle(freshCycle);
        setCyclesHistory(getCyclesHistory());
        showToast('Novo ciclo semanal iniciado com sucesso!', 'success');
      },
    });
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
    const token = await getStoredOrFreshToken();
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
    const totalMinutes = completedEntries.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0);
    const distinctSubjects = new Set(completedEntries.map((e) => e.subjectId)).size;
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

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
  // A validação continua antes de expor conteúdo protegido, sem uma splash intrusiva no recarregamento.
  if (isCheckingSession) return null;

  const VALID_APP_ROUTES = [
    '/',
    '/login',
    '/dashboard',
    '/cronograma',
    '/banco-de-provas',
    '/bizuario',
    '/mais-caem',
    '/agenda-horas',
    '/cronometro',
    '/desempenho',
    '/equilibrio-ia',
    '/simulados',
    '/nivelamento',
    '/flashcards',
    '/caderno-de-erros',
    '/agenda-notion',
    '/ifrj',
    '/perfil',
    '/configuracoes',
    '/extensao',
    '/admin',
  ];

  // 🧭 Verificação de Rotas Válidas e Fallback 404
  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isValidRoute = VALID_APP_ROUTES.includes(normalizedPath) || normalizedPath.startsWith('/admin');

  if (!isValidRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <NotFound
          theme={theme}
          onNavigate={(path) => navigate(path)}
          isAuthenticated={isTerminalUnlocked}
        />
      </Suspense>
    );
  }

  // Se o terminal NÃO estiver desbloqueado (visitante ou deslogado)
  if (!isTerminalUnlocked) {
    if (normalizedPath === '/login') {
      return (
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
          <SecurityGate
            onAuthenticated={(_token, _expiresAt, _is2faActive) => {
              setIsTerminalUnlocked(true);
              const notionAccess = localStorage.getItem('cfo_can_access_notion') === 'true';
              setCanAccessNotion(notionAccess);
              setCanAccessIfrj(localStorage.getItem('cfo_can_access_ifrj') === 'true');
              // Recarrega matérias, ciclo e metas para a conta do usuário recém-autenticado
              setSubjects(loadSubjects());
              setWeeklyGoalHours(loadWeeklyGoalHours());
              const { cycle: newCycle } = getOrCreateCurrentCycle();
              setCurrentCycle(newCycle);
              setCyclesHistory(getCyclesHistory());
              setRevisions(loadRevisions());
              const target = (location.state as any)?.from?.pathname || '/cronograma';
              navigate(target, { replace: true });
            }}
            onBackToLanding={() => {
              navigate('/');
            }}
          />
          <CookieConsent />
        </Suspense>
      );
    }

    if (normalizedPath === '/') {
      return (
        <>
          <LandingPage
            onOpenLogin={() => {
              navigate('/login');
            }}
          />
          <CookieConsent />
        </>
      );
    }

    // Para qualquer outra rota protegida, redireciona para /login preservando o destino original
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Se o terminal ESTIVER desbloqueado (autenticado)
  // Redireciona /, /login e /dashboard para /cronograma
  if (normalizedPath === '/' || normalizedPath === '/login' || normalizedPath === '/dashboard') {
    return <Navigate to="/cronograma" replace />;
  }

  // 🛡️ Painel Administrativo (/admin)
  if (normalizedPath === '/admin' || normalizedPath.startsWith('/admin/')) {
    if (!isCurrentAdmin) {
      return <Navigate to="/cronograma" replace />;
    }
    return (
      <Suspense fallback={null}>
        <AdminDashboard
          theme={theme}
          sessionToken={localStorage.getItem('cfo_terminal_session')}
          onBackToApp={() => navigate('/cronograma')}
        />
      </Suspense>
    );
  }

  if (normalizedPath === '/ifrj') {
    if (!canAccessIfrj && userProfile?.role !== 'admin') return <Navigate to="/cronograma" replace />;
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#fff8fb]" />}>
        <IfriStudyTab
          userProfile={userProfile}
          onExit={() => navigate('/cronograma')}
          onSignOut={handleLockTerminal}
        />
      </Suspense>
    );
  }

  // Se usuário sem permissão Notion tentar acessar a agenda Notion
  if (normalizedPath === '/agenda-notion' && !canAccessNotion) {
    return <Navigate to="/cronograma" replace />;
  }

  // Flag global consolidada de conexão do Google Calendar (persistente backend ou Firebase)
  const isCalendarLinked = Boolean(backendCalendar.connected || (user && accessToken));

  return (
    <div
      className={`min-h-screen min-h-[100dvh] w-full max-w-full flex flex-col antialiased selection:bg-[#0056D2] selection:text-white transition-colors duration-200 relative ${
        isDark ? 'bg-[#0B0F17] text-slate-100' : 'bg-white text-slate-900'
      }`}
    >
      {/* 🌐 Network Contingency Notification (Offline / Reconnecting) */}
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full shadow-xl border border-amber-500/40 bg-amber-950/90 text-amber-200 backdrop-blur-md flex items-center gap-2.5 text-xs font-sans font-semibold animate-fade-in"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span>Você está offline. Operando em modo de contingência local.</span>
        </div>
      )}
      {isOnline && isReconnecting && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-full shadow-xl border border-emerald-500/40 bg-emerald-950/90 text-emerald-200 backdrop-blur-md flex items-center gap-2.5 text-xs font-sans font-semibold animate-fade-in"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <span>Conexão restabelecida. Sincronizado com o servidor.</span>
        </div>
      )}

      {backendCalendar.connected && backendCalendar.apiOperational === false && (
        <div
          role="alert"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] max-w-xl w-[92vw] px-4 py-2.5 rounded-xl shadow-2xl border border-amber-500/50 bg-slate-900/95 text-amber-200 backdrop-blur-md flex items-center justify-between gap-3 text-xs font-sans animate-fade-in"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              Google Agenda conectado, mas requer ativação da <strong>Google Calendar API</strong> no Google Cloud.
            </span>
          </div>
          {backendCalendar.enableUrl && (
            <a
              href={backendCalendar.enableUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition-colors shrink-0"
            >
              <span>Ativar API</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Top Header with Tab Selector and Theme Toggle */}
      <Header
        user={user}
        userProfile={userProfile}
        onOpenAccount={() => navigate('/perfil')}
        onOpenSettings={() => navigate('/configuracoes')}
        isAdmin={userProfile?.role === 'admin' || localStorage.getItem('cfo_terminal_role') === 'admin'}
        onOpenAdminSecurity={() => navigate('/admin')}
        hasCalendarAccess={isCalendarLinked}
        isCalendarApiDisabled={backendCalendar.connected && backendCalendar.apiOperational === false}
        calendarEmail={backendCalendar.email || user?.email}
        calendarName={backendCalendar.name || user?.displayName}
        isPermanentCalendar={backendCalendar.permanent}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onDisconnectCalendar={handleDisconnectCalendar}
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
        onSelectTab={handleSelectTab}
        onLockTerminal={handleLockTerminal}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* App Body: Collapsible Tactical Sidebar + Main Content */}
      <div className="flex-1 flex w-full relative min-w-0">
        <TacticalSidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          theme={theme}
          isOpen={isSidebarOpen}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onClose={() => setIsSidebarOpen(false)}
          pendingRevisionsCount={pendingRevisionsCount}
          unreadNotificationsCount={unreadNotificationsCount}
          canAccessNotion={canAccessNotion}
          userProfile={userProfile || { username: localStorage.getItem('cfo_terminal_user') || 'perfil', role: localStorage.getItem('cfo_terminal_role') || undefined }}
          isAdmin={isCurrentAdmin && !isImpersonating}
          canReturnToAdmin={isImpersonating}
          onOpenAccountSwitcher={openAccountSwitcher}
          onReturnToAdmin={returnToAdminAccount}
          onOpenRevisions={() => setIsRevisionsModalOpen(true)}
          onOpenAddSubject={() => setIsAddSubjectModalOpen(true)}
          onOpenHistory={() => setIsHistoryModalOpen(true)}
          onOpenSettings={() => navigate('/configuracoes')}
          onOpenExtension={() => setIsExtensionModalOpen(true)}
          onOpenNotifications={() => setIsNotificationDrawerOpen(true)}
          onOpenAdminSecurity={() => navigate('/admin')}
          onSignOut={handleLockTerminal}
        />

        {/* Main Content Area */}
        <main className={`flex-1 max-w-none w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6 min-w-0 ${isDark ? 'bg-[#0B0F17]' : 'bg-white'}`}>

        {/* Alerta Tático para Administradores se a página estiver em manutenção para alunos */}
        {isCurrentAdmin && (maintenanceStatus.global || maintenanceStatus.pages[activeTab]) && (
          <div className="p-3 bg-red-950/70 border border-red-600/50 rounded-xl flex items-center justify-between text-xs text-red-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                <strong>Modo de Manutenção Ativo:</strong> Esta seção ({activeTab}) está bloqueada para cadetes e alunos com a tela vermelha.
              </span>
            </div>
            <button
              onClick={() => navigate('/admin')}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-[11px] transition-colors"
            >
              Gerenciar no Admin
            </button>
          </div>
        )}

        {/* 🚨 TELA DE MANUTENÇÃO PARA USUÁRIOS/ALUNOS COM ESCRITA GIGANTE E X VERMELHO */}
        {!isCurrentAdmin && (maintenanceStatus.global || maintenanceStatus.pages[activeTab]) ? (
          <MaintenanceScreen
            theme={theme}
            title={maintenanceStatus.global ? 'SISTEMA EM MANUTENÇÃO' : 'PÁGINA EM MANUTENÇÃO'}
            pageName={activeTab}
            message={maintenanceStatus.message}
            isAdmin={false}
            onGoHome={() => navigate('/cronograma')}
            onRefresh={fetchMaintenanceStatus}
          />
        ) : (
          <>
        {/* Render Tab 1: Cronograma Semanal */}
        {activeTab === 'table' && (
          <>
            {/* Dedicated Weekly Goal & Progress Card */}
            <div
                className={`p-5 rounded-xl border transition-all shadow-[0_18px_45px_rgba(0,0,0,0.18)] ${
                  isDark
                    ? 'bg-[#131B2A] border-[#1E293B] shadow-black/40'
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
                  isDark ? 'bg-[#131B2A] border-[#1E293B]' : 'bg-white border-slate-200 shadow-slate-100'
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
                  isDark ? 'bg-[#131B2A] border-[#1E293B]' : 'bg-white border-slate-200 shadow-slate-100'
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
                  isDark ? 'bg-[#131B2A] border-[#1E293B]' : 'bg-white border-slate-200 shadow-slate-100'
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
                  isDark ? 'bg-[#131B2A] border-[#1E293B]' : 'bg-white border-slate-200 shadow-slate-100'
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
                  isDark ? 'bg-[#131B2A] border-[#1E293B]' : 'bg-white border-slate-200 shadow-slate-100'
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
                    onClick={() => handleSelectTab('ai')}
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

              <Suspense fallback={<div className="w-full min-h-[300px] flex items-center justify-center text-slate-500 text-xs">Carregando cronograma...</div>}>
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
              </Suspense>
            </section>
          </>
        )}

        <Suspense fallback={null}>
        {/* Render Tab: Agenda Mensal de Horas (Heatmap Azul Gradativo) */}
        {activeTab === 'monthlyHours' && (
          <MonthlyStudyHeatmapTab
            theme={theme}
            subjects={subjects}
            showToast={showToast}
            onNavigateToTimer={() => handleSelectTab('timer')}
            onStudySessionLogged={handleStudySessionLoggedFromAgenda}
          />
        )}

        {/* Render Tab: Agenda Mensal Contínua & Revisões Notion (Restrito ao Admin) */}
        {activeTab === 'calendar' && canAccessNotion && (
          <NotionAgendaTab
            theme={theme}
            showToast={showToast}
          />
        )}

        {/* Render Tab: Cronômetro & Foco Tático */}
        <TimerTab
          theme={theme}
          subjects={subjects}
          onLogStudySession={handleLogTimerStudySession}
          onOpenStudyModal={handleOpenStudyDetailFromTimer}
          isFloating={activeTab !== 'timer'}
          onNavigateToTimer={() => handleSelectTab('timer')}
          weeklyGoalHours={weeklyGoalHours}
        />

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
              handleSelectTab('bizuario');
              showToast(`Tópico "${topicName}" preparado no Bizuário. Clique em ✨ Gerar Anotações com Gemini AI!`, 'info');
            }}
            onNavigateToSchedule={() => handleSelectTab('table')}
          />
        )}

        {/* Render Tab: Banco de Provas & Resolução por IA */}
        {activeTab === 'examBank' && (
          <ExamBankTab
            theme={theme}
            showToast={showToast}
          />
        )}

        {activeTab === 'learning' && <><StudentCoachPanel theme={theme} /><StudentAnalyticsPanel theme={theme} /><StudentRadarTab theme={theme} /></>}

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

        {/* Render Tab: Simulados & Métricas Táticas */}
        {activeTab === 'simulations' && (
          <>
            <Release3StudyPanel theme={theme} showToast={showToast} />
            <TacticalSimulations theme={theme} showToast={showToast} />
          </>
        )}

        {activeTab === 'leveling' && (
          <LevelingTab theme={theme} showToast={showToast} />
        )}

        {/* Render Tab: Caderno de Erros & Flashcards (Anki Style) */}
        {activeTab === 'flashcards' && (
          <ErrorNotebookTab
            theme={theme}
            showToast={showToast}
          />
        )}

        </Suspense>
          </>
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
      </div>

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
      <Suspense fallback={null}>
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
        onClearEntry={selectedCell ? () => handleClearCellEntry(selectedCell.subject.id, selectedCell.dayIndex) : undefined}
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

      {/* Modal Minha Conta & Perfil do Aluno */}
      {accountSwitcherOpen && !isImpersonating && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-[#0B1220] p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div><h2 className="text-base font-bold text-white flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-cyan-400" /> Trocar de conta</h2><p className="text-xs text-slate-400 mt-1">Apenas contas ativas aparecem. A operacao fica registrada na auditoria.</p></div>
              <button type="button" onClick={() => setAccountSwitcherOpen(false)} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer" aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            {isLoadingAccounts ? <div className="py-10 flex items-center justify-center text-slate-400 text-xs gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando contas...</div> : switchableAccounts.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">Nenhuma outra conta ativa disponivel.</p> : <div className="space-y-2">{switchableAccounts.map((account) => <button key={account.id} type="button" disabled={isSwitchingAccount} onClick={() => startAccountSwitch(account.id)} className="w-full min-h-14 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/70 px-3 text-left hover:border-cyan-500/50 disabled:opacity-50 cursor-pointer"><div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center text-xs font-bold">{(account.fullName || account.username).slice(0, 1).toUpperCase()}</div><span className="min-w-0 flex-1"><strong className="block text-xs text-white truncate">{account.fullName || account.username}</strong><small className="block text-[11px] text-blue-400 font-mono truncate">@{account.username}</small></span><span className="text-[10px] text-slate-500 uppercase">{account.role === 'support' ? 'Suporte' : 'Cadete'}</span></button>)}</div>}
          </div>
        </div>
      )}

      {switchStepUpOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4">
          <form onSubmit={confirmAccountSwitchStepUp} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-amber-500/30 bg-[#0B1220] p-5 shadow-2xl space-y-4">
            <div><h2 className="text-base font-bold text-white">Confirmar troca de conta</h2><p className="text-xs text-slate-400 mt-1">Por seguranca, confirme sua senha de administrador ou o codigo 2FA.</p></div>
            <input type="password" value={switchStepUpPassword} onChange={(e) => setSwitchStepUpPassword(e.target.value)} placeholder="Senha do ADM" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs text-white" />
            <input inputMode="numeric" maxLength={6} value={switchStepUpTotp} onChange={(e) => setSwitchStepUpTotp(e.target.value.replace(/\D/g, ''))} placeholder="Codigo 2FA (opcional)" className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-xs text-white" />
            {switchStepUpError && <p className="text-xs text-red-300">{switchStepUpError}</p>}
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setSwitchStepUpOpen(false)} className="min-h-11 px-4 rounded-xl border border-slate-700 text-xs text-slate-300 cursor-pointer">Cancelar</button><button type="submit" disabled={isSwitchingAccount || (!switchStepUpPassword && switchStepUpTotp.length !== 6)} className="min-h-11 px-4 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">{isSwitchingAccount ? 'Confirmando...' : 'Confirmar'}</button></div>
          </form>
        </div>
      )}

      <MyAccountModal
        isOpen={isMyAccountOpen || normalizedPath === '/perfil' || normalizedPath === '/configuracoes'}
        onClose={() => {
          setIsMyAccountOpen(false);
          if (normalizedPath === '/perfil' || normalizedPath === '/configuracoes') {
            navigate('/cronograma');
          }
        }}
        theme={theme}
        sessionToken={localStorage.getItem('cfo_terminal_session')}
        onProfileUpdated={(updated) => setUserProfile(updated)}
        initialTab={normalizedPath === '/configuracoes' ? 'settings' : (normalizedPath === '/perfil' ? 'profile' : accountInitialTab)}
        autoSpacedRevisions={autoSpacedRevisions}
        onToggleAutoSpacedRevisions={(enabled) => {
          setAutoSpacedRevisions(enabled);
          saveAutoSpacedRevisionsEnabled(enabled);
        }}
      />

      {/* Modal de Monitoramento de Segurança e Auditoria (Admin) */}
      <AdminSecurityPanelModal
        isOpen={isAdminSecurityOpen}
        onClose={() => setIsAdminSecurityOpen(false)}
        theme={theme}
        sessionToken={localStorage.getItem('cfo_terminal_session')}
      />

      {/* Modal Central da Extensão de Navegador */}
      <ExtensionModal
        isOpen={isExtensionModalOpen || normalizedPath === '/extensao'}
        onClose={() => {
          setIsExtensionModalOpen(false);
          if (normalizedPath === '/extensao') {
            navigate('/cronograma');
          }
        }}
        theme={theme}
      />


      {/* Banner LGPD de Cookies de Sessão */}
      <CookieConsent />

      {/* Central de Notificações & Alertas de Segurança */}
      <NotificationCenterDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        notifications={notifications}
        unreadCount={unreadNotificationsCount}
        onMarkAsRead={handleMarkNotificationAsRead}
        onMarkAllAsRead={handleMarkAllNotificationsAsRead}
        theme={theme}
      />

      <SecurityAlertPopup
        alert={activeAlertPopup}
        onClose={() => setActiveAlertPopup(null)}
        onOpenCenter={() => {
          setActiveAlertPopup(null);
          setIsNotificationDrawerOpen(true);
        }}
        onMarkAsRead={handleMarkNotificationAsRead}
        canViewIp={canViewSecurityAlertIp}
        theme={theme}
      />

      <UpdateNoticeModal />

      {/* Modal de Confirmação Global do App */}
      {appConfirmState && (
        <ConfirmModal
          isOpen={appConfirmState.isOpen}
          title={appConfirmState.title}
          description={appConfirmState.description}
          confirmLabel={appConfirmState.confirmLabel || 'Confirmar'}
          cancelLabel={appConfirmState.cancelLabel || 'Cancelar'}
          variant={appConfirmState.isDestructive ? 'danger' : 'warning'}
          iconType={appConfirmState.isDestructive ? 'danger' : 'reset'}
          theme={theme}
          onConfirm={appConfirmState.onConfirm}
          onClose={() => setAppConfirmState(null)}
        />
      )}
      </Suspense>
    </div>
  );
}
