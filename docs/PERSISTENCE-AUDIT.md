# Auditoria de persistência e integração do banco

## Resultado

| Área | Resultado | Evidência |
|---|---|---|
| Persistência do banco | OK | SQLite em `/app/data/cfo_app.sqlite`, WAL e migrations versionadas |
| Docker persistente | OK | volume nomeado `cfo_data:/app/data` |
| Progresso das aulas | OK | estado autenticado em `user_state_snapshots`, com fallback local offline |
| Bizuário | OK | payload completo sincronizado no banco; IndexedDB é apenas cache local |
| Configurações do usuário | OK | estado `cfo_*` sincronizado por usuário |
| Isolamento entre usuários | OK | chave primária `user_id` derivada da sessão, sem ID recebido do cliente |
| Migrations | OK | migration 008 aditiva; registros existentes são preservados |
| Backup | OK | backup online do SQLite via API nativa, checksum SHA-256 e cópia off-site opcional |

## Fluxo de dados

O estado de estudo segue `Frontend → /api/user/state autenticada → userStateRepo → SQLite`.
Ao iniciar uma sessão, o frontend hidrata o `localStorage` a partir do banco antes de carregar ciclos, revisões e Bizuário. Alterações subsequentes são enviadas com debounce. O token, username e role nunca entram no snapshot.

O snapshot contém as chaves persistentes `cfo_*` (ciclos, matérias, revisões, metas, Bizuário, cadernos, simulações e preferências) e chaves `anki_*`. O Bizuário também pode usar IndexedDB local para imagens, mas o payload completo é enviado ao snapshot para que o cache do navegador não seja fonte de verdade.

## Banco, volume e migrations

- Banco: SQLite nativo do Node (`node:sqlite`), `data/cfo_app.sqlite`.
- Em Docker: `/app/data` fica no volume nomeado `cfo_data`.
- A migration 008 cria `user_state_snapshots(user_id, payload_json, schema_version, created_at, updated_at)` com FK para `users`.
- Migrations são aplicadas uma única vez pela tabela `_migrations`; não há recriação automática do banco.

## Backup e restauração

O serviço inclui o SQLite por meio da API de backup nativa, evitando snapshot inconsistente do WAL, além de avatars, configurações e demais arquivos persistentes em `/app/data`. Use os procedimentos de [BACKUP.md](../BACKUP.md). Para proteção contra perda da máquina, configure `BACKUP_S3_*` e execute o perfil `offsite`.

## Operação segura

```powershell
docker compose build cfo-terminal
docker compose up -d cfo-terminal
docker compose exec cfo-terminal node dist/backup-cli.mjs create
docker compose --profile offsite run --rm backup-offsite
```

Não usar `docker compose down -v`, `docker volume rm` ou `docker system prune --volumes`. Esses comandos podem remover o volume que contém o banco.

## Proxy reverso

Em produção, configure `TRUSTED_PROXIES` no ambiente do Render com os IPs/CIDRs
oficiais do proxy que entrega tráfego ao processo, separados por vírgula. O valor
vazio (padrão) não confia em nenhum proxy. Nunca use `*` ou `true`. Só configure
`TRUST_CLOUDFLARE_HEADERS=true` quando o processo estiver atrás de um edge
Cloudflare confiável; caso contrário, o servidor ignora `CF-Connecting-IP`.

## Testes executados

- `npm run typecheck`
- `npm test` — 86 testes isolados de autenticação, perfil, segurança, administração e integração.
- `npx tsx scripts/readiness-storage.mjs` — backup/restauração de SQLite com WAL e arquivo binário.
- `npx tsx scripts/readiness-user-state.mjs` — migration 008, fechamento/reabertura do banco e isolamento de dois usuários.

## Observação operacional

O usuário precisa estar autenticado para sincronizar. Em uma indisponibilidade temporária da API, o frontend continua gravando localmente e reenvia ao voltar online; o servidor nunca substitui o estado de um usuário por dados enviados por outro usuário.
