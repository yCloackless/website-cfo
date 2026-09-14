import { BizuItem } from '../types';
import { getUserStorageKey } from './userStorage';
import { queuePersistentSync } from '../services/remotePersistence';

const getStorageKey = () => getUserStorageKey('cfo_bizuario_items');

// SVG map diagram representation for the default Seas & Straits of Europe and Middle East
export const DEFAULT_MAP_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" width="100%" height="100%">
  <defs>
    <linearGradient id="oceanBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a5f" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0f2b48" />
    </linearGradient>
    <linearGradient id="landGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#d4b886" />
      <stop offset="100%" stop-color="#b59963" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Ocean Background -->
  <rect width="1000" height="650" fill="url(#oceanBg)"/>

  <!-- Continental Landmass Silhouettes (Schematic Europe, Africa & Middle East) -->
  <!-- Scandinavia & North Europe -->
  <path d="M280,30 Q330,80 370,50 T480,90 T540,60 L570,180 Q480,210 400,170 T310,130 Z" fill="url(#landGrad)" opacity="0.9" stroke="#937840" stroke-width="1.5"/>
  <!-- British Isles -->
  <path d="M210,140 Q250,130 260,180 T220,230 T190,180 Z" fill="url(#landGrad)" opacity="0.9" stroke="#937840" stroke-width="1.5"/>
  <!-- Western & Central Europe -->
  <path d="M190,260 Q270,250 350,260 T520,260 T640,280 Q620,380 500,360 T350,380 T210,380 T150,330 Z" fill="url(#landGrad)" opacity="0.95" stroke="#937840" stroke-width="1.5"/>
  <!-- Iberian Peninsula (Spain/Portugal) -->
  <path d="M110,360 L210,350 L200,430 L110,430 Z" fill="url(#landGrad)" stroke="#937840" stroke-width="1.5"/>
  <!-- Italy -->
  <path d="M370,350 L420,440 L400,460 L360,370 Z" fill="url(#landGrad)" stroke="#937840" stroke-width="1.5"/>
  <!-- Balkans & Greece -->
  <path d="M470,360 Q520,380 510,450 T480,470 T440,410 Z" fill="url(#landGrad)" stroke="#937840" stroke-width="1.5"/>
  <!-- Anatolia / Turkey -->
  <path d="M530,370 Q660,370 700,390 T690,440 T540,430 Z" fill="url(#landGrad)" stroke="#937840" stroke-width="1.5"/>
  <!-- North Africa -->
  <path d="M80,480 Q300,470 540,490 T600,530 T550,650 L80,650 Z" fill="#c9a769" stroke="#937840" stroke-width="1.5"/>
  <!-- Arabian Peninsula & Middle East -->
  <path d="M600,470 Q750,460 850,520 T890,650 L640,650 Q610,560 600,470 Z" fill="#d9b675" stroke="#937840" stroke-width="1.5"/>

  <!-- Title Badge Top Left -->
  <g filter="url(#shadow)" transform="translate(25, 25)">
    <rect width="440" height="75" rx="10" fill="#0b1329" stroke="#3b82f6" stroke-width="2"/>
    <text x="220" y="32" fill="#60a5fa" font-family="system-ui, sans-serif" font-weight="900" font-size="14" text-anchor="middle" letter-spacing="1">BIZUÁRIO GEOPOLÍTICO &amp; MILITAR</text>
    <text x="220" y="58" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="16" text-anchor="middle">MARES, CANAIS E ESTREITOS (EUROPA E ORIENTE MÉDIO)</text>
  </g>

  <!-- Water Labels -->
  <!-- Ocean Atlantic -->
  <text x="60" y="280" fill="#93c5fd" font-family="system-ui, sans-serif" font-weight="800" font-size="15" letter-spacing="2">OCEANO ATLÂNTICO</text>
  <!-- North Sea -->
  <text x="310" y="190" fill="#e0f2fe" font-family="system-ui, sans-serif" font-weight="700" font-size="12">MAR DO NORTE</text>
  <!-- Baltic Sea -->
  <text x="430" y="150" fill="#e0f2fe" font-family="system-ui, sans-serif" font-weight="700" font-size="12">MAR BÁLTICO</text>
  <!-- Norwegian Sea -->
  <text x="350" y="90" fill="#e0f2fe" font-family="system-ui, sans-serif" font-weight="700" font-size="12">MAR DA NORUEGA</text>

  <!-- Mediterranean Sea -->
  <text x="280" y="440" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="900" font-size="18" filter="url(#shadow)">MAR MEDITERRÂNEO</text>
  <!-- Black Sea -->
  <text x="560" y="340" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="14">MAR NEGRO</text>
  <!-- Caspian Sea -->
  <text x="750" y="310" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="14">MAR CÁSPIO</text>
  <!-- Red Sea -->
  <text x="630" y="580" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="14">MAR VERMELHO</text>
  <!-- Persian Gulf -->
  <text x="760" y="550" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="14">GOLFO PÉRSICO</text>
  <!-- Arabian Sea / Oman -->
  <text x="840" y="600" fill="#93c5fd" font-family="system-ui, sans-serif" font-weight="700" font-size="13">MAR DE OMÃ</text>

  <!-- Key Chokepoints (Straits & Canals) with Callout Badges -->
  <!-- 1. Strait of Gibraltar -->
  <g filter="url(#shadow)" transform="translate(15, 410)">
    <rect width="180" height="52" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="10" y="20" fill="#fbbf24" font-family="system-ui, sans-serif" font-weight="bold" font-size="11">ESTREITO DE GIBRALTAR</text>
    <text x="10" y="38" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="9.5">Liga Mediterrâneo ao Atlântico</text>
    <circle cx="195" cy="26" r="5" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
    <line x1="180" y1="26" x2="190" y2="26" stroke="#fbbf24" stroke-width="2"/>
  </g>

  <!-- 2. Bosphorus Strait -->
  <g filter="url(#shadow)" transform="translate(560, 260)">
    <rect width="170" height="52" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="10" y="20" fill="#fbbf24" font-family="system-ui, sans-serif" font-weight="bold" font-size="11">BÓSFORO (ESTREITO)</text>
    <text x="10" y="38" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="9.5">Liga Mar Negro ao Mármara</text>
    <circle cx="0" cy="50" r="5" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
  </g>

  <!-- 3. Suez Canal -->
  <g filter="url(#shadow)" transform="translate(430, 500)">
    <rect width="190" height="55" rx="6" fill="#1e293b" stroke="#a855f7" stroke-width="2"/>
    <text x="10" y="20" fill="#c084fc" font-family="system-ui, sans-serif" font-weight="bold" font-size="11">CANAL DE SUEZ (ARTIFICIAL)</text>
    <text x="10" y="36" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="9">Liga Mediterrâneo ao Mar Vermelho</text>
    <text x="10" y="48" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="8.5">Encurta rota Europa - Ásia</text>
    <circle cx="180" cy="5" r="5" fill="#a855f7" stroke="#ffffff" stroke-width="1.5"/>
  </g>

  <!-- 4. Strait of Hormuz -->
  <g filter="url(#shadow)" transform="translate(750, 470)">
    <rect width="200" height="60" rx="6" fill="#1e293b" stroke="#ef4444" stroke-width="2"/>
    <text x="10" y="20" fill="#f87171" font-family="system-ui, sans-serif" font-weight="bold" font-size="11">ESTREITO DE ORMUZ</text>
    <text x="10" y="36" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="9">Liga Golfo Pérsico ao Mar de Omã</text>
    <text x="10" y="50" fill="#fbbf24" font-family="system-ui, sans-serif" font-size="8.5 font-weight=bold">Gargalo estratégico do petróleo!</text>
    <circle cx="5" cy="55" r="5" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>
  </g>

  <!-- Legend Box Bottom Left -->
  <g filter="url(#shadow)" transform="translate(25, 480)">
    <rect width="360" height="150" rx="10" fill="#0f172a" opacity="0.95" stroke="#334155" stroke-width="1.5"/>
    <text x="15" y="25" fill="#f8fafc" font-family="system-ui, sans-serif" font-weight="bold" font-size="13">LEGENDA DOS PONTOS ESTRATÉGICOS</text>
    
    <rect x="15" y="40" width="12" height="12" rx="2" fill="#2563eb"/>
    <text x="35" y="51" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="11">Mares Mediterrâneos (Mediterrâneo, Negro, Vermelho, Pérsico)</text>

    <rect x="15" y="65" width="12" height="12" rx="2" fill="#10b981"/>
    <text x="35" y="76" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="11">Mares Interiores (Báltico, Cáspio, Azov, Mármara, Noruega)</text>

    <rect x="15" y="90" width="12" height="12" rx="2" fill="#a855f7"/>
    <text x="35" y="101" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="11">Canais Artificiais (Canal de Suez - encurta rota comercial)</text>

    <rect x="15" y="115" width="12" height="12" rx="2" fill="#ef4444"/>
    <text x="35" y="126" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="11">Estreitos Naturais (Gibraltar, Bósforo, Ormuz, Kerch)</text>
  </g>

  <!-- Compass Rose Top Right -->
  <g transform="translate(940, 60)">
    <circle cx="0" cy="0" r="28" fill="#0f172a" stroke="#cbd5e1" stroke-width="1.5"/>
    <polygon points="0,-22 5,-4 0,0 -5,-4" fill="#ef4444"/>
    <polygon points="0,22 5,4 0,0 -5,4" fill="#94a3b8"/>
    <polygon points="22,0 4,5 0,0 4,-5" fill="#94a3b8"/>
    <polygon points="-22,0 -4,5 0,0 -4,-5" fill="#94a3b8"/>
    <text x="0" y="-10" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="900" font-size="11" text-anchor="middle">N</text>
  </g>
