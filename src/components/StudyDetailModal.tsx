import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Clock, BookOpen, FileText, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { Subject, StudyEntry } from '../types';
import { formatBRDate, formatBRDateShort, addDays } from '../utils/dateUtils';
import { CFO_INCIDENCE_DATA } from '../data/cfoIncidenceData';

interface StudyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: Subject | null;
  dayInfo: { index: number; name: string; dateStr: string } | null;
  existingEntry: StudyEntry | null;
  hasGoogleCalendar: boolean;
  initialDurationMinutes?: number;
  onSave: (data: {
    completed: boolean;
    topic: string;
    durationMinutes: number;
    notes: string;
    syncWithCalendar: boolean;
  }) => Promise<void>;
  isSaving: boolean;
}

export const StudyDetailModal: React.FC<StudyDetailModalProps> = ({
  isOpen,
  onClose,
  subject,
  dayInfo,
  existingEntry,
  hasGoogleCalendar,
  initialDurationMinutes,
  onSave,
  isSaving,
}) => {
  const [completed, setCompleted] = useState(true);
  const [topic, setTopic] = useState('');
  const [durationHours, setDurationHours] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [syncWithCalendar, setSyncWithCalendar] = useState(hasGoogleCalendar);

  // Mapeia o assunto oficial e suas submatérias mais recorrentes no CFO CBMERJ
  const incidenceSubject = useMemo(() => {
    if (!subject) return null;
    const lowerName = subject.name.toLowerCase();
    return (
      CFO_INCIDENCE_DATA.subjects.find(
        (s) =>
          s.id === subject.id ||
          lowerName.includes(s.shortName.toLowerCase()) ||
          lowerName.includes(s.name.toLowerCase())
      ) || null
    );
  }, [subject]);

  useEffect(() => {
    if (existingEntry) {
      setCompleted(existingEntry.completed);
      setTopic(existingEntry.topic || '');
      const mins = initialDurationMinutes || existingEntry.durationMinutes || 60;
      const hours = Math.max(1, Math.round(mins / 60));
      setDurationHours(hours);
      setNotes(existingEntry.notes || '');
      setSyncWithCalendar(hasGoogleCalendar);
    } else {
      setCompleted(true);
      setTopic('');
      const mins = initialDurationMinutes || 60;
      const hours = Math.max(1, Math.round(mins / 60));
      setDurationHours(hours);
      setNotes('');
      setSyncWithCalendar(hasGoogleCalendar);
    }
  }, [existingEntry, hasGoogleCalendar, isOpen, initialDurationMinutes]);

  if (!isOpen || !subject || !dayInfo) return null;

  const dateFormatted = formatBRDate(dayInfo.dateStr);
  const rev1dDate = formatBRDate(addDays(dayInfo.dateStr, 1));
  const rev7dDate = formatBRDate(addDays(dayInfo.dateStr, 7));
  const rev30dDate = formatBRDate(addDays(dayInfo.dateStr, 30));
  const rev60dDate = formatBRDate(addDays(dayInfo.dateStr, 60));
  const rev90dDate = formatBRDate(addDays(dayInfo.dateStr, 90));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHours = Math.max(1, Math.round(Number(durationHours) || 1));
    const calculatedMinutes = cleanHours * 60;
    const canSync = syncWithCalendar && hasGoogleCalendar && topic.trim().length > 0;

    await onSave({
      completed,
      topic: topic.trim(),
      durationMinutes: calculatedMinutes,
      notes: notes.trim(),
      syncWithCalendar: canSync,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 min-[380px]:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      <div 
        className="bg-[#0B1528] rounded-2xl max-w-lg w-full shadow-2xl border border-blue-900/50 overflow-hidden flex flex-col max-h-[92vh] max-h-[92dvh] text-slate-100 animate-in fade-in zoom-in-95 slide-in-from-bottom-5 duration-300 my-auto min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-blue-900/40 flex items-center justify-between bg-[#070D18]">
          <div className="flex items-center gap-3">
            <div
              className="w-2.5 h-10 rounded-full"
              style={{ backgroundColor: subject.color || '#0056D2' }}
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                {subject.category} • {dayInfo.name} ({formatBRDateShort(dayInfo.dateStr)})
              </span>
              <h2 className="text-base font-bold text-slate-100">
                {subject.name}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 scrollbar-thin">
          {/* Status Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Status do Estudo neste Dia:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCompleted(true)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                  completed
                    ? 'bg-blue-950/60 border-blue-500 text-blue-300 shadow-md shadow-blue-950/40'
                    : 'bg-[#0F1D38]/50 border-blue-900/40 text-slate-400 hover:bg-[#0F1D38]'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${completed ? 'text-blue-400' : 'text-slate-500'}`} />
                <span>Estudado / Concluído</span>
              </button>

              <button
                type="button"
                onClick={() => setCompleted(false)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                  !completed
                    ? 'bg-slate-800 border-slate-700 text-slate-100 font-bold'
                    : 'bg-[#0F1D38]/50 border-blue-900/40 text-slate-500 hover:bg-[#0F1D38]'
                }`}
              >
                <span>Pendente / Não Estudado</span>
              </button>
            </div>
          </div>

          {/* Topic Studied & Submatérias selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                Nome do Conteúdo / Tópico Estudado:
              </label>
              <span className="text-[10px] text-blue-400 font-semibold">
                (Sincroniza na Google Agenda)
              </span>
            </div>
            <input
              type="text"
              placeholder="Ex: Cartografia, Era Vargas, Termologia, Crase..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#0F1D38] border border-blue-900/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:bg-[#132345] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />

            {/* Submatérias mais recorrentes no CFO CBMERJ */}
            {incidenceSubject && incidenceSubject.microTopics && incidenceSubject.microTopics.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    Submatérias Frequentes da Banca (clique para preencher):
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {incidenceSubject.microTopics.length} submaterias
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 scrollbar-thin p-2 bg-[#070D18] rounded-xl border border-blue-900/40">
                  {incidenceSubject.microTopics.map((m) => {
                    const isSelected = topic === m.name;
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => setTopic(m.name)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all text-left border cursor-pointer ${
                          isSelected
                            ? 'bg-[#0056D2] text-white border-blue-400 font-bold shadow-sm scale-[1.02]'
                            : 'bg-[#0B1528] text-slate-300 border-blue-900/50 hover:border-blue-500/60 hover:text-white hover:bg-[#0F1D38]'
                        }`}
                      >
                        <span>{m.name}</span>
                        <span className="ml-1.5 text-[9px] opacity-75 font-mono">({m.questions}q)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Duration in Hours (Whole Hours Only) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                Carga Horária Estudada (Horas Inteiras):
              </label>
              <span className="text-xs font-bold text-blue-400">
                {durationHours} {durationHours === 1 ? 'hora' : 'horas'} ({durationHours}h)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="24"
                  step="1"
                  value={durationHours}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setDurationHours(isNaN(parsed) || parsed < 1 ? 1 : parsed);
                  }}
                  className="w-24 px-3 py-2 bg-[#0F1D38] border border-blue-900/60 rounded-xl text-xs font-bold text-slate-100 focus:bg-[#132345] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-center"
                />
                <span className="text-xs text-slate-400 font-semibold">h</span>
              </div>

              {/* Preset whole-hour buttons */}
              <div className="flex gap-1.5 flex-wrap ml-auto">
                {[1, 2, 3, 4, 5, 6].map((hrs) => (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setDurationHours(hrs)}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                      durationHours === hrs
                        ? 'bg-[#0056D2] text-white border-blue-400 font-bold shadow-xs scale-105'
                        : 'bg-[#0F1D38] border-blue-900/40 text-slate-400 hover:bg-[#132345] hover:text-slate-200'
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Horas inteiras de estudo (sem decimais). Ex: 2h, 3h, 5h.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              Anotações / Pontos de Dificuldade:
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Acertos de questões 15/20. Revisar fórmulas de calor específico."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-[#0F1D38] border border-blue-900/60 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:bg-[#132345] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Google Calendar & Spaced Review Preview Card */}
          <div className="bg-[#070D18] rounded-xl p-3.5 border border-blue-900/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-bold text-slate-200">
                  Google Agenda &amp; Revisões Inteligentes
                </span>
              </div>
              {hasGoogleCalendar ? (
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncWithCalendar}
                    onChange={(e) => setSyncWithCalendar(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#0056D2]"></div>
                  <span className="ml-1.5 text-[11px] font-semibold text-slate-300">
                    Sincronizar
                  </span>
                </label>
              ) : (
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-semibold border border-slate-700">
                  Google Agenda Desconectada
                </span>
              )}
            </div>

            {syncWithCalendar && !topic.trim() && (
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-300 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  O evento <strong>só será agendado quando você selecionar ou digitar a submatéria</strong> acima. Deixar sem nome salva apenas no cronograma local.
                </span>
              </div>
            )}

            <div className="text-[11px] text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <span>Registro do Estudo: <strong className="text-slate-200">{dateFormatted}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>1ª Revisão (+24h / Próx Dia): <strong className="text-slate-200">{rev1dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>2ª Revisão (+1 semana / 7D): <strong className="text-slate-200">{rev7dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>3ª Revisão (+1 mês / 30D): <strong className="text-slate-200">{rev30dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>4ª Revisão (+2 meses / 60D): <strong className="text-slate-200">{rev60dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>5ª Revisão (+3 meses / 90D): <strong className="text-slate-200">{rev90dDate}</strong></span>
              </p>
            </div>
            {!hasGoogleCalendar && (
              <p className="text-[10px] text-slate-500 italic">
                💡 Conecte sua conta do Google no topo para sincronizar os eventos e revisões com seu Google Calendar sem duplicidades.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-blue-900/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 text-xs font-extrabold text-white bg-[#0056D2] hover:bg-[#0047B3] active:scale-[0.98] rounded-xl shadow-md shadow-blue-950/60 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-sky-300" />
                  <span>Salvar Estudo &amp; Sincronizar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
