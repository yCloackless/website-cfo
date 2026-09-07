/**
 * CFO CBMERJ - Automated Tests for Admin Panel & Management (GSD Phase 5)
 * 
 * Scenarios Tested:
 * 1. Usuário comum (cadete) tentando acessar API admin -> 403 Forbidden
 * 2. Requisição sem token -> 403 / 401 Forbidden
 * 3. Sessão expirada -> 403 / 401
 * 4. Role adulterada (cliente forjando 'admin' com assinatura inválida) -> 403 Forbidden
 * 5. Permissão insuficiente (cadete autenticado não acessa rotas restritas) -> 403 Forbidden
 * 6. Administrador legítimo -> 200 OK com dados reais em /api/admin/*
 * 7. IDs adulterados ou inexistentes -> 404 Not Found / 400 Bad Request
 * 8. Suspensão de conta e bloqueio imediato de autenticação
 * 9. Reativação de conta de usuário suspenso
 * 10. Busca multi-campo e paginação de usuários (sem vazamento de senhas)
 * 11. Listagem e revogação imediata de sessões ativas
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { UserRepository, SessionRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  userRepo = new UserRepository(db.getRawDb());
  sessionRepo = new SessionRepository(db.getRawDb());
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
// 1. ACESSO RESTRICTO: USUÁRIO COMUM TENTANDO ACESSAR API ADMIN (403 FORBIDDEN)
// ============================================================================
test('1. Usuário comum (cadete) recebe 403 Forbidden em todos os endpoints de /api/admin/*', async () => {
  // Login como cadete
  const cadetLoginRes = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'cadete',
      password: process.env.CADET_PASSWORD || 'cadetecfo2026!',
    }),
  });
  assert.equal(cadetLoginRes.status, 200);
  const cadetData = await cadetLoginRes.json();
  const cadetToken = cadetData.token;
  assert.ok(cadetToken);

  const cadetHeaders = { Authorization: `Bearer ${cadetToken}` };

  // 1.1 /api/admin/verify
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, { headers: cadetHeaders });
  assert.equal(verifyRes.status, 403, 'Cadete não pode acessar /api/admin/verify');

  // 1.2 /api/admin/dashboard
  const dashRes = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: cadetHeaders });
  assert.equal(dashRes.status, 403, 'Cadete não pode acessar /api/admin/dashboard');

  // 1.3 /api/admin/users
  const usersRes = await fetch(`${baseUrl}/api/admin/users`, { headers: cadetHeaders });
  assert.equal(usersRes.status, 403, 'Cadete não pode acessar /api/admin/users');

  // 1.4 /api/admin/sessions
  const sessionsRes = await fetch(`${baseUrl}/api/admin/sessions`, { headers: cadetHeaders });
  assert.equal(sessionsRes.status, 403, 'Cadete não pode acessar /api/admin/sessions');

  // 1.5 /api/admin/admins
  const adminsRes = await fetch(`${baseUrl}/api/admin/admins`, { headers: cadetHeaders });
  assert.equal(adminsRes.status, 403, 'Cadete não pode acessar /api/admin/admins');

  // 1.6 /api/admin/settings
  const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, { headers: cadetHeaders });
  assert.equal(settingsRes.status, 403, 'Cadete não pode acessar /api/admin/settings');
});

// ============================================================================
// 2. REQUISIÇÃO SEM AUTENTICAÇÃO OU COM SESSÃO EXPIRADA
// ============================================================================
test('2. Requisição anônima ou com sessão expirada é sumariamente bloqueada', async () => {
  // 2.1 Sem token
  const unauthRes = await fetch(`${baseUrl}/api/admin/dashboard`);
  assert.equal(unauthRes.status, 403, 'Acesso sem token deve ser rejeitado com 403');

  // 2.2 Token expirado forjado no passado
  const expiredPayload = {
    u: 'admin',
    role: 'admin',
    exp: Date.now() - 100000,
    iat: Date.now() - 200000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const fakeSig = crypto.createHmac('sha256', 'chave_qualquer').update(payloadB64).digest('base64url');
  const expiredToken = `${payloadB64}.${fakeSig}`;

  const expiredRes = await fetch(`${baseUrl}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expiredRes.status, 403, 'Token expirado deve ser rejeitado');
});

// ============================================================================
// 3. ROLE ADULTERADA / TOKEN FORJADO NO CLIENTE
// ============================================================================
test('3. Tentativa de forjar role=admin no cliente é bloqueada por validação criptográfica', async () => {
  // Usuário cria token manualmente dizendo que é 'admin', mas sem a chave secreta do servidor
  const tamperedPayload = {
    u: 'cadete',
    role: 'admin',
    exp: Date.now() + 86400000,
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
  const forgedSig = crypto.createHmac('sha256', 'chave_falsa_do_atacante').update(payloadB64).digest('base64url');
  const forgedToken = `${payloadB64}.${forgedSig}`;

  const forgedRes = await fetch(`${baseUrl}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${forgedToken}` },
  });
  assert.equal(forgedRes.status, 403, 'Token com assinatura forjada deve ser sumariamente bloqueado');
});

// ============================================================================
// 4. ADMINISTRADOR AUTENTICADO ACESSA DASHBOARD E CONFIGURAÇÕES
// ============================================================================
test('4. Administrador autenticado acessa dashboard, métricas e listagens com dados reais', async () => {
  // Obter sessão válida de admin através do authService
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  assert.equal(adminLogin.success, true);
  const adminToken = adminLogin.token!;
  assert.ok(adminToken);

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // 4.1 Verify
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, { headers: adminHeaders });
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.verified, true);
  assert.equal(verifyData.user.role, 'admin');

  // 4.2 Dashboard
  const dashRes = await fetch(`${baseUrl}/api/admin/dashboard`, { headers: adminHeaders });
  assert.equal(dashRes.status, 200);
  const dashData = await dashRes.json();
  assert.equal(dashData.success, true);
  assert.ok(dashData.stats.totalUsers >= 2, 'Deve registrar pelo menos 2 usuários');
  assert.ok(dashData.stats.adminCount >= 1, 'Deve registrar pelo menos 1 admin');

  // 4.3 Users List
  const usersRes = await fetch(`${baseUrl}/api/admin/users?limit=10`, { headers: adminHeaders });
  assert.equal(usersRes.status, 200);
  const usersData = await usersRes.json();
  assert.ok(Array.isArray(usersData.items));
  assert.ok(usersData.items.length >= 2);

  // 4.4 SEGURANÇA CRÍTICA: Nenhum item de usuário pode expor senhas ou hashes
  for (const user of usersData.items) {
    assert.equal((user as any).password, undefined, 'Senha nunca deve ser exposta');
    assert.equal((user as any).passwordHash, undefined, 'Hash de senha nunca deve ser exposto');
    assert.equal((user as any).password_hash, undefined, 'Hash de senha nunca deve ser exposto');
  }

  // 4.5 Sessions List
  const sessionsRes = await fetch(`${baseUrl}/api/admin/sessions`, { headers: adminHeaders });
  assert.equal(sessionsRes.status, 200);
  const sessionsData = await sessionsRes.json();
  assert.ok(Array.isArray(sessionsData.sessions));

  // 4.6 Admins List
  const adminsRes = await fetch(`${baseUrl}/api/admin/admins`, { headers: adminHeaders });
  assert.equal(adminsRes.status, 200);
  const adminsData = await adminsRes.json();
  assert.ok(adminsData.admins.some((a: any) => a.username === 'admin'));

  // 4.7 Settings
  const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, { headers: adminHeaders });
  assert.equal(settingsRes.status, 200);
  const settingsData = await settingsRes.json();
  assert.equal(settingsData.success, true);
  assert.ok(settingsData.settings.sessionDurationDays >= 1);
});

// ============================================================================
// 5. GESTÃO DE USUÁRIOS: BUSCA, SUSPENSÃO E REATIVAÇÃO
// ============================================================================
test('5. Gestão de Usuários: Busca, suspensão e reativação de conta com bloqueio imediato', async () => {
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  const adminToken = adminLogin.token!;
  const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  const cadetUser = userRepo.findByUsername('cadete');
  assert.ok(cadetUser, 'Cadete deve existir no banco');

  // Obter Step-Up token para autorizar alterações críticas
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ password: 'cfocbmerj2026!' }),
  });
  assert.equal(stepUpRes.status, 200);
  const stepUpData = await stepUpRes.json();
  assert.ok(stepUpData.stepUpToken);

  const stepUpHeaders = {
    ...adminHeaders,
    'x-admin-step-up-token': stepUpData.stepUpToken,
  };

  // 5.1 Busca por username (não exige step-up)
  const searchRes = await fetch(`${baseUrl}/api/admin/users?search=cadete`, { headers: adminHeaders });
  const searchData = await searchRes.json();
  assert.equal(searchData.items.length, 1);
  assert.equal(searchData.items[0].username, 'cadete');
  assert.ok(searchData.items[0].email.includes('cadete'));

  // 5.2 IDs inexistentes retornam 404
  const notFoundRes = await fetch(`${baseUrl}/api/admin/users/id_totalmente_inexistente_999/status`, {
    method: 'PATCH',
    headers: stepUpHeaders,
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(notFoundRes.status, 404, 'ID inexistente deve retornar 404');

  // 5.3 Suspender cadete
  const suspendRes = await fetch(`${baseUrl}/api/admin/users/${cadetUser.id}/status`, {
    method: 'PATCH',
    headers: stepUpHeaders,
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(suspendRes.status, 200);
  const suspendData = await suspendRes.json();
  assert.equal(suspendData.user.status, 'suspended');

  // 5.4 Cadete suspenso tenta logar -> bloqueado!
  const loginSuspendedRes = await authService.login('cadete', process.env.CADET_PASSWORD || 'cadetecfo2026!');
  assert.equal(loginSuspendedRes.success, false, 'Usuário suspenso NÃO pode conseguir logar');
  assert.ok(
    loginSuspendedRes.message?.toLowerCase().includes('suspenso') ||
    loginSuspendedRes.message?.toLowerCase().includes('desativada') ||
    loginSuspendedRes.message?.toLowerCase().includes('inválidas')
  );

  // 5.5 Reativar cadete
  const reactivateRes = await fetch(`${baseUrl}/api/admin/users/${cadetUser.id}/status`, {
    method: 'PATCH',
    headers: stepUpHeaders,
    body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(reactivateRes.status, 200);
  const reactivateData = await reactivateRes.json();
  assert.equal(reactivateData.user.status, 'active');

  // 5.6 Cadete reativado consegue logar normalmente
  const loginActiveRes = await authService.login('cadete', process.env.CADET_PASSWORD || 'cadetecfo2026!');
  assert.equal(loginActiveRes.success, true, 'Usuário reativado deve conseguir logar');
});

// ============================================================================
// 6. GESTÃO DE SESSÕES: REVOGAÇÃO POR ID
// ============================================================================
test('6. Gestão de Sessões: Listagem e revogação imediata de sessão específica', async () => {
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  const adminToken = adminLogin.token!;
  const adminHeaders = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

  // Obter Step-Up token para autorizar revogação
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ password: 'cfocbmerj2026!' }),
  });
  assert.equal(stepUpRes.status, 200);
  const stepUpData = await stepUpRes.json();
  const stepUpHeaders = {
    ...adminHeaders,
    'x-admin-step-up-token': stepUpData.stepUpToken,
  };

  // Garante que o cadete está ativo
  const cadet = userRepo.findByUsername('cadete')!;
  userRepo.updateStatus(cadet.id, 'active');
  const sessionResult = sessionRepo.createSession({
    userId: cadet.id,
    role: 'cadet',
    ip: '189.20.30.40',
    userAgent: 'Mozilla/5.0 iPad',
    expiresInDays: 1,
  });

  // Valida que a sessão está ativa
  const validateBefore = sessionRepo.validateSession(sessionResult.rawToken);
  assert.equal(validateBefore.valid, true, 'Sessão recém criada deve estar válida');

  // Admin revoga a sessão através de /api/admin/sessions/:id/revoke com Step-Up
  const revokeRes = await fetch(`${baseUrl}/api/admin/sessions/${sessionResult.session.id}/revoke`, {
    method: 'POST',
    headers: stepUpHeaders,
  });
  assert.equal(revokeRes.status, 200);
  const revokeData = await revokeRes.json();
  assert.equal(revokeData.success, true);

  // Valida que a sessão foi invalidada server-side
  const validateAfter = sessionRepo.validateSession(sessionResult.rawToken);
  assert.equal(validateAfter.valid, false, 'Sessão revogada não pode mais ser aceita');
});
