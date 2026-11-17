# Calculadora Matemática Estilo Chat (WolframAlpha + Motor Local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar uma calculadora matemática em formato de chat estilo Discord, com lista de comandos rápidos (`/`), envio de foto com extração de expressão por IA e motor híbrido no backend (WolframAlpha API quando configurada + fallback local em `mathjs`/`nerdamer`), integrada à aba `/calculadora`.

**Architecture:** O frontend renderiza uma nova aba lazy-loaded (`/calculadora`) em `App.tsx` e `TacticalSidebar.tsx`, usando `apiFetch` para enviar expressões ou imagens ao backend Express (`src/routes/mathRouter.ts`). O backend autentica via `requireUserAuth`, aplica rate limiting, consulta a WolframAlpha Full Results API v2 quando `WOLFRAM_APP_ID` existe no servidor ou usa `localMathEngine.ts` (`mathjs` + `nerdamer`, sem `eval()`), e devolve LaTeX + aproximação decimal + passo a passo para renderização com `katex`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, KaTeX (`^0.18.6`), Lucide Icons, Express, `express-rate-limit`, `mathjs`, `nerdamer`, `@google/genai`, `tsx --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-math-chat-calculator-design.md`

## Global Constraints

- Nunca usar `eval()` ou `new Function()` em expressões de usuário.
- Nunca expor `WOLFRAM_APP_ID`, `GEMINI_API_KEY` ou `OPENAI_API_KEY` no frontend; todas as chamadas externas ocorrem no backend.
- Nunca fingir que resultados do motor local vieram do WolframAlpha (exibir fonte real no card).
- Não alterar o esquema do banco de dados PostgreSQL/SQLite; histórico do chat fica na sessão do cliente.
- Todos os endpoints `/api/math/*` exigem `requireUserAuth` e validação de entrada/magic bytes (PNG/JPEG/WEBP até 5 MB).
- Preservar todas as abas e funcionalidades existentes; validar com `npx tsc --noEmit`, `npm run build` e testes.

## Review Focus

- **Divisão por zero e indeterminações (`1/0`, `limit(sin(x)/x, x, 0)`):** Deve retornar erro claro em PT-BR para divisão por zero e resultado exato `1` para limites notáveis, nunca `Infinity`/`NaN` silencioso ou crash do servidor.
- **Injeção de código / payload malicioso (`process.exit(1)`, `require('fs')`, strings > 500 chars):** Deve ser rejeitado na validação antes do parser com HTTP 400 e mensagem clara.
- **Upload de imagem inválido ou disfarçado (arquivo `.txt`/SVG renomeado para `.png` ou > 5 MB):** Deve falhar na verificação de magic bytes/tamanho com HTTP 400 antes de acionar a API de visão.
- **Ausência ou falha da `WOLFRAM_APP_ID` (timeout, HTTP 403/500, cota esgotada):** Deve fazer fallback transparente para `localMathEngine` marcando `source: 'local'` e sem quebrar a UX.
- **Expressão extraída de foto com ruído ou ilegível:** Quando a IA de visão não detectar matemática válida ou nenhuma chave de visão existir, retornar erro amigável orientando digitar a expressão manualmente.

---

### Task 1: Dependências matemáticas e contrato de tipos compartilhado

**Files:**
- Modify: `package.json`
- Create: `src/services/math/types.ts`
- Test: `test/math_engine.test.ts`

**Interfaces:**
- Produces: `MathSource`, `MathStep`, `MathSolveRequest`, `MathSolveResponse`, `MathCommandDefinition` em `src/services/math/types.ts`.

- [ ] **Step 1: Instalar `mathjs` e `nerdamer` (e `@types/nerdamer` se disponível; se não, declarar módulo mínimo)**

Run: `npm install mathjs nerdamer`
Expected: `package.json` atualizado com `mathjs` e `nerdamer` sem erros de peer dependency.

- [ ] **Step 2: Criar `src/services/math/types.ts` com os contratos**

