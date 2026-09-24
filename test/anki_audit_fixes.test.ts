process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { createAnkiRouter } from '../src/routes/ankiRouter';
import { AnkiScheduler } from '../src/services/anki/ankiScheduler';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';
import { CardQueue, CardType } from '../src/services/anki/ankiTypes';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-audit-test-'));
  const dbFile = path.join(tempDir, 'test_anki_audit.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const ankiRepo = new AnkiRepository(rawDb);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, rawDb, userRepo, ankiRepo, cleanup };
}

test('1. FSRS Scheduler: Review card due date uses absolute epoch days without adding Date.now()', () => {
  const scheduler = new AnkiScheduler();

  // Epoch day for September 2026 is roughly ~20720 days since 1970
  const reviewDueEpochDays = 20720;
  const mockReviewCard: any = {
    id: 'card-rev-1',
    userId: 'user-1',
    noteId: 'note-1',
    deckId: 'deck-1',
    templateOrd: 0,
    queue: CardQueue.Review,
    cardType: CardType.Review,
    due: reviewDueEpochDays,
    intervalDays: 10,
    easeFactor: 2.5,
    reps: 3,
    lapses: 0,
    difficulty: 4.5,
    stability: 12.0,
    flags: 0,
    isMarked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastReviewAt: new Date(Date.now() - 86400000).toISOString(),
  };

  const preview = scheduler.getPreviewIntervals(mockReviewCard);
  assert.equal(preview.length, 4);

  // Rate Good to verify updated card due date
  const now = new Date();
  const result = scheduler.rateCard(mockReviewCard, 3 as any, now);
  assert.ok(result.updatedCard);

  // The due date in days should be current epoch days + scheduled days (NOT current epoch + 20720 days!)
  const currentEpochDays = Math.floor(now.getTime() / 86400000);
  assert.ok(
    result.updatedCard.due >= currentEpochDays && result.updatedCard.due <= currentEpochDays + 365,
    `Card due should be scheduled within normal range (~${currentEpochDays}), but got: ${result.updatedCard.due}`
  );
});

test('2. AnkiRenderer: FrontSide substitution preserves KaTeX display math with $$', () => {
  const notetype: any = {
    id: 'nt-basic',
    name: 'Basic',
    kind: 'standard',
    fields: [{ name: 'Front', ordinal: 0 }, { name: 'Back', ordinal: 1 }],
    templates: [
      {
        id: 't-1',
        name: 'Card 1',
        ord: 0,
        qfmt: '{{Front}}',
        afmt: '{{FrontSide}}\n<hr id="answer">\n{{Back}}',
      },
    ],
    css: '',
  };

  const note: any = {
    id: 'note-math',
    notetypeId: notetype.id,
    fields: ['Qual a equação da energia de Einstein?<br>$$E = mc^2$$', 'Energia de repouso'],
    tags: ['fisica'],
  };

  const rendered = AnkiRenderer.renderCard(note, notetype, 0, 'Física');
  assert.ok(rendered.questionHtml.includes('katex'), 'Question side should render KaTeX');
  assert.ok(rendered.answerHtml.includes('katex'), 'Answer side should render KaTeX in FrontSide without corruption');
});

