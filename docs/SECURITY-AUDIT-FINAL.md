# Relatório final de segurança — CFO CBMERJ

Data: 08/09/2026  |  Escopo: código, dependências, API local, SQLite, integrações, Docker e backups.

## Resultado executivo

Foram confirmadas cinco falhas (3 altas, 2 médias) em ambiente isolado. Todas foram corrigidas e cobertas por regressões. A suíte final passou com 19 suítes e 138 testes; typecheck, build e `npm audit` também passaram (0 vulnerabilidades conhecidas de produção).

## Achados e correções

| ID | Risco confirmado | Correção aplicada |
|---|---|---|
| F-01 Alta | Ativação persistida de 2FA era ignorada | Configuração persistida agora é aplicada e PATCH grava o estado |
| F-02 Alta | TOTP secreto continuava disponível após ativação | Setup retorna 409 e nunca revela segredo ativo; `no-store` |
| F-03 Alta | Notion aceitava `pageId` arbitrário | Check-in exige página conhecida no cache de revisões; desconhecida retorna 404 |
| F-04 Média | IA sem quota dedicada e prompts sem limite | Limite por usuário (30/15 min) e limites por campo; excesso retorna 413/429 |
| F-05 Média | Código de recuperação aparecia no log de desenvolvimento | Logs não incluem o código; teste captura e verifica ausência |

## Evidências

- `npm test`: 19 suites / 138 testes aprovados.
- `npm run typecheck` e `npm run build`: aprovados.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Readiness local: headers, CORS, RBAC, sessões, 2FA, SSE, uploads, backups e carga limitada (64 requisições concorrentes; p95 ~439 ms) exercitados sem chamadas reais a provedores.
- Integridade SQLite e round-trip de backup binário aprovados.

## Limites e ações pendentes

Não foi executado DDoS, negação de serviço sustentada, exclusão, restauração destrutiva, acesso a dados reais ou chamada real a Google/Notion/Resend. Isso seria inseguro e fora de um teste autorizado de produção.

Antes de publicar: habilitar/verificar 2FA administrativo, remover e-mail permitido do bundle público, trocar GeoIP para HTTPS, revisar CSP/tokens em localStorage e validar hardening do container/offsite backup com Docker e credenciais reais.
