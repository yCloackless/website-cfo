/**
 * CFO CBMERJ - Data Repositories & Invariant Protections
 * Complete Data Access Layer with Server-Side Authority
 */

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  DbUser,
  DbProfile,
  DbProduct,
  DbOrder,
  DbPayment,
  DbActivationToken,
  DbEntitlement,
  DbRefundRequest,
  DbAuditEvent,
  DbPasswordReset,
  DbSession,
  DbRecoveryCode,
  DbCadetSessionLock,
  DbTemporarySourceBlock,
  DbSecurityNotification,
  SecurityNotificationType,
  DbUploadedFile,
  UploadScanStatus,
  DbExamPaper,
  DbExamQuestion,
  DbExamJob,
  DbQuestionSegment,
  DbQuestionAsset,
  DbSupportMaterial,
  DbQuestionAuditLog,
  QuestionSegmentSource,
  QuestionAssetType,
  ExamOption,
  ExamPaperStatus,
  ExamPublicationStatus,
  QuestionReviewStatus,
  ExamDifficulty,
  ExamJobType,
  ExamJobStatus,
  OrderStatus,
  RefundRequestStatus,
  UserRole,
  UserStatus,
  PaymentStatus,
  DbStudySession,
  DayStudySummary,
  DbSystemIntegration,
  DbConsentRecord,
  DbPrivacyRequest,
  ConsentCategory,
  ConsentStatus,
  PrivacyRequestType,
  PrivacyRequestStatus,
  DbDeceptionEvent,
  HoneypotEventType,
  HoneypotAction,
  DbFlashcardSubject,
  DbFlashcardDeck,
  DbFlashcard,
  DbFlashcardReview,
  FlashcardStatus,
  FlashcardRating,
} from './schema';
import { HoneypotMetrics } from '../services/honeypot/honeypotTypes';

function normalizeExamOptions(raw: unknown): ExamOption[] {
  if (!Array.isArray(raw)) return [];

  const valid = new Set(['A', 'B', 'C', 'D', 'E']);
  const seen = new Set<string>();
  const result: ExamOption[] = [];

  for (const item of raw as any[]) {
    const letter = typeof item?.letter === 'string'
      ? item.letter.trim().toUpperCase().match(/[A-E]/)?.[0]
      : undefined;
    const text = typeof item?.text === 'string'
      ? item.text.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    if (!letter || !valid.has(letter) || !text || seen.has(letter)) continue;
    seen.add(letter);
    result.push({ letter: letter as ExamOption['letter'], text });
    if (result.length === 5) break;
  }

  return result;
}

