# Operação de produção

## Antes do deploy

```sh
npm ci
npm run lint
npm test
npm run build
```

O workflow `.github/workflows/ci.yml` executa os quatro comandos em todo push para
`main` e em pull request. O deploy só deve usar uma imagem cujo CI esteja verde.

## Ambientes

- Produção: `docker-compose.yml`, `NODE_ENV=production`, `DATABASE_URL` de produção
  e secrets próprios.
- Staging: `docker-compose.staging.yml`, `.env.staging` e banco separado.
- Nunca reutilizar `SESSION_SECRET`, credenciais PostgreSQL, chaves de backup ou
  `RESEND_API_KEY` entre os ambientes.

## Backup e recuperação

O servidor cria o backup local diário às 03:00 e mantém 30 dias. Para habilitar a
cópia externa contínua, configure `BACKUP_S3_*` no secret store e inicie:

```sh
docker compose --profile offsite up -d backup-offsite
```

O container sincroniza `/app/data/backups` uma vez por dia. Verifique o resultado
no bucket e execute mensalmente uma restauração em ambiente descartável:

```sh
docker compose exec cfo-terminal node dist/backup-cli.mjs create
docker compose exec cfo-terminal node dist/backup-cli.mjs verify <arquivo>.json.gz
docker compose run --rm cfo-terminal node dist/backup-cli.mjs restore <arquivo>.json.gz
```

Restauração exige manutenção offline. Preserve o backup de segurança criado antes
da substituição e valide `/api/ready`, login, flashcards, provas e uploads depois.

## Checklist externo obrigatório

- Apontar domínio próprio para o proxy/hospedagem e confirmar redirect HTTP→HTTPS.
- Confirmar certificado, renovação, HSTS e `APP_URL` HTTPS.
- Configurar SPF, DKIM e DMARC no DNS do domínio de envio; testar recuperação de senha.
- Configurar monitor de uptime para `/api/health` e alerta para `/api/ready` diferente de 200.
- Monitorar erros frontend/backend, latência, CPU, memória, disco, PostgreSQL e idade
  do último backup.
- Testar em pelo menos um Android e um iPhone: login, navbar, modal, calendário,
  flashcards, tabela, upload, logout e zoom de 200%.

Esses itens dependem do provedor, DNS, secret store e aparelhos; não são simulados
por um build local.
