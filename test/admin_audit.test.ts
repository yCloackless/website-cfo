/**
 * CFO CBMERJ - Testes Automatizados para Auditoria Administrativa (GSD Fase 10)
 * 
 * Cenários Testados:
 * 1. Ação administrativa gera registro forense com campos estruturados (action, actor, actorUserId, targetType, targetId, previousState, newState)
 * 2. Visualização de dossiê de usuário emite evento USER_VIEWED de forma controlada
 * 3. Usuário comum (cadete) tentando consultar /api/admin/audit-logs recebe 403 Forbidden
 * 4. Requisição não autenticada ou com credencial inválida recebe 401/403
 * 5. Sanitização rigorosa: nenhum secret (senha, hash, token, totp, recovery code, cookie) é gravado ou retornado
 * 6. Filtros avançados: busca combinada por ação, status, ator, recurso e período de datas
 * 7. Paginação: verificação precisa de page, limit, total e totalPages
 * 8. Integridade no Banco (Trigger SQLite): UPDATE em audit_events é bloqueado com erro AUDIT_LOG_IMMUTABLE
 * 9. Integridade no Banco (Trigger SQLite): DELETE em audit_events é bloqueado com erro AUDIT_LOG_IMMUTABLE
 * 10. Integridade via API: verbos de mutação (PUT, PATCH, DELETE, POST) em /api/admin/audit-logs retornam 405 Method Not Allowed
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { UserRepository, SessionRepository, AuditRepository, ProfileRepository, sanitizeAuditPayload } from '../src/db/repositories';
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
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  assert.equal(adminLogin.success, true);
  adminToken = adminLogin.token!;

  // 2. Login como Suporte somente leitura
  const supportLogin = await authService.login('suporte@cbmerj.com', 'suportecfo2026!');
  assert.equal(supportLogin.success, true);
  supportToken = supportLogin.token!;

  // 3. Login como Cadete comum
  const cadetLogin = await authService.login('cadete@cbmerj.com', 'cadetecfo2026!');
  assert.equal(cadetLogin.success, true);
  cadetToken = cadetLogin.token!;

  // 4. Obter Step-Up Token para o Administrador pleno
  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ password: 'cfocbmerj2026!' }),
  });
  const stepUpData = await stepUpRes.json();
  assert.equal(stepUpRes.status, 200);
  assert.equal(stepUpData.success, true);
  stepUpToken = stepUpData.stepUpToken;

  // 5. Usuário alvo para operações de auditoria
  const hash = await bcrypt.hash('SenhaForte123!', 10);
  const createdUser = userRepo.create({
    email: `aluno_audit_${Date.now()}@cbmerj.com`,
    username: `alunoaudit_${Date.now()}`,
    passwordHash: hash,
    role: 'cadet',
    status: 'active',
  });
  profileRepo.createOrUpdate({
    userId: createdUser.id,
    fullName: 'Aluno Teste de Auditoria',
  });
  testUserId = createdUser.id;
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('1. Ação administrativa gera log forense com delta (previousState vs newState) e campos estruturados', async () => {
  // Suspender usuário usando step-up
  const suspendRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
      'x-step-up-token': stepUpToken,
    },
    body: JSON.stringify({ status: 'suspended' }),
  });

  assert.equal(suspendRes.status, 200);

  // Consulta eventos de auditoria filtrados pela ação USER_SUSPENDED
  const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs?action=USER_SUSPENDED&targetId=${testUserId}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
    },
  });

  assert.equal(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert.equal(auditData.success, true);
  assert.ok(auditData.items.length >= 1);

  const event = auditData.items[0];
  assert.equal(event.action, 'USER_SUSPENDED');
  assert.equal(event.actor, 'admin');
  assert.equal(event.targetType, 'user');
  assert.equal(event.targetId, testUserId);
  assert.equal(event.status, 'SUCCESS');

  // Verificar deltas em detailsJson
  assert.ok(event.detailsJson);
  const details = JSON.parse(event.detailsJson);
  assert.deepEqual(details.previousState, { status: 'active' });
  assert.deepEqual(details.newState, { status: 'suspended' });
});

test('2. Visualização de dossiê do usuário gera evento USER_VIEWED de forma controlada', async () => {
  // Consultar dossiê detalhado do usuário
  const viewRes = await fetch(`${baseUrl}/api/admin/users/${testUserId}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
    },
  });

  assert.equal(viewRes.status, 200);

  // Verificar que foi registrado USER_VIEWED
  const auditRes = await fetch(`${baseUrl}/api/admin/audit-logs?action=USER_VIEWED&targetId=${testUserId}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
    },
  });

  assert.equal(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert.equal(auditData.success, true);
  assert.ok(auditData.items.length >= 1);

  const viewEvent = auditData.items[0];
  assert.equal(viewEvent.action, 'USER_VIEWED');
  assert.equal(viewEvent.targetType, 'user');
  assert.equal(viewEvent.targetId, testUserId);
});

test('3. Usuário comum (cadete) tentando acessar /api/admin/audit-logs recebe 403 Forbidden', async () => {
  const res = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: {
      Authorization: `Bearer ${cadetToken}`,
      'x-admin-token': cadetToken,
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'FORBIDDEN');
});

test('4. Requisição não autenticada ou com credencial forjada recebe 403 Forbidden', async () => {
  const noAuthRes = await fetch(`${baseUrl}/api/admin/audit-logs`);
  assert.equal(noAuthRes.status, 403);

  const fakeAuthRes = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: {
      Authorization: 'Bearer token_completamente_falso_123',
      'x-admin-token': 'token_completamente_falso_123',
    },
  });
  assert.equal(fakeAuthRes.status, 403);
});

test('5. Sanitização rigorosa: nenhum segredo (senha, hash, totp, recovery code, cookie) é gravado', async () => {
  // Teste unitário da função pura e no AuditRepository.log
  const dirtyPayload = {
    username: 'admin',
    password: 'SuperSecretPassword123!',
    currentPassword: 'OldPassword123!',
    newPassword: 'BrandNewPassword123!',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz',
    token: 'jwt_secret_token_abcdef',
    refreshToken: 'refresh_secret_123',
    accessToken: 'access_secret_456',
    secret: 'ultra_private_secret',
    totp: '123456',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    recoveryCode: 'ABCD-1234-EFGH-5678',
    backupCode: '9999-0000',
    cookie: 'session=secretcookie',
    authorization: 'Bearer secret_key',
    apiKey: 'cfo_live_key_9999',
    safeMeta: 'Metadado perfeitamente seguro',
    nestedObject: {
      password: 'nestedPassword!',
      innerToken: 'nestedToken!',
      allowedKey: 'OK',
    },
  };

  const sanitized = sanitizeAuditPayload(dirtyPayload);
  assert.equal(sanitized.password, undefined);
  assert.equal(sanitized.currentPassword, undefined);
  assert.equal(sanitized.newPassword, undefined);
  assert.equal(sanitized.passwordHash, undefined);
  assert.equal(sanitized.token, undefined);
  assert.equal(sanitized.refreshToken, undefined);
  assert.equal(sanitized.accessToken, undefined);
  assert.equal(sanitized.secret, undefined);
  assert.equal(sanitized.totp, undefined);
  assert.equal(sanitized.totpSecret, undefined);
  assert.equal(sanitized.recoveryCode, undefined);
  assert.equal(sanitized.backupCode, undefined);
  assert.equal(sanitized.cookie, undefined);
  assert.equal(sanitized.authorization, undefined);
  assert.equal(sanitized.apiKey, undefined);
  assert.equal(sanitized.safeMeta, 'Metadado perfeitamente seguro');
  assert.equal(sanitized.nestedObject.password, undefined);
  assert.equal(sanitized.nestedObject.allowedKey, 'OK');

  // Testar inserção via repositório
  const logged = auditRepo.log({
    action: 'SECURITY_TEST_AUDIT',
    actor: 'admin',
    resource: '/test/secrets',
    status: 'SUCCESS',
    details: dirtyPayload,
  });

  assert.ok(logged.detailsJson);
  assert.equal(logged.detailsJson.includes('SuperSecretPassword123!'), false);
  assert.equal(logged.detailsJson.includes('JBSWY3DPEHPK3PXP'), false);
  assert.equal(logged.detailsJson.includes('ABCD-1234-EFGH-5678'), false);
  assert.equal(logged.detailsJson.includes('Metadado perfeitamente seguro'), true);
});

test('6. Filtros avançados de auditoria: busca por ação, status, ator e período', async () => {
  const now = new Date();
  const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString().split('T')[0];
  const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString().split('T')[0];

  const res = await fetch(
    `${baseUrl}/api/admin/audit-logs?action=USER_SUSPENDED&status=SUCCESS&actor=admin&startDate=${pastDate}&endDate=${futureDate}&search=alunoaudit`,
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-admin-token': adminToken,
      },
    }
  );

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.items.length >= 1);
  for (const item of data.items) {
    assert.equal(item.action, 'USER_SUSPENDED');
    assert.equal(item.status, 'SUCCESS');
    assert.ok(item.actor.includes('admin'));
  }
});

test('7. Paginação estruturada: page, limit, total e totalPages', async () => {
  const page1Res = await fetch(`${baseUrl}/api/admin/audit-logs?page=1&limit=2`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
    },
  });
  assert.equal(page1Res.status, 200);
  const page1Data = await page1Res.json();
  assert.equal(page1Data.page, 1);
  assert.equal(page1Data.limit, 2);
  assert.ok(page1Data.items.length <= 2);
  assert.ok(page1Data.total >= 2);
  assert.ok(page1Data.totalPages >= 1);

  const page2Res = await fetch(`${baseUrl}/api/admin/audit-logs?page=2&limit=2`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'x-admin-token': adminToken,
    },
  });
  assert.equal(page2Res.status, 200);
  const page2Data = await page2Res.json();
  assert.equal(page2Data.page, 2);
  assert.equal(page2Data.limit, 2);
});

test('8. Integridade no Banco (Trigger SQLite): UPDATE em audit_events é bloqueado com erro AUDIT_LOG_IMMUTABLE', async () => {
  const rawDb = getDb().getRawDb();
  const sampleEvent = rawDb.prepare('SELECT id FROM audit_events LIMIT 1').get() as any;
  assert.ok(sampleEvent?.id, 'Deve haver ao menos um evento gravado para testar imutabilidade');

  assert.throws(
    () => {
      rawDb.prepare("UPDATE audit_events SET action = 'HACKED_ACTION' WHERE id = ?").run(sampleEvent.id);
    },
    (err: any) => {
      return err?.message?.includes('AUDIT_LOG_IMMUTABLE');
    },
    'Trigger SQLite deve proibir UPDATE com mensagem AUDIT_LOG_IMMUTABLE'
  );
});

test('9. Integridade no Banco (Trigger SQLite): DELETE em audit_events é bloqueado com erro AUDIT_LOG_IMMUTABLE', async () => {
  const rawDb = getDb().getRawDb();
  const sampleEvent = rawDb.prepare('SELECT id FROM audit_events LIMIT 1').get() as any;
  assert.ok(sampleEvent?.id);

  assert.throws(
    () => {
      rawDb.prepare('DELETE FROM audit_events WHERE id = ?').run(sampleEvent.id);
    },
    (err: any) => {
      return err?.message?.includes('AUDIT_LOG_IMMUTABLE');
    },
    'Trigger SQLite deve proibir DELETE com mensagem AUDIT_LOG_IMMUTABLE'
  );
});

test('10. Integridade via API: verbos de mutação (PUT, PATCH, DELETE, POST) em /api/admin/audit-logs retornam 405', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      method,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-admin-token': adminToken,
      },
    });

    assert.equal(res.status, 405, `Método ${method} em /api/admin/audit-logs deve retornar 405`);
    const data = await res.json();
    assert.equal(data.error, 'METHOD_NOT_ALLOWED');
    assert.ok(data.message.includes('AUDIT_LOG_IMMUTABLE'));
  }
});
