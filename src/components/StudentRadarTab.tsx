import React, { useEffect, useState } from 'react';
import { AppTheme } from '../types';

type RadarItem = { discipline: string; topic: string; subtopic: string; masteryScore: number; frequencyPercent: number; priorityScore: number; attempts: number; reason: string; trend: string };

export const StudentRadarTab: React.FC<{ theme: AppTheme }> = ({ theme }) => {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const dark = theme === 'dark';
  useEffect(() => {
    const token = localStorage.getItem('cfo_terminal_session') || '';
    fetch('/api/student/priority-radar', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json()).then((data) => setItems(Array.isArray(data.priorities) ? data.priorities : [])).finally(() => setLoading(false));
  }, []);
  return <section className="space-y-5">
    <div><p className="text-[10px] uppercase tracking-[0.25em] text-cyan-400 font-bold">Release 2</p><h1 className={`text-2xl font-black ${dark ? 'text-slate-100' : 'text-slate-900'}`}>Radar de prioridades</h1><p className={`text-sm mt-1 ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Fraqueza real do aluno cruzada com a incidência histórica da banca.</p></div>
    {loading ? <div className="p-8 text-sm text-slate-400">Calculando seu radar...</div> : items.length === 0 ? <div className={`rounded-2xl border p-8 text-sm ${dark ? 'border-slate-800 bg-[#0B1528] text-slate-400' : 'border-slate-200 bg-white text-slate-600'}`}>Ainda não há tentativas suficientes para gerar prioridades.</div> : <div className="grid gap-3">{items.slice(0, 20).map((item) => <article key={`${item.discipline}-${item.topic}-${item.subtopic}`} className={`rounded-2xl border p-4 ${dark ? 'border-slate-800 bg-[#0B1528]' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-cyan-400">{item.discipline}</p><h2 className={`text-sm font-black mt-1 ${dark ? 'text-white' : 'text-slate-900'}`}>{item.topic} · {item.subtopic}</h2></div><span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-300">Prioridade {item.priorityScore}</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span>Domínio <strong>{Math.round(item.masteryScore)}</strong></span><span>Banca <strong>{item.frequencyPercent}%</strong></span><span>Tentativas <strong>{item.attempts}</strong></span></div><p className={`mt-3 text-xs ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{item.reason}</p></article>)}</div>}
  </section>;
};
