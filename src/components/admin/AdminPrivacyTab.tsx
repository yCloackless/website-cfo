import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  UserX,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { AppTheme } from '../../types';

interface AdminPrivacyTabProps {
  theme: AppTheme;
  sessionToken: string | null;
  getHeaders: (overrideStepUp?: string | null) => Record<string, string>;
  requestStepUp?: () => Promise<string | null>;
}

interface PrivacyRequestItem {
  id: string;
  requestCode: string;
  userId: string | null;
  email: string;
  requestType: string;
  status: 'pending' | 'under_review' | 'completed' | 'rejected';
  details: string | null;
  adminNotes: string | null;
  processedByUserId: string | null;
  createdAt: string;
  processedAt: string | null;
  updatedAt: string;
}

export const AdminPrivacyTab: React.FC<AdminPrivacyTabProps> = ({
  theme,
  getHeaders,
  requestStepUp,
}) => {
  const isDark = theme === 'dark';

  const [requests, setRequests] = useState<PrivacyRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;

  // Filtros
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modal / Ação de Edição
  const [selectedReq, setSelectedReq] = useState<PrivacyRequestItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Confirmação de anonimização
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('requestType', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/privacy/requests?${params.toString()}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.items)) {
        setRequests(data.items);
        setTotal(data.total || 0);
      } else {
        setActionError(data.message || 'Falha ao carregar solicitações LGPD.');
      }
    } catch {
      setActionError('Erro de conexão ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, search, getHeaders]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleUpdateStatus = async () => {
    if (!selectedReq || !newStatus) return;
    setSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      let stepUpToken: string | null = null;
      if (requestStepUp) {
        stepUpToken = await requestStepUp();
      }

      const res = await fetch(`/api/admin/privacy/requests/${selectedReq.id}`, {
        method: 'PATCH',
        headers: getHeaders(stepUpToken),
        body: JSON.stringify({
          status: newStatus,
          adminNotes: adminNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess('Solicitação atualizada com sucesso!');
        setSelectedReq(null);
        fetchRequests();
      } else {
        setActionError(data.message || 'Erro ao atualizar solicitação.');
      }
    } catch {
      setActionError('Falha ao processar atualização.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleAnonymizeUser = async () => {
    if (!selectedReq) return;
    setSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      let stepUpToken: string | null = null;
      if (requestStepUp) {
        stepUpToken = await requestStepUp();
      }

      const res = await fetch(`/api/admin/privacy/requests/${selectedReq.id}/anonymize`, {
        method: 'POST',
        headers: getHeaders(stepUpToken),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionSuccess('Usuário anonimizado com sucesso em cumprimento à LGPD!');
        setConfirmAnonymize(false);
        setSelectedReq(null);
        fetchRequests();
      } else {
        setActionError(data.message || 'Erro ao anonimizar titular.');
      }
    } catch {
      setActionError('Falha de conexão ao anonimizar.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Gestão de Privacidade & Requisições LGPD</h3>
            <p className="text-xs text-slate-400">Direitos dos Titulares • Lei nº 13.709/2018 (Art. 18)</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Alertas */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl border bg-emerald-950/40 border-emerald-800 text-emerald-300 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3.5 rounded-xl border bg-red-950/40 border-red-800 text-red-300 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center gap-3 ${
        isDark ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por protocolo (LGPD-REQ-...) ou e-mail..."
            className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border outline-none ${
              isDark ? 'bg-[#070D18] border-slate-700 text-slate-200 focus:border-blue-500' : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs border outline-none ${
              isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          >
            <option value="">Todos os Status</option>
            <option value="pending">Pendente</option>
            <option value="under_review">Em Análise</option>
            <option value="completed">Concluída</option>
            <option value="rejected">Indeferida</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className={`px-3 py-2 rounded-xl text-xs border outline-none ${
              isDark ? 'bg-[#070D18] border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          >
            <option value="">Todos os Tipos</option>
            <option value="access">Acesso</option>
            <option value="rectification">Retificação</option>
            <option value="deletion">Eliminação / Anonimização</option>
            <option value="information">Informação</option>
            <option value="revocation">Revogação</option>
          </select>
        </div>
      </div>

      {/* Tabela de Solicitações */}
      <div className={`rounded-xl border overflow-hidden ${
        isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b text-[11px] font-bold uppercase tracking-wider ${
              isDark ? 'border-slate-800 bg-slate-950/60 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              <tr>
                <th className="px-4 py-3">Protocolo</th>
                <th className="px-4 py-3">Titular / E-mail</th>
                <th className="px-4 py-3">Tipo de Solicitação</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800/60 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando registros LGPD...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">
                    Nenhuma solicitação encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className={`${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'} transition`}>
                    <td className="px-4 py-3 font-mono font-bold text-blue-400">{req.requestCode}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-white block">{req.email}</span>
                      <span className="text-[10px] text-slate-500">ID: {req.userId ? req.userId.slice(0, 8) : 'Visitante'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold uppercase text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {req.requestType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString('pt-BR')} {new Date(req.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                        req.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : req.status === 'under_review'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : req.status === 'rejected'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {req.status === 'completed' ? 'Concluída' : req.status === 'under_review' ? 'Em Análise' : req.status === 'rejected' ? 'Indeferida' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReq(req);
                          setNewStatus(req.status);
                          setAdminNotes(req.adminNotes || '');
                          setConfirmAnonymize(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                      >
                        Analisar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className={`px-4 py-3 border-t flex items-center justify-between text-xs ${
          isDark ? 'border-slate-800 bg-slate-950/40 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}>
          <span>Total: <strong>{total}</strong> solicitações (Página {page} de {totalPages})</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-1 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Análise e Parecer do DPO */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Protocolo: <span className="font-mono text-blue-400">{selectedReq.requestCode}</span>
                </h4>
                <p className="text-xs text-slate-400">Titular: {selectedReq.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-400 block mb-0.5">Tipo de Solicitação:</span>
                <span className="font-semibold text-white uppercase bg-slate-800 px-2 py-0.5 rounded">
                  {selectedReq.requestType}
                </span>
              </div>

              {selectedReq.details && (
                <div>
                  <span className="font-semibold text-slate-400 block mb-0.5">Detalhes informados pelo titular:</span>
                  <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/40 text-slate-300">
                    {selectedReq.details}
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-400 block mb-1">Atualizar Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-700 bg-[#070D18] text-slate-200 outline-none"
                >
                  <option value="pending">Pendente</option>
                  <option value="under_review">Em Análise pelo DPO</option>
                  <option value="completed">Concluída / Deferida</option>
                  <option value="rejected">Indeferida com Justificativa</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-400 block mb-1">Parecer do Encarregado / Notas Administrativas</label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Justificativa legal ou providências tomadas..."
                  className="w-full px-3 py-2 rounded-xl text-xs border border-slate-700 bg-[#070D18] text-slate-200 outline-none"
                />
              </div>

              {/* Ação Especial: Anonimização de Conta */}
              {selectedReq.requestType === 'deletion' && selectedReq.userId && (
                <div className="p-3 rounded-xl border border-red-900/40 bg-red-950/20 space-y-2">
                  <div className="flex items-center gap-2 text-red-400 font-semibold">
                    <UserX className="w-4 h-4" />
                    <span>Eliminação / Anonimização de Dados (Art. 16 LGPD)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    A anonimização desvincula dados cadastrais e revoga todas as sessões, preservando a consistência das tabelas relacionais.
                  </p>
                  {!confirmAnonymize ? (
                    <button
                      type="button"
                      onClick={() => setConfirmAnonymize(true)}
                      className="px-3 py-1.5 rounded-lg bg-red-800 hover:bg-red-700 text-white font-semibold text-xs transition"
                    >
                      Executar Anonimização do Titular
                    </button>
                  ) : (
                    <div className="p-2 rounded bg-red-950/60 border border-red-800/80 space-y-2">
                      <p className="text-[11px] font-bold text-red-300">
                        Atenção: Esta ação é irreversível. Deseja prosseguir com a anonimização?
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={handleAnonymizeUser}
                          className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
                        >
                          {submittingAction ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Confirmar e Anonimizar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmAnonymize(false)}
                          className="px-3 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={handleUpdateStatus}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submittingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Salvar Parecer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPrivacyTab;
