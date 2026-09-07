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
  OrderStatus,
  RefundRequestStatus,
  UserRole,
  UserStatus,
  PaymentStatus,
} from './schema';

export class UserRepository {
  constructor(private db: DatabaseSync) {}

  public create(data: {
    email: string;
    username: string;
    passwordHash: string;
    role?: UserRole;
    status?: UserStatus;
  }): DbUser {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const role = data.role || 'cadet';
    const status = data.status || 'active';

    this.db
      .prepare(
        `INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.email.toLowerCase().trim(), data.username.toLowerCase().trim(), data.passwordHash, role, status, now, now);

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

  private mapUser(row: any): DbUser {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role as UserRole,
      status: row.status as UserStatus,
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
         SET is_used = 1, used_at = ?, used_by_user_id = ?
         WHERE token_hash = ? AND is_used = 0 AND expires_at > ?`
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

  public request(data: {
    orderId: string;
    userId?: string | null;
    reason: string;
    amount: number;
  }): DbRefundRequest {
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

export class AuditRepository {
  constructor(private db: DatabaseSync) {}

  public log(data: {
    action: string;
    actor: string;
    resource: string;
    status: 'SUCCESS' | 'FAILED' | 'WARNING';
    ip?: string | null;
    userAgent?: string | null;
    userId?: string | null;
    details?: Record<string, any> | null;
  }): DbAuditEvent {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Sanitização rigorosa: nunca permitir senhas, tokens, cookies, códigos TOTP ou segredos
    let safeDetails: Record<string, any> | null = null;
    if (data.details && typeof data.details === 'object') {
      safeDetails = { ...data.details };
      const sensitiveKeys = [
        'password',
        'currentpassword',
        'newpassword',
        'token',
        'refreshtoken',
        'accesstoken',
        'secret',
        'totp',
        'code',
        'cookie',
        'authorization',
        'totpsecret',
        'recoverycode',
        'backupcode',
      ];
      for (const key of Object.keys(safeDetails)) {
        if (sensitiveKeys.includes(key.toLowerCase())) {
          delete safeDetails[key];
        }
      }
    }

    const detailsJson = safeDetails ? JSON.stringify(safeDetails) : null;

    this.db
      .prepare(
        `INSERT INTO audit_events (id, action, actor, resource, status, ip, user_agent, user_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.action,
        data.actor,
        data.resource,
        data.status,
        data.ip ?? null,
        data.userAgent ?? null,
        data.userId ?? null,
        detailsJson,
        now
      );

    return {
      id,
      action: data.action,
      actor: data.actor,
      resource: data.resource,
      status: data.status,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
      userId: data.userId ?? null,
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

    if (options.ip) {
      whereClauses.push('ip LIKE ?');
      params.push(`%${options.ip}%`);
    }

    if (options.search) {
      whereClauses.push('(action LIKE ? OR actor LIKE ? OR ip LIKE ? OR user_agent LIKE ? OR resource LIKE ? OR details_json LIKE ?)');
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
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
        `SELECT id, action, actor, resource, status, ip, user_agent, user_id, details_json, created_at
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
      resource: row.resource,
      status: row.status,
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
}

export class PasswordResetRepository {
  constructor(private db: DatabaseSync) {}

  public createResetCode(userId: string, expiresInMinutes: number = 15): { code: string; record: DbPasswordReset } {
    const id = crypto.randomUUID();
    // 6-digit numeric recovery code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();

    this.db
      .prepare(
        `INSERT INTO password_resets (id, user_id, code_hash, expires_at, is_used, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`
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
        createdAt,
      },
    };
  }

  public verifyAndConsume(userId: string, code: string): boolean {
    const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
    const now = new Date().toISOString();

    const result = this.db
      .prepare(
        `UPDATE password_resets
         SET is_used = 1, used_at = ?
         WHERE user_id = ? AND code_hash = ? AND is_used = 0 AND expires_at > ?`
      )
      .run(now, userId, codeHash, now);

    return result.changes > 0;
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
        `INSERT INTO sessions (id, user_id, token_hash, role, ip, user_agent, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.userId, tokenHash, data.role, data.ip ?? null, data.userAgent ?? null, expiresAt, createdAt);

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
                u.id AS u_id, u.email, u.username, u.password_hash, u.role AS u_role, u.status,
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
      },
      user: {
        id: row.u_id,
        email: row.email,
        username: row.username,
        passwordHash: row.password_hash,
        role: row.u_role as UserRole,
        status: row.status as UserStatus,
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
}

