# CFO CBMERJ — Production Readiness Checklist

> **Gerado em:** 2026-09-07 | **Revisão:** FASE 13
> **Branch:** `main` | **Testes:** 81/81 ✅ | **Build:** ✅ | **TypeScript:** ✅

---

## LEGENDA

| Símbolo | Significado |
|---------|-------------|
| ✅ | Verificado e em conformidade |
| ⚠️ | Atenção — funciona, mas precisa de configuração manual em produção |
| ❌ | Blocker crítico — NÃO subir para produção sem resolver |
| 🔧 | Ação manual necessária no Render / ambiente de produção |

---

## 1. HTTPS / TLS

| Item | Status | Nota |
|------|--------|------|
| HTTPS ativo no Render | ✅ | Render provisiona TLS automaticamente via Let's Encrypt |
| HSTS configurado | ✅ | max-age=31536000; includeSubDomains; preload — server.ts:346 |
| HTTP → HTTPS redirect | ✅ | Gerenciado pelo Render (reverse proxy) |
| trust proxy 1 configurado | ✅ | server.ts:63 — correto para 1 hop de proxy do Render |

---

## 2. COOKIES E SESSÕES

| Item | Status | Nota |
|------|--------|------|
| Tokens via Bearer header | ✅ | Não usa cookies — imune a CSRF clássico |
| Sessões armazenadas no banco | ✅ | Tabela sessions com token_hash, expires_at, revoked_at |
| Revogação imediata de sessão | ✅ | Verificada em tempo real; testada em test/admin_security_2fa.test.ts |
| Expiração de sessão | ✅ | 24h padrão; 30d com "lembre-me" |

---

## 3. CSRF

| Item | Status | Nota |
|------|--------|------|
| Proteção CSRF | ✅ | SPA usa Authorization: Bearer — imune a CSRF por design |
| CORS estrito | ✅ | Whitelist explícita de origins; sem wildcard; server.ts:378 |
| Origin forjada rejeitada | ✅ | Testado em test/security_review.test.ts |

---

## 4. HEADERS DE SEGURANÇA (HELMET)

| Header | Status |
|--------|--------|
| Content-Security-Policy | ✅ |
| X-Content-Type-Options: nosniff | ✅ |
| Strict-Transport-Security | ✅ |
| Referrer-Policy: strict-origin-when-cross-origin | ✅ |
| X-Frame-Options / frame-ancestors | ✅ via CSP |

---

## 5. RATE LIMITING

| Limiter | Janela | Máx. Req. | Status |
|---------|--------|-----------|--------|
| apiLimiter (todas /api/) | 15 min | 350 | ✅ |
| authLimiter (login) | 15 min | 15 | ✅ |
| twoFactorLimiter (verify-2fa) | 15 min | 10 | ✅ |

> **⚠️ ATENÇÃO:** Em produção com múltiplas instâncias, o rate limiter é in-memory. Considere um store Redis se escalar horizontalmente.

---

## 6. VARIÁVEIS DE AMBIENTE

| Variável | Obrigatória | Ação |
|----------|-------------|------|
| NODE_ENV=production | ✅ | 🔧 Configurar no Render |
| APP_URL | ✅ | 🔧 URL real do Render |
| ADMIN_PASSWORD_HASH | ✅ | 🔧 Gerar com bcrypt |
| CADET_PASSWORD_HASH | ✅ | 🔧 Gerar com bcrypt |
| TOTP_SECRET | ✅ | 🔧 Gerar com otplib |
| SESSION_SECRET | ✅ | 🔧 64 hex chars aleatórios |
| TURNSTILE_SECRET_KEY | ✅ | 🔧 Dashboard Cloudflare |
| ADMIN_TRUSTED_IPS | Recomendada | 🔧 IP fixo do admin |
| GEMINI_API_KEY | Opcional | 🔧 Para IA |
| GOOGLE_CLIENT_ID/SECRET | Opcional | 🔧 Para Google Calendar |
| NOTION_API_KEY/DATABASE_ID | Opcional | 🔧 Para cronograma |
| BACKUP_S3_* | Opcional | 🔧 Para backup off-site R2/S3 |

