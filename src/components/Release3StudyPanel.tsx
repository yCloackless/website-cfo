import React, { useCallback, useEffect, useState } from 'react';
import { AppTheme } from '../types';
import { Check, ClipboardList, PlayCircle, RefreshCw, Sparkles } from 'lucide-react';

type Revision = {
  id: string;
  discipline: string;
  topic: string;
  subtopic: string;
  dueAt: string;
  intervalDays: number;
};

type Recommendation = {
  id: string;
  discipline: string;
  topic: string;
  subtopic: string;
  attempts: number;
  masteryScore: number;
  reason: string;
};

type Simulation = {
  id: string;
  mode: 'TRADITIONAL' | 'ADAPTIVE';
  status: string;
  questionIds: string[];
  questions?: Array<{ id: string; statement: string; supportText?: string | null; options: Array<{ letter?: string; text?: string }>; topic: string; discipline: string; subtopic: string }>;
  analysis?: { answered: number; correct: number; wrong: number; accuracyPercent: number; averageResponseSeconds: number | null; byDiscipline: Array<{ discipline: string; total: number; correct: number }>; recommendations: Array<{ id: string; discipline: string; topic: string; subtopic: string; masteryScore: number; reason: string }> };
};

type AnswerResult = { questionId: string; discipline: string; topic: string; isCorrect: boolean };

interface Release3StudyPanelProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const authHeaders = (): HeadersInit => ({
  Authorization: `Bearer ${localStorage.getItem('cfo_terminal_session') || ''}`,
});

