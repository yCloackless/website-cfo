import React, { useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Sigma,
  Sparkles,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import type { MathSolveResponse } from '../../services/math/types';

interface MathResultCardProps {
  result: MathSolveResponse;
  requestedBy?: string;
}

function renderKatexHtml(latex: string, displayMode = true): string {
  try {
    return katex.renderToString(latex || '', {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return latex;
  }
}

export const MathResultCard: React.FC<MathResultCardProps> = ({
  result,
  requestedBy = 'Cadete',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedMode, setCopiedMode] = useState<'text' | 'latex' | null>(null);

  const inputHtml = useMemo(
    () => renderKatexHtml(result.inputLatex || result.input, true),
    [result.inputLatex, result.input]
  );

  const exactHtml = useMemo(
    () => renderKatexHtml(result.exactResultLatex || result.exactResult, true),
    [result.exactResultLatex, result.exactResult]
  );

  const hasMoreDetails =
    (result.steps && result.steps.length > 0) ||
    (result.extraPods && result.extraPods.length > 0) ||
    Boolean(result.extractedExpression) ||
    Boolean(result.decimalApproximation);

  const handleCopy = async (mode: 'text' | 'latex') => {
    const content =
      mode === 'latex'
        ? result.exactResultLatex || result.exactResult
        : result.exactResult;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  if (!result.ok) {
    return (
      <div className="max-w-2xl rounded-xl border border-rose-500/30 border-l-4 border-l-rose-500 bg-[#1e1f22] p-4 text-zinc-100 shadow-lg transition-all duration-200">
        <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm mb-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Não foi possível calcular</span>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">
          {result.error || 'Verifique a sintaxe da expressão e tente novamente.'}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="math-result-card"
      className="max-w-2xl rounded-xl border border-white/10 border-l-4 border-l-orange-500 bg-[#1e1f22] p-4 text-zinc-100 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Cabeçalho estilo embed Discord */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-sm">
            <Sigma className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-bold tracking-tight text-white">
            Resultados matemáticos
          </h3>
        </div>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            result.source === 'wolfram'
              ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {result.sourceLabel}
        </span>
      </div>

      {result.warning && (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          {result.warning}
        </div>
      )}

      {/* Área interna branca fiel ao print */}
      <div className="rounded-lg bg-white text-zinc-900 p-4 sm:p-5 shadow-inner space-y-4 overflow-x-auto">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Entrada
          </div>
          <div
            data-testid="math-card-input"
            className="text-base sm:text-lg text-zinc-900 [&_.katex-display]:my-1 [&_.katex-display]:text-left"
            dangerouslySetInnerHTML={{ __html: inputHtml }}
          />
        </div>

        <div className="border-t border-zinc-200 pt-3">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Resultado exato
          </div>
          <div
            data-testid="math-card-exact"
            className="text-lg sm:text-xl font-medium text-zinc-950 [&_.katex-display]:my-1 [&_.katex-display]:text-left"
            dangerouslySetInnerHTML={{ __html: exactHtml }}
          />
        </div>

        {result.decimalApproximation && (
          <div className="border-t border-zinc-100 pt-2 flex flex-wrap items-baseline gap-2 text-sm">
            <span className="font-semibold text-zinc-600">Aproximação decimal:</span>
            <code className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-zinc-900">
              {result.decimalApproximation}
            </code>
          </div>
        )}
      </div>

      {/* Barra de ações */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {hasMoreDetails && (
            <button
              type="button"
              data-testid="math-show-more-btn"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Mostrar menos
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Mostrar mais
                </>
              )}
            </button>
          )}

          <button
            type="button"
            data-testid="math-copy-btn"
            onClick={() => handleCopy('text')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            {copiedMode === 'text' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar resultado
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleCopy('latex')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
          >
            {copiedMode === 'latex' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                LaTeX copiado!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar LaTeX
              </>
            )}
          </button>
        </div>

        <span className="text-[11px] text-zinc-400">
          Solicitado por <strong className="text-zinc-200">{requestedBy}</strong>
        </span>
      </div>

      {/* Área expandida: Passo a passo e detalhes adicionais */}
      {expanded && hasMoreDetails && (
        <div
          data-testid="math-expanded-details"
          className="mt-3 border-t border-white/10 pt-3 space-y-3 animate-in fade-in duration-200"
        >
          {result.extractedExpression && (
            <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-300">
              <Camera className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>
                Expressão extraída da foto:{' '}
                <code className="font-mono text-white">{result.extractedExpression}</code>
              </span>
            </div>
          )}

          {result.steps && result.steps.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Explicação passo a passo
              </div>
              <ol className="space-y-2">
                {result.steps.map((step, index) => (
                  <li
                    key={`${step.title}-${index}`}
                    className="rounded-lg border border-white/10 bg-black/25 p-3"
                  >
                    <div className="text-xs font-semibold text-orange-300 mb-1">
                      {index + 1}. {step.title}
                    </div>
                    {step.expressionLatex && (
                      <div
                        className="my-1.5 rounded bg-white px-3 py-2 text-zinc-900 overflow-x-auto [&_.katex-display]:my-0 [&_.katex-display]:text-left"
                        dangerouslySetInnerHTML={{
                          __html: renderKatexHtml(step.expressionLatex, true),
                        }}
                      />
                    )}
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {step.explanation}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result.extraPods && result.extraPods.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Informações adicionais
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.extraPods.map((pod, idx) => (
                  <div
                    key={`${pod.title}-${idx}`}
                    className="rounded-lg border border-white/10 bg-black/25 p-2.5"
                  >
                    <div className="text-[11px] font-semibold text-zinc-400 mb-1">
                      {pod.title}
                    </div>
                    <div className="text-xs font-mono text-zinc-200 whitespace-pre-wrap break-words">
                      {pod.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
