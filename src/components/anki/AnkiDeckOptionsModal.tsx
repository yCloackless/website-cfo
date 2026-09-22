import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Sparkles,
  Sliders,
  FolderTree,
  Edit3,
  Plus,
  Download,
  Trash2,
  Check,
  RotateCcw,
  AlertCircle,
  ArrowRightLeft,
} from 'lucide-react';
import {
  AnkiDeck,
  AnkiDeckConfig,
  DeckConfigOptions,
  DEFAULT_DECK_CONFIG,
} from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';

interface AnkiDeckOptionsModalProps {
  deck: AnkiDeck;
  decks?: AnkiDeck[];
  isOpen: boolean;
  onClose: () => void;
  onDeckUpdated?: () => void;
  onCreateSubdeck?: (parentFullName: string) => void;
  onRenameDeck?: (deck: AnkiDeck) => void;
  onDeleteDeck?: (deck: AnkiDeck) => void;
  onExportDeck?: (deck: AnkiDeck) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiDeckOptionsModal: React.FC<AnkiDeckOptionsModalProps> = ({
  deck,
  decks = [],
  isOpen,
  onClose,
  onDeckUpdated,
  onCreateSubdeck,
  onRenameDeck,
  onDeleteDeck,
  onExportDeck,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'fsrs' | 'manage'>('fsrs');
  const [config, setConfig] = useState<DeckConfigOptions>(DEFAULT_DECK_CONFIG);
  const [configId, setConfigId] = useState<string>('');
  const [learningStepsStr, setLearningStepsStr] = useState<string>('1 10');
  const [relearningStepsStr, setRelearningStepsStr] = useState<string>('10');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Rename inside modal
  const [deckNameInput, setDeckNameInput] = useState<string>(deck.name);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

  // Subdeck creation inside modal
  const [subdeckNameInput, setSubdeckNameInput] = useState<string>('');
  const [isCreatingSubdeck, setIsCreatingSubdeck] = useState<boolean>(false);
  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [isTransferConfirmOpen, setIsTransferConfirmOpen] = useState<boolean>(false);
  const [isTransferring, setIsTransferring] = useState<boolean>(false);

  // Body scroll locking and Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    setDeckNameInput(deck.name);
    setSubdeckNameInput('');
    setTargetDeckId('');
    setIsTransferConfirmOpen(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, deck.name, onClose]);

  // Load configuration from API
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const url = deck.id && !deck.id.startsWith('virtual_')
          ? `/api/anki/deck-configs?deckId=${encodeURIComponent(deck.id)}`
          : '/api/anki/deck-configs';

        const res = await apiFetch(url);
        if (res.ok && isMounted) {
          const data = await res.json();
          const cfg: AnkiDeckConfig = data.config;
          if (cfg) {
            setConfig(cfg.config || DEFAULT_DECK_CONFIG);
            setConfigId(cfg.id);
            setLearningStepsStr((cfg.config.learningSteps || [1, 10]).join(' '));
            setRelearningStepsStr((cfg.config.relearningSteps || [10]).join(' '));
          }
        }
      } catch {
        // Fallback to default
      }
    };

    void fetchConfig();
    return () => {
      isMounted = false;
    };
  }, [isOpen, deck.id]);

  if (!isOpen) return null;

  // Save FSRS & Review Options
  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      const parsedLearningSteps = learningStepsStr
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);

      const parsedRelearningSteps = relearningStepsStr
        .split(/\s+/)
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);

      const updatedConfig: DeckConfigOptions = {
        ...config,
        learningSteps: parsedLearningSteps.length > 0 ? parsedLearningSteps : [1, 10],
        relearningSteps: parsedRelearningSteps.length > 0 ? parsedRelearningSteps : [10],
      };

      const targetId = configId || 'default';
      const res = await apiFetch(`/api/anki/deck-configs/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: updatedConfig,
          deckId: deck.id && !deck.id.startsWith('virtual_') ? deck.id : undefined,
        }),
      });

      if (res.ok) {
        showToast?.('Configurações FSRS do baralho salvas com sucesso!', 'success');
        onDeckUpdated?.();
        onClose();
      } else {
        const data = await res.json();
        showToast?.(data.message || 'Falha ao salvar configurações.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao salvar opções.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Rename Deck action
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckNameInput.trim() || deckNameInput.trim() === deck.name) return;

    if (deck.id.startsWith('virtual_')) {
      showToast?.('Este baralho é uma categoria hierárquica automática.', 'info');
      return;
    }

    try {
      setIsRenaming(true);
      const res = await apiFetch(`/api/anki/decks/${deck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deckNameInput.trim() }),
      });

      if (res.ok) {
        showToast?.('Baralho renomeado com sucesso!', 'success');
        onDeckUpdated?.();
      } else {
        showToast?.('Falha ao renomear baralho.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao renomear.', 'error');
    } finally {
      setIsRenaming(false);
    }
  };

  // Quick Create Subdeck action
  const handleCreateSubdeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subdeckNameInput.trim()) return;

    if (deck.depth && deck.depth >= 5) {
      showToast?.('Maximum deck nesting depth reached (5 levels).', 'error');
      return;
    }

    const subName = subdeckNameInput.trim();
    try {
      setIsCreatingSubdeck(true);
      const res = await apiFetch('/api/anki/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: subName,
          parentDeckId: deck.id,
        }),
      });

      if (res.ok) {
        showToast?.(`Sub-baralho "${subName}" criado com sucesso!`, 'success');
        setSubdeckNameInput('');
        onDeckUpdated?.();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast?.(err.message || 'Falha ao criar sub-baralho.', 'error');
      }
    } catch {
      showToast?.('Erro ao criar sub-baralho.', 'error');
    } finally {
      setIsCreatingSubdeck(false);
    }
  };

  const transferTargets = decks.filter((candidate) => candidate.id !== deck.id && !candidate.id.startsWith('virtual_'));

  const handleTransferCards = async () => {
    if (!targetDeckId) return;
    try {
      setIsTransferring(true);
      const res = await apiFetch(`/api/anki/decks/${deck.id}/transfer-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDeckId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(data.error === 'SAME_DECK_TRANSFER' ? 'Escolha um baralho diferente.' : 'Falha ao transferir flashcards.', 'error');
        return;
      }
      showToast?.(`${data.movedCount || 0} flashcard(s) transferido(s) com sucesso.`, 'success');
      setIsTransferConfirmOpen(false);
      setTargetDeckId('');
      onDeckUpdated?.();
    } catch {
      showToast?.('Erro de conexão ao transferir flashcards.', 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <div className="flex items-center gap-2 min-w-0">
            <Sliders className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-semibold text-zinc-100 truncate">
                Configurações: {deck.name}
              </h2>
              <p className="text-[11px] text-zinc-400">
                Opções de agendamento FSRS v5 e gerenciamento do baralho
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-4 pt-2 gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('fsrs')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'fsrs'
                ? 'border-amber-400 text-amber-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Agendamento & FSRS</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'manage'
                ? 'border-sky-400 text-sky-400 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Gerenciar Baralho</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-zinc-300">
          {activeTab === 'fsrs' ? (
            <>
              {/* FSRS Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-100 text-sm">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Algoritmo FSRS v5 (Oficial Anki)</span>
                  </div>
                  <p className="text-zinc-400 mt-0.5 text-[11px]">
                    Utiliza a mais moderna inteligência de repetição espaçada do Anki 23.10+
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={config.enableFSRS}
                  onChange={(e) => setConfig({ ...config, enableFSRS: e.target.checked })}
                  className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700 cursor-pointer"
                />
              </div>

              {/* Desired Retention */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="font-semibold text-zinc-300">
                    Retenção Desejada (FSRS Target)
                  </label>
                  <span className="font-mono text-sky-400 font-bold text-sm">
                    {Math.round(config.desiredRetention * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.70"
                  max="0.97"
                  step="0.01"
                  value={config.desiredRetention}
                  onChange={(e) =>
                    setConfig({ ...config, desiredRetention: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                  <span>70% (menos revisões)</span>
                  <span>90% (recomendado)</span>
                  <span>97% (máxima retenção)</span>
                </div>
              </div>

              {/* Daily Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Novos cartões / dia
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="500"
                    value={config.newPerDay}
                    onChange={(e) =>
                      setConfig({ ...config, newPerDay: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Máximo de revisões / dia
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="2000"
                    value={config.maxReviewsPerDay}
                    onChange={(e) =>
                      setConfig({ ...config, maxReviewsPerDay: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Passos Aprendizagem (min)
                  </label>
                  <input
                    type="text"
                    value={learningStepsStr}
                    onChange={(e) => setLearningStepsStr(e.target.value)}
                    placeholder="1 10"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block">Ex: 1 10</span>
                </div>
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    Passos Reaprendizagem (min)
                  </label>
                  <input
                    type="text"
                    value={relearningStepsStr}
                    onChange={(e) => setRelearningStepsStr(e.target.value)}
                    placeholder="10"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block">Ex: 10</span>
                </div>
              </div>

              {/* Sibling Burying */}
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.buryNewSiblings}
                    onChange={(e) => setConfig({ ...config, buryNewSiblings: e.target.checked })}
                    className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700 cursor-pointer"
                  />
                  <span className="text-zinc-300">
                    Enterrar cartões novos irmãos (mesma nota) até o dia seguinte
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.buryReviewSiblings}
                    onChange={(e) =>
                      setConfig({ ...config, buryReviewSiblings: e.target.checked })
                    }
                    className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700 cursor-pointer"
                  />
                  <span className="text-zinc-300">
                    Enterrar cartões de revisão irmãos até o dia seguinte
                  </span>
                </label>
              </div>
            </>
          ) : (
            <>
              {/* Rename / Move Deck */}
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                  <Edit3 className="w-4 h-4 text-sky-400" />
                  <span>Renomear / Mover Baralho</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Para mover o baralho dentro da hierarquia, altere o prefixo usando <code>::</code>{' '}
                  (ex: <code>Física::Termologia</code>).
                </p>
                <form onSubmit={handleRenameSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={deckNameInput}
                    onChange={(e) => setDeckNameInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-sky-500"
                    placeholder="Nome do baralho"
                  />
                  <button
                    type="submit"
                    disabled={isRenaming || deckNameInput.trim() === deck.name}
                    className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-xs transition-all disabled:opacity-40"
                  >
                    {isRenaming ? 'Salvando...' : 'Renomear'}
                  </button>
                </form>
              </div>

              {/* Create Subdeck */}
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                    <Plus className="w-4 h-4 text-emerald-400" />
                    <span>Criar Sub-baralho</span>
                  </div>
                  {deck.depth && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Nível {deck.depth} de 5
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400">
                  Cria um novo sub-baralho sob <code className="text-zinc-200">{deck.name}</code>
                </p>

                {deck.depth && deck.depth >= 5 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Maximum deck nesting depth reached (5 levels).</span>
                  </div>
                ) : (
                  <form onSubmit={handleCreateSubdeckSubmit} className="flex gap-2">
                    <input
                      type="text"
                      value={subdeckNameInput}
                      onChange={(e) => setSubdeckNameInput(e.target.value)}
                      placeholder="Nome do sub-baralho (ex: Canudos)"
                      maxLength={80}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      disabled={isCreatingSubdeck || !subdeckNameInput.trim()}
                      className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-all disabled:opacity-40"
                    >
                      {isCreatingSubdeck ? 'Criando...' : 'Adicionar'}
                    </button>
                  </form>
                )}
              </div>

              {/* Export & Delete Actions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onExportDeck?.(deck);
                  }}
                  className="p-3 bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 rounded-xl flex items-center justify-center gap-2 text-zinc-300 hover:text-emerald-400 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="font-semibold text-xs">Exportar .apkg</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onDeleteDeck?.(deck);
                    onClose();
                  }}
                  className="p-3 bg-zinc-950 border border-zinc-800 hover:border-red-500/50 rounded-xl flex items-center justify-center gap-2 text-zinc-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="font-semibold text-xs">Excluir Baralho</span>
                </button>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm">
                  <ArrowRightLeft className="w-4 h-4 text-violet-400" />
                  <span>Transferir flashcards</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Move apenas os flashcards deste baralho para outro. Os sub-baralhos não são incluídos.
                </p>
                {transferTargets.length === 0 ? (
                  <p className="text-[11px] text-zinc-500">Crie outro baralho para habilitar a transferência.</p>
                ) : isTransferConfirmOpen ? (
                  <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
                    <p className="text-xs text-zinc-200">
                      Transferir <strong>{deck.totalCards || 0}</strong> flashcard(s) de <strong>{deck.name}</strong> para <strong>{transferTargets.find((d) => d.id === targetDeckId)?.name}</strong>?
                    </p>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setIsTransferConfirmOpen(false)} className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200">
                        Não, cancelar
                      </button>
                      <button type="button" onClick={() => void handleTransferCards()} disabled={isTransferring} className="px-3 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold disabled:opacity-50">
                        {isTransferring ? 'Transferindo...' : 'Sim, transferir'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select value={targetDeckId} onChange={(e) => setTargetDeckId(e.target.value)} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-violet-500">
                      <option value="">Escolha o baralho de destino</option>
                      {transferTargets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                    </select>
                    <button type="button" onClick={() => setIsTransferConfirmOpen(true)} disabled={!targetDeckId} className="px-3 py-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-semibold disabled:opacity-40">
                      Continuar
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <span className="text-[11px] text-zinc-500 font-mono">
            ID: {deck.id.slice(0, 8)}...
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancelar
            </button>
            {activeTab === 'fsrs' && (
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSaving ? (
                  <span>Salvando...</span>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Salvar Configurações</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
