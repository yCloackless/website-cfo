import React, { useState } from 'react';
import { X, Plus, Loader2 } from 'lucide-react';

interface BoardProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (name: string) => Promise<void>;
  isCreating: boolean;
  canWrite: boolean;
}

export const BoardProfileModal: React.FC<BoardProfileModalProps> = ({
  isOpen,
  onClose,
  onCreateProfile,
  isCreating,
  canWrite,
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Por favor, informe o nome do perfil.');
      return;
    }
    setError(null);
    try {
      await onCreateProfile(name.trim());
      setName('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar perfil.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-[#0B1220] border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Novo Perfil de Banca
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastre um perfil para homologar provas e gerar inteligência estatística.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="new-profile-name"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Nome da Banca ou Concurso
            </label>
            <input
              id="new-profile-name"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ex: CEDERJ, UERJ, FGV..."
              disabled={isCreating}
              className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all"
            />
            {error && (
              <p className="text-[11px] text-rose-400 mt-1.5">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isCreating}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isCreating || !canWrite || !name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Criando perfil...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Perfil</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
