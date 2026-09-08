---
status: complete
created: 2026-09-08
---

# Troca de conta exclusiva do ADM

Permitir que o ADM entre na visao de contas ativas a partir do perfil inferior, com retorno seguro para a conta original e suporte responsivo.

## Tasks

- [x] Registrar sessoes de impersonacao no banco com ADM de origem e sessao pai.
- [x] Criar endpoints server-side para iniciar e encerrar a troca de conta.
- [x] Exigir permissao admin e Step-Up antes de iniciar a troca.
- [x] Adicionar perfil inferior, seletor de contas e retorno ao ADM no mobile.
- [x] Isolar o estado persistente de estudos entre contas.
- [x] Validar typecheck, build e readiness suite.
