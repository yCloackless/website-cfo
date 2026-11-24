export type SidebarGroupId = 'principal' | 'studies' | 'actions' | 'system';

export type SidebarLayoutConfig = {
  version: 1;
  groups: Record<SidebarGroupId, string[]>;
};

export interface SidebarItemMeta {
  id: string;
  label: string;
  defaultGroup: SidebarGroupId;
  badge?: string;
}

export const SIDEBAR_LAYOUT_STORAGE_KEY = 'cfo_sidebar_layout_v1';
export const SIDEBAR_LAYOUT_EVENT = 'cfo-sidebar-layout-updated';

export const SIDEBAR_GROUP_ORDER: SidebarGroupId[] = [
  'principal',
  'studies',
  'actions',
  'system',
];

export const SIDEBAR_GROUP_TITLES: Record<SidebarGroupId, string> = {
  principal: 'PRINCIPAL',
  studies: 'ESTUDOS & DESEMPENHO',
  actions: 'AÇÕES TÁTICAS',
  system: 'SISTEMA & ADMINISTRAÇÃO',
};

export const DEFAULT_SIDEBAR_GROUPS: Record<SidebarGroupId, string[]> = {
  principal: ['ifrij', 'table', 'examBank', 'bizuario', 'highyield'],
  studies: [
    'monthlyHours',
    'timer',
    'learning',
    'ai',
    'simulations',
    'leveling',
    'millionGame',
    'flashcards',
    'calculator',
    'calendar',
  ],
  actions: ['revisions', 'addSubject', 'history'],
  system: ['notifications', 'browserExtension', 'settings', 'adminSecurity'],
};

export const SIDEBAR_ITEM_CATALOG: Record<string, SidebarItemMeta> = {
  ifrij: { id: 'ifrij', label: 'Rumo ao VEST', defaultGroup: 'principal', badge: 'NOVO' },
  table: { id: 'table', label: 'Cronograma', defaultGroup: 'principal' },
  examBank: { id: 'examBank', label: 'Banco de Provas', defaultGroup: 'principal', badge: 'IA' },
  bizuario: { id: 'bizuario', label: 'Bizuário', defaultGroup: 'principal' },
  highyield: { id: 'highyield', label: 'Mais Caem', defaultGroup: 'principal', badge: 'Raio-X' },

  monthlyHours: { id: 'monthlyHours', label: 'Agenda de Horas', defaultGroup: 'studies', badge: 'Horas' },
  timer: { id: 'timer', label: 'Cronômetro', defaultGroup: 'studies' },
  learning: { id: 'learning', label: 'Radar', defaultGroup: 'studies', badge: 'Aluno' },
  ai: { id: 'ai', label: 'IA Equilíbrio', defaultGroup: 'studies' },
  simulations: { id: 'simulations', label: 'Simulados', defaultGroup: 'studies' },
  leveling: { id: 'leveling', label: 'Nivelamento', defaultGroup: 'studies', badge: '80%' },
  millionGame: { id: 'millionGame', label: 'Show do Milhão', defaultGroup: 'studies', badge: '1M' },
  flashcards: { id: 'flashcards', label: 'Flashcards', defaultGroup: 'studies', badge: 'Anki' },
  calculator: { id: 'calculator', label: 'Calculadora IA', defaultGroup: 'studies', badge: 'LaTeX' },
  calendar: { id: 'calendar', label: 'Agenda Notion', defaultGroup: 'studies', badge: 'Notion' },

  revisions: { id: 'revisions', label: 'Revisões Espaçadas', defaultGroup: 'actions' },
  addSubject: { id: 'addSubject', label: 'Adicionar Matéria', defaultGroup: 'actions' },
  history: { id: 'history', label: 'Histórico de Ciclos', defaultGroup: 'actions' },

  notifications: { id: 'notifications', label: 'Notificações', defaultGroup: 'system' },
  browserExtension: { id: 'browserExtension', label: 'Extensão Web (PC)', defaultGroup: 'system', badge: 'NOVO' },
  settings: { id: 'settings', label: 'Configurações', defaultGroup: 'system' },
  adminSecurity: { id: 'adminSecurity', label: 'Painel de Segurança ADM', defaultGroup: 'system', badge: 'ADM' },
};

