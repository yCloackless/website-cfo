process.env.NODE_ENV ||= 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loginBackoffMs,
  loginIdentifierProtection,
  normalizeAuthIdentifier,
  claimPasswordResetRequest,
  pruneAuthAbuseState,
  resetAuthAbuseStateForTests,
} from '../src/services/authAbuseProtection';
import { assertTurnstileProductionConfig, isTurnstileRequired } from '../src/services/turnstilePolicy';

test('login identifiers are normalized and failure delay is progressive but bounded', () => {
  assert.equal(normalizeAuthIdentifier('  User@Example.COM '), 'user@example.com');
  assert.equal(loginBackoffMs(0), 0);
  assert.equal(loginBackoffMs(2), 250);
  assert.equal(loginBackoffMs(3), 500);
  assert.equal(loginBackoffMs(100), 2_000);
});

test('login identifier middleware delays repeated attempts without rejecting or locking the account', async () => {
  resetAuthAbuseStateForTests();
  const identifier = `throttle-${Date.now()}@example.test`;

  const attempt = async (statusCode: number) => {
    let finish = () => {};
    let nextCalled = false;
    const req = { body: { email: identifier } } as any;
    const res = {
      statusCode: 0,
      once: (_event: string, listener: () => void) => { finish = listener; },
    } as any;
    const start = Date.now();
    await new Promise<void>((resolve) => loginIdentifierProtection(req, res, () => { nextCalled = true; resolve(); }));
    res.statusCode = statusCode;
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(nextCalled, true);
    return Date.now() - start;
  };

  await attempt(401);
  await attempt(401);
  assert.ok(await attempt(401) >= 200, 'third attempt gets the first bounded delay');
  const validAttempt = await attempt(200);
  assert.ok(validAttempt < 1_000, 'a correct login is still allowed through');
  assert.ok(await attempt(401) < 200, 'successful login clears the failure state');
});

test('password reset claims are shared by account ID and expired local claims are pruned', async () => {
  resetAuthAbuseStateForTests();
  const accountId = `reset-${Date.now()}`;
  assert.equal(await claimPasswordResetRequest('first@example.test', accountId), true);
  assert.equal(await claimPasswordResetRequest('alternate-login', accountId), false);

  const unknownId = `unknown-${Date.now()}`;
  assert.equal(await claimPasswordResetRequest(unknownId), true);
  if (process.env.REDIS_URL || process.env.REDIS_TLS_URL) return;
  pruneAuthAbuseState(Date.now() + 16 * 60 * 1000);
  assert.equal(await claimPasswordResetRequest(unknownId), true);
});

test('Turnstile is optional in development/test and mandatory in production', () => {
  assert.doesNotThrow(() => assertTurnstileProductionConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv));
  assert.doesNotThrow(() => assertTurnstileProductionConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv));
  assert.equal(isTurnstileRequired({ NODE_ENV: 'development' } as NodeJS.ProcessEnv), false);
  assert.equal(isTurnstileRequired({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), true);
  assert.throws(
    () => assertTurnstileProductionConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION/,
  );
  assert.doesNotThrow(() => assertTurnstileProductionConfig({
    NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'placeholder-secret', TURNSTILE_SITE_KEY: 'placeholder-site',
  } as NodeJS.ProcessEnv));
});
