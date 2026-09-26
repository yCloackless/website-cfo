import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  X,
  Layers,
  Tag,
  CheckSquare,
  Square,
  FolderInput,
  PauseCircle,
  PlayCircle,
  Trash2,
  Filter,
  RefreshCw,
  GripVertical,
  ArrowDownToLine,
  Edit3,
  Image as ImageIcon,
} from 'lucide-react';
import { AnkiCard, AnkiDeck, FlashcardImportance } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';
import { ConfirmModal } from '../ConfirmModal';

interface AnkiBrowserModalProps {
  decks: AnkiDeck[];
  isOpen: boolean;
  onClose: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiBrowserModal: React.FC<AnkiBrowserModalProps> = ({
  decks,
  isOpen,
  onClose,
  showToast,
}) => {
  const [query, setQuery] = useState<string>('');
  const [importanceFilter, setImportanceFilter] = useState<string>('');
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action modals/dropdowns
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false);
  const [isImportanceOpen, setIsImportanceOpen] = useState<boolean>(false);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropDeckId, setDropDeckId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<AnkiCard | null>(null);
  const [editingCard, setEditingCard] = useState<AnkiCard | null>(null);
  const [editFields, setEditFields] = useState<string[]>([]);
  const [editTags, setEditTags] = useState('');
  const [editImportance, setEditImportance] = useState<FlashcardImportance>('normal');
  const [uploadField, setUploadField] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const editFileInput = useRef<HTMLInputElement>(null);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/anki/browser?query=${encodeURIComponent(query)}&limit=100`;
      if (importanceFilter) {
        url += `&importance=${encodeURIComponent(importanceFilter)}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards || []);
        setTotal(data.total || 0);
        setSelectedIds(new Set());
      }
    } catch {
      showToast?.('Erro ao buscar cartões.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, importanceFilter, showToast]);

  useEffect(() => {
    if (isOpen) {
      void fetchCards();
    }
  }, [isOpen, fetchCards]);

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

  if (!isOpen) return null;

  const toggleSelectAll = () => {
    if (selectedIds.size === cards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cards.map((c) => c.id)));
    }
  };

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Bulk Actions
  const handleBulkMove = async () => {
    if (!targetDeckId || selectedIds.size === 0) return;
    try {
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          cardIds: Array.from(selectedIds),
          targetDeckId,
        }),
      });
      if (res.ok) {
        showToast?.('Cartões movidos com sucesso!', 'success');
        setIsMoveOpen(false);
        void fetchCards();
      }
    } catch {
      showToast?.('Erro ao mover cartões.', 'error');
    }
  };

  const handleDropCards = async (targetId: string) => {
    if (!draggedCardId) return;
    const cardIds = selectedIds.has(draggedCardId) ? Array.from(selectedIds) : [draggedCardId];
    const sourceIds = new Set(cards.filter((card) => cardIds.includes(card.id)).map((card) => card.deckId));
    if (sourceIds.size === 1 && sourceIds.has(targetId)) {
      showToast?.('O destino precisa ser outro baralho.', 'info');
      return;
    }

    try {
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', cardIds, targetDeckId: targetId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(data.message || 'Não foi possível mover os flashcards.', 'error');
        return;
      }
      showToast?.(`${data.affectedCount || 0} flashcard(s) movido(s) para o novo baralho.`, 'success');
      void fetchCards();
    } catch {
      showToast?.('Erro de conexão ao mover flashcards.', 'error');
    } finally {
      setDraggedCardId(null);
      setDropDeckId(null);
    }
  };

  const handleBulkSuspend = async (suspend: boolean) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suspend',
          cardIds: Array.from(selectedIds),
          suspend,
        }),
      });
      if (res.ok) {
        showToast?.(suspend ? 'Cartões suspensos.' : 'Cartões reativados.', 'info');
        void fetchCards();
      }
    } catch {
      showToast?.('Erro ao alterar status dos cartões.', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (isDeleting) return;
    const targetIds = cardToDelete ? [cardToDelete.id] : Array.from(selectedIds);
    if (targetIds.length === 0) return;

    try {
      setIsDeleting(true);
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          cardIds: targetIds,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(data.message || 'Erro ao apagar flashcard permanentemente.', 'error');
        return;
      }

      const count = data.affectedCount || targetIds.length;
      showToast?.(
        count === 1
          ? 'Flashcard apagado permanentemente.'
          : `${count} flashcards apagados permanentemente.`,
        'success'
      );

      setDeleteConfirmOpen(false);
      setCardToDelete(null);

      if (editingCard && targetIds.includes(editingCard.id)) {
        setEditingCard(null);
      }

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of targetIds) next.delete(id);
        return next;
      });

      void fetchCards();
    } catch {
      showToast?.('Erro de conexão ao apagar flashcard.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkImportance = async (importance: FlashcardImportance) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_importance',
          cardIds: Array.from(selectedIds),
          importance,
        }),
      });
      if (res.ok) {
        const labels: Record<FlashcardImportance, string> = {
          low: 'Baixa',
          normal: 'Normal',
          high: 'Alta',
          essential: 'Essencial',
        };
        showToast?.(`Importância alterada para "${labels[importance]}" em ${selectedIds.size} cartão(ões).`, 'success');
        setIsImportanceOpen(false);
        void fetchCards();
      }
    } catch {
      showToast?.('Erro ao alterar importância dos cartões.', 'error');
    }
  };

  const saveEdit = async () => {
    if (savingEdit) return;
    if (!editingCard?.note) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/anki/notes/${editingCard.note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: editFields,
          tags: editTags.split(/\s+/).filter(Boolean),
          importance: editImportance,
        }),
      });
      if (!res.ok) throw new Error();
      setCards((prev) =>
        prev.map((card) =>
          card.note?.id === editingCard.note?.id
            ? {
                ...card,
                importance: editImportance,
                note: {
                  ...card.note,
                  fields: editFields,
                  tags: editTags.split(/\s+/).filter(Boolean),
                  importance: editImportance,
                },
              }
            : card
        )
      );
      setEditingCard(null);
      showToast?.('Flashcard atualizado.', 'success');
    } catch {
      showToast?.('Não foi possível salvar o flashcard.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const uploadEditImage = async (file?: File, fieldIndex = uploadField) => {
    if (uploadingImage) return;
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      if (file) showToast?.('Selecione uma imagem válida de até 5MB.', 'error');
      return;
    }
    try {
      setUploadingImage(true);
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const res = await apiFetch('/api/anki/media/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64, filename: file.name }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setEditFields((prev) => prev.map((field, idx) => idx === fieldIndex ? `${field}\n<img src="${data.url}" />` : field));
    } catch { showToast?.('Erro ao anexar imagem.', 'error'); }
    finally { setUploadingImage(false); }
  };

  const handleEditPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>, fieldIndex: number) => {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault();
    void uploadEditImage(image, fieldIndex);
  };

  const getQueueBadge = (queue: number) => {
    if (queue === -1) return <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">Suspenso</span>;
    if (queue === -3 || queue === -2) return <span className="text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded text-[11px]">Enterrado</span>;
    if (queue === 0) return <span className="text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded text-[11px]">Novo</span>;
    if (queue === 1 || queue === 3) return <span className="text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-[11px]">Aprender</span>;
    return <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[11px]">Revisão</span>;
  };

  const getImportanceBadge = (importance?: FlashcardImportance) => {
    switch (importance) {
      case 'essential':
        return <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[11px] font-medium">Essencial</span>;
      case 'high':
        return <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-[11px] font-medium">Alta</span>;
      case 'low':
        return <span className="text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded text-[11px] font-medium">Baixa</span>;
      case 'normal':
      default:
        return <span className="text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded text-[11px] font-medium">Normal</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-zinc-100">Painel de Cartões (Anki Browser)</h2>
            <span className="text-xs text-zinc-500 ml-2 font-mono">({total} cartões encontrados)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quick Filters */}
        <div className="p-3 border-b border-zinc-800 bg-zinc-900 flex flex-col sm:flex-row items-center gap-2">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void fetchCards()}
              placeholder='Sintaxe Anki: deck:"Matemática" tag:biologia is:due is:new is:essential...'
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-24 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-mono"
            />
            <button
              type="button"
              onClick={() => void fetchCards()}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-medium transition-colors"
            >
              Buscar
            </button>
          </div>

          {/* Importance Filter Dropdown */}
          <select
            value={importanceFilter}
            onChange={(e) => setImportanceFilter(e.target.value)}
            className="w-full sm:w-auto bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-sky-500 shrink-0 font-medium"
          >
            <option value="">Todas as importâncias</option>
            <option value="essential">Essencial</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baixa</option>
          </select>

          {/* Quick Syntax Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto py-1 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setQuery('is:due')}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 font-mono"
            >
              is:due
            </button>
            <button
              type="button"
              onClick={() => setQuery('is:new')}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 font-mono"
            >
              is:new
            </button>
            <button
              type="button"
              onClick={() => setQuery('importance:essential')}
              className="px-2 py-1 bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20 rounded font-mono"
            >
              is:essential
            </button>
            <button
              type="button"
              onClick={() => setQuery('is:suspended')}
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 font-mono"
            >
              is:suspended
            </button>
          </div>
        </div>

        {/* Mass Actions Toolbar */}
        {selectedIds.size > 0 && (
          <div className="bg-sky-500/10 border-b border-sky-500/20 px-4 py-2 flex items-center justify-between text-xs text-sky-300 animate-in fade-in">
            <span className="font-semibold">{selectedIds.size} cartão(ões) selecionado(s)</span>
            <div className="flex items-center gap-2">
              {/* Move deck */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMoveOpen(!isMoveOpen)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 transition-colors"
                >
                  <FolderInput className="w-3.5 h-3.5 text-sky-400" />
                  <span>Mover para Baralho...</span>
                </button>
                {isMoveOpen && (
                  <div className="absolute right-0 mt-1 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 z-20">
                    <select
                      value={targetDeckId}
                      onChange={(e) => setTargetDeckId(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded p-1.5 text-xs text-zinc-200 mb-2"
                    >
                      <option value="">Selecione o baralho...</option>
                      {decks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleBulkMove}
                      disabled={!targetDeckId}
                      className="w-full py-1 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold rounded text-xs transition-colors disabled:opacity-50"
                    >
                      Confirmar Mudança
                    </button>
                  </div>
                )}
              </div>

              {/* Set Importance Bulk */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsImportanceOpen(!isImportanceOpen)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 transition-colors"
                >
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Importância...</span>
                </button>
                {isImportanceOpen && (
                  <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-1 z-20 flex flex-col gap-0.5">
                    {(
                      [
                        { id: 'essential', label: 'Essencial', color: 'text-rose-400 hover:bg-rose-500/10' },
                        { id: 'high', label: 'Alta', color: 'text-amber-400 hover:bg-amber-500/10' },
                        { id: 'normal', label: 'Normal', color: 'text-zinc-200 hover:bg-zinc-800' },
                        { id: 'low', label: 'Baixa', color: 'text-zinc-400 hover:bg-zinc-800' },
                      ] as const
                    ).map((imp) => (
                      <button
                        key={imp.id}
                        type="button"
                        onClick={() => void handleBulkImportance(imp.id)}
                        className={`w-full text-left px-2.5 py-1.5 text-xs rounded transition-colors font-medium ${imp.color}`}
                      >
                        {imp.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Suspend / Unsuspend */}
              <button
                type="button"
                onClick={() => handleBulkSuspend(true)}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-400 flex items-center gap-1.5 transition-colors"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Suspender</span>
              </button>
              <button
                type="button"
                onClick={() => handleBulkSuspend(false)}
                className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 flex items-center gap-1.5 transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Reativar</span>
              </button>

              {/* Delete */}
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setCardToDelete(null);
                  setDeleteConfirmOpen(true);
                }}
                className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Apagar permanentemente</span>
              </button>
            </div>
          </div>
        )}

        <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-950/40 text-[11px] text-zinc-500 flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-violet-400" />
          <span>Arraste um flashcard — ou uma seleção — para outro baralho.</span>
        </div>

        {draggedCardId && (
          <div className="px-4 py-3 border-b border-violet-500/30 bg-violet-500/5 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-violet-200">
              <ArrowDownToLine className="w-4 h-4 animate-bounce" />
              Solte sobre o baralho de destino
              {selectedIds.has(draggedCardId) && <span className="text-violet-400">({selectedIds.size} selecionados)</span>}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {decks.map((deck) => {
                const isSource = cards.find((card) => card.id === draggedCardId)?.deckId === deck.id;
                return (
                  <div
                    key={deck.id}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!isSource) setDropDeckId(deck.id);
                    }}
                    onDragLeave={() => setDropDeckId(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!isSource) void handleDropCards(deck.id);
                    }}
                    className={`min-w-[150px] rounded-lg border px-3 py-2 transition-all duration-150 ${
                      isSource
                        ? 'border-zinc-800 bg-zinc-900/60 opacity-40'
                        : dropDeckId === deck.id
                          ? 'border-violet-300 bg-violet-500/25 scale-105 shadow-lg shadow-violet-500/20'
                          : 'border-violet-500/30 bg-zinc-900 hover:border-violet-400/70'
                    }`}
                  >
                    <div className="text-xs font-semibold text-zinc-200 truncate">{deck.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">Soltar aqui</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-950/80 sticky top-0 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider font-semibold z-10">
              <tr>
                <th className="p-3 w-10 text-center">
                  <button type="button" onClick={toggleSelectAll} className="text-zinc-400 hover:text-zinc-200">
                    {selectedIds.size > 0 && selectedIds.size === cards.length ? (
                      <CheckSquare className="w-4 h-4 text-sky-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-3 min-w-[200px]">Pergunta / Frente</th>
                <th className="p-3 min-w-[200px]">Resposta / Verso</th>
                <th className="p-3 min-w-[140px]">Baralho</th>
                <th className="p-3 w-28">Status</th>
                <th className="p-3 w-24">Importância</th>
                <th className="p-3 w-20 text-right">Intervalo</th>
                <th className="p-3 w-20 text-right">Revisões</th>
                <th className="p-3 w-24">Tags</th>
                <th className="p-3 w-20 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-zinc-500">
                    Carregando tabela de cartões...
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-zinc-500">
                    Nenhum cartão corresponde aos critérios de busca.
                  </td>
                </tr>
              ) : (
                cards.map((card) => {
                  const isSelected = selectedIds.has(card.id);
                  const frontText = card.note?.fields[0] || '';
                  const backText = card.note?.fields[1] || '';

                  return (
                    <tr
                      key={card.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', card.id);
                        setDraggedCardId(card.id);
                      }}
                      onDragEnd={() => {
                        setDraggedCardId(null);
                        setDropDeckId(null);
                      }}
                      onClick={() => toggleSelectCard(card.id)}
                      className={`hover:bg-zinc-800/40 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                        draggedCardId === card.id ? 'opacity-40 scale-[0.99]' : ''
                      } ${
                        isSelected ? 'bg-sky-500/10' : ''
                      }`}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => toggleSelectCard(card.id)}>
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-sky-400" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-600" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 font-normal text-zinc-200 truncate max-w-xs" title={frontText}>
                        {frontText.replace(/<[^>]*>?/gm, '')}
                      </td>
                      <td className="p-3 text-zinc-400 truncate max-w-xs" title={backText}>
                        {backText.replace(/<[^>]*>?/gm, '')}
                      </td>
                      <td className="p-3 text-zinc-300 font-medium truncate max-w-[140px]" title={card.deck?.name}>
                        {card.deck?.name}
                      </td>
                      <td className="p-3">{getQueueBadge(card.queue)}</td>
                      <td className="p-3">{getImportanceBadge(card.importance)}</td>
                      <td className="p-3 text-right font-mono text-zinc-300">
                        {card.intervalDays > 0 ? `${card.intervalDays}d` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-zinc-400">{card.reps}</td>
                      <td className="p-3 text-zinc-500 truncate max-w-[120px]">
                        {(card.note?.tags || []).join(', ') || '-'}
                      </td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            title="Editar flashcard"
                            aria-label="Editar flashcard"
                            disabled={!card.note || isDeleting}
                            onClick={() => {
                              setEditingCard(card);
                              setEditFields([...card.note!.fields]);
                              setEditTags((card.note!.tags || []).join(' '));
                              setEditImportance(card.importance || card.note?.importance || 'normal');
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-sky-300 hover:bg-sky-400/10 disabled:opacity-40 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            title="Apagar permanentemente"
                            aria-label="Apagar permanentemente"
                            disabled={isDeleting}
                            onClick={() => {
                              setCardToDelete(card);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title={cardToDelete || selectedIds.size === 1 ? 'Apagar flashcard permanentemente?' : `Apagar ${selectedIds.size} flashcards permanentemente?`}
        description={
          cardToDelete || selectedIds.size === 1
            ? 'Esta ação removerá o flashcard permanentemente do banco de dados e não pode ser desfeita.'
            : `Esta ação removerá ${selectedIds.size} flashcards selecionados permanentemente do banco de dados e não pode ser desfeita.`
        }
        badgeText={cardToDelete ? '1 flashcard' : `${selectedIds.size} selecionado(s)`}
        confirmLabel={isDeleting ? 'Apagando...' : 'Apagar permanentemente'}
        cancelLabel="Cancelar"
        variant="danger"
        iconType="danger"
        isDestructive
        onConfirm={() => void handleDeleteConfirm()}
        onClose={() => {
          if (!isDeleting) {
            setDeleteConfirmOpen(false);
            setCardToDelete(null);
          }
        }}
      />
      {editingCard && (
        <div className="fixed inset-0 z-[60] bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-3" onClick={() => setEditingCard(null)}>
          <section role="dialog" aria-modal="true" aria-label="Editar flashcard" onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <header className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-zinc-100 font-semibold">Editar flashcard</h3>
              <button type="button" onClick={() => setEditingCard(null)} aria-label="Fechar" className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </header>
            <div className="p-5 space-y-4 overflow-y-auto">
              {editFields.map((field, idx) => (
                <div key={idx}>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs uppercase tracking-wider text-zinc-400">{idx === 0 ? 'Pergunta / Frente' : `Campo ${idx + 1} / Resposta`}</label>
                    <button type="button" onClick={() => { setUploadField(idx); editFileInput.current?.click(); }} className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"><ImageIcon className="w-3.5 h-3.5" />Adicionar imagem</button>
                  </div>
                  <textarea value={field} onChange={(e) => setEditFields((prev) => prev.map((value, i) => i === idx ? e.target.value : value))}
                    onPaste={(event) => handleEditPaste(event, idx)}
                    rows={5} className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-sky-500" />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[...field.matchAll(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match, imageIdx) => (
                      <div key={`${match[1]}-${imageIdx}`} className="relative border border-zinc-700 rounded-lg p-1 bg-zinc-950">
                        <img src={match[1]} alt={`Imagem ${imageIdx + 1}`} className="h-16 max-w-28 object-contain rounded" />
                        <button type="button" aria-label="Remover imagem" title="Remover imagem" onClick={() => setEditFields((prev) => prev.map((value, i) => i === idx ? value.replace(match[0], '').trim() : value))}
                          className="absolute -top-2 -right-2 rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 w-5 h-5 text-xs">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <input ref={editFileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void uploadEditImage(e.target.files?.[0]); e.currentTarget.value = ''; }} />
              <div>
                <label className="block text-xs uppercase tracking-wider text-zinc-400 mb-1.5">Importância</label>
                <div className="inline-flex p-0.5 bg-zinc-950 border border-zinc-700 rounded-lg">
                  {(
                    [
                      { id: 'low', label: 'Baixa', activeClass: 'bg-zinc-800 text-zinc-200 shadow-sm' },
                      { id: 'normal', label: 'Normal', activeClass: 'bg-zinc-700 text-white font-semibold shadow-sm' },
                      { id: 'high', label: 'Alta', activeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold shadow-sm' },
                      { id: 'essential', label: 'Essencial', activeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold shadow-sm' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditImportance(opt.id)}
                      className={`px-3 py-1 text-xs rounded-md transition-all ${
                        editImportance === opt.id
                          ? opt.activeClass
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block"><span className="text-xs uppercase tracking-wider text-zinc-400">Tags</span><input value={editTags} onChange={(e) => setEditTags(e.target.value)} placeholder="Separe tags com espaços" className="mt-1.5 w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-sky-500" /></label>
            </div>
            <footer className="px-5 py-4 border-t border-zinc-800 flex justify-between items-center">
              <button
                type="button"
                disabled={isDeleting || savingEdit}
                onClick={() => {
                  setCardToDelete(editingCard);
                  setDeleteConfirmOpen(true);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 border border-red-500/20 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Apagar permanentemente</span>
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditingCard(null)} className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800">Cancelar</button>
                <button type="button" disabled={savingEdit || isDeleting} onClick={() => void saveEdit()} className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-sm disabled:opacity-50">{savingEdit ? 'Salvando…' : 'Salvar alterações'}</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
};
