import fs from "fs";
import path from "path";
import { NOTION_CYCLE_LABELS, NOTION_CYCLE_ORDER, RevisionCycleKey } from "./src/types";

export interface BackendNotionRevisionItem {
  id: string;
  assunto: string;
  materia: string;
  data: string; // YYYY-MM-DD
  tipoRevisao: string[];
  proximaRevisao?: string;
  semana: boolean;
  mes1: boolean;
  mes2: boolean;
  mes3: boolean;
  mes4: boolean;
  mes5: boolean;
  mes6: boolean;
  mes7: boolean;
  mes8: boolean;
  mes9: boolean;
  mes10: boolean;
  url?: string;
  updatedAt?: string;
}

const NOTION_CACHE_FILE = path.join(process.cwd(), "data", "notion-revisoes-cache.json");
const MAX_NOTION_QUERY_PAGES = 20;

let memoryCache: BackendNotionRevisionItem[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Reads only previously synced real Notion data from local cache; never fabricates seed data.
 */
export function readLocalRevisoes(): BackendNotionRevisionItem[] {
  if (memoryCache && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return memoryCache;
  }

  try {
    if (fs.existsSync(NOTION_CACHE_FILE)) {
      const raw = fs.readFileSync(NOTION_CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryCache = parsed;
        return memoryCache;
      }
    }
  } catch (e) {
    console.warn("[Notion] Falha ao ler cache local:", e);
  }

  return [];
}

/**
 * Saves real Notion results in memory and disk cache.
 */
export function saveLocalRevisoes(items: BackendNotionRevisionItem[]): void {
  try {
    memoryCache = items;
    lastFetchTime = Date.now();
    const dir = path.dirname(NOTION_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(NOTION_CACHE_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (e) {
    console.error("[Notion] Falha ao salvar no cache local:", e);
  }
}

export function getNotionConfig() {
  const apiKey = process.env.NOTION_API_KEY?.trim() || "";
  const databaseId = (
    process.env.NOTION_DATABASE_ID ||
    process.env.NOTION_REVISOES_DB_ID ||
    ""
  ).trim();

  return {
    isConfigured: Boolean(apiKey && databaseId),
    apiKey,
    databaseId,
  };
}

function readCheckbox(props: Record<string, any>, ...names: string[]): boolean {
  for (const name of names) {
    if (props[name] && typeof props[name].checkbox === "boolean") {
      return props[name].checkbox;
    }
  }
  return false;
}

function parseNotionPage(page: any): BackendNotionRevisionItem {
  const props = page.properties || {};

  let assunto = "Sem Título";
  const titleProp = props["Assunto"] || props["Name"] || props["Título"] || props["Nome"];
  if (titleProp?.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
    assunto = titleProp.title.map((t: any) => t.plain_text || "").join("").trim();
  }

  let materia = "Geral";
  const materiaProp = props["Matéria"] || props["Materia"] || props["Disciplina"];
  if (materiaProp?.select?.name) {
    materia = materiaProp.select.name;
  } else if (materiaProp?.multi_select && materiaProp.multi_select[0]?.name) {
    materia = materiaProp.multi_select[0].name;
  }

  let dataStr = "";
  const dataProp = props["Data"] || props["Date"] || props["Data do Estudo"];
  if (dataProp?.date?.start) {
    dataStr = dataProp.date.start.split("T")[0];
  }

  const tipoRevisao: string[] = [];
  const tipoProp = props["Tipo de Revisão"] || props["Tipo de Revisao"] || props["Tipo"];
  if (tipoProp?.multi_select && Array.isArray(tipoProp.multi_select)) {
    tipoProp.multi_select.forEach((item: any) => {
      if (item.name) tipoRevisao.push(item.name);
    });
  } else if (tipoProp?.select?.name) {
    tipoRevisao.push(tipoProp.select.name);
  }

  let proximaRevisao: string | undefined;
  const proxProp = props["Próxima Revisão"] || props["Proxima Revisao"] || props["Próxima revisão"];
  if (proxProp?.date?.start) {
    proximaRevisao = proxProp.date.start.split("T")[0];
  } else if (proxProp?.formula?.date?.start) {
    proximaRevisao = proxProp.formula.date.start.split("T")[0];
  }

  return {
    id: page.id,
    assunto: assunto || "Assunto Não Definido",
    materia,
    data: dataStr,
    tipoRevisao: tipoRevisao.length > 0 ? tipoRevisao : [],
    proximaRevisao,
    semana: readCheckbox(props, "Semana"),
    mes1: readCheckbox(props, "Mês 1", "Mes 1"),
    mes2: readCheckbox(props, "Mês 2", "Mes 2"),
    mes3: readCheckbox(props, "Mês 3", "Mes 3"),
    mes4: readCheckbox(props, "Mês 4", "Mes 4"),
    mes5: readCheckbox(props, "Mês 5", "Mes 5"),
    mes6: readCheckbox(props, "Mês 6", "Mes 6"),
    mes7: readCheckbox(props, "Mês 7", "Mes 7"),
    mes8: readCheckbox(props, "Mês 8", "Mes 8"),
    mes9: readCheckbox(props, "Mês 9", "Mes 9"),
    mes10: readCheckbox(props, "Mês 10", "Mes 10"),
    url: page.url,
    updatedAt: page.last_edited_time || new Date().toISOString(),
  };
}

/**
 * Fetches all pages from the configured Notion database via cursor pagination.
 * Never returns fabricated/seed items when unconfigured or offline.
 */
export async function fetchRevisoesFromNotion(): Promise<{
  items: BackendNotionRevisionItem[];
  source: "notion_api" | "local_cache" | "unavailable";
  error?: string;
}> {
  const { isConfigured, apiKey, databaseId } = getNotionConfig();

  if (!isConfigured) {
    return { items: [], source: "unavailable", error: "NOTION_NOT_CONFIGURED" };
  }

  try {
    const allResults: BackendNotionRevisionItem[] = [];
    let nextCursor: string | undefined;

    for (let page = 0; page < MAX_NOTION_QUERY_PAGES; page++) {
      const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_size: 100,
          ...(nextCursor ? { start_cursor: nextCursor } : {}),
          sorts: [{ property: "Data", direction: "descending" }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Notion API] Status ${response.status}:`, errText);
        const cached = readLocalRevisoes();
        return {
          items: cached,
          source: cached.length > 0 ? "local_cache" : "unavailable",
          error: "NOTION_UNAVAILABLE",
        };
      }

      const data = await response.json();
      const batch = (data.results || []).map(parseNotionPage);
      allResults.push(...batch);

      if (!data.has_more || !data.next_cursor) break;
      nextCursor = data.next_cursor;
    }

    saveLocalRevisoes(allResults);
    return { items: allResults, source: "notion_api" };
  } catch (err: any) {
    console.error("[Notion API] Falha na requisição:", err);
    const cached = readLocalRevisoes();
    return {
      items: cached,
      source: cached.length > 0 ? "local_cache" : "unavailable",
      error: "NOTION_UNAVAILABLE",
    };
  }
}

/**
 * Checks a revision cycle checkbox (Semana or Mês 1..Mês 10) in Notion and returns
 * the updated page parsed directly from Notion's response (including recalculated Próxima Revisão).
 */
export async function updateCheckinInNotion(
  pageId: string,
  cycleKey: RevisionCycleKey,
  checkedValue: boolean = true
): Promise<{ success: boolean; item?: BackendNotionRevisionItem; error?: string }> {
  if (!NOTION_CYCLE_ORDER.includes(cycleKey)) {
    return { success: false, error: "INVALID_CYCLE_KEY" };
  }

  const items = readLocalRevisoes();
  const index = items.findIndex((it) => it.id === pageId);
  const targetItem = index >= 0 ? { ...items[index] } : null;

  // Authorization boundary: only operate on a page already loaded from the configured database.
  if (!targetItem) {
    return { success: false, error: "NOTION_PAGE_NOT_FOUND" };
  }

  const { isConfigured, apiKey } = getNotionConfig();
  if (!isConfigured) {
    return { success: false, error: "NOTION_NOT_CONFIGURED" };
  }

  const notionProp = NOTION_CYCLE_LABELS[cycleKey];

  try {
    const patchRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          [notionProp]: {
            checkbox: checkedValue,
          },
        },
      }),
    });

    if (!patchRes.ok) {
      const err = await patchRes.text();
      console.warn(`[Notion API] Falha ao atualizar checkbox ${notionProp}:`, err);
      return { success: false, error: "NOTION_UPDATE_FAILED" };
    }

    const updatedRaw = await patchRes.json();
    const updatedItem = updatedRaw?.properties
      ? parseNotionPage(updatedRaw)
      : { ...targetItem, [cycleKey]: checkedValue, updatedAt: new Date().toISOString() };

    items[index] = updatedItem;
    saveLocalRevisoes(items);

    return {
      success: true,
      item: updatedItem,
    };
  } catch (e: any) {
    console.error("[Notion API] Erro de rede ao atualizar página:", e);
    return { success: false, error: "NOTION_UPDATE_FAILED" };
  }
}

/**
 * Creates a new row in Notion database.
 */
export async function createStudyInNotion(newStudy: {
  assunto: string;
  materia: string;
  data: string;
  tipoRevisao?: string[];
}): Promise<{ success: boolean; item?: BackendNotionRevisionItem; syncedToNotion: boolean; error?: string }> {
  const { isConfigured, apiKey, databaseId } = getNotionConfig();
  if (!isConfigured) {
    return { success: false, syncedToNotion: false, error: "NOTION_NOT_CONFIGURED" };
  }

  const types = newStudy.tipoRevisao && newStudy.tipoRevisao.length > 0
    ? newStudy.tipoRevisao
    : ["Questões"];

  try {
    const createRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Assunto: {
            title: [{ text: { content: newStudy.assunto } }],
          },
          "Matéria": {
            select: { name: newStudy.materia },
          },
          Data: {
            date: { start: newStudy.data },
          },
          "Tipo de Revisão": {
            multi_select: types.map((t) => ({ name: t })),
          },
          Semana: { checkbox: false },
          "Mês 1": { checkbox: false },
          "Mês 2": { checkbox: false },
          "Mês 3": { checkbox: false },
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.warn(`[Notion API] Falha ao criar página (${createRes.status}):`, errText);
      return { success: false, syncedToNotion: false, error: "NOTION_CREATE_FAILED" };
    }

    const pageData = await createRes.json();
    const createdItem = parseNotionPage(pageData);
    const items = readLocalRevisoes();
    items.unshift(createdItem);
    saveLocalRevisoes(items);

    return {
      success: true,
      item: createdItem,
      syncedToNotion: true,
    };
  } catch (e) {
    console.error("[Notion API] Falha ao enviar nova página:", e);
    return { success: false, syncedToNotion: false, error: "NOTION_CREATE_FAILED" };
  }
}
