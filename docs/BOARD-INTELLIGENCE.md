# Inteligencia da Banca

Modulo administrativo exclusivo para construir uma base estruturada, aprovada e versionada de padroes de bancas/concurso.

## Arquitetura

- UI: `src/components/admin/BoardIntelligencePanel.tsx`, exibida dentro do painel `/admin`.
- Backend: rotas `/api/admin/board-intelligence/*` em `server.ts`.
- Service layer: `BoardIntelligenceService`, unica camada prevista para outros modulos consultarem perfil ativo e retrieval.
- Upload/extracao: reutiliza `secureUploadService` e `ExamService`; nao existe segundo processador de provas.
- Feature flag: `ADMIN_BOARD_INTELLIGENCE`; quando `false`, endpoints retornam `FEATURE_DISABLED`.

## Dados

Migration `018_admin_board_intelligence` cria:

- `board_intelligence_profiles`: perfil da banca/concurso.
- `board_intelligence_exams`: prova importada e estado de revisao.
- `board_question_analysis`: analise estruturada/cache por questao, prompt e modelo.
- `board_profile_snapshots`: snapshot imutavel das fontes e estatisticas usadas.
- `board_profile_versions`: versoes `DRAFT`, `ACTIVE`, `SUPERSEDED` e `DISCARDED`.
- `board_intelligence_jobs`: base para jobs pesados, checkpoints, idempotencia e lock de rebuild.

## Fluxo

1. Admin cria perfil.
2. Admin importa provas antigas.
3. Sistema usa upload seguro e extracao existente.
4. Prova fica `EXTRACTED` ou em revisao.
5. Admin aprova com `APPROVED`.
6. Somente provas `APPROVED` entram nas estatisticas.
7. Admin gera versao `DRAFT`.
8. Admin publica; a transacao torna a versao antiga `SUPERSEDED` e a nova `ACTIVE`.
9. Rollback restaura uma versao anterior como `ACTIVE`.

## Anti-contaminacao

O service calcula perfil e retrieval apenas com:

```sql
WHERE board_intelligence_exams.status = 'APPROVED'
```

Estados `UPLOADED`, `PROCESSING`, `EXTRACTED`, `REVIEW_REQUIRED` e `REJECTED` nao entram em snapshot, perfil ativo ou retrieval oficial.

## IA

A primeira versao usa classificador deterministico barato para metadados e estatisticas. Numeros como frequencia, percentuais e medias sao calculados pelo backend. Campos de modelo, provider, `promptVersion` e `algorithmVersion` ja sao persistidos para conectar a camada `AIProvider`/Gemini em uma evolucao posterior sem perder rastreabilidade.

## Seguranca

- Todas as rotas usam `requireAdminAuth` ou `requireAdminWriteAuth`.
- Cadete acessando diretamente endpoints admin recebe `403`.
- Operacoes sensiveis registram audit log server-side.
- Snapshots possuem triggers anti-update e anti-delete.
- Publicacao e rollback rodam em transacao ACID.
- Indices unicos impedem duplicar prova no mesmo perfil e ter mais de uma versao `ACTIVE`.

## Testes

Cobertura adicionada em `test/board_intelligence.test.ts`:

- acesso anonimo/cadete bloqueado;
- criar perfil, importar prova realista em texto, revisar, aprovar, gerar `DRAFT`, publicar `ACTIVE`;
- prova extraida ainda nao aprovada nao contamina estatisticas;
- prova `REJECTED` nao gera perfil nem snapshot.

## Limitacoes Atuais

- Jobs assíncronos e workers reais ainda usam a tabela preparada, mas o fluxo inicial executa sincrono.
- Embeddings vetoriais/RAG semantico real ainda nao foram ligados; retrieval inicial e lexical e filtra apenas conhecimento aprovado.
- Analise por IA estruturada completa deve evoluir sobre `BoardIntelligenceService` sem mudar o contrato publico.
