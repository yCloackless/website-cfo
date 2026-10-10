-- ============================================================================
-- Migration 037: Supabase & PostgreSQL Security Hardening (Defense in Depth)
-- Objetivo: Blindar o schema public contra acessos não autorizados via PostgREST/API.
-- Idempotente, não destrutivo e preserva 100% das operações legítimas do backend.
-- ============================================================================

-- 1. Revoga todos os privilégios das roles públicas 'anon' e 'authenticated'
--    nas tabelas, sequências e rotinas existentes no schema public.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;
  END IF;
END $$;

-- 2. Revoga privilégios padrão futuros para que novas tabelas e objetos criados
--    futuramente não nasçam expostos para 'anon' ou 'authenticated'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;
  END IF;
END $$;

-- 3. Ativa Row Level Security (RLS) em TODAS as tabelas do schema public.
--    Mesmo que algum privilégio seja concedido por engano no futuro,
--    o PostgreSQL impedirá qualquer acesso sem uma política explícita.
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%' 
      AND tablename NOT LIKE '_prisma%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
  END LOOP;
END $$;

-- 4. Registrar a aplicação da migration na tabela _migrations
INSERT INTO _migrations (id, name, applied_at)
VALUES (37, '037_supabase_security_hardening', NOW()::text)
ON CONFLICT (id) DO UPDATE SET applied_at = EXCLUDED.applied_at;
