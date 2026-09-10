import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  KeyRound,
  FileText,
  ShieldCheck,
  Settings,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  UserCheck,
  UserX,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Shield,
  Activity,
  Laptop,
  X,
  BrainCircuit,
} from 'lucide-react';
import { AppTheme } from '../../types';
import { BoardIntelligencePanel } from './BoardIntelligencePanel';

export type AdminTab =
  | 'dashboard'
  | 'boardIntelligence'
  | 'users'
  | 'security'
  | 'sessions'
  | 'audit'
  | 'admins'
  | 'notion'
  | 'settings';

interface AdminDashboardProps {
  theme: AppTheme;
  sessionToken: string | null;
  onBackToApp: () => void;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers24h: number;
  newUsers30d: number;
  suspendedUsers: number;
  adminCount: number;
  loginSuccess24h: number;
  loginFailed24h: number;
  twoFactorFailed24h: number;
  anomalousIpsCount: number;
}

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'cadet' | 'support';
  status: 'active' | 'suspended' | 'pending_activation';
  createdAt: string;
  updatedAt: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  canAccessNotion: boolean;
}

interface UserDetail {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'cadet' | 'support';
  status: 'active' | 'suspended' | 'pending_activation';
  canAccessNotion: boolean;
  createdAt: string;
  updatedAt: string;
  profile: {
    fullName: string;
    phone: string | null;
    targetExam: string | null;
    bio: string | null;
    avatarUrl: string | null;
  };
  activeSessions: Array<{
    id: string;
    userId: string;
    role: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: string;
    createdAt: string;
    isValid: boolean;
  }>;
  securityEvents: Array<{
    id: string;
    action: string;
    actor: string;
    resource: string;
    status: string;
    ip: string | null;
    userAgent: string | null;
    detailsJson: string | null;
    createdAt: string;
  }>;
}

interface SessionItem {
  id: string;
  userId: string;
  email: string;
  username: string;
  role: 'admin' | 'cadet';
  ip: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
  isValid: boolean;
}

interface AuditEventItem {
  id: string;
  action: string;
  actor: string;
  actorUserId?: string | null;
  resource: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  detailsJson?: string | null;
  createdAt: string;
}

interface AnomalyItem {
  ip: string;
  failedAttempts: number;
}

interface AccountCreationKeyItem {
  id: string;
  createdAt: string;
  usedAt?: string | null;
  expiresAt?: string | null;
  usedByUsername?: string | null;
  isUsed: boolean;
  isExpired: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  theme,
  sessionToken,
  onBackToApp,
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');

  // Estado Geral de Autenticação / Autorização do Admin
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Estados dos Dados
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionItem[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEventItem[]>([]);

  // Aba Usuários
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>('');
  const [usersStatusFilter, setUsersStatusFilter] = useState<string>('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [newAccount, setNewAccount] = useState({ fullName: '', email: '', username: '', password: '', role: 'cadet' as 'cadet' | 'support' | 'admin', canAccessNotion: false });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [accountCreationKeys, setAccountCreationKeys] = useState<AccountCreationKeyItem[]>([]);
  const [generatedAccountKey, setGeneratedAccountKey] = useState<{ rawKey: string; expiresAt: string } | null>(null);
  const [isGeneratingAccountKey, setIsGeneratingAccountKey] = useState(false);

  // Ficha Detalhada de Usuário
  const [currentAdminRole, setCurrentAdminRole] = useState<string>('admin');
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'sessions' | 'security'>('overview');

  // Aba Sessões
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);

  // Aba Auditoria & Segurança
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('');
  const [auditActorFilter, setAuditActorFilter] = useState<string>('');
  const [auditResourceFilter, setAuditResourceFilter] = useState<string>('');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');
  const [auditSearch, setAuditSearch] = useState('');
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [selectedAuditEvent, setSelectedAuditEvent] = useState<AuditEventItem | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Aba Administradores
  const [adminsList, setAdminsList] = useState<UserItem[]>([]);

  // Feedback de Ações
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 🛡️ Step-Up Authentication State
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [isStepUpModalOpen, setIsStepUpModalOpen] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpTotp, setStepUpTotp] = useState('');
  const [stepUpError, setStepUpError] = useState('');
  const [isStepUpLoading, setIsStepUpLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<((token: string) => Promise<void>) | null>(null);

  // 🔐 Recovery Codes State
  const [recoveryCount, setRecoveryCount] = useState<number | null>(null);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [isGeneratingRecoveryCodes, setIsGeneratingRecoveryCodes] = useState(false);

  // ⚡ Conexão Realtime Server-Sent Events (SSE)
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'reconnecting' | 'offline'>('reconnecting');
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState<string | null>(null);
  const processedEventIds = React.useRef(new Set<string>());

  const handleRealtimeEvent = useCallback((type: string, payload: any) => {
    const eventData = payload.data || payload;

    // Atualização reativa de contadores do dashboard
    setStats((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (type === 'LOGIN_FAILED') next.loginFailed24h += 1;
      else if (type === 'ADMIN_LOGIN_FAILED') next.loginFailed24h += 1;
      else if (type === 'SECURITY_ALERT' || type === '2FA_FAILED') next.twoFactorFailed24h += 1;
      else if (type === 'ACCOUNT_SUSPENDED') next.suspendedUsers += 1;
      else if (type === 'USER_CREATED') next.totalUsers += 1;
      return next;
    });

    // Se for evento de auditoria, adiciona no topo da lista sem recarregar tela
    if (eventData && eventData.action) {
      const newAuditItem: AuditEventItem = {
        id: payload.id || crypto.randomUUID(),
        action: eventData.action,
        actor: eventData.actor || 'sistema',
        resource: eventData.resource || '/realtime',
        status: eventData.status || 'WARNING',
        ip: eventData.ip || null,
        userAgent: eventData.userAgent || null,
        userId: eventData.userId || null,
        detailsJson: eventData.details ? JSON.stringify(eventData.details) : null,
        createdAt: payload.timestamp || new Date().toISOString(),
      };

      setRecentEvents((prev) => [newAuditItem, ...prev.slice(0, 9)]);
    }
  }, []);

  const getHeaders = useCallback((overrideStepUp?: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }
    const tokenToUse = overrideStepUp !== undefined ? overrideStepUp : stepUpToken;
    if (tokenToUse) {
      headers['x-admin-step-up-token'] = tokenToUse;
    }
    return headers;
  }, [sessionToken, stepUpToken]);

