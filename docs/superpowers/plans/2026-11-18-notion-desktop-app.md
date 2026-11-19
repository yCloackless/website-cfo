# App Desktop Notion + IA de Equilíbrio e Vínculo com o Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um aplicativo desktop Windows nativo em Tauri 2 (`C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio`) com a aba `IA de Equilíbrio` e a `Agenda Notion` completas, vinculado por API autenticada e SSE em tempo real ao site (`cronograma-de-estudos-cfo-cbmerj`).

**Architecture:** O site expõe endpoints machine-to-machine autenticados por Bearer token (`crypto.timingSafeEqual` + `DESKTOP_TIMER_USER_ID` admin) para entregar o balanço mensal real de estudos (`/api/notion/desktop/study-balance`), entregar/receber sincronizações do Notion (`/api/notion/desktop/revisoes` e `/api/notion/desktop/sync`) e transmitir atualizações via SSE (`/api/notion/events`) para as abas Admin abertas. O app desktop em Tauri 2 isola todas as chaves (`NOTION_API_KEY`, `NOTION_DATABASE_ID`, `GEMINI_API_KEY`, `SITE_API_URL`, `SITE_DESKTOP_API_KEY`) e chamadas externas no backend Rust (`src-tauri/src/`), mantendo cache local em AppData e fila resiliente de re-sincronização (`pending-site-sync.json`), enquanto o frontend React reaproveita os componentes e utilitários do site.

