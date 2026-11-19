process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import JSZip from 'jszip';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { createAnkiRouter } from '../src/routes/ankiRouter';
import { AnkiScheduler, DEFAULT_FSRS_WEIGHTS, parseFsrsWeights } from '../src/services/anki/ankiScheduler';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';
import { AnkiSearch } from '../src/services/anki/ankiSearch';
import { AnkiApkgService } from '../src/services/anki/ankiApkgService';
import { CardQueue, CardType, DEFAULT_DECK_CONFIG, Rating, CardFlag } from '../src/services/anki/ankiTypes';
import express from 'express';
import http from 'node:http';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-test-'));
  const dbFile = path.join(tempDir, 'test_anki.sqlite');
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

test('Real Anki: Decks hierárquicos e subdecks com ::', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_anki_1', email: 'anki1@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);

    const deck1 = ankiRepo.createDeck(user.id, { name: 'Matemática::Álgebra::Logaritmos' });
    const deck2 = ankiRepo.createDeck(user.id, { name: 'Matemática::Álgebra::Polinômios' });
    const deck3 = ankiRepo.createDeck(user.id, { name: 'Matemática::Geometria::Plana' });

    assert.ok(deck1.id);
    assert.equal(deck1.name, 'Matemática::Álgebra::Logaritmos');

    const list = ankiRepo.listDecks(user.id);
    assert.equal(list.length, 3);
    assert.ok(list.some(d => d.name === 'Matemática::Álgebra::Logaritmos'));
    assert.ok(list.some(d => d.name === 'Matemática::Geometria::Plana'));
  } finally {
    cleanup();
  }
});

test('Real Anki: Geração correta de múltiplos cartões por nota Cloze', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_cloze', email: 'cloze@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const clozeNt = notetypes.find(n => n.kind === 'cloze')!;
    assert.ok(clozeNt);

    const deck = ankiRepo.createDeck(user.id, { name: 'Biologia::Citologia' });

    // Note with {{c1::mitocôndria}} and {{c2::ATP}}
    const result = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: clozeNt.id,
      fields: [
        'A {{c1::mitocôndria}} é responsável pela síntese de {{c2::ATP}} na respiração celular.',
        'Importante para o concurso CFO'
      ],
      tags: ['bio', 'citologia'],
    });

    assert.equal(result.cards.length, 2, 'Uma nota com c1 e c2 deve gerar exatamente 2 cartões!');
    assert.equal(result.cards[0].templateOrd, 0); // c1
    assert.equal(result.cards[1].templateOrd, 1); // c2

    // Render c1: c1 deve estar mascarado e c2 deve estar revelado
    const renderC1 = AnkiRenderer.renderCard(result.note, clozeNt, 0, deck.name);
    assert.ok(renderC1.questionHtml.includes('[...]') || renderC1.questionHtml.includes('cloze'));
    assert.ok(renderC1.questionHtml.includes('ATP'), 'No card 1, o cloze 2 não deve estar oculto!');

    // Render c2: c2 deve estar mascarado e c1 revelado
    const renderC2 = AnkiRenderer.renderCard(result.note, clozeNt, 1, deck.name);
    assert.ok(renderC2.questionHtml.includes('mitocôndria'), 'No card 2, o cloze 1 deve estar revelado!');
  } finally {
    cleanup();
  }
});

