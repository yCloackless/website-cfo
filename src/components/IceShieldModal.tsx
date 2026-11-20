import React from 'react';
import { Snowflake, Sparkles, CheckCircle2 } from 'lucide-react';
import { AppTheme, ShieldSaveEvent } from '../types';
import { StreakFlameIcon } from './StreakFlameIcon';
import { IceShieldIcon } from './IceShieldIcon';

interface IceShieldModalProps {
  event: ShieldSaveEvent;
  maxShields?: number;
  theme: AppTheme;
  onAcknowledge: () => void;
}

export const IceShieldModal: React.FC<IceShieldModalProps> = ({
  event,
  maxShields = 3,
  theme,
  onAcknowledge,
}) => {
  const isDark = theme === 'dark';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ice-shield-title"
    >
      <div
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border p-6 sm:p-8 text-center shadow-[0_30px_90px_rgba(14,165,233,0.35)] ${
          isDark
            ? 'bg-gradient-to-b from-[#0c1a2e] via-[#0f172a] to-[#090d16] border-sky-400/35 text-slate-100'
            : 'bg-gradient-to-b from-sky-50 via-white to-slate-50 border-sky-300 text-slate-900'
        }`}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-sky-400/20 blur-3xl" />

        {/* Ice Shield SVG entering & spinning */}
        <div className="relative mx-auto mb-5 flex h-32 w-32 items-center justify-center [perspective:900px]">
          <div className="absolute inset-2 rounded-full border border-sky-300/30 animate-ping opacity-30" />
          <div className="animate-ice-shield-enter relative flex h-28 w-28 items-center justify-center">
            <svg viewBox="0 0 120 132" className="w-full h-full drop-shadow-[0_12px_28px_rgba(56,189,248,0.5)]">
              <defs>
                <linearGradient id="iceGradOuter" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e0f2fe" />
                  <stop offset="45%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
                <linearGradient id="iceGradInner" x1="15%" y1="0%" x2="85%" y2="100%">
                  <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.95" />
                  <stop offset="55%" stopColor="#7dd3fc" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0369a1" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              <path
                d="M60 6 L108 24 V64 C108 95 86 116 60 126 C34 116 12 95 12 64 V24 Z"
                fill="url(#iceGradOuter)"
                stroke="#bae6fd"
                strokeWidth="3"
              />
              <path
                d="M60 16 L98 30 V63 C98 88 80 105 60 114 C40 105 22 88 22 63 V30 Z"
                fill="url(#iceGradInner)"
              />
              <path
                d="M60 16 L60 114 M22 50 L98 50 M34 34 L86 86 M86 34 L34 86"
                stroke="#e0f2fe"
                strokeOpacity="0.45"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <Snowflake className="absolute w-10 h-10 text-white drop-shadow-[0_2px_6px_rgba(2,132,199,0.8)]" />
          </div>
          <Sparkles className="absolute -top-1 right-3 w-5 h-5 text-sky-300 animate-pulse" />
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-400/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-sky-400 mb-3">
          <IceShieldIcon active className="w-3.5 h-3.5 shrink-0" />
          Proteção Automática Ativada
        </div>

        <h2 id="ice-shield-title" className="text-xl sm:text-2xl font-extrabold tracking-tight">
          Escudo de Gelo salvou sua ofensiva!
        </h2>

        <div className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-gradient-to-r from-orange-500/15 via-amber-500/15 to-sky-500/15 border border-amber-400/30">
          <StreakFlameIcon active className="w-6 h-6 shrink-0" />
          <span className="text-base font-extrabold text-amber-400 tabular-nums">
            {event.savedStreakDays} {event.savedStreakDays === 1 ? 'dia seguido preservado' : 'dias seguidos preservados'}
          </span>
        </div>

        <p className={`mt-3 text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          Detectamos ausência em {event.missedDates.length === 1 ? '1 dia' : `${event.missedDates.length} dias`} ({event.missedDates.join(', ')}), e um escudo congelou sua sequência para o foguinho não zerar.
        </p>

        <div className={`mt-4 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${isDark ? 'bg-slate-900/70 border-slate-800 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
          <span>Escudos restantes:</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            {Array.from({ length: maxShields }).map((_, idx) => (
              <IceShieldIcon
                key={idx}
                active={idx < event.remainingShields}
                className={`w-4 h-4 shrink-0 ${
                  idx < event.remainingShields
                    ? ''
                    : isDark
                    ? 'text-slate-500'
                    : 'text-slate-400'
                }`}
              />
            ))}
            <strong className="ml-1">{event.remainingShields}/{maxShields}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          Continuar Missão
        </button>
      </div>
    </div>
  );
};
