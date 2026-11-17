# Design Spec — Estabilização de Produção, Gamificação Militar, Radar/Banco de Provas e Simulados com IA

**Data:** 2026-11-17  
**Abordagem selecionada:** **Abordagem A — Reuso Enxuto com Autoridade no Backend**  
**Princípios:** `superpowers`, *Lazy Senior Dev* (`ponytail`), frontend não confiável / backend autoridade.

---

## 1. Intenção e Motivação

O sistema em produção (`CFO-OFICIAL-AGORASIM`) apresenta gargalos reais de payload e rate limit nos logs do Render (`PATCH /api/user/state` falhando com `413` em loop, `GET /api/user/profile` trafegando `3,25 MB` em `5,9s`, e rajadas `429` em `/api/ai/study-analysis`), além de arquivos locais não triados no workspace. Em paralelo, o candidato precisa de:
1. **Gamificação militar CBMERJ realista** ligada às horas reais de estudo (de 1h/dia até o teto de 12h/dia) e à constância diária (`foguinho` + `escudo de gelo` automático).
2. **Perfil mais limpo na sidebar** (sem `@username`, exibindo o foguinho ao lado do nome) e foguinho visível também no cronograma.
3. **Integração real entre Banco de Provas e Radar de Prioridades**, com cartão-resposta (visual + entrada rápida estilo chat + gabarito por foto/texto/clique) e análise de IA **estritamente sob demanda**.
4. **Análise de IA própria nos Simulados**, usando o mesmo cartão-resposta/gabarito para indicar matérias que exigem aprofundamento, revisão ou estudo inicial (*ver pela primeira vez*).

### Não-Objetivos & Anti-Objetivos
- **Não-objetivo:** processar automaticamente todas as questões de todo PDF no instante do upload (causaria lentidão e erros `429`).
- **Não-objetivo:** confiar no `localStorage` ou no frontend para calcular patente, consumir escudo de gelo ou validar limites de IA.
- **Anti-objetivo:** armazenar novos dados pesados (cartões-resposta, simulados, fotos de gabarito ou avatares em base64 bruto) dentro de `user_state_snapshots`.

---

## 2. Restrições Arquiteturais e de Segurança

1. **Frontend não confiável:** patentes, contagem de dias (`foguinho`), saldo/consumo de escudos de gelo, propriedade (`ownership`) de provas/simulados/cartões e cotas de IA são sempre calculados e validados no backend (`server.ts` + repositórios/serviços).
2. **Prevenção de `413` e bloat:** novos módulos persistem em tabelas relacionais dedicadas (PostgreSQL/SQLite via `src/db/database.ts`), nunca inflando `/api/user/state`.
3. **Sem segredos no cliente:** chamadas ao Gemini (`@google/genai`) para leitura de foto de gabarito, prova em PDF ou análise de simulado ocorrem exclusivamente no backend com `getGeminiClient()`.
4. **Portas de validação:** toda fase termina com `npx tsc --noEmit`, `npm run build` e `npm test` (`scripts/readiness-suite.mjs`), commit isolado da fase (incluindo atualização no cérebro se aplicável) e pausa antes de `git push` automático salvo pedido explícito.

---

## 3. Abordagens Consideradas

| Abordagem | Resumo | Trade-offs | Decisão |
| :--- | :--- | :--- | :--- |
| **A — Reuso Enxuto com Autoridade no Backend** | Corrige `remotePersistence` + avatar + debounce da IA; calcula patente/escudo no backend usando `study_sessions`; cria **1 componente compartilhado** de cartão-resposta/gabarito salvando em tabelas leves próprias e acionando Gemini sob demanda (`examService` / R2). | Requer 1 migração enxuta para gamificação e cartões-resposta/simulados; evita duplicação de UI, zera `413` e mantém autoridade no servidor. | **Escolhida** |
| **B — Estado em `user_state_snapshots` + IA pontual** | Mantém simulados, cartões e gamificação em JSON no `localStorage`/`PATCH /api/user/state`. | Menos SQL, porém agrava o estouro de 2 MiB (`413`) e torna patente/ofensiva manipuláveis no cliente. | Rejeitada |
| **C — Extração automática completa no upload do PDF** | Ao subir PDF no Banco de Provas, extrai todas as questões imediatamente via Gemini. | Lento e caro em cota Gemini, voltando a gerar `429` em provas grandes e violando o pedido de *"só quando eu pedir"*. | Rejeitada |

