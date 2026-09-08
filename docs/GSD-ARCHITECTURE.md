# AUDITORIA DE ARQUITETURA E SEGURANÇA (GSD - FASE 1)
## Sistema: CFO CBMERJ — Cronograma e Gestão Tática de Estudos

---

### 1. Arquitetura Atual

#### 1.1 Visão Geral
O projeto é um monólito híbrido Node.js + React contido em um único repositório:
- **Frontend**: SPA construída com React 19, TypeScript, Vite 6 e TailwindCSS v4.
- **Backend**: Servidor Express 4 (implementado em `server.ts` de ~3.158 linhas) empacotado para produção com `esbuild` em formato CommonJS (`dist/server.cjs`). Em modo de desenvolvimento, o servidor Express monta os middlewares do Vite via `vite.middlewares` para HMR unificado em uma única porta (`3000`).
- **Deploy & Contêiner**: Multi-stage `Dockerfile` (Node 22-alpine) com runner não-root (`USER node`) e orquestração via `docker-compose.yml`. Configurado também para execução PaaS direta (Render).

#### 1.2 Topologia de Componentes
- **Camada de Entrada / Borda**: Express com cabeçalhos defensivos via `helmet` (CSP estrita, HSTS, frameAncestors 'self'), compressão Gzip/Brotli (`compression`), limitadores de taxa (`express-rate-limit`) e Cloudflare Turnstile anti-bot.
- **Camada de Aplicação / Negócio**: Rotas embutidas em `server.ts` integrando com:
  - Google Gemini API (`@google/genai`) para geração de bizus, flashcards e análise de ciclos semanais.
  - Google Calendar OAuth 2.0 para sincronização de eventos de estudo com refresh token persistente.
  - Notion API (`notionBackend.ts`) para sincronização e check-in de revisões espaçadas.
  - Sistema de Backup e Auditoria (`src/services/backupService.ts`, `src/services/auditLogger.ts`).
- **Camada de Persistência Atual**:
  - Frontend: `localStorage` e `IndexedDB` (para itens volumosos do bizuário).
  - Backend: Arquivos JSON locais e backups `.json.gz` no diretório `/data/` (`calendar-session.json`, `notion-revisoes-cache.json`, `notion-seed.json`, `security-config.json`, `banned-ips.json`, `user-backups/<user>.json`, `audit.log`).
  - **NÃO EXISTE BANCO DE DADOS RELACIONAL OU ORM** (PostgreSQL, Prisma, Drizzle, etc. ainda não foram introduzidos).

---

### 2. Autenticação e Autorização Atuais

#### 2.1 Credenciais e Sessão
O sistema opera com um modelo de **contas pré-definidas/hardcoded no código com fallback em variáveis de ambiente**:
- **Conta Admin**: `ADMIN_USER` e `ADMIN_USER_EMAIL`, com senha definida via `ADMIN_PASSWORD` ou `ADMIN_PASSWORD_HASH`.
- **Conta Cadete**: `CADET_USER` e `CADET_USER_EMAIL`, com senha via `CADET_PASSWORD` ou hash `CADET_PASSWORD_HASH` configurados no ambiente.
- **Sessões do Terminal**: Implementação customizada de tokens no formato `<payloadB64>.<signature>`, assinados via HMAC-SHA256 utilizando `SESSION_SECRET` (fallback hardcoded de 64 hex chars em `DEFAULT_SESSION_SECRET` e salvo em `data/security-config.json`).
- **Segundo Fator (2FA TOTP)**: Obrigatório apenas para o perfil Admin, implementado via `otplib` (RFC 6238) com segredo persistido em `data/security-config.json` ou lido de `TOTP_SECRET`. Há proteção anti-replay com cache de códigos usados por 3 minutos.
- **Geo-fencing de IP**: Bloqueia e bane automaticamente IPs com origem fora do Brasil/RJ ao tentar autenticar como `admin`.
- **Bypass de Turnstile**: IPs identificados como admin (`127.0.0.1`, sub-redes locais ou `ADMIN_TRUSTED_IPS`) ignoram o desafio do Turnstile.
- **Controle de Bloqueio de IP**: Middleware global bloqueia conexões de IPs banidos. Desbloqueio restrito a administradores autenticados com 2FA Step-Up via endpoint `/api/admin/unban` (qualquer bypass via chave de URL foi estritamente eliminado).

#### 2.2 Autorização no Backend
- `requireAdminAuth`: Valida estritamente sessão autenticada com role === "admin" ou role === "support".
- `requireAdminWriteAuth`: Valida estritamente sessão com role === "admin" para operações com mutação de estado.
- `requireUserAuth`: Valida sessão HMAC/DB ativa de qualquer usuário autenticado (cadete, suporte ou admin).
  - `isRequestAuthorized`: Utilizado em endpoints de IA e Calendar, com identidade derivada da sessão e whitelist configurada por ambiente.
- Rota `/api/notion/*`: Restringe o acesso exclusivamente a sessões válidas com `canAccessNotion: true` (Admin).

---

### 3. Banco de Dados Atual

