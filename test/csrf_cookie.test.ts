process.env.NODE_ENV = 'test';
process.env.ADMIN_PASSWORD = 'fixture-admin-password-2026';
process.env.CADET_PASSWORD = 'fixture-cadet-password-2026';
process.env.CADET_PASSWORD_HASH = '';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AuthService } from '../src/db/authService';
import { getDb } from '../src/db/database';

const { app } = await import('../server');
let server: http.Server;
let baseUrl = '';
let cadetCookie = '';
let cadetToken = '';

test.before(async () => {
  await new AuthService(getDb()).ensureDefaultAccounts();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const login = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cadete', password: process.env.CADET_PASSWORD }),
  });
  const body = await login.json();
  cadetCookie = login.headers.get('set-cookie') || '';
  cadetToken = body.token;
  assert.equal(login.status, 200);
  assert.match(cadetCookie, /(?:^|;)\s*cfo_session=/);
  assert.ok(cadetToken);
});

test.after(() => server.close());

test('rejects cookie-authenticated mutation from a foreign origin', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cadetCookie, Origin: 'https://attacker.example' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'CSRF_ORIGIN_REJECTED',
    message: 'Origem da requisição não autorizada.',
  });
});

test('allows same-origin cookie requests and bearer requests without an Origin header', async () => {
  const sameOrigin = await fetch(`${baseUrl}/api/auth/verify-session`, {
    method: 'POST',
    headers: { Cookie: cadetCookie, Origin: baseUrl },
  });
  assert.equal(sameOrigin.status, 200);

  const bearer = await fetch(`${baseUrl}/api/auth/verify-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(bearer.status, 200);
});
