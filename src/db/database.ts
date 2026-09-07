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
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin')),
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
        role TEXT NOT NULL CHECK (role IN ('cadet', 'admin')),
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
];

export class DatabaseService {
  private db: DatabaseSync;
  private dbPath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.dbPath = customPath;
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
        // Run migration in a transaction
        this.db.exec('BEGIN TRANSACTION;');
        try {
          this.db.exec(migration.sql);
          this.db
            .prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)')
            .run(migration.id, migration.name, new Date().toISOString());
          this.db.exec('COMMIT;');
        } catch (err) {
          this.db.exec('ROLLBACK;');
          throw new Error(`Falha ao aplicar migration ${migration.name}: ${(err as Error).message}`);
        }
      }
    }
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }

  public close(): void {
    this.db.close();
  }
}

// Singleton export for backend usage
let instance: DatabaseService | null = null;
export function getDb(customPath?: string): DatabaseService {
  if (!instance || customPath) {
    const service = new DatabaseService(customPath);
    if (!customPath) instance = service;
    return service;
  }
  return instance;
}
