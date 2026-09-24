/**
 * CFO CBMERJ - Real Anki Repository
 * 
 * Complete server-side data access layer with strict multi-tenant isolation:
 * - All queries strictly bound to `userId` (Zero IDOR)
 * - ACID transactions for state modifications and undo rollbacks
 * - Note -> Card generation for Standard & Cloze notes
 * - Real Anki deck trees, search, reviews, and statistics
 */

import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  AnkiCard,
  AnkiCardStateSnapshot,
  AnkiCardTemplate,
  AnkiDeck,
  AnkiDeckConfig,
  AnkiField,
  AnkiMedia,
  AnkiNote,
  AnkiNoteType,
  AnkiRevlog,
  AnkiStatsSummary,
  CardFlag,
  CardQueue,
  CardType,
  DeckConfigOptions,
  DEFAULT_DECK_CONFIG,
  Rating,
} from '../services/anki/ankiTypes';
import { AnkiScheduler } from '../services/anki/ankiScheduler';
import { AnkiRenderer } from '../services/anki/ankiRenderer';
import { AnkiSearch } from '../services/anki/ankiSearch';
import { deleteAnkiMedia, getAnkiMedia, MediaStorageNotConfiguredError, persistentMediaStorageConfigured, putAnkiMedia } from '../services/anki/ankiMediaStorage';

export class AnkiRepository {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // =========================================================================
  // 1. PROVISIONING & DEFAULTS
  // =========================================================================

  public ensureDefaultDeckConfig(userId: string): AnkiDeckConfig {
    const existing = this.db.prepare(`
      SELECT * FROM anki_deck_configs WHERE user_id = ? AND name = 'Padrão'
    `).get(userId) as any;

    if (existing) {
      return {
        id: existing.id,
        userId: existing.user_id,
        name: existing.name,
        config: JSON.parse(existing.config_json),
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const configJson = JSON.stringify(DEFAULT_DECK_CONFIG);

    this.db.prepare(`
      INSERT INTO anki_deck_configs (id, user_id, name, config_json, created_at, updated_at)
      VALUES (?, ?, 'Padrão', ?, ?, ?)
    `).run(id, userId, configJson, now, now);

    return {
      id,
      userId,
      name: 'Padrão',
      config: DEFAULT_DECK_CONFIG,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getDeckConfig(userId: string, configId?: string): AnkiDeckConfig {
    if (configId) {
      const existing = this.db.prepare(`
        SELECT * FROM anki_deck_configs WHERE user_id = ? AND id = ?
      `).get(userId, configId) as any;
      if (existing) {
        return {
          id: existing.id,
          userId: existing.user_id,
          name: existing.name,
          config: JSON.parse(existing.config_json),
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        };
      }
    }
    return this.ensureDefaultDeckConfig(userId);
  }

  public updateDeckConfig(
    userId: string,
    configId: string,
    options: Partial<DeckConfigOptions>,
    name?: string
  ): AnkiDeckConfig {
    const existing = this.getDeckConfig(userId, configId);
    const updatedOptions: DeckConfigOptions = {
      ...existing.config,
      ...options,
    };

    // Strict numerical & logic sanitation
    if (typeof updatedOptions.desiredRetention === 'number') {
      updatedOptions.desiredRetention = Math.max(0.70, Math.min(0.99, Number(updatedOptions.desiredRetention) || 0.90));
    }
    if (typeof updatedOptions.newPerDay === 'number') {
      updatedOptions.newPerDay = Math.max(0, Math.min(2000, Math.round(Number(updatedOptions.newPerDay) || 20)));
    }
    if (typeof updatedOptions.maxReviewsPerDay === 'number') {
      updatedOptions.maxReviewsPerDay = Math.max(0, Math.min(5000, Math.round(Number(updatedOptions.maxReviewsPerDay) || 200)));
    }
    if (Array.isArray(updatedOptions.learningSteps)) {
      const cleanSteps = updatedOptions.learningSteps
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
      updatedOptions.learningSteps = cleanSteps.length > 0 ? cleanSteps : [1, 10];
    }
    if (Array.isArray(updatedOptions.relearningSteps)) {
      const cleanSteps = updatedOptions.relearningSteps
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0);
      updatedOptions.relearningSteps = cleanSteps.length > 0 ? cleanSteps : [10];
    }
    if (updatedOptions.buryNewSiblings !== undefined) {
      updatedOptions.buryNewSiblings = Boolean(updatedOptions.buryNewSiblings);
    }
    if (updatedOptions.buryReviewSiblings !== undefined) {
      updatedOptions.buryReviewSiblings = Boolean(updatedOptions.buryReviewSiblings);
    }
    if (updatedOptions.enableFSRS !== undefined) {
      updatedOptions.enableFSRS = Boolean(updatedOptions.enableFSRS);
    }

    const now = new Date().toISOString();
    const configJson = JSON.stringify(updatedOptions);
    const configName = name && typeof name === 'string' && name.trim() ? name.trim() : existing.name;

    this.db.prepare(`
      UPDATE anki_deck_configs
      SET name = ?, config_json = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(configName, configJson, now, userId, existing.id);

    return {
      id: existing.id,
      userId,
      name: configName,
      config: updatedOptions,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  public ensureDefaultNoteTypes(userId: string): AnkiNoteType[] {
    const existing = this.listNoteTypes(userId);
    if (existing.length > 0) {
      return existing;
    }

    const now = new Date().toISOString();

    // 1. Basic
    const basicId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO anki_notetypes (id, user_id, name, kind, css, is_system, created_at, updated_at)
      VALUES (?, ?, 'Basic', 'standard', ?, 1, ?, ?)
    `).run(basicId, userId, '.card { font-family: Inter, sans-serif; font-size: 20px; text-align: center; color: #f4f4f5; background-color: #18181b; padding: 24px; }\n.cloze { font-weight: bold; color: #38bdf8; }', now, now);

    this.insertField(userId, basicId, 'Front', 0);
    this.insertField(userId, basicId, 'Back', 1);
    this.insertTemplate(userId, basicId, 'Card 1', 0, '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}');

    // 2. Basic (and reversed card)
    const reversedId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO anki_notetypes (id, user_id, name, kind, css, is_system, created_at, updated_at)
      VALUES (?, ?, 'Basic (and reversed card)', 'standard', ?, 1, ?, ?)
    `).run(reversedId, userId, '.card { font-family: Inter, sans-serif; font-size: 20px; text-align: center; color: #f4f4f5; background-color: #18181b; padding: 24px; }', now, now);

    this.insertField(userId, reversedId, 'Front', 0);
    this.insertField(userId, reversedId, 'Back', 1);
    this.insertTemplate(userId, reversedId, 'Card 1', 0, '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}');
    this.insertTemplate(userId, reversedId, 'Card 2', 1, '{{Back}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}');

    // 3. Cloze
    const clozeId = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO anki_notetypes (id, user_id, name, kind, css, is_system, created_at, updated_at)
      VALUES (?, ?, 'Cloze', 'cloze', ?, 1, ?, ?)
    `).run(clozeId, userId, '.card { font-family: Inter, sans-serif; font-size: 20px; text-align: center; color: #f4f4f5; background-color: #18181b; padding: 24px; }\n.cloze { font-weight: bold; color: #38bdf8; background-color: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px; }', now, now);

    this.insertField(userId, clozeId, 'Text', 0);
    this.insertField(userId, clozeId, 'Extra', 1);
    this.insertTemplate(userId, clozeId, 'Cloze', 0, '{{cloze:Text}}', '{{cloze:Text}}<br>\n{{#Extra}}<hr id=answer><div style="font-size:16px; color:#a1a1aa;">{{Extra}}</div>{{/Extra}}');

    return this.listNoteTypes(userId);
  }

  private insertField(userId: string, notetypeId: string, name: string, ordinal: number): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO anki_fields (id, user_id, notetype_id, name, ordinal, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, notetypeId, name, ordinal, now);
  }

  private insertTemplate(userId: string, notetypeId: string, name: string, ordinal: number, qfmt: string, afmt: string): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO anki_templates (id, user_id, notetype_id, name, ordinal, qfmt, afmt, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, notetypeId, name, ordinal, qfmt, afmt, now);
  }

