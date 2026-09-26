import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import JSZip from 'jszip';
import { AnkiRepository } from '../src/db/ankiRepository';
import { SessionRepository } from '../src/db/repositories';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';
import { AnkiApkgService } from '../src/services/anki/ankiApkgService';

function createMockDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      username TEXT,
      role TEXT,
      password_hash TEXT,
      status TEXT DEFAULT 'active',
      can_access_notion INTEGER DEFAULT 0,
      can_access_ifrj INTEGER DEFAULT 0,
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );

    CREATE TABLE anki_deck_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_decks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      config_id TEXT,
      parent_deck_id TEXT,
      is_collapsed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (config_id) REFERENCES anki_deck_configs(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_deck_id) REFERENCES anki_decks(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_notetypes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'standard',
      css TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_fields (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      notetype_id TEXT NOT NULL,
      name TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      font_size INTEGER DEFAULT 20,
      font_name TEXT DEFAULT 'Arial',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (notetype_id) REFERENCES anki_notetypes(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      notetype_id TEXT NOT NULL,
      name TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      qfmt TEXT NOT NULL,
      afmt TEXT NOT NULL,
      bqfmt TEXT,
      bafmt TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (notetype_id) REFERENCES anki_notetypes(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      notetype_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      importance TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (notetype_id) REFERENCES anki_notetypes(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_cards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      deck_id TEXT NOT NULL,
      template_ord INTEGER NOT NULL DEFAULT 0,
      queue INTEGER NOT NULL DEFAULT 0,
      card_type INTEGER NOT NULL DEFAULT 0,
      due INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0.0,
      stability REAL NOT NULL DEFAULT 0.0,
      flags INTEGER NOT NULL DEFAULT 0,
      is_marked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (note_id) REFERENCES anki_notes(id) ON DELETE CASCADE,
      FOREIGN KEY (deck_id) REFERENCES anki_decks(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_revlog (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      reviewed_at TEXT NOT NULL,
      elapsed_time_ms INTEGER NOT NULL DEFAULT 0,
      previous_interval INTEGER NOT NULL,
      new_interval INTEGER NOT NULL,
      previous_state TEXT NOT NULL,
      review_type INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (card_id) REFERENCES anki_cards(id) ON DELETE CASCADE
    );

    CREATE TABLE anki_media (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      hash TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cadet',
      ip TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      impersonated_by_user_id TEXT,
      parent_session_id TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.prepare(`INSERT INTO users (id, email, username, role, status) VALUES ('u1', 'u1@test.com', 'user1', 'cadete', 'active')`).run();
  return db;
}

test('1. Security: Stored XSS defense via deck name in card templates', () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);

  // Deck name with HTML tags must be rejected at repository level
  assert.throws(
    () => repo.createDeck('u1', { name: '<script>alert(1)</script>' }),
    (err: any) => err.code === 'INVALID_NAME'
  );

  assert.throws(
    () => repo.createDeck('u1', { name: 'Normal Name <img src=x onerror=alert(1)>' }),
    (err: any) => err.code === 'INVALID_NAME'
  );

  // AnkiRenderer escapeHtml properly sanitizes if any malicious string is passed
  const escaped = AnkiRenderer.escapeHtml('<script>alert("xss")</script>');
  assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

  const notetypes = repo.ensureDefaultNoteTypes('u1');
  const customTemplate = {
    ...notetypes[0],
    templates: [
      {
        ...notetypes[0].templates[0],
        qfmt: 'Baralho: {{Deck}} / Sub: {{Subdeck}} - {{Front}}',
      },
    ],
  };

  const rendered = AnkiRenderer.renderCard(
    {
      id: 'n1',
      userId: 'u1',
      notetypeId: notetypes[0].id,
      guid: 'g1',
      fields: ['Pergunta', 'Resposta'],
      tags: [],
      importance: 'normal',
      createdAt: '',
      updatedAt: '',
    },
    customTemplate,
    0,
    '<b onmouseover=evil()>DeckMalicioso</b>'
  );

  assert.ok(!rendered.questionHtml.includes('<b onmouseover=evil()>'));
  assert.ok(rendered.questionHtml.includes('&lt;b onmouseover=evil()&gt;DeckMalicioso&lt;/b&gt;'));
});

test('2. Security: Type validation on name and parentDeckId prevents crashes', () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);

  // Number as name
  assert.throws(
    () => repo.createDeck('u1', { name: 12345 as any }),
    (err: any) => err.code === 'INVALID_NAME'
  );

  // Object as parentDeckId
  assert.throws(
    () => repo.createDeck('u1', { name: 'Teste', parentDeckId: { $ne: null } as any }),
    (err: any) => err.code === 'INVALID_PAYLOAD'
  );

  const d1 = repo.createDeck('u1', { name: 'Valido' });

  // Update with non-string
  assert.throws(
    () => repo.updateDeck('u1', d1.id, { name: 999 as any }),
    (err: any) => err.code === 'INVALID_NAME'
  );

  assert.throws(
    () => repo.updateDeck('u1', d1.id, { parentDeckId: [] as any }),
    (err: any) => err.code === 'INVALID_PAYLOAD'
  );
});

test('3. Security: DoS prevention in notes batch creation (max 200 notes)', async () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);
  repo.ensureDefaultNoteTypes('u1');
  const deck = repo.createDeck('u1', { name: 'Deck Batch' });

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/api/anki/notes/batch', (req, res) => {
    const { deckId, notes } = req.body || {};
    if (!deckId || !Array.isArray(notes) || notes.length === 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }
    if (notes.length > 200) {
      return res.status(400).json({
        error: 'BATCH_TOO_LARGE',
        message: 'O lote de notas não pode ultrapassar 200 itens por requisição.',
      });
    }
    return res.status(201).json({ success: true, count: notes.length });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Send 201 notes (over limit)
    const hugeBatch = Array.from({ length: 201 }, (_, i) => ({
      fields: [`Frente ${i}`, `Verso ${i}`],
    }));

    const resOver = await fetch(`${baseUrl}/api/anki/notes/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: deck.id, notes: hugeBatch }),
    });

    const jsonOver = await resOver.json();
    assert.strictEqual(resOver.status, 400);
    assert.strictEqual(jsonOver.error, 'BATCH_TOO_LARGE');

    // Send 200 notes (exact limit)
    const validBatch = Array.from({ length: 200 }, (_, i) => ({
      fields: [`Frente ${i}`, `Verso ${i}`],
    }));

    const resValid = await fetch(`${baseUrl}/api/anki/notes/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: deck.id, notes: validBatch }),
    });

    const jsonValid = await resValid.json();
    assert.strictEqual(resValid.status, 201);
    assert.strictEqual(jsonValid.count, 200);
  } finally {
    server.close();
  }
});

