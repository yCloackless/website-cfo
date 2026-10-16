# Guia de preparação de deploy

## Railway + Neon (candidato recomendado)

O `railway.json` declara `npm ci && npm run build`, `npm start` e health check em `/api/ready`. O `package.json` constrói Vite em `dist/public` e Express em `dist/server.cjs`. O servidor respeita `PORT`, faz bind em `0.0.0.0` em produção, oferece readiness com teste de banco e trata SIGTERM/SIGINT com encerramento de jobs, SSE, banco e timeout.

1. Conectar branch de migração apenas a ambiente de teste; validar o build e revisar logs.
2. Definir persistent volume em `/app/data` ou provar que cada uso de arquivo foi migrado a serviço durável. `data/` contém conteúdo operacional e cópias locais; sem volume, deploy/restart pode perdê-los.
3. Definir PostgreSQL `DATABASE_URL` do Neon, usar TLS validado e pooler indicado; nunca definir URL no Vite. Limitar conexões totais considerando `pool max × replicas`; atualmente cada pool chega a 10 conexões.
4. Definir secrets no painel (SESSION_SECRET, credenciais administrativas hash, TURNSTILE, R2, AI/OAuth/Notion/Redis conforme features ativadas). `APP_URL` e redirect URIs devem refletir ambiente correto.
5. Revisar Redis opcional: rate limits distribuídos/locks em múltiplas réplicas. Uma réplica não substitui backup durável.
6. Health `/api/ready` faz uma consulta leve; manter `/api/health` para leitura operacional. Testar deploy anterior/rollback em staging.

## Vercel (alternativa, não implantável com configuração completa ainda)

O cliente é Vite/React SPA, saída `dist/public`; não é Next.js e não deve ser convertido para funções Vercel sem redesenho de SSE, processos persistentes e jobs. Vercel permite saída estática e fallback SPA, porém o repositório atual chama muitas rotas relativas `/api/*` e usa cookie `__Host-...` HttpOnly SameSite Strict. A arquitetura requer proxy same-origin com origem Railway explícita ou refatoração de todas as chamadas para API cross-origin com CORS/credentials, cookies e CSP testados. `vercel.json` não aceita variável de ambiente como destino de rewrite; domínio não deve ser inventado ou hardcoded. Por isso não há rewrite Vercel pronto para produção neste commit.

Ao iniciar um POC autorizado: Vite build output `dist/public`; rewrite SPA para `/index.html`; configurar origem API em ambiente/proxy apropriado; não pôr secrets `DATABASE_URL`, sessão, AI, OAuth ou R2 em variáveis `VITE_*`. Validar URLs de callback Google, CSP `connect-src`, CSRF, cookie Secure/SameSite e SSE na origem de produção de teste.

## Variáveis

Use `.env.example` apenas como lista de nomes/modelos. Rotacione a credencial que apareceu em script versionado. Não copiar `.env`/`.env.staging` para build, imagem Docker, anexos, issue ou chat.

## Pós-deploy (ambiente de teste primeiro)

`/api/ready` 200; version SHA esperado; login sintético; uma leitura e gravação por módulo crítico; cookies Secure/HttpOnly; sessão após refresh; whiteboard documento + mídia; SSE; Google OAuth callback de teste; logs sem secrets/PII; restore e rollback testados. Produção permanece sem alteração até autorização posterior.
