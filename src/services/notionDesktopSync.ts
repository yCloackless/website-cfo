import crypto from "crypto";
import type { Request, Response } from "express";
import { BackendNotionRevisionItem, isValidNotionPageId, NotionChangeEvent } from "../../notionBackend";
import { DEFAULT_CFO_SUBJECTS } from "../data/cfoSubjects";

export type DesktopSyncPayload =
  | { action: "refresh" }
  | { action: "delete"; pageId: string }
  | { action: "upsert"; item: BackendNotionRevisionItem };

export type DesktopAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

export interface DesktopUserRecord {
  id: string;
  username?: string;
  role: string;
  canAccessNotion?: boolean;
}

/**
 * Validates the desktop Notion sync Bearer token using constant-time comparison
 * and ensures the configured target user is permitted to access Notion data.
 */
export function desktopNotionAuthorizedUser(
  req: Pick<Request, "get">,
  userRepo: { findById: (id: string) => DesktopUserRecord | null | undefined }
): DesktopAuthResult {
  const expectedKey =
    process.env.DESKTOP_NOTION_API_KEY?.trim() ||
    process.env.DESKTOP_TIMER_API_KEY?.trim() ||
    "";
  const suppliedHeader = String(req.get("authorization") || "");
  if (!expectedKey || !/^Bearer\s+/i.test(suppliedHeader)) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const suppliedKey = suppliedHeader.replace(/^Bearer\s+/i, "").trim();
  const expectedBuffer = Buffer.from(expectedKey);
  const suppliedBuffer = Buffer.from(suppliedKey);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const userId = (process.env.DESKTOP_TIMER_USER_ID || "").trim();
  const targetUser = userId ? userRepo.findById(userId) : null;
  if (!targetUser) {
    return { ok: false, status: 401, error: "UNAUTHORIZED" };
  }

  const canAccess = targetUser.role === "admin" || Boolean(targetUser.canAccessNotion);
  if (!canAccess) {
    return { ok: false, status: 403, error: "NOTION_FORBIDDEN" };
  }

  return { ok: true, userId: targetUser.id };
}

function normalizeIsoDatePrefix(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/.exec(trimmed);
  return match ? match[1] : null;
}

function sanitizeNotionItem(raw: unknown): BackendNotionRevisionItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const assunto = typeof obj.assunto === "string" ? obj.assunto.trim().slice(0, 300) : "";
  const materia = typeof obj.materia === "string" ? obj.materia.trim().slice(0, 120) : "";
  const data = normalizeIsoDatePrefix(obj.data);

  if (!isValidNotionPageId(id) || !assunto || data === null) return null;

  const proximaRaw = normalizeIsoDatePrefix(obj.proximaRevisao);
  if (proximaRaw === null) return null;

  const tipoRevisao = Array.isArray(obj.tipoRevisao)
    ? obj.tipoRevisao.filter((t): t is string => typeof t === "string").map((t) => t.trim().slice(0, 80)).filter(Boolean).slice(0, 20)
    : [];

  const rawUrl = typeof obj.url === "string" ? obj.url.trim() : "";
  const safeUrl = /^https:\/\/(?:www\.)?notion\.so\//.test(rawUrl) ? rawUrl.slice(0, 500) : undefined;

  return {
    id,
    assunto,
    materia: materia || "Geral",
    data,
    tipoRevisao,
    ...(proximaRaw ? { proximaRevisao: proximaRaw } : {}),
    semana: Boolean(obj.semana),
    mes1: Boolean(obj.mes1),
    mes2: Boolean(obj.mes2),
    mes3: Boolean(obj.mes3),
    mes4: Boolean(obj.mes4),
    mes5: Boolean(obj.mes5),
    mes6: Boolean(obj.mes6),
    mes7: Boolean(obj.mes7),
    mes8: Boolean(obj.mes8),
    mes9: Boolean(obj.mes9),
    mes10: Boolean(obj.mes10),
    ...(safeUrl ? { url: safeUrl } : {}),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt.slice(0, 64) : new Date().toISOString(),
  };
}

export function validateDesktopSyncPayload(
  body: unknown
): { ok: true; payload: DesktopSyncPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "INVALID_SYNC_PAYLOAD" };
  }
  const obj = body as Record<string, unknown>;
  const action = obj.action;

  if (action === "refresh") {
    return { ok: true, payload: { action: "refresh" } };
  }

  if (action === "delete") {
    const pageId = typeof obj.pageId === "string" ? obj.pageId.trim() : "";
    if (!isValidNotionPageId(pageId)) {
      return { ok: false, error: "INVALID_PAGE_ID" };
    }
    return { ok: true, payload: { action: "delete", pageId } };
  }

  if (action === "upsert") {
    const item = sanitizeNotionItem(obj.item);
    if (!item) {
      return { ok: false, error: "INVALID_NOTION_ITEM" };
    }
    return { ok: true, payload: { action: "upsert", item } };
  }

  return { ok: false, error: "INVALID_SYNC_ACTION" };
}

function parseJsonSafely<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildDesktopStudyBalancePayload(
  userId: string,
  startDate: string,
  endDate: string,
  userRepo: { findById: (id: string) => DesktopUserRecord | null | undefined },
  userStateRepo: { getValue: (userId: string, key: string) => string | null },
  studySessionRepo: { getDailySummaryBetweenDates: (userId: string, startDate: string, endDate: string) => Record<string, any> }
) {
  const user = userRepo.findById(userId);
  const suffix =
    user?.username?.toLowerCase() === "admin"
      ? ""
      : `_${String(user?.username || "").toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;

  const rawSubjects = userStateRepo.getValue(userId, `cfo_cbmerj_subjects_v1${suffix}`);
  const parsedSubjects = parseJsonSafely<any[]>(rawSubjects, []);
  const subjects = Array.isArray(parsedSubjects) && parsedSubjects.length > 0 ? parsedSubjects : DEFAULT_CFO_SUBJECTS;

  const currentCycle = parseJsonSafely<any>(
    userStateRepo.getValue(userId, `cfo_cbmerj_active_cycle_v1${suffix}`),
    null
  );
  const cyclesHistory = parseJsonSafely<any[]>(
    userStateRepo.getValue(userId, `cfo_cbmerj_cycles_history_v1${suffix}`),
    []
  );
  const monthlySessionDays = studySessionRepo.getDailySummaryBetweenDates(userId, startDate, endDate);

  return {
    success: true,
    startDate,
    endDate,
    subjects,
    currentCycle,
    cyclesHistory: Array.isArray(cyclesHistory) ? cyclesHistory : [],
    monthlySessionDays,
  };
}

export function attachNotionSseStream(
  req: Pick<Request, "on">,
  res: Pick<Response, "setHeader" | "write" | "end"> & { flushHeaders?: () => void },
  isSessionValid: () => boolean,
  subscribe: (listener: (event: NotionChangeEvent) => void) => () => void,
  heartbeatMs: number = 25000
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "connected", updatedAt: new Date().toISOString() })}\n\n`);

  let closed = false;
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  unsubscribe = subscribe((event) => {
    if (!isSessionValid()) {
      cleanup();
      try {
        res.end();
      } catch {
        // Ignore already closed stream
      }
      return;
    }
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      cleanup();
    }
  });

  heartbeat = setInterval(() => {
    if (!isSessionValid()) {
      cleanup();
      try {
        res.end();
      } catch {
        // Ignore already closed stream
      }
      return;
    }
    try {
      res.write(`: keep-alive\n\n`);
    } catch {
      cleanup();
    }
  }, heartbeatMs);

  req.on("close", cleanup);
}
