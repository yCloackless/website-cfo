import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../src/db/database';

const uniqueColumns = [
  { table: 'activation_tokens', column: 'token_hash', redundantIndex: 'idx_activation_tokens_hash' },
  { table: 'admin_recovery_codes', column: 'code_hash', redundantIndex: 'idx_recovery_codes_hash' },
  { table: 'orders', column: 'public_order_id', redundantIndex: 'idx_orders_public_id' },
  { table: 'privacy_requests', column: 'request_code', redundantIndex: 'idx_privacy_requests_code' },
  { table: 'sessions', column: 'token_hash', redundantIndex: 'idx_sessions_token_hash' },
];

test('keeps unique constraints and removes redundant unique indexes', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-duplicate-indexes-'));
  const dbService = new DatabaseService(path.join(tempDir, 'test.sqlite'));
  const db = dbService.getRawDb();

  try {
    for (const { table, column, redundantIndex } of uniqueColumns) {
      const duplicate = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?"
      ).get(redundantIndex);
      assert.equal(duplicate, undefined, `${redundantIndex} should be removed`);

      const indexes = db.prepare(`PRAGMA index_list('${table}')`).all() as Array<{ name: string; unique: number }>;
      const matchingUniqueIndexes = indexes.filter((index) => {
        if (!index.unique) return false;
        const columns = db.prepare(`PRAGMA index_info('${index.name}')`).all() as Array<{ name: string }>;
        return columns.length === 1 && columns[0].name === column;
      });

      assert.equal(matchingUniqueIndexes.length, 1, `${table}.${column} must remain uniquely constrained`);
    }
  } finally {
    dbService.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
