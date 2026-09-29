import React from 'react';
import { BrainCircuit, RefreshCw, Plus, ChevronDown } from 'lucide-react';
import { BoardProfile } from './types';

interface BoardHeaderProps {
  profiles: BoardProfile[];
  selectedProfileId: string;
  onSelectProfile: (id: string) => void;
  onRefresh: () => void;
  onOpenCreateProfile: () => void;
  isRefreshing: boolean;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onRefresh,
  onOpenCreateProfile,
  isRefreshing,
}) => {
  const currentProfile = profiles.find((p) => p.id === selectedProfileId);

  return (
    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
      <div>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Inteligência da Banca
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Snapshots Imutáveis
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Treine e gerencie o perfil estatístico de cada banca através das provas históricas homologadas.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Seletor de Perfil Contextual */}
        <div className="relative inline-flex items-center">
          <select
            id="board-profile-selector"
            aria-label="Selecionar perfil da banca"
            value={selectedProfileId}
            onChange={(e) => onSelectProfile(e.target.value)}
            className="appearance-none bg-slate-900 border border-slate-700/80 hover:border-slate-600 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-slate-200 min-w-52 transition-colors cursor-pointer outline-none"
          >
            <option value="">Selecionar perfil da banca...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.activeVersion ? `(v${p.activeVersion})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
        </div>

        {/* Botão Novo Perfil */}
        <button
          type="button"
          onClick={onOpenCreateProfile}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
          title="Criar novo perfil de banca"
        >
          <Plus className="w-3.5 h-3.5 text-cyan-400" />
          <span>Novo Perfil</span>
        </button>

        {/* Botão Atualizar Secundário */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition-colors disabled:opacity-50"
          title="Atualizar dados do perfil"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
          <span>Atualizar</span>
        </button>
      </div>
    </header>
  );
};
