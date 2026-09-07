# GSD — FASE 13: Production Readiness

**Data:** 2026-09-07 · **Base auditada:** `b26c722` · **Decisão: NÃO PRONTO PARA PRODUÇÃO.**

Esta revisão substitui as conclusões anteriores deste checklist. Há blockers reproduzidos em autenticação, exposição de código/segredos e integridade dos dados. Build e testes existentes aprovados não representam aprovação de produção.

## Escopo e método

- Revisão do backend, autenticação, persistência, configurações de build/deploy, integrações, testes e documentação. Não foi localizado `AGENTS.md`; `.agents/rules/github-sempre.md` contém somente metadados.
- Nenhuma funcionalidade nova ou correção de produto nesta fase: somente verificadores e documentação.
- Testes em diretórios temporários exclusivos, com credenciais sintéticas e bancos descartáveis. Os servidores de teste não carregaram o `.env` nem o banco de uso local.
- Os 11 arquivos da suíte existente foram executados separadamente, cada um com seu próprio diretório de trabalho. Isso evita colisões entre testes que usam `getDb()`. Não equivale a validar a execução concorrente de `npm test` no diretório normal.
- Build real com `npm run build`, seguido de execução de `dist/server.cjs` em `NODE_ENV=production`, exercitado por HTTP e SSE locais.
- Recuperação em produção usou código sintético inserido no banco descartável; nenhum e-mail real foi enviado.
- Não houve E2E de navegador, inspeção visual, acesso à hospedagem, teste de TLS público ou teste real dos serviços externos. `frontend_integration` testa APIs, não cliques no navegador.
- Evidências sanitizadas: [PRODUCTION-RESULTS.json](./PRODUCTION-RESULTS.json), sem senhas, códigos, tokens ou valores do `.env`.

## Execuções

| Verificação | Resultado |
|---|---|
| TypeScript | `tsc --noEmit --incremental false`: exit 0 |
| Build real | Vite 6.4.3 + esbuild: exit 0; 2.715 módulos transformados |
| Suíte existente isolada | **81 testes aprovados; 0 falhas** |
| HTTP do backend compilado em produção | **32 verificações: 23 aprovadas, 9 falhas** |
| Backup/restauração e upgrade povoado | **2 verificações; ambas falharam** |
| Busca literal de secrets | 9 valores privados em 5 artefatos textuais; correspondências de 5 variáveis no backend e mapa |
| Git | `.env` ignorado; não incluído na entrega |
| Runtime utilizado | Node.js 24.20.0 / Windows; Docker Node 22 não executado |

O build inicialmente falhou por restrição de leitura do sandbox. A execução autorizada fora do sandbox passou; a restrição não foi classificada como defeito do projeto.

## Blockers de código/dados

