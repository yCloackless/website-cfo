# Como Funciona o Banco de Horas e a Virada de Dia no Cronômetro CFO

Este documento explica de forma clara, técnica e objetiva as melhorias implementadas no **Banco de Horas** da plataforma web e na **Virada de Dia de Estudo** do aplicativo **Cronômetro CFO**.

---

## 1. Banco de Horas: Soma Cumulativa vs Substituição

### O Problema Anterior
Anteriormente, quando você já tinha registrado um tempo para uma matéria (ex.: 2h 15min de Biologia) e adicionava mais tempo da mesma matéria (ex.: 45min), o sistema utilizava um identificador estático com a cláusula de banco `ON CONFLICT(id) DO UPDATE SET duration_seconds = excluded.duration_seconds`. Isso causava a substituição do tempo antigo pelo novo, em vez de somar os períodos.

### Como Funciona Agora
1. **Adição cumulativa (Comportamento padrão ao adicionar matéria)**:
   - Toda vez que você adiciona uma matéria ao Banco de Horas (ou estuda mais um bloco daquela disciplina), é gerado um registro de sessão com sufixo temporal único (`timestamp`).
   - O banco de dados SQLite armazena cada fatia de estudo individualmente de forma imutável e auditável.
   - Os endpoints de agregação (`/api/study-sessions/day/:date` e `/api/study-sessions/daily-summary`) calculam `SUM(duration_seconds)`.
   - **Exemplo prático**:
     - Já tem **2h 15min** de Biologia.
     - Adiciona mais **45min** de Biologia:
     - O sistema registra o novo bloco de 45 min e o Banco de Horas passa a exibir automaticamente **3h 00min**.
     - Se depois adicionar mais **30min**, totaliza **3h 30min**.

2. **Modo Edição / Ajuste Manual (`replaceSubjectTime: true`)**:
   - Quando você clica explicitamente no modal de edição de célula da tabela semanal para alterar o tempo já definido de uma matéria (ex.: ajustar de 3h para 2h), o frontend envia a flag `replaceSubjectTime: true`.
   - Nesse caso específico, o backend remove as sessões anteriores da matéria daquele dia e grava a nova duração exata que você digitou.

---

## 2. Cronômetro CFO: Virada de Dia de Estudo e Reset Inteligente

### O Problema Anterior
O cronômetro desktop e a persistência baseavam a data da sessão puramente no relógio de parede do momento de finalização (`endedAt`). Se você começava a estudar no dia 08 às 23:00 e parava às 02:00 do dia 09, a sessão caía na data 09, quebrando o ciclo de estudos do dia anterior. Além disso, a ação de Reset apagava as sessões do dia do calendário.

### Como Funciona Agora

#### Conceito de "Dia de Estudo Ativo" (`activeDate`)
- O cronômetro passa a manter um estado persistido chamado `activeDate` (ancorado na data em que a jornada começou).
- **Enquanto você não clicar em Resetar/Zerar**, o cronômetro mantém o dia de estudo corrente.

#### Cenário de Madrugada (Virada da Noite)
1. **Você começou a estudar no dia 08 e passou da meia-noite (já é dia 09 no relógio)**:
   - O cronômetro **percebe** que o dia do calendário virou, mas **NÃO transfere** suas horas para o dia 09.
   - Todas as sessões estudadas continuam sendo gravadas com `dateStr: "2026-10-08"` tanto localmente quanto sincronizadas com o servidor CFO.
   - O total do dia exibido no cronômetro continua somando as horas do **dia 08**.

2. **Ação de Reset / Zerar Inteligente**:
   - **Caso 1: Calendário virou (dia 09) e você clica em Reset**:
     - O sistema detecta: `activeDate (08) != calendarDate (09)`.
     - O reset atua como a **troca oficial de dia de estudo**:
       - **PRESERVA 100% das horas e sessões do dia 08** (nada é apagado!).
       - Atualiza o `activeDate` para o novo dia (dia 09).
       - Zera o cronômetro em `00:00:00`.
       - A partir deste clique, novos estudos passam a contar para o dia 09.
   - **Caso 2: Mesmo dia de estudo (você está no meio do dia 08 e clica em Reset)**:
     - O botão Zerar continua funcionando normalmente para limpar/reiniciar o cronômetro do dia atual após confirmação.

---

## 3. Segurança e Eficiência Técnica
- **Validação Server-Side**: O endpoint `/api/study-sessions/desktop` valida `dateStr` no formato estrito `YYYY-MM-DD` e autentica a requisição via Bearer Token antes de persistir.
- **Mínimo de Linhas**: Implementado sem dependências extras, reutilizando os repositórios existentes de SQLite, as rotas da API e os hooks do React.
- **Cobertura de Testes Automatizados**:
  - Testes de ponta a ponta criados em `test/banco_horas_somar_e_rollover.test.ts` (100% aprovados).
  - Testes do cronômetro desktop em `cronometro-cfo/tests/day-rollover-gsd.test.mjs` (100% aprovados).
  - Suíte completa de segurança e readiness do projeto mantida 100% verde.
