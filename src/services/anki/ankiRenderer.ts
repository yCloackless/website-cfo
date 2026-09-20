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

import { AnkiField, AnkiNote, AnkiNoteType, RenderedCardContent } from './ankiTypes';

export class AnkiRenderer {
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
        if (cleanKey === 'deck') return deckName;
        if (cleanKey === 'subdeck') return deckName.split('::').pop() || deckName;
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
    const questionHtml = replaceFields(template.qfmt, false);

    // Render Answer (substituting {{FrontSide}} with questionHtml without audio if applicable)
    let rawAnswerTpl = template.afmt;
    if (rawAnswerTpl.includes('{{FrontSide}}')) {
      rawAnswerTpl = rawAnswerTpl.replace(/\{\{FrontSide\}\}/gi, questionHtml);
    }
    const answerHtml = replaceFields(rawAnswerTpl, true);

    return {
      questionHtml,
      answerHtml,
      css: notetype.css || '',
      cardOrd: templateOrd,
      tags: note.tags || [],
    };
  }
}
