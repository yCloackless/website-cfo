/**
 * CFO CBMERJ - Authentication Service & Provider Layer
 * Implements server-side authority for logins, sessions, password recovery and email updates.
 * Robust database-backed auth with cryptographic guarantees and immutable audit trail.
 */

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { DatabaseService, getDb } from './database';
import { sendPasswordResetEmail } from '../services/emailService';
import { adminRealtimeHub } from '../services/realtimeHub';
import {
  UserRepository,
  SessionRepository,
  PasswordResetRepository,
  AuditRepository,
  RecoveryCodeRepository,
  CadetSessionLockRepository,
  TemporarySourceBlockRepository,
  SecurityNotificationRepository,
} from './repositories';
import { DbUser, DbSession, UserRole, DbSecurityNotification } from './schema';

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

export interface AuthConfig {
  sessionDurationDays?: number;
}

export interface LoginResult {
  success: boolean;
  code?: 'CADET_SESSION_LOCKED' | 'SOURCE_IP_BLOCKED';
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
  private cadetLockRepo: CadetSessionLockRepository;
  private sourceBlockRepo: TemporarySourceBlockRepository;
  private notificationRepo: SecurityNotificationRepository;

  constructor(private dbService: DatabaseService = getDb(), private config?: AuthConfig) {
    const db = this.dbService.getRawDb();
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.resetRepo = new PasswordResetRepository(db);
    this.auditRepo = new AuditRepository(db);
    this.recoveryRepo = new RecoveryCodeRepository(db);
    this.cadetLockRepo = new CadetSessionLockRepository(db);
    this.sourceBlockRepo = new TemporarySourceBlockRepository(db);
    this.notificationRepo = new SecurityNotificationRepository(db);
  }

  /**
   * Seed default system administrator and demo cadet if database is freshly created.
   * Uses environment variables or secure hashed defaults.
   */
  public async ensureDefaultAccounts(): Promise<void> {
    const adminEmail = (process.env.ADMIN_USER_EMAIL || 'admin@localhost.invalid').toLowerCase().trim();
    const adminUsername = (process.env.ADMIN_USER || 'admin').toLowerCase().trim();
    const adminPass = process.env.ADMIN_PASSWORD;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    let admin = this.userRepo.findByEmail(adminEmail) || this.userRepo.findByUsername(adminUsername);
    if (!admin) {
      if (!adminHash && !adminPass) throw new Error('ADMIN_CREDENTIALS_NOT_CONFIGURED');
      const hash = adminHash || await bcrypt.hash(adminPass!, 10);
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
    } else {
      if (admin.email !== adminEmail) {
        this.userRepo.updateEmail(admin.id, adminEmail);
        admin.email = adminEmail;
      }
      if (admin.status !== 'active') {
        this.dbService.getRawDb().prepare("UPDATE users SET status = 'active' WHERE id = ?").run(admin.id);
        admin.status = 'active';
      }
      if (adminPass) {
        const matches = await bcrypt.compare(adminPass, admin.passwordHash);
        if (!matches) {
          const newHash = adminHash || await bcrypt.hash(adminPass, 10);
          this.userRepo.updatePasswordHash(admin.id, newHash);
          admin.passwordHash = newHash;
        }
      }
    }

    if (this.recoveryRepo.getRemainingCount(admin.id) === 0) {
      // Gera código de emergência criptograficamente aleatório (nunca hardcoded)
      const emergencyCode = crypto.randomBytes(16).toString('hex').toUpperCase().slice(0, 16);
      this.dbService.getRawDb().prepare(
        `INSERT INTO admin_recovery_codes (id, user_id, code_hash, is_used, created_at)
         VALUES (?, ?, ?, 0, ?)`
      ).run(crypto.randomUUID(), admin.id, RecoveryCodeRepository.hashCode(emergencyCode), new Date().toISOString());
      console.warn('[SEGURANÇA] Novo código de emergência admin gerado; entregue-o por canal seguro ao administrador autorizado.');
    }

    const cadetEmail = (process.env.CADET_USER_EMAIL || 'cadete@cbmerj.com').toLowerCase().trim();
    const cadetUsername = (process.env.CADET_USER || 'cadete').toLowerCase().trim();
    const cadetPass = process.env.CADET_PASSWORD;
    const cadetHash = process.env.CADET_PASSWORD_HASH;

    let cadet = this.userRepo.findByEmail(cadetEmail) || this.userRepo.findByUsername(cadetUsername);
    if (!cadet) {
      if (!cadetHash && !cadetPass) throw new Error('CADET_CREDENTIALS_NOT_CONFIGURED');
      const hash = cadetHash || await bcrypt.hash(cadetPass!, 10);
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
      if (!supportHash && !supportPass) {
        console.warn('[AUTH] Conta de suporte não provisionada: configure SUPPORT_PASSWORD ou SUPPORT_PASSWORD_HASH para habilitá-la.');
        return;
      }
      const hash = supportHash || await bcrypt.hash(supportPass!, 10);
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
   * Helper privado para busca flexível de usuário por e-mail ou nome de usuário
   */
  private findUserByIdentifier(identifier: string): DbUser | null {
    if (typeof identifier !== 'string') return null;
    const clean = identifier.trim().toLowerCase();
    if (!clean) return null;

    let user = this.userRepo.findByEmail(clean) || this.userRepo.findByUsername(clean);
    if (!user) {
      if (clean.includes('@') && !clean.endsWith('.com')) {
        user = this.userRepo.findByEmail(`${clean}.com`);
      }
      if (!user && (clean.startsWith('jb080956') || clean === 'admin@cbmerj.com')) {
        user = this.userRepo.findByEmail('jb080956@gmail.com') || this.userRepo.findByUsername('admin');
      }
    }
    return user;
  }

  /**
   * Universal Login: accepts e-mail or username.
   */
  public async verifyCredentials(identifier: string, password: string): Promise<DbUser | null> {
    if (typeof identifier !== 'string' || typeof password !== 'string') return null;
    const user = this.findUserByIdentifier(identifier);
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

    // 0. Verifica se o IP possui um bloqueio temporário de origem de 5 horas
    const user = this.findUserByIdentifier(cleanId);
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
        actorUserId: user.id,
        resource: '/api/v2/auth/login',
        status: 'FAILED',
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        userId: user.id,
        details: { reason: 'Password mismatch' },
      });
      return { success: false, message: 'Credenciais de acesso inválidas.' };
    }

