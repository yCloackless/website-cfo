import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Play,
  Settings,
  Download,
  Trash2,
  Edit2,
  Plus,
  Layers,
} from 'lucide-react';
import { AnkiDeck } from '../../services/anki/ankiTypes';

export interface DeckNode {
  id: string;
  fullName: string;
  displayName: string;
  deck?: AnkiDeck;
  children: DeckNode[];
  newCount: number;
  learnCount: number;
  reviewCount: number;
  totalCards: number;
}

interface AnkiDeckTreeProps {
  decks: AnkiDeck[];
  onSelectDeck: (deck: AnkiDeck) => void;
  onOpenDeckOptions: (deck: AnkiDeck) => void;
  onRenameDeck: (deck: AnkiDeck) => void;
  onDeleteDeck: (deck: AnkiDeck) => void;
  onExportDeck: (deck: AnkiDeck) => void;
  onCreateSubdeck: (parentFullName: string) => void;
}

export const AnkiDeckTree: React.FC<AnkiDeckTreeProps> = ({
  decks,
  onSelectDeck,
  onOpenDeckOptions,
  onRenameDeck,
  onDeleteDeck,
  onExportDeck,
  onCreateSubdeck,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [activeMenuDeckId, setActiveMenuDeckId] = useState<string | null>(null);

  // Build hierarchical tree from deck names with "::"
  const tree = useMemo(() => {
    const rootNodes: DeckNode[] = [];
    const nodeMap = new Map<string, DeckNode>();

    // Sort decks so parent appears before child
    const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));

    for (const d of sorted) {
      const parts = d.name.split('::');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}::${part}` : part;

        let node = nodeMap.get(currentPath);
        if (!node) {
          node = {
            id: currentPath === d.name ? d.id : `virtual_${currentPath}`,
            fullName: currentPath,
            displayName: part,
            deck: currentPath === d.name ? d : undefined,
            children: [],
            newCount: 0,
            learnCount: 0,
            reviewCount: 0,
            totalCards: 0,
          };
          nodeMap.set(currentPath, node);

          if (parentPath) {
            const parentNode = nodeMap.get(parentPath);
            if (parentNode) {
              parentNode.children.push(node);
            }
          } else {
            rootNodes.push(node);
          }
        } else if (currentPath === d.name) {
          node.deck = d;
          node.id = d.id;
        }
      }
    }

    // Roll up statistics to parent nodes
    function calculateTotals(node: DeckNode): { newC: number; learnC: number; reviewC: number; totalC: number } {
      let n = node.deck?.newCount || 0;
      let l = node.deck?.learnCount || 0;
      let r = node.deck?.reviewCount || 0;
      let t = node.deck?.totalCards || 0;

      for (const child of node.children) {
        const cTotals = calculateTotals(child);
        n += cTotals.newC;
        l += cTotals.learnC;
        r += cTotals.reviewC;
        t += cTotals.totalC;
      }

      node.newCount = n;
      node.learnCount = l;
      node.reviewCount = r;
      node.totalCards = t;

      return { newC: n, learnC: l, reviewC: r, totalC: t };
    }

    for (const root of rootNodes) {
      calculateTotals(root);
    }

    return rootNodes;
  }, [decks]);

  const toggleCollapse = (fullName: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  };

  const renderNode = (node: DeckNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedNodes.has(node.fullName);
    const targetDeck = node.deck || {
      id: node.id,
      userId: '',
      name: node.fullName,
      isCollapsed: false,
      createdAt: '',
      updatedAt: '',
    };

    return (
      <React.Fragment key={node.fullName}>
        <div
          className={`flex items-center justify-between py-2.5 px-3 border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors group ${
            depth > 0 ? 'bg-zinc-950/20' : ''
          }`}
          style={{ paddingLeft: `${Math.max(12, depth * 22 + 12)}px` }}
        >
          {/* Deck title and expand arrow */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapse(node.fullName)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-6" />
            )}

            {hasChildren && isCollapsed ? (
              <Folder className="w-4 h-4 text-amber-500/80 shrink-0" />
            ) : hasChildren ? (
              <FolderOpen className="w-4 h-4 text-amber-500/80 shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-sky-400/80 shrink-0" />
            )}

            <button
              type="button"
              onClick={() => onSelectDeck(targetDeck)}
              className="text-left font-medium text-zinc-200 hover:text-sky-400 transition-colors truncate text-sm"
              title={node.fullName}
            >
              {node.displayName}
            </button>
          </div>

          {/* Counts & Actions */}
          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            {/* Anki classic counts: New (blue), Learn (orange), Review (green) */}
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
              <span
                className={`w-8 text-right font-semibold ${
                  node.newCount > 0 ? 'text-sky-400' : 'text-zinc-600'
                }`}
                title="Cards Novos"
              >
                {node.newCount}
              </span>
              <span
                className={`w-8 text-right font-semibold ${
                  node.learnCount > 0 ? 'text-amber-500' : 'text-zinc-600'
                }`}
                title="Cards em Aprendizagem"
              >
                {node.learnCount}
              </span>
              <span
                className={`w-8 text-right font-semibold ${
                  node.reviewCount > 0 ? 'text-emerald-400' : 'text-zinc-600'
                }`}
                title="Cards para Revisar"
              >
                {node.reviewCount}
              </span>
            </div>

            {/* Quick action: Play */}
            <button
              type="button"
              onClick={() => onSelectDeck(targetDeck)}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Play className="w-3 h-3 fill-current text-sky-400" />
              <span className="hidden sm:inline">Estudar</span>
            </button>

            {/* Deck Context Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenuDeckId(activeMenuDeckId === node.id ? null : node.id)}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Opções do Baralho"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {activeMenuDeckId === node.id && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setActiveMenuDeckId(null)}
                  />
                  <div className="absolute right-0 mt-1 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 z-30 text-xs text-zinc-300">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuDeckId(null);
                        onCreateSubdeck(node.fullName);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-2 text-zinc-200"
                    >
                      <Plus className="w-3.5 h-3.5 text-sky-400" />
                      Criar Sub-baralho
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuDeckId(null);
                        onOpenDeckOptions(targetDeck);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-2 text-zinc-200"
                    >
                      <Settings className="w-3.5 h-3.5 text-amber-400" />
                      Configurações / FSRS
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuDeckId(null);
                        onRenameDeck(targetDeck);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-2 text-zinc-200"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuDeckId(null);
                        onExportDeck(targetDeck);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center gap-2 text-zinc-200"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      Exportar .apkg
                    </button>
                    <div className="my-1 border-t border-zinc-800" />
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenuDeckId(null);
                        onDeleteDeck(targetDeck);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-400 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir Baralho
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
      {/* Table Header */}
      <div className="flex items-center justify-between py-2.5 px-4 bg-zinc-950/80 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <div>Baralho</div>
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3">
            <span className="w-8 text-right text-sky-400">Novo</span>
            <span className="w-8 text-right text-amber-500">Aprender</span>
            <span className="w-8 text-right text-emerald-400">Revisar</span>
          </div>
          <span className="w-20 sm:w-28 text-center">Ações</span>
        </div>
      </div>

      {/* Tree Content */}
      {tree.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">
          Nenhum baralho encontrado. Clique em "+ Criar Baralho" acima para começar!
        </div>
      ) : (
        <div>{tree.map((node) => renderNode(node, 0))}</div>
      )}
    </div>
  );
};
