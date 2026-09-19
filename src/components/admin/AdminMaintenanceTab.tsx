import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Power,
  Eye,
  Calendar,
  Clock,
  BookOpen,
  Flame,
  FileCheck,
  BrainCircuit,
  Bot,
  Sparkles,
  Layers,
  BarChart3,
  ShieldAlert,
  RotateCcw,
  AlertOctagon,
  UserX,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import { AppTheme } from '../../types';
import { MaintenanceScreen } from '../MaintenanceScreen';

interface AdminMaintenanceTabProps {
  theme: AppTheme;
  getHeaders: (overrideStepUp?: string | null) => Record<string, string>;
  requestStepUp: (action: (token: string) => Promise<void>) => void;
}

interface MaintenanceConfigData {
  global: boolean;
  message: string;
  pages: Record<string, boolean>;
  updatedAt?: string;
  updatedBy?: string;
}

const PAGE_DEFINITIONS = [
  { key: 'table', name: 'Cronograma Geral', icon: Calendar, description: 'Grade principal e ciclos semanais de estudos' },
  { key: 'timer', name: 'Cronômetro Tático', icon: Clock, description: 'Contador de horas líquidas e sessões de estudo' },
  { key: 'monthlyHours', name: 'Carga Horária & Heatmap', icon: BarChart3, description: 'Histórico mensal e mapa de calor de horas' },
  { key: 'bizuario', name: 'Bizuário Tático', icon: BookOpen, description: 'Material de resumos, mapas mentais e bizus' },
  { key: 'highyield', name: 'Temas Quentes (High Yield)', icon: Flame, description: 'Módulos prioritários de alta probabilidade' },
  { key: 'examBank', name: 'Banco de Provas & Questões', icon: FileCheck, description: 'Acervo de provas anteriores e resoluções' },
  { key: 'simulations', name: 'Simulados Táticos', icon: BrainCircuit, description: 'Execução de simulados oficiais e gabaritos' },
  { key: 'leveling', name: 'Nivelamento', icon: Trophy, description: 'Bateria de questões com meta mínima de 80% de acertos' },
  { key: 'flashcards', name: 'Flashcards & Repetição Espaçada', icon: Layers, description: 'Decks de memorização ativa do aluno' },
  { key: 'learning', name: 'Radar & Desempenho do Aluno', icon: Sparkles, description: 'Métricas de maestria, consistência e taxa de acerto' },
  { key: 'ai', name: 'Equilíbrio IA', icon: Bot, description: 'Diagnóstico inteligente e sugestões automatizadas' },
  { key: 'calendar', name: 'Agenda Notion', icon: Calendar, description: 'Sincronização e visualização da agenda do Notion' },
];

