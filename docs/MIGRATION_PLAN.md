# Plano de migração Supabase/Render → Railway/Neon

**Estado em 2026-10-17:** o arquivo `C:\Users\renas\Downloads\2026-10-10T04_23Z.dir.tar.gz` foi restaurado em um destino isolado no Neon: branch `backup-2026-10-10`, database `cfo_backup_20261010`. O branch `production` permanece intacto e ainda contém apenas o schema preparado e a conta local de bootstrap. O dump passou em `pg_restore --list` e `pg_restore --exit-on-error`; depois, as migrations do app chegaram à versão 38.

**Resultado de integridade:** o backup contém 73 tabelas públicas e tinha 787 linhas ao terminar o restore; as migrations 37/38 elevaram a contagem total a 789. Os metadados do Supabase atual reportam 73 tabelas, cerca de 870 linhas e RLS ativado em todas; 15 contagens de tabelas diferem. No banco restaurado, RLS e políticas estão ausentes. Portanto, o snapshot de 10/10 não representa a origem atual e não está aprovado para produção/Railway. A hash SHA-256 do arquivo foi registrada localmente na documentação de restauração.

**Teste de egress incremental:** contra esse banco restaurado, uma carga sintética de 120.052 bytes foi hidratada uma vez, seguida por 30 gravações parciais com 1.310 bytes de payload total. `pg_stat_statements` registrou 30 chamadas de merge-upsert e 2 leituras do snapshot durante verificações do fixture; não houve leitura completa por gravação. O teste isolou dois usuários sintéticos e confirmou que o estado de um não aparece para o outro. Express `/api/ready` retornou HTTP 200. Isso valida o caminho de consulta/gravação e o controle de acesso do app em ensaio, mas não mede egress faturável em tráfego de produção.

## Pré-condições

1. Aguardar a origem Supabase voltar a aceitar exportação e gerar um dump consistente recente. O snapshot de 10/10 está disponível no branch isolado do Neon, mas tem contagens divergentes e não preserva o RLS; não apontar Railway para ele até reconciliar dados e segurança.
2. Rodar o procedimento em `DATABASE_BACKUP_RESTORE.md` numa instância descartável, com comparação de contagem/checksums antes de qualquer corte.
3. Rotacionar credencial de banco que estava embutida em script versionado; revisar histórico Git e acessos.
4. Criar Neon de produção manualmente pelo proprietário, escolher região/plano, ligar backup/retention e definir teto de compute. Criar Railway com limite de custo e storage persistente adequado.
5. Gerar e cadastrar secrets diretamente nos painéis, validar callbacks OAuth, domínios e allowlists. Não colar secrets em chat ou commit.
6. Ensaiar restauração, migração incremental, autenticação, funcionalidades e rollback em ambiente de staging com cópia saneada ou base de teste.

## Inventário em código (não equivale a introspecção da base viva)

- `scripts/dump-schema.sql` define 73 objetos/tabelas públicas no snapshot versionado; `scripts/dump-tables.json` lista os dados de dump histórico. Confirmar seu timestamp/commit e comparar com a produção. Estrutura é majoritariamente PostgreSQL relacional padrão: tabelas, tipos básicos, índices, constraints e chaves estrangeiras; buscar funções/triggers/extensões no dump completo e na instância real antes da decisão. As migrations `src/db/database.ts` descrevem também esquema SQLite com conversões próprias.
- Aplicação conecta por `pg` via `DATABASE_URL`; não foi localizado uso de supabase-js no runtime principal nem Auth/Data API do Supabase. Contas e sessões da aplicação são customizadas (hash, token HMAC/cookie e TOTP), portanto migram junto com dados SQL e `SESSION_SECRET`; não recriar usuários ou redefinir senha sem plano.
- Dependências externas identificadas no código: Cloudflare R2/S3 para mídia de Whiteboard, provas/flashcards e backups; Firebase SDK/config do app; Google OAuth/Calendar; Notion; Gemini/OpenAI; Resend; Turnstile; Redis opcional. Inventariar objetos R2 por chave/contagem/tamanho e verificar uso real de Firebase antes de substituir qualquer recurso. Não foi encontrada evidência suficiente para afirmar uso de Supabase Auth/Storage/Realtime/Edge Functions no app; confirmar console, schema e buckets de produção.

## Migração com escrita concorrente

Não iniciar um dump simples e depois apontar tráfego: mudanças ocorridas durante cópia seriam perdidas. Procedimento seguro requer janela de congelamento ou replicação CDC validada. O aplicativo atual não oferece replicação CDC para o destino. Plano conservador:

1. Definir janela e comunicar manutenção; snapshot/export consistente e com checksum.
2. Bloquear escrita de usuários na origem e drenar requests em curso; manter leitura ou página de manutenção.
3. Fazer export final; importar em banco Neon descartável/target vazio; verificar tabelas, dados, constraints e autenticação.
4. Smoke test completo em staging; conferir R2 e callbacks OAuth por domínio de teste.
5. Antes do corte, tomar snapshot do destino e registrar SHA/config. Trocar `DATABASE_URL` apenas na nova instância Railway; validar `/api/ready`, login, leitura/escrita sintética, Whiteboard e agenda.
6. Abrir tráfego gradualmente sem permitir escritores simultâneos nas duas origens. Manter origem intacta/read-only pelo período de observação.
7. Se houver falha, voltar app para origem apenas se nenhum dado novo tiver sido aceito no destino; caso contrário congelar novamente e reconciliar/exportar as gravações do destino antes de rollback. Sem mecanismo de dual-write/CDC, consistência sem perda exige congelamento de escrita.

## Cutover e rollback

Domínio/DNS fica fora deste preparo e requer autorização no momento do corte. Reduzir TTL antes apenas se o proprietário autorizar. Não desligar ou apagar Supabase/Render até uma janela aprovada de estabilidade, verificação de backup e plano de retorno.
