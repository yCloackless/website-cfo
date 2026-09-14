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
 * Scans balanced curly braces starting at a given index.
 */
function extractBracedContent(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (str[startIndex] !== '{') return null;
  let depth = 1;
  for (let i = startIndex + 1; i < str.length; i++) {
    if (str[i] === '\\') {
      i++; // skip escaped character
      continue;
    }
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(startIndex + 1, i), endIndex: i };
      }
    }
  }
  return null;
}

/**
 * Parses and formats text segments with support for:
 * - LaTeX text styling: \textbf{...}, \textit{...}, \underline{...}, \texttt{...}, \emph{...}, \text{...}
 * - Markdown text styling: **...**, *...*, `...`
 * - LaTeX escaped symbols: \%, \$, \&, \_, \#
 */
function renderFormattedText(rawText: string, baseKey = 'fmt'): React.ReactNode[] {
  if (!rawText) return [];

  const nodes: React.ReactNode[] = [];
  let currentIndex = 0;
  let keyCounter = 0;

  while (currentIndex < rawText.length) {
    // 1. Check for LaTeX commands starting with backslash
    if (rawText[currentIndex] === '\\') {
      const rest = rawText.slice(currentIndex);

      // LaTeX Escaped symbols: \%, \$, \&, \_, \#
      const escapeMatch = /^\\([%$&_#])/.exec(rest);
      if (escapeMatch) {
        nodes.push(escapeMatch[1]);
        currentIndex += escapeMatch[0].length;
        continue;
      }

      // LaTeX formatting commands
      const cmdMatch = /^\\(textbf|textit|underline|texttt|emph|text)\b\s*\{/.exec(rest);
      if (cmdMatch) {
        const cmd = cmdMatch[1];
        const braceStartIndex = currentIndex + cmdMatch[0].length - 1;
        const braced = extractBracedContent(rawText, braceStartIndex);
        if (braced) {
          const innerNodes = renderFormattedText(braced.content, `${baseKey}-${keyCounter}`);
          const elementKey = `${baseKey}-${keyCounter++}`;

          if (cmd === 'textbf') {
            nodes.push(
              <strong key={elementKey} className="font-bold text-slate-100">
                {innerNodes}
              </strong>
            );
          } else if (cmd === 'textit' || cmd === 'emph') {
            nodes.push(
              <em key={elementKey} className="italic text-slate-200">
                {innerNodes}
              </em>
            );
          } else if (cmd === 'underline') {
            nodes.push(
              <span key={elementKey} className="underline decoration-slate-400">
                {innerNodes}
              </span>
            );
          } else if (cmd === 'texttt') {
            nodes.push(
              <code key={elementKey} className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-800/80 text-blue-300">
                {innerNodes}
              </code>
            );
          } else {
            // \text{...}
            nodes.push(<React.Fragment key={elementKey}>{innerNodes}</React.Fragment>);
          }

          currentIndex = braced.endIndex + 1;
          continue;
        }
      }
    }

    // 2. Check for Markdown Bold: **...**
    if (rawText.startsWith('**', currentIndex)) {
      const closingIdx = rawText.indexOf('**', currentIndex + 2);
      if (closingIdx !== -1) {
        const innerContent = rawText.slice(currentIndex + 2, closingIdx);
        nodes.push(
          <strong key={`${baseKey}-${keyCounter++}`} className="font-bold text-slate-100">
            {renderFormattedText(innerContent, `${baseKey}-${keyCounter}`)}
          </strong>
        );
        currentIndex = closingIdx + 2;
        continue;
      }
    }

    // 3. Check for Markdown Italic: *...* (avoiding lone asterisk)
    if (rawText[currentIndex] === '*' && rawText[currentIndex + 1] !== ' ' && rawText[currentIndex + 1] !== '*') {
      const closingIdx = rawText.indexOf('*', currentIndex + 1);
      if (closingIdx !== -1 && closingIdx > currentIndex + 1 && rawText[closingIdx - 1] !== ' ') {
        const innerContent = rawText.slice(currentIndex + 1, closingIdx);
        nodes.push(
          <em key={`${baseKey}-${keyCounter++}`} className="italic text-slate-200">
            {renderFormattedText(innerContent, `${baseKey}-${keyCounter}`)}
          </em>
        );
        currentIndex = closingIdx + 1;
        continue;
      }
    }

    // 4. Check for Markdown Code: `...`
    if (rawText[currentIndex] === '`') {
      const closingIdx = rawText.indexOf('`', currentIndex + 1);
      if (closingIdx !== -1) {
        const innerContent = rawText.slice(currentIndex + 1, closingIdx);
        nodes.push(
          <code key={`${baseKey}-${keyCounter++}`} className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-800/80 text-blue-300">
            {innerContent}
          </code>
        );
        currentIndex = closingIdx + 1;
        continue;
      }
    }

    // 5. Consume next chunk of plain text up to next special char (\, *, `)
    const nextSpecialRegex = /[\\*`]/g;
    nextSpecialRegex.lastIndex = currentIndex + 1;
    const nextMatch = nextSpecialRegex.exec(rawText);
    const nextIndex = nextMatch ? nextMatch.index : rawText.length;
    nodes.push(rawText.slice(currentIndex, nextIndex));
    currentIndex = nextIndex;
  }

  return nodes;
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
          {renderFormattedText(seg.content, `seg-${idx}`)}
        </span>
      );
    }

    const isBlock = seg.type === 'block-math';
    const html = renderMathToHtml(seg.content, isBlock);

    // Keep display delimiters as real block elements. Rendering $$...$$ inside
    // an inline wrapper lets its intrinsic width/line box leak into the card
    // layout, which is particularly visible inside the constrained Bizu notes.
    if (isBlock) {
      return (
        <div
          key={idx}
          className="latex-block"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return (
      <span
        key={idx}
        className="latex-math"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });

  const hasBlockMath = segments.some((segment) => segment.type === 'block-math');
  const wrapperClass = `latex-renderer ${className}`;

  return hasBlockMath ? (
    <div className={wrapperClass}>{renderedSegments}</div>
  ) : (
    <span className={`inline align-baseline ${wrapperClass}`}>{renderedSegments}</span>
  );
};

export default Latex;
