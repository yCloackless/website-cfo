import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Presentation,
  Check,
  Calendar,
  Layers,
  Sparkles,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { apiFetch } from '../../services/apiFetch';

export interface WhiteboardMeta {
  id: string;
  title: string;
  background_type: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface WhiteboardListModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBoardId?: string;
  onSelectBoard: (boardId: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const WhiteboardListModal: React.FC<WhiteboardListModalProps> = ({
  isOpen,
  onClose,
  currentBoardId,
  onSelectBoard,
  showToast,
}) => {
  const [boards, setBoards] = useState<WhiteboardMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newBg, setNewBg] = useState('pure_black');
  const [isCreating, setIsCreating] = useState(false);

  const fetchBoards = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/whiteboards');
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards || []);
      }
    } catch (err: any) {
      showToast?.('Erro ao carregar lista de quadros', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBoards();
      setIsCreating(false);
      setEditingId(null);
    }
  }, [isOpen]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await apiFetch('/api/whiteboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          backgroundType: newBg,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast?.('Quadro criado com sucesso!', 'success');
        setNewTitle('');
        setIsCreating(false);
        fetchBoards();
        if (data.board?.id) {
          onSelectBoard(data.board.id);
          onClose();
        }
      }
    } catch (err: any) {
      showToast?.('Falha ao criar novo quadro.', 'error');
    }
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      const res = await apiFetch(`/api/whiteboards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      if (res.ok) {
        setEditingId(null);
        showToast?.('Quadro renomeado!', 'success');
        fetchBoards();
      }
    } catch {
      showToast?.('Falha ao renomear quadro.', 'error');
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o quadro "${title}"? Todas as anotações e imagens serão apagadas permanentemente.`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/whiteboards/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast?.('Quadro excluído.', 'info');
        fetchBoards();
      }
    } catch {
      showToast?.('Falha ao excluir quadro.', 'error');
    }
  };

  const handleDuplicate = async (board: WhiteboardMeta) => {
    try {
      // Obter estado atual
      const getRes = await apiFetch(`/api/whiteboards/${board.id}`);
      if (!getRes.ok) throw new Error('FETCH_FAILED');
      const getData = await getRes.json();

      // Criar novo com o mesmo estado
      const createRes = await apiFetch('/api/whiteboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${board.title} (Cópia)`,
          backgroundType: board.background_type,
        }),
      });
      if (!createRes.ok) throw new Error('CREATE_FAILED');
      const createData = await createRes.json();

      if (getData.document?.document_state && createData.board?.id) {
        await apiFetch(`/api/whiteboards/${createData.board.id}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentState: getData.document.document_state,
          }),
        });
      }

      showToast?.('Quadro duplicado com sucesso!', 'success');
      fetchBoards();
    } catch {
      showToast?.('Falha ao duplicar quadro.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#121216] border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#16161c]">
          <div className="flex items-center gap-2.5">
            <Presentation className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Meus Quadros de Estudo & Resolução
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {boards.length} {boards.length === 1 ? 'quadro disponível' : 'quadros disponíveis'}
            </span>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              Novo Quadro
            </button>
          </div>

          {/* Form de Criação */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl border border-slate-800 bg-[#0e0e12] space-y-3">
              <h4 className="text-xs font-semibold text-slate-200">Criar Novo Espaço de Resolução</h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Ex: Física - Dinâmica e Atrito"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={80}
                  className="flex-1 px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  autoFocus
                />
                <select
                  value={newBg}
                  onChange={(e) => setNewBg(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="pure_black">Preto Puro (#000)</option>
                  <option value="dark_gray">Cinza Escuro</option>
                  <option value="dots">Pontilhado</option>
                  <option value="grid">Grade Quadriculada</option>
                  <option value="large_grid">Grade Grande</option>
                  <option value="ruled">Linhas Pautadas</option>
                </select>
                <button
                  type="submit"
                  disabled={!newTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold disabled:opacity-40 transition-all shrink-0"
                >
                  Criar
                </button>
              </div>
            </form>
          )}

          {/* Lista de Quadros */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-[#0c0c0e]">
              <Presentation className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-300">Nenhum quadro criado ainda</p>
              <p className="text-xs text-slate-500 mt-1">
                Crie um novo quadro para começar a resolver questões com caneta stylus!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {boards.map((b) => {
                const isSelected = b.id === currentBoardId;
                const isEditing = editingId === b.id;

                return (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/10'
                        : 'border-slate-800/80 bg-[#16161c]/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-400"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRename(b.id)}
                            className="p-1 text-emerald-400 hover:text-emerald-300 rounded"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 text-slate-400 hover:text-white rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="cursor-pointer group"
                          onClick={() => {
                            onSelectBoard(b.id);
                            onClose();
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-white group-hover:text-amber-400 transition-colors truncate">
                              {b.title}
                            </h4>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                                Ativo
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                            <span>Rev. v{b.version}</span>
                            <span>•</span>
                            <span>{new Date(b.updated_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingId(b.id);
                          setEditTitle(b.title);
                        }}
                        title="Renomear"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDuplicate(b)}
                        title="Duplicar"
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(b.id, b.title)}
                        title="Excluir"
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          onSelectBoard(b.id);
                          onClose();
                        }}
                        className="ml-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
                      >
                        Abrir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