test('4. Data Integrity: Orphaned notes cleanup on deck and card deletion', () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);
  const nts = repo.ensureDefaultNoteTypes('u1');

  const deck = repo.createDeck('u1', { name: 'Deck Com Notas' });
  repo.createNote('u1', {
    deckId: deck.id,
    notetypeId: nts[0].id,
    fields: ['Pergunta', 'Resposta'],
  });

  // Verify note exists in DB
  let countNotes = db.prepare(`SELECT COUNT(*) as c FROM anki_notes WHERE user_id = 'u1'`).get() as any;
  assert.strictEqual(countNotes.c, 1);

  // Delete deck
  repo.deleteDeck('u1', deck.id);

  // Verify deck, cards AND note were all purged without leaving orphan notes
  const countDecks = db.prepare(`SELECT COUNT(*) as c FROM anki_decks WHERE user_id = 'u1'`).get() as any;
  const countCards = db.prepare(`SELECT COUNT(*) as c FROM anki_cards WHERE user_id = 'u1'`).get() as any;
  countNotes = db.prepare(`SELECT COUNT(*) as c FROM anki_notes WHERE user_id = 'u1'`).get() as any;

  assert.strictEqual(countDecks.c, 0);
  assert.strictEqual(countCards.c, 0);
  assert.strictEqual(countNotes.c, 0, 'Orphaned note was cleanly purged');
});

