const EXCLUDED_KEYS = new Set([
  'cfo_terminal_session', 'cfo_terminal_expires_at', 'cfo_terminal_user',
  'cfo_terminal_role', 'cfo_can_access_notion',
]);

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingValues: Record<string, string> = {};
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
  if (!token) return;
  const payload = { ...collectState(), ...pendingValues };
  pendingValues = {};
  try {
    await fetch('/api/user/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ state: payload }),
    });
  } catch {
    // Offline writes remain in localStorage and will be uploaded after reconnection.
  }
}

export function queuePersistentSync(values: Record<string, string> = {}): void {
  pendingValues = { ...pendingValues, ...values };
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void putState(); }, 500);
}

export async function hydratePersistentState(): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  try {
    const response = await fetch('/api/user/state', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return;
    const data = await response.json();
    const state = data?.state;
    if (!state || typeof state !== 'object') return;
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === 'string' && !EXCLUDED_KEYS.has(key)) localStorage.setItem(key, value);
    }
  } catch {
    // Keep local cache available during a temporary backend outage.
  }
}

export function startPersistentStateSync(): void {
  if (bridgeStarted) return;
  bridgeStarted = true;
  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    originalSetItem(key, value);
    if (!EXCLUDED_KEYS.has(key) && (key.startsWith('cfo_') || key.includes('anki_'))) queuePersistentSync({ [key]: value });
  };
  window.addEventListener('online', () => queuePersistentSync());
  queuePersistentSync();
}
