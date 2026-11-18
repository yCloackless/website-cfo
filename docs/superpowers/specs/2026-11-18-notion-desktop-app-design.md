# Design Spec: App Desktop Notion + IA de Equilíbrio e Vínculo Automático com o Site

**Data:** 2026-11-18  
**Escopo:** Criação de um aplicativo desktop Windows independente (Tauri 2 + React + backend Rust) em pasta dedicada (`C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio`) com todas as funcionalidades da Agenda Notion e da IA de Equilíbrio adaptada para Notion, além de API de sincronização em tempo real no site (`cronograma-de-estudos-cfo-cbmerj`) para atualização automática bidirecional.

---

## 1. Intenção e Porquê

Com a migração do banco de dados do site para o Supabase em andamento, o usuário precisa de um programa pessoal autônomo no Windows para gerenciar suas revisões no Notion e acompanhar seu equilíbrio de estudos com IA sem depender do site estar no ar ou com o banco populado — mantendo, ao mesmo tempo, o site atualizado automaticamente via API sempre que algo mudar no programa (e refletindo no programa o que mudar no site).

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
- **Programa desktop independente (`agenda-notion-equilibrio`)**: executável nativo Windows (`.exe` / instalador via Tauri 2) que funciona sozinho, abre com um clique e mantém cache local em JSON para leitura instantânea e tolerância offline.
- **Paridade completa com a Agenda Notion do site**:
  - Visão **Calendário** (Semanal e Mensal) com marcação de revisões, modal de detalhes, cores customizáveis por matéria/item e criação rápida por data.
  - Visão **Tabela** com busca, filtro por matéria, filtros (`Apenas Revisar`, `Hoje & Atrasadas`, `Todas`, `Concluídas`), check-in direto nos 11 ciclos (`Semana`, `Mês 1` .. `Mês 10`) e modal de **Novo Estudo**.
- **IA de Equilíbrio completa (idêntica ao site, alimentada pelo site + Notion + Gemini local)**:
  - Painel expansível **Revisões Pendentes até Hoje** agrupado por matéria (ordenadas por acúmulo/atraso), com botão **Marcar revisado**, além de menu de ações (**Renomear**, **Duplicar**, **Excluir/Arquivar** e link externo para a página no Notion).
  - Puxa do site (`GET /api/notion/desktop/study-balance`) as matérias reais, ciclos semanais e sessões mensais (`study_sessions`) do usuário autorizado, calculando os mesmos 4 KPIs (`Total no Mês`, `Matérias Ativas`, `Líder do Mês`, `Índice de Equilíbrio 0–100`) e gráficos interativos **Barras / Pizza** (`StudyColumnCharts` com filtros Diário/Semanal/Mensal/Total). Mantém cache local (`study-balance-cache.json`) para funcionar offline mesmo se o site/Supabase estiver indisponível ou vazio (`0h` honesto).
  - Diagnóstico Pedagógico, Matérias Prioritárias e Plano Tático de 7 dias gerados via **Gemini API** no backend Rust usando o resumo mensal real + pendências do Notion até hoje (mesmo schema de `AIBalanceTab.tsx`), com fallback determinístico local (`buildDeterministicStudyAnalysis`) quando offline ou sem chave.
- **Chaves configuráveis localmente com segurança**: suporte a `.env` local (em dev, ignorado pelo Git) e tela **Configurações** no app para salvar `NOTION_API_KEY`, `NOTION_DATABASE_ID`, `GEMINI_API_KEY`, `SITE_API_URL` e `SITE_DESKTOP_API_KEY` em arquivo de configuração local no diretório de dados do usuário (AppData), nunca embutidas no frontend JS nem versionadas no Git.
- **Vínculo automático com o site**:
  - Qualquer mutação no app desktop (check-in, novo estudo, renomear, duplicar, excluir) atualiza o Notion diretamente e notifica a API do site (`POST /api/notion/desktop/sync`), que atualiza imediatamente o cache do servidor e transmite evento via SSE (`/api/notion/events`) para atualizar automaticamente as abas abertas do Admin no navegador sem F5.
  - Se o site estiver temporariamente indisponível, o app desktop enfileira o evento de sincronização localmente e reenvia quando a conexão voltar.

