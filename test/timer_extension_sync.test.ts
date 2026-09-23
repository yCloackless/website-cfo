import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the real worker with an in-memory Chrome API and a controllable network.
function worker(initial: Record<string, any>, fetcher = async (..._args: any[]) => ({ ok: true, json: async () => ({}) })) {
  const storage = { ...initial };
  const changes: Function[] = [];
  let onMessage: Function;
  const noop = () => {};
  const context = vm.createContext({
    console, Date, setInterval: noop, clearInterval: noop, fetch: fetcher,
    chrome: {
      storage: {
        local: {
          get: (_keys: any, cb: Function) => cb({ ...storage }),
          set: (values: any, cb?: Function) => {
            const delta: any = {};
            for (const [key, value] of Object.entries(values)) {
              delta[key] = { oldValue: storage[key], newValue: value };
              storage[key] = value;
            }
            changes.forEach((fn) => fn(delta, 'local'));
            cb?.();
          },
        },
        onChanged: { addListener: (fn: Function) => changes.push(fn) },
      },
      runtime: {
        onInstalled: { addListener: noop }, onStartup: { addListener: noop },
        onConnect: { addListener: noop }, onMessage: { addListener: (fn: Function) => { onMessage = fn; } },
      },
      action: { setBadgeText: noop, setTitle: noop, setBadgeBackgroundColor: noop },
      alarms: { get: (_name: string, cb: Function) => cb({}), onAlarm: { addListener: noop } },
      tabs: { query: (_query: any, cb: Function) => cb([]) },
    },
  });
  vm.runInContext(fs.readFileSync('extension/background.js', 'utf8'), context);
  return {
    storage,
    web: (snapshot: any) => { context.snapshot = snapshot; vm.runInContext('applyWebTimerUpdate(snapshot)', context); },
    command: (type: string, payload?: any) => onMessage({ type, payload }, {}, noop),
    poll: () => vm.runInContext('pollServerStatus()', context),
  };
}

test('a pausa legada sem acumulado conserva os 34 minutos, em vez de voltar aos 12', () => {
  const now = Date.now();
  const w = worker({ cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 12 * 60_000, startTime: now - 22 * 60_000 } });
  const pause = { status: 'PAUSED', startTime: null, restStartTime: now, serverOffset: 0 };
  w.web(pause);
  w.web(pause); // Redundant bridge delivery must be idempotent.
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 34 * 60_000);
});

test('a extensão repete uma pausa após falha transitória do servidor', async () => {
  let pauseCalls = 0;
  const w = worker({
    cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 12 * 60_000, startTime: Date.now() - 22 * 60_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async (url: string) => {
    if (!url.endsWith('/pause')) return { ok: true, json: async () => ({}) };
    pauseCalls += 1;
    return pauseCalls === 1
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, json: async () => ({ status: 'PAUSED', accumulatedTime: 34 * 60_000 }) };
  });

  w.command('TIMER_PAUSE');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(pauseCalls, 2);
  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 34 * 60_000);
});

test('a ponte compartilha o ajuste do relógio sem descontar novamente o atraso de entrega', () => {
  const w = worker({});
  w.web({ status: 'RUNNING', accumulatedTime: 720_000, startTime: Date.now(), serverTime: Date.now() - 5000, serverOffset: 250 });
  assert.equal(w.storage.cfo_ext_server_offset, 250);
  assert.equal(w.storage.cfo_ext_timer.serverOffset, 250);
});

test('uma resposta atrasada de iniciar não reativa o timer já pausado e os comandos seguem a ordem dos cliques', async () => {
  const calls: string[] = [];
  let finishStart!: (value: any) => void;
  const w = worker({
    cfo_ext_timer: { status: 'PAUSED', accumulatedMs: 34 * 60_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async (url: string) => {
    calls.push(url);
    if (url.endsWith('/start')) return new Promise((resolve) => { finishStart = resolve; });
    return { ok: true, json: async () => ({ status: 'PAUSED', accumulatedTime: 34 * 60_000 }) };
  });
  w.command('TIMER_START');
  await new Promise((resolve) => setImmediate(resolve));
  w.command('TIMER_PAUSE');
  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
  assert.equal(calls.length, 1);
  finishStart({ ok: true, json: async () => ({ status: 'RUNNING', startTime: Date.now(), accumulatedTime: 0 }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 34 * 60_000);
  assert.deepEqual(calls.map((url) => url.split('/').pop()), ['start', 'pause']);
});

test('polling aplica também mudanças pequenas de startTime e acumulado durante RUNNING', async () => {
  const start = Date.now();
  const w = worker({
    cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 720_000, startTime: start },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async () => ({ ok: true, json: async () => ({ status: 'RUNNING', startTime: start + 500, accumulatedTime: 724_000 }) }));
  w.poll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 724_000);
  assert.equal(w.storage.cfo_ext_timer.startTime, start + 500);
});