export class UserRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    email: string;
    username: string;
    passwordHash: string;
    role?: UserRole;
    status?: UserStatus;
    canAccessNotion?: boolean;
    canAccessIfrj?: boolean;
  }): DbUser {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const role = data.role || 'cadet';
    const status = data.status || 'active';

    this.db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, status, can_access_notion, can_access_ifrj, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.email.toLowerCase().trim(),
        data.username.toLowerCase().trim(),
        data.passwordHash,
        role,
        status,
        data.canAccessNotion || role === 'admin' ? 1 : 0,
        data.canAccessIfrj || role === 'admin' ? 1 : 0,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbUser | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapUser(row);
  }

  public findByEmail(email: string): DbUser | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase().trim()) as any;
    if (!row) return null;
    return this.mapUser(row);
  }

  public findByUsername(username: string): DbUser | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username.toLowerCase().trim()) as any;
    if (!row) return null;
    return this.mapUser(row);
  }

  public findByEmailPrefix(prefix: string): DbUser | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email LIKE ? AND status = 'active' LIMIT 1")
      .get(`${prefix.toLowerCase().trim()}@%`) as any;
    if (!row) return null;
    return this.mapUser(row);
  }

  public updatePasswordHash(userId: string, newHash: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newHash, now, userId);
  }

  public updateEmail(userId: string, newEmail: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?')
      .run(newEmail.toLowerCase().trim(), now, userId);
  }

  public updateUsername(userId: string, newUsername: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?')
      .run(newUsername.toLowerCase().trim(), now, userId);
  }

  public updateStatus(userId: string, status: UserStatus): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, now, userId);
  }

  public updateRole(userId: string, role: UserRole): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET role = ?, can_access_notion = CASE WHEN ? = ? THEN TRUE ELSE can_access_notion END, updated_at = ? WHERE id = ?')
      .run(role, role, 'admin', now, userId);
  }

  public updateNotionAccess(userId: string, canAccessNotion: boolean): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET can_access_notion = ?, updated_at = ? WHERE id = ?').run(canAccessNotion ? '1' : '0', now, userId);
  }

  public updateIfrjAccess(userId: string, canAccessIfrj: boolean): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE users SET can_access_ifrj = ?, updated_at = ? WHERE id = ?').run(canAccessIfrj ? 1 : 0, now, userId);
  }

  public deleteById(userId: string): boolean {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return Number(result.changes) > 0;
  }

  /**
   * Anonymizes user personal data according to LGPD Art. 16 (eliminação/anonimização).
   * Detaches personal identity while keeping referential integrity for non-personal
   * audit logs, historical exam bank records, and financial transaction requirements.
   */
  public anonymizeUser(userId: string): boolean {
    const user = this.findById(userId);
    if (!user) return false;
    const now = new Date().toISOString();
    const anonUuid = crypto.randomUUID().slice(0, 8);
    const anonEmail = `deleted-${anonUuid}@anonymized.cfo`;
    const anonUsername = `deleted_${anonUuid}`;
    // Unmatchable, salted marker that cannot match any bcrypt attempt
    const unmatchableHash = '$2b$12$ACCOUNT_ANONYMIZED_AND_DELETED_PER_LGPD_REQUEST';

    // 1. Anonymize user record
    this.db.prepare(
      `UPDATE users
       SET email = ?, username = ?, password_hash = ?, status = 'suspended', can_access_notion = FALSE, updated_at = ?
       WHERE id = ?`
    ).run(anonEmail, anonUsername, unmatchableHash, now, userId);

    // 2. Anonymize profile
    this.db.prepare(
      `UPDATE profiles
       SET full_name = 'Usuário Anonimizado', phone = NULL, bio = NULL, avatar_url = NULL, updated_at = ?
       WHERE user_id = ?`
    ).run(now, userId);

    // 3. Clear sessions, locks, resets and personal transient states
    const safeDelete = (sql: string, id: string) => {
      try {
        this.db.prepare(sql).run(id);
      } catch {}
    };

    safeDelete('DELETE FROM sessions WHERE user_id = ?', userId);
    safeDelete('DELETE FROM cadet_session_locks WHERE user_id = ?', userId);
    safeDelete('DELETE FROM password_resets WHERE user_id = ?', userId);
    safeDelete('DELETE FROM admin_recovery_codes WHERE user_id = ?', userId);
    safeDelete('DELETE FROM user_state_snapshots WHERE user_id = ?', userId);
    safeDelete('DELETE FROM security_notifications WHERE user_id = ?', userId);

    return true;
  }

  public findAdminFiltered(options: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): {
    items: Array<{
      id: string;
      email: string;
      username: string;
      role: UserRole;
      status: UserStatus;
      createdAt: string;
      updatedAt: string;
      fullName?: string | null;
      avatarUrl?: string | null;
      phone?: string | null;
      canAccessNotion: boolean;
      canAccessIfrj: boolean;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options.role) {
      whereClauses.push('u.role = ?');
      params.push(options.role);
    }

    if (options.status) {
      whereClauses.push('u.status = ?');
      params.push(options.status);
    }

    if (options.search) {
      whereClauses.push('(u.username LIKE ? OR u.email LIKE ? OR u.id LIKE ? OR p.full_name LIKE ?)');
      const pattern = `%${options.search}%`;
      params.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow: any = this.db
      .prepare(`SELECT COUNT(*) as total FROM users u LEFT JOIN profiles p ON u.id = p.user_id ${whereSql}`)
      .get(...params);
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const rows: any[] = this.db
      .prepare(
        `SELECT u.id, u.email, u.username, u.role, u.status, u.can_access_notion, u.can_access_ifrj, u.created_at, u.updated_at,
                p.full_name, p.avatar_url, p.phone
         FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
         ${whereSql}
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      username: r.username,
      role: r.role as UserRole,
      status: r.status as UserStatus,
      canAccessNotion: Boolean(r.can_access_notion) || r.role === 'admin',
      canAccessIfrj: Boolean(r.can_access_ifrj) || r.role === 'admin',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      fullName: r.full_name ?? null,
      avatarUrl: r.avatar_url ?? null,
      phone: r.phone ?? null,
    }));

    return { items, total, page, limit, totalPages };
  }

  public getDashboardStats(): {
    totalUsers: number;
    activeUsers24h: number;
    newUsers30d: number;
    suspendedUsers: number;
    adminCount: number;
  } {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const statsRow: any = this.db
      .prepare(
        `SELECT
           COUNT(*) as totalUsers,
           SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspendedUsers,
           SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminCount,
           SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as newUsers30d
         FROM users`
      )
      .get(thirtyDaysAgo);

    const activeRow: any = this.db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) as activeUsers24h
         FROM sessions
         WHERE created_at >= ? AND revoked_at IS NULL`
      )
      .get(oneDayAgo);

    return {
      totalUsers: Number(statsRow?.totalUsers || 0),
      suspendedUsers: Number(statsRow?.suspendedUsers || 0),
      adminCount: Number(statsRow?.adminCount || 0),
      newUsers30d: Number(statsRow?.newUsers30d || 0),
      activeUsers24h: Number(activeRow?.activeUsers24h || 0),
    };
  }

  private mapUser(row: any): DbUser {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      status: row.status as UserStatus,
      canAccessNotion: Boolean(row.can_access_notion) || row.role === 'admin',
      canAccessIfrj: Boolean(row.can_access_ifrj) || row.role === 'admin',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ProfileRepository {
  constructor(private db: DatabaseSync) {}

  public createOrUpdate(data: {
    userId: string;
    fullName: string;
    phone?: string | null;
    targetExam?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }): DbProfile {
    const existing = this.findByUserId(data.userId);
    const now = new Date().toISOString();

    if (existing) {
      const fullName = data.fullName !== undefined ? data.fullName : existing.fullName;
      const phone = data.phone !== undefined ? data.phone : existing.phone;
      const targetExam = data.targetExam !== undefined ? data.targetExam : existing.targetExam;
      const bio = data.bio !== undefined ? data.bio : existing.bio;
      const avatarUrl = data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl;

      this.db
        .prepare(
          `UPDATE profiles SET full_name = ?, phone = ?, target_exam = ?, bio = ?, avatar_url = ?, updated_at = ?
           WHERE user_id = ?`
        )
        .run(fullName, phone ?? null, targetExam ?? null, bio ?? null, avatarUrl ?? null, now, data.userId);
      return this.findByUserId(data.userId)!;
    }

    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO profiles (id, user_id, full_name, phone, target_exam, bio, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.userId, data.fullName, data.phone ?? null, data.targetExam ?? null, data.bio ?? null, data.avatarUrl ?? null, now, now);

    return this.findByUserId(data.userId)!;
  }

  public updateAvatar(userId: string, avatarUrl: string | null): void {
    const now = new Date().toISOString();
    const existing = this.findByUserId(userId);
    if (!existing) {
      this.createOrUpdate({
        userId,
        fullName: 'Operador Cadete',
        avatarUrl,
      });
      return;
    }

    this.db
      .prepare('UPDATE profiles SET avatar_url = ?, updated_at = ? WHERE user_id = ?')
      .run(avatarUrl, now, userId);
  }

  public findByUserId(userId: string): DbProfile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      phone: row.phone,
      targetExam: row.target_exam,
      bio: row.bio,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ProductRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    sku: string;
    name: string;
    description: string;
    amount: number;
    currency?: string;
    isActive?: boolean;
    featuresJson?: string | null;
  }): DbProduct {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const currency = data.currency || 'BRL';
    const isActive = data.isActive !== false ? 1 : 0;

    this.db
      .prepare(
        `INSERT INTO products (id, sku, name, description, amount, currency, is_active, features_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.sku, data.name, data.description, data.amount, currency, isActive, data.featuresJson ?? null, now, now);

    return this.findById(id)!;
  }

  public findById(id: string): DbProduct | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapProduct(row);
  }

  public findBySku(sku: string): DbProduct | null {
    const row = this.db.prepare('SELECT * FROM products WHERE sku = ?').get(sku) as any;
    if (!row) return null;
    return this.mapProduct(row);
  }

  private mapProduct(row: any): DbProduct {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      isActive: Boolean(row.is_active),
      featuresJson: row.features_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class OrderRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    customerEmail: string;
    productId: string;
    amount: number;
    currency?: string;
    paymentProvider: string;
    userId?: string | null;
    paymentMethod?: string | null;
  }): DbOrder {
    const id = crypto.randomUUID();
    // Unique public order identifier, formatted e.g. "CFO-ORD-1A2B3C4D"
    const publicOrderId = `CFO-ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();
    const currency = data.currency || 'BRL';

    this.db
      .prepare(
        `INSERT INTO orders (
          id, public_order_id, user_id, customer_email, product_id, amount, currency,
          payment_provider, payment_method, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(
        id,
        publicOrderId,
        data.userId ?? null,
        data.customerEmail.toLowerCase().trim(),
        data.productId,
        data.amount,
        currency,
        data.paymentProvider,
        data.paymentMethod ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbOrder | null {
    const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapOrder(row);
  }

  public findByPublicId(publicOrderId: string): DbOrder | null {
    const row = this.db.prepare('SELECT * FROM orders WHERE public_order_id = ?').get(publicOrderId) as any;
    if (!row) return null;
    return this.mapOrder(row);
  }

  public findByExternalPaymentId(externalPaymentId: string): DbOrder | null {
    const row = this.db.prepare('SELECT * FROM orders WHERE external_payment_id = ?').get(externalPaymentId) as any;
    if (!row) return null;
    return this.mapOrder(row);
  }

  public markAsPaid(orderId: string, externalPaymentId: string, paymentMethod?: string): DbOrder {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE orders
         SET status = 'paid', external_payment_id = ?, payment_method = COALESCE(?, payment_method),
             paid_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(externalPaymentId, paymentMethod ?? null, now, now, orderId);

    return this.findById(orderId)!;
  }

  public updateStatus(orderId: string, status: OrderStatus): DbOrder {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now, orderId);
    return this.findById(orderId)!;
  }

  public linkUser(orderId: string, userId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE orders SET user_id = ?, updated_at = ? WHERE id = ?')
      .run(userId, now, orderId);
  }

  private mapOrder(row: any): DbOrder {
    return {
      id: row.id,
      publicOrderId: row.public_order_id,
      userId: row.user_id,
      customerEmail: row.customer_email,
      productId: row.product_id,
      amount: Number(row.amount),
      currency: row.currency,
      paymentProvider: row.payment_provider,
      externalPaymentId: row.external_payment_id,
      paymentMethod: row.payment_method,
      status: row.status as OrderStatus,
      createdAt: row.created_at,
      paidAt: row.paid_at,
      updatedAt: row.updated_at,
    };
  }
}

export class PaymentRepository {
  constructor(private db: DatabaseSync) {}

  public recordPayment(data: {
    orderId: string;
    provider: string;
    externalPaymentId: string;
    status: PaymentStatus;
    amount: number;
    currency?: string;
    rawPayloadJson?: string | null;
  }): DbPayment {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const currency = data.currency || 'BRL';

    this.db
      .prepare(
        `INSERT INTO payments (
          id, order_id, provider, external_payment_id, status, amount, currency, raw_payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.orderId,
        data.provider,
        data.externalPaymentId,
        data.status,
        data.amount,
        currency,
        data.rawPayloadJson ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbPayment | null {
    const row = this.db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.order_id,
      provider: row.provider,
      externalPaymentId: row.external_payment_id,
      status: row.status as PaymentStatus,
      amount: Number(row.amount),
      currency: row.currency,
      rawPayloadJson: row.raw_payload_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ActivationTokenRepository {
  constructor(private db: DatabaseSync) {}

  public createToken(orderId: string, customerEmail: string, expiresInHours: number = 72): { rawToken: string; record: DbActivationToken } {
    const id = crypto.randomUUID();
    // 32-byte secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Store only SHA-256 hash of token to prevent leakage if database is inspected
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + expiresInHours * 3600 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO activation_tokens (id, order_id, token_hash, customer_email, is_used, expires_at, created_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, orderId, tokenHash, customerEmail.toLowerCase().trim(), expiresAt, createdAt);

    const record = this.findById(id)!;
    return { rawToken, record };
  }

  public findByRawToken(rawToken: string): DbActivationToken | null {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const row = this.db.prepare('SELECT * FROM activation_tokens WHERE token_hash = ?').get(tokenHash) as any;
    if (!row) return null;
    return this.mapToken(row);
  }

  public findById(id: string): DbActivationToken | null {
    const row = this.db.prepare('SELECT * FROM activation_tokens WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapToken(row);
  }

  /**
   * Atomic consumption of activation token.
   * Fails if token was already used or is expired.
   */
  public consumeToken(rawToken: string, userId: string): boolean {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `UPDATE activation_tokens
         SET is_used = TRUE, used_at = ?, used_by_user_id = ?
         WHERE token_hash = ? AND is_used = FALSE AND expires_at > ?`
      )
      .run(now, userId, tokenHash, now);

    return result.changes > 0;
  }

  private mapToken(row: any): DbActivationToken {
    return {
      id: row.id,
      orderId: row.order_id,
      tokenHash: row.token_hash,
      customerEmail: row.customer_email,
      isUsed: Boolean(row.is_used),
      usedAt: row.used_at,
      usedByUserId: row.used_by_user_id,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}

export class EntitlementRepository {
  constructor(private db: DatabaseSync) {}

  public grant(data: {
    userId: string;
    orderId: string;
    productId: string;
    expiresAt?: string | null;
  }): DbEntitlement {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO entitlements (id, user_id, order_id, product_id, status, granted_at, expires_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`
      )
      .run(id, data.userId, data.orderId, data.productId, now, data.expiresAt ?? null);

    return this.findById(id)!;
  }

  public findById(id: string): DbEntitlement | null {
    const row = this.db.prepare('SELECT * FROM entitlements WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapEntitlement(row);
  }

  public hasActiveAccess(userId: string, productId: string): boolean {
    const now = new Date().toISOString();
    const row = this.db
      .prepare(
        `SELECT 1 FROM entitlements
         WHERE user_id = ? AND product_id = ? AND status = 'active'
           AND (expires_at IS NULL OR expires_at > ?)
         LIMIT 1`
      )
      .get(userId, productId, now);

    return Boolean(row);
  }

  public revoke(userId: string, productId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE entitlements
         SET status = 'revoked', revoked_at = ?
         WHERE user_id = ? AND product_id = ? AND status = 'active'`
      )
      .run(now, userId, productId);
  }

  private mapEntitlement(row: any): DbEntitlement {
    return {
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      productId: row.product_id,
      status: row.status,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }
}

export class RefundRepository {
  constructor(private db: DatabaseSync) {}

  /**
   * Validates refund eligibility server-side according to financial invariants:
   * 1. Order must exist and not be in an invalid status (failed, cancelled, charged_back).
   * 2. Requested amount must be > 0.
   * 3. Total refunded (active requests) + requested amount must NOT exceed order total amount.
   */
  public validateRefundEligibility(orderId: string, requestedAmount: number): {
    eligible: boolean;
    reason?: string;
    maxRefundable?: number;
  } {
    const order = this.db.prepare('SELECT id, amount, status FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) return { eligible: false, reason: 'ORDER_NOT_FOUND' };
    if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'charged_back') {
      return { eligible: false, reason: 'ORDER_STATUS_NOT_ELIGIBLE' };
    }
    if (requestedAmount <= 0) {
      return { eligible: false, reason: 'INVALID_REFUND_AMOUNT' };
    }

    const existingRow = this.db.prepare(
      `SELECT COALESCE(SUM(amount), 0) as total_refunded
       FROM refund_requests
       WHERE order_id = ? AND status NOT IN ('rejected', 'failed', 'cancelled')`
    ).get(orderId) as any;

    const currentRefunded = Number(existingRow?.total_refunded || 0);
    const maxRefundable = order.amount - currentRefunded;

    if (requestedAmount > maxRefundable) {
      return {
        eligible: false,
        reason: 'EXCEEDS_ORDER_AMOUNT',
        maxRefundable: Math.max(0, maxRefundable),
      };
    }

    return { eligible: true, maxRefundable };
  }

  public request(data: {
    orderId: string;
    userId?: string | null;
    reason: string;
    amount: number;
  }): DbRefundRequest {
    const check = this.validateRefundEligibility(data.orderId, data.amount);
    if (!check.eligible) {
      throw new Error(`REFUND_INVARIANT_VIOLATION: ${check.reason}`);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO refund_requests (id, order_id, user_id, reason, amount, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'requested', ?, ?)`
      )
      .run(id, data.orderId, data.userId ?? null, data.reason, data.amount, now, now);

    return this.findById(id)!;
  }

  public findById(id: string): DbRefundRequest | null {
    const row = this.db.prepare('SELECT * FROM refund_requests WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.order_id,
      userId: row.user_id,
      reason: row.reason,
      amount: Number(row.amount),
      status: row.status as RefundRequestStatus,
      adminNotes: row.admin_notes,
      reviewedByAdminId: row.reviewed_by_admin_id,
      reviewedAt: row.reviewed_at,
      processedAt: row.processed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public updateReviewStatus(
    id: string,
    status: RefundRequestStatus,
    adminId: string,
    adminNotes?: string | null
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE refund_requests
         SET status = ?, reviewed_by_admin_id = ?, reviewed_at = ?, admin_notes = COALESCE(?, admin_notes), updated_at = ?
         WHERE id = ?`
      )
      .run(status, adminId, now, adminNotes ?? null, now, id);
  }
}

export interface AuditFilterOptions {
  page?: number;
  limit?: number;
  action?: string;
  status?: string;
  actor?: string;
  actorUserId?: string;
  resource?: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface SecurityMetrics {
  totalEvents24h: number;
  loginSuccess24h: number;
  loginFailed24h: number;
  twoFactorFailed24h: number;
  accountSuspended24h: number;
  anomalousIps: Array<{ ip: string; failedAttempts: number }>;
}

export function sanitizeAuditPayload(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditPayload);
  }

  const sensitivePattern = /^(password|currentpassword|newpassword|passwordhash|token|refreshtoken|accesstoken|tokenhash|sessiontoken|secret|totp|totpsecret|totp_secret|recoverycode|backupcode|recoverycodes|recovery_code|cookie|authorization|apikey|secretkey|creditcard)$/i;

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (sensitivePattern.test(k.trim())) {
      continue;
    }
    sanitized[k] = sanitizeAuditPayload(v);
  }
  return sanitized;
}

export class AuditRepository {
  constructor(private db: DatabaseSync) {}

  public log(data: {
    action: string;
    actor: string;
    actorUserId?: string | null;
    resource: string;
    status: 'SUCCESS' | 'FAILED' | 'WARNING';
    targetType?: string | null;
    targetId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    userId?: string | null;
    previousState?: Record<string, any> | null;
    newState?: Record<string, any> | null;
    details?: Record<string, any> | null;
  }): DbAuditEvent {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Sanitização rigorosa recursiva: nunca permitir senhas, tokens, cookies, códigos TOTP ou segredos
    const mergedDetails: Record<string, any> = {};
    if (data.previousState) mergedDetails.previousState = sanitizeAuditPayload(data.previousState);
    if (data.newState) mergedDetails.newState = sanitizeAuditPayload(data.newState);
    if (data.details) {
      const safeDetails = sanitizeAuditPayload(data.details);
      Object.assign(mergedDetails, safeDetails);
    }

    const detailsJson = Object.keys(mergedDetails).length > 0 ? JSON.stringify(mergedDetails) : null;
    const actorUserId = data.actorUserId ?? null;
    const targetType = data.targetType ?? null;
    const targetId = data.targetId ?? null;
    const targetUserId = data.userId ?? (targetType === 'user' ? targetId : null);

    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, action, actor, actor_user_id, resource, status,
          target_type, target_id, ip, user_agent, user_id, details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.action,
        data.actor,
        actorUserId,
        data.resource ?? null,
        data.status,
        targetType,
        targetId,
        data.ip ?? null,
        data.userAgent ?? null,
        targetUserId,
        detailsJson,
        now
      );

    return {
      id,
      action: data.action,
      actor: data.actor,
      actorUserId,
      resource: data.resource,
      status: data.status,
      targetType,
      targetId,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
      userId: targetUserId,
      detailsJson,
      createdAt: now,
    };
  }

  public findFiltered(options: AuditFilterOptions = {}): {
    items: DbAuditEvent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options.action) {
      whereClauses.push('action = ?');
      params.push(options.action);
    }

    if (options.status) {
      whereClauses.push('status = ?');
      params.push(options.status);
    }

    if (options.actor) {
      whereClauses.push('actor LIKE ?');
      params.push(`%${options.actor}%`);
    }

    if (options.actorUserId) {
      whereClauses.push('actor_user_id = ?');
      params.push(options.actorUserId);
    }

    if (options.resource) {
      whereClauses.push('resource LIKE ?');
      params.push(`%${options.resource}%`);
    }

    if (options.targetType) {
      whereClauses.push('target_type = ?');
      params.push(options.targetType);
    }

    if (options.targetId) {
      whereClauses.push('target_id = ?');
      params.push(options.targetId);
    }

    if (options.ip) {
      whereClauses.push('ip LIKE ?');
      params.push(`%${options.ip}%`);
    }

    if (options.search) {
      whereClauses.push('(action LIKE ? OR actor LIKE ? OR resource LIKE ? OR ip LIKE ? OR user_agent LIKE ? OR target_type LIKE ? OR target_id LIKE ? OR details_json LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (options.startDate) {
      whereClauses.push('created_at >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      whereClauses.push('created_at <= ?');
      params.push(options.endDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow: any = this.db.prepare(`SELECT COUNT(*) as total FROM audit_events ${whereSql}`).get(...params);
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const itemsRows: any[] = this.db
      .prepare(
        `SELECT id, action, actor, actor_user_id, resource, status, target_type, target_id,
                ip, user_agent, user_id, details_json, created_at
         FROM audit_events
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const items: DbAuditEvent[] = itemsRows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      actorUserId: row.actor_user_id,
      resource: row.resource,
      status: row.status,
      targetType: row.target_type,
      targetId: row.target_id,
      ip: row.ip,
      userAgent: row.user_agent,
      userId: row.user_id,
      detailsJson: row.details_json,
      createdAt: row.created_at,
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages,
    };
  }

  public getSecurityMetrics(): SecurityMetrics {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const countsRow: any = this.db
      .prepare(
        `SELECT
          COUNT(*) as totalEvents24h,
          SUM(CASE WHEN action IN ('LOGIN_SUCCESS', 'ADMIN_LOGIN') THEN 1 ELSE 0 END) as loginSuccess24h,
          SUM(CASE WHEN action IN ('LOGIN_FAILED', 'ADMIN_LOGIN_FAILED') THEN 1 ELSE 0 END) as loginFailed24h,
          SUM(CASE WHEN action = '2FA_FAILED' THEN 1 ELSE 0 END) as twoFactorFailed24h,
          SUM(CASE WHEN action IN ('ACCOUNT_SUSPENDED', 'IP_BANNED') THEN 1 ELSE 0 END) as accountSuspended24h
         FROM audit_events
         WHERE created_at >= ?`
      )
      .get(oneDayAgo);

    const anomalyRows: any[] = this.db
      .prepare(
        `SELECT ip, COUNT(*) as failedAttempts
         FROM audit_events
         WHERE created_at >= ? AND status = 'FAILED' AND ip IS NOT NULL
         GROUP BY ip
         HAVING failedAttempts >= 3
         ORDER BY failedAttempts DESC
         LIMIT 5`
      )
      .all(oneDayAgo);

    return {
      totalEvents24h: Number(countsRow?.totalEvents24h || 0),
      loginSuccess24h: Number(countsRow?.loginSuccess24h || 0),
      loginFailed24h: Number(countsRow?.loginFailed24h || 0),
      twoFactorFailed24h: Number(countsRow?.twoFactorFailed24h || 0),
      accountSuspended24h: Number(countsRow?.accountSuspended24h || 0),
      anomalousIps: anomalyRows.map((r) => ({
        ip: r.ip,
        failedAttempts: Number(r.failedAttempts),
      })),
    };
  }

  public findEventsByUserId(userId: string, limit: number = 20): DbAuditEvent[] {
    const rows: any[] = this.db
      .prepare(
        `SELECT id, action, actor, resource, status, ip, user_agent, user_id, details_json, created_at
         FROM audit_events
         WHERE user_id = ? OR resource LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(userId, `%/users/${userId}%`, limit);

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      resource: row.resource,
      status: row.status,
      ip: row.ip,
      userAgent: row.user_agent,
      userId: row.user_id,
      detailsJson: row.details_json,
      createdAt: row.created_at,
    }));
  }

  public countActionsFromIpSince(actions: string[], ip: string, since: string): number {
    if (!actions.length || !ip) return 0;
    const placeholders = actions.map(() => '?').join(', ');
    const row = this.db.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE action IN (${placeholders}) AND ip = ? AND created_at >= ?`
    ).get(...actions, ip.trim().replace(/^::ffff:/, ''), since) as { count?: number } | undefined;
    return Number(row?.count || 0);
  }
}

export class PasswordResetRepository {
  constructor(private db: DatabaseSync) {}

  public createResetCode(userId: string, expiresInMinutes: number = 15): { code: string; record: DbPasswordReset } {
    const id = crypto.randomUUID();
    // 6-digit numeric recovery code
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();

    // 🛡️ Segurança: Invalida imediatamente qualquer código de recuperação anterior deste usuário
    this.db
      .prepare(
        `UPDATE password_resets
         SET is_used = TRUE, used_at = ?
         WHERE user_id = ? AND is_used = FALSE`
      )
      .run(createdAt, userId);

    this.db
      .prepare(
        `INSERT INTO password_resets (id, user_id, code_hash, expires_at, is_used, failed_attempts, created_at)
         VALUES (?, ?, ?, ?, 0, 0, ?)`
      )
      .run(id, userId, codeHash, expiresAt, createdAt);

    return {
      code,
      record: {
        id,
        userId,
        codeHash,
        expiresAt,
        isUsed: false,
        failedAttempts: 0,
        createdAt,
      },
    };
  }

  public verifyAndConsume(userId: string, code: string): boolean {
    const trimmed = (code || '').trim();
    if (!trimmed) return false;
    const codeHash = crypto.createHash('sha256').update(trimmed).digest('hex');
    const now = new Date().toISOString();

    // 🛡️ Busca o código ativo mais recente não expirado
    const active = this.db
      .prepare(
        `SELECT id, code_hash, failed_attempts
         FROM password_resets
         WHERE user_id = ? AND is_used = FALSE AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId, now) as { id: string; code_hash: string; failed_attempts: number } | undefined;

    if (!active) return false;

    // Comparação em tempo constante para proteção contra timing attacks
    const activeHashBuf = Buffer.from(active.code_hash, 'hex');
    const inputHashBuf = Buffer.from(codeHash, 'hex');
    const isMatch = activeHashBuf.length === inputHashBuf.length && crypto.timingSafeEqual(activeHashBuf, inputHashBuf);

    if (isMatch) {
      this.db
        .prepare('UPDATE password_resets SET is_used = TRUE, used_at = ? WHERE id = ?')
        .run(now, active.id);
      return true;
    }

    // Código incorreto: incrementa contador de tentativas falhas.
    // 🛡️ Queima o código de recuperação imediatamente após 5 tentativas falhas para impedir força bruta
    const newAttempts = (active.failed_attempts || 0) + 1;
    if (newAttempts >= 5) {
      this.db
        .prepare('UPDATE password_resets SET failed_attempts = ?, is_used = TRUE, used_at = ? WHERE id = ?')
        .run(newAttempts, now, active.id);
    } else {
      this.db
        .prepare('UPDATE password_resets SET failed_attempts = ? WHERE id = ?')
        .run(newAttempts, active.id);
    }

    return false;
  }
}

export class SessionRepository {
  constructor(private db: DatabaseSync) {}

  public createSession(data: {
    userId: string;
    role: UserRole;
    ip?: string | null;
    userAgent?: string | null;
    expiresInDays?: number;
    impersonatedByUserId?: string | null;
    parentSessionId?: string | null;
  }): { rawToken: string; session: DbSession } {
    const id = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const now = new Date();
    const createdAt = now.toISOString();
    const days = data.expiresInDays || 30;
    const expiresAt = new Date(now.getTime() + days * 24 * 3600 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, role, ip, user_agent, expires_at, created_at, impersonated_by_user_id, parent_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.userId, tokenHash, data.role, data.ip ?? null, data.userAgent ?? null, expiresAt, createdAt, data.impersonatedByUserId ?? null, data.parentSessionId ?? null);

    return {
      rawToken,
      session: {
        id,
        userId: data.userId,
        tokenHash,
        role: data.role,
        ip: data.ip ?? null,
        userAgent: data.userAgent ?? null,
        expiresAt,
        createdAt,
      },
    };
  }

  public validateSession(rawToken: string): { valid: boolean; session?: DbSession; user?: DbUser } {
    if (!rawToken || typeof rawToken !== 'string') return { valid: false };
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date().toISOString();

    const row = this.db
      .prepare(
        `SELECT s.id AS s_id, s.user_id, s.token_hash, s.role AS s_role, s.ip, s.user_agent,
                s.expires_at, s.revoked_at, s.created_at AS s_created_at,
                s.impersonated_by_user_id, s.parent_session_id,
                u.id AS u_id, u.email, u.username, u.password_hash, u.role AS u_role, u.status, u.can_access_notion, u.can_access_ifrj,
                u.created_at AS u_created_at, u.updated_at AS u_updated_at
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'`
      )
      .get(tokenHash, now) as any;

    if (!row) return { valid: false };

    return {
      valid: true,
      session: {
        id: row.s_id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        role: row.s_role as UserRole,
        ip: row.ip,
        userAgent: row.user_agent,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        createdAt: row.s_created_at,
        impersonatedByUserId: row.impersonated_by_user_id,
        parentSessionId: row.parent_session_id,
      },
      user: {
        id: row.u_id,
        email: row.email,
        username: row.username,
        passwordHash: row.password_hash,
        role: row.u_role as UserRole,
        status: row.status as UserStatus,
        canAccessNotion: Boolean(row.can_access_notion) || row.u_role === 'admin',
        canAccessIfrj: Boolean(row.can_access_ifrj) || row.u_role === 'admin',
        createdAt: row.u_created_at,
        updatedAt: row.u_updated_at,
      },
    };
  }

  public revokeSession(rawToken: string): void {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ?').run(now, tokenHash);
  }

  public revokeAllUserSessions(userId: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ?').run(now, userId);
  }

  public revokeExtensionSessions(userId: string): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND user_agent = 'cfo-browser-extension' AND revoked_at IS NULL"
    ).run(now, userId);
    return Number(result.changes || 0);
  }

  public revokeAllNonAdminSessions(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE role NOT IN ('admin') AND revoked_at IS NULL").run(now);
    return Number(result.changes || 0);
  }

  public listActiveSessions(limit: number = 50): Array<{
    id: string;
    userId: string;
    email: string;
    username: string;
    role: UserRole;
    ip: string | null;
    userAgent: string | null;
    expiresAt: string;
    createdAt: string;
    isExpired: boolean;
    isValid: boolean;
  }> {
    const now = new Date().toISOString();
    const rows: any[] = this.db
      .prepare(
        `SELECT s.id, s.user_id, s.role, s.ip, s.user_agent, s.expires_at, s.created_at, s.revoked_at,
                u.email, u.username
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.revoked_at IS NULL AND s.expires_at > ?
         ORDER BY s.created_at DESC
         LIMIT ?`
      )
      .all(now, limit);

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: r.email,
      username: r.username,
      role: r.role as UserRole,
      ip: r.ip ?? null,
      userAgent: r.user_agent ?? null,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isExpired: false,
      isValid: true,
    }));
  }

  public revokeSessionById(sessionId: string): boolean {
    const now = new Date().toISOString();
    const result = this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now, sessionId);
    return Number(result.changes) > 0;
  }

  public listActiveSessionsByUserId(userId: string): Array<{
    id: string;
    userId: string;
    role: UserRole;
    ip: string | null;
    userAgent: string | null;
    expiresAt: string;
    createdAt: string;
    isValid: boolean;
  }> {
    const now = new Date().toISOString();
    const rows: any[] = this.db
      .prepare(
        `SELECT id, user_id, role, ip, user_agent, expires_at, created_at, revoked_at
         FROM sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`
      )
      .all(userId, now);

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      role: r.role as UserRole,
      ip: r.ip ?? null,
      userAgent: r.user_agent ?? null,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      isValid: true,
    }));
  }
}

