import React from 'react';
import { Check, CheckCircle2, Clock, Calendar, Sparkles, Plus, Edit2, Trash2, RotateCcw } from 'lucide-react';
import { Subject, StudyEntry, AppTheme } from '../types';
import { WEEK_DAYS } from '../data/cfoSubjects';
import { formatBRDateShort, formatDurationHours } from '../utils/dateUtils';

interface HorizontalWeeklyTableProps {
  subjects: Subject[];
  weekDays: Array<{ index: number; dateStr: string; displayShort: string; isToday: boolean }>;
  entries: Record<string, StudyEntry>;
  onCellClick: (subject: Subject, dayIndex: number, dateStr: string) => void;
  onQuickToggle: (subject: Subject, dayIndex: number, dateStr: string, e: React.MouseEvent) => void;
  onClearCell?: (subjectId: string, dayIndex: number, e: React.MouseEvent) => void;
  onClearAllEntries?: () => void;
  onDeleteCustomSubject?: (subjectId: string) => void;
  hasGoogleCalendar: boolean;
  theme?: AppTheme;
}

export const HorizontalWeeklyTable: React.FC<HorizontalWeeklyTableProps> = ({
  subjects,
  weekDays,
  entries,
  onCellClick,
  onQuickToggle,
  onClearCell,
  onClearAllEntries,
  onDeleteCustomSubject,
  hasGoogleCalendar,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  // Helper to get entry
  const getEntry = (subjectId: string, dayIndex: number): StudyEntry | undefined => {
    return entries[`${subjectId}_${dayIndex}`];
  };

  // Calculate stats for a subject
  const getSubjectStats = (subjectId: string) => {
    let completedCount = 0;
    let totalMinutes = 0;
    for (let i = 0; i < 7; i++) {
      const entry = getEntry(subjectId, i);
      if (entry?.completed) {
        completedCount++;
        totalMinutes += entry.durationMinutes || 60;
      }
    }
    return { completedCount, totalMinutes };
  };

  return (
    <div
      className={`w-full rounded-2xl border transition-colors shadow-2xl overflow-hidden ${
        isDark ? 'bg-[#0B1528] border-slate-800/80' : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}
    >
      {/* Responsive Container: Scrollable on mobile, Fixed 100% on Desktop */}
      <div className="overflow-x-auto lg:overflow-x-visible w-full scrollbar-thin">
        <table className="w-full text-left border-collapse min-w-[650px] lg:min-w-0 lg:table-fixed">
          <thead>
            <tr
              className={`border-b text-xs font-bold uppercase tracking-wider transition-colors ${
                isDark
                  ? 'bg-[#070D18] border-slate-800 text-slate-400'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {/* Sticky Subject Column */}
              <th
                className={`sticky left-0 z-20 backdrop-blur-xs py-3.5 px-2.5 sm:px-3 w-[140px] sm:w-[180px] lg:w-[22%] border-r transition-colors ${
                  isDark
                    ? 'bg-[#070D18]/95 border-slate-800 text-slate-300'
                    : 'bg-slate-50/95 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">Matérias CFO</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-medium normal-case hidden sm:inline ${
                        isDark ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {subjects.length} matérias
                    </span>
                    {onClearAllEntries && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearAllEntries();
                        }}
                        className="text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors"
                        title="Limpar e desmarcar todos os estudos do cronograma semanal"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden xl:inline">Limpar Tudo</span>
                      </button>
                    )}
                  </div>
                </div>
              </th>

              {/* 7 Days of the Week Columns (Segunda a Domingo) */}
              {weekDays.map((day) => {
                const dayMeta = WEEK_DAYS[day.index];
                return (
                  <th
                    key={day.index}
                    className={`py-3.5 px-1 sm:px-2 w-[85px] sm:w-[95px] lg:w-[10%] text-center border-r transition-colors ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    } ${
                      day.isToday
                        ? isDark
                          ? 'bg-blue-950/40 text-blue-400 font-extrabold'
                          : 'bg-blue-50 text-blue-600 font-extrabold'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1">
                        <span>{dayMeta.short}</span>
                        {day.isToday && (
                          <span className="px-1 py-0.2 rounded-full text-[8px] sm:text-[9px] font-bold bg-[#0056D2] text-white uppercase tracking-tighter">
                            Hoje
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] sm:text-[11px] font-medium mt-0.5 ${
                          day.isToday
                            ? 'text-blue-400 font-semibold'
                            : isDark
                            ? 'text-slate-500 font-normal'
                            : 'text-slate-400 font-normal'
                        }`}
                      >
                        {day.displayShort}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Summary Column */}
              <th
                className={`py-3.5 px-1 sm:px-2 w-[80px] sm:w-[90px] lg:w-[8%] text-center font-bold ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Progresso
              </th>
            </tr>
          </thead>

          <tbody
            className={`divide-y text-xs transition-colors ${
              isDark ? 'divide-slate-800/60' : 'divide-slate-200'
            }`}
          >
            {subjects.map((subject) => {
              const stats = getSubjectStats(subject.id);
              const progressPct = Math.round((stats.completedCount / 7) * 100);

              return (
                <tr
                  key={subject.id}
                  className={`transition-colors group ${
                    isDark ? 'hover:bg-slate-900/40' : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Fixed Subject Column */}
                  <td
                    className={`sticky left-0 z-10 py-3 px-2.5 sm:px-4 border-r transition-colors ${
                      isDark
                        ? 'bg-[#0B1528] group-hover:bg-[#0F1D38] border-slate-800'
                        : 'bg-white group-hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-2 h-7 rounded-full shrink-0"
                          style={{ backgroundColor: subject.color }}
                        />
                        <div className="min-w-0">
                          <p
                            className={`font-semibold truncate text-[13px] ${
                              isDark ? 'text-slate-100' : 'text-slate-900'
                            }`}
                          >
                            {subject.name}
                          </p>
                          <p
                            className={`text-[10px] font-medium truncate uppercase tracking-wider ${
                              isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            {subject.category}
                          </p>
                        </div>
                      </div>

                      {onDeleteCustomSubject && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                `Deseja retirar "${subject.name}" do cronograma de estudos? Você poderá reativá-la a qualquer momento clicando em "Matérias" no topo.`
                              )
                            ) {
                              onDeleteCustomSubject(subject.id);
                            }
                          }}
                          className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0 cursor-pointer"
                          title={`Retirar ${subject.name} do cronograma`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 7 Day Cells */}
                  {weekDays.map((day) => {
                    const entry = getEntry(subject.id, day.index);
                    const isCompleted = Boolean(entry?.completed);

                    return (
                      <td
                        key={day.index}
                        onClick={() => onCellClick(subject, day.index, day.dateStr)}
                        className={`p-1 sm:p-1.5 border-r text-center cursor-pointer select-none transition-all ${
                          isDark ? 'border-slate-800/70' : 'border-slate-200'
                        } ${
                          day.isToday ? (isDark ? 'bg-blue-950/20' : 'bg-blue-50/40') : ''
                        } ${isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-100/60'}`}
                      >
                        {isCompleted ? (
                          <div
                            className={`w-full h-full min-h-[52px] sm:min-h-[56px] p-1.5 sm:p-2 rounded-lg border flex flex-col justify-between items-start text-left shadow-sm group/cell transition-all ${
                              entry?.entryType === 'reviewing'
                                ? isDark
                                  ? 'bg-[#062018]/80 border-emerald-800/80 border-l-2 border-l-emerald-500 hover:border-emerald-600'
                                  : 'bg-emerald-50/50 border-emerald-200 border-l-2 border-l-emerald-600 hover:border-emerald-300'
                                : isDark
                                ? 'bg-[#0F1D38]/80 border-slate-800 border-l-2 border-l-blue-600 hover:border-slate-700'
                                : 'bg-white border-slate-200 border-l-2 border-l-blue-600 hover:border-slate-300'
                            }`}
                          >
                            {/* Top badge row */}
                            <div className="w-full flex items-center justify-between gap-0.5">
                              {entry?.entryType === 'reviewing' ? (
                                <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.2 rounded uppercase tracking-wider">
                                  Revisando
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[8px] sm:text-[9px] font-bold text-blue-400 bg-blue-500/15 border border-blue-500/30 px-1 py-0.2 rounded uppercase tracking-wider">
                                  Estudado
                                </span>
                              )}

                              <div className="flex items-center gap-0.5">
                                {/* Quick toggle checkmark */}
                                <button
                                  onClick={(e) => onQuickToggle(subject, day.index, day.dateStr, e)}
                                  title="Desmarcar registro"
                                  className={`w-4 h-4 sm:w-5 sm:h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
                                    entry?.entryType === 'reviewing'
                                      ? 'text-emerald-400 hover:bg-emerald-500/20'
                                      : 'text-blue-400 hover:bg-blue-500/20'
                                  }`}
                                >
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </button>

                                {/* Clear cell entry button */}
                                {onClearCell && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClearCell(subject.id, day.index, e);
                                    }}
                                    title="Apagar e limpar este estudo marcado sem querer"
                                    className="w-4 h-4 sm:w-5 sm:h-5 rounded text-red-400 hover:bg-red-500/20 hover:text-red-300 flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Topic name if recorded */}
                            {entry?.topic ? (
                              <p
                                className={`text-[10px] sm:text-[11px] font-semibold line-clamp-1 mt-0.5 ${
                                  isDark ? 'text-slate-200' : 'text-slate-800'
                                }`}
                              >
                                {entry.topic}
                              </p>
                            ) : (
                              <p
                                className={`text-[9px] sm:text-[10px] italic mt-0.5 ${
                                  isDark ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                Sem tópico
                              </p>
                            )}

                            {/* Meta footer (google calendar sync, revisions) */}
                            <div
                              className={`w-full flex items-center justify-between text-[9px] sm:text-[10px] mt-1 pt-0.5 border-t ${
                                isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-100 text-slate-400'
                              }`}
                            >
                              <span
                                className={`flex items-center gap-1 font-medium text-[9px] ${
                                  entry?.entryType === 'reviewing'
                                    ? 'text-emerald-400'
                                    : isDark ? 'text-blue-400' : 'text-blue-600'
                                }`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {entry?.entryType === 'reviewing' ? 'Revisado' : 'Concluído'}
                              </span>

                              <div className="flex items-center gap-0.5">
                                {entry?.googleCalendarSynced && (
                                  <span
                                    title="Sincronizado com Google Agenda"
                                    className="text-blue-400"
                                  >
                                    <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  </span>
                                )}
                                {entry?.revisionScheduled && (
                                  <span
                                    title="Revisões agendadas: Próximo dia, 1 semana e mensais"
                                    className="text-amber-400"
                                  >
                                    <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  </span>
                                )}
                                <Edit2 className="w-2.5 h-2.5 opacity-0 group-cell-hover/cell:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Empty uncompleted cell */
                          <div
                            className={`w-full h-full min-h-[52px] sm:min-h-[56px] p-1.5 sm:p-2 rounded-lg border border-dashed flex flex-col items-center justify-center group/empty transition-all ${
                              isDark
                                ? 'border-slate-800 hover:border-slate-700 bg-slate-900/20 hover:bg-slate-900/50 text-slate-500'
                                : 'border-slate-300 hover:border-slate-400 bg-slate-50/40 hover:bg-slate-100/60 text-slate-400'
                            }`}
                          >
                            <button
                              onClick={(e) => onQuickToggle(subject, day.index, day.dateStr, e)}
                              className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                                isDark
                                  ? 'border-slate-800 group-hover/empty:border-blue-500/50 group-hover/empty:bg-blue-950/30 text-slate-600 group-hover/empty:text-blue-400'
                                  : 'border-slate-300 group-hover/empty:border-blue-500/50 group-hover/empty:bg-blue-50 text-slate-400 group-hover/empty:text-blue-600'
                              }`}
                              title="Marcar como estudado com 1 clique"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="text-[9px] sm:text-[10px] font-medium mt-0.5">
                              Marcar
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Summary Progress Column */}
                  <td className="py-3 px-1 sm:px-2 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span
                        className={`font-bold text-[11px] sm:text-xs ${
                          isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}
                      >
                        {stats.completedCount}/7 dias
                      </span>
                      <div
                        className={`w-12 sm:w-14 xl:w-16 h-1.5 rounded-full mt-1.5 overflow-hidden ${
                          isDark ? 'bg-slate-800' : 'bg-slate-200'
                        }`}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: subject.color,
                          }}
                        />
                      </div>
                      <span
                        className={`text-[9px] font-semibold mt-1 ${
                          progressPct === 100
                            ? 'text-emerald-400'
                            : isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {progressPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer / Tip Bar */}
      <div
        className={`px-5 py-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs transition-colors ${
          isDark
            ? 'bg-[#0D0E13] border-slate-800 text-slate-500'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Concluído:
            </strong> Sessão realizada no dia
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span>Sincronizado no Google Calendar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Revisão Inteligente (1 sem / 1 mês)</span>
          </span>
        </div>

        <span className="text-[11px]">
          💡 Clique no botão <strong>+</strong> para marcar rápido ou no card para detalhar tópico e anotações.
        </span>
      </div>
    </div>
  );
};