const KNOWN_ITEM_IDS = new Set<string>(Object.keys(SIDEBAR_ITEM_CATALOG));
const VALID_GROUP_IDS = new Set<string>(SIDEBAR_GROUP_ORDER);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check whether a value is one of the canonical sidebar group identifiers. */
export function isSidebarGroupId(value: unknown): value is SidebarGroupId {
  return typeof value === 'string' && VALID_GROUP_IDS.has(value);
}

/** Create a fresh deep copy of the default sidebar layout configuration. */
export function createDefaultSidebarLayout(): SidebarLayoutConfig {
  return {
    version: 1,
    groups: {
      principal: [...DEFAULT_SIDEBAR_GROUPS.principal],
      studies: [...DEFAULT_SIDEBAR_GROUPS.studies],
      actions: [...DEFAULT_SIDEBAR_GROUPS.actions],
      system: [...DEFAULT_SIDEBAR_GROUPS.system],
    },
  };
}

/**
 * Normalize an arbitrary persisted payload into a valid SidebarLayoutConfig.
 * Removes unknown IDs and duplicates (keeping first occurrence), preserves
 * user-assigned groups and order, and appends missing default IDs into their
 * defaultGroup.
 */
export function normalizeSidebarLayout(raw: unknown): SidebarLayoutConfig {
  const groups: Record<SidebarGroupId, string[]> = {
    principal: [],
    studies: [],
    actions: [],
    system: [],
  };
  const seen = new Set<string>();

  if (isPlainRecord(raw) && isPlainRecord(raw.groups)) {
    const rawGroups = raw.groups;
    for (const groupId of SIDEBAR_GROUP_ORDER) {
      const entries = rawGroups[groupId];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (typeof entry !== 'string' || !KNOWN_ITEM_IDS.has(entry) || seen.has(entry)) {
          continue;
        }
        seen.add(entry);
        groups[groupId].push(entry);
      }
    }
  }

  for (const groupId of SIDEBAR_GROUP_ORDER) {
    for (const defaultId of DEFAULT_SIDEBAR_GROUPS[groupId]) {
      if (!seen.has(defaultId)) {
        seen.add(defaultId);
        groups[groupId].push(defaultId);
      }
    }
  }

  return {
    version: 1,
    groups,
  };
}

/** Read and normalize the sidebar layout from localStorage safely (SSR/test-safe). */
export function loadSidebarLayout(): SidebarLayoutConfig {
  try {
    const storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
    if (!storage || typeof storage.getItem !== 'function') {
      return createDefaultSidebarLayout();
    }
    const raw = storage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return createDefaultSidebarLayout();
    }
    return normalizeSidebarLayout(JSON.parse(raw));
  } catch {
    return createDefaultSidebarLayout();
  }
}

/**
 * Normalize, persist to localStorage, broadcast SIDEBAR_LAYOUT_EVENT on window,
 * and return the normalized layout.
 */
export function saveSidebarLayout(layout: SidebarLayoutConfig): SidebarLayoutConfig {
  const normalized = normalizeSidebarLayout(layout);

  try {
    const storage = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined;
    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
    }
  } catch {
    // Ignore storage write errors (quota/SSR/restricted environments)
  }

  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.dispatchEvent === 'function' &&
      typeof CustomEvent === 'function'
    ) {
      window.dispatchEvent(new CustomEvent(SIDEBAR_LAYOUT_EVENT, { detail: normalized }));
    }
  } catch {
    // Ignore event dispatch errors in minimal test mocks
  }

  return normalized;
}

/** Reset the persisted sidebar layout back to defaults and broadcast the update. */
export function resetSidebarLayout(): SidebarLayoutConfig {
  return saveSidebarLayout(createDefaultSidebarLayout());
}

/** Return true if the layout matches the default grouping and order exactly. */
export function isDefaultSidebarLayout(layout: SidebarLayoutConfig): boolean {
  const normalized = normalizeSidebarLayout(layout);
  for (const groupId of SIDEBAR_GROUP_ORDER) {
    const current = normalized.groups[groupId];
    const defaults = DEFAULT_SIDEBAR_GROUPS[groupId];
    if (current.length !== defaults.length) return false;
    for (let i = 0; i < defaults.length; i += 1) {
      if (current[i] !== defaults[i]) return false;
    }
  }
  return true;
}