| ID | Severidade | Evidência | Condição para liberar |
|---|---|---|---|
| B1 | CRÍTICO | `/server.cjs` e `/server.cjs.map` retornam **200 sem login**, com 240.377 e 433.857 caracteres. `express.static(distPath)` expõe também o backend. Valores locais de cinco variáveis coincidem com constantes nesses artefatos. | Servir somente frontend; retirar backend/maps do diretório público; eliminar defaults privados e rotacionar valores expostos; confirmar 403/404 nesses caminhos. |
| B2 | CRÍTICO | Reset retorna **200**, mas login com senha nova retorna **401** e senha anterior **200**. Login consulta constantes/env; recuperação altera o banco. | Unificar autoridade das credenciais; validar nova senha, rejeitar anterior e invalidar sessões; repetir também com admin. |
| B3 | ALTO | Token emitido pelo login, com `expires_at` passado no banco, continua retornando **200** em `verify-session`. Fallback HMAC aceita a validade do payload. | Expiração/estado no banco devem prevalecer; testar também suspensão, remoção e mudança de papel com sessões HMAC. |
| B4 | CRÍTICO | Backup/restauração real de SQLite fechado com conteúdo binário produz bytes diferentes. `backupService.ts` lê/grava arquivos como UTF-8. | Backup consistente que preserve bytes e WAL; comprovar restauração, integridade e registros. SHA-256 do gzip não resolve corrupção anterior à compactação. |
| B5 | CRÍTICO | Upgrade da migration 5 para 7 com usuário e perfil deixa **0 perfis**. Migration 6 tenta desligar foreign keys dentro da transação e executa `DROP TABLE users`, acionando cascatas. | Migration segura com banco povoado, preservando perfis e demais relacionamentos; validar recuperação antes de executar sobre usuários reais. |
| B6 | ALTO | Probe em `/api/ai/nonexistent-audit-probe`, Host não local e e-mail autorizado forjado, alcança fallback SPA (**200**) em vez de rejeição do middleware. Nenhum provedor foi chamado. | Autorizar IA por sessão validada; não confiar em e-mail do cliente ou sessão global de Calendar. |
| B7 | ALTO | `POST /api/timer/start` anônimo retorna **200** e altera timer global descartável. | Exigir autorização/isolar usuário; revisar também Calendar e demais estados globais. |
| B8 | ALTO | SSE já aberto recebe novo `LOGIN_FAILED` depois de logout/revogação do admin. | Encerrar/revalidar conexões após expiração, revogação ou perda de permissão. |
| B9 | BLOQUEIO DO DEPLOY DOCKER | Dockerfile não copia `notionBackend.ts`, importado pelo servidor. Achado estático; Docker CLI não disponível. | Corrigir entradas e executar build/start da imagem efetivamente usada. |

Referências: `server.ts` (`startServer`, `check-credentials`, `verifyTerminalSession`, middleware IA, timer e SSE); `src/services/backupService.ts`; `src/db/database.ts` (migration 6).

## Fluxos e E2E de API

| Fluxo | Resultado e limite |
|---|---|
| Login válido/inválido | Cadete inicial 200; senha incorreta 401; **falha após recuperação B2**. |
| Sessão ativa | Token emitido validado no HTTP real. |
| Sessão expirada | Testes de repositório passam; token HMAC emitido no login ignora expiração no banco: **B3**. |
| Sessão revogada/logout | Nova chamada HTTP rejeita token revogado; SSE aberto é exceção **B8**. |
| Perfil | GET e PATCH reais; nome persiste; role injetada no PATCH não promove cadete. Suíte cobre ownership/avatar. |
| Recuperação | Suíte cobre código inválido, expiração e consumo; produção omite `debugCode`. Reset altera banco, mas **fluxo completo reprova B2**. Entrega real pendente. |
| 2FA | Admin exige segunda etapa; ausência retorna 400; TOTP válido emite sessão. Suíte cobre TOTP errado, recovery code, replay e step-up. |
| Usuário comum/acesso admin | Cadete e anônimo recebem 403 em `/api/admin/users`. |
| Admin/usuários | Listagem real; suíte cobre suporte somente leitura, suspensão, reativação, papel, revogação e proteção do admin mestre. Login público de contas arbitrárias não demonstrado. |
| Segurança | APIs de eventos acessíveis ao admin; falhas geram eventos; login excedente retorna 429. Ressalvas B1/B3/B6/B7/B8. |
| Realtime | Handshake real; suíte cobre entrega, múltiplos clientes, replay e desconexão. Revogação com stream aberto falha. |
| Auditoria | API real; testes de filtros, paginação, sanitização e triggers contra UPDATE/DELETE passam. |
| Navegador ponta a ponta | **Não executado**: cliques, renderização, storage do navegador, troca de rede e experiência móvel permanecem pendentes. |

Parte de `security_review.test.ts` simula CORS/autorização em funções locais. Resultados positivos desses testes não substituem endpoints reais. A suíte existente não detectou os blockers reproduzidos pelos novos probes.

## Revisão de produção

