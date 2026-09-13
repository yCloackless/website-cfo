# Relatório de Remediação de Segurança - Auditoria OWASP ZAP

Este documento consolida a auditoria técnica, diagnóstico de causa-raiz e remediações aplicadas no projeto **Rumo ao CFO** com base nos 4 apontamentos da varredura mais recente do OWASP ZAP.

---

## 1. Sumário dos Apontamentos e Classificação

| # | Apontamento OWASP ZAP | Classificação | Status |
|---|---|---|---|
| **1** | Content Security Policy: style-src includes unsafe-inline | **Confirmado** | **Mitigado** |
| **2** | Unix Timestamp Disclosure | **Falso Positivo / Informativo** | **Analisado & Documentado** |
| **3** | Modern Web Application | **Informativo** | **Mantido por Design** |
| **4** | Re-examine Cache-Control Directives | **Confirmado** | **Mitigado** |

---

## 2. Detalhamento Técnico de Cada Apontamento

### 2.1. Content Security Policy: style-src includes unsafe-inline
- **Descrição do Scanner**: A política de segurança de conteúdo (`Content-Security-Policy`) continha `'unsafe-inline'` na diretiva `style-src`, enfraquecendo a proteção contra injeção e manipulação não autorizada de estilos.
- **Investigação e Causa Raiz**:
  - A diretiva `style-src` no Helmet em `server.ts` declarava explicitamente `'unsafe-inline'`.
  - Páginas autocontidas de visualização 3D Three.js (`public/point-sphere.html` e `public/blackhole-disc.html`) continham tags `<style>` embutidas e uma rota com política dedicada que também declarava `style-src 'self' 'unsafe-inline'`.
  - O frontend SPA React necessita de atributos dinâmicos `style="..."` em runtime para renderização de fórmulas matemáticas (KaTeX), animações de transição (Framer Motion), gráficos SVG responsivos (Recharts) e barras dinâmicas de progresso/cores de matérias.
- **Remediação Aplicada**:
  - Removido terminantemente `'unsafe-inline'` de `style-src` e `style-src-elem` no Helmet.
  - Adicionada a diretiva CSP Nível 3 `style-src-elem: ["'self'", "https://fonts.googleapis.com"]` (bloqueando quaisquer tags `<style>` inline não autorizadas).
  - Configurada a diretiva `style-src-attr: ["'unsafe-inline'"]` para autorizar estritamente atributos de elementos manipulados via DOM pelo React/KaTeX/Recharts sem comprometer folhas de estilo.
  - Extraídos os estilos inline dos visuais Three.js para o arquivo estático `public/visuals.css`.
  - Atualizada a CSP dedicada das rotas `/point-sphere.html` e `/blackhole-disc.html` para `style-src 'self'`, eliminando `'unsafe-inline'`.
- **Risco Residual**: Navegadores muito antigos que não suportam CSP Nível 3 (`style-src-attr`) utilizam `style-src` como fallback. No entanto, todos os navegadores modernos (Chrome 75+, Edge 79+, Firefox 69+, Safari 15.4+) aplicam CSP Nível 3 com total conformidade.

---

### 2.2. Unix Timestamp Disclosure
- **Descrição do Scanner**: O ZAP identificou valores numéricos interpretados como timestamps em formato de época Unix (epoch).
- **Investigação e Causa Raiz**:
  - O endpoint público de verificação de disponibilidade `/api/health` retornava `timestamp: Date.now()` (milissegundos) como indicador operacional de liveness probe.
  - Entidades de auditoria, histórico de estudo e sessões retornam propriedades operacionais legítimas (`createdAt`, `updatedAt`, `expiresAt`, `timestamp`).
  - Cabeçalhos de rate-limit padrão RFC 6585 (`RateLimit-Reset`) informam o intervalo de renovação de cota.
- **Avaliação de Segurança**:
  - Nenhum dos timestamps identificados expõe segredos criptográficos, chaves privadas, hashes, identificadores confidenciais ou detalhes da infraestrutura interna do servidor/banco.
  - Trata-se de metadados operacionais padrão de requisição e auditoria, esperados em arquiteturas web resilientes.
- **Remediação Aplicada**:
  - Classificado tecnicamente como **Falso Positivo / Informativo**.
  - Assegurada a inclusão de cabeçalhos estritos `Cache-Control: no-cache, no-store, must-revalidate` no endpoint `/api/health` para impedir que respostas com timestamps operacionais sejam cacheadas por proxies ou CDNs intermediárias.

---

### 2.3. Modern Web Application
- **Descrição do Scanner**: Alerta informativo do ZAP (ID 10109) indicando a detecção de tecnologias características de aplicações web modernas (SPA, React, Vite, roteamento no cliente e chamadas assíncronas via `fetch`).
- **Avaliação**: Informativo puro. Nenhuma vulnerabilidade ou fraqueza de segurança.
- **Remediação Aplicada**:
  - Mantido integralmente sem alterações no código, preservando a arquitetura React/Vite e a biblioteca de componentes.