</svg>
`)}`;

export const INITIAL_BIZU_ITEMS: BizuItem[] = [
  {
    id: 'bizu_mares_europa_oriente_medio',
    title: 'Mares, Canais e Estreitos Mais Importantes (Europa e Oriente Médio)',
    subjectName: 'Geografia',
    category: 'Geopolítica & Cartografia',
    imageUrl: DEFAULT_MAP_SVG,
    imageAlt: 'Mapa esquemático de Mares, Canais e Estreitos da Europa e Oriente Médio',
    tags: ['Mares', 'Canais', 'Estreitos', 'Europa', 'Oriente Médio', 'Geopolítica', 'Comércio'],
    isFavorite: true,
    keyPoints: [
      'Estreito de Gibraltar: conecta o Mar Mediterrâneo ao Oceano Atlântico (passagem estratégica chave).',
      'Canal de Suez: canal artificial que liga o Mar Mediterrâneo ao Mar Vermelho, encurtando a rota marítima Europa-Ásia.',
      'Estreito de Ormuz: ponto de estrangulamento (chokepoint) do petróleo ligando o Golfo Pérsico ao Mar de Omã e Oceano Índico.',
      'Estreito de Bósforo e Dardanelos: conectam o Mar Negro ao Mar de Mármara e Mar Egeu/Mediterrâneo.',
      'Mar Cáspio: maior corpo d\'água interior (lago fechado) do mundo, rico em hidrocarbonetos.',
      'Mar Negro e Mar de Azov: ligados pelo Estreito de Kerch, cruciais no conflito geopolítico e escoamento de grãos.'
    ],
    notes: `Tópico 1 - Mares Mediterrâneos (Geopolítica Global)
• Mar Mediterrâneo: berço histórico do comércio ocidental.
• Mar Negro: saída marítima da Europa Oriental e Rússia.
• Mar Vermelho: via marítima direta entre Ásia e Europa via Suez.
• Golfo Pérsico (Golfo Árabe): maior bacia produtora e exportadora de petróleo mundial.
• Mar de Omã e Mar de Alborão.

Tópico 2 - Mares Interiores & Transcontinentais
• Mar Báltico: norte da Europa.
• Mar do Norte: rico em petróleo e gás natural offshore.
• Mar da Noruega: rota estratégica no Ártico.
• Mar Cáspio: maior lago endorreico fechado do planeta, riquíssimo em hidrocarbonetos.
• Mar de Azov e Mar de Mármara.

Tópico 3 - Canais Artificiais Estratégicos
• Canal de Suez: aberto em 1869, liga o Mar Mediterrâneo ao Mar Vermelho.
• Elimina a necessidade de circum-navegar todo o continente africano (pelo Cabo da Boa Esperança).

Tópico 4 - Estreitos Naturais & Gargalos (Chokepoints)
• Estreito de Gibraltar: passagem chave ligando o Oceano Atlântico ao Mar Mediterrâneo.
• Bósforo & Dardanelos: controle obrigatório das saídas do Mar Negro para o Mediterrâneo.
• Estreito de Ormuz: passagem estratégica de ~20% de todo o petróleo mundial (Gargalo Militar).
• Estreito de Kerch: acesso entre o Mar Negro e o Mar de Azov.`,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-05T11:00:00.000Z',
  }
];

