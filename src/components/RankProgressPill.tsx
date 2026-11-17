import React, { useState } from 'react';
import { Award, Flame, Shield, Clock, ChevronDown, Sparkles } from 'lucide-react';
import { AppTheme, GamificationStatus } from '../types';

interface RankProgressPillProps {
  gamification: GamificationStatus | null;
  theme: AppTheme;
}

export const RankProgressPill: React.FC<RankProgressPillProps> = ({ gamification, theme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const isDark = theme === 'dark';

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
          isDark
            ? 'bg-[#0F172A]/90 border-slate-700/80 hover:border-slate-500 text-slate-100 shadow-sm'
            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-sm'
        }`}
        title="Ver patente militar, foguinho de constância e escudos de gelo"
      >
        {/* Foguinho */}
        <span
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-extrabold tabular-nums ${
            currentStreakDays > 0
              ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
              : isDark
              ? 'bg-slate-800 text-slate-400 border border-slate-700'
              : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          <Flame
            className={`w-3.5 h-3.5 ${
              currentStreakDays > 0
                ? 'text-orange-400 fill-orange-500/50 animate-flame-flicker'
                : 'text-slate-400'
            }`}
          />
          <span>{currentStreakDays}d</span>
        </span>

        {/* Escudos de Gelo */}
        <span
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold tabular-nums bg-sky-500/10 text-sky-400 border border-sky-400/25"
          title={`${iceShields} escudo(s) de gelo disponível(is) — ganha +1 a cada 14 dias seguidos`}
        >
          <Shield className="w-3.5 h-3.5 fill-sky-400/25" />
          <span>{iceShields}</span>
        </span>

        {/* Patente */}
        <span className="inline-flex items-center gap-1.5 font-bold">
          <Award className="w-3.5 h-3.5 shrink-0" style={{ color: rank.badgeColor }} />
          <span className="truncate max-w-[130px]">{rank.name}</span>
          <span className={`hidden sm:inline text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            ({avgDailyHours14d.toFixed(1)}h/d)
          </span>
        </span>

        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 mt-2 z-50 w-80 sm:w-96 rounded-2xl border p-4 shadow-2xl animate-in fade-in duration-150 ${
            isDark
              ? 'bg-[#0F172A] border-slate-700 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800/40">
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4" style={{ color: rank.badgeColor }} />
                <span className="text-sm font-extrabold">{rank.name}</span>
              </div>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Média móvel 14 dias: <strong>{avgDailyHours14d.toFixed(1)}h/dia</strong> (teto máximo: 12h/dia)
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                qualifiedToday
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              {qualifiedToday ? `Hoje: ${todayMinutes}m ✓` : `Hoje: ${todayMinutes}/30m`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 my-3 text-xs">
            <div className={`rounded-xl border p-2.5 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-1.5 text-orange-400 font-bold">
                <Flame className="w-3.5 h-3.5 fill-orange-500/40" />
                <span>Constância</span>
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums">{currentStreakDays} dias</p>
              <p className="text-[10px] text-slate-400">Recorde: {bestStreakDays} dias</p>
            </div>

            <div className={`rounded-xl border p-2.5 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                <Shield className="w-3.5 h-3.5 fill-sky-400/25" />
                <span>Escudos de Gelo</span>
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums">
                {iceShields}/{maxIceShields}
              </p>
              <p className="text-[10px] text-slate-400">Próximo em {nextShieldInDays}d seguidos</p>
            </div>
          </div>

          {nextRank ? (
            <div className={`rounded-xl border p-3 text-xs ${isDark ? 'bg-blue-950/30 border-blue-800/40' : 'bg-blue-50 border-blue-200'}`}>
              <div className="flex items-center gap-1.5 font-bold text-blue-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Próxima patente: {nextRank.name}</span>
              </div>
              <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Meta: <strong>~{nextRank.targetDailyHours}h/dia</strong> e <strong>{nextRank.minStreakDays} dias</strong> de constância.
                {' '}
                {nextRank.daysRemaining > 0
                  ? `Faltam ${nextRank.daysRemaining} dia(s) seguidos`
                  : 'Constância em dias atingida'}
                {nextRank.hoursDeficitPerDay > 0
                  ? ` e +${nextRank.hoursDeficitPerDay}h/dia na média.`
                  : '.'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2 font-semibold">
              <Sparkles className="w-4 h-4 shrink-0" />
              Você alcançou a patente máxima (12h/dia sustentadas)!
            </div>
          )}
        </div>
      )}
    </div>
  );
};
