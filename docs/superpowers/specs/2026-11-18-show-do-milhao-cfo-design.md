# Design Spec — Minigame "Show do Milhão CFO CBMERJ"

**Data:** 2026-11-18  
**Escopo:** Nova aba interativa de aluno (`/show-do-milhao`, tabId `millionGame`) no estilo Show do Milhão, com 16 perguntas geradas sob medida por IA (Gemini) em blocos crescentes de dificuldade no padrão UERJ / CFO CBMERJ, validação autoritativa no servidor, recorde/histórico persistido por usuário, áudio opcional e envio de erros para Flashcards/Caderno de Erros.

---

## 1. Objetivo & Motivação
- Tornar o estudo de conteúdos do edital CFO CBMERJ / vestibulares (ex.: *História do Brasil*, *Termoquímica*, *Eletrodinâmica*, *Concordância Verbal*) interativo e memorável, mantendo rigor de banca e explicação pedagógica imediata a cada resposta.
- Evitar perguntas triviais ou desconectadas do concurso e impedir qualquer fraude de pontuação ou vazamento de gabarito no cliente.

## 2. Metas, Não-Metas e Anti-Metas
- **Metas:**
  1. Nova aba de aluno registrada em `SYSTEM_MODULES` (`src/config/modules.ts`), `TacticalSidebar.tsx` (`millionGame` → `/show-do-milhao`) e lazy-loaded em `src/App.tsx`.
  2. Campo para digitar qualquer conteúdo/tema (com sugestões rápidas das matérias do CFO) e opcionalmente indicar foco/banca.
  3. Geração 100% sob medida via Gemini (`getGeminiClient()`) estruturada em **4 blocos de dificuldade** (16 perguntas principais + 3 reservas para pulos = 19 questões).
  4. Escada clássica de 16 níveis até **R$ 1.000.000** com marcos de segurança, ajudas clássicas (**Cartas**, **Pular 3x**, **Universitários**) e botão **Parar**.
  5. Explicação tática imediata ao responder e botão de 1 clique para enviar questão errada (ou revisada) para um baralho no Anki/Caderno de Erros (`/api/anki/decks` + `/api/anki/notes`).
  6. Histórico de partidas e recorde pessoal salvos no banco por `userId`, mais efeitos sonoros sintetizados via Web Audio API com botão de mudo.
- **Não-Metas:**
  - Não misturar questões de `exam_questions` (todas as partidas são 100% geradas sob medida pela IA).
  - Não criar ranking multiplayer público ou apostas entre usuários.
  - Não incluir arquivos `.mp3`/`.wav` pesados no bundle.
- **Anti-Metas:**
  - Nunca enviar `correctIndex` ou `explanation` ao frontend antes de o usuário responder/parar/errar a questão atual.
  - Nunca aceitar pontuação, prêmio ou vitória enviados pelo navegador.
  - Nunca fazer 16 chamadas HTTP à IA durante a partida (estouraria `aiLimiter` de 30 req/15min e travaria o ritmo do jogo).

## 3. Abordagens Consideradas e Escolha
1. **Abordagem 1 (Escolhida) — Lote único estruturado por blocos de dificuldade + motor autoritativo no backend:**
   - Uma chamada única ao Gemini (`POST /api/ai/million-game/start`) gera as 19 questões divididas explicitamente em 4 blocos de dificuldade (`Bloco 1: Aquecimento Q1–Q5`, `Bloco 2: Intermediário UERJ/CFO Q6–Q10`, `Bloco 3: Avançado Q11–Q15`, `Bloco 4: Pergunta do Milhão Q16`, mais 3 reservas vinculadas aos blocos 1–3).
   - O estado completo da partida (incluindo `correctIndex` e `explanation`) fica persistido apenas no servidor via `userStateRepoInstance` (`million_game_active_v1` e `million_game_history_v1`), chaves bloqueadas contra sobrescrita em `PUT/PATCH /api/user/state`.
   - **Por que escolhida:** Zero pausa entre perguntas, apenas 1 consumo de `aiLimiter` por partida, estrutura pedagógica explícita por blocos de dificuldade e segurança total server-side.
2. **Abordagem 2 (Descartada como principal) — Geração sob demanda por bloco (3–4 chamadas na partida):**
   - Economiza tokens quando o jogador perde cedo, mas cria pausas no meio do jogo e consome até 4x mais o limite de `aiLimiter` (30 req/15min).
