import {
  NOTION_CYCLE_LABELS,
  NOTION_CYCLE_ORDER,
  NotionRevisionItem,
  NotionCalendarEvent,
  RevisionCycleKey,
} from "../types";
import { apiFetch } from "./apiFetch";

const LOCAL_STORAGE_KEY = "cfo_notion_revisoes_cache_v1";

/**
 * Paleta de cores oficial alinhada ao visual do Notion e do CFO CBMERJ
 */
export const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string; badgeBg: string }> = {
  Química: {
    bg: "bg-rose-950/40 hover:bg-rose-950/60",
    text: "text-rose-300",
    border: "border-rose-800/50",
    badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  "Química I": {
    bg: "bg-rose-950/40 hover:bg-rose-950/60",
    text: "text-rose-300",
    border: "border-rose-800/50",
    badgeBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  História: {
    bg: "bg-emerald-950/40 hover:bg-emerald-950/60",
    text: "text-emerald-300",
    border: "border-emerald-800/50",
    badgeBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
  "Matemática I": {
    bg: "bg-indigo-950/40 hover:bg-indigo-950/60",
    text: "text-indigo-300",
    border: "border-indigo-800/50",
    badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  },
  "Matemática II": {
    bg: "bg-purple-950/40 hover:bg-purple-950/60",
    text: "text-purple-300",
    border: "border-purple-800/50",
    badgeBg: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  Matemática: {
    bg: "bg-indigo-950/40 hover:bg-indigo-950/60",
    text: "text-indigo-300",
    border: "border-indigo-800/50",
    badgeBg: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  },
  Biologia: {
    bg: "bg-teal-950/40 hover:bg-teal-950/60",
    text: "text-teal-300",
    border: "border-teal-800/50",
    badgeBg: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  },
  Geografia: {
    bg: "bg-sky-950/40 hover:bg-sky-950/60",
    text: "text-sky-300",
    border: "border-sky-800/50",
    badgeBg: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  },
  "Física I": {
    bg: "bg-violet-950/40 hover:bg-violet-950/60",
    text: "text-violet-300",
    border: "border-violet-800/50",
    badgeBg: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  },
  "Física II": {
    bg: "bg-violet-950/40 hover:bg-violet-950/60",
    text: "text-violet-300",
    border: "border-violet-800/50",
    badgeBg: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  },
  Física: {
    bg: "bg-violet-950/40 hover:bg-violet-950/60",
    text: "text-violet-300",
    border: "border-violet-800/50",
    badgeBg: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  },
  "Língua Portuguesa": {
    bg: "bg-amber-950/40 hover:bg-amber-950/60",
    text: "text-amber-300",
    border: "border-amber-800/50",
    badgeBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  Redação: {
    bg: "bg-orange-950/40 hover:bg-orange-950/60",
    text: "text-orange-300",
    border: "border-orange-800/50",
    badgeBg: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  },
  Default: {
    bg: "bg-slate-900/60 hover:bg-slate-800/80",
    text: "text-slate-300",
    border: "border-slate-700/50",
    badgeBg: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  },
};

export function getSubjectColor(subjectName: string) {
  return (
    SUBJECT_COLORS[subjectName] ||
    Object.entries(SUBJECT_COLORS).find(([k]) =>
      subjectName.toLowerCase().includes(k.toLowerCase())
    )?.[1] ||
    SUBJECT_COLORS.Default
  );
}

/**
 * Adiciona dias a uma data no formato YYYY-MM-DD
 */
export function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Status da conexão com o Notion
 */
export async function getNotionConnectionStatus(): Promise<{
  isConfigured: boolean;
  hasApiKey: boolean;
  hasDatabaseId: boolean;
}> {
  try {
    const res = await fetch("/api/notion/status");
    if (!res.ok) throw new Error("Status endpoint falhou");
    return await res.json();
  } catch (e) {
    return { isConfigured: false, hasApiKey: false, hasDatabaseId: false };
  }
}

/**
 * Carrega a lista de revisões (do backend ou cache local)
 */
export async function fetchNotionRevisoes(): Promise<{
  items: NotionRevisionItem[];
  source: "notion_api" | "local_cache" | "unavailable";
  error?: string;
}> {
  try {
    const res = await fetch("/api/notion/revisoes");
    if (res.status === 403 || res.status === 401) {
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch (_) {}
      return { items: [], source: "unavailable", error: "NOTION_FORBIDDEN" };
    }
    if (res.ok) {
      const data = await res.json();
      if (data.items && Array.isArray(data.items)) {
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.items));
        } catch (_) {}
        return {
          items: data.items,
          source: data.source || "notion_api",
          error: data.error,
        };
      }
    }
  } catch (e: any) {
    console.warn("Falha na chamada de revisões do Notion:", e);
  }

  return { items: [], source: "unavailable" };
}

/**
 * Realiza o check-in de uma revisão no Notion
 */
export async function checkinRevision(
  pageId: string,
  cycleKey: RevisionCycleKey,
  checked: boolean = true
): Promise<{ success: boolean; item?: NotionRevisionItem; error?: string }> {
  try {
    const res = await fetch("/api/notion/checkin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, cycleKey, checked }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, item: data.item };
    }
    const err = await res.json();
    return { success: false, error: err.message || "Erro no check-in" };
  } catch (e: any) {
    return { success: false, error: e.message || "Falha de rede" };
  }
}

function updateCachedNotionItems(updater: (items: NotionRevisionItem[]) => NotionRevisionItem[]): void {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updater(parsed)));
    }
  } catch (_) {}
}

