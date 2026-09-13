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

export type ExamPaperStatus = 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR' | 'NEEDS_REVIEW';
export type ExamPublicationStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'REJECTED';
export type QuestionReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ExamDifficulty = 'Fácil' | 'Médio' | 'Difícil';

export interface DbExamPaper {
  id: string;
  userId: string;
  title: string;
  institution: string;
  examYear: number;
  fileId?: string | null;
  totalQuestions: number;
  status: ExamPaperStatus;
  publicationStatus: ExamPublicationStatus;
  primaryDisciplinesJson?: string | null;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamOption {
  letter: 'A' | 'B' | 'C' | 'D' | 'E';
  text: string;
}

export interface AISolutionStep {
  stepNumber: number;
  title: string;
  explanation: string;
  latex?: string;
}

export interface AISolutionPayload {
  selectedOption: 'A' | 'B' | 'C' | 'D' | 'E';
  steps: AISolutionStep[];
  concepts: string[];
  explanationSummary: string;
  calculatedDifficulty: ExamDifficulty;
  confidencePercent: number;
  reviewedByAI?: boolean;
}

export interface DbExamQuestion {
  id: string;
  examId: string;
  userId: string;
  questionNumber: number;
  statement: string;
  supportText?: string | null;
  optionsJson: string; // serialized ExamOption[]
  correctOption?: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  discipline: string;
  topic: string;
  subtopic: string;
  difficulty: ExamDifficulty;
  difficultyScore: number;
  confidenceScore: number;
  imagesJson?: string | null; // serialized string[] of URLs/Paths
  aiSolutionJson?: string | null; // serialized AISolutionPayload
  status: string;
  reviewStatus: QuestionReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExamJobType = 'EXTRACTION' | 'AI_SOLVE';
export type ExamJobStatus = 'queued' | 'processing' | 'reviewing' | 'completed' | 'failed';

export interface DbExamJob {
  id: string;
  userId: string;
  examId?: string | null;
  jobType: ExamJobType;
  status: ExamJobStatus;
  progress: number;
  totalItems: number;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
  resultSummaryJson?: string | null;
  payloadJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuestionSegmentSource = 'pdf_text' | 'ocr' | 'layout' | 'ai_fallback' | 'manual';

export interface DbQuestionSegment {
  id: string;
  questionId: string;
  examId: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  orderNum: number;
  confidence: number;
  source: QuestionSegmentSource;
  createdAt: string;
  updatedAt: string;
}

export type QuestionAssetType = 'original_crop' | 'thumbnail' | 'support_crop';

export interface DbQuestionAsset {
  id: string;
  questionId: string;
  segmentId?: string | null;
  assetType: QuestionAssetType;
  filePath: string;
  publicUrl?: string | null;
  width: number;
  height: number;
  format: string; // 'webp', 'png', etc.
  dpi: number;
  createdAt: string;
}

export interface DbSupportMaterial {
  id: string;
  examId: string;
  title: string;
  contentText?: string | null;
  page: number;
  bboxJson?: string | null; // { x, y, width, height }
  assetPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbQuestionAuditLog {
  id: string;
  questionId: string;
  detector: string;
  confidence: number;
  isManualReview: boolean;
  userId?: string | null;
  previousBboxJson?: string | null;
  newBboxJson?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface DbStudySession {
  id: string;
  userId: string;
  subjectId: string;
  subjectName: string;
  topic?: string | null;
  dateStr: string; // YYYY-MM-DD
  durationSeconds: number;
  startedAt?: string | null;
  endedAt: string;
  notes?: string | null;
  createdAt: string;
}

export interface DayStudySummary {
  dateStr: string; // YYYY-MM-DD
  totalSeconds: number;
  totalHours: number;
  sessionsCount: number;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    durationSeconds: number;
    durationHours: number;
  }>;
}

export type BoardIntelligenceProfileStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type BoardIntelligenceExamStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED';
export type BoardProfileVersionStatus = 'DRAFT' | 'ACTIVE' | 'DISCARDED' | 'SUPERSEDED';
export type BoardIntelligenceJobStatus =
  | 'QUEUED'
  | 'EXTRACTING'
  | 'CLASSIFYING'
  | 'ANALYZING'
  | 'AGGREGATING'
  | 'GENERATING_PROFILE'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'FAILED';

export interface DbBoardIntelligenceProfile {
  id: string;
  name: string;
  institution: string;
  board: string;
  contest?: string | null;
  roleName?: string | null;
  periodStart?: number | null;
  periodEnd?: number | null;
  description?: string | null;
  status: BoardIntelligenceProfileStatus;
  activeVersion: number;
  examCount: number;
  questionCount: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbBoardIntelligenceExam {
  id: string;
  profileId: string;
  examPaperId: string;
  status: BoardIntelligenceExamStatus;
  name: string;
  examYear: number;
  board?: string | null;
  roleName?: string | null;
  phase?: string | null;
  discipline?: string | null;
  examType?: string | null;
  officialAnswerKeyJson?: string | null;
  notes?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  rejectedByUserId?: string | null;
  rejectedAt?: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbBoardQuestionAnalysis {
  id: string;
  profileId: string;
  examId: string;
  questionId: string;
  questionHash: string;
  promptVersion: string;
  provider: string;
  model: string;
  modelVersion: string;
  taxonomyJson: string;
  metricsJson: string;
  confidence: number;
  status: 'READY' | 'LOW_CONFIDENCE' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface DbBoardProfileSnapshot {
  id: string;
  profileId: string;
  sourceExamIdsJson: string;
  sourceQuestionIdsJson: string;
  sourceAnalysisIdsJson: string;
  statsJson: string;
  algorithmVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  modelVersion: string;
  createdByUserId: string;
  createdAt: string;
}

export interface DbBoardProfileVersion {
  id: string;
  profileId: string;
  version: number;
  status: BoardProfileVersionStatus;
  snapshotId: string;
  profileJson: string;
  changeSummaryJson: string;
  styleSummary: string;
  confidence: number;
  generatedByUserId: string;
  publishedByUserId?: string | null;
  publishedAt?: string | null;
  restoredFromVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DbSystemIntegration {
  id: string;
  encryptedPayload: string;
  updatedAt: string;
}

export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences' | 'ai_processing' | 'terms_of_use' | 'privacy_policy';
export type ConsentStatus = 'granted' | 'revoked';

export interface DbConsentRecord {
  id: string;
  userId?: string | null;
  category: ConsentCategory;
  policyVersion: string;
  termsVersion?: string | null;
  status: ConsentStatus;
  ipHash?: string | null;
  userAgent?: string | null;
  grantedAt: string;
  revokedAt?: string | null;
}

export type PrivacyRequestType =
  | 'access'
  | 'rectification'
  | 'deletion'
  | 'export'
  | 'information'
  | 'revocation';

export type PrivacyRequestStatus =
  | 'pending'
  | 'under_review'
  | 'completed'
  | 'rejected';

export interface DbPrivacyRequest {
  id: string;
  requestCode: string;
  userId?: string | null;
  email: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  details?: string | null;
  adminNotes?: string | null;
  processedByUserId?: string | null;
  createdAt: string;
  processedAt?: string | null;
  updatedAt: string;
}