  // =========================================================================
  // 2. DECKS & HIERARCHY (Folder system, Max Depth 5, Cycle Prevention)
  // =========================================================================

  public static readonly MAX_DECK_DEPTH = 5;
  public static readonly MAX_DECKS_PER_USER = 300;
  public static readonly MAX_DECK_NAME_LENGTH = 80;

  public countDecks(userId: string): number {
    const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM anki_decks WHERE user_id = ?`).get(userId) as any;
    return Number(row?.cnt || 0);
  }

  public getDeckDepth(userId: string, deckId: string): number {
    let depth = 1;
    let currentId: string | null = deckId;
    const visited = new Set<string>();

    while (currentId && visited.size < 15) {
      visited.add(currentId);
      const row = this.db.prepare(`SELECT parent_deck_id FROM anki_decks WHERE user_id = ? AND id = ?`).get(userId, currentId) as any;
      if (!row || !row.parent_deck_id) {
        break;
      }
      currentId = row.parent_deck_id;
      depth++;
      if (visited.has(currentId)) break;
    }
    return Math.min(AnkiRepository.MAX_DECK_DEPTH + 1, depth);
  }

  public getSubtreeHeight(userId: string, deckId: string): number {
    const rows = this.db.prepare(`SELECT id, parent_deck_id FROM anki_decks WHERE user_id = ?`).all(userId) as any[];
    const childrenMap = new Map<string, string[]>();
    for (const r of rows) {
      if (r.parent_deck_id) {
        const list = childrenMap.get(r.parent_deck_id) || [];
        list.push(r.id);
        childrenMap.set(r.parent_deck_id, list);
      }
    }

    const calcHeight = (id: string, visited: Set<string>): number => {
      if (visited.has(id)) return 1;
      visited.add(id);
      const children = childrenMap.get(id) || [];
      if (children.length === 0) return 1;
      let maxChildHeight = 0;
      for (const childId of children) {
        maxChildHeight = Math.max(maxChildHeight, calcHeight(childId, new Set(visited)));
      }
      return 1 + maxChildHeight;
    };

    return calcHeight(deckId, new Set());
  }

  public isDescendant(userId: string, targetDeckId: string, potentialAncestorId: string): boolean {
    if (targetDeckId === potentialAncestorId) return true;
    let currentId: string | null = targetDeckId;
    const visited = new Set<string>();

    while (currentId && visited.size < 25) {
      visited.add(currentId);
      const row = this.db.prepare(`SELECT parent_deck_id FROM anki_decks WHERE user_id = ? AND id = ?`).get(userId, currentId) as any;
      if (!row || !row.parent_deck_id) return false;
      if (row.parent_deck_id === potentialAncestorId) return true;
      currentId = row.parent_deck_id;
      if (visited.has(currentId)) break;
    }
    return false;
  }

  public getDescendantDeckIds(userId: string, deckId: string): string[] {
    const rows = this.db.prepare(`SELECT id, parent_deck_id FROM anki_decks WHERE user_id = ?`).all(userId) as any[];
    const childrenMap = new Map<string, string[]>();
    for (const r of rows) {
      if (r.parent_deck_id) {
        const list = childrenMap.get(r.parent_deck_id) || [];
        list.push(r.id);
        childrenMap.set(r.parent_deck_id, list);
      }
    }

    const result: string[] = [];
    const queue = [deckId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      result.push(current);
      const children = childrenMap.get(current) || [];
      for (const ch of children) {
        if (!visited.has(ch)) queue.push(ch);
      }
    }
    return result;
  }

  public listDecks(userId: string): AnkiDeck[] {
    const todayEpochDays = Math.floor(Date.now() / 86400000);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const rows = this.db.prepare(`
      SELECT 
        d.*,
        COUNT(DISTINCT c.id) as total_cards,
        COUNT(DISTINCT CASE WHEN c.queue = 0 THEN c.id ELSE NULL END) as new_count,
        COUNT(DISTINCT CASE WHEN (c.queue = 1 OR c.queue = 3) AND c.due <= ? THEN c.id ELSE NULL END) as learn_count,
        COUNT(DISTINCT CASE WHEN c.queue = 2 AND c.due <= ? THEN c.id ELSE NULL END) as review_count
      FROM anki_decks d
      LEFT JOIN anki_cards c ON c.deck_id = d.id AND c.user_id = d.user_id
      WHERE d.user_id = ?
      GROUP BY d.id
      ORDER BY d.name COLLATE NOCASE ASC
    `).all(nowSeconds, todayEpochDays, userId) as any[];

    const deckMap = new Map<string, any>();
    for (const r of rows) {
      deckMap.set(r.id, r);
    }

    const depthMap = new Map<string, number>();
    const getDepth = (id: string, visited: Set<string>): number => {
      if (depthMap.has(id)) return depthMap.get(id)!;
      if (visited.has(id)) return 1;
      visited.add(id);
      const r = deckMap.get(id);
      if (!r || !r.parent_deck_id) {
        depthMap.set(id, 1);
        return 1;
      }
      const pDepth = getDepth(r.parent_deck_id, visited);
      const curDepth = Math.min(AnkiRepository.MAX_DECK_DEPTH, pDepth + 1);
      depthMap.set(id, curDepth);
      return curDepth;
    };

    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      parentDeckId: r.parent_deck_id || null,
      description: r.description,
      configId: r.config_id,
      isCollapsed: Boolean(r.is_collapsed),
      depth: getDepth(r.id, new Set()),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      newCount: Number(r.new_count || 0),
      learnCount: Number(r.learn_count || 0),
      reviewCount: Number(r.review_count || 0),
      totalCards: Number(r.total_cards || 0),
    }));
  }

  public getDeck(userId: string, deckId: string): AnkiDeck | null {
    const todayEpochDays = Math.floor(Date.now() / 86400000);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const r = this.db.prepare(`
      SELECT 
        d.*,
        COUNT(DISTINCT c.id) as total_cards,
        COUNT(DISTINCT CASE WHEN c.queue = 0 THEN c.id ELSE NULL END) as new_count,
        COUNT(DISTINCT CASE WHEN (c.queue = 1 OR c.queue = 3) AND c.due <= ? THEN c.id ELSE NULL END) as learn_count,
        COUNT(DISTINCT CASE WHEN c.queue = 2 AND c.due <= ? THEN c.id ELSE NULL END) as review_count
      FROM anki_decks d
      LEFT JOIN anki_cards c ON c.deck_id = d.id AND c.user_id = d.user_id
      WHERE d.user_id = ? AND d.id = ?
      GROUP BY d.id
    `).get(nowSeconds, todayEpochDays, userId, deckId) as any;

    if (!r) return null;

    return {
      id: r.id,
      userId: r.user_id,
      name: r.name,
      parentDeckId: r.parent_deck_id || null,
      description: r.description,
      configId: r.config_id,
      isCollapsed: Boolean(r.is_collapsed),
      depth: this.getDeckDepth(userId, r.id),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      newCount: Number(r.new_count || 0),
      learnCount: Number(r.learn_count || 0),
      reviewCount: Number(r.review_count || 0),
      totalCards: Number(r.total_cards || 0),
    };
  }

  public createDeck(userId: string, data: { name: string; description?: string | null; configId?: string | null; parentDeckId?: string | null }): AnkiDeck {
    const totalDecks = this.countDecks(userId);
    if (totalDecks >= AnkiRepository.MAX_DECKS_PER_USER) {
      const err = new Error(`Limite máximo de ${AnkiRepository.MAX_DECKS_PER_USER} baralhos por usuário atingido.`);
      (err as any).code = 'MAX_DECKS_EXCEEDED';
      throw err;
    }

    if (typeof data.name !== 'string') {
      const err = new Error('Nome do baralho deve ser uma string.');
      (err as any).code = 'INVALID_NAME';
      throw err;
    }

    const trimmedName = data.name.trim();
    if (!trimmedName) {
      const err = new Error('Nome do baralho é obrigatório.');
      (err as any).code = 'INVALID_NAME';
      throw err;
    }
    if (trimmedName.length > AnkiRepository.MAX_DECK_NAME_LENGTH) {
      const err = new Error(`Nome do baralho não pode ultrapassar ${AnkiRepository.MAX_DECK_NAME_LENGTH} caracteres.`);
      (err as any).code = 'NAME_TOO_LONG';
      throw err;
    }

    if (/[<>]/.test(trimmedName)) {
      const err = new Error('Nome do baralho não pode conter tags ou caracteres HTML.');
      (err as any).code = 'INVALID_NAME';
      throw err;
    }

    if (data.parentDeckId !== undefined && data.parentDeckId !== null && typeof data.parentDeckId !== 'string') {
      const err = new Error('ID do baralho pai inválido.');
      (err as any).code = 'INVALID_PAYLOAD';
      throw err;
    }

    let parentDeckId: string | null = null;
    let depth = 1;

    if (data.parentDeckId) {
      const parent = this.getDeck(userId, data.parentDeckId);
      if (!parent) {
        const err = new Error('Baralho pai selecionado não existe ou não pertence a você.');
        (err as any).code = 'PARENT_DECK_NOT_FOUND';
        throw err;
      }

      const parentDepth = this.getDeckDepth(userId, data.parentDeckId);
      if (parentDepth >= AnkiRepository.MAX_DECK_DEPTH) {
        const err = new Error('Maximum deck nesting depth reached (5 levels).');
        (err as any).code = 'MAX_DEPTH_EXCEEDED';
        throw err;
      }

      parentDeckId = data.parentDeckId;
      depth = parentDepth + 1;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO anki_decks (id, user_id, name, description, config_id, parent_deck_id, is_collapsed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, userId, trimmedName, data.description || null, data.configId || null, parentDeckId, now, now);

    const deck = this.getDeck(userId, id)!;
    deck.depth = depth;
    return deck;
  }

  public updateDeck(userId: string, deckId: string, data: { name?: string; description?: string | null; configId?: string | null; isCollapsed?: boolean; parentDeckId?: string | null }): AnkiDeck | null {
    const deck = this.getDeck(userId, deckId);
    if (!deck) return null;

    let name = deck.name;
    if (data.name !== undefined) {
      if (typeof data.name !== 'string') {
        const err = new Error('Nome do baralho deve ser uma string.');
        (err as any).code = 'INVALID_NAME';
        throw err;
      }
      const trimmed = data.name.trim();
      if (!trimmed) {
        const err = new Error('Nome do baralho é obrigatório.');
        (err as any).code = 'INVALID_NAME';
        throw err;
      }
      if (trimmed.length > AnkiRepository.MAX_DECK_NAME_LENGTH) {
        const err = new Error(`Nome do baralho não pode ultrapassar ${AnkiRepository.MAX_DECK_NAME_LENGTH} caracteres.`);
        (err as any).code = 'NAME_TOO_LONG';
        throw err;
      }
      if (/[<>]/.test(trimmed)) {
        const err = new Error('Nome do baralho não pode conter tags ou caracteres HTML.');
        (err as any).code = 'INVALID_NAME';
        throw err;
      }
      name = trimmed;
    }

    let parentDeckId = deck.parentDeckId ?? null;
    if (data.parentDeckId !== undefined) {
      if (data.parentDeckId !== null && typeof data.parentDeckId !== 'string') {
        const err = new Error('ID do baralho pai inválido.');
        (err as any).code = 'INVALID_PAYLOAD';
        throw err;
      }
      if (data.parentDeckId === null || data.parentDeckId === '') {
        // Move to root
        parentDeckId = null;
      } else {
        if (data.parentDeckId === deckId) {
          const err = new Error('A deck cannot be its own parent.');
          (err as any).code = 'CYCLIC_RELATIONSHIP';
          throw err;
        }

        const targetParent = this.getDeck(userId, data.parentDeckId);
        if (!targetParent) {
          const err = new Error('Baralho pai de destino não existe ou não pertence a você.');
          (err as any).code = 'PARENT_DECK_NOT_FOUND';
          throw err;
        }

        // Check cycle: is targetParent a descendant of deckId?
        if (this.isDescendant(userId, data.parentDeckId, deckId)) {
          const err = new Error('A deck cannot be moved inside one of its descendants.');
          (err as any).code = 'CYCLIC_RELATIONSHIP';
          throw err;
        }

        // Check depth limit with subtree height
        const targetParentDepth = this.getDeckDepth(userId, data.parentDeckId);
        const subtreeHeight = this.getSubtreeHeight(userId, deckId);

        if (targetParentDepth + subtreeHeight > AnkiRepository.MAX_DECK_DEPTH) {
          const err = new Error('Maximum deck nesting depth reached (5 levels).');
          (err as any).code = 'MAX_DEPTH_EXCEEDED';
          throw err;
        }

        parentDeckId = data.parentDeckId;
      }
    }

    const description = data.description !== undefined ? data.description : deck.description;
    const configId = data.configId !== undefined ? data.configId : deck.configId;
    const isCollapsed = data.isCollapsed !== undefined ? (data.isCollapsed ? 1 : 0) : (deck.isCollapsed ? 1 : 0);
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE anki_decks
      SET name = ?, description = ?, config_id = ?, parent_deck_id = ?, is_collapsed = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(name, description, configId, parentDeckId, isCollapsed, now, userId, deckId);

    return this.getDeck(userId, deckId);
  }

  public deleteDeck(userId: string, deckId: string): boolean {
    const deck = this.getDeck(userId, deckId);
    if (!deck) return false;

    // Get all descendant deck IDs to cascade delete cleanly
    const descendantIds = this.getDescendantDeckIds(userId, deckId);

    // Delete from leaves up so foreign keys and dependencies are purged cleanly
    for (const dId of descendantIds.reverse()) {
      this.db.prepare(`DELETE FROM anki_decks WHERE user_id = ? AND id = ?`).run(userId, dId);
    }

    // Purge orphaned notes whose cards were deleted with the decks
    const orphanNotes = this.db.prepare(`
      SELECT fields_json FROM anki_notes
      WHERE user_id = ? AND id NOT IN (SELECT DISTINCT note_id FROM anki_cards WHERE user_id = ?)
    `).all(userId, userId) as any[];

    const orphanMedia: string[] = [];
    for (const note of orphanNotes) {
      try {
        const fields = JSON.parse(note.fields_json || '[]');
        orphanMedia.push(...AnkiRepository.extractMediaFilenames(fields));
      } catch {}
    }

    this.db.prepare(`
      DELETE FROM anki_notes
      WHERE user_id = ? AND id NOT IN (SELECT DISTINCT note_id FROM anki_cards WHERE user_id = ?)
    `).run(userId, userId);

    if (orphanMedia.length > 0) {
      void this.cleanupUnreferencedMedia(userId, orphanMedia);
    }

    return true;
  }

  // =========================================================================
  // 3. NOTETYPES, FIELDS & TEMPLATES
  // =========================================================================

  public listNoteTypes(userId: string): AnkiNoteType[] {
    const ntRows = this.db.prepare(`
      SELECT * FROM anki_notetypes WHERE user_id = ? ORDER BY name COLLATE NOCASE ASC
    `).all(userId) as any[];

    return ntRows.map(nt => this.hydrateNoteType(userId, nt));
  }

  public getNoteType(userId: string, id: string): AnkiNoteType | null {
    const nt = this.db.prepare(`
      SELECT * FROM anki_notetypes WHERE user_id = ? AND id = ?
    `).get(userId, id) as any;

    if (!nt) return null;
    return this.hydrateNoteType(userId, nt);
  }

  private hydrateNoteType(userId: string, nt: any): AnkiNoteType {
    const fields = this.db.prepare(`
      SELECT * FROM anki_fields WHERE user_id = ? AND notetype_id = ? ORDER BY ordinal ASC
    `).all(userId, nt.id) as any[];

    const templates = this.db.prepare(`
      SELECT * FROM anki_templates WHERE user_id = ? AND notetype_id = ? ORDER BY ordinal ASC
    `).all(userId, nt.id) as any[];

    return {
      id: nt.id,
      userId: nt.user_id,
      name: nt.name,
      kind: nt.kind,
      css: nt.css,
      isSystem: Boolean(nt.is_system),
      fields: fields.map(f => ({
        id: f.id,
        userId: f.user_id,
        notetypeId: f.notetype_id,
        name: f.name,
        ordinal: f.ordinal,
        fontSize: f.font_size,
        fontName: f.font_name,
        createdAt: f.created_at,
      })),
      templates: templates.map(t => ({
        id: t.id,
        userId: t.user_id,
        notetypeId: t.notetype_id,
        name: t.name,
        ordinal: t.ordinal,
        qfmt: t.qfmt,
        afmt: t.afmt,
        bqfmt: t.bqfmt,
        bafmt: t.bafmt,
        createdAt: t.created_at,
      })),
      createdAt: nt.created_at,
      updatedAt: nt.updated_at,
    };
  }

  // =========================================================================
  // 4. NOTES & CARDS GENERATION (Standard & Cloze)
  // =========================================================================

  public createNote(userId: string, data: {
    deckId: string;
    notetypeId: string;
    fields: string[];
    tags?: string[];
  }): { note: AnkiNote; cards: AnkiCard[] } {
    // 1. Verify deck ownership
    const deck = this.getDeck(userId, data.deckId);
    if (!deck) throw new Error('DECK_NOT_FOUND');

    // 2. Verify notetype
    const notetype = this.getNoteType(userId, data.notetypeId);
    if (!notetype) throw new Error('NOTETYPE_NOT_FOUND');

    const noteId = crypto.randomUUID();
    const guid = crypto.randomUUID();
    const now = new Date().toISOString();
    const tagsStr = (data.tags || []).filter(Boolean).join(' ');

    this.db.prepare(`
      INSERT INTO anki_notes (id, user_id, notetype_id, guid, fields_json, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(noteId, userId, notetype.id, guid, JSON.stringify(data.fields), tagsStr, now, now);

    // 3. Generate Cards based on NoteType kind
    const generatedCards: AnkiCard[] = [];

    if (notetype.kind === 'cloze') {
      // Cloze note: generates cards based on {{c1::}}, {{c2::}}, etc.
      const clozes = AnkiRenderer.extractClozeOrdinals(data.fields);
      for (const clozeOrd of clozes) {
        const cardId = crypto.randomUUID();
        const templateOrd = clozeOrd - 1; // 0-indexed template ordinal

        this.db.prepare(`
          INSERT INTO anki_cards (
            id, user_id, note_id, deck_id, template_ord, queue, card_type, due,
            interval_days, ease_factor, reps, lapses, difficulty, stability,
            flags, is_marked, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 2.5, 0, 0, 0.0, 0.0, 0, 0, ?, ?)
        `).run(cardId, userId, noteId, deck.id, templateOrd, now, now);

        generatedCards.push(this.getCard(userId, cardId)!);
      }
    } else {
      // Standard note: generates 1 card per template in the notetype
      for (let i = 0; i < notetype.templates.length; i++) {
        // If Basic (optional reversed), check if Back field has content
        if (i === 1 && notetype.templates.length === 2 && notetype.name.includes('optional')) {
          const backContent = data.fields[1] || '';
          if (!backContent.trim()) continue;
        }

        const cardId = crypto.randomUUID();
        this.db.prepare(`
          INSERT INTO anki_cards (
            id, user_id, note_id, deck_id, template_ord, queue, card_type, due,
            interval_days, ease_factor, reps, lapses, difficulty, stability,
            flags, is_marked, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 2.5, 0, 0, 0.0, 0.0, 0, 0, ?, ?)
        `).run(cardId, userId, noteId, deck.id, i, now, now);

        generatedCards.push(this.getCard(userId, cardId)!);
      }
    }

    const note = this.getNote(userId, noteId)!;
    return { note, cards: generatedCards };
  }

  public getNote(userId: string, noteId: string): AnkiNote | null {
    const row = this.db.prepare(`
      SELECT * FROM anki_notes WHERE user_id = ? AND id = ?
    `).get(userId, noteId) as any;

    if (!row) return null;

    let fields: string[] = [];
    try { fields = JSON.parse(row.fields_json); } catch {}

    const tags = typeof row.tags === 'string' ? row.tags.trim().split(/\s+/).filter(Boolean) : [];

    return {
      id: row.id,
      userId: row.user_id,
      notetypeId: row.notetype_id,
      guid: row.guid,
      fields,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async updateNote(userId: string, noteId: string, fields: string[], tags?: string[]): Promise<AnkiNote | null> {
    const existing = this.getNote(userId, noteId);
    if (!existing) return null;

    const oldMedia = AnkiRepository.extractMediaFilenames(existing.fields);
    const newMedia = AnkiRepository.extractMediaFilenames(fields);
    const removedMedia = oldMedia.filter(m => !newMedia.includes(m));

    const now = new Date().toISOString();
    const tagsStr = Array.isArray(tags) ? tags.filter(Boolean).join(' ') : existing.tags.join(' ');

    this.db.prepare(`
      UPDATE anki_notes
      SET fields_json = ?, tags = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(JSON.stringify(fields), tagsStr, now, userId, noteId);

    if (removedMedia.length > 0) {
      try {
        await this.cleanupUnreferencedMedia(userId, removedMedia);
      } catch (err) {
        console.error('[AnkiRepository] Falha ao limpar mídias órfãs após updateNote:', err);
      }
    }

    return this.getNote(userId, noteId);
  }

  public getCard(userId: string, cardId: string): AnkiCard | null {
    const row = this.db.prepare(`
      SELECT c.*, n.fields_json, n.tags, n.notetype_id, d.name as deck_name
      FROM anki_cards c
      JOIN anki_notes n ON n.id = c.note_id AND n.user_id = c.user_id
      JOIN anki_decks d ON d.id = c.deck_id AND d.user_id = c.user_id
      WHERE c.user_id = ? AND c.id = ?
    `).get(userId, cardId) as any;

    if (!row) return null;

    return this.mapCard(row);
  }

  public getCardsByDeckIds(userId: string, deckIds: string[]): AnkiCard[] {
    if (!deckIds || deckIds.length === 0) return [];
    const placeholders = deckIds.map(() => '?').join(', ');
    const rows = this.db.prepare(`
      SELECT c.*, n.fields_json, n.tags, n.notetype_id, d.name as deck_name
      FROM anki_cards c
      JOIN anki_notes n ON n.id = c.note_id AND n.user_id = c.user_id
      JOIN anki_decks d ON d.id = c.deck_id AND d.user_id = c.user_id
      WHERE c.user_id = ? AND c.deck_id IN (${placeholders})
      ORDER BY c.created_at ASC
    `).all(userId, ...deckIds) as any[];

    return rows.map(r => this.mapCard(r));
  }

  private mapCard(row: any): AnkiCard {
    let fields: string[] = [];
    try { fields = JSON.parse(row.fields_json); } catch {}

    const tags = typeof row.tags === 'string' ? row.tags.trim().split(/\s+/).filter(Boolean) : [];

    return {
      id: row.id,
      userId: row.user_id,
      noteId: row.note_id,
      deckId: row.deck_id,
      templateOrd: row.template_ord,
      queue: row.queue as CardQueue,
      cardType: row.card_type as CardType,
      due: row.due,
      intervalDays: row.interval_days,
      easeFactor: row.ease_factor,
      reps: row.reps,
      lapses: row.lapses,
      difficulty: row.difficulty,
      stability: row.stability,
      lastReviewAt: row.last_review_at,
      flags: row.flags as CardFlag,
      isMarked: Boolean(row.is_marked),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      note: {
        id: row.note_id,
        userId: row.user_id,
        notetypeId: row.notetype_id,
        guid: '',
        fields,
        tags,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      deck: {
        id: row.deck_id,
        userId: row.user_id,
        name: row.deck_name || '',
        isCollapsed: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  // =========================================================================
  // 5. REVIEW, STUDY QUEUE & ATOMIC SCHEDULING
  // =========================================================================

  public getStudyQueue(userId: string, deckId?: string, limit: number = 50): AnkiCard[] {
    const todayEpochDays = Math.floor(Date.now() / 86400000);
    const nowSeconds = Math.floor(Date.now() / 1000);

    let query = `
      SELECT c.*, n.fields_json, n.tags, n.notetype_id, d.name as deck_name
      FROM anki_cards c
      JOIN anki_notes n ON n.id = c.note_id AND n.user_id = c.user_id
      JOIN anki_decks d ON d.id = c.deck_id AND d.user_id = c.user_id
      WHERE c.user_id = ?
        AND c.queue >= 0
        AND (
          ((c.queue = 1 OR c.queue = 3) AND c.due <= ?) -- Learning/Relearning cards due right now
          OR (c.queue = 2 AND c.due <= ?)              -- Review cards due today
          OR (c.queue = 0)                              -- New cards
        )
    `;
    const params: any[] = [userId, nowSeconds, todayEpochDays];

    if (deckId) {
      let targetDeckName: string | null = null;
      let targetIds: string[] = [deckId];

      if (deckId.startsWith('virtual_')) {
        targetDeckName = deckId.replace(/^virtual_/, '');
      } else {
        const d = this.getDeck(userId, deckId);
        if (d) {
          targetDeckName = d.name;
          targetIds = this.getDescendantDeckIds(userId, deckId);
        }
      }

      const idPlaceholders = targetIds.map(() => '?').join(', ');
      if (targetDeckName) {
        const escapedLike = targetDeckName.replace(/[%_\\]/g, '\\$&');
        query += ` AND (c.deck_id IN (${idPlaceholders}) OR d.name = ? OR d.name LIKE ? ESCAPE '\\')`;
        params.push(...targetIds, targetDeckName, `${escapedLike}::%`);
      } else {
        query += ` AND c.deck_id IN (${idPlaceholders})`;
        params.push(...targetIds);
      }
    }

    // Prioritize learning cards, then reviews, then new cards
    query += ` ORDER BY CASE WHEN c.queue IN (1, 3) THEN 0 WHEN c.queue = 2 THEN 1 ELSE 2 END ASC, c.due ASC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => this.mapCard(r));
  }

  public rateCard(
    userId: string,
    cardId: string,
    rating: Rating,
    elapsedTimeMs: number = 0
  ): { updatedCard: AnkiCard; revlog: AnkiRevlog } {
    const card = this.getCard(userId, cardId);
    if (!card) throw new Error('CARD_NOT_FOUND');

    // Get deck config
    const deck = this.getDeck(userId, card.deckId);
    let config = DEFAULT_DECK_CONFIG;

    if (deck?.configId) {
      const cfgRow = this.db.prepare(`SELECT config_json FROM anki_deck_configs WHERE user_id = ? AND id = ?`).get(userId, deck.configId) as any;
      if (cfgRow) {
        try { config = JSON.parse(cfgRow.config_json); } catch {}
      }
    }

    const scheduler = new AnkiScheduler(config);
    const now = new Date();
    const { updatedCard, revlog } = scheduler.rateCard(card, rating, now, elapsedTimeMs);
    const revlogId = crypto.randomUUID();

    // Persist card and revlog
    this.db.prepare(`
      UPDATE anki_cards
      SET queue = ?, card_type = ?, due = ?, interval_days = ?, ease_factor = ?,
          reps = ?, lapses = ?, difficulty = ?, stability = ?, last_review_at = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(
      updatedCard.queue,
      updatedCard.cardType,
      updatedCard.due,
      updatedCard.intervalDays,
      updatedCard.easeFactor,
      updatedCard.reps,
      updatedCard.lapses,
      updatedCard.difficulty,
      updatedCard.stability,
      updatedCard.lastReviewAt,
      updatedCard.updatedAt,
      userId,
      cardId
    );

    this.db.prepare(`
      INSERT INTO anki_revlog (
        id, user_id, card_id, rating, reviewed_at, elapsed_time_ms,
        previous_interval, new_interval, previous_state, review_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revlogId,
      userId,
      cardId,
      revlog.rating,
      revlog.reviewedAt,
      revlog.elapsedTimeMs,
      revlog.previousInterval,
      revlog.newInterval,
      JSON.stringify(revlog.previousState),
      revlog.reviewType
    );

    return {
      updatedCard,
      revlog: { ...revlog, id: revlogId },
    };
  }

  public undoLastReview(userId: string, cardId?: string): { revertedCard: AnkiCard } | null {
    let revlogRow: any;
    if (cardId) {
      revlogRow = this.db.prepare(`
        SELECT * FROM anki_revlog WHERE user_id = ? AND card_id = ? ORDER BY reviewed_at DESC LIMIT 1
      `).get(userId, cardId);
    } else {
      revlogRow = this.db.prepare(`
        SELECT * FROM anki_revlog WHERE user_id = ? ORDER BY reviewed_at DESC LIMIT 1
      `).get(userId);
    }

    if (!revlogRow) return null;

    const previousState: AnkiCardStateSnapshot = JSON.parse(revlogRow.previous_state);
    const targetCardId = revlogRow.card_id;
    const now = new Date().toISOString();

    // Revert card to exact snapshot
    this.db.prepare(`
      UPDATE anki_cards
      SET queue = ?, card_type = ?, due = ?, interval_days = ?, ease_factor = ?,
          reps = ?, lapses = ?, difficulty = ?, stability = ?, last_review_at = ?, updated_at = ?
      WHERE user_id = ? AND id = ?
    `).run(
      previousState.queue,
      previousState.cardType,
      previousState.due,
      previousState.intervalDays,
      previousState.easeFactor,
      previousState.reps,
      previousState.lapses,
      previousState.difficulty,
      previousState.stability,
      previousState.lastReviewAt,
      now,
      userId,
      targetCardId
    );

    // Remove the revlog record
    this.db.prepare(`DELETE FROM anki_revlog WHERE user_id = ? AND id = ?`).run(userId, revlogRow.id);

    return {
      revertedCard: this.getCard(userId, targetCardId)!,
    };
  }

  // =========================================================================
  // 6. CARD ACTIONS: BURY, SUSPEND, FLAG, MARK
  // =========================================================================

  public buryCard(userId: string, cardId: string): AnkiCard | null {
    const card = this.getCard(userId, cardId);
    if (!card) return null;

    this.db.prepare(`
      UPDATE anki_cards SET queue = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `).run(CardQueue.UserBuried, new Date().toISOString(), userId, cardId);

    return this.getCard(userId, cardId);
  }

  public unburyCards(userId: string, deckId?: string): number {
    let sql = `
      UPDATE anki_cards 
      SET queue = CASE WHEN reps > 0 THEN 2 ELSE 0 END, updated_at = ?
      WHERE user_id = ? AND (queue = ? OR queue = ?)
    `;
    const params: any[] = [new Date().toISOString(), userId, CardQueue.UserBuried, CardQueue.SchedBuried];

    if (deckId) {
      sql += ` AND deck_id = ?`;
      params.push(deckId);
    }

    const res = this.db.prepare(sql).run(...params) as any;
    return res.changes || 0;
  }

  public suspendCard(userId: string, cardId: string, suspend: boolean): AnkiCard | null {
    const card = this.getCard(userId, cardId);
    if (!card) return null;

    const newQueue = suspend ? CardQueue.Suspended : (card.reps > 0 ? CardQueue.Review : CardQueue.New);
    this.db.prepare(`
      UPDATE anki_cards SET queue = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `).run(newQueue, new Date().toISOString(), userId, cardId);

    return this.getCard(userId, cardId);
  }

  public setCardFlag(userId: string, cardId: string, flag: CardFlag): AnkiCard | null {
    this.db.prepare(`
      UPDATE anki_cards SET flags = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `).run(flag, new Date().toISOString(), userId, cardId);

    return this.getCard(userId, cardId);
  }

  public setCardMarked(userId: string, cardId: string, marked: boolean): AnkiCard | null {
    this.db.prepare(`
      UPDATE anki_cards SET is_marked = ?, updated_at = ? WHERE user_id = ? AND id = ?
    `).run(marked ? 1 : 0, new Date().toISOString(), userId, cardId);

    return this.getCard(userId, cardId);
  }

  // =========================================================================
  // 7. BROWSER, SEARCH & BULK ACTIONS
  // =========================================================================

  public listBrowserCards(userId: string, queryStr: string = '', limit: number = 100, offset: number = 0): { cards: AnkiCard[]; total: number } {
    const tokens = AnkiSearch.parseQuery(queryStr);

    const rows = this.db.prepare(`
      SELECT c.*, n.fields_json, n.tags, n.notetype_id, d.name as deck_name
      FROM anki_cards c
      JOIN anki_notes n ON n.id = c.note_id AND n.user_id = c.user_id
      JOIN anki_decks d ON d.id = c.deck_id AND d.user_id = c.user_id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `).all(userId) as any[];

    const allCards = rows.map(r => this.mapCard(r));
    const filtered = allCards.filter(card => {
      const noteFields = card.note?.fields || [];
      const noteTags = card.note?.tags || [];
      const deckName = card.deck?.name || '';
      return AnkiSearch.matchesCard(card, tokens, deckName, noteFields, noteTags);
    });

    const paginated = filtered.slice(offset, offset + limit);
    return {
      cards: paginated,
      total: filtered.length,
    };
  }

  public bulkMoveCards(userId: string, cardIds: string[], targetDeckId: string): number {
    const deck = this.getDeck(userId, targetDeckId);
    if (!deck) throw new Error('TARGET_DECK_NOT_FOUND');

    let moved = 0;
    for (const cid of cardIds) {
      const res = this.db.prepare(`
        UPDATE anki_cards SET deck_id = ?, updated_at = ? WHERE user_id = ? AND id = ?
      `).run(targetDeckId, new Date().toISOString(), userId, cid) as any;
      if (res.changes) moved += 1;
    }
    return moved;
  }

  public transferDeckCards(userId: string, sourceDeckId: string, targetDeckId: string): number {
    if (sourceDeckId === targetDeckId) throw new Error('SAME_DECK_TRANSFER');
    if (!this.getDeck(userId, sourceDeckId) || !this.getDeck(userId, targetDeckId)) {
      throw new Error('DECK_NOT_FOUND');
    }

    const result = this.db.prepare(`
      UPDATE anki_cards
      SET deck_id = ?, updated_at = ?
      WHERE user_id = ? AND deck_id = ?
    `).run(targetDeckId, new Date().toISOString(), userId, sourceDeckId) as any;

    return Number(result.changes || 0);
  }

  public bulkSuspendCards(userId: string, cardIds: string[], suspend: boolean): number {
    let affected = 0;
    for (const cid of cardIds) {
      const card = this.getCard(userId, cid);
      if (card) {
        const newQueue = suspend ? CardQueue.Suspended : (card.reps > 0 ? CardQueue.Review : CardQueue.New);
        const res = this.db.prepare(`
          UPDATE anki_cards SET queue = ?, updated_at = ? WHERE user_id = ? AND id = ?
        `).run(newQueue, new Date().toISOString(), userId, cid) as any;
        if (res.changes) affected += 1;
      }
    }
    return affected;
  }

  public bulkDeleteCards(userId: string, cardIds: string[]): number {
    let deleted = 0;
    for (const cid of cardIds) {
      const res = this.db.prepare(`DELETE FROM anki_cards WHERE user_id = ? AND id = ?`).run(userId, cid) as any;
      if (res.changes) deleted += 1;
    }
    if (deleted > 0) {
      const orphanNotes = this.db.prepare(`
        SELECT fields_json FROM anki_notes
        WHERE user_id = ? AND id NOT IN (SELECT DISTINCT note_id FROM anki_cards WHERE user_id = ?)
      `).all(userId, userId) as any[];

      const orphanMedia: string[] = [];
      for (const note of orphanNotes) {
        try {
          const fields = JSON.parse(note.fields_json || '[]');
          orphanMedia.push(...AnkiRepository.extractMediaFilenames(fields));
        } catch {}
      }

      this.db.prepare(`
        DELETE FROM anki_notes
        WHERE user_id = ? AND id NOT IN (SELECT DISTINCT note_id FROM anki_cards WHERE user_id = ?)
      `).run(userId, userId);

      if (orphanMedia.length > 0) {
        void this.cleanupUnreferencedMedia(userId, orphanMedia);
      }
    }
    return deleted;
  }

  // =========================================================================
  // 8. STATISTICS & HEATMAP
  // =========================================================================

  public getStatsSummary(userId: string, deckId?: string): AnkiStatsSummary {
    const todayEpochDays = Math.floor(Date.now() / 86400000);
    const todayIso = new Date().toISOString().split('T')[0];

    let cardWhere = `WHERE user_id = ?`;
    const cardParams: any[] = [userId];
    if (deckId) {
      cardWhere += ` AND deck_id = ?`;
      cardParams.push(deckId);
    }

    const cards = this.db.prepare(`SELECT * FROM anki_cards ${cardWhere}`).all(...cardParams) as any[];

    let totalCards = cards.length;
    let newCards = 0;
    let learnCards = 0;
    let reviewCards = 0;
    let relearnCards = 0;
    let suspendedCards = 0;
    let buriedCards = 0;
    let matureCards = 0;
    let youngCards = 0;

    const futureMap = new Map<number, number>();

    for (const c of cards) {
      if (c.queue === CardQueue.Suspended) suspendedCards++;
      else if (c.queue === CardQueue.UserBuried || c.queue === CardQueue.SchedBuried) buriedCards++;
      else if (c.queue === CardQueue.New) newCards++;
      else if (c.queue === CardQueue.Learn) learnCards++;
      else if (c.queue === CardQueue.Relearn) relearnCards++;
      else if (c.queue === CardQueue.Review) {
        reviewCards++;
        if (c.interval_days >= 21) matureCards++;
        else youngCards++;

        // Workload projection for next 30 days
        const offset = c.due - todayEpochDays;
        if (offset >= 0 && offset <= 30) {
          futureMap.set(offset, (futureMap.get(offset) || 0) + 1);
        }
      }
    }

    // Revlog statistics (today and ratings breakdown)
    const revlogs = this.db.prepare(`
      SELECT * FROM anki_revlog WHERE user_id = ?
    `).all(userId) as any[];

    let reviewsToday = 0;
    let timeSpentTodayMs = 0;
    let againCount = 0;
    let hardCount = 0;
    let goodCount = 0;
    let easyCount = 0;

    const dateHeatmap = new Map<string, number>();

    for (const rl of revlogs) {
      const dateStr = rl.reviewed_at.split('T')[0];
      dateHeatmap.set(dateStr, (dateHeatmap.get(dateStr) || 0) + 1);

      if (dateStr === todayIso) {
        reviewsToday++;
        timeSpentTodayMs += rl.elapsed_time_ms || 0;
      }

      if (rl.rating === 1) againCount++;
      else if (rl.rating === 2) hardCount++;
      else if (rl.rating === 3) goodCount++;
      else if (rl.rating === 4) easyCount++;
    }

    const totalRated = againCount + hardCount + goodCount + easyCount;
    const againPercent = totalRated > 0 ? Math.round((againCount / totalRated) * 100) : 0;
    const hardPercent = totalRated > 0 ? Math.round((hardCount / totalRated) * 100) : 0;
    const goodPercent = totalRated > 0 ? Math.round((goodCount / totalRated) * 100) : 0;
    const easyPercent = totalRated > 0 ? Math.round((easyCount / totalRated) * 100) : 0;
    const retentionRatePercent = totalRated > 0 ? Math.round(((goodCount + easyCount) / totalRated) * 100) : 100;

    const futureWorkload: Array<{ dayOffset: number; date: string; dueCount: number }> = [];
    for (let i = 0; i <= 30; i++) {
      const targetDate = new Date(Date.now() + i * 86400000).toISOString().split('T')[0];
      futureWorkload.push({
        dayOffset: i,
        date: targetDate,
        dueCount: futureMap.get(i) || 0,
      });
    }

    const studyHeatmap: Array<{ date: string; count: number }> = [];
    dateHeatmap.forEach((count, date) => {
      studyHeatmap.push({ date, count });
    });
    studyHeatmap.sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalCards,
      newCards,
      learnCards,
      reviewCards,
      relearnCards,
      suspendedCards,
      buriedCards,
      matureCards,
      youngCards,
      reviewsToday,
      timeSpentTodayMinutes: Math.round(timeSpentTodayMs / 60000),
      retentionRatePercent,
      againPercent,
      hardPercent,
      goodPercent,
      easyPercent,
      futureWorkload,
      intervalDistribution: [
        { intervalRange: '1-7d', count: cards.filter(c => c.interval_days >= 1 && c.interval_days <= 7).length },
        { intervalRange: '8-21d', count: cards.filter(c => c.interval_days > 7 && c.interval_days <= 21).length },
        { intervalRange: '22-60d', count: cards.filter(c => c.interval_days > 21 && c.interval_days <= 60).length },
        { intervalRange: '60d+', count: cards.filter(c => c.interval_days > 60).length },
      ],
      studyHeatmap,
    };
  }

  // =========================================================================
  // 9. MEDIA ASSETS
  // =========================================================================

  public async saveMedia(userId: string, filename: string, buffer: Buffer, mimeType: string): Promise<AnkiMedia> {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    let extension = 'png';
    if (mimeType === 'image/jpeg') extension = 'jpg';
    else if (mimeType === 'image/webp') extension = 'webp';
    else if (mimeType === 'image/gif') extension = 'gif';
    else {
      const ext = path.extname(safeFilename).replace(/^\./, '').toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        extension = ext === 'jpeg' ? 'jpg' : ext;
      }
    }

    const existing = this.db.prepare(`
      SELECT * FROM anki_media WHERE user_id = ? AND filename = ?
    `).get(userId, safeFilename) as any;

    const id = existing ? existing.id : crypto.randomUUID();
    const now = new Date().toISOString();

    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectKey = existing?.storage_path && existing.storage_path.startsWith('anki-media/')
      ? existing.storage_path
      : `anki-media/${sanitizedUserId}/${id}.${extension}`;

    let storedRemotely = false;
    try {
      storedRemotely = await putAnkiMedia(objectKey, buffer, mimeType);
    } catch (err: any) {
      console.error(`[AnkiRepository] Falha ao enviar mídia para o Cloudflare R2 (${objectKey}):`, err?.message || err);
      if (process.env.NODE_ENV === 'production' || persistentMediaStorageConfigured()) {
        throw err;
      }
    }

    if (!storedRemotely && process.env.NODE_ENV === 'production') {
      throw new MediaStorageNotConfiguredError();
    }

    // O banco de dados armazena a chave persistente do objeto no R2.
    // O fallback para disco local só é aceito em ambiente de teste/offline isolado quando o R2 não estiver configurado.
    let storagePath = objectKey;
    if (!storedRemotely && !persistentMediaStorageConfigured()) {
      const mediaDir = path.join(process.cwd(), 'data', 'anki_media', sanitizedUserId);
      fs.mkdirSync(mediaDir, { recursive: true });
      storagePath = path.join(mediaDir, `${hash}_${safeFilename}`);
      fs.writeFileSync(storagePath, buffer);
    }

    if (existing) {
      this.db.prepare(`
        UPDATE anki_media SET hash = ?, mime_type = ?, file_size = ?, storage_path = ? WHERE id = ?
      `).run(hash, mimeType, buffer.length, storagePath, id);
    } else {
      this.db.prepare(`
        INSERT INTO anki_media (id, user_id, filename, hash, mime_type, file_size, storage_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, safeFilename, hash, mimeType, buffer.length, storagePath, now);
    }

    return {
      id,
      userId,
      filename: safeFilename,
      hash,
      mimeType,
      fileSize: buffer.length,
      storagePath,
      createdAt: now,
    };
  }

  public async getMedia(userId: string, filename: string): Promise<{ media: AnkiMedia; buffer: Buffer } | null> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const row = this.db.prepare(`
      SELECT * FROM anki_media WHERE user_id = ? AND filename = ?
    `).get(userId, safeFilename) as any;

    if (!row) return null;
    if (!row.storage_path.startsWith('anki-media/') && process.env.NODE_ENV === 'production' && !persistentMediaStorageConfigured()) {
      throw new MediaStorageNotConfiguredError();
    }

    let buffer: Buffer | null = null;
    let detectedMime = row.mime_type;

    if (row.storage_path.startsWith('anki-media/')) {
      try {
        const res = await getAnkiMedia(row.storage_path);
        if (res) {
          buffer = res.buffer;
          if (res.contentType) detectedMime = res.contentType;
        } else {
          console.warn(`[AnkiRepository] Objeto R2 ausente para ${row.storage_path}`);
        }
      } catch (err: any) {
        console.error(`[AnkiRepository] Erro ao obter mídia do Cloudflare R2 (${row.storage_path}):`, err?.message || err);
        throw err;
      }
    } else if (fs.existsSync(row.storage_path)) {
      // Migração de mídia legada em disco para o R2 no primeiro acesso
      try {
        buffer = fs.readFileSync(row.storage_path);
        if (persistentMediaStorageConfigured()) {
          const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
          const ext = path.extname(row.filename).replace(/^\./, '').toLowerCase() || 'png';
          const objectKey = `anki-media/${sanitizedUserId}/${row.id}.${ext}`;
          const uploaded = await putAnkiMedia(objectKey, buffer, row.mime_type);
          if (uploaded) {
            this.db.prepare('UPDATE anki_media SET storage_path = ? WHERE id = ? AND user_id = ?')
              .run(objectKey, row.id, userId);
            row.storage_path = objectKey;
          }
        }
      } catch (fsErr: any) {
        console.warn(`[AnkiRepository] Falha ao ler mídia legada em disco (${row.storage_path}):`, fsErr?.message);
      }
    }

    if (!buffer && row.storage_path.startsWith('anki-media/') && process.env.NODE_ENV === 'production' && !persistentMediaStorageConfigured()) {
      throw new MediaStorageNotConfiguredError();
    }

    if (!buffer) return null;

    return {
      media: {
        id: row.id,
        userId: row.user_id,
        filename: row.filename,
        hash: row.hash,
        mimeType: detectedMime,
        fileSize: row.file_size,
        storagePath: row.storage_path,
        createdAt: row.created_at,
      },
      buffer,
    };
  }

  public async deleteMedia(userId: string, filename: string): Promise<boolean> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const row = this.db.prepare(`
      SELECT * FROM anki_media WHERE user_id = ? AND filename = ?
    `).get(userId, safeFilename) as any;

    if (!row) return false;

    if (row.storage_path.startsWith('anki-media/')) {
      try {
        await deleteAnkiMedia(row.storage_path);
      } catch (err: any) {
        console.error(`[AnkiRepository] Falha ao deletar objeto no R2 (${row.storage_path}):`, err?.message || err);
      }
    } else if (fs.existsSync(row.storage_path)) {
      try {
        fs.unlinkSync(row.storage_path);
      } catch {}
    }

    this.db.prepare(`DELETE FROM anki_media WHERE id = ? AND user_id = ?`).run(row.id, userId);
    return true;
  }

  public async cleanupUnreferencedMedia(userId: string, candidateFilenames: string[]): Promise<string[]> {
    if (!candidateFilenames || candidateFilenames.length === 0) return [];
    const cleaned: string[] = [];

    for (const filename of candidateFilenames) {
      if (!filename || typeof filename !== 'string') continue;
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      const refCheck = this.db.prepare(`
        SELECT COUNT(*) as count FROM anki_notes
        WHERE user_id = ? AND fields_json LIKE ?
      `).get(userId, `%${safeFilename}%`) as any;

      if (!refCheck || refCheck.count === 0) {
        const deleted = await this.deleteMedia(userId, safeFilename);
        if (deleted) cleaned.push(safeFilename);
      }
    }

    return cleaned;
  }

  public static extractMediaFilenames(fields: string[]): string[] {
    const filenames: string[] = [];
    if (!Array.isArray(fields)) return filenames;
    const mediaRegex = /(?:\/api\/anki\/media\/|src=["'](?:(?:\/api\/anki\/media\/)?))([a-zA-Z0-9._-]+)(?:["']|\b)/gi;
    for (const field of fields) {
      if (!field || typeof field !== 'string') continue;
      for (const match of field.matchAll(mediaRegex)) {
        if (match[1]) filenames.push(match[1]);
      }
    }
    return [...new Set(filenames)];
  }

  /**
   * Migrates legacy flashcards, decks, and reviews to the new Anki schema.
   */
  public static migrateLegacyData(db: DatabaseSync): { decksMigrated: number; cardsMigrated: number } {
    let decksMigrated = 0;
    let cardsMigrated = 0;

    try {
      // Check if legacy tables exist
      const checkTables = db.prepare(`
        SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('flashcard_decks', 'flashcards')
      `).get() as any;

      if (!checkTables || checkTables.cnt < 2) return { decksMigrated, cardsMigrated };

      const legacyDecks = db.prepare(`
        SELECT d.*, s.name as subject_name
        FROM flashcard_decks d
        JOIN flashcard_subjects s ON s.id = d.subject_id AND s.user_id = d.user_id
      `).all() as any[];

      const ankiRepo = new AnkiRepository(db);

      for (const ld of legacyDecks) {
        ankiRepo.ensureDefaultDeckConfig(ld.user_id);
        const notetypes = ankiRepo.ensureDefaultNoteTypes(ld.user_id);
        const basicNt = notetypes.find(n => n.name === 'Basic') || notetypes[0];

        const deckFullName = `${ld.subject_name}::${ld.name}`;

        let targetDeck = db.prepare(`
          SELECT * FROM anki_decks WHERE user_id = ? AND (id = ? OR name = ?)
        `).get(ld.user_id, ld.id, deckFullName) as any;

        if (!targetDeck) {
          db.prepare(`
            INSERT INTO anki_decks (id, user_id, name, description, config_id, is_collapsed, created_at, updated_at)
            VALUES (?, ?, ?, ?, NULL, 0, ?, ?)
          `).run(ld.id, ld.user_id, deckFullName, ld.description || null, ld.created_at, ld.updated_at);
          decksMigrated++;
        }

        // Migrate cards
        const legacyCards = db.prepare(`
          SELECT * FROM flashcards WHERE user_id = ? AND deck_id = ?
        `).all(ld.user_id, ld.id) as any[];

        for (const lc of legacyCards) {
          const cardExists = db.prepare(`SELECT id FROM anki_cards WHERE user_id = ? AND id = ?`).get(lc.user_id, lc.id);
          if (!cardExists) {
            const noteId = crypto.randomUUID();
            const now = lc.created_at || new Date().toISOString();

            db.prepare(`
              INSERT INTO anki_notes (id, user_id, notetype_id, guid, fields_json, tags, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '', ?, ?)
            `).run(noteId, lc.user_id, basicNt.id, crypto.randomUUID(), JSON.stringify([lc.front, lc.back]), now, lc.updated_at || now);

            let queue = CardQueue.New;
            let cardType = CardType.New;
            if (lc.status === 'learning') {
              queue = CardQueue.Learn;
              cardType = CardType.Learn;
            } else if (lc.status === 'review' || lc.status === 'mastered') {
              queue = CardQueue.Review;
              cardType = CardType.Review;
            }

            const dueDays = lc.next_review_at ? Math.floor(new Date(lc.next_review_at).getTime() / 86400000) : 0;

            db.prepare(`
              INSERT INTO anki_cards (
                id, user_id, note_id, deck_id, template_ord, queue, card_type, due,
                interval_days, ease_factor, reps, lapses, difficulty, stability,
                flags, is_marked, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0, 0, ?, ?)
            `).run(
              lc.id,
              lc.user_id,
              noteId,
              ld.id,
              queue,
              cardType,
              dueDays,
              lc.interval_days || 0,
              lc.ease_factor || 2.5,
              lc.review_count || 0,
              lc.lapses || 0,
              now,
              lc.updated_at || now
            );
            cardsMigrated++;
          }
        }
      }
    } catch (err) {
      console.warn('[AnkiRepository] Legacy migration notice:', err);
    }

    return { decksMigrated, cardsMigrated };
  }
}
