# CFO CBMERJ — Relatório Oficial de Auditoria Defensiva (Security Review)
**Data da Auditoria:** 2026-09-07  
**Escopo:** Auditoria Defensiva Completa e Testes de Regressão de Segurança (Fase 12 — GSD)  
**Status Geral:** ✅ Aprovado com Vulnerabilidades Corrigidas e Testes de Regressão Adicionados

---

## Sumário Executivo

Uma auditoria técnica defensiva em profundidade foi conduzida em toda a base de código do sistema CFO CBMERJ, abrangendo camadas de infraestrutura de rede, controle de sessão e autenticação (Better Auth / SQLite), autorização granular de papéis (Admin, Support, Cadet), proteção de rotas e APIs, manipulação de arquivos de upload, canais em tempo real (SSE) e governança de repositório/segredos.

Foram identificadas não-conformidades de segurança críticas e de alta prioridade (como a presença de bypasses via `adminKey` e validação CORS permissiva por prefixo), as quais foram **imediatamente corrigidas no backend**, acompanhadas de **testes de regressão automatizados** integrados à suíte permanente de testes (81/81 testes aprovados).

---

## 1. Better Auth & Autenticação

| Item Auditado | Status | Parecer Técnico |
|---|---|---|
| **Configuração** | Conforme | Modelo de autoridade centralizada no backend com SQLite criptograficamente consistente e HMAC/SHA-256. |
| **Sessões** | Conforme | Tokens aleatórios de 32 bytes gerados via `crypto.randomBytes(32)` com hash SHA-256 no banco de dados. Sessões revogadas (`revoked_at`) ou expiradas são invalidadas imediatamente na consulta com junção à tabela de usuários. |
| **Cookies / Headers** | Conforme | Suporte estrito via `Authorization: Bearer <token>` e proteção com `SameSite=Lax/Strict` e `HttpOnly` quando aplicável. |
| **Reset Password** | Conforme | Código numérico de 6 dígitos gerado criptograficamente com validade curta (15 minutos). Consumo atômico de uso único. Resposta idêntica para e-mails cadastrados e inexistentes para evitar enumeração. |
| **Rate Limiting** | Conforme | Limitadores ativos no Express: `apiLimiter` (350 req/15min) e `authLimiter` (15 tentativas/15min) protegendo rotas críticas de força bruta. |
| **2FA (TOTP)** | Conforme | Algoritmo RFC 6238 via biblioteca `otplib`. Proteção anti-replay com janela temporal de consumo e bloqueio de reaproveitamento de código em 3 minutos. |
| **Recovery Codes** | Conforme | Conjunto de 8 códigos alfanuméricos gerados por entropia criptográfica (Base32), armazenados exclusivamente como hash SHA-256 (`code_hash`). Invalidação atômica de uso único (`is_used = 1, used_at = now`). Reutilização sumariamente rejeitada. |

---

## 2. Autorização & Controle de Acesso

| Item Auditado | Status | Parecer Técnico |
|---|---|---|
| **IDOR (Insecure Direct Object Reference)** | Conforme | Endpoints de usuário (ex: `PATCH /api/user/profile` e upload de avatar) utilizam exclusivamente o `userId` extraído da sessão autenticada do servidor (`(req as any).user.userId`), ignorando qualquer identificador enviado no corpo ou na URL. |
| **Privilege Escalation** | Conforme | Acesso a rotas administrativas (`/api/admin/*`) rejeita categoricamente tokens com papéis `cadet`. Usuários comuns não possuem permissão para executar nenhuma mutação administrativa. |
| **Role Adulterável** | Conforme | O papel (`role`) só pode ser alterado através do endpoint dedicado `PATCH /api/admin/users/:id/role`, protegido por `requireAdminWriteAuth` e confirmação obrigatória de 2FA Step-Up (`requireStepUpAuth`). |
| **Permission Bypass** | Conforme | Operadores com papel `support` possuem acesso estritamente de leitura (read-only); tentativas de mutação de status, papéis ou revogação de sessões retornam `403 PERMISSION_DENIED`. |
| **Mass Assignment** | Conforme | Controllers aceitam exclusivamente propriedades explícitas validadas. Campos como `id`, `role`, `status`, `passwordHash` ou `email` são estritamente filtrados e não podem ser injetados por JSON. |
| **Endpoints Admin Desprotegidos** | Conforme | Todos os 16 endpoints administrativos possuem proteção server-side com `requireAdminAuth` ou `requireAdminWriteAuth` + `requireStepUpAuth`. |

---

## 3. Testes Administrativos de Penetração

