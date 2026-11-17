# Design Spec: IA de Equilíbrio Mensal Real, Cores no Cronograma e Revisões do Notion (Admin)

**Data:** 2026-11-17
**Escopo:** Melhoria da aba **IA de Equilíbrio** (`AIBalanceTab` + `StudyColumnCharts`), indicador visual de equilíbrio no **Cronograma Semanal** (`HorizontalWeeklyTable`), agregação mensal real por usuário e integração paginada com **Notion** exclusiva do Administrador.

---

## 1. Intenção e Porquê

Hoje a aba de Equilíbrio analisa apenas os cards marcados na semana atual do cronograma e mistura fallbacks fictícios (`DEFAULT_SEED_ITEMS`, matérias/horas fixas em `aiService.ts`, `Math.max(1, ...)` e pontuação padrão `75`/`80`). Além disso, a tabela semanal do cronograma não reflete visualmente quais matérias estão ficando para trás ao longo do mês.

O objetivo é:
1. Tornar a **IA de Equilíbrio** baseada em **100% de dados reais e individualizados** do usuário no **mês inteiro** (1º dia do mês até hoje).
2. Aplicar um **indicador visual discreto e elegante (vermelho → verde)** por matéria diretamente no cronograma semanal, refletindo o equilíbrio real do mês sem poluir a interface.
3. Exibir na aba **IA de Equilíbrio** — **exclusivamente para a conta Admin (`canAccessNotion`)** — um painel moderno com as **revisões pendentes/atrasadas até hoje** vindas da base `📕 Revisões` do Notion, sem que nenhuma outra conta tenha acesso ou visualize dados do Notion.
4. Modernizar o visual apenas dessa aba (`AIBalanceTab` + `StudyColumnCharts`), incluindo alternância entre **Gráfico de Barras** e **Gráfico de Pizza (Rosca)**.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
- **Zero dados inventados ou aleatórios**: se o usuário estudou `0h` no mês ou se o Notion não estiver configurado/acessível, exibir `0h` / estado vazio honesto.
- **Individualização estrita**: cada concurseiro vê apenas suas próprias horas reais (`study_sessions` + cronograma mensal do próprio usuário).
- **Notion exclusivo do Admin**: manter o bloqueio `403 NOTION_FORBIDDEN` em `/api/notion/*` e nunca renderizar ou consultar revisões do Notion para usuários não-admin.
- **Suporte completo ao schema real do Notion**: paginar todas as páginas (`has_more`/`next_cursor`), ler `Semana` + `Mês 1` a `Mês 10` e `Próxima Revisão` (`formula.date.start` ou `date.start`), agrupando pendências vencidas até hoje (`<= hoje` em `America/Sao_Paulo`) por matéria.

### Não-Objetivos / Anti-Objetivos
- Não alterar outras abas do site fora de `HorizontalWeeklyTable`, `AIBalanceTab` e `StudyColumnCharts`.
- Não pintar linhas inteiras do cronograma com fundos berrantes que briguem com os cards `Estudado` (azul) e `Revisando` (verde).
- Não criar novos pacotes de gráficos: reutilizar `recharts` e `lucide-react` já instalados.

---

## 3. Abordagem Escolhida (Aprovada)

### 3.1 Agregação Mensal Real por Usuário (`src/utils/studyBalance.ts`)
- **Período**: do dia `01` do mês atual até a data atual (`America/Sao_Paulo`).
- **Fontes reais combinadas sem dupla contagem**:
  - Para cada dia e matéria no mês atual:
    1. Se houver registro em `/api/study-sessions/range` (cronômetro / sessões registradas no banco para aquele `userId`) com `durationSeconds > 0`, essa é a fonte autoritativa para aquele `(subjectId, dateStr)`.
    2. Caso contrário, se houver célula `completed` no `currentCycle` ou em `cyclesHistory` para aquele `(subjectId, dateStr)`, soma `entry.durationMinutes || 0` e conta `1` sessão real (sem inventar minutos caso `durationMinutes` seja `0`).
- **Métrica de equilíbrio (`0..100`)**:
  - Se `totalMinutes === 0`, o score real é **`0`** (nunca `75` ou `80`).
  - Quando há estudo real, o score combina cobertura de matérias ativas no mês e uniformidade da distribuição entre elas (penalizando concentração excessiva em poucas matérias).

### 3.2 Cores Sutis de Equilíbrio no Cronograma (`HorizontalWeeklyTable.tsx`)
- **Cálculo relativo do mês**: compara os minutos reais de cada matéria no mês com a média das matérias da grade.
- **Estado neutro**: quando nenhuma matéria tem minutos registrados no mês (`maxMinutes === 0`), mantém a cor padrão original (`subject.color`) para não deixar a tela inteira vermelha no início do mês.
- **Escala visual (Opção 1 — discreta e legível em Dark e Light)**:
  - **Crítico (`rose-500`)**: `0` minutos quando já há estudo em outras matérias, ou `< 40%` da média mensal.
  - **Atenção (`amber-400` / `amber-500`)**: entre `40%` e `84%` da média mensal.
  - **Equilibrado / Forte (`emerald-500`)**: `>= 85%` da média mensal.
- **Onde aparece**: na faixa vertical lateral da matéria, na barra de progresso e numa pílula discreta abaixo/ao lado do nome mostrando o tempo real do mês (ex.: `2h 30m/mês`), mantendo o fundo da tabela limpo.

