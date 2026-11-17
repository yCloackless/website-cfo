import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  RefreshCw,
  Search,
  X,
  Plus,
  ExternalLink,
  Calendar as CalendarIcon,
  Clock,
  Tag,
  BookOpen,
} from "lucide-react";
import {
  AppTheme,
  NOTION_CYCLE_LABELS,
  NOTION_CYCLE_ORDER,
  NotionRevisionItem,
  RevisionCycleKey,
} from "../types";
import { checkinRevision, fetchNotionRevisoes } from "../services/notionService";
import { getNextCycleLabelAfter, getNextPendingNotionCycle } from "../utils/notionRevisions";

/**
 * Compatível com o shape da API `/api/notion/revisoes` (Semana até Mês 10).
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
  mes4?: boolean;
  mes5?: boolean;
  mes6?: boolean;
  mes7?: boolean;
  mes8?: boolean;
  mes9?: boolean;
  mes10?: boolean;
  tipoRevisao?: string[];
  url?: string;
}

interface NotionCalendarProps {
  theme?: AppTheme;
  showToast?: (message: string, type: "success" | "error" | "info") => void;
  externalItems?: NotionRevisionItem[];
  externalLoading?: boolean;
  externalSyncing?: boolean;
  onExternalSync?: () => void;
  onExternalItemUpdated?: (item: NotionRevisionItem) => void;
  onQuickCreate?: (dateStr?: string) => void;
}

type CalendarViewMode = "week" | "month";

const WEEK_DAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

const HOUR_SLOTS = [8, 10, 12, 14, 16, 18, 20, 22];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(dateStr?: string): string {
  if (!dateStr) return "—";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function mapApiItemToReviewRecord(it: NotionRevisionItem | NotionReviewRecord): NotionReviewRecord {
  const dataEstudo = "data" in it ? it.data : it.dataEstudo;
  return {
    id: it.id,
    assunto: it.assunto || "Sem Assunto",
    materia: it.materia || "Geral",
    dataEstudo: dataEstudo || "",
    proximaRevisao: it.proximaRevisao || "",
    semana: Boolean(it.semana),
    mes1: Boolean(it.mes1),
    mes2: Boolean(it.mes2),
    mes3: Boolean(it.mes3),
    mes4: Boolean(it.mes4),
    mes5: Boolean(it.mes5),
    mes6: Boolean(it.mes6),
    mes7: Boolean(it.mes7),
    mes8: Boolean(it.mes8),
    mes9: Boolean(it.mes9),
    mes10: Boolean(it.mes10),
    tipoRevisao: it.tipoRevisao || [],
    url: it.url,
  };
}

function mapReviewRecordToApiItem(r: NotionReviewRecord): NotionRevisionItem {
  return {
    id: r.id,
    assunto: r.assunto,
    materia: r.materia,
    data: r.dataEstudo,
    proximaRevisao: r.proximaRevisao || undefined,
    semana: r.semana,
    mes1: r.mes1,
    mes2: r.mes2,
    mes3: r.mes3,
    mes4: r.mes4,
    mes5: r.mes5,
    mes6: r.mes6,
    mes7: r.mes7,
    mes8: r.mes8,
    mes9: r.mes9,
    mes10: r.mes10,
    tipoRevisao: r.tipoRevisao || [],
    url: r.url,
  };
}

/**
 * Ícone circular tracejado estilo Notion Calendar (ou check sólido quando todos os 11 ciclos acabam).
 */
