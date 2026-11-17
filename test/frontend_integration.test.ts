/**
 * CFO CBMERJ - Frontend & Backend Real Integration Tests (GSD Phase 11)
 *
 * Requisitos Validados:
 * 1. Fluxo de Login Passo 1 (check-credentials -> requireTotp: true)
 * 2. Autenticação 2FA Passo 2 com Recovery Code de contingência (emissão de sessão e consumo único)
 * 3. Tentativa de reuso de Recovery Code já utilizado (rejeição com 401)
 * 4. Validação de Sessão ativa (/api/auth/verify-session)
 * 5. Invalidação real de sessão no backend durante Logout (/api/auth/logout)
 * 6. Verificação de sessão após Logout (rejeição com 401)
 * 7. Obtenção de perfil autenticado (/api/user/profile) com token ativo vs revogado
 * 8. Estado Forbidden (403): Usuário comum tentando acessar endpoints admin
 * 9. Fluxo de recuperação de senha (forgot-password e reset-password)
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { UserRepository, SessionRepository, RecoveryCodeRepository, AuditRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;
let recoveryRepo: RecoveryCodeRepository;
let auditRepo: AuditRepository;

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'fixture-admin-password-2026',
};

const CADET_CREDENTIALS = {
  username: 'cadete',
  email: 'cadete@cbmerj.com',
  password: 'fixture-cadet-password-2026',
};

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  userRepo = new UserRepository(db.getRawDb());
  sessionRepo = new SessionRepository(db.getRawDb());
  recoveryRepo = new RecoveryCodeRepository(db.getRawDb());
  auditRepo = new AuditRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

test('FASE 11: 1. Login Passo 1 - Verificação de Credenciais', async () => {
  const res = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.requireTotp, true);
});

test('FASE 11: 2. Login Passo 2 com Recovery Code de Contingência', async () => {
  const adminUser = userRepo.findByUsername('admin')!;
  assert.ok(adminUser);

  // Gera novos recovery codes no repositório para o admin
  const { rawCodes } = recoveryRepo.generateCodesForUser(adminUser.id, 4);
  assert.equal(rawCodes.length, 4);
  const testRecoveryCode = rawCodes[0];

  // Executa login 2FA usando o recoveryCode gerado
  const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: testRecoveryCode,
      rememberMe: true,
    }),
  });

  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.token, 'Deve retornar token de sessão');
  assert.equal(data.role, 'admin');
  assert.equal(data.authMethod, 'RECOVERY_CODE');

  // Validação: O código foi consumido no banco de dados e não pode ser reutilizado
  const reuseRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: testRecoveryCode,
    }),
  });

  assert.equal(reuseRes.status, 401);
  const reuseData = await reuseRes.json();
  assert.equal(reuseData.error, 'INVALID_RECOVERY_CODE');
});

test('FASE 11: 3. Validação de Sessão Ativa (/api/auth/verify-session)', async () => {
  const adminUser = userRepo.findByUsername('admin')!;
  assert.ok(adminUser);

  const { rawCodes } = recoveryRepo.generateCodesForUser(adminUser.id, 1);
  const code = rawCodes[0];

  // Login para obter token ativo
  const loginRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: code,
    }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  assert.ok(token);

  // Valida com verify-session
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });

  const verifyData = await verifyRes.json();
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyData.valid, true);
  assert.equal(verifyData.username, 'admin');
  assert.equal(verifyData.role, 'admin');
});

test('FASE 11: 4. Revogação de Sessão no Logout (/api/auth/logout)', async () => {
  const adminUser = userRepo.findByUsername('admin')!;
  assert.ok(adminUser);

  const { rawCodes } = recoveryRepo.generateCodesForUser(adminUser.id, 1);
  const code = rawCodes[0];

  // Login
  const loginRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: code,
    }),
  });
  const { token } = await loginRes.json();
  assert.ok(token);

  // Executa logout chamando a rota real
  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });

  const logoutData = await logoutRes.json();
  assert.equal(logoutRes.status, 200);
  assert.equal(logoutData.success, true);

  // Valida que a sessão foi revogada no backend
  const recheckRes = await fetch(`${baseUrl}/api/auth/verify-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ token }),
  });

  assert.equal(recheckRes.status, 401);
  const recheckData = await recheckRes.json();
  assert.equal(recheckData.valid, false);
});

test('FASE 11: 5. Perfil de Usuário (/api/user/profile) com Token Válido vs Revogado', async () => {
  // Login como cadete para obter sessão legítima
  const cadetLogin = await authService.login('cadete', 'fixture-cadet-password-2026');
  assert.ok(cadetLogin.success && cadetLogin.token);
  const cadetToken = cadetLogin.token;

  // Token válido -> 200 OK
  const profileRes = await fetch(`${baseUrl}/api/user/profile`, {
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(profileRes.status, 200);
  const profileData = await profileRes.json();
  assert.equal(profileData.success, true);
  assert.equal(profileData.user.username, 'cadete');
  assert.equal(profileData.user.role, 'cadet');

  // Revoga a sessão via logout real
  await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cadetToken}`,
    },
    body: JSON.stringify({ token: cadetToken }),
  });

  // Token revogado -> 401 Unauthorized
  const revokedRes = await fetch(`${baseUrl}/api/user/profile`, {
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(revokedRes.status, 401);
});

test('FASE 11: 6. Estado Forbidden (403): Usuário comum tentando acessar endpoints admin', async () => {
  const cadetLogin = await authService.login('cadete', 'fixture-cadet-password-2026');
  assert.ok(cadetLogin.success && cadetLogin.token);

  // Tenta acessar rota restrita de verificação do admin (/api/admin/verify)
  const forbiddenRes = await fetch(`${baseUrl}/api/admin/verify`, {
    headers: { Authorization: `Bearer ${cadetLogin.token}` },
  });

  assert.equal(forbiddenRes.status, 403);
  const forbiddenData = await forbiddenRes.json();
  assert.equal(forbiddenData.error, 'FORBIDDEN');
});

test('FASE 11: 7. Recuperação de Senha Completa (forgot-password e reset-password)', async () => {
  const testEmail = 'aluno_rec_phase11@cbmerj.com';
  const testUsername = 'alunophase11';
  let user = userRepo.findByEmail(testEmail);
  if (!user) {
    user = userRepo.create({
      email: testEmail,
      username: testUsername,
      passwordHash: '$2b$10$abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      role: 'cadet',
    });
  }

  // Solicita recuperação
  const forgotRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail }),
  });
  const forgotData = await forgotRes.json();
  assert.equal(forgotRes.status, 200);
  assert.equal(forgotData.success, true);
  assert.ok(forgotData.debugCode, 'Deve retornar debugCode no ambiente de testes');

  // Redefine com o código retornado
  const newPassword = 'novaSenhaForte2026!';
  const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: forgotData.debugCode,
      newPassword,
    }),
  });

  const resetData = await resetRes.json();
  assert.equal(resetRes.status, 200);
  assert.equal(resetData.success, true);

  // Confirma que a nova senha funciona
  const loginCheck = await authService.login(testEmail, newPassword);
  assert.equal(loginCheck.success, true);
});

test('FASE 11: 8. Avatar cacheável (/api/user/avatar/:userId) e payload enxuto em /api/user/profile', async () => {
  const cadetUser = userRepo.findByUsername('cadete')!;
  sessionRepo.revokeAllUserSessions(cadetUser.id);
  const cadetLogin = await authService.login('cadete', 'fixture-cadet-password-2026');
  assert.ok(cadetLogin.success && cadetLogin.token);

  const otherUser = userRepo.findByEmail('aluno_rec_phase11@cbmerj.com')!;
  sessionRepo.revokeAllUserSessions(otherUser.id);
  const otherLogin = await authService.login(otherUser.email, 'novaSenhaForte2026!');
  assert.ok(otherLogin.success && otherLogin.token);

  const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]).toString('base64');

  const uploadRes = await fetch(`${baseUrl}/api/user/avatar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cadetLogin.token}`,
    },
    body: JSON.stringify({ imageBase64: `data:image/png;base64,${validPng}` }),
  });
  assert.equal(uploadRes.status, 200);
  const uploadData = await uploadRes.json();
  assert.match(uploadData.avatarUrl, new RegExp(`^/api/user/avatar/${cadetUser.id}\\?v=[a-f0-9]+$`));

  const profileRes = await fetch(`${baseUrl}/api/user/profile`, {
    headers: { Authorization: `Bearer ${cadetLogin.token}` },
  });
  assert.equal(profileRes.status, 200);
  const profileData = await profileRes.json();
  assert.equal(profileData.user.avatarUrl, uploadData.avatarUrl);

  const unauthAvatarRes = await fetch(`${baseUrl}${uploadData.avatarUrl}`);
  assert.equal(unauthAvatarRes.status, 401);

  const otherAvatarRes = await fetch(`${baseUrl}${uploadData.avatarUrl}`, {
    headers: { Authorization: `Bearer ${otherLogin.token}` },
  });
  assert.equal(otherAvatarRes.status, 403);

  const avatarRes = await fetch(`${baseUrl}${uploadData.avatarUrl}`, {
    headers: { Authorization: `Bearer ${cadetLogin.token}` },
  });
  assert.equal(avatarRes.status, 200);
  assert.equal(avatarRes.headers.get('content-type'), 'image/png');
  assert.match(avatarRes.headers.get('cache-control') || '', /max-age=86400/);
  const etag = avatarRes.headers.get('etag');
  assert.ok(etag);

  const notModifiedRes = await fetch(`${baseUrl}${uploadData.avatarUrl}`, {
    headers: {
      Authorization: `Bearer ${cadetLogin.token}`,
      'If-None-Match': etag!,
    },
  });
  assert.equal(notModifiedRes.status, 304);
});
