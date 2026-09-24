/**
 * CFO CBMERJ - Real Anki API Router
 * 
 * Endpoints for:
 * - Hierarchical Decks (Decks, Subdecks ::)
 * - NoteTypes, Fields, and Card Templates
 * - Notes & Cards Generation (Basic, Cloze, Reversed)
 * - Real FSRS / Anki v3 Scheduler (Again, Hard, Good, Easy)
 * - Review Player with dynamic intervals and instant Undo (Ctrl+Z)
 * - Browser with Anki Search Syntax
 * - APKG Import & Export (Interoperable with Anki Desktop)
 * - Multi-tenant media storage & Statistics
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AnkiRepository } from '../db/ankiRepository';
import { AnkiRenderer } from '../services/anki/ankiRenderer';
import { AnkiScheduler } from '../services/anki/ankiScheduler';
import { AnkiApkgService } from '../services/anki/ankiApkgService';
import { CardFlag, Rating } from '../services/anki/ankiTypes';
import { getDb } from '../db/database';
import { validateImageBuffer } from '../services/avatarService';
import { MediaStorageNotConfiguredError } from '../services/anki/ankiMediaStorage';

export function createAnkiRouter(requireAuthMiddleware: any, repoFactory?: () => AnkiRepository): Router {
  const router = Router();

  const getRepo = repoFactory || (() => new AnkiRepository(getDb().getRawDb()));

  const deckMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120, // 120 deck mutations per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitas operações de baralho em pouco tempo. Aguarde alguns instantes.',
      });
    },
  });

  const noteMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 150, // 150 note creations/batches per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitas operações de criação de notas. Aguarde alguns instantes.',
      });
    },
  });

  const apkgImportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10, // 10 APKG imports per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Limite de importações .apkg atingido. Aguarde alguns minutos antes de tentar novamente.',
      });
    },
  });

  const mediaUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60, // 60 uploads por 15 min
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitos uploads de imagem para flashcards em pouco tempo. Aguarde alguns instantes.',
      });
    },
  });

  // =========================================================================
  // 1. DECKS
  // =========================================================================

  // List all decks with counts and tree hierarchy
  router.get('/decks', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      repo.ensureDefaultDeckConfig(user.userId);
      repo.ensureDefaultNoteTypes(user.userId);

      const decks = repo.listDecks(user.userId);
      return res.json({ success: true, decks });
    } catch (err: any) {
      return res.status(500).json({ error: 'LIST_DECKS_FAILED', message: err.message });
    }
  });

  // Create deck (root or subdeck with parentDeckId)
  router.post('/decks', requireAuthMiddleware, deckMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { name, description, configId, parentDeckId } = req.body || {};

      const repo = getRepo();
      const deck = repo.createDeck(user.userId, {
        name,
        description,
        configId,
        parentDeckId,
      });

      return res.status(201).json({ success: true, deck });
    } catch (err: any) {
      if (
        err.code === 'MAX_DECKS_EXCEEDED' ||
        err.code === 'MAX_DEPTH_EXCEEDED' ||
        err.code === 'INVALID_NAME' ||
        err.code === 'NAME_TOO_LONG' ||
        err.code === 'INVALID_PAYLOAD'
      ) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      if (err.code === 'PARENT_DECK_NOT_FOUND') {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'CREATE_DECK_FAILED', message: err.message });
    }
  });

  // Update deck (rename, move between parents, move to root, toggle collapsed)
  router.patch('/decks/:id', requireAuthMiddleware, deckMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { name, description, configId, isCollapsed, parentDeckId } = req.body || {};
      const repo = getRepo();

      const updated = repo.updateDeck(user.userId, req.params.id, {
        name,
        description,
        configId,
        isCollapsed,
        parentDeckId,
      });

      if (!updated) {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
      }

      return res.json({ success: true, deck: updated });
    } catch (err: any) {
      if (
        err.code === 'MAX_DEPTH_EXCEEDED' ||
        err.code === 'CYCLIC_RELATIONSHIP' ||
        err.code === 'INVALID_NAME' ||
        err.code === 'NAME_TOO_LONG' ||
        err.code === 'INVALID_PAYLOAD'
      ) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      if (err.code === 'PARENT_DECK_NOT_FOUND') {
        return res.status(404).json({ error: err.code, message: err.message });
      }
      return res.status(500).json({ error: 'UPDATE_DECK_FAILED', message: err.message });
    }
  });

  router.post('/decks/:id/transfer-cards', requireAuthMiddleware, noteMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { targetDeckId } = req.body || {};
      if (typeof targetDeckId !== 'string' || !targetDeckId.trim()) {
        return res.status(400).json({ error: 'TARGET_DECK_REQUIRED' });
      }

      const movedCount = getRepo().transferDeckCards(user.userId, req.params.id, targetDeckId);
      return res.json({ success: true, movedCount });
    } catch (err: any) {
      if (err.message === 'SAME_DECK_TRANSFER') return res.status(400).json({ error: 'SAME_DECK_TRANSFER' });
      if (err.message === 'DECK_NOT_FOUND') return res.status(404).json({ error: 'DECK_NOT_FOUND' });
      return res.status(500).json({ error: 'TRANSFER_CARDS_FAILED', message: err.message });
    }
  });

  // Delete deck
  router.delete('/decks/:id', requireAuthMiddleware, deckMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const deleted = repo.deleteDeck(user.userId, req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
      }

      return res.json({ success: true, message: 'Baralho excluído com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: 'DELETE_DECK_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 2. NOTE TYPES & DECK CONFIGS
  // =========================================================================

  router.get('/notetypes', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const notetypes = repo.ensureDefaultNoteTypes(user.userId);
      return res.json({ success: true, notetypes });
    } catch (err: any) {
      return res.status(500).json({ error: 'LIST_NOTETYPES_FAILED', message: err.message });
    }
  });

  router.get('/deck-configs', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const configId = req.query.configId ? String(req.query.configId) : undefined;
      const deckId = req.query.deckId ? String(req.query.deckId) : undefined;

      let targetConfigId = configId;
      if (!targetConfigId && deckId && !deckId.startsWith('virtual_')) {
        const deck = repo.getDeck(user.userId, deckId);
        if (deck?.configId) {
          targetConfigId = deck.configId;
        }
      }

      const config = repo.getDeckConfig(user.userId, targetConfigId);
      return res.json({ success: true, config });
    } catch (err: any) {
      return res.status(500).json({ error: 'GET_CONFIG_FAILED', message: err.message });
    }
  });

  router.put('/deck-configs/:id', requireAuthMiddleware, deckMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const configId = req.params.id;
      const { config, name, deckId } = req.body || {};

      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Opções de configuração inválidas.' });
      }

      const updated = repo.updateDeckConfig(user.userId, configId, config, name);

      // If deckId is provided and deck does not have configId set, attach it
      if (deckId && typeof deckId === 'string' && !deckId.startsWith('virtual_')) {
        const deck = repo.getDeck(user.userId, deckId);
        if (deck && !deck.configId) {
          repo.updateDeck(user.userId, deckId, { configId: updated.id });
        }
      }

      return res.json({ success: true, config: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'UPDATE_CONFIG_FAILED', message: err.message });
    }
  });

  router.patch('/deck-configs/:id', requireAuthMiddleware, deckMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const configId = req.params.id;
      const { config, name, deckId } = req.body || {};

      const updated = repo.updateDeckConfig(user.userId, configId, config || {}, name);

      if (deckId && typeof deckId === 'string' && !deckId.startsWith('virtual_')) {
        const deck = repo.getDeck(user.userId, deckId);
        if (deck && !deck.configId) {
          repo.updateDeck(user.userId, deckId, { configId: updated.id });
        }
      }

      return res.json({ success: true, config: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'UPDATE_CONFIG_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 3. NOTES & CARDS CREATION
  // =========================================================================

  router.post('/notes', requireAuthMiddleware, noteMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { deckId, notetypeId, fields, tags } = req.body || {};

      if (!deckId || !notetypeId || !Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({
          error: 'INVALID_PAYLOAD',
          message: 'deckId, notetypeId e array de campos (fields) são obrigatórios.',
        });
      }

      const repo = getRepo();
      const result = repo.createNote(user.userId, {
        deckId,
        notetypeId,
        fields: fields.map(f => String(f ?? '')),
        tags: Array.isArray(tags) ? tags : [],
      });

      return res.status(201).json({
        success: true,
        note: result.note,
        cardsCount: result.cards.length,
        cards: result.cards,
      });
    } catch (err: any) {
      if (err.message === 'DECK_NOT_FOUND') return res.status(404).json({ error: 'DECK_NOT_FOUND' });
      if (err.message === 'NOTETYPE_NOT_FOUND') return res.status(404).json({ error: 'NOTETYPE_NOT_FOUND' });
      return res.status(500).json({ error: 'CREATE_NOTE_FAILED', message: err.message });
    }
  });

  router.post('/notes/batch', requireAuthMiddleware, noteMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { deckId, notetypeId, notes } = req.body || {};

      if (!deckId || !Array.isArray(notes) || notes.length === 0) {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'deckId e lista de notas são obrigatórios.' });
      }

      if (notes.length > 200) {
        return res.status(400).json({
          error: 'BATCH_TOO_LARGE',
          message: 'O lote de notas não pode ultrapassar 200 itens por requisição.',
        });
      }

      const repo = getRepo();
      const existingNts = repo.ensureDefaultNoteTypes(user.userId);
      const targetNtId = notetypeId || existingNts[0].id;

      let createdNotes = 0;
      let createdCards = 0;

      for (const item of notes) {
        const fields = Array.isArray(item.fields) ? item.fields : [String(item.front || item.question || ''), String(item.back || item.answer || '')];
        if (!fields[0]?.trim() && !fields[1]?.trim()) continue;

        const resItem = repo.createNote(user.userId, {
          deckId,
          notetypeId: targetNtId,
          fields,
          tags: Array.isArray(item.tags) ? item.tags : [],
        });
        createdNotes++;
        createdCards += resItem.cards.length;
      }

      return res.status(201).json({ success: true, createdNotes, createdCards });
    } catch (err: any) {
      return res.status(500).json({ error: 'BATCH_CREATE_FAILED', message: err.message });
    }
  });

  router.patch('/notes/:id', requireAuthMiddleware, noteMutationLimiter, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { fields, tags } = req.body || {};
      if (!Array.isArray(fields) || fields.length === 0) {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Array de campos (fields) é obrigatório.' });
      }
      const repo = getRepo();
      const updated = await repo.updateNote(user.userId, req.params.id, fields.map(f => String(f ?? '')), tags);
      if (!updated) {
        return res.status(404).json({ error: 'NOTE_NOT_FOUND' });
      }
      return res.json({ success: true, note: updated });
    } catch (err: any) {
      return res.status(500).json({ error: 'UPDATE_NOTE_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 4. STUDY QUEUE, RENDERING & REVIEW (FSRS Engine)
  // =========================================================================

  router.get('/study-queue', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const deckId = req.query.deckId ? String(req.query.deckId) : undefined;
      const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10))) : 50;

      const repo = getRepo();
      const cards = repo.getStudyQueue(user.userId, deckId, limit);

      return res.json({ success: true, queue: cards, count: cards.length });
    } catch (err: any) {
      return res.status(500).json({ error: 'GET_QUEUE_FAILED', message: err.message });
    }
  });

  // Get rendered card with preview intervals for Again, Hard, Good, Easy
  router.get('/cards/:id/render', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const card = repo.getCard(user.userId, req.params.id);

      if (!card || !card.note) {
        return res.status(404).json({ error: 'CARD_NOT_FOUND' });
      }

      const notetype = repo.getNoteType(user.userId, card.note.notetypeId);
      if (!notetype) {
        return res.status(404).json({ error: 'NOTETYPE_NOT_FOUND' });
      }

      const rendered = AnkiRenderer.renderCard(
        card.note,
        notetype,
        card.templateOrd,
        card.deck?.name || ''
      );

      // Compute dynamic preview intervals
      const scheduler = new AnkiScheduler();
      const intervals = scheduler.getPreviewIntervals(card);

      return res.json({
        success: true,
        card,
        rendered,
        intervals,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'RENDER_CARD_FAILED', message: err.message });
    }
  });

  // Rate card (Again=1, Hard=2, Good=3, Easy=4)
  router.post('/cards/:id/review', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { rating, elapsedTimeMs } = req.body || {};

      const numRating = Number(rating);
      if (![1, 2, 3, 4].includes(numRating)) {
        return res.status(400).json({
          error: 'INVALID_RATING',
          message: 'Rating deve ser 1 (Again), 2 (Hard), 3 (Good) ou 4 (Easy).',
        });
      }

      const repo = getRepo();
      const result = repo.rateCard(
        user.userId,
        req.params.id,
        numRating as Rating,
        typeof elapsedTimeMs === 'number' ? elapsedTimeMs : 0
      );

      return res.json({
        success: true,
        card: result.updatedCard,
        revlog: result.revlog,
      });
    } catch (err: any) {
      if (err.message === 'CARD_NOT_FOUND') return res.status(404).json({ error: 'CARD_NOT_FOUND' });
      return res.status(500).json({ error: 'RATE_CARD_FAILED', message: err.message });
    }
  });

  // Atomic Undo (Ctrl+Z)
  router.post('/undo', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { cardId } = req.body || {};
      const repo = getRepo();

      const result = repo.undoLastReview(user.userId, cardId);
      if (!result) {
        return res.status(404).json({ error: 'NO_REVIEW_TO_UNDO', message: 'Nenhuma revisão anterior para desfazer.' });
      }

      return res.json({
        success: true,
        message: 'Revisão desfeita com sucesso.',
        card: result.revertedCard,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'UNDO_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 5. CARD ACTIONS: BURY, SUSPEND, FLAG, MARK
  // =========================================================================

  router.post('/cards/:id/bury', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const card = repo.buryCard(user.userId, req.params.id);
      if (!card) return res.status(404).json({ error: 'CARD_NOT_FOUND' });

      return res.json({ success: true, message: 'Card enterrado (buried).', card });
    } catch (err: any) {
      return res.status(500).json({ error: 'BURY_FAILED', message: err.message });
    }
  });

  router.post('/unbury', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { deckId } = req.body || {};
      const repo = getRepo();
      const count = repo.unburyCards(user.userId, deckId);

      return res.json({ success: true, unburiedCount: count });
    } catch (err: any) {
      return res.status(500).json({ error: 'UNBURY_FAILED', message: err.message });
    }
  });

  router.post('/cards/:id/suspend', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { suspend } = req.body || {};
      const repo = getRepo();
      const card = repo.suspendCard(user.userId, req.params.id, suspend !== false);
      if (!card) return res.status(404).json({ error: 'CARD_NOT_FOUND' });

      return res.json({ success: true, card });
    } catch (err: any) {
      return res.status(500).json({ error: 'SUSPEND_FAILED', message: err.message });
    }
  });

  router.post('/cards/:id/flag', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { flag } = req.body || {};
      const repo = getRepo();
      const card = repo.setCardFlag(user.userId, req.params.id, (Number(flag) || 0) as CardFlag);
      if (!card) return res.status(404).json({ error: 'CARD_NOT_FOUND' });

      return res.json({ success: true, card });
    } catch (err: any) {
      return res.status(500).json({ error: 'FLAG_FAILED', message: err.message });
    }
  });

  router.post('/cards/:id/mark', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { marked } = req.body || {};
      const repo = getRepo();
      const card = repo.setCardMarked(user.userId, req.params.id, Boolean(marked));
      if (!card) return res.status(404).json({ error: 'CARD_NOT_FOUND' });

      return res.json({ success: true, card });
    } catch (err: any) {
      return res.status(500).json({ error: 'MARK_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 6. CARD BROWSER & SEARCH
  // =========================================================================

  router.get('/browser', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const queryStr = req.query.query ? String(req.query.query) : '';
      const limit = req.query.limit ? Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10))) : 50;
      const offset = req.query.offset ? Math.max(0, parseInt(String(req.query.offset), 10)) : 0;

      const repo = getRepo();
      const result = repo.listBrowserCards(user.userId, queryStr, limit, offset);

      return res.json({
        success: true,
        cards: result.cards,
        total: result.total,
        limit,
        offset,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'BROWSER_FAILED', message: err.message });
    }
  });

  router.post('/browser/bulk', requireAuthMiddleware, noteMutationLimiter, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { action, cardIds, targetDeckId, suspend } = req.body || {};

      const validActions = ['move', 'suspend', 'delete'];
      if (!action || !validActions.includes(action)) {
        return res.status(400).json({ error: 'INVALID_ACTION', message: 'Ação deve ser move, suspend ou delete.' });
      }

      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        return res.status(400).json({ error: 'INVALID_BULK_REQUEST', message: 'cardIds deve ser um array não vazio.' });
      }

      if (cardIds.length > 500) {
        return res.status(400).json({ error: 'TOO_MANY_CARDS', message: 'Máximo de 500 cards por operação em lote.' });
      }

      if (!cardIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
        return res.status(400).json({ error: 'INVALID_CARD_IDS', message: 'Todos os cardIds devem ser identificadores válidos.' });
      }

      const repo = getRepo();
      let affectedCount = 0;

      if (action === 'move') {
        if (!targetDeckId || typeof targetDeckId !== 'string') {
          return res.status(400).json({ error: 'TARGET_DECK_REQUIRED', message: 'Baralho de destino é obrigatório para mover.' });
        }
        const targetDeck = repo.getDeck(user.userId, targetDeckId);
        if (!targetDeck) {
          return res.status(404).json({ error: 'TARGET_DECK_NOT_FOUND', message: 'Baralho de destino não encontrado ou não pertence a você.' });
        }
        affectedCount = repo.bulkMoveCards(user.userId, cardIds, targetDeckId);
      } else if (action === 'suspend') {
        affectedCount = repo.bulkSuspendCards(user.userId, cardIds, suspend !== false);
      } else if (action === 'delete') {
        affectedCount = repo.bulkDeleteCards(user.userId, cardIds);
      }

      return res.json({ success: true, affectedCount });
    } catch (err: any) {
      if (err.message === 'TARGET_DECK_NOT_FOUND') {
        return res.status(404).json({ error: 'TARGET_DECK_NOT_FOUND', message: 'Baralho de destino não encontrado.' });
      }
      return res.status(500).json({ error: 'BULK_ACTION_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 7. STATISTICS & HEATMAP
  // =========================================================================

  router.get('/stats', requireAuthMiddleware, (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const deckId = req.query.deckId ? String(req.query.deckId) : undefined;
      const repo = getRepo();
      const stats = repo.getStatsSummary(user.userId, deckId);

      return res.json({ success: true, stats });
    } catch (err: any) {
      return res.status(500).json({ error: 'STATS_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 8. APKG EXPORT & IMPORT (Official Anki Compatibility)
  // =========================================================================

  router.get('/export-apkg', requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const deckId = req.query.deckId ? String(req.query.deckId) : undefined;
      const repo = getRepo();

      const allDecks = repo.listDecks(user.userId);
      const deckMap = new Map<string, any>(allDecks.map(d => [d.id, d]));

      const getFullPath = (d: any): string => {
        if (d.name.includes('::') || !d.parentDeckId) return d.name;
        const parent = deckMap.get(d.parentDeckId);
        if (!parent) return d.name;
        return `${getFullPath(parent)}::${d.name}`;
      };

      let exportDeckIds: string[] = [];
      let exportDecks: any[] = [];

      if (deckId) {
        const rootTarget = allDecks.find(d => d.id === deckId);
        if (!rootTarget) {
          return res.status(404).json({ error: 'NO_DECKS_TO_EXPORT' });
        }
        const descendantIds = repo.getDescendantDeckIds(user.userId, deckId);
        exportDeckIds = descendantIds;
        exportDecks = allDecks
          .filter(d => descendantIds.includes(d.id))
          .map(d => ({ ...d, name: getFullPath(d) }));
      } else {
        exportDeckIds = allDecks.map(d => d.id);
        exportDecks = allDecks.map(d => ({ ...d, name: getFullPath(d) }));
      }

      if (exportDecks.length === 0) {
        return res.status(404).json({ error: 'NO_DECKS_TO_EXPORT' });
      }

      const notetypes = repo.listNoteTypes(user.userId);
      const cards = repo.getCardsByDeckIds(user.userId, exportDeckIds);

      const notesMap = new Map<string, any>();
      for (const card of cards) {
        if (card.note) {
          notesMap.set(card.note.id, card.note);
        }
      }

      const apkgBuffer = await AnkiApkgService.exportApkg({
        decks: exportDecks,
        notetypes,
        notes: Array.from(notesMap.values()),
        cards,
      });

      const rootExportDeck = deckId ? allDecks.find(d => d.id === deckId) : null;
      const exportFilename = rootExportDeck
        ? `${rootExportDeck.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.apkg`
        : 'Colecao_Anki_CFO.apkg';

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFilename}"`);
      return res.send(apkgBuffer);
    } catch (err: any) {
      return res.status(500).json({ error: 'EXPORT_FAILED', message: err.message });
    }
  });

  router.post('/import-apkg', requireAuthMiddleware, apkgImportLimiter, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { base64Data } = req.body || {};

      if (!base64Data || typeof base64Data !== 'string') {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'base64Data do arquivo .apkg é obrigatório.' });
      }

      // Limite de segurança de 25MB para o payload base64
      if (base64Data.length > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'O arquivo .apkg excede o limite máximo permitido de 25MB.' });
      }

      const apkgBuffer = Buffer.from(base64Data, 'base64');
      const parsed = await AnkiApkgService.parseApkg(apkgBuffer);
      const repo = getRepo();
      const existingDecks = repo.listDecks(user.userId);
      const currentDeckCount = repo.countDecks(user.userId);
      const newDecksNeeded = parsed.decks.filter(d => !existingDecks.some(ed => ed.name.toLowerCase() === d.name.toLowerCase())).length;

      if (currentDeckCount + newDecksNeeded > AnkiRepository.MAX_DECKS_PER_USER) {
        return res.status(400).json({
          error: 'MAX_DECKS_EXCEEDED',
          message: `A importação excederia o limite máximo de ${AnkiRepository.MAX_DECKS_PER_USER} baralhos. Você possui ${currentDeckCount} baralhos.`,
        });
      }

      // Persist all referenced media before creating cards so an upload failure
      // cannot leave imported notes pointing at missing images.
      let mediaSavedCount = 0;
      for (const mf of parsed.mediaFiles) {
        const ext = path.extname(mf.filename).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream');
        await repo.saveMedia(user.userId, mf.filename, mf.buffer, mime);
        mediaSavedCount++;
      }

      // Ensure default config
      const config = repo.ensureDefaultDeckConfig(user.userId);
      const existingNotetypes = repo.ensureDefaultNoteTypes(user.userId);
      const basicNt = existingNotetypes.find(n => n.name === 'Basic') || existingNotetypes[0];

      let createdDecksCount = 0;
      let createdNotesCount = 0;
      let createdCardsCount = 0;

      // Map deck name -> deckId
      const deckNameToId = new Map<string, string>();
      existingDecks.forEach(d => deckNameToId.set(d.name, d.id));

      for (const pd of parsed.decks) {
        if (!deckNameToId.has(pd.name)) {
          const newDeck = repo.createDeck(user.userId, {
            name: pd.name,
            description: pd.description,
            configId: config.id,
          });
          deckNameToId.set(pd.name, newDeck.id);
          createdDecksCount++;
        }
      }

      // If no deck was in package, ensure Default deck
      if (deckNameToId.size === 0) {
        const def = repo.createDeck(user.userId, { name: 'Importados' });
        deckNameToId.set('Importados', def.id);
      }

      const defaultDeckId = Array.from(deckNameToId.values())[0];

      // Import notes
      for (const pn of parsed.notes) {
        const targetDeckId = deckNameToId.get(pn.deckName) || defaultDeckId;
        const targetNt = existingNotetypes.find(n => n.name === pn.notetypeName) || basicNt;

        const res = repo.createNote(user.userId, {
          deckId: targetDeckId,
          notetypeId: targetNt.id,
          fields: pn.fields,
          tags: pn.tags,
        });

        createdNotesCount++;
        createdCardsCount += res.cards.length;
      }

      return res.json({
        success: true,
        message: 'Pacote .apkg importado com sucesso!',
        decksCreated: createdDecksCount,
        notesCreated: createdNotesCount,
        cardsCreated: createdCardsCount,
        mediaSaved: mediaSavedCount,
      });
    } catch (err: any) {
      if (err instanceof MediaStorageNotConfiguredError) {
        return res.status(503).json({ error: 'MEDIA_STORAGE_UNAVAILABLE', message: 'O armazenamento persistente de imagens está indisponível.' });
      }
      return res.status(500).json({ error: 'IMPORT_FAILED', message: err.message });
    }
  });

  // =========================================================================
  // 9. USER MEDIA ASSETS (Images in Flashcards)
  // =========================================================================

  const handleMediaUpload = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { imageBase64, filename } = req.body || {};

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({
          error: 'INVALID_PAYLOAD',
          message: 'Dados da imagem (imageBase64) são obrigatórios.',
        });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      const MAX_MEDIA_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
      const validation = validateImageBuffer(buffer, MAX_MEDIA_SIZE_BYTES);
      if (!validation.valid || !validation.extension) {
        return res.status(400).json({
          error: 'INVALID_IMAGE',
          message: validation.error || 'Formato de imagem inválido. Apenas JPG, PNG ou WEBP são permitidos.',
        });
      }

      // Gera nome único e seguro sem caracteres perigosos
      let safeBase = '';
      if (filename && typeof filename === 'string') {
        safeBase = path.basename(filename, path.extname(filename)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      }
      const randomSuffix = crypto.randomBytes(4).toString('hex');
      const finalFilename = safeBase
        ? `${safeBase}_${randomSuffix}.${validation.extension}`
        : `img_${Date.now()}_${randomSuffix}.${validation.extension}`;

      const repo = getRepo();
      const media = await repo.saveMedia(user.userId, finalFilename, buffer, validation.detectedMime!);

      return res.json({
        success: true,
        filename: media.filename,
        url: `/api/anki/media/${media.filename}`,
        mimeType: media.mimeType,
        sizeBytes: media.fileSize,
      });
    } catch (err: any) {
      if (err instanceof MediaStorageNotConfiguredError) {
        return res.status(503).json({ error: 'MEDIA_STORAGE_UNAVAILABLE', message: 'O armazenamento persistente de imagens está indisponível.' });
      }
      return res.status(500).json({ error: 'UPLOAD_FAILED', message: err.message });
    }
  };

  router.post('/media/upload', requireAuthMiddleware, mediaUploadLimiter, handleMediaUpload);
  router.post('/media', requireAuthMiddleware, mediaUploadLimiter, handleMediaUpload);

  router.get('/media/:filename', requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const asset = await repo.getMedia(user.userId, req.params.filename);

      if (!asset) {
        return res.status(404).json({ error: 'MEDIA_NOT_FOUND' });
      }

      res.setHeader('Content-Type', asset.media.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.vary('Cookie');
      res.vary('Authorization');
      return res.send(asset.buffer);
    } catch (err: any) {
      if (err instanceof MediaStorageNotConfiguredError) {
        return res.status(503).json({ error: 'MEDIA_STORAGE_UNAVAILABLE' });
      }
      return res.status(500).json({ error: 'GET_MEDIA_FAILED', message: err.message });
    }
  });

  router.delete('/media/:filename', requireAuthMiddleware, noteMutationLimiter, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const repo = getRepo();
      const deleted = await repo.deleteMedia(user.userId, req.params.filename);
      if (!deleted) {
        return res.status(404).json({ error: 'MEDIA_NOT_FOUND', message: 'Mídia não encontrada ou não pertence ao usuário.' });
      }
      return res.json({ success: true, message: 'Mídia excluída com sucesso.' });
    } catch (err: any) {
      if (err?.message === 'MEDIA_IN_USE') {
        return res.status(409).json({ error: 'MEDIA_IN_USE', message: 'Remova a imagem dos cartões antes de excluí-la.' });
      }
      return res.status(500).json({ error: 'DELETE_MEDIA_FAILED', message: err.message });
    }
  });

  return router;
}
