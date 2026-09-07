import fs from "fs";
import path from "path";

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
  url?: string;
  updatedAt?: string;
}

const NOTION_CACHE_FILE = path.join(process.cwd(), "data", "notion-revisoes-cache.json");
const NOTION_SEED_FILE = path.join(process.cwd(), "data", "notion-seed.json");

const DEFAULT_SEED_ITEMS: BackendNotionRevisionItem[] = [
  { id: "notion_01", assunto: "Reações Química", materia: "Química", data: "2026-05-01", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-05", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_02", assunto: "Morfologia I", materia: "Português", data: "2026-05-10", tipoRevisao: ["Pestana", "Questões"], proximaRevisao: "2026-06-16", semana: true, mes1: false, mes2: false, mes3: false },
  { id: "notion_03", assunto: "Periodo Joanino", materia: "História", data: "2026-05-04", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-08", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_04", assunto: "Estequiometria", materia: "Química", data: "2026-05-06", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-10", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_05", assunto: "Angulos", materia: "Matemática III", data: "2026-05-22", tipoRevisao: ["Questões"], proximaRevisao: "2026-08-27", semana: true, mes1: true, mes2: false, mes3: false },
  { id: "notion_06", assunto: "P.G", materia: "Matemática II", data: "2026-05-08", tipoRevisao: ["Questões"], proximaRevisao: "2026-06-14", semana: true, mes1: false, mes2: false, mes3: false },
  { id: "notion_07", assunto: "Independencia e Primeiro Reinado", materia: "História", data: "2026-05-11", tipoRevisao: ["Questões"], proximaRevisao: "2026-05-18", semana: false, mes1: false, mes2: false, mes3: false },
  { id: "notion_08", assunto: "MRUV", materia: "Física I", data: "2026-05-12", tipoRevisao: ["Questões", "PDF"], proximaRevisao: "2026-06-18", semana: true, mes1: false, mes2: false, mes3: false },
  { id: "notion_09", assunto: "Hidrografia do Brasil", materia: "Geografia", data: "2026-05-12", tipoRevisao: ["LDI", "Questões"], proximaRevisao: "2026-09-16", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_10", assunto: "Hidrografia", materia: "Geografia", data: "2026-05-12", tipoRevisao: ["LDI", "Questões"], proximaRevisao: "2026-09-16", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_11", assunto: "Fisiologia Humana II", materia: "Biologia", data: "2026-05-13", tipoRevisao: ["LDI", "Questões"], proximaRevisao: "2026-09-17", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_12", assunto: "Ánalise Gráfica", materia: "Física I", data: "2026-05-16", tipoRevisao: ["Questões"], proximaRevisao: "2026-05-23", semana: false, mes1: false, mes2: false, mes3: false },
  { id: "notion_13", assunto: "Morfologia II", materia: "Português", data: "2026-05-17", tipoRevisao: ["Questões"], proximaRevisao: "2026-05-24", semana: false, mes1: false, mes2: false, mes3: false },
  { id: "notion_14", assunto: "Periodo Contemporaneo II", materia: "História", data: "2026-05-18", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-22", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_15", assunto: "Cinematica Vetorial", materia: "Física I", data: "2026-05-19", tipoRevisao: ["Questões"], proximaRevisao: "2026-05-26", semana: false, mes1: false, mes2: false, mes3: false },
  { id: "notion_16", assunto: "Oxirredução", materia: "Química", data: "2026-05-20", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-24", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_17", assunto: "Classificação biologica", materia: "Biologia", data: "2026-05-20", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-24", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_18", assunto: "Lançamento", materia: "Física I", data: "2026-05-21", tipoRevisao: ["Questões"], proximaRevisao: "2026-05-28", semana: false, mes1: false, mes2: false, mes3: false },
  { id: "notion_19", assunto: "Periodo regencial", materia: "História", data: "2026-05-25", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-29", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_20", assunto: "Meio Ambiente", materia: "Geografia", data: "2026-05-19", tipoRevisao: ["Questões"], proximaRevisao: "2026-09-23", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_21", assunto: "Soluções (DIFICULDADE EM MISTURA, BATER NESSE PONTO FRACO, MISTURA DE DUAS REAÇÕES E N FIZ EXERCICIO)", materia: "Química", data: "2026-05-27", tipoRevisao: ["Questões"], proximaRevisao: "2026-10-01", semana: true, mes1: true, mes2: true, mes3: false },
  { id: "notion_22", assunto: "Taxonomia", materia: "Biologia", data: "2026-05-27", tipoRevisao: ["Questões"], proximaRevisao: "2026-10-01", semana: true, mes1: true, mes2: true, mes3: false }
];

let memoryCache: BackendNotionRevisionItem[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutos de cache para evitar rate-limits

/**
 * Lê do arquivo de cache ou dos dados padrão se o cache não existir.
 */
export function readLocalRevisoes(): BackendNotionRevisionItem[] {
  if (memoryCache && Date.now() - lastFetchTime < CACHE_TTL_MS) {
    return memoryCache;
  }

  try {
    if (fs.existsSync(NOTION_CACHE_FILE)) {
      const raw = fs.readFileSync(NOTION_CACHE_FILE, "utf-8");
      memoryCache = JSON.parse(raw);
      return memoryCache || [];
    }
  } catch (e) {
    console.warn("[Notion] Falha ao ler cache local:", e);
  }

  try {
    if (fs.existsSync(NOTION_SEED_FILE)) {
      const raw = fs.readFileSync(NOTION_SEED_FILE, "utf-8");
      memoryCache = JSON.parse(raw);
      saveLocalRevisoes(memoryCache || []);
      return memoryCache || [];
    }
  } catch (e) {
    console.warn("[Notion] Falha ao ler seed file:", e);
  }

  // Fallback garantido independente de disco
  memoryCache = [...DEFAULT_SEED_ITEMS];
  return memoryCache;
}


/**
 * Grava a lista atualizada no cache local e memória.
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

/**
 * Retorna se o Notion está configurado no .env
 */
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

/**
 * Normaliza os blocos e propriedades do Notion para o nosso objeto tipado
 */
function parseNotionPage(page: any): BackendNotionRevisionItem {
  const props = page.properties || {};

  // Assunto / Title
  let assunto = "Sem Título";
  const titleProp = props["Assunto"] || props["Name"] || props["Título"] || props["Nome"];
  if (titleProp?.title && Array.isArray(titleProp.title) && titleProp.title.length > 0) {
    assunto = titleProp.title.map((t: any) => t.plain_text || "").join("").trim();
  }

  // Matéria
  let materia = "Geral";
  const materiaProp = props["Matéria"] || props["Materia"] || props["Disciplina"];
  if (materiaProp?.select?.name) {
    materia = materiaProp.select.name;
  } else if (materiaProp?.multi_select && materiaProp.multi_select[0]?.name) {
    materia = materiaProp.multi_select[0].name;
  }

  // Data do Estudo
  let dataStr = new Date().toISOString().split("T")[0];
  const dataProp = props["Data"] || props["Date"] || props["Data do Estudo"];
  if (dataProp?.date?.start) {
    dataStr = dataProp.date.start.split("T")[0];
  }

  // Tipo de Revisão
  const tipoRevisao: string[] = [];
  const tipoProp = props["Tipo de Revisão"] || props["Tipo de Revisao"] || props["Tipo"];
  if (tipoProp?.multi_select && Array.isArray(tipoProp.multi_select)) {
    tipoProp.multi_select.forEach((item: any) => {
      if (item.name) tipoRevisao.push(item.name);
    });
  } else if (tipoProp?.select?.name) {
    tipoRevisao.push(tipoProp.select.name);
  }

  // Próxima Revisão
  let proximaRevisao: string | undefined;
  const proxProp = props["Próxima Revisão"] || props["Proxima Revisao"] || props["Próxima revisão"];
  if (proxProp?.date?.start) {
    proximaRevisao = proxProp.date.start.split("T")[0];
  } else if (proxProp?.formula?.date?.start) {
    proximaRevisao = proxProp.formula.date.start.split("T")[0];
  }

  // Checkboxes
  const semana = Boolean(props["Semana"]?.checkbox);
  const mes1 = Boolean(props["Mês 1"]?.checkbox || props["Mes 1"]?.checkbox);
  const mes2 = Boolean(props["Mês 2"]?.checkbox || props["Mes 2"]?.checkbox);
  const mes3 = Boolean(props["Mês 3"]?.checkbox || props["Mes 3"]?.checkbox);

  return {
    id: page.id,
    assunto: assunto || "Assunto Não Definido",
    materia,
    data: dataStr,
    tipoRevisao: tipoRevisao.length > 0 ? tipoRevisao : ["Questões"],
    proximaRevisao,
    semana,
    mes1,
    mes2,
    mes3,
    url: page.url,
    updatedAt: page.last_edited_time || new Date().toISOString(),
  };
}

/**
 * Busca da API oficial do Notion se configurada, ou retorna cache local.
 */
export async function fetchRevisoesFromNotion(): Promise<{
  items: BackendNotionRevisionItem[];
  source: "notion_api" | "local_cache";
  error?: string;
}> {
  const { isConfigured, apiKey, databaseId } = getNotionConfig();

  if (!isConfigured) {
    const items = readLocalRevisoes();
    return { items, source: "local_cache" };
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        sorts: [
          {
            property: "Data",
            direction: "descending",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Notion API] Status ${response.status}:`, errText);
      const fallbackItems = readLocalRevisoes();
      return {
        items: fallbackItems,
        source: "local_cache",
        error: `Notion API respondeu com status ${response.status}. Usando cache local.`,
      };
    }

    const data = await response.json();
    const results = (data.results || []).map(parseNotionPage);
    saveLocalRevisoes(results);

    return {
      items: results,
      source: "notion_api",
    };
  } catch (err: any) {
    console.error("[Notion API] Falha na requisição:", err);
    const fallbackItems = readLocalRevisoes();
    return {
      items: fallbackItems,
      source: "local_cache",
      error: err.message || "Erro de rede ao conectar com o Notion",
    };
  }
}

function calculateNextRevision(item: { data: string; semana: boolean; mes1: boolean; mes2: boolean; mes3: boolean }): string | undefined {
  if (!item.data) return undefined;
  const d = new Date(item.data + "T12:00:00Z");
  if (isNaN(d.getTime())) return undefined;

  if (!item.semana) {
    // 7 dias
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().split("T")[0];
  }
  if (!item.mes1) {
    // 37 dias (aprox 1 mês e 1 semana do estudo original)
    d.setUTCDate(d.getUTCDate() + 37);
    return d.toISOString().split("T")[0];
  }
  if (!item.mes2) {
    // 97 dias (~3 meses do estudo original)
    d.setUTCDate(d.getUTCDate() + 97);
    return d.toISOString().split("T")[0];
  }
  if (!item.mes3) {
    // 127 dias (~4 meses do estudo original)
    d.setUTCDate(d.getUTCDate() + 127);
    return d.toISOString().split("T")[0];
  }
  return undefined;
}

/**
 * Realiza o Check-in atualizando a checkbox no Notion e no cache local
 */
export async function updateCheckinInNotion(
  pageId: string,
  cycleKey: "semana" | "mes1" | "mes2" | "mes3",
  checkedValue: boolean = true
): Promise<{ success: boolean; item?: BackendNotionRevisionItem; error?: string }> {
  const items = readLocalRevisoes();
  const index = items.findIndex((it) => it.id === pageId);
  const targetItem = index >= 0 ? { ...items[index] } : null;

  if (targetItem) {
    targetItem[cycleKey] = checkedValue;
    targetItem.proximaRevisao = calculateNextRevision(targetItem);
    targetItem.updatedAt = new Date().toISOString();
    items[index] = targetItem;
    saveLocalRevisoes(items);
  }

  const { isConfigured, apiKey } = getNotionConfig();

  // Se não estiver conectado à API do Notion, a persistência no cache local já atende perfeitamente!
  if (!isConfigured || pageId.startsWith("notion_seed_")) {
    return {
      success: true,
      item: targetItem || undefined,
    };
  }

  // Mapeia para o nome da propriedade na tabela do Notion
  const propNameMap: Record<string, string> = {
    semana: "Semana",
    mes1: "Mês 1",
    mes2: "Mês 2",
    mes3: "Mês 3",
  };

  const notionProp = propNameMap[cycleKey] || "Semana";

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
    }
  } catch (e: any) {
    console.error("[Notion API] Erro de rede ao atualizar página:", e);
  }

  return {
    success: true,
    item: targetItem || undefined,
  };
}

/**
 * Cria uma nova linha no Notion com Assunto, Matéria, Data e Tipo de Revisão
 */
export async function createStudyInNotion(newStudy: {
  assunto: string;
  materia: string;
  data: string;
  tipoRevisao?: string[];
}): Promise<{ success: boolean; item: BackendNotionRevisionItem; syncedToNotion: boolean }> {
  const { isConfigured, apiKey, databaseId } = getNotionConfig();

  const tempId = `notion_local_${Date.now()}`;
  const types = newStudy.tipoRevisao && newStudy.tipoRevisao.length > 0
    ? newStudy.tipoRevisao
    : ["Questões"];

  // Calcula próxima revisão inicial para +7 dias (Semana)
  const studyDate = new Date(newStudy.data);
  const nextRev = new Date(studyDate);
  nextRev.setDate(nextRev.getDate() + 7);
  const proximaRevisao = nextRev.toISOString().split("T")[0];

  let createdItem: BackendNotionRevisionItem = {
    id: tempId,
    assunto: newStudy.assunto,
    materia: newStudy.materia,
    data: newStudy.data,
    tipoRevisao: types,
    proximaRevisao,
    semana: false,
    mes1: false,
    mes2: false,
    mes3: false,
    updatedAt: new Date().toISOString(),
  };

  let syncedToNotion = false;

  if (isConfigured) {
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
              title: [
                {
                  text: { content: newStudy.assunto },
                },
              ],
            },
            Matéria: {
              select: { name: newStudy.materia },
            },
            Data: {
              date: { start: newStudy.data },
            },
            "Tipo de Revisão": {
              multi_select: types.map((t) => ({ name: t })),
            },
            "Próxima Revisão": {
              date: { start: proximaRevisao },
            },
            Semana: { checkbox: false },
            "Mês 1": { checkbox: false },
            "Mês 2": { checkbox: false },
            "Mês 3": { checkbox: false },
          },
        }),
      });

      if (createRes.ok) {
        const pageData = await createRes.json();
        createdItem.id = pageData.id;
        createdItem.url = pageData.url;
        syncedToNotion = true;
      }
    } catch (e) {
      console.warn("[Notion API] Falha ao enviar nova página, salvando no cache local:", e);
    }
  }

  const items = readLocalRevisoes();
  items.unshift(createdItem);
  saveLocalRevisoes(items);

  return {
    success: true,
    item: createdItem,
    syncedToNotion,
  };
}
