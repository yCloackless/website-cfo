import React, { useState, useEffect } from 'react';
import { X, Settings, Sparkles, Check, Sliders } from 'lucide-react';
import { AnkiDeck, AnkiDeckConfig, DeckConfigOptions, DEFAULT_DECK_CONFIG } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';

interface AnkiDeckOptionsModalProps {
  deck: AnkiDeck;
  isOpen: boolean;
  onClose: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiDeckOptionsModal: React.FC<AnkiDeckOptionsModalProps> = ({
  deck,
  isOpen,
  onClose,
  showToast,
}) => {
  const [config, setConfig] = useState<DeckConfigOptions>(DEFAULT_DECK_CONFIG);
  const [configId, setConfigId] = useState<string>('');
  const [learningStepsStr, setLearningStepsStr] = useState<string>('1 10');
  const [relearningStepsStr, setRelearningStepsStr] = useState<string>('10');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      try {
        const res = await apiFetch('/api/anki/deck-configs');
        if (res.ok) {
          const data = await res.json();
          const cfg: AnkiDeckConfig = data.config;
          setConfig(cfg.config || DEFAULT_DECK_CONFIG);
          setConfigId(cfg.id);
          setLearningStepsStr((cfg.config.learningSteps || [1, 10]).join(' '));
          setRelearningStepsStr((cfg.config.relearningSteps || [10]).join(' '));
        }
      } catch {}
    };

    void fetchConfig();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
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

      // Save via API
      showToast?.('Configurações FSRS do baralho salvas!', 'success');
      onClose();
    } catch {
      showToast?.('Erro ao salvar opções.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-zinc-100">Opções do Baralho: {deck.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[75vh] space-y-5 text-xs text-zinc-300">
          {/* FSRS Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-zinc-100 text-sm">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Algoritmo FSRS v5 (Oficial Anki)</span>
              </div>
              <p className="text-zinc-400 mt-1">
                Utiliza a mais moderna inteligência de repetição espaçada do Anki 23.10+
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.enableFSRS}
              onChange={(e) => setConfig({ ...config, enableFSRS: e.target.checked })}
              className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700"
            />
          </div>

          {/* Desired Retention */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="font-semibold text-zinc-300">Retenção Desejada (FSRS Target)</label>
              <span className="font-mono text-sky-400 font-bold">
                {Math.round(config.desiredRetention * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.70"
              max="0.97"
              step="0.01"
              value={config.desiredRetention}
              onChange={(e) => setConfig({ ...config, desiredRetention: parseFloat(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Padrão recomendado: 90%. Valores maiores aumentam a quantidade de revisões diárias.
            </p>
          </div>

          {/* Daily Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Novos cartões / dia</label>
              <input
                type="number"
                min="0"
                max="500"
                value={config.newPerDay}
                onChange={(e) => setConfig({ ...config, newPerDay: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Máximo de revisões / dia</label>
              <input
                type="number"
                min="0"
                max="2000"
                value={config.maxReviewsPerDay}
                onChange={(e) => setConfig({ ...config, maxReviewsPerDay: parseInt(e.target.value, 10) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Passos Aprendizagem (min)</label>
              <input
                type="text"
                value={learningStepsStr}
                onChange={(e) => setLearningStepsStr(e.target.value)}
                placeholder="1 10"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-300 mb-1">Passos Reaprendizagem (min)</label>
              <input
                type="text"
                value={relearningStepsStr}
                onChange={(e) => setRelearningStepsStr(e.target.value)}
                placeholder="10"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 font-mono"
              />
            </div>
          </div>

          {/* Sibling Burying */}
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.buryNewSiblings}
                onChange={(e) => setConfig({ ...config, buryNewSiblings: e.target.checked })}
                className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700"
              />
              <span className="text-zinc-300">Enterrar cartões novos irmãos até o dia seguinte</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.buryReviewSiblings}
                onChange={(e) => setConfig({ ...config, buryReviewSiblings: e.target.checked })}
                className="w-4 h-4 text-sky-500 rounded bg-zinc-900 border-zinc-700"
              />
              <span className="text-zinc-300">Enterrar cartões de revisão irmãos até o dia seguinte</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-end gap-3 bg-zinc-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </div>
    </div>
  );
};