| Área | Estado e pendência |
|---|---|
| HTTPS | TLS depende do proxy/hospedagem. Certificado, renovação e redirect público não verificados. HSTS não comprova HTTPS operacional. |
| Cookies Secure/HttpOnly/SameSite | Login não emite `Set-Cookie`: usa Bearer/localStorage. Flags **não aplicáveis à sessão atual**, não marcar como implementadas. Token acessível a JavaScript. |
| CSRF | Bearer explícito reduz CSRF clássico baseado em cookies; não há proteção dedicada identificada. Não declarar imunidade global: há mutações anônimas e OAuth requer revisão específica. |
| CORS | Origem externa rejeitada sem ACAO no HTTP real, mas com **500**, não 403. Comparação normalizada; localhost permanece na whitelist de produção; `credentials: true`. |
| Headers | CSP/HSTS/nosniff presentes na página. CSP permite `unsafe-inline` e `unsafe-eval`. Health registrado antes de Helmet/CORS/rate limiter. |
| Rate limits | API 350/15min; login 15/15min; 2FA 10/15min. Login confirmou 429. Estado em memória, não distribuído; carga não testada. |
| ENV | Startup aceita hashes OU senhas; `ensureDefaultAccounts()` exige senhas em produção: configuração apenas por hashes é inconsistente. Suporte usa fallback sem exigência de `SUPPORT_PASSWORD`. |
| Secrets | `.env` ignorado, mas defaults privados continuam no código (B1). Scanner literal não cobre todo histórico Git ou valores codificados. |
| Banco | SQLite nativo em `data/cfo_app.sqlite`, WAL, foreign keys e busy timeout. Banco novo passa `integrity_check`; banco de uso local não aberto nesta execução. |
| Migrations | Sete migrations passam em banco novo; upgrade povoado falha (B5). |
| Backups | Gzip/SHA-256 presentes, sem criptografia por esse mecanismo. SQLite reprovado B4. Agendamento consulta hora a cada 60min, não garante exatamente 03:00. |
| Backup externo | `BACKUP_S3_BUCKET` altera texto do status; não foi encontrado upload S3/R2 implementado no serviço. Configurar variáveis não basta. |
| Storage | Estudos em localStorage/IndexedDB e snapshots por username; timer/Calendar globais. Avatares em `public/avatars`, fora do volume `/app/data` do Compose. Persistência e isolamento exigem validação. |
| E-mail | Resend implementado; chave/remetente presentes localmente, sem validação de domínio/entrega. Produção inicia sem ambos e pedido retorna sucesso genérico sem envio: uma das 9 falhas HTTP. |
| Better Auth | Dependência instalada; fluxos examinados usam `AuthService`/SQLite/HMAC próprios. Não considerar provedor Better Auth ativo/auditado. |
| Geração de recuperação | `PasswordResetRepository.createResetCode()` usa `Math.random()`, divergindo da documentação anterior sobre aleatoriedade criptográfica. Correção pendente. |
| Logs | Banco append-only por triggers. `audit.log` tem sanitização superficial, sem rotação no serviço examinado; não é imutável/criptografado. Logs contêm e-mails/IPs; alguns catches retornam `err.message`. |
| Monitoramento | Sem evidência de monitor externo ou alertas de disco, backup, e-mail e indisponibilidade configurados. |
| Health | 200 com `status: healthy`, uptime e timestamp; liveness superficial, não verifica banco/disco/Resend/backup. |
| Trusted proxies/IP | `trust proxy=1`; `cf-connecting-ip` prioritário sem verificar remetente. Depende de origin protegido e borda removendo/sobrescrevendo headers forjados; topologia real não verificada. |
| Realtime | Buffer em memória de 50 eventos, keepalive 20s, replay, `X-Accel-Buffering: no`. Perde histórico em restart, não distribui eventos entre instâncias e não corta sessão revogada. |

## Build, secrets e política de source maps

