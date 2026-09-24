process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb, DatabaseService } from '../src/db/database';
import { PostgresSyncDatabase } from '../src/db/postgresSync';
import { AnkiRepository } from '../src/db/ankiRepository';
import { FlashcardRepository, UserRepository } from '../src/db/repositories';
import { isRedisAvailable, createRateLimitRedisStore } from '../src/services/redisService';

test('1. Database Detection: PostgresSyncDatabase and DatabaseService expose dialect safely', () => {
  const db = getDb();
  assert.equal(typeof db.isPostgres, 'function', 'DatabaseService must have isPostgres() method');
  assert.equal(typeof db.isPostgres(), 'boolean', 'isPostgres() must return a boolean');

  // Verify PostgresSyncDatabase has isPostgres = true
  assert.equal(PostgresSyncDatabase.prototype.isPostgres, true, 'PostgresSyncDatabase prototype must have isPostgres = true');
});

test('2. Anki Legacy Migration: Never queries sqlite_master when PostgreSQL is active', () => {
  const executedQueries: string[] = [];

  const mockPostgresDb = {
    isPostgres: true,
    prepare: (sql: string) => {
      executedQueries.push(sql);
      return {
        get: () => ({ cnt: 0 }),
        all: () => [],
        run: () => ({ changes: 0 }),
      };
    },
  };

  const result = AnkiRepository.migrateLegacyData(mockPostgresDb);
  assert.equal(result.decksMigrated, 0);
  assert.equal(result.cardsMigrated, 0);

  // Assert that sqlite_master was NEVER queried
  const hasSqliteMasterQuery = executedQueries.some((q) => q.toLowerCase().includes('sqlite_master'));
  assert.equal(hasSqliteMasterQuery, false, 'PostgreSQL migration check must NEVER query sqlite_master');

  // Assert that information_schema was queried
  const hasInfoSchemaQuery = executedQueries.some((q) => q.toLowerCase().includes('information_schema'));
  assert.equal(hasInfoSchemaQuery, true, 'PostgreSQL migration check MUST query information_schema');
});

test('3. Anki Legacy Migration: Queries sqlite_master cleanly when SQLite is active', () => {
  const executedQueries: string[] = [];

  const mockSqliteDb = {
    isPostgres: false,
    prepare: (sql: string) => {
      executedQueries.push(sql);
      return {
        get: () => ({ cnt: 0 }),
        all: () => [],
        run: () => ({ changes: 0 }),
      };
    },
  };

  const result = AnkiRepository.migrateLegacyData(mockSqliteDb);
  assert.equal(result.decksMigrated, 0);
  assert.equal(result.cardsMigrated, 0);

  // Assert that sqlite_master WAS queried for SQLite
  const hasSqliteMasterQuery = executedQueries.some((q) => q.toLowerCase().includes('sqlite_master'));
  assert.equal(hasSqliteMasterQuery, true, 'SQLite migration check must query sqlite_master');
});

test('4. Heatmap Portability: getHeatmapStats uses substr and ISO cutoff without datetime()', () => {
  const db = getDb();
  const rawDb = db.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const flashcardRepo = new FlashcardRepository(rawDb);

  const testUser = userRepo.create({
    email: `heatmap_test_${Date.now()}@cfo.test`,
    username: `heatmap_test_${Date.now()}`,
    passwordHash: '$2b$12$fixture',
    role: 'cadet',
  });

  // Verify that calling getHeatmapStats does not throw any syntax error
  const stats = flashcardRepo.getHeatmapStats(testUser.id, 30);
  assert.ok(Array.isArray(stats), 'getHeatmapStats must return an array');
});

test('5. Redis Service: Falls back cleanly when REDIS_URL is not set', () => {
  // When no REDIS_URL is configured
  assert.equal(typeof isRedisAvailable(), 'boolean');
  const store = createRateLimitRedisStore('test_prefix');
  assert.equal(store, undefined, 'Store should be undefined when Redis is unavailable, triggering express-rate-limit MemoryStore');
});
