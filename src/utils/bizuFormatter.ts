/**
 * bizuFormatter.ts
 * Utility to format, parse, and guarantee separated topics for Bizu notes:
 *
 * Topico 1 - Bla Bla Bla
 *
 * Topico 2 - Bla Bla
 *
 * Topico 3 - Bla Bla Bla Bla
 */

export interface BizuTopicSection {
  number: number;
  title: string;
  content: string;
}

/**
 * Normalizes any raw notes into clearly separated topics with blank lines between them.
 */
export function formatNotesToSeparatedTopics(raw: string): string {
  if (!raw) return '';

  let text = raw.trim();

  // Normalize line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip excessive initial header if it's generic
  text = text.replace(/^RESUMO TÁTICO\s*(?:&|E)?\s*BIZUS?:[^\n]*\n+/i, '');

  // Step 1: Replace numbers like "1. 📌 CONCEITO...", "1. CONCEITO...", "1 - CONCEITO...", "1) CONCEITO..."
  // with "Tópico 1 - Conceito..."
  text = text.replace(
    /(?:^|\n|\s{2,})(?:T[oó]pico\s*)?([1-9])\s*(?:[.)\-–—:]\s*)(?:[📌📐⚡⚠️🎯💡🔍*]*\s*)([^\n]+?)(?::|\n|$)/gi,
    (match, num, rawTitle) => {
      let cleanTitle = rawTitle.trim();
      // Remove trailing colons, markdown stars or dashes
      cleanTitle = cleanTitle.replace(/^[-–—:* ]+|[-–—:* ]+$/g, '').trim();
      
      // If title is all uppercase, convert to Title Case for readability
      if (cleanTitle.length > 3 && cleanTitle === cleanTitle.toUpperCase()) {
        cleanTitle = cleanTitle
          .toLowerCase()
          .replace(/(?:^|\s|\/|-)([a-záéíóúâêôãõç])/g, (l) => l.toUpperCase())
          .replace(/\bDe\b/g, 'de')
          .replace(/\bDa\b/g, 'da')
          .replace(/\bDo\b/g, 'do')
          .replace(/\bDas\b/g, 'das')
          .replace(/\bDos\b/g, 'dos')
          .replace(/\bE\b/g, 'e')
          .replace(/\bEm\b/g, 'em');
      }

      return `\n\nTópico ${num} - ${cleanTitle}\n`;
    }
  );

  // Step 2: Ensure any occurrences of "Tópico X - [Title]" have a double newline before them
  text = text.replace(/([^\n])\s*(T[oó]pico\s*[1-9]\s*[-–—:])/gi, '$1\n\n$2');

  // Step 3: Collapse more than 2 consecutive newlines into exactly two
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // If after all this, no "Tópico" was detected (e.g. user just wrote bullet points or paragraphs):
  if (!/T[oó]pico\s*[1-9]/i.test(text)) {
    // Split by double newlines or single numbered lines
    const lines = text.split(/\n{2,}/);
    if (lines.length > 1) {
      return lines
        .map((chunk, index) => {
          const trimmed = chunk.trim();
          if (!trimmed) return '';
          return `Tópico ${index + 1} - ${trimmed.split('\n')[0].replace(/^[-*• ]+/, '')}\n${trimmed}`;
        })
        .filter(Boolean)
        .join('\n\n');
    }
  }

  return text;
}

/**
 * Parses notes text into an array of distinct topic sections for custom styled rendering.
 */
export function parseNotesIntoTopics(notesText: string): BizuTopicSection[] {
  if (!notesText || !notesText.trim()) return [];

  const formatted = formatNotesToSeparatedTopics(notesText);

  // Regex to split by "Tópico X - [Title]"
  const topicRegex = /T[oó]pico\s*([1-9])\s*[-–—:]\s*([^\n]+)/gi;
  const sections: BizuTopicSection[] = [];

  let match: RegExpExecArray | null;
  const matches: { index: number; number: number; title: string; length: number }[] = [];

  while ((match = topicRegex.exec(formatted)) !== null) {
    matches.push({
      index: match.index,
      number: parseInt(match[1], 10),
      title: match[2].trim(),
      length: match[0].length,
    });
  }

  if (matches.length === 0) {
    // Fallback: entire text as single topic
    return [
      {
        number: 1,
        title: 'Anotações & Bizus',
        content: formatted,
      },
    ];
  }

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const startIndex = current.index + current.length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : formatted.length;
    const bodyContent = formatted.slice(startIndex, endIndex).trim();

    sections.push({
      number: current.number,
      title: current.title,
      content: bodyContent,
    });
  }

  return sections;
}
