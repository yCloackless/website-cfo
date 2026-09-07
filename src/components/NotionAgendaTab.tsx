import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
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
  ExternalLink,
  ChevronDown,
  Layers,
} from "lucide-react";
import { AppTheme, NotionRevisionItem, NotionCalendarEvent, RevisionCycleKey } from "../types";
import {
  fetchNotionRevisoes,
  checkinRevision,
  createNewStudy,
  generateCalendarEvents,
  getRevisionsDueForDate,
  getSubjectColor,
  getNotionConnectionStatus,
  addDays,
} from "../services/notionService";

interface NotionAgendaTabProps {
  theme: AppTheme;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

const WEEK_DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

export const NotionAgendaTab: React.FC<NotionAgendaTabProps> = ({ theme, showToast }) => {
  const isDark = theme === "dark";

  // Data e estado de revisões
  const [items, setItems] = useState<NotionRevisionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dataSource, setDataSource] = useState<"notion_api" | "local_cache">("local_cache");
  const [notionStatus, setNotionStatus] = useState<{ isConfigured: boolean }>({ isConfigured: false });

  // Filtros
  const [selectedMateria, setSelectedMateria] = useState<string>("TODAS");
  const [statusFilter, setStatusFilter] = useState<"TODAS" | "PENDENTES" | "CONCLUIDAS">("TODAS");

