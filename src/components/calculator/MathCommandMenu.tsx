import React, { useMemo } from 'react';
import { Terminal, X } from 'lucide-react';
import type { MathCommandDefinition } from '../../services/math/types';
import { MATH_COMMANDS } from '../../services/math/commands';

interface MathCommandMenuProps {
  filter: string;
  selectedIndex: number;
  onSelect: (cmd: MathCommandDefinition) => void;
  onClose: () => void;
}

export const MathCommandMenu: React.FC<MathCommandMenuProps> = ({
  filter,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || q === '/') return MATH_COMMANDS;
    return MATH_COMMANDS.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [filter]);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="math-command-menu"
      className="absolute bottom-full left-0 right-0 mb-2 z-30 rounded-xl border border-white/15 bg-[#1b1c20] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 bg-black/25">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <Terminal className="w-3.5 h-3.5 text-orange-400" />
          <span>Comandos Matemáticos</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu de comandos"
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
        {filtered.map((cmd, idx) => {
          const isSelected = idx === selectedIndex % filtered.length;
          return (
            <button
              key={cmd.command}
              type="button"
              onClick={() => onSelect(cmd)}
              className={`w-full text-left px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 transition-colors cursor-pointer ${
                isSelected ? 'bg-orange-500/20 text-white' : 'hover:bg-white/5 text-zinc-200'
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-bold text-orange-300">
                    {cmd.command}
                  </code>
                  <span className="text-xs font-semibold">{cmd.label}</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">{cmd.description}</p>
              </div>
              <code className="text-[11px] font-mono text-zinc-400 shrink-0">
                {cmd.example}
              </code>
            </button>
          );
        })}
      </div>
    </div>
  );
};