  // Efeito de conexão contínua ao SSE Realtime
  useEffect(() => {
    if (!isAuthorized || !sessionToken) return;

    let isMounted = true;
    const abortController = new AbortController();
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;

    const connectSse = async () => {
      try {
        if (!isMounted) return;
        setRealtimeStatus('reconnecting');

        const res = await fetch('/api/admin/realtime/stream', {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            Accept: 'text/event-stream',
          },
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        if (!res.body) {
          throw new Error('Corpo de stream indisponível.');
        }

        if (isMounted) {
          setRealtimeStatus('connected');
          reconnectAttempts = 0;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isMounted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent: { id?: string; event?: string; data?: any } = {};

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              if (currentEvent.data) {
                const eventId = currentEvent.id || '';
                if (eventId && processedEventIds.current.has(eventId)) {
                  currentEvent = {};
                  continue;
                }
                if (eventId) {
                  processedEventIds.current.add(eventId);
                  if (processedEventIds.current.size > 150) {
                    const first = processedEventIds.current.values().next().value;
                    if (first) processedEventIds.current.delete(first);
                  }
                }

                if (isMounted) {
                  setLastRealtimeEventAt(new Date().toLocaleTimeString());
                  handleRealtimeEvent(currentEvent.event || 'METRICS_UPDATED', currentEvent.data);
                }
              }
              currentEvent = {};
              continue;
            }

            if (trimmed.startsWith(':')) {
              // Keepalive ping do servidor
              continue;
            }

            if (trimmed.startsWith('id:')) {
              currentEvent.id = trimmed.slice(3).trim();
            } else if (trimmed.startsWith('event:')) {
              currentEvent.event = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              try {
                currentEvent.data = JSON.parse(trimmed.slice(5).trim());
              } catch {
                currentEvent.data = trimmed.slice(5).trim();
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (isMounted) {
          setRealtimeStatus('offline');
          reconnectAttempts++;
          const delay = Math.min(15000, 2000 * Math.pow(1.5, reconnectAttempts));
          reconnectTimeout = setTimeout(() => {
            if (isMounted) connectSse();
          }, delay);
        }
      }
    };

    connectSse();

    return () => {
      isMounted = false;
      abortController.abort();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [isAuthorized, sessionToken, handleRealtimeEvent]);

  // 1. Verificação de Acesso Server-Side
  useEffect(() => {
    let isMounted = true;
    setIsVerifying(true);

    fetch('/api/admin/verify', { headers: getHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Acesso administrativo restrito. Autenticação de comando necessária.');
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          if (data.success && data.verified) {
            setIsAuthorized(true);
            if (data.user?.role) {
              setCurrentAdminRole(data.user.role);
            }
          } else {
            setIsAuthorized(false);
            setAuthError('Sessão não possui privilégios de Administrador.');
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setIsAuthorized(false);
          setAuthError(err.message || 'Falha de autorização administrativa.');
        }
      })
      .finally(() => {
        if (isMounted) setIsVerifying(false);
      });

    return () => {
      isMounted = false;
    };
  }, [getHeaders]);

  // Carregar Dados do Dashboard
  const loadDashboard = useCallback(() => {
    if (!isAuthorized) return;
    fetch('/api/admin/dashboard', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStats(data.stats);
          setAnomalies(data.anomalies || []);
          setRecentSessions(data.recentSessions || []);
          setRecentEvents(data.recentEvents || []);
        }
      })
      .catch(() => {});
  }, [isAuthorized, getHeaders]);

  // Carregar Usuários
  const loadUsers = useCallback(() => {
    if (!isAuthorized) return;
    setIsUsersLoading(true);
    const params = new URLSearchParams({
      page: String(usersPage),
      limit: '15',
    });
    if (usersSearch.trim()) params.append('search', usersSearch.trim());
    if (usersRoleFilter) params.append('role', usersRoleFilter);
    if (usersStatusFilter) params.append('status', usersStatusFilter);

    fetch(`/api/admin/users?${params.toString()}`, { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUsers(data.items || []);
          setUsersTotal(data.total || 0);
          setUsersTotalPages(data.totalPages || 1);
        }
      })
      .catch(() => {})
      .finally(() => setIsUsersLoading(false));
  }, [isAuthorized, usersPage, usersSearch, usersRoleFilter, usersStatusFilter, getHeaders]);

  // Carregar Sessões
  const loadSessions = useCallback(() => {
    if (!isAuthorized) return;
    setIsSessionsLoading(true);
    fetch('/api/admin/sessions?limit=50', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSessions(data.sessions || []);
        }
      })
      .catch(() => {})
      .finally(() => setIsSessionsLoading(false));
  }, [isAuthorized, getHeaders]);

