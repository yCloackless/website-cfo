import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIDEBAR_LAYOUT_STORAGE_KEY,
  SIDEBAR_LAYOUT_EVENT,
  SIDEBAR_GROUP_ORDER,
  SIDEBAR_GROUP_TITLES,
  DEFAULT_SIDEBAR_GROUPS,
  SIDEBAR_ITEM_CATALOG,
  createDefaultSidebarLayout,
  normalizeSidebarLayout,
  loadSidebarLayout,
  saveSidebarLayout,
  resetSidebarLayout,
  isDefaultSidebarLayout,
  moveSidebarItem,
  stepSidebarItem,
  type SidebarLayoutConfig,
} from '../src/utils/sidebarLayout.ts';

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

test('default layout and catalog metadata are consistent and match TacticalSidebar groups', () => {
  assert.deepEqual(SIDEBAR_GROUP_ORDER, ['principal', 'studies', 'actions', 'system']);
  assert.deepEqual(SIDEBAR_GROUP_TITLES, {
    principal: 'PRINCIPAL',
    studies: 'ESTUDOS & DESEMPENHO',
    actions: 'AÇÕES TÁTICAS',
    system: 'SISTEMA & ADMINISTRAÇÃO',
  });
  assert.equal(SIDEBAR_LAYOUT_STORAGE_KEY, 'cfo_sidebar_layout_v1');

  const defaults = createDefaultSidebarLayout();
  assert.equal(defaults.version, 1);
  assert.deepEqual(defaults.groups, DEFAULT_SIDEBAR_GROUPS);
  assert.equal(isDefaultSidebarLayout(defaults), true);

  // Ensure every default ID exists in catalog with matching defaultGroup and no duplicates
  const seen = new Set<string>();
  for (const groupId of SIDEBAR_GROUP_ORDER) {
    for (const id of DEFAULT_SIDEBAR_GROUPS[groupId]) {
      assert.equal(seen.has(id), false, `Duplicate default ID: ${id}`);
      seen.add(id);
      const meta = SIDEBAR_ITEM_CATALOG[id];
      assert.ok(meta, `Missing catalog entry for ${id}`);
      assert.equal(meta.id, id);
      assert.equal(meta.defaultGroup, groupId);
      assert.ok(meta.label.length > 0);
    }
  }
  assert.equal(seen.size, Object.keys(SIDEBAR_ITEM_CATALOG).length);
  assert.equal(SIDEBAR_ITEM_CATALOG.calendar.label, 'Agenda Notion');
});

test('normalizeSidebarLayout handles corrupted, partial, duplicate, and unknown inputs', () => {
  const expectedDefault = createDefaultSidebarLayout();

  for (const bad of [null, undefined, 'corrupted', 42, [], {}, { groups: null }, { groups: [] }]) {
    assert.deepEqual(normalizeSidebarLayout(bad), expectedDefault);
  }

  // Partial layout: user moved calendar to principal, included duplicates, non-strings, and unknown IDs
  const normalized = normalizeSidebarLayout({
    groups: {
      principal: ['calendar', 'unknown_item', 123, 'calendar', 'table'],
      studies: ['table', 'flashcards', null],
    },
  });

  // First occurrence wins: calendar & table stay in principal in exact order; remaining principal defaults appended
  assert.deepEqual(normalized.groups.principal, [
    'calendar',
    'table',
    'ifrij',
    'examBank',
    'bizuario',
    'highyield',
  ]);
  // 'table' was already seen in principal, so removed from studies; 'flashcards' kept first, missing studies appended
  assert.deepEqual(normalized.groups.studies, [
    'flashcards',
    'monthlyHours',
    'timer',
    'learning',
    'ai',
    'simulations',
    'leveling',
    'millionGame',
    'calculator',
  ]);
  assert.deepEqual(normalized.groups.actions, DEFAULT_SIDEBAR_GROUPS.actions);
  assert.deepEqual(normalized.groups.system, DEFAULT_SIDEBAR_GROUPS.system);
  assert.equal(isDefaultSidebarLayout(normalized), false);
});

