# CFO CBMERJ — Plano de Implementação em 4 Fases

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (native phase-by-phase) or `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabilizar os erros de produção e higiene do repositório (Fase 1), entregar a gamificação militar CBMERJ com foguinho, escudo de gelo animado e sidebar redesenhada (Fase 2), substituir o Radar pelo Radar de Provas com cartão-resposta/gabarito e IA sob demanda (Fase 3) e integrar os Simulados com diagnóstico de lacunas por matéria (Fase 4).

**Architecture:** Reuso enxuto com autoridade no backend (`Abordagem A`). Payload/base64 pesados saem do JSON de estado/perfil via endpoint cacheado de avatar e proteção de tamanho em `remotePersistence.ts`; ofensiva/patentes e escudo de gelo rodam de forma determinística no backend sobre `study_sessions`; um único componente `AnswerSheetInput` atende tanto o novo Radar de Provas (`exam_attempts`) quanto os Simulados (`user_simulations`) usando Gemini multimodal (`getGeminiClient()`) estritamente sob demanda.

**Tech Stack:** TypeScript, React 19, Tailwind CSS v4, Lucide Icons, Express (`server.ts`), SQLite (`node:sqlite`) + PostgreSQL compatível (`src/db/`), `@google/genai`, `node:test`.

**Spec:** [2026-11-17-cfo-evolution-design.md](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/docs/superpowers/specs/2026-11-17-cfo-evolution-design.md)

## Global Constraints

- Backend é autoridade: patentes, foguinho, saldo/consumo de escudo de gelo, ownership e cotas de IA nunca confiam no cliente.
- Compatibilidade dupla SQLite (`node:sqlite`) e PostgreSQL (`pg` via `postgresSync.ts`): DDL compatível nas migrações (`TEXT PRIMARY KEY`, `INTEGER`, `REAL`).
- Nenhuma nova chave pesada (> 256 KB) ou gabarito/simulado vai para `user_state_snapshots`.
- IA (Gemini) em provas e simulados dispara **apenas** por clique explícito do usuário.
- Cada fase termina com `npx tsc --noEmit`, `npm run build`, `npm test` (`scripts/readiness-suite.mjs`), revisão de diff/secrets, commit isolado da fase (sem push automático) e pausa aguardando aprovação.
- Toda suíte nova em `test/*.test.ts` deve ser registrada em `scripts/readiness-suite.mjs`.

## Review Focus

- `remotePersistence.ts` recebendo erro `413` ou chave > 256 KB no `localStorage`: nunca re-enfileirar payload `413` em loop nem travar sincronização das demais chaves menores.
- `GET /api/user/profile` e `GET /api/user/avatar/:userId`: servir imagem válida cacheável para `data:image/*` preservando URLs `/avatars/...` existentes e bloqueando acesso não autenticado ao avatar.
- Edição/exclusão retroativa de `study_sessions` e ausência de estudo sem escudos vs. com escudo: cálculo determinístico em fuso `America/Sao_Paulo`, sem baixar abaixo de `Soldado` após primeiro estudo e sem duplicar modal de escudo já confirmado.
- Parser de cartão-resposta em chat (`E A B B C U`) e gabarito em foto/texto com `totalQuestions` variável (`1..200`): espaços múltiplos, minúsculas, letras inválidas e quantidade menor/maior que `totalQuestions` tratados de forma determinística.
- Tentativa de acessar/diagnosticar prova (`exam_attempts`) ou simulado (`user_simulations`) de outro usuário: retorno `404`/`403` estrito no backend.

---

## Fase 1 — Estabilização de Produção (Parte 1) & Higiene Local (Parte 2)

### Task 1: Bloquear loop `413` e chaves gigantes em `remotePersistence.ts`

**Files:**
- Modify: `src/services/remotePersistence.ts:1-105`
- Test: `test/remote_persistence_resilience.test.ts`
- Modify: `scripts/readiness-suite.mjs`

**Interfaces:**
- Produces: `sanitizePendingPayload(payload: Record<string, string>, maxEntryBytes?: number): Record<string, string>` e comportamento sem re-enfileiramento em `413`/`400`/`422` em `putState()`.

- [ ] **Step 1: Escrever teste que falha para payload `413` e chave > 256 KB**

```ts
// test/remote_persistence_resilience.test.ts
// Mock globalThis.localStorage + globalThis.fetch returning status 413 once, then 200
// Assert: sanitizePendingPayload drops keys > 256_000 bytes keeping valid keys
// Assert: on HTTP 413, putState() does NOT re-insert the rejected payload back into pendingValues
```

- [ ] **Step 2: Rodar o teste e confirmar falha**
Run: `npx tsx --test test/remote_persistence_resilience.test.ts`
Expected: FAIL (`sanitizePendingPayload` indefinido / payload 413 re-enfileirado).

- [ ] **Step 3: Implementar proteção de tamanho e não-requeue em `413` em `src/services/remotePersistence.ts`**
Adicionar `sanitizePendingPayload(payload, 256_000)` aplicado em `collectState()` e `queuePersistentSync()`, limitar envio por lote a `1_400_000` bytes enviando as chaves menores válidas separadamente se necessário, e não restaurar `pendingValues` quando `response.status === 413 || response.status === 400 || response.status === 422`.

- [ ] **Step 4: Rodar o teste e confirmar aprovação**
Run: `npx tsx --test test/remote_persistence_resilience.test.ts`
Expected: PASS.

---

### Task 2: Endpoint binário cacheado de avatar (`GET /api/user/avatar/:userId`) e fim dos `429` automáticos da IA

**Files:**
- Modify: `server.ts:3275-3290, 3915-3935, 4890-4985, 4988-5030`
- Modify: `src/App.tsx:772-806, 937-946`
- Test: `test/profile.test.ts` (adicionar caso de URL compacta para `data:image/*` + `/api/user/avatar/:userId` autenticado e cacheado)

**Interfaces:**
- Consumes: `profileRepoInstance.findByUserId`, `validateImageBuffer` em `server.ts`.
- Produces: helper `toPublicAvatarUrl(userId: string, rawAvatarUrl: string | null | undefined): string | null` e rota `GET /api/user/avatar/:userId`.

- [ ] **Step 1: Adicionar caso de teste em `test/profile.test.ts`**
Assert: usuário cujo `avatarUrl` no banco inicia com `data:image/png;base64,...` recebe `/api/user/avatar/<id>?v=<hash8>` em `GET /api/user/profile`, rota `GET /api/user/avatar/:userId` exige autenticação (`401` sem token) e retorna `200` com `Content-Type: image/png` e cabeçalho `Cache-Control` quando autenticado; URLs `/avatars/...` continuam preservadas sem alteração.

- [ ] **Step 2: Rodar `test/profile.test.ts` para confirmar falha**
Run: `npx tsx --test test/profile.test.ts`
Expected: FAIL na nova asserção de `/api/user/avatar/`.

- [ ] **Step 3: Implementar `toPublicAvatarUrl` e `GET /api/user/avatar/:userId` em `server.ts` e remover auto-disparo de IA em `src/App.tsx`**
1. Em `server.ts`, criar `toPublicAvatarUrl(userId, rawAvatarUrl)`: se `!rawAvatarUrl`, retorna `null`; se começar com `data:image/`, gera hash SHA-256 curto (10 chars) e retorna `/api/user/avatar/${userId}?v=${hash}`; caso contrário retorna `rawAvatarUrl`. Aplicar em `/api/user/profile` (GET/PATCH), `/api/auth/impersonation/start`, `/api/admin/users/:id` e `/api/user/avatar` (POST).
2. Adicionar `app.get("/api/user/avatar/:userId", requireUserAuth, ...)` decodificando o `data:image/<mime>;base64,...` do perfil alvo, respondendo `304 Not Modified` quando `If-None-Match` bater com `ETag`, e enviando `Cache-Control: private, max-age=86400`.
3. Em `src/App.tsx:937-945`, substituir o `useEffect` que chamava `runAIAnalysis(false)` automaticamente por atualização apenas do estado determinístico local (`aiService` fallback sem `POST /api/ai/study-analysis`), reservando o `POST` exclusivamente ao clique manual (`onRefresh={() => runAIAnalysis(true)}` em `AIBalanceTab`).

- [ ] **Step 4: Validar `test/profile.test.ts`, `.gitignore` e arquivos da Parte 2**
Garantir `public/cfo-extensao-cbmerj/` no `.gitignore` (preservando `public/cfo-extensao-cbmerj.zip`), registrar `remote_persistence_resilience` em `scripts/readiness-suite.mjs`, rodar `npx tsc --noEmit`, `npm run build` e `npm test`, revisar diff/secrets e fazer **Commit da Fase 1** (sem push automático) e **PARAR para aprovação do usuário**.

---

## Fase 2 — Gamificação Militar CBMERJ, Foguinho, Escudo de Gelo Animado e Sidebar

### Task 3: Motor determinístico de Patentes (1h–12h/dia), Foguinho e Escudo de Gelo no Backend

**Files:**
- Modify: `src/db/database.ts` (Migration `39`: `039_gamification_radar_simulations` criando `user_gamification_state`, `exam_attempts`, `user_simulations`)
- Create: `src/services/gamificationService.ts`
- Modify: `src/db/repositories.ts` (ou delegar ao `gamificationService.ts` com compatibilidade SQLite + Postgres)
- Test: `test/gamification_ranks.test.ts`
- Modify: `scripts/readiness-suite.mjs`

**Interfaces:**
- Produces:
  - `MILITARY_RANKS` (`Recruta` até `Coronel Comandante` = `12h/dia` efetiva e `>= 30` dias)
  - `GamificationService(db).getStatus(userId: string, now?: Date): GamificationStatus`
  - `GamificationService(db).acknowledgeShieldEvent(userId: string): GamificationStatus`
  - `GamificationService(db).recomputeFromSessions(userId: string, now?: Date): GamificationStatus`

- [ ] **Step 1: Escrever testes que falham em `test/gamification_ranks.test.ts`**
Cobrir:
1. Backfill inicial sobre `study_sessions` existentes calcula `currentStreakDays >= N` sem gerar modal de escudo retroativo.
2. Dia com `< 1800s` (30 min) não conta para manter foguinho.
3. Faltar 1 dia com `iceShields >= 1` consome 1 escudo, preserva `currentStreakDays` e popula `pendingShieldEvent`.
4. Ao atingir múltiplos de `14` dias seguidos (14, 28...), concede `+1` escudo até o teto `3`.
5. Escala de patentes diferencia `1h/dia` (`Soldado`) de `12h/dia` sustentada por 30 dias (`Coronel Comandante`), recalcula com rebaixamento suave sem voltar abaixo de `Soldado` se houver quebra sem escudo ou queda de ritmo.

- [ ] **Step 2: Rodar teste para confirmar falha**
Run: `npx tsx --test test/gamification_ranks.test.ts`
Expected: FAIL (`gamificationService` não existe).

- [ ] **Step 3: Implementar Migração 39 + `GamificationService` e expor rotas em `server.ts`**
1. Adicionar migração `39` em `src/db/database.ts` com `user_gamification_state`, `exam_attempts` e `user_simulations` (SQL compatível SQLite + Postgres).
2. Implementar `src/services/gamificationService.ts` com fuso `America/Sao_Paulo`, cálculo de janela móvel 14d × fator de constância (`0.55 + 0.45 * min(1, streak/30)`), ganho quinzenal de escudo, consumo automático para lacunas entre `last_evaluated_date` e ontem (máximo dias perdidos com escudo disponível), e recálculo determinístico chamado após `POST /api/study-sessions/manual`, `/api/study-sessions/desktop` e `DELETE /api/study-sessions/*`.
3. Expor em `server.ts`:
   - `GET /api/gamification/status` (`requireUserAuth`)
   - `POST /api/gamification/shield-event/ack` (`requireUserAuth`)

- [ ] **Step 4: Rodar `test/gamification_ranks.test.ts` e confirmar aprovação**
Run: `npx tsx --test test/gamification_ranks.test.ts`
Expected: PASS.

---

### Task 4: UI Tática — Sidebar (sem `@username`, com Foguinho), Cronograma e Overlay do Escudo de Gelo

**Files:**
- Create: `src/components/IceShieldModal.tsx`
- Create: `src/components/RankProgressPill.tsx`
- Modify: `src/components/TacticalSidebar.tsx:578-588, 748-760`
- Modify: `src/components/HorizontalWeeklyTable.tsx:115-155`
- Modify: `src/App.tsx` (carregar `/api/gamification/status` ao autenticar e após salvar/excluir sessão; renderizar `<IceShieldModal />` e passar `gamification` para Sidebar e Cronograma)
- Modify: `src/index.css` (keyframes CSS suaves de rotação 3D / brilho glacial para o escudo)

**Interfaces:**
- Consumes: `GET /api/gamification/status`, `POST /api/gamification/shield-event/ack`.
- Produces: `GamificationStatus` sincronizado na sidebar (`nome + foguinho + insígnia`), cabeçalho do cronograma (`foguinho + escudos + patente + progresso para próxima patente`) e overlay animado do escudo girando.

- [ ] **Step 1: Implementar `<IceShieldModal />` e `<RankProgressPill />`**
`<IceShieldModal />`: overlay elegante com fundo translúcido, animação CSS do escudo de gelo entrando na tela, girando e emitindo brilho azul-glacial, exibindo *"Escudo de Gelo ativado! Salvou sua ofensiva de X dias!"*, quantidade de escudos restantes e botão *"Continuar Missão"* que dispara `onAcknowledge()`.
`<RankProgressPill />`: pill compacto com patente atual, carga média 14d (ex.: `4.2h/dia`), foguinho (`Flame`) + escudos (`Shield`), e popover/tooltip explicando quantas horas/dia e dias consecutivos faltam para a próxima patente até `12h/dia` (`Coronel Comandante`).

- [ ] **Step 2: Redesenhar Perfil da Sidebar (`TacticalSidebar.tsx`) e adicionar Foguinho no Cronograma (`HorizontalWeeklyTable.tsx`)**
1. Em `TacticalSidebar.tsx` (mobile e desktop): remover `@{userProfile?.username}`, criar card de perfil refinado com borda sutil, avatar com anel de status, nome em destaque (`fullName || username`), mini badge da patente abaixo do nome e pílula animada de **foguinho** (`🔥 Xd`) + micro-ícone de escudo ao lado do nome.
2. Em `HorizontalWeeklyTable.tsx`: incluir `<RankProgressPill />` no cabeçalho do cronograma mostrando foguinho, escudos e patente.

- [ ] **Step 3: Verificar build, testes e registrar suite da Fase 2**
Registrar `gamification_ranks` em `scripts/readiness-suite.mjs`, rodar `npx tsc --noEmit`, `npm run build`, `npm test`, revisar diff/secrets, fazer **Commit da Fase 2** e **PARAR para aprovação**.

---

## Fase 3 — Cartão-Resposta Compartilhado & Radar de Provas com IA Sob Demanda

### Task 5: Parser & Componente Compartilhado `AnswerSheetInput` + OCR de Gabarito por Foto

**Files:**
- Create: `src/utils/answerSheet.ts`
- Create: `src/components/AnswerSheetInput.tsx`
- Modify: `server.ts` (endpoint `POST /api/ai/parse-answer-key-image`)
- Test: `test/answer_sheet.test.ts`
- Modify: `scripts/readiness-suite.mjs`

**Interfaces:**
- Produces:
  - `parseAnswerTokens(input: string, totalQuestions: number): Array<'A'|'B'|'C'|'D'|'E'|'U'|null>`
  - `gradeAnswerSheet(studentAnswers, officialKey): { totalAnswered, correctCount, wrongCount, blankCount, wrongQuestions: number[], accuracyPct: number }`
  - Componente React `<AnswerSheetInput />` (aceita `totalQuestions` editável `1..200`, grade visual clicável, campo rápido estilo chat `E A B B C U`, acertos por matéria baseados na grade real + tag livre, e 3 modos de gabarito oficial: colar/enviar foto, texto colado ou cartão-resposta clicável).

- [ ] **Step 1: Escrever testes que falham em `test/answer_sheet.test.ts`**
Testar `parseAnswerTokens("e a  b b c u", 8)` -> `['E','A','B','B','C','U',null,null]`, truncamento quando passar mais tokens que `totalQuestions`, caracteres inválidos ignorados ou marcados como `null`, e `gradeAnswerSheet()` tratando `U` como não pontuada e listando números exatos de questões erradas (`wrongQuestions`).

- [ ] **Step 2: Rodar teste para confirmar falha**
Run: `npx tsx --test test/answer_sheet.test.ts`
Expected: FAIL (`src/utils/answerSheet.ts` não existe).

- [ ] **Step 3: Implementar `answerSheet.ts`, rota `/api/ai/parse-answer-key-image` em `server.ts` e `<AnswerSheetInput />`**
1. Implementar utilitário puro `src/utils/answerSheet.ts`.
2. Em `server.ts`, adicionar `POST /api/ai/parse-answer-key-image` (`requireUserAuth`, `aiLimiter`) validando magic bytes via `validateImageBuffer`, enviando imagem + `totalQuestions` para `getGeminiClient()` extrair o vetor de letras A–E e devolvendo `{ letters: string[], rawText: string }`.
3. Implementar `src/components/AnswerSheetInput.tsx` com suporte nativo a `onPaste` (colar print direto com Ctrl+V!) além de upload de imagem, chat rápido com envio `Enter` preenchendo em tempo real `Q1..QN`, grade tática responsiva em colunas `A B C D E U`, alternância limpa para o modo Gabarito Oficial, e bloco de acertos por matéria.

- [ ] **Step 4: Rodar `test/answer_sheet.test.ts` e confirmar aprovação**
Run: `npx tsx --test test/answer_sheet.test.ts`
Expected: PASS.

---

### Task 6: Persistência de `exam_attempts`, Diagnóstico Sob Demanda e Novo Radar de Provas (`/desempenho`)

**Files:**
- Modify: `server.ts` (rotas `GET /api/exams/attempts`, `POST /api/exams/:id/attempts`, `POST /api/exams/:id/ai-diagnosis`)
- Create: `src/services/examRadarService.ts`
- Modify: `src/components/StudentRadarTab.tsx` (reescrever como **Radar de Provas** bonito com cards das provas do Banco de Provas, placar/acertos, modal/drawer com `<AnswerSheetInput />` e botão **"Analisar Prova com IA"** sob demanda)
- Modify: `src/App.tsx:2748` (substituir `<StudentCoachPanel /><StudentAnalyticsPanel /><StudentRadarTab />` por apenas `<StudentRadarTab theme={theme} showToast={showToast} subjects={subjects} />`)
- Test: `test/exam_radar_diagnosis.test.ts`
- Modify: `scripts/readiness-suite.mjs`

**Interfaces:**
- Consumes: `AnswerSheetInput`, `getExamPdf` / `examPaperRepoInstance`, `getGeminiClient()`.
- Produces: `GET /api/exams/attempts`, `POST /api/exams/:id/attempts`, `POST /api/exams/:id/ai-diagnosis` e UI completa do Radar de Provas.

- [ ] **Step 1: Escrever teste de API/ownership em `test/exam_radar_diagnosis.test.ts`**
Assert: usuário B recebe `404` ao tentar salvar tentativa ou solicitar diagnóstico em prova do usuário A; usuário A salva tentativa com cartão-resposta + acertos por matéria, vê listagem vinculada em `GET /api/exams/attempts` e recebe diagnóstico determinístico de fallback se Gemini não estiver configurado (sem inventar dados).

- [ ] **Step 2: Rodar teste para confirmar falha**
Run: `npx tsx --test test/exam_radar_diagnosis.test.ts`
Expected: FAIL (`exam_attempts` / rotas não implementadas).

- [ ] **Step 3: Implementar `examRadarService.ts`, rotas em `server.ts`, novo `StudentRadarTab.tsx` e troca em `src/App.tsx`**
1. Implementar CRUD de tentativas de provas e diagnóstico IA sob demanda (`POST /api/exams/:id/ai-diagnosis`) buscando o PDF no R2 (via `getExamPdf`, com fallback para questões/metadados extraídos caso R2 esteja indisponível) + questões erradas (`wrongQuestions`) + acertos por matéria.
2. Substituir o conteúdo da aba `/desempenho` em `App.tsx:2748` exclusivamente por `<StudentRadarTab />` exibindo todas as provas do Banco de Provas do usuário, estatísticas visuais, botão para registrar/editar acertos + cartão-resposta (`<AnswerSheetInput />`) e botão **"Ler Prova e Diagnosticar com IA"** (**apenas sob demanda**).

- [ ] **Step 4: Validar build e testes da Fase 3**
Registrar `answer_sheet` e `exam_radar_diagnosis` em `scripts/readiness-suite.mjs`, rodar `npx tsc --noEmit`, `npm run build`, `npm test`, revisar diff/secrets, fazer **Commit da Fase 3** e **PARAR para aprovação**.

---

## Fase 4 — Simulados com Cartão-Resposta e IA de Lacunas (*Aprofundar / Rever / Primeira Vez*)

### Task 7: Persistência Relacional de Simulados (`user_simulations`) & IA de Lacunas

**Files:**
- Create: `src/services/simulationDiagnosisService.ts`
- Modify: `server.ts` (rotas `GET /api/simulations`, `POST /api/simulations`, `PATCH /api/simulations/:id`, `DELETE /api/simulations/:id`, `POST /api/simulations/:id/ai-diagnosis`, `POST /api/simulations/ai-diagnosis`)
- Test: `test/simulation_ai_diagnosis.test.ts`
- Modify: `scripts/readiness-suite.mjs`

**Interfaces:**
- Consumes: `study_sessions` (histórico real de horas por matéria do usuário), `gradeAnswerSheet`, `getGeminiClient()`.
- Produces: classificação explícita `{ deepen: [...], review: [...], firstTime: [...] }` baseada no cruzamento `acertos por matéria vs nota de corte` + `horas estudadas reais em study_sessions`.

- [ ] **Step 1: Escrever teste em `test/simulation_ai_diagnosis.test.ts`**
Assert:
1. Ownership check (`404` ao acessar/diagnosticar simulado de outro usuário).
2. Simulado salvo com `subjectScores` persiste no banco (fora de `user_state_snapshots`).
3. Cruzamento com `study_sessions`: matéria com erro no simulado e `0s` em `study_sessions` é classificada em `firstTime` (*Ver pela primeira vez*); matéria estudada anteriormente (`lastStudiedAt > 7d` ou poucas horas recentes) vai para `review` (*Rever*); matéria com bom histórico de estudo mas abaixo da `targetCutoffPct` vai para `deepen` (*Aprofundar*).

- [ ] **Step 2: Rodar teste para confirmar falha**
Run: `npx tsx --test test/simulation_ai_diagnosis.test.ts`
Expected: FAIL (`SimulationDiagnosisService` / rotas não existem).

- [ ] **Step 3: Implementar `simulationDiagnosisService.ts` e endpoints em `server.ts`**
Implementar persistência em `user_simulations` (com idempotência simples para importação única do histórico `localStorage`) e análise IA individual + consolidada usando Gemini com fallback heurístico estrito grounded em `study_sessions`.

- [ ] **Step 4: Rodar `test/simulation_ai_diagnosis.test.ts` e confirmar aprovação**
Run: `npx tsx --test test/simulation_ai_diagnosis.test.ts`
Expected: PASS.

---

### Task 8: UI de `TacticalSimulations.tsx` com `AnswerSheetInput` e Visão Consolidada + Organização de `/simulados`

**Files:**
- Modify: `src/components/TacticalSimulations.tsx` (substituir estado `localStorage` por API `/api/simulations` com migração automática única do legado local; embutir `<AnswerSheetInput />` e botões sob demanda *"Diagnosticar Simulado com IA"* e *"Visão Consolidada dos Simulados"*, exibindo cards separados para **Aprofundar**, **Rever** e **Ver pela 1ª vez**)
- Modify: `src/App.tsx:2770-2775` (renderizar `<TacticalSimulations theme={theme} showToast={showToast} subjects={subjects} />` no topo e `<Release3StudyPanel />` em `<details>` recolhido abaixo para preservar compatibilidade sem poluir a tela)

- [ ] **Step 1: Atualizar `TacticalSimulations.tsx` e `App.tsx`**
Garantir design limpo e visual refinado mantendo gráficos/cards táticos existentes, carregando lista real de matérias do cronograma no `<AnswerSheetInput />` e persistindo no backend.

- [ ] **Step 2: Verificação final completa de ponta a ponta**
Registrar `simulation_ai_diagnosis` em `scripts/readiness-suite.mjs`, rodar:
- `npx tsc --noEmit`
- `npm run build`
- `npm test`
Revisar `git diff`, conferir ausência de segredos e atualizar `C:\Users\renas\Downloads\renas-ai-brain\AI\DECISIONS.md` / `Projects` se aplicável, fazer **Commit da Fase 4** e **PARAR para aprovação final antes de push**.
