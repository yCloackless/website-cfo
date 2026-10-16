const EXCLUDED_KEYS = new Set([
  'cfo_terminal_session', 'cfo_terminal_expires_at', 'cfo_terminal_user',
  'cfo_terminal_role', 'cfo_can_access_notion', 'cfo_theme', 'cfo_sidebar_open', 'cfo_sidebar_collapsed',
]);

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingValues: Record<string, string> = {};
let hydratingState = false;
let bridgeStarted = false;

function sessionToken(): string | null {
  return localStorage.getItem('cfo_terminal_session');
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
  return state;
}

async function putState(): Promise<void> {
  const token = sessionToken();
  if (!token || !Object.keys(pendingValues).length) return;
  const payload = pendingValues;
  pendingValues = {};
  try {
    const response = await fetch('/api/user/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state: payload }),
    });
    if (!response.ok) throw new Error('REMOTE_STATE_SYNC_FAILED');
  } catch {
    pendingValues = { ...payload, ...pendingValues };
  }
}

export function queuePersistentSync(values: Record<string, string> = {}): void {
  if (!Object.keys(values).length && !Object.keys(pendingValues).length) return;
  pendingValues = { ...pendingValues, ...values };
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
