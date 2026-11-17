# Design Doc: Calculadora Matemática Estilo Chat (WolframAlpha + Motor Local)

**Data:** 2026-11-16  
**Abordagem selecionada:** Abordagem A (Aba dedicada de Chat Matemático + Motor Híbrido WolframAlpha/Local + Visão por Foto)

## 1. Intenção e Contexto

Integrar ao sistema **Cronograma de Estudos CFO CBMERJ** uma calculadora matemática moderna em formato de chat interativo, inspirada visualmente no embed do WolframAlpha no Discord, para auxiliar o cadete/estudante na resolução rápida de questões de Matemática, Física e Química.

O projeto já utiliza **React 19 + Vite + TypeScript + Tailwind CSS v4**, backend **Express** (`server.ts` com routers modulares em `src/routes/`), **`katex` (`^0.18.6`)** com `LatexRenderer.tsx`, **`@google/genai`** e validação de uploads em `src/services/secureUploadService.ts`.

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
- Nova aba dedicada `/calculadora` (`TabType = 'calculator'`) acessível pelo `TacticalSidebar`.
- Interface em formato de chat com histórico da sessão, envio com `Enter`, lista de comandos frequentes (via `/` ou botão de comandos) e envio/colagem (`Ctrl+V`) de fotos de questões/equações.
- Card de resultado fiel ao embed do print de referência:
  - Container escuro com bordas discretas e cantos arredondados;
  - Cabeçalho com ícone matemático e título **"Resultados matemáticos"**;
  - Área interna branca (`bg-white`) exibindo **"Entrada"** e **"Resultado exato"** renderizados com **KaTeX**;
  - Aproximação decimal quando aplicável;
  - Botão de copiar resultado (LaTeX e texto);
  - Botão **"Mostrar mais"** para expandir explicação passo a passo, formas alternativas ou detalhes adicionais;
  - Rodapé indicando claramente a fonte real do cálculo (`WolframAlpha API` ou `Motor Local (mathjs / nerdamer)`).
- Motor backend seguro em `POST /api/math/solve` e `POST /api/math/solve-image`:
  - Usa **WolframAlpha API** no backend quando `WOLFRAM_APP_ID` estiver configurada no ambiente;
  - Faz fallback transparente para motor local confiável (**`mathjs` + `nerdamer`**) quando não houver chave válida ou quando a API externa falhar/exceder cota;
  - Zero uso de `eval()` ou `new Function()` com entrada de usuário;
  - Cobertura de aritmética, frações exatas, potências/raízes, equações de 1º e 2º grau, sistemas lineares, logaritmos/exponenciais, trigonometria, derivadas, integrais, limites, matrizes/determinantes, notação científica e expressões algébricas.

### Não-Objetivos
- Alterações no banco de dados PostgreSQL/SQLite (histórico fica na sessão do cliente).
- Criação de gráficos 2D/3D complexos fora do escopo de exibição LaTeX/passos.
- Exposição de qualquer chave de API (`WOLFRAM_APP_ID`, `GEMINI_API_KEY`, `OPENAI_API_KEY`) no bundle frontend.

### Anti-Objetivos
- Fingir que resultados locais vieram do WolframAlpha.
- Deixar botões decorativos sem ação funcional.
- Quebrar qualquer aba existente (`table`, `examBank`, `whiteboard`, `flashcards`, etc.).

## 3. Restrições

- **Segurança:** Todos os endpoints `/api/math/*` devem exigir autenticação (`requireUserAuth`), rate limiting dedicado, validação de tamanho/formato de entrada e verificação de magic bytes para imagens (PNG, JPEG, WEBP até 5 MB).
- **Zero alterações em DB:** Não criar tabelas nem migrations.
- **Responsividade:** Layout funcional em desktop e mobile (drawer/sidebar existente).

## 4. Abordagens Consideradas

1. **Abordagem A (Escolhida):** Aba dedicada de Chat Matemático + Motor Híbrido (WolframAlpha no backend + `mathjs`/`nerdamer` local) + OCR/Visão por `@google/genai` (ou fallback OpenAI). Garante 100% de funcionamento com ou sem `WOLFRAM_APP_ID` e aproveita a stack existente.
2. **Abordagem B (Descartada):** Apenas WolframAlpha API com fallback aritmético mínimo — deixaria derivadas, integrais e equações indisponíveis sem cota/chave.
3. **Abordagem C (Descartada):** Apenas modal flutuante — espaço insuficiente para histórico de chat, paleta de comandos e equações longas no mobile.

## 5. Arquitetura e Componentes Decididos

### Backend (`server.ts`, `src/routes/mathRouter.ts`, `src/services/math/`)
1. **`src/services/math/wolframClient.ts`**
   - Lê `process.env.WOLFRAM_APP_ID` apenas no servidor.
   - Consulta `https://api.wolframalpha.com/v2/query` (`output=json`, `format=plaintext,mathml` ou LaTeX via pods, timeout de 10s, `podstate=Step-by-step solution` quando disponível).
   - Extrai: `inputLatex` / `inputText`, `exactResultLatex` / `exactResultText`, `decimalApproximation`, `steps[]` (explicação passo a passo), `additionalPods[]`.