export class RecoveryCodeRepository {
  constructor(private db: DatabaseSync) {}

  /**
   * Normaliza o código para comparação determinística:
   * Remove espaços, traços e converte para maiúsculas.
   */
  public static normalizeCode(code: string): string {
    return (code || '').replace(/[\s-]+/g, '').toUpperCase().trim();
  }

  /**
   * Hasheia o código normalizado em SHA-256 para armazenamento seguro
   */
  public static hashCode(code: string): string {
    const normalized = RecoveryCodeRepository.normalizeCode(code);
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Gera um novo lote de códigos de contingência criptograficamente fortes (ex: ABCD-EFGH-IJKL).
   * Invalida códigos não utilizados anteriores do mesmo usuário.
   */
  public generateCodesForUser(
    userId: string,
    count: number = 8
  ): { rawCodes: string[]; count: number } {
    const now = new Date().toISOString();
    const rawCodes: string[] = [];
    const charset = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32 legível sem 0/O/1/I

    for (let i = 0; i < count; i++) {
      const bytes = crypto.randomBytes(9);
      let codeStr = '';
      for (let b = 0; b < 9; b++) {
        codeStr += charset[bytes[b] % charset.length];
      }
      // Formata em blocos: XXX-XXX-XXX
      const formatted = `${codeStr.slice(0, 3)}-${codeStr.slice(3, 6)}-${codeStr.slice(6, 9)}`;
      rawCodes.push(formatted);
    }

    // Invalida/deleta códigos não usados anteriores do usuário
    this.db.prepare('DELETE FROM admin_recovery_codes WHERE user_id = ? AND is_used = FALSE').run(userId);

    const insertStmt = this.db.prepare(
      `INSERT INTO admin_recovery_codes (id, user_id, code_hash, is_used, created_at)
       VALUES (?, ?, ?, 0, ?)`
    );

    for (const rawCode of rawCodes) {
      const codeHash = RecoveryCodeRepository.hashCode(rawCode);
      insertStmt.run(crypto.randomUUID(), userId, codeHash, now);
    }

    return { rawCodes, count: rawCodes.length };
  }

  /**
   * Valida e consome um código de recuperação de uso único.
   * Se for válido e não utilizado, marca is_used = 1 e used_at = now() atomicamente.
   * Se já tiver sido consumido ou for inválido, retorna false.
   */
  public verifyAndConsumeCode(userId: string, rawCode: string): boolean {
    if (!userId || !rawCode) return false;
    const codeHash = RecoveryCodeRepository.hashCode(rawCode);
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `UPDATE admin_recovery_codes
         SET is_used = TRUE, used_at = ?
         WHERE user_id = ? AND code_hash = ? AND is_used = FALSE`
      )
      .run(now, userId, codeHash);

    return Number(result.changes) > 0;
  }

  /**
   * Retorna a quantidade de códigos de recuperação ainda disponíveis (não utilizados) para o usuário.
   */
  public getRemainingCount(userId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM admin_recovery_codes
         WHERE user_id = ? AND is_used = FALSE`
      )
      .get(userId) as { count: number } | undefined;

    return row ? Number(row.count) : 0;
  }
}

export class UserStateRepository {
  constructor(private db: DatabaseSync) {}

  public get(userId: string): { payload: Record<string, string>; updatedAt: string } | null {
    const row = this.db.prepare(
      'SELECT payload_json, updated_at FROM user_state_snapshots WHERE user_id = ?'
    ).get(userId) as { payload_json: string; updated_at: string } | undefined;
    if (!row) return null;
    try {
      const payload = JSON.parse(row.payload_json);
      return payload && typeof payload === 'object' && !Array.isArray(payload)
        ? { payload, updatedAt: row.updated_at }
        : null;
    } catch {
      return null;
    }
  }

  public upsert(userId: string, payload: Record<string, string>): string {
    const now = new Date().toISOString();
    const serialized = JSON.stringify(payload);
    this.db.prepare(`
      INSERT INTO user_state_snapshots (user_id, payload_json, schema_version, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
    `).run(userId, serialized, now, now);
    return now;
  }
}

export class CadetSessionLockRepository {
  constructor(private db: DatabaseSync) {}

  public getLock(userId: string): DbCadetSessionLock | null {
    const row = this.db.prepare(
      'SELECT user_id, active_session_id, locked_until, created_at, updated_at FROM cadet_session_locks WHERE user_id = ?'
    ).get(userId) as any;
    if (!row) return null;
    return {
      userId: row.user_id,
      activeSessionId: row.active_session_id ?? null,
      lockedUntil: row.locked_until ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public getActiveSessionForUser(userId: string): DbSession | null {
    const now = new Date().toISOString();
    const row = this.db.prepare(
      `SELECT id, user_id, token_hash, role, ip, user_agent, expires_at, revoked_at, created_at
       FROM sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`
    ).get(userId, now) as any;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      role: row.role as UserRole,
      ip: row.ip,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  public setLock(userId: string, activeSessionId: string | null, lockedUntil: string | null): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO cadet_session_locks (user_id, active_session_id, locked_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        active_session_id = excluded.active_session_id,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `).run(userId, activeSessionId ?? null, lockedUntil ?? null, now, now);
  }

  public clearLock(userId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE cadet_session_locks
      SET active_session_id = NULL, locked_until = NULL, updated_at = ?
      WHERE user_id = ?
    `).run(now, userId);
  }
}

export class TemporarySourceBlockRepository {
  constructor(private db: DatabaseSync) {}

  public isIpBlocked(ip: string): { isBlocked: boolean; block?: DbTemporarySourceBlock } {
    if (!ip) return { isBlocked: false };
    const cleanIp = ip.trim().replace(/^::ffff:/, '');
    const now = new Date().toISOString();

    const row = this.db.prepare(`
      SELECT id, ip, user_id, reason, locked_until, created_at
      FROM cadet_temporary_source_blocks
      WHERE ip = ? AND locked_until > ?
      ORDER BY locked_until DESC LIMIT 1
    `).get(cleanIp, now) as any;

    if (!row) return { isBlocked: false };

    return {
      isBlocked: true,
      block: {
        id: row.id,
        ip: row.ip,
        userId: row.user_id,
        reason: row.reason,
        lockedUntil: row.locked_until,
        createdAt: row.created_at,
      },
    };
  }

  public blockIp(ip: string, reason: string, hours: number = 5, userId?: string | null): DbTemporarySourceBlock {
    const cleanIp = ip.trim().replace(/^::ffff:/, '');
    const id = crypto.randomUUID();
    const now = new Date();
    const createdAt = now.toISOString();
    const lockedUntil = new Date(now.getTime() + hours * 3600 * 1000).toISOString();

    this.db.prepare(`
      INSERT INTO cadet_temporary_source_blocks (id, ip, user_id, reason, locked_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, cleanIp, userId ?? null, reason, lockedUntil, createdAt);

    return {
      id,
      ip: cleanIp,
      userId: userId ?? null,
      reason,
      lockedUntil,
      createdAt,
    };
  }

  public unblockIp(ip: string): boolean {
    const cleanIp = ip.trim().replace(/^::ffff:/, '');
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE cadet_temporary_source_blocks
      SET locked_until = ?
      WHERE ip = ? AND locked_until > ?
    `).run(now, cleanIp, now);

    return Number(res.changes) > 0;
  }
}

export class SecurityNotificationRepository {
  constructor(private db: DatabaseSync) {}

  public createNotification(data: {
    userId?: string | null;
    type: SecurityNotificationType;
    title: string;
    message: string;
    metadata?: Record<string, any> | null;
  }): DbSecurityNotification {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

    this.db.prepare(`
      INSERT INTO security_notifications (id, user_id, type, title, message, is_read, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, data.userId ?? null, data.type, data.title, data.message, metadataJson, createdAt);

    return {
      id,
      userId: data.userId ?? null,
      type: data.type,
      title: data.title,
      message: data.message,
      isRead: false,
      readAt: null,
      metadataJson,
      createdAt,
    };
  }