export const AdminMaintenanceTab: React.FC<AdminMaintenanceTabProps> = ({
  theme,
  getHeaders,
  requestStepUp,
}) => {
  const isLight = theme === 'light';

  const [config, setConfig] = useState<MaintenanceConfigData>({
    global: false,
    message: '',
    pages: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewPage, setPreviewPage] = useState<string | null>(null);

  // Estados de Emergência e Reinicialização
  const [showLockdownModal, setShowLockdownModal] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isEmergencySubmitting, setIsEmergencySubmitting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);
  const [revokeSessionsChecked, setRevokeSessionsChecked] = useState(true);
  const [emergencyMessage, setEmergencyMessage] = useState('');
  const [lockdownConfirmKeyword, setLockdownConfirmKeyword] = useState('');

  const loadConfig = useCallback(() => {
    setIsLoading(true);
    fetch('/api/admin/maintenance', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.config) {
          setConfig({
            global: Boolean(data.config.global),
            message: data.config.message || '',
            pages: data.config.pages || {},
            updatedAt: data.config.updatedAt,
            updatedBy: data.config.updatedBy,
          });
        }
      })
      .catch(() => {
        setFeedback({ type: 'error', message: 'Falha ao carregar configurações de manutenção.' });
      })
      .finally(() => setIsLoading(false));
  }, [getHeaders]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleToggleGlobal = () => {
    setConfig((prev) => ({ ...prev, global: !prev.global }));
  };

  const handleTogglePage = (pageKey: string) => {
    setConfig((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [pageKey]: !prev.pages[pageKey],
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          global: config.global,
          pages: config.pages,
          message: config.message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfig((prev) => ({
          ...prev,
          updatedAt: data.config.updatedAt,
          updatedBy: data.config.updatedBy,
        }));
        setFeedback({ type: 'success', message: 'Modo de manutenção atualizado e persistido com sucesso!' });
      } else {
        setFeedback({ type: 'error', message: data.message || 'Erro ao salvar alterações.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de conexão ao salvar modo de manutenção.' });
    } finally {
      setIsSaving(false);
    }
  };

  // 🚨 Disparo do Modo de Emergência / Kill Switch Anti-Invasão
  const handleEmergencyLockdown = async (active: boolean, stepUpToken?: string) => {
    setIsEmergencySubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/system/emergency-lockdown', {
        method: 'POST',
        headers: getHeaders(stepUpToken),
        body: JSON.stringify({
          active,
          message: emergencyMessage.trim() || config.message || 'Sistema em procedimento de contingência e contenção de segurança. Acesso suspenso para manutenção emergencial.',
          revokeActiveSessions: active && revokeSessionsChecked,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        requestStepUp((token) => handleEmergencyLockdown(active, token));
        return;
      }
      if (res.ok && data.success) {
        setConfig((prev) => ({
          ...prev,
          global: active,
          message: data.config.message || prev.message,
          updatedAt: data.config.updatedAt,
          updatedBy: data.config.updatedBy,
        }));
        setFeedback({
          type: 'success',
          message: data.message,
        });
        setShowLockdownModal(false);
        setLockdownConfirmKeyword('');
        setEmergencyMessage('');
      } else {
        setFeedback({ type: 'error', message: data.message || 'Erro ao executar comando de emergência.' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Erro de conexão ao processar comando de emergência.' });
    } finally {
      setIsEmergencySubmitting(false);
    }
  };

  // 🔄 Disparo da Reinicialização Tática do Servidor
  const handleRestartServer = async (stepUpToken?: string) => {
    setIsRestarting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/system/restart', {
        method: 'POST',
        headers: getHeaders(stepUpToken),
      });
      const data = await res.json();
      if (res.status === 403 && data.error === 'STEP_UP_REQUIRED') {
        requestStepUp((token) => handleRestartServer(token));
        return;
      }
      if (res.ok && data.success) {
        setShowRestartModal(false);
        setRestartCountdown(6);

        let remaining = 6;
        const interval = setInterval(async () => {
          remaining -= 1;
          setRestartCountdown(remaining);

          if (remaining <= 2) {
            try {
              const healthRes = await fetch('/api/health');
              if (healthRes.ok) {
                clearInterval(interval);
                setRestartCountdown(null);
                setIsRestarting(false);
                setFeedback({
                  type: 'success',
                  message: 'Servidor reiniciado com sucesso e restabelecido operacionalmente!',
                });
                loadConfig();
                return;
              }
            } catch {}
          }

          if (remaining <= 0) {
            clearInterval(interval);
            setRestartCountdown(null);
            setIsRestarting(false);
            setFeedback({
              type: 'success',
              message: 'Comando de reinicialização concluído. Servidor online.',
            });
            loadConfig();
          }
        }, 1000);
      } else {
        setIsRestarting(false);
        setFeedback({ type: 'error', message: data.message || 'Erro ao acionar reinicialização.' });
      }
    } catch {
      setIsRestarting(false);
      setFeedback({ type: 'error', message: 'Erro de conexão ao enviar comando de reinicialização.' });
    }
  };

  const activePagesCount = Object.values(config.pages).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-wide flex items-center gap-2 text-red-500">
            <ShieldAlert size={28} />
            Gerenciamento de Modo de Manutenção & Emergência
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Contenção tática de incidentes, modo anti-invasão e controle granular de páginas com persistência segura.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadConfig}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-sm font-medium transition-colors border border-neutral-700"
            title="Recarregar status"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-xl text-sm shadow-[0_0_20px_rgba(239,68,68,0.4)] transition-all disabled:opacity-50"
          >
            {isSaving ? <RefreshCw size={15} className="animate-spin" /> : <Power size={15} />}
            Salvar Alterações
          </button>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-300'
              : 'bg-red-950/50 border-red-800/80 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 🚨 CENTRO DE CONTROLE DE INCIDENTES & CONTENÇÃO DE INVASÃO (KILL SWITCH) */}
      <div
        className={`p-6 rounded-2xl border-2 transition-all shadow-2xl relative overflow-hidden ${
          config.global
            ? 'bg-gradient-to-br from-red-950/80 via-red-900/40 to-black border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)]'
            : isLight
            ? 'bg-slate-50 border-red-200'
            : 'bg-neutral-900/90 border-neutral-800'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-2xl border ${
                config.global
                  ? 'bg-red-600 text-white border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse'
                  : 'bg-neutral-800 text-red-400 border-neutral-700'
              }`}
            >
              <AlertOctagon size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xl font-black uppercase tracking-wide">
                  Controle de Emergência & Modo Anti-Invasão
                </h3>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black tracking-widest uppercase border ${
                    config.global
                      ? 'bg-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse'
                      : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                  }`}
                >
                  {config.global ? 'SITE DESLIGADO PARA ALUNOS (LOCKDOWN)' : 'SISTEMA ONLINE (NORMAL)'}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1.5 max-w-2xl">
                {config.global ? (
                  <>
                    <strong className="text-red-400">Lockdown ativo:</strong> O backend está rejeitando todas as chamadas de API com <strong>503 Service Unavailable</strong> para alunos e visitantes. O acesso administrativo permanece restrito e exclusivo a administradores autenticados.
                  </>
                ) : (
                  <>
                    Em caso de suspeita de invasão, ataque ou incidente crítico, acione o <strong>Kill Switch</strong> para desligar imediatamente o site para todos os usuários comuns no backend, com opção de derrubar sessões ativas.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Botão de Reiniciar Servidor */}
            <button
              type="button"
              onClick={() => setShowRestartModal(true)}
              disabled={isRestarting}
              className="flex items-center gap-2 px-4 py-3 bg-neutral-800 hover:bg-neutral-700 text-amber-300 rounded-xl text-sm font-bold border border-amber-500/30 transition-all shadow-md hover:border-amber-400 disabled:opacity-50"
              title="Reiniciar servidor Node.js com encerramento gracioso"
            >
              <RotateCcw size={16} className={isRestarting ? 'animate-spin' : ''} />
              {isRestarting ? 'Reiniciando...' : 'Reiniciar Servidor'}
            </button>

            {/* Botão Kill Switch / Desligar para todos */}
            {config.global ? (
              <button
                type="button"
                onClick={() => handleEmergencyLockdown(false)}
                disabled={isEmergencySubmitting}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all disabled:opacity-50"
              >
                <ShieldCheck size={18} />
                {isEmergencySubmitting ? 'Restaurando...' : 'Restaurar Operações Normais'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLockdownModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(239,68,68,0.5)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <AlertOctagon size={18} />
                Desligar Site para Todos (Invasão)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CARD 1: Manutenção Programada e Chave Geral */}
      <div
        className={`p-6 rounded-2xl border-2 transition-all shadow-xl ${
          config.global
            ? 'bg-red-950/20 border-red-700/60'
            : isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-2xl border ${
                config.global
                  ? 'bg-red-600 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
              }`}
            >
              <Power size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-black uppercase tracking-wide">
                  Chave Geral de Manutenção
                </h3>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black tracking-widest uppercase border ${
                    config.global
                      ? 'bg-red-600 text-white border-red-400 animate-pulse'
                      : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                  }`}
                >
                  {config.global ? 'ATIVADA' : 'DESATIVADA'}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-1 max-w-xl">
                Alterna o modo global sem derrubar sessões ativas. Lembre-se de clicar em <strong>Salvar Alterações</strong> no topo para persistir.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleGlobal}
            className={`px-6 py-3 rounded-xl font-black text-sm tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
              config.global
                ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]'
            }`}
          >
            {config.global ? 'Desativar Manutenção Global' : 'Bloquear Todo o Sistema'}
          </button>
        </div>
      </div>

      {/* CARD 2: Mensagem Personalizada aos Alunos */}
      <div
        className={`p-6 rounded-2xl border ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <label className="block text-sm font-bold uppercase tracking-wider text-neutral-300 mb-2">
          Mensagem de Aviso aos Alunos (Exibida na Tela Vermelha)
        </label>
        <p className="text-xs text-neutral-400 mb-3">
          Este texto será exibido na tela vermelha de bloqueio para todos os alunos e visitantes.
        </p>
        <textarea
          rows={3}
          value={config.message}
          onChange={(e) => setConfig((prev) => ({ ...prev, message: e.target.value }))}
          placeholder="Ex: Estamos realizando um procedimento de contingência e manutenção programada. Previsão de normalização: 15 minutos."
          className={`w-full p-4 rounded-xl border text-sm transition-colors outline-none resize-none ${
            isLight
              ? 'bg-neutral-50 border-neutral-300 text-slate-900 focus:border-red-500'
              : 'bg-neutral-950/80 border-neutral-800 text-neutral-100 focus:border-red-500'
          }`}
        />
      </div>

      {/* CARD 3: Bloqueio Individual por Página */}
      <div
        className={`p-6 rounded-2xl border ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-black uppercase tracking-wide flex items-center gap-2">
              <Layers size={20} className="text-red-500" />
              Bloqueio Individual por Página ({activePagesCount} em manutenção)
            </h3>
            <p className="text-sm text-neutral-400 mt-1">
              Desative módulos individuais sem afetar o resto da plataforma de estudos.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAGE_DEFINITIONS.map((p) => {
            const Icon = p.icon;
            const isBlocked = Boolean(config.pages[p.key]);

            return (
              <div
                key={p.key}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-4 ${
                  isBlocked
                    ? 'bg-red-950/20 border-red-800/80 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                    : isLight
                    ? 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                    : 'bg-neutral-950/40 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-lg border shrink-0 ${
                      isBlocked
                        ? 'bg-red-600 text-white border-red-500'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold tracking-wide flex items-center gap-2">
                      {p.name}
                      {isBlocked && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-600 text-white">
                          Bloqueado
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-800/60">
                  <button
                    type="button"
                    onClick={() => setPreviewPage(p.key)}
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 py-1 px-2 rounded-lg hover:bg-neutral-800 transition-colors"
                  >
                    <Eye size={13} />
                    Prévia
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePage(p.key)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors ${
                      isBlocked
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60'
                    }`}
                  >
                    {isBlocked ? 'Liberar Página' : 'Bloquear Página'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🚨 MODAL DE CONFIRMAÇÃO DO KILL SWITCH (DESLIGAR SITE) */}
      {showLockdownModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border-2 border-red-600 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(239,68,68,0.5)] space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-600 text-white rounded-xl">
                  <AlertOctagon size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-wide text-red-400">
                    Confirmar Desligamento Tático
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Procedimento de contenção de incidente / invasão
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLockdownModal(false);
                  setLockdownConfirmKeyword('');
                }}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-xs text-red-200 space-y-2">
              <p>
                <strong>ATENÇÃO MÁXIMA:</strong> Ao confirmar, o backend Express ativará o <strong>Lockdown Global</strong>.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-red-300">
                <li>Todas as requisições de alunos, visitantes e bots receberão <strong>HTTP 503</strong>.</li>
                <li>O frontend exibirá a tela vermelha militar de emergência para todos os alunos.</li>
                <li>O painel administrativo continuará acessível exclusivamente para sua conta.</li>
              </ul>
            </div>

            {/* Checkbox de Derrubar Sessões Ativas */}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-neutral-950 border border-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={revokeSessionsChecked}
                onChange={(e) => setRevokeSessionsChecked(e.target.checked)}
                className="w-4 h-4 text-red-600 rounded border-neutral-700 bg-neutral-900 focus:ring-red-500"
              />
              <div className="text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <UserX size={14} className="text-red-400" />
                  Derrubar todas as sessões ativas de alunos e cadetes
                </span>
                <p className="text-neutral-400 text-[11px]">
                  Expulsa imediatamente qualquer sessão conectada no banco de dados e limpa locks no Redis.
                </p>
              </div>
            </label>

            {/* Mensagem Personalizada Opcional */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300 mb-1.5">
                Mensagem de Contingência (Opcional):
              </label>
              <input
                type="text"
                value={emergencyMessage}
                onChange={(e) => setEmergencyMessage(e.target.value)}
                placeholder="Ex: Sistema em procedimento de segurança. Acesso suspenso."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:border-red-500 outline-none"
              />
            </div>

            {/* Digite DESLIGAR para confirmar */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-red-400 mb-1.5">
                Digite <span className="text-white underline font-mono">DESLIGAR</span> para habilitar o comando:
              </label>
              <input
                type="text"
                value={lockdownConfirmKeyword}
                onChange={(e) => setLockdownConfirmKeyword(e.target.value)}
                placeholder="DESLIGAR"
                className="w-full px-3 py-2 bg-neutral-950 border border-red-800/80 rounded-xl text-xs font-mono font-bold text-white tracking-widest uppercase focus:border-red-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLockdownModal(false);
                  setLockdownConfirmKeyword('');
                }}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={lockdownConfirmKeyword.trim() !== 'DESLIGAR' || isEmergencySubmitting}
                onClick={() => handleEmergencyLockdown(true)}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(239,68,68,0.5)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEmergencySubmitting ? 'Acionando Kill Switch...' : 'Desligar Site Agora'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔄 MODAL DE CONFIRMAÇÃO DE REINICIALIZAÇÃO DO SERVIDOR */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
                  <RotateCcw size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-wide text-amber-300">
                    Reiniciar Servidor
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Reexecução limpa do processo Node.js na nuvem
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRestartModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200 space-y-2">
              <p>
                Este comando encerra com segurança o processo do servidor Node.js (executando fechamento de banco e listeners). O orquestrador (Render/Docker) reiniciará uma instância limpa imediatamente.
              </p>
              <p className="text-[11px] text-amber-300/80">
                A indisponibilidade transitória dura tipicamente de <strong>3 a 6 segundos</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestartModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRestarting}
                onClick={() => handleRestartServer()}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all disabled:opacity-50"
              >
                {isRestarting ? 'Reiniciando...' : 'Confirmar Reinicialização'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TELA DE RECONEXÃO ATIVA APÓS REINICIALIZAÇÃO */}
      {restartCountdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4">
          <div className="bg-neutral-900 border border-amber-500/50 rounded-2xl max-w-sm w-full p-6 text-center space-y-4 shadow-[0_0_40px_rgba(245,158,11,0.3)]">
            <RefreshCw size={40} className="animate-spin text-amber-400 mx-auto" />
            <h3 className="text-lg font-black uppercase text-white">
              Reiniciando Servidor
            </h3>
            <p className="text-xs text-neutral-400">
              O processo está sendo recarregado. Reconectando e testando integridade...
            </p>
            <div className="text-3xl font-mono font-black text-amber-400">
              {restartCountdown}s
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prévia da Tela Vermelha */}
      {previewPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl">
            <button
              onClick={() => setPreviewPage(null)}
              className="absolute top-4 right-4 z-30 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl text-xs shadow-lg border border-neutral-600"
            >
              Fechar Prévia (ESC)
            </button>
            <div className="p-2">
              <MaintenanceScreen
                theme={theme}
                pageName={previewPage}
                message={config.message || 'Mensagem padrão de manutenção configurada.'}
                isAdmin={false}
                onGoHome={() => setPreviewPage(null)}
                onRefresh={() => setPreviewPage(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