test('Real Anki: Scheduler FSRS com previsões dinâmicas e Undo atômico', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_fsrs', email: 'fsrs@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const basicNt = notetypes.find(n => n.name === 'Basic')!;
    const deck = ankiRepo.createDeck(user.id, { name: 'Física::Dinâmica' });

    const noteRes = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: basicNt.id,
      fields: ['Segunda Lei de Newton?', 'F = m * a'],
    });

    const card = noteRes.cards[0];
    assert.equal(card.queue, CardQueue.New);

    const scheduler = new AnkiScheduler();
    const previews = scheduler.getPreviewIntervals(card);

    assert.equal(previews.length, 4);
    assert.equal(previews[0].label, 'Again');
    assert.equal(previews[1].label, 'Hard');
    assert.equal(previews[2].label, 'Good');
    assert.equal(previews[3].label, 'Easy');

    // Previews formatted
    assert.ok(previews[0].intervalFormatted.length > 0);
    assert.ok(previews[2].intervalFormatted.length > 0);

    // Rate Good (3)
    const { updatedCard, revlog } = ankiRepo.rateCard(user.id, card.id, Rating.Good, 5000);
    assert.ok(updatedCard.reps >= 1);
    assert.equal(revlog.rating, Rating.Good);

    // Verify card in db is updated
    const freshCard = ankiRepo.getCard(user.id, card.id)!;
    assert.equal(freshCard.reps, 1);

    // Atomic Undo
    const undoRes = ankiRepo.undoLastReview(user.id, card.id);
    assert.ok(undoRes);
    assert.equal(undoRes.revertedCard.reps, 0, 'Após Undo, reps deve voltar para 0!');
    assert.equal(undoRes.revertedCard.queue, CardQueue.New, 'Após Undo, card deve voltar para New!');
  } finally {
    cleanup();
  }
});

test('Real Anki: Bury vs Suspend', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_bury', email: 'bury@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deck = ankiRepo.createDeck(user.id, { name: 'Química::Geral' });

    const n = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Número atômico do Carbono?', '6'],
    });
    const cardId = n.cards[0].id;

    // Bury
    const buried = ankiRepo.buryCard(user.id, cardId)!;
    assert.equal(buried.queue, CardQueue.UserBuried);

    // Study queue should NOT return buried cards
    const queue1 = ankiRepo.getStudyQueue(user.id, deck.id);
    assert.ok(!queue1.some(c => c.id === cardId));

    // Unbury
    const unburiedCount = ankiRepo.unburyCards(user.id, deck.id);
    assert.equal(unburiedCount, 1);

    const freshCard = ankiRepo.getCard(user.id, cardId)!;
    assert.equal(freshCard.queue, CardQueue.New);

    // Suspend
    const suspended = ankiRepo.suspendCard(user.id, cardId, true)!;
    assert.equal(suspended.queue, CardQueue.Suspended);

    // Unbury does NOT unsuspend a suspended card
    ankiRepo.unburyCards(user.id, deck.id);
    const stillSuspended = ankiRepo.getCard(user.id, cardId)!;
    assert.equal(stillSuspended.queue, CardQueue.Suspended);

    // Unsuspend
    const unsuspended = ankiRepo.suspendCard(user.id, cardId, false)!;
    assert.equal(unsuspended.queue, CardQueue.New);
  } finally {
    cleanup();
  }
});

test('Real Anki: Isolamento estrito Multi-Tenant entre User A e User B (Zero IDOR)', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const userA = userRepo.create({ username: 'user_a_anki', email: 'ua@cfo.test', passwordHash: 'hash' });
    const userB = userRepo.create({ username: 'user_b_anki', email: 'ub@cfo.test', passwordHash: 'hash' });

    ankiRepo.ensureDefaultDeckConfig(userA.id);
    ankiRepo.ensureDefaultDeckConfig(userB.id);
    const ntA = ankiRepo.ensureDefaultNoteTypes(userA.id)[0];
    const ntB = ankiRepo.ensureDefaultNoteTypes(userB.id)[0];

    const deckA = ankiRepo.createDeck(userA.id, { name: 'Segredos User A' });
    const noteA = ankiRepo.createNote(userA.id, {
      deckId: deckA.id,
      notetypeId: ntA.id,
      fields: ['Pergunta Secreta A', 'Resposta Secreta A'],
    });
    const cardA = noteA.cards[0];

    // User B tenta consultar deck do User A -> Deve retornar null
    const getDeckB = ankiRepo.getDeck(userB.id, deckA.id);
    assert.equal(getDeckB, null);

    // User B tenta consultar card do User A -> Deve retornar null
    const getCardB = ankiRepo.getCard(userB.id, cardA.id);
    assert.equal(getCardB, null);

    // User B tenta pontuar card do User A -> Deve lançar erro CARD_NOT_FOUND
    assert.throws(() => {
      ankiRepo.rateCard(userB.id, cardA.id, Rating.Good);
    }, /CARD_NOT_FOUND/);

    // User B tenta excluir deck do User A -> Retorna false e não exclui
    const delRes = ankiRepo.deleteDeck(userB.id, deckA.id);
    assert.equal(delRes, false);
    assert.ok(ankiRepo.getDeck(userA.id, deckA.id));
  } finally {
    cleanup();
  }
});

