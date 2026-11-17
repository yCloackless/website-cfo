export function postgresConnectionOptions(databaseUrl: string, env: NodeJS.ProcessEnv = process.env) {
  const parsed = new URL(databaseUrl);
  if (!env.RENDER && /^dpg-[a-z0-9]+$/i.test(parsed.hostname)) parsed.hostname += '.oregon-postgres.render.com';
  const privateNetworkHost = parsed.hostname === 'postgres' || parsed.hostname === 'postgres-staging' ||
    (Boolean(env.RENDER) && /^dpg-[a-z0-9-]+$/i.test(parsed.hostname));
  if (privateNetworkHost) parsed.searchParams.delete('sslmode');

  const sslMode = parsed.searchParams.get('sslmode')?.toLowerCase();
  const aliasSslMode = sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca';
  const requiresTls = !privateNetworkHost && (
    aliasSslMode ||
    sslMode === 'verify-full' ||
    env.NODE_ENV === 'production' ||
    parsed.hostname.endsWith('.neon.tech') ||
    parsed.hostname.endsWith('.render.com') ||
    parsed.hostname.endsWith('.supabase.co') ||
    parsed.hostname.endsWith('.supabase.com')
  );
  if (requiresTls && aliasSslMode && parsed.searchParams.get('uselibpqcompat') !== 'true') {
    // pg-connection-string emits a SECURITY WARNING for prefer/require/verify-ca;
    // ssl.rejectUnauthorized=true already enforces verify-full semantics.
    parsed.searchParams.set('sslmode', 'verify-full');
  }
  return {
    connectionString: parsed.toString(),
    ...(requiresTls ? { ssl: { rejectUnauthorized: true as const, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) } } : {}),
  };
}
