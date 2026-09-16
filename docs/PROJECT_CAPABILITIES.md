# Inventário de Capacidades e Roadmap — CFO CBMERJ

> **Documento Vivo de Engenharia e Produto**  
> **Finalidade**: Permitir que qualquer agente ou desenvolvedor conheça imediatamente tudo o que a aplicação já possui implementado, sua arquitetura técnica e todas as oportunidades de expansão mapeadas.

---

## 1. O que Já Existe (Inventário de Capacidades Ativas)

### 1.1 Core de Estudos & Cronograma
- **Cronograma Semanal & Visão Horizontal (`HorizontalWeeklyTable.tsx`)**:
  - Matriz visual por dia da semana e blocos de horário.
  - Distribuição estratégica das disciplinas do edital CFO CBMERJ (Física, Química, Matemática, Biologia, Português/Literatura, História, Geografia, Língua Estrangeira e Redação).
  - Controle de metas diárias, status de conclusão e horas de dedicação.
- **Caderno de Erros Estruturado (`ErrorNotebookTab.tsx`)**:
  - Registro de questões erradas com categorização da causa raiz (falta de atenção, desconhecimento teórico, pegadinha, tempo escasso).
  - Histórico de resoluções e data de revisão.

### 1.2 Sistema Avançado de Flashcards Anki (SM-2 Nativo)
- **Algoritmo de Repetição Espaçada (SM-2)**:
  - Cálculo dinâmico de intervalo, fator de facilidade (Ease Factor $\ge 1.30$) e repetições consecutivas.
  - Fila de estudo priorizada (Novos $\to$ Atrasados/Hoje $\to$ Futuros).
- **Omissão de Palavras (Cloze Deletion)**:
  - Sintaxe padrão Anki: `{{c1::termo}}` com suporte a múltiplas pistas e omissões combinadas (`ClozeLatexCard.tsx`).
- **Renderização Matemática e Química (KaTeX)**:
  - Fórmulas inline (`$...$`) e em bloco (`$$...$$`) com suporte a equações físicas e reações químicas do vestibular UERJ/CBMERJ.
- **Áudio TTS (Text-to-Speech)**:
  - Leitura com síntese de voz em português brasileiro (`pt-BR`) para estudo auditivo e acessibilidade.
- **Modo Treino Livre (Cram Mode)**:
  - Revisão sem limites para véspera de prova sem afetar o agendamento de longo prazo ou as estatísticas do SM-2.
- **Detecção de Cartões Sanguessugas (*Leech Cards*)**:
  - Sinalização automática de cartões com 4 ou mais falhas (`lapses >= 4`) com filtro exclusivo para saneamento tático.
- **Previsão de Carga (*Forecast*) & Mapa de Constância (*Heatmap*)**:
  - Gráfico de previsão de revisões para os próximos 7, 14 e 30 dias.
  - Heatmap visual estilo GitHub para rastrear disciplina de estudo diária.
- **Importação em Lote & Exportação**:
  - Importação atômica via CSV, TSV e separador de blocos `---`.
  - Exportação completa em formato `.csv` e `.json`.
- **Ponte com Banco de Provas**:
  - Envio direto de qualquer questão do Banco de Provas para baralhos de flashcards com um clique.

### 1.3 Banco de Provas & Questões Oficiais (`ExamBankTab.tsx`)
- **Provas Históricas do CBMERJ e UERJ**:
  - Filtros por disciplina, banca, ano e nível de dificuldade.
  - Gabarito oficial interativo e justificativas comentadas.
  - Ferramenta de recorte e revisão de questões (`QuestionCropReviewModal.tsx`).

### 1.4 Produtividade & Temporizador
- **Cloud Timer / Pomodoro (`CloudTimer.tsx`, `TimerTab.tsx`)**:
  - Contagem de horas líquidas de estudo focadas.
  - Registro de ciclos de estudo/pausa com sincronização no servidor.
  - Prevenção contra perda de dados de cronometragem local.

### 1.5 Painel Administrativo & Modo Manutenção
- **Tela de Manutenção Global (`MaintenanceScreen.tsx`)**:
  - Interceptação de tráfego de usuários com mensagem orientativa durante intervenções técnicas.
  - Sistema de bypass via token criptográfico de emergência para a equipe técnica.