> ✅ **Validação em startup:** Se NODE_ENV=production e qualquer variável obrigatória estiver ausente, o servidor aborta com process.exit(1).

> ✅ **Nenhum secret de backend no bundle do cliente.** A Firebase WebAPI key presente no bundle é uma **chave pública de cliente** por design do Firebase SDK — destinada a estar no browser.

---

## 7. BANCO DE DADOS

| Item | Status | Nota |
|------|--------|------|
| Engine SQLite nativa (node:sqlite) | ✅ | Zero dependências externas |
| Migrations automáticas no startup | ✅ | runMigrations() em database.ts |
| Constraints e CHECK | ✅ | role IN (...), status IN (...) |
| Índices únicos | ✅ | email, username, sku, token_hash |
| Foreign keys com CASCADE | ✅ | Perfis, sessões, recovery codes |
| Arquivo data/cfo.db | ⚠️ | Armazenado em disco local |

> ❌ **BLOCKER CRÍTICO #1 — PERSISTÊNCIA DO BANCO:**
>
> O SQLite armazenado em `data/cfo.db` é **perdido** em restarts no Render Free Tier (filesystem efêmero).
>
> **Ações obrigatórias antes de produção com usuários reais:**
> - **Opção A (Recomendada):** Adicionar **Persistent Disk** no Render e montar em `/data`.
> - **Opção B:** Migrar para PostgreSQL gerenciado (Neon, Railway, Supabase).
> - **Opção C (paliativa):** Configurar `BACKUP_S3_*` para backup off-site — resolve perda de dados mas não a disponibilidade após restart.

---

## 8. BACKUP

| Item | Status | Nota |
|------|--------|------|
| Backup automático diário 03:00 | ✅ | initBackupScheduler() |
| Retenção de 30 dias | ✅ | Implementado no scheduler |
| Backup off-site S3/R2 | ⚠️ | Infraestrutura pronta; requer BACKUP_S3_* |
| Verificação SHA-256 | ✅ | verifyBackupIntegrity() |
| Restore via API admin | ✅ | restoreBackup() disponível |

---

## 9. E-MAIL

| Item | Status | Nota |
|------|--------|------|
| Geração de código de recuperação | ✅ | 6 dígitos, expiração 15 min, uso único |
| Envio de e-mail real | ❌ | **Não implementado** — código retornado na API |
| Serviço SMTP | ❌ | SMTP_HOST/SMTP_USER/SMTP_PASS não existem no sistema |

> ❌ **BLOCKER CRÍTICO #2 — E-MAIL DE RECUPERAÇÃO:**
>
> O endpoint `forgot-password` retorna o código de recuperação diretamente na resposta da API em vez de enviá-lo por e-mail. Isso é inseguro em produção.
>
> **Ação necessária:** Integrar um serviço de e-mail transacional:
> - Resend (`npm install resend`) — recomendado, mais simples
> - SendGrid ou Nodemailer+SMTP
>
> O código deve ser **enviado por e-mail** e **nunca retornado na API**.

---

## 10. AUTENTICAÇÃO E 2FA

| Item | Status | Nota |
|------|--------|------|
| Bcrypt para senhas (custo 10) | ✅ | server.ts:638 |
| TOTP 2FA obrigatório para admin | ✅ | Testado |
| Recovery codes de uso único | ✅ | Consumidos no banco; reutilização bloqueada |
| Anti-replay TOTP | ✅ | usedTotpCodes cache |
| Geo-fencing Brasil para admin | ✅ | Bloqueia sem banir IP permanentemente |
| Step-up authentication | ✅ | Exigido para operações críticas |
| Rate limiting em login/2FA | ✅ | Configurado |
| Sessões revogadas rejeitadas | ✅ | Verificação em tempo real |
| Cloudflare Turnstile | ✅ | Anti-bot; bypass para admin IPs |

