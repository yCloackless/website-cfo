import React, { useEffect, useState } from 'react';
import { AppTheme } from '../types';
import { BrainCircuit, RefreshCw } from 'lucide-react';

type CoachPlan = { headline: string; diagnosis: string; nextActions: string[]; warnings: string[] };

export const StudentCoachPanel: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const dark = theme === 'dark';
  const [plan, setPlan] = useState<CoachPlan | null>(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    fetch('/api/student/coach-plan', { headers: { Authorization: `Bearer ${localStorage.getItem('cfo_terminal_session') || ''}` } }).then((response) => response.json()).then((data) => { setPlan(data.coachPlan || null); setSource(data.source || ''); }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  return <section className={`mb-5 rounded-2xl border p-5 ${dark ? 'border-violet-900/60 bg-[#100b20]' : 'border-violet-200 bg-violet-50'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-400">Release 4 · Coach</p><h2 className={`mt-1 text-lg font-black ${dark ? 'text-white' : 'text-slate-900'}`}>Orientação personalizada</h2></div><button onClick={load} disabled={loading} className="rounded-lg border border-violet-800/60 p-2 text-violet-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>{loading ? <p className="mt-4 text-xs text-slate-400">Montando seu plano...</p> : plan ? <div className="mt-4 grid gap-4 md:grid-cols-3"><div className="md:col-span-2"><div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-violet-400" /><h3 className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>{plan.headline}</h3></div><p className="mt-2 text-xs text-slate-400">{plan.diagnosis}</p><ul className="mt-3 space-y-2">{plan.nextActions.map((action) => <li key={action} className="text-xs text-slate-300">• {action}</li>)}</ul></div><div><p className="text-[10px] font-bold uppercase text-amber-300">Atenção</p>{plan.warnings.length ? plan.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-200">{warning}</p>) : <p className="mt-2 text-xs text-emerald-300">Nenhum alerta relevante.</p>}<p className="mt-4 text-[10px] text-slate-500">Fonte: {source || 'heurística'}</p></div></div> : <p className="mt-4 text-xs text-slate-400">Ainda não há dados suficientes para orientar o próximo estudo.</p>}</section>;
};
