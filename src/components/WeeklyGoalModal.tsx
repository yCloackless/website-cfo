import React, { useState } from 'react';
import { X, Target, Flame, Check, Sparkles } from 'lucide-react';
import { AppTheme } from '../types';

interface WeeklyGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGoalHours: number;
  onSaveGoal: (hours: number) => void;
  theme: AppTheme;
}

const PRESET_GOALS = [
  { hours: 15, label: '15h/sem', desc: '~2.1h/dia • Moderado' },
  { hours: 20, label: '20h/sem', desc: '~2.8h/dia • Padrão' },
  { hours: 25, label: '25h/sem', desc: '~3.5h/dia • CFO CBMERJ', recommended: true },
  { hours: 30, label: '30h/sem', desc: '~4.3h/dia • Intenso' },
  { hours: 35, label: '35h/sem', desc: '~5.0h/dia • Reta Final' },
  { hours: 40, label: '40h/sem', desc: '~5.7h/dia • Dedicação Total' },
];

export const WeeklyGoalModal: React.FC<WeeklyGoalModalProps> = ({
  isOpen,
  onClose,
  currentGoalHours,
  onSaveGoal,
  theme,
}) => {
  const [goalHours, setGoalHours] = useState<number>(currentGoalHours);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (goalHours > 0) {
      onSaveGoal(Number(goalHours));
      onClose();
    }
  };

  const dailyAverage = (goalHours / 7).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`rounded-2xl max-w-md w-full shadow-2xl border overflow-hidden flex flex-col transition-colors ${
          isDark
            ? 'bg-[#111218] border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isDark ? 'border-slate-800 bg-[#0D0E13]' : 'border-slate-100 bg-slate-50/70'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-red-950/40">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Definir Meta Semanal
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                  Horas de Estudo
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Planeje quantas horas você deseja cumprir nesta semana.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Presets Grid */}
          <div>
            <label
              className={`block text-xs font-semibold mb-2.5 flex items-center gap-1.5 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-red-500" />
              Selecione um ritmo ou personalize:
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              {PRESET_GOALS.map((preset) => {
                const isSelected = goalHours === preset.hours;
                return (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => setGoalHours(preset.hours)}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-red-500 bg-red-950/30 text-red-400 shadow-md shadow-red-950/20'
                        : isDark
                        ? 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    {preset.recommended && (
                      <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-amber-500 text-slate-950 text-[9px] font-black rounded uppercase tracking-wider shadow-xs">
                        Recomendado
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{preset.label}</span>
                      {isSelected && <Check className="w-4 h-4 text-red-500" />}
                    </div>
                    <span
                      className={`text-[10px] block mt-0.5 ${
                        isSelected
                          ? 'text-red-300 font-medium'
                          : isDark
                          ? 'text-slate-500'
                          : 'text-slate-400'
                      }`}
                    >
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Input */}
          <div
            className={`p-4 rounded-xl border space-y-2 ${
              isDark
                ? 'bg-slate-900/40 border-slate-800'
                : 'bg-slate-50/80 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <label
                className={`text-xs font-semibold ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                Personalizar Horas da Semana:
              </label>
              <span className="text-[11px] font-medium text-amber-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> ~{dailyAverage}h por dia
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="120"
                step="1"
                value={goalHours}
                onChange={(e) => setGoalHours(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className={`w-32 px-3.5 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100 focus:border-red-500 focus:outline-none'
                    : 'bg-white border-slate-300 text-slate-900 focus:border-red-500 focus:outline-none'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                horas no total (Segunda a Domingo)
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div
            className={`flex items-center justify-end gap-2.5 pt-4 border-t ${
              isDark ? 'border-slate-800' : 'border-slate-100'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
                isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] rounded-xl shadow-md shadow-red-950/60 transition-all flex items-center gap-1.5"
            >
              <Target className="w-4 h-4" />
              <span>Salvar Meta Semanal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
