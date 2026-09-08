---
status: complete
completed: 2026-09-08
---

# Summary

O ADM agora pode trocar para contas ativas de cadete ou suporte pelo perfil no rodape da barra lateral. A troca cria uma sessao server-side de curta duracao vinculada ao ADM, e a conta assumida nao recebe poderes administrativos.

## Seguranca e mobile

- A API bloqueia cadete, suporte e sessoes assumidas de endpoints administrativos.
- O inicio exige Step-Up e o encerramento revoga a sessao assumida.
- O estado local e reidratado para a conta correta ao trocar e ao retornar.
- O seletor usa painel inferior no mobile para evitar overflow horizontal.

## Verificacao

- `npm run typecheck` passou.
- `npm run build` passou.
- `npm test` passou: 113 testes em 17 grupos, sem falhas.