const NotionStatusGlyph: React.FC<{
  completed: boolean;
  isBusy?: boolean;
  isDueOrOverdue?: boolean;
  isDark: boolean;
}> = ({ completed, isBusy, isDueOrOverdue, isDark }) => {
  if (isBusy) {
    return (
      <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0 opacity-80" />
    );
  }
  if (completed) {
    return (
      <span
        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
          isDark ? "bg-emerald-500/90 text-[#191919]" : "bg-emerald-600 text-white"
        }`}
      >
        <Check className="w-2.5 h-2.5 stroke-[3]" />
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className={`w-3.5 h-3.5 shrink-0 transition-transform group-hover/check:scale-110 ${
        isDueOrOverdue
          ? isDark
            ? "text-[#ff8f85]"
            : "text-[#c43e36]"
          : isDark
          ? "text-[#e59a94]/80"
          : "text-[#b84a42]/80"
      }`}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="5.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.3 2.1"
      />
    </svg>
  );
};

export const NotionCalendar: React.FC<NotionCalendarProps> = ({
  theme = "dark",
  showToast = () => {},
  externalItems,
  externalLoading,
  externalSyncing,
  onExternalSync,
  onExternalItemUpdated,
  onQuickCreate,
}) => {
  const isDark = theme === "dark";
  const isControlled = Array.isArray(externalItems);

  const [internalReviews, setInternalReviews] = useState<NotionReviewRecord[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(!isControlled);
  const [internalSyncing, setInternalSyncing] = useState<boolean>(false);

  const reviews = useMemo(
    () => (isControlled ? externalItems!.map(mapApiItemToReviewRecord) : internalReviews),
    [isControlled, externalItems, internalReviews]
  );
  const isLoading = isControlled ? Boolean(externalLoading) : internalLoading;
  const isSyncing = isControlled ? Boolean(externalSyncing) : internalSyncing;

  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const [selectedMateria, setSelectedMateria] = useState<string>("TODAS");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyPending, setOnlyPending] = useState<boolean>(false);

  const [busyPageId, setBusyPageId] = useState<string | null>(null);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    items: NotionReviewRecord[];
  } | null>(null);
  const [activeItemModal, setActiveItemModal] = useState<NotionReviewRecord | null>(null);

  // Relógio atual para a linha vermelha do Notion Calendar
  const [nowTick, setNowTick] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const todayStr = useMemo(() => toDateStr(nowTick), [nowTick]);

  const fetchNotionReviews = useCallback(
    async (force = false) => {
      if (isControlled && onExternalSync) {
        onExternalSync();
        return;
      }
      if (force) setInternalSyncing(true);
      else setInternalLoading(true);
      try {
        const res = await fetchNotionRevisoes();
        setInternalReviews(res.items.map(mapApiItemToReviewRecord));
        if (force) {
          showToast(
            res.source === "notion_api"
              ? "Agenda sincronizada com o Notion."
              : "Agenda atualizada via cache sincronizado.",
            "success"
          );
        }
      } catch {
        showToast("Não foi possível carregar as revisões do Notion.", "error");
      } finally {
        setInternalLoading(false);
        setInternalSyncing(false);
      }
    },
    [isControlled, onExternalSync, showToast]
  );

  useEffect(() => {
    if (!isControlled) {
      void fetchNotionReviews(false);
    }
  }, [isControlled, fetchNotionReviews]);

  const applyUpdatedRecord = useCallback(
    (record: NotionReviewRecord) => {
      if (isControlled) {
        onExternalItemUpdated?.(mapReviewRecordToApiItem(record));
      } else {
        setInternalReviews((prev) => prev.map((r) => (r.id === record.id ? record : r)));
      }
      setActiveItemModal((prev) => (prev && prev.id === record.id ? record : prev));
      setSelectedDayDetail((prev) =>
        prev
          ? { ...prev, items: prev.items.map((r) => (r.id === record.id ? record : r)) }
          : null
      );
    },
    [isControlled, onExternalItemUpdated]
  );

  const handleCheckReview = async (pageId: string, targetCycle?: RevisionCycleKey) => {
    if (busyPageId) return;
    const item = reviews.find((r) => r.id === pageId);
    if (!item) return;

    const cycleToMark = targetCycle || getNextPendingNotionCycle(item);
    if (!cycleToMark) {
      showToast(`'${item.assunto}' já concluiu todos os ciclos de revisão.`, "info");
      return;
    }

    const nextVal = !Boolean(item[cycleToMark]);
    const cycleLabel = NOTION_CYCLE_LABELS[cycleToMark];

    // Optimistic UI apenas no checkbox clicado; Próxima Revisão real vem da fórmula do Notion
    const optimistic: NotionReviewRecord = { ...item, [cycleToMark]: nextVal };
    applyUpdatedRecord(optimistic);
    setBusyPageId(pageId);

    try {
      const res = await checkinRevision(pageId, cycleToMark, nextVal);
      if (!res.success) {
        throw new Error(res.error || "Erro ao atualizar Notion");
      }

      let nextHint = "";
      if (res.item) {
        const serverRecord = mapApiItemToReviewRecord(res.item);
        applyUpdatedRecord(serverRecord);
        if (serverRecord.proximaRevisao && serverRecord.proximaRevisao !== item.proximaRevisao) {
          nextHint = ` • Próxima: ${formatDateBR(serverRecord.proximaRevisao)}`;
        }
      }

      showToast(
        nextVal
          ? `Notion: '${cycleLabel}' marcado em ${item.assunto}${nextHint}`
          : `Notion: '${cycleLabel}' desmarcado em ${item.assunto}${nextHint}`,
        "success"
      );
    } catch (err: any) {
      applyUpdatedRecord(item);
      showToast(err?.message || "Falha ao sincronizar com o Notion. Alteração revertida.", "error");
    } finally {
      setBusyPageId(null);
    }
  };

  const materias = useMemo(() => {
    const s = new Set<string>();
    reviews.forEach((r) => {
      if (r.materia) s.add(r.materia);
    });
    return Array.from(s).sort();
  }, [reviews]);

  // Navegação Semana / Mês
  const handlePrev = () => {
    setAnchorDate((prev) =>
      viewMode === "week"
        ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7)
        : new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const handleNext = () => {
    setAnchorDate((prev) =>
      viewMode === "week"
        ? new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7)
        : new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  const handleToday = () => {
    const now = new Date();
    setAnchorDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  // Dias da semana atual (DOM -> SÁB) como no Notion Calendar
  const weekDays = useMemo(() => {
    const start = new Date(
      anchorDate.getFullYear(),
      anchorDate.getMonth(),
      anchorDate.getDate() - anchorDate.getDay()
    );
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + idx);
      const dateStr = toDateStr(d);
      return {
        date: d,
        dateStr,
        dayNum: d.getDate(),
        weekdayLabel: WEEK_DAYS_SHORT[d.getDay()],
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      };
    });
  }, [anchorDate, todayStr]);

  // Células do mês (42 dias)
  const monthCells = useMemo(() => {
    const year = anchorDate.getFullYear();
    const month = anchorDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
    }> = [];

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const d = new Date(year, month - 1, dayNum);
      const dateStr = toDateStr(d);
      cells.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = toDateStr(d);
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      });
    }

    const remaining = 42 - cells.length;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      const dateStr = toDateStr(d);
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      });
    }

    return cells;
  }, [anchorDate, todayStr]);

  // Título dinâmico do cabeçalho (ex: "Novembro 2026" ou "Nov – Dez 2026")
  const periodTitle = useMemo(() => {
    if (viewMode === "month") {
      return `${MONTH_NAMES[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
    }
    const first = weekDays[0]?.date || anchorDate;
    const last = weekDays[6]?.date || anchorDate;
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`;
    }
    const m1 = MONTH_NAMES[first.getMonth()].slice(0, 3);
    const m2 = MONTH_NAMES[last.getMonth()].slice(0, 3);
    return first.getFullYear() === last.getFullYear()
      ? `${m1} – ${m2} ${last.getFullYear()}`
      : `${m1} ${first.getFullYear()} – ${m2} ${last.getFullYear()}`;
  }, [viewMode, anchorDate, weekDays]);

  // Indexa revisões filtradas pela Próxima Revisão real do Notion
  const reviewsByDate = useMemo(() => {
    const map: Record<string, NotionReviewRecord[]> = {};
    const q = searchQuery.trim().toLowerCase();

    reviews.forEach((item) => {
      if (q && !item.assunto.toLowerCase().includes(q) && !item.materia.toLowerCase().includes(q)) {
        return;
      }
      if (selectedMateria !== "TODAS" && item.materia !== selectedMateria) {
        return;
      }
      if (onlyPending && !getNextPendingNotionCycle(item)) {
        return;
      }
      if (item.proximaRevisao) {
        const dateKey = item.proximaRevisao.slice(0, 10);
        if (!map[dateKey]) map[dateKey] = [];
        map[dateKey].push(item);
      }
    });

    return map;
  }, [reviews, searchQuery, selectedMateria, onlyPending]);

  // Estatísticas do período visível
  const periodStats = useMemo(() => {
    const visibleDates = new Set(
      viewMode === "week"
        ? weekDays.map((d) => d.dateStr)
        : monthCells.filter((c) => c.isCurrentMonth).map((c) => c.dateStr)
    );
    let total = 0;
    let pending = 0;
    visibleDates.forEach((ds) => {
      const list = reviewsByDate[ds] || [];
      total += list.length;
      pending += list.filter((it) => Boolean(getNextPendingNotionCycle(it))).length;
    });
    return { total, pending };
  }, [viewMode, weekDays, monthCells, reviewsByDate]);

  // Posição da linha de hora atual no grid semanal (entre 08:00 e 22:00)
  const currentTimeIndicator = useMemo(() => {
    const hours = nowTick.getHours() + nowTick.getMinutes() / 60;
    const minH = 7;
    const maxH = 23;
    const clamped = Math.max(minH, Math.min(maxH, hours));
    const pct = ((clamped - minH) / (maxH - minH)) * 100;
    const hh = String(nowTick.getHours()).padStart(2, "0");
    const mm = String(nowTick.getMinutes()).padStart(2, "0");
    return { pct, label: `${hh}:${mm}`, shortMinutes: `:${mm}` };
  }, [nowTick]);

  // Superfícies estilo Notion Calendar
  const notionCanvas = isDark
    ? "bg-[#191919] border-white/[0.08] text-[#e6e6e4]"
    : "bg-white border-[#e6e6e3] text-[#37352f]";
  const hairline = isDark ? "border-white/[0.06]" : "border-[#ececeb]";
  const divideHairline = isDark ? "divide-white/[0.06]" : "divide-[#ececeb]";

  const renderEventPill = (item: NotionReviewRecord, compact = false) => {
    const nextCycle = getNextPendingNotionCycle(item);
    const isAllDone = !nextCycle;
    const dueDate = item.proximaRevisao?.slice(0, 10) || "";
    const isDueTodayOrOverdue = !isAllDone && Boolean(dueDate) && dueDate <= todayStr;
    const isBusy = busyPageId === item.id;

    // Paleta fiel ao Notion Calendar do print (coral/terracotta para revisões, sálvia para concluído total)
    const pillColors = isAllDone
      ? isDark
        ? "bg-[#1d3226]/90 hover:bg-[#233d2e] text-[#9fd4b2]"
        : "bg-[#eaf5ee] hover:bg-[#dcf0e3] text-[#1f6239]"
      : isDueOrOverdueStyle(isDueTodayOrOverdue, isDark);

    const accentBarColor = isAllDone
      ? isDark
        ? "bg-[#4ea86d]"
        : "bg-[#2e8550]"
      : isDueTodayOrOverdue
      ? "bg-[#eb5757]"
      : isDark
      ? "bg-[#c8564d]"
      : "bg-[#d44c47]";

    const nextLabel = nextCycle ? NOTION_CYCLE_LABELS[nextCycle] : "Concluído";

    return (
      <div
        key={item.id}
        onClick={() => setActiveItemModal(item)}
        className={`group relative flex items-center gap-1.5 rounded-[5px] pr-1.5 pl-0 overflow-hidden cursor-pointer transition-colors ${
          compact ? "py-[2px] text-[11px]" : "py-[3.5px] text-[11.5px]"
        } ${pillColors}`}
        title={`${item.assunto} • ${item.materia} (${
          isAllDone ? "Todos os ciclos concluídos" : `Próxima etapa: ${nextLabel}`
        })`}
      >
        {/* Barra lateral vertical característica do Notion Calendar */}
        <span className={`w-[3px] self-stretch shrink-0 ${accentBarColor}`} />

        {/* Botão de check direto com círculo tracejado do Notion Calendar */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void handleCheckReview(item.id, nextCycle || "mes10");
          }}
          disabled={isBusy}
          className="group/check ml-1 shrink-0 rounded-full p-0.5 -m-0.5 focus:outline-none cursor-pointer"
          title={
            isAllDone
              ? "Revisão concluída até Mês 10"
              : `Marcar '${nextLabel}' como revisado no Notion`
          }
          aria-label={`Marcar ${nextLabel} de ${item.assunto}`}
        >
          <NotionStatusGlyph
            completed={isAllDone}
            isBusy={isBusy}
            isDueOrOverdue={isDueTodayOrOverdue}
            isDark={isDark}
          />
        </button>

        {/* Título do assunto */}
        <span
          className={`truncate font-medium leading-tight flex-1 ${
            isAllDone ? "opacity-75" : ""
          }`}
        >
          {item.assunto}
        </span>

        {/* Tag sutil do ciclo pendente ao passar o mouse (desktop) */}
        {nextCycle && (
          <span
            className={`hidden xl:inline-block shrink-0 text-[9.5px] font-medium px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
              isDark ? "bg-black/30 text-white/75" : "bg-white/70 text-[#7c2924]"
            }`}
          >
            {nextLabel}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={`w-full rounded-xl border overflow-hidden shadow-sm ${notionCanvas}`}>
      {/* Barra superior estilo Notion Calendar */}
      <div
        className={`px-3 sm:px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-2.5 ${hairline} ${
          isDark ? "bg-[#202020]" : "bg-[#fbfbfa]"
        }`}
      >
        {/* Esquerda: Título do Mês + Setas + Hoje */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrev}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isDark
                  ? "text-white/60 hover:text-white hover:bg-white/[0.07]"
                  : "text-[#37352f]/70 hover:text-[#37352f] hover:bg-black/[0.05]"
              }`}
              title={viewMode === "week" ? "Semana anterior" : "Mês anterior"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                isDark
                  ? "border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.09] text-[#e6e6e4]"
                  : "border-[#dfdfdc] bg-white hover:bg-[#f1f1ef] text-[#37352f]"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={handleNext}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isDark
                  ? "text-white/60 hover:text-white hover:bg-white/[0.07]"
                  : "text-[#37352f]/70 hover:text-[#37352f] hover:bg-black/[0.05]"
              }`}
              title={viewMode === "week" ? "Próxima semana" : "Próximo mês"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="text-sm sm:text-base font-semibold tracking-tight tabular-nums">
            {periodTitle}
          </h2>

          <span
            className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md ${
              isDark ? "bg-white/[0.05] text-white/60" : "bg-[#f1f1ef] text-[#37352f]/70"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#eb5757]" />
            <span className="tabular-nums">
              {periodStats.pending} pendente(s) de {periodStats.total}
            </span>
          </span>
        </div>

        {/* Direita: Busca, Filtro de Matéria, Apenas Pendentes, Semana/Mês, Sync */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative w-36 sm:w-44">
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
              className={`w-full pl-8 pr-2 py-1 rounded-md text-xs border focus:outline-none transition-colors ${
                isDark
                  ? "bg-[#191919] border-white/[0.08] text-[#e6e6e4] placeholder-white/35 focus:border-white/25"
                  : "bg-white border-[#dfdfdc] text-[#37352f] placeholder-[#37352f]/40 focus:border-[#37352f]/40"
              }`}
            />
          </div>

          <select
            value={selectedMateria}
            onChange={(e) => setSelectedMateria(e.target.value)}
            className={`px-2 py-1 rounded-md text-xs border focus:outline-none cursor-pointer ${
              isDark
                ? "bg-[#191919] border-white/[0.08] text-[#e6e6e4]"
                : "bg-white border-[#dfdfdc] text-[#37352f]"
            }`}
          >
            <option value="TODAS">Todas as matérias</option>
            {materias.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyPending((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              onlyPending
                ? isDark
                  ? "bg-[#eb5757]/15 border-[#eb5757]/40 text-[#ff8f85]"
                  : "bg-[#fdeceb] border-[#eb5757]/50 text-[#b42c24]"
                : isDark
                ? "bg-white/[0.03] border-white/[0.08] text-white/65 hover:text-white"
                : "bg-white border-[#dfdfdc] text-[#37352f]/75 hover:text-[#37352f]"
            }`}
          >
            Pendentes
          </button>

          {/* Alternador Semana / Mês como no Notion Calendar */}
          <div
            className={`inline-flex items-center p-0.5 rounded-md border ${
              isDark ? "bg-[#191919] border-white/[0.08]" : "bg-[#f1f1ef] border-[#e6e6e3]"
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "week"
                  ? isDark
                    ? "bg-white/[0.11] text-white shadow-2xs"
                    : "bg-white text-[#37352f] shadow-2xs"
                  : isDark
                  ? "text-white/55 hover:text-white"
                  : "text-[#37352f]/65 hover:text-[#37352f]"
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                viewMode === "month"
                  ? isDark
                    ? "bg-white/[0.11] text-white shadow-2xs"
                    : "bg-white text-[#37352f] shadow-2xs"
                  : isDark
                  ? "text-white/55 hover:text-white"
                  : "text-[#37352f]/65 hover:text-[#37352f]"
              }`}
            >
              Mês
            </button>
          </div>

          <button
            type="button"
            onClick={() => void fetchNotionReviews(true)}
            disabled={isSyncing}
            className={`p-1.5 rounded-md border transition-colors cursor-pointer disabled:opacity-50 ${
              isDark
                ? "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-white/70"
                : "border-[#dfdfdc] bg-white hover:bg-[#f1f1ef] text-[#37352f]/75"
            }`}
            title="Sincronizar com Notion"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Estado de Carregamento */}
      {isLoading && reviews.length === 0 ? (
        <div className={`py-16 text-center text-xs ${isDark ? "text-white/50" : "text-[#37352f]/60"}`}>
          Sincronizando calendário com o Notion...
        </div>
      ) : viewMode === "week" ? (
        /* ================== VISUALIZAÇÃO SEMANAL (ESTILO NOTION CALENDAR) ================== */
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Cabeçalho dos 7 dias (dom 15, seg 16, ter [17], ...) */}
            <div
              className={`grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b ${hairline} ${
                isDark ? "bg-[#191919]" : "bg-white"
              }`}
            >
              <div
                className={`border-r flex items-center justify-center text-[10px] font-medium ${hairline} ${
                  isDark ? "text-white/30" : "text-[#37352f]/40"
                }`}
              >
                GMT-3
              </div>
              {weekDays.map((day) => (
                <div
                  key={day.dateStr}
                  className={`group/dayhead relative px-2 py-2 border-r last:border-r-0 flex items-center justify-center gap-1.5 text-xs ${hairline} ${
                    day.isToday
                      ? isDark
                        ? "bg-white/[0.025]"
                        : "bg-[#fff8f7]"
                      : ""
                  }`}
                >
                  <span
                    className={
                      day.isToday
                        ? isDark
                          ? "text-white font-semibold"
                          : "text-[#37352f] font-semibold"
                        : isDark
                        ? "text-white/55 font-medium"
                        : "text-[#37352f]/60 font-medium"
                    }
                  >
                    {day.weekdayLabel}
                  </span>
                  <span
                    className={`inline-flex items-center justify-center tabular-nums leading-none ${
                      day.isToday
                        ? "bg-[#eb5757] text-white font-semibold px-1.5 py-0.5 rounded-[5px] text-[11px]"
                        : isDark
                        ? "text-white/75 font-medium"
                        : "text-[#37352f]/80 font-medium"
                    }`}
                  >
                    {day.dayNum}
                  </span>

                  {onQuickCreate && (
                    <button
                      type="button"
                      onClick={() => onQuickCreate(day.dateStr)}
                      className={`absolute right-1.5 opacity-0 group-hover/dayhead:opacity-100 p-0.5 rounded transition-opacity cursor-pointer ${
                        isDark ? "hover:bg-white/[0.08] text-white/50" : "hover:bg-black/[0.06] text-[#37352f]/60"
                      }`}
                      title={`Adicionar estudo em ${formatDateBR(day.dateStr)}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Faixa Pinned / Dia Inteiro com todas as revisões do Notion (pílulas fiéis ao Notion Calendar) */}
            <div
              className={`grid grid-cols-[52px_repeat(7,minmax(0,1fr))] border-b ${hairline} ${
                isDark ? "bg-[#191919]" : "bg-white"
              }`}
            >
              <div
                className={`border-r px-1.5 py-2 flex flex-col justify-start items-end text-[9.5px] ${hairline} ${
                  isDark ? "text-white/30" : "text-[#37352f]/40"
                }`}
              >
                <span>Dia todo</span>
              </div>

              {weekDays.map((day) => {
                const dayReviews = reviewsByDate[day.dateStr] || [];
                return (
                  <div
                    key={day.dateStr}
                    className={`border-r last:border-r-0 p-1.5 space-y-1 min-h-[72px] ${hairline} ${
                      day.isToday
                        ? isDark
                          ? "bg-white/[0.02]"
                          : "bg-[#fffaf9]"
                        : day.isPast
                        ? isDark
                          ? "bg-black/[0.08]"
                          : "bg-[#fafaf9]/60"
                        : ""
                    }`}
                  >
                    {dayReviews.map((item) => renderEventPill(item, false))}
                  </div>
                );
              })}
            </div>

            {/* Grade horária visual do Notion Calendar com linha vermelha ao vivo */}
            <div className="relative">
              <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))]">
                {/* Coluna esquerda de horários */}
                <div className={`border-r ${hairline}`}>
                  {HOUR_SLOTS.map((hour) => (
                    <div
                      key={hour}
                      className={`h-9 pr-1.5 flex items-start justify-end text-[10px] tabular-nums -mt-1.5 ${
                        isDark ? "text-white/25" : "text-[#37352f]/35"
                      }`}
                    >
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>

                {/* Colunas dos 7 dias com linhas horizontais sutis */}
                {weekDays.map((day) => (
                  <div
                    key={day.dateStr}
                    className={`relative border-r last:border-r-0 ${hairline} ${
                      day.isToday ? (isDark ? "bg-white/[0.015]" : "bg-[#fffafa]") : ""
                    }`}
                  >
                    {HOUR_SLOTS.map((hour) => (
                      <div key={hour} className={`h-9 border-b last:border-b-0 ${hairline}`} />
                    ))}

                    {/* Indicador de hora atual no dia de hoje */}
                    {day.isToday && (
                      <div
                        className="absolute inset-x-0 pointer-events-none z-10 flex items-center"
                        style={{ top: `${currentTimeIndicator.pct}%` }}
                      >
                        <span className="w-[2px] h-2.5 bg-[#eb5757] -ml-[1px] rounded-full" />
                        <span className="h-[1.5px] flex-1 bg-[#eb5757]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Etiqueta vermelha do horário atual na barra esquerda (como `:27` no Notion Calendar) */}
              {weekDays.some((d) => d.isToday) && (
                <div
                  className="absolute left-0 w-[52px] flex justify-end pr-1 pointer-events-none z-20 -translate-y-1/2"
                  style={{ top: `${currentTimeIndicator.pct}%` }}
                >
                  <span className="px-1 py-[1px] rounded bg-[#eb5757] text-white text-[9.5px] font-semibold tabular-nums leading-none shadow-xs">
                    {currentTimeIndicator.label}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ================== VISUALIZAÇÃO MENSAL (ESTILO NOTION CALENDAR) ================== */
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Cabeçalho dias da semana */}
            <div
              className={`grid grid-cols-7 border-b py-1.5 text-center text-[11px] font-medium ${hairline} ${
                isDark ? "bg-[#191919] text-white/50" : "bg-white text-[#37352f]/55"
              }`}
            >
              {WEEK_DAYS_SHORT.map((dayName) => (
                <div key={dayName}>{dayName}</div>
              ))}
            </div>

            {/* Grade mensal */}
            <div className={`grid grid-cols-7 divide-x divide-y ${divideHairline}`}>
              {monthCells.map((cell) => {
                const dayReviews = reviewsByDate[cell.dateStr] || [];
                const maxVisible = 4;
                const visibleReviews = dayReviews.slice(0, maxVisible);
                const extraCount = dayReviews.length - maxVisible;

                return (
                  <div
                    key={cell.dateStr}
                    className={`min-h-[120px] p-1.5 flex flex-col transition-colors ${
                      !cell.isCurrentMonth
                        ? isDark
                          ? "bg-black/[0.22] opacity-45"
                          : "bg-[#fafaf9] opacity-60"
                        : cell.isToday
                        ? isDark
                          ? "bg-white/[0.03]"
                          : "bg-[#fff9f8]"
                        : isDark
                        ? "hover:bg-white/[0.02]"
                        : "hover:bg-[#fafaf9]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 px-0.5">
                      <span
                        className={`inline-flex items-center justify-center text-[11px] tabular-nums leading-none ${
                          cell.isToday
                            ? "bg-[#eb5757] text-white font-semibold px-1.5 py-0.5 rounded-[5px]"
                            : isDark
                            ? "text-white/75 font-medium"
                            : "text-[#37352f]/80 font-medium"
                        }`}
                      >
                        {cell.dayNum}
                      </span>

                      {dayReviews.length > 0 && (
                        <span
                          className={`text-[10px] tabular-nums ${
                            isDark ? "text-white/35" : "text-[#37352f]/45"
                          }`}
                        >
                          {dayReviews.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 flex-1 overflow-hidden">
                      {visibleReviews.map((item) => renderEventPill(item, true))}

                      {extraCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDayDetail({ dateStr: cell.dateStr, items: dayReviews })
                          }
                          className={`w-full text-left px-1.5 py-0.5 rounded text-[10.5px] font-medium transition-colors cursor-pointer ${
                            isDark
                              ? "text-white/60 hover:text-white hover:bg-white/[0.06]"
                              : "text-[#37352f]/70 hover:text-[#37352f] hover:bg-black/[0.05]"
                          }`}
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
        </div>
      )}

      {/* Popover/Modal do Dia (+X mais) estilo Notion */}
      {selectedDayDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setSelectedDayDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-xl border p-4 shadow-2xl space-y-3 ${
              isDark
                ? "bg-[#202020] border-white/[0.1] text-[#e6e6e4]"
                : "bg-white border-[#dfdfdc] text-[#37352f]"
            }`}
          >
            <div className={`flex items-center justify-between pb-2.5 border-b ${hairline}`}>
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#eb5757]" />
                <h3 className="text-sm font-semibold">
                  Revisões de {formatDateBR(selectedDayDetail.dateStr)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDayDetail(null)}
                className={`p-1 rounded-md cursor-pointer ${
                  isDark ? "text-white/50 hover:text-white hover:bg-white/[0.08]" : "text-[#37352f]/60 hover:bg-black/[0.05]"
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-0.5">
              {selectedDayDetail.items.map((item) => {
                const nextCycle = getNextPendingNotionCycle(item);
                const nextLabel = nextCycle ? NOTION_CYCLE_LABELS[nextCycle] : "Concluído";
                return (
                  <div key={item.id} className="space-y-0.5">
                    {renderEventPill(item, false)}
                    <div
                      className={`px-2 text-[10px] flex items-center justify-between ${
                        isDark ? "text-white/40" : "text-[#37352f]/55"
                      }`}
                    >
                      <span>{item.materia}</span>
                      <span>{nextCycle ? `Próxima etapa: ${nextLabel}` : "Ciclo completo"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Inspector Notion da Matéria (Semana -> Mês 10 + Check direto) */}
      {activeItemModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setActiveItemModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden ${
              isDark
                ? "bg-[#202020] border-white/[0.1] text-[#e6e6e4]"
                : "bg-white border-[#dfdfdc] text-[#37352f]"
            }`}
          >
            {/* Header limpo do Inspector */}
            <div className={`px-5 py-3.5 border-b flex items-center justify-between ${hairline}`}>
              <div className="flex items-center gap-2 text-xs font-medium opacity-75">
                <span>📕</span>
                <span>Revisões • Notion</span>
              </div>
              <div className="flex items-center gap-1.5">
                {activeItemModal.url && (
                  <a
                    href={activeItemModal.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      isDark
                        ? "text-white/70 hover:text-white hover:bg-white/[0.08]"
                        : "text-[#37352f]/70 hover:text-[#37352f] hover:bg-black/[0.05]"
                    }`}
                  >
                    <span>Abrir no Notion</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setActiveItemModal(null)}
                  className={`p-1 rounded-md cursor-pointer ${
                    isDark ? "text-white/50 hover:text-white hover:bg-white/[0.08]" : "text-[#37352f]/60 hover:bg-black/[0.05]"
                  }`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Título + Botão principal da próxima revisão pendente */}
              <div className="space-y-3">
                <h3 className="text-lg font-semibold leading-snug">{activeItemModal.assunto}</h3>

                {(() => {
                  const nextCycle = getNextPendingNotionCycle(activeItemModal);
                  if (!nextCycle) {
                    return (
                      <div
                        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${
                          isDark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Todos os ciclos (Semana a Mês 10) concluídos!</span>
                      </div>
                    );
                  }
                  const nextLabel = NOTION_CYCLE_LABELS[nextCycle];
                  const afterLabel = getNextCycleLabelAfter(nextCycle);
                  const isBusy = busyPageId === activeItemModal.id;
                  return (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleCheckReview(activeItemModal.id, nextCycle)}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#eb5757] hover:bg-[#d94848] text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {isBusy
                          ? "Salvando no Notion..."
                          : afterLabel
                          ? `Marcar ${nextLabel} como revisado → avança para ${afterLabel}`
                          : `Marcar ${nextLabel} como revisado`}
                      </span>
                    </button>
                  );
                })()}
              </div>

              {/* Propriedades estilo tabela do Notion */}
              <div className={`pt-3 border-t space-y-2 text-xs ${hairline}`}>
                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${isDark ? "text-white/45" : "text-[#37352f]/55"}`}>
                    <BookOpen className="w-3.5 h-3.5" />
                    Matéria
                  </span>
                  <span className="font-medium">{activeItemModal.materia}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${isDark ? "text-white/45" : "text-[#37352f]/55"}`}>
                    <CalendarIcon className="w-3.5 h-3.5" />
                    Data do estudo
                  </span>
                  <span className="tabular-nums">{formatDateBR(activeItemModal.dataEstudo)}</span>
                </div>

                <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 ${isDark ? "text-white/45" : "text-[#37352f]/55"}`}>
                    <Clock className="w-3.5 h-3.5" />
                    Próxima revisão
                  </span>
                  <span className="tabular-nums font-medium">
                    {formatDateBR(activeItemModal.proximaRevisao)}
                  </span>
                </div>

                {activeItemModal.tipoRevisao && activeItemModal.tipoRevisao.length > 0 && (
                  <div className="grid grid-cols-[120px_1fr] items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 ${isDark ? "text-white/45" : "text-[#37352f]/55"}`}>
                      <Tag className="w-3.5 h-3.5" />
                      Tipo
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {activeItemModal.tipoRevisao.map((t) => (
                        <span
                          key={t}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            isDark ? "bg-white/[0.07] text-white/80" : "bg-[#f1f1ef] text-[#37352f]"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Grade completa de Checkboxes do Notion (Semana até Mês 10) */}
              <div className={`pt-3 border-t space-y-2 ${hairline}`}>
                <span className={`text-[11px] font-medium block ${isDark ? "text-white/50" : "text-[#37352f]/60"}`}>
                  Etapas sincronizadas com o Notion (Semana a Mês 10)
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {NOTION_CYCLE_ORDER.map((cycleKey) => {
                    const checked = Boolean(activeItemModal[cycleKey]);
                    const nextPending = getNextPendingNotionCycle(activeItemModal);
                    const isNext = nextPending === cycleKey;
                    const label = NOTION_CYCLE_LABELS[cycleKey];

                    return (
                      <button
                        key={cycleKey}
                        type="button"
                        disabled={busyPageId === activeItemModal.id}
                        onClick={() => void handleCheckReview(activeItemModal.id, cycleKey)}
                        className={`px-2.5 py-2 rounded-lg border text-xs flex items-center justify-between transition-colors cursor-pointer disabled:opacity-50 ${
                          checked
                            ? isDark
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium"
                              : "bg-emerald-50 border-emerald-300 text-emerald-900 font-medium"
                            : isNext
                            ? isDark
                              ? "bg-[#eb5757]/15 border-[#eb5757]/50 text-[#ff9f96] font-medium"
                              : "bg-[#fdeceb] border-[#eb5757]/50 text-[#b42c24] font-medium"
                            : isDark
                            ? "bg-white/[0.03] border-white/[0.08] text-white/60 hover:text-white hover:border-white/20"
                            : "bg-[#fafaf9] border-[#e6e6e3] text-[#37352f]/75 hover:border-[#37352f]/30"
                        }`}
                      >
                        <span>{label}</span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            checked
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : isNext
                              ? "border-[#eb5757]/70"
                              : isDark
                              ? "border-white/20"
                              : "border-[#cfcfcb]"
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[3]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function isDueOrOverdueStyle(isDueOrOverdue: boolean, isDark: boolean): string {
  if (isDueOrOverdue) {
    return isDark
      ? "bg-[#52241f]/95 hover:bg-[#632b25] text-[#fae6e4]"
      : "bg-[#fde8e6] hover:bg-[#fad5d2] text-[#8c231c]";
  }
  return isDark
    ? "bg-[#361e1c]/90 hover:bg-[#472623] text-[#e5c5c2]"
    : "bg-[#fdf3f2] hover:bg-[#fae4e2] text-[#9e3c35]";
}