Definir:
- `export type MathSource = 'wolfram' | 'local';`
- `export interface MathStep { title: string; expressionLatex?: string; explanation: string; }`
- `export interface MathExtraPod { title: string; content: string; latex?: string; }`
- `export interface MathSolveResponse { ok: boolean; source: MathSource; sourceLabel: string; command?: string; input: string; inputLatex: string; exactResult: string; exactResultLatex: string; decimalApproximation?: string; steps: MathStep[]; extraPods?: MathExtraPod[]; extractedExpression?: string; warning?: string; error?: string; }`
- `export interface MathCommandDefinition { command: string; label: string; syntax: string; example: string; description: string; category: 'algebra' | 'calculo' | 'matrizes' | 'basico'; }`

- [ ] **Step 3: Escrever teste inicial de contrato em `test/math_engine.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { MathSolveResponse } from '../src/services/math/types';

test('MathSolveResponse contract supports exact and decimal fields', () => {
  const sample: MathSolveResponse = {
    ok: true,
    source: 'local',
    sourceLabel: 'Motor Local (mathjs / nerdamer)',
    input: '124/4',
    inputLatex: '\\frac{124}{4}',
    exactResult: '31',
    exactResultLatex: '31',
    steps: [],
  };
  assert.equal(sample.exactResult, '31');
});
```

- [ ] **Step 4: Rodar teste e `npx tsc --noEmit`**

Run: `npx tsx --test test/math_engine.test.ts; npx tsc --noEmit`
Expected: PASS (1/1) e exit 0 no typecheck.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/services/math/types.ts test/math_engine.test.ts
git commit -m "feat(math): add mathjs/nerdamer dependencies and shared types"
```

---

### Task 2: Motor matemático local (`localMathEngine.ts`)

**Files:**
- Create: `src/services/math/localMathEngine.ts`
- Modify: `test/math_engine.test.ts`

**Interfaces:**
- Consumes: `MathSolveResponse`, `MathStep` de `src/services/math/types.ts`.
- Produces:
  - `validateMathInput(raw: string): { valid: boolean; normalized: string; command?: string; error?: string }`
  - `solveWithLocalEngine(rawInput: string, command?: string): MathSolveResponse`

- [ ] **Step 1: Escrever testes falhando em `test/math_engine.test.ts`**

Cobrir:
1. `124/4` → `inputLatex === '\\frac{124}{4}'`, `exactResult === '31'`, `steps.length >= 1`.
2. Fração irredutível `18/24` → `exactResultLatex === '\\frac{3}{4}'` e `decimalApproximation === '0.75'`.
3. Potências e raízes: `sqrt(144) + 2^5` → `44`.
4. Equação 1º grau: `/resolver 2*x + 6 = 14` → `x = 4` com passo a passo.
5. Equação 2º grau: `x^2 - 5*x + 6 = 0` → `x = 2, 3` (ou `{2, 3}`) com passos de Bhaskara.
6. Sistema de equações: `/sistema x + y = 10; x - y = 2` → `x = 6, y = 4`.
7. Logaritmo e exponencial: `log(100, 10)` → `2` e `exp(0)` → `1`.
8. Trigonometria: `sin(pi/6)` → `1/2` ou `0.5`.
9. Derivada: `/derivar x^3 + 2*x` → `3*x^2 + 2` (LaTeX `3 x^2 + 2` ou equivalente contendo `3` e `x^2`).
10. Integral: `/integrar 3*x^2` → `x^3`.
11. Limite: `/limite sin(x)/x, x, 0` → `1`.
12. Matriz e determinante: `/matriz det([[1, 2], [3, 4]])` → `-2`.
13. Notação científica: `3.2e4 * 2` → `64000` (e notação científica no extra/aproximação).
14. Segurança & Review Focus: `process.exit(1)` e string > 500 chars → `ok: false` com erro claro; `1/0` → `ok: false` com erro de divisão por zero.

- [ ] **Step 2: Rodar teste para confirmar falha**

Run: `npx tsx --test test/math_engine.test.ts`
Expected: FAIL (`Cannot find module '../src/services/math/localMathEngine'`).

- [ ] **Step 3: Implementar `src/services/math/localMathEngine.ts`**

- `validateMathInput`: rejeita strings vazias, > 500 caracteres, caracteres/tokens proibidos (`process`, `require`, `import`, `eval`, `Function`, `window`, `global`, `__proto__`, `constructor`, `;` fora de `/sistema` ou matrizes). Extrai prefixo `/comando` se presente.
- Normaliza comandos em PT-BR (`/resolver`, `/derivar`, `/integrar`, `/limite`, `/matriz`, `/simplificar`, `/fatorar`, `/expandir`, `/sistema`, `/log`, `/trig`) para operações determinísticas em `mathjs` ou `nerdamer`.
- Gera `inputLatex`, `exactResult`, `exactResultLatex`, `decimalApproximation` (quando o resultado exato é fração/radical/simbólico diferente do decimal) e `steps[]` em português claro.
- Trata divisão por zero (`Infinity`/`NaN`/`ComplexInfinity`) retornando `ok: false` com mensagem amigável.

- [ ] **Step 4: Rodar testes para confirmar aprovação**

Run: `npx tsx --test test/math_engine.test.ts; npx tsc --noEmit`
Expected: PASS em todos os casos de `test/math_engine.test.ts` e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/services/math/localMathEngine.ts test/math_engine.test.ts
git commit -m "feat(math): implement local mathjs/nerdamer engine with step-by-step"
```

