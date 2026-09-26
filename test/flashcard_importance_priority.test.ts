process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import http from 'node:http';
import { DatabaseService } from '../src/db/database';
import { UserRepository, FlashcardRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { createAnkiRouter } from '../src/routes/ankiRouter';
import {
  calculateCardPriority,
  applyImportanceToInterval,
  isValidImportance,
  normalizeImportance,
  IMPORTANCE_CONFIG,
} from '../src/services/anki/ankiImportance';
import { CardQueue, CardType, FlashcardImportance } from '../src/services/anki/ankiTypes';
import { AnkiSearch } from '../src/services/anki/ankiSearch';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-importance-test-'));
  const dbFile = path.join(tempDir, 'test_importance.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const ankiRepo = new AnkiRepository(rawDb);
  const legacyRepo = new FlashcardRepository(rawDb);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, rawDb, userRepo, ankiRepo, legacyRepo, cleanup };
}

test('1. Migration 035 and Importance Validation', () => {
  assert.equal(isValidImportance('low'), true);
  assert.equal(isValidImportance('normal'), true);
  assert.equal(isValidImportance('high'), true);
  assert.equal(isValidImportance('essential'), true);
  assert.equal(isValidImportance('baixa'), true);
  assert.equal(isValidImportance('alta'), true);
  assert.equal(isValidImportance('essencial'), true);

  assert.equal(isValidImportance('invalid'), false);
  assert.equal(isValidImportance('urgent'), false);
  assert.equal(isValidImportance(123), false);
  assert.equal(isValidImportance(null), false);

  assert.equal(normalizeImportance('baixa'), 'low');
  assert.equal(normalizeImportance('alta'), 'high');
  assert.equal(normalizeImportance('essencial'), 'essential');
  assert.equal(normalizeImportance('UNKNOWN'), 'normal');
});

test('2. Single Source of Truth: anki_notes is authoritative, cards derived without divergence', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_ssot', email: 'ssot@cfo.test', passwordHash: 'hash' });
    const userId = user.id;

    ankiRepo.ensureDefaultNoteTypes(userId);
    const deck = ankiRepo.createDeck(userId, { name: 'Direito Constitucional' });

    // Find cloze notetype
    const notetypes = ankiRepo.ensureDefaultNoteTypes(userId);
    const clozeNt = notetypes.find(n => n.kind === 'cloze') || notetypes[0];

    // Create a cloze note with essential importance
    const created = ankiRepo.createNote(userId, {
      deckId: deck.id,
      notetypeId: clozeNt.id,
      fields: ['O {{c1::Artigo 5º}} garante {{c2::direitos fundamentais}} e {{c3::garantias}}.', 'Extra'],
      tags: ['cf88', 'direitos'],
      importance: 'essential',
    });

    assert.equal(created.note.importance, 'essential');
    assert.equal(created.cards.length, 3, 'Cloze note should generate 3 cards');

    // All 3 derived cards must have essential importance immediately
    for (const card of created.cards) {
      assert.equal(card.importance, 'essential', 'Derived card must have essential importance');
      assert.equal(card.note?.importance, 'essential');
      
      const fetchedCard = ankiRepo.getCard(userId, card.id);
      assert.ok(fetchedCard);
      assert.equal(fetchedCard.importance, 'essential');
    }

    // Update note importance to 'low'
    const updatedNote = await ankiRepo.updateNote(userId, created.note.id, created.note.fields, ['cf88'], 'low');
    assert.ok(updatedNote);
    assert.equal(updatedNote.importance, 'low');

    // All 3 derived cards must reflect 'low' immediately without independent card column divergence
    for (const card of created.cards) {
      const fetched = ankiRepo.getCard(userId, card.id);
      assert.ok(fetched);
      assert.equal(fetched.importance, 'low', 'Sibling cards must all be low');
      assert.equal(fetched.note?.importance, 'low');
    }

    // Updating a single card's importance updates the note and all sibling cards
    const bulkCount = ankiRepo.bulkSetImportance(userId, [created.cards[0].id], 'high');
    assert.equal(bulkCount, 1);

    for (const card of created.cards) {
      const fetched = ankiRepo.getCard(userId, card.id);
      assert.ok(fetched);
      assert.equal(fetched.importance, 'high', 'All siblings must synchronously reflect high');
    }
  } finally {
    cleanup();
  }
});