### Não-Objetivos / Anti-Objetivos
- Não depender do PostgreSQL/Supabase nem exigir login de usuário no app desktop (é um aplicativo pessoal local).
- Não copiar secrets de `.env` de outro repositório para o código ou Git.
- Não migrar outras abas do site (Anki, Simulados, Banco de Provas, Caderno de Erros, Admin Dashboard) para o app desktop.
- Não expor rotas Notion ou eventos SSE para usuários não-admin no site (manter bloqueio estrito `canAccessNotion`).

---

## 3. Abordagens Consideradas e Escolha

1. **Tauri 2 + React + Backend Rust nativo (Escolhida)** — mesmo padrão do projeto `cronometro-cfo`. Gera `.exe` nativo Windows, isola chaves e chamadas HTTP (Notion, Gemini e API do site) no processo Rust fora do frontend webview e mantém cache/fila locais.
2. **Tauri 2 com sidecar Node/Express** — evitaria portar `notionBackend.ts` para Rust, mas aumenta tamanho do instalador e complexidade de coordenação entre dois processos. Rejeitada pelo usuário em favor da opção 1.
3. **Web App local Node + Vite com atalho `--app`** — rápida de montar em TypeScript puro, porém não gera `.exe` independente. Rejeitada pelo usuário.

---

## 4. Arquitetura e Componentes

### 4.1 Novo Projeto Desktop (`C:\Users\renas\Desktop\PROJETOS\agenda-notion-equilibrio`)

#### Estrutura de Pastas
- `src-tauri/`:
  - `Cargo.toml`: `tauri = "2"`, `tauri-plugin-opener`, `serde`, `serde_json`, `reqwest` (rustls-tls), `tokio`, `dotenvy`, `chrono`.
  - `tauri.conf.json`: janela principal confortável para agenda/gráficos (ex.: `1280x820`, redimensionável, mínimo `960x640`, título `Agenda Notion & IA Equilíbrio`), bundle Windows ativo.
  - `src/lib.rs`: instância única no Windows (padrão `cronometro-cfo`), registro dos comandos Tauri e gerenciamento de estado.
  - `src/config.rs`: leitura/escrita de configurações locais em `app_data_dir/config.json` com fallback para variáveis de ambiente (`.env` local apenas em dev). Nunca expõe os valores brutos das chaves no frontend além de flags `hasNotionKey`, `hasGeminiKey`, `hasSiteKey` (e máscaras parciais opcionais para conferência).
  - `src/notion.rs`: cliente HTTP direto para `https://api.notion.com/v1` (`Notion-Version: 2022-06-28`) com:
    - Paginação completa por `start_cursor` até `has_more === false` (teto defensivo de 20 páginas).
    - Parser tolerante de propriedades (`Assunto`/`Name`/`Título`/`Nome`, `Matéria`/`Materia`/`Disciplina`, `Data`/`Date`/`Data do Estudo`, `Tipo de Revisão`/`Tipo`, `Próxima Revisão` lida diretamente de `date.start` ou `formula.date.start` retornados pela API do Notion — sem recalcular fórmula localmente em Rust, mantendo a mesma fonte autoritativa de `notionBackend.ts`, checkboxes `Semana` e `Mês 1`..`Mês 10`).
    - Operações (exigem conexão com a API do Notion; em modo offline o cache JSON permite leitura e consulta, enquanto escritas retornam erro claro sem gerar IDs temporários conflitantes — decisão de arquitetura): `fetch_revisoes`, `checkin_revision`, `create_study`, `rename_study`, `duplicate_study`, `delete_study` (arquiva página no Notion).
    - Persistência em `app_data_dir/notion-revisoes-cache.json`.
  - `src/ai.rs`: cliente Gemini (`generativelanguage.googleapis.com`, fallback entre modelos `gemini-2.5-flash` → `gemini-2.0-flash` → fallback determinístico local) recebendo o resumo mensal real (`MonthlyStudySummary` puxado do site/cache) + resumo das revisões pendentes/atrasadas até hoje do Notion.
  - `src/site_sync.rs`: cliente HTTP autenticado por Bearer (`SITE_DESKTOP_API_KEY`) para conversar com o site (`SITE_API_URL`):
    - Puxa as horas reais e matérias do mês (`GET /api/notion/desktop/study-balance?startDate=...&endDate=...`) e grava cache em `app_data_dir/study-balance-cache.json`, mantendo a aba `IA de Equilíbrio` idêntica à do site mesmo offline.
    - Envia notificações de atualização (`POST /api/notion/desktop/sync`) logo após cada mutação bem-sucedida no Notion (em background/non-blocking para a UI continuar rápida). Em tempo real envia `{ action: 'upsert' | 'delete', item?, pageId? }` com `updatedAt`; se o site estiver offline, enfileira em `app_data_dir/pending-site-sync.json` um pedido de `{ action: 'refresh' }` (decisão de arquitetura para evitar sobrescrever dados mais recentes com snapshots antigos durante reconexão).
    - Permite puxar o snapshot/revisões via site (`GET /api/notion/desktop/revisoes`) caso o Notion não responda ou para conferência de sincronização.