---

### Task 3: Cliente WolframAlpha Backend (`wolframClient.ts`) e `.env.example`

**Files:**
- Create: `src/services/math/wolframClient.ts`
- Modify: `.env.example`
- Modify: `test/math_engine.test.ts`

**Interfaces:**
- Consumes: `MathSolveResponse`, `MathStep`, `MathExtraPod` de `src/services/math/types.ts`.
- Produces:
  - `isWolframConfigured(): boolean`
  - `buildWolframQuery(expression: string, command?: string): string`
  - `parseWolframJsonResponse(rawJson: any, originalInput: string): MathSolveResponse | null`
  - `solveWithWolfram(expression: string, command?: string, fetchImpl?: typeof fetch): Promise<MathSolveResponse | null>`

- [ ] **Step 1: Escrever testes unitários para `buildWolframQuery` e `parseWolframJsonResponse` em `test/math_engine.test.ts`**

Testar:
- `buildWolframQuery('x^2', '/derivar')` → `'derivative of x^2'`.
- `parseWolframJsonResponse` com mock JSON realista do WolframAlpha v2 (`Input`, `Exact result`, `Decimal approximation`, `Step-by-step solution`) retorna `source: 'wolfram'`, `exactResult: '31'`, `steps.length > 0`.
- `solveWithWolfram` sem `WOLFRAM_APP_ID` retorna `null` sem fazer chamada de rede.
- `solveWithWolfram` quando `fetchImpl` retorna HTTP 500 ou timeout retorna `null` (permitindo fallback limpo).

- [ ] **Step 2: Rodar teste para confirmar falha**

Run: `npx tsx --test test/math_engine.test.ts`
Expected: FAIL (`Cannot find module '../src/services/math/wolframClient'`).

- [ ] **Step 3: Implementar `src/services/math/wolframClient.ts` e adicionar `WOLFRAM_APP_ID` no `.env.example`**

- Consultar `https://api.wolframalpha.com/v2/query` com `appid`, `input`, `output=json`, `format=plaintext`, `podstate=Step-by-step solution`, `AbortSignal.timeout(10000)`.
- Converter texto simples de frações simples/potências para LaTeX limpo quando necessário ou preservar representação legível.
- Nunca logar ou retornar `WOLFRAM_APP_ID`.
- Adicionar seção comentada `# WOLFRAMALPHA API (OPCIONAL - fallback local disponível)` com `WOLFRAM_APP_ID=""` em `.env.example`.

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx tsx --test test/math_engine.test.ts; npx tsc --noEmit`
Expected: PASS em todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/services/math/wolframClient.ts .env.example test/math_engine.test.ts
git commit -m "feat(math): add backend WolframAlpha Full Results API client"
```

---

### Task 4: Extrator de Expressões por Foto (`imageExtractor.ts`)

