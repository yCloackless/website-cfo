process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, MIGRATIONS } from '../src/db/database';

test('Supabase Security Hardening: Migration 037 está registrada e válida', () => {
  const mig37 = MIGRATIONS.find((m) => m.id === 37);
  assert.ok(mig37, 'Migration 037 deve existir no array MIGRATIONS');
  assert.equal(mig37.name, '037_supabase_security_hardening');
  assert.ok(mig37.sql.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated'));
  assert.ok(mig37.sql.includes('ENABLE ROW LEVEL SECURITY'));
});

test('Supabase Security Hardening: Migration 037 aplica sem erros no banco local', () => {
  const db = getDb();
  const rawDb = db.getRawDb();
  const row = rawDb.prepare('SELECT id, name FROM _migrations WHERE id = 37').get() as any;
  assert.ok(row, 'Migration 37 deve estar registrada na tabela _migrations');
  assert.equal(row.id, 37);
  assert.equal(row.name, '037_supabase_security_hardening');
});

test('Supabase Security Hardening: Arquivo SQL autônomo scripts/037_supabase_security_hardening.sql existe e é consistente', () => {
  const sqlPath = new URL('../scripts/037_supabase_security_hardening.sql', import.meta.url);
  assert.ok(fs.existsSync(sqlPath), 'Arquivo SQL autônomo da migration 37 deve existir');
  const content = fs.readFileSync(sqlPath, 'utf-8');
  assert.ok(content.includes('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;'));
  assert.ok(content.includes('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;'));
  assert.ok(content.includes('ENABLE ROW LEVEL SECURITY;'));
});