test('Real Anki: Sintaxe de busca Anki (Search Parser)', () => {
  const query = 'deck:"Matemática::Logaritmos" tag:dificil is:due -is:suspended flag:1 termo';
  const tokens = AnkiSearch.parseQuery(query);

  assert.equal(tokens.deckPatterns.length, 1);
  assert.equal(tokens.deckPatterns[0].pattern, 'matemática::logaritmos');
  assert.equal(tokens.deckPatterns[0].negated, false);

  assert.equal(tokens.tagPatterns.length, 1);
  assert.equal(tokens.tagPatterns[0].pattern, 'dificil');

  assert.equal(tokens.isFilters.length, 2);
  assert.equal(tokens.isFilters[0].status, 'due');
  assert.equal(tokens.isFilters[0].negated, false);
  assert.equal(tokens.isFilters[1].status, 'suspended');
  assert.equal(tokens.isFilters[1].negated, true);

  assert.equal(tokens.flags.length, 1);
  assert.equal(tokens.flags[0].flag, 1);

  assert.equal(tokens.keywords.length, 1);
  assert.equal(tokens.keywords[0].term, 'termo');
});

test('Real Anki: Exportação e Importação de pacote .apkg (ZIP + collection.anki2)', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_apkg', email: 'apkg@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deck = ankiRepo.createDeck(user.id, { name: 'Português::Gramática' });

    const note = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['O que é aposto?', 'Termo que explica ou especifica outro termo.'],
      tags: ['gramatica', 'cfo'],
    });

    const card = note.cards[0];

    // Exporta pacote .apkg
    const apkgBuffer = await AnkiApkgService.exportApkg({
      decks: [deck],
      notetypes,
      notes: [note.note],
      cards: [card],
    });

    assert.ok(apkgBuffer.length > 500, 'Arquivo .apkg deve ter conteúdo binário ZIP válido');

    // The app's own parser is permissive; inspect the collection metadata that
    // Anki Desktop decodes when importing the package.
    const zip = await JSZip.loadAsync(apkgBuffer);
    const collection = zip.file('collection.anki2');
    assert.ok(collection, 'Pacote deve conter collection.anki2');
    const tempCollection = path.join(os.tmpdir(), `anki-export-check-${crypto.randomUUID()}.anki2`);
    fs.writeFileSync(tempCollection, await collection!.async('nodebuffer'));
    try {
      const exportedDb = new DatabaseSync(tempCollection, { readOnly: true });
      const col = exportedDb.prepare('SELECT decks FROM col').get() as { decks: string };
      const decks = JSON.parse(col.decks) as Record<string, Record<string, unknown>>;
      assert.ok(Object.values(decks).length >= 2, 'Export deve incluir Default e o baralho selecionado');
      for (const deckMetadata of Object.values(decks)) {
        for (const counter of ['lrnToday', 'revToday', 'newToday', 'timeToday']) {
          assert.deepEqual(deckMetadata[counter], [0, 0], `${counter} deve seguir o formato [dia, quantidade]`);
        }
      }
      exportedDb.close();
    } finally {
      fs.rmSync(tempCollection, { force: true });
    }

    // Faz o parse do .apkg gerado e verifica compatibilidade reversa
    const parsed = await AnkiApkgService.parseApkg(apkgBuffer);
    assert.equal(parsed.decks.length, 1);
    assert.equal(parsed.decks[0].name, 'Português::Gramática');
    assert.equal(parsed.notes.length, 1);
    assert.equal(parsed.notes[0].fields[0], 'O que é aposto?');
    assert.equal(parsed.notes[0].fields[1], 'Termo que explica ou especifica outro termo.');
  } finally {
    cleanup();
  }
});

