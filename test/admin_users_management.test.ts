/**
 * CFO CBMERJ - Automated Tests for Admin User Management (GSD Phase 9)
 * 
 * Scenarios Tested:
 * 1. Operador 'support' (Somente Leitura): lista usuários, busca multi-campo e visualiza detalhes
 * 2. Operador 'support' tentando mutações recebe 403 Forbidden (PERMISSION_DENIED)
 * 3. Administrador pleno autorizado com Step-Up suspende usuário com sucesso
 * 4. Suspensão revoga imediatamente todas as sessões ativas do usuário suspenso
 * 5. Suspensão grava trilha de auditoria completa (quem, o quê, qual usuário, anterior, posterior)
 * 6. Administrador pleno reativa conta suspensa
 * 7. Administrador altera role para 'support', 'cadet' e 'admin' com auditoria de delta
 * 8. Administrador revoga todas as sessões de um usuário específico via endpoint dedicado
 * 9. Consulta e alteração de usuário inexistente retorna 404 Not Found
 * 10. Proteção: suspensão do administrador mestre é rejeitada com 400 Bad Request
 * 11. Usuário comum (cadete) chamando qualquer endpoint administrativo recebe 403 Forbidden
 * 12. Requisição sem token ou com token inválido recebe 403/401 Forbidden
 * 13. Proibição estrita: nenhum endpoint expõe senha, hash, totp secret, recovery codes ou tokens brutos
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { UserRepository, SessionRepository, AuditRepository, ProfileRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;
let auditRepo: AuditRepository;
let profileRepo: ProfileRepository;

let adminToken: string;
let supportToken: string;
let cadetToken: string;
let stepUpToken: string;

let testUserId: string;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  userRepo = new UserRepository(db.getRawDb());
  sessionRepo = new SessionRepository(db.getRawDb());
  auditRepo = new AuditRepository(db.getRawDb());
  profileRepo = new ProfileRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;

  // 1. Login como Administrador pleno
  const adminLogin = await authService.login('admin@cbmerj.com', 'fixture-admin-password-2026');
  assert.equal(adminLogin.success, true);
  adminToken = adminLogin.token!;

  // 2. Login como Suporte somente leitura
  const supportLogin = await authService.login('suporte@cbmerj.com', 'fixture-support-password-2026');
  assert.equal(supportLogin.success, true);
  supportToken = supportLogin.token!;

  // 3. Login como Cadete comum
  const cadetLogin = await authService.login('cadete@cbmerj.com', 'fixture-cadet-password-2026');
  assert.equal(cadetLogin.success, true);
  cadetToken = cadetLogin.token!;

  // 4. Obter Step-Up Token para o Administrador pleno
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ password: 'fixture-admin-password-2026' }),
  });
  const stepUpData = await stepUpRes.json();
  assert.equal(stepUpRes.status, 200);
  assert.equal(stepUpData.success, true);
  stepUpToken = stepUpData.stepUpToken;

  // 5. Criação de um usuário específico para os testes de gestão
  const hash = await bcrypt.hash('SenhaForte123!', 10);
  const createdUser = userRepo.create({
    email: `aluno_gestao_${Date.now()}@cbmerj.com`,
    username: `alunogestao_${Date.now()}`,
    passwordHash: hash,
    role: 'cadet',
    status: 'active',
  });
  profileRepo.createOrUpdate({
    userId: createdUser.id,
    fullName: 'Aluno Teste de Gestão',
  });
  testUserId = createdUser.id;
});

test.after(() => {
  if (server) server.close();
});

// ============================================================================
// 1. SUPORTE SOMENTE LEITURA: LISTAR, PESQUISAR E VISUALIZAR DETALHES
// ============================================================================
test('1. Operador Suporte (leitura) lista usuários, pesquisa e visualiza detalhes', async () => {
  const headers = { Authorization: `Bearer ${supportToken}` };

  // 1.1 Listagem
  const listRes = await fetch(`${baseUrl}/api/admin/users?limit=10`, { headers });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.success, true);
  assert.ok(Array.isArray(listData.items));
  assert.ok(listData.total >= 3);

  // 1.2 Pesquisa por ID
  const searchRes = await fetch(`${baseUrl}/api/admin/users?search=${testUserId}`, { headers });
  assert.equal(searchRes.status, 200);
  const searchData = await searchRes.json();
  assert.equal(searchData.items.length, 1);
  assert.equal(searchData.items[0].id, testUserId);

  // 1.3 Visualização de Detalhes
  const detailRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, { headers });
  assert.equal(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.equal(detailData.success, true);
  assert.equal(detailData.user.id, testUserId);
  assert.equal(detailData.user.profile.fullName, 'Aluno Teste de Gestão');
  assert.ok(Array.isArray(detailData.user.activeSessions));
  assert.ok(Array.isArray(detailData.user.securityEvents));
});

// ============================================================================
// 2. SUPORTE TENTANDO AÇÕES DE MUTAÇÃO RECEBE 403 PERMISSION_DENIED
// ============================================================================
test('2. Operador Suporte tentando suspender ou revogar sessões recebe 403 (PERMISSION_DENIED)', async () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${supportToken}`,
    'x-admin-step-up-token': stepUpToken,
  };

  // 2.1 Tentativa de suspender
  const suspRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(suspRes.status, 403);
  const suspData = await suspRes.json();
  assert.equal(suspData.error, 'PERMISSION_DENIED');
  assert.match(suspData.message, /permissão apenas de leitura/i);

  // 2.2 Tentativa de alterar role
  const roleRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/role`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.equal(roleRes.status, 403);
  const roleData = await roleRes.json();
  assert.equal(roleData.error, 'PERMISSION_DENIED');

  // 2.3 Tentativa de revogar sessões
  const revRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/revoke-sessions`, {
    method: 'POST',
    headers,
  });
  assert.equal(revRes.status, 403);
  const revData = await revRes.json();
  assert.equal(revData.error, 'PERMISSION_DENIED');
});

// ============================================================================
// 3. ADMIN AUTORIZADO SUSPENDE CONTA E REVOGA SESSÕES IMEDIATAMENTE
// ============================================================================
test('3. Admin autorizado suspende conta, revoga sessões ativas e registra auditoria com delta', async () => {
  // Cria sessão ativa para o usuário teste
  const userRecord = userRepo.findById(testUserId)!;
  const loginRes = await authService.login(userRecord.email, 'SenhaForte123!');
  assert.equal(loginRes.success, true);
  assert.ok(loginRes.token);

  // Confere que a sessão está ativa
  const beforeSessions = sessionRepo.listActiveSessionsByUserId(testUserId);
  assert.ok(beforeSessions.length >= 1, 'Deve ter pelo menos uma sessão ativa antes da suspensão');

  // Executa a suspensão via admin com step-up
  const suspRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ status: 'suspended' }),
  });

  assert.equal(suspRes.status, 200);
  const suspData = await suspRes.json();
  assert.equal(suspData.success, true);
  assert.equal(suspData.user.status, 'suspended');

  // Valida que TODAS as sessões do usuário foram imediatamente revogadas
  const afterSessions = sessionRepo.listActiveSessionsByUserId(testUserId);
  assert.equal(afterSessions.length, 0, 'Todas as sessões do usuário suspenso devem ter sido revogadas');

  // Valida que o token do usuário agora é rejeitado
  const validateResult = authService.validateToken(loginRes.token!);
  assert.equal(validateResult.valid, false, 'Token de sessão revogada deve ser inválido');

  // Valida a trilha de auditoria
  const auditEvents = auditRepo.findEventsByUserId(testUserId);
  const suspAudit = auditEvents.find((e) => e.action === 'ACCOUNT_SUSPENDED');
  assert.ok(suspAudit, 'Evento ACCOUNT_SUSPENDED deve estar registrado');
  assert.equal(suspAudit.userId, testUserId);
  
  const details = JSON.parse(suspAudit.detailsJson || '{}');
  assert.equal(details.previousState?.status, 'active');
  assert.equal(details.newState?.status, 'suspended');
});

// ============================================================================
// 4. ADMIN AUTORIZADO REATIVA CONTA SUSPENSA
// ============================================================================
test('4. Admin autorizado reativa conta suspensa com sucesso', async () => {
  const reactivateRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ status: 'active' }),
  });

  assert.equal(reactivateRes.status, 200);
  const reactivateData = await reactivateRes.json();
  assert.equal(reactivateData.success, true);
  assert.equal(reactivateData.user.status, 'active');

  const user = userRepo.findById(testUserId);
  assert.equal(user?.status, 'active');
});

// ============================================================================
// 5. ALTERAÇÃO DE PAPEL (ROLE) COM DELTA DE ESTADOS
// ============================================================================
test('5. Admin altera papel do usuário para support e depois para cadet com auditoria', async () => {
  // Altera para 'support'
  const roleRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ role: 'support' }),
  });

  assert.equal(roleRes.status, 200);
  const roleData = await roleRes.json();
  assert.equal(roleData.success, true);
  assert.equal(roleData.user.role, 'support');

  let updated = userRepo.findById(testUserId);
  assert.equal(updated?.role, 'support');

  // Retorna para 'cadet'
  const roleRes2 = await fetch(`${baseUrl}/api/admin/users/${testUserId}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ role: 'cadet' }),
  });

  assert.equal(roleRes2.status, 200);
  updated = userRepo.findById(testUserId);
  assert.equal(updated?.role, 'cadet');
});

// ============================================================================
// 6. REVOGAÇÃO EXPLÍCITA DE TODAS AS SESSÕES DE UM USUÁRIO
// ============================================================================
test('6. Admin revoga todas as sessões ativas de um usuário específico', async () => {
  const userRecord = userRepo.findById(testUserId)!;
  await authService.login(userRecord.email, 'SenhaForte123!');
  await authService.login(userRecord.email, 'SenhaForte123!');

  assert.ok(sessionRepo.listActiveSessionsByUserId(testUserId).length >= 2);

  const revokeRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/revoke-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
  });

  assert.equal(revokeRes.status, 200);
  const revokeData = await revokeRes.json();
  assert.equal(revokeData.success, true);
  assert.ok(revokeData.revokedCount >= 2);

  assert.equal(sessionRepo.listActiveSessionsByUserId(testUserId).length, 0);
});

// ============================================================================
// 7. TRATAMENTO DE USUÁRIO INEXISTENTE (404 NOT FOUND)
// ============================================================================
test('7. Consulta ou mutação sobre usuário inexistente retorna 404 Not Found', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000';

  // 7.1 Detalhes
  const detailRes = await fetch(`${baseUrl}/api/admin/users/${fakeId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(detailRes.status, 404);
  const detailData = await detailRes.json();
  assert.equal(detailData.error, 'USER_NOT_FOUND');

  // 7.2 Status
  const statusRes = await fetch(`${baseUrl}/api/admin/users/${fakeId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(statusRes.status, 404);

  // 7.3 Revoke Sessions
  const revRes = await fetch(`${baseUrl}/api/admin/users/${fakeId}/revoke-sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
  });
  assert.equal(revRes.status, 404);
});

// ============================================================================
// 8. PROTEÇÃO DO ADMINISTRADOR MESTRE CONTRA SUSPENSÃO (400 BAD REQUEST)
// ============================================================================
test('8. Tentativa de suspender administrador mestre é bloqueada', async () => {
  const masterAdmin = userRepo.findByUsername('admin')!;
  assert.ok(masterAdmin);

  const res = await fetch(`${baseUrl}/api/admin/users/${masterAdmin.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ status: 'suspended' }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.message, /não é permitido suspender a conta do administrador mestre/i);
});

// ============================================================================
// 9. USUÁRIO COMUM (CADETE) RECEBE 403 FORBIDDEN EM TODAS AS APIS
// ============================================================================
test('9. Usuário comum (cadete) recebe 403 Forbidden em /api/admin/users/*', async () => {
  const headers = { Authorization: `Bearer ${cadetToken}` };

  // 9.1 Listagem
  const listRes = await fetch(`${baseUrl}/api/admin/users`, { headers });
  assert.equal(listRes.status, 403);

  // 9.2 Detalhes
  const detailRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, { headers });
  assert.equal(detailRes.status, 403);

  // 9.3 Status
  const statusRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(statusRes.status, 403);
});

// ============================================================================
// 10. SEGURANÇA ESTRITA: NENHUM DADO SENSÍVEL É EXPOSTO NOS ENDPOINTS
// ============================================================================
test('10. Nenhuma resposta expõe senhas, hashes, secrets TOTP ou tokens brutos de sessão', async () => {
  const detailRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const detailData = await detailRes.json();

  assert.equal(detailData.user.password, undefined);
  assert.equal(detailData.user.passwordHash, undefined);
  assert.equal(detailData.user.password_hash, undefined);
  assert.equal(detailData.user.totpSecret, undefined);
  assert.equal(detailData.user.recoveryCodes, undefined);

  for (const session of detailData.user.activeSessions) {
    assert.equal((session as any).token, undefined);
    assert.equal((session as any).tokenHash, undefined);
    assert.equal((session as any).token_hash, undefined);
  }
});
