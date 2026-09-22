import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  Sparkles,
  PlusCircle,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Flame,
  Trash2,
  BookOpen,
  Search,
  Plus,
  RefreshCw,
  BarChart3,
  Calendar,
  Award,
  Zap,
  SlidersHorizontal,
  FolderPlus,
  FileSpreadsheet,
  Settings,
  FolderInput,
} from 'lucide-react';
import { AppTheme } from '../types';
import { apiFetch } from '../services/apiFetch';
import { AnkiDeck } from '../services/anki/ankiTypes';
import { AnkiDeckTree } from './anki/AnkiDeckTree';
import { AnkiReviewPlayer } from './anki/AnkiReviewPlayer';
import { AnkiBrowserModal } from './anki/AnkiBrowserModal';
import { AnkiAddNoteModal } from './anki/AnkiAddNoteModal';
import { AnkiDeckOptionsModal } from './anki/AnkiDeckOptionsModal';
import { AnkiStatsModal } from './anki/AnkiStatsModal';
import { AnkiApkgModal } from './anki/AnkiApkgModal';
import { ConfirmModal } from './ConfirmModal';

interface ErrorNotebookTabProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const OFFICIAL_CBMERJ_DECKS = [
  { name: 'Matemática::Álgebra::Logaritmos', desc: 'Edital CFO CBMERJ' },
  { name: 'Matemática::Geometria::Plana', desc: 'Edital CFO CBMERJ' },
  { name: 'Física::Mecânica::Cinemática', desc: 'Edital CFO CBMERJ' },
  { name: 'Física::Eletricidade::Eletrodinâmica', desc: 'Edital CFO CBMERJ' },
  { name: 'Química::Geral::Estequiometria', desc: 'Edital CFO CBMERJ' },
  { name: 'Biologia::Citologia::Organelas', desc: 'Edital CFO CBMERJ' },
  { name: 'Português::Sintaxe::Concordância', desc: 'Edital CFO CBMERJ' },
];

