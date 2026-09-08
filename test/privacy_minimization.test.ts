import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import { UserRepository } from '../src/db/repositories';

let server: any;
let baseUrl = '';
let authService: AuthService;

test.before(async () => {
  const dbService = getDb();
  authService = new AuthService(dbService);
  await authService.ensureDefaultAccounts();

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});

// Helper: Get token for cadet or admin
async function getCadetToken(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD || 'fixture-cadet-password-2026' }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, 'Login falhou para cadete');
  assert.ok(data.token, 'Token deve ser retornado no login do cadete');
  return data.token;
}

async function getAdminToken(): Promise<string> {
  const loginResult = await authService.login('admin', process.env.ADMIN_PASSWORD || 'fixture-admin-password-2026');
  assert.ok(loginResult.token, 'Token deve ser gerado para admin via AuthService');
  return loginResult.token;
}

test('PRIVACY: Usuário comum recebe apenas os próprios dados no perfil', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/user/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.user);
  assert.equal(data.user.username, 'cadete');
  assert.ok(data.user.email);
  assert.equal(data.user.role, 'cadet');

  // Garante ausência total de campos sensíveis/internos
  assert.equal(data.user.passwordHash, undefined, 'passwordHash nunca deve ser exposto');
  assert.equal(data.user.password_hash, undefined, 'password_hash nunca deve ser exposto');
  assert.equal(data.user.totpSecret, undefined, 'totpSecret nunca deve ser exposto');
  assert.equal(data.user.recoveryCodes, undefined, 'recoveryCodes nunca deve ser exposto');
  assert.equal(data.user.sessionSecret, undefined, 'sessionSecret nunca deve ser exposto');
});

test('PRIVACY: Usuário comum é bloqueado de acessar lista global de usuários', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  assert.equal(res.status, 403);
  assert.equal(data.error, 'FORBIDDEN');
});

test('PRIVACY: Usuário comum é bloqueado de consultar dados de outro usuário por ID', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/admin/users/admin-id-test`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  assert.equal(res.status, 403);
  assert.equal(data.error, 'FORBIDDEN');
});

test('PRIVACY: Usuário comum é bloqueado de acessar endpoints de auditoria e dashboard admin', async () => {
  const token = await getCadetToken();

  const resAudit = await fetch(`${baseUrl}/api/admin/audit-logs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resAudit.status, 403);

  const resDash = await fetch(`${baseUrl}/api/admin/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resDash.status, 403);
});

test('PRIVACY: Admin recebe apenas campos permitidos em /api/admin/users (Sem hashes/secrets)', async () => {
  const token = await getAdminToken();

  const res = await fetch(`${baseUrl}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.items));

  for (const userItem of data.items) {
    assert.equal(userItem.passwordHash, undefined, 'passwordHash não deve estar presente no item da lista');
    assert.equal(userItem.password_hash, undefined);
    assert.equal(userItem.totpSecret, undefined);
    assert.equal(userItem.recoveryCodes, undefined);
  }
});

test('PRIVACY: Admin recebe detalhes de usuário em /api/admin/users/:id sem passwordHash ou secrets', async () => {
  const token = await getAdminToken();

  const userRepo = new UserRepository(getDb().getRawDb());
  const cadet = userRepo.findByUsername('cadete');
  assert.ok(cadet);

  const res = await fetch(`${baseUrl}/api/admin/users/${cadet.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.user);
  assert.equal(data.user.id, cadet.id);
  assert.equal(data.user.username, 'cadete');

  // Garante sanitização rigorosa
  assert.equal(data.user.passwordHash, undefined);
  assert.equal(data.user.password_hash, undefined);
  assert.equal(data.user.totpSecret, undefined);
  assert.equal(data.user.recoveryCodes, undefined);
});

test('PRIVACY: Varredura de payloads da API garante ausência de campos proibidos', async () => {
  const cadetToken = await getCadetToken();
  const adminToken = await getAdminToken();

  const forbiddenKeys = ['passwordHash', 'password_hash', 'totpSecret', 'totp_secret', 'sessionSecret', 'SESSION_SECRET', 'jwtSecret', 'dbPassword'];

  function scanObject(obj: any, path: string = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      assert.ok(!forbiddenKeys.includes(key), `Campo proibido '${key}' encontrado em ${path}.${key}`);
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        scanObject(obj[key], `${path}.${key}`);
      }
    }
  }

  // Respostas de rotas do usuário comum
  const endpointsUser = [
    '/api/user/profile',
    '/api/user/state',
    '/api/timer/status',
  ];

  for (const endpoint of endpointsUser) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${cadetToken}` },
    });
    const body = await res.json();
    scanObject(body, endpoint);
  }

  // Respostas de rotas administrativas
  const endpointsAdmin = [
    '/api/admin/users',
    '/api/admin/dashboard',
    '/api/admin/security/events',
    '/api/admin/security/metrics',
    '/api/admin/settings',
    '/api/admin/sessions',
    '/api/admin/admins',
  ];

  for (const endpoint of endpointsAdmin) {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    scanObject(body, endpoint);
  }
});
