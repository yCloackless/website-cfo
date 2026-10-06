import React, { useMemo } from 'react';
import 'katex/dist/katex.min.css';
import {
  renderKatexToString,
  isDirectMathFormula,
} from '../utils/katexChemistry';

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
 * Splits plain text segments further if they contain raw chemical formulas
 * with subscripts or superscripts (e.g. H_2SO_4, Fe^{3+}, SO_4^{2-}, Ca(OH)_2).
 */
function splitChemicalFormulasFromText(segments: TextSegment[]): TextSegment[] {
  const chemFormulaRegex = /(?:(?<=\s|^|\())([A-Z][A-Za-z0-9()]*[_\^][A-Za-z0-9_{}+-^()]*[A-Za-z0-9}+-])(?=[.,;:\s)]|$)/g;
  const result: TextSegment[] = [];

  for (const seg of segments) {
    if (seg.type !== 'text') {
      result.push(seg);
      continue;
    }

    const text = seg.content;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    chemFormulaRegex.lastIndex = 0;
    while ((match = chemFormulaRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        result.push({ type: 'text', content: text.slice(lastIndex, matchIndex) });
      }
      result.push({ type: 'inline-math', content: match[1] });
      lastIndex = chemFormulaRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ type: 'text', content: text.slice(lastIndex) });
    }
  }

  return result;
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
 * Splits text into raw text and LaTeX math blocks (inline $...$ and block $$...$$),
 * with full support for:
 * - $$...$$ and \[...\] (block math)
 * - $...$, \(...\), [$]...[/$] (inline math)
 * - [latex]...[/latex] (LaTeX math)
 * - \ce{...} (mhchem chemistry equations)
 * - Raw chemical formulas: H_2SO_4, Fe^{3+}, SO_4^{2-}, Ca(OH)_2
 */
function parseLatexSegments(text: string): TextSegment[] {
  if (!text) return [];

  // Delimiters for LaTeX and Chemistry blocks:
  // 1: $$...$$
  // 2: $...$
  // 3: \[...\]
  // 4: \(...\)
  // 5: [latex]...[/latex]
  // 6: [$]...[/$]
  // 7: \ce{...}
  const delimiterRegex = /(?:\$\$([\s\S]*?)\$\$)|(?:\$([^\$\n\r]+?)\$)|(?:\\\[([\s\S]*?)\\\])|(?:\\\(([\s\S]*?)\\\))|(?:\[latex\]([\s\S]*?)\[\/latex\])|(?:\[\$\]([\s\S]*?)\[\/\$\])|(?:\\ce\{([\s\S]*?)\})/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const hasDelimiters = delimiterRegex.test(text);
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
      } else if (match[5] !== undefined) {
        // [latex]...[/latex]
        segments.push({ type: 'block-math', content: match[5].trim() });
      } else if (match[6] !== undefined) {
        // [$]...[/$]
        segments.push({ type: 'inline-math', content: match[6].trim() });
      } else if (match[7] !== undefined) {
        // \ce{...}
        segments.push({ type: 'inline-math', content: `\\ce{${match[7].trim()}}` });
      }

      lastIndex = delimiterRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }

    return compactBlockWhitespace(splitChemicalFormulasFromText(segments));
  }

  // Fallback heuristic: If the text is a direct standalone formula or chemical expression
  // (e.g. H_2SO_4, Fe^{3+}, \frac{m}{M}, 2 H_2 + O_2 -> 2 H_2O, \ce{H2SO4})
  if (isDirectMathFormula(text)) {
    return [{ type: 'inline-math', content: text.trim() }];
  }

  // If text contains inline chemical formulas without delimiters, split them out
  const splitSegments = splitChemicalFormulasFromText([{ type: 'text', content: text }]);
  return compactBlockWhitespace(splitSegments);
}

/**
 * Safely renders a math or chemical string to HTML using KaTeX + mhchem.
 */