| Teste | Resultado | Comportamento Observado |
|---|---|---|
| **Acessar `/admin` como usuário comum** | Bloqueado (403) | O frontend oculta a visão e o backend retorna status 403 `FORBIDDEN` ao verificar que a role da sessão é `cadet`. |
| **Chamar APIs administrativas diretamente via curl** | Bloqueado (403) | Requisições diretas sem header de autorização ou com token inválido/cadete são rejeitadas antes de qualquer processamento de dados. |
| **Adulterar Role no perfil (`{ role: 'admin' }`)** | Inócuo (200 / Role inalterado) | Apenas campos cadastrais são persistidos; o papel no banco de dados permanece inalterado. |
| **Adulterar IDs em requisições de usuário** | Inócuo | O backend busca o usuário pela chave primária da sessão do token autenticado, e não pelo ID enviado na payload. |
| **Reutilizar Recovery Code** | Bloqueado (401) | O primeiro uso consome o código atômico; a segunda tentativa é rejeitada com código inválido/consumido. |
| **Contornar 2FA** | Bloqueado (400/401) | Tentativas de obter sessão de administrador sem fornecer TOTP válido ou Recovery Code falham; nenhuma sessão é emitida. |
| **Usar sessão revogada** | Bloqueado (403) | A consulta de validação de sessão no banco exige `revoked_at IS NULL`; sessões revogadas por logout ou intervenção administrativa falham imediatamente. |

---

## 4. Segurança Web

| Vetor | Status | Mitigação Implementada |
|---|---|---|
| **XSS (Cross-Site Scripting)** | Mitigado | Cabeçalhos Helmet rigorosos com Content Security Policy (`scriptSrc`, `styleSrc`, `objectSrc: none`). O frontend React faz escape nativo de variáveis na renderização do DOM. |
| **CSRF (Cross-Site Request Forgery)** | Mitigado | Arquitetura de API stateless orientada a tokens em cabeçalhos de requisição (`Authorization: Bearer <token>`). Sem dependência de cookies de autenticação vulneráveis a ambient credentials. |
| **CORS (Cross-Origin Resource Sharing)** | Corrigido | Validação estrita de origem exata via `extractOrigin` e comparação por conjunto normalizado (`normalizedAllowedOrigins.has(origin)`). O antigo matching vulnerável por prefixo (`startsWith`) foi eliminado. Em desenvolvimento, apenas `localhost` e `127.0.0.1` válidos são admitidos. |
| **SQL Injection** | Mitigado | Uso exclusivo de consultas preparadas (`DatabaseSync.prepare`) com parâmetros posicionais vinculados (`?`). Nenhuma concatenação ou interpolação de strings em comandos SQL. |
| **Open Redirect** | Mitigado | Não há endpoints que executem redirecionamentos HTTP (`res.redirect`) baseados em parâmetros do cliente. Respostas são exclusivamente JSON ou servidas estaticamente. |
| **Security Headers** | Conforme | Helmet configurado: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security`. |
| **Error Disclosure** | Conforme | Mensagens de erro de banco de dados e exceptions internas são capturadas por blocos `try/catch` e sanitizadas para retornos genéricos e seguros, sem expor stacktraces ao cliente. |

---

## 5. Upload de Arquivos & Mídias

| Vetor | Status | Mitigação Implementada |
|---|---|---|
| **MIME Falso** | Bloqueado | A função `validateImageBuffer` ignora o cabeçalho `Content-Type` do cliente e analisa os **Magic Bytes reais** no buffer do arquivo (ex: `ffd8ff` para JPEG, `89504e47` para PNG, `52494646...WEBP` para WebP). |
| **Extensão Falsa** | Bloqueado | A extensão do arquivo salvo é determinada unicamente a partir do MIME detectado pelos Magic Bytes, e nunca a partir do nome original do arquivo enviado. |
| **Executáveis / Scripts** | Bloqueado | Arquivos `.exe` (cabeçalho MZ), `.sh`, `.php`, bem como scripts vetoriais SVG (`<svg onload=...>`) são sumariamente rejeitados. |
| **Arquivo Grande (DoS)** | Bloqueado | Limite estrito de 3MB (`MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024`). Payloads superiores são rejeitados antes do processamento. |
| **Path Traversal** | Bloqueado | Nomes de arquivos fornecidos pelo usuário são descartados. O arquivo final é nomeado com hash criptográfico SHA-256 (`crypto.createHash('sha256').update(...).digest('hex').slice(0, 24) + '.' + extension`), tornando ataques do tipo `../../` fisicamente impossíveis. |
| **Ownership** | Bloqueado | A gravação no banco de dados vincula o avatar diretamente ao ID da sessão autenticada. |

---

## 6. Realtime (Server-Sent Events)

| Vetor | Status | Mitigação Implementada |
|---|---|---|
| **Autenticação** | Conforme | O handshake SSE em `/api/admin/realtime/stream` é intermediado por `requireAdminAuth`, exigindo Bearer Token válido. |
| **Autorização** | Conforme | Apenas usuários com papel `admin` ou `support` podem abrir a conexão SSE. Conexões de cadetes ou anônimos recebem 403. |
| **Isolamento entre Usuários** | Conforme | O canal transmite apenas eventos de governança de segurança administrativa. Dados de terceiros e senhas não são publicados no hub. |
| **Sessão Expirada / Revogada** | Conforme | Sessões revogadas ou expiradas falham no handshake inicial. Clientes desconectados são desregistrados via evento `req.on('close')`. |
| **Reconexão Resiliente** | Conforme | Suporte ao cabeçalho `Last-Event-ID` com entrega de eventos perdidos armazenados em buffer limitado e deduplicação por ID único de evento no frontend. |

---

## 7. Logs & Monitoramento

| Item | Status | Mitigação Implementada |
|---|---|---|
| **Senhas / Hashes** | Limpo | As funções de auditoria e logging aplicam filtros estritos; senhas brutas nunca são impressas no console ou gravadas em tabelas de auditoria. |
| **Tokens / Sessões** | Limpo | Apenas hashes SHA-256 são mantidos para comparação em banco. Tokens brutos nunca são logados. |
| **Cookies / Headers** | Limpo | Cabeçalhos de autorização não são ecoados em logs de sistema. |
| **Segredos TOTP / Recovery** | Limpo | Códigos de recuperação e segredos TOTP Base32 não aparecem nos logs de auditoria. O log de depuração de recuperação de senha em console foi desativado em produção. |
| **Integridade dos Logs** | Conforme | Triggers SQLite `prevent_audit_events_update` e `prevent_audit_events_delete` garantem comportamento estritamente **append-only**. Nenhum usuário ou administrador pode alterar ou deletar registros de auditoria. |

---

## 8. Repositório, Segredos & Bypasses Corrigidos

### Vulnerabilidades Encontradas e Corrigidas

1. **Eliminação de Backdoor `adminKey` / `x-admin-key`:**
   - **Problema:** Existência de parâmetro secreto em rotas administrativas e middleware de IP ban permitindo bypass de autenticação.
   - **Correção:** Todo suporte a `adminKey` e `x-admin-key` foi removido de `server.ts` (`requireAdminAuth`, `requireAdminWriteAuth`, `/api/auth/2fa-setup`). O desbloqueio de IPs foi movido para uma rota administrativa legítima (`POST /api/admin/unban`) protegida por `requireAdminWriteAuth` e `requireStepUpAuth`.
   - **Correção de Vazamento:** Removida a orientação `"Acesse com ?adminKey=sua_senha..."` da mensagem de erro 403 de IP banido.

2. **Fortalecimento de Validação CORS:**
   - **Problema:** A validação de origem usava `startsWith`, permitindo que atacantes usassem domínios como `http://localhost:3000.evil.com`.
   - **Correção:** Implementada validação por igualdade estrita de origens normalizadas (`new URL(origin).origin`).