    // =========================================================================
    // 🛡️ REGRA DE NEGÓCIO EXCLUSIVA PARA A CONTA CADETE
    // =========================================================================
    // Evaluate source blocks only for a verified cadet: admin/support remain unaffected.
    if (user.role === 'cadet' && meta?.ip) {
      const ipCheck = this.sourceBlockRepo.isIpBlocked(meta.ip);
      if (ipCheck.isBlocked) {
        this.auditRepo.log({
          action: 'CADET_TEMPORARY_SOURCE_BLOCKED', actor: user.username, actorUserId: user.id,
          resource: '/api/v2/auth/login', status: 'FAILED', ip: meta.ip, userAgent: meta.userAgent,
          userId: user.id, details: { reason: ipCheck.block?.reason, lockedUntil: ipCheck.block?.lockedUntil },
        });
        return { success: false, code: 'SOURCE_IP_BLOCKED', message: 'Acesso temporariamente suspenso para esta origem. Tente novamente mais tarde.' };
      }
    }

    if (user.role === 'cadet') {
      const db = this.dbService.getRawDb();
      const now = new Date();
      const nowIso = now.toISOString();

      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const lock = this.cadetLockRepo.getLock(user.id);

        // 1. Verifica se a conta possui um lock de 24h ativo
        if (lock?.lockedUntil && lock.lockedUntil > nowIso) {
          this.auditRepo.log({
            action: 'CADET_LOGIN_BLOCKED',
            actor: user.username,
            actorUserId: user.id,
            resource: '/api/v2/auth/login',
            status: 'FAILED',
            ip: meta?.ip,
            userAgent: meta?.userAgent,
            userId: user.id,
            details: { reason: 'Locked for 24h due to session replacement attempt' },
          });
          this.maybeBlockCadetSource(user, meta, now);
          db.exec('COMMIT;');
          return {
            success: false,
            code: 'CADET_SESSION_LOCKED',
            message: 'Esta conta já possui uma sessão exclusiva ativa. Uma nova sessão poderá ser iniciada após o período de segurança.',
          };
        }

        // 2. Se existia um lock e o tempo de 24h já expirou, registra CADET_LOCK_EXPIRED
        if (lock?.lockedUntil && lock.lockedUntil <= nowIso) {
          this.auditRepo.log({
            action: 'CADET_LOCK_EXPIRED',
            actor: user.username,
            actorUserId: user.id,
            resource: '/api/v2/auth/login',
            status: 'SUCCESS',
            ip: meta?.ip,
            userAgent: meta?.userAgent,
            userId: user.id,
            details: { reason: '24h security window elapsed' },
          });
        }

        // 3. Verifica se existe uma sessão ativa válida para a conta cadete
        const activeSession = this.cadetLockRepo.getActiveSessionForUser(user.id);
        if (activeSession) {
          // Tentativa de login em outro dispositivo/sessão enquanto existe sessão ativa!
          // Dispara evento CADET_SESSION_REPLACEMENT_ATTEMPT e inicia trava de 24h (CADET_LOCK_STARTED)
          this.auditRepo.log({
            action: 'CADET_SESSION_REPLACEMENT_ATTEMPT',
            actor: user.username,
            actorUserId: user.id,
            resource: '/api/v2/auth/login',
            status: 'WARNING',
            ip: meta?.ip,
            userAgent: meta?.userAgent,
            userId: user.id,
            details: { activeSessionId: activeSession.id },
          });

          const lockedUntil24h = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
          this.cadetLockRepo.setLock(user.id, activeSession.id, lockedUntil24h);

          this.auditRepo.log({
            action: 'CADET_LOCK_STARTED',
            actor: user.username,
            actorUserId: user.id,
            resource: '/api/v2/auth/login',
            status: 'WARNING',
            ip: meta?.ip,
            userAgent: meta?.userAgent,
            userId: user.id,
            details: { lockedUntil: lockedUntil24h },
          });

          // Aplica bloqueio temporário de 5 horas para o IP suspeito
          if (meta?.ip && this.auditRepo.countActionsFromIpSince(
            ['CADET_SESSION_REPLACEMENT_ATTEMPT', 'CADET_LOGIN_BLOCKED'],
            meta.ip,
            new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
          ) >= 3) {
            const block5h = this.sourceBlockRepo.blockIp(meta.ip, 'Tentativa de substituição de sessão do cadete', 5, user.id);
            this.auditRepo.log({
              action: 'CADET_TEMPORARY_SOURCE_BLOCKED',
              actor: user.username,
              actorUserId: user.id,
              resource: '/api/v2/auth/login',
              status: 'WARNING',
              ip: meta.ip,
              userAgent: meta.userAgent,
              userId: user.id,
              details: { reason: block5h.reason, lockedUntil: block5h.lockedUntil },
            });
          }

          // Cria notificação de alerta de segurança persistente no banco de dados
          const notif = this.notificationRepo.createNotification({
            userId: user.id,
            type: 'CADET_SECURITY_ALERT',
            title: 'Tentativa de acesso bloqueada',
            message: 'Uma tentativa suspeita de acesso à conta cadete foi impedida.',
            metadata: {
              ip: meta?.ip,
              userAgent: meta?.userAgent,
              timestamp: nowIso,
              reason: 'Tentativa de login concorrente com sessão ativa',
            },
          });

          // Dispara evento realtime via Server-Sent Events (SSE)
          adminRealtimeHub.publish('SECURITY_ALERT', {
            action: 'CADET_SECURITY_ALERT',
            userId: user.id,
            notificationId: notif.id,
            title: notif.title,
            message: notif.message,
            ip: meta?.ip,
            userAgent: meta?.userAgent,
            timestamp: nowIso,
          });

          db.exec('COMMIT;');
          return {
            success: false,
            code: 'CADET_SESSION_LOCKED',
            message: 'Esta conta já possui uma sessão exclusiva ativa. Uma nova sessão poderá ser iniciada após o período de segurança.',
          };
        }

        // 4. Sem sessão ativa e sem trava válida: cria nova sessão exclusiva para o cadete
        const days = meta?.rememberMe ? 30 : 1;
        const { rawToken, session } = this.sessionRepo.createSession({
          userId: user.id,
          role: user.role,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          expiresInDays: days,
        });

        this.cadetLockRepo.setLock(user.id, session.id, null);

        this.auditRepo.log({
          action: 'CADET_LOGIN_SUCCESS',
          actor: user.username,
          actorUserId: user.id,
          resource: '/api/v2/auth/login',
          status: 'SUCCESS',
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          userId: user.id,
          details: { sessionId: session.id, role: user.role, rememberMe: meta?.rememberMe },
        });

        this.auditRepo.log({
          action: 'LOGIN_SUCCESS',
          actor: user.username,
          actorUserId: user.id,
          resource: '/api/v2/auth/login',
          status: 'SUCCESS',
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          userId: user.id,
          details: { role: user.role, rememberMe: meta?.rememberMe },
        });

        db.exec('COMMIT;');

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
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
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
      actorUserId: user.id,
      resource: '/api/v2/auth/login',
      status: 'SUCCESS',
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      userId: user.id,
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
   * Reset/Desbloqueio manual da conta cadete por administrador autorizado.
   */
  private maybeBlockCadetSource(user: DbUser, meta: { ip?: string; userAgent?: string } | undefined, now: Date): void {
    if (!meta?.ip) return;
    const ip = meta.ip.trim().replace(/^::ffff:/, '');
    if (this.sourceBlockRepo.isIpBlocked(ip).isBlocked) return;
    const attempts = this.auditRepo.countActionsFromIpSince(
      ['CADET_SESSION_REPLACEMENT_ATTEMPT', 'CADET_LOGIN_BLOCKED'],
      ip,
      new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    );
    if (attempts < 3) return;
    const block = this.sourceBlockRepo.blockIp(ip, 'CADET_REPEATED_CONCURRENT_SESSION_ATTEMPTS', 5, user.id);
    this.auditRepo.log({
      action: 'CADET_TEMPORARY_SOURCE_BLOCKED', actor: user.username, actorUserId: user.id,
      resource: '/api/v2/auth/login', status: 'WARNING', ip, userAgent: meta.userAgent, userId: user.id,
      details: { reason: block.reason, lockedUntil: block.lockedUntil, attempts },
    });
  }

  public async resetCadetLock(
    adminUserId: string,
    targetUserId: string,
    ip?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    const admin = this.userRepo.findById(adminUserId);
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      return { success: false, message: 'Acesso negado: Requer privilégios de administrador.' };
    }

    const targetUser = this.userRepo.findById(targetUserId);
    if (!targetUser) {
      return { success: false, message: 'Usuário não encontrado.' };
    }

    // Revoga todas as sessões ativas do cadete e limpa a trava de 24h
    this.sessionRepo.revokeAllUserSessions(targetUserId);
    this.cadetLockRepo.clearLock(targetUserId);

    this.auditRepo.log({
      action: 'CADET_LOCK_MANUALLY_RESET',
      actor: admin.username,
      actorUserId: admin.id,
      resource: `/users/${targetUserId}/cadet-lock`,
      status: 'SUCCESS',
      ip,
      userAgent,
      userId: targetUserId,
      targetType: 'user',
      targetId: targetUserId,
      details: { resetByAdminId: admin.id, resetByAdminUsername: admin.username },
    });

    return { success: true, message: 'Bloqueio de sessão exclusiva do cadete resetado com sucesso.' };
  }

