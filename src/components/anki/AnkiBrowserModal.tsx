import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { AnkiCard, AnkiDeck } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';

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
  const [cards, setCards] = useState<AnkiCard[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action modals/dropdowns
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false);

  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const url = `/api/anki/browser?query=${encodeURIComponent(query)}&limit=100`;
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
  }, [query, showToast]);

  useEffect(() => {
    if (isOpen) {
      void fetchCards();
    }
  }, [isOpen, fetchCards]);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedIds.size} cartão(ões)?`)) return;

    try {
      const res = await apiFetch('/api/anki/browser/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          cardIds: Array.from(selectedIds),
        }),
      });
      if (res.ok) {
        showToast?.('Cartões excluídos com sucesso.', 'success');
        void fetchCards();
      }
    } catch {
      showToast?.('Erro ao excluir cartões.', 'error');
    }
  };

  const getQueueBadge = (queue: number) => {
    if (queue === -1) return <span className="text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded text-[11px]">Suspenso</span>;
    if (queue === -3 || queue === -2) return <span className="text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded text-[11px]">Enterrado</span>;
    if (queue === 0) return <span className="text-sky-400 bg-sky-400/10 px-2 py-0.5 rounded text-[11px]">Novo</span>;
    if (queue === 1 || queue === 3) return <span className="text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-[11px]">Aprender</span>;
    return <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-[11px]">Revisão</span>;
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl h-[88vh] flex flex-col shadow-2xl overflow-hidden">
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
              placeholder='Sintaxe Anki: deck:"Matemática" tag:biologia is:due is:new is:suspended...'
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
                onClick={handleBulkDelete}
                className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center gap-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
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
                <th className="p-3 w-20 text-right">Intervalo</th>
                <th className="p-3 w-20 text-right">Revisões</th>
                <th className="p-3 w-24">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    Carregando tabela de cartões...
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
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
                      onClick={() => toggleSelectCard(card.id)}
                      className={`hover:bg-zinc-800/40 cursor-pointer transition-colors ${
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
                      <td className="p-3 text-right font-mono text-zinc-300">
                        {card.intervalDays > 0 ? `${card.intervalDays}d` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-zinc-400">{card.reps}</td>
                      <td className="p-3 text-zinc-500 truncate max-w-[120px]">
                        {(card.note?.tags || []).join(', ') || '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
