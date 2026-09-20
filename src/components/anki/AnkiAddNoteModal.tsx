import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Bold,
  Italic,
  Underline,
  Code,
  Sparkles,
  Eye,
  Layers,
  Tag,
  Lightbulb,
} from 'lucide-react';
import { AnkiDeck, AnkiNoteType } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';
import { ClozeLatexCard } from '../flashcards/ClozeLatexCard';

interface AnkiAddNoteModalProps {
  decks: AnkiDeck[];
  defaultDeckId?: string;
  isOpen: boolean;
  onClose: () => void;
  onNoteAdded: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiAddNoteModal: React.FC<AnkiAddNoteModalProps> = ({
  decks,
  defaultDeckId,
  isOpen,
  onClose,
  onNoteAdded,
  showToast,
}) => {
  const [notetypes, setNotetypes] = useState<AnkiNoteType[]>([]);
  const [selectedNotetypeId, setSelectedNotetypeId] = useState<string>('');
  const [selectedDeckId, setSelectedDeckId] = useState<string>('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [tagsInput, setTagsInput] = useState<string>('');
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const activeFieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Fetch notetypes
  useEffect(() => {
    if (!isOpen) return;

    const fetchNotetypes = async () => {
      try {
        const res = await apiFetch('/api/anki/notetypes');
        if (res.ok) {
          const data = await res.json();
          const nts: AnkiNoteType[] = data.notetypes || [];
          setNotetypes(nts);
          if (nts.length > 0 && !selectedNotetypeId) {
            setSelectedNotetypeId(nts[0].id);
          }
        }
      } catch {}
    };

    void fetchNotetypes();
  }, [isOpen]);

  useEffect(() => {
    if (defaultDeckId) {
      setSelectedDeckId(defaultDeckId);
    } else if (decks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(decks[0].id);
    }
  }, [defaultDeckId, decks]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const activeNotetype = notetypes.find((n) => n.id === selectedNotetypeId) || notetypes[0];

  if (!isOpen) return null;

  const handleFieldChange = (fieldName: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: val }));
  };

