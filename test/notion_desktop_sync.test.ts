import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("notionBackend cache helpers validate pageId, upsert/remove items and emit events", async () => {
  const prevCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfo-notion-sync-"));
  process.chdir(tmpDir);
  try {
    const nb = await import("../notionBackend");
    assert.equal(nb.isValidNotionPageId("abc-123"), true);
    assert.equal(nb.isValidNotionPageId("../bad"), false);
    assert.equal(nb.isValidNotionPageId("a?b=1"), false);
    assert.equal(nb.isValidNotionPageId("bad\\id"), false);
    assert.equal(nb.isValidNotionPageId("bad#hash"), false);

    const received: any[] = [];
    const unsubscribe = nb.subscribeNotionChanges((ev: any) => received.push(ev));

    nb.upsertCachedRevisionItem({
      id: "page-1",
      assunto: "Termodinâmica",
      materia: "Física",
      data: "2026-11-10",
      tipoRevisao: ["Questões"],
      proximaRevisao: "2026-11-17",
      semana: false,
      mes1: false,
      mes2: false,
      mes3: false,
      mes4: false,
      mes5: false,
      mes6: false,
      mes7: false,
      mes8: false,
      mes9: false,
      mes10: false,
    });
    assert.equal(nb.readLocalRevisoes().some((i) => i.id === "page-1"), true);
    assert.equal(received.at(-1)?.type, "notion_updated");
    assert.equal(received.at(-1)?.action, "upsert");
    assert.equal(received.at(-1)?.pageId, "page-1");

    nb.removeCachedRevisionItem("page-1");
    assert.equal(nb.readLocalRevisoes().some((i) => i.id === "page-1"), false);
    assert.equal(received.at(-1)?.action, "delete");
    assert.equal(received.at(-1)?.pageId, "page-1");
    unsubscribe();
  } finally {
    process.chdir(prevCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Ignore transient Windows temp handle lock
    }
  }
});

test("desktopNotionAuthorizedUser enforces timing-safe Bearer token and admin/canAccessNotion user", async () => {
  const syncMod = await import("../src/services/notionDesktopSync");

  const prevNotionKey = process.env.DESKTOP_NOTION_API_KEY;
  const prevTimerKey = process.env.DESKTOP_TIMER_API_KEY;
  const prevUserId = process.env.DESKTOP_TIMER_USER_ID;

  process.env.DESKTOP_NOTION_API_KEY = "super-secret-notion-desktop-key";
  process.env.DESKTOP_TIMER_USER_ID = "admin-1";

  try {
    const fakeRepo = {
      findById(id: string) {
        if (id === "admin-1") return { id: "admin-1", username: "admin", role: "admin", canAccessNotion: true };
        if (id === "cadet-1") return { id: "cadet-1", username: "cadet", role: "cadet", canAccessNotion: false };
        return null;
      },
    };

    const mkReq = (auth?: string) => ({
      get(header: string) {
        return header.toLowerCase() === "authorization" ? auth : undefined;
      },
    });

    assert.deepEqual(syncMod.desktopNotionAuthorizedUser(mkReq(undefined) as any, fakeRepo as any), {
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });
    assert.deepEqual(syncMod.desktopNotionAuthorizedUser(mkReq("Bearer wrong-key") as any, fakeRepo as any), {
      ok: false,
      status: 401,
      error: "UNAUTHORIZED",
    });
    assert.deepEqual(
      syncMod.desktopNotionAuthorizedUser(mkReq("Bearer super-secret-notion-desktop-key") as any, fakeRepo as any),
      {
        ok: true,
        userId: "admin-1",
      }
    );

    process.env.DESKTOP_TIMER_USER_ID = "cadet-1";
    assert.deepEqual(
      syncMod.desktopNotionAuthorizedUser(mkReq("Bearer super-secret-notion-desktop-key") as any, fakeRepo as any),
      {
        ok: false,
        status: 403,
        error: "NOTION_FORBIDDEN",
      }
    );
  } finally {
    if (prevNotionKey === undefined) delete process.env.DESKTOP_NOTION_API_KEY;
    else process.env.DESKTOP_NOTION_API_KEY = prevNotionKey;
    if (prevTimerKey === undefined) delete process.env.DESKTOP_TIMER_API_KEY;
    else process.env.DESKTOP_TIMER_API_KEY = prevTimerKey;
    if (prevUserId === undefined) delete process.env.DESKTOP_TIMER_USER_ID;
    else process.env.DESKTOP_TIMER_USER_ID = prevUserId;
  }
});

test("validateDesktopSyncPayload rejects invalid actions, path traversal pageIds, and accepts valid payloads", async () => {
  const syncMod = await import("../src/services/notionDesktopSync");

  assert.equal(syncMod.validateDesktopSyncPayload({ action: "bad" }).ok, false);
  assert.equal(syncMod.validateDesktopSyncPayload({ action: "delete", pageId: "../escape" }).ok, false);
  assert.equal(syncMod.validateDesktopSyncPayload({ action: "delete", pageId: "a?b=c" }).ok, false);
  assert.equal(syncMod.validateDesktopSyncPayload({ action: "upsert", item: { id: "../bad" } }).ok, false);

  const validRefresh = syncMod.validateDesktopSyncPayload({ action: "refresh" });
  assert.equal(validRefresh.ok, true);

  const validUpsert = syncMod.validateDesktopSyncPayload({
    action: "upsert",
    item: {
      id: "page-xyz",
      assunto: "Eletrodinâmica",
      materia: "Física",
      data: "2026-11-18",
      tipoRevisao: ["Questões"],
      proximaRevisao: "2026-11-25",
      semana: false,
      mes1: false,
      mes2: false,
      mes3: false,
      mes4: false,
      mes5: false,
      mes6: false,
      mes7: false,
      mes8: false,
      mes9: false,
      mes10: false,
    },
  });
  assert.equal(validUpsert.ok, true);
});

test("parseNotionSseChunk extracts notion_updated events from partial SSE stream chunks", async () => {
  const ns = await import("../src/services/notionService");
  const chunk1 = `data: {"type":"connected"}\n\n: keep-alive\n\ndata: {"type":"notion_up`;
  const first = ns.parseNotionSseChunk("", chunk1);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0]?.type, "connected");
  assert.equal(first.rest, `data: {"type":"notion_up`);

  const chunk2 = `dated","action":"upsert","pageId":"page-9"}\n\n`;
  const second = ns.parseNotionSseChunk(first.rest, chunk2);
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0]?.type, "notion_updated");
  assert.equal(second.events[0]?.action, "upsert");
  assert.equal(second.events[0]?.pageId, "page-9");
  assert.equal(second.rest, "");
});
