import React from 'react';
import { Check, CheckCircle2, Clock, Calendar, Sparkles, Plus, Edit2, Trash2 } from 'lucide-react';
import { Subject, StudyEntry, AppTheme } from '../types';
import { WEEK_DAYS } from '../data/cfoSubjects';
import { formatBRDateShort, formatDurationHours } from '../utils/dateUtils';

interface HorizontalWeeklyTableProps {
  subjects: Subject[];
  weekDays: Array<{ index: number; dateStr: string; displayShort: string; isToday: boolean }>;
  entries: Record<string, StudyEntry>;
  onCellClick: (subject: Subject, dayIndex: number, dateStr: string) => void;
  onQuickToggle: (subject: Subject, dayIndex: number, dateStr: string, e: React.MouseEvent) => void;
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
        isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
      }`}
    >
      {/* Scrollable Horizontal Container */}
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left border-collapse min-w-[960px]">
          <thead>
            <tr
              className={`border-b text-xs font-bold uppercase tracking-wider transition-colors ${
                isDark
                  ? 'bg-[#0D0E13] border-slate-800 text-slate-400'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {/* Sticky Subject Column */}
              <th
                className={`sticky left-0 z-20 backdrop-blur-xs py-3.5 px-4 w-64 min-w-[240px] border-r transition-colors ${
                  isDark
                    ? 'bg-[#0D0E13]/95 border-slate-800 text-slate-300'
                    : 'bg-slate-50/95 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Matérias CFO CBMERJ</span>
                  <span
                    className={`text-[10px] font-medium normal-case ${
                      isDark ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    {subjects.length} matérias
                  </span>
                </div>
              </th>

              {/* 7 Days of the Week Columns (Segunda a Domingo) */}
              {weekDays.map((day) => {
                const dayMeta = WEEK_DAYS[day.index];
                return (
                  <th
                    key={day.index}
                    className={`py-3.5 px-3 min-w-[125px] text-center border-r transition-colors ${
                      isDark ? 'border-slate-800/80' : 'border-slate-200'
                    } ${
                      day.isToday
                        ? isDark
                          ? 'bg-red-950/30 text-red-400 font-extrabold'
                          : 'bg-red-50 text-red-600 font-extrabold'
                        : ''
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex items-center gap-1">
                        <span>{dayMeta.short}</span>
                        {day.isToday && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-600 text-white uppercase tracking-tighter">
                            Hoje
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[11px] font-medium mt-0.5 ${
                          day.isToday
                            ? 'text-red-500 font-semibold'
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
                className={`py-3.5 px-3 w-28 min-w-[110px] text-center font-bold ${
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
                    className={`sticky left-0 z-10 py-3 px-4 border-r transition-colors ${
                      isDark
                        ? 'bg-[#111218] group-hover:bg-[#151720] border-slate-800'
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
                        className={`p-2 border-r text-center cursor-pointer select-none transition-all ${
                          isDark ? 'border-slate-800/70' : 'border-slate-200'
                        } ${
                          day.isToday ? (isDark ? 'bg-red-950/15' : 'bg-red-50/40') : ''
                        } ${isDark ? 'hover:bg-slate-900/60' : 'hover:bg-slate-100/60'}`}
                      >
                        {isCompleted ? (
                          <div
                            className={`w-full h-full min-h-[58px] p-2 rounded-lg border border-l-2 border-l-red-500 flex flex-col justify-between items-start text-left shadow-sm group/cell transition-all ${
                              isDark
                                ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {/* Top badge row */}
                            <div className="w-full flex items-center justify-between gap-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Concluído
                              </span>

                              {/* Quick toggle checkmark */}
                              <button
                                onClick={(e) => onQuickToggle(subject, day.index, day.dateStr, e)}
                                title="Desmarcar estudo"
                                className="w-5 h-5 rounded text-red-500 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                            </div>

                            {/* Topic name if recorded */}
                            {entry?.topic ? (
                              <p
                                className={`text-[11px] font-semibold line-clamp-1 mt-1 ${
                                  isDark ? 'text-slate-200' : 'text-slate-800'
                                }`}
                              >
                                {entry.topic}
                              </p>
                            ) : (
                              <p
                                className={`text-[10px] italic mt-0.5 ${
                                  isDark ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                Sem tópico
                              </p>
                            )}

                            {/* Meta footer (duration, google calendar sync, revisions) */}
                            <div
                              className={`w-full flex items-center justify-between text-[10px] mt-1 pt-1 border-t ${
                                isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-100 text-slate-400'
                              }`}
                            >
                              <span
                                className={`flex items-center gap-0.5 font-medium ${
                                  isDark ? 'text-slate-300' : 'text-slate-700'
                                }`}
                              >
                                <Clock className="w-2.5 h-2.5 text-red-500" />
                                {formatDurationHours(entry?.durationMinutes || 60)}
                              </span>

                              <div className="flex items-center gap-1">
                                {entry?.googleCalendarSynced && (
                                  <span
                                    title="Sincronizado com Google Agenda"
                                    className="text-blue-500"
                                  >
                                    <Calendar className="w-3 h-3" />
                                  </span>
                                )}
                                {entry?.revisionScheduled && (
                                  <span
                                    title="Revisões agendadas: Próximo dia, 1 semana e mensais"
                                    className="text-amber-500"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                  </span>
                                )}
                                <Edit2 className="w-2.5 h-2.5 opacity-0 group-cell-hover/cell:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Pending cell state */
                          <div
                            className={`w-full h-full min-h-[58px] p-2 rounded-lg border border-dashed flex flex-col items-center justify-center transition-all group/empty ${
                              isDark
                                ? 'border-slate-800 hover:border-slate-700 bg-slate-900/20 hover:bg-slate-900/50 text-slate-500'
                                : 'border-slate-300 hover:border-slate-400 bg-slate-50/40 hover:bg-slate-100/60 text-slate-400'
                            }`}
                          >
                            <button
                              onClick={(e) => onQuickToggle(subject, day.index, day.dateStr, e)}
                              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                                isDark
                                  ? 'border-slate-800 group-hover/empty:border-red-500/50 group-hover/empty:bg-red-950/30 text-slate-600 group-hover/empty:text-red-400'
                                  : 'border-slate-300 group-hover/empty:border-red-500/50 group-hover/empty:bg-red-50 text-slate-400 group-hover/empty:text-red-500'
                              }`}
                              title="Marcar como estudado com 1 clique"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <span className="text-[10px] font-medium mt-1">
                              Marcar
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Summary Progress Column */}
                  <td className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <span
                        className={`font-bold text-xs ${
                          isDark ? 'text-slate-200' : 'text-slate-800'
                        }`}
                      >
                        {stats.completedCount}/7 dias
                      </span>
                      <div
                        className={`w-16 h-1.5 rounded-full mt-1.5 overflow-hidden ${
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
                        className={`text-[10px] font-bold mt-0.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        {formatDurationHours(stats.totalMinutes)}
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

