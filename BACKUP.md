# Backup e recuperação — CFO CBMERJ

## O que é protegido

O serviço salva o conteúdo persistente de `/app/data`, incluindo o SQLite
`cfo_app.sqlite`, arquivos de configuração, auditoria, cache e estados do
aplicativo. O diretório `/app/data/backups` não é incluído no próprio snapshot.
O volume Docker `cfo_data` mantém esses dados entre recriações do container.

Cada backup é `backup_<data-hora>-<id>.json.gz` acompanhado de `.sha256` e do
índice `backup-index.json`. O SQLite é copiado com a API de backup do próprio
Node, evitando copiar um banco WAL de modo inconsistente.

## Frequência e retenção

- Automático diariamente na janela de 03:00–03:15, horário local do container.
- Manual a qualquer momento pelo CLI ou pela API administrativa.
- Retenção: arquivos dos últimos 30 dias e, no mínimo, os 5 mais recentes.
- Backups locais podem ser perdidos junto com a máquina Docker. Para uma cópia
  externa, configure as variáveis `BACKUP_S3_*` no `.env` e execute o perfil
  `offsite` do Compose.

## Comandos Docker

Backup manual:

```powershell
docker compose exec cfo-terminal node dist/backup-cli.mjs create
```

Verificação de integridade:

```powershell
docker compose exec cfo-terminal node dist/backup-cli.mjs verify <arquivo>.json.gz
```

Enviar `/app/data/backups` para S3/R2:

```powershell
docker compose --profile offsite run --rm backup-offsite
```

O serviço de aplicação não publica banco algum; somente a aplicação expõe a
porta 3000. O perfil externo é opcional e usa apenas credenciais do `.env`.

## Restauração

Restauração é uma operação offline. Primeiro faça um backup atual e pare
somente o serviço da aplicação, preservando o volume:

```powershell
docker compose exec cfo-terminal node dist/backup-cli.mjs create
docker compose stop cfo-terminal
docker compose run --rm cfo-terminal node dist/backup-cli.mjs restore <arquivo>.json.gz
docker compose start cfo-terminal
docker compose logs --tail=100 cfo-terminal
```

O restore valida SHA-256 e o formato antes de substituir arquivos. Ele também
cria uma salvaguarda automática antes da substituição. Nunca use
`docker compose down -v` durante recuperação.

## Dados sensíveis

Backups podem conter dados pessoais, hashes de senha, sessões e registros de
auditoria. Proteja o volume e o bucket, restrinja acesso e não versione `.env`,
backups, checksums ou `/data`.
