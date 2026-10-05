import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getRedisClient, isRedisAvailable } from './redisService';

const WINDOW_SECONDS = 15 * 60;
const WINDOW_MS = WINDOW_SECONDS * 1000;
const MAX_LOCAL_KEYS = 10_000;
const failures = new Map<string, { count: number; expiresAt: number }>();
const resetClaims = new Map<string, number>();

export function normalizeAuthIdentifier(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function loginBackoffMs(count: number): number {
  return count < 2 ? 0 : Math.min(2_000, 250 * 2 ** Math.min(3, count - 2));
}

function scopedKey(scope: string, identifier: string): string {
  const digest = crypto.createHash('sha256').update(normalizeAuthIdentifier(identifier)).digest('hex');
  return `auth-abuse:${scope}:${digest}`;
}

export function pruneAuthAbuseState(now = Date.now()): void {
  for (const [key, state] of failures) if (state.expiresAt <= now) failures.delete(key);
  for (const [key, expiresAt] of resetClaims) if (expiresAt <= now) resetClaims.delete(key);

  if (failures.size > MAX_LOCAL_KEYS) {
    const oldest = [...failures.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (const [key] of oldest.slice(0, failures.size - MAX_LOCAL_KEYS)) failures.delete(key);
  }
  if (resetClaims.size > MAX_LOCAL_KEYS) {
    const oldest = [...resetClaims.entries()].sort((a, b) => a[1] - b[1]);
    for (const [key] of oldest.slice(0, resetClaims.size - MAX_LOCAL_KEYS)) resetClaims.delete(key);
  }
}

const cleanupTimer = setInterval(() => pruneAuthAbuseState(), 60_000);
cleanupTimer.unref?.();

async function getFailureCount(identifier: string): Promise<number> {
  if (!identifier) return 0;
  const key = scopedKey('login', identifier);
  if (isRedisAvailable()) {
    try { return Number(await getRedisClient()!.get(key)) || 0; } catch { /* use bounded local fallback */ }
  }
  pruneAuthAbuseState();
  return failures.get(key)?.count || 0;
}

async function recordFailure(identifier: string): Promise<void> {
  if (!identifier) return;
  const key = scopedKey('login', identifier);
  if (isRedisAvailable()) {
    try {
      await getRedisClient()!.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 or redis.call('PTTL',KEYS[1])<0 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
        1, key, WINDOW_SECONDS,
      );
      return;
    } catch { /* use bounded local fallback */ }
  }
  pruneAuthAbuseState();
  const current = failures.get(key);
  failures.set(key, current && current.expiresAt > Date.now()
    ? { count: current.count + 1, expiresAt: current.expiresAt }
    : { count: 1, expiresAt: Date.now() + WINDOW_MS });
  pruneAuthAbuseState();
}

async function clearFailures(identifier: string): Promise<void> {
  if (!identifier) return;
  const key = scopedKey('login', identifier);
  failures.delete(key);
  if (isRedisAvailable()) {
    try { await getRedisClient()!.del(key); } catch { /* local fallback already cleared */ }
  }
}

/** Adds short, bounded delays after failures; it never rejects or locks an account. */
export function loginIdentifierProtection(
  req: Request,
  res: Response,
  next: NextFunction,
  resolveAccountKey?: (normalizedIdentifier: string) => string | undefined,
): void {
  const normalizedIdentifier = normalizeAuthIdentifier(req.body?.email || req.body?.username);
  const identifier = normalizedIdentifier && (resolveAccountKey?.(normalizedIdentifier) || normalizedIdentifier);
  if (!identifier) return next();

  let completed = false;
  res.once('finish', () => {
    if (completed) return;
    completed = true;
    if (res.statusCode === 401 || res.statusCode === 403) void recordFailure(identifier);
    else if (res.statusCode >= 200 && res.statusCode < 400) void clearFailures(identifier);
  });

  void getFailureCount(identifier)
    .then((count) => setTimeout(next, loginBackoffMs(count)))
    .catch(() => next());
}

/** One reset email per account per window; aliases share the account ID key. */
export async function claimPasswordResetRequest(identifier: string, userId?: string): Promise<boolean> {
  const normalized = normalizeAuthIdentifier(userId ? `user:${userId}` : `identifier:${identifier}`);
  if (!normalized) return false;
  const key = scopedKey('password-reset', normalized);
  if (isRedisAvailable()) {
    try { return (await getRedisClient()!.set(key, '1', 'EX', WINDOW_SECONDS, 'NX')) === 'OK'; }
    catch { /* use bounded local fallback */ }
  }
  pruneAuthAbuseState();
  const expiry = resetClaims.get(key);
  if (expiry && expiry > Date.now()) return false;
  resetClaims.set(key, Date.now() + WINDOW_MS);
  pruneAuthAbuseState();
  return true;
}

export function resetAuthAbuseStateForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('TEST_ONLY');
  failures.clear();
  resetClaims.clear();
}
