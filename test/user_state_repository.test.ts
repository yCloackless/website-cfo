import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { UserStateRepository } from '../src/db/repositories';
import { postgresParams } from '../src/db/postgresSync';

test('reads one SQLite user-state value without materializing its large sibling snapshot', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user_state_snapshots (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  try {
    const repository = new UserStateRepository(db);
    const timerState = JSON.stringify({ status: 'RUNNING', accumulatedTime: 1234 });
    repository.upsert('user-1', {
      cfo_timer_state_v1: timerState,
      cfo_legacy_snapshot: 'x'.repeat(2 * 1024 * 1024),
    });

    assert.equal(repository.getValue('user-1', 'cfo_timer_state_v1'), timerState);
    assert.equal(repository.getValue('user-1', 'missing'), null);
  } finally {
    db.close();
  }
});

test('uses a parameterized JSONB projection for PostgreSQL', () => {
  let query = '';
  let params: unknown[] = [];
  const db = {
    isPostgres: true,
    prepare(sql: string) {
      query = sql;
      return { get: (...values: unknown[]) => { params = values; return { value: 'timer-state' }; } };
    },
  } as any;

  const repository = new UserStateRepository(db);
  assert.equal(repository.getValue('user-1', 'cfo_timer_state_v1'), 'timer-state');
  assert.deepEqual(params, ['cfo_timer_state_v1', 'user-1']);

  const translated = postgresParams(query, params);
  assert.equal(
    translated.text,
    'SELECT payload_json::jsonb ->> $1 AS value FROM user_state_snapshots WHERE user_id = $2',
  );
  assert.deepEqual(translated.values, params);
});

test('updates one state key without replacing its sibling or reading the full snapshot', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user_state_snapshots (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  try {
    const repository = new UserStateRepository(db);
    repository.upsertValue('user-1', 'cfo_timer_state_v1', 'initial');
    repository.upsertValue('user-1', 'cfo_legacy_snapshot', 'x'.repeat(2 * 1024 * 1024));
    repository.upsertValue('user-1', 'cfo_timer_state_v1', 'updated');
    assert.equal(repository.getValue('user-1', 'cfo_timer_state_v1'), 'updated');
    assert.equal(repository.getValue('user-1', 'cfo_legacy_snapshot')?.length, 2 * 1024 * 1024);
  } finally {
    db.close();
  }
});

test('parameterizes PostgreSQL single-key updates', () => {
  let query = '';
  let params: unknown[] = [];
  const db = {
    isPostgres: true,
    prepare(sql: string) {
      query = sql;
      return { run: (...values: unknown[]) => { params = values; return { changes: 1 }; } };
    },
  } as any;
  new UserStateRepository(db).upsertValue('user-1', 'cfo_timer_state_v1', 'updated');
  const translated = postgresParams(query, params);
  assert.match(translated.text, /jsonb_set\(user_state_snapshots\.payload_json::jsonb, ARRAY\[\$5\], to_jsonb\(\$6::text\), true\)::text/);
  assert.equal(params[0], 'user-1');
  assert.equal(params[4], 'cfo_timer_state_v1');
  assert.equal(params[5], 'updated');
});

test('merges partial state updates without replacing sibling values', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE user_state_snapshots (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  try {
    const repository = new UserStateRepository(db);
    repository.upsert('user-1', { cfo_timer_state_v1: 'timer', cfo_study_plan: 'plan' });
    repository.mergeUpsert('user-1', { cfo_study_plan: 'updated' });
    assert.deepEqual(repository.get('user-1')?.payload, {
      cfo_timer_state_v1: 'timer',
      cfo_study_plan: 'updated',
    });
  } finally {
    db.close();
  }
});

test('uses a database-side JSON merge for partial PostgreSQL updates', () => {
  let query = '';
  const db = {
    isPostgres: true,
    prepare(sql: string) {
      query = sql;
      return { run: () => ({ changes: 1 }) };
    },
  } as any;
  new UserStateRepository(db).mergeUpsert('user-1', { cfo_study_plan: 'updated' });
  const translated = postgresParams(query, ['user-1', '{"cfo_study_plan":"updated"}', 'now', 'now']);
  assert.match(translated.text, /payload_json::jsonb \|\| excluded\.payload_json::jsonb/);
});