---

## 4. Especificação por Fases

### Fase 1 — Estabilização de Produção (Parte 1) & Higiene Local (Parte 2)

1. **Fim do loop `413` em `PATCH /api/user/state` ([remotePersistence.ts](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/services/remotePersistence.ts)):**
   - Em `putState()`, se `response.status === 413` (ou `400`/`422`), **não** re-enfileirar o payload rejeitado em `pendingValues`. Caso o lote combinado exceda um teto seguro (ex.: `1.5 MB`), enviar chaves válidas individualmente ou descartar a chave infratora com aviso no console.
   - Impedir que chaves sabidamente pesadas/transientes (ou acima de `512 KB` por chave no cliente) entrem em `collectState()` / `queuePersistentSync()`.
2. **Emagrecimento do `GET /api/user/profile` (~3,25 MB → poucos KB) ([server.ts](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/server.ts)):**
   - Adicionar endpoint cacheável `GET /api/user/avatar/:userId` (ou `/api/user/profile/avatar` autenticado) que serve os bytes binários da imagem com `Content-Type` real e `Cache-Control: private, max-age=86400, ETag`.
   - No `GET /api/user/profile` e payloads de login/listagem, retornar a URL curta `/api/user/avatar/:userId?v=<hash>` (quando houver `avatarUrl` `data:image/...` no banco) em vez do `data:image;base64` completo no JSON. Manter compatibilidade para URLs `http(s)` normais e comprimir/limitar novos uploads com segurança.
3. **Fim das rajadas `429` em `POST /api/ai/study-analysis` ([App.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/App.tsx)):**
   - Remover o disparo automático de `runAIAnalysis(false)` no `useEffect` de mudança de ciclo (`App.tsx:938-945`). No carregamento ou alteração do ciclo, atualizar imediatamente com o cálculo determinístico local (`buildMonthlyStudySummary` / heurística) já existente em [aiService.ts](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/services/aiService.ts) e acionar `/api/ai/study-analysis` somente quando o usuário clicar explicitamente em **Analisar / Atualizar com IA** (ou se houver clique manual com hash diferente).
4. **Validação dos arquivos locais da Parte 2:**
   - Auditar e incluir no commit da Fase 1 os arquivos locais validados (`index.html`, `src/main.tsx`, `src/index.css`, `LatexRenderer.tsx`, `MathResultCard.tsx`, `vite.config.ts`, `scripts/*`, `skills-lock.json`, `components/ui/*`, `.agent/`, `docs/superpowers/`, `.env.example`), pois `npx tsc --noEmit`, `npm run build` e `npm test` (61 suites) já passaram com eles.
   - **Decisão aplicada (`our call`):** remover/ignorar a pasta descompactada `public/cfo-extensao-cbmerj/` via `.gitignore` (preservando `public/cfo-extensao-cbmerj.zip` que `server.ts` já serve), evitando publicar código-fonte solto da extensão dentro de `dist/public/`.

---

### Fase 2 — Gamificação Militar CBMERJ, Foguinho, Escudo de Gelo e Perfil na Sidebar

1. **Fonte de verdade (`study_sessions`) & Fuso (`America/Sao_Paulo`):**
   - Toda marcação no cronograma semanal/mensal e toda sessão do cronômetro já grava em `study_sessions`.
   - **Regra de dia válido (padrão proposto):** um dia (`date_str`) conta para o **foguinho** quando soma ao menos **`1800` segundos (30 min)** estudados no dia.