  // Formatting Toolbar Helper
  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!activeFieldRef.current) return;
    const textarea = activeFieldRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end) || 'texto';

    const newText = text.substring(0, start) + prefix + selectedText + suffix + text.substring(end);
    const fieldName = textarea.dataset.fieldname || '';

    handleFieldChange(fieldName, newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const insertCloze = () => {
    if (!activeFieldRef.current) return;
    const textarea = activeFieldRef.current;
    const text = textarea.value;

    // Detect highest current cN index
    const regex = /\{\{c(\d+)::/g;
    let match: RegExpExecArray | null;
    let maxIndex = 0;
    while ((match = regex.exec(text)) !== null) {
      const idx = parseInt(match[1], 10);
      if (idx > maxIndex) maxIndex = idx;
    }
    const nextIndex = maxIndex + 1;

    insertFormatting(`{{c${nextIndex}::`, '}}');
  };

  const handleSaveNote = async () => {
    if (!selectedDeckId) {
      showToast?.('Selecione um baralho de destino.', 'error');
      return;
    }
    if (!activeNotetype) return;

    // Map field values into ordered array
    const orderedFields = activeNotetype.fields.map((f) => fieldValues[f.name] || '');

    // Check that at least the first field has content
    if (!orderedFields[0] || !orderedFields[0].trim()) {
      showToast?.('Preencha o campo principal do cartão.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      const tags = tagsInput
        .split(/[,\s]+/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

      const res = await apiFetch('/api/anki/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeckId,
          notetypeId: activeNotetype.id,
          fields: orderedFields,
          tags,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast?.(`Nota adicionada com sucesso! (${data.cardsCount} card(s) gerados)`, 'success');
        setFieldValues({});
        onNoteAdded();
      } else {
        showToast?.('Falha ao salvar nota no Anki.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao salvar nota.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-zinc-100">Adicionar Nota (Anki)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Controls: Type & Deck Selectors */}
        <div className="p-4 border-b border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900/50">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Tipo de Nota
            </label>
            <select
              value={selectedNotetypeId}
              onChange={(e) => {
                setSelectedNotetypeId(e.target.value);
                setFieldValues({});
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              {notetypes.map((nt) => (
                <option key={nt.id} value={nt.id}>
                  {nt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Baralho de Destino
            </label>
            <select
              value={selectedDeckId}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between gap-1 overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => insertFormatting('<b>', '</b>')}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
              title="Negrito (Ctrl+B)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('<i>', '</i>')}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
              title="Itálico (Ctrl+I)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('<u>', '</u>')}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
              title="Sublinhado (Ctrl+U)"
            >
              <Underline className="w-4 h-4" />
            </button>

            {/* Cloze deletion button */}
            <button
              type="button"
              onClick={insertCloze}
              className="px-2 py-1 hover:bg-zinc-800 rounded text-sky-400 hover:text-sky-300 font-mono text-xs font-bold flex items-center gap-1"
              title="Inserir Ocultação Cloze {{c1::termo}}"
            >
              <span>[ ... ]</span>
              <span className="text-[10px] text-zinc-500">Cloze</span>
            </button>

            <button
              type="button"
              onClick={() => insertFormatting('$', '$')}
              className="p-1.5 hover:bg-zinc-800 rounded text-emerald-400 hover:text-emerald-300 text-xs font-mono font-bold"
              title="Fórmula Matemática KaTeX ($fórmula$)"
            >
              ∑
            </button>

            <button
              type="button"
              onClick={() => insertFormatting('<div class="bizu">💡 Bizu: ', '</div>')}
              className="px-2 py-1 hover:bg-zinc-800 rounded text-amber-400 hover:text-amber-300 text-xs font-medium flex items-center gap-1"
              title="Inserir Dica / Bizu"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Bizu</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsPreview(!isPreview)}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              isPreview
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{isPreview ? 'Editar' : 'Pré-visualizar'}</span>
          </button>
        </div>

        {/* Dynamic Fields Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {isPreview ? (
            <div className="space-y-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                  Prévia da Frente (Pergunta)
                </span>
                <div className="text-lg text-zinc-100">
                  <ClozeLatexCard
                    text={activeNotetype?.fields[0] ? fieldValues[activeNotetype.fields[0].name] || '' : ''}
                    isAnswer={false}
                  />
                </div>
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-2">
                  Prévia do Verso (Resposta)
                </span>
                <div className="text-lg text-zinc-100">
                  <ClozeLatexCard
                    text={
                      activeNotetype?.kind === 'cloze'
                        ? activeNotetype?.fields[0] ? fieldValues[activeNotetype.fields[0].name] || '' : ''
                        : activeNotetype?.fields[1] ? fieldValues[activeNotetype.fields[1].name] || '' : ''
                    }
                    isAnswer={true}
                  />
                </div>
              </div>
            </div>
          ) : (
            activeNotetype?.fields.map((f, idx) => (
              <div key={f.id}>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  {f.name} {idx === 0 ? '(Obrigatório)' : ''}
                </label>
                <textarea
                  data-fieldname={f.name}
                  value={fieldValues[f.name] || ''}
                  onChange={(e) => handleFieldChange(f.name, e.target.value)}
                  onFocus={(e) => (activeFieldRef.current = e.target)}
                  rows={activeNotetype.kind === 'cloze' && idx === 0 ? 5 : 3}
                  placeholder={`Digite o conteúdo para o campo ${f.name}...`}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-sans resize-y leading-relaxed"
                />
              </div>
            ))
          )}

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-zinc-500" />
              <span>Tags (separadas por espaço)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="ex: anatomia cbmerj dificil 2024"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleSaveNote}
            disabled={isSaving}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold rounded-lg text-xs transition-all shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Adicionar Nota'}
          </button>
        </div>
      </div>
    </div>
  );
};
