import test from 'node:test';
import assert from 'node:assert/strict';
import * as remotePersistence from '../src/services/remotePersistence';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

test('sanitizePendingPayload preserves cfo_appearance values while excluding cfo_theme', () => {
  const cleanedNotion = remotePersistence.sanitizePendingPayload({
    cfo_appearance: 'notion',
    cfo_theme: 'dark',
  });
  assert.deepEqual(cleanedNotion, { cfo_appearance: 'notion' });

  const cleanedDefault = remotePersistence.sanitizePendingPayload({
    cfo_appearance: 'default',
    cfo_theme: 'light',
  });
  assert.deepEqual(cleanedDefault, { cfo_appearance: 'default' });
});

test('startPersistentStateSync intercepts localStorage.setItem for cfo_appearance and syncs via fetch', async () => {
  const prevStorage = (globalThis as any).localStorage;
  const prevWindow = (globalThis as any).window;
  const prevFetch = globalThis.fetch;

  const patchBodies: Array<Record<string, unknown>> = [];
  const storage = createMemoryStorage({
    cfo_terminal_session: 'cookie',
  });

  try {
    (globalThis as any).localStorage = storage;
    (globalThis as any).window = {
      addEventListener: () => {},
    };

    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      if (init?.method === 'PATCH' && init.body) {
        patchBodies.push(JSON.parse(String(init.body)));
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    remotePersistence.startPersistentStateSync();

    // Writing cfo_theme must NOT trigger sync, while cfo_appearance MUST sync
    storage.setItem('cfo_theme', 'light');
    storage.setItem('cfo_appearance', 'notion');
    await remotePersistence.flushPendingSyncNow();

    assert.equal(patchBodies.length, 1);
    assert.deepEqual(patchBodies[0], {
      state: { cfo_appearance: 'notion' },
    });

    // Switching back to default must also sync
    storage.setItem('cfo_appearance', 'default');
    await remotePersistence.flushPendingSyncNow();

    assert.equal(patchBodies.length, 2);
    assert.deepEqual(patchBodies[1], {
      state: { cfo_appearance: 'default' },
    });
  } finally {
    remotePersistence.clearPersistentStateCache();
    (globalThis as any).localStorage = prevStorage;
    (globalThis as any).window = prevWindow;
    globalThis.fetch = prevFetch;
  }
});

test('hydratePersistentState restores cfo_appearance from remote state and pushes local-only cfo_appearance', async () => {
  const prevStorage = (globalThis as any).localStorage;
  const prevFetch = globalThis.fetch;

  try {
    // 1. Remote has cfo_appearance='notion' and cfo_theme='dark'
    const storageFromRemote = createMemoryStorage({
      cfo_terminal_session: 'cookie',
    });
    (globalThis as any).localStorage = storageFromRemote;

    const requests: Array<{ method: string; body?: string }> = [];
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      const method = init?.method || 'GET';
      requests.push({ method, body: init?.body ? String(init.body) : undefined });
      if (method === 'GET') {
        return new Response(
          JSON.stringify({
            state: {
              cfo_appearance: 'notion',
              cfo_theme: 'dark',
            },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    await remotePersistence.hydratePersistentState();
    await remotePersistence.flushPendingSyncNow();

    assert.equal(storageFromRemote.getItem('cfo_appearance'), 'notion');
    assert.equal(storageFromRemote.getItem('cfo_theme'), null);
    assert.equal(requests.filter((r) => r.method === 'PATCH').length, 0);

    // 2. Local has cfo_appearance='default' and server does not have it yet -> pushed on hydrate
    const storageLocalOnly = createMemoryStorage({
      cfo_terminal_session: 'cookie',
      cfo_appearance: 'default',
    });
    (globalThis as any).localStorage = storageLocalOnly;

    const pushBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return new Response(JSON.stringify({ state: {} }), { status: 200 });
      }
      if (method === 'PATCH' && init?.body) {
        pushBodies.push(JSON.parse(String(init.body)));
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    await remotePersistence.hydratePersistentState();
    await remotePersistence.flushPendingSyncNow();

    assert.equal(pushBodies.length, 1);
    assert.deepEqual(pushBodies[0], {
      state: { cfo_appearance: 'default' },
    });
  } finally {
    remotePersistence.clearPersistentStateCache();
    (globalThis as any).localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});
