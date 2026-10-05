const TEST_SECRET_KEYS = new Set([
  '1x0000000000000000000000000000000AA',
  '2x0000000000000000000000000000000AA',
  '3x0000000000000000000000000000000AA',
]);
const TEST_SITE_KEYS = new Set([
  '1x00000000000000000000AA',
  '2x00000000000000000000AB',
  '1x00000000000000000000BB',
  '2x00000000000000000000BB',
  '3x00000000000000000000FF',
]);

export function assertTurnstileProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  if (!secret || !siteKey || TEST_SECRET_KEYS.has(secret) || TEST_SITE_KEYS.has(siteKey)) {
    throw new Error('TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION');
  }
}

export function isTurnstileRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.TURNSTILE_SECRET_KEY?.trim());
}

export async function verifyTurnstileToken(
  token?: string,
  remoteip?: string,
  env: NodeJS.ProcessEnv = process.env,
  verifyFetch: typeof fetch = fetch,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || !token || (env.NODE_ENV === 'production' && TEST_SECRET_KEYS.has(secret))) return false;
  if (env.NODE_ENV !== 'production' && secret === '1x0000000000000000000000000000000AA') {
    return token === 'XXXX.DUMMY.TOKEN.XXXX';
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteip) body.set('remoteip', remoteip);
    const response = await verifyFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true;
  } catch (error) {
    console.error('[Turnstile] Falha ao validar token com Cloudflare:', error);
    return false;
  }
}