test('3. Cloze note update: synchronizes anki_cards when clozes are added or removed', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_cloze_sync', email: 'cloze_sync@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const clozeNotetype = notetypes.find((n) => n.kind === 'cloze')!;
    const deck = ankiRepo.createDeck(user.id, { name: 'Direito Constitucional' });

    // 1. Create cloze note with only {{c1::CF/88}}
    const created = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: clozeNotetype.id,
      fields: ['A {{c1::CF/88}} é a lei fundamental.'],
    });

    assert.equal(created.cards.length, 1);
    assert.equal(created.cards[0].templateOrd, 0);

    // 2. Update note adding {{c2::lei fundamental}}
    const updated1 = await ankiRepo.updateNote(user.id, created.note.id, [
      'A {{c1::CF/88}} é a {{c2::lei fundamental}} do Estado.',
    ]);
    assert.ok(updated1);

    const cardsAfterAdd = ankiRepo.getCardsByDeckIds(user.id, [deck.id]);
    assert.equal(cardsAfterAdd.length, 2, 'Should now have 2 cards after adding {{c2}}');
    assert.ok(cardsAfterAdd.some((c) => c.templateOrd === 0));
    assert.ok(cardsAfterAdd.some((c) => c.templateOrd === 1));

    // 3. Update note removing {{c1}} and keeping only {{c2}}
    const updated2 = await ankiRepo.updateNote(user.id, created.note.id, [
      'A CF/88 é a {{c2::lei fundamental}} do Estado.',
    ]);
    assert.ok(updated2);

    const cardsAfterRemove = ankiRepo.getCardsByDeckIds(user.id, [deck.id]);
    assert.equal(cardsAfterRemove.length, 1, 'Should now have only 1 card after removing {{c1}}');
    assert.equal(cardsAfterRemove[0].templateOrd, 1, 'Remaining card should be templateOrd 1');
  } finally {
    cleanup();
  }
});

test('4. Media exact substring match: instr() prevents wildcard false matching on filenames with underscores', async () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_media_test', email: 'media_test@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deck = ankiRepo.createDeck(user.id, { name: 'Biologia' });

    // Note references file: "img_test_a1b2.png"
    ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Célula vegetal:<br><img src="/api/anki/media/img_test_a1b2.png">', 'Parede celular'],
    });

    // Check query for "imgXtestXa1b2.png" - under SQL LIKE, '_' matches 'X', but under instr() it does NOT match!
    const similarFilename = 'imgXtestXa1b2.png';
    const refCheck = rawDb.prepare(`
      SELECT COUNT(*) as count FROM anki_notes
      WHERE user_id = ? AND instr(fields_json, ?) > 0
    `).get(user.id, similarFilename) as any;

    assert.equal(Number(refCheck.count), 0, 'instr() must not match similar filenames with underscores');
  } finally {
    cleanup();
  }
});

test('5. API Router: empty note validation and single card REST deletion (DELETE /api/anki/cards/:id)', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_router_test', email: 'router_test@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deck = ankiRepo.createDeck(user.id, { name: 'História' });

    const app = express();
    app.use(express.json());

    const mockAuth = (req: any, _res: any, next: any) => {
      req.user = { userId: user.id, username: 'aluno_router_test' };
      next();
    };

    app.use('/api/anki', createAnkiRouter(mockAuth, () => ankiRepo));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. Rejects empty note
      const emptyRes = await fetch(`http://127.0.0.1:${port}/api/anki/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.id,
          notetypeId: notetypes[0].id,
          fields: ['   ', ''],
        }),
      });
      assert.equal(emptyRes.status, 400);
      const emptyData: any = await emptyRes.json();
      assert.equal(emptyData.error, 'EMPTY_NOTE');

      // 2. Creates valid note
      const validRes = await fetch(`http://127.0.0.1:${port}/api/anki/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.id,
          notetypeId: notetypes[0].id,
          fields: ['Independência do Brasil?', '1822'],
        }),
      });
      assert.equal(validRes.status, 201);
      const validData: any = await validRes.json();
      const cardId = validData.cards[0].id;

      // 3. Deletes single card via REST DELETE
      const deleteRes = await fetch(`http://127.0.0.1:${port}/api/anki/cards/${cardId}`, {
        method: 'DELETE',
      });
      assert.equal(deleteRes.status, 200);
      const deleteData: any = await deleteRes.json();
      assert.equal(deleteData.success, true);

      // 4. Verify card is gone
      const checkCard = ankiRepo.getCard(user.id, cardId);
      assert.equal(checkCard, null);
    } finally {
      server.close();
    }
  } finally {
    cleanup();
  }
});