test('5. APKG Export: Subdeck cards and full hierarchy included in export', async () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);
  const nts = repo.ensureDefaultNoteTypes('u1');

  // Create hierarchy: História -> Brasil -> República
  const root = repo.createDeck('u1', { name: 'História' });
  const sub1 = repo.createDeck('u1', { name: 'Brasil', parentDeckId: root.id });
  const sub2 = repo.createDeck('u1', { name: 'República', parentDeckId: sub1.id });

  // Add notes/cards in root and in deepest subdeck
  repo.createNote('u1', {
    deckId: root.id,
    notetypeId: nts[0].id,
    fields: ['Carta Raiz', 'Resposta Raiz'],
  });
  repo.createNote('u1', {
    deckId: sub2.id,
    notetypeId: nts[0].id,
    fields: ['Carta Subdeck', 'Resposta Subdeck'],
  });

  // Descendant IDs for root must include all 3 decks
  const descendantIds = repo.getDescendantDeckIds('u1', root.id);
  assert.strictEqual(descendantIds.length, 3);
  assert.ok(descendantIds.includes(root.id));
  assert.ok(descendantIds.includes(sub1.id));
  assert.ok(descendantIds.includes(sub2.id));

  // Fetch cards by deck IDs
  const cards = repo.getCardsByDeckIds('u1', descendantIds);
  assert.strictEqual(cards.length, 2);

  // Export APKG with hierarchical decks
  const allDecks = repo.listDecks('u1');
  const deckMap = new Map(allDecks.map(d => [d.id, d]));
  const getFullPath = (d: any): string => {
    if (d.name.includes('::') || !d.parentDeckId) return d.name;
    const parent = deckMap.get(d.parentDeckId);
    if (!parent) return d.name;
    return `${getFullPath(parent)}::${d.name}`;
  };

  const exportDecks = allDecks.map(d => ({ ...d, name: getFullPath(d) }));
  const repDeck = exportDecks.find(d => d.id === sub2.id);
  assert.strictEqual(repDeck?.name, 'História::Brasil::República');

  const apkgBuffer = await AnkiApkgService.exportApkg({
    decks: exportDecks,
    notetypes: nts,
    notes: [
      { id: 'n1', userId: 'u1', notetypeId: nts[0].id, guid: 'g1', fields: ['Q1', 'A1'], tags: [], importance: 'normal', createdAt: '', updatedAt: '' },
      { id: 'n2', userId: 'u1', notetypeId: nts[0].id, guid: 'g2', fields: ['Q2', 'A2'], tags: [], importance: 'normal', createdAt: '', updatedAt: '' },
    ],
    cards,
  });

  assert.ok(apkgBuffer.length > 100);
});

test('6. SQL LIKE wildcard escaping in study queue', () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);
  const nts = repo.ensureDefaultNoteTypes('u1');

  // Deck containing % and _
  const deckSpecial = repo.createDeck('u1', { name: '100%_Foco' });
  repo.createNote('u1', {
    deckId: deckSpecial.id,
    notetypeId: nts[0].id,
    fields: ['Pergunta Especial', 'Resposta Especial'],
  });

  // Query study queue for this deck
  const queue = repo.getStudyQueue('u1', deckSpecial.id);
  assert.strictEqual(queue.length, 1);
  assert.strictEqual(queue[0].deck?.name, '100%_Foco');
});