  // Navegação de Meses (Scroll Contínuo)
  // Iniciamos com o mês atual e meses adjacentes
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [today]);

  const [visibleMonths, setVisibleMonths] = useState<Array<{ year: number; month: number }>>([
    { year: 2026, month: 7 }, // Agosto
    { year: 2026, month: 8 }, // Setembro
    { year: 2026, month: 9 }, // Outubro
    { year: 2026, month: 10 }, // Novembro
  ]);

  // Modais
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    dateStr: string;
    events: NotionCalendarEvent[];
  } | null>(null);
  const [isNewStudyModalOpen, setIsNewStudyModalOpen] = useState(false);
  const [newStudyDate, setNewStudyDate] = useState<string>(todayStr);
  const [newSubject, setNewSubject] = useState("Química");
  const [newTopic, setNewTopic] = useState("");
  const [newTypes, setNewTypes] = useState<string[]>(["Questões"]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carregar status e dados iniciais
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
            ? "Sincronizado com o Notion com sucesso!"
            : "Atualizado via cache local de revisões.",
          "success"
        );
      }
    } catch (e: any) {
      showToast("Falha ao carregar dados do Notion.", "error");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // Check-in rápido
  const handleCheckin = async (
    notionId: string,
    cycleKey: RevisionCycleKey,
    currentValue: boolean
  ) => {
    const nextVal = !currentValue;
    // Otimista
    setItems((prev) =>
      prev.map((item) => (item.id === notionId ? { ...item, [cycleKey]: nextVal } : item))
    );

    const res = await checkinRevision(notionId, cycleKey, nextVal);
    if (res.success) {
      showToast(
        nextVal
          ? `Check-in de ${cycleKey === "semana" ? "Semana (7D)" : cycleKey.toUpperCase()} registrado!`
          : `Revisão desmarcada.`,
        "success"
      );
      if (res.item) {
        setItems((prev) => prev.map((item) => (item.id === res.item!.id ? res.item! : item)));
      }
    } else {
      showToast(res.error || "Erro ao registrar check-in", "error");
      // Reverter
      setItems((prev) =>
        prev.map((item) => (item.id === notionId ? { ...item, [cycleKey]: currentValue } : item))
      );
    }
  };

  // Submeter novo estudo
  const handleCreateStudy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim()) {
      showToast("Preencha o nome do assunto.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createNewStudy({
        assunto: newTopic.trim(),
        materia: newSubject,
        data: newStudyDate,
        tipoRevisao: newTypes,
      });

      if (res.success && res.item) {
        setItems((prev) => [res.item!, ...prev]);
        showToast(`"${res.item.assunto}" adicionado à agenda do Notion!`, "success");
        setNewTopic("");
        setIsNewStudyModalOpen(false);
      } else {
        showToast(res.error || "Erro ao cadastrar estudo", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Obter lista de matérias únicas para o filtro
  const uniqueMaterias = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.materia) set.add(it.materia);
    });
    return Array.from(set).sort();
  }, [items]);

  // Itens filtrados
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedMateria !== "TODAS" && item.materia !== selectedMateria) {
        return false;
      }
      return true;
    });
  }, [items, selectedMateria]);

  // Mapa de eventos no calendário
  const eventsByDate = useMemo(() => {
    return generateCalendarEvents(filteredItems);
  }, [filteredItems]);

  // Revisões devidas HOJE para o widget tático
  const todayRevisions = useMemo(() => {
    return getRevisionsDueForDate(filteredItems, todayStr);
  }, [filteredItems, todayStr]);

  // Adicionar meses ao scroll (para cima ou para baixo)
  const addPreviousMonth = () => {
    setVisibleMonths((prev) => {
      const first = prev[0];
      let prevM = first.month - 1;
      let prevY = first.year;
      if (prevM < 0) {
        prevM = 11;
        prevY -= 1;
      }
      return [{ year: prevY, month: prevM }, ...prev];
    });
  };

  const addNextMonth = () => {
    setVisibleMonths((prev) => {
      const last = prev[prev.length - 1];
      let nextM = last.month + 1;
      let nextY = last.year;
      if (nextM > 11) {
        nextM = 0;
        nextY += 1;
      }
      return [...prev, { year: nextY, month: nextM }];
    });
  };

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  return (
    <div className="space-y-6">
      
      {/* 1. SEÇÃO DE DESTAQUE: MATÉRIA DO DIA PARA REVISAR (HERO TÁTICO) */}
      <section
        className={`p-5 rounded-2xl border transition-all shadow-xl relative overflow-hidden ${
          isDark
            ? "bg-[#0B1528] border-slate-800 shadow-black/40"
            : "bg-white border-slate-200 shadow-slate-200/50"
        }`}
      >
        {/* Glow de fundo */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-[#0056D2]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0056D2] to-blue-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-950/40">
              <Flame className="w-6 h-6 animate-pulse text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  className={`text-lg font-black tracking-tight ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  Matérias do Dia para Revisar
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Hoje: {new Date().toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                {todayRevisions.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-extrabold bg-[#0056D2] text-white">
                    {todayRevisions.filter((r) => !r.isCompleted).length} pendentes
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Sincronizado diretamente com a sua tabela do Notion. Dê o check-in aqui e as caixas são marcadas automaticamente!
              </p>
            </div>
          </div>

          {/* Ações Rápidas */}
          <div className="flex items-center gap-2 self-end lg:self-center flex-wrap">
            <button
              onClick={() => {
                setNewStudyDate(todayStr);
                setIsNewStudyModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] transition-colors shadow-md shadow-blue-950/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Estudo / Tópico</span>
            </button>

            <button
              onClick={() => loadData(true)}
              disabled={isSyncing}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isDark
                  ? "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
              title="Recarregar do Notion agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>
          </div>
        </div>

        {/* Lista de Revisões do Dia */}
        <div className="mt-4">
          {todayRevisions.length === 0 ? (
            <div
              className={`py-8 px-4 rounded-xl border text-center flex flex-col items-center justify-center gap-2 ${
                isDark ? "bg-[#070D18]/60 border-slate-800/80" : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h4 className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                Nenhuma revisão pendente para hoje!
              </h4>
              <p className={`text-xs max-w-md ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Parabéns! Seus ciclos de revisão do Notion estão em dia. Aproveite para bater a meta de novos conteúdos ou adiantar o cronograma.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {todayRevisions.map(({ item, cycleKey, cycleLabel, isCompleted }) => {
                const colors = getSubjectColor(item.materia);
                return (
                  <div
                    key={`${item.id}_${cycleKey}`}
                    className={`p-3.5 rounded-xl border transition-all relative flex flex-col justify-between gap-3 ${
                      isCompleted
                        ? isDark
                          ? "bg-emerald-950/20 border-emerald-900/40 opacity-75"
                          : "bg-emerald-50/60 border-emerald-200 opacity-85"
                        : isDark
                        ? `${colors.bg} ${colors.border}`
                        : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${colors.badgeBg}`}
                        >
                          {item.materia}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            cycleKey === "semana"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {cycleLabel}
                        </span>
                      </div>

                      <h4
                        className={`text-sm font-bold leading-snug line-clamp-2 ${
                          isCompleted
                            ? "line-through text-slate-500 dark:text-slate-400"
                            : isDark
                            ? "text-slate-100"
                            : "text-slate-900"
                        }`}
                      >
                        {item.assunto}
                      </h4>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[11px]">
                        {item.tipoRevisao.map((t) => (
                          <span
                            key={t}
                            className={`px-1.5 py-0.2 rounded text-[9.5px] font-medium ${
                              isDark ? "bg-slate-800 text-slate-300" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Botão de Check-in em 1 Clique */}
                    <button
                      onClick={() => handleCheckin(item.id, cycleKey, isCompleted)}
                      className={`w-full py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                        isCompleted
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : "bg-[#0056D2] hover:bg-[#0047B3] text-white"
                      }`}
                    >
                      {isCompleted ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Revisado no Notion ✓</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Fazer Check-in</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 2. BARRA DE FILTROS & CONTROLE DO CALENDÁRIO */}
      <div
        className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
          isDark ? "bg-[#0B1528] border-slate-800" : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Filtrar Matéria:</span>
          </span>

          <button
            onClick={() => setSelectedMateria("TODAS")}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              selectedMateria === "TODAS"
                ? "bg-[#0056D2] text-white"
                : isDark
                ? "bg-slate-900 text-slate-400 hover:text-slate-200"
                : "bg-slate-100 text-slate-600 hover:text-slate-900"
            }`}
          >
            Todas ({items.length})
          </button>

          {uniqueMaterias.slice(0, 6).map((mat) => {
            const isSelected = selectedMateria === mat;
            return (
              <button
                key={mat}
                onClick={() => setSelectedMateria(mat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#0056D2] text-white"
                    : isDark
                    ? "bg-slate-900 text-slate-400 hover:text-slate-200"
                    : "bg-slate-100 text-slate-600 hover:text-slate-900"
                }`}
              >
                {mat}
              </button>
            );
          })}
        </div>

        {/* Status da Fonte */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 ${
              dataSource === "notion_api"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {dataSource === "notion_api" ? "Notion API Conectada" : "Cache Local (Revisões)"}
          </span>
        </div>
      </div>

      {/* Botão de Rolar para Mês Anterior */}
      <div className="flex justify-center">
        <button
          onClick={addPreviousMonth}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
            isDark
              ? "bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500"
              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
          }`}
        >
          <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
          <span>Carregar Mês Anterior</span>
        </button>
      </div>

      {/* 3. CALENDÁRIO COM SCROLL CONTÍNUO (MÊS A MÊS) */}
      <div className="space-y-8">
        {visibleMonths.map(({ year, month }) => {
          const monthTitle = `${monthNames[month].toLowerCase()} ${year}`;

          // Calcular dias do mês
          const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = dom, 1 = seg...
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const daysInPrevMonth = new Date(year, month, 0).getDate();

          // Células do calendário (dias anteriores para preencher a primeira semana)
          const cells: Array<{
            dayNum: number;
            dateStr: string;
            isCurrentMonth: boolean;
            isToday: boolean;
          }> = [];

          // Dias do mês anterior
          for (let i = firstDayIndex - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            let prevM = month - 1;
            let prevY = year;
            if (prevM < 0) {
              prevM = 11;
              prevY -= 1;
            }
            const dateStr = `${prevY}-${String(prevM + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            cells.push({ dayNum, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr });
          }

          // Dias do mês atual
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            cells.push({ dayNum: d, dateStr, isCurrentMonth: true, isToday: dateStr === todayStr });
          }

          // Dias do próximo mês para fechar a última linha
          const remainder = cells.length % 7;
          if (remainder !== 0) {
            const daysToAdd = 7 - remainder;
            for (let nextD = 1; nextD <= daysToAdd; nextD++) {
              let nextM = month + 1;
              let nextY = year;
              if (nextM > 11) {
                nextM = 0;
                nextY += 1;
              }
              const dateStr = `${nextY}-${String(nextM + 1).padStart(2, "0")}-${String(nextD).padStart(2, "0")}`;
              cells.push({ dayNum: nextD, dateStr, isCurrentMonth: false, isToday: dateStr === todayStr });
            }
          }

          return (
            <div
              key={`${year}-${month}`}
              className={`rounded-2xl border transition-all shadow-xl overflow-hidden ${
                isDark ? "bg-[#0B1528] border-slate-800" : "bg-white border-slate-200 shadow-sm"
              }`}
            >
              {/* Cabeçalho do Mês */}
              <div
                className={`px-6 py-4 border-b flex items-center justify-between ${
                  isDark ? "border-slate-800 bg-[#070D18]/80" : "border-slate-200 bg-slate-50"
                }`}
              >
                <h3
                  className={`text-xl font-extrabold tracking-tight capitalize ${
                    isDark ? "text-white" : "text-slate-900"
                  }`}
                >
                  {monthTitle}
                </h3>

                <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  CFO CBMERJ • Ciclo de Revisões
                </span>
              </div>

              {/* Dias da Semana (dom, seg, ter...) */}
              <div
                className={`grid grid-cols-7 border-b text-center text-[11px] font-bold uppercase tracking-wider py-2.5 ${
                  isDark ? "border-slate-800 text-slate-400 bg-[#0B1528]" : "border-slate-200 text-slate-600 bg-slate-100/70"
                }`}
              >
                {WEEK_DAYS.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>

              {/* Grade de Dias */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/40">
                {cells.map((cell, idx) => {
                  const dayEvents = eventsByDate[cell.dateStr] || [];
                  const isToday = cell.isToday;

                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setSelectedDayEvents({
                          dateStr: cell.dateStr,
                          events: dayEvents,
                        })
                      }
                      className={`min-h-[115px] p-2 flex flex-col justify-between transition-colors relative cursor-pointer group ${
                        cell.isCurrentMonth
                          ? isDark
                            ? "bg-[#0B1528] hover:bg-[#0F1D38]"
                            : "bg-white hover:bg-slate-50"
                          : isDark
                          ? "bg-[#070D18]/60 opacity-40 hover:opacity-80"
                          : "bg-slate-50/70 opacity-45 hover:opacity-80"
                      } ${isToday ? (isDark ? "ring-2 ring-blue-500/50 ring-inset" : "ring-2 ring-blue-500 ring-inset") : ""}`}
                    >
                      {/* Topo da Célula: Número do Dia */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-transform group-hover:scale-110 ${
                            isToday
                              ? "bg-red-500 text-white shadow-md shadow-red-950/40"
                              : cell.isCurrentMonth
                              ? isDark
                                ? "text-slate-300"
                                : "text-slate-700"
                              : isDark
                              ? "text-slate-600"
                              : "text-slate-400"
                          }`}
                        >
                          {cell.dayNum}
                        </span>

                        {dayEvents.length > 0 && (
                          <span
                            className={`text-[9.5px] font-semibold px-1 rounded ${
                              isDark ? "text-slate-500" : "text-slate-400"
                            }`}
                          >
                            {dayEvents.length}
                          </span>
                        )}
                      </div>

                      {/* Lista de Eventos do Dia (Pílulas inspiradas no print do usuário) */}
                      <div className="space-y-1 overflow-hidden flex-1">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const colors = getSubjectColor(ev.materia);

                          // Badge de Estudo Original (Verde / Estilo do Print)
                          if (ev.tipo === "estudo") {
                            return (
                              <div
                                key={ev.id}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate flex items-center gap-1 transition-all ${
                                  isDark
                                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/50"
                                    : "bg-emerald-50 border-emerald-300 text-emerald-800"
                                }`}
                                title={`${ev.materia}: ${ev.title}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                <span className="truncate">{ev.title}</span>
                              </div>
                            );
                          }

                          // Badges de Revisão Espaçada
                          let badgeBg = "bg-blue-600/80 text-white";
                          let badgeText = "Revisão";

                          if (ev.tipo === "revisao_24h") {
                            badgeBg = "bg-purple-600 text-white";
                            badgeText = "⚡ 24h";
                          } else if (ev.tipo === "revisao_7d") {
                            badgeBg = "bg-[#0056D2] text-white";
                            badgeText = "📅 7D";
                          } else if (ev.tipo === "revisao_30d") {
                            badgeBg = "bg-amber-600 text-white";
                            badgeText = "⭐ 30D";
                          } else if (ev.tipo === "revisao_60d") {
                            badgeBg = "bg-orange-600 text-white";
                            badgeText = "🎯 60D";
                          } else if (ev.tipo === "revisao_90d") {
                            badgeBg = "bg-amber-700 text-white";
                            badgeText = "🏆 90D";
                          }

                          return (
                            <div
                              key={ev.id}
                              className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border truncate flex items-center justify-between gap-1 ${
                                ev.isCompleted
                                  ? isDark
                                    ? "bg-slate-900/90 text-slate-500 border-slate-800 line-through"
                                    : "bg-slate-200 text-slate-500 border-slate-300 line-through"
                                  : `${badgeBg} border-white/20 shadow-xs`
                              }`}
                              title={`${badgeText} • ${ev.materia}: ${ev.title}`}
                            >
                              <span className="truncate">
                                [{badgeText}] {ev.title}
                              </span>
                              {ev.isCompleted && <Check className="w-2.5 h-2.5 shrink-0" />}
                            </div>
                          );
                        })}

                        {dayEvents.length > 3 && (
                          <div
                            className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded text-center transition-colors ${
                              isDark
                                ? "text-blue-400 bg-blue-950/30 hover:bg-blue-950/60"
                                : "text-blue-600 bg-blue-50 hover:bg-blue-100"
                            }`}
                          >
                            +{dayEvents.length - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão de Rolar para Próximo Mês */}
      <div className="flex justify-center pt-2">
        <button
          onClick={addNextMonth}
          className={`px-5 py-2 rounded-full text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
            isDark
              ? "bg-[#0056D2] hover:bg-[#0047B3] text-white border-blue-400/30 shadow-blue-950/40"
              : "bg-[#0056D2] hover:bg-[#0047B3] text-white border-blue-600 shadow-slate-200"
          }`}
        >
          <span>Carregar Próximo Mês</span>
          <ChevronRight className="w-3.5 h-3.5 rotate-90" />
        </button>
      </div>

      {/* 4. MODAL DE DETALHES DO DIA SELECIONADO */}
      {selectedDayEvents && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 relative max-h-[85vh] overflow-y-auto ${
              isDark ? "bg-[#0B1528] border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                  Agenda de Estudos
                </p>
                <h3 className="text-lg font-bold">
                  {new Date(selectedDayEvents.dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              </div>

              <button
                onClick={() => setSelectedDayEvents(null)}
                className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                  isDark
                    ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900"
                }`}
              >
                ✕
              </button>
            </div>

            {/* Itens do Dia */}
            <div className="space-y-3">
              {selectedDayEvents.events.length === 0 ? (
                <p className={`text-xs py-4 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Nenhuma sessão ou revisão registrada para este dia.
                </p>
              ) : (
                selectedDayEvents.events.map((ev) => {
                  const colors = getSubjectColor(ev.materia);
                  const isStudy = ev.tipo === "estudo";

                  return (
                    <div
                      key={ev.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                        isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colors.badgeBg}`}>
                            {ev.materia}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold uppercase ${
                              isStudy
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {isStudy ? "Estudo Realizado" : ev.tipo.replace("revisao_", "Revisão ")}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold">{ev.title}</h4>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                          {ev.tipoRevisao.map((t) => (
                            <span key={t} className="bg-slate-800 px-1.5 py-0.2 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Botão de Check-in para Ciclos */}
                      {ev.cycleKey && (
                        <button
                          onClick={() => {
                            handleCheckin(ev.notionId, ev.cycleKey!, ev.isCompleted);
                            setSelectedDayEvents((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    events: prev.events.map((e) =>
                                      e.id === ev.id ? { ...e, isCompleted: !e.isCompleted } : e
                                    ),
                                  }
                                : null
                            );
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                            ev.isCompleted
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-[#0056D2] text-white hover:bg-[#0047B3]"
                          }`}
                        >
                          {ev.isCompleted ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Revisado</span>
                            </>
                          ) : (
                            <span>Check-in</span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Ação de Adicionar Estudo neste dia */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between">
              <button
                onClick={() => {
                  setNewStudyDate(selectedDayEvents.dateStr);
                  setSelectedDayEvents(null);
                  setIsNewStudyModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Estudo neste Dia</span>
              </button>

              <button
                onClick={() => setSelectedDayEvents(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DE CADASTRO DE NOVO ESTUDO NO NOTION */}
      {isNewStudyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 relative ${
              isDark ? "bg-[#0B1528] border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold">Registrar Estudo no Notion</h3>
              </div>
              <button
                onClick={() => setIsNewStudyModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateStudy} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Assunto / Conteúdo Estudado
                </label>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Ex: Reações Orgânicas, Eletroquímica, Matrizes..."
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-medium outline-hidden transition-all ${
                    isDark
                      ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600"
                  }`}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Matéria
                  </label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium outline-hidden ${
                      isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  >
                    <option value="Química">Química</option>
                    <option value="Matemática I">Matemática I</option>
                    <option value="Matemática II">Matemática II</option>
                    <option value="Física I">Física I</option>
                    <option value="Física II">Física II</option>
                    <option value="História">História</option>
                    <option value="Geografia">Geografia</option>
                    <option value="Biologia">Biologia</option>
                    <option value="Língua Portuguesa">Língua Portuguesa</option>
                    <option value="Redação">Redação</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Data do Estudo
                  </label>
                  <input
                    type="date"
                    value={newStudyDate}
                    onChange={(e) => setNewStudyDate(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-medium outline-hidden ${
                      isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Tipo de Revisão
                </label>
                <div className="flex flex-wrap gap-2">
                  {["Questões", "Apostila", "LDI", "Qcon", "Teoria"].map((type) => {
                    const isChecked = newTypes.includes(type);
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => {
                          if (isChecked) {
                            setNewTypes(newTypes.filter((t) => t !== type));
                          } else {
                            setNewTypes([...newTypes, type]);
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          isChecked
                            ? "bg-[#0056D2] border-blue-400 text-white"
                            : isDark
                            ? "bg-slate-900 border-slate-700 text-slate-400"
                            : "bg-slate-100 border-slate-300 text-slate-700"
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewStudyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#0056D2] hover:bg-[#0047B3] shadow-md shadow-blue-950/40 transition-colors cursor-pointer"
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