- **Banco Relacional / ORM**: Nenhum presente no momento.
- **Armazenamento de Estado no Servidor**:
  - `data/security-config.json`: Segredos TOTP e de sessão.
  - `data/banned-ips.json`: Registro de IPs banidos por geolocalização ou infrações.
  - `data/calendar-session.json`: Tokens OAuth (Access Token e Refresh Token) do Google Calendar.
  - `data/notion-revisoes-cache.json`: Cache das revisões integradas do Notion com fallback em `notion-seed.json`.
  - `data/user-backups/<sanitizedUsername>.json`: Snapshots de estudos sincronizados por usuários via `/api/user/sync-backup`.
  - `data/backups/`: Arquivos compactados de backup diário (`backup-*.json.gz`) com somas de verificação SHA-256 e suporte opcional para upload em buckets compatíveis com S3/Cloudflare R2.
  - `data/audit.log`: Log de eventos estruturados em formato texto/JSONL.

---

### 4. Fluxo Frontend / Backend

1. **Acesso Inicial**: O visitante acessa a Landing Page pública (`src/components/LandingPage.tsx`).
2. **Desafio de Entrada**: Ao clicar em "ENTRAR", o modal `SecurityGate` é acionado.
   - O frontend consulta `/api/auth/security-status` para verificar se o IP requer Cloudflare Turnstile.
   - O usuário insere identificador e senha em `/api/auth/check-credentials`.
   - Se for Cadete: recebe imediatamente a sessão assinada (`token`, `role: 'cadet'`) e entra no sistema.
   - Se for Admin: o backend exige o código TOTP de 6 dígitos em `/api/auth/verify-2fa`.
3. **Persistência de Sessão no Cliente**:
   - O frontend salva o token HMAC em `localStorage.getItem('cfo_terminal_session')` e a validade em `cfo_terminal_expires_at`.
   - No bootstrap da SPA (`src/App.tsx`), `verifySavedSession` envia `/api/auth/verify-session`.
4. **Isolamento de Dados do Usuário**:
   - Funções de carregamento (`storageService.ts`) usam `getUserStorageKey()`:
   - Administrador usa chaves diretas (`cfo_cbmerj_subjects_v1`, etc.).
   - Alunos/Cadetes recebem chaves com sufixo (`..._cadete`), armazenadas isoladamente no `localStorage` do navegador.
   - Usuários autenticados enviam snapshots para backup no servidor via `POST /api/user/sync-backup`.

---

### 5. Problemas e Vulnerabilidades Encontrados

#### 5.1 Severidade Alta / Crítica
1. **Senhas e Segredos Hardcoded com Fallback em Código**:
   - `server.ts` (linhas 624-630):
     - Credenciais e segredos devem ser fornecidos por variáveis de ambiente; não há fallback de senha ou segredo no código.
   - Se as variáveis de ambiente não forem estritamente provisionadas no runtime, qualquer atacante pode obter acesso total de administrador ou cadete conhecendo as credenciais padrão do repositório.
2. **Bypass Administrativo via Query Parameter (`adminKey`)**:
   - Endpoints administrativos (`/api/admin/unban`, `/api/admin/backup/*`) e até o middleware global de IPs permitem autenticação via `req.query.adminKey`.
   - Chaves passadas via URL (`GET /api/admin/backup/status?adminKey=...`) vazam em logs de proxy, CDN, histórico do navegador e cabeçalhos `Referer`.
3. **Isolamento Multiusuário e IDOR na Sincronização de Backup**:
   - Em `POST /api/user/sync-backup`, o arquivo gravado é derivado de `user.username`. No entanto, os usuários compartilham identidades genéricas ("cadete" ou "admin"). Se dois alunos utilizarem a conta "cadete", um sobrescreverá o progresso do outro (`cadete.json`).
   - Não há modelo relacional de contas individuais (userId único, tenant isolation ou controle de propriedade server-side por usuário cadastrado).
4. **Autorização Frágil em Endpoints de IA e Google Calendar**:
   - A função `isRequestAuthorized(req, userEmail)` concede acesso se `host.startsWith("localhost")` ou se `ALLOWED_EMAILS.includes(userEmail)`.
   - Identidade enviada pelo cliente não deve ser usada sem checagem de sessão vinculada.
5. **Armazenamento de Tokens e Sessões em Arquivos Flat JSON**:
   - Credenciais do Google Calendar com `refresh_token` estão gravadas em texto plano em `data/calendar-session.json`.
   - A concorrência de leitura/escrita em arquivos JSON síncronos pode corromper dados sob carga ou em caso de crash do Node.js.

#### 5.2 Severidade Média
1. **Frontend como Fonte da Verdade Parcial**:
   - O cronograma, matérias, anotações de erros e ciclos de estudo residem primariamente no `localStorage` do navegador, sendo apenas espelhados esporadicamente para o servidor via snapshot integral não validado (Mass Assignment de estado bruto).
