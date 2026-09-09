# Release 3 — Revisão inteligente e simulados

## Entregue

- Migration 021 com revisões persistentes e sessões de simulado.
- Registro de tentativa gera uma revisão de desempenho automaticamente.
- Revisões vencidas podem ser listadas e concluídas pelo aluno.
- Recomendações priorizam questões com menor domínio e menor exposição.
- Sessões tradicionais e adaptativas são criadas no servidor com lista de questões versionada.
- Painel de estudo conectado à tela de simulados, preservando o histórico manual existente.

## Rotas

- `GET /api/student/revisions?dueOnly=true`
- `POST /api/student/revisions/:id/complete`
- `GET /api/student/recommendations?limit=5`
- `POST /api/student/simulations`
- `GET /api/student/simulations/:id`
- `POST /api/student/simulations/:id/status`

## Limite conhecido

O primeiro agendamento usa intervalos curtos de reforço (1 dia para erro e 3 dias para acerto). A evolução para um algoritmo de repetição espaçada mais sofisticado deve ocorrer após coletar dados reais de uso.

## Verificação

`npm run typecheck`, `npm run build` e `npm test` passaram após a implementação.