2. **Ofensiva (`foguinho`) & Escudo de Gelo automático:**
   - Nova tabela `user_gamification_state` (`user_id PK`, `current_streak`, `best_streak`, `ice_shields`, `last_studied_date`, `last_evaluated_date`, `last_shield_milestone_streak`, `pending_shield_event_json`, `updated_at`).
   - **Ganho de escudos:** usuário inicia com `1` escudo e recebe `+1` escudo a cada **14 dias consecutivos** de ofensiva (`streak >= milestone + 14`, teto de `3` escudos acumulados).
   - **Proteção automática:** quando o backend avalia o intervalo entre `last_evaluated_date` e ontem e detecta dia(s) sem >= 30 min, consome **1 escudo de gelo por dia perdido** (enquanto `ice_shields > 0`), preserva o `current_streak` e grava `pending_shield_event_json` com `{ savedStreakDays, missedDates, remainingShields }`. Se faltar escudo, o `current_streak` zera.
   - **Backfill inicial e edições retroativas (`our call`):** no primeiro cálculo de usuário já existente, recalcular `current_streak` / `best_streak` a partir de `study_sessions` históricos sem consumir escudos nem gerar modais retroativos (`ice_shields = 1`, `last_evaluated_date = hoje`). Ao registrar ou excluir sessões passadas (`POST /api/study-sessions/manual`, `DELETE /api/study-sessions/...`), recalcular de forma determinística a ofensiva/patente no backend mantendo proteção contra fraude.
   - **Animação na tela:** ao receber `pendingShieldEvent` em `GET /api/gamification/status`, exibir modal/overlay celebratório com um **escudo de gelo entrando na tela, girando e brilhando** com a mensagem *"Escudo de Gelo ativado! Salvou sua ofensiva de X dias!"*, confirmando leitura via `POST /api/gamification/shield-event/ack` (idempotente).
3. **Cálculo de Patentes (1h/dia → 12h/dia sem zerar):**
   - Usa uma janela móvel dos últimos **14 dias** (`effectiveHoursPerDay = totalHoursLast14Days / Math.min(14, Math.max(1, daysSinceFirstStudy))`, limitada ao teto de `12h`) ponderada pelo **Fator de Constância (`consistencyFactor = 0.55 + 0.45 * min(1, effectiveStreakDays / 30)`)** -> `rankPowerHours = effectiveHoursPerDay * consistencyFactor`.
   - **Tabela de Patentes CBMERJ (10 patentes):**
     - `Recruta` (início sem histórico)
     - `Soldado` (≥ 0.8h ajustadas / ~1h/dia, constância ≥ 1 dia — **piso permanente** após o primeiro histórico, nunca volta para Recruta)
     - `Cabo` (≥ 1.7h/dia & ≥ 5 dias)
     - `3º Sargento` (≥ 2.6h/dia & ≥ 7 dias)
     - `1º Sargento` (≥ 3.6h/dia & ≥ 10 dias)
     - `Subtenente` (≥ 4.6h/dia & ≥ 14 dias)
     - `Aspirante a Oficial` (≥ 5.8h/dia & ≥ 18 dias)
     - `Tenente` (≥ 7.2h/dia & ≥ 21 dias)
     - `Capitão` (≥ 8.8h/dia & ≥ 25 dias)
     - `Major / Ten-Cel` (≥ 10.2h/dia & ≥ 28 dias)
     - `Coronel Comandante` (**12h/dia** de média efetiva com **≥ 30 dias** de constância)
   - **Anti-zero & rebaixamento gradual:** se o usuário quebrar o foguinho sem escudo ou baixar muito o ritmo nos dias seguintes, o `rankPowerHours` cai proporcionalmente e rebaixa gradualmente (nunca abaixo de `Soldado` para quem já tem estudo), mostrando claramente na UI **quantas horas/dia e quantos dias de constância faltam para a próxima patente**.
4. **UI — Cronograma & Sidebar:**
   - **Sidebar ([TacticalSidebar.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/components/TacticalSidebar.tsx)):** redesenhar o card do perfil (mobile e desktop) para visual tático mais limpo com avatar, badge de patente discreta, **apenas o nome do usuário (sem `@username`)** e o **foguinho + contador de dias** (e mini indicador de escudos de gelo disponíveis) ao lado do nome.
   - **Cronograma ([HorizontalWeeklyTable.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/components/HorizontalWeeklyTable.tsx) / cabeçalho da aba):** exibir o **foguinho + dias de ofensiva + escudos de gelo + patente atual** de forma limpa e integrada no cabeçalho da semana.