2. **CORS com Verificação de Prefixo Permissiva**:
   - Em `server.ts`: `allowedOrigins.some((allowed) => origin.startsWith(allowed) || allowed.startsWith(origin))`.
   - A checagem `origin.startsWith(allowed)` ou inversa pode permitir domínios maliciosos prefixados caso não haja validação estrita de URL parseada.
3. **Falta de Testes Automatizados**:
   - `npm test` falha com `Missing script: "test"`. Não há suite de testes unitários ou de integração para regras críticas de autenticação e rotas de API.

---

### 6. Riscos Identificados

1. **Risco de Acesso Não Autorizado**: Caso o ambiente suba sem `.env` preenchido, os fallbacks hardcoded expõem o painel administrativo.
2. **Risco Financeiro / Consumo de Quota de IA**: Ataques direcionados a `/api/ai/*` forjando o e-mail autorizado podem esgotar créditos da API do Google Gemini.
3. **Risco de Corrupção de Estado e Perda de Dados**: Escritas concorrentes síncronas em arquivos `.json` locais em servidores com múltiplos workers ou reinicializações repentinas.
4. **Risco de Bloqueio em Produção**: O mecanismo de banimento por Geo-fencing depende de consulta a `http://ip-api.com` (sem TLS) com timeout de 2s e cabeçalhos Cloudflare. Se a API externa falhar ou rate-limitar, o usuário pode ser classificado como `UNKNOWN` ou ter instabilidade no login.

---

### 7. Partes que Devem Permanecer

1. **Design System e Telas do Frontend**:
   - Estrutura completa de estudos: `HorizontalWeeklyTable.tsx`, `StudyColumnCharts.tsx`, `TacticalSimulations.tsx`, `HighYieldTab.tsx`, `ErrorNotebookTab.tsx`, `BizuarioTab.tsx`.
   - Renderização rica de fórmulas matemáticas LaTeX (`LatexRenderer.tsx` com KaTeX).
   - Componentes visuais e Landing Page premium (`LandingPage.tsx`).
2. **Cabeçalhos de Segurança e Borda**:
   - Configuração de `helmet` e headers HSTS / CSP estritos.
   - Compressão e controle de rate limiting (`express-rate-limit`).
3. **Integração com Google Calendar e Notion**:
   - Lógica de sincronização e cálculo de intervalos de revisão espaçada em `notionBackend.ts` e `src/services/calendarService.ts`.
4. **Estrutura de Contêiner e Build**:
   - Multi-stage Dockerfile eficiente (Node 22 Alpine, runner não-root).
   - Pipeline de build com Vite + esbuild (`dist/server.cjs`).

---

### 8. Partes que Devem Ser Substituídas

1. **Mecanismo de Autenticação Hardcoded**:
   - Substituir as credenciais embutidas (`CADET_PASSWORD`, `ADMIN_PASSWORD`) por um serviço seguro e robusto de autenticação e identidade (AWS Cognito / Auth com hash Argon2/Bcrypt armazenado em banco seguro por usuário).
   - Eliminar fallbacks com senhas padrão no código-fonte.
2. **Armazenamento em Arquivos Flat JSON para Dados de Negócio**:
   - Substituir arquivos locais (`user-backups/*.json`) por um banco de dados relacional confiável (ex: PostgreSQL / SQLite gerenciado com migrations e ACID).
   - Vincular cada estudo, revisão e anotação a um `user_id` proprietário validado server-side.
3. **Autorização Baseada em Headers/Body Forjáveis**:
   - Eliminar validações baseadas em `x-user-email` ou `req.body.userEmail` em endpoints sensíveis.
   - Obter a identidade e entitlements do usuário unicamente a partir de tokens de sessão criptograficamente assinados e validados no backend.
4. **Bypass por Query Params**:
   - Remover autenticação via `?adminKey=` na URL. Toda operação administrativa deve exigir sessão com autenticação reforçada (Step-Up / 2FA).

---

### 9. Plano Recomendado para as Próximas Fases

1. **Fase 2 — Preparação do Banco de Dados e Camada de Persistência Segura**:
   - Definir schema relacional para contas de usuários, perfis/roles, produtos/entitlements e estado dos estudos.
   - Implementar migrations controladas e abstração de repositório.
2. **Fase 3 — Autenticação e Autorização Robusta (Backend Authority)**:
   - Integrar provedor de identidade seguro (ou sistema de autenticação server-side definitivo com proteção contra brute-force, tokens invioláveis e step-up 2FA para admin).
   - Remover totalmente senhas e segredos default hardcoded.
   - Refatorar middlewares para impor ownership estrito em todos os recursos.
3. **Fase 4 — Checkout e Gateway de Pagamento (Mercado Pago)**:
   - Implementar fluxo estrito de checkout com consulta server-side do produto e preço real (frontend envia apenas `productId`).
   - Validação de webhooks com idempotência e tokens de ativação de uso único.
4. **Fase 5 — Validação, Testes Automatizados e Hardening**:
   - Adicionar suite de testes automatizados (`vitest` / `jest` / `supertest`) cobrindo tentativas de IDOR, bypass de pagamento e escalada de privilégios.
