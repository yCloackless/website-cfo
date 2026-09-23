import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  vm.runInContext(fs.readFileSync(path.join(projectRoot, 'extension/background.js'), 'utf8'), context);
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

test('snapshot RUNNING antigo não reativa uma pausa feita pela extensão', () => {
  const pauseTime = Date.now();
  const w = worker({
    cfo_ext_timer: {
      status: 'PAUSED',
      accumulatedMs: 34 * 60_000,
      restStartTime: pauseTime,
    },
  });

  w.web({
    status: 'RUNNING',
    accumulatedTime: 34 * 60_000,
    startTime: pauseTime - 1000,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
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

test('polling antigo do servidor não substitui o estado pausado', async () => {
  const pauseTime = Date.now();
  const w = worker({
    cfo_ext_timer: {
      status: 'PAUSED',
      accumulatedMs: 34 * 60_000,
      restStartTime: pauseTime,
    },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async () => ({
    ok: true,
    json: async () => ({
      status: 'RUNNING',
      accumulatedTime: 34 * 60_000,
      startTime: pauseTime - 1000,
    }),
  }));

  w.poll();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
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

test('TIMER_PAUSE com payload explícito preserva accumulatedTime e restStartTime no background', async () => {
  const now = Date.now();
  const w = worker({
    cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 600_000, startTime: now - 300_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async () => ({ ok: true, json: async () => ({ status: 'PAUSED', accumulatedTime: 900_000 }) }));

  w.command('TIMER_PAUSE', {
    accumulatedTime: 900_000,
    restStartTime: now,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'PAUSED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 900_000);
  assert.equal(w.storage.cfo_ext_timer.restStartTime, now);
});

test('popup initPopup protege estado PAUSED contra sobrescrita por RUNNING obsoleto da nuvem', () => {
  const popupSrc = fs.readFileSync(path.join(projectRoot, 'extension/popup.js'), 'utf8');
  assert.ok(popupSrc.includes('cloudStartTime <= pauseTime'), 'popup.js deve conter a guarda anti-reversão contra RUNNING obsoleto');
  assert.ok(popupSrc.includes("type: 'TIMER_PAUSE'"), 'popup.js deve emitir TIMER_PAUSE com payload');
  assert.ok(popupSrc.includes('broadcastToWebTabs(state.timer)'), 'popup.js deve propagar imediatamente para abas web');
});

test('popup initPopup protege estado RUNNING contra sobrescrita por PAUSED obsoleto da nuvem', () => {
  const popupSrc = fs.readFileSync(path.join(projectRoot, 'extension/popup.js'), 'utf8');
  assert.ok(popupSrc.includes('cloudRestTime <= currentStartTime'), 'popup.js deve conter a guarda anti-reversão contra PAUSED obsoleto');
});

test('snapshot PAUSED antigo da web não reverte timer RUNNING no background', () => {
  const now = Date.now();
  const w = worker({
    cfo_ext_timer: {
      status: 'RUNNING',
      accumulatedMs: 900_000,
      startTime: now,
    },
  });

  w.web({
    status: 'PAUSED',
    accumulatedTime: 900_000,
    restStartTime: now - 5000,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'RUNNING');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 900_000);
});

test('TIMER_START com payload preserva restAccumulatedMs e startTime no background', async () => {
  const now = Date.now();
  const w = worker({
    cfo_ext_timer: { status: 'PAUSED', accumulatedMs: 900_000, restStartTime: now - 60_000, restAccumulatedMs: 120_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async () => ({ ok: true, json: async () => ({ status: 'RUNNING', startTime: now, accumulatedTime: 900_000 }) }));

  w.command('TIMER_START', {
    subjectId: 'matematica',
    subjectName: 'Matemática',
    accumulatedTime: 900_000,
    restAccumulatedMs: 180_000,
    startTime: now,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'RUNNING');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 900_000);
  assert.equal(w.storage.cfo_ext_timer.restAccumulatedMs, 180_000);
  assert.equal(w.storage.cfo_ext_timer.startTime, now);
});

test('a ponte da extensão encaminha uma atualização de timer por um canal só', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'extension/content.js'), 'utf8');
  const windowListeners: Record<string, Function> = {};
  const documentListeners: Record<string, Function> = {};
  const portMessages: any[] = [];
  const runtimeMessages: any[] = [];
  const webEvents: any[] = [];
  let portListener: Function = () => {};
  const port = {
    postMessage: (message: any) => portMessages.push(message),
    onMessage: { addListener: (listener: Function) => { portListener = listener; } },
    onDisconnect: { addListener: () => {} },
  };
  const context = vm.createContext({
    Date,
    setTimeout: () => 1,
    clearTimeout: () => {},
    fetch: async () => ({ ok: false, json: async () => null }),
    window: {
      location: { origin: 'http://local.test' },
      localStorage: { getItem: () => null },
      addEventListener: (type: string, listener: Function) => { windowListeners[type] = listener; },
    },
    document: {
      addEventListener: (type: string, listener: Function) => { documentListeners[type] = listener; },
      dispatchEvent: (event: any) => { webEvents.push(event); },
    },
    CustomEvent: function (this: any, type: string, options: any) { this.type = type; this.detail = options.detail; },
    chrome: {
      runtime: {
        connect: () => port,
        sendMessage: (message: any) => runtimeMessages.push(message),
        onMessage: { addListener: () => {} },
      },
    },
  });
  vm.runInContext(source, context);

  windowListeners.message({ source: context.window, data: {
    source: 'cfo-web', type: 'TIMER_SYNC_FROM_WEB', payload: { status: 'RUNNING' },
  } });
  assert.equal(portMessages.filter((message) => message.type === 'WEB_TIMER_UPDATE').length, 1);
  assert.equal(runtimeMessages.length, 0, 'não deve reenviar a mesma atualização via sendMessage');

  portListener({ type: 'EXTENSION_TIMER_SYNC', payload: { status: 'PAUSED' } });
  assert.equal(webEvents.length, 1, 'a página deve receber apenas o CustomEvent observado pelo timer');
});

test('TIMER_RESET zera completamente o timer no background e define status STOPPED', async () => {
  const now = Date.now();
  let resetCalls = 0;
  const w = worker({
    cfo_ext_timer: {
      status: 'RUNNING',
      accumulatedMs: 15 * 60_000,
      startTime: now - 30_000,
    },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async (url: string) => {
    if (url.endsWith('/reset')) {
      resetCalls += 1;
      return { ok: true, json: async () => ({ status: 'STOPPED', elapsedMs: 0, accumulatedTime: 0 }) };
    }
    return { ok: true, json: async () => ({}) };
  });

  w.command('TIMER_RESET', { resetAt: now });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);
  assert.equal(w.storage.cfo_ext_timer.startTime, null);
  assert.equal(w.storage.cfo_ext_timer.restStartTime, null);
  assert.equal(w.storage.cfo_ext_timer.restAccumulatedMs, 0);
  assert.equal(w.storage.cfo_ext_timer.lastAction, 'reset');
  assert.ok(w.storage.cfo_ext_timer.resetAt >= now);
  assert.equal(resetCalls, 1);
});

test('snapshot RUNNING ou PAUSED atrasado da web NÃO revive timer após RESET', async () => {
  const resetTime = Date.now();
  const w = worker({
    cfo_ext_timer: {
      status: 'STOPPED',
      accumulatedMs: 0,
      startTime: null,
      restStartTime: null,
      resetAt: resetTime,
    },
  });

  // Chegada de snapshot RUNNING gerado antes ou durante o reset
  w.web({
    status: 'RUNNING',
    accumulatedTime: 120_000,
    startTime: resetTime - 5000,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);

  // Chegada de snapshot PAUSED gerado antes ou durante o reset
  w.web({
    status: 'PAUSED',
    accumulatedTime: 120_000,
    restStartTime: resetTime - 1000,
  });

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);
});

test('polling do servidor com RUNNING ou PAUSED antigo é ignorado se timer está em STOPPED', async () => {
  const resetTime = Date.now();
  const w = worker({
    cfo_ext_timer: {
      status: 'STOPPED',
      accumulatedMs: 0,
      startTime: null,
      restStartTime: null,
      resetAt: resetTime,
    },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async () => ({
    ok: true,
    json: async () => ({
      status: 'RUNNING',
      accumulatedTime: 50_000,
      startTime: resetTime - 10_000,
    }),
  }));

  w.poll();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);
});

test('resposta atrasada de /start ou /pause não reverte TIMER_RESET', async () => {
  let finishStart!: (value: any) => void;
  const w = worker({
    cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 60_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async (url: string) => {
    if (url.endsWith('/start')) return new Promise((resolve) => { finishStart = resolve; });
    return { ok: true, json: async () => ({ status: 'STOPPED', elapsedMs: 0 }) };
  });

  w.command('TIMER_START');
  await new Promise((resolve) => setImmediate(resolve));
  w.command('TIMER_RESET', { resetAt: Date.now() });

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');

  // Start antigo finaliza depois do reset
  finishStart({ ok: true, json: async () => ({ status: 'RUNNING', startTime: Date.now(), accumulatedTime: 60_000 }) });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);
});

test('múltiplos cliques rápidos de RESET são idempotentes e mantêm 00:00:00 e STOPPED', async () => {
  let resetCount = 0;
  const w = worker({
    cfo_ext_timer: { status: 'RUNNING', accumulatedMs: 120_000 },
    cfo_ext_settings: { serverUrl: 'http://local.test', token: 'fixture' },
  }, async (url: string) => {
    if (url.endsWith('/reset')) {
      resetCount++;
      return { ok: true, json: async () => ({ status: 'STOPPED', elapsedMs: 0 }) };
    }
    return { ok: true, json: async () => ({}) };
  });

  const now = Date.now();
  w.command('TIMER_RESET', { resetAt: now });
  w.command('TIMER_RESET', { resetAt: now + 50 });
  w.command('TIMER_RESET', { resetAt: now + 100 });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(w.storage.cfo_ext_timer.status, 'STOPPED');
  assert.equal(w.storage.cfo_ext_timer.accumulatedMs, 0);
  assert.equal(w.storage.cfo_ext_timer.startTime, null);
  assert.equal(w.storage.cfo_ext_timer.restStartTime, null);
});

