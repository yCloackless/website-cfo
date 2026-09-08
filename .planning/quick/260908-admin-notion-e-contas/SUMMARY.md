---
status: complete
completed: 2026-09-08
---

# Summary

O painel administrativo agora possui uma aba exclusiva para administradores gerenciarem a permissao da Agenda Notion e as contas do sistema.

## Resultado

- Administradores sempre mantem acesso ao Notion.
- Cadetes e suporte podem receber ou perder acesso individualmente.
- Criacao e exclusao de contas exigem admin pleno e Step-Up.
- Admin mestre e a propria conta em uso nao podem ser excluidos.
- Operacoes registram auditoria server-side.

## Verificacao

- `npm run typecheck` passou.
- `npm run build` passou.
- `npm test` passou: 113 testes em 17 grupos, sem falhas.
