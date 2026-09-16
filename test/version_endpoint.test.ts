process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';

const { app } = await import('../server');

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  const db = getDb();
  const authService = new AuthService(db);
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

test('Zero-Downtime Deploy & Telemetria de Versão', async (t) => {
  await t.test('1. GET /api/version responde com status 200 e payload de telemetria válido', async () => {
    const res = await fetch(`${baseUrl}/api/version`);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('no-store'), 'Cache-Control deve proibir cache para sincronização em tempo real.');

    const data = await res.json();
    assert.ok(typeof data.version === 'string' && data.version.length > 0, 'Deve retornar a versão da aplicação.');
    assert.ok(typeof data.startedAt === 'number' && data.startedAt > 0, 'Deve conter o timestamp de boot do servidor.');
    assert.ok(typeof data.timestamp === 'number' && data.timestamp >= data.startedAt, 'Timestamp de consulta deve ser coerente.');
  });

  await t.test('2. GET /sw.js responde com cabeçalho Service-Worker-Allowed e sem cache', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('service-worker-allowed'), '/');
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('no-cache') || cacheControl?.includes('no-store'));
  });
});