test('Real Anki: Renderização de fórmulas matemáticas com KaTeX', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_math', email: 'math@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const basicNt = notetypes[0];
    const deck = ankiRepo.createDeck(user.id, { name: 'Física::Eletrostática' });

    const note = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: basicNt.id,
      fields: [
        'Qual é a lei de Coulomb? $F = k \\frac{|q_1 q_2|}{r^2}$',
        'A força eletrostática entre duas cargas pontiformes: $$F = \\frac{1}{4\\pi\\varepsilon_0} \\frac{q_1 q_2}{r^2}$$',
      ],
      tags: ['fisica', 'cfo'],
    });

    const rendered = AnkiRenderer.renderCard(note.note, basicNt, 0, deck.name);
    assert.ok(rendered.questionHtml.includes('katex'), 'Pergunta deve conter HTML renderizado do KaTeX');
    assert.ok(rendered.answerHtml.includes('katex-display'), 'Resposta deve conter bloco math KaTeX displayMode');
  } finally {
    cleanup();
  }
});

test('Real Anki: Persistência e atualização de Configurações FSRS do Baralho', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_cfg', email: 'cfg@cfo.test', passwordHash: 'hash' });
    const initialConfig = ankiRepo.ensureDefaultDeckConfig(user.id);
    assert.equal(initialConfig.config.desiredRetention, 0.90);
    assert.equal(initialConfig.config.newPerDay, 20);

    // Update config with custom FSRS settings
    const updated = ankiRepo.updateDeckConfig(user.id, initialConfig.id, {
      desiredRetention: 0.95,
      newPerDay: 35,
      maxReviewsPerDay: 300,
      learningSteps: [2, 15],
      relearningSteps: [15],
      buryNewSiblings: false,
    });

    assert.equal(updated.config.desiredRetention, 0.95);
    assert.equal(updated.config.newPerDay, 35);
    assert.equal(updated.config.maxReviewsPerDay, 300);
    assert.deepEqual(updated.config.learningSteps, [2, 15]);
    assert.equal(updated.config.buryNewSiblings, false);

    // Reload from database and confirm persistence
    const reloaded = ankiRepo.getDeckConfig(user.id, initialConfig.id);
    assert.equal(reloaded.config.desiredRetention, 0.95);
    assert.equal(reloaded.config.newPerDay, 35);
    assert.equal(reloaded.config.maxReviewsPerDay, 300);
    assert.deepEqual(reloaded.config.learningSteps, [2, 15]);
    assert.equal(reloaded.config.buryNewSiblings, false);
  } finally {
    cleanup();
  }
});

test('Real Anki: Study Queue carrega cartões de baralhos pais e sub-baralhos ::', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_queue', email: 'queue@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const basicNt = notetypes[0];

    // Parent deck
    const parentDeck = ankiRepo.createDeck(user.id, { name: 'Física' });
    // Subdeck
    const subdeck = ankiRepo.createDeck(user.id, { name: 'Física::Mecânica::Cinemática' });

    // Note in subdeck
    ankiRepo.createNote(user.id, {
      deckId: subdeck.id,
      notetypeId: basicNt.id,
      fields: ['O que é velocidade média?', 'Razão entre o deslocamento e o tempo.'],
      tags: ['cinematica'],
    });

    // 1. Study from subdeck directly
    const queueSub = ankiRepo.getStudyQueue(user.id, subdeck.id);
    assert.equal(queueSub.length, 1);
    assert.equal(queueSub[0].deckId, subdeck.id);

    // 2. Study from parent deck (hierarchical roll-up)
    const queueParent = ankiRepo.getStudyQueue(user.id, parentDeck.id);
    assert.equal(queueParent.length, 1, 'Fila do baralho pai deve incluir cartões dos sub-baralhos');

    // 3. Study from virtual node id
    const queueVirtual = ankiRepo.getStudyQueue(user.id, 'virtual_Física');
    assert.equal(queueVirtual.length, 1, 'Nó virtual deve encontrar cartões com prefixo do baralho');
  } finally {
    cleanup();
  }
});

