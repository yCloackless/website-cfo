import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, BookOpen, FileText, CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';
import { Subject, StudyEntry } from '../types';
import { formatBRDate, formatBRDateShort, addDays } from '../utils/dateUtils';

interface StudyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: Subject | null;
  dayInfo: { index: number; name: string; dateStr: string } | null;
  existingEntry: StudyEntry | null;
  hasGoogleCalendar: boolean;
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
  onSave,
  isSaving,
}) => {
  const [completed, setCompleted] = useState(true);
  const [topic, setTopic] = useState('');
  const [durationHours, setDurationHours] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [syncWithCalendar, setSyncWithCalendar] = useState(hasGoogleCalendar);

  useEffect(() => {
    if (existingEntry) {
      setCompleted(existingEntry.completed);
      setTopic(existingEntry.topic || '');
      const mins = existingEntry.durationMinutes || 60;
      // Round to nearest integer hour (e.g. 60m -> 1h, 120m -> 2h, 195m -> 3h)
      const hours = Math.max(1, Math.round(mins / 60));
      setDurationHours(hours);
      setNotes(existingEntry.notes || '');
      setSyncWithCalendar(hasGoogleCalendar);
    } else {
      setCompleted(true);
      setTopic('');
      setDurationHours(1);
      setNotes('');
      setSyncWithCalendar(hasGoogleCalendar);
    }
  }, [existingEntry, hasGoogleCalendar, isOpen]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-[#111218] rounded-2xl max-w-lg w-full shadow-2xl border border-slate-800 overflow-hidden flex flex-col max-h-[90vh] text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0D0E13]">
          <div className="flex items-center gap-3">
            <div
              className="w-2.5 h-10 rounded-full"
              style={{ backgroundColor: subject.color }}
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {subject.category} • {dayInfo.name} ({formatBRDateShort(dayInfo.dateStr)})
              </span>
              <h2 className="text-base font-semibold text-slate-100">
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          {/* Status Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Status do Estudo neste Dia:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCompleted(true)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                  completed
                    ? 'bg-red-950/40 border-red-500 text-red-400 shadow-md shadow-red-950/30'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${completed ? 'text-red-400' : 'text-slate-500'}`} />
                <span>Estudado / Concluído</span>
              </button>

              <button
                type="button"
                onClick={() => setCompleted(false)}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                  !completed
                    ? 'bg-slate-800 border-slate-700 text-slate-100 font-bold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:bg-slate-800/60'
                }`}
              >
                <span>Pendente / Não Estudado</span>
              </button>
            </div>
          </div>

          {/* Topic Studied */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                Nome do Conteúdo / Tópico Estudado:
              </label>
              <span className="text-[10px] text-amber-400 font-medium">
                (Necessário para agendar no Google Calendar)
              </span>
            </div>
            <input
              type="text"
              placeholder="Ex: Termologia e Calorimetria, Crase, Geometria..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors"
            />
          </div>

          {/* Duration in Hours (Whole Hours Only) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-red-400" />
                Carga Horária Estudada (Horas Inteiras):
              </label>
              <span className="text-xs font-bold text-amber-400">
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
                  className="w-24 px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-bold text-slate-100 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 text-center"
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
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                      durationHours === hrs
                        ? 'bg-red-600 text-white border-red-600 font-bold shadow-xs scale-105'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {hrs}h
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Horas inteiras de estudo (sem decimais). Ex: 2h, 3h, 5h.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              Anotações / Pontos de Dificuldade:
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Acertos de questões 15/20. Revisar fórmulas de calor específico."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors"
            />
          </div>

          {/* Google Calendar & Spaced Review Preview Card */}
          <div className="bg-slate-900/70 rounded-xl p-3.5 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold text-slate-200">
                  Google Agenda & Revisões Inteligentes
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
                  <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-red-600"></div>
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
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-1.5">
                <span className="font-bold">⚠️</span>
                <span>
                  O evento <strong>só será colocado na Google Agenda quando você preencher o nome do conteúdo</strong> acima. Deixar sem nome salva apenas no cronograma local.
                </span>
              </div>
            )}

            <div className="text-[11px] text-slate-400 space-y-1">
              <p className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                <span>Registro do Estudo: <strong className="text-slate-200">{dateFormatted}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>1ª Revisão (+24h / Próx Dia): <strong className="text-slate-200">{rev1dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>2ª Revisão (+1 semana / 7D): <strong className="text-slate-200">{rev7dDate}</strong></span>
              </p>
              <p className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-yellow-400" />
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
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] rounded-xl shadow-md shadow-red-950/60 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar Estudo</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
