# Security setup notes

## Turnstile

Production startup requires both `TURNSTILE_SECRET_KEY` and `TURNSTILE_SITE_KEY`. Keep the secret only in the deployment secret manager. Without either value, production startup stops with `TURNSTILE_CONFIGURATION_REQUIRED_IN_PRODUCTION`.

Turnstile protects `POST /api/auth/check-credentials` and `POST /api/auth/verify-2fa`. Configured trusted administrator IPs and a valid signed 2FA challenge retain their existing bypass. `GET /api/auth/security-status` reports whether the current client must complete the challenge. Local Compose runs with `NODE_ENV=development`; development and tests can omit Turnstile.

## Local PostgreSQL roles

Compose initializes PostgreSQL using `POSTGRES_USER` as the bootstrap administrator and creates a separate `CFO_APP_DB_USER` / `CFO_APP_DB_PASSWORD` role for the application. The application role has `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, and `NOBYPASSRLS`; it receives database connect/temp access and `USAGE, CREATE` on `public`. Schema `CREATE` remains necessary because the application runs its versioned schema migrations during startup. Neither `DATABASE_URL` nor the application container receives the bootstrap password.

For a new volume, use distinct generated values for `POSTGRES_PASSWORD` and `CFO_APP_DB_PASSWORD`; `DATABASE_URL_DOCKER` must use the application credentials. PostgreSQL init scripts run automatically only for an empty volume.

For an existing local volume, preserve it. Set `POSTGRES_USER` to the administrator role already present in that cluster and set `CFO_APP_DB_USER` to a different role name. Then apply the mounted role script once:

```sh
docker compose exec -T postgres /docker-entrypoint-initdb.d/10-create-app-role.sh
```

Set `DATABASE_URL_DOCKER` to that application role before starting the app. Do not set the app role name equal to `POSTGRES_USER`; the setup script rejects that configuration. Removing `postgres_data` is only needed when intentionally discarding the local database.

## TLS CA configuration

PostgreSQL external/provider URLs use TLS with certificate verification. If the provider uses a private CA, set `DATABASE_SSL_CA` to the PEM certificate chain supplied by that provider. Render services should use the internal database URL over the provider private network; its standard internal hostname is treated as private traffic and uses no TLS because Render's optional internal TLS uses a self-signed certificate. Render external URLs use verified TLS. Redis `rediss://` connections also verify certificates; set `REDIS_TLS_CA` only when its provider supplies a private CA. These variables contain public CA certificates, never client private keys. Do not disable certificate verification.

## Untrusted Anki content

Users can author note fields and templates, and `.apkg` imports can contain arbitrary HTML. Content stays scoped to the importing account; there is no cross-account sharing route. The `/api/anki/cards/:id/render` response sanitizes rendered content before it reaches `AnkiReviewPlayer`. Allowed markup retains common text/table/image formatting and KaTeX's span markup. Scripts, iframes, objects, embeds, SVG/MathML, event attributes, `javascript:`/`data:` URLs, protocol-relative image URLs, style tags, and unapproved CSS values are removed. Relative Anki media paths and safe formatting styles remain supported.