---

### Fase 3 — Cartão-Resposta Compartilhado & Radar ↔ Banco de Provas com IA Sob Demanda

1. **Componente reutilizável `AnswerSheetInput`:**
   - Usado tanto no **Radar (Provas)** quanto nos **Simulados**.
   - **Quantidade de questões configurável** (`totalQuestions` de 1 a 200).
   - **Respostas do aluno (2 modos sincronizados em tempo real):**
     - **Cartão-resposta visual clicável:** grade `1..N` com botões `A`, `B`, `C`, `D`, `E` e `U` (em branco/indefinida).
     - **Campo rápido estilo chat:** o usuário digita/envia letras separadas por espaço (ex.: `E A B B C U`), preenchendo automaticamente `Q1=E, Q2=A, Q3=B, Q4=B, Q5=C, Q6=U...` (e refletindo instantaneamente na grade).
   - **Acertos por matéria:** painel de resumo permitindo informar/ajustar diretamente `acertos / total` por disciplina (ou derivar automaticamente quando questões estiverem mapeadas por matéria).
   - **Gabarito Oficial (3 modos à escolha):**
     1. **Colar/enviar foto** (`Ctrl+V` / upload imagem PNG/JPG/WEBP → endpoint `POST /api/ai/parse-answer-key-image` usando Gemini multimodal retorna o array `["A","C",...]` para conferência).
     2. **Texto colado / estilo chat** (`A C D B...`).
     3. **Cartão-resposta clicável** (`1..N` com `A..E`).
   - Quando houver respostas do aluno + gabarito oficial, calcula automaticamente questões certas, erradas (com lista exata `Q3, Q7, Q14...`) e aproveitamento `%`.
