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
} from 'lucide-react';
import { AppTheme } from '../../types';
import { MaintenanceScreen } from '../MaintenanceScreen';

interface AdminMaintenanceTabProps {
  theme: AppTheme;
  sessionToken: string | null;
  getHeaders: (overrideStepUp?: string | null) => Record<string, string>;
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
  { key: 'flashcards', name: 'Flashcards & Repetição Espaçada', icon: Layers, description: 'Decks de memorização ativa do aluno' },
  { key: 'learning', name: 'Radar & Desempenho do Aluno', icon: Sparkles, description: 'Métricas de maestria, consistência e taxa de acerto' },
  { key: 'ai', name: 'Equilíbrio IA', icon: Bot, description: 'Diagnóstico inteligente e sugestões automatizadas' },
  { key: 'calendar', name: 'Agenda Notion', icon: Calendar, description: 'Sincronização e visualização da agenda do Notion' },
];

export const AdminMaintenanceTab: React.FC<AdminMaintenanceTabProps> = ({
  theme,
  getHeaders,
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

  const activePagesCount = Object.values(config.pages).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-wide flex items-center gap-2 text-red-500">
            <ShieldAlert size={28} />
            Gerenciamento de Modo de Manutenção
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Coloque páginas específicas ou todo o sistema em manutenção com persistência garantida no PostgreSQL.
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

      {/* CARD 1: Chave Geral do Sistema */}
      <div
        className={`p-6 rounded-2xl border-2 transition-all shadow-xl ${
          config.global
            ? 'bg-red-950/30 border-red-600 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
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
                  Manutenção Global (Todo o Sistema)
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
                Quando ativada, <strong>todas as páginas de alunos e cadetes</strong> exibirão imediatamente a tela de
                bloqueio com a escrita gigante e o X vermelho marcado. O painel do administrador continuará acessível.
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
          Mensagem de Aviso aos Alunos (Opcional)
        </label>
        <p className="text-xs text-neutral-400 mb-3">
          Este texto será exibido na tela vermelha de manutenção caso preenchido.
        </p>
        <textarea
          rows={3}
          value={config.message}
          onChange={(e) => setConfig((prev) => ({ ...prev, message: e.target.value }))}
          placeholder="Ex: Estamos realizando uma atualização de banco de dados e preparando novos simulados. Previsão de retorno: 18:00."
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
            <p className="text-xs text-neutral-400 mt-0.5">
              Coloque módulos específicos em manutenção enquanto o restante da plataforma continua operando normalmente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const allPages: Record<string, boolean> = {};
                PAGE_DEFINITIONS.forEach((p) => {
                  allPages[p.key] = true;
                });
                setConfig((prev) => ({ ...prev, pages: allPages }));
              }}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-700"
            >
              Marcar Todas
            </button>
            <button
              onClick={() => {
                setConfig((prev) => ({ ...prev, pages: {} }));
              }}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold rounded-lg border border-neutral-700"
            >
              Liberar Todas
            </button>
          </div>
        </div>

        {/* Grid de Páginas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PAGE_DEFINITIONS.map((p) => {
            const Icon = p.icon;
            const isUnderMaintenance = config.global || Boolean(config.pages[p.key]);

            return (
              <div
                key={p.key}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                  isUnderMaintenance
                    ? 'bg-red-950/20 border-red-700/60 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                    : isLight
                    ? 'bg-neutral-50 border-neutral-200 hover:border-neutral-300'
                    : 'bg-neutral-950/40 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg ${
                        isUnderMaintenance ? 'bg-red-600/20 text-red-400' : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold tracking-tight">{p.name}</h4>
                      <p className="text-[11px] text-neutral-400 line-clamp-1">{p.description}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                      isUnderMaintenance
                        ? 'bg-red-600 text-white border-red-400'
                        : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    }`}
                  >
                    {isUnderMaintenance ? 'MANUTENÇÃO' : 'ONLINE'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-neutral-800/40 mt-auto">
                  <button
                    onClick={() => setPreviewPage(p.name)}
                    className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                  >
                    <Eye size={13} />
                    Ver Prévia
                  </button>

                  <button
                    onClick={() => handleTogglePage(p.key)}
                    disabled={config.global}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      config.pages[p.key]
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {config.pages[p.key] ? 'Liberar Página' : 'Bloquear Página'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
