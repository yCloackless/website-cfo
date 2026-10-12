/**
 * CFO CBMERJ - Real Anki Template & Cloze Renderer
 * 
 * Supports:
 * - Mustache field replacement {{FieldName}}
 * - Conditional fields {{#Field}}...{{/Field}} and inverted {{^Field}}...{{/Field}}
 * - Special tags: {{FrontSide}}, {{Tags}}, {{Deck}}, {{Subdeck}}
 * - True Cloze Deletion:
 *     {{c1::termo::dica}} -> Question: [...dica] / Answer: <span class="cloze">termo</span>
 *     Unrelated clozes {{c2::termo}} are unmasked on card 1.
 * - LaTeX / MathJax formatting:
 *     [latex]...[/latex], [$]...[/$], \(...\), \[...\], $$...$$, $...$
 */

import sanitizeHtml from 'sanitize-html';
import { AnkiField, AnkiNote, AnkiNoteType, RenderedCardContent } from './ankiTypes';
import { renderKatexToString } from '../../utils/katexChemistry';

export class AnkiRenderer {
  /** Sanitizes untrusted imported/user-authored card markup before API delivery. */
  public static sanitizeCardHtml(html: string): string {
    return sanitizeHtml(html, {
      allowedTags: [
        'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'dd', 'del', 'div', 'dl', 'dt',
        'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p',
        'pre', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
        'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
      ],
      allowedAttributes: {
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        '*': ['class', 'style'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowedSchemesByTag: { img: [] },
      allowProtocolRelative: false,
      disallowedTagsMode: 'discard',
      nonTextTags: ['script', 'style', 'textarea', 'option', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript'],
      allowedStyles: {
        '*': {
          color: [/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]{1,20})$/i],
          'background-color': [/^(#[\da-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]{1,20})$/i],
          'font-size': [/^-?(\d+(\.\d+)?)(px|em|rem|ex|%)$/i],
          'font-weight': [/^(normal|bold|[1-9]00)$/i],
          'font-style': [/^(normal|italic|oblique)$/i],
          'text-align': [/^(left|right|center|justify)$/i],
          'text-decoration': [/^(none|underline|line-through)$/i],
          'white-space': [/^(normal|nowrap|pre|pre-wrap|pre-line)$/i],
          display: [/^(inline|block|inline-block|table|table-row|table-cell)$/i],
          width: [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
          height: [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
          'vertical-align': [/^(baseline|sub|super|middle|top|bottom|-?\d+(\.\d+)?(px|em|rem|ex|%))$/i],
          'margin-left': [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
          'margin-right': [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
          'padding-left': [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
          'padding-right': [/^-?\d+(\.\d+)?(px|em|rem|ex|%)$/i],
        },
      },
      transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
      },
    });
  }

  /**
   * Renders LaTeX / MathJax and Chemistry formulas into HTML strings via KaTeX + mhchem.
   */
  public static renderMath(html: string): string {
    if (!html) return '';

    // Some older AI cards contain literal JSON paragraph markers and bare
    // equations. The review screen uses this server renderer, so recover them
    // here before looking for explicit math delimiters.
    const hasCorruptLatexEscapes = /\\\{\}n|\\\{\}\\\{\}(?:text|frac|qquad|quad|boxed|left|right|cdot|sqrt|times|Delta|pi|sum|int)/i.test(html);
    const legacyNormalizedHtml = hasCorruptLatexEscapes
      ? html
        .replace(/\\\{\}n/g, '<br>')
        .replace(/\\\{\}\\\{\}/g, '\\')
        .replace(/\\\{\}(?=(?:text|frac|qquad|quad|boxed|left|right|cdot|sqrt|times|Delta|pi|sum|int))/gi, '\\')
        .replace(/\\\{\}/g, '')
      : html;
    const normalizedHtml = legacyNormalizedHtml
      // Some cards mix real line breaks with JSON-escaped ones, or contain
      // more than one escaped slash. Normalize only newline markers followed
      // by another marker or a new sentence, leaving commands like \neq intact.
      .replace(/\\+n/g, (marker, offset, source) => {
        const next = source[offset + marker.length] || '';
        const rest = source.slice(offset + marker.length);
        return !next || next === '\\' || next === '<' || /[\sA-ZÀ-Ý0-9]/.test(next) || /^v[_=^]/.test(rest)
          ? '<br>'
          : marker;
      })
      // Recover only the safe tag emitted by older card-formatting passes.
      .replace(/&lt;(\/?strong)&gt;/gi, '<$1>')
      .replace(/\r\n?/g, '\n');
    let prepared = normalizedHtml
      .split(/(<br\s*\/?\s*>|\n)/i)
      .map((part) => {
        if (/^(?:<br\s*\/?\s*>|\n)$/i.test(part)) return '<br>';

        // Keep simple LaTeX text headings readable outside math mode.
        let line = part.replace(/\\textbf\{([^{}]*)\}/g, '<strong>$1</strong>');
        const looksLikeEquation = line.includes('=') &&
          !/\b(?:é|e|que|para|com|dos|das|uma|nos|nas)\b/i.test(line) &&
          /^[\\A-Za-z0-9{}_^+\-*/=.,()\s]+$/.test(line.trim());

        return looksLikeEquation && !/(?:\\\[|\$\$)/.test(line)
          ? `\\[${line.trim()}\\]`
          : line;
      })
      .join('');

    // Block math: $$...$$ or \[...\]
    let rendered = prepared.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (_m, g1, g2) => {
      const math = g1 || g2 || '';
      try {
        return renderKatexToString(math.trim(), true);
      } catch {
        return _m;
      }
    });

    // Inline math: [latex]...[/latex], [$]...[/$], \(...\), \ce{...}, and $...$
    rendered = rendered.replace(/(?:\[latex\]|\[\$\])([\s\S]*?)(?:\[\/latex\]|\[\/\$\])|\\\(([\s\S]*?)\\\)|\\ce\{([\s\S]*?)\}|(?<!\\)\$([^\$\n\r]+?)\$/g, (_m, g1, g2, g3, g4) => {
      const math = g3 !== undefined ? `\\ce{${g3}}` : (g1 || g2 || g4 || '');
      try {
        return renderKatexToString(math.trim(), false);
      } catch {
        return _m;
      }
    });

    return rendered;
  }

  /**
   * Discovers all unique cloze ordinals (1-based) in a note's fields.
   * Example: "O {{c1::coração}} bombeia {{c2::sangue}} para os {{c1::tecidos}}." -> [1, 2]
   */
  public static extractClozeOrdinals(fields: string[]): number[] {
    const regex = /\{\{c(\d+)::[\s\S]*?\}\}/gi;
    const ordinals = new Set<number>();

    for (const field of fields) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(field)) !== null) {
        const ord = parseInt(match[1], 10);
        if (!isNaN(ord) && ord > 0) {
          ordinals.add(ord);
        }
      }
    }

    const sorted = Array.from(ordinals).sort((a, b) => a - b);
    return sorted.length > 0 ? sorted : [1];
  }

  /**
   * Renders a Cloze deletion string for a specific card ordinal.
   * @param text The raw field text containing {{cN::answer::hint}}
   * @param targetOrd The active cloze ordinal (e.g. 1 for card c1)
   * @param isAnswer True if rendering Answer side, False if Question side
   */
  public static renderCloze(text: string, targetOrd: number, isAnswer: boolean): string {
    const clozeRegex = /\{\{c(\d+)::(.*?)(?:::([^}]+))?\}\}/g;

    return text.replace(clozeRegex, (_match, ordStr, answer, hint) => {
      const ord = parseInt(ordStr, 10);

      if (ord === targetOrd) {
        if (isAnswer) {
          return `<span class="cloze">${answer}</span>`;
        } else {
          const hintText = hint ? hint.trim() : '...';
          return `<span class="cloze">[${hintText}]</span>`;
        }
      } else {
        // Other clozes are shown normally without cloze styling on this card
        return answer;
      }
    });
  }

  public static escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Rewrites relative image sources to canonical Anki media URL.
   * e.g. <img src="paste-123.png"> -> <img src="/api/anki/media/paste-123.png">
   */
  public static rewriteMediaUrls(html: string): string {
    if (!html) return '';
    return html.replace(/<img([^>]+?)src=["']([^"']+)["']([^>]*)>/gi, (match, prefix, src, suffix) => {
      const cleanSrc = src.trim();
      if (cleanSrc.startsWith('data:') || cleanSrc.startsWith('http://') || cleanSrc.startsWith('https://') || cleanSrc.startsWith('/')) {
        return match;
      }
      return `<img${prefix}src="/api/anki/media/${encodeURIComponent(cleanSrc)}"${suffix}>`;
    });
  }

  /**
   * Renders a card's Question and Answer HTML based on note fields and card template.
   */
  public static renderCard(
    note: AnkiNote,
    notetype: AnkiNoteType,
    templateOrd: number = 0,
    deckName: string = ''
  ): RenderedCardContent {
    const template = notetype.templates[templateOrd] || notetype.templates[0];
    const isCloze = notetype.kind === 'cloze';
    const clozeOrd = templateOrd + 1; // 1-indexed cloze ordinal

    // Map fields by name (case-insensitive key)
    const fieldMap: Record<string, string> = {};
    notetype.fields.forEach((f: AnkiField) => {
      fieldMap[f.name.toLowerCase()] = note.fields[f.ordinal] || '';
    });

    // Handle conditionals: {{#Field}}...{{/Field}} and {{^Field}}...{{/Field}}
    const processConditionals = (tpl: string): string => {
      let result = tpl;

      // Positive conditionals {{#Field}}...{{/Field}}
      result = result.replace(/\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key, content) => {
        const val = fieldMap[key.toLowerCase()];
        return val && val.trim().length > 0 ? content : '';
      });

      // Negative conditionals {{^Field}}...{{/Field}}
      result = result.replace(/\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key, content) => {
        const val = fieldMap[key.toLowerCase()];
        return !val || val.trim().length === 0 ? content : '';
      });

      return result;
    };

    // Replace fields {{FieldName}}
    const replaceFields = (tpl: string, isAnswer: boolean): string => {
      let out = processConditionals(tpl);

      // Handle Cloze tags: {{cloze:FieldName}}
      out = out.replace(/\{\{cloze:([^}]+)\}\}/gi, (_m, key) => {
        const val = fieldMap[key.toLowerCase()] || '';
        return isCloze ? this.renderCloze(val, clozeOrd, isAnswer) : val;
      });

      // Handle standard fields: {{FieldName}}
      out = out.replace(/\{\{([^}#^/]+)\}\}/g, (m, key) => {
        const cleanKey = key.trim().toLowerCase();
        if (cleanKey === 'tags') return (note.tags || []).join(' ');
        if (cleanKey === 'deck') return AnkiRenderer.escapeHtml(deckName);
        if (cleanKey === 'subdeck') return AnkiRenderer.escapeHtml(deckName.split('::').pop() || deckName);
        if (cleanKey === 'frontside') return ''; // Handled separately for afmt
        if (cleanKey === 'cardflag') return '';

        const val = fieldMap[cleanKey];
        if (val !== undefined) {
          return isCloze ? this.renderCloze(val, clozeOrd, isAnswer) : val;
        }
        return m;
      });

      return out;
    };

    // Render Question
    const rawQuestionHtml = this.rewriteMediaUrls(replaceFields(template.qfmt, false));
    const questionHtml = this.renderMath(rawQuestionHtml);

    // Render Answer (substituting {{FrontSide}} with questionHtml without audio if applicable)
    let rawAnswerTpl = template.afmt;
    if (rawAnswerTpl.includes('{{FrontSide}}')) {
      rawAnswerTpl = rawAnswerTpl.replace(/\{\{FrontSide\}\}/gi, () => rawQuestionHtml);
    }
    const answerHtml = this.renderMath(this.rewriteMediaUrls(replaceFields(rawAnswerTpl, true)));

    return {
      questionHtml,
      answerHtml,
      css: notetype.css || '',
      cardOrd: templateOrd,
      tags: note.tags || [],
    };
  }
}
