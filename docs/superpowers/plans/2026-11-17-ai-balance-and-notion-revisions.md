# IA de Equilíbrio Mensal Real, Cores no Cronograma e Revisões do Notion (Admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir métricas semanais e fallbacks fictícios da IA de Equilíbrio por dados mensais 100% reais e individualizados por usuário (`study_sessions` + cronograma), aplicar termômetro sutil (vermelho → âmbar → verde) no cronograma semanal, modernizar a aba `IA de Equilíbrio` com gráfico Barras/Pizza e adicionar (exclusivamente para o Admin) painel expansível de revisões atrasadas do Notion até hoje com check-in direto (`Semana`, `Mês 1`..`Mês 10`).

**Architecture:**
1. Um módulo puro compartilhado (`src/utils/studyBalance.ts`) consolida o mês atual (`YYYY-MM-01` até hoje em `America/Sao_Paulo`) mesclando sessões autoritativas de `/api/study-sessions/range` com entradas concluídas do cronograma sem dupla contagem, calculando score real (`0` quando sem estudo) e faixas de cor (`neutral`, `critical`, `attention`, `balanced`) por matéria.
2. O backend do Notion (`notionBackend.ts` + `/api/notion/*` e `/api/ai/study-analysis` em `server.ts`) remove `DEFAULT_SEED_ITEMS` / `notion-seed.json`, pagina via `next_cursor`, suporta `semana` + `mes1`..`mes10` devolvendo a `Próxima Revisão` recalculada pela própria API do Notion, e só inclui resumo de atrasos do Notion na IA quando a sessão autenticada possui `canAccessNotion === true`.
3. A UI (`HorizontalWeeklyTable.tsx`, `StudyColumnCharts.tsx`, `AIBalanceTab.tsx` e `App.tsx`) consome esses dados reais com alternância Barras/Pizza (`Recharts`) e acordeão expansível exclusivo do Admin para dar baixa na etapa pendente direto no Notion.