- JS frontend: **1.716,45 kB**, **463,47 kB gzip**; CSS **205,70 kB**. Aviso Vite: chunk acima de 500kB. Desempenho móvel não medido.
- Backend aproximadamente **234,8 KiB**; mapa **423,7 KiB**, contendo fontes. Nenhum source map de frontend gerado.
- Nenhum dos nove valores privados examinados apareceu em HTML/JS/CSS do frontend. Correspondências no backend e no mapa: `ADMIN_PASSWORD`, `CADET_PASSWORD`, `TOTP_SECRET`, `SESSION_SECRET`, `TURNSTILE_SECRET_KEY`. Como ambos são servidos, o requisito **“secrets não aparecem no bundle público” está REPROVADO**.
- Correspondências refletem constantes/defaults no código; não demonstram injeção de `.env` pelo Vite. Valores não são reproduzidos. A chave Resend não apareceu nos artefatos examinados.
- Política para liberar: publicar somente frontend/assets; backend fora do diretório estático; source maps de backend privados para diagnóstico autorizado; exigir 403/404 nos caminhos privados publicados. Remover só `sourceMappingURL` não resolve.
- Docker build/start não executado: CLI indisponível e problema B9. Validar Node 22 da imagem e dependências de runtime.

## Configuração e validação MANUAIS pendentes

Estas tarefas não substituem as correções B1–B9.

- [ ] Rotacionar segredos coincidentes com defaults expostos e a chave Resend compartilhada na conversa; configurar novos valores no secret store, sem commits/logs.
- [ ] Definir `NODE_ENV=production`, `APP_URL` HTTPS e origens reais. `.env` local não define `NODE_ENV`; não foi consultado o ambiente hospedado.
- [ ] Credenciais únicas, TOTP, sessão, Turnstile e suporte; resolver antes a inconsistência de senhas/hashes no startup.
- [ ] Validar chave Resend, `EMAIL_FROM`, domínio e entrega a caixa controlada. Depois de B2, testar e-mail recebido, reset e novo login.
- [ ] Disco persistente no caminho real `data/cfo_app.sqlite`; no contêiner, `/app/data`. Montar só `/data` não muda o caminho do código.
- [ ] Persistir avatares/demais arquivos; validar restart/redeploy sem perda.
- [ ] Após B4/B5, backup consistente, cópia externa efetiva e restauração separada; medir objetivos de recuperação.
- [ ] TLS, redirect, domínio, certificado e renovação no endereço público.
- [ ] Documentar proxies; restringir origin; sanitizar `CF-Connecting-IP`/`X-Forwarded-For` na borda.
- [ ] Monitorar liveness, erros, disco, backup/e-mail; retenção e rotação de logs.
- [ ] Validar buffering/timeout/reconexão SSE no proxy real, incluindo sessão expirada/revogada.
- [ ] E2E de navegador desktop/móvel: cadete/admin, perfil, recuperação, 2FA, logout, storage, falhas de rede.
- [ ] Executar imagem Docker e verificar volumes, variáveis, assets e comando de entrada.

## Reprodução

Na raiz, com dependências instaladas:

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
node scripts/readiness-suite.mjs
node scripts/readiness-production.mjs
node node_modules/tsx/dist/cli.mjs scripts/readiness-storage.mjs
node scripts/readiness-secrets.mjs
```

Servidores dos probes não carregam `.env` real. Scanner lê o arquivo apenas para comparação local, imprimindo nomes/caminhos, nunca valores. Probes HTTP/storage retornam exit 1 com os blockers atuais. Evidências temporárias são mantidas com dados sintéticos; o processo de produção é encerrado ao terminar. Build sobrescreve `dist`, ignorado pelo Git.

## Decisão final

**Produção bloqueada.** Corrigir blockers, repetir verificações, comprovar configurações externas e completar E2E de navegador antes de alterar a decisão. Relatórios anteriores (`SECURITY-REVIEW.md`, `GSD-ARCHITECTURE.md`, `BACKUP.md`, `DISASTER_RECOVERY.md`) não certificam o estado atual.

Entrega: verificadores e documentação; commit local, sem push ou deploy.
