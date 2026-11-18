# Show do Milhão CFO CBMERJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a aba interativa e imersiva "Show do Milhão CFO CBMERJ" (`/show-do-milhao`) com 16 perguntas geradas sob medida via Gemini em 4 blocos crescentes de dificuldade, validação autoritativa no servidor, ajudas clássicas, envio de erros para Flashcards/Caderno de Erros e gancho pronto para áudios futuros do apresentador.

**Architecture:** O motor autoritativo e a geração estruturada em blocos via Gemini ficam isolados em `src/services/millionGameService.ts` e persistidos por usuário via `userStateRepoInstance` (chaves protegidas contra escrita direta em `/api/user/state`). O frontend (`MillionGameTab.tsx` + `PrizeLadder.tsx` + `millionAudio.ts` + `millionPresenterAudio.ts`) renderiza o palco imersivo estilo programa de TV com `LatexRenderer`, efeitos sonoros Web Audio com mudo e ponte 1-clique para `/api/anki/decks` + `/api/anki/notes`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Lucide Icons, Web Audio API, Express, `@google/genai` (`Type` responseSchema), `UserStateRepository` (SQLite/PostgreSQL Neon), `node:test`.

**Spec:** [2026-11-18-show-do-milhao-cfo-design.md](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/docs/superpowers/specs/2026-11-18-show-do-milhao-cfo-design.md)

## Global Constraints
- Nunca enviar `correctIndex` ou `explanation` de perguntas não respondidas ao navegador; nunca confiar em pontuação ou vitória enviada pelo cliente.
- Apenas `POST /api/ai/million-game/start` aplica `aiLimiter` (30 req / 15 min) e chama o Gemini; `GET /api/million-game/state`, `/answer`, `/help` e `/stop` usam `requireUserAuth` sem gastar `aiLimiter`.
- `PUT /api/user/state` e `PATCH /api/user/state` devem ignorar `million_game_active_v1` e `million_game_history_v1` vindas do cliente, e `PUT` deve preservá-las no servidor.
- Escada oficial fixa: Q1 (`1.000`) .. Q5 (`5.000`) Bloco 1, Q6 (`10.000`) .. Q10 (`50.000`) Bloco 2, Q11 (`100.000`) .. Q15 (`500.000`) Bloco 3, Q16 (`1.000.000`, errar = `0`, ajudas desabilitadas); 19 questões por partida (16 + 1 reserva por bloco 1–3).
- Se já existir partida `IN_PROGRESS`, `POST /api/ai/million-game/start` responde `409 ACTIVE_MATCH_EXISTS`.
- Sem `GEMINI_API_KEY`, retornar `503 AI_UNAVAILABLE` (nunca inventar questões falsas em produção).
- Sem novas dependências npm; reutilizar `LatexRenderer`, `ConfirmModal`, `apiFetch`, `userStateRepoInstance`, `getGeminiClient` e `/api/anki/*`.

## Review Focus
1. `PUT /api/user/state` sobrescrevendo o snapshot completo e apagando `million_game_active_v1` / `million_game_history_v1` durante sincronização normal de estudo -> testado na Task 2.
2. Duplo clique ou replay em `POST /api/million-game/answer` na mesma `questionId` avançando duas perguntas ou creditando prêmio duplicado -> testado na Task 1 (`409 QUESTION_ALREADY_RESOLVED` / mismatch de `questionId`).
3. Segundo `skip` no mesmo bloco (ou tentativa de usar qualquer ajuda na Q16) consumindo reserva errada -> testado na Task 1 (`409 HELP_UNAVAILABLE_IN_BLOCK` / `HELP_DISABLED_AT_MILLION`).
4. Resposta parcial ou malformada do Gemini (menos de 19 questões, alternativa vazia ou `correctIndex` fora de `0..3`) gravando partida quebrada -> validado com parser estrito + teste na Task 1.
5. Sessão de outro usuário tentando responder/parar `matchId` alheio (IDOR) -> isolado por `userId` da sessão e testado na Task 2.

---

