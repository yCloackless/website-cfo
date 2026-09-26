/**
 * CFO CBMERJ - Real Anki Search Parser & Filter
 * 
 * Supports authentic Anki search syntax:
 * - deck:"Matemática::Logaritmos" or deck:Matemática*
 * - tag:biologia or -tag:geometria (negation)
 * - is:new, is:learn, is:review, is:due, is:suspended, is:buried
 * - flag:1 .. flag:7
 * - added:7 (created within last 7 days)
 * - rated:1 (reviewed within last 1 day)
 * - Raw keyword search matching note fields and tags
 */

import { AnkiCard, CardQueue, CardType } from './ankiTypes';

export interface ParsedSearchTokens {
  deckPatterns: Array<{ pattern: string; negated: boolean }>;
  tagPatterns: Array<{ pattern: string; negated: boolean }>;
  isFilters: Array<{ status: string; negated: boolean }>;
  importanceFilters: Array<{ importance: string; negated: boolean }>;
  flags: Array<{ flag: number; negated: boolean }>;
  addedDays?: number;
  ratedDays?: number;
  keywords: Array<{ term: string; negated: boolean }>;
}

export class AnkiSearch {
  /**
   * Parses an Anki query string into structured filter tokens.
   */
  public static parseQuery(rawQuery: string): ParsedSearchTokens {
    const tokens: ParsedSearchTokens = {
      deckPatterns: [],
      tagPatterns: [],
      isFilters: [],
      importanceFilters: [],
      flags: [],
      keywords: [],
    };

    if (!rawQuery || !rawQuery.trim()) {
      return tokens;
    }

    // Match quoted strings or whitespace-delimited terms
    const termRegex = /(-?)([a-zA-Z_]+):(?:"([^"]+)"|([^\s]+))|(-?)"([^"]+)"|(-?[^\s]+)/g;
    let match: RegExpExecArray | null;

    while ((match = termRegex.exec(rawQuery)) !== null) {
      if (match[2]) {
        // Tagged term like deck:foo or -is:due
        const negated = match[1] === '-';
        const key = match[2].toLowerCase();
        const value = match[3] || match[4] || '';

        if (key === 'deck') {
          tokens.deckPatterns.push({ pattern: value.toLowerCase(), negated });
        } else if (key === 'tag') {
          tokens.tagPatterns.push({ pattern: value.toLowerCase(), negated });
        } else if (key === 'importance' || key === 'importancia') {
          const lower = value.toLowerCase();
          const mapped = lower === 'baixa' ? 'low' : lower === 'alta' ? 'high' : lower === 'essencial' ? 'essential' : lower;
          tokens.importanceFilters.push({ importance: mapped, negated });
        } else if (key === 'is') {
          const lower = value.toLowerCase();
          if (['low', 'normal', 'high', 'essential', 'baixa', 'alta', 'essencial'].includes(lower)) {
            const mapped = lower === 'baixa' ? 'low' : lower === 'alta' ? 'high' : lower === 'essencial' ? 'essential' : lower;
            tokens.importanceFilters.push({ importance: mapped, negated });
          } else {
            tokens.isFilters.push({ status: lower, negated });
          }
        } else if (key === 'flag') {
          const f = parseInt(value, 10);
          if (!isNaN(f)) tokens.flags.push({ flag: f, negated });
        } else if (key === 'added') {
          const days = parseInt(value, 10);
          if (!isNaN(days)) tokens.addedDays = days;
        } else if (key === 'rated') {
          const days = parseInt(value, 10);
          if (!isNaN(days)) tokens.ratedDays = days;
        }
      } else if (match[6] || match[7]) {
        // Plain keyword search
        const rawTerm = match[6] || match[7];
        const negated = rawTerm.startsWith('-');
        const term = (negated ? rawTerm.slice(1) : rawTerm).toLowerCase();
        if (term) {
          tokens.keywords.push({ term, negated });
        }
      }
    }

    return tokens;
  }

  /**
   * Evaluates if a card matches the parsed search criteria.
   */
  public static matchesCard(
    card: AnkiCard,
    tokens: ParsedSearchTokens,
    deckName: string = '',
    noteFields: string[] = [],
    noteTags: string[] = []
  ): boolean {
    const now = new Date();
    const todayEpochDays = Math.floor(now.getTime() / 86400000);
    const nowSeconds = Math.floor(now.getTime() / 1000);

    // 1. Deck filters
    for (const d of tokens.deckPatterns) {
      const match = deckName.toLowerCase().includes(d.pattern.replace('*', ''));
      if (d.negated ? match : !match) return false;
    }

    // 2. Tag filters
    for (const t of tokens.tagPatterns) {
      const lowerTags = noteTags.map(tag => tag.toLowerCase());
      const match = lowerTags.some(tag => tag.includes(t.pattern.replace('*', '')));
      if (t.negated ? match : !match) return false;
    }

    // 3. Status is:* filters
    for (const isF of tokens.isFilters) {
      let isMatch = false;
      const st = isF.status;

      if (st === 'new') {
        isMatch = card.cardType === CardType.New || card.queue === CardQueue.New;
      } else if (st === 'learn') {
        isMatch = card.cardType === CardType.Learn || card.queue === CardQueue.Learn;
      } else if (st === 'review') {
        isMatch = card.cardType === CardType.Review || card.queue === CardQueue.Review;
      } else if (st === 'suspended') {
        isMatch = card.queue === CardQueue.Suspended;
      } else if (st === 'buried') {
        isMatch = card.queue === CardQueue.UserBuried || card.queue === CardQueue.SchedBuried;
      } else if (st === 'due') {
        if (card.queue === CardQueue.Suspended || card.queue === CardQueue.UserBuried || card.queue === CardQueue.SchedBuried) {
          isMatch = false;
        } else if (card.queue === CardQueue.Learn || card.queue === CardQueue.Relearn) {
          isMatch = card.due <= nowSeconds;
        } else if (card.queue === CardQueue.Review) {
          isMatch = card.due <= todayEpochDays;
        } else if (card.queue === CardQueue.New) {
          isMatch = true;
        }
      }

      if (isF.negated ? isMatch : !isMatch) return false;
    }

    // 4. Importance filters
    for (const impF of tokens.importanceFilters) {
      const match = card.importance === impF.importance;
      if (impF.negated ? match : !match) return false;
    }

    // 5. Flag filters
    for (const fl of tokens.flags) {
      const match = card.flags === fl.flag;
      if (fl.negated ? match : !match) return false;
    }

    // 5. Added filter
    if (tokens.addedDays !== undefined) {
      const cardCreated = new Date(card.createdAt).getTime();
      const cutoff = now.getTime() - tokens.addedDays * 86400000;
      if (cardCreated < cutoff) return false;
    }

    // 6. Keywords
    if (tokens.keywords.length > 0) {
      const combinedText = (noteFields.join(' ') + ' ' + noteTags.join(' ')).toLowerCase();
      for (const kw of tokens.keywords) {
        const found = combinedText.includes(kw.term);
        if (kw.negated ? found : !found) return false;
      }
    }

    return true;
  }
}
