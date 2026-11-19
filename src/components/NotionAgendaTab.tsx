import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  RefreshCw,
  Plus,
  Check,
  Search,
  Calendar,
  X,
  ListFilter,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  AppTheme,
  NOTION_CYCLE_LABELS,
  NOTION_CYCLE_ORDER,
  NotionRevisionItem,
  RevisionCycleKey,
} from "../types";
import { NotionCalendar } from "./NotionCalendar";
import {
  fetchNotionRevisoes,
  checkinRevision,
  createNewStudy,
  getNotionConnectionStatus,
  subscribeNotionEvents,
} from "../services/notionService";
import { getNextPendingNotionCycle } from "../utils/notionRevisions";

interface NotionAgendaTabProps {
  theme: AppTheme;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

export const NotionAgendaTab: React.FC<NotionAgendaTabProps> = ({ theme, showToast }) => {
  const isDark = theme === "dark";

  const [items, setItems] = useState<NotionRevisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState<"notion_api" | "local_cache" | "unavailable">("local_cache");
  const [notionStatus, setNotionStatus] = useState<{
    isConfigured: boolean;
    hasApiKey?: boolean;
    hasDatabaseId?: boolean;
  }>({ isConfigured: false });

  const [viewMode, setViewMode] = useState<"CALENDAR" | "TABLE">("CALENDAR");

  // Filtros da visão de lista
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMateria, setFilterMateria] = useState<string>("TODAS");
  const [filterTab, setFilterTab] = useState<"APENAS_REVISAR" | "HOJE_ATRASADAS" | "TODAS" | "CONCLUIDAS">(
    "APENAS_REVISAR"
  );
  const [busyPageId, setBusyPageId] = useState<string | null>(null);

