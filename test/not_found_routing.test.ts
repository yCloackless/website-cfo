process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';

const { app } = await import('../server');

let server: http.Server;
let baseUrl: string;
let authService: AuthService;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (server) {
    (server as any).closeAllConnections?.();
    server.close();
  }
});

test('1. Rota pública legítima (/api/health) responde com status 200 e status healthy', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.service, 'cfo-cbmerj-backend');
});

test('1a. Readiness verifica o banco sem expor detalhes internos', async () => {
  const res = await fetch(`${baseUrl}/api/ready`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ready' });
  assert.match(res.headers.get('x-request-id') || '', /^[a-z0-9-]{36}$/i);
});

test('1b. Request ID fornecido em formato seguro é propagado', async () => {
  const res = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Request-ID': 'readiness-check-2026' } });
  assert.equal(res.headers.get('x-request-id'), 'readiness-check-2026');
});

test('2. Rota de API inexistente simples (/api/nonexistent-endpoint-12345) retorna HTTP 404 e JSON seguro', async () => {
  const res = await fetch(`${baseUrl}/api/nonexistent-endpoint-12345`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  
  const data = await res.json();
  assert.deepEqual(data, { error: 'Not Found' });

  // Segurança: Garante que nenhum detalhe de infraestrutura, arquivo ou stacktrace é vazado
  const rawBody = JSON.stringify(data);
  assert.equal(rawBody.includes('stack'), false);
  assert.equal(rawBody.includes('server.ts'), false);
  assert.equal(rawBody.includes('node_modules'), false);
});

test('3. Rota de API inexistente aninhada (/api/v1/invalid/deep/path) retorna HTTP 404 e JSON seguro', async () => {
  const res = await fetch(`${baseUrl}/api/v1/invalid/deep/path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: true }),
  });
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.deepEqual(data, { error: 'Not Found' });
});

test('4. Rotas de API decoy (Honeypot) continuam ativas e não caem no 404 genérico', async () => {
  // /api/internal é uma rota decoy honeypot e deve retornar seu 403 específico
  const internalRes = await fetch(`${baseUrl}/api/internal`);
  assert.equal(internalRes.status, 403);
  const internalData = await internalRes.json();
  assert.equal(internalData.error, 'FORBIDDEN_INTERNAL_SERVICE');

  // /api/debug é uma rota decoy honeypot
  const debugRes = await fetch(`${baseUrl}/api/debug`);
  assert.equal(debugRes.status, 403);
  const debugData = await debugRes.json();
  assert.equal(debugData.error, 'FORBIDDEN_INTERNAL_SERVICE');
});

test('5. Rotas frontend inexistentes não quebram o servidor e são tratadas para SPA', async () => {
  // Rota inexistente aleatória
  const resRandom = await fetch(`${baseUrl}/this-page-does-not-exist-12345`);
  assert.ok(resRandom.status === 200 || resRandom.status === 404);

  // Rota inexistente aninhada
  const resNested = await fetch(`${baseUrl}/dashboard/invalid-page`);
  assert.ok(resNested.status === 200 || resNested.status === 404);

  // Rota admin inexistente
  const resAdminInvalid = await fetch(`${baseUrl}/admin/invalid-route`);
  assert.ok(resAdminInvalid.status === 200 || resAdminInvalid.status === 404);
});

test('6. Autenticação legítima de administrador continua intacta', async () => {
  const login = await authService.login('admin@cbmerj.com', 'fixture-admin-password-2026');
  assert.equal(login.success, true);
  assert.ok(login.token);

  // Consulta autenticada a rota administrativa existente continua funcionando normalmente
  const verifyRes = await fetch(`${baseUrl}/api/admin/verify`, {
    headers: { Authorization: `Bearer ${login.token}` },
  });
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.verified, true);
  assert.equal(verifyData.user.role, 'admin');
});
