import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const dumpDir = 'C:/Users/renas/Downloads/2026-10-10T04_23Z/cfo_app_dev';
const tablesMetaPath = 'scripts/dump-tables.json';
const tocPath = path.join(dumpDir, 'toc.dat');

const targetUrl = process.env.TARGET_DATABASE_URL || process.env.SUPABASE_DATABASE_URL || process.argv[2];

if (!targetUrl) {
  console.error('ERRO: URL do Supabase não fornecida.');
  process.exit(1);
}

const tables = JSON.parse(fs.readFileSync(tablesMetaPath, 'utf-8'));

// Extrai as definições originais exatas de CREATE TABLE diretamente do toc.dat em UTF-8
const tocStr = fs.readFileSync(tocPath, 'utf-8');
const ddlRegex = /CREATE TABLE "public"\."([^"]+)"\s*\([^;]+;/gi;
const ddlMap = new Map();
let ddlMatch;
while ((ddlMatch = ddlRegex.exec(tocStr)) !== null) {
  ddlMap.set(ddlMatch[1], ddlMatch[0]);
}

const booleanColumns = new Set([
  'is_active', 'is_used', 'is_read', 'is_correct', 'is_manual_review', 'can_access_notion'
]);

function parseDatLine(line, colNames) {
  const parts = line.split('\t');
  return parts.map((val, idx) => {
    if (val === '\\N') return null;
    
    let unescaped = val
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
    
    const colName = colNames[idx] ? colNames[idx].replace(/"/g, '').trim() : '';
    if (booleanColumns.has(colName)) {
      if (unescaped === 't' || unescaped === '1') return true;
      if (unescaped === 'f' || unescaped === '0') return false;
    }
    
    return unescaped;
  });
}

async function restore() {
  const pool = new Pool({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();
  console.log('Conectado ao Supabase!');

  try {
    // 1. Recria as 73 tabelas exatamente com a estrutura idêntica à do dump original (em UTF-8)
    console.log(`Recriando as ${ddlMap.size} tabelas com a estrutura exata do banco original...`);
    for (const [tableName, createSql] of ddlMap.entries()) {
      await client.query(`DROP TABLE IF EXISTS "public"."${tableName}" CASCADE`);
      await client.query(createSql);
    }
    console.log('✓ Estrutura de todas as tabelas recriada com sucesso!');

    // 2. Inicia transação com replicação ativa para ignorar foreign keys e triggers durante a carga
    await client.query('BEGIN');
    await client.query("SET session_replication_role = 'replica'");

    let totalRowsImported = 0;

    for (const item of tables) {
      const filePath = path.join(dumpDir, item.file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0 && l !== '\\.' && l !== '.');

      if (lines.length === 0) continue;

      const colNames = item.columns.split(',').map((c) => c.trim());
      const BATCH_SIZE = 200;

      for (let i = 0; i < lines.length; i += BATCH_SIZE) {
        const batchLines = lines.slice(i, i + BATCH_SIZE);
        const values = [];
        const valuePlaceholders = [];

        for (let rowIdx = 0; rowIdx < batchLines.length; rowIdx++) {
          const parsed = parseDatLine(batchLines[rowIdx], colNames);
          const rowPlaceholders = [];
          for (let colIdx = 0; colIdx < colNames.length; colIdx++) {
            values.push(parsed[colIdx] ?? null);
            rowPlaceholders.push(`$${values.length}`);
          }
          valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        const insertSql = `
          INSERT INTO "public"."${item.table}" (${item.columns})
          VALUES ${valuePlaceholders.join(', ')}
        `;

        await client.query(insertSql, values);
      }

      totalRowsImported += lines.length;
      console.log(`✓ ${item.table}: ${lines.length} registros restaurados.`);
    }

    await client.query("SET session_replication_role = 'origin'");
    await client.query('COMMIT');

    // 3. Ativa RLS em todas as tabelas
    console.log('Ativando Row Level Security (RLS) nas tabelas...');
    await client.query(`
      DO $$
      DECLARE
          t RECORD;
      BEGIN
          FOR t IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
              EXECUTE 'ALTER TABLE public.' || quote_ident(t.tablename) || ' ENABLE ROW LEVEL SECURITY;';
          END LOOP;
      END $$;
    `);

    console.log(`\n🎉 SUCESSO ABSOLUTO! Restauração concluída com sucesso. Total de ${totalRowsImported} registros importados.`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {}
    console.error('ERRO na restauração:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

restore().catch((e) => {
  console.error(e);
  process.exit(1);
});
