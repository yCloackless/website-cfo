import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupExpiredHoneypotRateLimitEntries,
  honeypotRateLimiter,
} from '../src/services/honeypot/honeypotRoutes';

test('limpa IPs expirados sem resetar contadores ativos do honeypot', () => {
  const realDateNow = Date.now;
  let now = realDateNow();
  Date.now = () => now;

  const invokeLimiter = (ip: string) => {
    let statusCode = 200;
    let body: unknown;
    let nextCalled = false;
    const req = {
      ip,
      method: 'GET',
      path: '/internal-admin',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      app: { get: () => undefined },
    } as any;
    const res = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as any;

    honeypotRateLimiter(req, res, () => { nextCalled = true; });
    return { statusCode, body, nextCalled };
  };

  try {
    const expiredIp = '198.51.100.241';
    const activeIp = '198.51.100.242';
    assert.equal(invokeLimiter(expiredIp).nextCalled, true);

    now += 60_001;
    assert.equal(invokeLimiter(activeIp).nextCalled, true);
    assert.ok(cleanupExpiredHoneypotRateLimitEntries(now) >= 1);

    for (let hit = 2; hit <= 15; hit++) {
      assert.equal(invokeLimiter(activeIp).nextCalled, true);
    }
    const blocked = invokeLimiter(activeIp);
    assert.equal(blocked.statusCode, 429);
    assert.equal((blocked.body as any).error, 'TOO_MANY_REQUESTS');
    assert.equal(invokeLimiter(expiredIp).nextCalled, true);
  } finally {
    Date.now = realDateNow;
  }
});
