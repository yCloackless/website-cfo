import React from 'react';
import { Crown, Check, Lock } from 'lucide-react';
import { PRIZE_LADDER, type PrizeStep } from '../../utils/millionGameShared';

interface PrizeLadderProps {
  currentLevel: number;
  currentPrizeInfo: PrizeStep;
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

const REVERSED_LADDER = [...PRIZE_LADDER].reverse();

export const PrizeLadder: React.FC<PrizeLadderProps> = ({ currentLevel, currentPrizeInfo }) => {
  return (
    <aside className="rounded-2xl border border-amber-400/25 bg-[#070d1f]/90 backdrop-blur-md p-4 shadow-[0_0_40px_rgba(245,158,11,0.08)] flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-amber-400/20 pb-2.5">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">
            Escada de Prêmios
          </h3>
        </div>
        <span className="text-[11px] font-bold text-sky-300 tabular-nums">
          {currentLevel}/16
        </span>
      </div>

      {/* Resumo ao vivo: Errar / Parar / Acertar */}
      <div className="grid grid-cols-3 gap-1.5 text-center tabular-nums">
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-rose-300/80">Errar</p>
          <p className="text-xs font-black text-rose-300 mt-0.5">
            {formatBRL(currentPrizeInfo.wrongPrize)}
          </p>
        </div>
        <div className="rounded-xl border border-amber-400/30 bg-amber-950/35 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-300/80">Parar</p>
          <p className="text-xs font-black text-amber-200 mt-0.5">
            {formatBRL(currentPrizeInfo.stopPrize)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-400/35 bg-emerald-950/40 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/80">Acertar</p>
          <p className="text-xs font-black text-emerald-300 mt-0.5">
            {formatBRL(currentPrizeInfo.winPrize)}
          </p>
        </div>
      </div>

      {/* Degraus 16 -> 1 */}
      <div className="space-y-1 max-h-[430px] overflow-y-auto pr-1 scrollbar-thin tabular-nums">
        {REVERSED_LADDER.map((step) => {
          const isCurrent = step.level === currentLevel;
          const isCompleted = step.level < currentLevel;
          const isMillion = step.level === 16;
          const isCheckpoint = step.level === 5 || step.level === 10 || step.level === 15;

          return (
            <div
              key={step.level}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                isCurrent
                  ? isMillion
                    ? 'border-amber-300 bg-gradient-to-r from-amber-500/30 via-yellow-500/20 to-amber-500/30 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.28)] scale-[1.01]'
                    : 'border-amber-400/70 bg-gradient-to-r from-blue-600/35 via-amber-500/20 to-blue-600/35 text-white shadow-[0_0_16px_rgba(245,158,11,0.22)]'
                  : isCompleted
                    ? 'border-emerald-500/25 bg-emerald-950/25 text-emerald-300/85'
                    : isMillion
                      ? 'border-amber-500/30 bg-amber-950/20 text-amber-300/90'
                      : isCheckpoint
                        ? 'border-sky-500/25 bg-slate-900/70 text-sky-200/80'
                        : 'border-slate-800/80 bg-slate-950/50 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                    isCurrent
                      ? 'bg-amber-400 text-slate-950'
                      : isCompleted
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : step.level}
                </span>
                <span className="truncate font-semibold">
                  {isMillion ? 'PERGUNTA DO MILHÃO' : `Bloco ${step.block}`}
                </span>
                {isMillion && !isCurrent && <Lock className="w-3 h-3 text-amber-400/70 shrink-0" />}
              </div>
              <span className={`font-black shrink-0 ${isCurrent ? 'text-amber-300' : ''}`}>
                {formatBRL(step.winPrize)}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