/**
 * Cria um novo estudo no Notion
 */
export async function createNewStudy(study: {
  assunto: string;
  materia: string;
  data: string;
  tipoRevisao?: string[];
}): Promise<{ success: boolean; item?: NotionRevisionItem; error?: string }> {
  try {
    const res = await fetch("/api/notion/novo-estudo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(study),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.item) {
        updateCachedNotionItems((items) => [data.item, ...items]);
      }
      return { success: true, item: data.item };
    }
    const err = await res.json();
    return { success: false, error: err.message || "Erro ao criar estudo" };
  } catch (e: any) {
    return { success: false, error: e.message || "Falha de rede" };
  }
}

export async function renameNotionStudy(
  pageId: string,
  assunto: string
): Promise<{ success: boolean; item?: NotionRevisionItem; error?: string }> {
  try {
    const res = await fetch(`/api/notion/estudo/${encodeURIComponent(pageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assunto }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.item) {
      updateCachedNotionItems((items) => items.map((it) => (it.id === pageId ? data.item : it)));
      return { success: true, item: data.item };
    }
    return { success: false, error: data.message || "Erro ao renomear estudo no Notion" };
  } catch (e: any) {
    return { success: false, error: e.message || "Falha de rede" };
  }
}

export async function duplicateNotionStudy(
  pageId: string
): Promise<{ success: boolean; item?: NotionRevisionItem; error?: string }> {
  try {
    const res = await fetch(`/api/notion/estudo/${encodeURIComponent(pageId)}/duplicar`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.item) {
      updateCachedNotionItems((items) => [data.item, ...items]);
      return { success: true, item: data.item };
    }
    return { success: false, error: data.message || "Erro ao duplicar estudo no Notion" };
  } catch (e: any) {
    return { success: false, error: e.message || "Falha de rede" };
  }
}

export async function deleteNotionStudy(
  pageId: string
): Promise<{ success: boolean; deletedId?: string; error?: string }> {
  try {
    const res = await fetch(`/api/notion/estudo/${encodeURIComponent(pageId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      updateCachedNotionItems((items) => items.filter((it) => it.id !== pageId));
      return { success: true, deletedId: data.deletedId || pageId };
    }
    return { success: false, error: data.message || "Erro ao excluir estudo no Notion" };
  } catch (e: any) {
    return { success: false, error: e.message || "Falha de rede" };
  }
}

/**
 * Gera todos os eventos do calendário (estudos originais + revisões projetadas)
 */
export function generateCalendarEvents(items: NotionRevisionItem[]): Record<string, NotionCalendarEvent[]> {
  const eventsByDate: Record<string, NotionCalendarEvent[]> = {};

  function addEvent(dateStr: string, ev: NotionCalendarEvent) {
    if (!eventsByDate[dateStr]) {
      eventsByDate[dateStr] = [];
    }
    eventsByDate[dateStr].push(ev);
  }

  items.forEach((item) => {
    // 1. Estudo Original
    if (item.data) {
      addEvent(item.data, {
        id: `study_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "estudo",
        dateStr: item.data,
        isCompleted: true,
        tipoRevisao: item.tipoRevisao,
      });

      // 2. Revisão de 24 horas (+1 dia)
      const d24h = addDays(item.data, 1);
      addEvent(d24h, {
        id: `rev24_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "revisao_24h",
        dateStr: d24h,
        isCompleted: item.semana, // Se semana foi feita, 24h foi superada
        tipoRevisao: item.tipoRevisao,
      });

      // 3. Revisão da Semana / 7 Dias (+7 dias)
      const d7d = addDays(item.data, 7);
      addEvent(d7d, {
        id: `rev7d_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "revisao_7d",
        cycleKey: "semana",
        dateStr: d7d,
        isCompleted: item.semana,
        tipoRevisao: item.tipoRevisao,
      });

      // 4. Revisão Mês 1 / 30 Dias (+30 dias)
      const d30d = addDays(item.data, 30);
      addEvent(d30d, {
        id: `rev30d_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "revisao_30d",
        cycleKey: "mes1",
        dateStr: d30d,
        isCompleted: item.mes1,
        tipoRevisao: item.tipoRevisao,
      });

      // 5. Revisão Mês 2 / 60 Dias (+60 dias)
      const d60d = addDays(item.data, 60);
      addEvent(d60d, {
        id: `rev60d_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "revisao_60d",
        cycleKey: "mes2",
        dateStr: d60d,
        isCompleted: item.mes2,
        tipoRevisao: item.tipoRevisao,
      });

      // 6. Revisão Mês 3 / 90 Dias (+90 dias)
      const d90d = addDays(item.data, 90);
      addEvent(d90d, {
        id: `rev90d_${item.id}`,
        notionId: item.id,
        title: item.assunto,
        materia: item.materia,
        tipo: "revisao_90d",
        cycleKey: "mes3",
        dateStr: d90d,
        isCompleted: item.mes3,
        tipoRevisao: item.tipoRevisao,
      });
    }

    // 7. Próxima Revisão do Notion (se explícita e diferente das calculadas)
    if (item.proximaRevisao && item.proximaRevisao !== item.data) {
      // Se não houver evento idêntico naquele dia
      const existing = eventsByDate[item.proximaRevisao];
      const alreadyHas = existing?.some(
        (e) => e.notionId === item.id && (e.tipo === "proxima" || e.tipo.startsWith("revisao_"))
      );
      if (!alreadyHas) {
        addEvent(item.proximaRevisao, {
          id: `rev_next_${item.id}`,
          notionId: item.id,
          title: item.assunto,
          materia: item.materia,
          tipo: "proxima",
          dateStr: item.proximaRevisao,
          isCompleted: false,
          tipoRevisao: item.tipoRevisao,
        });
      }
    }
  });

  return eventsByDate;
}

/**
 * Obtém as revisões devidas para a data atual (ou data fornecida)
 */
export function getRevisionsDueForDate(
  items: NotionRevisionItem[],
  targetDateStr: string
): Array<{
  item: NotionRevisionItem;
  cycleKey: RevisionCycleKey;
  cycleLabel: string;
  isCompleted: boolean;
  dueDate: string;
}> {
  const result: Array<{
    item: NotionRevisionItem;
    cycleKey: RevisionCycleKey;
    cycleLabel: string;
    isCompleted: boolean;
    dueDate: string;
  }> = [];

  items.forEach((item) => {
    // 1. Ciclo Semana (7d)
    const due7d = addDays(item.data, 7);
    if (due7d === targetDateStr || (item.proximaRevisao === targetDateStr && !item.semana)) {
      result.push({
        item,
        cycleKey: "semana",
        cycleLabel: "Semana (7D)",
        isCompleted: item.semana,
        dueDate: due7d,
      });
      return;
    }

    // 2. Ciclo Mês 1 (30d)
    const due30d = addDays(item.data, 30);
    if (due30d === targetDateStr || (item.proximaRevisao === targetDateStr && item.semana && !item.mes1)) {
      result.push({
        item,
        cycleKey: "mes1",
        cycleLabel: "Mês 1 (30D)",
        isCompleted: item.mes1,
        dueDate: due30d,
      });
      return;
    }

    // 3. Ciclo Mês 2 (60d)
    const due60d = addDays(item.data, 60);
    if (due60d === targetDateStr || (item.proximaRevisao === targetDateStr && item.mes1 && !item.mes2)) {
      result.push({
        item,
        cycleKey: "mes2",
        cycleLabel: "Mês 2 (60D)",
        isCompleted: item.mes2,
        dueDate: due60d,
      });
      return;
    }

    // 4. Ciclo Mês 3 (90d)
    const due90d = addDays(item.data, 90);
    if (due90d === targetDateStr || (item.proximaRevisao === targetDateStr && item.mes2 && !item.mes3)) {
      result.push({
        item,
        cycleKey: "mes3",
        cycleLabel: "Mês 3 (90D)",
        isCompleted: item.mes3,
        dueDate: due90d,
      });
      return;
    }

    // Se a Próxima Revisão coincide com a data exata e ainda não foi catalogada
    if (item.proximaRevisao === targetDateStr) {
      let pendingKey: RevisionCycleKey = "semana";
      let pendingLabel = "Semana (7D)";
      if (item.semana && !item.mes1) {
        pendingKey = "mes1";
        pendingLabel = "Mês 1 (30D)";
      } else if (item.mes1 && !item.mes2) {
        pendingKey = "mes2";
        pendingLabel = "Mês 2 (60D)";
      } else if (item.mes2 && !item.mes3) {
        pendingKey = "mes3";
        pendingLabel = "Mês 3 (90D)";
      }

      const isCompleted = Boolean(item[pendingKey]);
      result.push({
        item,
        cycleKey: pendingKey,
        cycleLabel: pendingLabel,
        isCompleted,
        dueDate: item.proximaRevisao,
      });
    }
  });

  return result;
}

export interface ParsedNotionSseEvent {
  type: string;
  action?: string;
  pageId?: string;
  updatedAt?: string;
}

export function parseNotionSseChunk(
  buffer: string,
  chunk: string
): { events: ParsedNotionSseEvent[]; rest: string } {
  const combined = `${buffer}${chunk}`.replace(/\r\n/g, "\n");
  const blocks = combined.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: ParsedNotionSseEvent[] = [];

  for (const block of blocks) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (dataLines.length === 0) continue;
    try {
      const parsed = JSON.parse(dataLines.join("\n"));
      if (parsed && typeof parsed.type === "string") {
        events.push(parsed as ParsedNotionSseEvent);
      }
    } catch {
      // Ignore malformed SSE JSON payload
    }
  }

  return { events, rest };
}

export function subscribeNotionEvents(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  let closed = false;
  let controller: AbortController | null = null;
  let reconnectTimer: number | null = null;
  let attempt = 0;

  const scheduleReconnect = () => {
    if (closed) return;
    const delayMs = Math.min(30000, 1500 * Math.pow(2, attempt));
    attempt = Math.min(attempt + 1, 5);
    reconnectTimer = window.setTimeout(() => {
      void connect();
    }, delayMs);
  };

  const connect = async () => {
    if (closed) return;
    controller = new AbortController();
    try {
      const res = await apiFetch("/api/notion/events", {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        if (res.status === 401 || res.status === 403) return;
        scheduleReconnect();
        return;
      }

      attempt = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const parsed = parseNotionSseChunk(buffer, text);
        buffer = parsed.rest;
        if (parsed.events.some((ev) => ev.type === "notion_updated")) {
          onChange();
        }
      }
      if (!closed) scheduleReconnect();
    } catch {
      if (!closed) scheduleReconnect();
    }
  };

  void connect();

  return () => {
    closed = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    controller?.abort();
  };
}
