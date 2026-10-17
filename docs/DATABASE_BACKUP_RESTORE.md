# Backup, restauração e validação PostgreSQL

## Estado comprovado

**Backup disponível:** `C:\Users\renas\Downloads\2026-10-10T04_23Z.dir.tar.gz`, dump PostgreSQL em formato diretório (pg_dump 18.6), 4.099.018 bytes. SHA-256 calculada em 2026-10-17: `AD2A6254F06C2C475448E297E37A4AECCED4C4CFA25DF9DDEB0B33113E9F7BE1`; não há hash do produtor para comparação.

**Restore de ensaio realizado:** branch Neon `backup-2026-10-10`, database `cfo_backup_20261010`; não alterou o branch `production`. `pg_restore --list` reconheceu 523 entradas, incluindo 73 blocos TABLE DATA e 160 índices. `pg_restore --no-owner --no-acl --no-privileges --exit-on-error --jobs=4` terminou com exit code 0. A aplicação aplicou as migrations até 38 e Express `/api/ready` respondeu HTTP 200.

**Diferenças que impedem promoção:** dump tinha 36 migrations e 787 linhas exatas após o restore; com migrations 37/38, o banco de ensaio tem 789 linhas. O catálogo do Supabase atual reporta 37 migrations, 73 tabelas, aproximadamente 870 linhas e RLS ligado nas 73. Quinze contagens de tabelas diferem entre a origem reportada e o snapshot. O banco restaurado está sem RLS e sem políticas. As contagens da origem são metadados de tabela, não comparação por checksum; registram divergência, mas não identificam exatamente todos os registros ausentes. Tratar o branch como staging e aguardar export atual antes de produção/Railway.

**Teste incremental/egress:** foi semeado um snapshot sintético de 120.052 bytes; 30 atualizações parciais enviaram 1.310 bytes totais de payload e geraram 30 chamadas de merge-upsert. `pg_stat_statements` mostrou duas leituras completas do snapshot no fixture (hidratação/verificação), sem uma leitura completa por gravação. O teste confirmou a última gravação e isolamento de estado entre usuários sintéticos. A métrica de bytes de transferência do branch Neon reportou 0 durante esta janela, então não serve como medição de egress faturável; este ensaio valida o padrão de consultas, não o custo em tráfego real.

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
| Export atual da origem | NÃO; único arquivo é snapshot de 2026-10-10 |
| SHA-256 | Calculada e registrada; sem hash original para validar |
| Restore em destino Neon isolado | PASSOU; branch `backup-2026-10-10`, database `cfo_backup_20261010` |
| Lista/schema/índices | 73 tabelas e 160 índices; restore completo exit 0 |
| Contagens | Divergência reportada em 15 tabelas; origem é metadado aproximado, sem checksum |
| RLS | Origem reporta 73/73 habilitadas; restore tem 0/73 e nenhuma policy |
| Inicialização da aplicação / health | Migrations até 38; `/api/ready` HTTP 200 |
| Escrita incremental / isolamento | 30 merge-upserts; persistência e isolamento sintéticos passaram |
| Egress faturável | NÃO medido por tráfego de produção; métrica do branch reportou 0 |
| Login e fluxos completos | NÃO testados |
| Concorrência/cutover/rollback | NÃO executados |

Restauração sem dados atuais e comparação origem/destino não é evidência de integridade de uma migração real. O corte precisa congelar escritas ou usar CDC/dual-write explicitamente validado.