  // Carregar Eventos de Auditoria
  const loadAudit = useCallback(() => {
    if (!isAuthorized) return;
    setIsAuditLoading(true);
    const params = new URLSearchParams({
      page: String(auditPage),
      limit: '20',
    });
    if (auditActionFilter) params.append('action', auditActionFilter);
    if (auditStatusFilter) params.append('status', auditStatusFilter);
    if (auditActorFilter.trim()) params.append('actor', auditActorFilter.trim());
    if (auditResourceFilter.trim()) params.append('resource', auditResourceFilter.trim());
    if (auditStartDate) params.append('startDate', auditStartDate);
    if (auditEndDate) params.append('endDate', auditEndDate);
    if (auditSearch.trim()) params.append('search', auditSearch.trim());

    fetch(`/api/admin/security/events?${params.toString()}`, { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAuditEvents(data.items || []);
          setAuditTotal(data.total || 0);
          setAuditTotalPages(data.totalPages || 1);
        }
      })
      .catch(() => {})
      .finally(() => setIsAuditLoading(false));
  }, [
    isAuthorized,
    auditPage,
    auditActionFilter,
    auditStatusFilter,
    auditActorFilter,
    auditResourceFilter,
    auditStartDate,
    auditEndDate,
    auditSearch,
    getHeaders,
  ]);

  // Carregar Administradores
  const loadAdmins = useCallback(() => {
    if (!isAuthorized) return;
    fetch('/api/admin/admins', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAdminsList(data.admins || []);
        }
      })
      .catch(() => {});
  }, [isAuthorized, getHeaders]);

  const loadAccountCreationKeys = useCallback(() => {
    if (!isAuthorized || currentAdminRole !== 'admin') return;
    fetch('/api/admin/account-keys', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAccountCreationKeys(data.keys || []);
      })
      .catch(() => {});
  }, [isAuthorized, currentAdminRole, getHeaders]);

  // Efeito para recarregar dados quando a aba mudar
  useEffect(() => {
    if (!isAuthorized) return;
    if (activeTab === 'dashboard') loadDashboard();
    else if (activeTab === 'users') loadUsers();
    else if (activeTab === 'sessions') loadSessions();
    else if (activeTab === 'security' || activeTab === 'audit') {
      loadAudit();
      loadRecoveryCount();
    }
    else if (activeTab === 'admins') loadAdmins();
    else if (activeTab === 'notion') {
      loadUsers();
      loadAccountCreationKeys();
    }
  }, [activeTab, isAuthorized, loadDashboard, loadUsers, loadSessions, loadAudit, loadAdmins, loadAccountCreationKeys]);

  // Submeter Confirmação de Step-Up
  const handleConfirmStepUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepUpError('');
    setIsStepUpLoading(true);

    try {
      const res = await fetch('/api/admin/step-up', {
        method: 'POST',
        headers: getHeaders(null),
        body: JSON.stringify({
          password: stepUpPassword || undefined,
          totpCode: stepUpTotp || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.stepUpToken) {
        setStepUpError(data.message || 'Credencial de confirmação incorreta.');
        return;
      }

      setStepUpToken(data.stepUpToken);
      setIsStepUpModalOpen(false);
      setStepUpPassword('');
      setStepUpTotp('');

      if (pendingAction) {
        const action = pendingAction;
        setPendingAction(null);
        await action(data.stepUpToken);
      }
    } catch {
      setStepUpError('Erro de conexão ao autenticar Step-Up.');
    } finally {
      setIsStepUpLoading(false);
    }
  };

  // Carregar Quantidade de Recovery Codes Restantes
  const loadRecoveryCount = useCallback(() => {
    if (!isAuthorized) return;
    fetch('/api/admin/2fa/recovery-codes-count', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && typeof data.remainingCount === 'number') {
          setRecoveryCount(data.remainingCount);
        }
      })
      .catch(() => {});
  }, [isAuthorized, getHeaders]);

  // Gerar Novos Códigos de Recuperação
  const handleGenerateRecoveryCodes = async (overrideStepUp?: string) => {
    setIsGeneratingRecoveryCodes(true);
    try {
      const res = await fetch('/api/admin/2fa/generate-recovery-codes', {
        method: 'POST',
        headers: getHeaders(overrideStepUp),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleGenerateRecoveryCodes(token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success && data.codes) {
        setNewRecoveryCodes(data.codes);
        setRecoveryCount(data.codes.length);
        setActionFeedback({ type: 'success', message: 'Novos códigos de recuperação gerados com sucesso!' });
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao gerar códigos.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicação ao gerar recovery codes.' });
    } finally {
      setIsGeneratingRecoveryCodes(false);
    }
  };

  // Ficha e Detalhes de Usuário
  const handleViewUserDetail = async (userId: string) => {
    setIsDetailLoading(true);
    setIsDetailModalOpen(true);
    setDetailTab('overview');
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { headers: getHeaders() });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setSelectedUserDetail(data.user);
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao carregar detalhes do usuário.' });
        setIsDetailModalOpen(false);
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicação ao carregar detalhes.' });
      setIsDetailModalOpen(false);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Revogar Todas as Sessões Ativas do Usuário
  const handleRevokeAllUserSessions = async (targetUser: { id: string; username: string }, overrideStepUp?: string) => {
    if (!overrideStepUp) {
      if (!window.confirm(`Tem certeza que deseja revogar IMEDIATAMENTE todas as sessões ativas de @${targetUser.username}?`)) return;
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/revoke-sessions`, {
        method: 'POST',
        headers: getHeaders(overrideStepUp),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleRevokeAllUserSessions(targetUser, token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: data.message });
        if (selectedUserDetail && selectedUserDetail.id === targetUser.id) {
          handleViewUserDetail(targetUser.id);
        }
        loadDashboard();
        loadSessions();
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao revogar sessões do usuário.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicação ao revogar sessões.' });
    }
  };

  // Alterar Cargo / Privilégio do Usuário (Admin, Suporte, Cadete)
  const handleChangeUserRole = async (targetUser: { id: string; username: string }, newRole: 'cadet' | 'support' | 'admin', overrideStepUp?: string) => {
    if (!overrideStepUp) {
      const roleName = newRole === 'admin' ? 'ADMINISTRADOR' : newRole === 'support' ? 'SUPORTE (SOMENTE LEITURA)' : 'CADETE';
      if (!window.confirm(`Deseja alterar o papel de @${targetUser.username} para ${roleName}?`)) return;
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/role`, {
        method: 'PATCH',
        headers: getHeaders(overrideStepUp),
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleChangeUserRole(targetUser, newRole, token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: data.message });
        loadUsers();
        if (selectedUserDetail && selectedUserDetail.id === targetUser.id) {
          handleViewUserDetail(targetUser.id);
        }
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao alterar papel.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro ao alterar papel.' });
    }
  };

  // Ações de Usuário (Suspender / Reativar)
  const handleToggleUserStatus = async (user: UserItem | UserDetail, overrideStepUp?: string) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    if (!overrideStepUp) {
      const confirmMsg = nextStatus === 'suspended'
        ? `Tem certeza que deseja SUSPENDER o usuário @${user.username}? Todas as sessões dele serão revogadas imediatamente.`
        : `Deseja reativar o acesso de @${user.username}?`;
      if (!window.confirm(confirmMsg)) return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH',
        headers: getHeaders(overrideStepUp),
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleToggleUserStatus(user, token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: data.message });
        loadUsers();
        loadDashboard();
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao alterar status.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicação ao alterar status.' });
    }
  };

  // Ações de Usuário (Promover / Rebaixar Role)
  const handleToggleUserRole = async (user: UserItem, overrideStepUp?: string) => {
    const nextRole = user.role === 'admin' ? 'cadet' : 'admin';
    if (!overrideStepUp) {
      const confirmMsg = nextRole === 'admin'
        ? `Deseja conceder privilégios de ADMINISTRADOR a @${user.username}?`
        : `Deseja revogar os privilégios administrativos de @${user.username}?`;
      if (!window.confirm(confirmMsg)) return;
    }

    try {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PATCH',
        headers: getHeaders(overrideStepUp),
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleToggleUserRole(user, token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: data.message });
        loadUsers();
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao alterar papel.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro ao alterar privilégios.' });
    }
  };

  // Ações de Sessão (Revogar)
  const handleToggleNotionAccess = async (user: UserItem, overrideStepUp?: string) => {
    const nextAccess = user.role === 'admin' ? true : !user.canAccessNotion;
    if (!overrideStepUp && !window.confirm(nextAccess ? `Liberar a aba Notion para @${user.username}?` : `Remover a aba Notion de @${user.username}?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}/notion-access`, { method: 'PATCH', headers: getHeaders(overrideStepUp), body: JSON.stringify({ canAccessNotion: nextAccess }) });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleToggleNotionAccess(user, token));
        setIsStepUpModalOpen(true);
        return;
      }
      setActionFeedback({ type: res.ok ? 'success' : 'error', message: data.message || 'Falha ao alterar acesso ao Notion.' });
      if (res.ok) loadUsers();
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicacao ao alterar acesso ao Notion.' });
    }
  };

  const handleDeleteAccount = async (user: UserItem, overrideStepUp?: string) => {
    if (!overrideStepUp && !window.confirm(`Excluir definitivamente a conta @${user.username}? Esta acao nao pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: getHeaders(overrideStepUp) });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleDeleteAccount(user, token));
        setIsStepUpModalOpen(true);
        return;
      }
      setActionFeedback({ type: res.ok ? 'success' : 'error', message: data.message || 'Falha ao excluir conta.' });
      if (res.ok) { loadUsers(); loadDashboard(); }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicacao ao excluir conta.' });
    }
  };

  const handleCreateAccount = async (overrideStepUp?: string) => {
    if (!overrideStepUp && (!newAccount.email || !newAccount.username || !newAccount.password)) {
      setActionFeedback({ type: 'error', message: 'Preencha e-mail, username e senha para criar a conta.' });
      return;
    }
    setIsCreatingAccount(true);
    try {
      const res = await fetch('/api/admin/users', { method: 'POST', headers: getHeaders(overrideStepUp), body: JSON.stringify(newAccount) });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleCreateAccount(token));
        setIsStepUpModalOpen(true);
        return;
      }
      setActionFeedback({ type: res.ok ? 'success' : 'error', message: data.message || 'Falha ao criar conta.' });
      if (res.ok) {
        setNewAccount({ fullName: '', email: '', username: '', password: '', role: 'cadet', canAccessNotion: false });
        loadUsers();
        loadDashboard();
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicacao ao criar conta.' });
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleGenerateAccountKey = async (overrideStepUp?: string) => {
    setIsGeneratingAccountKey(true);
    try {
      const res = await fetch('/api/admin/account-keys', { method: 'POST', headers: getHeaders(overrideStepUp) });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleGenerateAccountKey(token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (!res.ok || !data.success || !data.key?.rawKey) {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao gerar chave de cadastro.' });
        return;
      }
      setGeneratedAccountKey({ rawKey: data.key.rawKey, expiresAt: data.key.expiresAt });
      loadAccountCreationKeys();
      try {
        await navigator.clipboard.writeText(data.key.rawKey);
        setActionFeedback({ type: 'success', message: 'Chave gerada e copiada para a área de transferência.' });
      } catch {
        setActionFeedback({ type: 'success', message: 'Chave gerada. Copie-a antes de fechar este aviso.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro de comunicação ao gerar chave.' });
    } finally {
      setIsGeneratingAccountKey(false);
    }
  };

  const handleRevokeSession = async (sessionId: string, overrideStepUp?: string) => {
    if (!overrideStepUp) {
      if (!window.confirm('Deseja realmente revogar esta sessão imediatamente? O usuário será desconectado.')) return;
    }
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: getHeaders(overrideStepUp),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        setPendingAction(() => (token: string) => handleRevokeSession(sessionId, token));
        setIsStepUpModalOpen(true);
        return;
      }
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: data.message });
        loadSessions();
        loadDashboard();
      } else {
        setActionFeedback({ type: 'error', message: data.message || 'Falha ao revogar sessão.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Erro ao revogar sessão.' });
    }
  };

  // ============================================================================
  // TELA DE VERIFICAÇÃO / ACESSO NEGADO (HTTP 403 / ANTI-BYPASS)
  // ============================================================================
  if (isVerifying) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? 'bg-[#060B14] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
        <p className="mt-4 font-mono text-sm tracking-wider text-amber-400 uppercase font-bold">
          Validando Autoridade Administrativa Server-Side...
        </p>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${isDark ? 'bg-[#060B14] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
        <div className="max-w-md w-full bg-red-950/20 border border-red-800/60 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <span className="font-mono text-xs font-black uppercase tracking-widest text-red-400 bg-red-950/60 px-2.5 py-1 rounded border border-red-800/40">
            HTTP 403 • ACESSO NEGADO
          </span>
          <h2 className="text-xl font-black mt-4 mb-2 text-white">
            Área de Comando Restrita
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            {authError || 'Você não possui credenciais administrativas válidas para acessar o painel /admin.'}
          </p>
          <button
            type="button"
            onClick={onBackToApp}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Retornar à Área de Estudos
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PAINEL ADMINISTRATIVO AUTORIZADO
  // ============================================================================
  return (
    <div className={`min-h-screen flex flex-col antialiased ${isDark ? 'bg-[#060B14] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Top Navbar */}
      <header className={`sticky top-0 z-30 border-b px-3 sm:px-6 py-3 backdrop-blur-md flex flex-col gap-3 md:flex-row md:items-center md:justify-between ${
        isDark ? 'bg-[#0A101D]/90 border-slate-800' : 'bg-white/90 border-slate-200 shadow-xs'
      }`}>
        <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
          <button
            type="button"
            onClick={onBackToApp}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black'
            }`}
            title="Voltar ao Cronograma de Estudos"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center p-1.5 shadow-xs">
            <Shield className="w-full h-full text-amber-400" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2 min-w-0">
                Painel Administrativo
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-bold">
                  /ADMIN
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              Controle Geral do Sistema & Segurança • CFO CBMERJ
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 w-full md:w-auto overflow-x-auto pb-0.5">
          {/* Badge de Conexão Realtime SSE */}
          {realtimeStatus === 'connected' && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold select-none shadow-xs"
              title={`Streaming SSE ativo com baixa latência.${lastRealtimeEventAt ? ` Último evento: ${lastRealtimeEventAt}` : ''}`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              AO VIVO
            </div>
          )}

          {realtimeStatus === 'reconnecting' && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold select-none"
              title="Tentando restabelecer streaming realtime..."
            >
              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
              RECONECTANDO
            </div>
          )}

          {realtimeStatus === 'offline' && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono font-bold select-none"
              title="Canal realtime temporariamente offline."
            >
              <span className="w-2 h-2 rounded-full bg-red-500" />
              OFFLINE
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'dashboard') loadDashboard();
              else if (activeTab === 'users') loadUsers();
              else if (activeTab === 'sessions') loadSessions();
              else if (activeTab === 'security' || activeTab === 'audit') loadAudit();
              else if (activeTab === 'admins') loadAdmins();
              else if (activeTab === 'notion') loadUsers();
            }}
            className={`min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
              isDark ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:text-white' : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black'
            }`}
            title="Atualizar dados agora"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center min-h-11 md:min-h-0 gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-xs cursor-pointer shrink-0"
          >
            Área do Aluno
          </button>
        </div>
      </header>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`px-6 py-2 flex items-center justify-between text-xs font-medium ${
          actionFeedback.type === 'success'
            ? 'bg-emerald-950/80 border-b border-emerald-800 text-emerald-300'
            : 'bg-red-950/80 border-b border-red-800 text-red-300'
        }`}>
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="p-1 hover:opacity-80 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 flex flex-col md:flex-row w-full min-w-0">
        
        {/* Sidebar */}
        <aside className={`w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r p-3 sm:p-4 flex flex-row md:flex-col flex-nowrap gap-1.5 overflow-x-auto select-none scrollbar-thin ${
          isDark ? 'bg-[#080D18] border-slate-800/80' : 'bg-white border-slate-200'
        }`}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold px-3 py-1 hidden md:block">
            Menu Operacional
          </p>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-amber-400" />
            Dashboard
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('boardIntelligence')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'boardIntelligence'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <BrainCircuit className="w-4 h-4 text-cyan-400" />
            Inteligencia da Banca
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <Users className="w-4 h-4 text-blue-400" />
            Usuários
            {stats && (
              <span className="ml-auto text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                {stats.totalUsers}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-red-400" />
            Segurança
            {anomalies.length > 0 && (
              <span className="ml-auto text-[10px] font-mono bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded font-bold">
                {anomalies.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <KeyRound className="w-4 h-4 text-emerald-400" />
            Sessões
            {stats && (
              <span className="ml-auto text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                {stats.activeUsers24h}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <FileText className="w-4 h-4 text-purple-400" />
            Auditoria
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-yellow-400" />
            Administradores
            {stats && (
              <span className="ml-auto text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                {stats.adminCount}
              </span>
            )}
          </button>

          {currentAdminRole === 'admin' && (
            <button
              type="button"
              onClick={() => setActiveTab('notion')}
              className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'notion'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
              }`}
            >
              <Globe className="w-4 h-4 text-cyan-400" />
              Notion / Contas
            </button>
          )}

          <div className="mt-0 md:mt-auto pt-0 md:pt-4 border-t border-slate-800/60 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`shrink-0 w-auto md:w-full min-h-11 md:min-h-0 whitespace-nowrap flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-400" />
              Configurações
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full space-y-6 min-w-0">
          
          {/* ================================================================= */}
          {/* TAB: DASHBOARD                                                    */}
          {/* ================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Alerta de Anomalia Factual */}
              {anomalies.length > 0 && (
                <div className="bg-red-950/40 border border-red-800/70 rounded-2xl p-4 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  <div className="flex-1 text-xs">
                    <p className="font-bold text-red-200">
                      {anomalies.length} IP(s) com atividade anômala registrada nas últimas 24h
                    </p>
                    <p className="text-red-300/80">
                      Tentativas repetidas de autenticação com falha detectadas:{' '}
                      {anomalies.map((a) => `${a.ip} (${a.failedAttempts} falhas)`).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('security')}
                    className="text-xs font-semibold px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-lg transition-all"
                  >
                    Ver Segurança
                  </button>
                </div>
              )}

              {/* Grid de Métricas Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                    <span>Total de Usuários</span>
                    <Users className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="text-2xl font-black text-white">{stats?.totalUsers ?? '—'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Cadastrados na base oficial
                  </p>
                </div>

                <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                    <span>Usuários Ativos (24h)</span>
                    <Activity className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-black text-emerald-400">{stats?.activeUsers24h ?? '—'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Com sessões registradas hoje
                  </p>
                </div>

                <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                    <span>Logins Bem-Sucedidos</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                  </div>
                  <p className="text-2xl font-black text-blue-400">{stats?.loginSuccess24h ?? '—'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Autenticações válidas em 24h
                  </p>
                </div>

                <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-semibold mb-2">
                    <span>Falhas / Tentativas</span>
                    <XCircle className="w-4 h-4 text-red-400" />
                  </div>
                  <p className="text-2xl font-black text-red-400">{stats?.loginFailed24h ?? '—'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Falhas de login em 24h
                  </p>
                </div>
              </div>

              {/* Linha Dupla: Sessões Recentes & Atividades Recentes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Sessões Ativas Relevantes */}
                  <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-emerald-400" />
                      Sessões Recentes em Aberto
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('sessions')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Ver todas
                    </button>
                  </div>

                  <div className="space-y-2">
                    {recentSessions.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Nenhuma sessão ativa encontrada.</p>
                    ) : (
                      recentSessions.slice(0, 5).map((s) => (
                        <div key={s.id} className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">@{s.username}</span>
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                {s.role}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                              IP: {s.ip || '127.0.0.1'}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono break-words sm:text-right">
                            Expira: {new Date(s.expiresAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Atividade de Segurança Recente */}
                <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 sm:p-5 space-y-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-400" />
                      Últimos Eventos Registrados
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('security')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      Ver todos
                    </button>
                  </div>

                  <div className="space-y-2">
                    {recentEvents.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Nenhum evento recente.</p>
                    ) : (
                      recentEvents.slice(0, 5).map((e) => (
                        <div key={e.id} className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold font-mono text-[11px] ${
                                e.status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'
                              }`}>
                                {e.action}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                por <strong className="text-slate-200">@{e.actor}</strong>
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                              {e.ip || 'IP não informado'}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono break-words sm:text-right">
                            {new Date(e.createdAt).toLocaleTimeString('pt-BR')}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'boardIntelligence' && (
            <BoardIntelligencePanel
              theme={theme}
              sessionToken={sessionToken}
              canWrite={currentAdminRole === 'admin'}
            />
          )}

          {/* ================================================================= */}
          {/* TAB: USUÁRIOS                                                     */}
          {/* ================================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              
              {/* Barra de Filtros e Busca */}
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex-1 min-w-[240px] relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Pesquisar por nome, @username, e-mail ou ID..."
                    value={usersSearch}
                    onChange={(e) => {
                      setUsersSearch(e.target.value);
                      setUsersPage(1);
                    }}
                    className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={usersRoleFilter}
                    onChange={(e) => {
                      setUsersRoleFilter(e.target.value);
                      setUsersPage(1);
                    }}
                    className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="">Todos os Papéis</option>
                    <option value="cadet">Cadetes (Alunos)</option>
                    <option value="support">Suporte (Leitura)</option>
                    <option value="admin">Administradores</option>
                  </select>

                  <select
                    value={usersStatusFilter}
                    onChange={(e) => {
                      setUsersStatusFilter(e.target.value);
                      setUsersPage(1);
                    }}
                    className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="">Todos os Status</option>
                    <option value="active">Ativos</option>
                    <option value="suspended">Suspensos</option>
                  </select>
                </div>
              </div>

              {/* Tabela de Usuários */}
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Aluno / Usuário</th>
                        <th className="px-4 py-3">E-mail</th>
                        <th className="px-4 py-3">Papel</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Cadastro</th>
                        <th className="px-4 py-3 text-right">Ações Administrativas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {isUsersLoading ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-400">
                            Carregando usuários...
                          </td>
                        </tr>
                      ) : users.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-500">
                            Nenhum usuário encontrado com os filtros aplicados.
                          </td>
                        </tr>
                      ) : (
                        users.map((u) => (
                          <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.avatarUrl ? (
                                  <img
                                    src={u.avatarUrl}
                                    alt={u.username}
                                    className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                                    {(u.fullName || u.username).slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-bold text-white">{u.fullName || u.username}</p>
                                  <p className="text-[11px] font-mono text-blue-400">@{u.username}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-300">
                              {u.email}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                u.role === 'admin'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                  : u.role === 'support'
                                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                                  : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              }`}>
                                {u.role === 'admin' ? 'OFICIAL ADMIN' : u.role === 'support' ? 'SUPORTE' : 'CADETE'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                u.status === 'active'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-red-500/10 border-red-500/30 text-red-400'
                              }`}>
                                {u.status === 'active' ? 'ATIVO' : 'SUSPENSO'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                              {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleViewUserDetail(u.id)}
                                  className="px-2.5 py-1 rounded-lg font-semibold text-[11px] border border-blue-500/40 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-all cursor-pointer"
                                  title="Ver ficha completa, sessões e eventos de segurança"
                                >
                                  Ficha
                                </button>

                                {currentAdminRole === 'admin' ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleUserStatus(u)}
                                      className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] border transition-all cursor-pointer ${
                                        u.status === 'suspended'
                                          ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                                          : 'bg-red-600/20 border-red-500/40 text-red-300 hover:bg-red-600/30'
                                      }`}
                                      title={u.status === 'suspended' ? 'Reativar conta' : 'Suspender conta'}
                                    >
                                      {u.status === 'suspended' ? 'Reativar' : 'Suspender'}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRevokeAllUserSessions(u)}
                                      className="px-2.5 py-1 rounded-lg font-semibold text-[11px] border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                                      title="Revogar todas as sessões ativas deste usuário"
                                    >
                                      Sessões
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic px-1">Leitura</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Total: <strong className="text-white">{usersTotal}</strong> usuários
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={usersPage <= 1}
                      onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>
                      Página {usersPage} de {usersTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={usersPage >= usersTotalPages}
                      onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                      className="p-1 rounded bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: SEGURANÇA & AUDITORIA                                        */}
          {/* ================================================================= */}
          {activeTab === 'notion' && currentAdminRole === 'admin' && (
            <div className="space-y-4">
              <div className="bg-[#0B1220] border border-cyan-500/20 rounded-2xl p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-white">Acesso ao Notion e contas</h2>
                </div>
                <p className="text-xs text-slate-400">Somente o administrador pode liberar ou remover a aba Agenda Notion, criar contas e excluir contas.</p>
              </div>

              <section className="bg-[#0B1220] border border-amber-500/25 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-amber-400" /> Chave para novo cadastro</h3>
                    <p className="text-xs text-slate-400 mt-1">Gere uma chave de uso único para a pessoa criar a própria conta. Ela expira em 30 dias.</p>
                  </div>
                  <button type="button" onClick={() => handleGenerateAccountKey()} disabled={isGeneratingAccountKey} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shrink-0">
                    <KeyRound className="w-4 h-4" /> {isGeneratingAccountKey ? 'Gerando...' : 'Gerar chave'}
                  </button>
                </div>
                {generatedAccountKey && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[11px] text-emerald-300 mb-2">Chave exibida uma única vez — já copiada quando o navegador permitiu:</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-950 px-3 py-2 text-sm text-white select-all">{generatedAccountKey.rawKey}</code>
                      <button type="button" onClick={() => navigator.clipboard.writeText(generatedAccountKey.rawKey)} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">Copiar</button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Expira em {new Date(generatedAccountKey.expiresAt).toLocaleDateString('pt-BR')}.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {accountCreationKeys.slice(0, 6).map((item) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px]">
                      <span className="font-mono text-slate-400">Gerada em {new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                      <span className={item.isUsed ? 'text-slate-500' : item.isExpired ? 'text-red-400' : 'text-emerald-400'}>{item.isUsed ? `Usada${item.usedByUsername ? ` por @${item.usedByUsername}` : ''}` : item.isExpired ? 'Expirada' : 'Disponível'}</span>
                    </div>
                  ))}
                  {accountCreationKeys.length === 0 && <p className="text-[11px] text-slate-500">Nenhuma chave gerada ainda.</p>}
                </div>
              </section>

              <form onSubmit={(e) => { e.preventDefault(); handleCreateAccount(); }} className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">Adicionar nova conta</h3>
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input value={newAccount.fullName} onChange={(e) => setNewAccount((v) => ({ ...v, fullName: e.target.value }))} placeholder="Nome completo" className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  <input required type="email" value={newAccount.email} onChange={(e) => setNewAccount((v) => ({ ...v, email: e.target.value }))} placeholder="E-mail" className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  <input required value={newAccount.username} onChange={(e) => setNewAccount((v) => ({ ...v, username: e.target.value }))} placeholder="Username" className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  <input required minLength={8} type="password" value={newAccount.password} onChange={(e) => setNewAccount((v) => ({ ...v, password: e.target.value }))} placeholder="Senha (min. 8)" className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  <select value={newAccount.role} onChange={(e) => setNewAccount((v) => ({ ...v, role: e.target.value as 'cadet' | 'support' | 'admin', canAccessNotion: e.target.value === 'admin' ? true : v.canAccessNotion }))} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                    <option value="cadet">Cadete</option>
                    <option value="support">Suporte</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <label className="flex items-center gap-2 text-xs text-slate-300 px-2">
                    <input type="checkbox" checked={newAccount.role === 'admin' || newAccount.canAccessNotion} disabled={newAccount.role === 'admin'} onChange={(e) => setNewAccount((v) => ({ ...v, canAccessNotion: e.target.checked }))} />
                    Liberar acesso ao Notion
                  </label>
                </div>
                <button type="submit" disabled={isCreatingAccount} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
                  <UserCheck className="w-4 h-4" /> {isCreatingAccount ? 'Criando...' : 'Adicionar conta'}
                </button>
              </form>

              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Contas e permissao da aba Notion</h3>
                  <span className="text-[11px] text-slate-500">{usersTotal} contas</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 font-mono text-[11px]"><tr><th className="px-5 py-3">Conta</th><th className="px-5 py-3">Papel</th><th className="px-5 py-3">Notion</th><th className="px-5 py-3 text-right">Acoes</th></tr></thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-900/40">
                          <td className="px-5 py-3"><p className="font-bold text-white">{u.fullName || u.username}</p><p className="text-[11px] text-blue-400 font-mono">@{u.username}</p></td>
                          <td className="px-5 py-3 text-slate-300">{u.role === 'admin' ? 'Administrador' : u.role === 'support' ? 'Suporte' : 'Cadete'}</td>
                          <td className="px-5 py-3"><span className={`font-mono text-[10px] font-bold px-2 py-1 rounded-full border ${u.canAccessNotion ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>{u.canAccessNotion ? 'LIBERADO' : 'BLOQUEADO'}</span></td>
                          <td className="px-5 py-3 text-right"><div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => handleToggleNotionAccess(u)} disabled={u.role === 'admin'} className="px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 disabled:opacity-50 text-[11px] font-semibold cursor-pointer">{u.canAccessNotion ? 'Remover' : 'Liberar'}</button>
                            <button type="button" onClick={() => handleDeleteAccount(u)} disabled={u.username === 'admin'} className="px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 disabled:opacity-50 text-[11px] font-semibold cursor-pointer"><UserX className="w-3 h-3 inline mr-1" />Excluir</button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'security' || activeTab === 'audit') && (
            <div className="space-y-4">
              
              {/* Filtros de Auditoria */}
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex-1 min-w-[260px] relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="Buscar por ator, ação, recurso, IP ou detalhes..."
                      value={auditSearch}
                      onChange={(e) => {
                        setAuditSearch(e.target.value);
                        setAuditPage(1);
                      }}
                      className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={auditActionFilter}
                      onChange={(e) => {
                        setAuditActionFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="">Todas as Ações</option>
                      <option value="ADMIN_LOGIN">ADMIN_LOGIN</option>
                      <option value="ADMIN_LOGIN_FAILED">ADMIN_LOGIN_FAILED</option>
                      <option value="USER_VIEWED">USER_VIEWED</option>
                      <option value="USER_SUSPENDED">USER_SUSPENDED</option>
                      <option value="USER_REACTIVATED">USER_REACTIVATED</option>
                      <option value="SESSION_REVOKED">SESSION_REVOKED</option>
                      <option value="ROLE_CHANGED">ROLE_CHANGED</option>
                      <option value="ADMIN_CREATED">ADMIN_CREATED</option>
                      <option value="ADMIN_REMOVED">ADMIN_REMOVED</option>
                      <option value="SECURITY_SETTING_CHANGED">SECURITY_SETTING_CHANGED</option>
                      <option value="2FA_SUCCESS">2FA_SUCCESS</option>
                      <option value="2FA_FAILED">2FA_FAILED</option>
                      <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
                      <option value="LOGIN_FAILED">LOGIN_FAILED</option>
                    </select>

                    <select
                      value={auditStatusFilter}
                      onChange={(e) => {
                        setAuditStatusFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    >
                      <option value="">Todos os Status</option>
                      <option value="SUCCESS">Sucesso</option>
                      <option value="FAILED">Falha</option>
                      <option value="WARNING">Aviso</option>
                    </select>

                    {(auditSearch || auditActionFilter || auditStatusFilter || auditActorFilter || auditResourceFilter || auditStartDate || auditEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuditSearch('');
                          setAuditActionFilter('');
                          setAuditStatusFilter('');
                          setAuditActorFilter('');
                          setAuditResourceFilter('');
                          setAuditStartDate('');
                          setAuditEndDate('');
                          setAuditPage(1);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                      >
                        Limpar Filtros
                      </button>
                    )}
                  </div>
                </div>

                {/* Filtros Secundários: Ator, Recurso e Intervalo de Datas */}
                <div className="flex flex-wrap gap-3 items-center pt-2 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                    <span className="text-slate-400 font-mono text-[11px]">Ator:</span>
                    <input
                      type="text"
                      placeholder="@username ou ID"
                      value={auditActorFilter}
                      onChange={(e) => {
                        setAuditActorFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      className="flex-1 bg-slate-900/60 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                    <span className="text-slate-400 font-mono text-[11px]">Recurso/Alvo:</span>
                    <input
                      type="text"
                      placeholder="user, session, rota..."
                      value={auditResourceFilter}
                      onChange={(e) => {
                        setAuditResourceFilter(e.target.value);
                        setAuditPage(1);
                      }}
                      className="flex-1 bg-slate-900/60 border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono text-[11px]">De:</span>
                    <input
                      type="date"
                      value={auditStartDate}
                      onChange={(e) => {
                        setAuditStartDate(e.target.value);
                        setAuditPage(1);
                      }}
                      className="bg-slate-900/60 border border-slate-700/70 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-mono text-[11px]">Até:</span>
                    <input
                      type="date"
                      value={auditEndDate}
                      onChange={(e) => {
                        setAuditEndDate(e.target.value);
                        setAuditPage(1);
                      }}
                      className="bg-slate-900/60 border border-slate-700/70 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Tabela de Eventos */}
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Horário</th>
                        <th className="px-4 py-3">Ação</th>
                        <th className="px-4 py-3">Ator / Usuário</th>
                        <th className="px-4 py-3">Alvo / Recurso</th>
                        <th className="px-4 py-3">IP</th>
                        <th className="px-4 py-3">Dispositivo / Agente</th>
                        <th className="px-4 py-3">Resultado</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {isAuditLoading ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-slate-400">
                            Carregando registros forenses...
                          </td>
                        </tr>
                      ) : auditEvents.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-slate-500">
                            Nenhum evento localizado com os filtros informados.
                          </td>
                        </tr>
                      ) : (
                        auditEvents.map((evt) => (
                          <tr key={evt.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                              {new Date(evt.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 font-bold text-white">
                              {evt.action}
                            </td>
                            <td className="px-4 py-3 text-blue-400">
                              @{evt.actor}
                            </td>
                            <td className="px-4 py-3 text-slate-300 max-w-[160px] truncate" title={evt.resource}>
                              {evt.targetType ? `${evt.targetType}:${evt.targetId || ''}` : evt.resource}
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {evt.ip || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-400 max-w-[150px] truncate" title={evt.userAgent || ''}>
                              {evt.userAgent || '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full border ${
                                evt.status === 'SUCCESS'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : 'bg-red-500/10 border-red-500/30 text-red-400'
                              }`}>
                                {evt.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAuditEvent(evt);
                                  setIsAuditModalOpen(true);
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono transition-colors cursor-pointer"
                              >
                                Inspecionar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Total: <strong className="text-white">{auditTotal}</strong> eventos
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={auditPage <= 1}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      className="p-1 rounded bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span>
                      Página {auditPage} de {auditTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={auditPage >= auditTotalPages}
                      onClick={() => setAuditPage((p) => Math.min(auditTotalPages, p + 1))}
                      className="p-1 rounded bg-slate-800 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: SESSÕES                                                      */}
          {/* ================================================================= */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    Sessões Ativas Autorizadas
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Listagem de tokens ativos no banco de dados. Revogar uma sessão encerra o acesso do dispositivo imediatamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadSessions}
                  className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 text-xs text-slate-200 hover:text-white"
                >
                  Recarregar
                </button>
              </div>

              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Usuário</th>
                        <th className="px-4 py-3">Papel</th>
                        <th className="px-4 py-3">Endereço IP</th>
                        <th className="px-4 py-3">Dispositivo / User-Agent</th>
                        <th className="px-4 py-3">Início</th>
                        <th className="px-4 py-3">Expira em</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                      {isSessionsLoading ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-400">
                            Carregando sessões ativas...
                          </td>
                        </tr>
                      ) : sessions.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-500">
                            Nenhuma sessão ativa encontrada.
                          </td>
                        </tr>
                      ) : (
                        sessions.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-4 py-3">
                              <span className="font-bold text-white">@{s.username}</span>
                              <span className="text-slate-400 block text-[10px]">{s.email}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300">
                                {s.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-300">
                              {s.ip || '127.0.0.1'}
                            </td>
                            <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate" title={s.userAgent || ''}>
                              {s.userAgent || 'Desconhecido'}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {new Date(s.expiresAt).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(s.id)}
                                className="px-2.5 py-1 bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                              >
                                Revogar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: ADMINISTRADORES                                              */}
          {/* ================================================================= */}
          {activeTab === 'admins' && (
            <div className="space-y-4">
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-yellow-400" />
                    Oficiais Administradores do Sistema
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Contas com privilégios irrestritos de comando, auditoria e gestão tática.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {adminsList.map((adm) => (
                  <div key={adm.id} className="bg-[#0B1220] border border-amber-500/30 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center font-black text-sm">
                        {(adm.fullName || adm.username).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{adm.fullName || adm.username}</p>
                        <p className="font-mono text-xs text-amber-400 font-semibold">@{adm.username}</p>
                      </div>
                    </div>
                    <div className="border-t border-slate-800 pt-3 text-xs space-y-1 font-mono text-slate-400">
                      <p>E-mail: <span className="text-slate-200">{adm.email}</span></p>
                      <p>Status: <span className="text-emerald-400 font-bold">ATIVO</span></p>
                      <p>Criado em: <span>{new Date(adm.createdAt).toLocaleDateString('pt-BR')}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* TAB: CONFIGURAÇÕES                                                */}
          {/* ================================================================= */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-400" />
                  Políticas de Segurança e Retenção do Servidor
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Autenticação 2FA (Dragão Carmesim)</span>
                    <span className="text-emerald-400 font-bold font-mono text-sm">ATIVADO PERMANENTE</span>
                  </div>

                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Duração da Sessão Confiável</span>
                    <span className="text-white font-bold font-mono text-sm">30 DIAS</span>
                  </div>

                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Retenção de Backups & Auditoria</span>
                    <span className="text-white font-bold font-mono text-sm">30 DIAS</span>
                  </div>

                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[11px]">Ambiente do Servidor</span>
                    <span className="text-amber-400 font-bold font-mono text-sm">PRODUÇÃO / RENDER</span>
                  </div>
                </div>
              </div>

              {/* Card de Recovery Codes (Códigos de Backup) */}
              <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Códigos de Recuperação de Uso Único (Backup Codes)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Permitem acessar a conta administrativa em caso de perda ou indisponibilidade do Google Authenticator.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isGeneratingRecoveryCodes}
                    onClick={() => handleGenerateRecoveryCodes()}
                    className="px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingRecoveryCodes ? 'animate-spin' : ''}`} />
                    Gerar Novos Códigos
                  </button>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-400 text-xs">Códigos Disponíveis Restantes:</span>
                  <span className="text-amber-400 font-mono font-bold text-sm">
                    {recoveryCount !== null ? `${recoveryCount} códigos ativos` : 'Consultando...'}
                  </span>
                </div>

                {newRecoveryCodes && (
                  <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                      <AlertTriangle className="w-4 h-4" />
                      Guarde estes códigos em local seguro! Cada código só funciona uma única vez:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-amber-200">
                      {newRecoveryCodes.map((code, idx) => (
                        <div key={idx} className="bg-black/60 px-3 py-1.5 rounded border border-slate-800 text-center font-bold tracking-wider">
                          {code}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(newRecoveryCodes.join('\n'));
                          setActionFeedback({ type: 'success', message: 'Códigos copiados para a área de transferência!' });
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Copiar Códigos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([newRecoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `cfo-admin-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => {
                            a.remove();
                            URL.revokeObjectURL(url);
                          }, 1000);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Baixar .txt
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ===================================================================== */}
      {/* MODAL DE FICHA DETALHADA DO USUÁRIO (ADMIN / SUPORTE)                  */}
      {/* ===================================================================== */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div className="bg-[#0B1220] border border-slate-700/80 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Cabeçalho da Ficha */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-4">
                {selectedUserDetail?.profile?.avatarUrl ? (
                  <img
                    src={selectedUserDetail.profile.avatarUrl}
                    alt={selectedUserDetail.username}
                    className="w-14 h-14 rounded-full object-cover border-2 border-blue-500/40 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border-2 border-blue-500/40 text-blue-400 flex items-center justify-center font-black text-xl shrink-0">
                    {(selectedUserDetail?.profile?.fullName || selectedUserDetail?.username || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">
                      {selectedUserDetail?.profile?.fullName || selectedUserDetail?.username}
                    </h3>
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      selectedUserDetail?.role === 'admin'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : selectedUserDetail?.role === 'support'
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                    }`}>
                      {selectedUserDetail?.role === 'admin' ? 'OFICIAL ADMIN' : selectedUserDetail?.role === 'support' ? 'SUPORTE' : 'CADETE'}
                    </span>
                    <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      selectedUserDetail?.status === 'active'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                      {selectedUserDetail?.status === 'active' ? 'ATIVO' : 'SUSPENSO'}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-blue-400">@{selectedUserDetail?.username}</p>
                  <p className="text-xs text-slate-400">{selectedUserDetail?.email} • ID: <span className="font-mono text-[11px] text-slate-500">{selectedUserDetail?.id}</span></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedUserDetail(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isDetailLoading ? (
              <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                Carregando histórico e detalhes do usuário...
              </div>
            ) : selectedUserDetail ? (
              <>
                {/* Alerta para Perfil de Suporte Somente Leitura */}
                {currentAdminRole === 'support' && (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-purple-300 text-xs flex items-center gap-2 font-medium">
                    <Shield className="w-4 h-4 shrink-0 text-purple-400" />
                    <span>Perfil de Suporte (Somente Leitura): Você pode auditar e inspecionar detalhes, mas ações de mutação de conta são restritas a administradores.</span>
                  </div>
                )}

                {/* Barra de Ações Rápidas (Apenas Admin Pleno) */}
                {currentAdminRole === 'admin' && (
                  <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">Ações de Gestão:</span>
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(selectedUserDetail)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          selectedUserDetail.status === 'suspended'
                            ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                            : 'bg-red-600/20 border-red-500/40 text-red-300 hover:bg-red-600/30'
                        }`}
                      >
                        {selectedUserDetail.status === 'suspended' ? 'Reativar Conta' : 'Suspender Conta'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRevokeAllUserSessions(selectedUserDetail)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                      >
                        Revogar Todas as Sessões
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Alterar Cargo:</span>
                      <select
                        value={selectedUserDetail.role}
                        onChange={(e) => handleChangeUserRole(selectedUserDetail, e.target.value as any)}
                        className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="cadet">Cadete</option>
                        <option value="support">Suporte</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Sub-abas da Ficha */}
                <div className="flex border-b border-slate-800 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setDetailTab('overview')}
                    className={`px-4 py-2 border-b-2 transition-all cursor-pointer ${
                      detailTab === 'overview'
                        ? 'border-blue-500 text-blue-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Visão Cadastral
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab('sessions')}
                    className={`px-4 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                      detailTab === 'sessions'
                        ? 'border-blue-500 text-blue-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Sessões Ativas
                    <span className="bg-slate-800 text-[10px] font-mono px-1.5 py-0.2 rounded-full text-slate-300">
                      {selectedUserDetail.activeSessions.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab('security')}
                    className={`px-4 py-2 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                      detailTab === 'security'
                        ? 'border-blue-500 text-blue-400 font-bold'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Histórico de Auditoria & Segurança
                    <span className="bg-slate-800 text-[10px] font-mono px-1.5 py-0.2 rounded-full text-slate-300">
                      {selectedUserDetail.securityEvents.length}
                    </span>
                  </button>
                </div>

                {/* Conteúdo da Aba: Visão Cadastral */}
                {detailTab === 'overview' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-500 text-[11px] block">Nome Completo</span>
                      <span className="text-white font-semibold">{selectedUserDetail.profile.fullName || 'Não informado'}</span>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-500 text-[11px] block">Telefone / Contato</span>
                      <span className="text-white font-mono">{selectedUserDetail.profile.phone || 'Não cadastrado'}</span>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-500 text-[11px] block">Concurso Alvo</span>
                      <span className="text-white">{selectedUserDetail.profile.targetExam || 'CFO CBMERJ'}</span>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-500 text-[11px] block">Data de Cadastro</span>
                      <span className="text-white font-mono">{new Date(selectedUserDetail.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="sm:col-span-2 p-3 bg-slate-900/50 rounded-xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-500 text-[11px] block">Biografia / Observações</span>
                      <span className="text-slate-300 italic">{selectedUserDetail.profile.bio || 'Sem observações registradas.'}</span>
                    </div>
                  </div>
                )}

                {/* Conteúdo da Aba: Sessões Ativas */}
                {detailTab === 'sessions' && (
                  <div className="space-y-3">
                    {selectedUserDetail.activeSessions.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">O usuário não possui nenhuma sessão ativa no momento.</p>
                    ) : (
                      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden text-xs">
                        {selectedUserDetail.activeSessions.map((s) => (
                          <div key={s.id} className="p-3 bg-slate-900/40 flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-emerald-400 font-bold">IP: {s.ip || '127.0.0.1'}</span>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">Sessão {s.id.slice(0, 8)}...</span>
                              </div>
                              <p className="text-[11px] text-slate-400 truncate max-w-md">{s.userAgent || 'Navegador Web'}</p>
                              <p className="text-[10px] text-slate-500 font-mono">Expira em: {new Date(s.expiresAt).toLocaleString('pt-BR')}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              ATIVA
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Conteúdo da Aba: Auditoria & Segurança */}
                {detailTab === 'security' && (
                  <div className="space-y-3">
                    {selectedUserDetail.securityEvents.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">Nenhum evento de segurança registrado para este usuário.</p>
                    ) : (
                      <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden text-xs max-h-72 overflow-y-auto">
                        {selectedUserDetail.securityEvents.map((evt) => (
                          <div key={evt.id} className="p-3 bg-slate-900/40 flex items-start justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white">{evt.action}</span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                  evt.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {evt.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">Operador: <strong className="text-slate-300">@{evt.actor}</strong> • Recurso: {evt.resource}</p>
                              {evt.detailsJson && (
                                <p className="text-[10px] font-mono text-slate-500 truncate max-w-lg">{evt.detailsJson}</p>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {new Date(evt.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL DE CONFIRMAÇÃO DE STEP-UP (AÇÕES CRÍTICAS)                       */}
      {/* ===================================================================== */}
      {isStepUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[380px]:p-4 bg-black/80 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-[#0B1220] border border-red-500/40 rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl space-y-4 my-auto max-h-[90dvh] overflow-y-auto min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Elevação de Privilégio</h3>
                <p className="text-xs text-slate-400">Confirmação de identidade obrigatória (Step-Up)</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              Esta é uma operação administrativa de alto impacto. Confirme sua senha mestre ou o código atual do Google Authenticator para prosseguir.
            </p>

            {stepUpError && (
              <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{stepUpError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmStepUp} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase mb-1">
                  Código TOTP (Google Authenticator)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={stepUpTotp}
                  onChange={(e) => setStepUpTotp(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-4 py-2 text-center text-sm font-mono tracking-widest text-amber-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="text-center text-[11px] text-slate-500 font-mono font-bold uppercase">— OU —</div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase mb-1">
                  Senha do Administrador
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsStepUpModalOpen(false);
                    setPendingAction(null);
                    setStepUpPassword('');
                    setStepUpTotp('');
                    setStepUpError('');
                  }}
                  className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isStepUpLoading || (!stepUpPassword && stepUpTotp.length !== 6)}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs transition-all shadow-md cursor-pointer disabled:opacity-40"
                >
                  {isStepUpLoading ? 'Validando...' : 'Confirmar Ação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: INSPEÇÃO FORENSE DE AUDITORIA & DELTA                          */}
      {/* ===================================================================== */}
      {isAuditModalOpen && selectedAuditEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[380px]:p-4 bg-black/80 backdrop-blur-xs animate-fadeIn overflow-y-auto">
          <div className="bg-[#0B1220] border border-blue-500/40 rounded-2xl w-full max-w-2xl max-h-[90vh] max-h-[90dvh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4 my-auto min-w-0">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Dossiê Forense de Auditoria</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      selectedAuditEvent.status === 'SUCCESS'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                      {selectedAuditEvent.status}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {selectedAuditEvent.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAuditModalOpen(false);
                  setSelectedAuditEvent(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadados Principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Ação Executada</div>
                <div className="text-sm font-bold text-white">{selectedAuditEvent.action}</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Horário do Registro</div>
                <div className="text-sm text-slate-200">{new Date(selectedAuditEvent.createdAt).toLocaleString('pt-BR')}</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Ator Responsável</div>
                <div className="text-sm text-blue-400 font-mono">@{selectedAuditEvent.actor}</div>
                {selectedAuditEvent.actorUserId && (
                  <div className="text-[10px] text-slate-500 font-mono truncate">ID: {selectedAuditEvent.actorUserId}</div>
                )}
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Alvo / Recurso</div>
                <div className="text-sm text-amber-300 font-mono truncate">
                  {selectedAuditEvent.targetType ? `${selectedAuditEvent.targetType}:${selectedAuditEvent.targetId || ''}` : selectedAuditEvent.resource}
                </div>
                {selectedAuditEvent.userId && (
                  <div className="text-[10px] text-slate-500 font-mono truncate">Target UserID: {selectedAuditEvent.userId}</div>
                )}
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">IP de Origem</div>
                <div className="text-sm text-slate-300 font-mono">{selectedAuditEvent.ip || 'Não detectado'}</div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="text-slate-400 font-mono text-[11px]">Dispositivo / User-Agent</div>
                <div className="text-xs text-slate-300 truncate" title={selectedAuditEvent.userAgent || ''}>
                  {selectedAuditEvent.userAgent || '—'}
                </div>
              </div>
            </div>

            {/* Inspeção de Delta de Estado (previousState vs newState) */}
            {(() => {
              let parsed: any = null;
              try {
                if (selectedAuditEvent.detailsJson) {
                  parsed = JSON.parse(selectedAuditEvent.detailsJson);
                }
              } catch {}

              const previousState = parsed?.previousState;
              const newState = parsed?.newState;

              return (
                <div className="space-y-3 pt-1">
                  {(previousState || newState) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        <div className="text-[11px] font-mono font-bold text-red-400 mb-1 flex items-center gap-1.5">
                          <span>Estado Anterior</span>
                        </div>
                        <pre className="text-[11px] font-mono text-red-200 overflow-x-auto p-2 bg-black/40 rounded-lg max-h-40">
                          {previousState ? JSON.stringify(previousState, null, 2) : 'Nenhum'}
                        </pre>
                      </div>

                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                        <div className="text-[11px] font-mono font-bold text-emerald-400 mb-1 flex items-center gap-1.5">
                          <span>Estado Posterior</span>
                        </div>
                        <pre className="text-[11px] font-mono text-emerald-200 overflow-x-auto p-2 bg-black/40 rounded-lg max-h-40">
                          {newState ? JSON.stringify(newState, null, 2) : 'Nenhum'}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Metadados e Detalhes Adicionais */}
                  {parsed && (
                    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                      <div className="text-[11px] font-mono font-bold text-slate-400 mb-1">
                        Metadados Sanitizados
                      </div>
                      <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto p-2 bg-black/40 rounded-lg max-h-40">
                        {JSON.stringify(parsed, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-300 flex items-center gap-2">
              <Shield className="w-4 h-4 shrink-0 text-blue-400" />
              <span>
                Registro Imutável (Append-Only): Protegido contra exclusão e edição. Segredos e senhas são estritamente expurgados.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAuditModalOpen(false);
                  setSelectedAuditEvent(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
