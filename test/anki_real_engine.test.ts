process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { AnkiScheduler } from '../src/services/anki/ankiScheduler';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';
import { AnkiSearch } from '../src/services/anki/ankiSearch';
import { AnkiApkgService } from '../src/services/anki/ankiApkgService';
import { CardQueue, CardType, Rating, CardFlag } from '../src/services/anki/ankiTypes';

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


