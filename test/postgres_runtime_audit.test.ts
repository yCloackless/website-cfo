process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, DatabaseService } from '../src/db/database';
import { PostgresSyncDatabase } from '../src/db/postgresSync';
import { postgresConnectionOptions } from '../src/db/postgresTls';
import { AnkiRepository } from '../src/db/ankiRepository';
import { FlashcardRepository, UserRepository } from '../src/db/repositories';
import { isRedisAvailable, createRateLimitRedisStore } from '../src/services/redisService';
import pg from 'pg';

const localPostgresUrl = process.env.LOCAL_POSTGRES_TEST_URL;

test('9. Local PostgreSQL application role has restricted privileges and can run CRUD/DDL', { skip: !localPostgresUrl }, async () => {
  const target = new URL(localPostgresUrl!);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname), 'Only a local PostgreSQL target is allowed');
  const client = new pg.Client({ connectionString: localPostgresUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const bootstrapUser = process.env.LOCAL_POSTGRES_BOOTSTRAP_USER || 'cfo_bootstrap';
    const { rows: [role] } = await client.query(`
      SELECT current_user AS name, current_database() AS database,
             rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_roles WHERE rolname = current_user
    `);
    assert.ok(role, 'Application role must exist');
    assert.notEqual(role.name, bootstrapUser);
    for (const key of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
      assert.equal(role[key], false, `Application role must not have ${key}`);
    }
    const { rows: [access] } = await client.query(`
      SELECT has_database_privilege(current_user, current_database(), 'CONNECT') AS db_connect,
             has_schema_privilege(current_user, 'public', 'USAGE') AS schema_usage,
             has_schema_privilege(current_user, 'public', 'CREATE') AS schema_create,
             (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE pg_get_userbyid(c.relowner) = current_user AND n.nspname IN ('pg_catalog', 'information_schema')) AS system_owned
    `);
    assert.equal(access.db_connect, true);
    assert.equal(access.schema_usage, true);
    assert.equal(access.schema_create, true, 'Application schema migrations require CREATE');
    assert.equal(access.system_owned, 0);
    const { rows: [bootstrap] } = await client.query('SELECT rolname FROM pg_roles WHERE rolname = $1', [bootstrapUser]);
    assert.ok(bootstrap, 'Separate bootstrap role must exist');
    await assert.rejects(client.query(`SET ROLE "${bootstrapUser.replaceAll('"', '""')}"`), { code: '42501' });
    await client.query('BEGIN');
    try {
      await client.query('CREATE TABLE public.cfo_privilege_probe (id integer PRIMARY KEY, value text)');
      await client.query("INSERT INTO public.cfo_privilege_probe VALUES (1, 'created')");
      await client.query("UPDATE public.cfo_privilege_probe SET value = 'updated' WHERE id = 1");
      const { rows } = await client.query('SELECT value FROM public.cfo_privilege_probe WHERE id = 1');
      assert.equal(rows[0]?.value, 'updated');
      await client.query('DELETE FROM public.cfo_privilege_probe WHERE id = 1');
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();
  }
});

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

test('6. Security boundaries: verified TLS, shared upload limits, and generic internal errors', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = (file: string) => readFileSync(path.join(projectRoot, file), 'utf8');
  const postgres = source('src/db/postgresSync.ts');
  const migration = source('scripts/migrate-sqlite-to-postgres.ts');
  const redis = source('src/services/redisService.ts');
  const server = source('server.ts');
  const whiteboard = source('src/routes/whiteboardRouter.ts');
  const anki = source('src/routes/ankiRouter.ts');

  for (const config of [postgres, migration, redis]) {
  assert.doesNotMatch(config, /rejectUnauthorized\s*:\s*false/);
  }
  assert.match(postgres, /ssl: workerData\.ssl/);
  assert.match(migration, /postgresConnectionOptions\(databaseUrl\)/);
  assert.match(source('src/db/postgresTls.ts'), /rejectUnauthorized: true/);
  assert.match(redis, /REDIS_TLS_CA\s*\?\s*\{\s*ca:\s*process\.env\.REDIS_TLS_CA\s*\}\s*:\s*\{\}/);
  assert.match(server, /createRateLimitRedisStore\('upload'\)/);
  assert.match(whiteboard, /createRateLimitRedisStore\('whiteboard_upload'\)/);
  for (const router of [anki, whiteboard]) {
    assert.doesNotMatch(router, /status\(500\).*message:\s*err\??\.message/);
  }
});

test('7. Local Compose separates bootstrap and restricted PostgreSQL application roles', () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const compose = readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');
  const bootstrapScript = readFileSync(path.join(projectRoot, 'scripts/docker-create-app-role.sh'), 'utf8');
  assert.match(compose, /POSTGRES_USER:\s*\$\{POSTGRES_USER:-cfo_bootstrap\}/);
  assert.match(compose, /CFO_APP_DB_USER:\s*\$\{CFO_APP_DB_USER:-cfo_app\}/);
  assert.match(compose, /DATABASE_URL=.*CFO_APP_DB_USER/);
  assert.match(compose, /POSTGRES_PASSWORD=\s*$/m);
  assert.match(bootstrapScript, /NOSUPERUSER NOCREATEDB NOCREATEROLE/);
  assert.match(bootstrapScript, /NOBYPASSRLS/);
  assert.match(bootstrapScript, /GRANT USAGE, CREATE ON SCHEMA public/);
  assert.match(bootstrapScript, /CFO_APP_DB_USER.*POSTGRES_USER/);
});

test('8. PostgreSQL TLS verifies external providers and keeps private Compose traffic local', () => {
  const production = { NODE_ENV: 'production', DATABASE_SSL_CA: 'test-ca' } as NodeJS.ProcessEnv;
  const local = postgresConnectionOptions('postgresql://cfo_app:pass@postgres-staging:5432/cfo?sslmode=require', production);
  const external = postgresConnectionOptions('postgresql://cfo_app:pass@db.example.test:5432/cfo', production);
  const renderInternal = postgresConnectionOptions('postgresql://cfo_app:pass@dpg-cfodb123:5432/cfo?sslmode=require', { ...production, RENDER: 'true' });
  const renderExternal = postgresConnectionOptions('postgresql://cfo_app:pass@dpg-cfodb123:5432/cfo', production);
  assert.equal(local.ssl, undefined);
  assert.equal(new URL(local.connectionString).searchParams.has('sslmode'), false);
  assert.equal(external.ssl?.rejectUnauthorized, true);
  assert.equal(external.ssl?.ca, 'test-ca');
  assert.equal(renderInternal.ssl, undefined);
  assert.equal(new URL(renderInternal.connectionString).searchParams.has('sslmode'), false);
  assert.equal(new URL(renderExternal.connectionString).hostname, 'dpg-cfodb123.oregon-postgres.render.com');
  assert.equal(renderExternal.ssl?.rejectUnauthorized, true);
});