test('Real Anki FSRS Upgrade: Persistência de learning_steps multi-passo e Undo exato', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_steps', email: 'steps@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deck = ankiRepo.createDeck(user.id, { name: 'Química::Termoquímica' });
    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['O que é entalpia?', 'Conteúdo global de energia à pressão constante.'],
    });

    const cardId = cards[0].id;

    // 1. First Good -> enters Learn step 1 (10m)
    const step1 = ankiRepo.rateCard(user.id, cardId, Rating.Good, 2000);
    assert.equal(step1.updatedCard.queue, CardQueue.Learn);
    assert.equal(step1.updatedCard.cardType, CardType.Learn);
    assert.equal(step1.updatedCard.learningSteps, 1);

    const reloaded1 = ankiRepo.getCard(user.id, cardId)!;
    assert.equal(reloaded1.learningSteps, 1, 'learning_steps deve persistir no banco entre revisões');

    // 2. Second Good -> graduates from Learn step 1 to Review!
    const step2 = ankiRepo.rateCard(user.id, cardId, Rating.Good, 2500);
    assert.equal(step2.updatedCard.queue, CardQueue.Review);
    assert.equal(step2.updatedCard.cardType, CardType.Review);
    assert.equal(step2.updatedCard.learningSteps, 0);
    assert.ok(step2.updatedCard.intervalDays >= 1);

    // 3. Undo reverts back to Learn step 1!
    const undo = ankiRepo.undoLastReview(user.id, cardId)!;
    assert.equal(undo.revertedCard.queue, CardQueue.Learn);
    assert.equal(undo.revertedCard.learningSteps, 1);
  } finally {
    cleanup();
  }
});