/* =========================================================================
   SISTEMA DE ARMAZENAMENTO RESILIENTE (IndexedDB + LocalStorage Fallback)
   Elimina completamente o erro "QuotaExceededError" ao lidar com imagens e Bizus.
   ========================================================================= */

const IDB_DB_NAME = 'cfo_cmberj_app_db';
const IDB_STORE_NAME = 'cfo_kv_store';

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

let memoryBizuCache: BizuItem[] | null = null;
let memoryBizuCacheKey: string | null = null;
const bizuSubscribers = new Set<(items: BizuItem[]) => void>();

function isAdminStorageUser(): boolean {
  try {
    return (localStorage.getItem('cfo_terminal_user') || '').trim().toLowerCase() === 'admin';
  } catch {
    return false;
  }
}

export function subscribeBizuItems(callback: (items: BizuItem[]) => void): () => void {
  bizuSubscribers.add(callback);
  return () => {
    bizuSubscribers.delete(callback);
  };
}

function notifyBizuSubscribers(items: BizuItem[]): void {
  bizuSubscribers.forEach((cb) => {
    try {
      cb(items);
    } catch {
      // Ignora falhas isoladas de ouvintes
    }
  });
}

/**
 * Salva no localStorage com proteção contra estouro de quota (5MB).
 * Se as imagens em base64 forem grandes, mantém as imagens intactas no IndexedDB
 * e armazena uma versão higienizada no localStorage.
 */
