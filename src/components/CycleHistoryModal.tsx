import React from 'react';
import { X, Clock, Calendar, CheckCircle2, ChevronRight } from 'lucide-react';
import { WeeklyCycle, StudyEntry } from '../types';

interface CycleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycles: WeeklyCycle[];
  activeCycleId: string;
}

export const CycleHistoryModal: React.FC<CycleHistoryModalProps> = ({
  isOpen,
  onClose,
  cycles,
  activeCycleId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#111218] rounded-2xl max-w-lg w-full shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[85vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0D0E13]">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-semibold text-slate-100">
              Histórico de Ciclos Semanais
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {cycles.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-xs">
              Nenhum ciclo anterior arquivado ainda. À medida que as semanas avançam (toda segunda-feira), os ciclos anteriores serão preservados aqui automaticamente!
            </div>
          ) : (
            cycles.map((c) => {
              const allEntries = (Object.values(c.entries || {}) as StudyEntry[]);
              const completedEntries = allEntries.filter((e) => e.completed);
              const completedCount = completedEntries.length;
              const totalMinutes = completedEntries
                .reduce((acc, curr) => acc + (curr.durationMinutes || 60), 0);
              const wholeHours = Math.round(totalMinutes / 60);

              const isActive = c.id === activeCycleId;

              return (
                <div
                  key={c.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-red-950/20 border-red-800/80 ring-1 ring-red-800/50'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          {c.label}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Ciclo Atual
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                        <span className="flex items-center gap-1 font-semibold text-red-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-red-400" />
                          {completedCount} sessões concluídas
                        </span>
                        <span>•</span>
                        <span>
                          {wholeHours}h estudadas
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-3 bg-[#0D0E13] border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
