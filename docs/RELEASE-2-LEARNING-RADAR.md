# Release 2 - Inteligencia da banca, perfil do aluno e radar

## Entregue

- Migration 020 para tentativas e perfis de conhecimento.
- `POST /api/student/question-attempts` corrige pelo gabarito do servidor.
- `GET /api/student/knowledge-profile` retorna mastery por disciplina, assunto e subassunto.
- `GET /api/student/priority-radar` cruza mastery com frequencia de provas aprovadas.
- Mastery considera recencia, volume, consistencia, confianca e tempo.
- Tendencia historica usa janela recente comparada ao historico total.
- Nova tela Radar no menu do aluno.
- Dados sem historico suficiente sao exibidos como ausencia de dados, nao como estatistica inventada.

## Verificacao

- Typecheck aprovado.
- Build aprovado.
- Suíte readiness completa aprovada.
- Teste dedicado `student_learning.test.ts` aprovado.