export const ErrorNotebookTab: React.FC<ErrorNotebookTabProps> = ({
  theme = 'dark',
  showToast,
}) => {
  // Anki Decks State
  const [decks, setDecks] = useState<AnkiDeck[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Active Anki Modals & Sessions
  const [studyingDeck, setStudyingDeck] = useState<AnkiDeck | null>(null);
  const [optionsDeck, setOptionsDeck] = useState<AnkiDeck | null>(null);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState<boolean>(false);
  const [isBrowserOpen, setIsBrowserOpen] = useState<boolean>(false);
  const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
  const [isApkgOpen, setIsApkgOpen] = useState<boolean>(false);

  // Quick Create Deck Modal
  const [isCreateDeckModalOpen, setIsCreateDeckModalOpen] = useState<boolean>(false);
  const [parentDeckForSubdeck, setParentDeckForSubdeck] = useState<AnkiDeck | null>(null);
  const [newDeckName, setNewDeckName] = useState<string>('');
  const [newDeckDesc, setNewDeckDesc] = useState<string>('');

  // Rename Deck Modal
  const [renamingDeck, setRenamingDeck] = useState<AnkiDeck | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  // Move Deck Modal
  const [movingDeck, setMovingDeck] = useState<AnkiDeck | null>(null);
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [isMovingDeck, setIsMovingDeck] = useState<boolean>(false);

  // Delete Deck Modal (ConfirmModal)
  const [deckToDelete, setDeckToDelete] = useState<AnkiDeck | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState<boolean>(false);

  // ⚡ AI Generator State (Top section)
  const [aiTopicInput, setAiTopicInput] = useState<string>('');
  const [aiTargetDeckId, setAiTargetDeckId] = useState<string>('');
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  // Fetch all Anki Decks from backend
  const fetchDecks = useCallback(async (isManual = false) => {
    try {
      if (isManual) setIsSyncing(true);
      else setLoading(true);

      const res = await apiFetch('/api/anki/decks');
      if (res.ok) {
        const data = await res.json();
        setDecks(data.decks || []);
        if (isManual) {
          showToast?.('Baralhos sincronizados com sucesso!', 'success');
        }
      }
    } catch {
      showToast?.('Erro ao carregar baralhos do Anki.', 'error');
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchDecks();
  }, [fetchDecks]);

  // Create Deck Action
  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDeckName.trim();
    if (!trimmed) return;
    if (trimmed.length > 80) {
      showToast?.('Nome do baralho não pode ultrapassar 80 caracteres.', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/anki/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          description: newDeckDesc.trim() || undefined,
          parentDeckId: parentDeckForSubdeck ? parentDeckForSubdeck.id : undefined,
        }),
      });

      if (res.ok) {
        showToast?.('Baralho criado com sucesso!', 'success');
        setNewDeckName('');
        setNewDeckDesc('');
        setParentDeckForSubdeck(null);
        setIsCreateDeckModalOpen(false);
        void fetchDecks();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao criar baralho.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao criar baralho.', 'error');
    }
  };

  // Rename Deck Action
  const handleRenameDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingDeck || !renameInput.trim()) return;
    const trimmed = renameInput.trim();
    if (trimmed.length > 80) {
      showToast?.('Nome do baralho não pode ultrapassar 80 caracteres.', 'error');
      return;
    }

    try {
      const res = await apiFetch(`/api/anki/decks/${renamingDeck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.ok) {
        showToast?.('Baralho renomeado!', 'success');
        setRenamingDeck(null);
        void fetchDecks();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao renomear baralho.', 'error');
      }
    } catch {
      showToast?.('Erro ao renomear baralho.', 'error');
    }
  };

  // Move Deck Action
  const handleMoveDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDeck) return;

    try {
      setIsMovingDeck(true);
      const res = await apiFetch(`/api/anki/decks/${movingDeck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentDeckId: targetParentId ? targetParentId : null,
        }),
      });

      if (res.ok) {
        showToast?.('Baralho movido com sucesso!', 'success');
        setMovingDeck(null);
        void fetchDecks();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao mover baralho.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao mover baralho.', 'error');
    } finally {
      setIsMovingDeck(false);
    }
  };

  // Delete Deck Action with ConfirmModal
  const confirmDeleteDeck = async () => {
    if (!deckToDelete) return;
    try {
      setIsDeletingDeck(true);
      const res = await apiFetch(`/api/anki/decks/${deckToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast?.('Baralho excluído com sucesso.', 'success');
        setDeckToDelete(null);
        void fetchDecks();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao excluir baralho.', 'error');
      }
    } catch {
      showToast?.('Erro ao excluir baralho.', 'error');
    } finally {
      setIsDeletingDeck(false);
    }
  };

  // Count subdecks of deck to delete
  const subdecksCountToDelete = useMemo(() => {
    if (!deckToDelete) return 0;
    const findDescendants = (parentId: string): number => {
      const children = decks.filter((d) => d.parentDeckId === parentId);
      return children.length + children.reduce((acc, c) => acc + findDescendants(c.id), 0);
    };
    return findDescendants(deckToDelete.id);
  }, [deckToDelete, decks]);

  // Valid move target decks for movingDeck
  const validMoveTargets = useMemo(() => {
    if (!movingDeck) return [];
    // Helper to find all descendants of movingDeck
    const descendants = new Set<string>();
    const fillDescendants = (id: string) => {
      descendants.add(id);
      for (const d of decks) {
        if (d.parentDeckId === id) fillDescendants(d.id);
      }
    };
    fillDescendants(movingDeck.id);

    // Helper to calculate subtree height of movingDeck
    const getSubtreeHeight = (id: string): number => {
      const children = decks.filter((d) => d.parentDeckId === id);
      if (children.length === 0) return 1;
      return 1 + Math.max(...children.map((c) => getSubtreeHeight(c.id)));
    };
    const movingHeight = getSubtreeHeight(movingDeck.id);

    return decks.filter((d) => {
      if (descendants.has(d.id)) return false; // cannot move into self or descendants
      const targetDepth = d.depth || 1;
      return targetDepth + movingHeight <= 5; // cannot exceed 5 levels
    });
  }, [movingDeck, decks]);

  // AI Generation (+20 Flashcards saved atomically to Anki Deck)
  const handleGenerateAiFlashcards = async () => {
    const topic = aiTopicInput.trim() || 'Matemática::Logaritmos';
    setIsAiGenerating(true);

    try {
      // 1. Generate via AI endpoint
      const aiRes = await apiFetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectOrTopic: topic }),
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.cards || aiData.cards.length === 0) {
        showToast?.(aiData.message || 'Falha ao gerar flashcards por IA.', 'error');
        return;
      }

      // 2. Identify or create target deck
      let targetId = aiTargetDeckId;
      if (!targetId) {
        let existing = decks.find((d) => d.name.toLowerCase() === topic.toLowerCase());
        if (!existing) {
          const createRes = await apiFetch('/api/anki/decks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: topic,
              description: `Baralho gerado por IA para ${topic}`,
            }),
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            existing = createData.deck;
          }
        }
        targetId = existing?.id || (decks[0]?.id ?? '');
      }

      // 3. Save batch to Anki router
      const batchNotes = aiData.cards.map((c: any) => ({
        fields: [c.question, c.answer],
        tags: ['ia-gerado', topic.replace(/::/g, '-')],
      }));

      const saveRes = await apiFetch('/api/anki/notes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: targetId,
          notes: batchNotes,
        }),
      });

      if (saveRes.ok) {
        const saveData = await saveRes.json();
        showToast?.(`⚡ +${saveData.createdCards} flashcards gerados e salvos no baralho com sucesso!`, 'success');
        setAiTopicInput('');
        void fetchDecks();
      } else {
        showToast?.('Erro ao salvar cartões no baralho.', 'error');
      }
    } catch {
      showToast?.('Erro ao processar geração por IA.', 'error');
    } finally {
      setIsAiGenerating(false);
    }
  };

  // Aggregated totals
  const totalNew = useMemo(() => decks.reduce((acc, d) => acc + (d.newCount || 0), 0), [decks]);
  const totalLearn = useMemo(() => decks.reduce((acc, d) => acc + (d.learnCount || 0), 0), [decks]);
  const totalReview = useMemo(() => decks.reduce((acc, d) => acc + (d.reviewCount || 0), 0), [decks]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* 🧭 Top Navigation Bar (True Anki Interface) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-100 text-xs font-semibold flex items-center gap-2 shadow-sm border border-zinc-700"
          >
            <Layers className="w-4 h-4 text-sky-400" />
            <span>Baralhos</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddNoteOpen(true)}
            className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Adicionar</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBrowserOpen(true)}
            className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <Search className="w-4 h-4 text-sky-400" />
            <span>Painel (Browse)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsStatsOpen(true)}
            className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <BarChart3 className="w-4 h-4 text-amber-400" />
            <span>Estatísticas</span>
          </button>

          <button
            type="button"
            onClick={() => setIsApkgOpen(true)}
            className="px-3.5 py-1.5 rounded-lg hover:bg-zinc-800/80 text-zinc-300 hover:text-white text-xs font-medium flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-purple-400" />
            <span>APKG</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void fetchDecks(true)}
          disabled={isSyncing}
          className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          title="Sincronizar baralhos com o servidor"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-sky-400' : ''}`} />
          <span className="hidden sm:inline">Sincronizar</span>
        </button>
      </div>

      {/* ⚡ Seção Superior: Gerador de +20 Flashcards por IA */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-zinc-100">Gerar +20 Flashcards por IA</h3>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            Salva diretamente no seu baralho Anki com repetição FSRS
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            type="text"
            value={aiTopicInput}
            onChange={(e) => setAiTopicInput(e.target.value)}
            placeholder="Digite qualquer matéria ou tópico do CFO (ex: Matemática::Logaritmos, Dinâmica, Citologia)..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-xs sm:text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-sky-500 font-sans"
          />
          {decks.length > 0 && (
            <select
              value={aiTargetDeckId}
              onChange={(e) => setAiTargetDeckId(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-sky-500"
            >
              <option value="">Destino: Auto / Criar</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={handleGenerateAiFlashcards}
            disabled={isAiGenerating}
            className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-xs sm:text-sm transition-all shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
          >
            <Sparkles className={`w-4 h-4 ${isAiGenerating ? 'animate-spin' : ''}`} />
            <span>{isAiGenerating ? 'Gerando...' : '+20 Flashcards'}</span>
          </button>
        </div>

        {/* Quick Suggestion Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-1 text-zinc-400">
          <span className="text-zinc-600 shrink-0">Sugestões:</span>
          {OFFICIAL_CBMERJ_DECKS.slice(0, 5).map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setAiTopicInput(s.name)}
              className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 font-mono text-[11px] whitespace-nowrap transition-colors"
            >
              {s.name.split('::').pop()}
            </button>
          ))}
        </div>
      </div>

      {/* 📁 Action Bar Above Deck Tree */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Baralhos ({decks.length})
          </span>
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-zinc-500">
            <span>Novos: <strong className="text-sky-400">{totalNew}</strong></span>
            <span>·</span>
            <span>Aprender: <strong className="text-amber-500">{totalLearn}</strong></span>
            <span>·</span>
            <span>Revisar: <strong className="text-emerald-400">{totalReview}</strong></span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewDeckName('');
            setNewDeckDesc('');
            setIsCreateDeckModalOpen(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
        >
          <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
          <span>Criar Baralho</span>
        </button>
      </div>

      {/* 🌲 Real Hierarchical Anki Deck Tree */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-sm flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
          <p>Carregando baralhos do Anki...</p>
        </div>
      ) : decks.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-10 text-center space-y-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-200">Sua Coleção está Vazia</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
              Crie seu primeiro baralho com hierarquia ilimitada (ex: <code>Matemática::Logaritmos</code>) ou
              importe um arquivo <code>.apkg</code> do Anki Desktop.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateDeckModalOpen(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-xs rounded-lg transition-all shadow-md"
            >
              + Criar Primeiro Baralho
            </button>
            <button
              type="button"
              onClick={() => setIsApkgOpen(true)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-lg transition-all border border-zinc-700"
            >
              Importar .apkg
            </button>
          </div>
        </div>
      ) : (
        <AnkiDeckTree
          decks={decks}
          onSelectDeck={(d) => setStudyingDeck(d)}
          onOpenDeckOptions={(d) => setOptionsDeck(d)}
          onRenameDeck={(d) => {
            setRenamingDeck(d);
            setRenameInput(d.name);
          }}
          onDeleteDeck={(d) => setDeckToDelete(d)}
          onMoveDeck={(d) => {
            setMovingDeck(d);
            setTargetParentId(d.parentDeckId || '');
          }}
          onExportDeck={(d) => {
            window.open(`/api/anki/export-apkg?deckId=${encodeURIComponent(d.id)}`, '_blank');
            showToast?.(`Exportação do baralho "${d.name}" iniciada!`, 'success');
          }}
          onCreateSubdeck={(parentDeck) => {
            if (parentDeck.depth && parentDeck.depth >= 5) {
              showToast?.('Maximum deck nesting depth reached (5 levels).', 'error');
              return;
            }
            setParentDeckForSubdeck(parentDeck);
            setNewDeckName('');
            setNewDeckDesc('');
            setIsCreateDeckModalOpen(true);
          }}
        />
      )}

      {/* 🎮 Active Review Player Modal */}
      {studyingDeck && (
        <AnkiReviewPlayer
          deckId={studyingDeck.id}
          deckName={studyingDeck.name}
          onClose={() => {
            setStudyingDeck(null);
            void fetchDecks();
          }}
          showToast={showToast}
        />
      )}

      {/* 🔍 Anki Browser / Search Modal */}
      <AnkiBrowserModal
        decks={decks}
        isOpen={isBrowserOpen}
        onClose={() => {
          setIsBrowserOpen(false);
          void fetchDecks();
        }}
        showToast={showToast}
      />

      {/* ➕ Add Note Modal */}
      <AnkiAddNoteModal
        decks={decks}
        defaultDeckId={decks[0]?.id}
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        onNoteAdded={() => void fetchDecks()}
        showToast={showToast}
      />

      {/* ⚙️ Deck Options Modal */}
      {optionsDeck && (
        <AnkiDeckOptionsModal
          deck={optionsDeck}
          decks={decks}
          isOpen={Boolean(optionsDeck)}
          onClose={() => setOptionsDeck(null)}
          onDeckUpdated={() => void fetchDecks()}
          onDeleteDeck={(d) => setDeckToDelete(d)}
          onExportDeck={(d) => {
            window.open(`/api/anki/export-apkg?deckId=${encodeURIComponent(d.id)}`, '_blank');
            showToast?.(`Exportação do baralho "${d.name}" iniciada!`, 'success');
          }}
          showToast={showToast}
        />
      )}

      {/* 📊 Full Stats Modal */}
      <AnkiStatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
      />

      {/* 📦 APKG Import / Export Modal */}
      <AnkiApkgModal
        decks={decks}
        isOpen={isApkgOpen}
        onClose={() => setIsApkgOpen(false)}
        onImportComplete={() => void fetchDecks()}
        showToast={showToast}
      />

      {/* ➕ Modal Criar Baralho / Sub-baralho */}
      {isCreateDeckModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => {
            setIsCreateDeckModalOpen(false);
            setParentDeckForSubdeck(null);
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100">
                {parentDeckForSubdeck ? `Criar Sub-baralho` : `Criar Novo Baralho (Raiz)`}
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {parentDeckForSubdeck
                  ? `Nível ${Math.min(5, (parentDeckForSubdeck.depth || 1) + 1)} de 5`
                  : 'Nível 1 (Raiz)'}
              </span>
            </div>

            {parentDeckForSubdeck && (
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400">
                Criando dentro de: <strong className="text-zinc-200">{parentDeckForSubdeck.name}</strong>
              </div>
            )}

            <form onSubmit={handleCreateDeck} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {parentDeckForSubdeck ? 'Nome do Sub-baralho' : 'Nome do Baralho'}
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {newDeckName.length}/80
                  </span>
                </div>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder={parentDeckForSubdeck ? 'ex: Canudos' : 'ex: História'}
                  autoFocus
                  required
                  maxLength={80}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={newDeckDesc}
                  onChange={(e) => setNewDeckDesc(e.target.value)}
                  placeholder="ex: Foco no edital 2024"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateDeckModalOpen(false);
                    setParentDeckForSubdeck(null);
                  }}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newDeckName.trim()}
                  className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold rounded-lg text-xs disabled:opacity-40"
                >
                  Criar Baralho
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ✏️ Modal Renomear Baralho */}
      {renamingDeck && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => setRenamingDeck(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-zinc-100">Renomear Baralho</h3>
            <form onSubmit={handleRenameDeck} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Novo Nome
                  </label>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {renameInput.length}/80
                  </span>
                </div>
                <input
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  autoFocus
                  required
                  maxLength={80}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingDeck(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!renameInput.trim()}
                  className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold rounded-lg text-xs disabled:opacity-40"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📁 Modal Mover Baralho */}
      {movingDeck && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => setMovingDeck(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-indigo-400" />
                <span>Mover Baralho: {movingDeck.name}</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Selecione o destino para este baralho ou mova para a raiz.
              </p>
            </div>

            <form onSubmit={handleMoveDeckSubmit} className="space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {/* Opção Raiz */}
                <label
                  className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                    targetParentId === ''
                      ? 'bg-indigo-500/10 border-indigo-500/50 text-zinc-100'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="targetParent"
                      value=""
                      checked={targetParentId === ''}
                      onChange={() => setTargetParentId('')}
                      className="text-indigo-500 focus:ring-indigo-400"
                    />
                    <span className="text-xs font-semibold">📁 Raiz (Nível 1)</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    Raiz
                  </span>
                </label>

                {/* Lista de pais válidos */}
                {validMoveTargets.map((parent) => (
                  <label
                    key={parent.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                      targetParentId === parent.id
                        ? 'bg-indigo-500/10 border-indigo-500/50 text-zinc-100'
                        : 'bg-zinc-950/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="radio"
                        name="targetParent"
                        value={parent.id}
                        checked={targetParentId === parent.id}
                        onChange={() => setTargetParentId(parent.id)}
                        className="text-indigo-500 focus:ring-indigo-400"
                      />
                      <span className="text-xs font-medium truncate">{parent.name}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 ml-2">
                      Nível {parent.depth || 1}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setMovingDeck(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isMovingDeck}
                  className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold rounded-lg text-xs transition-all disabled:opacity-40"
                >
                  {isMovingDeck ? 'Movendo...' : 'Mover Baralho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🗑️ Modal de Confirmação para Exclusão (Substituindo window.confirm) */}
      <ConfirmModal
        isOpen={Boolean(deckToDelete)}
        title="Excluir Baralho"
        description={
          deckToDelete
            ? `Tem certeza que deseja excluir o baralho "${deckToDelete.name}"?${
                subdecksCountToDelete > 0
                  ? ` Este baralho contém ${subdecksCountToDelete} sub-baralho(s) dependente(s).`
                  : ''
              }${
                (deckToDelete.totalCards || 0) > 0
                  ? ` Contém ${deckToDelete.totalCards} cartão(ões) que serão permanentemente removidos.`
                  : ''
              } Esta ação não pode ser desfeita.`
            : ''
        }
        variant="danger"
        iconType="danger"
        isDestructive={true}
        confirmLabel={isDeletingDeck ? 'Excluindo...' : 'Excluir Permanentemente'}
        cancelLabel="Cancelar"
        loading={isDeletingDeck}
        theme={theme}
        onConfirm={() => void confirmDeleteDeck()}
        onClose={() => setDeckToDelete(null)}
      />
    </div>
  );
};
