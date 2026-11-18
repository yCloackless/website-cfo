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