export const Release3StudyPanel: React.FC<Release3StudyPanelProps> = ({ theme = 'dark', showToast }) => {
  const dark = theme === 'dark';
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [answerResults, setAnswerResults] = useState<AnswerResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [revisionResponse, recommendationResponse] = await Promise.all([
        fetch('/api/student/revisions?dueOnly=true', { headers }),
        fetch('/api/student/recommendations?limit=5', { headers }),
      ]);
      if (!revisionResponse.ok || !recommendationResponse.ok) throw new Error('STUDY_DATA_FAILED');
      const revisionData = await revisionResponse.json();
      const recommendationData = await recommendationResponse.json();
      setRevisions(Array.isArray(revisionData.revisions) ? revisionData.revisions : []);
      setRecommendations(Array.isArray(recommendationData.recommendations) ? recommendationData.recommendations : []);
    } catch {
      showToast?.('Não foi possível carregar o plano inteligente agora.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);

  const completeRevision = async (id: string) => {
    const response = await fetch(`/api/student/revisions/${id}/complete`, { method: 'POST', headers: authHeaders() });
    if (!response.ok) {
      showToast?.('Não foi possível concluir a revisão.', 'error');
      return;
    }
    setRevisions((current) => current.filter((revision) => revision.id !== id));
    showToast?.('Revisão concluída e registrada.', 'success');
  };

  const createSimulation = async (mode: 'TRADITIONAL' | 'ADAPTIVE') => {
    setCreating(true);
    try {
      const response = await fetch('/api/student/simulations', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, count: 10 }),
      });
      if (!response.ok) throw new Error('SIMULATION_FAILED');
      const data = await response.json();
      setSimulation(data.simulation || null);
      setQuestionIndex(0);
      setSelectedOption(null);
      setAnswerResults([]);
      showToast?.(`Simulado ${mode === 'ADAPTIVE' ? 'adaptativo' : 'tradicional'} criado.`, 'success');
    } catch {
      showToast?.('Não foi possível criar o simulado.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const createReinforcement = async (questionIds: string[]) => {
    setCreating(true);
    try {
      const response = await fetch('/api/student/simulations/reinforcement', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIds }) });
      if (!response.ok) throw new Error('REINFORCEMENT_FAILED');
      const data = await response.json();
      setSimulation(data.simulation || null);
      setQuestionIndex(0);
      setSelectedOption(null);
      setAnswerResults([]);
      showToast?.('Sessão de reforço criada com as questões recomendadas.', 'success');
    } catch {
      showToast?.('Não foi possível criar a sessão de reforço.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const submitAnswer = async () => {
    const question = simulation?.questions?.[questionIndex];
    if (!question || !selectedOption || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/student/question-attempts', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, selectedOption, simulationId: simulation.id }),
      });
      if (!response.ok) throw new Error('ATTEMPT_FAILED');
      const result = await response.json();
      setAnswerResults((current) => [...current, { questionId: question.id, discipline: question.discipline, topic: question.topic, isCorrect: Boolean(result.isCorrect) }]);
      if (questionIndex + 1 >= (simulation?.questions?.length || 0)) {
        const finish = await fetch(`/api/student/simulations/${simulation.id}/status`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) });
        if (finish.ok) setSimulation((await finish.json()).simulation || simulation);
        showToast?.('Simulado concluído e desempenho registrado.', 'success');
      } else {
        if (simulation.mode === 'ADAPTIVE') {
          const adaptResponse = await fetch(`/api/student/simulations/${simulation.id}/adapt`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ answeredQuestionId: question.id, isCorrect: Boolean(result.isCorrect) }) });
          if (adaptResponse.ok) setSimulation((await adaptResponse.json()).simulation || simulation);
        }
        setQuestionIndex((index) => index + 1);
        setSelectedOption(null);
      }
    } catch {
      showToast?.('Não foi possível registrar esta resposta.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startSimulation = async () => {
    if (!simulation || simulation.status !== 'CREATED') return;
    const response = await fetch(`/api/student/simulations/${simulation.id}/status`, { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS' }) });
    if (response.ok) setSimulation((await response.json()).simulation || simulation);
  };

  return (
    <section className={`mb-6 rounded-2xl border p-5 ${dark ? 'border-cyan-900/60 bg-[#071522]' : 'border-cyan-200 bg-cyan-50'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-400">Release 3 · motor persistente</p>
          <h2 className={`mt-1 text-lg font-black ${dark ? 'text-white' : 'text-slate-900'}`}>Próximo estudo recomendado</h2>
          <p className={`mt-1 text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Revisões e simulados calculados no servidor a partir do seu desempenho.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 self-start rounded-lg border border-cyan-800/60 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-950/40" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {loading ? <p className="mt-5 text-xs text-slate-400">Calculando recomendações...</p> : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className={`rounded-xl border p-4 ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-cyan-100 bg-white'}`}>
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300"><Sparkles className="h-4 w-4" /> Revisões vencidas</div>
            {revisions.length === 0 ? <p className="mt-3 text-xs text-slate-500">Nenhuma revisão pendente para hoje.</p> : <div className="mt-3 space-y-2">{revisions.slice(0, 4).map((revision) => <div key={revision.id} className="flex items-start justify-between gap-2 text-xs"><div><p className={dark ? 'text-slate-200' : 'text-slate-800'}>{revision.topic}</p><p className="text-[10px] text-slate-500">{revision.discipline} · {revision.subtopic}</p></div><button title="Concluir revisão" onClick={() => void completeRevision(revision.id)} className="rounded-md p-1 text-emerald-400 hover:bg-emerald-950/40"><Check className="h-4 w-4" /></button></div>)}</div>}
          </div>

          <div className={`rounded-xl border p-4 ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-cyan-100 bg-white'}`}>
            <div className="flex items-center gap-2 text-xs font-bold text-rose-300"><ClipboardList className="h-4 w-4" /> Questões recomendadas</div>
            {recommendations.length === 0 ? <p className="mt-3 text-xs text-slate-500">Importe e revise questões para alimentar o motor.</p> : <div className="mt-3 space-y-2">{recommendations.slice(0, 4).map((item) => <div key={item.id} className="text-xs"><p className={dark ? 'text-slate-200' : 'text-slate-800'}>{item.topic}</p><p className="text-[10px] text-slate-500">Domínio {Math.round(item.masteryScore)} · {item.attempts} tentativa(s)</p></div>)}</div>}
          </div>

          <div className={`rounded-xl border p-4 ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-cyan-100 bg-white'}`}>
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-300"><PlayCircle className="h-4 w-4" /> Gerar sessão</div>
            <p className="mt-3 text-xs text-slate-500">A sessão recebe uma seleção versionada de questões.</p>
            <div className="mt-4 flex flex-wrap gap-2"><button disabled={creating} onClick={() => void createSimulation('TRADITIONAL')} className="rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-cyan-500 disabled:opacity-50">Tradicional</button><button disabled={creating} onClick={() => void createSimulation('ADAPTIVE')} className="rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-violet-500 disabled:opacity-50">Adaptativo</button></div>
            {simulation && <p className="mt-3 text-[10px] text-emerald-400">Sessão criada: {simulation.questionIds.length} questões · {simulation.status}</p>}
          </div>
        </div>
      )}
      {simulation?.questions && simulation.questions.length > 0 && simulation.status !== 'COMPLETED' && (
        <div className={`mt-4 rounded-xl border p-4 ${dark ? 'border-cyan-800/60 bg-slate-950/60' : 'border-cyan-200 bg-white'}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Sessão em execução</p><p className={`mt-1 text-xs font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>Questão {questionIndex + 1} de {simulation.questions.length}</p></div>{simulation.status === 'CREATED' && <button onClick={() => void startSimulation()} className="rounded-lg bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white">Iniciar</button>}</div>
          {simulation.status === 'IN_PROGRESS' && <div className="mt-4"><p className={`text-sm font-semibold leading-relaxed ${dark ? 'text-slate-100' : 'text-slate-900'}`}>{simulation.questions[questionIndex].statement}</p><p className="mt-2 text-[10px] text-slate-500">{simulation.questions[questionIndex].discipline} · {simulation.questions[questionIndex].topic} · {simulation.questions[questionIndex].subtopic}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{simulation.questions[questionIndex].options.map((option, index) => { const letter = option.letter || String.fromCharCode(65 + index); return <button key={letter} onClick={() => setSelectedOption(letter)} className={`rounded-lg border p-3 text-left text-xs transition-colors ${selectedOption === letter ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : dark ? 'border-slate-700 text-slate-300 hover:border-cyan-700' : 'border-slate-200 text-slate-700 hover:border-cyan-300'}`}><strong>{letter}.</strong> {option.text || ''}</button>; })}</div><button disabled={!selectedOption || submitting} onClick={() => void submitAnswer()} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{submitting ? 'Registrando...' : questionIndex + 1 === simulation.questions.length ? 'Concluir simulado' : 'Próxima questão'}</button></div>}
        </div>
      )}
      {simulation?.status === 'COMPLETED' && (simulation.analysis || answerResults.length > 0) && (() => {
        const correct = answerResults.filter((result) => result.isCorrect).length;
        const byDiscipline = answerResults.reduce<Record<string, { total: number; correct: number }>>((acc, result) => {
          acc[result.discipline] ||= { total: 0, correct: 0 };
          acc[result.discipline].total += 1;
          if (result.isCorrect) acc[result.discipline].correct += 1;
          return acc;
        }, {});
        const report = simulation.analysis;
        return <div className={`mt-4 rounded-xl border p-4 ${dark ? 'border-emerald-800/60 bg-emerald-950/20' : 'border-emerald-200 bg-emerald-50'}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Resultado do simulado</p>
          <div className="mt-2 flex flex-wrap items-end gap-4"><div><span className={`text-3xl font-black ${dark ? 'text-white' : 'text-slate-900'}`}>{report?.accuracyPercent ?? Math.round((correct / answerResults.length) * 100)}%</span><p className="text-[10px] text-slate-500">aproveitamento</p></div><p className="text-xs text-emerald-300">{report?.correct ?? correct} acerto(s) · {report?.wrong ?? (answerResults.length - correct)} erro(s) · tempo médio {report?.averageResponseSeconds ?? '—'}s</p></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{(report?.byDiscipline || (Object.entries(byDiscipline) as Array<[string, { total: number; correct: number }]>).map(([discipline, score]) => ({ discipline, ...score }))).map((score) => <div key={score.discipline} className={`rounded-lg border p-2 text-xs ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-emerald-100 bg-white'}`}><div className="flex justify-between gap-2"><span>{score.discipline}</span><strong>{score.correct}/{score.total}</strong></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(score.correct / score.total) * 100}%` }} /></div></div>)}</div>
          <p className="mt-4 text-xs text-slate-400">As respostas já alimentaram seu domínio, radar de prioridades e agenda de revisão.</p>
          {report?.recommendations?.length ? <div className="mt-4 border-t border-emerald-900/50 pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Reforço recomendado</p><button disabled={creating} onClick={() => void createReinforcement(report.recommendations.map((recommendation) => recommendation.id))} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-amber-500 disabled:opacity-50">Iniciar reforço</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{report.recommendations.slice(0, 4).map((recommendation) => <div key={recommendation.id} className={`rounded-lg border p-2 text-xs ${dark ? 'border-slate-800 bg-slate-950/40' : 'border-emerald-100 bg-white'}`}><p className={dark ? 'text-slate-200' : 'text-slate-800'}>{recommendation.topic}</p><p className="text-[10px] text-slate-500">{recommendation.discipline} · {recommendation.subtopic}</p><p className="mt-1 text-[10px] text-amber-300">Domínio atual: {Math.round(recommendation.masteryScore)}</p></div>)}</div></div> : null}
        </div>;
      })()}
    </section>
  );
};

export default Release3StudyPanel;
