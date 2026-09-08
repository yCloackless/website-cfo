/**
 * CFO CBMERJ - Data Foundation & Models
 * Schema Types and Invariant Constants
 */

export type UserRole = 'cadet' | 'admin' | 'support';
export type UserStatus = 'active' | 'suspended' | 'pending_activation';

export interface DbUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  canAccessNotion: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DbProfile {
  id: string;
  userId: string;
  fullName: string;
  phone?: string | null;
  targetExam?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  amount: number; // in minor units / cents (ex: 19700 = R$ 197,00)
  currency: string; // ISO 4217, ex: 'BRL'
  isActive: boolean;
  featuresJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded'
  | 'charged_back';

export type PaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'boleto'
  | 'free_grant'
  | 'manual';

export interface DbOrder {
  id: string;
  publicOrderId: string;
  userId?: string | null; // Optional before user account activation
  customerEmail: string;
  productId: string;
  amount: number; // Server-side validated price in cents
  currency: string; // 'BRL'
  paymentProvider: string; // 'mercadopago', 'manual', etc.
  externalPaymentId?: string | null;
  paymentMethod?: PaymentMethod | null;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string | null;
  updatedAt: string;
}

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back';

export interface DbPayment {
  id: string;
  orderId: string;
  provider: string; // 'mercadopago', etc.
  externalPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawPayloadJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EntitlementStatus = 'active' | 'revoked' | 'expired';

export interface DbEntitlement {
  id: string;
  userId: string;
  orderId: string;
  productId: string;
  status: EntitlementStatus;
  grantedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}

export interface DbActivationToken {
  id: string;
  orderId: string;
  tokenHash: string; // SHA-256 hash of token for safe storage
  customerEmail: string;
  isUsed: boolean;
  usedAt?: string | null;
  usedByUserId?: string | null;
  expiresAt: string;
  createdAt: string;
}

export type RefundRequestStatus =
  | 'requested'
  | 'under_review'
  | 'approved_by_admin'
  | 'rejected'
  | 'processing'
  | 'refunded'
  | 'failed'
  | 'cancelled';

export interface DbRefundRequest {
  id: string;
  orderId: string;
  userId?: string | null;
  reason: string;
  amount: number;
  status: RefundRequestStatus;
  adminNotes?: string | null;
  reviewedByAdminId?: string | null;
  reviewedAt?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbAuditEvent {
  id: string;
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
  detailsJson?: string | null;
  createdAt: string;
}

export interface DbPasswordReset {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string | null;
  failedAttempts?: number;
  createdAt: string;
}

export interface DbSession {
  id: string;
  userId: string;
  tokenHash: string;
  role: UserRole;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  impersonatedByUserId?: string | null;
  parentSessionId?: string | null;
}

export interface DbRecoveryCode {
  id: string;
  userId: string;
  codeHash: string; // SHA-256 hash seguro do código de recuperação
  isUsed: boolean;
  usedAt?: string | null;
  createdAt: string;
}

export interface DbCadetSessionLock {
  userId: string;
  activeSessionId?: string | null;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbTemporarySourceBlock {
  id: string;
  ip: string;
  userId?: string | null;
  reason: string;
  lockedUntil: string;
  createdAt: string;
}

export type SecurityNotificationType = 'CADET_SECURITY_ALERT' | 'SYSTEM_ALERT' | 'INFO';

export interface DbSecurityNotification {
  id: string;
  userId?: string | null;
  type: SecurityNotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string | null;
  metadataJson?: string | null;
  createdAt: string;
}

export type UploadScanStatus =
  | 'UPLOADED'
  | 'QUARANTINED'
  | 'SCANNING'
  | 'CLEAN'
  | 'REJECTED'
  | 'PROCESSING'
  | 'READY';

export interface DbUploadedFile {
  id: string;
  userId: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  status: UploadScanStatus;
  scanDetailsJson?: string | null;
  createdAt: string;
  updatedAt: string;
}
