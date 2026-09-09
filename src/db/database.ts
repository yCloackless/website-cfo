/**
 * CFO CBMERJ - Database Engine & Migrations
 * Built upon Node.js native SQLite (node:sqlite)
 * ACID-compliant, Zero External Dependencies, Resilient and Auditable
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: '001_initial_schema',
    sql: `
      -- 1. USERS (Contas de Acesso)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        username TEXT NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin', 'support')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_activation')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- 2. PROFILES (Dados Cadastrais do Aluno / Operador)
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        target_exam TEXT,
        bio TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

      -- 3. PRODUCTS (Produtos e Planos de Acesso)
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL DEFAULT 'BRL',
        is_active INTEGER NOT NULL DEFAULT 1,
        features_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

      -- 4. ORDERS (Pedidos com Preço Server-Side e Identificador Público)
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        public_order_id TEXT NOT NULL UNIQUE,
        user_id TEXT,
        customer_email TEXT NOT NULL COLLATE NOCASE,
        product_id TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL DEFAULT 'BRL',
        payment_provider TEXT NOT NULL,
        external_payment_id TEXT,
        payment_method TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (
          status IN (
            'pending',
            'paid',
            'failed',
            'cancelled',
            'refunded',
            'partially_refunded',
            'charged_back'
          )
        ),
        created_at TEXT NOT NULL,
        paid_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_id ON orders(public_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_payment_id ON orders(external_payment_id) WHERE external_payment_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      -- 5. PAYMENTS (Transações Financeiras com Provedor Externo)
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_payment_id TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        currency TEXT NOT NULL DEFAULT 'BRL',
        raw_payload_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ext_id ON payments(provider, external_payment_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

      -- 6. ACTIVATION TOKENS (Tokens de Ativação Segura e Uso Único)
      CREATE TABLE IF NOT EXISTS activation_tokens (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        customer_email TEXT NOT NULL COLLATE NOCASE,
        is_used INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0, 1)),
        used_at TEXT,
        used_by_user_id TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_tokens_hash ON activation_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_activation_tokens_order_id ON activation_tokens(order_id);
      CREATE INDEX IF NOT EXISTS idx_activation_tokens_email ON activation_tokens(customer_email);

      -- 7. ENTITLEMENTS (Permissões de Conteúdo Concedidas Após Confirmação)
      CREATE TABLE IF NOT EXISTS entitlements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
        granted_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlements_user_product ON entitlements(user_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_order_id ON entitlements(order_id);

      -- 8. REFUND REQUESTS (Solicitações com Fluxo Administrativo Rigoroso)
      CREATE TABLE IF NOT EXISTS refund_requests (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        user_id TEXT,
        reason TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        status TEXT NOT NULL DEFAULT 'requested' CHECK (
          status IN (
            'requested',
            'under_review',
            'approved_by_admin',
            'rejected',
            'processing',
            'refunded',
            'failed',
            'cancelled'
          )
        ),
        admin_notes TEXT,
        reviewed_by_admin_id TEXT,
        reviewed_at TEXT,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id ON refund_requests(order_id);
      CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);

      -- 9. AUDIT EVENTS (Trilha Imutável Server-Side)
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        resource TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'WARNING')),
        ip TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
      CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor);
      CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
    `,
  },
  {
    id: 2,
    name: '002_auth_sessions_and_resets',
    sql: `
      -- 10. PASSWORD RESETS (Recuperação Segura com Hash de Código de 6 Dígitos / Token)
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        is_used INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0, 1)),
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_resets_code_hash ON password_resets(code_hash);

      -- 11. SESSIONS (Sessões Server-Side com Revogação Instantânea e Hash de Token)
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin', 'support')),
        ip TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
  {
    id: 3,
    name: '003_profile_avatar_and_username_update',
    sql: `
      ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
    `,
  },
  {
    id: 4,
    name: '004_audit_events_security_monitoring',
    sql: `
      ALTER TABLE audit_events ADD COLUMN user_id TEXT;
      ALTER TABLE audit_events ADD COLUMN user_agent TEXT;
      CREATE INDEX IF NOT EXISTS idx_audit_events_status ON audit_events(status);
      CREATE INDEX IF NOT EXISTS idx_audit_events_ip ON audit_events(ip);
      CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
    `,
  },
  {
    id: 5,
    name: '005_admin_recovery_codes',
    sql: `
      -- 12. ADMIN RECOVERY CODES (Códigos de Backup de Uso Único Armazenados em Hash)
      CREATE TABLE IF NOT EXISTS admin_recovery_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        is_used INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0, 1)),
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id ON admin_recovery_codes(user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_codes_hash ON admin_recovery_codes(code_hash);
      CREATE INDEX IF NOT EXISTS idx_recovery_codes_is_used ON admin_recovery_codes(is_used);
    `,
  },
  {
    id: 6,
    name: '006_support_role_and_permissions',
    sql: `
      -- Atualiza a tabela users para aceitar role 'support'
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS users_new (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        username TEXT NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin', 'support')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_activation')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO users_new SELECT id, email, username, password_hash, role, status, created_at, updated_at FROM users;
      DROP TABLE IF EXISTS users;
      ALTER TABLE users_new RENAME TO users;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- Atualiza a tabela sessions para aceitar role 'support'
      CREATE TABLE IF NOT EXISTS sessions_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin', 'support')),
        ip TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT OR IGNORE INTO sessions_new SELECT id, user_id, token_hash, role, ip, user_agent, expires_at, revoked_at, created_at FROM sessions;
      DROP TABLE IF EXISTS sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      PRAGMA foreign_keys = ON;
    `,
  },
  {
    id: 7,
    name: '007_audit_events_integrity_and_targets',
    sql: `
      -- Adiciona colunas para auditoria estruturada
      ALTER TABLE audit_events ADD COLUMN actor_user_id TEXT;
      ALTER TABLE audit_events ADD COLUMN target_type TEXT;
      ALTER TABLE audit_events ADD COLUMN target_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id ON audit_events(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_type, target_id);

      -- Integridade Append-Only: Impede qualquer UPDATE ou DELETE na tabela audit_events
      CREATE TRIGGER IF NOT EXISTS prevent_audit_events_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(FAIL, 'AUDIT_LOG_IMMUTABLE: Audit logs are append-only and cannot be updated');
      END;

      CREATE TRIGGER IF NOT EXISTS prevent_audit_events_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(FAIL, 'AUDIT_LOG_IMMUTABLE: Audit logs are append-only and cannot be deleted');
      END;
    `,
  },
  {
    id: 8,
    name: '008_user_state_persistence',
    sql: `
      -- Estado de estudo do usuário: fonte de verdade server-side, vinculado ao user_id.
      -- O payload é versionado para permitir evolução sem apagar registros existentes.
      CREATE TABLE IF NOT EXISTS user_state_snapshots (
        user_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_user_state_snapshots_updated_at ON user_state_snapshots(updated_at);
    `,
  },
  {
    id: 9,
    name: '009_cadet_exclusive_session_locks',
    sql: `
      -- Controle de sessão exclusiva e trava de 24h para a conta cadete
      CREATE TABLE IF NOT EXISTS cadet_session_locks (
        user_id TEXT PRIMARY KEY,
        active_session_id TEXT,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (active_session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cadet_locks_until ON cadet_session_locks(locked_until);
    `,
  },
  {
    id: 10,
    name: '010_cadet_security_alerts_and_source_blocks',
    sql: `
      -- 1. Bloqueio temporário de origem por 5 horas (em caso de violações atômicas de segurança)
      CREATE TABLE IF NOT EXISTS cadet_temporary_source_blocks (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        user_id TEXT,
        reason TEXT NOT NULL,
        locked_until TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_source_blocks_ip_until ON cadet_temporary_source_blocks(ip, locked_until);

      -- 2. Central de Notificações com persistência e estado de leitura server-side
      CREATE TABLE IF NOT EXISTS security_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        read_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON security_notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON security_notifications(created_at);
    `,
  },
  {
    id: 11,
    name: '011_user_notion_access',
    sql: `
      -- Permissao individual para exibir e usar a aba Agenda Notion.
      -- Administradores continuam tendo acesso por role; esta flag permite o ADM liberar/remover para outras contas.
      ALTER TABLE users ADD COLUMN can_access_notion INTEGER NOT NULL DEFAULT 0 CHECK (can_access_notion IN (0, 1));
      UPDATE users SET can_access_notion = 1 WHERE role = 'admin';
      CREATE INDEX IF NOT EXISTS idx_users_notion_access ON users(can_access_notion);
    `,
  },
  {
    id: 12,
    name: '012_impersonation_sessions',
    sql: `
      ALTER TABLE sessions ADD COLUMN impersonated_by_user_id TEXT;
      ALTER TABLE sessions ADD COLUMN parent_session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_sessions_impersonated_by ON sessions(impersonated_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
    `,
  },
  {
    id: 13,
    name: '013_password_reset_bruteforce_protection',
    sql: `
      -- Adiciona coluna de controle anti-força bruta na recuperação de senha
      ALTER TABLE password_resets ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    id: 14,
    name: '014_secure_uploaded_files',
    sql: `
      -- Tabela de Arquivos com Quarentena e Validação Estrutural
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK (
          status IN ('UPLOADED', 'QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'PROCESSING', 'READY')
        ),
        scan_details_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files(user_id);
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_status ON uploaded_files(status);
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_sha256 ON uploaded_files(sha256);
      CREATE INDEX IF NOT EXISTS idx_uploaded_files_created_at ON uploaded_files(created_at);
    `,
  },
  {
    id: 15,
    name: '015_exam_bank_tables',
    sql: `
      -- 1. EXAM PAPERS (Provas cadastradas com metadados)
      CREATE TABLE IF NOT EXISTS exam_papers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        institution TEXT NOT NULL,
        exam_year INTEGER NOT NULL,
        file_id TEXT,
        total_questions INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'READY' CHECK (
          status IN ('QUEUED', 'PROCESSING', 'READY', 'ERROR', 'NEEDS_REVIEW')
        ),
        primary_disciplines_json TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_exam_papers_user_id ON exam_papers(user_id);
      CREATE INDEX IF NOT EXISTS idx_exam_papers_status ON exam_papers(status);
      CREATE INDEX IF NOT EXISTS idx_exam_papers_year ON exam_papers(exam_year);
      CREATE INDEX IF NOT EXISTS idx_exam_papers_created_at ON exam_papers(created_at);

      -- 2. EXAM QUESTIONS (Questões extraídas, classificadas e com resolução)
      CREATE TABLE IF NOT EXISTS exam_questions (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        question_number INTEGER NOT NULL,
        statement TEXT NOT NULL,
        support_text TEXT,
        options_json TEXT NOT NULL,
        correct_option TEXT CHECK (correct_option IN ('A', 'B', 'C', 'D', 'E') OR correct_option IS NULL),
        discipline TEXT NOT NULL,
        topic TEXT NOT NULL,
        subtopic TEXT NOT NULL,
        difficulty TEXT NOT NULL DEFAULT 'Médio' CHECK (difficulty IN ('Fácil', 'Médio', 'Difícil')),
        difficulty_score REAL NOT NULL DEFAULT 0.5,
        confidence_score REAL NOT NULL DEFAULT 0.95,
        images_json TEXT,
        ai_solution_json TEXT,
        status TEXT NOT NULL DEFAULT 'READY',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_id ON exam_questions(exam_id);
      CREATE INDEX IF NOT EXISTS idx_exam_questions_user_id ON exam_questions(user_id);
      CREATE INDEX IF NOT EXISTS idx_exam_questions_discipline ON exam_questions(discipline);
      CREATE INDEX IF NOT EXISTS idx_exam_questions_difficulty ON exam_questions(difficulty);
      CREATE INDEX IF NOT EXISTS idx_exam_questions_number ON exam_questions(exam_id, question_number);

      -- 3. EXAM JOBS (Controle de Processamento Assíncrono e Idempotência)
      CREATE TABLE IF NOT EXISTS exam_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        exam_id TEXT,
        job_type TEXT NOT NULL CHECK (job_type IN ('EXTRACTION', 'AI_SOLVE')),
        status TEXT NOT NULL DEFAULT 'queued' CHECK (
          status IN ('queued', 'processing', 'reviewing', 'completed', 'failed')
        ),
        progress INTEGER NOT NULL DEFAULT 0,
        total_items INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        idempotency_key TEXT,
        result_summary_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_jobs_idempotency ON exam_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_exam_jobs_user_id ON exam_jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_exam_jobs_status ON exam_jobs(status);
    `,
  },
  {
    id: 16,
    name: '016_exam_crop_and_segments',
    sql: `
      -- 1. QUESTION SEGMENTS (Bounding boxes determinísticos por página/coluna)
      CREATE TABLE IF NOT EXISTS question_segments (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        page INTEGER NOT NULL CHECK (page >= 1),
        x REAL NOT NULL CHECK (x >= 0),
        y REAL NOT NULL CHECK (y >= 0),
        width REAL NOT NULL CHECK (width > 0),
        height REAL NOT NULL CHECK (height > 0),
        order_num INTEGER NOT NULL DEFAULT 1,
        confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
        source TEXT NOT NULL CHECK (source IN ('pdf_text', 'ocr', 'layout', 'ai_fallback', 'manual')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE,
        FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_qsegments_question_id ON question_segments(question_id);
      CREATE INDEX IF NOT EXISTS idx_qsegments_exam_id ON question_segments(exam_id);
      CREATE INDEX IF NOT EXISTS idx_qsegments_page ON question_segments(page);

      -- 2. QUESTION ASSETS (Imagens de recortes em alta fidelidade WebP/PNG)
      CREATE TABLE IF NOT EXISTS question_assets (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        segment_id TEXT,
        asset_type TEXT NOT NULL CHECK (asset_type IN ('original_crop', 'thumbnail', 'support_crop')),
        file_path TEXT NOT NULL,
        public_url TEXT,
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        format TEXT NOT NULL DEFAULT 'webp',
        dpi INTEGER NOT NULL DEFAULT 180,
        created_at TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE,
        FOREIGN KEY (segment_id) REFERENCES question_segments(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_qassets_question_id ON question_assets(question_id);
      CREATE INDEX IF NOT EXISTS idx_qassets_segment_id ON question_assets(segment_id);

      -- 3. SUPPORT MATERIALS (Textos de Apoio compartilhados entre questões)
      CREATE TABLE IF NOT EXISTS support_materials (
        id TEXT PRIMARY KEY,
        exam_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content_text TEXT,
        page INTEGER NOT NULL CHECK (page >= 1),
        bbox_json TEXT,
        asset_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_support_materials_exam_id ON support_materials(exam_id);

      -- 4. QUESTION AUDIT LOGS (Auditoria de detecção e edição manual)
      CREATE TABLE IF NOT EXISTS question_audit_logs (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        detector TEXT NOT NULL,
        confidence REAL NOT NULL,
        is_manual_review INTEGER NOT NULL DEFAULT 0 CHECK (is_manual_review IN (0, 1)),
        user_id TEXT,
        previous_bbox_json TEXT,
        new_bbox_json TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_qaudit_question_id ON question_audit_logs(question_id);
      CREATE INDEX IF NOT EXISTS idx_qaudit_created_at ON question_audit_logs(created_at);
    `,
  },
  {
    id: 17,
    name: '017_study_sessions',
    sql: `
      -- SESSÕES DE ESTUDO DO CRONÔMETRO (Auditoria e Persistência de Horas Líquidas)
      CREATE TABLE IF NOT EXISTS study_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        subject_name TEXT NOT NULL,
        topic TEXT,
        date_str TEXT NOT NULL, -- YYYY-MM-DD
        duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
        started_at TEXT,
        ended_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_study_sessions_user_date ON study_sessions(user_id, date_str);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_user_subject ON study_sessions(user_id, subject_id);
      CREATE INDEX IF NOT EXISTS idx_study_sessions_created_at ON study_sessions(created_at);
    `,
  },
  {
    id: 18,
    name: '018_admin_board_intelligence',
    sql: `
      -- Perfis administrativos de banca/concurso. A feature nasce isolada e
      -- somente o backend admin pode escrever nestas tabelas.
      CREATE TABLE IF NOT EXISTS board_intelligence_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        institution TEXT NOT NULL,
        board TEXT NOT NULL,
        contest TEXT,
        role_name TEXT,
        period_start INTEGER,
        period_end INTEGER,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
        active_version INTEGER NOT NULL DEFAULT 0,
        exam_count INTEGER NOT NULL DEFAULT 0 CHECK (exam_count >= 0),
        question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
        created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS idx_bi_profiles_status ON board_intelligence_profiles(status);
      CREATE INDEX IF NOT EXISTS idx_bi_profiles_board ON board_intelligence_profiles(board);

      CREATE TABLE IF NOT EXISTS board_intelligence_exams (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        exam_paper_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (
          status IN ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED')
        ),
        name TEXT NOT NULL,
        exam_year INTEGER NOT NULL,
        board TEXT,
        role_name TEXT,
        phase TEXT,
        discipline TEXT,
        exam_type TEXT,
        official_answer_key_json TEXT,
        notes TEXT,
        approved_by_user_id TEXT,
        approved_at TEXT,
        rejected_by_user_id TEXT,
        rejected_at TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES board_intelligence_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (exam_paper_id) REFERENCES exam_papers(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_exams_profile_paper ON board_intelligence_exams(profile_id, exam_paper_id);
      CREATE INDEX IF NOT EXISTS idx_bi_exams_profile_status ON board_intelligence_exams(profile_id, status);
      CREATE INDEX IF NOT EXISTS idx_bi_exams_year ON board_intelligence_exams(exam_year);

      CREATE TABLE IF NOT EXISTS board_question_analysis (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        exam_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        question_hash TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        model_version TEXT NOT NULL,
        taxonomy_json TEXT NOT NULL,
        metrics_json TEXT NOT NULL,
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'LOW_CONFIDENCE', 'FAILED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES board_intelligence_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (exam_id) REFERENCES board_intelligence_exams(id) ON DELETE CASCADE,
        FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_analysis_question_version ON board_question_analysis(profile_id, question_id, prompt_version, model_version);
      CREATE INDEX IF NOT EXISTS idx_bi_analysis_cache ON board_question_analysis(question_hash, prompt_version, model_version);
      CREATE INDEX IF NOT EXISTS idx_bi_analysis_profile ON board_question_analysis(profile_id);
      CREATE INDEX IF NOT EXISTS idx_bi_analysis_exam ON board_question_analysis(exam_id);

      CREATE TABLE IF NOT EXISTS board_profile_snapshots (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        source_exam_ids_json TEXT NOT NULL,
        source_question_ids_json TEXT NOT NULL,
        source_analysis_ids_json TEXT NOT NULL,
        stats_json TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES board_intelligence_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE TRIGGER IF NOT EXISTS prevent_bi_snapshots_update
      BEFORE UPDATE ON board_profile_snapshots
      BEGIN
        SELECT RAISE(FAIL, 'BOARD_PROFILE_SNAPSHOT_IMMUTABLE');
      END;
      CREATE TRIGGER IF NOT EXISTS prevent_bi_snapshots_delete
      BEFORE DELETE ON board_profile_snapshots
      BEGIN
        SELECT RAISE(FAIL, 'BOARD_PROFILE_SNAPSHOT_IMMUTABLE');
      END;

      CREATE TABLE IF NOT EXISTS board_profile_versions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISCARDED', 'SUPERSEDED')),
        snapshot_id TEXT NOT NULL,
        profile_json TEXT NOT NULL,
        change_summary_json TEXT NOT NULL,
        style_summary TEXT NOT NULL,
        confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
        generated_by_user_id TEXT NOT NULL,
        published_by_user_id TEXT,
        published_at TEXT,
        restored_from_version_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES board_intelligence_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (snapshot_id) REFERENCES board_profile_snapshots(id) ON DELETE RESTRICT,
        FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
        FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_versions_profile_version ON board_profile_versions(profile_id, version);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_versions_one_active ON board_profile_versions(profile_id) WHERE status = 'ACTIVE';
      CREATE INDEX IF NOT EXISTS idx_bi_versions_profile_status ON board_profile_versions(profile_id, status);

      CREATE TABLE IF NOT EXISTS board_intelligence_jobs (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        job_type TEXT NOT NULL CHECK (job_type IN ('IMPORT', 'ANALYZE', 'AGGREGATE', 'GENERATE_PROFILE', 'REBUILD')),
        status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
          status IN ('QUEUED', 'EXTRACTING', 'CLASSIFYING', 'ANALYZING', 'AGGREGATING', 'GENERATING_PROFILE', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED')
        ),
        progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
        total_items INTEGER NOT NULL DEFAULT 0 CHECK (total_items >= 0),
        idempotency_key TEXT,
        checkpoint_json TEXT,
        result_summary_json TEXT,
        error_message TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES board_intelligence_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_jobs_idempotency ON board_intelligence_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bi_jobs_one_rebuild ON board_intelligence_jobs(profile_id)
        WHERE job_type = 'REBUILD' AND status NOT IN ('COMPLETED', 'FAILED');
      CREATE INDEX IF NOT EXISTS idx_bi_jobs_profile_status ON board_intelligence_jobs(profile_id, status);
    `,
  },
];




export class DatabaseService {
  private db: DatabaseSync;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } else {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'cfo_app.sqlite');
    }

    this.db = new DatabaseSync(this.dbPath);
    this.configurePragmas();
    this.runMigrations();
  }

  private configurePragmas(): void {
    // Set busy timeout for concurrent process access
    this.db.exec('PRAGMA busy_timeout = 10000;');
    // Enable foreign keys constraints in SQLite
    this.db.exec('PRAGMA foreign_keys = ON;');
    // Optimize performance and durability
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const appliedRows = this.db.prepare('SELECT id FROM _migrations').all() as { id: number }[];
    const appliedIds = new Set(appliedRows.map((r) => r.id));

    for (const migration of MIGRATIONS) {
      if (!appliedIds.has(migration.id)) {
        // PRAGMA foreign_keys must be changed OUTSIDE the transaction used to rebuild tables.
        if (migration.id === 6) this.db.exec('PRAGMA foreign_keys = OFF;');
        this.db.exec('BEGIN TRANSACTION;');
        try {
          this.db.exec(migration.sql);
          this.db
            .prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)')
            .run(migration.id, migration.name, new Date().toISOString());
          if (this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key integrity check failed');
          this.db.exec('COMMIT;');
        } catch (err) {
          this.db.exec('ROLLBACK;');
          throw new Error(`Falha ao aplicar migration ${migration.name}: ${(err as Error).message}`);
        } finally {
          if (migration.id === 6) this.db.exec('PRAGMA foreign_keys = ON;');
        }
      }
    }
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  /**
   * Executes a callback inside an atomic ACID transaction.
   * Automatically commits on success or rolls back on any error.
   */
  public transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  public close(): void {
    this.db.close();
  }
}

// Singleton export for backend usage
let instance: DatabaseService | null = null;
export function isDatabaseOpen(): boolean { return instance !== null; }
export function getDb(customPath?: string): DatabaseService {
  if (!instance || customPath) {
    const service = new DatabaseService(customPath);
    if (!customPath) instance = service;
    return service;
  }
  return instance;
}
