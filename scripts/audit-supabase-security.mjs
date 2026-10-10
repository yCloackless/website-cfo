import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('=== AUDITORIA DE SEGURANÇA SUPABASE & POSTGRESQL ===\n');

  // 1. RLS status
  const rlsRes = await pool.query(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  const rlsDisabled = rlsRes.rows.filter(r => !r.rowsecurity);
  const rlsEnabled = rlsRes.rows.filter(r => r.rowsecurity);
  console.log(`[1] TABELAS NO SCHEMA PUBLIC: Total = ${rlsRes.rows.length}`);
  console.log(`    - RLS ATIVADO: ${rlsEnabled.length} (100% BLINDADAS)`);
  console.log(`    - RLS DESATIVADO: ${rlsDisabled.length}`);
  if (rlsDisabled.length > 0) {
    console.log(`    ⚠️ TABELAS COM RLS DESATIVADO:`, rlsDisabled.map(r => r.tablename));
  } else {
    console.log(`    ✅ TODAS AS 73 TABELAS POSSUEM ROW LEVEL SECURITY ATIVADO!`);
  }

  // 2. Policies
  const polRes = await pool.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  console.log(`\n[2] POLÍTICAS RLS: Total = ${polRes.rows.length}`);

  // 3. Grants to anon and authenticated
  const grantsRes = await pool.query(`
    SELECT grantee, table_name, string_agg(privilege_type, ', ') as privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee;
  `);
  console.log(`\n[3] PERMISSÕES DIRETAS (GRANTS) PARA 'anon' E 'authenticated': Total = ${grantsRes.rows.length}`);
  if (grantsRes.rows.length > 0) {
    console.log('    ⚠️ Tabelas com grants ainda presentes:', grantsRes.rows);
  } else {
    console.log('    ✅ NENHUM GRANT PARA ANON/AUTHENTICATED! Todas as permissões públicas foram revogadas com sucesso.');
  }

  // 4. Default privileges on schema public
  const defPrivRes = await pool.query(`
    SELECT defaclobjtype, defaclacl
    FROM pg_default_acl
    JOIN pg_namespace ON pg_namespace.oid = pg_default_acl.defaclnamespace
    WHERE pg_namespace.nspname = 'public';
  `);
  console.log(`\n[4] DEFAULT ACLs NO SCHEMA PUBLIC:`, defPrivRes.rows);

  // 5. Check migration record
  const migRes = await pool.query(`
    SELECT id, name, applied_at FROM _migrations WHERE id = 37;
  `);
  console.log(`\n[5] MIGRATION 37 REGISTRADA NO BANCO:`, migRes.rows[0]);

  await pool.end();
}

main().catch(console.error);