test('3. Default Importance is "normal"', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_def', email: 'def@cfo.test', passwordHash: 'hash' });
    const userId = user.id;

    const notetypes = ankiRepo.ensureDefaultNoteTypes(userId);
    const deck = ankiRepo.createDeck(userId, { name: 'Matemática' });

    const created = ankiRepo.createNote(userId, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['2 + 2 = ?', '4'],
    });

    assert.equal(created.note.importance, 'normal');
    assert.equal(created.cards[0].importance, 'normal');
  } finally {
    cleanup();
  }
});

test('4. FSRS Safety: Interval multiplier is disabled by default (1.00x) and does not distort FSRS', () => {
  const rawInterval = 14;
  
  // By default, enableScaling is false, strictly preserving FSRS calibration
  assert.equal(applyImportanceToInterval(rawInterval, 'low', false), 14);
  assert.equal(applyImportanceToInterval(rawInterval, 'normal', false), 14);
  assert.equal(applyImportanceToInterval(rawInterval, 'high', false), 14);
  assert.equal(applyImportanceToInterval(rawInterval, 'essential', false), 14);

  // Even if enabled in test mode, scaling is strictly clamped between 0.70 and 1.30
  const lowScaled = applyImportanceToInterval(rawInterval, 'low', true);
  const normScaled = applyImportanceToInterval(rawInterval, 'normal', true);
  const highScaled = applyImportanceToInterval(rawInterval, 'high', true);
  const essScaled = applyImportanceToInterval(rawInterval, 'essential', true);

  assert.ok(lowScaled >= 10);
  assert.equal(normScaled, 14);
  assert.ok(highScaled >= 14 && highScaled <= 18);
  assert.ok(essScaled >= 14 && essScaled <= 19);
});

test('5. Multi-dimensional Priority Invariant: Overdue Normal card MUST outrank a Non-Due Essential card', () => {
  const now = new Date('2026-09-26T12:00:00Z');
  const nowEpochDays = Math.floor(now.getTime() / 86400000);

  // Card A: Normal importance, but OVERDUE by 2 days
  const overdueNormalCard: any = {
    id: 'card-a',
    queue: CardQueue.Review,
    cardType: CardType.Review,
    due: nowEpochDays - 2, // 2 days late
    intervalDays: 10,
    lapses: 1,
    difficulty: 5.0,
    stability: 8.0,
    importance: 'normal',
  };

  // Card B: Essential importance, but NOT DUE (scheduled 3 days in the future)
  const futureEssentialCard: any = {
    id: 'card-b',
    queue: CardQueue.Review,
    cardType: CardType.Review,
    due: nowEpochDays + 3, // 3 days in the future
    intervalDays: 20,
    lapses: 0,
    difficulty: 3.0,
    stability: 20.0,
    importance: 'essential',
  };

  // Card C: Normal importance with 3 lapses, due today
  const lapseNormalCard: any = {
    id: 'card-c',
    queue: CardQueue.Review,
    cardType: CardType.Review,
    due: nowEpochDays,
    intervalDays: 2,
    lapses: 3,
    difficulty: 6.0,
    stability: 2.0,
    importance: 'normal',
  };

  // Card D: Essential importance, due today
  const dueEssentialCard: any = {
    id: 'card-d',
    queue: CardQueue.Review,
    cardType: CardType.Review,
    due: nowEpochDays,
    intervalDays: 10,
    lapses: 0,
    difficulty: 5.0,
    stability: 8.0,
    importance: 'essential',
  };

  const scoreOverdueNormal = calculateCardPriority(overdueNormalCard, now);
  const scoreFutureEssential = calculateCardPriority(futureEssentialCard, now);
  const scoreLapseNormal = calculateCardPriority(lapseNormalCard, now);
  const scoreDueEssential = calculateCardPriority(dueEssentialCard, now);

  // Invariant 1: Overdue normal card must have vastly higher score than future essential card
  assert.ok(
    scoreOverdueNormal > scoreFutureEssential,
    `Overdue Normal (${scoreOverdueNormal}) must be greater than Future Essential (${scoreFutureEssential})`
  );

  // Invariant 2: High lapse card must have high priority
  assert.ok(
    scoreLapseNormal > scoreFutureEssential,
    `Lapsed Normal (${scoreLapseNormal}) must be greater than Future Essential (${scoreFutureEssential})`
  );

  // Invariant 3: Among cards due today with similar lapses, Essential outranks Normal
  const dueNormalCard: any = {
    ...dueEssentialCard,
    id: 'card-due-normal',
    importance: 'normal',
  };
  const scoreDueNormal = calculateCardPriority(dueNormalCard, now);
  assert.ok(
    scoreDueEssential > scoreDueNormal,
    `Due Essential (${scoreDueEssential}) must outrank Due Normal (${scoreDueNormal})`
  );
});

