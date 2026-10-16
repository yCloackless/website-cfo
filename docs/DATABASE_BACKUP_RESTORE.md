# Backup, restauração e validação PostgreSQL

## Estado comprovado

O painel Supabase consultado não mostrava backup. O banco estava em torno de 54,29 MB. Há um schema SQL e metadados de dump versionados, além de um utilitário antigo de restauração que foi endurecido nesta rodada: agora exige `ALLOW_DISPOSABLE_RESTORE=true`, banco com sufixo `_restore_test` ou `_migration_test`, recusa schema público não vazio e não apaga tabelas. Ele depende de dump histórico local e ainda não foi testado; prefira o fluxo de dump/restore abaixo. Não existe nesta rodada comprovação de backup atual nem restauração segura executada. Classificação: **BLOQUEADO** para validação origem/destino por falta de export atual e endpoint de teste.

## Captura segura da origem

Executar no computador do proprietário, com `pg_dump` oficial e uma credencial com apenas leitura. Preferir secret manager/variável de sessão; não pôr URL na linha de comando, histórico, log ou arquivo rastreado. Confirmar que o arquivo de destino é novo, em disco protegido e com espaço suficiente. Exportar custom format (`pg_dump --format=custom --no-owner --no-acl`) para arquivo criptografado/volume seguro; gerar SHA-256 e guardar hash separado. Não usar `--clean`.

O endereço da origem não foi incluído na documentação. Não usar o dump histórico como se fosse atual. Nunca imprimir conteúdo, argumentos de conexão ou registros nos logs.

## Restauração de ensaio (somente disposable)

1. Criar uma instância PostgreSQL isolada, nova e descartável; usuário diferente de produção e database com sufixo `restore_test`. Proibir conectividade de rede ao endpoint de produção.
2. Validar hash do arquivo e `pg_restore --list` antes de importar.
3. Restaurar apenas no banco vazio descartável, primeiro schema/data; não usar `--clean`, `--create` nem script que apaga objetos existentes.
4. Comparar lista de tabelas/colunas/tipos/índices/FKs/sequences, contagem por tabela e contagem de órfãos. Para dados sensíveis, calcular checksums em ambiente restrito sem exportar valores pessoais.
5. Testar login de conta de ensaio, leitura e gravação com usuário sintético; checar `nextval` das sequences e integrity check; remover a instância descartável após registrar os resultados.

Exemplo de ferramentas, **não executar antes de apontar exclusivamente ao alvo descartável**:

```powershell
pg_restore --list $env:BACKUP_FILE
pg_restore --exit-on-error --no-owner --no-acl --dbname=$env:DISPOSABLE_DATABASE_URL $env:BACKUP_FILE
```

## Lista de validação para registrar

| Checagem | Resultado desta rodada |
|---|---|
| Backup atual da produção disponível | NÃO EXECUTADO / BLOQUEADO |
| SHA-256 verificado | NÃO EXECUTADO |
| Restore em base descartável | NÃO EXECUTADO |
| Contagens por tabela e integridade referencial comparadas | NÃO EXECUTADO |
| Sequences verificadas | NÃO EXECUTADO |
| Login/leitura/escrita de ensaio | NÃO EXECUTADO |
| Concorrência/cutover/rollback | NÃO EXECUTADO |

Restauração sem dados atuais e comparação origem/destino não é evidência de integridade de uma migração real. O corte precisa congelar escritas ou usar CDC/dual-write explicitamente validado.