- `src/` (Frontend React 19 + TypeScript + Vite + Tailwind + Recharts + Lucide):
  - `App.tsx`: shell com barra superior limpa (abas `IA de Equilíbrio` | `Agenda Notion`, indicador de status Notion + status de vínculo com o Site + botão de Tema Dark/Light + botão `Configurações` + atalho rápido para sincronizar).
  - `components/AIBalanceTab.tsx` + `components/StudyColumnCharts.tsx` (portados do site com `src/utils/studyBalance.ts` e `src/utils/studyChartUtils.ts`):
    - 4 KPIs reais do mês: `Total no Mês`, `Matérias Ativas`, `Líder do Mês` e `Índice de Equilíbrio (0–100)`.
    - Painel expansível **Revisões Pendentes até Hoje** (paridade total com `AIBalanceTab.tsx`: expandir matéria, ver atrasadas/hoje, botão `Marcar revisado`, menu `...` com Renomear inline, Duplicar, Excluir com confirmação e link externo para o Notion).
    - Gráficos interativos **Barras / Pizza (Rosca)** usando `recharts` com filtros `Diário`, `Semanal`, `Mensal` e `Total`.
    - Cards de Diagnóstico Pedagógico da IA (Gemini), Matérias Prioritárias e Plano Tático de 7 dias.
  - `components/NotionAgendaTab.tsx` + `components/NotionCalendar.tsx`: portados do site trocando chamadas `/api/notion/*` pela camada `services/desktopNotionApi.ts` (que chama `invoke(...)` do Tauri).
  - `components/SettingsModal.tsx`: formulário local para configurar/testar Notion (`NOTION_API_KEY`, `NOTION_DATABASE_ID`), Gemini (`GEMINI_API_KEY`) e Vínculo com o Site (`SITE_API_URL`, `SITE_DESKTOP_API_KEY`), exibindo apenas status (`Configurada` / `Não configurada`) para chaves já salvas e permitindo atualizar quando necessário.
  - Sincronização automática: polling leve configurável / revalidação ao focar a janela (`window` `focus`) para manter o app alinhado se houver alteração feita diretamente no site ou no Notion.

### 4.2 Vínculo Automático no Site (`cronograma-de-estudos-cfo-cbmerj`)

#### Segurança e Autenticação
- **Desktop → Site (`/api/notion/desktop/*`)**:
  - Nova função `desktopNotionAuthorized(req)` em `server.ts` seguindo o mesmo padrão de `desktopAuthorizedUser` (linhas 2257–2280): compara Bearer token via `crypto.timingSafeEqual` contra `process.env.DESKTOP_NOTION_API_KEY || process.env.DESKTOP_TIMER_API_KEY` e verifica se `DESKTOP_TIMER_USER_ID` pertence a uma conta existente com permissão Notion (`role === 'admin' || canAccessNotion === true`).
  - Mantém o bloqueio `403 NOTION_FORBIDDEN` nas rotas de navegador `/api/notion/*` para qualquer sessão não-admin.
- **Site → Navegador Admin (`/api/notion/events`)**:
  - Endpoint SSE (`Content-Type: text/event-stream`) protegido pelo middleware `/api/notion` (exige sessão web válida com `canAccessNotion === true`).

