# Deploy no Render sem perder dados

O Render pode recriar o filesystem local do serviço. Portanto, `data/cfo_app.sqlite` não pode ser a fonte de verdade em produção.

## Configuração obrigatória

1. Crie um PostgreSQL gerenciado no Render.
2. Conecte o serviço web ao banco pela `DATABASE_URL` interna/privada fornecida pelo Render.
3. Defina `NODE_ENV=production` e `DATABASE_URL` nas Environment Variables do serviço.
4. Não coloque a senha em `render.yaml`, Git ou frontend.
5. Faça o deploy com o Dockerfile deste repositório.

O servidor agora falha imediatamente se estiver em produção sem `DATABASE_URL`; ele não pode voltar silenciosamente para SQLite vazio.

## Migração para o banco do Render

Execute o migrador uma única vez contra o banco PostgreSQL vazio do Render, usando backup final do SQLite e `ALLOW_POSTGRES_RESET=true`. Depois valide contagens, checksums e foreign keys. O SQLite antigo deve ser mantido como backup offline até o fim da janela de rollback.

## Persistência adicional

O PostgreSQL protege os dados relacionais. Arquivos enviados, snapshots e backups em `/app/data` também precisam de armazenamento persistente do Render ou cópia externa S3/R2. Configure `BACKUP_S3_*` e teste restore; não dependa apenas do disco local.

## Cutover e rollback

- Faça backup final antes de mudar o serviço.
- Faça deploy com `DATABASE_URL` apontando ao PostgreSQL gerenciado.
- Execute smoke tests de login, questões, provas, histórico e administração.
- Em falha, reverta o deploy/configuração para a versão anterior e preserve o PostgreSQL e o SQLite antigo.
- Nunca use `docker compose down -v` nem remova o banco antigo durante a janela de segurança.