### Task 1: Motor Autoritativo & Gerador Gemini em Blocos (`millionGameService.ts`)

**Files:**
- Create: `src/services/millionGameService.ts`
- Test: `test/million_game.test.ts`

**Interfaces:**
- Produces:
  - `export const MILLION_ACTIVE_KEY = 'million_game_active_v1';`
  - `export const MILLION_HISTORY_KEY = 'million_game_history_v1';`
  - `export const PRIZE_LADDER: ReadonlyArray<PrizeStep>`
  - `export type MillionHelpType = 'cards' | 'skip' | 'universitarios';`
  - `export interface SanitizedMillionQuestion { id: string; level: number; block: 1 | 2 | 3 | 4; blockLabel: string; statement: string; options: [string, string, string, string]; discipline: string; eliminatedIndices: number[]; universitariosHint?: { votes: [number, number, number, number]; summary: string } | null; }`
  - `export interface MillionStateResponse { activeMatch: SanitizedActiveMatch | null; stats: { bestPrize: number; totalMatches: number; wins: number }; history: MillionHistoryEntry[]; }`
  - `export function sanitizeMatchForClient(match: StoredMillionMatch): SanitizedActiveMatch`
  - `export function getMillionState(repo: UserStateStore, userId: string): MillionStateResponse`
  - `export async function startMillionMatch(deps: { repo: UserStateStore; userId: string; topic: string; focusHint?: string; aiClient: GeminiLike | null }): Promise<ServiceResult<SanitizedActiveMatch>>`
  - `export function answerMillionQuestion(deps: { repo: UserStateStore; userId: string; matchId: string; questionId: string; selectedIndex: number }): ServiceResult<AnswerResult>`
  - `export function useMillionHelp(deps: { repo: UserStateStore; userId: string; matchId: string; questionId: string; helpType: MillionHelpType }): ServiceResult<HelpResult>`
  - `export function stopMillionMatch(deps: { repo: UserStateStore; userId: string; matchId: string }): ServiceResult<StopResult>`

- [ ] **Step 1: Write the failing unit tests in `test/million_game.test.ts`**

Test assertions to include:
1. `sanitizeMatchForClient` nunca expõe `correctIndex`, `explanation` nem questões futuras/reservas.
2. `startMillionMatch` rejeita sem `aiClient` (`503 AI_UNAVAILABLE`), valida JSON de 19 questões em 4 blocos (rejeitando lote incompleto), salva partida ativa e retorna `409 ACTIVE_MATCH_EXISTS` se já houver partida `IN_PROGRESS`.
3. `useMillionHelp`:
   - `cards`: elimina 1–3 alternativas erradas (nunca a correta), persiste `eliminatedIndices` e impede re-uso.
   - `skip`: troca pela reserva do bloco atual, permite 1 pulo no Bloco 1 e bloqueia o 2º pulo no Bloco 1 (`409 HELP_UNAVAILABLE_IN_BLOCK`), mas permite pular no Bloco 2.
   - `universitarios`: retorna 4 porcentagens somando 100 e impede re-uso.
   - Na Q16 (`level === 16`), todas as ajudas retornam `409 HELP_DISABLED_AT_MILLION`.
4. `answerMillionQuestion`:
   - Acerto sequencial da Q1 até Q16 marca `WON` com `earnedPrize === 1_000_000`, grava em `history` e limpa `activeMatch`.
   - Erro na Q16 zera prêmio (`earnedPrize === 0`); erro na Q6 paga `2_500`.
   - Reenvio do mesmo `questionId` após avanço/término retorna `409` sem duplicar prêmio/histórico.