---

## 11. AUTORIZAÇÃO

| Item | Status | Nota |
|------|--------|------|
| IDOR bloqueado | ✅ | Ownership verificado em todas queries |
| Privilege escalation bloqueado | ✅ | role não pode ser alterado via frontend |
| Mass assignment bloqueado | ✅ | Apenas campos explicitamente aceitos |
| Todos /api/admin/* protegidos | ✅ | requireAdminAuth em todos |
| Usuário comum não acessa admin | ✅ | Testado em test/admin_panel.test.ts |
| Admin mestre não pode ser suspenso | ✅ | Proteção explícita |
| Sem backdoors ou bypass | ✅ | adminKey/x-admin-key rejeitados |

---

## 12. LOGS E MONITORAMENTO

| Item | Status | Nota |
|------|--------|------|
| Audit log em banco (audit_events) | ✅ | Append-only, indexado |
| Audit log em arquivo (data/audit.log) | ✅ | JSON Lines, sanitizado |
| Logs sensíveis sanitizados | ✅ | password, token, totp removidos |
| Health check GET /api/health | ✅ | Retorna status, uptime, timestamp |
| Monitoramento externo | ⚠️ | Configurar UptimeRobot para /api/health |
| Alertas realtime (SSE) | ✅ | adminRealtimeHub < 100ms |
| Erros não expostos ao cliente | ✅ | Middleware centralizado |

---

## 13. DETECÇÃO DE IP E PROXY

| Item | Status |
|------|--------|
| trust proxy 1 | ✅ |
| cf-connecting-ip prioritário | ✅ |
| req.ip como fallback | ✅ |
| req.body.ip nunca aceito | ✅ |

---

## 14. REALTIME (SSE)

| Item | Status |
|------|--------|
| Autenticação obrigatória na conexão | ✅ |
| Usuário comum bloqueado (403) | ✅ |
| Deduplicação de eventos por Last-Event-ID | ✅ |
| Reconnect com replay de eventos pendentes | ✅ |
| Desconexão limpa o hub | ✅ |

---

## 15. BUILD DE PRODUÇÃO

| Item | Status |
|------|--------|
| Frontend (vite build) | ✅ |
| Backend (esbuild server.ts) | ✅ |
| TypeScript (tsc --noEmit) | ✅ 0 erros |
| Testes (npm test) | ✅ 81/81 pass |
| Secrets de backend no bundle cliente | ✅ Não encontrados |

---

## 16. RENDER.COM — CHECKLIST PRÉ-DEPLOY

```bash
# Verificações locais antes de cada deploy:
npm run lint        # deve retornar 0 erros
npm test            # deve passar 81/81
npm run build       # deve concluir sem erros

# Confirmar que .env NÃO está commitado:
git status          # .env não deve aparecer

# Confirmar build command no Render:
npm run build

# Confirmar start command no Render:
npm run start
```

---

## RESUMO — BLOCKERS CRÍTICOS

| # | Blocker | Severidade |
|---|---------|------------|
| 1 | Banco SQLite efêmero no Render Free Tier — dados perdidos em restart | 🔴 CRÍTICO |
| 2 | E-mail de recuperação de senha não enviado — código retornado na API | 🔴 CRÍTICO |

### Itens de Atenção (não blockers para MVP interno):

| # | Item | Severidade |
|---|------|------------|
| 3 | Rate limiting in-memory (não escalável horizontalmente) | 🟡 MÉDIO |
| 4 | unsafe-eval na CSP | 🟡 MÉDIO |
| 5 | Bundle JS grande (1.7 MB) — sem code-splitting | 🟢 BAIXO |
| 6 | Tokens em localStorage (vs cookie HttpOnly) | 🟢 BAIXO — aceitável para SPA interna |
| 7 | server.cjs.map no disco do servidor | 🟢 BAIXO — não acessível via HTTP |

---

*Documento gerado automaticamente pela FASE 13 — Production Readiness Review.*
