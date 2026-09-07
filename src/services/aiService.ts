import { apiFetch } from './apiFetch';
import { Subject, WeeklyCycle, StudyEntry, AIAnalysisResult } from '../types';

export interface WeeklyStudySummary {
  totalSessions: number;
  totalHours: number;
  subjectsStudied: {
    id: string;
    name: string;
    category: string;
    color: string;
    sessions: number;
    minutes: number;
    topics: string[];
  }[];
  subjectsNotStudied: {
    id: string;
    name: string;
    category: string;
    color: string;
  }[];
  allSubjects: {
    id: string;
    name: string;
    category: string;
  }[];
}

export function buildWeeklyStudySummary(
  subjects: Subject[],
  cycle: WeeklyCycle | null
): WeeklyStudySummary {
  if (!cycle) {
    return {
      totalSessions: 0,
      totalHours: 0,
      subjectsStudied: [],
      subjectsNotStudied: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        color: s.color,
      })),
      allSubjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
      })),
    };
  }

  const entries = Object.values(cycle.entries || {}) as StudyEntry[];
  const completedEntries = entries.filter((e) => e.completed);

  // Group by subject
  const subjectMap = new Map<
    string,
    { sessions: number; minutes: number; topics: string[] }
  >();

  for (const entry of completedEntries) {
    const prev = subjectMap.get(entry.subjectId) || {
      sessions: 0,
      minutes: 0,
      topics: [],
    };
    prev.sessions += 1;
    prev.minutes += entry.durationMinutes || 60;
    if (entry.topic && !prev.topics.includes(entry.topic)) {
      prev.topics.push(entry.topic);
    }
    subjectMap.set(entry.subjectId, prev);
  }

  const subjectsStudied: WeeklyStudySummary['subjectsStudied'] = [];
  const subjectsNotStudied: WeeklyStudySummary['subjectsNotStudied'] = [];

  let totalMinutes = 0;
  let totalSessions = 0;

  for (const subject of subjects) {
    const stats = subjectMap.get(subject.id);
    if (stats && stats.sessions > 0) {
      subjectsStudied.push({
        id: subject.id,
        name: subject.name,
        category: subject.category,
        color: subject.color,
        sessions: stats.sessions,
        minutes: stats.minutes,
        topics: stats.topics,
      });
      totalMinutes += stats.minutes;
      totalSessions += stats.sessions;
    } else {
      subjectsNotStudied.push({
        id: subject.id,
        name: subject.name,
        category: subject.category,
        color: subject.color,
      });
    }
  }

  // Sort studied by minutes descending
  subjectsStudied.sort((a, b) => b.minutes - a.minutes);

  return {
    totalSessions,
    totalHours: Math.round(totalMinutes / 60),
    subjectsStudied,
    subjectsNotStudied,
    allSubjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
  };
}

export async function fetchAIStudyAnalysis(
  summary: WeeklyStudySummary
): Promise<{ source: string; data: AIAnalysisResult }> {
  try {
    const response = await apiFetch('/api/ai/study-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ weeklySummary: summary }),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn('Serviço de análise de IA em modo de contingência local:', err);
  }

  // Client-side tactical fallback
  const top = summary.subjectsStudied[0] || {
    name: 'Edital CFO CBMERJ',
    sessions: 0,
    minutes: 0,
  };

  return {
    source: 'heuristic',
    data: {
      topStudiedSubject: {
        name: top.name,
        hours: Number((top.minutes / 60).toFixed(1)),
        sessions: top.sessions,
        analysis: 'Ritmo tático de preparação para o CFO CBMERJ.',
        status: top.sessions > 2 ? 'Consolidado' : 'Em desenvolvimento',
      },
      prioritySubjectsForNextWeek: [
        {
          name: 'Física',
          reason: 'Disciplina com maior índice de corte na prova objetiva do CFO.',
          recommendedHours: 3.5,
          urgency: 'Crítica',
          topicsSuggested: ['Cinemática Escalar e Vetorial', 'Termodinâmica e Calorimetria'],
        },
        {
          name: 'Química',
          reason: 'Peso direto na pontuação geral para Oficiais Bombeiros.',
          recommendedHours: 3,
          urgency: 'Alta',
          topicsSuggested: ['Estequiometria', 'Soluções e Termoquímica'],
        },
        {
          name: 'Matemática',
          reason: 'Critério eliminatório de pontuação mínima.',
          recommendedHours: 3,
          urgency: 'Alta',
          topicsSuggested: ['Funções e Geometria Plana', 'Trigonometria'],
        },
      ],
      balanceDiagnosis: 'Cronograma tático alinhado com os tópicos de maior peso da banca examinadora.',
      weeklyActionPlan: [
        { day: 'Segunda-feira', focusSubject: 'Física', goal: 'Teoria + 15 questões de provas anteriores', suggestedMinutes: 90 },
        { day: 'Terça-feira', focusSubject: 'Matemática', goal: 'Resolução de exercícios modelo', suggestedMinutes: 90 },
        { day: 'Quarta-feira', focusSubject: 'Química', goal: 'Revisão ativa e fórmulas', suggestedMinutes: 90 },
        { day: 'Quinta-feira', focusSubject: 'Língua Portuguesa / Redação', goal: '1 proposta de redação modelo CFO', suggestedMinutes: 90 },
        { day: 'Sexta-feira', focusSubject: 'Biologia', goal: 'Fisiologia humana e primeiros socorros', suggestedMinutes: 60 },
        { day: 'Sábado', focusSubject: 'Simulado Geral & Revisões', goal: 'Bateria de simulados cronometrados', suggestedMinutes: 120 },
        { day: 'Domingo', focusSubject: 'Descanso Ativo & TAF', goal: 'Treinamento de corrida e natação para o CFO', suggestedMinutes: 45 },
      ],
      tacticalTip: 'Nunca negligencie Física e Química. A aprovação no CFO CBMERJ é decidida no equilíbrio das exatas.',
      equilibriumScore: 80,
    },
  };
}
