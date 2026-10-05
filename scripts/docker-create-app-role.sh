#!/bin/sh
set -eu

: "${CFO_APP_DB_USER:?CFO_APP_DB_USER is required}"
: "${CFO_APP_DB_PASSWORD:?CFO_APP_DB_PASSWORD is required}"
[ "$CFO_APP_DB_USER" != "$POSTGRES_USER" ] || { echo 'CFO_APP_DB_USER must differ from POSTGRES_USER.' >&2; exit 2; }

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=app_user="$CFO_APP_DB_USER" \
  --set=app_password="$CFO_APP_DB_PASSWORD" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_user', :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
  :'app_user', :'app_password'
)
\gexec

SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO %I', current_database(), :'app_user')
\gexec
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";

SELECT format('REVOKE %I FROM %I', granted.rolname, :'app_user')
FROM pg_auth_members m
JOIN pg_roles granted ON granted.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname = :'app_user'
\gexec

SELECT format('ALTER TABLE %I.%I OWNER TO %I', schemaname, tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'public' AND tableowner = current_user
\gexec

SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I', schemaname, sequencename, :'app_user')
FROM pg_sequences
WHERE schemaname = 'public' AND sequenceowner = current_user
\gexec
SQL
