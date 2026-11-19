const EXCLUDED_KEYS = new Set([
  'cfo_terminal_session', 'cfo_terminal_expires_at', 'cfo_terminal_user',
  'cfo_terminal_role', 'cfo_can_access_notion', 'cfo_theme', 'cfo_sidebar_open', 'cfo_sidebar_collapsed',
  'million_game_active_v1', 'million_game_history_v1',
]);

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingValues: Record<string, string> = {};
let hydratingState = false;
let bridgeStarted = false;

function sessionToken(): string | null {
  return localStorage.getItem('cfo_terminal_session');
}

const MAX_REMOTE_ENTRY_BYTES = 256_000;
const MAX_REMOTE_BATCH_BYTES = 1_400_000;
const NON_RETRYABLE_SYNC_STATUSES = new Set([400, 413, 422]);

export function sanitizePendingPayload(
  payload: Record<string, string>,
  maxEntryBytes: number = MAX_REMOTE_ENTRY_BYTES
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!key || EXCLUDED_KEYS.has(key) || typeof value !== 'string') continue;
    if (!key.startsWith('cfo_') && !key.includes('anki_')) continue;
    if (value.length > maxEntryBytes) {
      console.warn(`[RemoteSync] Ignorando chave "${key}" (${value.length} chars > ${maxEntryBytes}) para evitar erro 413.`);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function splitPayloadIntoBatches(payload: Record<string, string>): Array<Record<string, string>> {
  const entries = Object.entries(payload);
  if (!entries.length) return [];
  const batches: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  let currentBytes = 32;

  for (const [key, value] of entries) {
    const entryBytes = key.length + value.length + 12;
    if (Object.keys(current).length > 0 && currentBytes + entryBytes > MAX_REMOTE_BATCH_BYTES) {
      batches.push(current);
      current = {};
      currentBytes = 32;
    }
    current[key] = value;
    currentBytes += entryBytes;
  }

  if (Object.keys(current).length > 0) {
    batches.push(current);
  }
  return batches;
}

function collectState(): Record<string, string> {
  const state: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || EXCLUDED_KEYS.has(key)) continue;
    if (!key.startsWith('cfo_') && !key.includes('anki_')) continue;
    const value = localStorage.getItem(key);
    if (value !== null) state[key] = value;
  }
  return sanitizePendingPayload(state);
}

async function putState(): Promise<void> {
  const token = sessionToken();
  if (!token || !Object.keys(pendingValues).length) return;
  const payload = sanitizePendingPayload(pendingValues);
  pendingValues = {};
  if (!Object.keys(payload).length) return;

  const batches = splitPayloadIntoBatches(payload);
  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];
    try {
      const response = await fetch('/api/user/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ state: batch }),
      });
      if (!response.ok) {
        if (NON_RETRYABLE_SYNC_STATUSES.has(response.status)) {
          console.warn(`[RemoteSync] Lote descartado (HTTP ${response.status}) com ${Object.keys(batch).length} chave(s) para evitar loop infinito.`);
          continue;
        }
        throw new Error(`REMOTE_STATE_SYNC_FAILED_${response.status}`);
      }
    } catch {
      const remaining = batches.slice(i).reduce<Record<string, string>>((acc, item) => ({ ...acc, ...item }), {});
      pendingValues = { ...remaining, ...pendingValues };
      break;
    }
  }
}

export async function flushPendingSyncNow(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  await putState();
}

export function queuePersistentSync(values: Record<string, string> = {}): void {
  const cleanValues = sanitizePendingPayload(values);
  if (!Object.keys(cleanValues).length && !Object.keys(pendingValues).length) return;
  pendingValues = { ...pendingValues, ...cleanValues };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void putState(); }, 500);
}

export async function hydratePersistentState(): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const localState = collectState();
  try {
    const response = await fetch('/api/user/state', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      queuePersistentSync(localState);
      return;
    }
    const data = await response.json();
    const state = data?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      queuePersistentSync(localState);
      return;
    }
    const localOnly = Object.fromEntries(Object.entries(localState).filter(([key]) => !Object.hasOwn(state, key)));
    hydratingState = true;
    try {
      for (const [key, value] of Object.entries(state)) {
        if (typeof value === 'string' && !EXCLUDED_KEYS.has(key)) localStorage.setItem(key, value);
      }
    } finally {
      hydratingState = false;
    }
    queuePersistentSync(localOnly);
  } catch {
    queuePersistentSync(localState);
  }
}

export function clearPersistentStateCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && !EXCLUDED_KEYS.has(key) && (key.startsWith('cfo_') || key.includes('anki_'))) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  pendingValues = {};
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
}

export function startPersistentStateSync(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (!hydratingState && !EXCLUDED_KEYS.has(key) && (key.startsWith('cfo_') || key.includes('anki_'))) queuePersistentSync({ [key]: value });
  };
  window.addEventListener('online', () => queuePersistentSync());
}
