# Plano de migração Supabase/Render → Railway/Neon

**Estado em 2026-10-17:** o proprietário autorizou migrar a camada de banco para Neon; Railway e publicação ficam para uma etapa posterior. O projeto Neon e o branch `production` foram vinculados e verificados. O schema da aplicação foi aplicado (73 tabelas; 38 migrações), mas nenhum dado da origem foi importado. A validação inicial do servidor criou uma conta de bootstrap no destino; ela não veio do Supabase e precisa ser considerada ao preparar a restauração.

## Pré-condições

1. Recuperar e validar um backup/export atual da origem. No computador há um dump SQL de 2026-09-10 e backups locais da aplicação até 2026-09-19; nenhum foi comparado com a base final do Supabase e ambos podem omitir progresso recente. Não restaurar como estado atual sem decisão explícita do proprietário.
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
