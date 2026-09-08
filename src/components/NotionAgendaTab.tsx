import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  Circle,
  RefreshCw,
  Plus,
  Clock,
  BookOpen,
  Filter,
  Check,
  AlertCircle,
  Flame,
  Search,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Calendar,
  X,
  Layers,
} from "lucide-react";
import { AppTheme, NotionRevisionItem, RevisionCycleKey } from "../types";
import { NotionCalendar } from "./NotionCalendar";
import {
  fetchNotionRevisoes,
  checkinRevision,
  createNewStudy,
  getSubjectColor,
  getNotionConnectionStatus,
  addDays,
} from "../services/notionService";

interface NotionAgendaTabProps {
  theme: AppTheme;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

// Estilo de tags para tipos de revisão do Notion
const TIPO_REVISAO_STYLES: Record<string, string> = {
  Questões: "bg-amber-950/60 text-amber-300 border-amber-800/60",
  LDI: "bg-sky-950/60 text-sky-300 border-sky-800/60",
  Pestana: "bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-800/60",
  Apostila: "bg-orange-950/60 text-orange-300 border-orange-800/60",
  PDF: "bg-blue-950/60 text-blue-300 border-blue-800/60",
  Qcon: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
  Teoria: "bg-purple-950/60 text-purple-300 border-purple-800/60",
  Default: "bg-slate-800/60 text-slate-300 border-slate-700/60",
};

export const NotionAgendaTab: React.FC<NotionAgendaTabProps> = ({ theme, showToast }) => {
  const isDark = theme === "dark";

  // Dados e estado
  const [items, setItems] = useState<NotionRevisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState<"notion_api" | "local_cache">("local_cache");
  const [notionStatus, setNotionStatus] = useState<{ isConfigured: boolean; hasApiKey?: boolean }>({
    isConfigured: false,
  });

  // Modo de Visualização (Calendário Tático vs Tabela Oficial)
  const [viewMode, setViewMode] = useState<"CALENDAR" | "TABLE">("CALENDAR");

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMateria, setFilterMateria] = useState<string>("TODAS");
  const [filterTab, setFilterTab] = useState<"APENAS_REVISAR" | "HOJE_ATRASADAS" | "TODAS" | "CONCLUIDAS">(
    "APENAS_REVISAR"
  );

