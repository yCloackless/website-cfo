export function postgresConnectionOptions(databaseUrl: string, env: NodeJS.ProcessEnv = process.env) {
  const parsed = new URL(databaseUrl);
  if (!env.RENDER && /^dpg-[a-z0-9]+$/i.test(parsed.hostname)) parsed.hostname += '.oregon-postgres.render.com';
  const privateNetworkHost = parsed.hostname === 'postgres' || parsed.hostname === 'postgres-staging' ||
    (Boolean(env.RENDER) && /^dpg-[a-z0-9-]+$/i.test(parsed.hostname));
  if (privateNetworkHost) parsed.searchParams.delete('sslmode');

  const requiresTls = !privateNetworkHost && (
    parsed.searchParams.get('sslmode') === 'require' ||
    env.NODE_ENV === 'production' ||
    parsed.hostname.endsWith('.neon.tech') ||
    parsed.hostname.endsWith('.render.com') ||
    parsed.hostname.endsWith('.supabase.co')
  );
  return {
    connectionString: parsed.toString(),
    ...(requiresTls ? { ssl: { rejectUnauthorized: true as const, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}) } } : {}),
  };
}
