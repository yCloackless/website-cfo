import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexRendererProps {
  content?: string;
  children?: string;
  className?: string;
  block?: boolean;
}

interface TextSegment {
  type: 'text' | 'inline-math' | 'block-math';
  content: string;
}

/**
 * Splits text into raw text and LaTeX math blocks (inline $...$ and block $$...$$)
 */
function parseLatexSegments(text: string): TextSegment[] {
  if (!text) return [];

  // If text already has $$ or $ or \[ or \( delimiters, parse token by token
  const delimiterRegex = /(?:\$\$([\s\S]*?)\$\$)|(?:\$([^\$\n\r]+?)\$)|(?:\\\[([\s\S]*?)\\\])|(?:\\\(([\s\S]*?)\\\))/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const hasDelimiters = delimiterRegex.test(text);
  // Reset regex after test()
  delimiterRegex.lastIndex = 0;

  if (hasDelimiters) {
    while ((match = delimiterRegex.exec(text)) !== null) {
      const matchIndex = match.index;

      // Leading plain text
      if (matchIndex > lastIndex) {
        segments.push({
          type: 'text',
          content: text.slice(lastIndex, matchIndex),
        });
      }

      if (match[1] !== undefined) {
        // $$...$$
        segments.push({ type: 'block-math', content: match[1].trim() });
      } else if (match[2] !== undefined) {
        // $...$
        segments.push({ type: 'inline-math', content: match[2].trim() });
      } else if (match[3] !== undefined) {
        // \[...\]
        segments.push({ type: 'block-math', content: match[3].trim() });
      } else if (match[4] !== undefined) {
        // \(...\)
        segments.push({ type: 'inline-math', content: match[4].trim() });
      }

      lastIndex = delimiterRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }

    return segments;
  }

  // Fallback heuristic: If the text contains typical LaTeX symbols or math notation
  // (e.g. \frac, \sqrt, \Delta, \cdot, \pi, \vec, \sum, \binom, \alpha, \beta, \neq, \rightarrow, \implies)
  const isDirectLatex =
    text.includes('\\') ||
    text.includes('^') ||
    text.includes('_') ||
    text.includes('·') ||
    text.includes('π') ||
    text.includes('Δ') ||
    text.includes('Σ') ||
    text.includes('√');

  if (isDirectLatex && (text.startsWith('\\') || text.includes('\\frac') || text.includes('\\text'))) {
    return [{ type: 'block-math', content: text.trim() }];
  }

  return [{ type: 'text', content: text }];
}

/**
 * Safely renders a math string to HTML using KaTeX
 */
function renderMathToHtml(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
      trust: false,
    });
  } catch (err) {
    console.warn('KaTeX render error:', err);
    return `<span class="katex-error font-mono text-red-400 text-xs">${escapeHtml(math)}</span>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Latex Component:
 * Formats mathematical, physical, and chemical formulas with LaTeX typesetting via KaTeX.
 */
export const Latex: React.FC<LatexRendererProps> = ({
  content,
  children,
  className = '',
  block = false,
}) => {
  const text = (content ?? children ?? '').trim();

  const segments = useMemo(() => {
    if (!text) return [];

    // If caller explicitly requested block mode and no delimiters present
    if (block && !text.includes('$') && !text.includes('\\[')) {
      return [{ type: 'block-math', content: text }] as TextSegment[];
    }

    return parseLatexSegments(text);
  }, [text, block]);

  if (!text) return null;

  return (
    <span className={`inline-block max-w-full align-baseline overflow-x-auto scrollbar-thin ${className}`}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return (
            <span key={idx} className="whitespace-pre-wrap">
              {seg.content}
            </span>
          );
        }

        const isBlock = seg.type === 'block-math';
        const html = renderMathToHtml(seg.content, isBlock);

        if (isBlock) {
          return (
            <div
              key={idx}
              className="my-1.5 py-1 px-2.5 rounded-lg bg-black/10 dark:bg-black/25 overflow-x-auto max-w-full scrollbar-thin text-center text-amber-300 dark:text-amber-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        }

        return (
          <span
            key={idx}
            className="inline-math px-0.5 mx-0.5 max-w-full overflow-x-auto scrollbar-thin text-amber-300 dark:text-amber-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
};

export default Latex;