### 3.3 Notion Paginado + Pendências até Hoje (Admin-Only)
- **`notionBackend.ts` e `/api/notion/checkin`**:
  - Remover `DEFAULT_SEED_ITEMS` e `NOTION_SEED_FILE`. Sem configuração ou em falha da API, retornar `{ items: [], source: 'unavailable', error }` sem fabricar registros.
  - Implementar paginação completa (`start_cursor`) no `POST /v1/databases/${databaseId}/query` até `has_more === false` (com teto defensivo de páginas).
  - Ler e suportar atualização de **todos** os checkboxes reais: `Semana`, `Mês 1` ... `Mês 10` (`semana`, `mes1`..`mes10`), além de `Assunto`, `Matéria`, `Data` e `Próxima Revisão`.
  - No `PATCH /api/notion/checkin`, ao marcar a etapa pendente via `PATCH https://api.notion.com/v1/pages/${pageId}`, ler a própria resposta da API do Notion com `parseNotionPage()` para obter a nova `Próxima Revisão` recalculada pela fórmula do Notion (ex.: de `16/11` para `16/12`), retornando erro explícito se a API falhar.
- **Cálculo de revisões pendentes até hoje (`<= todayStr`)**:
  - Considera pendente toda linha com `proximaRevisao` válida `<= todayStr` (em `America/Sao_Paulo`) cujo próximo ciclo (`Semana` ou `Mês 1..10`) ainda não foi marcado.
  - Agrupa por `Matéria`, ordenando da matéria com **mais revisões acumuladas/atrasadas até hoje** para a menor (ex.: `Biologia` no topo com contagem exata e lista expansível de assuntos).
- **Painel expansível com check-in direto no site (Admin-Only)**:
  - Dentro da aba `IA de Equilíbrio` (somente se `canAccessNotion === true`), cada matéria pode ser clicada para **expandir** os assuntos atrasados/pendentes até hoje.
  - Cada item expandido mostra o assunto, a data marcada (`Próxima Revisão`), a etapa pendente atual (ex.: `Mês 5`) e um botão para clicar ali mesmo (**"Marcar revisado • avançar ciclo"**) que envia o check-in real para o Notion, recebe a nova data recalculada pelo Notion (ex.: `16/12`) e atualiza imediatamente a contagem e a lista na tela.
- **Segurança**:
  - Mantida proteção server-side em `app.use('/api/notion', ...)` (`403` para não-admin).
  - No frontend (`App.tsx` e `AIBalanceTab.tsx`), o fetch para `/api/notion/revisoes` e a renderização do painel só ocorrem quando `canAccessNotion === true`.

### 3.4 Modernização da Aba `IA de Equilíbrio` (`AIBalanceTab.tsx` + `StudyColumnCharts.tsx`)
- **Mesmo estilo do site, visual elevado**: manter a paleta base (`#0B0F17`, `#111218`, `#0056D2`, superfícies limpas em dark e light mode), melhorando espaçamento em grade 8pt, tipografia numérica tabular (`tabular-nums`), cards com contraste WCAG AA e estado vazio honesto.
- **Cabeçalho e KPIs reais do mês**: Total Real no Mês, Matérias Ativas, Matéria Líder (mostrando `0h` quando zero) e Termômetro de Equilíbrio (`0–100`).
- **Gráfico com alternância Barras / Pizza (Rosca)**:
  - Toggle segmentado `[ Barras | Pizza ]` no `StudyColumnCharts.tsx`, mantendo os filtros de período (`Diário`, `Semanal`, `Mensal` — padrão `Mensal` ao abrir pela nova lógica, e `Total`) e usando `PieChart` / `Pie` / `Cell` do `recharts` com legenda clara e tooltip preciso.
  - Alimentar o `StudyColumnCharts` também com as sessões mensais consolidadas de `study_sessions`, garantindo coerência entre gráfico, cards da IA e cores do cronograma.
- **Painel exclusivo Admin — Revisões Pendentes até Hoje (Notion)**:
  - Exibido dentro da aba `IA de Equilíbrio` apenas quando `canAccessNotion === true`.
  - Lista matérias com revisões acumuladas até a data atual, badge de quantidade em atraso/hoje, e assuntos pendentes com link direto para o Notion quando disponível.
- **Backend `/api/ai/study-analysis` e `aiService.ts`**:
  - Receber o resumo **mensal real** (`monthlySummary`) e, somente quando a sessão tiver `canAccessNotion`, anexar no servidor (lendo direto do backend, nunca confiando em dados do cliente para Notion!) as pendências reais por matéria até hoje para o prompt da IA.
  - Fallback determinístico sem dados fictícios: se o Gemini falhar ou não houver `GEMINI_API_KEY`, calcular prioridades e plano exclusivamente a partir das matérias reais do usuário e dos seus minutos reais no mês (`0h` se nada estudado).

---

## 4. Plano de Verificação

- **Testes unitários e de integração**:
  - `test/study_balance_real.test.ts`: validar agregação mensal sem dupla contagem (`study_sessions` vs `cyclesHistory`), score `0` para usuário zerado, cálculo de faixas `red`/`amber`/`green` (incluindo estado neutro quando tudo é `0`), e contagem de revisões atrasadas até hoje (`<= today`) com paginação Notion simulada e sem `DEFAULT_SEED_ITEMS`.
  - Verificar isolamento de segurança: usuário não-admin recebe `403` em `/api/notion/*` e `/api/ai/study-analysis` não vaza dados do Notion do admin para outras contas.
- **Checks obrigatórios**: `npm run typecheck`, `npm run build` e `npm test` (`readiness-suite.mjs`), além de inspeção visual/E2E da aba se aplicável.
