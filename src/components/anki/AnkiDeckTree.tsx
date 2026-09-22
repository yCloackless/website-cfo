import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Play,
  Settings,
  Trash2,
  Edit2,
  Plus,
  Layers,
  FolderInput,
  AlertCircle,
  GripVertical,
} from 'lucide-react';
import { AnkiDeck } from '../../services/anki/ankiTypes';

export interface DeckNode {
  id: string;
  fullName: string;
  displayName: string;
  depth: number; // 1 to 5
  parentDeckId?: string | null;
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
  onCreateSubdeck: (parentDeck: AnkiDeck) => void;
  onMoveDeck?: (deck: AnkiDeck) => void;
  onDropDeck?: (deck: AnkiDeck, targetParentId: string) => void;
}

export const AnkiDeckTree: React.FC<AnkiDeckTreeProps> = ({
  decks,
  onSelectDeck,
  onOpenDeckOptions,
  onRenameDeck,
  onDeleteDeck,
  onExportDeck,
  onCreateSubdeck,
  onMoveDeck,
  onDropDeck,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Build hierarchical tree supporting parentDeckId and backwards-compatible :: names
  const tree = useMemo(() => {
    const deckMap = new Map<string, AnkiDeck>();
    for (const d of decks) {
      deckMap.set(d.id, d);
    }

    // Identify if decks use parentDeckId or legacy :: names
    const usesParentId = decks.some((d) => d.parentDeckId !== undefined && d.parentDeckId !== null);

    if (usesParentId || decks.every((d) => !d.name.includes('::'))) {
      // Build tree using parentDeckId relation
      const nodeMap = new Map<string, DeckNode>();
      for (const d of decks) {
        nodeMap.set(d.id, {
          id: d.id,
          fullName: d.name,
          displayName: d.name.includes('::') ? d.name.split('::').pop() || d.name : d.name,
          depth: d.depth || 1,
          deck: d,
          children: [],
          newCount: d.newCount || 0,
          learnCount: d.learnCount || 0,
          reviewCount: d.reviewCount || 0,
          totalCards: d.totalCards || 0,
        });
      }

      const rootNodes: DeckNode[] = [];
      for (const d of decks) {
        const node = nodeMap.get(d.id)!;
        if (d.parentDeckId && nodeMap.has(d.parentDeckId)) {
          const parentNode = nodeMap.get(d.parentDeckId)!;
          parentNode.children.push(node);
        } else {
          rootNodes.push(node);
        }
      }

      // Compute depths recursively
      function assignDepths(node: DeckNode, currentDepth: number) {
        node.depth = Math.min(5, currentDepth);
        for (const child of node.children) {
          assignDepths(child, currentDepth + 1);
        }
      }

      for (const root of rootNodes) {
        assignDepths(root, 1);
      }

      // Roll up statistics to parents
      function rollUpStats(node: DeckNode): { n: number; l: number; r: number; t: number } {
        let n = node.deck?.newCount || 0;
        let l = node.deck?.learnCount || 0;
        let r = node.deck?.reviewCount || 0;
        let t = node.deck?.totalCards || 0;

        for (const child of node.children) {
          const c = rollUpStats(child);
          n += c.n;
          l += c.l;
          r += c.r;
          t += c.t;
        }

        node.newCount = n;
        node.learnCount = l;
        node.reviewCount = r;
        node.totalCards = t;
        return { n, l, r, t };
      }

      for (const root of rootNodes) {
        rollUpStats(root);
      }

      // Sort children alphabetically
      function sortTree(nodes: DeckNode[]) {
        nodes.sort((a, b) => a.displayName.localeCompare(b.displayName));
        for (const n of nodes) {
          sortTree(n.children);
        }
      }
      sortTree(rootNodes);

      return rootNodes;
    }

    // Fallback: build tree by splitting "::" for legacy decks
    const rootNodes: DeckNode[] = [];
    const nodeMap = new Map<string, DeckNode>();
    const sorted = [...decks].sort((a, b) => a.name.localeCompare(b.name));

    for (const d of sorted) {
      const parts = d.name.split('::');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}::${part}` : part;
        const currentDepth = Math.min(5, i + 1);

        let node = nodeMap.get(currentPath);
        if (!node) {
          node = {
            id: currentPath === d.name ? d.id : `virtual_${currentPath}`,
            fullName: currentPath,
            displayName: part,
            depth: currentDepth,
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

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNode = (node: DeckNode) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedNodes.has(node.id);
    const depth = node.depth || 1;
    const isMaxDepth = depth >= 5;
    const isRealDeck = Boolean(node.deck) && !node.id.startsWith('virtual_');

    const targetDeck: AnkiDeck = node.deck || {
      id: node.id,
      userId: '',
      name: node.fullName,
      parentDeckId: node.parentDeckId,
      depth: node.depth,
      isCollapsed: false,
      createdAt: '',
      updatedAt: '',
    };

    return (
      <React.Fragment key={node.id}>
        <div
          className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_75px_85px_85px_220px] md:grid-cols-[1fr_80px_90px_90px_240px] items-center py-2.5 px-3 sm:px-4 border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors group ${
            depth > 1 ? 'bg-zinc-950/20' : ''
          }`}
        >
          {/* Coluna 1: Nome do Baralho + Recuo Hierárquico */}
          <div
            onDragOver={(event) => {
              if (!draggedDeckId || !isRealDeck || draggedDeckId === node.id) return;
              event.preventDefault();
              setDropTargetId(node.id);
            }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedDeckId && isRealDeck && draggedDeckId !== node.id) {
                const draggedDeck = decks.find((deck) => deck.id === draggedDeckId);
                if (draggedDeck) onDropDeck?.(draggedDeck, node.id);
              }
              setDraggedDeckId(null);
              setDropTargetId(null);
            }}
            className={`flex items-center gap-2 min-w-0 pr-2 rounded-lg transition-all duration-150 ${
              dropTargetId === node.id ? 'bg-indigo-500/20 ring-1 ring-indigo-400 scale-[1.01]' : ''
            }`}
            style={{ paddingLeft: `${Math.max(0, (depth - 1) * 20)}px` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapse(node.id)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"
                title={isCollapsed ? 'Expandir sub-baralhos' : 'Recolher sub-baralhos'}
              >
                {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {hasChildren && isCollapsed ? (
              <Folder className="w-4 h-4 text-amber-500/90 shrink-0" />
            ) : hasChildren ? (
              <FolderOpen className="w-4 h-4 text-amber-500/90 shrink-0" />
            ) : (
              <Layers className="w-4 h-4 text-sky-400/90 shrink-0" />
            )}

            {isRealDeck && (
              <button
                type="button"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', node.id);
                  setDraggedDeckId(node.id);
                }}
                onDragEnd={() => {
                  setDraggedDeckId(null);
                  setDropTargetId(null);
                }}
                className={`p-1 -ml-1 rounded text-zinc-500 hover:text-indigo-300 cursor-grab active:cursor-grabbing ${
                  draggedDeckId === node.id ? 'opacity-40 cursor-grabbing' : ''
                }`}
                title="Arraste para dentro de outro baralho"
                aria-label={`Arrastar baralho ${node.displayName}`}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="min-w-0 flex-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectDeck(targetDeck)}
                className="text-left font-medium text-zinc-200 hover:text-sky-400 transition-colors truncate block text-xs sm:text-sm"
                title={node.fullName}
              >
                {node.displayName}
              </button>

              {/* Nível do baralho */}
              {depth > 1 && (
                <span
                  className="hidden md:inline-flex px-1.5 py-0.2 text-[10px] font-mono rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 shrink-0"
                  title={`Nível ${depth} de 5`}
                >
                  Nv.{depth}
                </span>
              )}

              {/* Mobile count indicators */}
              <div className="flex sm:hidden items-center gap-2 text-[10px] font-mono mt-0.5 text-zinc-500">
                <span className={node.newCount > 0 ? 'text-sky-400 font-semibold' : 'text-zinc-600'}>
                  {node.newCount}N
                </span>
                <span>·</span>
                <span className={node.learnCount > 0 ? 'text-amber-500 font-semibold' : 'text-zinc-600'}>
                  {node.learnCount}A
                </span>
                <span>·</span>
                <span className={node.reviewCount > 0 ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}>
                  {node.reviewCount}R
                </span>
              </div>
            </div>
          </div>

          {/* Coluna 2: Novo (Desktop) */}
          <div className="hidden sm:block text-right pr-4 font-mono text-xs tabular-nums">
            <span
              className={`font-semibold ${node.newCount > 0 ? 'text-sky-400' : 'text-zinc-600'}`}
              title="Cartões Novos"
            >
              {node.newCount}
            </span>
          </div>

          {/* Coluna 3: Aprender (Desktop) */}
          <div className="hidden sm:block text-right pr-4 font-mono text-xs tabular-nums">
            <span
              className={`font-semibold ${node.learnCount > 0 ? 'text-amber-500' : 'text-zinc-600'}`}
              title="Cartões em Aprendizagem"
            >
              {node.learnCount}
            </span>
          </div>

          {/* Coluna 4: Revisar (Desktop) */}
          <div className="hidden sm:block text-right pr-4 font-mono text-xs tabular-nums">
            <span
              className={`font-semibold ${node.reviewCount > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}
              title="Cartões para Revisão"
            >
              {node.reviewCount}
            </span>
          </div>

          {/* Coluna 5: Ações do Baralho */}
          <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
            {/* 1. Estudar */}
            <button
              type="button"
              onClick={() => onSelectDeck(targetDeck)}
              className="px-2 sm:px-2.5 py-1 text-xs font-medium rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-zinc-700 flex items-center gap-1 transition-all active:scale-95 shadow-sm"
              title="Iniciar sessão de estudo"
            >
              <Play className="w-3 h-3 fill-current text-sky-400" />
              <span className="hidden sm:inline">Estudar</span>
            </button>

            {/* 2. Criar Sub-baralho (desabilitado se nível 5) */}
            {isMaxDepth ? (
              <button
                type="button"
                disabled
                className="p-1.5 rounded-md text-zinc-600 cursor-not-allowed border border-transparent opacity-40"
                title="Maximum deck nesting depth reached (5 levels)."
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCreateSubdeck(targetDeck)}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-sky-400 border border-transparent hover:border-zinc-700 transition-colors"
                title={`Criar sub-baralho dentro de "${node.displayName}"`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 3. Mover Baralho */}
            {onMoveDeck && isRealDeck && (
              <button
                type="button"
                onClick={() => onMoveDeck(targetDeck)}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-indigo-400 border border-transparent hover:border-zinc-700 transition-colors"
                title="Mover baralho entre pastas ou para a raiz"
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 4. Renomear */}
            {!node.id.startsWith('virtual_') && (
              <button
                type="button"
                onClick={() => onRenameDeck(targetDeck)}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-cyan-400 border border-transparent hover:border-zinc-700 transition-colors"
                title="Renomear baralho"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* 5. Configurações / FSRS */}
            <button
              type="button"
              onClick={() => onOpenDeckOptions(targetDeck)}
              className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-amber-400 border border-transparent hover:border-zinc-700 transition-colors"
              title="Configurações do Baralho / FSRS"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {/* 6. Excluir Baralho */}
            {!node.id.startsWith('virtual_') && (
              <button
                type="button"
                onClick={() => onDeleteDeck(targetDeck)}
                className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-red-400 border border-transparent hover:border-zinc-700 transition-colors"
                title="Excluir baralho"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filhos Hierárquicos */}
        {hasChildren && !isCollapsed && (
          <div>{node.children.map((child) => renderNode(child))}</div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-lg overflow-hidden">
      {/* Table Header com CSS Grid Perfeitamente Alinhado */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_75px_85px_85px_220px] md:grid-cols-[1fr_80px_90px_90px_240px] items-center py-2.5 px-4 bg-zinc-950/80 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <div>Baralho / Pastas</div>
        <div className="text-right pr-4 text-sky-400">Novo</div>
        <div className="text-right pr-4 text-amber-500">Aprender</div>
        <div className="text-right pr-4 text-emerald-400">Revisar</div>
        <div className="text-right pr-2">Ações</div>
      </div>

      {/* Mobile Table Header */}
      <div className="flex sm:hidden items-center justify-between py-2 px-3 bg-zinc-950/80 border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <div>Baralho</div>
        <div>Ações</div>
      </div>

      {/* Tree Content */}
      {tree.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">
          Nenhum baralho encontrado. Clique em "+ Criar Baralho" acima para começar!
        </div>
      ) : (
        <div>{tree.map((node) => renderNode(node))}</div>
      )}
    </div>
  );
};