5. `stopMillionMatch`: encerra na Q1 com `0` ou na Q6 com `5_000` e grava em `history`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/million_game.test.ts`
Expected: FAIL because `src/services/millionGameService.ts` does not exist.

- [ ] **Step 3: Implement `src/services/millionGameService.ts`**

Implement `PRIZE_LADDER` exata (16 níveis), parser/validador rigoroso das 19 questões geradas pelo Gemini (`Type.OBJECT` com `blocks` ou `questions` 1..16 + `reserves` bloco 1..3), gerador `generateMillionQuestionsWithGemini` com fallback de `candidateModels`, e funções autoritativas `getMillionState`, `startMillionMatch`, `answerMillionQuestion`, `useMillionHelp` e `stopMillionMatch` operando sobre `UserStateStore` (`getValue` / `upsertValue`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/million_game.test.ts`
Expected: PASS (todos os testes unitários do motor verdes).

- [ ] **Step 5: Commit**

```bash
git add src/services/millionGameService.ts test/million_game.test.ts
git commit -m "feat(million-game): add server-authoritative engine and block Gemini generator"
```

---

### Task 2: Rotas Express, Proteção de `user_state` & Readiness Suite

**Files:**
- Modify: `server.ts:7123-7168` (proteger `MILLION_ACTIVE_KEY` e `MILLION_HISTORY_KEY` em `/api/user/state`)
- Modify: `server.ts` (adicionar rotas `/api/million-game/*` e `/api/ai/million-game/start`)
- Modify: `test/million_game.test.ts` (adicionar testes HTTP end-to-end contra `app`)
- Modify: `scripts/readiness-suite.mjs:50` (registrar `'million_game'`)

**Interfaces:**
- Consumes: `src/services/millionGameService.ts` (`startMillionMatch`, `getMillionState`, `answerMillionQuestion`, `useMillionHelp`, `stopMillionMatch`, `MILLION_ACTIVE_KEY`, `MILLION_HISTORY_KEY`)
- Produces:
  - `GET /api/million-game/state` (`requireUserAuth`) -> `MillionStateResponse`
  - `POST /api/ai/million-game/start` (`requireUserAuth`, `aiLimiter`) -> `{ success: true, match: SanitizedActiveMatch }`
  - `POST /api/million-game/answer` (`requireUserAuth`) -> `{ success: true, ...AnswerResult }`
  - `POST /api/million-game/help` (`requireUserAuth`) -> `{ success: true, ...HelpResult }`
  - `POST /api/million-game/stop` (`requireUserAuth`) -> `{ success: true, ...StopResult }`

- [ ] **Step 1: Add failing HTTP integration tests in `test/million_game.test.ts`**

Test assertions:
1. Sem sessão -> `401 UNAUTHORIZED` em todas as rotas `/api/million-game/*` e `/api/ai/million-game/start`.
2. `PUT /api/user/state` e `PATCH /api/user/state` tentando enviar `million_game_active_v1` / `million_game_history_v1` não sobrescrevem os valores reais do servidor, e `PUT` preserva os dados existentes do minigame.
3. Usuário B tentando responder ou parar `matchId` do Usuário A recebe `404 MATCH_NOT_FOUND` (isolamento IDOR).
4. `POST /api/ai/million-game/start` com `topic` maior que 200 bytes retorna `413 AI_INPUT_TOO_LARGE`.

- [ ] **Step 2: Run test to verify HTTP tests fail**

Run: `npx tsx --test test/million_game.test.ts`
Expected: FAIL with 404 on `/api/million-game/state`.

- [ ] **Step 3: Wire routes and `/api/user/state` protection in `server.ts` + register in `scripts/readiness-suite.mjs`**