function findItemLocation(
  layout: SidebarLayoutConfig,
  itemId: string
): { groupId: SidebarGroupId; index: number } | null {
  for (const groupId of SIDEBAR_GROUP_ORDER) {
    const index = layout.groups[groupId].indexOf(itemId);
    if (index !== -1) {
      return { groupId, index };
    }
  }
  return null;
}

function cloneGroups(groups: Record<SidebarGroupId, string[]>): Record<SidebarGroupId, string[]> {
  return {
    principal: [...groups.principal],
    studies: [...groups.studies],
    actions: [...groups.actions],
    system: [...groups.system],
  };
}

/**
 * Immutably move an item to targetGroupId at targetIndex (using pre-removal slot
 * coordinates 0..group.length, with clamping and intra-group index adjustment when
 * sourceIndex < targetIndex).
 */
export function moveSidebarItem(
  layout: SidebarLayoutConfig,
  itemId: string,
  targetGroupId: SidebarGroupId,
  targetIndex: number
): SidebarLayoutConfig {
  const current = normalizeSidebarLayout(layout);
  if (!KNOWN_ITEM_IDS.has(itemId) || !isSidebarGroupId(targetGroupId)) {
    return current;
  }

  const location = findItemLocation(current, itemId);
  if (!location) {
    return current;
  }

  const nextGroups = cloneGroups(current.groups);
  const sourceList = nextGroups[location.groupId];
  const targetPreRemovalLength = current.groups[targetGroupId].length;
  const rawIndex = Number.isFinite(targetIndex) ? Math.trunc(targetIndex) : 0;
  const clampedPreIndex = Math.max(0, Math.min(rawIndex, targetPreRemovalLength));

  sourceList.splice(location.index, 1);

  if (location.groupId === targetGroupId) {
    const adjustedIndex =
      location.index < clampedPreIndex ? clampedPreIndex - 1 : clampedPreIndex;
    const finalIndex = Math.max(0, Math.min(adjustedIndex, sourceList.length));
    sourceList.splice(finalIndex, 0, itemId);
  } else {
    const targetList = nextGroups[targetGroupId];
    const finalIndex = Math.max(0, Math.min(clampedPreIndex, targetList.length));
    targetList.splice(finalIndex, 0, itemId);
  }

  return {
    version: 1,
    groups: nextGroups,
  };
}

/**
 * Immutably move an item one visible step up or down, crossing group boundaries
 * when at the top or bottom of a group. When availableIds is provided, hidden
 * items are skipped visually without losing their group placement.
 */
export function stepSidebarItem(
  layout: SidebarLayoutConfig,
  itemId: string,
  direction: 'up' | 'down',
  availableIds?: ReadonlySet<string>
): SidebarLayoutConfig {
  const current = normalizeSidebarLayout(layout);
  const isVisible = (id: string) => !availableIds || availableIds.has(id);

  if (!KNOWN_ITEM_IDS.has(itemId) || !isVisible(itemId)) {
    return current;
  }

  const location = findItemLocation(current, itemId);
  if (!location) {
    return current;
  }

  const groupIdx = SIDEBAR_GROUP_ORDER.indexOf(location.groupId);
  const groupItems = current.groups[location.groupId];

  if (direction === 'up') {
    let prevVisibleIdx = -1;
    for (let i = location.index - 1; i >= 0; i -= 1) {
      if (isVisible(groupItems[i])) {
        prevVisibleIdx = i;
        break;
      }
    }

    if (prevVisibleIdx !== -1) {
      return moveSidebarItem(current, itemId, location.groupId, prevVisibleIdx);
    }

    if (groupIdx <= 0) {
      return current;
    }

    const prevGroupId = SIDEBAR_GROUP_ORDER[groupIdx - 1];
    return moveSidebarItem(current, itemId, prevGroupId, current.groups[prevGroupId].length);
  }

  let nextVisibleIdx = -1;
  for (let i = location.index + 1; i < groupItems.length; i += 1) {
    if (isVisible(groupItems[i])) {
      nextVisibleIdx = i;
      break;
    }
  }

  if (nextVisibleIdx !== -1) {
    return moveSidebarItem(current, itemId, location.groupId, nextVisibleIdx + 1);
  }

  if (groupIdx >= SIDEBAR_GROUP_ORDER.length - 1) {
    return current;
  }

  const nextGroupId = SIDEBAR_GROUP_ORDER[groupIdx + 1];
  return moveSidebarItem(current, itemId, nextGroupId, 0);
}