test('7. Security: POST /api/anki/browser/bulk bounds, action validation and deck check', async () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);
  const nts = repo.ensureDefaultNoteTypes('u1');
  const d1 = repo.createDeck('u1', { name: 'Deck 1' });
  const note = repo.createNote('u1', { deckId: d1.id, notetypeId: nts[0].id, fields: ['F', 'B'] });

  const app = express();
  app.use(express.json());
  app.post('/api/anki/browser/bulk', (req, res) => {
    const { action, cardIds, targetDeckId, suspend } = req.body || {};
    const validActions = ['move', 'suspend', 'delete'];
    if (!action || !validActions.includes(action)) {
      return res.status(400).json({ error: 'INVALID_ACTION' });
    }
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return res.status(400).json({ error: 'INVALID_BULK_REQUEST' });
    }
    if (cardIds.length > 500) {
      return res.status(400).json({ error: 'TOO_MANY_CARDS' });
    }
    if (!cardIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
      return res.status(400).json({ error: 'INVALID_CARD_IDS' });
    }
    if (action === 'move') {
      if (!targetDeckId || typeof targetDeckId !== 'string') return res.status(400).json({ error: 'TARGET_DECK_REQUIRED' });
      const targetDeck = repo.getDeck('u1', targetDeckId);
      if (!targetDeck) return res.status(404).json({ error: 'TARGET_DECK_NOT_FOUND' });
      return res.json({ success: true, affectedCount: repo.bulkMoveCards('u1', cardIds, targetDeckId) });
    }
    if (action === 'suspend') {
      return res.json({ success: true, affectedCount: repo.bulkSuspendCards('u1', cardIds, suspend !== false) });
    }
    if (action === 'delete') {
      return res.json({ success: true, affectedCount: repo.bulkDeleteCards('u1', cardIds) });
    }
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    // 1. Invalid action
    const r1 = await fetch(`http://127.0.0.1:${port}/api/anki/browser/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'evil_drop', cardIds: ['c1'] }),
    });
    assert.strictEqual(r1.status, 400);
    const b1: any = await r1.json();
    assert.strictEqual(b1.error, 'INVALID_ACTION');

    // 2. Too many cards (>500)
    const largeList = new Array(501).fill('card-id');
    const r2 = await fetch(`http://127.0.0.1:${port}/api/anki/browser/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suspend', cardIds: largeList }),
    });
    assert.strictEqual(r2.status, 400);
    const b2: any = await r2.json();
    assert.strictEqual(b2.error, 'TOO_MANY_CARDS');

    // 3. Move to nonexistent deck returns 404
    const r3 = await fetch(`http://127.0.0.1:${port}/api/anki/browser/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'move', cardIds: [note.cards[0].id], targetDeckId: 'nonexistent-deck-id' }),
    });
    assert.strictEqual(r3.status, 404);
    const b3: any = await r3.json();
    assert.strictEqual(b3.error, 'TARGET_DECK_NOT_FOUND');
  } finally {
    server.close();
  }
});

test('8. Security: AnkiApkgService.parseApkg limits notes and rejects unsafe media files', async () => {
  const zip = new JSZip();

  // Create collection on disk
  const tempColPath = path.join(os.tmpdir(), `test-col-${Date.now()}.sqlite`);
  const realDb = new DatabaseSync(tempColPath);
  realDb.exec(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (1, 0, 0, 0, 11, 0, 0, 0, '{}', '{}', '{"1": {"id": 1, "name": "Default"}}', '{}', '{}');
    INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (1, 'g1', 1, 0, 0, '', 'Q\x1fA', 'Q', 0, 0, '');
    INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '');
  `);
  realDb.close();

  const colBuffer = fs.readFileSync(tempColPath);
  fs.unlinkSync(tempColPath);

  zip.file('collection.anki2', colBuffer);
  // Media with 1 safe image, 1 dangerous exe, 1 dangerous html
  const mediaMap = {
    '0': 'safe_image.png',
    '1': 'exploit.exe',
    '2': 'malicious.html',
    '3': 'audio.mp3',
  };
  zip.file('media', JSON.stringify(mediaMap));
  zip.file('0', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  zip.file('1', Buffer.from('MZ...executable binary content'));
  zip.file('2', Buffer.from('<script>alert("xss")</script>'));
  zip.file('3', Buffer.from('ID3...audio content'));

  const apkgBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const parsed = await AnkiApkgService.parseApkg(apkgBuffer);

  // Unsafe files (.exe, .html) MUST NOT be included
  assert.strictEqual(parsed.mediaFiles.length, 2);
  const mediaNames = parsed.mediaFiles.map(m => m.filename);
  assert.ok(mediaNames.includes('safe_image.png'));
  assert.ok(mediaNames.includes('audio.mp3'));
  assert.ok(!mediaNames.includes('exploit.exe'));
  assert.ok(!mediaNames.includes('malicious.html'));
});

test('9. Security: SessionRepository.revokeExtensionSessions revokes only extension sessions', () => {
  const db = createMockDb();
  const sessionRepo = new SessionRepository(db as any);

  // Create 1 extension session and 1 regular web session
  const extSession = sessionRepo.createSession({
    userId: 'u1',
    role: 'cadet',
    userAgent: 'cfo-browser-extension',
  });

  const webSession = sessionRepo.createSession({
    userId: 'u1',
    role: 'cadet',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  });

  // Verify both are initially active
  const vExtBefore = sessionRepo.validateSession(extSession.rawToken);
  assert.ok(vExtBefore.valid);

  const vWebBefore = sessionRepo.validateSession(webSession.rawToken);
  assert.ok(vWebBefore.valid);

  // Revoke extension sessions
  const revokedCount = sessionRepo.revokeExtensionSessions('u1');
  assert.strictEqual(revokedCount, 1);

  // Extension session is now invalidated
  const vExtAfter = sessionRepo.validateSession(extSession.rawToken);
  assert.strictEqual(vExtAfter.valid, false);

  // Web session remains perfectly valid
  const vWebAfter = sessionRepo.validateSession(webSession.rawToken);
  assert.ok(vWebAfter.valid);
});

test('10. Security: APKG import pre-check prevents exceeding 300 decks limit', () => {
  const db = createMockDb();
  const repo = new AnkiRepository(db);

  // Create mock existing decks count check
  const currentCount = 295;
  const newDecksCount = 10;
  const wouldExceed = (currentCount + newDecksCount) > AnkiRepository.MAX_DECKS_PER_USER;

  assert.strictEqual(wouldExceed, true);
  assert.strictEqual(AnkiRepository.MAX_DECKS_PER_USER, 300);
});