test('Real Anki FSRS Upgrade: Pesos customizados, modo SM-2 fallback e memória FSRS', () => {
  const parsedOk = parseFsrsWeights([...DEFAULT_FSRS_WEIGHTS]);
  assert.equal(parsedOk.valid, true);
  assert.ok(Array.isArray(parsedOk.weights));

  const parsedBad = parseFsrsWeights([1, 2, 3]);
  assert.equal(parsedBad.valid, false);

  // SM-2 fallback when enableFSRS is false
  const sm2Scheduler = new AnkiScheduler({
    ...DEFAULT_DECK_CONFIG,
    enableFSRS: false,
    graduatingInterval: 2,
    easyInterval: 5,
    startingEase: 2.5,
  });

  const now = new Date('2026-11-19T12:00:00Z');
  const mockNewCard: any = {
    id: 'c1',
    userId: 'u1',
    noteId: 'n1',
    deckId: 'd1',
    templateOrd: 0,
    queue: CardQueue.New,
    cardType: CardType.New,
    due: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    reps: 0,
    lapses: 0,
    learningSteps: 0,
    difficulty: 0,
    stability: 0,
    flags: 0,
    isMarked: false,
    importance: 'normal',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  const previews = sm2Scheduler.getPreviewIntervals(mockNewCard, now);
  assert.equal(previews[3].intervalDays, 5, 'Easy no modo SM-2 deve usar easyInterval=5');

  const ratedEasy = sm2Scheduler.rateCard(mockNewCard, Rating.Easy, now);
  assert.equal(ratedEasy.updatedCard.intervalDays, 5);
  assert.equal(ratedEasy.updatedCard.queue, CardQueue.Review);

  // FSRS memory state on reviewed card
  const fsrsScheduler = new AnkiScheduler(DEFAULT_DECK_CONFIG);
  const r1 = fsrsScheduler.rateCard(mockNewCard, Rating.Easy, now);
  const mem = fsrsScheduler.getMemoryState(r1.updatedCard, new Date(now.getTime() + 86400000));
  assert.ok(mem);
  assert.ok(mem.retrievability > 0 && mem.retrievability <= 1);
  assert.ok(mem.stability > 0);
  assert.ok(mem.difficulty >= 1 && mem.difficulty <= 10);
});

test('Real Anki FSRS Upgrade: Preview/Rate sincronizados, Reagendamento e Stats filtrados por baralho', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  let server: http.Server | null = null;

  try {
    const user = userRepo.create({ username: 'aluno_fsrs_api', email: 'fsrs_api@cfo.test', passwordHash: 'hash' });
    const otherUser = userRepo.create({ username: 'aluno_other', email: 'other@cfo.test', passwordHash: 'hash' });
    const defaultCfg = ankiRepo.ensureDefaultDeckConfig(user.id);
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const deckA = ankiRepo.createDeck(user.id, { name: 'Matemática' });
    const deckB = ankiRepo.createDeck(user.id, { name: 'História' });

    const noteA = ankiRepo.createNote(user.id, {
      deckId: deckA.id,
      notetypeId: notetypes[0].id,
      fields: ['Derivada de x²?', '2x'],
    });
    const noteB = ankiRepo.createNote(user.id, {
      deckId: deckB.id,
      notetypeId: notetypes[0].id,
      fields: ['Ano da Proclamação da República?', '1889'],
    });

    // Update user's Padrão config (deckA has configId = null so it inherits Padrão!)
    ankiRepo.updateDeckConfig(user.id, defaultCfg.id, {
      desiredRetention: 0.96,
      learningSteps: [3, 15],
    });

    const app = express();
    app.use(express.json());
    let currentUserId = user.id;
    app.use('/api/anki', createAnkiRouter((req: any, _res: any, next: any) => {
      req.user = { userId: currentUserId, role: 'cadet' };
      next();
    }, () => ankiRepo));

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as any).port;

    // 1. /cards/:id/render uses deck's Padrão config (learningSteps: [3, 15])
    const renderRes = await fetch(`http://127.0.0.1:${port}/api/anki/cards/${noteA.cards[0].id}/render`);
    assert.equal(renderRes.status, 200);
    const renderJson = await renderRes.json() as any;
    assert.equal(renderJson.intervals[0].intervalFormatted, '3m', 'Again deve refletir learningSteps[0]=3m');
    assert.equal(renderJson.intervals[2].intervalFormatted, '15m', 'Good deve refletir learningSteps[1]=15m');

    // 2. Reject invalid fsrsWeights
    const badCfgRes = await fetch(`http://127.0.0.1:${port}/api/anki/deck-configs/${defaultCfg.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { fsrsWeights: [1, 2, 3] } }),
    });
    assert.equal(badCfgRes.status, 400);

    // 3. Rate card A twice to graduate to Review, then reschedule with lower retention (0.75 -> longer interval)
    ankiRepo.rateCard(user.id, noteA.cards[0].id, Rating.Easy, 1500);
    ankiRepo.rateCard(user.id, noteB.cards[0].id, Rating.Good, 1500);

    const statsDeckA = ankiRepo.getStatsSummary(user.id, deckA.id);
    assert.equal(statsDeckA.totalCards, 1);
    assert.equal(statsDeckA.againPercent + statsDeckA.hardPercent + statsDeckA.goodPercent + statsDeckA.easyPercent, 100);
    assert.equal(statsDeckA.easyPercent, 100, 'Stats filtrados por deckA devem contar apenas revlogs de deckA');
    assert.ok(statsDeckA.fsrsSummary && statsDeckA.fsrsSummary.reviewedCards === 1);

    // Lower retention -> reschedule via API
    ankiRepo.updateDeckConfig(user.id, defaultCfg.id, { desiredRetention: 0.75 });
    const reschedRes = await fetch(`http://127.0.0.1:${port}/api/anki/deck-configs/${defaultCfg.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: deckA.id }),
    });
    assert.equal(reschedRes.status, 200);
    const reschedJson = await reschedRes.json() as any;
    assert.equal(reschedJson.updatedCount, 1);

    // IDOR check: otherUser trying to reschedule deckA gets 404
    currentUserId = otherUser.id;
    const idorRes = await fetch(`http://127.0.0.1:${port}/api/anki/deck-configs/${defaultCfg.id}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: deckA.id }),
    });
    assert.equal(idorRes.status, 404);
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    cleanup();
  }
});