**Tech Stack:** TypeScript, React 19, Tailwind CSS, Recharts (`BarChart`, `PieChart`), Lucide Icons, Express, Notion REST API v2022-06-28, Node Test Runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-17-ai-balance-and-notion-revisions-design.md`

## Global Constraints

- **Zero dados inventados ou aleatórios**: remover `DEFAULT_SEED_ITEMS`, `notion-seed.json`, `equilibriumScore ?? 75`, `equilibriumScore: 80` e `Math.max(1, ...)` — se não houver horas registradas, exibir `0h` e `0 / 100`.
- **Individualização estrita por usuário**: cálculos mensais usam exclusivamente os registros da conta autenticada (`userId` via sessão server-side).
- **Notion exclusivo do Admin**: `app.use('/api/notion', ...)` continua retornando `403 NOTION_FORBIDDEN` para não-admin; `/api/ai/study-analysis` só consulta Notion no backend quando `session.canAccessNotion === true`; frontend não faz fetch nem exibe UI do Notion se `!canAccessNotion`.
- **Sem dependências novas**: usar apenas bibliotecas já instaladas (`recharts`, `lucide-react`).
- **Preservar visual dark/light do site** e não alterar outras abas fora de Cronograma (`HorizontalWeeklyTable`) e Equilíbrio IA (`AIBalanceTab` + `StudyColumnCharts`).

## Review Focus

- **Dupla contagem entre `study_sessions` e células do cronograma no mesmo dia**: quando o cronômetro salvou `study_sessions` e a conciliação também preencheu `currentCycle.entries` para o mesmo `(subjectId, dateStr)`, somar os dois dobraria as horas — garantir deduplicação por chave `(subjectId, dateStr)` priorizando `study_sessions`.
- **Estado de segunda-feira / início de mês com `0` minutos**: se todas as matérias tiverem `0` minutos no mês, não marcar todas como `critical` (vermelho); retornar faixa `neutral` preservando `subject.color`.
- **Checkboxes `Mês 4`..`Mês 10` em `NotionRevisionItem` e `RevisionCycleKey`**: atualizar `NotionAgendaTab.tsx` e `NotionCalendar.tsx` que possuem `Record<RevisionCycleKey, string>` exaustivo para evitar quebra de tipagem.
- **Vazamento de dados do Notion para não-admin via `/api/ai/study-analysis`**: um cliente não-admin pode tentar enviar `notionPendingSummary` falso no body — o servidor deve ignorar qualquer dado de Notion vindo do cliente e só anexar pendências do Notion lendo server-side quando `verifyTerminalSession(token).canAccessNotion === true`.
- **Falha/indisponibilidade da API do Notion**: em `PATCH /api/notion/checkin`, se `NOTION_API_KEY` não estiver configurada ou o `PATCH` falhar, não fingir sucesso nem gravar avanço falso; retornar erro explícito preservando `NOTION_UNAVAILABLE` em `fetchRevisoesFromNotion` (exigido por `test/notion_error_sanitization.test.ts`).

---

### Task 1: Motor de Agregação Mensal Real e Cores de Equilíbrio (`src/utils/studyBalance.ts`)

**Files:**
- Create: `src/utils/studyBalance.ts`
- Modify: `src/types.ts`
- Test: `test/study_balance_real.test.ts`

**Interfaces:**
- Produces in `src/types.ts`:
  - `export type RevisionCycleKey = 'semana' | 'mes1' | 'mes2' | 'mes3' | 'mes4' | 'mes5' | 'mes6' | 'mes7' | 'mes8' | 'mes9' | 'mes10';`
  - `NotionRevisionItem` com `mes4?: boolean; ... mes10?: boolean;`
  - `export interface MonthlyStudySessionDay { dateStr: string; subjects: Array<{ subjectId: string; subjectName: string; durationSeconds: number }>; }`
  - `export interface SubjectMonthlyBalance { subjectId: string; name: string; category: string; originalColor: string; minutes: number; hours: number; sessions: number; sharePct: number; ratioToAvg: number; tier: 'neutral' | 'critical' | 'attention' | 'balanced'; statusLabel: string; accentColor: string; }`
  - `export interface MonthlyStudySummary { yearMonth: string; totalSessions: number; totalMinutes: number; totalHours: number; equilibriumScore: number; subjectsStudied: ...; subjectsNotStudied: ...; allSubjects: ...; bySubject: Record<string, SubjectMonthlyBalance>; }`
- Produces in `src/utils/studyBalance.ts`:
  - `export function getCurrentYearMonthAndToday(now?: Date): { yearMonth: string; monthStart: string; todayStr: string }` (usando fuso `America/Sao_Paulo`)
  - `export function buildMonthlyStudySummary(subjects: Subject[], currentCycle: WeeklyCycle | null, cyclesHistory: WeeklyCycle[], sessionDays: Record<string, MonthlyStudySessionDay>, now?: Date): MonthlyStudySummary`
  - `export function buildMonthlyEntriesForCharts(currentCycle: WeeklyCycle | null, cyclesHistory: WeeklyCycle[], sessionDays: Record<string, MonthlyStudySessionDay>, yearMonth: string): StudyEntry[]`

- [ ] **Step 1: Write the failing test in `test/study_balance_real.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyStudySummary, getCurrentYearMonthAndToday } from '../src/utils/studyBalance';

test('returns 0 hours, score 0, and neutral tier when user has no study records in the month', () => {
  const summary = buildMonthlyStudySummary(
    [{ id: 'fis', name: 'Física', category: 'Exatas', color: '#3b82f6' }],
    null,
    [],
    {},
    new Date('2026-11-17T12:00:00Z'),
  );
  assert.equal(summary.totalHours, 0);
  assert.equal(summary.totalMinutes, 0);
  assert.equal(summary.equilibriumScore, 0);
  assert.equal(summary.bySubject['fis'].tier, 'neutral');
});

