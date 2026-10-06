import katex from 'katex';
import 'katex/contrib/mhchem';

/**
 * Global KaTeX macros to handle characters that would otherwise cause ParseErrors
 * in LaTeX math mode (e.g., #, &, $).
 * 
 * Note: mhchem natively intercepts and handles # for triple bonds (e.g. \ce{HC#CH}).
 * Outside \ce, the macro expands '#' to '\#' so formulas like 'n = # \text{mols}'
 * render cleanly without throwing "Can't use function '#' in math mode".
 */
export const KATEX_MACROS: Record<string, string> = {
  '#': '\\#',
  '&': '\\&',
  '$': '\\$',
};

export const KATEX_SAFE_OPTIONS = {
  throwOnError: false,
  output: 'htmlAndMathml' as const,
  strict: false,
  trust: false,
  macros: KATEX_MACROS,
};

/**
 * Sanitizes math expressions before passing to KaTeX:
 * 1. Escapes unescaped '%' characters into '\%' (so 100% in yield/purity is not consumed as a TeX comment).
 * 2. Normalizes reaction arrows (-> to \longrightarrow, <=> to \rightleftharpoons) outside \ce{...}.
 * 3. Preserves \ce{...} expressions untouched for mhchem parser.
 */
export function sanitizeMathExpression(rawMath: string): string {
  if (!rawMath) return '';
  let math = rawMath.trim();

  // If the entire expression is already wrapped in \ce{...}, keep as-is
  if (/^\\ce\{[\s\S]*\}$/.test(math)) {
    return math;
  }

  // Escape unescaped '%' outside comments (so '100%' in stoichiometry yield/purity becomes '100\%')
  // We match '%' not preceded by a backslash
  math = math.replace(/(?<!\\)%/g, '\\%');

  // Convert raw reaction arrows outside \ce blocks:
  // '<=>' -> '\rightleftharpoons'
  // '->' -> '\longrightarrow'
  // '<-' -> '\longleftarrow'
  math = math
    .replace(/(?<![<=-])<=>(?![=>])/g, ' \\rightleftharpoons ')
    .replace(/(?<![<=-])->(?![=>])/g, ' \\longrightarrow ')
    .replace(/(?<![<=-])<-(?![=>])/g, ' \\longleftarrow ');

  return math;
}

/**
 * Checks if a string without delimiters represents a direct math or chemical formula
 * (e.g., H_2SO_4, Fe^{3+}, SO_4^{2-}, \ce{H2SO4}, \frac{m}{M}, 2 H_2 + O_2 -> 2 H_2O).
 */
export function isDirectMathFormula(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Multi-paragraph or markdown headers are documents, not single formulas
  if (trimmed.includes('\n\n') || /^#{1,6}\s/m.test(trimmed)) {
    return false;
  }

  // Starts with LaTeX command or chemistry command (\ce, \frac, \sqrt, etc.)
  if (/^\\(ce|frac|sqrt|text|vec|sum|int|alpha|beta|Delta|pi|cdot)\b/.test(trimmed)) {
    return true;
  }

  // Chemical formula with subscript (e.g. H_2SO_4, CO_2, H_2O, Ca(OH)_2, C_6H_12O_6)
  if (/[A-Za-z0-9)]+_[0-9A-Za-z{]/.test(trimmed)) {
    // Single chemical formula or compact equation
    return !trimmed.includes('\n') && (!trimmed.includes(' ') || /^[A-Za-z0-9_^{}+=()\s·/*><→⇄⇌≤≥±\u2192\u21CC-]+$/.test(trimmed));
  }

  // Chemical ion with superscript (e.g. Fe^{3+}, Fe^3+, SO_4^{2-}, H^+, OH^-, Ca^{2+})
  if (/[A-Za-z0-9)]+\^[0-9A-Za-z{+-]/.test(trimmed)) {
    return !trimmed.includes('\n') && (!trimmed.includes(' ') || /^[A-Za-z0-9_^{}+=()\s·/*><→⇄⇌≤≥±\u2192\u21CC-]+$/.test(trimmed));
  }

  // Standalone chemical reaction equation (e.g. 2 H2 + O2 -> 2 H2O)
  if (/(?:->|<=|=>|\\longrightarrow|\\rightarrow|\\rightleftharpoons)/.test(trimmed) && /[A-Z]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Safely renders a math or chemical string to HTML using KaTeX + mhchem.
 * Never throws and cleans up raw parse error artifacts.
 */
export function renderKatexToString(rawMath: string, displayMode = false): string {
  if (!rawMath || !rawMath.trim()) return '';

  const sanitized = sanitizeMathExpression(rawMath);

  try {
    const html = katex.renderToString(sanitized, {
      ...KATEX_SAFE_OPTIONS,
      displayMode,
    });

    // If KaTeX still output a parse error span with title="ParseError: ...",
    // check if it's broken and provide a clean fallback
    if (html.includes('class="katex-error"') && html.includes('ParseError')) {
      // Try rendering with basic escaping as a secondary fallback
      const cleanFallback = katex.renderToString(`\\text{${escapeLatexText(rawMath)}}`, {
        ...KATEX_SAFE_OPTIONS,
        displayMode,
      });
      return cleanFallback;
    }

    return html;
  } catch (err) {
    console.warn('KaTeX render error:', err);
    try {
      return katex.renderToString(`\\text{${escapeLatexText(rawMath)}}`, {
        ...KATEX_SAFE_OPTIONS,
        displayMode,
      });
    } catch {
      return `<span class="katex-fallback font-mono text-xs text-slate-300">${escapeHtml(rawMath)}</span>`;
    }
  }
}

function escapeLatexText(str: string): string {
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([#$%&_{}])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
