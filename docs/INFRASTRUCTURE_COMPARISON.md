# Comparação de infraestrutura

**Consulta de preços oficiais:** 16/10/2026. Valores em USD, sem impostos/câmbio; preços variam por plano/região e devem ser reconfirmados na contratação.

## Recomendação

Para este repositório, a arquitetura preferida para a primeira migração é **Railway para frontend + backend Express, com Neon PostgreSQL**. O frontend é Vite/React SPA (`dist/public`) e o Express já serve o bundle, APIs, cookies HttpOnly, health checks e shutdown gracioso. Mantê-los juntos preserva chamadas `/api/*` e cookies same-origin, evita CORS e evita inserir proxy com domínio variável no `vercel.json` (o proxy estático Vercel exige destino explícito). A separação Vercel + Railway + Neon pode ser reavaliada depois de uma prova de conceito com domínio de API e sessão/cookies validada.

Railway não lista região no Brasil: sua lista atual é Califórnia, Virgínia, Amsterdam e Singapura. Neon lista regiões AWS; confirmar no console que `sa-east-1` está disponível para o plano/conta. Se Railway Virginia + Neon us-east-1 for o pareamento disponível, tráfego de usuários brasileiros cruza o Atlântico e a latência precisa ser medida. Um backend em Virginia perto do Neon reduz latência de consulta; não garante baixa latência do usuário final. Não há suporte de co-localização em São Paulo comprovado nos documentos oficiais verificados.

## Preços e limites oficiais consultados