- **Painel Admin (`src/components/admin/`)**:
  - Autenticação com 2FA TOTP (Google Authenticator / Authy) e proteção anti-replay.
  - Gestão de banimento e desbanimento de IPs suspeitos.
  - Step-up authentication para operações destrutivas.

### 1.6 Resiliência, Segurança & Dados
- **Backup & Restauração (`backupService.ts`)**:
  - Exportação compactada de todo o progresso do cadete.
  - Restauração atômica com validação de esquema JSON e somas de verificação SHA-256.
- **Conformidade LGPD**:
  - Anonimização de logs e exportação de dados pessoais para download.
  - Fluxo seguro de encerramento e exclusão de conta.
- **PWA & Offline (`public/sw.js`, `manifest.webmanifest`)**:
  - Service worker configurado com cache de recursos estáticos.
  - Suporte à instalação como aplicativo nativo (Desktop e Mobile).
- **Mecanismo de Deploy Sem F5 (Padrão Amazon / Zero-Downtime)**:
  - Rota de telemetria `GET /api/version` e Service Worker com ativação sob demanda (`SKIP_WAITING`).
  - Toast tático não intrusivo (`UpdateNoticeModal.tsx`) para atualização em 1 clique sem interromper o cadete.
  - Auto-recuperação defensiva via `vite:preloadError` contra erros 404 em chunks dinâmicos pós-deploy.

---

## 2. Roadmap Tático: O que Pode Ser Implementado

As seguintes melhorias foram desenhadas considerando o perfil do concurso do CFO CBMERJ:

### 2.1 Motor de Simulados Oficiais CBMERJ
- **Simulação com Tempo de Prova Real**:
  - Cronômetro regressivo com bloqueio de consulta.
  - Cartão-resposta interativo com preenchimento de bolinhas.
  - Cálculo automático de pontuação e estimativa de nota de corte histórica (UERJ/CBMERJ).
  - Relatório pós-prova: tempo médio por questão, taxa de acerto por disciplina e identificação de "chutes".

### 2.2 Diagnóstico Tático Inteligente ("Raio-X do Cadete")
- **Análise Estatística de Fragilidade**:
  - Gráfico radar (spider chart) identificando temas onde o cadete mais erra (ex.: Eletrodinâmica em Física, Termoquímica em Química).
  - Sugestão automática de ciclo de revisão focado exclusivamente nos pontos fracos diagnosticados.

### 2.3 Gamificação Militar por Patentes
- **Evolução de Carreira no App**:
  - Sistema de pontuação baseado em consistência, metas cumpridas e cartões revisados.
  - Progressão de patentes:
    - *Aspirante a Cadete* $\to$ *Cadete 1º Ano* $\to$ *Cadete 2º Ano* $\to$ *Cadete 3º Ano* $\to$ *Aspirante a Oficial*.
  - Conquistas e insígnias especiais (ex.: "Sentinela Noturno" por bater meta à noite, "Infalível" por 50 questões consecutivas sem erro).

### 2.4 Notificações Web Push via Service Worker
- **Lembretes Ativos**:
  - Disparo de lembrete diário de revisões pendentes no Anki no horário programado pelo usuário.
  - Aviso de início de simulado ou encerramento de metas semanais.

### 2.5 Exportação e Impressão Tática (PDF)
- **Geração de Caderno Tático**:
  - Exportação em PDF formatado para impressão contendo:
    - Resumo do cronograma da semana.
    - Caderno de erros consolidado para revisão off-line/física.
    - Lista de fórmulas essenciais das disciplinas exatas.

---

## 3. Diretrizes de Preservação Técnica para Agentes

1. **Nunca quebre o que já existe**: Antes de tocar em qualquer módulo, execute `node scripts/readiness-suite.mjs` e `npx tsc --noEmit`.
2. **Backend é a autoridade máxima**: Nenhuma validação de segurança, cálculo de pontuação ou operação sensível pode depender do cliente.
3. **Atomicidade em operações em lote**: Qualquer importação ou sincronização de dados deve ser executada dentro de transação atômica para evitar corrupção de estado.
