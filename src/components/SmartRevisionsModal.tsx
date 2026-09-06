import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Calendar, Clock, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { SmartRevisionItem } from '../types';
import { formatBRDate, isPastDate, isTodayDate } from '../utils/dateUtils';

interface SmartRevisionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisions: SmartRevisionItem[];
  onToggleRevisionDone: (revisionId: string) => void;
  onSyncRevisionToCalendar?: (revision: SmartRevisionItem) => Promise<void>;
  hasGoogleCalendar: boolean;
}

export const SmartRevisionsModal: React.FC<SmartRevisionsModalProps> = ({
  isOpen,
  onClose,
  revisions,
  onToggleRevisionDone,
  onSyncRevisionToCalendar,
  hasGoogleCalendar,
}) => {
  const [filter, setFilter] = useState<'all' | 'due' | 'pending' | 'completed'>('pending');

  if (!isOpen) return null;

  const todayRevisions = revisions.filter((r) => !r.completed && isTodayDate(r.dueDate));
  const overdueRevisions = revisions.filter((r) => !r.completed && isPastDate(r.dueDate));

  const filteredRevisions = revisions.filter((r) => {
    if (filter === 'due') {
      return !r.completed && (isTodayDate(r.dueDate) || isPastDate(r.dueDate));
    }
    if (filter === 'pending') {
      return !r.completed;
    }
    if (filter === 'completed') {
      return r.completed;
    }
    return true;
  });

  // Sort by due date ascending
  const sortedRevisions = [...filteredRevisions].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#111218] rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[90vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0D0E13]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Revisão Inteligente Espaçada
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/40 text-amber-300 border border-amber-800/60 uppercase tracking-wider">
                  CFO CBMERJ
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Ciclos programados: <strong className="text-amber-300">Próximo dia (+1d)</strong>, depois <strong className="text-blue-400">1 semana (+7d)</strong> e <strong className="text-purple-400">de mês em mês (+30d, +60d, +90d)</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Urgency Alert if any overdue */}
        {(todayRevisions.length > 0 || overdueRevisions.length > 0) && (
          <div className="bg-amber-950/30 px-6 py-2.5 border-b border-amber-800/60 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Você tem <strong>{todayRevisions.length + overdueRevisions.length}</strong> revisão(ões) para realizar hoje ou pendentes!
              </span>
            </div>
            <button
              onClick={() => setFilter('due')}
              className="text-[11px] font-bold text-amber-400 underline hover:text-amber-200"
            >
              Filtrar agora
            </button>
          </div>
        )}

        {/* Filter Navigation */}
        <div className="px-6 py-3 border-b border-slate-800 bg-[#0D0E13]/60 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'pending'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Pendentes ({revisions.filter((r) => !r.completed).length})
            </button>
            <button
              onClick={() => setFilter('due')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'due'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Para Hoje / Urgentes ({todayRevisions.length + overdueRevisions.length})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Concluídas ({revisions.filter((r) => r.completed).length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Todas ({revisions.length})
            </button>
          </div>
        </div>

        {/* List of Revisions */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {sortedRevisions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Sparkles className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">
                Nenhuma revisão encontrada neste filtro
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                À medida que você conclui matérias na tabela semanal, as revisões inteligentes do próximo dia (24h), de 1 semana e as mensais são geradas automaticamente aqui e no seu Google Agenda!
              </p>
            </div>
          ) : (
            sortedRevisions.map((rev) => {
              const isToday = isTodayDate(rev.dueDate);
              const isOverdue = !rev.completed && isPastDate(rev.dueDate);

              return (
                <div
                  key={rev.id}
                  className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    rev.completed
                      ? 'bg-slate-900/30 border-slate-800/80 opacity-60'
                      : isToday
                      ? 'bg-amber-950/20 border-amber-600/50 shadow-sm'
                      : isOverdue
                      ? 'bg-red-950/20 border-red-800/60'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      onClick={() => onToggleRevisionDone(rev.id)}
                      className={`w-6 h-6 rounded-lg mt-0.5 flex items-center justify-center transition-colors shrink-0 ${
                        rev.completed
                          ? 'bg-red-600 text-white'
                          : 'border-2 border-slate-700 hover:border-red-500 hover:bg-red-950/30 text-transparent hover:text-red-400'
                      }`}
                      title={rev.completed ? 'Reabrir revisão' : 'Marcar revisão como concluída'}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-100 text-xs">
                          {rev.subjectName}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rev.interval === '1d'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : rev.interval === '7d'
                              ? 'bg-blue-950/50 text-blue-400 border border-blue-800/50'
                              : rev.interval === '30d'
                              ? 'bg-purple-950/50 text-purple-400 border border-purple-800/50'
                              : rev.interval === '60d'
                              ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/50'
                              : 'bg-rose-950/50 text-rose-400 border border-rose-800/50'
                          }`}
                        >
                          {rev.intervalLabel}
                        </span>

                        {isToday && (
                          <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            Hoje!
                          </span>
                        )}

                        {isOverdue && (
                          <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            Atrasada
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 font-medium mt-0.5 truncate">
                        📌 {rev.topic}
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5 flex-wrap">
                        <span>
                          Estudado: <strong className="text-slate-300">{formatBRDate(rev.studiedDate)}</strong>
                        </span>
                        <span>•</span>
                        <span className={isToday ? 'text-amber-400 font-bold' : isOverdue ? 'text-red-400 font-bold' : ''}>
                          Data da Revisão: <strong className={isToday ? 'text-amber-300' : isOverdue ? 'text-red-300' : 'text-slate-200'}>{formatBRDate(rev.dueDate)}</strong>
                        </span>
                        {rev.calendarSynced && (
                          <span className="flex items-center gap-1 text-blue-400 font-medium">
                            <Calendar className="w-3 h-3" />
                            Google Agenda
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {onSyncRevisionToCalendar && hasGoogleCalendar && !rev.calendarSynced && (
                      <button
                        onClick={() => onSyncRevisionToCalendar(rev)}
                        className="p-1.5 text-xs text-blue-400 hover:bg-blue-950/40 border border-blue-800/60 rounded-lg transition-colors flex items-center gap-1"
                        title="Adicionar esta revisão à sua Google Agenda"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Agendar</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info about spaced repetition */}
        <div className="px-6 py-3 bg-[#0D0E13] border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>
            🧠 <strong className="text-slate-400">Método das Revisões Espaçadas:</strong> Fixa a matéria na memória de longo prazo antes da prova do CBMERJ.
          </span>
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