---

### 2.4. Re-examine Cache-Control Directives
- **Descrição do Scanner**: O scanner recomendou revisão das diretivas de controle de cache (`Cache-Control`) para evitar armazenamento de dados sensíveis em caches compartilhadas e garantir política adequada por tipo de recurso.
- **Investigação e Causa Raiz**:
  - `/api/health` era registrado antes do middleware de API e não possuía cabeçalho explícito de cache.
  - `express.static` em produção servia todos os arquivos com cache padrão, sem diferenciar arquivos versionados com hash imutável de arquivos HTML de entrada.
  - A rota coringa `app.get('*')` que entrega `index.html` não desativava expressamente o cache, permitindo que navegadores ou proxies intermediários retivessem versões defasadas do HTML de entrada.
  - O middleware `/api` utilizava `no-store, max-age=0` em vez da diretiva defensiva completa para intermediários.
- **Remediação Aplicada**:
  - **Arquivos Estáticos Versionados (`/assets/*`)**: Configurado `Cache-Control: public, max-age=31536000, immutable` para scripts JS, CSS e fontes geradas pelo Vite com hash de conteúdo.
  - **Página de Entrada SPA (`index.html`)**: Configurado `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache` e `Expires: 0` tanto na rota fallback quanto na entrega estática de `.html`.
  - **Health Check (`/api/health`)**: Configurado explicitamente `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache` e `Expires: 0`.
  - **APIs Sensíveis e Autenticadas (`/api/*`)**: Atualizado o middleware global para `Cache-Control: private, no-cache, no-store, must-revalidate`, `Pragma: no-cache` e `Expires: 0`.
  - **Imagens Autenticadas de Exame**: Mantido `Cache-Control: private, max-age=...` para permitir cache local seguro apenas no navegador do usuário autenticado, bloqueando proxies públicos e CDNs compartilhadas.
- **Risco Residual**: Nenhum. A segregação clara entre dados sensíveis (`private, no-store`) e ativos imutáveis versionados (`public, immutable`) otimiza a performance sem expor dados.

---

## 3. Arquivos Alterados

1. **`server.ts`**:
   - Inclusão de cabeçalhos `Cache-Control: no-cache, no-store, must-revalidate` em `/api/health`.
   - Atualização do middleware global `/api` para `Cache-Control: private, no-cache, no-store, must-revalidate`.
   - Configuração de `styleSrc` e `styleSrcElem` sem `'unsafe-inline'`, com suporte a `styleSrcAttr: ["'unsafe-inline'"]` no Helmet.
   - Remoção de `'unsafe-inline'` da rota dos visuais Three.js (`/point-sphere.html`, `/blackhole-disc.html`).
   - Configuração de `setHeaders` granular no `express.static` de produção e desativação estrita de cache para `index.html`.
2. **`public/visuals.css`** *(novo)*:
   - Folha de estilo estática externa consolidando as regras CSS dos visuais Three.js.
3. **`public/point-sphere.html`**:
   - Substituição da tag `<style>` inline por `<link rel="stylesheet" href="/visuals.css">`.
4. **`public/blackhole-disc.html`**:
   - Substituição da tag `<style>` inline por `<link rel="stylesheet" href="/visuals.css">`.
5. **`src/services/realtimeHub.ts`**:
   - Encerramento gracioso de conexões ativas (`client.res.end()`) no método `destroy()`.
6. **`test/admin_realtime.test.ts`**:
   - Fechamento imediato de sockets com `server.closeAllConnections?.()` em `test.after()`.
7. **`test/zap_remediation.test.ts`** *(novo)*:
   - Suíte de testes automatizados cobrindo os cabeçalhos de CSP, headers de cache e integridade dos visuais.
8. **`scripts/readiness-suite.mjs`**:
   - Inclusão de `zap_remediation` na suíte oficial de testes de prontidão.

---

## 4. Testes Executados e Resultados

1. **Verificação de Tipos (TypeScript)**:
   - `npm run typecheck` executado: 0 erros encontrados.
2. **Build de Produção (Vite + esbuild)**:
   - `npm run build` executado: build completo gerado com sucesso em `dist/public/` e `dist/server.cjs`.
3. **Suíte Completa de Testes Automatizados**:
   - `npm test` (`node scripts/readiness-suite.mjs`): 29 suítes de teste executadas em ambientes isolados com 100% de aprovação.
4. **Inspeção de Segurança de Cabeçalhos**:
   - Validação de que `style-src` não contém `'unsafe-inline'`.
   - Validação de que `/api/health` e rotas sensíveis contêm diretivas estritas de `no-store` e `must-revalidate`.
   - Validação de que `public/visuals.css` substituiu as tags inline.