test('normalizeSidebarLayout preserves intentionally emptied groups when items were moved elsewhere', () => {
  const movedAllActionsToPrincipal = normalizeSidebarLayout({
    version: 1,
    groups: {
      principal: [...DEFAULT_SIDEBAR_GROUPS.principal, ...DEFAULT_SIDEBAR_GROUPS.actions],
      studies: DEFAULT_SIDEBAR_GROUPS.studies,
      actions: [],
      system: DEFAULT_SIDEBAR_GROUPS.system,
    },
  });

  assert.deepEqual(movedAllActionsToPrincipal.groups.actions, []);
  assert.deepEqual(movedAllActionsToPrincipal.groups.principal, [
    ...DEFAULT_SIDEBAR_GROUPS.principal,
    ...DEFAULT_SIDEBAR_GROUPS.actions,
  ]);
});

test('moveSidebarItem moves calendar (Agenda Notion) from studies to index 0 of principal immutably', () => {
  const initial = createDefaultSidebarLayout();
  const snapshot = structuredClone(initial);

  const updated = moveSidebarItem(initial, 'calendar', 'principal', 0);

  // Input must remain untouched
  assert.deepEqual(initial, snapshot);
  assert.equal(updated.groups.principal[0], 'calendar');
  assert.deepEqual(updated.groups.principal, [
    'calendar',
    'ifrij',
    'table',
    'examBank',
    'bizuario',
    'highyield',
  ]);
  assert.equal(updated.groups.studies.includes('calendar'), false);
  assert.equal(updated.groups.studies.length, DEFAULT_SIDEBAR_GROUPS.studies.length - 1);
  assert.equal(isDefaultSidebarLayout(updated), false);

  // Clamping out-of-bounds indices on cross-group move
  const clampedEnd = moveSidebarItem(updated, 'calendar', 'actions', 999);
  assert.equal(clampedEnd.groups.actions.at(-1), 'calendar');

  const clampedStart = moveSidebarItem(clampedEnd, 'calendar', 'studies', -10);
  assert.equal(clampedStart.groups.studies[0], 'calendar');
});

test('moveSidebarItem handles intra-group upward and downward moves accurately', () => {
  const initial = createDefaultSidebarLayout();
  // Default principal: ['ifrij', 'table', 'examBank', 'bizuario', 'highyield']

  // Downward move: index 0 ('ifrij') dropped after 'table' (pre-removal slot 2) -> index 1
  const downToSlot2 = moveSidebarItem(initial, 'ifrij', 'principal', 2);
  assert.deepEqual(downToSlot2.groups.principal, [
    'table',
    'ifrij',
    'examBank',
    'bizuario',
    'highyield',
  ]);

  // Downward move to end (slot 5 / 999)
  const downToEnd = moveSidebarItem(initial, 'ifrij', 'principal', 999);
  assert.deepEqual(downToEnd.groups.principal, [
    'table',
    'examBank',
    'bizuario',
    'highyield',
    'ifrij',
  ]);

  // Dropping onto own before/after slots (0 or 1 for index 0) is a no-op
  assert.deepEqual(moveSidebarItem(initial, 'ifrij', 'principal', 0), initial);
  assert.deepEqual(moveSidebarItem(initial, 'ifrij', 'principal', 1), initial);

  // Upward move: index 3 ('bizuario') to slot 1 -> ['ifrij', 'bizuario', 'table', 'examBank', 'highyield']
  const upToSlot1 = moveSidebarItem(initial, 'bizuario', 'principal', 1);
  assert.deepEqual(upToSlot1.groups.principal, [
    'ifrij',
    'bizuario',
    'table',
    'examBank',
    'highyield',
  ]);

  // Unknown item ID leaves layout unchanged
  assert.deepEqual(moveSidebarItem(initial, 'doesNotExist', 'principal', 0), initial);
});

