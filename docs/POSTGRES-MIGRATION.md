# Migração SQLite → PostgreSQL

## Estado atual

O sistema ainda usa `node:sqlite` como runtime principal. A migração de dados foi preparada separadamente para permitir validação antes do cutover da aplicação.

Antes da migração, o SQLite deve passar `PRAGMA integrity_check` e `PRAGMA foreign_key_check`. O processo também exige backup criptografado validado.

## Ambiente local

1. Copie `.env.example` para `.env` e gere uma senha PostgreSQL local forte.
2. Defina `POSTGRES_PASSWORD` e `DATABASE_URL` apontando para o serviço `postgres`.
3. Inicie somente a infraestrutura:

```powershell
docker compose up -d postgres
docker compose ps
```

4. Execute a importação apenas contra um banco descartável/vazio:

```powershell
$env:ALLOW_POSTGRES_RESET = "true"
npm run migrate:postgres
```

O migrador lê o SQLite em modo somente leitura, cria o schema derivado do schema aplicado, preserva IDs, converte flags booleanas conhecidas para `BOOLEAN`, importa em lotes de 500 e confere a contagem de cada tabela.

## Segurança e rollback

- O SQLite original, o WAL e os backups não são apagados.
- `DATABASE_URL` não deve ser logada, versionada ou enviada ao frontend.
- O migrador não deve ser executado contra produção sem backup final, janela de manutenção e aprovação do cutover.
- Para rollback durante a validação, pare a aplicação PostgreSQL e volte a apontar a aplicação para o SQLite; mantenha o SQLite preservado durante a janela definida.
- O cutover da aplicação ainda requer a adaptação assíncrona da camada de repositórios, pois o runtime atual usa chamadas síncronas de `node:sqlite`. A migração de dados isolada não altera o driver em produção.

## Evidência desta preparação

- SQLite: `integrity_check=ok`
- Foreign keys: 0 violações
- Migrations SQLite aplicadas: 24
- Backup validado: `backup_2026-09-10T02-52-14-065Z-e9a612e21d44.json.gz`
- SHA-256: `013e8a20ec570eb4502843ba27b539ebada15f8dbed79cd127f8e2c80bbcedbd`

## Validação pós-cutover local

- PostgreSQL: saudável após reinício do Compose.
- Aplicação: executando com `DATABASE_URL` e ponte PostgreSQL ativa.
- Healthcheck HTTP: 200.
- Suíte de readiness: 24 grupos, 158 testes aprovados.
- Typecheck: aprovado.
- SQLite: mantido como rollback, sem remoção.
