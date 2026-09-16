# Instruções para agentes deste projeto

## Memória compartilhada

Este projeto usa o cérebro de engenharia em:

`C:\Users\renas\Downloads\renas-ai-brain`

Antes de iniciar uma tarefa relevante, leia:

- `AI/CURRENT-CONTEXT.md`
- `AI/DECISIONS.md`
- `Projects/Cronograma CFO CBMERJ.md`
- `Architecture/Cronograma CFO CBMERJ.md`

O caminho também está disponível na variável de ambiente `OBSIDIAN_VAULT_PATH`.

## Regras

- Preserve alterações locais existentes; sempre leia `git status` e `git diff --stat` antes de editar.
- Não leia, exponha ou copie secrets de `.env`.
- Não substitua decisões ou notas sem confirmar evidência no código.
- Depois de uma decisão técnica, atualize o cérebro compartilhado.
- Ao terminar uma tarefa relevante, atualize `AI/CURRENT-CONTEXT.md` e registre decisões permanentes em `AI/DECISIONS.md`.
- Execute testes proporcionais à mudança e registre falhas sem escondê-las.
- Consulte `docs/PROJECT_CAPABILITIES.md` para conhecer todos os módulos existentes e o roadmap antes de propor novas implementações.

## Checklist Obrigatório de Inicialização do Agente

Antes de iniciar qualquer alteração no código:
1. `git status` e `git diff --stat` (garantir árvore limpa ou entender alterações em andamento).
2. Ler `AI/CURRENT-CONTEXT.md` e `AI/DECISIONS.md` no vault `C:\Users\renas\Downloads\renas-ai-brain`.
3. Consultar `docs/PROJECT_CAPABILITIES.md` para entender as funcionalidades ativas do sistema.
4. Executar verificação rápida de sanidade: `node scripts/readiness-suite.mjs` e `npx tsc --noEmit`.
5. Trabalhar sempre no modelo GSD: **INVESTIGAR → PLANEJAR → IMPLEMENTAR → VALIDAR → TESTAR → REVISAR → COMMIT → PARAR**.

## Skills

As skills globais `obsidian-*` estão instaladas para Codex e Antigravity. Se não forem exibidas, reinicie o agente e verifique se ele foi iniciado como uma nova sessão.
