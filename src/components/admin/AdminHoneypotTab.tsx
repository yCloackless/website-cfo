import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  Activity,
  Zap,
} from 'lucide-react';
import { AppTheme } from '../../types';

interface AdminHoneypotTabProps {
  theme: AppTheme;
  getHeaders: () => Record<string, string>;
}

interface DeceptionEventItem {
  id: string;
  eventType: string;
  honeypotId: string;
  requestPath: string;
  method: string;
  riskScore: number;
  userId: string | null;
  ipHash: string | null;
  userAgentSummary: string;
  actionTaken: string;
  createdAt: string;
}

interface HoneypotMetricsData {
  totalEvents: number;
  events24h: number;
  highRiskEvents24h: number;
  activeTemporaryBlocks: number;
  eventsByType: Record<string, number>;
  topTargetedDecoys: Array<{ path: string; count: number }>;
}

export const AdminHoneypotTab: React.FC<AdminHoneypotTabProps> = ({
  theme,
  getHeaders,
}) => {
  const isDark = theme === 'dark';

  const [events, setEvents] = useState<DeceptionEventItem[]>([]);
  const [metrics, setMetrics] = useState<HoneypotMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filtros
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [minRiskFilter, setMinRiskFilter] = useState('');
  const [search, setSearch] = useState('');

  // Unblock IP modal / state
  const [unblockIpInput, setUnblockIpInput] = useState('');
  const [unblocking, setUnblocking] = useState(false);
  const [unblockMessage, setUnblockMessage] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/honeypot/metrics', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMetrics(data.metrics);
        }
      }
    } catch (err) {
      console.error('[Honeypot Tab] Erro ao carregar métricas:', err);
    }
  }, [getHeaders]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (eventTypeFilter) params.append('eventType', eventTypeFilter);
      if (minRiskFilter) params.append('minRisk', minRiskFilter);
      if (search) params.append('search', search);

      const res = await fetch(`/api/admin/honeypot/events?${params.toString()}`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEvents(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('[Honeypot Tab] Erro ao carregar eventos:', err);
    } finally {
      setLoading(false);
    }
  }, [page, eventTypeFilter, minRiskFilter, search, getHeaders]);

  useEffect(() => {
    loadMetrics();
    loadEvents();
  }, [loadMetrics, loadEvents]);

  const handleUnblock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unblockIpInput.trim()) return;

    setUnblocking(true);
    setUnblockMessage(null);
    try {
      const res = await fetch('/api/admin/honeypot/unblock', {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ip: unblockIpInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setUnblockMessage(data.message || 'Desbloqueio processado com sucesso.');
        setUnblockIpInput('');
        loadMetrics();
      } else {
        setUnblockMessage(data.message || 'Falha ao desbloquear.');
      }
    } catch (err) {
      setUnblockMessage('Erro de comunicação ao desbloquear.');
    } finally {
      setUnblocking(false);
    }
  };

  const getRiskBadge = (score: number) => {
    if (score >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3" /> Crítico ({score})
        </span>
      );
    }
    if (score >= 60) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3" /> Alto ({score})
        </span>
      );
    }
    if (score >= 40) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          Médio ({score})
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        Baixo ({score})
      </span>
    );
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'SOURCE_TEMPORARILY_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800/40">
            <Lock className="w-2.5 h-2.5" /> Bloqueio Temporário
          </span>
        );
      case 'SESSION_INVALIDATED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800/40">
            Sessão Revogada
          </span>
        );
      case 'THROTTLED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-yellow-950 text-yellow-300 border border-yellow-800/40">
            Throttled
          </span>
        );
      case 'PENTEST_BYPASS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950 text-blue-300 border border-blue-800/40">
            Pentest Autorizado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300">
            Registrado
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            Decepção Defensiva & Honeypots
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento de rotas decoy, honeytokens canário e tentativas de descoberta não autorizada.
          </p>
        </div>

        <button
          onClick={() => {
            loadMetrics();
            loadEvents();
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors border border-slate-700 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Telemetria
        </button>
      </div>

      {/* Cartões de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total de Interações</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {metrics ? metrics.totalEvents.toLocaleString() : '—'}
          </p>
          <span className="text-[11px] text-slate-500">Histórico mantido na retenção</span>
        </div>

        <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Eventos em 24h</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {metrics ? metrics.events24h.toLocaleString() : '—'}
          </p>
          <span className="text-[11px] text-slate-500">Detecções no ciclo recente</span>
        </div>

        <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Alertas de Alto Risco</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <p className="text-2xl font-bold text-rose-400">
              {metrics ? metrics.highRiskEvents24h.toLocaleString() : '—'}
            </p>
            {metrics && metrics.highRiskEvents24h > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                Atenção
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">Risco &ge; 70 nas últimas 24h</span>
        </div>

        <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Bloqueios Temporários Ativos</span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-400 mt-2">
            {metrics ? metrics.activeTemporaryBlocks.toLocaleString() : '—'}
          </p>
          <span className="text-[11px] text-slate-500">Expiração automática por TTL</span>
        </div>
      </div>

      {/* Top Decoys Alvo e Desbloqueio Rápido */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Decoys */}
        <div className="lg:col-span-2 bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            Top Decoys Mais Visados
          </h3>
          {metrics && metrics.topTargetedDecoys.length > 0 ? (
            <div className="space-y-2">
              {metrics.topTargetedDecoys.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                >
                  <span className="font-mono text-slate-300">{item.path}</span>
                  <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-800 text-slate-300">
                    {item.count} acessos
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-3">Nenhum decoy atingido no período.</p>
          )}
        </div>

        {/* Desbloqueio Manual de Origem */}
        <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
              Desbloqueio de Origem (IP)
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Permite a liberação manual antecipada de um IP em caso de falso positivo comprovado.
            </p>
            <form onSubmit={handleUnblock} className="space-y-2">
              <input
                type="text"
                placeholder="Endereço IP (ex: 187.x.x.x)"
                value={unblockIpInput}
                onChange={(e) => setUnblockIpInput(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={unblocking || !unblockIpInput.trim()}
                className="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                {unblocking ? 'Processando...' : 'Liberar Origem'}
              </button>
            </form>
          </div>
          {unblockMessage && (
            <p className="text-[11px] mt-2 font-medium text-emerald-400 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/40">
              {unblockMessage}
            </p>
          )}
        </div>
      </div>

      {/* Filtros e Tabela de Eventos */}
      <div className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex-1 min-w-[240px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por rota, honeypot ID ou ação..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={eventTypeFilter}
              onChange={(e) => {
                setEventTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="">Todos os Tipos de Evento</option>
              <option value="HONEYPOT_ROUTE_ACCESSED">HONEYPOT_ROUTE_ACCESSED</option>
              <option value="HONEYPOT_LOGIN_ATTEMPT">HONEYPOT_LOGIN_ATTEMPT</option>
              <option value="HONEYTOKEN_TRIGGERED">HONEYTOKEN_TRIGGERED</option>
              <option value="DECOY_RESOURCE_ACCESSED">DECOY_RESOURCE_ACCESSED</option>
              <option value="AUTOMATED_ENUMERATION_SUSPECTED">AUTOMATED_ENUMERATION_SUSPECTED</option>
            </select>

            <select
              value={minRiskFilter}
              onChange={(e) => {
                setMinRiskFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-900/80 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
            >
              <option value="">Qualquer Nível de Risco</option>
              <option value="40">Médio ou Superior (&ge;40)</option>
              <option value="60">Alto ou Superior (&ge;60)</option>
              <option value="80">Crítico (&ge;80)</option>
            </select>

            {(search || eventTypeFilter || minRiskFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setEventTypeFilter('');
                  setMinRiskFilter('');
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* Tabela de Eventos */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Tipo de Evento</th>
                <th className="py-2.5 px-3">Rota Decoy</th>
                <th className="py-2.5 px-3">Nível de Risco</th>
                <th className="py-2.5 px-3">Origem (Hash/User)</th>
                <th className="py-2.5 px-3">Ação Defensiva</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {events.length > 0 ? (
                events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                      {new Date(evt.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono font-semibold text-slate-200">
                        {evt.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                          {evt.method}
                        </span>
                        <span className="font-mono text-slate-300 truncate max-w-[200px]" title={evt.requestPath}>
                          {evt.requestPath}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getRiskBadge(evt.riskScore)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="space-y-0.5">
                        <span className="font-mono text-slate-400 block text-[11px]" title={evt.ipHash || ''}>
                          {evt.ipHash ? `${evt.ipHash.slice(0, 10)}...` : 'anônimo'}
                        </span>
                        {evt.userId && (
                          <span className="text-[10px] text-amber-400 block">
                            User ID: {evt.userId.slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {getActionBadge(evt.actionTaken)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    {loading ? 'Carregando eventos...' : 'Nenhum evento registrado com os filtros atuais.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
            <span>
              Mostrando {events.length} de {total} registros
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
