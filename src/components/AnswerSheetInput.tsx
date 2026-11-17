import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Grid3X3,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppTheme, Subject } from '../types';
import { apiFetch } from '../services/apiFetch';
import {
  AnswerOption,
  SubjectScoreEntry,
  clampQuestionCount,
  formatAnswerTokens,
  gradeAnswerSheet,
  parseAnswerTokens,
} from '../utils/answerSheet';

interface AnswerSheetInputProps {
  theme: AppTheme;
  subjects?: Subject[];
  totalQuestions: number;
  onChangeTotalQuestions: (nextTotal: number) => void;
  studentAnswers: AnswerOption[];
  onChangeStudentAnswers: (next: AnswerOption[]) => void;
  officialKey: AnswerOption[];
  onChangeOfficialKey: (next: AnswerOption[]) => void;
  subjectScores: SubjectScoreEntry[];
  onChangeSubjectScores: (next: SubjectScoreEntry[]) => void;
  manualCorrectCount?: number;
  onChangeManualCorrectCount?: (next: number) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const STUDENT_OPTIONS: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'U'> = ['A', 'B', 'C', 'D', 'E', 'U'];
const KEY_OPTIONS: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];

export const AnswerSheetInput: React.FC<AnswerSheetInputProps> = ({
  theme,
  subjects = [],
  totalQuestions,
  onChangeTotalQuestions,
  studentAnswers,
  onChangeStudentAnswers,
  officialKey,
  onChangeOfficialKey,
  subjectScores,
  onChangeSubjectScores,
  manualCorrectCount,
  onChangeManualCorrectCount,
  showToast,
}) => {
  const isDark = theme === 'dark';
  const [activeSubTab, setActiveSubTab] = useState<'student' | 'key' | 'subjects'>('student');
  const [studentChatText, setStudentChatText] = useState(() =>
    studentAnswers.some(Boolean) ? formatAnswerTokens(studentAnswers) : ''
  );
  const [keyMode, setKeyMode] = useState<'photo' | 'text' | 'grid'>('photo');
  const [keyChatText, setKeyChatText] = useState(() =>
    officialKey.some(Boolean) ? formatAnswerTokens(officialKey) : ''
  );
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const [isParsingPhoto, setIsParsingPhoto] = useState(false);

  const [newSubjectId, setNewSubjectId] = useState<string>(subjects[0]?.id || 'custom');
  const [customSubjectName, setCustomSubjectName] = useState('');
  const [newSubjectCorrect, setNewSubjectCorrect] = useState('');
  const [newSubjectTotal, setNewSubjectTotal] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeTotal = clampQuestionCount(totalQuestions);
  const hasOfficialKey = officialKey.some((k) => k && k !== 'U');
  const hasStudentAnswers = studentAnswers.some(Boolean);

  const graded = useMemo(() => {
    if (!hasOfficialKey) return null;
    return gradeAnswerSheet(
      Array.from({ length: safeTotal }, (_, i) => studentAnswers[i] ?? null),
      Array.from({ length: safeTotal }, (_, i) => officialKey[i] ?? null)
    );
  }, [hasOfficialKey, safeTotal, studentAnswers, officialKey]);

  const resizeArray = (arr: AnswerOption[], nextLen: number): AnswerOption[] =>
    Array.from({ length: nextLen }, (_, i) => arr[i] ?? null);

  const handleTotalChange = (val: number) => {
    const next = clampQuestionCount(val);
    onChangeTotalQuestions(next);
    onChangeStudentAnswers(resizeArray(studentAnswers, next));
    onChangeOfficialKey(resizeArray(officialKey, next));
  };

  const applyStudentChat = () => {
    const parsed = parseAnswerTokens(studentChatText, safeTotal, true);
    onChangeStudentAnswers(parsed);
    setStudentChatText(formatAnswerTokens(parsed));
    showToast?.('Cartão-resposta preenchido a partir do texto!', 'success');
  };

  const applyKeyChat = () => {
    const parsed = parseAnswerTokens(keyChatText, safeTotal, false);
    onChangeOfficialKey(parsed);
    setKeyChatText(formatAnswerTokens(parsed));
    showToast?.('Gabarito oficial aplicado!', 'success');
  };

  const toggleAnswerAt = (
    target: 'student' | 'key',
    index: number,
    option: 'A' | 'B' | 'C' | 'D' | 'E' | 'U'
  ) => {
    if (target === 'student') {
      const next = resizeArray(studentAnswers, safeTotal);
      next[index] = next[index] === option ? null : option;
      onChangeStudentAnswers(next);
      setStudentChatText(formatAnswerTokens(next));
    } else {
      const next = resizeArray(officialKey, safeTotal);
      next[index] = next[index] === option ? null : option;
      onChangeOfficialKey(next);
      setKeyChatText(formatAnswerTokens(next));
    }
  };

  const readImageFileToDataUrl = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast?.('Selecione ou cole uma imagem PNG, JPG ou WEBP válida.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPastedPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          readImageFileToDataUrl(file);
          return;
        }
      }
    }
  };

  const handleParsePhotoWithAI = async () => {
    if (!pastedPreview) {
      showToast?.('Cole ou selecione uma foto do gabarito primeiro.', 'warning');
      return;
    }
    try {
      setIsParsingPhoto(true);
      const res = await apiFetch('/api/ai/parse-answer-key-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: pastedPreview,
          totalQuestions: safeTotal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.letters)) {
        showToast?.(data.message || 'Não foi possível ler o gabarito da foto.', 'error');
        return;
      }
      const parsed = resizeArray(data.letters, safeTotal);
      onChangeOfficialKey(parsed);
      setKeyChatText(data.rawText || formatAnswerTokens(parsed));
      setKeyMode('grid');
      showToast?.('Gabarito extraído da imagem! Confira as bolinhas.', 'success');
    } catch {
      showToast?.('Erro de conexão ao ler foto do gabarito.', 'error');
    } finally {
      setIsParsingPhoto(false);
    }
  };

  const handleAddSubjectScore = () => {
    const selected = subjects.find((s) => s.id === newSubjectId);
    const subjectName = newSubjectId === 'custom' ? customSubjectName.trim() : (selected?.name || '').trim();
    if (!subjectName) {
      showToast?.('Informe ou selecione o nome da matéria.', 'warning');
      return;
    }
    const total = Math.max(1, Math.min(200, Math.round(Number(newSubjectTotal) || 0)));
    const correct = Math.max(0, Math.min(total, Math.round(Number(newSubjectCorrect) || 0)));

    const filtered = subjectScores.filter(
      (item) => item.subjectName.toLowerCase() !== subjectName.toLowerCase()
    );
    onChangeSubjectScores([
      ...filtered,
      {
        subjectId: selected?.id,
        subjectName,
        correctCount: correct,
        totalCount: total,
      },
    ]);
    setCustomSubjectName('');
    setNewSubjectCorrect('');
    setNewSubjectTotal('');
  };

  const surface = isDark ? 'bg-slate-900/75 border-slate-800' : 'bg-slate-50 border-slate-200';
  const inputSurface = isDark
    ? 'bg-slate-950 border-slate-700 text-slate-100 placeholder:text-slate-500'
    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400';

  return (
    <div className={`rounded-2xl border p-4 space-y-4 ${surface}`}>
      {/* Topo: Quantidade de Questões & Resumo Instantâneo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/40">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Questões:
          </label>
          <input
            type="number"
            min={1}
            max={200}
            value={safeTotal}
            onChange={(e) => handleTotalChange(Number(e.target.value))}
            className={`w-20 rounded-xl border px-2.5 py-1.5 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${inputSurface}`}
          />
          <div className="flex items-center gap-1">
            {[45, 60, 90, 100].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleTotalChange(preset)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  safeTotal === preset
                    ? 'bg-blue-600 text-white'
                    : isDark
                    ? 'bg-slate-800 text-slate-400 hover:text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Resumo automático */}
        {graded ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {graded.correctCount}/{safeTotal} acertos ({graded.accuracyPct}%)
            </span>
            <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {graded.wrongCount} erro(s)
            </span>
            {graded.blankCount > 0 && (
              <span className="px-2 py-1 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30">
                {graded.blankCount} U/branco
              </span>
            )}
          </div>
        ) : onChangeManualCorrectCount ? (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400">Acertos manuais:</label>
            <input
              type="number"
              min={0}
              max={safeTotal}
              value={manualCorrectCount ?? 0}
              onChange={(e) =>
                onChangeManualCorrectCount(Math.max(0, Math.min(safeTotal, Number(e.target.value) || 0)))
              }
              className={`w-20 rounded-xl border px-2.5 py-1 text-xs font-bold tabular-nums ${inputSurface}`}
            />
          </div>
        ) : null}
      </div>

      {/* Sub-abas: Minhas Respostas | Gabarito Oficial | Acertos por Matéria */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubTab('student')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'student'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : isDark
              ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          <span>Minhas Respostas</span>
          {hasStudentAnswers && (
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {studentAnswers.filter(Boolean).length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('key')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'key'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : isDark
              ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Gabarito Oficial</span>
          {hasOfficialKey && (
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {officialKey.filter((x) => x && x !== 'U').length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('subjects')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'subjects'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : isDark
              ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Acertos por Matéria</span>
          {subjectScores.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
              {subjectScores.length}
            </span>
          )}
        </button>
      </div>

      {/* ABA 1: MINHAS RESPOSTAS (Chat rápido + Cartão OMR clicável) */}
      {activeSubTab === 'student' && (
        <div className="space-y-3">
          {/* Chat rápido */}
          <div className={`rounded-xl border p-2.5 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 mb-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat rápido: digite letras separadas por espaço (ex: E A B B C U — Q1=E, Q2=A... U = em branco)</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={studentChatText}
                onChange={(e) => setStudentChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyStudentChat();
                  }
                }}
                placeholder="E A B B C U D A..."
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${inputSurface}`}
              />
              <button
                type="button"
                onClick={applyStudentChat}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Aplicar
              </button>
            </div>
          </div>

          {/* Cartão-Resposta OMR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
            {Array.from({ length: safeTotal }, (_, idx) => {
              const selected = studentAnswers[idx] ?? null;
              const official = officialKey[idx] ?? null;
              const isCorrect = official && official !== 'U' && selected === official;
              const isWrong = official && official !== 'U' && selected && selected !== 'U' && selected !== official;

              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
                    isCorrect
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : isWrong
                      ? 'border-red-500/40 bg-red-500/10'
                      : isDark
                      ? 'border-slate-800 bg-slate-950/60'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="w-8 font-mono text-[11px] font-bold text-slate-400 shrink-0">
                    Q{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1">
                    {STUDENT_OPTIONS.map((opt) => {
                      const active = selected === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleAnswerAt('student', idx, opt)}
                          className={`w-6 h-6 rounded-full text-[10px] font-extrabold transition-all cursor-pointer ${
                            active
                              ? opt === 'U'
                                ? 'bg-amber-500 text-slate-950 shadow-sm'
                                : 'bg-blue-600 text-white shadow-sm scale-105'
                              : isDark
                              ? 'bg-slate-800/90 text-slate-400 hover:bg-slate-700 hover:text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title={opt === 'U' ? 'Em branco / Indefinida' : `Alternativa ${opt}`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 2: GABARITO OFICIAL (Foto Ctrl+V/Upload, Texto ou Cartão) */}
      {activeSubTab === 'key' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setKeyMode('photo')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                keyMode === 'photo' ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Colar / Enviar Foto
            </button>
            <button
              type="button"
              onClick={() => setKeyMode('text')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                keyMode === 'text' ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Colar Texto
            </button>
            <button
              type="button"
              onClick={() => setKeyMode('grid')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                keyMode === 'grid' ? 'bg-emerald-600 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-white border border-slate-200 text-slate-700'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              Cartão Clicável
            </button>
          </div>

          {keyMode === 'photo' && (
            <div
              tabIndex={0}
              onPaste={handlePasteImage}
              className={`rounded-2xl border-2 border-dashed p-4 text-center space-y-3 focus:outline-none focus:border-emerald-500 ${
                isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-300 bg-white'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) readImageFileToDataUrl(file);
                }}
              />
              {pastedPreview ? (
                <div className="space-y-3">
                  <img
                    src={pastedPreview}
                    alt="Prévia do gabarito"
                    className="mx-auto max-h-44 rounded-xl border border-slate-700 object-contain"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      disabled={isParsingPhoto}
                      onClick={handleParsePhotoWithAI}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isParsingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {isParsingPhoto ? 'Lendo Gabarito...' : 'Extrair Gabarito da Foto com IA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPastedPreview(null)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-red-400 cursor-pointer"
                    >
                      Limpar foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  <ClipboardPaste className="w-7 h-7 mx-auto text-emerald-400" />
                  <p className="text-xs font-semibold">
                    Clique aqui e aperte <strong>Ctrl+V</strong> para colar o print do gabarito oficial
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                      isDark ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200' : 'border-slate-300 bg-slate-100 text-slate-800'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Ou enviar arquivo de imagem
                  </button>
                </div>
              )}
            </div>
          )}

          {keyMode === 'text' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={keyChatText}
                onChange={(e) => setKeyChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyKeyChat();
                  }
                }}
                placeholder="Cole o gabarito oficial separado por espaço: A C D E B..."
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40 ${inputSurface}`}
              />
              <button
                type="button"
                onClick={applyKeyChat}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Aplicar
              </button>
            </div>
          )}

          {/* Cartão clicável do Gabarito Oficial */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
            {Array.from({ length: safeTotal }, (_, idx) => {
              const selected = officialKey[idx] ?? null;
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
                    isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className="w-8 font-mono text-[11px] font-bold text-slate-400 shrink-0">
                    Q{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-1">
                    {KEY_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleAnswerAt('key', idx, opt)}
                        className={`w-6 h-6 rounded-full text-[10px] font-extrabold transition-all cursor-pointer ${
                          selected === opt
                            ? 'bg-emerald-600 text-white shadow-sm scale-105'
                            : isDark
                            ? 'bg-slate-800/90 text-slate-400 hover:bg-slate-700 hover:text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 3: ACERTOS POR MATÉRIA */}
      {activeSubTab === 'subjects' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
            <div className="sm:col-span-5">
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Matéria</label>
              <select
                value={newSubjectId}
                onChange={(e) => setNewSubjectId(e.target.value)}
                className={`w-full rounded-xl border px-2.5 py-2 text-xs font-semibold ${inputSurface}`}
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
                <option value="custom">Outra matéria...</option>
              </select>
            </div>

            {newSubjectId === 'custom' && (
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={customSubjectName}
                  onChange={(e) => setCustomSubjectName(e.target.value)}
                  placeholder="Ex: Química"
                  className={`w-full rounded-xl border px-2.5 py-2 text-xs ${inputSurface}`}
                />
              </div>
            )}

            <div className={newSubjectId === 'custom' ? 'sm:col-span-2' : 'sm:col-span-3'}>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Acertos</label>
              <input
                type="number"
                min={0}
                value={newSubjectCorrect}
                onChange={(e) => setNewSubjectCorrect(e.target.value)}
                placeholder="Ex: 8"
                className={`w-full rounded-xl border px-2.5 py-2 text-xs tabular-nums ${inputSurface}`}
              />
            </div>

            <div className={newSubjectId === 'custom' ? 'sm:col-span-2' : 'sm:col-span-2'}>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Total</label>
              <input
                type="number"
                min={1}
                value={newSubjectTotal}
                onChange={(e) => setNewSubjectTotal(e.target.value)}
                placeholder="Ex: 15"
                className={`w-full rounded-xl border px-2.5 py-2 text-xs tabular-nums ${inputSurface}`}
              />
            </div>

            <div className={newSubjectId === 'custom' ? 'sm:col-span-12 flex justify-end' : 'sm:col-span-2'}>
              <button
                type="button"
                onClick={handleAddSubjectScore}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Salvar
              </button>
            </div>
          </div>

          {subjectScores.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {subjectScores.map((item) => {
                const pct = Math.round((item.correctCount / Math.max(1, item.totalCount)) * 100);
                return (
                  <div
                    key={item.subjectName}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 ${
                      isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="truncate">{item.subjectName}</span>
                        <span className="tabular-nums text-slate-400">
                          {item.correctCount}/{item.totalCount} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            pct >= 75 ? 'bg-emerald-500' : pct >= 55 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeSubjectScores(
                          subjectScores.filter((s) => s.subjectName !== item.subjectName)
                        )
                      }
                      className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                      aria-label={`Remover ${item.subjectName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