  // Modal Novo Estudo
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newAssunto, setNewAssunto] = useState("");
  const [newMateria, setNewMateria] = useState("Química");
  const [newData, setNewData] = useState(() => new Date().toISOString().split("T")[0]);
  const [newTipo, setNewTipo] = useState("Questões");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const loadData = useCallback(
    async (forceApi = false) => {
      if (forceApi) setIsSyncing(true);
      else setIsLoading(true);

      try {
        const [res, status] = await Promise.all([
          fetchNotionRevisoes(),
          getNotionConnectionStatus(),
        ]);
        setItems(res.items);
        setDataSource(res.source);
        setNotionStatus(status);
        if (forceApi) {
          showToast(
            res.source === "notion_api"
              ? "Agenda sincronizada com a API do Notion."
              : "Agenda atualizada via cache sincronizado.",
            "success"
          );
        }
      } catch {
        showToast("Não foi possível carregar as revisões do Notion.", "error");
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    let debounceTimer: number | null = null;
    const unsubscribe = subscribeNotionEvents(() => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        try {
          const res = await fetchNotionRevisoes();
          setItems(res.items);
          setDataSource(res.source);
        } catch {
          // Silent refresh failure
        }
      }, 350);
    });
    return () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, []);

  const handleItemUpdated = useCallback((updatedItem: NotionRevisionItem) => {
    setItems((prev) => prev.map((it) => (it.id === updatedItem.id ? updatedItem : it)));
  }, []);

  const handleToggleCheckbox = async (
    item: NotionRevisionItem,
    cycleKey: RevisionCycleKey,
    currentVal: boolean
  ) => {
    if (busyPageId) return;
    const nextVal = !currentVal;
    const label = NOTION_CYCLE_LABELS[cycleKey];

    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, [cycleKey]: nextVal } : it))
    );
    setBusyPageId(item.id);

    try {
      const res = await checkinRevision(item.id, cycleKey, nextVal);
      if (res.success) {
        if (res.item) {
          handleItemUpdated(res.item);
        }
        showToast(
          nextVal
            ? `Notion: '${label}' marcado em ${item.assunto}.`
            : `Notion: '${label}' desmarcado em ${item.assunto}.`,
          "success"
        );
      } else {
        throw new Error(res.error || "Falha ao atualizar Notion");
      }
    } catch {
      showToast("Não foi possível sincronizar o check com o Notion.", "error");
      void loadData(false);
    } finally {
      setBusyPageId(null);
    }
  };

  const handleCreateStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssunto.trim()) {
      showToast("Por favor, preencha o assunto estudado.", "info");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createNewStudy({
        assunto: newAssunto.trim(),
        materia: newMateria,
        data: newData,
        tipoRevisao: [newTipo],
      });

      if (res.success && res.item) {
        setItems((prev) => [res.item!, ...prev]);
        setIsNewModalOpen(false);
        setNewAssunto("");
        showToast("Novo estudo adicionado ao Notion.", "success");
      } else {
        showToast(res.error || "Erro ao registrar estudo.", "error");
      }
    } catch {
      showToast("Falha ao salvar estudo.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const materiasList = useMemo(() => {
    const setM = new Set<string>();
    items.forEach((it) => {
      if (it.materia) setM.add(it.materia);
    });
    return Array.from(setM).sort();
  }, [items]);

  const getRevisionUrgency = (
    item: NotionRevisionItem
  ): { status: "hoje" | "atrasada" | "futura" | "concluida"; label: string; badgeClass: string } => {
    const nextCycle = getNextPendingNotionCycle(item);
    if (!nextCycle) {
      return {
        status: "concluida",
        label: "Concluída",
        badgeClass: isDark
          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
          : "bg-emerald-50 text-emerald-800 border-emerald-200",
      };
    }
    if (!item.proximaRevisao) {
      return {
        status: "futura",
        label: NOTION_CYCLE_LABELS[nextCycle],
        badgeClass: isDark
          ? "bg-white/[0.06] text-white/75 border-white/[0.1]"
          : "bg-[#f1f1ef] text-[#37352f] border-[#e6e6e3]",
      };
    }
    if (item.proximaRevisao === todayStr) {
      return {
        status: "hoje",
        label: "Hoje",
        badgeClass: isDark
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-amber-50 text-amber-800 border-amber-300",
      };
    }
    if (item.proximaRevisao < todayStr) {
      return {
        status: "atrasada",
        label: "Atrasada",
        badgeClass: isDark
          ? "bg-[#eb5757]/15 text-[#ff8f85] border-[#eb5757]/40"
          : "bg-[#fdeceb] text-[#b42c24] border-[#eb5757]/40",
      };
    }
    return {
      status: "futura",
      label: "Programada",
      badgeClass: isDark
        ? "bg-white/[0.05] text-white/70 border-white/[0.1]"
        : "bg-[#f7f7f5] text-[#37352f]/80 border-[#e6e6e3]",
    };
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (
        q &&
        !item.assunto.toLowerCase().includes(q) &&
        !item.materia.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (filterMateria !== "TODAS" && item.materia !== filterMateria) {
        return false;
      }
      const nextCycle = getNextPendingNotionCycle(item);
      const isCompleted = !nextCycle;
      if (filterTab === "APENAS_REVISAR") return !isCompleted;
      if (filterTab === "HOJE_ATRASADAS") {
        return !isCompleted && Boolean(item.proximaRevisao) && item.proximaRevisao! <= todayStr;
      }
      if (filterTab === "CONCLUIDAS") return isCompleted;
      return true;
    });
  }, [items, searchQuery, filterMateria, filterTab, todayStr]);

  const stats = useMemo(() => {
    const total = items.length;
    let atrasadasOuHoje = 0;
    let concluidas = 0;
    let pendentes = 0;

    items.forEach((it) => {
      const nextCycle = getNextPendingNotionCycle(it);
      if (!nextCycle) {
        concluidas++;
      } else {
        pendentes++;
        if (it.proximaRevisao && it.proximaRevisao <= todayStr) {
          atrasadasOuHoje++;
        }
      }
    });

    return { total, atrasadasOuHoje, concluidas, pendentes };
  }, [items, todayStr]);

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "—";
    const parts = dateStr.slice(0, 10).split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const surfaceBar = isDark
    ? "bg-[#202020] border-white/[0.08] text-[#e6e6e4]"
    : "bg-white border-[#e6e6e3] text-[#37352f]";
  const hairline = isDark ? "border-white/[0.07]" : "border-[#ececeb]";

  return (
    <div className="w-full flex-1 flex flex-col min-h-[calc(100dvh-65px)]">
      {/* Barra compacta estilo Notion ocupando 100% da largura */}
      <div className={`px-4 py-2.5 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 ${surfaceBar}`}>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">📕</span>
            <h1 className="text-sm sm:text-base font-semibold tracking-tight">Revisões Notion</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                dataSource === "unavailable" && !notionStatus.isConfigured
                  ? isDark
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                  : isDark
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === "unavailable" && !notionStatus.isConfigured
                    ? "bg-amber-400"
                    : "bg-emerald-400"
                }`}
              />
              {dataSource === "unavailable" && !notionStatus.isConfigured
                ? "Desconectado"
                : dataSource === "notion_api"
                ? "Conectado"
                : "Sincronizado"}
            </span>
          </div>

          <span className={`hidden sm:inline-block h-4 w-px ${isDark ? "bg-white/[0.08]" : "bg-[#e6e6e3]"}`} />

          {/* Métricas discretas em linha */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span
              className={`px-2 py-0.5 rounded-md tabular-nums ${
                stats.atrasadasOuHoje > 0
                  ? isDark
                    ? "bg-[#eb5757]/15 text-[#ff8f85] font-medium"
                    : "bg-[#fdeceb] text-[#b42c24] font-medium"
                  : isDark
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {stats.atrasadasOuHoje} até hoje
            </span>
            <span className={isDark ? "text-white/55 tabular-nums" : "text-[#37352f]/65 tabular-nums"}>
              {stats.pendentes} em ciclo
            </span>
            <span className={isDark ? "text-white/40 tabular-nums" : "text-[#37352f]/45 tabular-nums"}>
              • {stats.concluidas} dominadas ({stats.total} total)
            </span>
          </div>
        </div>

        {/* Seletor Calendário / Lista + Sincronizar + Novo Estudo */}
        <div className="flex items-center gap-2 flex-wrap self-end lg:self-center">
          <div
            className={`inline-flex items-center p-0.5 rounded-lg border ${
              isDark ? "bg-[#191919] border-white/[0.08]" : "bg-[#f1f1ef] border-[#e6e6e3]"
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode("CALENDAR")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "CALENDAR"
                  ? isDark
                    ? "bg-white/[0.11] text-white"
                    : "bg-white text-[#37352f] shadow-2xs"
                  : isDark
                  ? "text-white/55 hover:text-white"
                  : "text-[#37352f]/65 hover:text-[#37352f]"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendário</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "TABLE"
                  ? isDark
                    ? "bg-white/[0.11] text-white"
                    : "bg-white text-[#37352f] shadow-2xs"
                  : isDark
                  ? "text-white/55 hover:text-white"
                  : "text-[#37352f]/65 hover:text-[#37352f]"
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={isSyncing}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
              isDark
                ? "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-white/75"
                : "bg-white hover:bg-[#f1f1ef] border-[#dfdfdc] text-[#37352f]"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewData(todayStr);
              setIsNewModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#eb5757] hover:bg-[#d94848] transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo estudo</span>
          </button>
        </div>
      </div>

      {/* Aviso se não configurado */}
      {dataSource === "unavailable" && !isLoading && items.length === 0 && (
        <div
          className={`mx-4 my-2 px-4 py-3 rounded-xl border flex items-center gap-2.5 text-xs ${
            isDark
              ? "bg-amber-950/20 border-amber-800/40 text-amber-300"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {notionStatus.isConfigured
              ? "Não foi possível ler sua base do Notion no momento. Verifique se a base 📕 Revisões está compartilhada com sua integração."
              : "Integração do Notion não configurada no servidor (NOTION_API_KEY / NOTION_DATABASE_ID)."}
          </span>
        </div>
      )}

      {/* Conteúdo principal: Calendário Notion ou Lista Notion */}
      {viewMode === "CALENDAR" ? (
        <NotionCalendar
          theme={theme}
          showToast={showToast}
          externalItems={items}
          externalLoading={isLoading}
          externalSyncing={isSyncing}
          onExternalSync={() => void loadData(true)}
          onExternalItemUpdated={handleItemUpdated}
          onQuickCreate={(dateStr) => {
            if (dateStr) setNewData(dateStr);
            setIsNewModalOpen(true);
          }}
        />
      ) : (
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            isDark
              ? "bg-[#191919] text-[#e6e6e4]"
              : "bg-white text-[#37352f]"
          }`}
        >
          {/* Filtros limpos */}
          <div className={`px-4 py-3 border-b flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 ${hairline} ${isDark ? "bg-[#202020]" : "bg-[#fbfbfa]"}`}>
            <div
              className={`inline-flex items-center gap-1 p-0.5 rounded-lg border overflow-x-auto ${
                isDark ? "bg-[#191919] border-white/[0.08]" : "bg-[#f1f1ef] border-[#e6e6e3]"
              }`}
            >
              {(
                [
                  { id: "APENAS_REVISAR", label: `Em ciclo (${stats.pendentes})` },
                  { id: "HOJE_ATRASADAS", label: `Até hoje (${stats.atrasadasOuHoje})` },
                  { id: "TODAS", label: `Todas (${stats.total})` },
                  { id: "CONCLUIDAS", label: `Concluídas (${stats.concluidas})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    filterTab === tab.id
                      ? isDark
                        ? "bg-white/[0.11] text-white"
                        : "bg-white text-[#37352f] shadow-2xs"
                      : isDark
                      ? "text-white/55 hover:text-white"
                      : "text-[#37352f]/65 hover:text-[#37352f]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 md:w-56">
                <Search
                  className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 ${
                    isDark ? "text-white/35" : "text-[#37352f]/40"
                  }`}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar assunto..."
                  className={`w-full pl-8 pr-3 py-1 text-xs rounded-md border focus:outline-none ${
                    isDark
                      ? "bg-[#191919] border-white/[0.08] text-[#e6e6e4] placeholder-white/35"
                      : "bg-white border-[#dfdfdc] text-[#37352f] placeholder-[#37352f]/40"
                  }`}
                />
              </div>

              <select
                value={filterMateria}
                onChange={(e) => setFilterMateria(e.target.value)}
                className={`px-2.5 py-1 text-xs rounded-md border focus:outline-none cursor-pointer ${
                  isDark
                    ? "bg-[#191919] border-white/[0.08] text-[#e6e6e4]"
                    : "bg-white border-[#dfdfdc] text-[#37352f]"
                }`}
              >
                <option value="TODAS">Todas as matérias</option>
                {materiasList.map((mat) => (
                  <option key={mat} value={mat}>
                    {mat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabela estilo Notion Database */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b ${hairline} ${isDark ? "text-white/45" : "text-[#37352f]/60"}`}>
                  <th className="py-2.5 px-4 font-medium min-w-[210px]">Assunto</th>
                  <th className="py-2.5 px-3 font-medium min-w-[120px]">Matéria</th>
                  <th className="py-2.5 px-3 font-medium min-w-[95px]">Data</th>
                  <th className="py-2.5 px-3 font-medium min-w-[140px]">Próxima Revisão</th>
                  <th className="py-2.5 px-3 font-medium min-w-[160px]">Próximo Ciclo</th>
                  <th className="py-2.5 px-3 font-medium text-center w-28">Ciclos</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-white/[0.05]" : "divide-[#ececeb]"}`}>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`py-12 text-center ${isDark ? "text-white/45" : "text-[#37352f]/55"}`}>
                      Nenhum item encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const urgency = getRevisionUrgency(item);
                    const nextCycle = getNextPendingNotionCycle(item);
                    const completedCount = NOTION_CYCLE_ORDER.filter((k) => Boolean(item[k])).length;
                    const totalCycles = NOTION_CYCLE_ORDER.length;
                    const progressPct = Math.round((completedCount / totalCycles) * 100);
                    const isBusy = busyPageId === item.id;

                    return (
                      <tr
                        key={item.id}
                        className={isDark ? "hover:bg-white/[0.025]" : "hover:bg-[#fafaf9]"}
                      >
                        <td className="py-2.5 px-4 font-medium">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{item.assunto}</span>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className={`shrink-0 opacity-40 hover:opacity-100`}
                                title="Abrir página no Notion"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                              isDark ? "bg-white/[0.06] text-white/80" : "bg-[#f1f1ef] text-[#37352f]"
                            }`}
                          >
                            {item.materia}
                          </span>
                        </td>

                        <td className={`py-2.5 px-3 whitespace-nowrap tabular-nums ${isDark ? "text-white/60" : "text-[#37352f]/70"}`}>
                          {formatDateDisplay(item.data)}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border tabular-nums ${urgency.badgeClass}`}
                          >
                            <span>{formatDateDisplay(item.proximaRevisao)}</span>
                            <span className="opacity-75">• {urgency.label}</span>
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {nextCycle ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleCheckbox(item, nextCycle, false)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-50 ${
                                isDark
                                  ? "bg-[#eb5757]/15 hover:bg-[#eb5757]/25 border-[#eb5757]/40 text-[#ff9f96]"
                                  : "bg-[#fdeceb] hover:bg-[#fad5d2] border-[#eb5757]/40 text-[#b42c24]"
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              <span>Marcar {NOTION_CYCLE_LABELS[nextCycle]}</span>
                            </button>
                          ) : (
                            <span className={isDark ? "text-emerald-400 text-[11px]" : "text-emerald-700 text-[11px]"}>
                              100% concluído
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center gap-1.5 justify-center">
                            <div className={`w-12 rounded-full h-1.5 overflow-hidden ${isDark ? "bg-white/[0.08]" : "bg-[#e6e6e3]"}`}>
                              <div
                                className={`h-full transition-all ${
                                  progressPct === 100 ? "bg-emerald-500" : "bg-[#eb5757]"
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className={`text-[11px] tabular-nums ${isDark ? "text-white/55" : "text-[#37352f]/65"}`}>
                              {completedCount}/{totalCycles}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Criação de Novo Estudo (Estilo Notion) */}
      {isNewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setIsNewModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-xl border p-5 shadow-2xl ${
              isDark
                ? "bg-[#202020] border-white/[0.1] text-[#e6e6e4]"
                : "bg-white border-[#dfdfdc] text-[#37352f]"
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${hairline}`}>
              <div className="flex items-center gap-2">
                <span>📕</span>
                <h3 className="font-semibold text-sm">Novo estudo no Notion</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className={`p-1 rounded-md cursor-pointer ${
                  isDark ? "text-white/50 hover:text-white hover:bg-white/[0.08]" : "text-[#37352f]/60 hover:bg-black/[0.05]"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStudy} className="space-y-3.5 pt-4">
              <div>
                <label className="block text-xs font-medium mb-1 opacity-80">
                  Assunto / Conteúdo *
                </label>
                <input
                  type="text"
                  required
                  value={newAssunto}
                  onChange={(e) => setNewAssunto(e.target.value)}
                  placeholder="Ex: Taxonomia, Guerra Fria, Logaritmo..."
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                    isDark
                      ? "bg-[#191919] border-white/[0.1] text-white placeholder-white/30"
                      : "bg-white border-[#dfdfdc] text-[#37352f]"
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Matéria *</label>
                  <select
                    value={newMateria}
                    onChange={(e) => setNewMateria(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#191919] border-white/[0.1] text-white"
                        : "bg-white border-[#dfdfdc] text-[#37352f]"
                    }`}
                  >
                    <option value="Química">Química</option>
                    <option value="Português">Português</option>
                    <option value="História">História</option>
                    <option value="Matemática I">Matemática I</option>
                    <option value="Matemática II">Matemática II</option>
                    <option value="Matemática III">Matemática III</option>
                    <option value="Física I">Física I</option>
                    <option value="Fisica II">Fisica II</option>
                    <option value="Geografia">Geografia</option>
                    <option value="Biologia">Biologia</option>
                    <option value="Inglês">Inglês</option>
                    <option value="Redação">Redação</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 opacity-80">Data do estudo *</label>
                  <input
                    type="date"
                    required
                    value={newData}
                    onChange={(e) => setNewData(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#191919] border-white/[0.1] text-white"
                        : "bg-white border-[#dfdfdc] text-[#37352f]"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 opacity-80">Tipo de revisão</label>
                <select
                  value={newTipo}
                  onChange={(e) => setNewTipo(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                    isDark
                      ? "bg-[#191919] border-white/[0.1] text-white"
                      : "bg-white border-[#dfdfdc] text-[#37352f]"
                  }`}
                >
                  <option value="Questões">Questões</option>
                  <option value="LDI">LDI</option>
                  <option value="Pestana">Pestana</option>
                  <option value="Apostila">Apostila</option>
                  <option value="PDF">PDF</option>
                  <option value="Flashcards">Flashcards</option>
                  <option value="Bizus">Bizus</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    isDark
                      ? "border-white/[0.1] text-white/65 hover:text-white"
                      : "border-[#dfdfdc] text-[#37352f]/70 hover:text-[#37352f]"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium text-white bg-[#eb5757] hover:bg-[#d94848] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Salvando..." : "Salvar no Notion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