function trySaveToLocalStorage(items: BizuItem[]): void {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(items));
  } catch {
    try {
      // Tentativa 2: Sanitiza imagens base64 volumosas no localStorage
      const sanitized = items.map((item) => {
        let cleanItem = item;
        if (item.imageUrl && item.imageUrl.startsWith('data:image/') && item.imageUrl.length > 5000) {
          cleanItem = { ...cleanItem, imageUrl: '' };
        }
        if (Array.isArray(item.imageUrls) && item.imageUrls.some((u) => u.startsWith('data:image/') && u.length > 5000)) {
          cleanItem = {
            ...cleanItem,
            imageUrls: item.imageUrls.map((u) => (u.startsWith('data:image/') && u.length > 5000 ? '' : u)).filter(Boolean),
          };
        }
        return cleanItem;
      });
      localStorage.setItem(getStorageKey(), JSON.stringify(sanitized));
      console.info('[Bizuário Storage] Imagens pesadas salvas no IndexedDB de alta capacidade.');
    } catch {
      // Tentativa 3: Mantém somente os registros mais recentes no localStorage
      try {
        const minimal = items.slice(0, 15).map((item) => ({
          ...item,
          imageUrl: item.imageUrl && item.imageUrl.length > 5000 ? '' : item.imageUrl,
          imageUrls: Array.isArray(item.imageUrls)
            ? item.imageUrls.map((u) => (u.length > 5000 ? '' : u)).filter(Boolean)
            : [],
        }));
        localStorage.setItem(getStorageKey(), JSON.stringify(minimal));
      } catch {
        // Falha silenciosa de localStorage: os dados completos estão salvos no IndexedDB e na memória
      }
    }
  }
}

function normalizeBizuItems(items: BizuItem[]): BizuItem[] {
  // Remove somente os cabeçalhos criados pela versão antiga do Bizuário.
  // Textos novos continuam intactos; anotações geradas pela IA são marcadas
  // como `ai` e preservam a estrutura que a IA escolheu.
  return items.map((item) => {
    // Normaliza imageUrls caso apenas imageUrl exista
    let normalized = item;
    if (!normalized.imageUrls || normalized.imageUrls.length === 0) {
      if (normalized.imageUrl) {
        normalized = { ...normalized, imageUrls: [normalized.imageUrl] };
      }
    }
    if (!normalized.notes || normalized.notesMode === 'ai') return normalized;
    const notes = normalized.notes.replace(/^\s*T[oó]pico\s*\d+\s*[-–—:]\s*[^\n]*\n?/gim, '').trim();
    return notes === normalized.notes ? normalized : { ...normalized, notes, notesMode: 'plain' };
  });
}

