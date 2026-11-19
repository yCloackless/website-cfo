# Migração de produção do Neon para o Supabase

## Intenção

Transferir o PostgreSQL usado pelo CFO CBMERJ no Render do Neon para o Supabase porque a cota gratuita de computação do Neon foi atingida. O objetivo é restaurar o serviço com os dados mais recentes, sem perder usuários, progresso de estudos ou registros administrativos.

## Decisões já tomadas

- Destino: um projeto Supabase novo e limpo, deixando o projeto existente `cfo transfer` intacto para rollback.
- Organização escolhida: `yCloackless's Org`.
- Nome proposto: `cfo-cbmerj-prod`.
- Região proposta: `us-east-1`, alinhada à localização atual do Supabase existente.
- O orçamento consultado para criar um projeto nessa organização foi US$ 0/mês. Antes da criação, este valor será repetido e confirmado; qualquer cobrança diferente interrompe a criação até aprovação explícita.
- O aplicativo continuará usando PostgreSQL via `pg` e `DATABASE_URL`; não será adotado Supabase Auth nem a API REST, pois o runtime atual usa autenticação própria e SQL direto.

## Operação temporária escolhida

- O usuário autorizou colocar o serviço CFO no Render no projeto novo do Supabase agora, embora ele esteja vazio. O backend usa PostgreSQL direto e executa migrações no startup; nenhum dado do Neon será copiado nesta etapa.
- O Neon permanece intacto. Após o corte, novas gravações poderão existir no Supabase enquanto o Neon mantém os dados históricos.
- Quando o Neon liberar conexões, comparar os dois lados e reconciliar por IDs e campos de atualização; não substituir uma base inteira pela outra sem confirmar que isso preserva dados dos dois períodos.

## Abordagens consideradas

1. **Mesclar no projeto `cfo transfer`:** mantém o destino atual, mas exige resolver conflitos entre registros e estrutura existente. Rejeitada porque pode misturar dados históricos e atuais.
2. **Criar um Supabase limpo e restaurar uma cópia completa do Neon:** mantém os dois projetos anteriores intactos, facilita comparar a cópia com a origem e permite rollback simples. Escolhida pelo usuário.

## Plano de execução

1. Reativar e inspecionar o destino escolhido; criar o projeto novo somente após aprovação deste documento e da confirmação do custo de US$ 0/mês.
2. Recuperar acesso de leitura ao banco Neon. O projeto atual confirma 110,15 CU-h de compute e 51,31 MB de dados; a cota gratuita renova em 2026-12-01 00:00 UTC (30/11 às 21h em Brasília). O endpoint `production` está `ready`, mas a cota esgotada bloqueia conexões até renovar ou mudar de plano. O Neon reporta suspensão automática desabilitada (`suspend_timeout_seconds = 0`) e mínimo de 0,25 CU; isso é uma explicação provável para o consumo contínuo. A liberação pelo plano Launch é paga e precisa ser concluída pelo proprietário no painel; nenhuma cobrança será acionada pelo agente.
3. Fazer um dump consistente da branch de produção atual do Neon usando conexão direta, sem usar snapshots antigos. O dump de 10/10 mencionado em notas locais está desatualizado e não é fonte aprovada para produção.
4. Restaurar schema, dados, índices, constraints, funções, triggers e políticas RLS no novo Supabase. Conferir extensões, sequences e compatibilidade antes do corte, sem importar ownership/roles reservadas da origem.
5. Comparar número de tabelas e linhas, constraints, chaves, estado de autenticação próprio e amostras de dados sem exibir conteúdo privado. Manter os bancos anteriores sem alterações.
6. Apontar temporariamente o serviço CFO no Render para o Supabase por configuração protegida, mantendo TLS; deixar as migrações do app criarem o esquema vazio e validar inicialização, readiness, login e leitura/gravação.
7. Manter o Neon intacto. Depois que voltar a aceitar conexões, comparar os dados dos dois lados, reconciliar gravações divergentes com base em IDs e timestamps e só então escolher a base final e fazer o corte definitivo.

## Limites e riscos

- O Supabase temporário inicia sem os dados existentes no Neon; esses registros ficam indisponíveis no site até a reconciliação. Se houver novos registros no Supabase, a etapa posterior precisa mesclar as alterações de ambos os lados para não perder dados. Não se deve preencher o Supabase com o snapshot antigo como substituto.
- O projeto Supabase novo no plano gratuito pode pausar após longo período sem atividade. O banco tem espaço suficiente para os 51 MB mostrados no painel Neon, mas é necessário conferir as cotas do projeto após a criação.
- O projeto `cfo transfer`, reativado para inspeção, contém 73 tabelas públicas reportadas sem linhas, todas com RLS ligado e sem políticas. A migration 037 do app revoga privilégios de `anon`/`authenticated` e liga RLS intencionalmente; o advisor classifica a ausência de políticas como informação. Não adicionar políticas genéricas sem validar o modelo de acesso do backend.
- A máquina tem Docker, mas não tem `pg_dump`/`pg_restore` instalados. A escolha do caminho de exportação/restauração será validada com as ferramentas disponíveis depois que o Neon voltar a aceitar conexões.
- O runtime atual já habilita TLS para hosts Supabase em `src/db/postgresTls.ts`; nenhuma reescrita do driver está planejada. Só haverá mudança no código se os testes de compatibilidade identificarem uma falha concreta.

## Fora de escopo

- Apagar ou pausar o Neon, o projeto `cfo transfer` ou o serviço Railway.
- Trocar autenticação do aplicativo para Supabase Auth.
- Expor senhas, URLs de conexão ou conteúdo de usuários em logs ou na conversa.
- Usar o dump histórico de 10/10 para substituir a base atual.