#### Fluxo de Dados e Cache (`notionBackend.ts` + `server.ts`)
- Em `notionBackend.ts`:
  - Adicionar `upsertCachedRevisionItem(item)` / `removeCachedRevisionItem(pageId)` / `replaceCachedRevisoes(items)` para atualizar `memoryCache` + `lastFetchTime = Date.now()` + `data/notion-revisoes-cache.json` imediatamente quando o app desktop sincronizar uma mudança (ou forçar `fetchRevisoesFromNotion(forceRefresh)`).
  - Adicionar barramento simples de eventos (`EventEmitter` ou lista de listeners) disparado em qualquer mutação Notion (vinda de `/api/notion/checkin`, `/novo-estudo`, `PATCH/POST/DELETE /estudo/:pageId` ou `POST /api/notion/desktop/sync`).
- Em `server.ts`:
  - `GET /api/notion/desktop/revisoes`: retorna `{ success, items, source, updatedAt }` para o app desktop consultar ou reconciliar estado.
  - `GET /api/notion/desktop/study-balance`: aceita `startDate` e `endDate` (`YYYY-MM-DD`) e retorna `{ success, subjects, currentCycle, cyclesHistory, monthlySessionDays }` do usuário autorizado (`DESKTOP_TIMER_USER_ID`), reaproveitando `studySessionRepoInstance.getDailySummaryBetweenDates` e `userStateRepoInstance.get`.
  - `POST /api/notion/desktop/sync`: aceita payload validado `{ action: 'upsert' | 'delete' | 'refresh', item?, pageId? }`. Para `upsert`/`delete`, valida formato básico de `pageId` e campos de `BackendNotionRevisionItem`, atualiza o cache local do site imediatamente e emite evento SSE `notion_updated`; para `refresh`, executa `fetchRevisoesFromNotion()` autoritativo no Notion e emite o evento SSE para todas as abas Admin conectadas.
  - `GET /api/notion/events`: mantém stream SSE com heartbeat de keep-alive (ex.: a cada 25s) e envia evento `{ type: 'notion_updated', action, pageId?, updatedAt }` imediatamente quando houver mudança.
- No frontend do site (`NotionAgendaTab.tsx` e `AIBalanceTab.tsx`):
  - Assinar `/api/notion/events` (somente quando `canAccessNotion === true`) via `EventSource` / `fetch` streaming com reconexão automática, e ao receber `notion_updated`, atualizar o estado local imediatamente via `fetchNotionRevisoes()` sem exigir F5 do usuário.

---

## 5. Decisões Deixadas para Implementação

- Detalhes de layout exatos dos ícones/assets do bundle Tauri (reaproveitar ou adaptar ícones compatíveis com o padrão de `cronometro-cfo`).
- Intervalos exatos de backoff da fila offline de sync (`pending-site-sync.json`) e debounce de revalidação ao focar a janela.
- Nome interno dos structs/módulos auxiliares em Rust e hooks React no novo repositório.

---

## 6. Plano de Verificação

- **Site (`cronograma-de-estudos-cfo-cbmerj`)**:
  - Testes unitários/integração para: autenticação de `/api/notion/desktop/sync`, `/api/notion/desktop/revisoes` e `/api/notion/desktop/study-balance` (`401` sem token/token inválido, `403`/rejeição para usuário sem `canAccessNotion`), atualização imediata do cache via `sync`, emissão de evento SSE e isolamento de `/api/notion/events` (`403` para não-admin).
  - Rodar `npm run typecheck`, `npm run lint`, `npm test` (`readiness-suite.mjs`) e `npm run build`.
- **App Desktop (`agenda-notion-equilibrio`)**:
  - Testes unitários em Rust (`cargo test`) para o parser de propriedades do Notion (incluindo `Próxima Revisão` via `date` e `formula.date`), resumo de pendências até hoje, cache local e fila de sync.
  - Testes unitários em TypeScript (Vitest) para o motor de equilíbrio mensal (`studyBalance.ts` / `notionRevisions.ts`) e fallback determinístico da IA.
  - Rodar `npx tsc --noEmit`, `npm run build` e `cargo check` / `cargo tauri build` (verificando compilação completa do `.exe` no Windows).
