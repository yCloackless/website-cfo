# Seguranca do CFO CBMERJ

Ultima revisao tecnica: 10/09/2026.

Nenhum sistema publico pode prometer risco zero. Este projeto usa defesa em profundidade e depende tambem da configuracao correta do Render, PostgreSQL e provedores externos.

## Controles implementados

- HTTPS/HSTS, CSP restritiva, `nosniff`, politica de referer e protecao contra framing via Helmet.
- CORS limitado aos dominios configurados em `APP_URL`/Render.
- Cookies de sessao `HttpOnly`, `Secure` em producao, `SameSite=Strict` e prefixo `__Host-`.
- Sessoes assinadas com HMAC-SHA256; `SESSION_SECRET` e `DATABASE_URL` sao obrigatorios em producao.
- Senhas protegidas por bcrypt, mensagens genericas contra enumeracao e comparacao com trabalho criptografico mesmo para usuario inexistente.
- RBAC no backend, 2FA para administracao e step-up para operacoes administrativas sensiveis.
- Cloudflare Turnstile validado no backend. Em producao, rede privada/localhost nao gera bypass; apenas `ADMIN_TRUSTED_IPS` explicitamente configurado.
- Rate limit global (350 requisicoes/15 min), login e recuperacao (15/15 min), 2FA (10/15 min), IA e upload com limites proprios.
- Bloqueio persistente de tentativas abusivas e revogacao de sessoes.
- Limite de corpo antes do parser: 2 MiB por padrao e 20 MiB apenas nas rotas conhecidas de upload/processamento.
- Timeouts HTTP, limite de cabecalhos e keep-alive curto contra conexoes lentas/abusivas.
- APIs autenticadas usam `Cache-Control: no-store`; o servidor nao revela `X-Powered-By`.
- IP completo e user-agent ficam restritos ao armazenamento forense. Respostas administrativas e eventos SSE recebem IP parcialmente mascarado e credenciais redigidas.
- Erros enviados ao navegador nao incluem mensagem interna, stack trace, caminho de arquivo ou erro SQL.
- Subprocessos Python recebem somente variaveis operacionais; secrets do processo Node nao sao repassados.
- Uploads validam tipo, tamanho, assinatura e propriedade. O container executa como usuario `node`, nao como root.
- PostgreSQL nao e publicado pela aplicacao; no Docker local ele escuta somente em `127.0.0.1`.
- Auditoria append-only via API e backups criptografados com verificacao de integridade.

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
