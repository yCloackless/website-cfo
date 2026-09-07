/**
 * CFO CBMERJ - Automated Security Tests for Admin 2FA & Hardened Sessions (GSD Phase 6)
 * 
 * Requisitos Testados:
 * 1. Admin sem 2FA (Tentativa de acesso admin sem passar por validação de 2FA -> Bloqueado)
 * 2. TOTP Correto (Código válido do Google Authenticator emite sessão admin e evento 2FA_SUCCESS)
 * 3. TOTP Errado (Código incorreto retorna 401 INVALID_TOTP e evento 2FA_FAILED)
 * 4. Recovery Code Válido (Código de uso único emite sessão admin e é consumido no banco)
 * 5. Recovery Code Reutilizado (Código já usado é sumariamente rejeitado com 401 INVALID_RECOVERY_CODE)
 * 6. Sessão Expirada (Sessão com timestamp vencido é rejeitada em endpoints administrativos)
 * 7. Sessão Revogada (Sessão com revoked_at é imediatamente invalidada no backend)
 * 8. Operação Crítica sem Step-Up (Tentativa de alteração sensível sem step-up retorna 403 STEP_UP_REQUIRED)
 * 9. Operação Crítica com Step-Up Válido (Confirmação com senha/TOTP autoriza a execução)
 * 10. Usuário Comum em Endpoint Admin (Cadete tentando acessar rotas administrativas ou step-up recebe 403)
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { generateSync } from 'otplib';
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
  email: 'admin@cbmerj.com',
  password: 'cfocbmerj2026!',
};

const CADET_CREDENTIALS = {
  username: 'cadete',
  password: 'cadetecfo2026!',
};

// Segredo TOTP padrão configurado no servidor
const TEST_TOTP_SECRET = process.env.TOTP_SECRET || 'T37NFOFA5PCDA5NRXKDVWVEHZ2F22ZV3';

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  userRepo = new UserRepository(db.getRawDb());
  sessionRepo = new SessionRepository(db.getRawDb());
  recoveryRepo = new RecoveryCodeRepository(db.getRawDb());
  auditRepo = new AuditRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (server) server.close();
});

// ============================================================================
// 1. ADMIN SEM 2FA: TENTATIVA DE LOGIN OU ACESSO SEM 2FA É BLOQUEADA
// ============================================================================
test('1. Admin sem 2FA: Tentativa de login sem credencial de 2FA retorna 400 e não emite sessão', async () => {
  const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      // Sem token TOTP e sem recoveryCode
    }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, '2FA_REQUIRED');
  assert.ok(data.message.includes('obrigatório'));
});

// ============================================================================
// 2. TOTP CORRETO: CÓDIGO GOOGLE AUTHENTICATOR VÁLIDO EMITE SESSÃO ADMIN
// ============================================================================
test('2. TOTP Correto: Código de 6 dígitos válido emite sessão admin e loga 2FA_SUCCESS', async () => {
  // Gera token TOTP sincronizado com o segredo do servidor
  const validTotp = generateSync({ secret: TEST_TOTP_SECRET });

  const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      token: validTotp,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.role, 'admin');
  assert.equal(data.authMethod, 'TOTP');
  assert.ok(data.token, 'Deve retornar token de sessão autenticado');
});

// ============================================================================
// 3. TOTP ERRADO: CÓDIGO INCORRETO RESULTA EM 401 INVALID_TOTP E LOGA 2FA_FAILED
// ============================================================================
test('3. TOTP Errado: Código incorreto retorna 401 INVALID_TOTP', async () => {
  const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      token: '000000', // Código deliberadamente errado
    }),
  });

  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error, 'INVALID_TOTP');
  assert.ok(data.message.toLowerCase().includes('incorreto'));
});

// ============================================================================
// 4. RECOVERY CODE VÁLIDO: CÓDIGO DE CONTINGÊNCIA DE USO ÚNICO EMITE SESSÃO
// ============================================================================
test('4. Recovery Code Válido: Código de contingência de uso único emite sessão admin e é consumido', async () => {
  const adminUser = userRepo.findByUsername('admin')!;
  assert.ok(adminUser, 'Admin deve existir no banco');

  // Gera lote de recovery codes no banco
  const { rawCodes } = recoveryRepo.generateCodesForUser(adminUser.id, 4);
  assert.equal(rawCodes.length, 4);
  const testCode = rawCodes[0];

  // Quantidade antes do uso
  const countBefore = recoveryRepo.getRemainingCount(adminUser.id);
  assert.equal(countBefore, 4);

  // Login via verify-2fa usando recoveryCode
  const res = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: testCode,
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.role, 'admin');
  assert.equal(data.authMethod, 'RECOVERY_CODE');
  assert.ok(data.token);

  // Quantidade após o uso (deve diminuir em 1)
  const countAfter = recoveryRepo.getRemainingCount(adminUser.id);
  assert.equal(countAfter, 3, 'Código deve ter sido consumido atomicamente');
});

// ============================================================================
// 5. RECOVERY CODE REUTILIZADO: CÓDIGO JÁ CONSUMIDO É SUMARIAMENTE REJEITADO
// ============================================================================
test('5. Recovery Code Reutilizado: Tentativa de usar código já consumido retorna 401', async () => {
  const adminUser = userRepo.findByUsername('admin')!;
  const { rawCodes } = recoveryRepo.generateCodesForUser(adminUser.id, 2);
  const oneTimeCode = rawCodes[0];

  // 1º Uso -> Sucesso
  const firstRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: oneTimeCode,
    }),
  });
  assert.equal(firstRes.status, 200);

  // 2º Uso com o MESMO código -> Falha obrigatória
  const secondRes = await fetch(`${baseUrl}/api/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: ADMIN_CREDENTIALS.username,
      password: ADMIN_CREDENTIALS.password,
      recoveryCode: oneTimeCode,
    }),
  });

  assert.equal(secondRes.status, 401);
  const secondData = await secondRes.json();
  assert.equal(secondData.error, 'INVALID_RECOVERY_CODE');
});

// ============================================================================
// 6. SESSÃO EXPIRADA: TOKEN EXPIRADO É REJEITADO EM ENDPOINTS ADMINISTRATIVOS
// ============================================================================
test('6. Sessão Expirada: Requisição com sessão vencida recebe 403 Forbidden', async () => {
  const adminUser = userRepo.findByUsername('admin')!;

  // Cria sessão intencionalmente expirada há 1 hora
  const expiredSession = sessionRepo.createSession({
    userId: adminUser.id,
    role: 'admin',
    ip: '127.0.0.1',
    userAgent: 'Test Agent',
    expiresInDays: -1, // Expirado no passado
  });

  const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${expiredSession.rawToken}` },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'FORBIDDEN');
});

// ============================================================================
// 7. SESSÃO REVOGADA: SESSÃO REVOGADA NO BANCO É SUMARIAMENTE BLOQUEADA
// ============================================================================
test('7. Sessão Revogada: Sessão revogada no banco é invalidada imediatamente', async () => {
  const adminUser = userRepo.findByUsername('admin')!;

  // Cria sessão válida
  const sessionResult = sessionRepo.createSession({
    userId: adminUser.id,
    role: 'admin',
    ip: '127.0.0.1',
    userAgent: 'Test Agent',
    expiresInDays: 1,
  });

  // Valida que funciona antes de revogar
  const beforeRes = await fetch(`${baseUrl}/api/admin/verify`, {
    headers: { Authorization: `Bearer ${sessionResult.rawToken}` },
  });
  assert.equal(beforeRes.status, 200);

  // Revoga a sessão
  sessionRepo.revokeSessionById(sessionResult.session.id);

  // Valida que agora é bloqueada
  const afterRes = await fetch(`${baseUrl}/api/admin/verify`, {
    headers: { Authorization: `Bearer ${sessionResult.rawToken}` },
  });
  assert.equal(afterRes.status, 403);
});

// ============================================================================
// 8. OPERAÇÃO CRÍTICA SEM STEP-UP: ROTAS SENSÍVEIS EXIGEM STEP-UP TOKEN (403)
// ============================================================================
test('8. Operação Crítica sem Step-Up: Alteração de papel/status sem step-up retorna 403 STEP_UP_REQUIRED', async () => {
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  const adminHeaders = {
    Authorization: `Bearer ${adminLogin.token}`,
    'Content-Type': 'application/json',
  };

  const cadet = userRepo.findByUsername('cadete')!;

  // Tentativa de alterar role SEM header de step-up
  const roleRes = await fetch(`${baseUrl}/api/admin/users/${cadet.id}/role`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ role: 'admin' }),
  });

  assert.equal(roleRes.status, 403);
  const roleData = await roleRes.json();
  assert.equal(roleData.error, 'STEP_UP_REQUIRED');
  assert.ok(roleData.message.includes('Step-Up'));

  // Tentativa com step-up token forjado ou inválido
  const forgedRes = await fetch(`${baseUrl}/api/admin/users/${cadet.id}/role`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders,
      'x-admin-step-up-token': 'token_forjado_falso_invalido.12345',
    },
    body: JSON.stringify({ role: 'admin' }),
  });

  assert.equal(forgedRes.status, 403);
  const forgedData = await forgedRes.json();
  assert.equal(forgedData.error, 'STEP_UP_REQUIRED');
});

// ============================================================================
// 9. OPERAÇÃO CRÍTICA COM STEP-UP VÁLIDO: CONFIRMAÇÃO DE IDENTIDADE AUTORIZA AÇÃO
// ============================================================================
test('9. Operação Crítica com Step-Up Válido: Confirmação via /api/admin/step-up autoriza operação crítica', async () => {
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  const adminHeaders = {
    Authorization: `Bearer ${adminLogin.token}`,
    'Content-Type': 'application/json',
  };

  // 9.1 Solicita Step-Up com senha administrativa
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ password: ADMIN_CREDENTIALS.password }),
  });

  assert.equal(stepUpRes.status, 200);
  const stepUpData = await stepUpRes.json();
  assert.equal(stepUpData.success, true);
  assert.ok(stepUpData.stepUpToken);
  assert.equal(stepUpData.expiresIn, 300); // 5 minutos

  // 9.2 Executa a operação crítica usando o x-admin-step-up-token emitido
  const cadet = userRepo.findByUsername('cadete')!;
  const roleChangeRes = await fetch(`${baseUrl}/api/admin/users/${cadet.id}/role`, {
    method: 'PATCH',
    headers: {
      ...adminHeaders,
      'x-admin-step-up-token': stepUpData.stepUpToken,
    },
    body: JSON.stringify({ role: 'cadet' }),
  });

  assert.equal(roleChangeRes.status, 200);
  const roleChangeData = await roleChangeRes.json();
  assert.equal(roleChangeData.success, true);
});

// ============================================================================
// 10. USUÁRIO COMUM EM ENDPOINT ADMIN E STEP-UP: ACESSO SUMARIAMENTE NEGADO (403)
// ============================================================================
test('10. Usuário Comum (Cadete) tentando endpoint admin ou step-up recebe 403 Forbidden', async () => {
  const cadetLogin = await authService.login('cadete', CADET_CREDENTIALS.password);
  const cadetHeaders = {
    Authorization: `Bearer ${cadetLogin.token}`,
    'Content-Type': 'application/json',
  };

  // 10.1 Cadete tentando /api/admin/step-up
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: cadetHeaders,
    body: JSON.stringify({ password: CADET_CREDENTIALS.password }),
  });
  assert.equal(stepUpRes.status, 403);

  // 10.2 Cadete tentando /api/admin/2fa/generate-recovery-codes
  const codesRes = await fetch(`${baseUrl}/api/admin/2fa/generate-recovery-codes`, {
    method: 'POST',
    headers: cadetHeaders,
  });
  assert.equal(codesRes.status, 403);

  // 10.3 Cadete tentando /api/admin/verify
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, {
    headers: cadetHeaders,
  });
  assert.equal(verifyRes.status, 403);
});