test('6. Study Queue Ordering in Real Repository respects priority weight without breaking FSRS', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_queue', email: 'queue@cfo.test', passwordHash: 'hash' });
    const userId = user.id;

    const notetypes = ankiRepo.ensureDefaultNoteTypes(userId);
    const deck = ankiRepo.createDeck(userId, { name: 'Física' });

    // Note 1: Essential (will be set as new)
    ankiRepo.createNote(userId, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Gravitação Essencial', 'F = G*m1*m2/r^2'],
      importance: 'essential',
    });

    // Note 2: Normal (will be set as new)
    ankiRepo.createNote(userId, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Óptica Normal', 'n1*sen(i) = n2*sen(r)'],
      importance: 'normal',
    });

    // Note 3: Low (will be set as new)
    ankiRepo.createNote(userId, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Termodinâmica Baixa', 'PV = nRT'],
      importance: 'low',
    });

    const queue = ankiRepo.getStudyQueue(userId, deck.id, 10);
    assert.equal(queue.length, 3);

    // Among all 3 new cards, Essential must be first, then Normal, then Low
    assert.equal(queue[0].importance, 'essential');
    assert.equal(queue[1].importance, 'normal');
    assert.equal(queue[2].importance, 'low');
  } finally {
    cleanup();
  }
});

test('7. Search Syntax: importance filter and is:essential search tokens', () => {
  const q1 = AnkiSearch.parseQuery('importance:essential');
  assert.equal(q1.importanceFilters.length, 1);
  assert.equal(q1.importanceFilters[0].importance, 'essential');
  assert.equal(q1.importanceFilters[0].negated, false);

  const q2 = AnkiSearch.parseQuery('is:high');
  assert.equal(q2.importanceFilters.length, 1);
  assert.equal(q2.importanceFilters[0].importance, 'high');
  assert.equal(q2.importanceFilters[0].negated, false);

  const q3 = AnkiSearch.parseQuery('importancia:baixa');
  assert.equal(q3.importanceFilters.length, 1);
  assert.equal(q3.importanceFilters[0].importance, 'low');
  assert.equal(q3.importanceFilters[0].negated, false);
});

test('8. Statistics Summary Aggregates cardsByImportance', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_stats', email: 'stats@cfo.test', passwordHash: 'hash' });
    const userId = user.id;

    const notetypes = ankiRepo.ensureDefaultNoteTypes(userId);
    const deck = ankiRepo.createDeck(userId, { name: 'Português' });

    ankiRepo.createNote(userId, { deckId: deck.id, notetypeId: notetypes[0].id, fields: ['Q1', 'A1'], importance: 'essential' });
    ankiRepo.createNote(userId, { deckId: deck.id, notetypeId: notetypes[0].id, fields: ['Q2', 'A2'], importance: 'essential' });
    ankiRepo.createNote(userId, { deckId: deck.id, notetypeId: notetypes[0].id, fields: ['Q3', 'A3'], importance: 'high' });
    ankiRepo.createNote(userId, { deckId: deck.id, notetypeId: notetypes[0].id, fields: ['Q4', 'A4'], importance: 'normal' });
    ankiRepo.createNote(userId, { deckId: deck.id, notetypeId: notetypes[0].id, fields: ['Q5', 'A5'], importance: 'low' });

    const stats = ankiRepo.getStatsSummary(userId);
    assert.equal(stats.cardsByImportance.essential, 2);
    assert.equal(stats.cardsByImportance.high, 1);
    assert.equal(stats.cardsByImportance.normal, 1);
    assert.equal(stats.cardsByImportance.low, 1);
  } finally {
    cleanup();
  }
});