**Files:**
- Create: `src/services/math/imageExtractor.ts`
- Modify: `test/math_engine.test.ts`

**Interfaces:**
- Produces:
  - `validateMathImageBuffer(buffer: Buffer, declaredMime?: string): { valid: boolean; mimeType?: 'image/png' | 'image/jpeg' | 'image/webp'; error?: string }`
  - `extractMathFromImage(buffer: Buffer, mimeType: string, hint?: string): Promise<{ ok: boolean; expression?: string; error?: string }>`

- [ ] **Step 1: Escrever testes para validação de magic bytes e limite de tamanho em `test/math_engine.test.ts`**

Testar:
- Buffer PNG válido (`89 50 4E 47 0D 0A 1A 0A`) → `{ valid: true, mimeType: 'image/png' }`.
- Buffer JPEG válido (`FF D8 FF`) → `{ valid: true, mimeType: 'image/jpeg' }`.
- Buffer WEBP válido (`RIFF....WEBP`) → `{ valid: true, mimeType: 'image/webp' }`.
- Buffer SVG/texto disfarçado com `declaredMime: 'image/png'` → `{ valid: false }`.
- Buffer > 5 MB → `{ valid: false }`.
- `extractMathFromImage` sem `GEMINI_API_KEY` nem `OPENAI_API_KEY` retorna `{ ok: false, error: ... }` com mensagem clara.

- [ ] **Step 2: Rodar teste para confirmar falha**

Run: `npx tsx --test test/math_engine.test.ts`
Expected: FAIL (`Cannot find module '../src/services/math/imageExtractor'`).

- [ ] **Step 3: Implementar `src/services/math/imageExtractor.ts`**