test('deduplicates same (subjectId, dateStr) favoring backend study_sessions and classifies red/amber/green', () => {
  const subjects = [
    { id: 'bio', name: 'Biologia', category: 'Natureza', color: '#10b981' },
    { id: 'fis', name: 'Física', category: 'Exatas', color: '#3b82f6' },
    { id: 'qui', name: 'Química', category: 'Exatas', color: '#f59e0b' },
  ];
  const cycle = {
    id: 'c1', startDate: '2026-11-16', endDate: '2026-11-22', label: 'Atual', updatedAt: '',
    entries: {
      fis_0: { id: 'e1', subjectId: 'fis', dayIndex: 0, dateStr: '2026-11-16', completed: true, durationMinutes: 120 },
      qui_0: { id: 'e2', subjectId: 'qui', dayIndex: 0, dateStr: '2026-11-16', completed: true, durationMinutes: 60 },
    },
  };
  const sessionDays = {
    '2026-11-16': { dateStr: '2026-11-16', subjects: [{ subjectId: 'fis', subjectName: 'Física', durationSeconds: 7200 }] },
  };
  const summary = buildMonthlyStudySummary(subjects, cycle, [], sessionDays, new Date('2026-11-17T12:00:00Z'));
  assert.equal(summary.bySubject['fis'].minutes, 120); // not 240!
  assert.equal(summary.bySubject['qui'].minutes, 60);
  assert.equal(summary.bySubject['bio'].minutes, 0);
  assert.equal(summary.bySubject['bio'].tier, 'critical');
  assert.equal(summary.bySubject['fis'].tier, 'balanced');
  assert.ok(summary.equilibriumScore > 0 && summary.equilibriumScore < 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts`
Expected: FAIL because `../src/utils/studyBalance` does not exist yet.

- [ ] **Step 3: Update `src/types.ts` and create `src/utils/studyBalance.ts`**

Atualizar `RevisionCycleKey` e `NotionRevisionItem` em `src/types.ts` (com `mes4`..`mes10` opcionais e mapa compartilhado `NOTION_CYCLE_ORDER` / `NOTION_CYCLE_LABELS`), e implementar `src/utils/studyBalance.ts` com:
- `getCurrentYearMonthAndToday` usando `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`.
- Deduplicação por `${subjectId}::${dateStr}` dentro do `yearMonth` atual: `study_sessions` tem precedência quando `durationSeconds > 0`; caso contrário usa entrada concluída de `currentCycle` + `cyclesHistory` (contando sessão mesmo se `durationMinutes === 0`, sem inventar minutos).
- Faixas relativas à média mensal das matérias (`avg = totalMinutes / subjects.length`): `maxMinutes === 0` → `neutral` (`subject.color`); `minutes === 0 || minutes < avg * 0.4` → `critical` (`#f43f5e`); `minutes < avg * 0.85` → `attention` (`#f59e0b`); `>= avg * 0.85` → `balanced` (`#10b981`).
- Score real determinístico (`0` quando `totalMinutes === 0`; combinação de cobertura de matérias e coeficiente de uniformidade quando `> 0`).
- `buildMonthlyEntriesForCharts` mesclando entradas sem duplicar para alimentar `StudyColumnCharts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/utils/studyBalance.ts test/study_balance_real.test.ts
git commit -m "feat(balance): add real monthly per-user study balance calculation"
```

---

### Task 2: Notion Paginado (`Mês 1`..`Mês 10`), Sem Dados Fictícios e Pendências Até Hoje (`notionBackend.ts` + `server.ts`)

**Files:**
- Modify: `notionBackend.ts`
- Modify: `server.ts` (`/api/notion/checkin`, `/api/ai/study-analysis`)
- Modify: `src/services/notionService.ts`
- Modify: `src/components/NotionAgendaTab.tsx` (manter `Record<RevisionCycleKey, string>` compatível)
- Modify: `src/components/NotionCalendar.tsx` (manter `Record<RevisionCycleKey, string>` compatível)
- Test: `test/study_balance_real.test.ts` (adicionar testes de paginação, remoção de seed fake, agrupamento por matéria até hoje e check-in `mes5`)

**Interfaces:**
- Produces in `notionBackend.ts`:
  - `BackendNotionRevisionItem` com `mes4..mes10: boolean`
  - `export function getNextPendingNotionCycle(item: BackendNotionRevisionItem): RevisionCycleKey | null`
  - `export function summarizeOverdueNotionRevisions(items: BackendNotionRevisionItem[], todayStr?: string): NotionOverdueSummary`
  - `fetchRevisoesFromNotion()` paginando `next_cursor` (sem `DEFAULT_SEED_ITEMS` e sem `notion-seed.json`; erro retorna `items` do cache real se existir de sync anterior ou `[]` + `error: 'NOTION_UNAVAILABLE'`)
  - `updateCheckinInNotion(pageId, cycleKey, checkedValue)` aceitando `semana` e `mes1..mes10`, lendo a página retornada pelo `PATCH` da API do Notion via `parseNotionPage()` (pegando a nova `Próxima Revisão` recalculada pelo Notion) e retornando erro real se Notion não configurado/falhar.

- [ ] **Step 1: Write failing tests in `test/study_balance_real.test.ts`**

Adicionar testes para:
1. `fetchRevisoesFromNotion()` quando `!isConfigured` retorna `items: []` (zero itens fictícios/seed).
2. `fetchRevisoesFromNotion()` segue `has_more` + `next_cursor` e parseia `Mês 4`..`Mês 10`.
3. `summarizeOverdueNotionRevisions(items, '2026-11-17')` conta apenas itens com `proximaRevisao <= '2026-11-17'` e com ciclo pendente, ordenando da matéria com mais pendências (ex.: Biologia) para a menor e indicando qual ciclo está pendente (`mes5` -> `"Mês 5"`).
4. `updateCheckinInNotion` aceita `'mes5'` e devolve a nova `proximaRevisao` retornada pelo mock do `PATCH` da Notion API.

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement updates in `notionBackend.ts`, `server.ts`, `src/services/notionService.ts`, `NotionAgendaTab.tsx`, `NotionCalendar.tsx`**

- Remover `DEFAULT_SEED_ITEMS` e `NOTION_SEED_FILE` de `notionBackend.ts`.
- Paginar `query` do Notion (`next_cursor`, até 20 páginas), parseando `Semana` e `Mês 1`..`Mês 10` e `Próxima Revisão`.
- Atualizar `validKeys` de `/api/notion/checkin` em `server.ts` para aceitar `semana`, `mes1`..`mes10`.
- Atualizar `/api/ai/study-analysis` em `server.ts` para:
  - Verificar `verifyTerminalSession(token)?.canAccessNotion` no servidor; se `true` e Notion configurado, chamar `fetchRevisoesFromNotion()` + `summarizeOverdueNotionRevisions()` para incluir no prompt do Gemini e no fallback apenas quando Admin.
  - Remover matérias e horas inventadas do fallback server-side quando `subjectsStudied` estiver vazio (retornando `hours: 0`, `equilibriumScore: 0` e plano real baseado apenas nas `allSubjects` do usuário sem fabricar horas passadas).
- Atualizar `cycleLabelMap` em `NotionAgendaTab.tsx`, `NotionCalendar.tsx` e `src/services/notionService.ts` para incluir `mes4`..`mes10`.

- [ ] **Step 4: Run tests to verify `study_balance_real`, `notion_error_sanitization`, `security_hardening`**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts test/notion_error_sanitization.test.ts test/security_hardening.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add notionBackend.ts server.ts src/services/notionService.ts src/components/NotionAgendaTab.tsx src/components/NotionCalendar.tsx test/study_balance_real.test.ts
git commit -m "feat(notion): paginate real revisions mes1-mes10, remove fake seeds, and isolate admin overdue summary"
```

---

### Task 3: `aiService.ts` Sem Dados Inventados + Integração Mensal em `App.tsx`

**Files:**
- Modify: `src/services/aiService.ts`
- Modify: `src/App.tsx`
- Test: `test/study_balance_real.test.ts`

**Interfaces:**
- Consumes: `buildMonthlyStudySummary`, `MonthlyStudySessionDay`, `MonthlyStudySummary`
- Produces in `src/services/aiService.ts`:
  - `fetchAIStudyAnalysis(summary: MonthlyStudySummary): Promise<{ source: string; data: AIAnalysisResult }>` (sem fallback hardcoded de `Física/Química/Matemática` ou `equilibriumScore: 80`!)

- [ ] **Step 1: Write failing test in `test/study_balance_real.test.ts`**

Testar que quando `fetchAIStudyAnalysis(zeroSummary)` cai no fallback local (sem API disponível), ele devolve `equilibriumScore === 0`, `topStudiedSubject.hours === 0` e nenhuma matéria inventada fora de `zeroSummary.allSubjects`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts`
Expected: FAIL (atualmente devolve `equilibriumScore: 80` e `Física`).

- [ ] **Step 3: Update `src/services/aiService.ts` and `src/App.tsx`**

- Em `src/services/aiService.ts`, substituir o fallback hardcoded por cálculo determinístico sobre o `MonthlyStudySummary` real (`0` quando vazio, sem fabricar horas).
- Em `src/App.tsx`:
  - Buscar `/api/study-sessions/range?startDate=${monthStart}&endDate=${todayStr}` quando autenticado (e atualizar quando sessões/células mudarem) armazenando `monthlySessionDays`.
  - Calcular `monthlySummary = buildMonthlyStudySummary(subjects, currentCycle, cyclesHistory, monthlySessionDays)`.
  - Passar `monthlyBalanceBySubject={monthlySummary.bySubject}` para `HorizontalWeeklyTable`.
  - Passar `monthlySummary`, `monthlySessionDays` e `canAccessNotion` para `AIBalanceTab`.
  - Quando `canAccessNotion` for `false`, nunca renderizar nem consultar revisões do Notion.

- [ ] **Step 4: Run tests & typecheck**

Run: `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts; npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/aiService.ts src/App.tsx test/study_balance_real.test.ts
git commit -m "feat(ai): wire real monthly user study data and remove hardcoded client fallback"
```

---

### Task 4: Cores Sutis no Cronograma (`HorizontalWeeklyTable.tsx`) + Redesign Moderno de `StudyColumnCharts.tsx` e `AIBalanceTab.tsx` com Revisões Expansíveis do Notion (Admin)

**Files:**
- Modify: `src/components/HorizontalWeeklyTable.tsx`
- Modify: `src/components/StudyColumnCharts.tsx`
- Modify: `src/components/AIBalanceTab.tsx`
- Modify: `src/utils/studyChartUtils.ts` (suporte opcional a `monthlyEntries` reais já deduplicadas)

- [ ] **Step 1: Atualizar `HorizontalWeeklyTable.tsx` (Opção 1 — cores sutis vermelho → âmbar → verde)**

- Receber `monthlyBalanceBySubject?: Record<string, SubjectMonthlyBalance>`.
- Na coluna fixa da matéria:
  - Faixa vertical lateral usando `balance.accentColor` (vermelho `rose-500` para menor estudo no mês, âmbar `amber-400` para intermediário, verde `emerald-500` para maior estudo, ou `subject.color` quando tudo for `0h`).
  - Pílula discreta de equilíbrio + tempo mensal real (`Xh Ym/mês` ou `Sem estudo no mês` apenas quando há outras matérias ativas) e barra de progresso da linha usando a mesma cor harmônica.

- [ ] **Step 2: Atualizar `StudyColumnCharts.tsx` (Toggle Barras / Pizza + Mês real)**

- Aceitar `monthlySessionDays` / `monthlyEntries` reais para que o modo `Mensalmente` (definido como padrão) reflita exatamente os mesmos dados reais do banco (`study_sessions` + cronograma sem dupla contagem).
- Adicionar toggle segmentado **`Barras | Pizza`** no cabeçalho do gráfico, renderizando `PieChart` (estilo rosca moderna `innerRadius` + `outerRadius` + `paddingAngle` com legenda clara e tooltip com horas, minutos e `%`) usando `recharts` já instalado.

- [ ] **Step 3: Modernizar `AIBalanceTab.tsx` e adicionar Painel Expansível de Revisões do Notion (somente Admin)**

- Visual moderno e polido mantendo o mesmo tema do site (dark `#0B0F17`/`#111218` e light `white`/`slate-50`):
  - Faixa de 4 KPIs reais no topo (`Total no Mês`, `Matérias Ativas`, `Líder do Mês` com `0h` honesto sem `Math.max(1, ...)`, e `Índice de Equilíbrio` `0..100` sem `?? 75`).
  - Cards modernos com `tabular-nums`, hierarquia clara e estado vazio honesto quando `totalMinutes === 0`.
  - **Somente quando `canAccessNotion === true`**: novo card **"Revisões Pendentes no Notion (até hoje)"**:
    - Carrega `/api/notion/revisoes` e agrupa itens com `proximaRevisao <= hoje` por matéria, ordenados pelas que têm mais acúmulo (ex.: `Biologia` no topo com badge de quantidade atrasada).
    - Cada matéria é um acordeão expansível; ao clicar e expandir, lista os tópicos pendentes, data prevista (`DD/MM`, destacando atrasos anteriores a hoje), etapa pendente (ex.: `Mês 5`) e um botão **"Marcar como revisado • Avançar para Mês 6"** (ou próximo ciclo) que chama `checkinRevision(item.id, pendingKey, true)`, atualiza o estado com a nova `proximaRevisao` retornada pelo Notion (ex.: `16/12`), remove da fila de atrasados se a nova data já for futura e exibe toast de confirmação.
    - Se `canAccessNotion === false`, esse card não é renderizado nem buscado.

- [ ] **Step 4: Verificação completa**

Run:
- `npm run typecheck`
- `npm run build`
- `npm test`
- `node node_modules/tsx/dist/cli.mjs --test test/study_balance_real.test.ts`
Expected: Todos `exit=0`, zero avisos no build, zero dados inventados.

- [ ] **Step 5: Commit e Push**

```bash
git add src/components/HorizontalWeeklyTable.tsx src/components/StudyColumnCharts.tsx src/components/AIBalanceTab.tsx src/utils/studyChartUtils.ts
git commit -m "feat(ui): modernize AI balance tab with bar/pie toggle, schedule colors, and admin Notion check-ins"
git push origin main
```

---

## Self-Review Checklist

1. **Spec coverage**:
   - Mês inteiro real (`study_sessions` + cronograma sem duplicação) → Tasks 1 & 3.
   - Zero dados inventados (`DEFAULT_SEED_ITEMS`, fallbacks falsos, `Math.max(1, ...)`, `?? 75`) → Tasks 1, 2 & 3.
   - Cores sutis no cronograma (vermelho → verde) → Tasks 1 & 4.
   - Modernização da aba IA de Equilíbrio + gráfico Barras/Pizza → Task 4.
   - Notion paginado `Semana` + `Mês 1..10`, exclusivo do Admin, mostrando matérias com revisões atrasadas até hoje, expansível com botão para marcar revisado e avançar o mês direto no Notion → Tasks 2 & 4.
2. **Type consistency**: `RevisionCycleKey`, `NotionRevisionItem`, `MonthlyStudySessionDay`, `SubjectMonthlyBalance`, `MonthlyStudySummary`, `buildMonthlyStudySummary`, `summarizeOverdueNotionRevisions` alinhados entre todas as tasks.
3. **Review Focus coverage**: Todos os 5 modos de falha têm testes ou guardas explícitos.
