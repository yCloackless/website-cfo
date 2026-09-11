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
 * Keep at most one line break around display delimiters. This preserves the
 * author's chat-like flow without allowing generated blank lines to grow into
 * large empty gaps.
 */
function compactBlockWhitespace(segments: TextSegment[]): TextSegment[] {
  return segments
    .map((segment, index, all) => {
      if (segment.type !== 'text') return segment;

      const previous = all[index - 1];
      const next = all[index + 1];
      let content = segment.content;

      if (previous?.type === 'block-math') content = content.replace(/^\s*\n(?:\s*\n)+/, '\n');
      if (next?.type === 'block-math') content = content.replace(/(?:\s*\n){2,}\s*$/, '\n');

      return { ...segment, content };
    })
    .filter((segment) => segment.type !== 'text' || segment.content.length > 0);
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

    return compactBlockWhitespace(segments);
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

  const renderedSegments = segments.map((seg, idx) => {
    if (seg.type === 'text') {
      return (
        <span key={idx} className="whitespace-pre-wrap">
          {seg.content}
        </span>
      );
    }

    // Render every formula inline so notes keep the same flow as a normal chat
    // message, regardless of whether the author used $$...$$ or $...$.
    const html = renderMathToHtml(seg.content, false);

    return (
      <span
        key={idx}
        className="latex-math max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });

  const wrapperClass = `inline max-w-full align-baseline latex-renderer ${className}`;
  return <span className={wrapperClass}>{renderedSegments}</span>;
};

export default Latex;
