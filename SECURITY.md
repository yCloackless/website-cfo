# Diretrizes e Arquitetura de Segurança da Informação (SECURITY.md)
## CFO CBMERJ — Sistema de Cronograma e Gestão Tática de Estudos

---

### 1. Filosofia de Segurança: Defesa em Profundidade

O sistema não confia em nenhuma barreira única de proteção. Ele implementa uma arquitetura em camadas concêntricas (Defense-in-Depth), onde cada camada opera de forma independente e defensiva.

```
[ Usuário / Cadete / Invasor ]
              ↓
  CAMADA 1: Borda, TLS/HTTPS e Cloudflare Turnstile (Anti-Bot)
              ↓
  CAMADA 2: Geo-Fencing (Apenas RJ/Brasil para credenciais de Comando) & Banimento Automático de IP
              ↓
  CAMADA 3: Rate Limiting Adaptativo por Rota (Auth: 15 req/15min, API: 350 req/15min)
              ↓
  CAMADA 4: Cabeçalhos HTTP Defensivos via Helmet (CSP estrita, HSTS, noSniff, frameAncestors 'self')
              ↓
  CAMADA 5: Comparação Criptográfica Constant-Time (Proteção contra Timing Attacks)
              ↓
  CAMADA 6: Autenticação de Dois Fatores TOTP Mestre (RFC 6238 / Google Authenticator)
              ↓
  CAMADA 7: Sessões Criptográficas Baseadas em HMAC-SHA256 (Sem armazenamento de senhas)
              ↓
  CAMADA 8: Autorização RBAC no Backend (Admin vs. Cadete com isolamento de privilégios)
              ↓
  CAMADA 9: Sanitização e Trilha de Auditoria Imutável (data/audit.log)
              ↓
  CAMADA 10: Backups Criptografados e Verificados via SHA-256
```

---

### 2. Autenticação e Perfis de Usuário (RBAC)

O sistema conta com dois perfis de acesso estritamente segregados no servidor:

| Perfil | Acesso Notion | 2FA Obrigatório | Geo-Fencing RJ | Finalidade |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** (`admin` / `jb080956@gmail.com`) | **Sim** (Total) | **Sim** (Google Authenticator) | **Sim** (Apenas RJ/Brasil) | Comando operacional, parametrização, backups e auditoria |
| **Cadete** (`cadete` / `aluno`) | **Não** (Isolado) | Não (Login direto seguro) | Não (Acesso de qualquer local) | Estudo individual, cronômetro, simulados e questões |

#### Mitigações Implementadas:
- **Resistência a Timing Attacks**: Comparações de credenciais utilizam `crypto.timingSafeEqual()` sobre o hash SHA-256 das chaves, impossibilitando inferência por tempo de resposta.
- **Prevenção de Enumeração de Usuários**: Mensagens de erro padronizadas ("Credenciais de acesso inválidas") retornam HTTP 401 sem revelar se foi o usuário ou a senha que falhou.
- **Sessões Assinadas**: Tokens contêm payload base64url assinado via HMAC-SHA256 (`SESSION_SECRET`), verificados a cada requisição sensível.

---

### 3. Proteção de Borda e Defesa Geográfica

1. **Cloudflare Turnstile**:
   - Chaves públicas injetadas apenas no frontend; secret validado estritamente no backend através da API oficial da Cloudflare (`challenges.cloudflare.com/turnstile/v0/siteverify`).
   - Bypass inteligente e automático habilitado exclusivamente para o IP estático do Administrador.
2. **Geo-Fencing com Banimento de IP Imediato**:
   - Qualquer tentativa de autenticação na conta de Comando (`admin`) com IP originado fora do Estado do Rio de Janeiro resulta em **bloqueio imediato (HTTP 403)** e **banimento perpétuo do IP**, gravado em `data/banned-ips.json` e auditado no log de segurança.

---

### 4. Cabeçalhos de Segurança (HTTP Headers)

Configurados via `helmet` com compatibilidade estrita:
- **Content-Security-Policy (CSP)**:
  - `default-src: 'self'`
  - `script-src: 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://accounts.google.com`
  - `style-src: 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `font-src: 'self' https://fonts.gstatic.com data:`
  - `img-src: 'self' data: blob: https:`
  - `frame-src: 'self' https://challenges.cloudflare.com https://accounts.google.com`
  - `connect-src: 'self' https://challenges.cloudflare.com https://*.googleapis.com https://generativelanguage.googleapis.com http://ip-api.com`
  - `object-src: 'none'`
  - `frame-ancestors: 'self'` (Proteção contra Clickjacking)
- **HSTS**: `max-age=31536000; includeSubDomains; preload`
- **X-Content-Type-Options**: `nosniff`
- **Referrer-Policy**: `strict-origin-when-cross-origin`

---

### 5. Auditoria de Segurança (Audit Log)

Eventos críticos de sistema são estruturados e persistidos em `data/audit.log` (rotacionado automaticamente em 5MB):
- Tentativas de login com sucesso ou falha (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_2FA_FAILED`);
- Banimentos e bloqueios de IP (`IP_BANNED_GEOLOCATION`);
- Criação e restauração de backups (`BACKUP_CREATE_SUCCESS`, `BACKUP_RESTORE_SUCCESS`);
- Sincronização de estudos de usuários (`USER_BACKUP_SYNC`).

> **Regra Fundamental**: Senhas, tokens completos, dados biométricos ou secrets NUNCA são registrados no arquivo de log.

---

### 6. Vulnerabilidades Mitigadas nesta Revisão

| Vetor de Ataque | Classificação | Status | Medida Aplicada |
| :--- | :--- | :--- | :--- |
| **Timing Attack na Autenticação** | ALTO | Resolvido | Implementado `safeComparePassword` com `timingSafeEqual`. |
| **User Enumeration** | MÉDIO | Resolvido | Unificadas mensagens de erro genéricas ("Credenciais inválidas"). |
| **Perda de Dados por Falha de Disco** | CRÍTICO | Resolvido | Sistema automatizado de backup `.json.gz` com SHA-256 e cron diário. |
| **Exposição de Secrets no Versionamento** | ALTO | Resolvido | `.gitignore` atualizado para bloquear dumps, hashes, logs e sessions; `.env.example` sanitizado. |
| **Invasão de Conta Admin fora do RJ** | CRÍTICO | Resolvido | Verificação GeoIP ativa com banimento permanente imediato. |