- Verificar magic bytes reais (PNG, JPEG, WEBP) e limite de `5 * 1024 * 1024` bytes.
- Se `process.env.GEMINI_API_KEY` existir, usar `GoogleGenAI` (`gemini-2.5-flash`) com `inlineData` enviando prompt estrito pedindo apenas a expressão/equação matemática em notação ASCII/CAS (ex: `x^2 - 5*x + 6 = 0` ou `/sistema ...`), ou `NO_MATH_FOUND` caso não haja matemática legível.
- Caso contrário, se `process.env.OPENAI_API_KEY` existir, chamar endpoint Vision via `fetch`.
- Se nenhuma chave existir, retornar erro orientando configurar a chave de visão ou digitar a expressão manualmente.

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx tsx --test test/math_engine.test.ts; npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/math/imageExtractor.ts test/math_engine.test.ts
git commit -m "feat(math): add image magic-byte validation and AI vision math extractor"
```

---

### Task 5: Router Express `/api/math` e montagem em `server.ts`

**Files:**
- Create: `src/routes/mathRouter.ts`
- Modify: `server.ts`
- Create: `test/math_api.test.ts`

**Interfaces:**
- Consumes: `solveWithWolfram`, `solveWithLocalEngine`, `validateMathInput`, `validateMathImageBuffer`, `extractMathFromImage`.
- Produces: `createMathRouter(requireAuthMiddleware: any): Router` montado em `app.use('/api/math', createMathRouter(requireUserAuth))` em `server.ts`.

- [ ] **Step 1: Escrever testes de integração HTTP em `test/math_api.test.ts`**

Testar com Express app montado + middleware de auth mockado para teste e auth real bloqueando `401` sem sessão:
- `GET /api/math/commands` → retorna lista de comandos (`MathCommandDefinition[]`) + `{ wolframConfigured: boolean }`.
- `POST /api/math/solve` sem auth → `401`.
- `POST /api/math/solve` com `{ expression: '124/4' }` autenticado → `200`, `exactResult === '31'`, `inputLatex === '\\frac{124}{4}'`.
- `POST /api/math/solve` com payload inválido (`expression: ''` ou `process.exit(1)`) → `400`.
- `POST /api/math/solve-image` com base64 inválido/SVG disfarçado → `400`.

- [ ] **Step 2: Rodar teste para confirmar falha**

Run: `npx tsx --test test/math_api.test.ts`
Expected: FAIL (`Cannot find module '../src/routes/mathRouter'`).

- [ ] **Step 3: Implementar `src/routes/mathRouter.ts` e montar em `server.ts`**

- Aplicar `requireAuthMiddleware` em todas as rotas.
- Aplicar `rateLimit` com `createRateLimitRedisStore('math')` (ex.: 180 req / 15 min, `skip: () => process.env.NODE_ENV === 'test'`).
- `GET /commands`: retorna catálogo de comandos frequentes e `wolframConfigured: isWolframConfigured()`.
- `POST /solve`: valida `{ expression, command, preferLocal }`, tenta `solveWithWolfram` quando configurado e `!preferLocal`, faz fallback para `solveWithLocalEngine` (adicionando `warning` discreto se Wolfram falhou).
- `POST /solve-image`: recebe `{ imageBase64, mimeType, hint }`, decodifica com limite de 5 MB, valida magic bytes, extrai expressão via `extractMathFromImage` e resolve via mesmo pipeline.
- Montar em `server.ts` antes do catch-all `app.use('/api', ...)`.

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npx tsx --test test/math_api.test.ts; npx tsx --test test/math_engine.test.ts; npx tsc --noEmit`
Expected: PASS em todos os testes e typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/routes/mathRouter.ts server.ts test/math_api.test.ts
git commit -m "feat(math): add /api/math router with auth, rate limit and solve endpoints"
```

---

### Task 6: Componentes UI do Card Discord (`MathResultCard.tsx`) e Paleta de Comandos (`MathCommandMenu.tsx`)

**Files:**
- Create: `src/components/calculator/MathResultCard.tsx`
- Create: `src/components/calculator/MathCommandMenu.tsx`
- Create: `src/components/calculator/mathCommands.ts`

**Interfaces:**
- Consumes: `MathSolveResponse`, `MathCommandDefinition` de `src/services/math/types.ts` e `katex`.
- Produces:
  - `MATH_COMMANDS: MathCommandDefinition[]` em `mathCommands.ts`
  - `MathResultCard({ result, requestedBy }: { result: MathSolveResponse; requestedBy?: string })`
  - `MathCommandMenu({ filter, onSelect, onClose }: { filter: string; onSelect: (cmd: MathCommandDefinition) => void; onClose: () => void })`

- [ ] **Step 1: Criar `src/components/calculator/mathCommands.ts` com os comandos frequentes**

Incluir comandos para todas as categorias do escopo:
`/resolver`, `/sistema`, `/derivar`, `/integrar`, `/limite`, `/simplificar`, `/fatorar`, `/expandir`, `/matriz`, `/log`, `/trig`, `/cientifica`.

- [ ] **Step 2: Implementar `src/components/calculator/MathResultCard.tsx`**

Fidelidade visual ao embed do print:
- Card escuro (`bg-[#1e1f22]` / `border-white/10`, `rounded-xl`), barra lateral de acento discreta (estilo Discord embed), animação discreta de entrada (`animate-in fade-in slide-in-from-bottom-2`).
- Cabeçalho: ícone matemático (`Sigma` / `Calculator` em destaque laranja/âmbar sutil) + título **"Resultados matemáticos"** + badge discreta da fonte (`WolframAlpha` ou `Motor Local`).
- Área interna branca (`bg-white text-zinc-900 rounded-lg p-4 shadow-inner`):
  - Seção **"Entrada"** com renderização KaTeX em bloco (`katex.renderToString(result.inputLatex, { throwOnError: false, displayMode: true })`).
  - Seção **"Resultado exato"** com renderização KaTeX em bloco.
  - Se houver `decimalApproximation`, mostrar logo abaixo em destaque discreto (**"Aproximação decimal"**).
- Barra de ações funcional:
  - Botão **Copiar** (copia resultado texto/LaTeX para `navigator.clipboard` com feedback *"Copiado!"*).
  - Botão **"Mostrar mais"** / **"Mostrar menos"** que expande/recolhe `steps[]` (passo a passo numerado) e `extraPods[]`, além da expressão extraída se veio de foto.
- Rodapé discreto: *"Solicitado por {requestedBy}"* + fonte real do cálculo.

- [ ] **Step 3: Implementar `src/components/calculator/MathCommandMenu.tsx`**

Paleta flutuante acima do input (ou modal/drawer no mobile) filtrável pelo texto após `/`, com navegação por teclado (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`) e clique.

- [ ] **Step 4: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/calculator/mathCommands.ts src/components/calculator/MathResultCard.tsx src/components/calculator/MathCommandMenu.tsx
git commit -m "feat(math-ui): add Discord-style MathResultCard and MathCommandMenu"
```

---

### Task 7: Chat Matemático (`MathChatTab.tsx`), Integração no Site (`TacticalSidebar.tsx`, `App.tsx`) e Teste E2E

**Files:**
- Create: `src/components/calculator/MathChatTab.tsx`
- Modify: `src/components/TacticalSidebar.tsx`
- Modify: `src/App.tsx`
- Create: `test/math_calculator.e2e.test.ts` (ou `.spec.ts` conforme `playwright.config.ts`)

**Interfaces:**
- Consumes: `apiFetch`, `MathResultCard`, `MathCommandMenu`, `MATH_COMMANDS`, `MathSolveResponse`.
- Produces: `MathChatTab({ theme, userProfile }: { theme: AppTheme; userProfile?: { fullName?: string; username?: string } | null })` e rota `/calculadora` (`TabType = 'calculator'`).

- [ ] **Step 1: Verificar `playwright.config.ts` para alinhar padrão de arquivo E2E**

Run: `Get-Content playwright.config.ts` (se existir) para usar exatamente o `testDir` e padrão de nome esperado.

- [ ] **Step 2: Implementar `src/components/calculator/MathChatTab.tsx`**

- Layout de chat responsivo (header com status do motor `WolframAlpha API ativo` vs `Modo Motor Local` + botão **Comandos** + botão **Limpar histórico**; área de mensagens com scroll automático; barra inferior com botão de **Anexar Foto** (`<input type="file" accept="image/png,image/jpeg,image/webp">`), suporte a `Ctrl+V` de imagem, preview da foto selecionada, `<textarea>` com `Enter` para enviar e `Shift+Enter` para quebra de linha, e botão Enviar).
- Chips de exemplos clicáveis no estado inicial (ex.: `124/4`, `/resolver x^2 - 5*x + 6 = 0`, `/derivar sin(x)*x^2`, `/matriz det([[1,2],[3,4]])`).
- Histórico mantido em estado da sessão (`sessionStorage` opcional por usuário, sem DB).
- Tratamento claro de erros de rede, HTTP 400/429 e expressões não resolvidas.

- [ ] **Step 3: Integrar aba `calculator` em `src/components/TacticalSidebar.tsx` e `src/App.tsx`**

- Adicionar `'calculator'` em `TabType`, `TAB_ROUTE_MAP` (`/calculadora`), `ROUTE_TAB_MAP` e no menu do `TacticalSidebar.tsx` com ícone `Calculator`.
- Lazy-load `MathChatTab` em `src/App.tsx` e renderizar quando `activeTab === 'calculator'`.

- [ ] **Step 4: Escrever teste E2E cobrindo a UI da calculadora**

Verificar: acesso à aba `/calculadora`, abertura da lista de comandos `/`, envio de `124/4` com `Enter`, renderização KaTeX de `"Entrada"` e `"Resultado exato"` (`31`), clique em `"Mostrar mais"` exibindo o passo a passo, e clique em copiar.

- [ ] **Step 5: Rodar verificação completa (typecheck, testes unitários/API, build e E2E)**

Run:
- `npx tsc --noEmit`
- `npx tsx --test test/math_engine.test.ts`
- `npx tsx --test test/math_api.test.ts`
- `npm run build`
- `npx playwright test` (no spec criado)
Expected: Todos passam sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/calculator/MathChatTab.tsx src/components/TacticalSidebar.tsx src/App.tsx test/
git commit -m "feat(math): integrate MathChatTab at /calculadora with commands and image input"
```
