# Seguranca do CFO CBMERJ

Ultima revisao tecnica: 19/09/2026.

Nenhum sistema publico pode prometer risco zero. Este projeto usa defesa em profundidade e depende tambem da configuracao correta do Render, PostgreSQL e provedores externos.

## Controles implementados

- HTTPS/HSTS (maxAge=31536000, includeSubDomains, preload), CSP restritiva com report-to, `nosniff`, politica de referer e protecao contra framing via Helmet.
- COEP `credentialless` + COOP habilitados para isolamento de processo (mitigacao Spectre) sem bloquear iframes de terceiros.
- Permissions-Policy aplicado globalmente (camera, microphone, geolocation, payment, usb desabilitados).
- Violacoes CSP reportadas ao endpoint `POST /api/csp-report` e registradas na auditoria.
- CORS limitado aos dominios configurados em `APP_URL`/Render; mutacoes autenticadas por cookie exigem `Origin`/`Referer` da mesma origem.
- Cookies de sessao `HttpOnly`, `Secure` em producao, `SameSite=Strict` e prefixo `__Host-`.
- Sessoes assinadas com HMAC-SHA256; `SESSION_SECRET` e `DATABASE_URL` sao obrigatorios em producao.
- Senhas protegidas por bcrypt custo 12 (uniforme para todos os tipos de usuario), mensagens genericas contra enumeracao e comparacao com trabalho criptografico mesmo para usuario inexistente.
- Derivacao de chave AES-256 via scrypt (N=16384, r=8, p=1) com salt de contexto fixo — resistente a ataques de dicionario. Formato `version:2` nos payloads; dados legados `version:1` (sha256) sao migrados automaticamente na primeira leitura.
- Backups criptografados com AES-256-GCM (CFOB2, scrypt KDF). Backups legados CFOB1 sao re-criptografados automaticamente pelo scheduler. SHA-256 do arquivo verificado antes de cada restauracao.
- Fonte Inter auto-hospedada (sem dependencia de CDN externo); elimina vetor de supply chain via Google Fonts.
- RBAC no backend, suporte somente leitura, 2FA para administracao e step-up para operacoes sensiveis, inclusive lockdown e reinicio.
- Cloudflare Turnstile validado no backend. Em producao, rede privada/localhost nao gera bypass; apenas `ADMIN_TRUSTED_IPS` explicitamente configurado.
- Rate limit global (350 requisicoes/15 min), login e recuperacao (15/15 min), 2FA (10/15 min), CSP report (30/min), IA e upload com limites proprios.
- Bloqueio persistente de tentativas abusivas e revogacao de sessoes.
- Limite de corpo antes do parser: 2 MiB por padrao e 20 MiB apenas nas rotas conhecidas de upload/processamento.
- Timeouts HTTP, limite de cabecalhos e keep-alive curto contra conexoes lentas/abusivas.
- APIs autenticadas usam `Cache-Control: no-store`; o servidor nao revela `X-Powered-By`.
- IP completo e user-agent ficam restritos ao armazenamento forense. Respostas administrativas e eventos SSE recebem IP parcialmente mascarado e credenciais redigidas.
- Erros enviados ao navegador nao incluem mensagem interna, stack trace, caminho de arquivo ou erro SQL.
- Subprocessos Python recebem somente variaveis operacionais; secrets do processo Node nao sao repassados.
- Uploads validam tipo, MIME, extensao, assinatura, dimensoes, EOF/estrutura e limite de 200 paginas em PDF, alem de propriedade. O container executa como usuario `node`, nao como root.
- Tokens da extensao possuem escopo restrito as rotas de cronometro e sincronizacao de nivelamento, sem herdar privilegios administrativos.
- Health/readiness/version recebem headers de seguranca e rate limit antes das rotas; excesso de requisicoes simultaneas falha cedo com 503.
- PostgreSQL nao e publicado pela aplicacao; no Docker local ele escuta somente em `127.0.0.1`.
- Auditoria append-only via API e backups criptografados com verificacao de integridade.

## Risco residual aceito e documentado

### style-src-attr: unsafe-inline

A diretiva CSP `style-src-attr: 'unsafe-inline'` esta presente por necessidade tecnica.
KaTeX (formulas matematicas), Framer Motion (animacoes) e Recharts (graficos) injetam
atributos `style=""` diretamente em elementos DOM em tempo de execucao — sem esta permissao
a renderizacao do produto quebraria.

**Mitigacao ativa:** `script-src` nao contem `unsafe-inline`, portanto XSS nao pode executar
JavaScript arbitrario para abusar desta permissao de estilo. O vetor de CSS injection e
limitado sem execucao de JS.

**Revisao futura:** Quando KaTeX, Framer Motion e Recharts oferecerem alternativa sem
estilo inline (ex: nonces por elemento), migrar para eliminar esta permissao.

## DDoS e protecao de borda

O rate limiting da aplicacao combate abuso logico e brute-force (L7), mas nao absorve
DDoS volumetrico (L3/L4). A arquitetura de defesa completa exige:

1. **Cloudflare na borda** — proxy Anycast que absorve volumetrico antes de chegar ao Render.
   Ver guia completo: `docs/CLOUDFLARE-RENDER-SETUP.md`