3. **Abordagem 3 (Descartada) — Motor e gabarito em `localStorage`:**
   - Viola a regra de segurança do projeto (`BACKEND = AUTORIDADE`) ao expor respostas e permitir adulteração de recorde no cliente.

## 4. Regras Oficiais do Minigame (16 Perguntas)
- **Escada de Prêmios (`Acertar` / `Parar` / `Errar`):**
  1. Q1: R$ 1.000 (Parar: R$ 0 | Errar: R$ 0)
  2. Q2: R$ 2.000 (Parar: R$ 1.000 | Errar: R$ 500)
  3. Q3: R$ 3.000 (Parar: R$ 2.000 | Errar: R$ 1.000)
  4. Q4: R$ 4.000 (Parar: R$ 3.000 | Errar: R$ 1.500)
  5. Q5: R$ 5.000 (Parar: R$ 4.000 | Errar: R$ 2.000) — *Fim do Bloco 1 (Aquecimento)*
  6. Q6: R$ 10.000 (Parar: R$ 5.000 | Errar: R$ 2.500)
  7. Q7: R$ 20.000 (Parar: R$ 10.000 | Errar: R$ 5.000)
  8. Q8: R$ 30.000 (Parar: R$ 20.000 | Errar: R$ 10.000)
  9. Q9: R$ 40.000 (Parar: R$ 30.000 | Errar: R$ 15.000)
  10. Q10: R$ 50.000 (Parar: R$ 40.000 | Errar: R$ 20.000) — *Fim do Bloco 2 (Intermediário)*
  11. Q11: R$ 100.000 (Parar: R$ 50.000 | Errar: R$ 25.000)
  12. Q12: R$ 200.000 (Parar: R$ 100.000 | Errar: R$ 50.000)
  13. Q13: R$ 300.000 (Parar: R$ 200.000 | Errar: R$ 100.000)
  14. Q14: R$ 400.000 (Parar: R$ 300.000 | Errar: R$ 150.000)
  15. Q15: R$ 500.000 (Parar: R$ 400.000 | Errar: R$ 200.000) — *Fim do Bloco 3 (Avançado)*
  16. Q16: **R$ 1.000.000** (Parar: R$ 500.000 | **Errar: R$ 0** — regra clássica de tudo ou nada na pergunta do milhão; ajudas **desabilitadas** na Q16 conforme regra tradicional).
- **Ajudas Clássicas (bloqueadas na Q16):**
  - **Cartas (1x por partida — decisão de design):** servidor sorteia **1, 2 ou 3** alternativas incorretas para eliminar e persiste no estado da questão atual para evitar re-rolagem ao recarregar a página.
  - **Pular (3x — 1 por bloco):** cada um dos Blocos 1, 2 e 3 possui **1 questão reserva dedicada** (totalizando 19 questões geradas na partida). O jogador pode pular **no máximo 1 vez por bloco** sem alterar o nível de prêmio; a UI exibe tanto os pulos totais restantes quanto a disponibilidade no bloco atual.
  - **Universitários (1x por partida):** servidor gera 3 palpites ponderados com ~65–85% de tendência para a alternativa correta (reduzida para ~45–60% no Bloco 3) e justificativa curta, retornando apenas os votos/porcentagens sem expor certeza absoluta.
  - **Parar:** encerra a partida imediatamente creditando o prêmio de parada.

- **Partida em Andamento (`IN_PROGRESS` — decisão de design):**
  - `POST /api/ai/million-game/start` retorna `409 ACTIVE_MATCH_EXISTS` se o usuário já possuir uma partida ativa (`million_game_active_v1`), evitando desperdício acidental do `aiLimiter`.
  - Na tela inicial da aba, se houver partida ativa, o jogador vê as opções **"Continuar partida"** ou **"Encerrar atual e começar outra"** (que chama `POST /api/million-game/stop`, registrando o prêmio de parada no histórico se já passou da Q1 ou encerrando com R$ 0 na Q1).

