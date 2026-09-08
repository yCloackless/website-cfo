import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  Clock,
  Sparkles,
  CheckSquare,
  Square,
  Layers,
  X,
} from "lucide-react";
import { NotionRevisionItem, RevisionCycleKey, AppTheme } from "../types";

/**
 * Propriedades do Notion mapeadas para a estrutura do Calendário Tático
 */
export interface NotionReviewRecord {
  id: string;
  assunto: string;
  materia: string;
  dataEstudo: string; // YYYY-MM-DD
  proximaRevisao: string; // YYYY-MM-DD
  semana: boolean;
  mes1: boolean;
  mes2: boolean;
  mes3: boolean;
  tipoRevisao?: string[];
  url?: string;
}

interface NotionCalendarProps {
  theme?: AppTheme;
  showToast?: (message: string, type: "success" | "error" | "info") => void;
}

const WEEK_DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Paleta tática para matérias do CFO CBMERJ
const MATERIA_BADGES: Record<string, string> = {
  Química: "bg-red-950/60 text-red-300 border-red-800/60",
  "Química I": "bg-red-950/60 text-red-300 border-red-800/60",
  Português: "bg-amber-950/60 text-amber-300 border-amber-800/60",
  "Língua Portuguesa": "bg-amber-950/60 text-amber-300 border-amber-800/60",
  História: "bg-emerald-950/60 text-emerald-300 border-emerald-800/60",
  "Matemática I": "bg-purple-950/60 text-purple-300 border-purple-800/60",
  "Matemática II": "bg-purple-950/60 text-purple-300 border-purple-800/60",
  "Matemática III": "bg-purple-950/60 text-purple-300 border-purple-800/60",
  Matemática: "bg-purple-950/60 text-purple-300 border-purple-800/60",
  "Física I": "bg-orange-950/60 text-orange-300 border-orange-800/60",
  "Física II": "bg-orange-950/60 text-orange-300 border-orange-800/60",
  Física: "bg-orange-950/60 text-orange-300 border-orange-800/60",
  Geografia: "bg-sky-950/60 text-sky-300 border-sky-800/60",
  Biologia: "bg-teal-950/60 text-teal-300 border-teal-800/60",
  Redação: "bg-rose-950/60 text-rose-300 border-rose-800/60",
  Default: "bg-slate-900/60 text-slate-300 border-slate-700/60",
};