- Railway: Hobby mínimo de US$5 com US$5 de crédito; Pro mínimo de US$20 com US$20 de uso incluído. RAM US$0,00000386/GB-segundo, CPU US$0,00000772/vCPU-segundo, egress US$0,05/GB. Pro inclui alertas e hard limit de compute que pode desligar workloads; configure antes do lançamento.
- Neon: Launch pago por uso, US$0,106/CU-hora, US$0,35/GB-mês de banco, US$0,20/GB-mês de histórico; 500 GB de transferência pública incluída e depois US$0,10/GB. Free: 100 CU-hora e 1 GB por projeto, 5 GB de transferência, escala a zero; não recomendado como produção com garantia.
- Vercel: Pro US$20/mês e US$20 de crédito de uso; CDN inclui limites publicados por recurso, Spend Management suporta alertas e pausa via hard limit. Na consulta, Fast Data Transfer mostrava 100 GB incluídos em uma coluna e Flat Rate CDN oferecia preço fixo com proteção contra picos em Pro; confirmar elegibilidade e custo atual antes de usar.
- Preços consultados em [Railway Pricing](https://railway.com/pricing), [Railway Cost Control](https://docs.railway.com/pricing/cost-control), [Neon Pricing](https://neon.com/pricing), [Vercel Pricing](https://vercel.com/pricing), [Vercel Limits](https://vercel.com/docs/limits).

## Premissas para comparação por usuários ativos mensais

MAU não define sessões simultâneas. São cenários ilustrativos de uso total ao longo do mês, excluindo tráfego anormal de 93 GB, imagens grandes/Whiteboard, conteúdo de terceiros, builds, impostos e suporte. Backend público emitido por usuário: **leve 1 MB, moderado 5 MB, intenso 20 MB/mês**. Respostas PostgreSQL/Neon recebidas pelo backend: **1/5/20 MB por MAU/mês** como aproximação deliberadamente independente. Frontend estático é entregue por CDN e não deve ser somado ao egress Railway. Para Neon Launch, compute de banco ilustrado em 190/720/3.000 CU-horas/mês (amostras oficiais Neon low/medium/high), armazenamento inicial 0,1 GB aproximando 54 MB observados.

| MAU | Uso | API outbound/mês | Egress Railway (US$0,05/GB) | Neon compute + storage aproximado | Backend Railway aproximado* | Total combinado indicativo** |
|---:|---|---:|---:|---:|---:|---:|
| 100 | Leve | 0,1 GB | $0,01 | $20,18 | $20 | $40–41 |
| 100 | Moderado | 0,5 GB | $0,03 | $76,36 | $20 | $96–97 |
| 100 | Intenso | 2 GB | $0,10 | $318,04 | $20 | $338–339 |
| 1.000 | Leve | 1 GB | $0,05 | $20,18 | $20 | $40–41 |
| 1.000 | Moderado | 5 GB | $0,25 | $76,36 | $20 | $96–97 |
| 1.000 | Intenso | 20 GB | $1,00 | $318,04 | $20–40 | $339–359 |
| 5.000 | Leve | 5 GB | $0,25 | $20,18 | $20–40 | $40–61 |
| 5.000 | Moderado | 25 GB | $1,25 | $76,36 | $40–60 | $118–138 |
| 5.000 | Intenso | 100 GB | $5,00 | $318,04 | $60–100 | $383–423 |
| 10.000 | Leve | 10 GB | $0,50 | $20,18 | $20–40 | $40–61 |
| 10.000 | Moderado | 50 GB | $2,50 | $76,36 | $60–100 | $139–179 |
| 10.000 | Intenso | 200 GB | $10,00 | $318,04 | $100–180 | $428–508 |

\* Inclui piso Railway Pro US$20; faixas de compute modeladas como contínuo 0,5 vCPU/0,5 GB (~US$15 de recurso), depois 1–2 vCPU/2–4 GB (~US$40–80), descontando o crédito incluído e respeitando o mínimo. São sizing placeholders, não benchmark nem cotação.

\** Soma backend + Neon + egress de API; todos os cenários ficam abaixo dos 500 GB de transferência pública incluídos no Neon Launch, portanto a linha não adiciona cobrança de egress do Neon. Não inclui tráfego de mídia, backups, Redis (opcional), Google/Notion/IA/e-mail/Turnstile, Vercel, nem impostos. Neon Launch compute domina o custo e pressupõe que a carga do banco seja similar entre tamanhos com a mesma classificação; medir antes de contratar. Em intenso, o dimensionamento pode ser maior do que os limites ilustrados.

### Vercel + Railway + Neon

Adiciona base Vercel Pro (US$20 por mês, com US$20 de crédito de uso incluso) e pode entregar arquivos estáticos por CDN global perto dos usuários. Some a assinatura de US$20 aos totais da tabela; uso acima do crédito é variável e requer cotação de transferência/CDN vigente. Rewrites para o backend transferem chamadas de API pelo Vercel e ainda mantêm o egress do Railway; não removem tráfego e adicionam um salto. O Express atual não pode ser implantado no Vercel como está, pois é um servidor persistente com SSE e processos de background.

### Railway + Neon

Um único serviço Railway serve SPA e APIs sob o mesmo origin, compatível com o padrão atual; não há assinatura de CDN Vercel separada. O CDN de borda do Railway existe para entrada, mas o servidor/região continua Virginia ou outra região fora do Brasil. Redis pode ser necessário ao escalar múltiplas instâncias para rate limit/locks distribuídos; cotação e capacidade não incluídas.

## Latência, segurança, disponibilidade e rollback

- Para segurança, manter cookies `HttpOnly`, `Secure`, `SameSite=Strict`, TLS verificado no Postgres, secrets no painel e nunca expor `DATABASE_URL` ao Vite. Vercel separado exigiria proxy same-origin ou CORS + credentials e revisão de CSP/cookies; sem teste real, não aprovar.
- Backend persistente, SSE de Whiteboard/Admin, jobs e uso de filesystem tornam Railway mais natural que funções serverless Vercel. `data/` precisa de volume persistente ou migração de cada artefato para objeto externo; snapshots/backups locais não sobrevivem a uma instância efêmera.
- Neon: usar URL pooler indicada para backend persistente, TLS válido, limite de autoscaling, backups PITR/snapshots e branch de staging. Confirmar região e retenção de backup conforme plano.
- Rollback de app: deployment anterior Railway. Rollback de banco exige snapshot compatível e janela de escrita controlada; deploy anterior não desfaz schema ou gravações.