2. **Render Edge** — protecao DDoS basica inclusa na plataforma.
3. **server.ts** — rate limiting por IP, timeouts anti-Slowloris, middleware fail-fast 503
   (retorna 503 imediatamente quando ha mais de 200 requests simultaneos).

Timeouts configurados no servidor Node.js (anti-Slowloris):
- `headersTimeout`: 10s — mata conexoes que enviam headers lentamente
- `requestTimeout`: 30s — tempo maximo total de uma request
- `keepAliveTimeout`: 5s — fecha conexoes idle rapidamente

Para auditar se o IP real esta exposto via DNS/subdominios/certificados:

```bash
bash scripts/audit-ip-leak.sh seudominio.com
```

Se o limitador de rate limit passar a usar varias instancias, migrar os contadores
para Render Key Value/Redis e obrigatorio para manter limites globais consistentes.


## Configuracao obrigatoria no Render

1. Definir `NODE_ENV=production`, `APP_URL`, `DATABASE_URL` do Render PostgreSQL e secrets diferentes para `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` e `BACKUP_ENCRYPTION_KEY`.
2. Nunca criar variavel `VITE_*` contendo segredo. Variaveis com esse prefixo podem ir para o bundle publico.
3. Definir `/api/health` como Health Check Path e manter o PostgreSQL na mesma regiao, usando a URL interna quando oferecida.
4. Ativar backups/PITR do PostgreSQL conforme o plano e manter uma copia criptografada off-site testada.
5. Configurar Turnstile com os hostnames reais. Nao usar chaves de teste em producao.
6. Restringir a chave publica Firebase/Google aos dominios e APIs necessarios no Google Cloud. Ela identifica o projeto e aparece no frontend por design, mas deve ter restricoes contra abuso.
7. Desativar o subdominio `onrender.com` se o site for servido exclusivamente por dominio proprio e essa opcao estiver disponivel no plano/configuracao.
8. Rotacionar imediatamente qualquer secret que tenha sido enviado em chat, log, screenshot ou commit publico.

## Rotacao de chaves (checklist operacional)

Execute este procedimento quando `SESSION_SECRET` ou `DATA_ENCRYPTION_KEY` precisarem
ser trocados (ex: suspeita de vazamento, rotacao periodica, saida de colaborador).

### Rotacao de SESSION_SECRET

1. Gere um novo secret de 64 bytes: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
2. No Render Dashboard, atualize a variavel `SESSION_SECRET` com o novo valor.
3. Faca o deploy. O servidor reinicia e invalida todas as sessoes ativas (usuarios precisam fazer login novamente — comportamento esperado e seguro).
4. Verifique o health check apos o deploy: `GET /api/health`.

### Rotacao de DATA_ENCRYPTION_KEY

1. Gere uma nova chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Os dados criptografados atuais (tokens Google Calendar, configuracao de seguranca) usam `version:2` com scrypt.
   O campo `version` no envelope JSON identifica a chave usada — a migracao e automatica na proxima leitura.
3. Atualize `DATA_ENCRYPTION_KEY` no Render e faca o deploy.
4. Na proxima vez que cada dado for lido e re-gravado (ex: autenticacao Google Calendar), ele sera re-criptografado com a nova chave automaticamente.
5. Para forcar a re-criptografia imediata de todos os dados: revogar e re-autenticar o Google Calendar via painel admin.

### Rotacao de BACKUP_ENCRYPTION_KEY

1. Gere uma nova chave: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Atualize `BACKUP_ENCRYPTION_KEY` no Render e faca o deploy.
3. Backups antigos (CFOB1 e CFOB2 com chave anterior) sao migrados automaticamente para CFOB2 com a nova chave pelo `migrateLegacyBackups()` na proxima inicializacao do scheduler.
4. Confirme via painel admin que o proximo backup agendado (03:00) foi criado com sucesso.

> **IMPORTANTE:** Nunca reutilizar `SESSION_SECRET`, `DATA_ENCRYPTION_KEY` e `BACKUP_ENCRYPTION_KEY` — cada um deve ser um valor unico e independente.

## Privacidade de IP

O servidor precisa conhecer o IP real para bloquear ataques e produzir evidencias. Ele nunca aceita IP informado no corpo da requisicao. Cabecalhos Cloudflare so sao aceitos quando `TRUST_CLOUDFLARE_HEADERS=true` e a conexao veio de proxy confiavel. Interfaces de administracao mostram somente uma versao mascarada, como `203.0.x.x`.

O acesso aos dados forenses deve ficar limitado a administradores, com retencao definida conforme a politica de privacidade aplicavel. Logs da propria plataforma Render tambem seguem as regras de retencao e acesso da conta Render.

## Resposta a incidente

Em suspeita de invasao: suspenda o deploy, revogue sessoes, rotacione todos os secrets e chaves externas, preserve os logs/auditoria, restaure somente de backup validado e revise usuarios/alteracoes antes de reabrir o servico. Nao apague evidencias antes da investigacao.

## Verificacao local

```bash
npm audit --omit=dev
npm run typecheck
npm test
npm run build
docker compose config
```

Falhas de seguranca nao devem ser publicadas em issue aberta. Use um canal privado do responsavel pelo projeto.
