# Checklist de go-live (não autorizado nesta etapa)

- [ ] Proprietário criou Railway/Neon e escolheu plano/região; tetos de gasto ligados.
- [ ] Credencial de banco que estava em script foi rotacionada; histórico e logs de acesso revisados.
- [ ] Backup atual da origem produzido, validado por hash e restaurado em alvo isolado.
- [ ] Dados/identidades, contagens, integridade referencial, sequences e mídia comparados.
- [ ] Pendência sobre Supabase Auth/Storage/Realtime/Edge Functions conferida no console e no banco real.
- [ ] Neon região, política de backup, pooler, TLS e max connections confirmados.
- [ ] Railway volume `data/`, workers/SSE, Redis, quotas, limites e observabilidade testados.
- [ ] Typecheck, readiness, integração, E2E, segurança e carga isolada passaram no SHA de corte.
- [ ] Fluxos de login/2FA, cronograma, timer, Anki, nivelamento, Whiteboard, arquivos, agenda e admin aprovados em staging.
- [ ] Roteiro de congelamento de escrita, janela, comunicação, DNS/TTL e rollback aprovado pelo proprietário.
- [ ] Backup/snapshot imediatamente antes do corte e ponto de retorno testado.
- [ ] Autorização explícita para migração/cutover recebida.

Nenhum item de publicação, DNS, desligamento ou migração de produção foi executado por esta preparação.