function renderMathToHtml(math: string, displayMode: boolean): string {
  return renderKatexToString(math, displayMode);
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

  const sourceText = rawText
    .replace(/<\/?(?:strong|b)>/gi, '**')
    .replace(/<\/?(?:em|i)>/gi, '*')
    .replace(/<\/?code>/gi, '`')
    .replace(/<u>/gi, '\\underline{')
    .replace(/<\/u>/gi, '}')
    .replace(/<sub>/gi, '\\textsubscript{')
    .replace(/<\/sub>/gi, '}')
    .replace(/<sup>/gi, '\\textsuperscript{')
    .replace(/<\/sup>/gi, '}')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '\n');

  const nodes: React.ReactNode[] = [];
  let currentIndex = 0;
  let keyCounter = 0;

  while (currentIndex < sourceText.length) {
    // 1. Check for LaTeX commands starting with backslash
    if (sourceText[currentIndex] === '\\') {
      const rest = sourceText.slice(currentIndex);

      // LaTeX Escaped symbols: \%, \$, \&, \_, \#
      const escapeMatch = /^\\([%$&_#])/.exec(rest);
      if (escapeMatch) {
        nodes.push(escapeMatch[1]);
        currentIndex += escapeMatch[0].length;
        continue;
      }

      // LaTeX formatting commands
      const cmdMatch = /^\\(textbf|textit|underline|texttt|emph|text|textsubscript|textsuperscript)\b\s*\{/.exec(rest);
      if (cmdMatch) {
        const cmd = cmdMatch[1];
        const braceStartIndex = currentIndex + cmdMatch[0].length - 1;
        const braced = extractBracedContent(sourceText, braceStartIndex);
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
          } else if (cmd === 'textsubscript') {
            nodes.push(
              <sub key={elementKey} className="text-[0.75em] align-sub font-semibold">
                {innerNodes}
              </sub>
            );
          } else if (cmd === 'textsuperscript') {
            nodes.push(
              <sup key={elementKey} className="text-[0.75em] align-super font-semibold">
                {innerNodes}
              </sup>
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
    if (sourceText.startsWith('**', currentIndex)) {
      const closingIdx = sourceText.indexOf('**', currentIndex + 2);
      if (closingIdx !== -1) {
        const innerContent = sourceText.slice(currentIndex + 2, closingIdx);
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
    if (sourceText[currentIndex] === '*' && sourceText[currentIndex + 1] !== ' ' && sourceText[currentIndex + 1] !== '*') {
      const closingIdx = sourceText.indexOf('*', currentIndex + 1);
      if (closingIdx !== -1 && closingIdx > currentIndex + 1 && sourceText[closingIdx - 1] !== ' ') {
        const innerContent = sourceText.slice(currentIndex + 1, closingIdx);
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
    if (sourceText[currentIndex] === '`') {
      const closingIdx = sourceText.indexOf('`', currentIndex + 1);
      if (closingIdx !== -1) {
        const innerContent = sourceText.slice(currentIndex + 1, closingIdx);
        nodes.push(
          <code key={`${baseKey}-${keyCounter++}`} className="font-mono text-[11px] px-1 py-0.5 rounded bg-slate-800/80 text-blue-300">
            {innerContent}
          </code>
        );
        currentIndex = closingIdx + 1;
        continue;
      }
    }

    // 5. Check for HTML Image Tag: <img ... />
    if (sourceText.startsWith('<img', currentIndex)) {
      const imgMatch = /^<img\s+[^>]*?src=["']([^"']+)["'][^>]*?\/?>/i.exec(sourceText.slice(currentIndex));
      if (imgMatch) {
        const rawSrc = imgMatch[1].trim();
        const resolvedSrc = (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('/') || rawSrc.startsWith('data:'))
          ? rawSrc
          : `/api/anki/media/${encodeURIComponent(rawSrc)}`;
        nodes.push(
          <img
            key={`${baseKey}-${keyCounter++}`}
            src={resolvedSrc}
            alt="Imagem do Flashcard"
            className="max-w-full max-h-96 rounded-xl my-2 border border-zinc-800 object-contain shadow-md mx-auto block"
            loading="lazy"
          />
        );
        currentIndex += imgMatch[0].length;
        continue;
      }
    }

    // 6. Consume next chunk of plain text up to next special char (\, *, `, <)
    const nextSpecialRegex = /[\\*`<]/g;
    nextSpecialRegex.lastIndex = currentIndex + 1;
    const nextMatch = nextSpecialRegex.exec(sourceText);
    const nextIndex = nextMatch ? nextMatch.index : sourceText.length;
    nodes.push(sourceText.slice(currentIndex, nextIndex));
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
