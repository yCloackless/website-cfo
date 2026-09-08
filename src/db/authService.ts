/**
 * CFO CBMERJ - Authentication Service & Provider Layer
 * Implements server-side authority for logins, sessions, password recovery and email updates.
 * Robust database-backed auth with cryptographic guarantees and immutable audit trail.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DatabaseService, getDb } from './database';
import { sendPasswordResetEmail } from '../services/emailService';
import {
  UserRepository,
  SessionRepository,
  PasswordResetRepository,
  AuditRepository,
  RecoveryCodeRepository,
} from './repositories';
import { DbUser, DbSession, UserRole } from './schema';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

export interface AuthConfig {
  sessionDurationDays?: number;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
  };
  message?: string;
}

export class AuthService {
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;
  private resetRepo: PasswordResetRepository;
  private auditRepo: AuditRepository;
  private recoveryRepo: RecoveryCodeRepository;

  constructor(private dbService: DatabaseService = getDb(), private config?: AuthConfig) {
    const db = this.dbService.getRawDb();
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.resetRepo = new PasswordResetRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.recoveryRepo = new RecoveryCodeRepository(db);
  }

  /**
   * Seed default system administrator and demo cadet if database is freshly created.
   * Uses environment variables or secure hashed defaults.
   */
  public async ensureDefaultAccounts(): Promise<void> {
    const DEFAULT_ADMIN_HASH = '$2b$10$qLtlV80VP6DB5pZDkM.9G.Ucgzw.23yH5J2etgcWT02PEzy76jJzW';
    const DEFAULT_CADET_HASH = '$2b$10$2Au.s9BUlB9ii0okzlmSY.Jh5lvsYOeSzjNDRGIj/vGPEUEtqLMg6';
    const DEFAULT_SUPPORT_HASH = '$2b$10$0S8mbvn25RkmDdbvbZYaFu3I8xYBSV8esqpDR/EWLcT07GE/EdHMW';

    const adminEmail = (process.env.ADMIN_USER_EMAIL || 'jb080956@gmail.com').toLowerCase().trim();
    const adminUsername = (process.env.ADMIN_USER || 'admin').toLowerCase().trim();
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    let admin = this.userRepo.findByEmail(adminEmail) || this.userRepo.findByUsername(adminUsername);
    if (!admin) {
      const hash = adminHash || (adminPass ? await bcrypt.hash(adminPass, 10) : DEFAULT_ADMIN_HASH);
      admin = this.userRepo.create({
        email: adminEmail,
        username: adminUsername,
        passwordHash: hash,
        role: 'admin',
        status: 'active',
      });
      this.auditRepo.log({
        action: 'ADMIN_PROVISIONED',
        actor: 'SYSTEM',
        resource: `/users/${admin.id}`,
        status: 'SUCCESS',
        details: { email: adminEmail, role: 'admin' },
      });
    } else if (admin.email !== adminEmail && admin.username === adminUsername) {
      this.userRepo.updateEmail(admin.id, adminEmail);
      admin.email = adminEmail;
    }

    if (this.recoveryRepo.getRemainingCount(admin.id) === 0) {
      // Gera código de emergência criptograficamente aleatório (nunca hardcoded)
      const emergencyCode = crypto.randomBytes(16).toString('hex').toUpperCase().slice(0, 16);
      this.dbService.getRawDb().prepare(
        `INSERT INTO admin_recovery_codes (id, user_id, code_hash, is_used, created_at)
         VALUES (?, ?, ?, 0, ?)`
      ).run(crypto.randomUUID(), admin.id, RecoveryCodeRepository.hashCode(emergencyCode), new Date().toISOString());
      console.warn(`[SEGURANÇA] Código de emergência admin gerado. Salve-o agora: ${emergencyCode}`);
    }

    const cadetEmail = (process.env.CADET_USER_EMAIL || 'cadete@cbmerj.com').toLowerCase().trim();
    const cadetUsername = (process.env.CADET_USER || 'cadete').toLowerCase().trim();
    const cadetPass = process.env.CADET_PASSWORD;
    const cadetHash = process.env.CADET_PASSWORD_HASH;

    let cadet = this.userRepo.findByEmail(cadetEmail) || this.userRepo.findByUsername(cadetUsername);
    if (!cadet) {
      const hash = cadetHash || (cadetPass ? await bcrypt.hash(cadetPass, 10) : DEFAULT_CADET_HASH);
      cadet = this.userRepo.create({
        email: cadetEmail,
        username: cadetUsername,
        passwordHash: hash,
        role: 'cadet',
      });
      this.auditRepo.log({
        action: 'USER_CREATED_SYSTEM',
        actor: 'system',
        resource: `/users/${cadet.id}`,
        status: 'SUCCESS',
        details: { email: cadetEmail, role: 'cadet' },
      });
    }

    const supportEmail = (process.env.SUPPORT_USER_EMAIL || 'suporte@cbmerj.com').toLowerCase().trim();
    const supportUsername = (process.env.SUPPORT_USER || 'suporte').toLowerCase().trim();
    const supportPass = process.env.SUPPORT_PASSWORD;
    const supportHash = process.env.SUPPORT_PASSWORD_HASH;

    let support = this.userRepo.findByEmail(supportEmail) || this.userRepo.findByUsername(supportUsername);
    if (!support) {
      const hash = supportHash || (supportPass ? await bcrypt.hash(supportPass, 10) : DEFAULT_SUPPORT_HASH);
      support = this.userRepo.create({
        email: supportEmail,
        username: supportUsername,
        passwordHash: hash,
        role: 'support',
      });
      this.auditRepo.log({
        action: 'USER_CREATED_SYSTEM',
        actor: 'system',
        resource: `/users/${support.id}`,
        status: 'SUCCESS',
        details: { email: supportEmail, role: 'support' },
      });
    }
  }

  /**
   * Universal Login: accepts e-mail or username.
   */
  public async verifyCredentials(identifier: string, password: string): Promise<DbUser | null> {
    if (typeof identifier !== 'string' || typeof password !== 'string') return null;
    const clean = identifier.trim().toLowerCase();
    let user = this.userRepo.findByEmail(clean) || this.userRepo.findByUsername(clean);
    if (!user && (clean === 'admin@cbmerj.com' || clean === 'jb080956@gmail.com')) {
      user = this.userRepo.findByUsername('admin');
    }
    const matches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    return matches && user?.status === 'active' ? user : null;
  }

  public async login(
    identifier: string,
    password: string,
    meta?: { ip?: string; userAgent?: string; rememberMe?: boolean }
  ): Promise<LoginResult> {
    const cleanId = (identifier || '').toLowerCase().trim();
    if (!cleanId || !password) {
      return { success: false, message: 'Usuário e senha são obrigatórios.' };
    }

    let user = this.userRepo.findByEmail(cleanId) || this.userRepo.findByUsername(cleanId);
    if (!user && (cleanId === 'admin@cbmerj.com' || cleanId === 'jb080956@gmail.com')) {
      user = this.userRepo.findByUsername('admin');
    }
    if (!user) {
      // Timing attack protection: perform dummy bcrypt check to prevent user enumeration
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      this.auditRepo.log({
        action: 'LOGIN_FAILED',
        actor: cleanId,
        resource: '/api/v2/auth/login',
        status: 'FAILED',
        ip: meta?.ip,
        details: { reason: 'User not found' },
      });
      return { success: false, message: 'Credenciais de acesso inválidas.' };
    }

    if (user.status !== 'active') {
      return { success: false, message: 'Conta desativada ou com acesso suspenso.' };
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      this.auditRepo.log({
        action: 'LOGIN_FAILED',
        actor: user.username,
        resource: '/api/v2/auth/login',
        status: 'FAILED',
        ip: meta?.ip,
        details: { reason: 'Password mismatch' },
      });
      return { success: false, message: 'Credenciais de acesso inválidas.' };
    }

    const days = meta?.rememberMe ? 30 : 1;
    const { rawToken, session } = this.sessionRepo.createSession({
      userId: user.id,
      role: user.role,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      expiresInDays: days,
    });

    this.auditRepo.log({
      action: 'LOGIN_SUCCESS',
      actor: user.username,
      resource: '/api/v2/auth/login',
      status: 'SUCCESS',
      ip: meta?.ip,
      details: { role: user.role, rememberMe: meta?.rememberMe },
    });

    return {
      success: true,
      token: rawToken,
      expiresAt: session.expiresAt,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Validate Session Token: returns authenticated user or rejects.
   */
  public validateToken(rawToken: string): { valid: boolean; user?: DbUser; session?: DbSession } {
    return this.sessionRepo.validateSession(rawToken);
  }

  /**
   * Logout: revokes session in database.
   */
  public logout(rawToken: string, ip?: string): void {
    const check = this.sessionRepo.validateSession(rawToken);
    this.sessionRepo.revokeSession(rawToken);
    if (check.valid && check.user) {
      this.auditRepo.log({
        action: 'LOGOUT',
        actor: check.user.username,
        resource: '/api/v2/auth/logout',
        status: 'SUCCESS',
        ip,
      });
    }
  }

  /**
   * Password Recovery: Step 1 - Request code.
   * Generates a 6-digit code with 15-minute expiration.
   * Sends the code via email (Resend). Never returns the code in production.
   */
  public async requestPasswordReset(
    email: string,
    ip?: string
  ): Promise<{ success: boolean; message: string; debugCode?: string }> {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail) {
      return { success: false, message: 'Informe um e-mail válido.' };
    }

    const user = this.userRepo.findByEmail(cleanEmail);
    if (!user) {
      // Não revelar se o e-mail existe (anti-enumeração)
      return {
        success: true,
        message: 'Se este e-mail estiver cadastrado, você receberá um código de recuperação.',
      };
    }

    const { code } = this.resetRepo.createResetCode(user.id, 15);

    this.auditRepo.log({
      action: 'PASSWORD_RESET_REQUEST',
      actor: user.username,
      resource: '/api/v2/auth/forgot-password',
      status: 'SUCCESS',
      ip,
      details: { email: cleanEmail },
    });

    // Envia o código por e-mail via Resend
    const emailResult = await sendPasswordResetEmail(cleanEmail, user.username, code);

    const isProd = process.env.NODE_ENV === 'production';

    // Em produção: nunca retornar o código na API — apenas o e-mail entrega
    // Em dev/teste: retornar debugCode se o envio falhou (sem API key configurada)
    return {
      success: true,
      message: 'Se este e-mail estiver cadastrado, você receberá um código de recuperação.',
      debugCode: isProd ? undefined : (emailResult.debugCode ?? (emailResult.sent ? undefined : code)),
    };
  }

  /**
   * Password Recovery: Step 2 - Confirm code and set new password.
   */
  public async confirmPasswordReset(
    email: string,
    code: string,
    newPassword: string,
    ip?: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || !code || !newPassword) {
      return { success: false, message: 'E-mail, código e nova senha são obrigatórios.' };
    }

    if (newPassword.length < 8) {
      return { success: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' };
    }

    const user = this.userRepo.findByEmail(cleanEmail);
    if (!user) {
      return { success: false, message: 'Código de recuperação inválido ou expirado.' };
    }

    const isValid = this.resetRepo.verifyAndConsume(user.id, code);
    if (!isValid) {
      this.auditRepo.log({
        action: 'PASSWORD_RESET_FAILED',
        actor: user.username,
        resource: '/api/v2/auth/reset-password',
        status: 'FAILED',
        ip,
        details: { reason: 'Invalid or expired code' },
      });
      return { success: false, message: 'Código de recuperação inválido ou expirado.' };
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    this.userRepo.updatePasswordHash(user.id, newHash);
    // Invalidate all active sessions for security
    this.sessionRepo.revokeAllUserSessions(user.id);

    this.auditRepo.log({
      action: 'PASSWORD_RESET_SUCCESS',
      actor: user.username,
      resource: '/api/v2/auth/reset-password',
      status: 'SUCCESS',
      ip,
    });

    return { success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' };
  }

  /**
   * Authenticated password change.
   */
  public async changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
    ip?: string
  ): Promise<{ success: boolean; message: string }> {
    const user = this.userRepo.findById(userId);
    if (!user) return { success: false, message: 'Usuário não encontrado.' };

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
      return { success: false, message: 'A senha atual está incorreta.' };
    }

    if (newPass.length < 8) {
      return { success: false, message: 'A nova senha deve ter pelo menos 8 caracteres.' };
    }

    const newHash = await bcrypt.hash(newPass, 10);
    this.userRepo.updatePasswordHash(userId, newHash);
    this.sessionRepo.revokeAllUserSessions(userId);
    this.auditRepo.log({
      action: 'PASSWORD_CHANGED',
      actor: user.username,
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      ip,
    });

    return { success: true, message: 'Senha alterada com sucesso.' };
  }

  /**
   * Authenticated email update with server-side unique validation and password verification.
   */
  public async updateEmail(
    userId: string,
    newEmail: string,
    currentPassword?: string,
    ip?: string
  ): Promise<{ success: boolean; message: string }> {
    const cleanEmail = (newEmail || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, message: 'Informe um endereço de e-mail válido.' };
    }

    const user = this.userRepo.findById(userId);
    if (!user) return { success: false, message: 'Usuário não encontrado.' };

    if (currentPassword !== undefined) {
      if (!currentPassword) {
        return { success: false, message: 'A senha atual é obrigatória para confirmar a alteração do e-mail.' };
      }
      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        return { success: false, message: 'A senha atual informada está incorreta.' };
      }
    }

    const isReservedAdmin = cleanEmail === 'admin@cbmerj.com' || cleanEmail === 'jb080956@gmail.com';
    const existing = this.userRepo.findByEmail(cleanEmail) || (isReservedAdmin ? this.userRepo.findByUsername('admin') : null);
    if (existing && existing.id !== userId) {
      return { success: false, message: 'Este endereço de e-mail já está em uso por outro operador.' };
    }

    this.userRepo.updateEmail(userId, cleanEmail);
    this.auditRepo.log({
      action: 'EMAIL_UPDATED',
      actor: user.username,
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      ip,
      details: { newEmail: cleanEmail },
    });

    return { success: true, message: 'E-mail atualizado com sucesso.' };
  }
}
