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

test('sanitizePendingPayload drops oversized keys above limit and preserves normal keys', () => {
  const sanitize = (remotePersistence as any).sanitizePendingPayload;
  assert.equal(typeof sanitize, 'function', 'sanitizePendingPayload must be exported');

  const cleaned = sanitize({
    cfo_small_ok: '{"ok":true}',
    cfo_huge_blob: 'x'.repeat(300_000),
    cfo_theme: 'dark',
  });

  assert.deepEqual(cleaned, { cfo_small_ok: '{"ok":true}' });
});

test('putState does not re-queue payload in an infinite loop when server returns 413', async () => {
  const prevStorage = (globalThis as any).localStorage;
  const prevFetch = globalThis.fetch;
  const requests: Array<{ body: string }> = [];

  try {
    (globalThis as any).localStorage = createMemoryStorage({
      cfo_terminal_session: 'cookie',
    });

    let callCount = 0;
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      callCount += 1;
      requests.push({ body: String(init?.body || '') });
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }), { status: 413 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    const flush = (remotePersistence as any).flushPendingSyncNow;
    assert.equal(typeof flush, 'function', 'flushPendingSyncNow must be exported');

    remotePersistence.clearPersistentStateCache();
    remotePersistence.queuePersistentSync({ cfo_first: 'alpha' });
    await flush();

    // Next unrelated sync must NOT contain the rejected 413 payload
    remotePersistence.queuePersistentSync({ cfo_second: 'beta' });
    await flush();

    assert.equal(requests.length, 2);
    assert.match(requests[0].body, /cfo_first/);
    assert.doesNotMatch(requests[1].body, /cfo_first/);
    assert.match(requests[1].body, /cfo_second/);
  } finally {
    remotePersistence.clearPersistentStateCache();
    (globalThis as any).localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});

test('putState re-queues transient 503 failures for retry', async () => {
  const prevStorage = (globalThis as any).localStorage;
  const prevFetch = globalThis.fetch;
  const requests: string[] = [];

  try {
    (globalThis as any).localStorage = createMemoryStorage({
      cfo_terminal_session: 'cookie',
    });

    let callCount = 0;
    globalThis.fetch = (async (_url: any, init?: RequestInit) => {
      callCount += 1;
      requests.push(String(init?.body || ''));
      if (callCount === 1) {
        return new Response('unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    const flush = (remotePersistence as any).flushPendingSyncNow;
    remotePersistence.clearPersistentStateCache();
    remotePersistence.queuePersistentSync({ cfo_transient: 'keep-me' });
    await flush();

    remotePersistence.queuePersistentSync({ cfo_next: '1' });
    await flush();

    assert.equal(requests.length, 2);
    assert.match(requests[1], /cfo_transient/);
    assert.match(requests[1], /cfo_next/);
  } finally {
    remotePersistence.clearPersistentStateCache();
    (globalThis as any).localStorage = prevStorage;
    globalThis.fetch = prevFetch;
  }
});
