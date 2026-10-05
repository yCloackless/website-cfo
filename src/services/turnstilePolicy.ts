export function assertTurnstileProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (!env.TURNSTILE_SECRET_KEY?.trim() || !env.TURNSTILE_SITE_KEY?.trim()) {
    throw new Error('TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION');
  }
}

export function isTurnstileRequired(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.TURNSTILE_SECRET_KEY?.trim());
}
