import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import fs from 'node:fs';

const sourcePath = process.env.SQLITE_PATH || 'data/cfo_app.sqlite';
const databaseUrl = process.env.DATABASE_URL;
const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);

if (!databaseUrl) throw new Error('DATABASE_URL_REQUIRED');
if (!fs.existsSync(sourcePath)) throw new Error(`SQLITE_NOT_FOUND: ${sourcePath}`);
if (process.env.ALLOW_POSTGRES_RESET !== 'true') throw new Error('SET_ALLOW_POSTGRES_RESET_TRUE_FOR_EXPLICIT_EMPTY_TARGET_CONFIRMATION');
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) throw new Error('INVALID_MIGRATION_BATCH_SIZE');

const source = new DatabaseSync(sourcePath, { readOnly: true });
const target = new Pool({
  connectionString: databaseUrl,
  max: 5,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  ssl: databaseUrl.includes('sslmode=require') ||
    process.env.NODE_ENV === 'production' ||
    databaseUrl.includes('neon.tech') ||
    databaseUrl.includes('render.com') ||
    databaseUrl.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
});
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const tables = source.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_migrations' ORDER BY name").all() as { name: string; sql: string }[];
const indexes = source.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as { name: string; sql: string }[];

function dependencies(sql: string): string[] {
  return [...sql.matchAll(/REFERENCES\s+["`]?(\w+)["`]?/gi)].map((m) => m[1]);
}

function tableOrder(): typeof tables {
  const pending = new Map(tables.map((table) => [table.name, table]));
  const ordered: typeof tables = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((table) => dependencies(table.sql).every((dep) => !pending.has(dep)));
    if (!ready.length) throw new Error(`CYCLIC_TABLE_DEPENDENCY: ${[...pending.keys()].join(',')}`);
    ready.forEach((table) => { ordered.push(table); pending.delete(table.name); });
  }
  return ordered;
}

const booleanColumns = new Set([
  'products.is_active', 'activation_tokens.is_used', 'password_resets.is_used',
  'admin_recovery_codes.is_used', 'security_notifications.is_read',
  'student_question_attempts.is_correct', 'question_audit_logs.is_manual_review',
  'users.can_access_notion'
]);

function postgresTableSql(sql: string): string {
  let out = sql.replace(/CREATE TABLE(?: IF NOT EXISTS)?/i, 'CREATE TABLE IF NOT EXISTS');
  out = out.replace(/\s+COLLATE\s+NOCASE/gi, '');
  out = out.replace(/\bBLOB\b/gi, 'BYTEA').replace(/\bREAL\b/gi, 'DOUBLE PRECISION');
  out = out.replace(/\bINTEGER\b/gi, 'INTEGER');
  for (const key of booleanColumns) {
    const [table, column] = key.split('.');
    if (new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+["` + '`' + `]?${table}["` + '`' + `]?`, 'i').test(out)) {
      out = out.replace(new RegExp(`\\b${column}\\s+INTEGER\\b`, 'i'), `${column} BOOLEAN`);
      out = out.replace(new RegExp(`DEFAULT\\s+([01])`, 'i'), (_m, defaultValue) => `DEFAULT ${defaultValue === '1' ? 'TRUE' : 'FALSE'}`);
      out = out.replace(new RegExp(`\\s+CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(\\s*0\\s*,\\s*1\\s*\\)\\s*\\)`, 'i'), '');
    }
  }
  return out;
}

async function main() {
  const client = await target.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const table of tableOrder()) await client.query(postgresTableSql(table.sql));
    for (const index of indexes) await client.query(index.sql.replace(/\bCREATE\s+(UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\b/i, (_m, unique) => `CREATE ${unique || ''}INDEX IF NOT EXISTS`));
    await client.query('CREATE OR REPLACE FUNCTION prevent_immutable_row_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'IMMUTABLE_ROW\'; END; $$');
    await client.query("DROP TRIGGER IF EXISTS prevent_audit_events_update ON audit_events; CREATE TRIGGER prevent_audit_events_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_update()");
    await client.query("DROP TRIGGER IF EXISTS prevent_audit_events_delete ON audit_events; CREATE TRIGGER prevent_audit_events_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_update()");
    await client.query("DROP TRIGGER IF EXISTS prevent_bi_snapshots_update ON board_profile_snapshots; CREATE TRIGGER prevent_bi_snapshots_update BEFORE UPDATE ON board_profile_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_update()");
    await client.query("DROP TRIGGER IF EXISTS prevent_bi_snapshots_delete ON board_profile_snapshots; CREATE TRIGGER prevent_bi_snapshots_delete BEFORE DELETE ON board_profile_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_immutable_row_update()");
    for (const table of tableOrder()) {
      const columns = (source.prepare(`PRAGMA table_info(${quote(table.name)})`).all() as { name: string }[]).map((c) => c.name);
      const rows = source.prepare(`SELECT * FROM ${quote(table.name)}`).all() as Record<string, unknown>[];
      await client.query(`TRUNCATE TABLE ${quote(table.name)} CASCADE`);
      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values: unknown[] = [];
        const tuples = batch.map((row) => `(${columns.map((column) => { const value = booleanColumns.has(`${table.name}.${column}`) ? Boolean(row[column]) : row[column]; values.push(value); return `$${values.length}`; }).join(',')})`);
        if (tuples.length) await client.query(`INSERT INTO ${quote(table.name)} (${columns.map(quote).join(',')}) VALUES ${tuples.join(',')}`, values);
      }
      const count = (await client.query(`SELECT COUNT(*)::int AS count FROM ${quote(table.name)}`)).rows[0].count;
      if (count !== rows.length) throw new Error(`COUNT_MISMATCH ${table.name}: ${rows.length} != ${count}`);
      console.log(`${table.name}: ${rows.length}`);
    }
    await client.query("INSERT INTO _migrations (id, name, applied_at) VALUES (1, '001_sqlite_data_import', NOW()) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, applied_at = EXCLUDED.applied_at");
    await client.query('COMMIT');
    console.log(`Migration completed: ${tables.length} tables, source integrity=${source.prepare('PRAGMA integrity_check').get().integrity_check}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await target.end();
    source.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