**Tech Stack:**
- **Site:** Node.js, Express, TypeScript, SSE (`text/event-stream`), `node:test` (`readiness-suite.mjs`).
- **App Desktop:** Tauri 2 (`tauri`, `tauri-plugin-opener`, `reqwest` com `rustls-tls`, `serde`, `serde_json`, `tokio`, `chrono`, `dotenvy`), React 19, TypeScript, Vite, Tailwind CSS, Recharts, Lucide React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-notion-desktop-app-design.md`

## Global Constraints

- Preservar alterações locais existentes no repositório do site (especialmente `notionBackend.ts`) e nunca ler, copiar ou commitar secrets de `.env`.
- Nunca embutir `NOTION_API_KEY`, `GEMINI_API_KEY` ou `SITE_DESKTOP_API_KEY` no bundle frontend JS; o frontend recebe apenas flags booleanas (`hasNotionKey`, `hasGeminiKey`, `hasSiteKey`) e metadados mascarados.
- Manter bloqueio estrito `403 NOTION_FORBIDDEN` nas rotas `/api/notion/*` do navegador para qualquer usuário sem `canAccessNotion === true`.
- `Próxima Revisão` é sempre lida de `date.start` ou `formula.date.start` da resposta da API do Notion (nunca recalculada por fórmula local).
- Mutações no Notion exigem conexão ativa com a API do Notion; o cache JSON garante leitura offline, e falhas de notificação ao site enfileiram `{ action: "refresh" }` em `pending-site-sync.json`.

## Review Focus

- **Acesso não autorizado ou não-admin às rotas desktop e SSE:** token inválido/ausente retorna `401`, usuário sem `canAccessNotion` recebe `403 NOTION_FORBIDDEN` em `/api/notion/events` e rejeição nas rotas desktop (Task 2).
- **Propriedades variadas ou incompletas do Notion (`formula.date` vs `date`, `Matéria` vazia, `Assunto` vazio):** parser em Rust deve extrair `YYYY-MM-DD` sem pânico e ignorar itens sem `Próxima Revisão` ou já concluídos no resumo de pendências (Task 5 e Task 7).
- **Site offline durante mutação no app desktop:** escrita bem-sucedida no Notion deve continuar respondendo sucesso no app e gravar `{ action: "refresh" }` em `pending-site-sync.json` para drenagem posterior sem sobrescrever estado mais novo (Task 6).
- **Gemini offline/sem chave ou `0h` de estudo no mês:** fallback determinístico deve devolver `equilibriumScore === 0` e mensagens honestas sem fabricar matérias ou horas (Task 6 e Task 7).
- **Payload inválido ou `pageId` com path traversal em `POST /api/notion/desktop/sync`:** `pageId` com `/`, `\`, `?`, `#` ou `action` inválida deve responder `400` sem alterar o cache nem emitir SSE (Task 1 e Task 2).

---

### Task 1: Cache Mutation Helpers & Event Bus em `notionBackend.ts` (Site)

**Files:**
- Modify: `notionBackend.ts`
- Test: `test/notion_desktop_sync.test.ts`

**Interfaces:**
- Consumes: `BackendNotionRevisionItem`, `readLocalRevisoes`, `saveLocalRevisoes`, `fetchRevisoesFromNotion` (já existentes em `notionBackend.ts`).
- Produces:
  - `export type NotionChangeEvent = { type: "notion_updated"; action: "upsert" | "delete" | "refresh"; pageId?: string; updatedAt: string };`
  - `export function isValidNotionPageId(pageId: string): boolean`
  - `export function upsertCachedRevisionItem(item: BackendNotionRevisionItem): BackendNotionRevisionItem[]`
  - `export function removeCachedRevisionItem(pageId: string): BackendNotionRevisionItem[]`
  - `export function subscribeNotionChanges(listener: (event: NotionChangeEvent) => void): () => void`
  - `export function emitNotionChange(action: NotionChangeEvent["action"], pageId?: string): void`

- [ ] **Step 1: Write the failing test**

Criar `test/notion_desktop_sync.test.ts` testando `isValidNotionPageId`, `upsertCachedRevisionItem`, `removeCachedRevisionItem` e `subscribeNotionChanges` (isolando `process.cwd()` em diretório temporário para não tocar em `data/notion-revisoes-cache.json` real).

```ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("notionBackend cache helpers validate pageId, upsert/remove items and emit events", async () => {
  const prevCwd = process.cwd();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cfo-notion-sync-"));
  process.chdir(tmpDir);
  try {
    const nb = await import("../notionBackend");
    assert.equal(nb.isValidNotionPageId("abc-123"), true);
    assert.equal(nb.isValidNotionPageId("../bad"), false);
    assert.equal(nb.isValidNotionPageId("a?b=1"), false);

    const received: any[] = [];
    const unsubscribe = nb.subscribeNotionChanges((ev) => received.push(ev));

    nb.upsertCachedRevisionItem({
      id: "page-1",
      assunto: "Termodinâmica",
      materia: "Física",
      data: "2026-11-10",
      tipoRevisao: ["Questões"],
      proximaRevisao: "2026-11-17",
      semana: false, mes1: false, mes2: false, mes3: false,
      mes4: false, mes5: false, mes6: false, mes7: false, mes8: false, mes9: false, mes10: false,
    });
    assert.equal(nb.readLocalRevisoes().some((i) => i.id === "page-1"), true);
    assert.equal(received.at(-1)?.action, "upsert");
    assert.equal(received.at(-1)?.pageId, "page-1");

    nb.removeCachedRevisionItem("page-1");
    assert.equal(nb.readLocalRevisoes().some((i) => i.id === "page-1"), false);
    assert.equal(received.at(-1)?.action, "delete");
    unsubscribe();
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/notion_desktop_sync.test.ts`
Expected: FAIL (`isValidNotionPageId` / `upsertCachedRevisionItem` / `subscribeNotionChanges` not exported).

- [ ] **Step 3: Implement cache mutation helpers and EventEmitter in `notionBackend.ts`**

Adicionar `EventEmitter` em `notionBackend.ts`, implementar `isValidNotionPageId`, `emitNotionChange`, `subscribeNotionChanges`, `upsertCachedRevisionItem` e `removeCachedRevisionItem`, e chamar `emitNotionChange` no final de `updateCheckinInNotion`, `createStudyInNotion`, `renameStudyInNotion`, `duplicateStudyInNotion`, `deleteStudyInNotion` e `fetchRevisoesFromNotion` (quando solicitado ou após mutação). Preservar intacto o `getAuthorizedNotionTarget` já modificado localmente.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/notion_desktop_sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add notionBackend.ts test/notion_desktop_sync.test.ts
git commit -m "feat(notion): add cache sync helpers and change event emitter"
```

---

### Task 2: Rotas Desktop & SSE em Tempo Real no `server.ts` (Site)

**Files:**
- Modify: `server.ts`
- Modify: `.env.example` (documentar `DESKTOP_NOTION_API_KEY` opcional como fallback/alternativa ao `DESKTOP_TIMER_API_KEY`)
- Test: `test/notion_desktop_sync.test.ts`

**Interfaces:**
- Consumes: `notionBackend.ts` (`getNotionConfig`, `fetchRevisoesFromNotion`, `readLocalRevisoes`, `isValidNotionPageId`, `upsertCachedRevisionItem`, `removeCachedRevisionItem`, `subscribeNotionChanges`, `emitNotionChange`), `desktopAuthorizedUser` / `getDesktopSubjects` pattern em `server.ts:2257-2280`, `studySessionRepoInstance.getDailySummaryBetweenDates`, `userStateRepoInstance.get`.
- Produces:
  - `GET /api/notion/desktop/revisoes` (Bearer token)
  - `GET /api/notion/desktop/study-balance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` (Bearer token)
  - `POST /api/notion/desktop/sync` (Bearer token, aceita `{ action: "upsert" | "delete" | "refresh", item?, pageId? }`)
  - `GET /api/notion/events` (SSE protegido pelo middleware admin `/api/notion`)

- [ ] **Step 1: Write the failing integration tests**

Extrair ou importar o helper de autorização/validação de payload (ou criar módulo pequeno `src/services/notionDesktopSync.ts` importado pelo `server.ts`) para testar diretamente com HTTP/supertest ou handlers Express:
1. Bearer ausente/inválido -> `401 UNAUTHORIZED`.
2. Usuário em `DESKTOP_TIMER_USER_ID` sem `canAccessNotion` -> `403 NOTION_FORBIDDEN`.
3. `POST /api/notion/desktop/sync` com `pageId: "../x"` ou `action: "bad"` -> `400`.
4. `POST /api/notion/desktop/sync` com `{ action: "upsert", item }` válido -> `200`, atualiza cache e notifica listener SSE.
5. `GET /api/notion/events` sem sessão Admin (`canAccessNotion`) -> `403 NOTION_FORBIDDEN`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/notion_desktop_sync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/services/notionDesktopSync.ts` and register routes in `server.ts`**

- Em `src/services/notionDesktopSync.ts`:
  - `desktopNotionAuthorizedUser(req, userRepo)` usando `crypto.timingSafeEqual` contra `process.env.DESKTOP_NOTION_API_KEY || process.env.DESKTOP_TIMER_API_KEY` e validando `DESKTOP_TIMER_USER_ID` + `role === 'admin' || user.canAccessNotion`.
  - `validateDesktopSyncPayload(body)` validando `action` (`upsert` | `delete` | `refresh`), `pageId` (`isValidNotionPageId`) e campos obrigatórios de `item` (`id`, `assunto`, `materia`, `data`, `semana`, `mes1..mes10`).
- Em `server.ts`:
  - **IMPORTANTE:** Montar `/api/notion/desktop/*` **antes** de `app.use("/api/notion", ...)` (ou pular o middleware de cookie web quando `req.path.startsWith('/desktop/')` para exigir `desktopNotionAuthorizedUser` em vez de sessão de navegador!).
  - Registrar `GET /api/notion/desktop/revisoes`, `GET /api/notion/desktop/study-balance`, `POST /api/notion/desktop/sync` e `GET /api/notion/events` (SSE com heartbeat 25s e cleanup em `req.on('close')`).
  - Documentar `DESKTOP_NOTION_API_KEY` em `.env.example` sem valores reais.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/notion_desktop_sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/notionDesktopSync.ts server.ts .env.example test/notion_desktop_sync.test.ts
git commit -m "feat(notion): add authenticated desktop sync API and admin SSE events"
```

---

### Task 3: Atualização Automática em Tempo Real no Frontend do Site

**Files:**
- Modify: `src/services/notionService.ts`
- Modify: `src/components/NotionAgendaTab.tsx`
- Modify: `src/components/AIBalanceTab.tsx`

**Interfaces:**
- Consumes: `GET /api/notion/events` (SSE com cookie/auth ou `apiFetch` streaming / `EventSource` com `withCredentials: true` — verificar como `apiFetch` autentica no navegador).
- Produces: `subscribeNotionEvents(onChange: () => void): () => void` em `src/services/notionService.ts`.

- [ ] **Step 1: Write test or verify session auth transport for SSE**

Inspecionar `src/services/apiFetch.ts` para confirmar se a autenticação web usa cookie `HttpOnly`, header `x-terminal-session` ou ambos:
- Se usar header `x-terminal-session`, `EventSource` nativo não envia headers customizados — usar `fetch('/api/notion/events', { headers })` com leitura incremental de `ReadableStream` (`TextDecoder`) e reconexão exponencial (ou fallback `visibilitychange`/focus).
- Escrever teste unitário em `test/notion_desktop_sync.test.ts` para o parser de linhas SSE (`data: {...}\n\n`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/notion_desktop_sync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `subscribeNotionEvents` and connect `NotionAgendaTab.tsx` & `AIBalanceTab.tsx`**

- Em `NotionAgendaTab.tsx`: assinar `subscribeNotionEvents` no `useEffect` (com debounce de 400ms para chamar `loadData(false)` sem mostrar spinner intrusivo nem sobrescrever modal aberto).
- Em `AIBalanceTab.tsx`: quando `canAccessNotion === true`, assinar `subscribeNotionEvents` para chamar `loadNotionRevisions()` automaticamente em tempo real.

- [ ] **Step 4: Run full site checks**

Run:
- `npx tsx --test test/notion_desktop_sync.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `node scripts/readiness-suite.mjs`
- `npm run build`
Expected: ALL PASS with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/notionService.ts src/components/NotionAgendaTab.tsx src/components/AIBalanceTab.tsx test/notion_desktop_sync.test.ts
git commit -m "feat(notion): auto-refresh site Notion views via SSE on desktop updates"
```

---

### Task 4: Scaffold do Novo App Desktop Tauri 2 (`agenda-notion-equilibrio`)

**Files:**
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\package.json`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\tsconfig.json`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\vite.config.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\index.html`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\.gitignore`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\.env.example`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\Cargo.toml`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\build.rs`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\tauri.conf.json`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\main.rs`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\lib.rs`
- Copy icons from `C:\Users\renas\Desktop\PROJETOS\cronometro-cfo\src-tauri\icons\` to `src-tauri\icons\` (reaproveitando os ícones já prontos no Windows).

- [ ] **Step 1: Create project files & install npm dependencies**

Criar o scaffold mínimo com React 19, Vite, TypeScript, Tailwind CSS (v4 ou v3 igual ao site — verificar `cronograma-de-estudos-cfo-cbmerj/package.json`), `recharts`, `lucide-react`, `@tauri-apps/api`, `@tauri-apps/plugin-opener`, e `vitest` em `devDependencies`. Incluir `.gitignore` ignorando `.env`, `.env.*` (exceto `.env.example`), `node_modules/`, `dist/`, `src-tauri/target/`.

- [ ] **Step 2: Configure `tauri.conf.json` and `lib.rs` (single-instance Windows)**

Configurar janela `1280x820` (`minWidth: 960`, `minHeight: 640`, `decorations: true`, `center: true`, título `Agenda Notion & IA Equilíbrio`), identifier `com.cfo.agenda.notion`, e reutilizar o padrão de instância única de `cronometro-cfo/src-tauri/src/lib.rs` adaptado para o novo nome/classe.

- [ ] **Step 3: Verify scaffold compiles**

Run (in `agenda-notion-equilibrio`): `npm install && cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Exit 0, dependencies resolved cleanly.

- [ ] **Step 4: Commit initial scaffold**

Run: `git init && git add . && git commit -m "chore: scaffold Tauri 2 desktop app for Notion Agenda and AI Balance"`

---

### Task 5: Backend Rust `config.rs` & `notion.rs` com Cache e Testes

**Files:**
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\config.rs`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\notion.rs`
- Modify: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\lib.rs`

**Interfaces:**
- Produces (Tauri commands + Rust structs):
  - `AppConfigPublicStatus { isNotionConfigured: bool, hasNotionApiKey: bool, hasNotionDatabaseId: bool, hasGeminiApiKey: bool, hasSiteUrl: bool, hasSiteApiKey: bool, siteUrl: String, notionDatabaseIdPreview: String }` (never returns raw API keys!)
  - `NotionRevisionItem` matching `src/types.ts` (`id`, `assunto`, `materia`, `data`, `tipoRevisao`, `proximaRevisao`, `semana`, `mes1`..`mes10`, `url`, `updatedAt`)
  - Commands: `get_app_config_status`, `save_app_config`, `fetch_notion_revisoes`, `checkin_notion_revision`, `create_notion_study`, `rename_notion_study`, `duplicate_notion_study`, `delete_notion_study`

- [ ] **Step 1: Write failing Rust unit tests in `notion.rs` and `config.rs`**

Testes para:
- `parse_notion_page` lendo `Próxima Revisão` tanto via `date.start` quanto via `formula.date.start`, `Assunto`/`Name`/`Título`, `Matéria` (`select` e `multi_select`), `Tipo de Revisão` e todos os 11 checkboxes (`Semana`, `Mês 1`..`Mês 10`), incluindo caso com propriedades ausentes/vazias.
- `validate_page_id` rejeitando `/`, `\`, `?`, `#`.
- `AppConfig::to_public_status()` nunca expondo `notion_api_key`, `gemini_api_key` ou `site_api_key`.

- [ ] **Step 2: Run `cargo test` to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: FAIL.

- [ ] **Step 3: Implement `config.rs` and `notion.rs`**

- `config.rs`: carrega `app_data_dir/config.json` mesclado com `.env` local (apenas fallback em dev se campo no `config.json` estiver vazio); `save_app_config` atualiza apenas campos não vazios enviados pelo usuário (permite limpar explicitamente se desejado).
- `notion.rs`: pagina `POST /v1/databases/{id}/query` com `start_cursor` (teto 20 páginas), persiste em `app_data_dir/notion-revisoes-cache.json`, executa `PATCH`/`POST` direto na API do Notion e dispara callback/hook de sync para o site após mutação bem-sucedida. Em modo offline da API do Notion, leituras retornam cache local com `source: "local_cache"` e mutações retornam erro explícito sem criar registros temporários.

- [ ] **Step 4: Run `cargo test` to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat(rust): add local secure config and paginated Notion API client"
```

---

### Task 6: Backend Rust `site_sync.rs` & `ai.rs` (Gemini + Vínculo Resiliente)

**Files:**
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\site_sync.rs`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\ai.rs`
- Modify: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\notion.rs`
- Modify: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src-tauri\src\lib.rs`

**Interfaces:**
- Produces (Tauri commands):
  - `fetch_site_study_balance(start_date: String, end_date: String)` -> retorna `{ subjects, currentCycle, cyclesHistory, monthlySessionDays, source, syncedAt }` (ou lê `app_data_dir/study-balance-cache.json` se o site estiver offline)
  - `flush_pending_site_sync()` -> drena `app_data_dir/pending-site-sync.json` enviando `{ action: "refresh" }` para `POST /api/notion/desktop/sync`
  - `get_site_sync_status()` -> `{ connected: bool, pendingCount: usize, lastSyncAt: Option<String>, lastError: Option<String> }`
  - `analyze_study_balance(summary_json: Value, overdue_json: Option<Value>)` -> chama Gemini (`gemini-2.5-flash` → `gemini-2.0-flash`) no backend Rust com `responseMimeType: "application/json"` e o mesmo schema de `AIBalanceTab` (`AIAnalysisResult`), retornando erro controlado se não configurado/offline para o frontend acionar `buildDeterministicStudyAnalysis`.

- [ ] **Step 1: Write failing Rust unit tests in `site_sync.rs` and `ai.rs`**

Testes para:
- `PendingSyncQueue`: enfileira `{ action: "refresh" }` deduplicado em arquivo temporário quando o site falha, e limpa após flush bem-sucedido.
- `build_gemini_prompt`: inclui corretamente `subjectsStudied`, `subjectsNotStudied` e `notionOverdueSummary` sem fabricar horas quando `totalMinutes == 0`.
- `parse_gemini_response`: extrai JSON válido de `candidates[0].content.parts[0].text` e valida presença de `equilibriumScore` e `weeklyActionPlan`.

- [ ] **Step 2: Run `cargo test` to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: FAIL.

- [ ] **Step 3: Implement `site_sync.rs` and `ai.rs` and wire into `notion.rs` & `lib.rs`**

Integrar pós-mutação em `notion.rs`: após `checkin_notion_revision`, `create_notion_study`, `rename_notion_study`, `duplicate_notion_study` e `delete_notion_study`, disparar task assíncrona em `tokio::spawn` para `POST {SITE_API_URL}/api/notion/desktop/sync` (`upsert` ou `delete`), gravando `pending-site-sync.json` se falhar.

- [ ] **Step 4: Run `cargo test` to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat(rust): add site study-balance sync queue and Gemini AI backend"
```

---

### Task 7: Camada TypeScript Compartilhada & Bridge Tauri (`src/services/desktopApi.ts`)

**Files:**
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\types.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\utils\notionRevisions.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\utils\studyBalance.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\utils\studyChartUtils.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\services\aiService.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\services\notionService.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\services\desktopApi.ts`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\utils\studyBalance.test.ts`

**Interfaces:**
- Mantém as mesmas assinaturas de `NotionAgendaTab.tsx`, `NotionCalendar.tsx`, `AIBalanceTab.tsx` e `StudyColumnCharts.tsx` do site para que os componentes rodem sem adaptações invasivas, trocando apenas `fetch('/api/...')` por `invoke(...)` via `desktopApi.ts`.

- [ ] **Step 1: Write failing Vitest tests (`src/utils/studyBalance.test.ts`)**

Testar:
1. `buildMonthlyStudySummary` com `0` sessões e `0` ciclos -> `totalMinutes === 0`, `equilibriumScore === 0`.
2. `buildDeterministicStudyAnalysis` com `0h` -> `equilibriumScore === 0`, sem horas fictícias.
3. `summarizeOverdueNotionRevisions` com itens atrasados, para hoje e futuros (`Semana`..`Mês 10`), verificando ordenação por matéria mais atrasada.

- [ ] **Step 2: Run `npx vitest run` to verify it fails**

Run: `npx vitest run`
Expected: FAIL.

- [ ] **Step 3: Implement utils, types, and Tauri IPC `notionService.ts` / `aiService.ts` / `desktopApi.ts`**

Portar `notionRevisions.ts`, `studyBalance.ts`, `studyChartUtils.ts` e `aiService.ts` (chamando `invoke("analyze_study_balance", ...)` com fallback `buildDeterministicStudyAnalysis`), e implementar `notionService.ts` usando `invoke(...)` com `SUBJECT_COLORS` e `generateCalendarEvents` completos.

- [ ] **Step 4: Run `npx vitest run` and `npx tsc --noEmit`**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/
git commit -m "feat(frontend): add Tauri IPC services and monthly balance utilities"
```

---

### Task 8: UI Completa (`AIBalanceTab`, `NotionAgendaTab`, `NotionCalendar`, `SettingsModal`, `App.tsx`)

**Files:**
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\AIBalanceTab.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\StudyColumnCharts.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\NotionAgendaTab.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\NotionCalendar.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\ConfirmModal.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\components\SettingsModal.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\App.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\main.tsx`
- Create: `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio\src\index.css`

- [ ] **Step 1: Port UI components with exact parity to the site**

- Portar `AIBalanceTab.tsx` (sem restrição de role, pois é o app pessoal do usuário, sempre com painel de Revisões Pendentes até Hoje ativo + link externo abrindo via `@tauri-apps/plugin-opener` `openUrl`), `StudyColumnCharts.tsx`, `NotionAgendaTab.tsx`, `NotionCalendar.tsx` e `ConfirmModal.tsx`.
- Criar `SettingsModal.tsx` para preencher/atualizar localmente: `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `GEMINI_API_KEY`, `SITE_API_URL` (padrão configurável pelo usuário, ex. URL do site em produção ou `http://localhost:3000`) e `SITE_DESKTOP_API_KEY`, além de botão "Salvar e Sincronizar" e indicador de status por integração.
- Em `App.tsx`:
  - Navegação limpa no cabeçalho: `[ IA de Equilíbrio | Agenda Notion ]`, pílulas de status (`Notion`, `Site Sync` com contador de pendências se houver fila), botão `Sincronizar Tudo`, toggle `Dark / Light` persistido em `localStorage`, e botão `Configurações`.
  - Toast system integrado.
  - Auto-sync ao abrir o app, ao voltar o foco para a janela (`focus` com debounce de 15s) e polling leve a cada 60s quando conectado, além de drenagem automática de `pending-site-sync.json`.

- [ ] **Step 2: Typecheck, test, and build frontend**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/
git commit -m "feat(ui): build IA de Equilibrio, Agenda Notion, Calendar and Settings modal"
```

---

### Task 9: Verificação End-to-End e Build do Executável Windows (`.exe`)

**Files:**
- Verify both `C:\Users\renas\Desktop\PROJETOS\cronograma-de-estudos-cfo-cbmerj` and `C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio`

- [ ] **Step 1: Run all desktop tests and build Windows Tauri bundle**

Run (in `agenda-notion-equilibrio`):
- `npx vitest run`
- `npx tsc --noEmit`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run tauri build`
Expected: `.exe` / installer generated cleanly in `src-tauri/target/release/bundle/`.

- [ ] **Step 2: Verify zero secrets leaked in either repository**

Run: `git status -s` and verify `.env` is untracked/ignored and no API keys appear in `src/` or `src-tauri/`.

- [ ] **Step 3: Run all site checks again**

Run (in `cronograma-de-estudos-cfo-cbmerj`):
- `npx tsc --noEmit`
- `npm run lint`
- `node scripts/readiness-suite.mjs`
- `npx tsx --test test/notion_desktop_sync.test.ts`
- `npm run build`
Expected: ALL PASS.
