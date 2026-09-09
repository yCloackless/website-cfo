# AI-SPEC — Coach de preparação

## Objetivo

Gerar uma orientação diária curta a partir do domínio, erros, revisões vencidas e desempenho recente do aluno.

## Contrato

- Entrada: apenas métricas agregadas e tópicos; nunca enviar senha, token ou dados pessoais.
- Saída estruturada: `headline`, `diagnosis`, `nextActions[]`, `warnings[]`.
- Fallback determinístico obrigatório quando o provedor estiver indisponível.
- O texto gerado é orientação educacional, não garantia de aprovação nem aconselhamento médico.
- Limite de tamanho e rate limit aplicados no servidor.

## Avaliação

- JSON válido e campos obrigatórios presentes.
- Ações devem apontar para tópicos existentes no perfil do aluno.
- Fallback deve funcionar sem chave de provedor.
- Testes cobrem autorização, payload mínimo e resposta de contingência.