  public getCadetLockStatus(userId: string) {
    return this.cadetLockRepo.getLock(userId);
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

    const isReservedAdmin = cleanEmail === 'admin@cbmerj.com' || cleanEmail === (process.env.ADMIN_USER_EMAIL || 'admin@localhost.invalid').toLowerCase().trim();
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

  /**
   * Desbloqueio manual de IP suspenso por 5h por administrador autorizado.
   */
  public async unblockTemporarySourceIp(
    adminUserId: string,
    targetIp: string,
    actorIp?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string }> {
    const admin = this.userRepo.findById(adminUserId);
    if (!admin || admin.role !== 'admin' || admin.status !== 'active') {
      return { success: false, message: 'Acesso negado: Requer privilégios de administrador.' };
    }

    const unblocked = this.sourceBlockRepo.unblockIp(targetIp);
    if (!unblocked) {
      return { success: false, message: 'IP informado não possui bloqueio temporário ativo.' };
    }

    this.auditRepo.log({
      action: 'CADET_TEMPORARY_SOURCE_BLOCK_EXPIRED',
      actor: admin.username,
      actorUserId: admin.id,
      resource: `/security/source-blocks/${targetIp}`,
      status: 'SUCCESS',
      ip: actorIp,
      userAgent,
      details: { targetIp, resetByAdminId: admin.id },
    });

    return { success: true, message: `Bloqueio temporário do IP ${targetIp} foi removido com sucesso.` };
  }

  /**
   * Consulta de Notificações com filtro e estado de leitura server-side.
   */
  public getNotifications(options: {
    userId?: string | null;
    filter?: 'ALL' | 'SECURITY' | 'UNREAD';
    limit?: number;
  } = {}): { items: DbSecurityNotification[]; unreadCount: number } {
    return this.notificationRepo.listNotifications(options);
  }

  /**
   * Marcar notificação como lida.
   */
  public markNotificationAsRead(id: string): { success: boolean } {
    const updated = this.notificationRepo.markAsRead(id);
    return { success: updated };
  }
}