function mergeBizuStorageCopies(localItems: BizuItem[], indexedDbItems: BizuItem[]): BizuItem[] {
  const merged = new Map<string, BizuItem>();

  indexedDbItems.forEach((item) => merged.set(item.id, item));
  localItems.forEach((localItem) => {
    const indexedDbItem = merged.get(localItem.id);
    const resolvedImageUrls =
      indexedDbItem?.imageUrls && indexedDbItem.imageUrls.length > 0
        ? indexedDbItem.imageUrls
        : localItem.imageUrls && localItem.imageUrls.length > 0
        ? localItem.imageUrls
        : (localItem.imageUrl || indexedDbItem?.imageUrl)
        ? [localItem.imageUrl || indexedDbItem?.imageUrl || '']
        : [];

    merged.set(localItem.id, {
      ...indexedDbItem,
      ...localItem,
      // The localStorage fallback intentionally removes large images. Keep
      // the complete IndexedDB copy when that happens.
      imageUrl: localItem.imageUrl || indexedDbItem?.imageUrl || resolvedImageUrls[0] || '',
      imageUrls: resolvedImageUrls,
    });
  });

  return Array.from(merged.values());
}

export function loadBizuItems(): BizuItem[] {
  const storageKey = getStorageKey();
  if (memoryBizuCache !== null && memoryBizuCacheKey === storageKey) {
    return memoryBizuCache;
  }

  try {
    const raw = localStorage.getItem(getStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = normalizeBizuItems(parsed);
        memoryBizuCache = normalized;
        memoryBizuCacheKey = storageKey;
        return normalized;
      }
    }
  } catch {
    // Ignora erro de leitura e prossegue para inicialização padrão
  }

  // O conteúdo inicial pertence somente ao administrador. Usuários comuns
  // começam com o Bizuário vazio e constroem seu próprio material.
  memoryBizuCache = isAdminStorageUser() ? INITIAL_BIZU_ITEMS : [];
  memoryBizuCacheKey = storageKey;
  // Dispara salvamento inicial seguro
  saveBizuItems(memoryBizuCache);
  return memoryBizuCache;
}

/**
 * Carrega os itens com imagens em resolução total do IndexedDB
 * de forma assíncrona ao iniciar a aplicação.
 */
export async function initBizuStorageAsync(onLoaded?: (items: BizuItem[]) => void): Promise<BizuItem[]> {
  try {
    const localRaw = localStorage.getItem(getStorageKey());
    const localItems = localRaw ? JSON.parse(localRaw) : [];
    const idbItems = await idbGet<BizuItem[]>(getStorageKey());

    if ((Array.isArray(localItems) && localItems.length > 0) || (Array.isArray(idbItems) && idbItems.length > 0)) {
      const normalized = normalizeBizuItems(
        mergeBizuStorageCopies(
          Array.isArray(localItems) ? localItems : [],
          Array.isArray(idbItems) ? idbItems : [],
        ),
      );
      memoryBizuCache = normalized;
      memoryBizuCacheKey = getStorageKey();
      await idbSet(getStorageKey(), normalized);
      trySaveToLocalStorage(normalized);
      notifyBizuSubscribers(normalized);
      if (onLoaded) onLoaded(normalized);
      return normalized;
    }

    // Se IndexedDB ainda não possui, migra do localStorage ou inicial
    const current = loadBizuItems();
    await idbSet(getStorageKey(), current);
    return current;
  } catch {
    return loadBizuItems();
  }
}

export function saveBizuItems(items: BizuItem[]): void {
  memoryBizuCache = items;
  memoryBizuCacheKey = getStorageKey();
  notifyBizuSubscribers(items);

  // 1. Salva a versão integral (com imagens completas) no IndexedDB
  idbSet(getStorageKey(), items).catch(() => {});

  // 2. Salva no localStorage com resiliência de quota
  trySaveToLocalStorage(items);
  // IndexedDB mantém a cópia rica local; o payload completo também é enviado
  // ao snapshot autenticado no banco para sobreviver a rebuild/deploy.
  try { queuePersistentSync({ [getStorageKey()]: JSON.stringify(items) }); } catch {}
}

export function addBizuItem(item: Omit<BizuItem, 'id' | 'createdAt' | 'updatedAt'>): BizuItem {
  const current = loadBizuItems();
  const newItem: BizuItem = {
    ...item,
    id: `bizu_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const updated = [newItem, ...current];
  saveBizuItems(updated);
  return newItem;
}

export function updateBizuItem(id: string, updates: Partial<BizuItem>): BizuItem[] {
  const current = loadBizuItems();
  const updated = current.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b));
  saveBizuItems(updated);
  return updated;
}

export function deleteBizuItem(id: string): BizuItem[] {
  const current = loadBizuItems();
  const filtered = current.filter((b) => b.id !== id);
  saveBizuItems(filtered);
  return filtered;
}
