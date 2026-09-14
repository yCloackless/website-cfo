process.env.NODE_ENV = 'test';
process.env.SECURITY_TEST_ALLOWLIST_KEY = 'authorized-pentest-scan-key-2026';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import { SessionRepository, SystemIntegrationRepository } from '../src/db/repositories';

const { app } = await import('../server');

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let sessionRepo: SessionRepository;
let systemRepo: SystemIntegrationRepository;
let adminToken: string;
let cadetToken: string;
let cadetUserId: string;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  sessionRepo = new SessionRepository(db.getRawDb());
  systemRepo = new SystemIntegrationRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;

  const userRepo = new (await import('../src/db/repositories')).UserRepository(db.getRawDb());

  // Garante usuário admin e cria sessão direta
  let adminUser = userRepo.findByUsername('admin');
  if (!adminUser) {
    adminUser = userRepo.create({
      email: 'admin_test@cbmerj.com',
      username: 'admin',
      passwordHash: 'dummy_hash',
      role: 'admin',
    });
  }
  const adminSession = sessionRepo.createSession({ userId: adminUser.id, role: 'admin' });
  adminToken = adminSession.rawToken;

  // Garante usuário cadete e cria sessão direta
  const cadetEmail = `cadet_${Date.now()}@teste.com`;
  const cadetUser = userRepo.create({
    email: cadetEmail,
    username: `cadet_${Date.now()}`,
    passwordHash: 'dummy_hash',
    role: 'cadet',
  });
  cadetUserId = cadetUser.id;
  const cadetSession = sessionRepo.createSession({ userId: cadetUser.id, role: 'cadet' });
  cadetToken = cadetSession.rawToken;

  // Garante que iniciamos sem lockdown
  systemRepo.set('maintenance_config', JSON.stringify({
    global: false,
    message: '',
    pages: {},
    updatedAt: new Date().toISOString(),
  }));
});

test.after(async () => {
  // Restaura estado limpo
  systemRepo.set('maintenance_config', JSON.stringify({
    global: false,
    message: '',
    pages: {},
    updatedAt: new Date().toISOString(),
  }));
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Emergency Lockdown & Server Restart Suite', async (t) => {
  await t.test('1. Sistema opera normalmente com lockdown desativado', async () => {
    const res = await fetch(`${baseUrl}/api/maintenance/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.global, false);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.lockdown, false);
  });

  await t.test('2. Tentativa de acionar lockdown ou restart sem privilégios de escrita admin é rejeitada (403)', async () => {
    // Sem token
    const resNoAuth = await fetch(`${baseUrl}/api/admin/system/emergency-lockdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });
    assert.equal(resNoAuth.status, 403);

    // Com token de cadete
    const resCadet = await fetch(`${baseUrl}/api/admin/system/emergency-lockdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cadetToken}`,
      },
      body: JSON.stringify({ active: true }),
    });
    assert.equal(resCadet.status, 403);

    // Restart sem auth
    const restartNoAuth = await fetch(`${baseUrl}/api/admin/system/restart`, {
      method: 'POST',
    });
    assert.equal(restartNoAuth.status, 403);
  });

  await t.test('3. Admin aciona o Modo de Emergência / Kill Switch com encerramento de sessões', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system/emergency-lockdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        active: true,
        message: '🚨 Incidente de segurança detectado. Acesso restrito a administradores.',
        revokeActiveSessions: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.config.global, true);
    assert.ok(typeof body.revokedSessions === 'number');

    // Confirma que /api/health reporta lockdown: true
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.lockdown, true);
  });

  await t.test('4. Durante o lockdown, requisições de alunos e anônimos são barradas no backend com 503 SYSTEM_LOCKDOWN', async () => {
    // Tentativa de login/verificação de credenciais por aluno
    const authRes = await fetch(`${baseUrl}/api/auth/check-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'aluno_teste', password: '123' }),
    });
    assert.equal(authRes.status, 503);
    const authBody = await authRes.json();
    assert.equal(authBody.error, 'SYSTEM_LOCKDOWN');
    assert.equal(authBody.lockdown, true);
    assert.ok(authBody.message.includes('Incidente de segurança'));

    // Tentativa de acessar rota de usuário com token de cadete
    const userRes = await fetch(`${baseUrl}/api/user/profile`, {
      headers: { Authorization: `Bearer ${cadetToken}` },
    });
    assert.equal(userRes.status, 503);
    const userBody = await userRes.json();
    assert.equal(userBody.error, 'SYSTEM_LOCKDOWN');
  });

  await t.test('5. Durante o lockdown, rotas administrativas continuam operando normalmente para o Admin', async () => {
    const adminRes = await fetch(`${baseUrl}/api/admin/verify`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.success, true);
    assert.equal(adminBody.verified, true);
    assert.equal(adminBody.user.role, 'admin');

    // Consulta de eventos de segurança no admin continua funcionando
    const secRes = await fetch(`${baseUrl}/api/admin/security/metrics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(secRes.status, 200);
  });

  await t.test('6. Comando de Reinicialização Tática responde com sucesso para o Administrador', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system/restart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes('reinicialização'));
    assert.equal(body.restartingInMs, 800);
  });

  await t.test('7. Admin desativa o modo de emergência e restaura as operações normais', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system/emergency-lockdown`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        active: false,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.config.global, false);

    // Verifica que rota de auth voltou a responder (400 por campos vazios, mas não 503)
    const authRes = await fetch(`${baseUrl}/api/auth/check-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.notEqual(authRes.status, 503);
    assert.equal(authRes.status, 400);

    // Status de saúde voltou a ter lockdown: false
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthBody = await healthRes.json();
    assert.equal(healthBody.lockdown, false);
  });
});