3. **Bloqueio de Fallbacks Fracos em Produção:**
   - **Problema:** Credenciais e segredos padrão podiam ser usados caso as variáveis de ambiente não estivessem configuradas.
   - **Correção:** Em ambiente `production`, a ausência de variáveis obrigatórias (`ADMIN_PASSWORD`, `CADET_PASSWORD`, `SESSION_SECRET`, etc.) aborta imediatamente a execução do processo com erro fatal (`process.exit(1)`).

4. **Limpeza de Legado Cognito:**
   - **Problema:** Interfaces e configurações residuais de AWS Cognito não utilizadas.
   - **Correção:** Removidas declarações órfãs de `src/db/authService.ts` e do `.env.example`.

5. **Auditoria de Arquivos Sensíveis:**
   - O arquivo `.gitignore` previne a indexação de qualquer arquivo `.env*` (exceto `.env.example`), logs, arquivos de banco e chaves.
   - Nenhuma chave de API privada, hash de senha real ou credencial de produção foi identificada ou versionada no repositório Git.

---

## 9. Suíte de Testes de Regressão

A suíte completa de testes automatizados conta com **81 testes**, cobrindo 11 arquivos de teste:
- `test/models.test.ts`
- `test/auth.test.ts`
- `test/profile.test.ts`
- `test/audit_security.test.ts`
- `test/admin_panel.test.ts`
- `test/admin_security_2fa.test.ts`
- `test/admin_realtime.test.ts`
- `test/admin_users_management.test.ts`
- `test/admin_audit.test.ts`
- `test/frontend_integration.test.ts`
- `test/security_review.test.ts` *(Novo — 7 testes de regressão de segurança adicionados na Fase 12)*

**Resultado da Execução:**
```
ℹ tests 81
ℹ suites 0
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~9100ms
```
**TypeScript Typecheck:** 0 erros (`tsc --noEmit`).  
**Production Build:** Sucesso (`vite build` + `esbuild server.ts`).