test('stepSidebarItem moves across group boundaries and skips hidden items without losing them', () => {
  const initial = createDefaultSidebarLayout();

  // Stepping first item up and last item down are no-ops
  assert.deepEqual(stepSidebarItem(initial, 'ifrij', 'up'), initial);
  assert.deepEqual(stepSidebarItem(initial, 'adminSecurity', 'down'), initial);

  // Cross boundary down: last item of principal ('highyield') -> index 0 of studies
  const crossedDown = stepSidebarItem(initial, 'highyield', 'down');
  assert.deepEqual(crossedDown.groups.principal, ['ifrij', 'table', 'examBank', 'bizuario']);
  assert.equal(crossedDown.groups.studies[0], 'highyield');

  // Cross boundary up: back from index 0 of studies -> end of principal
  const crossedUp = stepSidebarItem(crossedDown, 'highyield', 'up');
  assert.deepEqual(crossedUp, initial);

  // With availableIds omitting 'calendar' and 'adminSecurity':
  // 'calculator' is last visible in studies, so stepping down jumps into actions[0] while keeping 'calendar' in studies
  const availableWithoutNotionAndAdmin = new Set(
    Object.keys(SIDEBAR_ITEM_CATALOG).filter((id) => id !== 'calendar' && id !== 'adminSecurity')
  );
  const skippedBoundary = stepSidebarItem(
    initial,
    'calculator',
    'down',
    availableWithoutNotionAndAdmin
  );
  assert.equal(skippedBoundary.groups.studies.includes('calendar'), true);
  assert.equal(skippedBoundary.groups.studies.includes('calculator'), false);
  assert.equal(skippedBoundary.groups.actions[0], 'calculator');

  // Intra-group skipping of a hidden item between two visible items:
  // Put 'calendar' (hidden) between 'calculator' and 'timer' in studies
  let custom: SidebarLayoutConfig = moveSidebarItem(initial, 'calendar', 'studies', 1);
  custom = moveSidebarItem(custom, 'calculator', 'studies', 1);
  // studies starts with: ['monthlyHours', 'calculator', 'calendar', 'timer', ...]
  const steppedPastHidden = stepSidebarItem(
    custom,
    'calculator',
    'down',
    availableWithoutNotionAndAdmin
  );
  assert.deepEqual(steppedPastHidden.groups.studies.slice(0, 4), [
    'monthlyHours',
    'calendar',
    'timer',
    'calculator',
  ]);

  // Stepping hidden item itself is a no-op when availableIds excludes it
  assert.deepEqual(
    stepSidebarItem(initial, 'calendar', 'up', availableWithoutNotionAndAdmin),
    initial
  );
});

test('loadSidebarLayout, saveSidebarLayout, and resetSidebarLayout persist and emit CustomEvent safely', () => {
  const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const prevWindow = (globalThis as { window?: unknown }).window;

  const storage = createMemoryStorage();
  const dispatched: Array<{ type: string; detail: unknown }> = [];

  try {
    // 1. Safe when localStorage is undefined (SSR)
    delete (globalThis as { localStorage?: unknown }).localStorage;
    assert.deepEqual(loadSidebarLayout(), createDefaultSidebarLayout());

    // 2. Corrupted JSON in localStorage falls back to default
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    (globalThis as { window?: unknown }).window = {
      dispatchEvent(event: Event) {
        dispatched.push({
          type: event.type,
          detail: (event as CustomEvent).detail,
        });
        return true;
      },
    };

    storage.setItem(SIDEBAR_LAYOUT_STORAGE_KEY, '{not-valid-json');
    assert.deepEqual(loadSidebarLayout(), createDefaultSidebarLayout());

    // 3. saveSidebarLayout normalizes, writes to localStorage, and dispatches event
    const custom = moveSidebarItem(createDefaultSidebarLayout(), 'calendar', 'principal', 0);
    const saved = saveSidebarLayout(custom);
    assert.deepEqual(saved, custom);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, SIDEBAR_LAYOUT_EVENT);
    assert.deepEqual(dispatched[0].detail, custom);

    const rawStored = storage.getItem(SIDEBAR_LAYOUT_STORAGE_KEY);
    assert.ok(rawStored);
    assert.deepEqual(JSON.parse(rawStored), custom);
    assert.deepEqual(loadSidebarLayout(), custom);

    // 4. resetSidebarLayout restores defaults and broadcasts update
    const reset = resetSidebarLayout();
    assert.equal(isDefaultSidebarLayout(reset), true);
    assert.deepEqual(loadSidebarLayout(), createDefaultSidebarLayout());
    assert.equal(dispatched.length, 2);
    assert.equal(dispatched[1].type, SIDEBAR_LAYOUT_EVENT);
    assert.deepEqual(dispatched[1].detail, createDefaultSidebarLayout());
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    (globalThis as { window?: unknown }).window = prevWindow;
  }
});