2. **Persistência & APIs de Provas no Radar:**
   - Tabela `exam_attempts` (`id`, `user_id`, `exam_paper_id FK`, `total_questions`, `correct_count`, `student_answers_json`, `official_key_json`, `subject_scores_json`, `ai_diagnosis_json`, `ai_analyzed_at`, `created_at`, `updated_at`), suportando múltiplas tentativas (`1:N`, exibindo a tentativa mais recente no card do Radar e histórico se refizer a prova — `our call`).
   - **Substituição completa da aba `/desempenho` (Radar):** remove a renderização antiga de `StudentCoachPanel`, `StudentAnalyticsPanel` e do radar anterior em [App.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/App.tsx#L2748), tornando [StudentRadarTab.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/components/StudentRadarTab.tsx) o **Radar de Provas** ligado ao Banco de Provas do usuário (`exam_papers`), exibindo apenas provas, acertos salvos, acesso rápido ao cartão-resposta/gabarito e diagnóstico.
   - **Botão explícito sob demanda (`Analisar Prova com IA`):** chama `POST /api/exams/:id/ai-diagnosis`. O backend recupera o PDF no R2 (ou texto salvo), cruza o conteúdo real da prova com as questões erradas (`student_answers` vs `official_key`) e/ou acertos por matéria e gera diagnóstico estruturado: **pontos/assuntos onde mais errou**, **questões críticas para revisar** e **quais matérias precisa priorizar**. **Nunca roda automaticamente.**

---

### Fase 4 — Simulados com Cartão-Resposta e IA de Lacunas (*Aprofundar / Rever / Primeira Vez*)

1. **Migração e enriquecimento de [TacticalSimulations.tsx](file:///c:/Users/renas/Desktop/PROJETOS/cronograma-de-estudos-cfo-cbmerj/src/components/TacticalSimulations.tsx):**
   - Nova tabela `user_simulations` (`id`, `user_id`, `date_str`, `title`, `exam_type`, `total_questions`, `correct_count`, `wrong_count`, `target_cutoff_pct`, `concept`, `self_evaluation`, `review_targets_json`, `student_answers_json`, `official_key_json`, `subject_scores_json`, `ai_diagnosis_json`, `created_at`) com endpoints autenticados `GET/POST/DELETE /api/simulations` e migração transparente única dos simulados já salvos no `localStorage` do usuário.
   - Reutiliza exatamente o mesmo `AnswerSheetInput` criado na Fase 3 dentro do registro/edição de simulados (quantidade de questões, cartão clicável, chat `E A B B C U`, acertos por matéria selecionando matérias da grade real em `subjects`/`study_sessions` ou tag livre, e 3 formas de gabarito).
   - **Preservação da tela (`/simulados`, `our call`):** `TacticalSimulations` assume o protagonismo no topo da aba `/simulados`, preservando `<Release3StudyPanel />` em seção secundária recolhível abaixo para manter compatibilidade com simulados adaptativos do banco de questões sem poluir a tela.
2. **Diagnóstico de IA para Simulados (`POST /api/simulations/:id/ai-diagnosis` + `POST /api/simulations/ai-diagnosis`):**
   - Suporta análise individual por simulado e **visão consolidada** sob demanda agregando todos os simulados recentes do usuário.
   - Usa nota de corte padrão configurada pelo usuário (padrão herdado: `70%` Conceito B / `80%` Conceito A, ajustável por simulado — `our call`) e cruza com o histórico real de horas/sessões por matéria em `study_sessions`, classificando explicitamente cada matéria em:
     - **Ver pela primeira vez:** matéria com erro/lacuna no simulado e `0` (ou baixíssimo) registro prévio em `study_sessions`.
     - **Rever:** matéria já estudada anteriormente, mas com queda/erros recentes no simulado.
     - **Aprofundar:** matéria já estudada com frequência, mas ainda abaixo da nota de corte ou errando questões complexas.

---

## 5. Decisões em Aberto Definidas como Padrão (*Calls We Made*)

- **Mínimo diário do foguinho:** `30 minutos` (`1800s`) somados no dia (`study_sessions`).
- **Teto de escudos acumulados:** `3` escudos de gelo guardados (inicia com `1`, ganha `+1` a cada 14 dias consecutivos).
- **Rollout & recálculo de ofensiva:** backfill histórico de `study_sessions` sem modais retroativos; edições em datas passadas recalculam a ofensiva de forma determinística no backend.
- **Letra `U` no chat de respostas:** tratada como questão **em branco / não marcada** (conta como não pontuada ao corrigir com o gabarito oficial).
- **Janela de média das patentes:** últimos `14 dias` combinada com fator de constância (`streak`), permitindo subir com ritmo sustentado e rebaixar suavemente sem nunca zerar o histórico (`Soldado` permanente após primeiro estudo).
- **Múltiplas tentativas no Radar:** tabela `1:N` (`exam_attempts`), exibindo a tentativa mais recente no card e preservando refazer prova.
- **Simulados + `/simulados` + nota de corte:** mapeamento com matérias reais da grade, meta padrão `70%`/`80%` editável, `<Release3StudyPanel />` mantido recolhido abaixo do `TacticalSimulations`, e endpoints de análise individual + consolidada sob demanda.
- **Parte 2 (`public/cfo-extensao-cbmerj/`):** manter apenas `public/cfo-extensao-cbmerj.zip` no repositório/build web e ignorar a pasta descompactada para não vazar fontes soltos em `dist/public/`.

---

## 6. Plano de Verificação

- Testes unitários/integrados adicionados em `test/` para:
  - Cálculo de patentes (1h→12h/dia), ganho quinzenal de escudos, consumo automático ao faltar e anti-zero;
  - Parser do cartão-resposta em texto (`E A B B C U`) e cálculo de acertos vs gabarito;
  - Ownership check (`404/403` entre usuários) em `/api/exams/:id/ai-diagnosis`, `/api/simulations` e `/api/gamification/*`;
  - Não re-enfileiramento de `413` em `remotePersistence`.
- Execução obrigatória em cada fase: `npx tsc --noEmit`, `npm run build`, `npm test` (`scripts/readiness-suite.mjs`).
