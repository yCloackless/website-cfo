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
import { assertTurnstileProductionConfig, isTurnstileRequired, verifyTurnstileToken } from '../src/services/turnstilePolicy';

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

test('account aliases and IP changes share backoff while another account on the same IP stays independent', async () => {
  resetAuthAbuseStateForTests();
  const account = `alias-${Date.now()}`;
  const resolveAccount = (identifier: string) => identifier.includes(account) ? `user:${account}` : undefined;
  const attempt = async (body: unknown, ip: string, statusCode = 401) => {
    let finish = () => {};
    const req = { body, ip } as any;
    const res = { statusCode: 0, once: (_event: string, listener: () => void) => { finish = listener; } } as any;
    const start = Date.now();
    await new Promise<void>((resolve) => loginIdentifierProtection(req, res, () => resolve(), resolveAccount));
    res.statusCode = statusCode;
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    return Date.now() - start;
  };

  await attempt({ username: `  ${account.toUpperCase()}  ` }, '198.51.100.1');
  await attempt({ email: `${account}@example.test` }, '198.51.100.2');
  assert.ok(await attempt({ email: `  ${account.toUpperCase()}@EXAMPLE.TEST  ` }, '198.51.100.3') >= 200);
  assert.ok(await attempt({ username: 'unrelated-account' }, '198.51.100.3') < 200);
  await attempt({ username: account }, '198.51.100.4', 200);
  assert.ok(await attempt({ username: account }, '198.51.100.5') < 200);
});

test('simultaneous password reset claims issue only one request per account', async () => {
  resetAuthAbuseStateForTests();
  const accountId = `race-${Date.now()}`;
  const claims = await Promise.all(Array.from({ length: 16 }, (_, index) =>
    claimPasswordResetRequest(`alias-${index}@example.test`, accountId)));
  assert.equal(claims.filter(Boolean).length, 1);
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
  assert.throws(() => assertTurnstileProductionConfig({
    NODE_ENV: 'production', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', TURNSTILE_SITE_KEY: 'placeholder-site',
  } as NodeJS.ProcessEnv), /TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION/);
  assert.throws(() => assertTurnstileProductionConfig({
    NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'placeholder-secret', TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  } as NodeJS.ProcessEnv), /TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION/);
});

test('Turnstile validates strict Siteverify success and rejects invalid, expired, reused or malformed tokens', async () => {
  const env = { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'fixture-secret', TURNSTILE_SITE_KEY: 'fixture-site' } as NodeJS.ProcessEnv;
  let signalSeen = false;
  const siteverify = (body: unknown, status = 200) => (async (_url: RequestInfo | URL, init?: RequestInit) => {
    signalSeen = init?.signal instanceof AbortSignal;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

  assert.equal(await verifyTurnstileToken(undefined, undefined, env, siteverify({ success: true })), false);
  assert.equal(await verifyTurnstileToken('valid', '127.0.0.1', env, siteverify({ success: true })), true);
  assert.equal(signalSeen, true, 'Siteverify must have a bounded request timeout');
  for (const result of [
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: 'true' },
    null,
  ]) {
    assert.equal(await verifyTurnstileToken('invalid', undefined, env, siteverify(result)), false);
  }
  assert.equal(await verifyTurnstileToken('token', undefined, env, siteverify({ success: true }, 503)), false);
  assert.equal(await verifyTurnstileToken('token', undefined, env, (async () => { throw new Error('simulated timeout'); }) as typeof fetch), false);
  assert.equal(await verifyTurnstileToken('token', undefined, env, (async () => new Response('not-json')) as typeof fetch), false);

  let calls = 0;
  const oneUseToken = (async () => new Response(JSON.stringify({ success: ++calls === 1 }))) as typeof fetch;
  assert.equal(await verifyTurnstileToken('one-use', undefined, env, oneUseToken), true);
  assert.equal(await verifyTurnstileToken('one-use', undefined, env, oneUseToken), false);
});

test('development dummy Turnstile key accepts only its dummy token', async () => {
  const env = { NODE_ENV: 'development', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' } as NodeJS.ProcessEnv;
  assert.equal(await verifyTurnstileToken('XXXX.DUMMY.TOKEN.XXXX', undefined, env), true);
  assert.equal(await verifyTurnstileToken('unrelated-token', undefined, env), false);
});
