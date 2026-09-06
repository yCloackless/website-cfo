import React, { useState } from 'react';
import { Latex } from './LatexRenderer';
import { parseNotesIntoTopics } from '../utils/bizuFormatter';
import { ChevronDown, ChevronUp, BookOpen, Layers } from 'lucide-react';

interface BizuTopicViewerProps {
  notes?: string;
  isDark?: boolean;
  maxInitialTopics?: number;
  className?: string;
}

export const BizuTopicViewer: React.FC<BizuTopicViewerProps> = ({
  notes,
  isDark = true,
  maxInitialTopics = 3,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!notes || !notes.trim()) {
    return null;
  }

  const topics = parseNotesIntoTopics(notes);

  if (topics.length === 0) {
    return null;
  }

  const displayedTopics = isExpanded ? topics : topics.slice(0, maxInitialTopics);
  const hasHiddenTopics = topics.length > maxInitialTopics;

  return (
    <div className={`space-y-3 ${className}`}>
      {displayedTopics.map((topic) => {
        // Distinct badge colors per topic number
        const badgeColors = [
          'bg-blue-500/15 text-blue-400 border-blue-500/30',
          'bg-amber-500/15 text-amber-300 border-amber-500/30',
          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          'bg-rose-500/15 text-rose-300 border-rose-500/30',
          'bg-purple-500/15 text-purple-300 border-purple-500/30',
        ];
        const colorClass = badgeColors[(topic.number - 1) % badgeColors.length];

        return (
          <div
            key={topic.number}
            className={`p-3 rounded-xl border transition-all ${
              isDark
                ? 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700/80'
                : 'bg-white border-slate-200/90 shadow-xs'
            }`}
          >
            {/* Topic Header: "Topico X - Titulo" */}
            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-800/40">
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border shrink-0 ${colorClass}`}
              >
                Tópico {topic.number}
              </span>
              <h5
                className={`text-xs font-bold leading-tight line-clamp-1 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}
              >
                {topic.title}
              </h5>
            </div>

            {/* Topic Body with LaTeX rendering */}
            <div
              className={`text-xs leading-relaxed overflow-x-auto scrollbar-thin ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <Latex content={topic.content} />
            </div>
          </div>
        );
      })}

      {/* Show more / collapse button if there are many topics */}
      {hasHiddenTopics && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              isDark
                ? 'bg-slate-900 border border-slate-800 text-blue-400 hover:text-blue-300 hover:bg-slate-850'
                : 'bg-slate-100 border border-slate-200 text-blue-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>
              {isExpanded
                ? 'Recolher Tópicos'
                : `Ver todos os ${topics.length} tópicos (+${topics.length - maxInitialTopics})`}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default BizuTopicViewer;