Importar `millionGameService` em `server.ts`; bloquear `MILLION_ACTIVE_KEY` e `MILLION_HISTORY_KEY` no sanitizador de `PUT/PATCH /api/user/state` preservando-as no `PUT`; expor as 5 rotas autenticadas (aplicando `aiLimiter` apenas em `/api/ai/million-game/start` com `validateAiTextFields`). Adicionar `'million_game'` em `scripts/readiness-suite.mjs`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx tsx --test test/million_game.test.ts`
Expected: PASS (testes unitários + HTTP).

- [ ] **Step 5: Commit**

```bash
git add server.ts test/million_game.test.ts scripts/readiness-suite.mjs
git commit -m "feat(million-game): expose authenticated API routes and protect state keys"
```

---

### Task 3: Áudio Web Audio + Slot para Voz do Apresentador (Faustão)

**Files:**
- Create: `src/config/millionPresenterAudio.ts`
- Create: `src/utils/millionAudio.ts`
- Test: `test/million_game.test.ts` (teste unitário da seleção de clipe/mudo e fallback seguro sem `window`)

**Interfaces:**
- Produces:
  - `export type PresenterCue = 'intro' | 'nextQuestion' | 'correct' | 'wrong' | 'help' | 'stop' | 'millionWin';`
  - `export interface PresenterAudioConfig { enabled: boolean; clips: Partial<Record<PresenterCue, string>>; notes?: string; }`
  - `export const MILLION_PRESENTER_AUDIO_CONFIG: PresenterAudioConfig` (slot explícito e documentado para colocar futuramente os arquivos de áudio da voz do Faustão em `public/audio/presenter/*.mp3` ou URLs).
  - `export function isMillionAudioMuted(): boolean`
  - `export function setMillionAudioMuted(muted: boolean): void`
  - `export function playMillionCue(cue: PresenterCue): void` (toca o clipe do apresentador se configurado em `MILLION_PRESENTER_AUDIO_CONFIG.clips[cue]`, com fallback limpo para Web Audio API sintetizado; nunca lança exceção se autoplay/AudioContext falhar).

- [ ] **Step 1: Write failing test for `millionPresenterAudio` & `millionAudio` safety in `test/million_game.test.ts`**

Assert that `MILLION_PRESENTER_AUDIO_CONFIG.clips` exposes all 7 cues cleanly and `playMillionCue('intro')` does not throw in non-DOM/SSR environments.

- [ ] **Step 2: Run test to verify failure**

Run: `npx tsx --test test/million_game.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Create `src/config/millionPresenterAudio.ts` and `src/utils/millionAudio.ts`**

Implementar o registro centralizado de falas futuras do apresentador (com instruções claras em comentário de onde salvar e mapear os áudios do Faustão depois) e o sintetizador leve via Web Audio API (acordes curtos de estúdio para intro, acerto, erro, ajuda, parada e vitória) com persistência de mudo em `localStorage`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx tsx --test test/million_game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/millionPresenterAudio.ts src/utils/millionAudio.ts test/million_game.test.ts
git commit -m "feat(million-game): add Web Audio studio cues and presenter voice audio slot"
```

---

### Task 4: UI Imersiva do Palco ("Show do Milhão CFO"), Escada de Prêmios & Integração no App

**Files:**
- Create: `src/components/million/PrizeLadder.tsx`
- Create: `src/components/MillionGameTab.tsx`
- Modify: `src/config/modules.ts` (registrar `millionGame` em `SYSTEM_MODULES`)
- Modify: `src/components/TacticalSidebar.tsx:36-86, 330-375` (adicionar `'millionGame'` e `/show-do-milhao`)
- Modify: `src/App.tsx` (lazy import de `MillionGameTab` e renderização para `activeTab === 'millionGame'`)

**Interfaces:**
- Consumes:
  - Rotas `/api/million-game/state`, `/api/ai/million-game/start`, `/api/million-game/answer`, `/api/million-game/help`, `/api/million-game/stop` via `apiFetch`
  - `LatexRenderer` (`src/components/LatexRenderer.tsx`)
  - `ConfirmModal` (`src/components/ConfirmModal.tsx`)
  - `DEFAULT_CFO_SUBJECTS` (`src/data/cfoSubjects.ts`)
  - `playMillionCue`, `isMillionAudioMuted`, `setMillionAudioMuted` (`src/utils/millionAudio.ts`)
  - Rotas Anki existentes `/api/anki/decks` e `/api/anki/notes`

- [ ] **Step 1: Create `src/components/million/PrizeLadder.tsx`**

Escada vertical responsiva com os 16 degraus (`R$ 1.000` até `R$ 1.000.000`), divisores visuais dos 4 blocos de dificuldade (`Bloco 1: Aquecimento`, `Bloco 2: Intermediário`, `Bloco 3: Avançado`, `Bloco 4: Milhão`), destaque dourado brilhante para o degrau atual, check nos vencidos e resumo fixo dos valores atuais de **Acertar**, **Parar** e **Errar**.

- [ ] **Step 2: Create `src/components/MillionGameTab.tsx`**

Interface imersiva de estúdio de TV (palco azul-marinho profundo + holofotes radiais + molduras douradas inspiradas no programa, respeitando o tema claro/escuro nas bordas externas e alta legibilidade):
- **Lobby / Preparação:** campo de conteúdo livre ("O que quer estudar hoje?") + chips rápidos das matérias do CFO (`História do Brasil`, `Física Aplicada`, `Química`, etc.) + campo opcional de foco específico, banner de retomada se houver partida `IN_PROGRESS` (*Continuar partida* ou *Encerrar atual*), KPIs de Recorde Pessoal / Partidas / Vitórias e histórico recente.
- **Palco da Partida:** header com indicador do Bloco atual, botão de som (`Volume2`/`VolumeX`) e aviso discreto do slot de apresentador; pergunta renderizada com `LatexRenderer`; 4 barras interativas `A`–`D` (suporte a atalhos `1–4` / `A–D` e destaque riscado/apagado para alternativas eliminadas pelas Cartas); painel de **Universitários** com barras de porcentagem + comentários curtos; barra inferior com **Cartas**, **Pular (restantes + disponibilidade no bloco)**, **Universitários** e **Parar** (com confirmação via `ConfirmModal`).
- **Feedback Pós-Jogada & Fim de Partida:** revela resposta certa/errada com animação de destaque, mostra explicação tática + dica de prova com `LatexRenderer`, botão **"Salvar no Caderno de Erros"** (cria/reaproveita deck `"Show do Milhão::Erros"` e grava nota no Anki sem duplicar cliques) e botão **"Próxima Pergunta"** (ou tela final comemorativa de vitória / parada / resumo de aprendizado com revisão das questões erradas).

- [ ] **Step 3: Wire `millionGame` into `src/config/modules.ts`, `src/components/TacticalSidebar.tsx`, and `src/App.tsx`**

Registrar módulo `millionGame` (`/show-do-milhao`, ícone `Trophy` ou `Award` com badge `'Jogo'` dourado) no grupo `student` (`maintenanceEligible: true`), mantendo suporte ao Modo Manutenção automático e atalhos de rota.

- [ ] **Step 4: Run typecheck, build, and full readiness suite**

Run:
- `npx tsc --noEmit`
- `node scripts/readiness-suite.mjs`
- `npm run build`
Expected: `0` erros de TypeScript, 100% das suítes passando (`exit 0`), build Vite + `dist/server.cjs` concluídos.

- [ ] **Step 5: Commit**

```bash
git add src/components/million/PrizeLadder.tsx src/components/MillionGameTab.tsx src/config/modules.ts src/components/TacticalSidebar.tsx src/App.tsx
git commit -m "feat(million-game): add immersive Show do Milhao CFO tab and sidebar route"
```

---

## Self-Review
- **Spec coverage:** todas as seções da spec (4 blocos de dificuldade, 19 questões com 1 pulo por bloco, escada de 16 prêmios com tudo ou nada na Q16, Cartas/Pular/Universitários/Parar, validação autoritativa no servidor, `409 ACTIVE_MATCH_EXISTS`, proteção em `/api/user/state`, ponte para Caderno de Erros/Anki, Web Audio + slot para voz futura do Faustão, design imersivo) estão cobertas nas Tasks 1–4.
- **Step scan & consistency:** nomes (`millionGame`, `/show-do-milhao`, `million_game_active_v1`, `million_game_history_v1`, `MillionGameTab`, `PrizeLadder`, `playMillionCue`, `MILLION_PRESENTER_AUDIO_CONFIG`, rotas `/api/million-game/*` e `/api/ai/million-game/start`) estão idênticos entre tarefas.
- **Review Focus:** todos os 5 modos de falha listados têm testes explícitos nas Tasks 1 e 2.
