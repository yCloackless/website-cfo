import { apiFetch } from './apiFetch';
import { AIAnalysisResult, MonthlyStudySummary } from '../types';

export type WeeklyStudySummary = MonthlyStudySummary;
export { buildMonthlyStudySummary } from '../utils/studyBalance';

export async function fetchAIStudyAnalysis(
  summary: MonthlyStudySummary
): Promise<{ source: string; data: AIAnalysisResult }> {
  if (typeof window !== 'undefined') {
    try {
      const response = await apiFetch('/api/ai/study-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ monthlySummary: summary }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.warn('Serviço de análise de IA em modo de contingência local:', err);
    }
  }

  return buildDeterministicStudyAnalysis(summary);
}

export function buildDeterministicStudyAnalysis(
  summary: MonthlyStudySummary
): { source: string; data: AIAnalysisResult } {
  // Deterministic client fallback grounded solely in real user monthly data (never fabricates hours or subjects)
  const hasRealStudy = summary.totalMinutes > 0 || summary.totalSessions > 0;
  const top = summary.subjectsStudied[0];

  const sortedLow = [...summary.allSubjects].sort((a, b) => {
    const minA = summary.bySubject[a.id]?.minutes || 0;
    const minB = summary.bySubject[b.id]?.minutes || 0;
    return minA - minB;
  });

  const prioritySubjectsForNextWeek = sortedLow.slice(0, 4).map((sub) => {
    const balance = summary.bySubject[sub.id];
    const mins = balance?.minutes || 0;
    const hrs = Number((mins / 60).toFixed(1));
    const studied = summary.subjectsStudied.find((s) => s.id === sub.id);
    return {
      name: sub.name,
      reason:
        mins === 0
          ? 'Sem horas registradas neste mês na sua conta.'
          : `Soma ${hrs}h no mês atual (${balance?.sharePct || 0}% do total), abaixo da média das matérias.`,
      recommendedHours: hasRealStudy ? (mins === 0 ? 3 : 2) : 0,
      urgency: mins === 0 ? 'alta' : 'media',
      topicsSuggested:
        studied && studied.topics.length > 0
          ? studied.topics.slice(0, 2)
          : ['Registrar a próxima sessão no cronômetro ou cronograma'],
    };
  });

  const days = [
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
    'Domingo',
  ];
  const planSubjects = sortedLow.length > 0 ? sortedLow : [{ id: 'empty', name: 'Nenhuma matéria', category: '' }];
  const weeklyActionPlan = days.map((day, idx) => {
    const target = planSubjects[idx % planSubjects.length];
    const mins = summary.bySubject[target.id]?.minutes || 0;
    return {
      day,
      focusSubject: target.name,
      goal: hasRealStudy
        ? mins === 0
          ? `Iniciar carga mensal de ${target.name}`
          : `Reforçar ${target.name} (${Number((mins / 60).toFixed(1))}h no mês)`
        : 'Aguardando primeiro estudo real registrado',
      suggestedMinutes: hasRealStudy ? (mins === 0 ? 90 : 60) : 0,
    };
  });

  return {
    source: 'heuristic',
    data: {
      topStudiedSubject: {
        name: top ? top.name : 'Nenhum estudo registrado no mês',
        hours: top ? Number((top.minutes / 60).toFixed(1)) : 0,
        sessions: top ? top.sessions : 0,
        analysis: hasRealStudy && top
          ? `No mês atual você acumulou ${Number((top.minutes / 60).toFixed(1))}h em ${top.name} (${top.sessions} sessões reais).`
          : 'Ainda não há sessões no cronômetro nem estudos concluídos neste mês para esta conta.',
        status: hasRealStudy ? 'Líder real do mês' : 'Sem registros no mês',
      },
      prioritySubjectsForNextWeek,
      balanceDiagnosis: !hasRealStudy
        ? '0h registradas neste mês até o momento. Nenhum dado fictício foi gerado.'
        : summary.subjectsNotStudied.length > 0
          ? `${summary.subjectsNotStudied.length} matéria(s) ainda estão zeradas neste mês na sua conta.`
          : `Todas as ${summary.allSubjects.length} matérias possuem registro real neste mês (${summary.totalHours}h no total).`,
      weeklyActionPlan,
      tacticalTip: hasRealStudy
        ? 'Matérias em vermelho no cronograma estão abaixo de 40% da sua média mensal. Equilibre-as para evitar lacunas no edital.'
        : 'Inicie uma sessão no cronômetro ou marque no cronograma para ativar seu termômetro real do mês.',
      equilibriumScore: summary.equilibriumScore,
    },
  };
}