## 5. Arquitetura & Contratos de API (Backend = Autoridade)
Todas as rotas exigem `requireUserAuth` (via `app.use('/api/ai', requireUserAuth, aiLimiter)` ou `requireUserAuth` nas rotas de leitura/jogada para que responder/pular/parar não consumam cota do `aiLimiter`!):
- **Importante:** Apenas `POST /api/ai/million-game/start` invoca o Gemini e aplica `aiLimiter`; as rotas de leitura/jogada (`/api/million-game/state`, `/api/million-game/answer`, `/api/million-game/help`, `/api/million-game/stop`) usam `requireUserAuth` + rate limiter padrão sem gastar cota de geração de IA!
- `GET /api/million-game/state`: retorna partida ativa sanitizada (se houver, sem `correctIndex`) + `bestPrize`, `totalMatches`, `wins` e últimas partidas (`history`, máx. 20).
- `POST /api/ai/million-game/start`: recebe `{ topic, focusHint? }`, valida tamanho via `validateAiTextFields`, gera os 4 blocos de dificuldade (19 questões) via `getGeminiClient()` com `responseSchema`, salva partida ativa em `million_game_active_v1` e devolve a Q1 sanitizada. (Em ambientes sem `GEMINI_API_KEY`, retorna `503 AI_UNAVAILABLE` com mensagem clara — nunca fabrica conteúdo falso em produção, exceto fallback/mock em testes automatizados).
- `POST /api/million-game/answer`: recebe `{ matchId, questionId, selectedIndex }` (0..3), valida ownership e estado `IN_PROGRESS` + `questionId` atual, calcula resultado, atualiza prêmio/status no servidor, registra no histórico se terminou (`WON` / `LOST`), retorna `{ isCorrect, correctIndex, explanation, referenceTip, status, earnedPrize, nextQuestion? }`.
- `POST /api/million-game/help`: recebe `{ matchId, questionId, helpType: 'cards' | 'skip' | 'universitarios' }`, valida disponibilidade (e bloqueio na Q16), aplica efeito determinístico no servidor e persiste.
- `POST /api/million-game/stop`: recebe `{ matchId }`, encerra como `STOPPED`, credita prêmio de parada no histórico e retorna a explicação da questão que estava na tela.
- **Integração com Caderno de Erros (Anki):** no frontend, o botão **"Salvar no Caderno de Erros"** cria/reaproveita um baralho `"Show do Milhão::Erros"` via `GET/POST /api/anki/decks` e grava a pergunta + gabarito + explicação via `POST /api/anki/notes`.

## 6. Experiência Visual & Áudio (Frontend)
- Componente principal `src/components/MillionGameTab.tsx` + utilitário de som `src/utils/millionAudio.ts` (Web Audio API puro: acordes sutis de entrada, acerto, erro, cartas/pular e vitória; toggle mudo salvo em `localStorage`).
- Suporte completo a tema claro/escuro do dashboard e fórmulas matemáticas/químicas via `LatexRenderer`.
- Tela inicial com input de conteúdo + chips de matérias do edital CFO + card de Recorde Pessoal & Histórico recente.
- Palco do jogo com escada lateral de 16 prêmios, indicador de Bloco de Dificuldade (`Aquecimento`, `Intermediário`, `Avançado`, `Milhão`), 4 alternativas interativas (`A`–`D` com atalhos de teclado `1–4` / `A–D`), barra de ajudas + Parar, e card pós-resposta com explicação tática + botão `Próxima Pergunta` + `Salvar no Caderno de Erros`.

## 7. Segurança e Isolamento
- Em `server.ts` (`PUT/PATCH /api/user/state`), adicionar `million_game_active_v1` e `million_game_history_v1` à lista de chaves protegidas (como `TIMER_STATE_STORAGE_KEY`) para impedir qualquer escrita direta pelo cliente.
- Validar `matchId`, `questionId`, `selectedIndex` e limites de texto no backend; proteção contra duplo clique/replay na mesma questão (se já foi respondida, retorna `409` ou estado idempotente sem creditar duas vezes).

## 8. Decisões Deixadas para o Plano de Implementação
- Detalhamento exato de `responseSchema` do Gemini e `candidateModels` (reaproveitando os modelos já usados em `server.ts`).
- Estilização fina dos badges/efeitos visuais no padrão Tailwind já usado em `TacticalSimulations` e `LevelingTab`.
- Estrutura exata dos testes automatizados (isolando `userStateRepoInstance` e mockando `getGeminiClient` / `fetch`).
