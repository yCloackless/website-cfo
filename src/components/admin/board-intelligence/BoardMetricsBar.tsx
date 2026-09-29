import React from 'react';
import { FileUp, CheckCircle2, Clock, ShieldCheck, History } from 'lucide-react';
import { BoardProfile, BoardStats } from './types';

interface BoardMetricsBarProps {
  profile?: BoardProfile | null;
  stats?: BoardStats | null;
}

export const BoardMetricsBar: React.FC<BoardMetricsBarProps> = ({ profile, stats }) => {
  const periodText = profile?.periodStart
    ? `${profile.periodStart} — ${profile.periodEnd || profile.periodStart}`
    : 'Sem dados';

  const confidencePct = stats?.sampleConfidence !== undefined
    ? Math.round((stats.sampleConfidence || 0) * 100)
    : 0;

  const versionText = profile?.activeVersion ? `v${profile.activeVersion}` : 'Nenhuma';

  const metrics = [
    {
      label: 'Provas analisadas',
      value: profile?.examCount || 0,
      detail: profile?.examCount ? 'Homologadas' : 'Nenhuma',
      icon: FileUp,
      color: 'text-cyan-400',
    },
    {
      label: 'Questões aprovadas',
      value: profile?.questionCount || 0,
      detail: profile?.questionCount ? 'Base calibrada' : 'Aguardando provas',
      icon: CheckCircle2,
      color: 'text-emerald-400',
    },
    {
      label: 'Período histórico',
      value: periodText,
      detail: profile?.periodStart ? 'Intervalo analisado' : 'Sem histórico',
      icon: Clock,
      color: 'text-amber-400',
    },
    {
      label: 'Confiança dos dados',
      value: `${confidencePct}%`,
      detail: confidencePct >= 80 ? 'Amostragem alta' : confidencePct > 0 ? 'Amostragem em treino' : 'Sem amostragem',
      icon: ShieldCheck,
      color: confidencePct >= 80 ? 'text-emerald-400' : 'text-cyan-400',
    },
    {
      label: 'Versão ativa',
      value: versionText,
      detail: profile?.activeVersion ? 'Snapshot publicado' : 'Sem publicação',
      icon: History,
      color: profile?.activeVersion ? 'text-cyan-400' : 'text-slate-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.label}
            className="bg-[#0B1220] border border-slate-800/90 rounded-xl p-3 flex flex-col justify-between hover:border-slate-700/80 transition-colors"
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 truncate">
                {m.label}
              </span>
              <Icon className={`w-3.5 h-3.5 ${m.color} shrink-0 ml-1`} />
            </div>

            <div className="mt-2">
              <div className="text-xl font-bold tracking-tight text-white truncate">
                {m.value}
              </div>
              <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                {m.detail}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
