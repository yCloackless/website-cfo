import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  Trophy,
  Target,
  TrendingUp,
  RotateCcw,
  Clock,
  Calendar,
  Zap,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Layers,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import {
  AIAnalysisResult,
  AppTheme,
  MonthlyStudySessionDay,
  MonthlyStudySummary,
  NotionRevisionItem,
  Subject,
  WeeklyCycle,
} from '../types';
import { StudyColumnCharts } from './StudyColumnCharts';
import { ConfirmModal } from './ConfirmModal';
import {
  checkinRevision,
  deleteNotionStudy,
  duplicateNotionStudy,
  fetchNotionRevisoes,
  getNotionConnectionStatus,
  renameNotionStudy,
} from '../services/notionService';
import { summarizeOverdueNotionRevisions } from '../utils/notionRevisions';
import { getCurrentYearMonthAndToday } from '../utils/studyBalance';

interface AIBalanceTabProps {
  theme: AppTheme;
  summary: MonthlyStudySummary;
  analysis: AIAnalysisResult | null;
  isLoading: boolean;
  onRefresh: () => void;
  analysisSource: string | null;
  lastUpdated: Date | null;
  subjects?: Subject[];
  currentCycle?: WeeklyCycle | null;
  cyclesHistory?: WeeklyCycle[];
  monthlySessionDays?: Record<string, MonthlyStudySessionDay>;
  canAccessNotion?: boolean;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

function formatDateBR(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatHoursLabel(hours: number): string {
  return `${Number((hours || 0).toFixed(1))}h`;
}

export const AIBalanceTab: React.FC<AIBalanceTabProps> = ({
  theme,
  summary,
  analysis,
  isLoading,
  onRefresh,
  analysisSource,
  lastUpdated,
  subjects = [],
  currentCycle = null,
  cyclesHistory = [],
  monthlySessionDays = {},
  canAccessNotion = false,
  showToast,
}) => {
  const isDark = theme === 'dark';

  // Admin-only Notion overdue revisions state
  const [notionItems, setNotionItems] = useState<NotionRevisionItem[]>([]);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionSource, setNotionSource] = useState<'notion_api' | 'local_cache' | 'unavailable'>('unavailable');
  const [notionError, setNotionError] = useState<string | undefined>(undefined);
  const [notionConfigStatus, setNotionConfigStatus] = useState<{
    isConfigured: boolean;
    hasApiKey: boolean;
    hasDatabaseId: boolean;
  } | null>(null);
  const [expandedMaterias, setExpandedMaterias] = useState<Record<string, boolean>>({});
  const [checkingPageId, setCheckingPageId] = useState<string | null>(null);
  const [openMenuPageId, setOpenMenuPageId] = useState<string | null>(null);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTargetItem, setDeleteTargetItem] = useState<NotionRevisionItem | null>(null);
  const [mutatingPageId, setMutatingPageId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuPageId) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-notion-menu]')) {
        setOpenMenuPageId(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuPageId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuPageId]);

  const loadNotionRevisions = useCallback(async () => {
    if (!canAccessNotion) return;
    setNotionLoading(true);
    try {
      const [res, status] = await Promise.all([
        fetchNotionRevisoes(),
        getNotionConnectionStatus(),
      ]);
      setNotionItems(res.items);
      setNotionSource(res.source);
      setNotionError(res.error);
      setNotionConfigStatus(status);
    } finally {
      setNotionLoading(false);
    }
  }, [canAccessNotion]);

  useEffect(() => {
    if (canAccessNotion) {
      void loadNotionRevisions();
    } else {
      setNotionItems([]);
      setNotionError(undefined);
    }
  }, [canAccessNotion, loadNotionRevisions]);

  const { todayStr } = useMemo(() => getCurrentYearMonthAndToday(), []);

  const overdueNotionSummary = useMemo(() => {
    if (!canAccessNotion) return null;
    return summarizeOverdueNotionRevisions(notionItems, todayStr);
  }, [canAccessNotion, notionItems, todayStr]);

  const handleMarkNotionReviewed = async (
    item: NotionRevisionItem,
    pendingCycleKey: Parameters<typeof checkinRevision>[1],
    pendingCycleLabel: string
  ) => {
    if (!canAccessNotion || checkingPageId) return;
    setCheckingPageId(item.id);
    try {
      const res = await checkinRevision(item.id, pendingCycleKey, true);
      if (res.success && res.item) {
        setNotionItems((prev) => prev.map((it) => (it.id === item.id ? res.item! : it)));
        const nextDateText = res.item.proximaRevisao
          ? ` Próxima revisão atualizada no Notion para ${formatDateBR(res.item.proximaRevisao)}.`
          : '';
        showToast?.(`"${item.assunto}" marcada como revisada (${pendingCycleLabel}).${nextDateText}`, 'success');
      } else {
        showToast?.(res.error || 'Não foi possível atualizar a revisão no Notion.', 'error');
      }
    } finally {
      setCheckingPageId(null);
    }
  };

  const toggleMateria = (materia: string) => {
    setExpandedMaterias((prev) => ({ ...prev, [materia]: !prev[materia] }));
  };

  const handleStartRename = (item: NotionRevisionItem) => {
    setOpenMenuPageId(null);
    setRenamingPageId(item.id);
    setRenameDraft(item.assunto);
  };

  const handleCancelRename = () => {
    setRenamingPageId(null);
    setRenameDraft('');
  };

  const handleSubmitRename = async (item: NotionRevisionItem) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      showToast?.('Informe um nome válido para o estudo.', 'error');
      return;
    }
    if (trimmed === item.assunto) {
      handleCancelRename();
      return;
    }
    if (mutatingPageId) return;
    setMutatingPageId(item.id);
    try {
      const res = await renameNotionStudy(item.id, trimmed);
      if (res.success && res.item) {
        setNotionItems((prev) => prev.map((it) => (it.id === item.id ? res.item! : it)));
        handleCancelRename();
        showToast?.(`Estudo renomeado para "${res.item.assunto}" no Notion.`, 'success');
      } else {
        showToast?.(res.error || 'Não foi possível renomear o estudo no Notion.', 'error');
      }
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleDuplicateNotionItem = async (item: NotionRevisionItem) => {
    if (mutatingPageId) return;
    setOpenMenuPageId(null);
    setMutatingPageId(item.id);
    try {
      const res = await duplicateNotionStudy(item.id);
      if (res.success && res.item) {
        setNotionItems((prev) => [res.item!, ...prev]);
        showToast?.(`"${res.item.assunto}" duplicado no Notion.`, 'success');
      } else {
        showToast?.(res.error || 'Não foi possível duplicar o estudo no Notion.', 'error');
      }
    } finally {
      setMutatingPageId(null);
    }
  };

  const handleConfirmDeleteNotionItem = async () => {
    if (!deleteTargetItem || mutatingPageId) return;
    const target = deleteTargetItem;
    setMutatingPageId(target.id);
    try {
      const res = await deleteNotionStudy(target.id);
      if (res.success) {
        setNotionItems((prev) => prev.filter((it) => it.id !== target.id));
        setDeleteTargetItem(null);
        showToast?.(`"${target.assunto}" excluído das revisões do Notion.`, 'success');
      } else {
        showToast?.(res.error || 'Não foi possível excluir o estudo no Notion.', 'error');
      }
    } finally {
      setMutatingPageId(null);
    }
  };

  // Real monthly metrics (never fabricated)
  const topStudied = summary.subjectsStudied[0];
  const topHours = topStudied ? Number((topStudied.minutes / 60).toFixed(1)) : 0;
  const topPercentage =
    summary.totalMinutes > 0 && topStudied
      ? Math.round((topStudied.minutes / summary.totalMinutes) * 100)
      : 0;
  const activeSubjectsCount = summary.subjectsStudied.filter((s) => s.minutes > 0 || s.sessions > 0).length;
  const displayScore =
    summary.totalMinutes === 0 && summary.totalSessions === 0
      ? 0
      : analysis?.equilibriumScore ?? summary.equilibriumScore;

  const scoreAccent =
    displayScore >= 70
      ? 'from-emerald-500 to-teal-400 text-emerald-400'
      : displayScore >= 40
        ? 'from-amber-500 to-yellow-400 text-amber-400'
        : 'from-rose-500 to-[#0056D2] text-rose-400';

  const cardSurface = isDark
    ? 'bg-[#111218] border-slate-800 shadow-xl'
    : 'bg-white border-slate-200 shadow-lg shadow-slate-200/50';
  const subSurface = isDark ? 'bg-slate-950/70 border-slate-800/80' : 'bg-slate-50 border-slate-200';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Modern Header */}
      <div className={`p-5 sm:p-6 rounded-2xl border transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${cardSurface}`}>
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#0056D2] to-sky-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                IA de Equilíbrio Mensal
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20">
                Dados Reais • {summary.yearMonth}
              </span>
              {analysisSource && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/10 text-[#0056D2] dark:text-sky-400 border border-sky-500/20">
                  {analysisSource === 'gemini' ? 'Gemini AI' : 'Motor Determinístico'}
                </span>
              )}
            </div>
            <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Diagnóstico individualizado com base exclusiva nos seus estudos reais do mês inteiro (cronômetro + cronograma), sem métricas fictícias.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="flex items-center gap-1.5 justify-end text-[11px] font-semibold text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>100% Individual</span>
            </div>
            {lastUpdated && (
              <p className={`text-[10px] tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0056D2] hover:bg-blue-600 text-white shadow-md shadow-blue-900/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Analisando...' : 'Reanalisar Mês'}</span>
          </button>
        </div>
      </div>

      {/* 4 Real Monthly KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
        <div className={`p-4 rounded-2xl border ${cardSurface}`}>
          <div className="flex items-center justify-between text-[#0056D2] dark:text-sky-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total no Mês</span>
            <Clock className="w-4 h-4" />
          </div>
          <p className={`text-2xl font-black mt-1.5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {formatHoursLabel(summary.totalHours)}
          </p>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            {summary.totalSessions} {summary.totalSessions === 1 ? 'sessão registrada' : 'sessões registradas'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardSurface}`}>
          <div className="flex items-center justify-between text-emerald-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Matérias Ativas</span>
            <Layers className="w-4 h-4" />
          </div>
          <p className={`text-2xl font-black mt-1.5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {activeSubjectsCount}
            <span className="text-sm font-medium text-slate-500"> / {summary.allSubjects.length}</span>
          </p>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            {summary.subjectsNotStudied.length > 0
              ? `${summary.subjectsNotStudied.length} ainda zerada(s)`
              : 'Grade 100% tocada no mês'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardSurface}`}>
          <div className="flex items-center justify-between text-sky-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Líder do Mês</span>
            <Trophy className="w-4 h-4" />
          </div>
          <p className={`text-base font-bold mt-2 truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            {topStudied ? topStudied.name : 'Nenhuma matéria'}
          </p>
          <p className="text-[11px] font-semibold text-[#0056D2] dark:text-sky-400 mt-0.5">
            {topStudied ? `${topHours}h (${topPercentage}% do mês)` : '0h registradas'}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${cardSurface}`}>
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-[10px] font-bold uppercase tracking-wider">Índice de Equilíbrio</span>
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className={`text-2xl font-black ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {displayScore}
            </span>
            <span className="text-xs font-semibold text-slate-500">/ 100</span>
          </div>
          <div className={`w-full h-1.5 rounded-full mt-2 overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-200'}`}>
            <div
              className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ${scoreAccent}`}
              style={{ width: `${Math.max(0, Math.min(100, displayScore))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Admin-Only Notion Pending Revisions Up To Today */}
      {canAccessNotion && (
        <div className={`p-5 sm:p-6 rounded-2xl border space-y-4 ${cardSurface}`}>
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${
              isDark ? 'border-slate-800/80' : 'border-slate-200'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    Revisões do Notion Pendentes até Hoje
                  </h3>
                  {!notionLoading && notionSource === 'unavailable' && notionItems.length === 0 ? (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        isDark
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      Desconectado
                    </span>
                  ) : (
                    overdueNotionSummary && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border tabular-nums ${
                          overdueNotionSummary.totalPending > 0
                            ? isDark
                              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                            : isDark
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {overdueNotionSummary.totalPending > 0
                          ? `${overdueNotionSummary.totalPending} pendente(s) até ${formatDateBR(todayStr)}`
                          : `Em dia até ${formatDateBR(todayStr)}`}
                      </span>
                    )
                  )}
                </div>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Clique em uma matéria para ver os assuntos que venceram até hoje e dar baixa direto na próxima etapa do Notion.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadNotionRevisions()}
              disabled={notionLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${
                isDark
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${notionLoading ? 'animate-spin' : ''}`} />
              <span>{notionLoading ? 'Sincronizando...' : 'Sincronizar Notion'}</span>
            </button>
          </div>

          {notionLoading && notionItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Consultando sua base de revisões no Notion...
            </div>
          ) : notionSource === 'unavailable' && notionItems.length === 0 ? (
            <div
              className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs ${
                isDark
                  ? 'bg-amber-950/20 border-amber-800/50 text-amber-300'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {notionError === 'NOTION_NOT_CONFIGURED'
                  ? `Integração do Notion não configurada no servidor. Faltando no ambiente: ${
                      [
                        !notionConfigStatus?.hasApiKey ? 'NOTION_API_KEY' : null,
                        !notionConfigStatus?.hasDatabaseId ? 'NOTION_DATABASE_ID' : null,
                      ]
                        .filter(Boolean)
                        .join(' e ') || 'NOTION_API_KEY / NOTION_DATABASE_ID'
                    }.`
                  : 'Não foi possível ler sua base do Notion no momento. Nenhum dado fictício foi exibido.'}
              </span>
            </div>
          ) : overdueNotionSummary && overdueNotionSummary.subjects.length === 0 ? (
            <div
              className={`p-4 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
                isDark
                  ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Nenhuma revisão atrasada ou vencendo hoje ({formatDateBR(todayStr)}) no seu Notion.</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {overdueNotionSummary?.subjects.map((group) => {
                const isExpanded = Boolean(expandedMaterias[group.materia]);
                return (
                  <div
                    key={group.materia}
                    className={`rounded-xl border transition-colors ${subSurface}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleMateria(group.materia)}
                      aria-expanded={isExpanded}
                      className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                        isExpanded ? 'rounded-t-xl' : 'rounded-xl'
                      } ${
                        isDark ? 'hover:bg-slate-900/80' : 'hover:bg-slate-100/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#0056D2] dark:text-sky-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={`text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          {group.materia}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums border ${
                            group.overdueCount > 0
                              ? isDark
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                              : isDark
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {group.count} {group.count === 1 ? 'revisão pendente' : 'revisões pendentes'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] shrink-0 tabular-nums">
                        {group.overdueCount > 0 && (
                          <span className="text-rose-400 font-semibold hidden sm:inline">
                            {group.overdueCount} atrasada(s)
                          </span>
                        )}
                        {group.dueTodayCount > 0 && (
                          <span className="text-amber-400 font-semibold hidden sm:inline">
                            {group.dueTodayCount} hoje
                          </span>
                        )}
                        <span className={isDark ? 'text-slate-500' : 'text-slate-500'}>
                          desde {formatDateBR(group.earliestDueDate)}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div
                        className={`px-4 pb-3 pt-2 space-y-2 border-t rounded-b-xl ${
                          isDark ? 'border-slate-800/70 bg-slate-950/40' : 'border-slate-200 bg-white/80'
                        }`}
                      >
                        {group.items.map((topic) => {
                          const isBusy = checkingPageId === topic.item.id;
                          const isMutating = mutatingPageId === topic.item.id;
                          const isRenaming = renamingPageId === topic.item.id;
                          const isMenuOpen = openMenuPageId === topic.item.id;
                          return (
                            <div
                              key={topic.item.id}
                              className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                                isDark
                                  ? 'bg-slate-900/70 border-slate-800'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                {isRenaming ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      void handleSubmitRename(topic.item);
                                    }}
                                    className="flex items-center gap-1.5 flex-wrap"
                                  >
                                    <input
                                      type="text"
                                      value={renameDraft}
                                      onChange={(e) => setRenameDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          handleCancelRename();
                                        }
                                      }}
                                      autoFocus
                                      maxLength={200}
                                      disabled={isMutating}
                                      aria-label="Novo nome do estudo"
                                      className={`flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border outline-none focus:ring-2 focus:ring-[#0056D2]/40 ${
                                        isDark
                                          ? 'bg-slate-950 border-slate-700 text-slate-100'
                                          : 'bg-white border-slate-300 text-slate-900'
                                      }`}
                                    />
                                    <button
                                      type="submit"
                                      disabled={isMutating}
                                      title="Salvar nome"
                                      aria-label="Salvar nome"
                                      className="p-1.5 rounded-lg bg-[#0056D2] hover:bg-blue-600 text-white cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isMutating}
                                      onClick={handleCancelRename}
                                      title="Cancelar"
                                      aria-label="Cancelar"
                                      className={`p-1.5 rounded-lg border cursor-pointer disabled:opacity-50 ${
                                        isDark
                                          ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                                          : 'border-slate-300 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className={`text-xs sm:text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                      {topic.item.assunto}
                                    </p>
                                    {topic.item.url && (
                                      <a
                                        href={topic.item.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-slate-400 hover:text-[#0056D2] dark:hover:text-sky-400"
                                        title="Abrir no Notion"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                )}

                                <div className="flex items-center gap-2 flex-wrap text-[11px] tabular-nums">
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-semibold border ${
                                      topic.isOverdue
                                        ? isDark
                                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                                          : 'bg-rose-50 text-rose-700 border-rose-200'
                                        : isDark
                                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                                          : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    {topic.isOverdue ? 'Atrasada' : 'Hoje'} • {formatDateBR(topic.dueDate)}
                                  </span>

                                  <span className="px-2 py-0.5 rounded-md font-bold bg-[#0056D2]/15 text-[#0056D2] dark:text-sky-400 border border-[#0056D2]/25">
                                    Pendente: {topic.pendingCycleLabel}
                                    {topic.nextCycleLabel ? ` → ${topic.nextCycleLabel}` : ''}
                                  </span>

                                  {topic.item.tipoRevisao?.map((tag) => (
                                    <span
                                      key={tag}
                                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                                        isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={Boolean(checkingPageId) || isMutating}
                                  onClick={() =>
                                    void handleMarkNotionReviewed(
                                      topic.item,
                                      topic.pendingCycleKey,
                                      topic.pendingCycleLabel
                                    )
                                  }
                                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all shrink-0 cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                                  <span>
                                    {isBusy
                                      ? 'Atualizando Notion...'
                                      : `Marcar revisado (${topic.pendingCycleLabel})`}
                                  </span>
                                </button>

                                <div className="relative" data-notion-menu>
                                  <button
                                    type="button"
                                    disabled={Boolean(mutatingPageId)}
                                    onClick={() =>
                                      setOpenMenuPageId((prev) => (prev === topic.item.id ? null : topic.item.id))
                                    }
                                    aria-haspopup="menu"
                                    aria-expanded={isMenuOpen}
                                    aria-label={`Ações para ${topic.item.assunto}`}
                                    title="Mais ações"
                                    className={`p-2 rounded-xl border transition-colors cursor-pointer disabled:opacity-50 ${
                                      isDark
                                        ? 'bg-slate-950/70 hover:bg-slate-800 border-slate-800 text-slate-300'
                                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>

                                  {isMenuOpen && (
                                    <div
                                      role="menu"
                                      aria-label={`Opções de ${topic.item.assunto}`}
                                      className={`absolute right-0 mt-1.5 w-44 rounded-xl border shadow-xl py-1 z-30 ${
                                        isDark
                                          ? 'bg-[#111218] border-slate-800 text-slate-200 shadow-black/60'
                                          : 'bg-white border-slate-200 text-slate-800 shadow-slate-300/60'
                                      }`}
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => handleStartRename(topic.item)}
                                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                                          isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                                        }`}
                                      >
                                        <Pencil className="w-3.5 h-3.5 text-sky-400" />
                                        <span>Renomear</span>
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void handleDuplicateNotionItem(topic.item)}
                                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                                          isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-100'
                                        }`}
                                      >
                                        <Copy className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>Duplicar</span>
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setOpenMenuPageId(null);
                                          setDeleteTargetItem(topic.item);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer text-rose-400 ${
                                          isDark ? 'hover:bg-rose-950/40' : 'hover:bg-rose-50 text-rose-600'
                                        }`}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Excluir</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Interactive Bar / Pie Charts */}
      <StudyColumnCharts
        subjects={subjects}
        currentCycle={currentCycle}
        cyclesHistory={cyclesHistory}
        monthlySessionDays={monthlySessionDays}
        theme={theme}
      />

      {/* Diagnostic & Action Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`lg:col-span-2 p-5 sm:p-6 rounded-2xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Target className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[#0056D2] dark:text-sky-400">
                    Diagnóstico Pedagógico do Mês
                  </p>
                  <h3 className={`text-base font-bold break-words ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {analysis?.topStudiedSubject?.name ||
                      (topStudied ? topStudied.name : 'Nenhum estudo registrado no mês')}
                  </h3>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-[#0056D2] dark:text-sky-400 border border-blue-500/25 shrink-0">
                {analysis?.topStudiedSubject?.status || (topStudied ? 'Líder do Mês' : 'Sem registros')}
              </span>
            </div>

            <div className={`p-4 rounded-xl border text-xs leading-relaxed ${subSurface} ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              <p className="font-bold text-[#0056D2] dark:text-sky-400 mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Análise da IA
              </p>
              <p>
                {analysis?.topStudiedSubject?.analysis ||
                  (summary.totalMinutes > 0
                    ? `Você soma ${summary.totalHours}h em ${activeSubjectsCount} matéria(s) neste mês. Clique em "Reanalisar Mês" para atualizar as recomendações detalhadas.`
                    : '0h registradas neste mês até o momento. Assim que houver sessões reais no cronômetro ou cronograma, a análise detalhada será exibida aqui.')}
              </p>
            </div>
          </div>

          {topStudied?.topics && topStudied.topics.length > 0 && (
            <div className={`mt-4 pt-3 border-t ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
              <p className={`text-[11px] font-semibold mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Tópicos registrados em {topStudied.name} neste mês:
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {topStudied.topics.map((top, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                      isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {top}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`p-5 sm:p-6 rounded-2xl border flex flex-col justify-between min-w-0 ${cardSurface}`}>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-[#0056D2] dark:text-sky-400 mb-1">
              Balanço Geral do Mês
            </p>
            <h3 className={`text-base font-bold mb-3 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Leitura de Distribuição
            </h3>
            <p className={`text-xs leading-relaxed p-3.5 rounded-xl border ${subSurface} ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {analysis?.balanceDiagnosis ||
                (summary.totalMinutes === 0
                  ? 'Nenhuma hora registrada neste mês para esta conta.'
                  : `${summary.subjectsNotStudied.length} matéria(s) ainda sem horas no mês atual.`)}
            </p>
          </div>

          {analysis?.tacticalTip && (
            <div
              className={`mt-4 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                isDark
                  ? 'bg-blue-950/30 border-blue-900/50 text-slate-200'
                  : 'bg-blue-50 border-blue-200 text-slate-800'
              }`}
            >
              <Zap className="w-4 h-4 text-[#0056D2] dark:text-sky-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{analysis.tacticalTip}</p>
            </div>
          )}
        </div>
      </div>

      {/* Priority Subjects */}
      {analysis?.prioritySubjectsForNextWeek && analysis.prioritySubjectsForNextWeek.length > 0 && (
        <div className={`p-5 sm:p-6 rounded-2xl border space-y-4 ${cardSurface}`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
            <div>
              <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                Matérias Prioritárias para Equilibrar o Mês
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Calculadas a partir das suas horas reais do mês{canAccessNotion ? ' e pendências do Notion até hoje' : ''}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {analysis.prioritySubjectsForNextWeek.map((p, idx) => {
              const isHigh = p.urgency?.toLowerCase().includes('alta') || p.urgency?.toLowerCase().includes('cr');
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    isHigh
                      ? isDark
                        ? 'bg-rose-950/15 border-rose-800/50'
                        : 'bg-rose-50/70 border-rose-200'
                      : subSurface
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {p.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                          isHigh
                            ? 'bg-rose-500 text-white'
                            : 'bg-[#0056D2]/15 text-[#0056D2] dark:text-sky-400 border border-[#0056D2]/25'
                        }`}
                      >
                        {isHigh ? 'Prioridade' : 'Equilibrar'}
                      </span>
                    </div>

                    {p.recommendedHours > 0 && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-[#0056D2] dark:text-sky-400 mb-2 tabular-nums">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Meta sugerida: {p.recommendedHours}h</span>
                      </div>
                    )}

                    <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {p.reason}
                    </p>
                  </div>

                  {p.topicsSuggested && p.topicsSuggested.length > 0 && (
                    <div className={`pt-2 border-t text-[11px] ${isDark ? 'border-slate-800/60' : 'border-slate-200'}`}>
                      <ul className="space-y-1">
                        {p.topicsSuggested.slice(0, 2).map((top, tIdx) => (
                          <li key={tIdx} className={`flex items-start gap-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            <span className="text-[#0056D2] dark:text-sky-400">•</span>
                            <span className="line-clamp-2">{top}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7-Day Action Plan */}
      {analysis?.weeklyActionPlan && analysis.weeklyActionPlan.length > 0 && (
        <div className={`p-5 sm:p-6 rounded-2xl border space-y-4 ${cardSurface}`}>
          <div className={`flex items-center justify-between gap-2 pb-3 border-b ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Plano Tático para os Próximos 7 Dias
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Baseado nas matérias reais da sua grade para compensar o saldo mensal.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {analysis.weeklyActionPlan.map((plan, idx) => (
              <div key={idx} className={`p-3 rounded-xl border flex flex-col justify-between ${subSurface}`}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#0056D2] dark:text-sky-400 mb-1 truncate">
                    {plan.day.split('-')[0]}
                  </p>
                  <p className={`text-xs font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {plan.focusSubject}
                  </p>
                  <p className={`text-[11px] mt-1.5 line-clamp-2 leading-tight ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {plan.goal}
                  </p>
                </div>

                <div className={`mt-3 pt-2 border-t flex items-center justify-between text-[10px] font-semibold tabular-nums ${isDark ? 'border-slate-800/60 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                  <span>Meta:</span>
                  <span className="text-[#0056D2] dark:text-sky-400 font-bold">
                    {plan.suggestedMinutes > 0
                      ? `${Number((plan.suggestedMinutes / 60).toFixed(1))}h`
                      : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(deleteTargetItem)}
        title="Excluir estudo do Notion"
        description={
          deleteTargetItem
            ? `Tem certeza que deseja excluir "${deleteTargetItem.assunto}" (${deleteTargetItem.materia}) das revisões do Notion? A página será arquivada na lixeira do Notion.`
            : undefined
        }
        badgeText={deleteTargetItem?.assunto}
        confirmLabel="Excluir do Notion"
        cancelLabel="Cancelar"
        isDestructive
        iconType="danger"
        theme={theme}
        loading={Boolean(deleteTargetItem && mutatingPageId === deleteTargetItem.id)}
        onConfirm={() => void handleConfirmDeleteNotionItem()}
        onClose={() => {
          if (!mutatingPageId) setDeleteTargetItem(null);
        }}
      />
    </div>
  );
};