test('9. HTTP API Endpoints: Validation, IDOR Multi-Tenant Isolation & Bulk Set Importance', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  let server: http.Server;

  try {
    const alice = userRepo.create({ username: 'user_alice', email: 'alice@cfo.test', passwordHash: 'hash' });
    const bob = userRepo.create({ username: 'user_bob', email: 'bob@cfo.test', passwordHash: 'hash' });

    const app = express();
    app.use(express.json());

    let currentUserId = alice.id;
    const mockAuth = (req: any, _res: any, next: any) => {
      req.user = { userId: currentUserId, role: 'cadet' };
      next();
    };

    app.use('/api/anki', createAnkiRouter(mockAuth, () => ankiRepo));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}/api/anki`;

    // 1. Ensure deck for Alice
    ankiRepo.ensureDefaultNoteTypes(alice.id);
    const aliceDeck = ankiRepo.createDeck(alice.id, { name: 'Deck Alice' });
    const nts = ankiRepo.ensureDefaultNoteTypes(alice.id);

    // 2. Reject invalid importance on POST /notes
    const invalidRes = await fetch(`${baseUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: aliceDeck.id,
        notetypeId: nts[0].id,
        fields: ['Pergunta', 'Resposta'],
        importance: 'super-urgent',
      }),
    });
    assert.equal(invalidRes.status, 400);
    const invalidJson = await invalidRes.json();
    assert.equal(invalidJson.error, 'INVALID_IMPORTANCE');

    // 3. Create note with valid essential importance
    const createRes = await fetch(`${baseUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deckId: aliceDeck.id,
        notetypeId: nts[0].id,
        fields: ['Pergunta Válida', 'Resposta Válida'],
        importance: 'essential',
      }),
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.note.importance, 'essential');
    assert.equal(createData.cards[0].importance, 'essential');

    const cardId = createData.cards[0].id;
    const noteId = createData.note.id;

    // 4. Zero IDOR Test: User Bob cannot modify Alice's card importance
    currentUserId = bob.id;
    const bobPatchRes = await fetch(`${baseUrl}/cards/${cardId}/importance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importance: 'low' }),
    });
    assert.equal(bobPatchRes.status, 404, 'Bob should get 404 when trying to touch Alice card');

    // Alice card must remain essential
    const aliceCardStillEss = ankiRepo.getCard(alice.id, cardId);
    assert.equal(aliceCardStillEss?.importance, 'essential');

    // 5. Alice updates card importance to 'high' via PATCH /cards/:id/importance
    currentUserId = alice.id;
    const alicePatchRes = await fetch(`${baseUrl}/cards/${cardId}/importance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importance: 'high' }),
    });
    assert.equal(alicePatchRes.status, 200);
    const alicePatchData = await alicePatchRes.json();
    assert.equal(alicePatchData.card.importance, 'high');

    // Authoritative note must also be updated
    const aliceNoteUpdated = ankiRepo.getNote(alice.id, noteId);
    assert.equal(aliceNoteUpdated?.importance, 'high');

    // 6. Bulk Action set_importance
    const bulkRes = await fetch(`${baseUrl}/browser/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_importance',
        cardIds: [cardId],
        importance: 'essential',
      }),
    });
    assert.equal(bulkRes.status, 200);
    const bulkData = await bulkRes.json();
    assert.equal(bulkData.affectedCount, 1);

    const recheck = ankiRepo.getCard(alice.id, cardId);
    assert.equal(recheck?.importance, 'essential');
  } finally {
    if (server!) server.close();
    cleanup();
  }
});

test('10. Legacy Flashcard Repository supports importance with backward compatibility', () => {
  const { userRepo, legacyRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_legacy', email: 'legacy@cfo.test', passwordHash: 'hash' });
    const userId = user.id;
    
    // Create legacy subject and deck
    const now = new Date().toISOString();
    rawDb.prepare(`
      INSERT INTO flashcard_subjects (id, user_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('sub-1', userId, 'História', now, now);

    rawDb.prepare(`
      INSERT INTO flashcard_decks (id, user_id, subject_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('deck-leg-1', userId, 'sub-1', 'Guerra do Paraguai', now, now);

    // Create card with essential importance
    const card = legacyRepo.createCard(userId, {
      deckId: 'deck-leg-1',
      front: 'Ano da Batalha do Riachuelo',
      back: '1865',
      importance: 'essential',
    });

    assert.equal(card.importance, 'essential');

    const fetched = legacyRepo.getCard(userId, card.id);
    assert.equal(fetched?.importance, 'essential');

    // Update card to 'normal'
    const updated = legacyRepo.updateCard(userId, card.id, {
      importance: 'normal',
    });
    assert.equal(updated?.importance, 'normal');

    const fetchedUpdated = legacyRepo.getCard(userId, card.id);
    assert.equal(fetchedUpdated?.importance, 'normal');
  } finally {
    cleanup();
  }
});