export const NotionCalendar: React.FC<NotionCalendarProps> = ({
  theme = "dark",
  showToast = (_msg: string, _type?: "success" | "error" | "info") => {},
}) => {
  const isDark = theme === "dark";

  // Estado das revisões vindas exclusivamente do Notion
  const [reviews, setReviews] = useState<NotionReviewRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Mês e Ano atualmente visíveis no grid
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 8, 1)); // Padrão Setembro/2026

  // Filtros táticos
  const [selectedMateria, setSelectedMateria] = useState<string>("TODAS");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyPending, setOnlyPending] = useState<boolean>(false);

  // Modal de Detalhes do Dia
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    items: NotionReviewRecord[];
  } | null>(null);

  // Modal de Detalhes de um Estudo Específico
  const [activeItemModal, setActiveItemModal] = useState<NotionReviewRecord | null>(null);

  // Hoje no formato YYYY-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  /**
   * 2. Função de busca e mapeamento das Revisões do Notion
   * Consulta o endpoint seguro do backend que integra com a API oficial do Notion
   */
  const fetchNotionReviews = useCallback(async (force = false) => {
    if (force) setIsSyncing(true);
    else setIsLoading(true);

    try {
      const res = await fetch("/api/notion/revisoes");
      if (!res.ok) throw new Error("Falha ao comunicar com o servidor");
      const data = await res.json();

      if (data && Array.isArray(data.items)) {
        const mapped: NotionReviewRecord[] = data.items.map((it: any) => ({
          id: it.id,
          assunto: it.assunto || "Sem Assunto",
          materia: it.materia || "Geral",
          dataEstudo: it.data || "",
          proximaRevisao: it.proximaRevisao || "",
          semana: Boolean(it.semana),
          mes1: Boolean(it.mes1),
          mes2: Boolean(it.mes2),
          mes3: Boolean(it.mes3),
          tipoRevisao: it.tipoRevisao || [],
          url: it.url,
        }));

        setReviews(mapped);
        if (force) {
          showToast("Dados de revisões atualizados diretamente do Notion!", "success");
        }
      }
    } catch (err: any) {
      console.warn("Erro ao carregar revisões do Notion:", err);
      showToast("Não foi possível carregar os dados atualizados do Notion.", "error");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchNotionReviews();
  }, [fetchNotionReviews]);

  /**
   * Determina qual o próximo ciclo de revisão pendente
   */
  const getNextReviewCycle = (item: NotionReviewRecord): RevisionCycleKey | null => {
    if (!item.semana) return "semana";
    if (!item.mes1) return "mes1";
    if (!item.mes2) return "mes2";
    if (!item.mes3) return "mes3";
    return null; // Já completou todos os 4 ciclos
  };

  /**
   * 3. Sincronização Bidirecional (Ação no Site -> Notion)
   * Processa o clique no checkbox com Optimistic UI e chamada PATCH segura ao backend
   */
  const handleCheckReview = async (
    pageId: string,
    targetCycle?: RevisionCycleKey
  ) => {
    const item = reviews.find((r) => r.id === pageId);
    if (!item) return;

    // Se não especificado o ciclo, marca o próximo pendente
    const cycleToMark = targetCycle || getNextReviewCycle(item);
    if (!cycleToMark) {
      showToast(`'${item.assunto}' já concluiu todos os ciclos de revisão!`, "info");
      return;
    }

    const nextVal = !item[cycleToMark];

    // Optimistic UI: Atualiza imediatamente o estado local
    setReviews((prev) =>
      prev.map((r) => {
        if (r.id !== pageId) return r;
        const updated = { ...r, [cycleToMark]: nextVal };

        // Recálculo da Próxima Revisão
        if (!updated.semana) {
          updated.proximaRevisao = addDaysToDate(updated.dataEstudo, 7);
        } else if (!updated.mes1) {
          updated.proximaRevisao = addDaysToDate(updated.dataEstudo, 37);
        } else if (!updated.mes2) {
          updated.proximaRevisao = addDaysToDate(updated.dataEstudo, 97);
        } else if (!updated.mes3) {
          updated.proximaRevisao = addDaysToDate(updated.dataEstudo, 127);
        } else {
          updated.proximaRevisao = "";
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

    // Atualização também no modal aberto se houver
    if (activeItemModal && activeItemModal.id === pageId) {
      setActiveItemModal((prev) => (prev ? { ...prev, [cycleToMark]: nextVal } : null));
    }

    try {
      // Dispara a requisição em background para o backend seguro
      const res = await fetch("/api/notion/checkin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId,
          cycleKey: cycleToMark,
          checked: nextVal,
        }),
      });

      if (!res.ok) {
        throw new Error("Erro na resposta do servidor");
      }

      showToast(
        nextVal
          ? `Notion: marcado '${cycleLabelMap[cycleToMark]}' para ${item.assunto}!`
          : `Notion: desmarcado '${cycleLabelMap[cycleToMark]}' de ${item.assunto}.`,
        "success"
      );
    } catch (e) {
      console.error("Falha ao sincronizar com o Notion:", e);
      showToast("Falha ao salvar no Notion. Revertendo alteração local...", "error");
      // Reverter estado chamando o fetch
      fetchNotionReviews();
    }
  };

  // Função auxiliar para somar dias a uma data
  function addDaysToDate(dateStr: string, days: number): string {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Lista de disciplinas únicas
  const materias = useMemo(() => {
    const s = new Set<string>();
    reviews.forEach((r) => {
      if (r.materia) s.add(r.materia);
    });
    return Array.from(s).sort();
  }, [reviews]);

  // Navegação de mês
  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Mapeamento dos dias do mês para renderização no grid (42 células)
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Domingo
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // 1. Dias do mês anterior
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, dayNum);
      const y = prevMonthDate.getFullYear();
      const m = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    // 2. Dias do mês atual
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const y = year;
      const m = String(month + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // 3. Dias do próximo mês para completar 42 ou 35 células
    const remaining = 42 - cells.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonthDate = new Date(year, month + 1, day);
      const y = nextMonthDate.getFullYear();
      const m = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    return cells;
  }, [currentDate, todayStr]);

  // Indexação rápida de revisões por data de Próxima Revisão
  const reviewsByDate = useMemo(() => {
    const map: Record<string, NotionReviewRecord[]> = {};

    reviews.forEach((item) => {
      // 1. Filtro de busca textual
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!item.assunto.toLowerCase().includes(q) && !item.materia.toLowerCase().includes(q)) {
          return;
        }
      }

      // 2. Filtro de matéria
      if (selectedMateria !== "TODAS" && item.materia !== selectedMateria) {
        return;
      }

      // 3. Filtro de pendentes
      if (onlyPending) {
        const isDone = item.semana && item.mes1 && item.mes2 && item.mes3;
        if (isDone) return;
      }

      // Indexa apenas pela Próxima Revisão que vem do Notion
      if (item.proximaRevisao) {
        if (!map[item.proximaRevisao]) map[item.proximaRevisao] = [];
        map[item.proximaRevisao].push(item);
      }
    });

    return map;
  }, [reviews, searchQuery, selectedMateria, onlyPending]);

  // Contadores do mês visível
  const monthStats = useMemo(() => {
    const year = currentDate.getFullYear();
    const monthStr = String(currentDate.getMonth() + 1).padStart(2, "0");
    const prefix = `${year}-${monthStr}`;

    let totalMonth = 0;
    let pendingMonth = 0;

    reviews.forEach((it) => {
      if (it.proximaRevisao && it.proximaRevisao.startsWith(prefix)) {
        totalMonth++;
        const isDone = it.semana && it.mes1 && it.mes2 && it.mes3;
        if (!isDone) pendingMonth++;
      }
    });

    return { totalMonth, pendingMonth };
  }, [reviews, currentDate]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 select-none">
      {/* 1. Barra Superior Tática de Controle */}
      <div className={`border rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-md ${isDark ? "bg-slate-950/90 border-slate-800/90" : "bg-white border-slate-300 shadow-sm"}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Título & Identificador Tático */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-lg ${isDark ? "bg-green-950/70 border-green-700/50 text-green-400 shadow-green-950/30" : "bg-emerald-100 border-emerald-300 text-emerald-800"}`}>
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-base sm:text-lg font-black tracking-wider uppercase font-mono ${isDark ? "text-white" : "text-black"}`}>
                  Calendário de Revisões Tático
                </h2>
                <span className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase border ${isDark ? "bg-green-950/60 text-green-400 border-green-800/60" : "bg-emerald-100 text-emerald-950 border-emerald-400"}`}>
                  Notion Sync
                </span>
              </div>
              <p className={`text-xs font-mono mt-0.5 ${isDark ? "text-slate-400" : "text-slate-700 font-semibold"}`}>
                Exibição exclusiva de matérias agendadas em <strong className={isDark ? "text-green-400 font-semibold" : "text-emerald-800 font-black"}>Próxima Revisão</strong> no Notion
              </p>
            </div>
          </div>

          {/* Navegação de Mês & Ações Rápidas */}
          <div className="flex items-center gap-2 self-end md:self-center">
            <button
              onClick={() => fetchNotionReviews(true)}
              disabled={isSyncing}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${isDark ? "border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold"}`}
              title="Sincronizar dados do Notion"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-green-400" : ""}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            <button
              onClick={handleGoToToday}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer ${isDark ? "border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300" : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold"}`}
            >
              Hoje
            </button>

            <div className={`flex items-center border rounded-lg overflow-hidden ${isDark ? "border-slate-800 bg-black/60" : "border-slate-300 bg-slate-100"}`}>
              <button
                onClick={handlePrevMonth}
                className={`p-2 transition-colors cursor-pointer ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-900" : "text-slate-600 hover:text-black hover:bg-slate-200"}`}
                title="Mês Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className={`px-3 text-xs font-mono font-bold uppercase min-w-[130px] text-center tracking-wider ${isDark ? "text-white" : "text-black font-black"}`}>
                {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button
                onClick={handleNextMonth}
                className={`p-2 transition-colors cursor-pointer ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-900" : "text-slate-600 hover:text-black hover:bg-slate-200"}`}
                title="Próximo Mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Linha de Filtros e Busca Tática */}
        <div className={`mt-4 pt-3.5 border-t flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${isDark ? "border-slate-800/80" : "border-slate-200"}`}>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[280px]">
            {/* Campo de Busca */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar assunto..."
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs font-mono ${isDark ? "bg-black/80 border-slate-800 text-white placeholder-slate-600 focus:border-green-600" : "bg-white border-slate-300 text-black placeholder-slate-500 font-medium focus:border-green-600"}`}
              />
            </div>

            {/* Filtro por Disciplina */}
            <select
              value={selectedMateria}
              onChange={(e) => setSelectedMateria(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono cursor-pointer ${isDark ? "bg-black/80 border-slate-800 text-slate-300 focus:border-green-600" : "bg-white border-slate-300 text-slate-900 font-bold focus:border-green-600"}`}
            >
              <option value="TODAS">Todas as Matérias</option>
              {materias.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Toggle de Apenas Pendentes */}
            <button
              onClick={() => setOnlyPending((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
                onlyPending
                  ? isDark
                    ? "bg-amber-950/40 border-amber-600/50 text-amber-300 font-bold"
                    : "bg-amber-100 border-amber-500 text-amber-950 font-black"
                  : isDark
                  ? "bg-black/60 border-slate-800 text-slate-400 hover:text-white"
                  : "bg-slate-100 border-slate-300 text-slate-800 hover:text-black font-bold"
              }`}
            >
              {onlyPending ? <CheckSquare className="w-3.5 h-3.5 text-amber-400" /> : <Square className="w-3.5 h-3.5" />}
              <span>Apenas Pendentes</span>
            </button>
          </div>

          {/* Badges Táticos de Resumo do Mês */}
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className={`px-2 py-0.5 rounded border ${isDark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-slate-100 border-slate-300 text-slate-800 font-semibold"}`}>
              No Mês: <strong className={isDark ? "text-white" : "text-black font-black"}>{monthStats.totalMonth}</strong>
            </span>
            <span className={`px-2 py-0.5 rounded border ${isDark ? "bg-green-950/40 border-green-800/50 text-green-400" : "bg-emerald-100 border-emerald-300 text-emerald-950 font-bold"}`}>
              Pendentes: <strong className={isDark ? "text-green-300" : "text-emerald-950 font-black"}>{monthStats.pendingMonth}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Grid do Calendário Mensal Tático */}
      <div className={`border rounded-2xl overflow-hidden shadow-2xl ${isDark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-300 shadow-sm"}`}>
        {/* Cabeçalho dos Dias da Semana */}
        <div className={`grid grid-cols-7 border-b text-center py-2.5 text-[10px] sm:text-[11px] font-mono font-bold tracking-widest ${isDark ? "border-slate-800 bg-black text-slate-400" : "border-slate-300 bg-slate-100 text-slate-900 font-black"}`}>
          {WEEK_DAYS.map((dayName, idx) => (
            <div
              key={dayName}
              className={idx === 0 || idx === 6 ? (isDark ? "text-slate-500" : "text-slate-600") : (isDark ? "text-slate-300" : "text-slate-900")}
            >
              <span className="hidden sm:inline">{dayName}</span>
              <span className="sm:hidden">{dayName.slice(0, 3)}</span>
            </div>
          ))}
        </div>

        {/* Células do Mês */}
        <div className={`grid grid-cols-7 divide-x divide-y ${isDark ? "divide-slate-800/80 bg-slate-950" : "divide-slate-200 bg-white"}`}>
          {calendarCells.map((cell) => {
            const dayReviews = reviewsByDate[cell.dateStr] || [];
            const hasReviews = dayReviews.length > 0;
            const maxVisible = 3;
            const visibleReviews = dayReviews.slice(0, maxVisible);
            const extraCount = dayReviews.length - maxVisible;

            return (
              <div
                key={cell.dateStr}
                className={`min-h-[110px] sm:min-h-[125px] p-1.5 sm:p-2 transition-colors flex flex-col justify-between ${
                  !cell.isCurrentMonth
                    ? isDark
                      ? "bg-black/40 opacity-40"
                      : "bg-slate-100/60 opacity-60"
                    : cell.isToday
                    ? isDark
                      ? "bg-green-950/15 ring-1 ring-inset ring-green-600/40"
                      : "bg-emerald-50/80 ring-1 ring-inset ring-emerald-500/60"
                    : isDark
                    ? "hover:bg-slate-900/30"
                    : "hover:bg-slate-50"
                }`}
              >
                {/* Topo da Célula: Número do Dia */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-mono font-bold rounded-md px-1.5 py-0.5 ${
                      cell.isToday
                        ? "bg-green-600 text-black font-black shadow-xs shadow-green-400/50"
                        : cell.isCurrentMonth
                        ? isDark
                          ? "text-slate-300"
                          : "text-slate-950 font-black"
                        : isDark
                        ? "text-slate-600"
                        : "text-slate-400 font-medium"
                    }`}
                  >
                    {cell.dayNum}
                  </span>

                  {hasReviews && (
                    <span className={`text-[9.5px] font-mono font-bold ${isDark ? "text-green-500" : "text-emerald-700"}`}>
                      {dayReviews.length} rev
                    </span>
                  )}
                </div>

                {/* Lista de Itens Verdinhos Agendados no Dia */}
                <div className="space-y-1.5 flex-1 overflow-hidden">
                  {visibleReviews.map((item) => {
                    const nextCycle = getNextReviewCycle(item);
                    const isAllDone = !nextCycle;

                    return (
                      <div
                        key={item.id}
                        className={`group relative rounded px-1.5 py-1 border text-[11px] font-mono flex items-center justify-between gap-1.5 transition-all shadow-xs ${
                          isAllDone
                            ? isDark
                              ? "bg-slate-900/40 border-slate-800 text-slate-500 line-through opacity-60"
                              : "bg-slate-100 border-slate-300 text-slate-500 line-through"
                            : isDark
                            ? "bg-green-900/30 hover:bg-green-900/50 text-green-300 border-green-800/50 hover:border-green-600/70"
                            : "bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-bold border-emerald-400 shadow-2xs"
                        }`}
                        title={`${item.assunto} (${item.materia}) - Clique no checkbox para marcar no Notion`}
                      >
                        {/* Nome do Assunto (Clicável para ver detalhes) */}
                        <span
                          onClick={() => setActiveItemModal(item)}
                          className="truncate cursor-pointer hover:underline flex-1"
                        >
                          {item.assunto}
                        </span>

                        {/* Checkbox Customizado Tático:
                            Fundo escuro, borda carmesim/vermelha no hover, e check estilizado ao marcar */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckReview(item.id, nextCycle || "mes3");
                          }}
                          className={`w-4 h-4 rounded shrink-0 flex items-center justify-center transition-all cursor-pointer border ${
                            isAllDone
                              ? "border-green-500 bg-green-950/80 text-green-400"
                              : isDark
                              ? "bg-black border-slate-700 hover:border-rose-500 hover:scale-110 text-transparent hover:text-rose-400/50"
                              : "bg-white border-slate-400 hover:border-rose-600 hover:scale-110 text-transparent hover:text-rose-600/50 shadow-2xs"
                          }`}
                          title={
                            isAllDone
                              ? "Revisão concluída em todos os ciclos (Semana, Mês 1, Mês 2, Mês 3)"
                              : `Clique para marcar '${nextCycle?.toUpperCase()}' no Notion`
                          }
                        >
                          <Check className={`w-3 h-3 stroke-[3] ${isAllDone ? "text-green-400" : ""}`} />
                        </button>
                      </div>
                    );
                  })}

                  {/* Botão +X mais */}
                  {extraCount > 0 && (
                    <button
                      onClick={() =>
                        setSelectedDayDetail({
                          dateStr: cell.dateStr,
                          items: dayReviews,
                        })
                      }
                      className="w-full text-center text-[10px] font-mono text-green-400/90 hover:text-green-300 bg-green-950/30 hover:bg-green-950/50 border border-green-800/30 rounded py-0.5 transition-colors cursor-pointer"
                    >
                      +{extraCount} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Modal Tático de Detalhes do Dia (caso clique em +X mais) */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-full max-w-lg rounded-2xl p-5 shadow-2xl font-mono space-y-4 border ${
              isDark
                ? "bg-slate-950 border-slate-800 text-white"
                : "bg-white border-slate-300 text-black shadow-2xl"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-green-600" />
                <h3 className={`font-bold text-sm ${isDark ? "text-green-300" : "text-black font-black"}`}>
                  Revisões Programadas para {selectedDayDetail.dateStr}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className={`p-1 rounded-lg ${
                  isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-black"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {selectedDayDetail.items.map((item) => {
                const nextCycle = getNextReviewCycle(item);
                const isAllDone = !nextCycle;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                      isDark
                        ? "border-slate-800 bg-black/60 hover:border-slate-700"
                        : "border-slate-300 bg-slate-50 hover:border-slate-400 shadow-2xs"
                    }`}
                  >
                    <div className="space-y-1">
                      <span
                        className={`text-[9.5px] px-2 py-0.5 rounded border font-bold ${
                          isDark
                            ? MATERIA_BADGES[item.materia] || MATERIA_BADGES.Default
                            : "bg-slate-200 text-black border-slate-400 font-black"
                        }`}
                      >
                        {item.materia}
                      </span>
                      <h4 className={`text-xs font-bold leading-snug ${isDark ? "text-white" : "text-black font-black"}`}>
                        {item.assunto}
                      </h4>
                      <p className={`text-[10px] ${isDark ? "text-slate-500" : "text-slate-800 font-bold"}`}>
                        Estudado em: {item.dataEstudo || "-"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCheckReview(item.id, nextCycle || "mes3")}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all border cursor-pointer ${
                          isAllDone
                            ? isDark
                              ? "border-green-500 text-green-400 bg-green-950/60"
                              : "border-green-600 text-green-950 bg-green-200"
                            : isDark
                            ? "bg-black border-slate-700 hover:border-rose-500 hover:scale-105 text-slate-700 hover:text-rose-400"
                            : "bg-white border-slate-400 hover:border-rose-600 hover:scale-105 text-slate-400 hover:text-rose-700 shadow-2xs"
                        }`}
                        title="Marcar no Notion"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal de Inspeção Completa dos 4 Checkboxes do Notion */}
      {activeItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={`w-full max-w-md rounded-2xl p-5 shadow-2xl font-mono space-y-4 border ${
              isDark
                ? "bg-slate-950 border-slate-800 text-white"
                : "bg-white border-slate-300 text-black shadow-2xl"
            }`}
          >
            <div
              className={`flex items-center justify-between pb-3 border-b ${
                isDark ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">📕</span>
                <h3 className={`font-bold text-sm ${isDark ? "text-green-300" : "text-black font-black"}`}>
                  Controle do Notion
                </h3>
              </div>
              <button
                onClick={() => setActiveItemModal(null)}
                className={`p-1 rounded-lg ${
                  isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-black"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border font-bold ${
                    isDark
                      ? MATERIA_BADGES[activeItemModal.materia] || MATERIA_BADGES.Default
                      : "bg-slate-200 text-black border-slate-400 font-black"
                  }`}
                >
                  {activeItemModal.materia}
                </span>
                <h3 className={`text-sm font-bold mt-1.5 leading-snug ${isDark ? "text-white" : "text-black font-black"}`}>
                  {activeItemModal.assunto}
                </h3>
                <div className={`text-[11px] mt-1 flex items-center justify-between ${isDark ? "text-slate-400" : "text-slate-900 font-bold"}`}>
                  <span>Data do Estudo: {activeItemModal.dataEstudo}</span>
                  <span>Próxima: {activeItemModal.proximaRevisao || "Concluída"}</span>
                </div>
              </div>

              {/* 4 Checkboxes do Notion */}
              <div className={`pt-3 border-t space-y-2 ${isDark ? "border-slate-800" : "border-slate-200"}`}>
                <span className={`text-xs font-bold uppercase tracking-wider block ${isDark ? "text-slate-400" : "text-black font-black"}`}>
                  Caixas de Revisão no Notion:
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "semana" as RevisionCycleKey, label: "Semana (7D)", checked: activeItemModal.semana },
                    { key: "mes1" as RevisionCycleKey, label: "Mês 1 (30D)", checked: activeItemModal.mes1 },
                    { key: "mes2" as RevisionCycleKey, label: "Mês 2 (60D)", checked: activeItemModal.mes2 },
                    { key: "mes3" as RevisionCycleKey, label: "Mês 3 (90D)", checked: activeItemModal.mes3 },
                  ].map((box) => (
                    <button
                      key={box.key}
                      type="button"
                      onClick={() => handleCheckReview(activeItemModal.id, box.key)}
                      className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        box.checked
                          ? isDark
                            ? "bg-green-950/50 border-green-500/80 text-green-300 font-bold"
                            : "bg-emerald-100 border-emerald-600 text-emerald-950 font-black shadow-xs"
                          : isDark
                          ? "bg-black border-slate-800 text-slate-400 hover:border-rose-500 hover:text-rose-300"
                          : "bg-slate-50 border-slate-300 text-black font-bold hover:border-rose-600 hover:bg-slate-100 shadow-2xs"
                      }`}
                    >
                      <span className="text-xs">{box.label}</span>
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          box.checked
                            ? "bg-green-600 border-green-500 text-white"
                            : isDark
                            ? "border-slate-700 bg-slate-900 group-hover:border-rose-500"
                            : "border-slate-400 bg-white"
                        }`}
                      >
                        {box.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
