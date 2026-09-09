# Releases 4 e 5 — Coach, analytics e fechamento

## Release 4

- Coach diário com saída estruturada: diagnóstico, ações e alertas.
- Integração opcional com Gemini, com fallback pedagógico determinístico.
- Dados enviados ao modelo limitados a métricas agregadas de aprendizagem.
- Contrato formal em `docs/AI-SPEC.md`.

## Release 5

- Analytics dos últimos 7 a 90 dias.
- Tentativas, acurácia, tempo médio, simulados e atividade diária.
- Pontos de atenção agrupados por disciplina, tópico e subtópico.
- Painel visual integrado à área Radar.

## Hardening aplicado

- Rotas protegidas por autenticação do aluno.
- Sessões, questões e flashcards filtrados por `user_id`.
- Limite de payload para sincronização de flashcards.
- Fallback sem dependência de chave externa.
- Migrations incrementais 022 e 023 preservadas.

## Verificação final

- `npm run typecheck` passou.
- `npm run build` passou.
- `npm test` passou em todas as suítes de readiness.

O build ainda pode emitir o aviso existente de tamanho do bundle principal; isso não impede a compilação e fica como otimização posterior de carregamento.
