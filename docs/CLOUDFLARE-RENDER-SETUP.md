# Cloudflare + Render — Guia de Configuração de Segurança

> **Objetivo:** Colocar o Cloudflare como proxy entre a Internet e o seu app no Render,
> ocultando o IP de origem e ativando proteção DDoS real (L3/L4/L7).

## Arquitetura Resultante

```
Internet (Atacante + Usuário)
  │
  ▼
Cloudflare (Anycast — absorve volumétrico antes de chegar no Render)
  │  WAF + Bot Fight Mode + Edge Rate Limit + SSL offload
  ▼
Render Edge (TLS pass-through ou terminado aqui)
  │  Apenas tráfego filtrado chega ao app
  ▼
server.ts (rate limit, timeouts, fail-fast 503)
  │
  ▼
PostgreSQL (Render managed — nunca exposto diretamente)
```

---

## Pré-requisitos

- Conta Cloudflare (plano Free é suficiente para proteções básicas)
- Domínio próprio registrado em qualquer registrar
- App rodando no Render com URL `.onrender.com` funcionando

---

## Passo 1 — Adicionar Domínio ao Cloudflare

1. Acesse [dash.cloudflare.com](https://dash.cloudflare.com) → **Add a Site**
2. Insira seu domínio (ex: `cfo-cbmerj.com.br`)
3. Escolha o plano **Free** (proteção DDoS básica já incluída)
4. O Cloudflare vai escanear seus DNS records existentes automaticamente

---

## Passo 2 — Configurar DNS Records

No painel do Cloudflare → **DNS → Records**:

```
Tipo    Nome    Conteúdo                          Proxy
CNAME   @       SEU-APP.onrender.com              ✅ Proxied (nuvem laranja)
CNAME   www     SEU-APP.onrender.com              ✅ Proxied (nuvem laranja)
```

> **CRÍTICO:** A nuvem deve estar **LARANJA** (proxied).
> Nuvem cinza = IP do Render exposto = proteção zero.

### Para subdomínios adicionais

```
CNAME   api     SEU-APP.onrender.com              ✅ Proxied
```

> **Nunca criar records sem proxy** para o mesmo app de produção,
> nem mesmo temporariamente para "testar sem o proxy".

---

## Passo 3 — Trocar Nameservers no Registrar

O Cloudflare vai mostrar dois nameservers, ex:
```
mia.ns.cloudflare.com
leo.ns.cloudflare.com
```

No painel do seu registrar de domínio (Registro.br, GoDaddy, etc.):
- Substitua os nameservers atuais pelos dois acima
- Propagação: 5 minutos a 48 horas

---

## Passo 4 — Configurações de SSL/TLS

Cloudflare → **SSL/TLS → Overview**:

```
Modo: Full (Strict)
```

> **Nunca usar "Flexible"** — nesse modo o Cloudflare se conecta ao Render
> via HTTP, e qualquer dado entre CF e Render viaja sem criptografia.

Cloudflare → **SSL/TLS → Edge Certificates**:
```
☑ Always Use HTTPS: ON
☑ Minimum TLS Version: TLS 1.2
☑ Opportunistic Encryption: ON
☑ TLS 1.3: ON
```

---

## Passo 5 — Ativar Proteções de Segurança

### Bot Fight Mode
Cloudflare → **Security → Bots**:
```
☑ Bot Fight Mode: ON
```
Bloqueia automaticamente ferramentas de scraping e scanners conhecidos.

### Security Level
Cloudflare → **Security → Settings**:
```
Security Level: High
  (Durante ataque ativo: trocar para "Under Attack" temporariamente)
```

### WAF — Managed Rules
Cloudflare → **Security → WAF → Managed Rules**:
```
☑ Cloudflare Managed Ruleset: ON
☑ Cloudflare OWASP Core Ruleset: ON
```

### WAF — Rate Limiting Rules (criar manualmente)

Cloudflare → **Security → WAF → Rate Limiting Rules** → Create rule:

**Regra 1 — Proteção global:**
```
Nome: Global Rate Limit
Se: (http.request.full_uri contains "/")
Taxa: 100 requests per 10 seconds (por IP)
Ação: Block
Duração do bloqueio: 1 hour
```

**Regra 2 — Proteção de autenticação:**
```
Nome: Auth Rate Limit
Se: (http.request.uri.path contains "/api/auth/")
Taxa: 10 requests per 60 seconds (por IP)
Ação: Block
Duração do bloqueio: 6 hours
```

---

## Passo 6 — Configurar Variáveis de Ambiente no Render

Render → **Dashboard → seu serviço → Environment**:

| Variável | Valor |
|---|---|
| `TRUST_CLOUDFLARE_HEADERS` | `true` |
| `TRUSTED_PROXIES` | *(deixar vazio — o Render já está atrás da CF)* |

> **ATENÇÃO:** Só defina `TRUST_CLOUDFLARE_HEADERS=true` APÓS confirmar que
> o Cloudflare está ativo (nuvem laranja no DNS e CF-Ray aparecendo nos headers).
> Habilitar sem CF ativo permite que qualquer pessoa forje `CF-Connecting-IP`.

### Verificar se o CF está ativo antes de mudar a variável:

```bash
curl -sI https://seudominio.com | grep -i "cf-ray"
# Se retornar algo como: cf-ray: 7a1b2c3d4e5f-GRU
# Então pode ativar TRUST_CLOUDFLARE_HEADERS=true com segurança
```

---

## Passo 7 — Caching de Assets Estáticos (opcional, reduz carga no Render)

Cloudflare → **Caching → Cache Rules** → Create rule:

**Assets estáticos (imagens, JS, CSS):**
```
Nome: Static Assets Cache
Se: (http.request.uri.path matches "\.(js|css|png|jpg|webp|woff2|svg|ico)$")
Ação: Cache Everything
Edge TTL: 30 days
Browser TTL: 1 day
```

**APIs e rotas autenticadas (NUNCA cachear):**
```
Nome: Bypass Cache for API
Se: (http.request.uri.path starts_with "/api/")
Ação: Bypass cache
```

> **CRÍTICO:** Nunca cachear `/api/` na borda. Isso pode servir dados de um
> usuário para outro ou congelar respostas de autenticação.

---

## Passo 8 — Desabilitar Acesso Direto via .onrender.com

> **Problema:** Mesmo com Cloudflare ativo, o Render ainda responde em
> `SEU-APP.onrender.com`. Um atacante que descubra essa URL bypassa toda a
> proteção do Cloudflare.

### Solução no server.ts (já implementada):

O app já verifica o header `Host` — mas o bloqueio de `.onrender.com` deve
ser feito no nível do Cloudflare WAF ou via Render custom rules:

**Opção A (Gratuita) — Redirecionar no server.ts:**

Adicionar middleware que rejeita requests cujo `Host` seja o subdomínio do Render:

```typescript
// Adicionar no server.ts, antes dos outros middlewares
const RENDER_SUBDOMAIN = process.env.RENDER_EXTERNAL_HOSTNAME || '';
if (RENDER_SUBDOMAIN && process.env.NODE_ENV === 'production') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const host = req.headers.host || '';
    // Bloquear acesso direto via .onrender.com
    if (host.endsWith('.onrender.com') && RENDER_SUBDOMAIN) {
      return res.status(421).json({
        error: 'DIRECT_ACCESS_FORBIDDEN',
        message: 'Acesso direto não permitido. Use o domínio oficial.',
      });
    }
    next();
  });
}
```

**Opção B (Recomendada — Planos pagos do Render):**
- Render → **Settings → Custom Domains → Enable custom domain only**
- Isso desativa o subdomínio `.onrender.com` completamente

---

## Passo 9 — Verificação Final

Execute o script de auditoria incluído no projeto:

```bash
# Em ambiente Linux/macOS (ou WSL no Windows)
bash scripts/audit-ip-leak.sh seudominio.com
```

Resultado esperado após configuração correta:
```
[PASS] seudominio.com → 104.21.x.x (IP Cloudflare OK)
[PASS] CF-Ray presente — resposta vem pela Cloudflare
[PASS] Sem X-Powered-By
[PASS] HSTS presente
[PASS] X-Content-Type-Options: nosniff
```

---

## Checklist de Verificação

```
☐ DNS records com proxy ativo (nuvem laranja) no Cloudflare
☐ SSL/TLS: Full (Strict) — nunca Flexible
☐ Always Use HTTPS: ON
☐ Bot Fight Mode: ON
☐ WAF Managed Rules: ON
☐ Rate Limiting Rules criadas (global + auth)
☐ curl -sI https://seudominio.com | grep cf-ray  → retorna valor
☐ TRUST_CLOUDFLARE_HEADERS=true no Render (após confirmar CF ativo)
☐ Subdomínio .onrender.com não responde externamente (ou retorna 421)
☐ Sem MX records apontando para o servidor de app
☐ Script audit-ip-leak.sh: todos os checks PASS
```

---

## Referências

| Recurso | URL |
|---|---|
| Cloudflare IP Ranges | https://www.cloudflare.com/ips/ |
| Cloudflare WAF Docs | https://developers.cloudflare.com/waf/ |
| Render Custom Domains | https://docs.render.com/custom-domains |
| crt.sh (histórico TLS) | https://crt.sh |
| SecurityTrails (histórico DNS) | https://securitytrails.com |