  public listNotifications(options: {
    userId?: string | null;
    filter?: 'ALL' | 'SECURITY' | 'UNREAD';
    limit?: number;
  } = {}): { items: DbSecurityNotification[]; unreadCount: number } {
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const clauses: string[] = [];
    const params: any[] = [];

    if (options.userId !== undefined) {
      if (options.userId) {
        clauses.push('(user_id = ? OR user_id IS NULL)');
        params.push(options.userId);
      } else {
        clauses.push('user_id IS NULL');
      }
    }

    if (options.filter === 'UNREAD') {
      clauses.push('is_read = FALSE');
    } else if (options.filter === 'SECURITY') {
      clauses.push("type = 'CADET_SECURITY_ALERT'");
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rows = this.db.prepare(`
      SELECT id, user_id, type, title, message, is_read, read_at, metadata_json, created_at
      FROM security_notifications
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    let unreadCountSql = 'SELECT COUNT(*) as count FROM security_notifications WHERE is_read = FALSE';
    const unreadParams: any[] = [];
    if (options.userId !== undefined) {
      if (options.userId) {
        unreadCountSql += ' AND (user_id = ? OR user_id IS NULL)';
        unreadParams.push(options.userId);
      } else {
        unreadCountSql += ' AND user_id IS NULL';
      }
    }

    const unreadRow = this.db.prepare(unreadCountSql).get(...unreadParams) as { count: number } | undefined;

    const items = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type as SecurityNotificationType,
      title: r.title,
      message: r.message,
      isRead: Boolean(r.is_read),
      readAt: r.read_at ?? null,
      metadataJson: r.metadata_json ?? null,
      createdAt: r.created_at,
    }));

    return { items, unreadCount: Number(unreadRow?.count || 0) };
  }

  public markAsRead(id: string): boolean {
    const now = new Date().toISOString();
    const res = this.db.prepare(`
      UPDATE security_notifications
      SET is_read = TRUE, read_at = ?
      WHERE id = ? AND is_read = FALSE
    `).run(now, id);

    return Number(res.changes) > 0;
  }

  public markAllAsRead(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE security_notifications
      SET is_read = TRUE, read_at = ?
      WHERE is_read = FALSE
    `).run(now);
  }
}

export class UploadedFileRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    id?: string;
    userId: string;
    originalFilename: string;
    storagePath: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    sha256: string;
    status?: UploadScanStatus;
    scanDetails?: Record<string, any>;
  }): DbUploadedFile {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const status: UploadScanStatus = data.status || 'QUARANTINED';
    const scanDetailsJson = data.scanDetails ? JSON.stringify(data.scanDetails) : null;

    this.db
      .prepare(
        `INSERT INTO uploaded_files (
          id, user_id, original_filename, storage_path, mime_type, extension,
          size_bytes, sha256, status, scan_details_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.userId,
        data.originalFilename,
        data.storagePath,
        data.mimeType,
        data.extension,
        data.sizeBytes,
        data.sha256,
        status,
        scanDetailsJson,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbUploadedFile | null {
    const row = this.db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapFile(row);
  }

  public findByUserId(userId: string, limit: number = 50): DbUploadedFile[] {
    const rows = this.db
      .prepare('SELECT * FROM uploaded_files WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit) as any[];
    return rows.map((r) => this.mapFile(r));
  }

  public updateStatus(
    id: string,
    status: UploadScanStatus,
    scanDetails?: Record<string, any>,
    storagePath?: string
  ): DbUploadedFile | null {
    const now = new Date().toISOString();
    const scanDetailsJson = scanDetails !== undefined ? JSON.stringify(scanDetails) : undefined;

    if (storagePath !== undefined && scanDetailsJson !== undefined) {
      this.db
        .prepare(
          `UPDATE uploaded_files
           SET status = ?, scan_details_json = ?, storage_path = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(status, scanDetailsJson, storagePath, now, id);
    } else if (scanDetailsJson !== undefined) {
      this.db
        .prepare(
          `UPDATE uploaded_files
           SET status = ?, scan_details_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(status, scanDetailsJson, now, id);
    } else if (storagePath !== undefined) {
      this.db
        .prepare(
          `UPDATE uploaded_files
           SET status = ?, storage_path = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(status, storagePath, now, id);
    } else {
      this.db
        .prepare(
          `UPDATE uploaded_files
           SET status = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(status, now, id);
    }

    return this.findById(id);
  }

  public delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  private mapFile(row: any): DbUploadedFile {
    return {
      id: row.id,
      userId: row.user_id,
      originalFilename: row.original_filename,
      storagePath: row.storage_path,
      mimeType: row.mime_type,
      extension: row.extension,
      sizeBytes: Number(row.size_bytes),
      sha256: row.sha256,
      status: row.status as UploadScanStatus,
      scanDetailsJson: row.scan_details_json ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ExamPaperRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    userId: string;
    title: string;
    institution: string;
    examYear: number;
    fileId?: string | null;
    totalQuestions?: number;
    status?: ExamPaperStatus;
    primaryDisciplines?: string[];
    metadata?: Record<string, any>;
  }): DbExamPaper {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const primaryDisciplinesJson = data.primaryDisciplines ? JSON.stringify(data.primaryDisciplines) : null;
    const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;
    const status = data.status || 'READY';
    const totalQuestions = data.totalQuestions || 0;

    this.db
      .prepare(
        `INSERT INTO exam_papers (
          id, user_id, title, institution, exam_year, file_id,
          total_questions, status, primary_disciplines_json, metadata_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.userId,
        data.title,
        data.institution,
        data.examYear,
        data.fileId ?? null,
        totalQuestions,
        status,
        primaryDisciplinesJson,
        metadataJson,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbExamPaper | null {
    const row = this.db.prepare('SELECT * FROM exam_papers WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapPaper(row);
  }

  public findByUserId(userId: string, filters?: {
    discipline?: string;
    year?: number;
    search?: string;
    limit?: number;
  }): DbExamPaper[] {
    let query = 'SELECT * FROM exam_papers WHERE user_id = ?';
    const params: any[] = [userId];

    if (filters?.year) {
      query += ' AND exam_year = ?';
      params.push(filters.year);
    }

    if (filters?.search) {
      query += ' AND (title LIKE ? OR institution LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters?.discipline) {
      query += ' AND primary_disciplines_json LIKE ?';
      params.push(`%${filters.discipline}%`);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapPaper(r));
  }

  public list(userId: string, filters?: {
    discipline?: string;
    year?: number;
    search?: string;
    limit?: number;
  }): DbExamPaper[] {
    return this.findByUserId(userId, filters);
  }

  public findAll(filters?: { search?: string; limit?: number }): DbExamPaper[] {
    let query = 'SELECT * FROM exam_papers WHERE 1=1';
    const params: any[] = [];

    if (filters?.search) {
      query += ' AND (title LIKE ? OR institution LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapPaper(r));
  }

  public update(id: string, data: Partial<Omit<DbExamPaper, 'id' | 'userId' | 'createdAt'>> & {
    primaryDisciplines?: string[];
    metadata?: Record<string, any>;
  }): DbExamPaper | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = data.title !== undefined ? data.title : existing.title;
    const institution = data.institution !== undefined ? data.institution : existing.institution;
    const examYear = data.examYear !== undefined ? data.examYear : existing.examYear;
    const totalQuestions = data.totalQuestions !== undefined ? data.totalQuestions : existing.totalQuestions;
    const status = data.status !== undefined ? data.status : existing.status;
    const primaryDisciplinesJson = data.primaryDisciplines !== undefined
      ? JSON.stringify(data.primaryDisciplines)
      : (data.primaryDisciplinesJson !== undefined ? data.primaryDisciplinesJson : existing.primaryDisciplinesJson);
    const metadataJson = data.metadata !== undefined
      ? JSON.stringify(data.metadata)
      : (data.metadataJson !== undefined ? data.metadataJson : existing.metadataJson);

    this.db
      .prepare(
        `UPDATE exam_papers
         SET title = ?, institution = ?, exam_year = ?, total_questions = ?,
             status = ?, primary_disciplines_json = ?, metadata_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(title, institution, examYear, totalQuestions, status, primaryDisciplinesJson, metadataJson, now, id);

    return this.findById(id);
  }

  public delete(id: string, userId?: string): boolean {
    if (userId) {
      const res = this.db.prepare('DELETE FROM exam_papers WHERE id = ? AND user_id = ?').run(id, userId);
      return Number(res.changes) > 0;
    }
    const res = this.db.prepare('DELETE FROM exam_papers WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public setPublicationStatus(id: string, status: ExamPublicationStatus): DbExamPaper | null {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE exam_papers SET publication_status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return this.findById(id);
  }

  public getStatsByUserId(userId: string): {
    totalPapers: number;
    totalQuestions: number;
    resolvedQuestions: number;
    successRatePercent: number;
  } {
    const paperRow = this.db
      .prepare('SELECT COUNT(*) as count, SUM(total_questions) as total_q FROM exam_papers WHERE user_id = ?')
      .get(userId) as any;

    const questionRow = this.db
      .prepare(
        `SELECT COUNT(*) as total_resolved
         FROM exam_questions
         WHERE user_id = ? AND ai_solution_json IS NOT NULL`
      )
      .get(userId) as any;

    const totalPapers = Number(paperRow?.count || 0);
    const totalQuestions = Number(paperRow?.total_q || 0);
    const resolvedQuestions = Number(questionRow?.total_resolved || 0);
    const successRatePercent = totalQuestions > 0 ? Math.min(100, Math.round((resolvedQuestions / totalQuestions) * 100)) : 0;

    return {
      totalPapers,
      totalQuestions,
      resolvedQuestions,
      successRatePercent,
    };
  }

  private mapPaper(row: any): DbExamPaper {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      institution: row.institution,
      examYear: Number(row.exam_year),
      fileId: row.file_id ?? null,
      totalQuestions: Number(row.total_questions || 0),
      status: row.status as ExamPaperStatus,
      publicationStatus: (row.publication_status || 'DRAFT') as ExamPublicationStatus,
      primaryDisciplinesJson: row.primary_disciplines_json ?? null,
      metadataJson: row.metadata_json ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ExamQuestionRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  public create(data: {
    examId: string;
    userId: string;
    questionNumber: number;
    statement: string;
    supportText?: string;
    options?: ExamOption[];
    correctOption?: string;
    discipline: string;
    topic?: string;
    subtopic?: string;
    difficulty?: ExamDifficulty;
    difficultyScore?: number;
    confidenceScore?: number;
    images?: string[];
    aiSolution?: Record<string, any> | null;
    status?: string;
  }): DbExamQuestion {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const optionsJson = JSON.stringify(normalizeExamOptions(data.options));
    const topic = data.topic || 'Geral';
    const subtopic = data.subtopic || 'Geral';
    const difficulty = data.difficulty || 'Médio';
    const difficultyScore = data.difficultyScore !== undefined ? data.difficultyScore : 0.5;
    const confidenceScore = data.confidenceScore !== undefined ? data.confidenceScore : 0.95;
    const imagesJson = data.images ? JSON.stringify(data.images) : null;
    const aiSolutionJson = data.aiSolution ? JSON.stringify(data.aiSolution) : null;
    const status = data.status || 'READY';

    this.db
      .prepare(
        `INSERT INTO exam_questions (
          id, exam_id, user_id, question_number, statement, support_text,
          options_json, correct_option, discipline, topic, subtopic,
          difficulty, difficulty_score, confidence_score, images_json,
          ai_solution_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.examId,
        data.userId,
        data.questionNumber ?? 1,
        data.statement ?? '',
        data.supportText ?? null,
        optionsJson,
        data.correctOption ?? null,
        data.discipline ?? 'Geral',
        topic,
        subtopic,
        difficulty,
        difficultyScore,
        confidenceScore,
        imagesJson,
        aiSolutionJson,
        status,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbExamQuestion | null {
    const row = this.db.prepare('SELECT * FROM exam_questions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapQuestion(row);
  }

  public findByExamId(examId: string, discipline?: string): DbExamQuestion[] {
    let query = 'SELECT * FROM exam_questions WHERE exam_id = ?';
    const params: any[] = [examId];

    if (discipline && discipline !== 'Todas') {
      query += ' AND discipline = ?';
      params.push(discipline);
    }

    query += ' ORDER BY question_number ASC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapQuestion(r));
  }

  public listByExam(examId: string, discipline?: string): DbExamQuestion[] {
    return this.findByExamId(examId, discipline);
  }

  public findByIds(ids: string[]): DbExamQuestion[] {
    if (!ids || !Array.isArray(ids)) return [];
    const cleanIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (cleanIds.length === 0) return [];
    const placeholders = cleanIds.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT * FROM exam_questions WHERE id IN (${placeholders})`).all(...cleanIds) as any[];
    return rows.map((r) => this.mapQuestion(r));
  }

  public updateAISolution(id: string, aiSolution: Record<string, any>, calculatedDifficulty?: ExamDifficulty, confidenceScore?: number): DbExamQuestion | null {
    const now = new Date().toISOString();
    const solutionJson = JSON.stringify(aiSolution);

    if (calculatedDifficulty && confidenceScore !== undefined) {
      this.db
        .prepare(
          `UPDATE exam_questions
           SET ai_solution_json = ?, difficulty = ?, confidence_score = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(solutionJson, calculatedDifficulty, confidenceScore, now, id);
    } else {
      this.db
        .prepare(
          `UPDATE exam_questions
           SET ai_solution_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(solutionJson, now, id);
    }

    return this.findById(id);
  }

  public update(id: string, partial: {
    statement?: string;
    supportText?: string | null;
    options?: ExamOption[];
    correctOption?: string | null;
    discipline?: string;
    topic?: string;
    subtopic?: string;
    difficulty?: ExamDifficulty;
    difficultyScore?: number;
    confidenceScore?: number;
    images?: string[];
    status?: string;
  }): DbExamQuestion | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const sets: string[] = [];
    const values: any[] = [];

    if (partial.statement !== undefined) {
      sets.push('statement = ?');
      values.push(partial.statement);
    }
    if (partial.supportText !== undefined) {
      sets.push('support_text = ?');
      values.push(partial.supportText);
    }
    if (partial.options !== undefined) {
      sets.push('options_json = ?');
      values.push(JSON.stringify(normalizeExamOptions(partial.options)));
    }
    if (partial.correctOption !== undefined) {
      sets.push('correct_option = ?');
      values.push(partial.correctOption);
    }
    if (partial.discipline !== undefined) {
      sets.push('discipline = ?');
      values.push(partial.discipline);
    }
    if (partial.topic !== undefined) {
      sets.push('topic = ?');
      values.push(partial.topic);
    }
    if (partial.subtopic !== undefined) {
      sets.push('subtopic = ?');
      values.push(partial.subtopic);
    }
    if (partial.difficulty !== undefined) {
      sets.push('difficulty = ?');
      values.push(partial.difficulty);
    }
    if (partial.difficultyScore !== undefined) {
      sets.push('difficulty_score = ?');
      values.push(partial.difficultyScore);
    }
    if (partial.confidenceScore !== undefined) {
      sets.push('confidence_score = ?');
      values.push(partial.confidenceScore);
    }
    if (partial.images !== undefined) {
      sets.push('images_json = ?');
      values.push(JSON.stringify(partial.images));
    }
    if (partial.status !== undefined) {
      sets.push('status = ?');
      values.push(partial.status);
    }

    if (sets.length === 0) return existing;

    sets.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);
    this.db.prepare(`UPDATE exam_questions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return this.findById(id);
  }

  public deleteByExamId(examId: string): boolean {
    const res = this.db.prepare('DELETE FROM exam_questions WHERE exam_id = ?').run(examId);
    return Number(res.changes) > 0;
  }

  public setReviewStatus(id: string, status: QuestionReviewStatus): DbExamQuestion | null {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE exam_questions SET review_status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return this.findById(id);
  }

  private mapQuestion(row: any): DbExamQuestion {
    let normalizedOptionsJson = '[]';
    try {
      normalizedOptionsJson = JSON.stringify(normalizeExamOptions(JSON.parse(row.options_json || '[]')));
    } catch {
      normalizedOptionsJson = '[]';
    }

    return {
      id: row.id,
      examId: row.exam_id,
      userId: row.user_id,
      questionNumber: Number(row.question_number),
      statement: row.statement,
      supportText: row.support_text ?? null,
      optionsJson: normalizedOptionsJson,
      correctOption: row.correct_option as any,
      discipline: row.discipline,
      topic: row.topic,
      subtopic: row.subtopic,
      difficulty: row.difficulty as ExamDifficulty,
      difficultyScore: Number(row.difficulty_score || 0.5),
      confidenceScore: Number(row.confidence_score || 0.95),
      imagesJson: row.images_json ?? null,
      aiSolutionJson: row.ai_solution_json ?? null,
      status: row.status,
      reviewStatus: (row.review_status || 'PENDING') as QuestionReviewStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class ExamJobRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    userId: string;
    examId?: string | null;
    jobType: ExamJobType;
    status?: ExamJobStatus;
    totalItems?: number;
    idempotencyKey?: string | null;
    payload?: Record<string, any> | null;
  }): DbExamJob {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status = data.status || 'queued';
    const totalItems = data.totalItems || 0;

    try {
      this.db
        .prepare(
          `INSERT INTO exam_jobs (
            id, user_id, exam_id, job_type, status, progress, total_items,
            idempotency_key, payload_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          data.userId,
          data.examId ?? null,
          data.jobType,
          status,
          totalItems,
          data.idempotencyKey ?? null,
          data.payload ? JSON.stringify(data.payload) : null,
          now,
          now
        );
    } catch (err: any) {
      // Em caso de chave de idempotência concorrente já inserida, recupera o registro existente
      if (data.idempotencyKey && String(err?.message || '').includes('UNIQUE constraint failed')) {
        const existing = this.findByIdempotencyKey(data.idempotencyKey, data.userId);
        if (existing) return existing;
      }
      throw err;
    }

    return this.findById(id)!;
  }

  public findById(id: string): DbExamJob | null {
    const row = this.db.prepare('SELECT * FROM exam_jobs WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapJob(row);
  }

  public findByIdempotencyKey(key: string, userId?: string): DbExamJob | null {
    if (!key) return null;
    const row = userId
      ? this.db.prepare('SELECT * FROM exam_jobs WHERE idempotency_key = ? AND user_id = ?').get(key, userId) as any
      : this.db.prepare('SELECT * FROM exam_jobs WHERE idempotency_key = ?').get(key) as any;
    if (!row) return null;
    return this.mapJob(row);
  }

  public claimNextQueued(): DbExamJob | null {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE exam_jobs SET status = 'processing', updated_at = ?
      WHERE id = (
        SELECT id FROM exam_jobs WHERE status = 'queued'
        ORDER BY created_at ASC LIMIT 1
      ) AND status = 'queued'
    `).run(now);
    if (Number(result.changes) === 0) return null;
    const row = this.db.prepare("SELECT * FROM exam_jobs WHERE status = 'processing' ORDER BY updated_at DESC LIMIT 1").get() as any;
    return row ? this.mapJob(row) : null;
  }

  public requeueStaleProcessing(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const result = this.db.prepare("UPDATE exam_jobs SET status = 'queued', updated_at = ? WHERE status = 'processing' AND updated_at < ?").run(new Date().toISOString(), cutoff);
    return Number(result.changes);
  }

  public updateStatus(
    id: string,
    status: ExamJobStatus,
    progress?: number,
    resultSummary?: Record<string, any>,
    errorMessage?: string
  ): DbExamJob | null {
    const now = new Date().toISOString();
    const resultSummaryJson = resultSummary !== undefined ? JSON.stringify(resultSummary) : null;

    let query = 'UPDATE exam_jobs SET status = ?, updated_at = ?';
    const params: any[] = [status, now];

    if (progress !== undefined) {
      query += ', progress = ?';
      params.push(progress);
    }
    if (resultSummaryJson !== null) {
      query += ', result_summary_json = ?';
      params.push(resultSummaryJson);
    }
    if (errorMessage !== undefined) {
      query += ', error_message = ?';
      params.push(errorMessage);
    }

    query += ' WHERE id = ?';
    params.push(id);

    this.db.prepare(query).run(...params);
    return this.findById(id);
  }

  private mapJob(row: any): DbExamJob {
    return {
      id: row.id,
      userId: row.user_id,
      examId: row.exam_id ?? null,
      jobType: row.job_type as ExamJobType,
      status: row.status as ExamJobStatus,
      progress: Number(row.progress || 0),
      totalItems: Number(row.total_items || 0),
      errorMessage: row.error_message ?? null,
      idempotencyKey: row.idempotency_key ?? null,
      resultSummaryJson: row.result_summary_json ?? null,
      payloadJson: row.payload_json ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class QuestionSegmentRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    id?: string;
    questionId: string;
    examId: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    orderNum?: number;
    confidence?: number;
    source?: QuestionSegmentSource;
  }): DbQuestionSegment {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const orderNum = data.orderNum ?? 1;
    const confidence = data.confidence ?? 1.0;
    const source: QuestionSegmentSource = data.source ?? 'pdf_text';

    this.db
      .prepare(
        `INSERT INTO question_segments (
          id, question_id, exam_id, page, x, y, width, height, order_num,
          confidence, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.questionId,
        data.examId,
        data.page,
        data.x,
        data.y,
        data.width,
        data.height,
        orderNum,
        confidence,
        source,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbQuestionSegment | null {
    const row = this.db.prepare('SELECT * FROM question_segments WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapSegment(row);
  }

  public listByQuestion(questionId: string): DbQuestionSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM question_segments WHERE question_id = ? ORDER BY order_num ASC, page ASC')
      .all(questionId) as any[];
    return rows.map((r) => this.mapSegment(r));
  }

  public listByExam(examId: string): DbQuestionSegment[] {
    const rows = this.db
      .prepare('SELECT * FROM question_segments WHERE exam_id = ? ORDER BY page ASC, y ASC')
      .all(examId) as any[];
    return rows.map((r) => this.mapSegment(r));
  }

  public updateCoordinates(
    id: string,
    coords: {
      x: number;
      y: number;
      width: number;
      height: number;
      confidence?: number;
      source?: QuestionSegmentSource;
    }
  ): DbQuestionSegment | null {
    const now = new Date().toISOString();
    const current = this.findById(id);
    if (!current) return null;

    const newConfidence = coords.confidence ?? current.confidence;
    const newSource = coords.source ?? 'manual';

    this.db
      .prepare(
        `UPDATE question_segments
         SET x = ?, y = ?, width = ?, height = ?, confidence = ?, source = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(coords.x, coords.y, coords.width, coords.height, newConfidence, newSource, now, id);

    return this.findById(id);
  }

  public delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM question_segments WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  private mapSegment(row: any): DbQuestionSegment {
    return {
      id: row.id,
      questionId: row.question_id,
      examId: row.exam_id,
      page: Number(row.page),
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      orderNum: Number(row.order_num || 1),
      confidence: Number(row.confidence || 1.0),
      source: row.source as QuestionSegmentSource,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class QuestionAssetRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    id?: string;
    questionId: string;
    segmentId?: string | null;
    assetType: QuestionAssetType;
    filePath: string;
    publicUrl?: string | null;
    width: number;
    height: number;
    format?: string;
    dpi?: number;
  }): DbQuestionAsset {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const format = data.format || 'webp';
    const dpi = data.dpi || 180;

    this.db
      .prepare(
        `INSERT INTO question_assets (
          id, question_id, segment_id, asset_type, file_path, public_url,
          width, height, format, dpi, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.questionId,
        data.segmentId ?? null,
        data.assetType,
        data.filePath,
        data.publicUrl ?? null,
        data.width,
        data.height,
        format,
        dpi,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbQuestionAsset | null {
    const row = this.db.prepare('SELECT * FROM question_assets WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapAsset(row);
  }

  public listByQuestion(questionId: string): DbQuestionAsset[] {
    const rows = this.db
      .prepare('SELECT * FROM question_assets WHERE question_id = ? ORDER BY created_at ASC')
      .all(questionId) as any[];
    return rows.map((r) => this.mapAsset(r));
  }

  public findBySegment(segmentId: string): DbQuestionAsset[] {
    const rows = this.db
      .prepare('SELECT * FROM question_assets WHERE segment_id = ? ORDER BY created_at ASC')
      .all(segmentId) as any[];
    return rows.map((r) => this.mapAsset(r));
  }

  public findByFilename(filename: string): DbQuestionAsset[] {
    const rows = this.db
      .prepare('SELECT * FROM question_assets WHERE file_path LIKE ? OR file_path LIKE ? ORDER BY created_at ASC')
      .all(`%/${filename}`, `%\\${filename}`) as any[];
    return rows.map((r) => this.mapAsset(r));
  }

  public delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM question_assets WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  public deleteByQuestion(questionId: string): number {
    const res = this.db.prepare('DELETE FROM question_assets WHERE question_id = ?').run(questionId);
    return Number(res.changes);
  }

  private mapAsset(row: any): DbQuestionAsset {
    return {
      id: row.id,
      questionId: row.question_id,
      segmentId: row.segment_id ?? null,
      assetType: row.asset_type as QuestionAssetType,
      filePath: row.file_path,
      publicUrl: row.public_url ?? null,
      width: Number(row.width),
      height: Number(row.height),
      format: row.format,
      dpi: Number(row.dpi || 180),
      createdAt: row.created_at,
    };
  }
}

export class SupportMaterialRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    id?: string;
    examId: string;
    title: string;
    contentText?: string | null;
    page: number;
    bbox?: { x: number; y: number; width: number; height: number };
    assetPath?: string | null;
  }): DbSupportMaterial {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const bboxJson = data.bbox ? JSON.stringify(data.bbox) : null;

    this.db
      .prepare(
        `INSERT INTO support_materials (
          id, exam_id, title, content_text, page, bbox_json, asset_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.examId,
        data.title,
        data.contentText ?? null,
        data.page,
        bboxJson,
        data.assetPath ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbSupportMaterial | null {
    const row = this.db.prepare('SELECT * FROM support_materials WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapSupport(row);
  }

  public listByExam(examId: string): DbSupportMaterial[] {
    const rows = this.db
      .prepare('SELECT * FROM support_materials WHERE exam_id = ? ORDER BY page ASC, created_at ASC')
      .all(examId) as any[];
    return rows.map((r) => this.mapSupport(r));
  }

  public delete(id: string): boolean {
    const res = this.db.prepare('DELETE FROM support_materials WHERE id = ?').run(id);
    return Number(res.changes) > 0;
  }

  private mapSupport(row: any): DbSupportMaterial {
    return {
      id: row.id,
      examId: row.exam_id,
      title: row.title,
      contentText: row.content_text ?? null,
      page: Number(row.page),
      bboxJson: row.bbox_json ?? null,
      assetPath: row.asset_path ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class QuestionAuditRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    id?: string;
    questionId: string;
    detector: string;
    confidence: number;
    isManualReview?: boolean;
    userId?: string | null;
    previousBbox?: Record<string, any>;
    newBbox?: Record<string, any>;
    notes?: string | null;
  }): DbQuestionAuditLog {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const isManual = data.isManualReview ? 1 : 0;
    const prevJson = data.previousBbox ? JSON.stringify(data.previousBbox) : null;
    const newJson = data.newBbox ? JSON.stringify(data.newBbox) : null;

    this.db
      .prepare(
        `INSERT INTO question_audit_logs (
          id, question_id, detector, confidence, is_manual_review, user_id,
          previous_bbox_json, new_bbox_json, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.questionId,
        data.detector,
        data.confidence,
        isManual,
        data.userId ?? null,
        prevJson,
        newJson,
        data.notes ?? null,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbQuestionAuditLog | null {
    const row = this.db.prepare('SELECT * FROM question_audit_logs WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapAudit(row);
  }

  public listByQuestion(questionId: string): DbQuestionAuditLog[] {
    const rows = this.db
      .prepare('SELECT * FROM question_audit_logs WHERE question_id = ? ORDER BY created_at DESC')
      .all(questionId) as any[];
    return rows.map((r) => this.mapAudit(r));
  }

  private mapAudit(row: any): DbQuestionAuditLog {
    return {
      id: row.id,
      questionId: row.question_id,
      detector: row.detector,
      confidence: Number(row.confidence),
      isManualReview: Boolean(row.is_manual_review),
      userId: row.user_id ?? null,
      previousBboxJson: row.previous_bbox_json ?? null,
      newBboxJson: row.new_bbox_json ?? null,
      notes: row.notes ?? null,
      createdAt: row.created_at,
    };
  }
}

export class StudySessionRepository {
  constructor(private db: DatabaseSync) {}

  public upsertManual(id: string, data: {
    userId: string;
    subjectId: string;
    subjectName: string;
    topic?: string | null;
    dateStr: string;
    durationSeconds: number;
    endedAt: string;
    notes?: string | null;
  }): DbStudySession {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO study_sessions (
        id, user_id, subject_id, subject_name, topic,
        date_str, duration_seconds, started_at, ended_at, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subject_id = excluded.subject_id,
        subject_name = excluded.subject_name,
        topic = excluded.topic,
        date_str = excluded.date_str,
        duration_seconds = excluded.duration_seconds,
        ended_at = excluded.ended_at,
        notes = excluded.notes
    `).run(
      id,
      data.userId,
      data.subjectId,
      data.subjectName,
      data.topic ?? null,
      data.dateStr,
      data.durationSeconds,
      data.endedAt,
      data.notes ?? null,
      now
    );

    return {
      id,
      userId: data.userId,
      subjectId: data.subjectId,
      subjectName: data.subjectName,
      topic: data.topic ?? null,
      dateStr: data.dateStr,
      durationSeconds: data.durationSeconds,
      endedAt: data.endedAt,
      notes: data.notes ?? null,
      createdAt: now,
    };
  }

  public deleteByIdForUser(id: string, userId: string): void {
    this.db.prepare('DELETE FROM study_sessions WHERE id = ? AND user_id = ?').run(id, userId);
  }

  public deleteByDateAndSubjectForUser(userId: string, dateStr: string, subjectId: string): void {
    this.db
      .prepare('DELETE FROM study_sessions WHERE user_id = ? AND date_str = ? AND subject_id = ?')
      .run(userId, dateStr, subjectId);
  }

  public deleteByDateForUser(userId: string, dateStr: string): void {
    this.db
      .prepare('DELETE FROM study_sessions WHERE user_id = ? AND date_str = ?')
      .run(userId, dateStr);
  }

  public create(data: {
    userId: string;
    subjectId: string;
    subjectName: string;
    topic?: string | null;
    dateStr: string; // YYYY-MM-DD
    durationSeconds: number;
    startedAt?: string | null;
    endedAt: string;
    notes?: string | null;
  }): DbStudySession {
    const id = `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO study_sessions (
          id, user_id, subject_id, subject_name, topic,
          date_str, duration_seconds, started_at, ended_at, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.userId,
        data.subjectId,
        data.subjectName,
        data.topic ?? null,
        data.dateStr,
        data.durationSeconds,
        data.startedAt ?? null,
        data.endedAt,
        data.notes ?? null,
        now
      );

    return {
      id,
      userId: data.userId,
      subjectId: data.subjectId,
      subjectName: data.subjectName,
      topic: data.topic ?? null,
      dateStr: data.dateStr,
      durationSeconds: data.durationSeconds,
      startedAt: data.startedAt ?? null,
      endedAt: data.endedAt,
      notes: data.notes ?? null,
      createdAt: now,
    };
  }

  public getDailySummaryByMonth(userId: string, yearMonth: string): Record<string, DayStudySummary> {
    // yearMonth = 'YYYY-MM'
    const rows = this.db
      .prepare(
        `SELECT
          date_str,
          subject_id,
          subject_name,
          SUM(duration_seconds) as sub_seconds,
          COUNT(id) as sub_sessions
         FROM study_sessions
         WHERE user_id = ? AND date_str LIKE ?
         GROUP BY date_str, subject_id, subject_name
         ORDER BY date_str ASC`
      )
      .all(userId, `${yearMonth}-%`) as Array<{
        date_str: string;
        subject_id: string;
        subject_name: string;
        sub_seconds: number;
        sub_sessions: number;
      }>;

    const summaryMap: Record<string, DayStudySummary> = {};

    for (const row of rows) {
      const date = row.date_str;
      if (!summaryMap[date]) {
        summaryMap[date] = {
          dateStr: date,
          totalSeconds: 0,
          totalHours: 0,
          sessionsCount: 0,
          subjects: [],
        };
      }

      const sec = Number(row.sub_seconds) || 0;
      summaryMap[date].totalSeconds += sec;
      summaryMap[date].sessionsCount += Number(row.sub_sessions) || 0;
      summaryMap[date].subjects.push({
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        durationSeconds: sec,
        durationHours: Math.round((sec / 3600) * 10) / 10,
      });
    }

    for (const date in summaryMap) {
      summaryMap[date].totalHours = Math.round((summaryMap[date].totalSeconds / 3600) * 10) / 10;
    }

    return summaryMap;
  }

  public getDailySummaryBetweenDates(userId: string, startDate: string, endDate: string): Record<string, DayStudySummary> {
    const rows = this.db
      .prepare(
        `SELECT
          date_str,
          subject_id,
          subject_name,
          SUM(duration_seconds) as sub_seconds,
          COUNT(id) as sub_sessions
         FROM study_sessions
         WHERE user_id = ? AND date_str >= ? AND date_str <= ?
         GROUP BY date_str, subject_id, subject_name
         ORDER BY date_str ASC`
      )
      .all(userId, startDate, endDate) as Array<{
        date_str: string;
        subject_id: string;
        subject_name: string;
        sub_seconds: number;
        sub_sessions: number;
      }>;

    const summaryMap: Record<string, DayStudySummary> = {};

    for (const row of rows) {
      const date = row.date_str;
      if (!summaryMap[date]) {
        summaryMap[date] = {
          dateStr: date,
          totalSeconds: 0,
          totalHours: 0,
          sessionsCount: 0,
          subjects: [],
        };
      }

      const sec = Number(row.sub_seconds) || 0;
      summaryMap[date].totalSeconds += sec;
      summaryMap[date].sessionsCount += Number(row.sub_sessions) || 0;
      summaryMap[date].subjects.push({
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        durationSeconds: sec,
        durationHours: Math.round((sec / 3600) * 10) / 10,
      });
    }

    for (const date in summaryMap) {
      summaryMap[date].totalHours = Math.round((summaryMap[date].totalSeconds / 3600) * 10) / 10;
    }

    return summaryMap;
  }

  public getSessionsByDate(userId: string, dateStr: string): DbStudySession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM study_sessions
         WHERE user_id = ? AND date_str = ?
         ORDER BY created_at ASC`
      )
      .all(userId, dateStr) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      topic: r.topic ?? null,
      dateStr: r.date_str,
      durationSeconds: Number(r.duration_seconds),
      startedAt: r.started_at ?? null,
      endedAt: r.ended_at,
      notes: r.notes ?? null,
      createdAt: r.created_at,
    }));
  }

  public listForUser(userId: string, limit: number = 1000): DbStudySession[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM study_sessions
         WHERE user_id = ?
         ORDER BY date_str DESC, created_at DESC
         LIMIT ?`
      )
      .all(userId, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      topic: r.topic ?? null,
      dateStr: r.date_str,
      durationSeconds: Number(r.duration_seconds),
      startedAt: r.started_at ?? null,
      endedAt: r.ended_at,
      notes: r.notes ?? null,
      createdAt: r.created_at,
    }));
  }

  public getMonthlyTotal(userId: string, yearMonth: string): { totalSeconds: number; totalHours: number; totalSessions: number } {
    const row = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(duration_seconds), 0) as total_seconds,
          COUNT(id) as total_sessions
         FROM study_sessions
         WHERE user_id = ? AND date_str LIKE ?`
      )
      .get(userId, `${yearMonth}-%`) as any;

    const totalSeconds = row ? Number(row.total_seconds) : 0;
    const totalSessions = row ? Number(row.total_sessions) : 0;

    return {
      totalSeconds,
      totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
      totalSessions,
    };
  }
}

export class SystemIntegrationRepository {
  constructor(private db: DatabaseSync) {}

  public get(id: string): DbSystemIntegration | null {
    const row = this.db
      .prepare('SELECT id, encrypted_payload, updated_at FROM system_integrations WHERE id = ?')
      .get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      encryptedPayload: row.encrypted_payload,
      updatedAt: row.updated_at,
    };
  }

  public set(id: string, encryptedPayload: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO system_integrations (id, encrypted_payload, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET encrypted_payload = excluded.encrypted_payload, updated_at = excluded.updated_at`
      )
      .run(id, encryptedPayload, now);
  }

  public delete(id: string): void {
    this.db.prepare('DELETE FROM system_integrations WHERE id = ?').run(id);
  }
}

export class ConsentRepository {
  constructor(private db: DatabaseSync) {}

  public recordConsent(data: {
    userId?: string | null;
    category: ConsentCategory;
    policyVersion: string;
    termsVersion?: string | null;
    status?: ConsentStatus;
    ipHash?: string | null;
    userAgent?: string | null;
  }): DbConsentRecord {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status = data.status || 'granted';

    this.db
      .prepare(
        `INSERT INTO consent_records (
          id, user_id, category, policy_version, terms_version, status, ip_hash, user_agent, granted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.userId ?? null,
        data.category,
        data.policyVersion,
        data.termsVersion ?? null,
        status,
        data.ipHash ?? null,
        data.userAgent ?? null,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbConsentRecord | null {
    const row = this.db.prepare('SELECT * FROM consent_records WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRecord(row);
  }

  public findLatestForUser(userId: string): DbConsentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM consent_records
         WHERE user_id = ?
         ORDER BY granted_at DESC`
      )
      .all(userId) as any[];
    return rows.map((r) => this.mapRecord(r));
  }

  public findLatestByCategory(userId: string, category: ConsentCategory): DbConsentRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM consent_records
         WHERE user_id = ? AND category = ?
         ORDER BY granted_at DESC
         LIMIT 1`
      )
      .get(userId, category) as any;
    if (!row) return null;
    return this.mapRecord(row);
  }

  public revokeConsent(userId: string, category: ConsentCategory): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE consent_records
         SET status = 'revoked', revoked_at = ?
         WHERE user_id = ? AND category = ? AND status = 'granted'`
      )
      .run(now, userId, category);
  }

  private mapRecord(row: any): DbConsentRecord {
    return {
      id: row.id,
      userId: row.user_id,
      category: row.category as ConsentCategory,
      policyVersion: row.policy_version,
      termsVersion: row.terms_version,
      status: row.status as ConsentStatus,
      ipHash: row.ip_hash,
      userAgent: row.user_agent,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
    };
  }
}

export class PrivacyRequestRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    userId?: string | null;
    email: string;
    requestType: PrivacyRequestType;
    details?: string | null;
  }): DbPrivacyRequest {
    const id = crypto.randomUUID();
    const requestCode = `LGPD-REQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO privacy_requests (
          id, request_code, user_id, email, request_type, status, details, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .run(
        id,
        requestCode,
        data.userId ?? null,
        data.email.toLowerCase().trim(),
        data.requestType,
        data.details ?? null,
        now,
        now
      );

    return this.findById(id)!;
  }

  public findById(id: string): DbPrivacyRequest | null {
    const row = this.db.prepare('SELECT * FROM privacy_requests WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRequest(row);
  }

  public findByCode(requestCode: string): DbPrivacyRequest | null {
    const row = this.db.prepare('SELECT * FROM privacy_requests WHERE request_code = ?').get(requestCode) as any;
    if (!row) return null;
    return this.mapRequest(row);
  }

  public findByUserId(userId: string): DbPrivacyRequest[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM privacy_requests
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(userId) as any[];
    return rows.map((r) => this.mapRequest(r));
  }

  public findAdminFiltered(options: {
    status?: string;
    requestType?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}): { items: DbPrivacyRequest[]; total: number } {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.requestType) {
      conditions.push('request_type = ?');
      params.push(options.requestType);
    }
    if (options.search) {
      conditions.push('(request_code LIKE ? OR email LIKE ?)');
      const term = `%${options.search.trim()}%`;
      params.push(term, term);
    }

    const where = conditions.join(' AND ');
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as total FROM privacy_requests WHERE ${where}`)
      .get(...params) as any;
    const total = Number(countRow?.total || 0);

    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 20));
    const offset = (page - 1) * limit;

    const rows = this.db
      .prepare(
        `SELECT * FROM privacy_requests
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as any[];

    return {
      items: rows.map((r) => this.mapRequest(r)),
      total,
    };
  }

  public updateStatus(
    id: string,
    status: PrivacyRequestStatus,
    adminUserId: string,
    adminNotes?: string | null
  ): DbPrivacyRequest | null {
    const now = new Date().toISOString();
    const isCompletedOrRejected = status === 'completed' || status === 'rejected';

    this.db
      .prepare(
        `UPDATE privacy_requests
         SET status = ?, admin_notes = COALESCE(?, admin_notes),
             processed_by_user_id = ?,
             processed_at = CASE WHEN ? = 1 THEN ? ELSE processed_at END,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        status,
        adminNotes ?? null,
        adminUserId,
        isCompletedOrRejected ? 1 : 0,
        now,
        now,
        id
      );

    return this.findById(id);
  }

  private mapRequest(row: any): DbPrivacyRequest {
    return {
      id: row.id,
      requestCode: row.request_code,
      userId: row.user_id,
      email: row.email,
      requestType: row.request_type as PrivacyRequestType,
      status: row.status as PrivacyRequestStatus,
      details: row.details,
      adminNotes: row.admin_notes,
      processedByUserId: row.processed_by_user_id,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      updatedAt: row.updated_at,
    };
  }
}

export class HoneypotRepository {
  constructor(private db: DatabaseSync) {}

  public createEvent(data: {
    eventType: HoneypotEventType;
    honeypotId: string;
    requestPath: string;
    method: string;
    riskScore: number;
    userId?: string | null;
    ipHash?: string | null;
    userAgentSummary?: string | null;
    actionTaken: HoneypotAction;
  }): DbDeceptionEvent {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const userId = data.userId ?? null;
    const ipHash = data.ipHash ?? null;
    const userAgentSummary = (data.userAgentSummary || 'Unknown').slice(0, 200);

    this.db.prepare(`
      INSERT INTO security_deception_events (
        id, event_type, honeypot_id, request_path, method,
        risk_score, user_id, ip_hash, user_agent_summary, action_taken, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.eventType,
      data.honeypotId,
      data.requestPath,
      data.method,
      data.riskScore,
      userId,
      ipHash,
      userAgentSummary,
      data.actionTaken,
      now
    );

    return {
      id,
      eventType: data.eventType,
      honeypotId: data.honeypotId,
      requestPath: data.requestPath,
      method: data.method,
      riskScore: data.riskScore,
      userId,
      ipHash,
      userAgentSummary,
      actionTaken: data.actionTaken,
      createdAt: now,
    };
  }

  public findFiltered(filters: {
    page?: number;
    limit?: number;
    eventType?: string;
    minRisk?: number;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): { items: DbDeceptionEvent[]; total: number; page: number; limit: number; totalPages: number } {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (filters.eventType) {
      conditions.push('event_type = ?');
      params.push(filters.eventType);
    }
    if (filters.minRisk !== undefined && filters.minRisk > 0) {
      conditions.push('risk_score >= ?');
      params.push(filters.minRisk);
    }
    if (filters.startDate) {
      conditions.push('created_at >= ?');
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push('created_at <= ?');
      params.push(filters.endDate);
    }
    if (filters.search) {
      conditions.push('(request_path LIKE ? OR honeypot_id LIKE ? OR action_taken LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }

    const whereSql = conditions.join(' AND ');

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM security_deception_events WHERE ${whereSql}
    `).get(...params) as any;
    const total = Number(countRow?.total || 0);

    const rows = this.db.prepare(`
      SELECT id, event_type, honeypot_id, request_path, method,
             risk_score, user_id, ip_hash, user_agent_summary, action_taken, created_at
      FROM security_deception_events
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return {
      items: rows.map((r) => this.mapEvent(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  public getMetrics(): HoneypotMetrics {
    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

    const totalRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM security_deception_events`).get() as any;
    const totalEvents = Number(totalRow?.cnt || 0);

    const events24hRow = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM security_deception_events WHERE created_at >= ?
    `).get(past24h) as any;
    const events24h = Number(events24hRow?.cnt || 0);

    const highRiskRow = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM security_deception_events WHERE created_at >= ? AND risk_score >= 70
    `).get(past24h) as any;
    const highRiskEvents24h = Number(highRiskRow?.cnt || 0);

    const blocksRow = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM cadet_temporary_source_blocks WHERE locked_until > ?
    `).get(now.toISOString()) as any;
    const activeTemporaryBlocks = Number(blocksRow?.cnt || 0);

    const byTypeRows = this.db.prepare(`
      SELECT event_type, COUNT(*) as cnt FROM security_deception_events GROUP BY event_type
    `).all() as any[];
    const eventsByType: Record<string, number> = {};
    for (const r of byTypeRows) {
      eventsByType[r.event_type] = Number(r.cnt);
    }

    const topDecoyRows = this.db.prepare(`
      SELECT request_path, COUNT(*) as cnt
      FROM security_deception_events
      GROUP BY request_path
      ORDER BY cnt DESC
      LIMIT 5
    `).all() as any[];
    const topTargetedDecoys = topDecoyRows.map((r) => ({
      path: r.request_path,
      count: Number(r.cnt),
    }));

    return {
      totalEvents,
      events24h,
      highRiskEvents24h,
      activeTemporaryBlocks,
      eventsByType,
      topTargetedDecoys,
    };
  }

  public countRecentEventsByIpHash(ipHash: string, windowSeconds = 300): number {
    if (!ipHash) return 0;
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const row = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM security_deception_events WHERE ip_hash = ? AND created_at >= ?
    `).get(ipHash, since) as any;
    return Number(row?.cnt || 0);
  }

  public cleanupExpiredEvents(retentionDays = 30): number {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
    const res = this.db.prepare(`
      DELETE FROM security_deception_events WHERE created_at < ?
    `).run(cutoff);
    return Number(res.changes);
  }

  private mapEvent(row: any): DbDeceptionEvent {
    return {
      id: row.id,
      eventType: row.event_type as HoneypotEventType,
      honeypotId: row.honeypot_id,
      requestPath: row.request_path,
      method: row.method,
      riskScore: Number(row.risk_score),
      userId: row.user_id,
      ipHash: row.ip_hash,
      userAgentSummary: row.user_agent_summary,
      actionTaken: row.action_taken as HoneypotAction,
      createdAt: row.created_at,
    };
  }
}

export interface SubjectWithStats extends DbFlashcardSubject {
  deckCount: number;
  cardCount: number;
  dueCount: number;
}

export interface DeckWithStats extends DbFlashcardDeck {
  subjectName?: string;
  cardCount: number;
  dueCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
}

export class FlashcardRepository {
  constructor(private db: DatabaseSync | any) {}

  // ==========================================
  // DISCIPLINAS (SUBJECTS)
  // ==========================================

  public listSubjects(userId: string): SubjectWithStats[] {
    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT 
        s.*,
        COUNT(DISTINCT d.id) as deck_count,
        COUNT(DISTINCT c.id) as card_count,
        COUNT(DISTINCT CASE WHEN c.next_review_at <= ? THEN c.id ELSE NULL END) as due_count
      FROM flashcard_subjects s
      LEFT JOIN flashcard_decks d ON d.subject_id = s.id AND d.user_id = s.user_id
      LEFT JOIN flashcards c ON c.deck_id = d.id AND c.user_id = s.user_id
      WHERE s.user_id = ?
      GROUP BY s.id
      ORDER BY s.name COLLATE NOCASE ASC
    `).all(today, userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description || null,
      icon: r.icon || null,
      color: r.color || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deckCount: Number(r.deck_count || 0),
      cardCount: Number(r.card_count || 0),
      dueCount: Number(r.due_count || 0),
    }));
  }

  public getSubject(userId: string, id: string): SubjectWithStats | null {
    const today = new Date().toISOString().split('T')[0];
    const row = this.db.prepare(`
      SELECT 
        s.*,
        COUNT(DISTINCT d.id) as deck_count,
        COUNT(DISTINCT c.id) as card_count,
        COUNT(DISTINCT CASE WHEN c.next_review_at <= ? THEN c.id ELSE NULL END) as due_count
      FROM flashcard_subjects s
      LEFT JOIN flashcard_decks d ON d.subject_id = s.id AND d.user_id = s.user_id
      LEFT JOIN flashcards c ON c.deck_id = d.id AND c.user_id = s.user_id
      WHERE s.user_id = ? AND s.id = ?
      GROUP BY s.id
    `).get(today, userId, id) as any;

    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || null,
      icon: row.icon || null,
      color: row.color || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deckCount: Number(row.deck_count || 0),
      cardCount: Number(row.card_count || 0),
      dueCount: Number(row.due_count || 0),
    };
  }

  public createSubject(userId: string, data: {
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
  }): DbFlashcardSubject {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO flashcard_subjects (id, user_id, name, description, icon, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, data.name.trim(), data.description?.trim() || null, data.icon || null, data.color || null, now, now);

    return {
      id,
      userId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      icon: data.icon || null,
      color: data.color || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateSubject(userId: string, id: string, data: {
    name?: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
  }): DbFlashcardSubject | null {
    const existing = this.getSubject(userId, id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? (data.description ? data.description.trim() : null) : existing.description;
    const icon = data.icon !== undefined ? data.icon : existing.icon;
    const color = data.color !== undefined ? data.color : existing.color;

    this.db.prepare(`
      UPDATE flashcard_subjects
      SET name = ?, description = ?, icon = ?, color = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(name, description, icon, color, now, userId, id);

    return {
      id,
      userId,
      name,
      description,
      icon,
      color,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  public getSubjectCascadeStats(userId: string, id: string): { deckCount: number; cardCount: number } | null {
    const row = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT d.id) as deck_count,
        COUNT(DISTINCT c.id) as card_count
      FROM flashcard_subjects s
      LEFT JOIN flashcard_decks d ON d.subject_id = s.id AND d.user_id = s.user_id
      LEFT JOIN flashcards c ON c.deck_id = d.id AND c.user_id = s.user_id
      WHERE s.user_id = ? AND s.id = ?
      GROUP BY s.id
    `).get(userId, id) as any;

    if (!row) return null;
    return {
      deckCount: Number(row.deck_count || 0),
      cardCount: Number(row.card_count || 0),
    };
  }

  public deleteSubject(userId: string, id: string): { deleted: boolean; deckCount: number; cardCount: number } {
    const stats = this.getSubjectCascadeStats(userId, id);
    if (!stats) return { deleted: false, deckCount: 0, cardCount: 0 };

    this.db.prepare(`
      DELETE FROM flashcard_subjects WHERE user_id = ? AND id = ?
    `).run(userId, id);

    return {
      deleted: true,
      deckCount: stats.deckCount,
      cardCount: stats.cardCount,
    };
  }

  // ==========================================
  // BARALHOS (DECKS)
  // ==========================================

  public listDecks(userId: string, subjectId?: string): DeckWithStats[] {
    const today = new Date().toISOString().split('T')[0];
    let query = `
      SELECT 
        d.*,
        s.name as subject_name,
        COUNT(DISTINCT c.id) as card_count,
        COUNT(DISTINCT CASE WHEN c.next_review_at <= ? THEN c.id ELSE NULL END) as due_count,
        COUNT(DISTINCT CASE WHEN c.status = 'new' THEN c.id ELSE NULL END) as new_count,
        COUNT(DISTINCT CASE WHEN c.status = 'learning' THEN c.id ELSE NULL END) as learning_count,
        COUNT(DISTINCT CASE WHEN c.status = 'review' THEN c.id ELSE NULL END) as review_count,
        COUNT(DISTINCT CASE WHEN c.status = 'mastered' THEN c.id ELSE NULL END) as mastered_count
      FROM flashcard_decks d
      JOIN flashcard_subjects s ON s.id = d.subject_id AND s.user_id = d.user_id
      LEFT JOIN flashcards c ON c.deck_id = d.id AND c.user_id = d.user_id
      WHERE d.user_id = ?
    `;
    const params: any[] = [today, userId];

    if (subjectId) {
      query += ` AND d.subject_id = ?`;
      params.push(subjectId);
    }

    query += ` GROUP BY d.id ORDER BY d.name COLLATE NOCASE ASC`;

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.mapDeckWithStats(r));
  }

  public getDeck(userId: string, id: string): DeckWithStats | null {
    const today = new Date().toISOString().split('T')[0];
    const row = this.db.prepare(`
      SELECT 
        d.*,
        s.name as subject_name,
        COUNT(DISTINCT c.id) as card_count,
        COUNT(DISTINCT CASE WHEN c.next_review_at <= ? THEN c.id ELSE NULL END) as due_count,
        COUNT(DISTINCT CASE WHEN c.status = 'new' THEN c.id ELSE NULL END) as new_count,
        COUNT(DISTINCT CASE WHEN c.status = 'learning' THEN c.id ELSE NULL END) as learning_count,
        COUNT(DISTINCT CASE WHEN c.status = 'review' THEN c.id ELSE NULL END) as review_count,
        COUNT(DISTINCT CASE WHEN c.status = 'mastered' THEN c.id ELSE NULL END) as mastered_count
      FROM flashcard_decks d
      JOIN flashcard_subjects s ON s.id = d.subject_id AND s.user_id = d.user_id
      LEFT JOIN flashcards c ON c.deck_id = d.id AND c.user_id = d.user_id
      WHERE d.user_id = ? AND d.id = ?
      GROUP BY d.id
    `).get(today, userId, id) as any;

    if (!row) return null;
    return this.mapDeckWithStats(row);
  }

  public createDeck(userId: string, data: {
    subjectId: string;
    name: string;
    description?: string | null;
  }): DbFlashcardDeck {
    // Validação estrita de autorização em relacionamentos: Subject deve pertencer ao usuário autenticado
    const subject = this.db.prepare(`SELECT id FROM flashcard_subjects WHERE user_id = ? AND id = ?`).get(userId, data.subjectId);
    if (!subject) {
      throw new Error('SUBJECT_NOT_FOUND');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO flashcard_decks (id, user_id, subject_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, data.subjectId, data.name.trim(), data.description?.trim() || null, now, now);

    return {
      id,
      userId,
      subjectId: data.subjectId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateDeck(userId: string, id: string, data: {
    name?: string;
    description?: string | null;
    subjectId?: string;
  }): DbFlashcardDeck | null {
    const existing = this.getDeck(userId, id);
    if (!existing) return null;

    let targetSubjectId = existing.subjectId;
    if (data.subjectId && data.subjectId !== existing.subjectId) {
      const subject = this.db.prepare(`SELECT id FROM flashcard_subjects WHERE user_id = ? AND id = ?`).get(userId, data.subjectId);
      if (!subject) throw new Error('SUBJECT_NOT_FOUND');
      targetSubjectId = data.subjectId;
    }

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const description = data.description !== undefined ? (data.description ? data.description.trim() : null) : existing.description;

    this.db.prepare(`
      UPDATE flashcard_decks
      SET name = ?, description = ?, subject_id = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(name, description, targetSubjectId, now, userId, id);

    // Se o assunto mudou, atualiza subject_id dos cards vinculados para manter integridade
    if (targetSubjectId !== existing.subjectId) {
      this.db.prepare(`
        UPDATE flashcards
        SET subject_id = ?, updated_at = ?
        WHERE user_id = ? AND deck_id = ?
      `).run(targetSubjectId, now, userId, id);
    }

    return {
      id,
      userId,
      subjectId: targetSubjectId,
      name,
      description,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  public getDeckCascadeStats(userId: string, id: string): { cardCount: number } | null {
    const row = this.db.prepare(`
      SELECT COUNT(*) as card_count
      FROM flashcards
      WHERE user_id = ? AND deck_id = ?
    `).get(userId, id) as any;

    if (!this.getDeck(userId, id)) return null;
    return { cardCount: Number(row?.card_count || 0) };
  }

  public deleteDeck(userId: string, id: string): { deleted: boolean; cardCount: number } {
    const stats = this.getDeckCascadeStats(userId, id);
    if (!stats) return { deleted: false, cardCount: 0 };

    this.db.prepare(`
      DELETE FROM flashcard_decks WHERE user_id = ? AND id = ?
    `).run(userId, id);

    return {
      deleted: true,
      cardCount: stats.cardCount,
    };
  }

  // ==========================================
  // FLASHCARDS & REPETIÇÃO ESPAÇADA (SM-2)
  // ==========================================

  public listCards(userId: string, filters?: {
    deckId?: string;
    subjectId?: string;
    status?: FlashcardStatus;
    dueOnly?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): { cards: DbFlashcard[]; total: number } {
    const today = new Date().toISOString().split('T')[0];
    let where = `WHERE c.user_id = ?`;
    const params: any[] = [userId];

    if (filters?.deckId) {
      where += ` AND c.deck_id = ?`;
      params.push(filters.deckId);
    }
    if (filters?.subjectId) {
      where += ` AND c.subject_id = ?`;
      params.push(filters.subjectId);
    }
    if (filters?.status) {
      where += ` AND c.status = ?`;
      params.push(filters.status);
    }
    if (filters?.dueOnly) {
      where += ` AND c.next_review_at <= ?`;
      params.push(today);
    }
    if (filters?.search) {
      where += ` AND (c.front LIKE ? OR c.back LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countRow = this.db.prepare(`
      SELECT COUNT(*) as total FROM flashcards c ${where}
    `).get(...params) as any;
    const total = Number(countRow?.total || 0);

    const limit = Math.max(1, Math.min(filters?.limit || 100, 500));
    const offset = Math.max(0, filters?.offset || 0);

    let query = `
      SELECT c.* FROM flashcards c
      ${where}
      ORDER BY 
        CASE WHEN c.next_review_at <= ? THEN 0 ELSE 1 END,
        c.next_review_at ASC,
        c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const listParams = [userId, ...params.slice(1), today, limit, offset];

    const rows = this.db.prepare(query).all(...listParams) as any[];
    return {
      cards: rows.map((r) => this.mapCard(r)),
      total,
    };
  }

  public getCard(userId: string, id: string): DbFlashcard | null {
    const row = this.db.prepare(`
      SELECT * FROM flashcards WHERE user_id = ? AND id = ?
    `).get(userId, id) as any;
    if (!row) return null;
    return this.mapCard(row);
  }

  public createCard(userId: string, data: {
    deckId: string;
    front: string;
    back: string;
    frontImage?: string | null;
    backImage?: string | null;
  }): DbFlashcard {
    // Validação estrita de autorização em relacionamentos: Deck deve pertencer ao usuário autenticado
    const deck = this.db.prepare(`
      SELECT id, subject_id FROM flashcard_decks WHERE user_id = ? AND id = ?
    `).get(userId, data.deckId) as any;

    if (!deck) {
      throw new Error('DECK_NOT_FOUND');
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    this.db.prepare(`
      INSERT INTO flashcards (
        id, user_id, subject_id, deck_id, front, back, front_image, back_image,
        last_reviewed_at, next_review_at, interval_days, ease_factor, review_count, lapses, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      deck.subject_id,
      deck.id,
      data.front.trim(),
      data.back.trim(),
      data.frontImage || null,
      data.backImage || null,
      null,
      today,
      0,
      2.5,
      0,
      0,
      'new',
      now,
      now
    );

    return {
      id,
      userId,
      subjectId: deck.subject_id,
      deckId: deck.id,
      front: data.front.trim(),
      back: data.back.trim(),
      frontImage: data.frontImage || null,
      backImage: data.backImage || null,
      lastReviewedAt: null,
      nextReviewAt: today,
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapses: 0,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateCard(userId: string, id: string, data: {
    front?: string;
    back?: string;
    frontImage?: string | null;
    backImage?: string | null;
    deckId?: string;
  }): DbFlashcard | null {
    const existing = this.getCard(userId, id);
    if (!existing) return null;

    let targetDeckId = existing.deckId;
    let targetSubjectId = existing.subjectId;

    if (data.deckId && data.deckId !== existing.deckId) {
      const deck = this.db.prepare(`
        SELECT id, subject_id FROM flashcard_decks WHERE user_id = ? AND id = ?
      `).get(userId, data.deckId) as any;
      if (!deck) throw new Error('DECK_NOT_FOUND');
      targetDeckId = deck.id;
      targetSubjectId = deck.subject_id;
    }

    const now = new Date().toISOString();
    const front = data.front !== undefined ? data.front.trim() : existing.front;
    const back = data.back !== undefined ? data.back.trim() : existing.back;
    const frontImage = data.frontImage !== undefined ? data.frontImage : existing.frontImage;
    const backImage = data.backImage !== undefined ? data.backImage : existing.backImage;

    this.db.prepare(`
      UPDATE flashcards
      SET front = ?, back = ?, front_image = ?, back_image = ?, deck_id = ?, subject_id = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(front, back, frontImage, backImage, targetDeckId, targetSubjectId, now, userId, id);

    return {
      ...existing,
      front,
      back,
      frontImage,
      backImage,
      deckId: targetDeckId,
      subjectId: targetSubjectId,
      updatedAt: now,
    };
  }

  public deleteCard(userId: string, id: string): boolean {
    const res = this.db.prepare(`
      DELETE FROM flashcards WHERE user_id = ? AND id = ?
    `).run(userId, id);
    return Number(res.changes) > 0;
  }

  /**
   * Executa a avaliação da repetição espaçada no padrão Anki / SuperMemo-2
   * Rating: 1 = Errei (Again), 2 = Difícil (Hard), 3 = Bom (Good), 4 = Fácil (Easy)
   */
  public reviewCard(userId: string, cardId: string, rating: FlashcardRating): {
    card: DbFlashcard;
    review: DbFlashcardReview;
  } {
    const card = this.getCard(userId, cardId);
    if (!card) throw new Error('FLASHCARD_NOT_FOUND');

    const previousInterval = card.intervalDays;
    const previousEaseFactor = card.easeFactor;

    let newInterval: number;
    let newEaseFactor = previousEaseFactor;
    let newLapses = card.lapses;
    let newStatus: FlashcardStatus = card.status;
    let newReviewCount = card.reviewCount + 1;

    if (rating === 1) {
      // Errei: lapse, reseta intervalo, diminui facilidade
      newLapses += 1;
      newInterval = 0; // Para revisão imediata / mesmo dia
      newEaseFactor = Math.max(1.3, previousEaseFactor - 0.20);
      newStatus = 'learning';
    } else if (rating === 2) {
      // Difícil: pequeno incremento, diminui levemente facilidade
      if (previousInterval === 0) {
        newInterval = 1;
      } else {
        newInterval = Math.max(1, Math.round(previousInterval * 1.2));
      }
      newEaseFactor = Math.max(1.3, previousEaseFactor - 0.15);
      newStatus = 'review';
    } else if (rating === 3) {
      // Bom: progressão normal do SM-2
      if (previousInterval === 0) {
        newInterval = 1;
      } else if (previousInterval === 1) {
        newInterval = 3;
      } else {
        newInterval = Math.round(previousInterval * previousEaseFactor);
      }
      newStatus = newInterval >= 21 ? 'mastered' : 'review';
    } else {
      // Fácil: grande incremento, aumenta facilidade
      if (previousInterval === 0) {
        newInterval = 4;
      } else if (previousInterval === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(previousInterval * previousEaseFactor * 1.3);
      }
      newEaseFactor = Math.min(3.0, previousEaseFactor + 0.15);
      newStatus = newInterval >= 21 ? 'mastered' : 'review';
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Math.max(0, newInterval));
    const nextReviewAt = targetDate.toISOString().split('T')[0];

    const reviewId = crypto.randomUUID();

    // Transação para consistência
    this.db.prepare(`
      UPDATE flashcards
      SET 
        interval_days = ?,
        ease_factor = ?,
        review_count = ?,
        lapses = ?,
        status = ?,
        last_reviewed_at = ?,
        next_review_at = ?,
        updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(
      newInterval,
      newEaseFactor,
      newReviewCount,
      newLapses,
      newStatus,
      nowIso,
      nextReviewAt,
      nowIso,
      userId,
      cardId
    );

    this.db.prepare(`
      INSERT INTO flashcard_reviews (
        id, user_id, flashcard_id, rating, reviewed_at,
        previous_interval, new_interval, previous_ease_factor, new_ease_factor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reviewId,
      userId,
      cardId,
      rating,
      nowIso,
      previousInterval,
      newInterval,
      previousEaseFactor,
      newEaseFactor
    );

    const updatedCard: DbFlashcard = {
      ...card,
      intervalDays: newInterval,
      easeFactor: newEaseFactor,
      reviewCount: newReviewCount,
      lapses: newLapses,
      status: newStatus,
      lastReviewedAt: nowIso,
      nextReviewAt,
      updatedAt: nowIso,
    };

    const reviewRecord: DbFlashcardReview = {
      id: reviewId,
      userId,
      flashcardId: cardId,
      rating,
      reviewedAt: nowIso,
      previousInterval,
      newInterval,
      previousEaseFactor,
      newEaseFactor,
    };

    return { card: updatedCard, review: reviewRecord };
  }

  public getStudyQueue(userId: string, deckId: string, limit = 50): DbFlashcard[] {
    const today = new Date().toISOString().split('T')[0];
    // Primeiro busca cartões pendentes de revisão ou novos
    const rows = this.db.prepare(`
      SELECT * FROM flashcards
      WHERE user_id = ? AND deck_id = ?
      ORDER BY 
        CASE 
          WHEN next_review_at <= ? THEN 0
          WHEN status = 'new' THEN 1
          ELSE 2 
        END,
        next_review_at ASC,
        created_at ASC
      LIMIT ?
    `).all(userId, deckId, today, limit) as any[];

    return rows.map((r) => this.mapCard(r));
  }

  public getStats(userId: string): {
    totalSubjects: number;
    totalDecks: number;
    totalCards: number;
    dueToday: number;
    newCards: number;
    learningCards: number;
    reviewCards: number;
    masteredCards: number;
    leechCards: number;
  } {
    const today = new Date().toISOString().split('T')[0];

    const subjectsRow = this.db.prepare(`SELECT COUNT(*) as count FROM flashcard_subjects WHERE user_id = ?`).get(userId) as any;
    const decksRow = this.db.prepare(`SELECT COUNT(*) as count FROM flashcard_decks WHERE user_id = ?`).get(userId) as any;
    const cardsRow = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN next_review_at <= ? THEN 1 END) as due_today,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_cards,
        COUNT(CASE WHEN status = 'learning' THEN 1 END) as learning_cards,
        COUNT(CASE WHEN status = 'review' THEN 1 END) as review_cards,
        COUNT(CASE WHEN status = 'mastered' THEN 1 END) as mastered_cards,
        COUNT(CASE WHEN lapses >= 4 THEN 1 END) as leech_cards
      FROM flashcards
      WHERE user_id = ?
    `).get(today, userId) as any;

    return {
      totalSubjects: Number(subjectsRow?.count || 0),
      totalDecks: Number(decksRow?.count || 0),
      totalCards: Number(cardsRow?.total || 0),
      dueToday: Number(cardsRow?.due_today || 0),
      newCards: Number(cardsRow?.new_cards || 0),
      learningCards: Number(cardsRow?.learning_cards || 0),
      reviewCards: Number(cardsRow?.review_cards || 0),
      masteredCards: Number(cardsRow?.mastered_cards || 0),
      leechCards: Number(cardsRow?.leech_cards || 0),
    };
  }

  /**
   * Previsão de carga de revisões (hoje, amanhã, 7 dias, 30 dias) e sanguessugas
   */
  public getForecastStats(userId: string): {
    dueToday: number;
    dueTomorrow: number;
    dueNext7Days: number;
    dueNext30Days: number;
    leechCount: number;
    totalMastered: number;
  } {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const row = this.db.prepare(`
      SELECT
        COUNT(CASE WHEN next_review_at <= date(?1) THEN 1 END) as due_today,
        COUNT(CASE WHEN next_review_at = date(?1, '+1 day') THEN 1 END) as due_tomorrow,
        COUNT(CASE WHEN next_review_at BETWEEN date(?1, '+2 day') AND date(?1, '+7 day') THEN 1 END) as due_7days,
        COUNT(CASE WHEN next_review_at BETWEEN date(?1, '+8 day') AND date(?1, '+30 day') THEN 1 END) as due_30days,
        COUNT(CASE WHEN lapses >= 4 THEN 1 END) as leech_count,
        COUNT(CASE WHEN status = 'mastered' THEN 1 END) as total_mastered
      FROM flashcards
      WHERE user_id = ?2
    `).get(todayStr, userId) as any;

    return {
      dueToday: Number(row?.due_today || 0),
      dueTomorrow: Number(row?.due_tomorrow || 0),
      dueNext7Days: Number(row?.due_7days || 0),
      dueNext30Days: Number(row?.due_30days || 0),
      leechCount: Number(row?.leech_count || 0),
      totalMastered: Number(row?.total_mastered || 0),
    };
  }

  /**
   * Histórico de revisões para Heatmap de constância (últimos N dias)
   */
  public getHeatmapStats(userId: string, days = 30): Array<{ date: string; count: number }> {
    const rows = this.db.prepare(`
      SELECT 
        date(reviewed_at) as review_date,
        COUNT(*) as review_count
      FROM flashcard_reviews
      WHERE user_id = ? AND reviewed_at >= datetime('now', '-' || ? || ' days')
      GROUP BY date(reviewed_at)
      ORDER BY review_date ASC
    `).all(userId, Math.max(1, Math.min(days, 365))) as any[];

    return rows.map((r) => ({
      date: r.review_date,
      count: Number(r.review_count || 0),
    }));
  }

  /**
   * Criação atômica de cartões em lote para importação (CSV/Texto)
   */
  public createCardsBatch(
    userId: string,
    deckId: string,
    items: Array<{ front: string; back: string; frontImage?: string | null; backImage?: string | null }>
  ): DbFlashcard[] {
    const deck = this.db.prepare(`
      SELECT id, subject_id FROM flashcard_decks WHERE user_id = ? AND id = ?
    `).get(userId, deckId) as any;

    if (!deck) {
      throw new Error('DECK_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const createdCards: DbFlashcard[] = [];

    const insertStmt = this.db.prepare(`
      INSERT INTO flashcards (
        id, user_id, subject_id, deck_id, front, back, front_image, back_image,
        last_reviewed_at, next_review_at, interval_days, ease_factor, review_count, lapses, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      for (const item of items) {
        const id = crypto.randomUUID();
        const front = String(item.front || '').trim();
        const back = String(item.back || '').trim();
        if (!front && !item.frontImage) continue;

        insertStmt.run(
          id,
          userId,
          deck.subject_id,
          deck.id,
          front || '(Imagem)',
          back || '(Imagem)',
          item.frontImage || null,
          item.backImage || null,
          null,
          today,
          0,
          2.5,
          0,
          0,
          'new',
          now,
          now
        );

        createdCards.push({
          id,
          userId,
          subjectId: deck.subject_id,
          deckId: deck.id,
          front: front || '(Imagem)',
          back: back || '(Imagem)',
          frontImage: item.frontImage || null,
          backImage: item.backImage || null,
          lastReviewedAt: null,
          nextReviewAt: today,
          intervalDays: 0,
          easeFactor: 2.5,
          reviewCount: 0,
          lapses: 0,
          status: 'new',
          createdAt: now,
          updatedAt: now,
        });
      }
      this.db.exec('COMMIT;');
      return createdCards;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  /**
   * Fila de estudo consolidada de todos os baralhos de uma disciplina
   */
  public getSubjectStudyQueue(userId: string, subjectId: string, limit = 50): DbFlashcard[] {
    const subject = this.db.prepare(`
      SELECT id FROM flashcard_subjects WHERE user_id = ? AND id = ?
    `).get(userId, subjectId) as any;

    if (!subject) {
      throw new Error('SUBJECT_NOT_FOUND');
    }

    const today = new Date().toISOString().split('T')[0];
    const rows = this.db.prepare(`
      SELECT c.* FROM flashcards c
      JOIN flashcard_decks d ON d.id = c.deck_id AND d.user_id = c.user_id
      WHERE c.user_id = ? AND d.subject_id = ?
      ORDER BY 
        CASE 
          WHEN c.next_review_at <= ? THEN 0
          WHEN c.status = 'new' THEN 1
          ELSE 2 
        END,
        c.next_review_at ASC,
        c.created_at ASC
      LIMIT ?
    `).all(userId, subjectId, today, limit) as any[];

    return rows.map((r) => this.mapCard(r));
  }

  /**
   * Migração de dados legados de student_flashcard_state para tabelas normalizadas
   */
  public migrateLegacyState(userId: string): { migratedDecks: number; migratedCards: number } {
    const row = this.db.prepare(`
      SELECT decks_json, cards_json FROM student_flashcard_state WHERE user_id = ?
    `).get(userId) as any;

    if (!row) return { migratedDecks: 0, migratedCards: 0 };

    let rawDecks: any[] = [];
    let rawCards: any[] = [];
    try { rawDecks = JSON.parse(row.decks_json || '[]'); } catch {}
    try { rawCards = JSON.parse(row.cards_json || '[]'); } catch {}

    if (!Array.isArray(rawDecks) || rawDecks.length === 0) {
      return { migratedDecks: 0, migratedCards: 0 };
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    let migratedDecks = 0;
    let migratedCards = 0;

    // Agrupa decks por matéria ou cria a disciplina 'Geral'
    const subjectMap = new Map<string, string>();

    for (const d of rawDecks) {
      const subjectName = String(d.subject || 'Geral').trim() || 'Geral';
      let subjectId = subjectMap.get(subjectName);

      if (!subjectId) {
        // Verifica se disciplina com esse nome já existe
        const existingSub = this.db.prepare(`
          SELECT id FROM flashcard_subjects WHERE user_id = ? AND name = ? COLLATE NOCASE
        `).get(userId, subjectName) as any;

        if (existingSub) {
          subjectId = existingSub.id;
        } else {
          subjectId = crypto.randomUUID();
          this.db.prepare(`
            INSERT INTO flashcard_subjects (id, user_id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(subjectId, userId, subjectName, `Disciplina importada automaticamente`, now, now);
        }
        subjectMap.set(subjectName, subjectId);
      }

      // Verifica se o deck já existe
      const deckName = String(d.title || d.name || 'Baralho sem título').trim();
      const existingDeck = this.db.prepare(`
        SELECT id FROM flashcard_decks WHERE user_id = ? AND (id = ? OR (subject_id = ? AND name = ? COLLATE NOCASE))
      `).get(userId, d.id, subjectId, deckName) as any;

      let targetDeckId = existingDeck ? existingDeck.id : d.id;
      if (!existingDeck) {
        this.db.prepare(`
          INSERT INTO flashcard_decks (id, user_id, subject_id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(targetDeckId, userId, subjectId, deckName, d.description || null, d.createdAt || now, now);
        migratedDecks++;
      }

      // Migra cartões deste deck
      const deckCards = rawCards.filter((c) => c.deckId === d.id);
      for (const c of deckCards) {
        const existingCard = this.db.prepare(`
          SELECT id FROM flashcards WHERE user_id = ? AND id = ?
        `).get(userId, c.id) as any;

        if (!existingCard) {
          const front = String(c.question || c.front || '').trim();
          const back = String(c.answer || c.back || '').trim();
          if (!front && !c.questionImage) continue;

          this.db.prepare(`
            INSERT INTO flashcards (
              id, user_id, subject_id, deck_id, front, back, front_image, back_image,
              last_reviewed_at, next_review_at, interval_days, ease_factor, review_count, lapses, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            c.id || crypto.randomUUID(),
            userId,
            subjectId,
            targetDeckId,
            front || '(Imagem)',
            back || '(Imagem)',
            c.questionImage || c.frontImage || null,
            c.answerImage || c.backImage || null,
            c.lastReviewedAt || null,
            c.nextReviewDate || c.nextReviewAt || today,
            Number(c.intervalDays || 0),
            2.5,
            Number(c.repetitions || 0),
            0,
            c.state === 'mastered' ? 'mastered' : c.state === 'learning' ? 'learning' : c.state === 'review' ? 'review' : 'new',
            c.createdAt || now,
            now
          );
          migratedCards++;
        }
      }
    }

    return { migratedDecks, migratedCards };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private mapDeckWithStats(r: any): DeckWithStats {
    return {
      id: r.id,
      userId: r.user_id,
      subjectId: r.subject_id,
      subjectName: r.subject_name || undefined,
      name: r.name,
      description: r.description || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      cardCount: Number(r.card_count || 0),
      dueCount: Number(r.due_count || 0),
      newCount: Number(r.new_count || 0),
      learningCount: Number(r.learning_count || 0),
      reviewCount: Number(r.review_count || 0),
      masteredCount: Number(r.mastered_count || 0),
    };
  }

  private mapCard(r: any): DbFlashcard {
    return {
      id: r.id,
      userId: r.user_id,
      subjectId: r.subject_id,
      deckId: r.deck_id,
      front: r.front,
      back: r.back,
      frontImage: r.front_image || null,
      backImage: r.back_image || null,
      lastReviewedAt: r.last_reviewed_at || null,
      nextReviewAt: r.next_review_at,
      intervalDays: Number(r.interval_days || 0),
      easeFactor: Number(r.ease_factor || 2.5),
      reviewCount: Number(r.review_count || 0),
      lapses: Number(r.lapses || 0),
      status: r.status as FlashcardStatus,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