2. **`src/services/math/localMathEngine.ts`**
   - Normaliza comandos (`/derivar`, `/integrar`, `/resolver`, `/limite`, `/matriz`, `/simplificar`, `/fatorar`, `/expandir`, `/sistema`, `/log`, `/trig`) e linguagem natural simples.
   - Usa **`mathjs`** (aritmética exata via `fraction`, matrizes/determinantes, notação científica, avaliação numérica segura) e **`nerdamer`** (álgebra simbólica, equações de 1º/2º grau, sistemas, derivadas, integrais, limites, conversão `.toTeX()`).
   - Gera **passo a passo determinístico** para operações suportadas (ex.: simplificação de frações via MDC, Bhaskara passo a passo em equações de 2º grau, isolamento em 1º grau, regra do tombo em derivadas polinomiais, passos aritméticos).
   - Retorna mensagem clara em PT-BR quando uma expressão é inválida ou fora do escopo simbólico local.
3. **`src/services/math/imageExtractor.ts`**
   - Valida magic bytes (PNG/JPEG/WEBP) e tamanho máximo (5 MB).
   - Usa `GoogleGenAI` (`GEMINI_API_KEY`) — ou `OPENAI_API_KEY` se Gemini não estiver configurada — com prompt estrito para extrair apenas a expressão/equação matemática em formato compatível com o motor de cálculo e LaTeX legível.
   - Retorna erro amigável se nenhuma chave de visão estiver configurada no servidor.
4. **`src/routes/mathRouter.ts`**
   - `POST /api/math/solve`: recebe `{ expression: string, command?: string, preferLocal?: boolean }`, valida e sanitiza, tenta WolframAlpha se `WOLFRAM_APP_ID` existir (e `!preferLocal`), faz fallback automático para `localMathEngine`, retorna JSON estruturado `{ source, input, inputLatex, exactResult, exactResultLatex, decimalApproximation, steps, extraInfo, warning }`.
   - `POST /api/math/solve-image`: recebe `{ imageBase64: string, mimeType: string, promptHint?: string }` (ou multipart), extrai expressão via `imageExtractor` e resolve pelo mesmo pipeline, devolvendo também `extractedExpression`.
   - Montado em `server.ts` com `requireUserAuth` e `express-rate-limit`.

### Frontend (`src/components/calculator/` + `TacticalSidebar.tsx` + `App.tsx`)
1. **Integração de Navegação:**
   - Adicionar `'calculator'` em `TabType`, `TAB_ROUTE_MAP` (`/calculadora`) e `ROUTE_TAB_MAP` em `src/components/TacticalSidebar.tsx`.
   - Adicionar item no menu lateral com ícone `Calculator` (`lucide-react`) e lazy-load de `MathChatTab` em `src/App.tsx`.
2. **Componentes (`src/components/calculator/`):**
   - `MathChatTab.tsx`: container principal do chat com estado de mensagens da sessão, barra de envio (`Enter` envia, `Shift+Enter` quebra linha), botão de câmera/anexo + suporte a colar imagem (`onPaste`), preview da imagem antes/no envio, botão de limpar histórico e sugestões iniciais clicáveis.
   - `MathCommandMenu.tsx`: paleta de comandos acionada ao digitar `/` ou clicar no botão **"Comandos"**, listando os comandos mais úteis com sintaxe, descrição e preenchimento automático no input.
   - `MathResultCard.tsx`: card estilo Discord embed:
     - Fundo escuro (`#1e1f22` / `#2b2d31`), borda discreta (`border-white/10`), cantos arredondados (`rounded-xl`);
     - Cabeçalho com ícone matemático + **"Resultados matemáticos"** + badge discreta da fonte (`WolframAlpha` ou `Motor Local`);
     - Área interna branca (`bg-white text-zinc-900 rounded-lg p-4`) com seções **"Entrada"** e **"Resultado exato"** renderizadas via KaTeX (`katex.renderToString`);
     - Botão funcional de **copiar** (copia resultado formatado / LaTeX com feedback visual);
     - Botão **"Mostrar mais"** / **"Mostrar menos"** funcional que expande aproximação decimal, explicação passo a passo e informações extras (com animação discreta).

### Testes
- Testes unitários e de integração da API/motor matemático (`test/math_engine.test.ts` ou `.mjs` integrado ao runner) cobrindo todos os tipos de operação (incluindo `124/4 -> 31`), validação contra `eval`/injeção, fallback sem `WOLFRAM_APP_ID`, e validação de imagem.
- Teste E2E com Playwright verificando a aba `/calculadora`, envio com `Enter`, renderização KaTeX, botão **"Mostrar mais"**, cópia e comandos `/`.

## 6. O que Fica a Critério da Implementação
- Detalhes finos de espaçamento, cores exatas dos badges e mensagens de microcopy em PT-BR.
- Organização interna dos helpers de formatação LaTeX e parser de comandos.
