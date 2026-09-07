import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Search,
  Filter,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Globe,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Activity,
} from 'lucide-react';
import { AppTheme } from '../types';

interface AuditEventItem {
  id: string;
  action: string;
  actor: string;
  resource: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  ip?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  detailsJson?: string | null;
  createdAt: string;
}

interface SecurityMetricsData {
  totalEvents24h: number;
  loginSuccess24h: number;
  loginFailed24h: number;
  twoFactorFailed24h: number;
  accountSuspended24h: number;
  anomalousIps: Array<{ ip: string; failedAttempts: number }>;
}

interface AdminSecurityPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  sessionToken: string | null;
}

export const AdminSecurityPanelModal: React.FC<AdminSecurityPanelModalProps> = ({
  isOpen,
  onClose,
  theme,
  sessionToken,
}) => {
  const isDark = theme === 'dark';

  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [metrics, setMetrics] = useState<SecurityMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filtros e Paginação
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [filterAction, setFilterAction] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  // Carrega métricas e eventos
  const fetchSecurityData = useCallback(async () => {
    if (!isOpen || !sessionToken) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Calcula datas do filtro de período
      let startDate: string | undefined;
      const now = Date.now();
      if (periodFilter === '24h') {
        startDate = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      } else if (periodFilter === '7d') {
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (periodFilter === '30d') {
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      // Query params para eventos
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (filterAction) params.set('action', filterAction);
      if (filterStatus) params.set('status', filterStatus);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (startDate) params.set('startDate', startDate);

      const [resEvents, resMetrics] = await Promise.all([
        fetch(`/api/admin/security/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
        fetch('/api/admin/security/metrics', {
          headers: { Authorization: `Bearer ${sessionToken}` },
        }),
      ]);

      if (resEvents.status === 403) {
        setErrorMsg('Acesso não autorizado. Apenas administradores com 2FA ativo podem auditar logs.');
        setLoading(false);
        return;
      }

      const dataEvents = await resEvents.json();
      const dataMetrics = await resMetrics.json();

      if (dataEvents.success) {
        setEvents(dataEvents.items || []);
        setTotalPages(dataEvents.totalPages || 1);
        setTotalItems(dataEvents.total || 0);
      }

      if (dataMetrics.success) {
        setMetrics(dataMetrics.metrics || null);
      }
    } catch (err) {
      setErrorMsg('Falha ao comunicar com o servidor para recuperar eventos de segurança.');
    } finally {
      setLoading(false);
    }
  }, [isOpen, sessionToken, page, limit, filterAction, filterStatus, searchTerm, periodFilter]);

  useEffect(() => {
    if (isOpen) {
      fetchSecurityData();
    }
  }, [isOpen, fetchSecurityData]);

  if (!isOpen) return null;

  // Formatação de data
  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // Badge para cada ação
  const getActionBadge = (action: string, status: string) => {
    const isSuccess = status === 'SUCCESS';
    const isFailed = status === 'FAILED';

    let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
    if (isSuccess) colorClass = 'bg-emerald-950/70 text-emerald-400 border-emerald-800';
    if (isFailed) colorClass = 'bg-red-950/70 text-red-400 border-red-800';
    if (action === 'ACCOUNT_SUSPENDED' || status === 'WARNING') {
      colorClass = 'bg-amber-950/70 text-amber-400 border-amber-800';
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border tracking-wider ${colorClass}`}>
        {action}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`rounded-2xl max-w-5xl w-full shadow-2xl border overflow-hidden flex flex-col transition-colors max-h-[92vh] ${
          isDark ? 'bg-[#0B1528] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do Painel */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800/80 bg-[#070D18]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-red-700 to-red-950 text-white shadow-md border border-red-700/50">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">Centro de Monitoramento & Auditoria de Segurança</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                  Restrito: Comando Admin
                </span>
              </div>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Trilha server-side imutável de autenticações, sessões, 2FA e anomalias de acesso
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSecurityData()}
              disabled={loading}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isDark ? 'border-slate-800 bg-[#070D18] text-slate-300 hover:text-white' : 'border-slate-200 bg-white text-slate-700'
              }`}
              title="Atualizar eventos"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-black'
              }`}
              title="Fechar painel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Métricas e Detecção de Anomalias (Cards) */}
        {metrics && (
          <div className={`p-4 border-b grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs ${isDark ? 'border-slate-800/80 bg-slate-900/30' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-[#070D18]' : 'border-slate-200 bg-white'}`}>
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Logins com Sucesso (24h)</span>
              <span className="text-xl font-black text-emerald-400 font-mono mt-0.5 block">{metrics.loginSuccess24h}</span>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-[#070D18]' : 'border-slate-200 bg-white'}`}>
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Falhas de Login (24h)</span>
              <span className="text-xl font-black text-red-400 font-mono mt-0.5 block">{metrics.loginFailed24h}</span>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-[#070D18]' : 'border-slate-200 bg-white'}`}>
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">Falhas de 2FA (24h)</span>
              <span className="text-xl font-black text-amber-400 font-mono mt-0.5 block">{metrics.twoFactorFailed24h}</span>
            </div>
            <div className={`p-3 rounded-xl border ${isDark ? 'border-slate-800 bg-[#070D18]' : 'border-slate-200 bg-white'}`}>
              <span className="text-[10px] font-semibold text-slate-400 block uppercase">IPs Bloqueados (24h)</span>
              <span className="text-xl font-black text-red-500 font-mono mt-0.5 block">{metrics.accountSuspended24h}</span>
            </div>
          </div>
        )}

        {/* Alerta de Anomalia Factual */}
        {metrics && metrics.anomalousIps && metrics.anomalousIps.length > 0 && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Atividade Anormal Detectada:</strong> {metrics.anomalousIps.length} endereço(s) IP registraram 3 ou mais tentativas falhas nas últimas 24h: {metrics.anomalousIps.map((a) => `${a.ip} (${a.failedAttempts} falhas)`).join(', ')}.
              </span>
            </div>
          </div>
        )}

        {/* Barra de Filtros */}
        <div className={`p-4 border-b flex flex-wrap gap-2.5 items-center justify-between text-xs ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Campo de Busca */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
                placeholder="Buscar por usuário, e-mail ou IP..."
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
                  isDark ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                }`}
              />
            </div>

            {/* Filtro por Tipo de Ação */}
            <select
              value={filterAction}
              onChange={(e) => {
                setFilterAction(e.target.value);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
                isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Todos os Eventos</option>
              <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
              <option value="LOGIN_FAILED">LOGIN_FAILED</option>
              <option value="ADMIN_LOGIN">ADMIN_LOGIN</option>
              <option value="ADMIN_LOGIN_FAILED">ADMIN_LOGIN_FAILED</option>
              <option value="2FA_SUCCESS">2FA_SUCCESS</option>
              <option value="2FA_FAILED">2FA_FAILED</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="PASSWORD_RESET_REQUEST">PASSWORD_RESET_REQUEST</option>
              <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
              <option value="EMAIL_VERIFIED">EMAIL_VERIFIED</option>
              <option value="ACCOUNT_SUSPENDED">ACCOUNT_SUSPENDED</option>
            </select>

            {/* Filtro por Status */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-xs outline-none cursor-pointer ${
                isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              <option value="">Status: Todos</option>
              <option value="SUCCESS">Apenas Sucesso</option>
              <option value="FAILED">Apenas Falha</option>
              <option value="WARNING">Avisos</option>
            </select>
          </div>

          {/* Filtro de Período */}
          <div className="flex items-center gap-1">
            {(['24h', '7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPeriodFilter(p);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  periodFilter === p
                    ? 'bg-blue-600 text-white font-bold'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {p === '24h' ? '24h' : p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : 'Tudo'}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela de Eventos com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4">
          {errorMsg ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          ) : loading && events.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span>Buscando trilha de auditoria de segurança...</span>
            </div>
          ) : events.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              Nenhum evento registrado com os filtros informados.
            </div>
          ) : (
            <div className="border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`border-b text-[10px] uppercase font-bold tracking-wider ${isDark ? 'bg-[#070D18] border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                    <tr>
                      <th className="py-2.5 px-3">Data / Hora</th>
                      <th className="py-2.5 px-3">Evento</th>
                      <th className="py-2.5 px-3">Identificador / Ator</th>
                      <th className="py-2.5 px-3">IP Confiável</th>
                      <th className="py-2.5 px-3">User-Agent / Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-slate-800/60' : 'divide-slate-200'}`}>
                    {events.map((item) => (
                      <tr key={item.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50'}`}>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {getActionBadge(item.action, item.status)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                          <span className="text-slate-200 font-mono text-[11px]">{item.actor}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                          {item.ip || '—'}
                        </td>
                        <td className="py-2.5 px-3 max-w-xs truncate text-[11px] text-slate-400" title={item.userAgent || ''}>
                          {item.detailsJson ? (
                            <span className="font-mono text-[10px] text-blue-400">
                              {item.detailsJson.length > 50 ? `${item.detailsJson.slice(0, 50)}...` : item.detailsJson}
                            </span>
                          ) : (
                            item.userAgent?.slice(0, 45) || '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Paginação */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-between text-xs ${
            isDark ? 'border-slate-800/80 bg-[#070D18] text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          <div>
            Total de Registros: <strong className="font-mono text-slate-200">{totalItems}</strong> (Página {page} de {totalPages})
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className={`px-3 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className={`px-3 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-40 cursor-pointer ${
                isDark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
              }`}
            >
              Próxima
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