  // Modal Novo Estudo
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newAssunto, setNewAssunto] = useState("");
  const [newMateria, setNewMateria] = useState("Química");
  const [newData, setNewData] = useState(() => new Date().toISOString().split("T")[0]);
  const [newTipo, setNewTipo] = useState("Questões");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data de referência de Hoje (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  // Carrega status e revisões
  useEffect(() => {
    loadData();
    getNotionConnectionStatus().then(setNotionStatus);
  }, []);

  const loadData = async (forceApi = false) => {
    if (forceApi) setIsSyncing(true);
    else setIsLoading(true);

    try {
      const res = await fetchNotionRevisoes();
      setItems(res.items);
      setDataSource(res.source);
      if (forceApi) {
        showToast(
          res.source === "notion_api"
            ? "Caderno sincronizado diretamente com a API do Notion!"
            : "Caderno atualizado com sucesso via cache sincronizado.",
          "success"
        );
      }
    } catch (e: any) {
      showToast("Não foi possível carregar as revisões do Notion.", "error");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // Check-in / Toggle direto de checkbox do Notion
  const handleToggleCheckbox = async (
    item: NotionRevisionItem,
    cycleKey: RevisionCycleKey,
    currentVal: boolean
  ) => {
    const nextVal = !currentVal;

    // Atualização otimista imediata no estado local
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== item.id) return it;
        const updated = { ...it, [cycleKey]: nextVal };

        // Recálculo da Próxima Revisão
        if (!updated.semana) {
          updated.proximaRevisao = addDays(updated.data, 7);
        } else if (!updated.mes1) {
          updated.proximaRevisao = addDays(updated.data, 37);
        } else if (!updated.mes2) {
          updated.proximaRevisao = addDays(updated.data, 97);
        } else if (!updated.mes3) {
          updated.proximaRevisao = addDays(updated.data, 127);
        } else {
          updated.proximaRevisao = undefined;
        }

        return updated;
      })
    );

    const cycleLabelMap: Record<RevisionCycleKey, string> = {
      semana: "Semana (7D)",
      mes1: "Mês 1 (30D)",
      mes2: "Mês 2 (60D)",
      mes3: "Mês 3 (90D)",
    };

    // Chamada à API
    const res = await checkinRevision(item.id, cycleKey, nextVal);
    if (res.success) {
      showToast(
        nextVal
          ? `Notion: marcado '${cycleLabelMap[cycleKey]}' para ${item.assunto}!`
          : `Notion: desmarcado '${cycleLabelMap[cycleKey]}' de ${item.assunto}.`,
        "success"
      );
    } else {
      showToast("Não foi possível sincronizar o check com o Notion.", "error");
      loadData();
    }
  };

  // Cadastrar novo estudo
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
        showToast(`Novo estudo adicionado ao Notion com sucesso!`, "success");
      } else {
        showToast(res.error || "Erro ao registrar estudo.", "error");
      }
    } catch {
      showToast("Falha ao salvar estudo.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Obter disciplinas únicas para o filtro
  const materiasList = useMemo(() => {
    const setM = new Set<string>();
    items.forEach((it) => {
      if (it.materia) setM.add(it.materia);
    });
    return Array.from(setM).sort();
  }, [items]);

  // Auxiliar: Determina qual é o próximo ciclo pendente de uma matéria
  const getPendingCycleInfo = (item: NotionRevisionItem): {
    cycleKey: RevisionCycleKey | null;
    label: string;
    isCompleted: boolean;
  } => {
    if (!item.semana) return { cycleKey: "semana", label: "Semana (7D)", isCompleted: false };
    if (!item.mes1) return { cycleKey: "mes1", label: "Mês 1 (30D)", isCompleted: false };
    if (!item.mes2) return { cycleKey: "mes2", label: "Mês 2 (60D)", isCompleted: false };
    if (!item.mes3) return { cycleKey: "mes3", label: "Mês 3 (90D)", isCompleted: false };
    return { cycleKey: null, label: "Concluído", isCompleted: true };
  };

  // Auxiliar: Determina o status da Próxima Revisão em relação à data atual com alto contraste
  const getRevisionUrgency = (
    item: NotionRevisionItem
  ): { status: "hoje" | "atrasada" | "futura" | "concluida"; label: string; colorClass: string } => {
    const { isCompleted } = getPendingCycleInfo(item);
    if (isCompleted || !item.proximaRevisao) {
      return {
        status: "concluida",
        label: "Ciclo Concluído",
        colorClass: isDark
          ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/50"
          : "text-emerald-950 bg-emerald-100 border-emerald-400 font-bold",
      };
    }

    if (item.proximaRevisao === todayStr) {
      return {
        status: "hoje",
        label: "Revisar Hoje!",
        colorClass: isDark
          ? "text-amber-400 bg-amber-950/50 border-amber-800/60 font-bold"
          : "text-amber-950 bg-amber-100 border-amber-400 font-black",
      };
    }
    if (item.proximaRevisao < todayStr) {
      return {
        status: "atrasada",
        label: "Revisão Atrasada",
        colorClass: isDark
          ? "text-rose-400 bg-rose-950/50 border-rose-800/60 font-bold"
          : "text-rose-950 bg-rose-100 border-rose-400 font-black",
      };
    }
    return {
      status: "futura",
      label: "Programada",
      colorClass: isDark
        ? "text-slate-300 bg-slate-800/50 border-slate-700/50 font-medium"
        : "text-slate-950 bg-slate-100 border-slate-400 font-bold",
    };
  };

  // Badges de matérias com contraste garantido no modo claro (letras pretas/escuras) e escuro (letras claras)
  const getSubjectBadgeStyle = (materia: string, isDarkTheme: boolean, defaultBadge: string) => {
    if (isDarkTheme) return defaultBadge;
    if (materia.includes("Química")) return "bg-rose-100 text-rose-950 border-rose-400 font-black";
    if (materia.includes("Português") || materia.includes("Língua")) return "bg-amber-100 text-amber-950 border-amber-400 font-black";
    if (materia.includes("História")) return "bg-emerald-100 text-emerald-950 border-emerald-400 font-black";
    if (materia.includes("Física")) return "bg-violet-100 text-violet-950 border-violet-400 font-black";
    if (materia.includes("Matemática")) return "bg-indigo-100 text-indigo-950 border-indigo-400 font-black";
    if (materia.includes("Biologia")) return "bg-teal-100 text-teal-950 border-teal-400 font-black";
    if (materia.includes("Geografia")) return "bg-sky-100 text-sky-950 border-sky-400 font-black";
    if (materia.includes("Redação")) return "bg-orange-100 text-orange-950 border-orange-400 font-black";
    return "bg-slate-100 text-slate-950 border-slate-400 font-black";
  };

  // Badges de tipos de revisão com contraste total em ambos os modos
  const getTipoRevisaoStyle = (tipo: string, isDarkTheme: boolean) => {
    if (isDarkTheme) return TIPO_REVISAO_STYLES[tipo] || TIPO_REVISAO_STYLES.Default;
    switch (tipo) {
      case "Questões": return "bg-amber-100 text-amber-950 border-amber-400 font-black";
      case "LDI": return "bg-sky-100 text-sky-950 border-sky-400 font-black";
      case "Pestana": return "bg-fuchsia-100 text-fuchsia-950 border-fuchsia-400 font-black";
      case "Apostila": return "bg-orange-100 text-orange-950 border-orange-400 font-black";
      case "PDF": return "bg-blue-100 text-blue-950 border-blue-400 font-black";
      case "Qcon": return "bg-emerald-100 text-emerald-950 border-emerald-400 font-black";
      case "Teoria": return "bg-purple-100 text-purple-950 border-purple-400 font-black";
      default: return "bg-slate-100 text-slate-950 border-slate-400 font-black";
    }
  };

  // Matérias que TÊM que revisar (Atrasadas ou Hoje ou Pendentes)
  const dueItems = useMemo(() => {
    return items.filter((item) => {
      const { isCompleted } = getPendingCycleInfo(item);
      if (isCompleted) return false;
      if (!item.proximaRevisao) return true;
      // Itens cuja revisão já venceu ou vence hoje
      return item.proximaRevisao <= todayStr;
    });
  }, [items, todayStr]);

  // Itens filtrados para a tabela principal
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesAssunto = item.assunto.toLowerCase().includes(q);
        const matchesMateria = item.materia.toLowerCase().includes(q);
        if (!matchesAssunto && !matchesMateria) return false;
      }

      // 2. Filtro por matéria
      if (filterMateria !== "TODAS" && item.materia !== filterMateria) {
        return false;
      }

      // 3. Filtro por aba
      const { isCompleted } = getPendingCycleInfo(item);
      if (filterTab === "APENAS_REVISAR") {
        return !isCompleted;
      }
      if (filterTab === "HOJE_ATRASADAS") {
        return !isCompleted && item.proximaRevisao && item.proximaRevisao <= todayStr;
      }
      if (filterTab === "CONCLUIDAS") {
        return isCompleted;
      }

      return true; // TODAS
    });
  }, [items, searchQuery, filterMateria, filterTab, todayStr]);

  // Estatísticas do Caderno
  const stats = useMemo(() => {
    const total = items.length;
    let atrasadasOuHoje = 0;
    let concluidas = 0;
    let pendentes = 0;

    items.forEach((it) => {
      const { isCompleted } = getPendingCycleInfo(it);
      if (isCompleted) {
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

  // Formatação amigável de data
  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return "-";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-6 space-y-6">
      {/* 1. Header do Caderno com Status Notion e KPIs */}
      <div
        className={`p-5 rounded-2xl border backdrop-blur-md shadow-xl transition-all ${
          isDark ? "bg-[#0B1528]/80 border-slate-800" : "bg-white border-slate-200 shadow-slate-100"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-rose-950/40 font-bold text-xl">
              📕
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`text-lg sm:text-xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  Revisões Notion • CFO CBMERJ
                </h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {dataSource === "notion_api" ? "Notion API Conectado" : "Sincronizado com Notion"}
                </span>
              </div>
              <p className={`text-xs mt-1 max-w-2xl ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Espelho fiel da sua base <strong className="text-white">📕 Revisões</strong>. Marque as caixas de{" "}
                <strong className="text-emerald-400">Semana</strong>, <strong className="text-blue-400">Mês 1</strong>,{" "}
                <strong className="text-purple-400">Mês 2</strong> e <strong className="text-amber-400">Mês 3</strong> diretamente
                aqui pelo site.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
            <button
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDark
                  ? "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
              title="Atualizar dados do Notion"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-blue-400" : ""}`} />
              <span>{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
            </button>

            <button
              onClick={() => setIsNewModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] shadow-md shadow-blue-950/40 border border-blue-400/30 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Novo Estudo</span>
            </button>
          </div>
        </div>

        {/* Linha de KPIs Rápidos */}
        <div className={`grid grid-cols-1 min-[390px]:grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t ${isDark ? "border-slate-800/60" : "border-slate-200"}`}>
          <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-900/50 border-slate-800/80" : "bg-white border-slate-300 shadow-xs"}`}>
            <span className={`text-[11px] font-medium block ${isDark ? "text-slate-400" : "text-slate-700 font-semibold"}`}>Total no Caderno</span>
            <span className={`text-xl font-extrabold mt-0.5 block ${isDark ? "text-white" : "text-black font-black"}`}>{stats.total} matérias</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? "bg-rose-950/30 border-rose-900/40" : "bg-rose-50 border-rose-300 shadow-xs"}`}>
            <span className={`text-[11px] font-medium block ${isDark ? "text-rose-400" : "text-rose-800 font-bold"}`}>Para Revisar Agora / Hoje</span>
            <span className={`text-xl font-extrabold mt-0.5 block ${isDark ? "text-rose-300" : "text-rose-950 font-black"}`}>{stats.atrasadasOuHoje} pendentes</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? "bg-blue-950/30 border-blue-900/40" : "bg-blue-50 border-blue-300 shadow-xs"}`}>
            <span className={`text-[11px] font-medium block ${isDark ? "text-blue-400" : "text-blue-800 font-bold"}`}>Em Ciclo de Revisão</span>
            <span className={`text-xl font-extrabold mt-0.5 block ${isDark ? "text-blue-300" : "text-blue-950 font-black"}`}>{stats.pendentes} em andamento</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? "bg-emerald-950/30 border-emerald-900/40" : "bg-emerald-50 border-emerald-300 shadow-xs"}`}>
            <span className={`text-[11px] font-medium block ${isDark ? "text-emerald-400" : "text-emerald-800 font-bold"}`}>Ciclo 100% Concluído</span>
            <span className={`text-xl font-extrabold mt-0.5 block ${isDark ? "text-emerald-300" : "text-emerald-950 font-black"}`}>{stats.concluidas} dominadas</span>
          </div>
        </div>

        {/* Seletor de Modo de Visualização: Calendário Tático vs Tabela Oficial */}
        <div className={`flex items-center justify-between border-t mt-4 pt-3.5 flex-wrap gap-2 ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
          <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${isDark ? "bg-black/60 border-slate-800" : "bg-slate-100 border-slate-300"}`}>
            <button
              type="button"
              onClick={() => setViewMode("CALENDAR")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                viewMode === "CALENDAR"
                  ? "bg-green-600 text-black shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-700 hover:text-black font-semibold"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendário Tático ("Os Verdinhos")</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                viewMode === "TABLE"
                  ? "bg-[#0056D2] text-white shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-slate-700 hover:text-black font-semibold"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tabela Oficial ("📕 Revisões")</span>
            </button>
          </div>
        </div>
      </div>

      {/* Renderização Condicional: Calendário Tático vs Tabela Oficial */}
      {viewMode === "CALENDAR" ? (
        <NotionCalendar theme={theme} showToast={showToast} />
      ) : (
        <>
          {/* 2. Seção Tática: "Matérias que você tem para revisar agora" */}
          {dueItems.length > 0 && (
            <div
              className={`p-5 rounded-2xl border backdrop-blur-md shadow-xl transition-all ${
                isDark
                  ? "bg-[#0f172a]/90 border-rose-900/40 shadow-rose-950/10"
                  : "bg-white border-rose-300 shadow-sm"
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                  <h2
                    className={`text-sm font-extrabold tracking-wide uppercase ${
                      isDark ? "text-rose-400" : "text-rose-950 font-black"
                    }`}
                  >
                    Matérias do Dia Para Revisar (Notion)
                  </h2>
                </div>
                <span
                  className={`text-xs ${
                    isDark ? "text-slate-400 font-semibold" : "text-black font-black"
                  }`}
                >
                  {dueItems.length} {dueItems.length === 1 ? "revisão pendente" : "revisões pendentes"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {dueItems.map((item) => {
                  const pendingCycle = getPendingCycleInfo(item);
                  const urgency = getRevisionUrgency(item);
                  const subjColor = getSubjectColor(item.materia);

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                        isDark
                          ? "bg-[#111827] border-slate-800 hover:border-slate-700"
                          : "bg-white border-slate-300 hover:border-slate-400 shadow-md"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase border ${getSubjectBadgeStyle(
                              item.materia,
                              isDark,
                              subjColor.badgeBg
                            )}`}
                          >
                            {item.materia}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] border ${urgency.colorClass}`}
                          >
                            {urgency.label} ({formatDateDisplay(item.proximaRevisao)})
                          </span>
                        </div>

                        {/* Assunto: PRETO no modo claro, BRANCO no modo escuro */}
                        <h3
                          className={`text-sm font-bold line-clamp-2 leading-snug ${
                            isDark ? "text-white" : "text-black font-black"
                          }`}
                        >
                          {item.assunto}
                        </h3>

                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {item.tipoRevisao.map((tipo) => (
                            <span
                              key={tipo}
                              className={`text-[9.5px] px-1.5 py-0.2 rounded border font-medium ${getTipoRevisaoStyle(
                                tipo,
                                isDark
                              )}`}
                            >
                              {tipo}
                            </span>
                          ))}
                          <span
                            className={`text-[10px] ml-auto font-medium ${
                              isDark ? "text-slate-400" : "text-black font-bold"
                            }`}
                          >
                            Estudado em {formatDateDisplay(item.data)}
                          </span>
                        </div>
                      </div>

                      {/* 4 Caixas Interativas do Notion */}
                      <div
                        className={`pt-2 border-t ${
                          isDark ? "border-slate-800/80" : "border-slate-200"
                        }`}
                      >
                        <span
                          className={`text-[10px] uppercase tracking-wider block mb-1.5 ${
                            isDark ? "text-slate-400 font-bold" : "text-black font-black"
                          }`}
                        >
                          Marcar no Notion:
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { key: "semana" as RevisionCycleKey, label: "Semana", checked: item.semana },
                            { key: "mes1" as RevisionCycleKey, label: "Mês 1", checked: item.mes1 },
                            { key: "mes2" as RevisionCycleKey, label: "Mês 2", checked: item.mes2 },
                            { key: "mes3" as RevisionCycleKey, label: "Mês 3", checked: item.mes3 },
                          ].map((box) => (
                            <button
                              key={box.key}
                              type="button"
                              onClick={() => handleToggleCheckbox(item, box.key, box.checked)}
                              className={`py-1.5 px-1 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                box.checked
                                  ? isDark
                                    ? "bg-blue-600/30 border-blue-500/60 text-blue-300 font-bold"
                                    : "bg-blue-100 border-blue-600 text-blue-950 font-black shadow-xs"
                                  : pendingCycle.cycleKey === box.key
                                  ? isDark
                                    ? "bg-rose-950/40 border-rose-500/60 text-rose-300 font-semibold hover:bg-rose-900/40 animate-pulse"
                                    : "bg-rose-100 border-rose-600 text-rose-950 font-black hover:bg-rose-200 animate-pulse shadow-xs"
                                  : isDark
                                  ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                                  : "bg-slate-50 border-slate-400 text-black font-bold hover:bg-slate-100 shadow-2xs"
                              }`}
                              title={`Clique para marcar/desmarcar '${box.label}' no Notion`}
                            >
                              {box.checked ? (
                                <CheckSquare
                                  className={`w-4 h-4 ${
                                    isDark ? "text-blue-400" : "text-blue-900"
                                  }`}
                                />
                              ) : (
                                <Square
                                  className={`w-4 h-4 ${
                                    isDark ? "opacity-60" : "text-slate-700"
                                  }`}
                                />
                              )}
                              <span
                                className={`text-[9.5px] truncate w-full ${
                                  isDark ? "text-inherit" : "text-black font-black"
                                }`}
                              >
                                {box.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

      {/* 3. Tabela Oficial de Revisões (Espelho da base Notion) */}
      <div
        className={`p-5 rounded-2xl border backdrop-blur-md shadow-xl transition-all ${
          isDark ? "bg-[#0B1528]/90 border-slate-800" : "bg-white border-slate-200 shadow-slate-100"
        }`}
      >
        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-5">
          {/* Abas de Filtro */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border overflow-x-auto ${
              isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-100 border-slate-300"
            }`}
          >
            <button
              onClick={() => setFilterTab("APENAS_REVISAR")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterTab === "APENAS_REVISAR"
                  ? "bg-[#0056D2] text-white shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-black hover:text-blue-700"
              }`}
            >
              🔥 O que Tem que Revisar ({stats.pendentes})
            </button>
            <button
              onClick={() => setFilterTab("HOJE_ATRASADAS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterTab === "HOJE_ATRASADAS"
                  ? "bg-rose-600 text-white shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-rose-400"
                  : "text-rose-950 hover:text-rose-700"
              }`}
            >
              🚨 Hoje / Atrasadas ({stats.atrasadasOuHoje})
            </button>
            <button
              onClick={() => setFilterTab("TODAS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterTab === "TODAS"
                  ? "bg-[#0056D2] text-white shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-white"
                  : "text-black hover:text-blue-700"
              }`}
            >
              📋 Todas ({stats.total})
            </button>
            <button
              onClick={() => setFilterTab("CONCLUIDAS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterTab === "CONCLUIDAS"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : isDark
                  ? "text-slate-400 hover:text-emerald-400"
                  : "text-emerald-950 hover:text-emerald-700"
              }`}
            >
              ✅ Concluídas ({stats.concluidas})
            </button>
          </div>

          {/* Busca e Dropdown de Disciplina */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-56">
              <Search
                className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${
                  isDark ? "text-slate-400" : "text-black"
                }`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar assunto..."
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium ${
                  isDark
                    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500"
                    : "bg-white border-slate-400 text-black font-bold placeholder-slate-500 shadow-2xs"
                }`}
              />
            </div>

            <select
              value={filterMateria}
              onChange={(e) => setFilterMateria(e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                isDark
                  ? "bg-slate-900 border-slate-700 text-slate-300"
                  : "bg-white border-slate-400 text-black shadow-2xs"
              }`}
            >
              <option value="TODAS">Todas Matérias</option>
              {materiasList.map((mat) => (
                <option key={mat} value={mat}>
                  {mat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela do Notion */}
        <div className={`overflow-x-auto rounded-xl border ${isDark ? "border-slate-800/80" : "border-slate-300 shadow-xs"}`}>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className={`border-b ${isDark ? "bg-slate-900/80 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-950 font-black"}`}>
                <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[11px] min-w-[220px]">
                  Aa Assunto
                </th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] min-w-[120px]">
                  Matéria
                </th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] min-w-[100px]">
                  📅 Data
                </th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] min-w-[140px]">
                  Tipo de Revisão
                </th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] min-w-[130px]">
                  ∑ Próxima Revisão
                </th>
                <th className="py-3 px-2.5 font-bold uppercase tracking-wider text-[11px] text-center w-16">
                  ☑ Semana
                </th>
                <th className="py-3 px-2.5 font-bold uppercase tracking-wider text-[11px] text-center w-16">
                  ☑ Mês 1
                </th>
                <th className="py-3 px-2.5 font-bold uppercase tracking-wider text-[11px] text-center w-16">
                  ☑ Mês 2
                </th>
                <th className="py-3 px-2.5 font-bold uppercase tracking-wider text-[11px] text-center w-16">
                  ☑ Mês 3
                </th>
                <th className="py-3 px-3 font-bold uppercase tracking-wider text-[11px] text-center w-24">
                  Progresso
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-800/50" : "divide-slate-200"}`}>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`py-12 text-center ${isDark ? "text-slate-400" : "text-slate-800 font-bold"}`}>
                    Nenhuma matéria encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const subjColor = getSubjectColor(item.materia);
                  const urgency = getRevisionUrgency(item);
                  const completedCount = [item.semana, item.mes1, item.mes2, item.mes3].filter(Boolean).length;
                  const progressPct = Math.round((completedCount / 4) * 100);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-100/80"
                      }`}
                    >
                      {/* Assunto */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-start gap-2">
                          <span className={isDark ? "text-slate-400 mt-0.5" : "text-slate-700 mt-0.5"}>📄</span>
                          <span className={`font-bold leading-snug ${isDark ? "text-white" : "text-black font-black"}`}>
                            {item.assunto}
                          </span>
                        </div>
                      </td>

                      {/* Matéria */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${getSubjectBadgeStyle(
                            item.materia,
                            isDark,
                            subjColor.badgeBg
                          )}`}
                        >
                          {item.materia}
                        </span>
                      </td>

                      {/* Data */}
                      <td className={`py-3 px-3 whitespace-nowrap font-medium ${isDark ? "text-slate-300" : "text-black font-bold"}`}>
                        {formatDateDisplay(item.data)}
                      </td>

                      {/* Tipo de Revisão */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.tipoRevisao.map((tipo) => (
                            <span
                              key={tipo}
                              className={`text-[10px] px-2 py-0.5 rounded border font-medium ${getTipoRevisaoStyle(
                                tipo,
                                isDark
                              )}`}
                            >
                              {tipo}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* ∑ Próxima Revisão */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.proximaRevisao ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border ${urgency.colorClass}`}
                          >
                            <span>{formatDateDisplay(item.proximaRevisao)}</span>
                            {urgency.status === "hoje" && <span className="font-bold">🔥</span>}
                            {urgency.status === "atrasada" && <span className="font-bold">⚠️</span>}
                          </span>
                        ) : (
                          <span className={`text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-emerald-800 font-black"}`}>
                            ✅ Concluída
                          </span>
                        )}
                      </td>

                      {/* Checkbox Semana */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCheckbox(item, "semana", item.semana)}
                          className={`w-6 h-6 rounded border inline-flex items-center justify-center transition-all cursor-pointer ${
                            item.semana
                              ? "bg-blue-600 border-blue-500 text-white shadow-xs"
                              : isDark
                              ? "border-slate-600 hover:border-blue-400 bg-slate-900/50"
                              : "border-slate-400 hover:border-blue-500 bg-white shadow-2xs"
                          }`}
                          title="Semana (7 dias) • Clique para marcar no Notion"
                        >
                          {item.semana && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      </td>

                      {/* Checkbox Mês 1 */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCheckbox(item, "mes1", item.mes1)}
                          className={`w-6 h-6 rounded border inline-flex items-center justify-center transition-all cursor-pointer ${
                            item.mes1
                              ? "bg-blue-600 border-blue-500 text-white shadow-xs"
                              : isDark
                              ? "border-slate-600 hover:border-blue-400 bg-slate-900/50"
                              : "border-slate-400 hover:border-blue-500 bg-white shadow-2xs"
                          }`}
                          title="Mês 1 (30 dias) • Clique para marcar no Notion"
                        >
                          {item.mes1 && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      </td>

                      {/* Checkbox Mês 2 */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCheckbox(item, "mes2", item.mes2)}
                          className={`w-6 h-6 rounded border inline-flex items-center justify-center transition-all cursor-pointer ${
                            item.mes2
                              ? "bg-blue-600 border-blue-500 text-white shadow-xs"
                              : isDark
                              ? "border-slate-600 hover:border-blue-400 bg-slate-900/50"
                              : "border-slate-400 hover:border-blue-500 bg-white shadow-2xs"
                          }`}
                          title="Mês 2 (60 dias) • Clique para marcar no Notion"
                        >
                          {item.mes2 && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      </td>

                      {/* Checkbox Mês 3 */}
                      <td className="py-3 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCheckbox(item, "mes3", item.mes3)}
                          className={`w-6 h-6 rounded border inline-flex items-center justify-center transition-all cursor-pointer ${
                            item.mes3
                              ? "bg-blue-600 border-blue-500 text-white shadow-xs"
                              : isDark
                              ? "border-slate-600 hover:border-blue-400 bg-slate-900/50"
                              : "border-slate-400 hover:border-blue-500 bg-white shadow-2xs"
                          }`}
                          title="Mês 3 (90 dias) • Clique para marcar no Notion"
                        >
                          {item.mes3 && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      </td>

                      {/* Progresso */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className={`w-12 rounded-full h-1.5 overflow-hidden ${isDark ? "bg-slate-800" : "bg-slate-300"}`}>
                            <div
                              className={`h-full transition-all ${
                                progressPct === 100
                                  ? "bg-emerald-500"
                                  : progressPct >= 50
                                  ? "bg-blue-500"
                                  : "bg-amber-500"
                              }`}
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>
                          <span className={`text-[10px] font-black ${isDark ? "text-slate-400" : "text-black"}`}>{completedCount}/4</span>
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
      </>
      )}

      {/* 4. Modal de Criação de Novo Estudo */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isDark ? "bg-[#0d1424] border-slate-800 text-white" : "bg-white border-slate-300 text-slate-900"
            }`}
          >
            <div className={`flex items-center justify-between pb-4 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">📕</span>
                <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-black font-black"}`}>Cadastrar Novo Estudo no Notion</h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className={`p-1 rounded-lg ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-black"}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStudy} className="space-y-4 pt-4">
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-900 font-bold"}`}>
                  Assunto / Conteúdo Estudado *
                </label>
                <input
                  type="text"
                  required
                  value={newAssunto}
                  onChange={(e) => setNewAssunto(e.target.value)}
                  placeholder="Ex: Reações Químicas, Morfologia, MRUV..."
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900 font-medium"
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-900 font-bold"}`}>
                    Matéria *
                  </label>
                  <select
                    value={newMateria}
                    onChange={(e) => setNewMateria(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900 font-medium"
                    }`}
                  >
                    <option value="Química">Química</option>
                    <option value="Português">Português</option>
                    <option value="História">História</option>
                    <option value="Matemática I">Matemática I</option>
                    <option value="Matemática II">Matemática II</option>
                    <option value="Matemática III">Matemática III</option>
                    <option value="Física I">Física I</option>
                    <option value="Física II">Física II</option>
                    <option value="Geografia">Geografia</option>
                    <option value="Biologia">Biologia</option>
                    <option value="Redação">Redação</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-900 font-bold"}`}>
                    Data do Estudo *
                  </label>
                  <input
                    type="date"
                    required
                    value={newData}
                    onChange={(e) => setNewData(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900 font-medium"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-slate-300" : "text-slate-900 font-bold"}`}>
                  Tipo de Revisão
                </label>
                <select
                  value={newTipo}
                  onChange={(e) => setNewTipo(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-slate-900 font-medium"
                  }`}
                >
                  <option value="Questões">Questões</option>
                  <option value="LDI">LDI</option>
                  <option value="Pestana">Pestana</option>
                  <option value="Apostila">Apostila</option>
                  <option value="PDF">PDF</option>
                  <option value="Qcon">Qcon</option>
                  <option value="Teoria">Teoria</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white border border-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] transition-colors shadow-md shadow-blue-950/40"
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
