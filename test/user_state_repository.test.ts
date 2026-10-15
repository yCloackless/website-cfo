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
