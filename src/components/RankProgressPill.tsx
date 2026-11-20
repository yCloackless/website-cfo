import React, { useEffect, useRef, useState } from 'react';
import { Award, Clock, ChevronDown, Sparkles } from 'lucide-react';
import { AppTheme, GamificationStatus } from '../types';
import { StreakFlameIcon } from './StreakFlameIcon';
import { IceShieldIcon } from './IceShieldIcon';

interface RankProgressPillProps {
  gamification: GamificationStatus | null;
  theme: AppTheme;
}

export const RankProgressPill: React.FC<RankProgressPillProps> = ({ gamification, theme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;

    const updateAlignment = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Only right-align the 384px popover when there is enough room to the left of rect.right
      setAlignRight(rect.right >= 400);
    };

    updateAlignment();

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateAlignment);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateAlignment);
    };
  }, [isOpen]);

  if (!gamification) return null;

  const {
    currentStreakDays,
    bestStreakDays,
    iceShields,
    maxIceShields,
    nextShieldInDays,
    avgDailyHours14d,
    studiedTodaySeconds,
    qualifiedToday,
    rank,
    nextRank,
  } = gamification;

  const todayMinutes = Math.round(studiedTodaySeconds / 60);
  const dividerClass = isDark ? 'divide-slate-800' : 'divide-slate-200';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={`inline-flex items-stretch overflow-hidden rounded-md border text-xs font-semibold transition-colors cursor-pointer select-none divide-x ${dividerClass} ${
          isDark
            ? 'bg-[#0B1220]/95 border-slate-700/80 hover:border-slate-500/80 text-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.32)]'
            : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-800 shadow-xs'
        }`}
        title="Ver patente militar, foguinho de constância e escudos de gelo"
      >
        {/* Ofensiva */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-bold tabular-nums ${
            currentStreakDays > 0
              ? isDark
                ? 'bg-orange-500/[0.08] text-orange-300'
                : 'bg-orange-50/80 text-orange-600'
              : isDark
              ? 'text-slate-400'
              : 'text-slate-500'
          }`}
        >
          <StreakFlameIcon active={currentStreakDays > 0} className="w-3.5 h-3.5 shrink-0" />
          <span>{currentStreakDays}d</span>
        </span>

        {/* Escudos de Gelo */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 font-bold tabular-nums ${
            iceShields > 0
              ? isDark
                ? 'bg-sky-500/[0.06] text-sky-300'
                : 'bg-sky-50/80 text-sky-700'
              : isDark
              ? 'text-slate-400'
              : 'text-slate-500'
          }`}
          title={`${iceShields} escudo(s) de gelo disponível(is) — ganha +1 a cada 14 dias seguidos`}
        >
          <IceShieldIcon active={iceShields > 0} className="w-3.5 h-3.5 shrink-0" />
          <span>{iceShields}</span>
        </span>

        {/* Patente & Ritmo */}
        <span className="inline-flex items-center gap-2 px-2.5 py-1.5">
          <Award className="w-3.5 h-3.5 shrink-0" style={{ color: rank.badgeColor }} />
          <span className="truncate max-w-[130px] font-semibold tracking-tight">{rank.name}</span>
          <span
            className={`hidden sm:inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[10px] font-mono font-semibold tabular-nums leading-none ${
              isDark
                ? 'bg-slate-800/80 border-slate-700/70 text-slate-300'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            {avgDailyHours14d.toFixed(1)}h/d
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            } ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {isOpen && (
        <div
          className={`absolute ${alignRight ? 'right-0' : 'left-0'} mt-2 z-50 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-lg border p-4 shadow-2xl animate-in fade-in duration-150 ${
            isDark
              ? 'bg-[#0F172A] border-slate-700/90 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className={`flex items-start justify-between gap-2 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 shrink-0" style={{ color: rank.badgeColor }} />
                <span className="text-sm font-extrabold">{rank.name}</span>
              </div>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Média móvel 14 dias: <strong>{avgDailyHours14d.toFixed(1)}h/dia</strong> (teto máximo: 12h/dia)
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${
                qualifiedToday
                  ? isDark
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : isDark
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {qualifiedToday ? `Hoje: ${todayMinutes}m ✓` : `Hoje: ${todayMinutes}/30m`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
            <div className={`rounded-md border p-2.5 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                <StreakFlameIcon active className="w-3.5 h-3.5 shrink-0" />
                <span>Constância</span>
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums">
                {currentStreakDays} {currentStreakDays === 1 ? 'dia' : 'dias'}
              </p>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Recorde: {bestStreakDays} {bestStreakDays === 1 ? 'dia' : 'dias'}
              </p>
            </div>

            <div className={`rounded-md border p-2.5 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                <IceShieldIcon active className="w-3.5 h-3.5 shrink-0" />
                <span>Escudos de Gelo</span>
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums">
                {iceShields}/{maxIceShields}
              </p>
              <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Próximo em {nextShieldInDays}d seguidos
              </p>
            </div>
          </div>

          {nextRank ? (
            <div className={`rounded-md border p-3 text-xs ${isDark ? 'bg-blue-950/30 border-blue-800/40' : 'bg-blue-50 border-blue-200'}`}>
              <div className={`flex items-center gap-1.5 font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Próxima patente: {nextRank.name}</span>
              </div>
              <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Meta: <strong>~{nextRank.targetDailyHours}h/dia</strong> e{' '}
                <strong>
                  {nextRank.minStreakDays} {nextRank.minStreakDays === 1 ? 'dia' : 'dias'}
                </strong>{' '}
                de constância.{' '}
                {nextRank.daysRemaining > 0
                  ? nextRank.daysRemaining === 1
                    ? 'Falta 1 dia seguido'
                    : `Faltam ${nextRank.daysRemaining} dias seguidos`
                  : 'Constância em dias atingida'}
                {nextRank.hoursDeficitPerDay > 0
                  ? ` e +${nextRank.hoursDeficitPerDay}h/dia na média.`
                  : '.'}
              </p>
            </div>
          ) : (
            <div
              className={`rounded-md border p-3 text-xs flex items-center gap-2 font-semibold ${
                isDark
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              Você alcançou a patente máxima (12h/dia sustentadas)!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
