# Auditoria de egress e sincronização

**Data da auditoria:** 16/10/2026. **Status:** parcial em produção; localmente reproduzível.

## Evidência e diagnóstico

- Painel Supabase consultado: 93,18 GB de egress não cacheado contra 5 GB incluídos; banco 54,29 MB; sem backup visível. É tráfego de saída do banco/serviços Supabase, não uma medida direta de bytes HTTP do Render.
- Painel Render consultado: 19,93 GB outbound, dos quais 19,06 GB iniciados pelo serviço e 888 MB de respostas HTTP. A página pública exibiu “suspended by its owner”; não comprova suspensão automática por limite.
- Causa confirmada no código anterior, com contribuição histórica não mensurável: o cliente fazia debounce de 500 ms, mas enviava o snapshot inteiro do `localStorage` para cada sequência de mudanças; o servidor persistia o snapshot completo. O volume de resposta do Postgres no Render conta em outbound do Render e em egress do provedor do banco, com métricas e fronteiras distintas.
- Correção já presente no commit local `d1a4507`: PATCH de chaves alteradas, merge JSON atômico em uma operação, PUT completo preservado para compatibilidade e supressão de eco ao hidratar. Falha mantém valores pendentes para tentativa posterior. Não mede bytes históricos nem prova a parcela dos 93,18 GB causada por esse caminho.
- A sincronização incremental ainda usa um PATCH por lote de 500 ms; abas distintas podem enviar patches concorrentes. A consolidação no PostgreSQL deve preservar chaves diferentes; duas abas alterando a mesma chave seguem a política last-write-wins.

## Fluxos e riscos observados

| Gravidade | Fluxo | Evidência | Efeito provável / situação |
|---|---|---|---|
| Alta, corrigida localmente | Browser → API → PostgreSQL, snapshot completo por mudança | `remotePersistence.ts`, rota `/api/user/state`; alterado em `d1a4507` | Multiplicava bytes de leitura e escrita por mudança. Falta medir produção após deploy autorizado. |
| Alta, aberto | Whiteboard → API → armazenamento R2/S3 | upload de imagem até 10 MB; GET do asset volta pelo backend | Cada visualização baixa do R2 e retransmite todo o arquivo via backend. Pode aumentar egress Railway e custo/saída R2. Não há evidência de cache CDN no fluxo autenticado. |
| Média, aberto | Temporizador → API | `TimerTab.tsx` polling de status a cada 3 s enquanto ativo | Até 1.200 consultas/hora por aba ativa (20/min); evitar várias abas e validar necessidade de polling. Não foi atribuído aos painéis de uso. |
| Média | Banco → backend | pool PostgreSQL com `max: 10` por processo; retry de falhas transitórias | Múltiplas réplicas multiplicam conexões. Railway/Neon exigem limites somados por réplica e pooler adequado. |
| Média, corrigido parcialmente | Falha de PATCH/offline | valores pendentes ficam em memória e `online` reenvia | Reinício do browser/processo pode perder alterações ainda não confirmadas; verificar estado de escrita antes de autorizar corte. |
| Média | Serviços externos | Google OAuth/Calendar, Notion, Gemini/OpenAI, Resend, Turnstile, Cloudflare R2 | Transferência/custos externos independem do Postgres; respostas de IA, imagens e sincronizações em lote precisam limites próprios. |
| Alta, corrigido neste preparo | Script de auditoria de mídia | `scripts/test-db-media.mjs` continha credencial embutida e imprimia linhas completas | Credencial removida; saída agora contém contagens e soma de tamanho, e conexão exige `DATABASE_URL` com TLS validado. Fazer rotação da credencial comprometida e verificar histórico remoto do Git. |

## Medição incremental já executada

Não há resultado confiável de carga 1/100/1.000/10.000 mudanças ou 10/50/100 usuários no histórico fornecido. Não inventar uma tabela “antes/depois”. O ganho estrutural esperado para alterações isoladas é payload de uma chave contra payload de todo o estado; bytes exatos dependem do tamanho real das chaves/valores. Os testes de sincronização existentes verificam comportamento funcional, não tráfego de rede nem latência p95.

| Métrica | Antes | Depois | Redução comprovada nesta rodada |
|---|---:|---:|---:|
| Requests por lote debounced | 1 | 1 | 0% em número; o custo por alteração agrupada segue igual |
| Bytes enviados | snapshot completo | somente chaves alteradas | não medido em bytes reais |
| Bytes recebidos | não medido | não medido | não medido |
| Queries PostgreSQL | leitura/merge/escrita do snapshot em fluxos antigos | merge incremental em uma operação na rota PATCH | redução estrutural; contagem em produção não disponível |
| Média / p95 | não medido | não medido | não medido |

## Testes de escala

- TypeScript, readiness, build e casos de sincronização são registrados no relatório final desta rodada; são testes locais e não incluem banco externo de produção.
- Cenários específicos solicitados (1, 100, 1.000 e 10.000 alterações; 10, 50 e 100 usuários concorrentes; abas/offline/reconexão/restart/falha/same-key) não foram executados com medição de bytes, queries ou p95. Classificação: **NÃO EXECUTADO**.
- Teste de egress real só pode ser comparado após deploy autorizado e janela de faturamento conhecida, usando Usage dos dois provedores e período controlado.

## Instrumentação recomendada antes de go-live

Adicionar métricas agregadas sem usuário, IP, corpo, token, conteúdo de whiteboard ou SQL: contagem/bytes HTTP por rota template e status; tamanhos PATCH; query count/duração por classe; retry e falha. Emitir agregados a cada minuto em log estruturado, com limite para cardinalidade. Comparar com painéis de custo e alertar anomalia; evitar logs por evento de desenho. O middleware atual já usa compressão e request ID; o conteúdo não deve ser registrado.

## Resposta a incidente de consumo

1. Salvar export de Usage dos provedores e comparar intervalo com release/rota, sem copiar dados pessoais.
2. Desabilitar a rota/integração causadora por feature flag ou limite de taxa; preservar autenticação e acesso ao dado.
3. Aplicar teto de gasto/uso no Railway e Vercel; no Neon limitar autoscaling e alarmes. Confirmar o que suspende workloads e o impacto para usuários.
4. Reverter release pelo SHA conhecido se a regressão for do código; não apontar o domínio a banco parcialmente migrado.
5. Registrar causa, tráfego observado e mitigação; confirmar recuperação antes de reabrir o fluxo.
