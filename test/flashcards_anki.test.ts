process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

/**
 * CFO CBMERJ - Automated Test Suite for Flashcards Anki System
 * 
 * Verifies:
 * 1. Absolute Isolation per User (User A x User B)
 * 2. Cross-user IDOR Defense (Subject, Deck, Card, Reviews)
 * 3. Relational Ownership Enforcement (cannot attach deck/card to another user's entity)
 * 4. SuperMemo-2 / Anki Spaced Repetition Algorithm & History Audit
 * 5. Cascade Delete & Orphan Prevention
 * 6. Non-destructive Migration of Legacy Flashcard State
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseService } from '../src/db/database';
import { UserRepository, FlashcardRepository } from '../src/db/repositories';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-flashcards-test-'));
  const dbFile = path.join(tempDir, 'test_flashcards.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const flashcardRepo = new FlashcardRepository(rawDb);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, rawDb, userRepo, flashcardRepo, cleanup };
}

test('Flashcards Anki: Isolamento absoluto entre User A e User B', () => {
  const { userRepo, flashcardRepo, cleanup } = createTempDb();

  try {
    const userA = userRepo.create({ username: 'cadete_a', email: 'a@cfo.test', passwordHash: 'hashA' });
    const userB = userRepo.create({ username: 'cadete_b', email: 'b@cfo.test', passwordHash: 'hashB' });

    // User A e User B criam disciplinas com o mesmo nome
    const subA = flashcardRepo.createSubject(userA.id, { name: 'Matemática', description: 'Cálculo A' });
    const subB = flashcardRepo.createSubject(userB.id, { name: 'Matemática', description: 'Cálculo B' });

    assert.notEqual(subA.id, subB.id);

    // Listagem isolada
    const listA = flashcardRepo.listSubjects(userA.id);
    const listB = flashcardRepo.listSubjects(userB.id);

    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, subA.id);
    assert.equal(listA[0].description, 'Cálculo A');

    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, subB.id);
    assert.equal(listB[0].description, 'Cálculo B');

    // User A cria baralho e card
    const deckA = flashcardRepo.createDeck(userA.id, { subjectId: subA.id, name: 'Logaritmos' });
    const cardA = flashcardRepo.createCard(userA.id, { deckId: deckA.id, front: 'O que é log?', back: 'Expoente' });

    // User B tenta consultar dados de User A -> deve retornar null (404 no controller)
    assert.equal(flashcardRepo.getSubject(userB.id, subA.id), null);
    assert.equal(flashcardRepo.getDeck(userB.id, deckA.id), null);
    assert.equal(flashcardRepo.getCard(userB.id, cardA.id), null);

    // User B tenta editar dados de User A -> deve retornar null
    assert.equal(flashcardRepo.updateSubject(userB.id, subA.id, { name: 'Invasão' }), null);
    assert.equal(flashcardRepo.updateDeck(userB.id, deckA.id, { name: 'Invasão' }), null);
    assert.equal(flashcardRepo.updateCard(userB.id, cardA.id, { front: 'Invasão' }), null);

    // User B tenta excluir dados de User A -> deve retornar falha e preservar o registro
    const deleteSubResult = flashcardRepo.deleteSubject(userB.id, subA.id);
    assert.equal(deleteSubResult.deleted, false);

    const deleteDeckResult = flashcardRepo.deleteDeck(userB.id, deckA.id);
    assert.equal(deleteDeckResult.deleted, false);

    const deleteCardResult = flashcardRepo.deleteCard(userB.id, cardA.id);
    assert.equal(deleteCardResult, false);

    // Confirma que os dados de User A permanecem 100% intactos
    const preservedCard = flashcardRepo.getCard(userA.id, cardA.id);
    assert.notEqual(preservedCard, null);
    assert.equal(preservedCard?.front, 'O que é log?');
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Defesa contra IDOR em relacionamentos cruzados', () => {
  const { userRepo, flashcardRepo, cleanup } = createTempDb();

  try {
    const userA = userRepo.create({ username: 'cadete_a2', email: 'a2@cfo.test', passwordHash: 'hashA' });
    const userB = userRepo.create({ username: 'cadete_b2', email: 'b2@cfo.test', passwordHash: 'hashB' });

    const subA = flashcardRepo.createSubject(userA.id, { name: 'Química' });
    const deckA = flashcardRepo.createDeck(userA.id, { subjectId: subA.id, name: 'Estequiometria' });

    // User B tenta criar um baralho associado à disciplina de User A -> Deve lançar SUBJECT_NOT_FOUND
    assert.throws(
      () => flashcardRepo.createDeck(userB.id, { subjectId: subA.id, name: 'Baralho Malicioso' }),
      /SUBJECT_NOT_FOUND/
    );

    // User B tenta criar um flashcard associado ao baralho de User A -> Deve lançar DECK_NOT_FOUND
    assert.throws(
      () => flashcardRepo.createCard(userB.id, { deckId: deckA.id, front: 'Ataque', back: 'Ataque' }),
      /DECK_NOT_FOUND/
    );

    // User B tenta submeter review no flashcard de User A -> Deve lançar FLASHCARD_NOT_FOUND
    const cardA = flashcardRepo.createCard(userA.id, { deckId: deckA.id, front: 'Pergunta Legítima', back: 'Resposta' });
    assert.throws(
      () => flashcardRepo.reviewCard(userB.id, cardA.id, 4),
      /FLASHCARD_NOT_FOUND/
    );
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Algoritmo de repetição espaçada SM-2 e histórico auditável', () => {
  const { userRepo, flashcardRepo, rawDb, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_srs', email: 'srs@cfo.test', passwordHash: 'hash' });
    const sub = flashcardRepo.createSubject(user.id, { name: 'Física' });
    const deck = flashcardRepo.createDeck(user.id, { subjectId: sub.id, name: 'Cinemática' });
    const card = flashcardRepo.createCard(user.id, {
      deckId: deck.id,
      front: 'Equação de Torricelli?',
      back: 'v² = v0² + 2aΔs',
    });

    assert.equal(card.status, 'new');
    assert.equal(card.intervalDays, 0);
    assert.equal(card.easeFactor, 2.5);
    assert.equal(card.lapses, 0);
    assert.equal(card.reviewCount, 0);

    // 1. Avaliação 1 (Errei / Again)
    const rev1 = flashcardRepo.reviewCard(user.id, card.id, 1);
    assert.equal(rev1.card.status, 'learning');
    assert.equal(rev1.card.intervalDays, 0);
    assert.equal(rev1.card.lapses, 1);
    assert.equal(rev1.card.reviewCount, 1);
    assert.equal(rev1.card.easeFactor, 2.30); // 2.50 - 0.20
    assert.equal(rev1.review.rating, 1);
    assert.equal(rev1.review.previousInterval, 0);
    assert.equal(rev1.review.newInterval, 0);

    // 2. Avaliação 2 (Difícil / Hard)
    const rev2 = flashcardRepo.reviewCard(user.id, card.id, 2);
    assert.equal(rev2.card.status, 'review');
    assert.equal(rev2.card.intervalDays, 1);
    assert.equal(rev2.card.reviewCount, 2);
    assert.equal(rev2.card.easeFactor, 2.15); // 2.30 - 0.15

    // 3. Avaliação 3 (Bom / Good)
    const rev3 = flashcardRepo.reviewCard(user.id, card.id, 3);
    assert.equal(rev3.card.status, 'review');
    assert.equal(rev3.card.intervalDays, 3);
    assert.equal(rev3.card.reviewCount, 3);

    // 4. Avaliação 4 (Fácil / Easy)
    const rev4 = flashcardRepo.reviewCard(user.id, card.id, 4);
    assert.ok(rev4.card.intervalDays >= 6);
    assert.equal(rev4.card.reviewCount, 4);
    assert.ok(rev4.card.easeFactor > 2.15);

    // Verifica auditoria na tabela flashcard_reviews
    const reviewHistory = rawDb.prepare(`
      SELECT * FROM flashcard_reviews WHERE user_id = ? AND flashcard_id = ? ORDER BY reviewed_at ASC
    `).all(user.id, card.id) as any[];

    assert.equal(reviewHistory.length, 4);
    assert.equal(reviewHistory[0].rating, 1);
    assert.equal(reviewHistory[1].rating, 2);
    assert.equal(reviewHistory[2].rating, 3);
    assert.equal(reviewHistory[3].rating, 4);
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Exclusão em cascata sem deixar registros órfãos', () => {
  const { userRepo, flashcardRepo, rawDb, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_cascade', email: 'cascade@cfo.test', passwordHash: 'hash' });
    const sub = flashcardRepo.createSubject(user.id, { name: 'Biologia' });
    const deck1 = flashcardRepo.createDeck(user.id, { subjectId: sub.id, name: 'Botânica' });
    const deck2 = flashcardRepo.createDeck(user.id, { subjectId: sub.id, name: 'Citologia' });

    const card1 = flashcardRepo.createCard(user.id, { deckId: deck1.id, front: 'P1', back: 'R1' });
    const card2 = flashcardRepo.createCard(user.id, { deckId: deck1.id, front: 'P2', back: 'R2' });
    const card3 = flashcardRepo.createCard(user.id, { deckId: deck2.id, front: 'P3', back: 'R3' });

    flashcardRepo.reviewCard(user.id, card1.id, 3);
    flashcardRepo.reviewCard(user.id, card2.id, 4);

    // Estatísticas prévias de cascata para o modal de confirmação
    const cascadeStats = flashcardRepo.getSubjectCascadeStats(user.id, sub.id);
    assert.deepEqual(cascadeStats, { deckCount: 2, cardCount: 3 });

    // Exclusão da disciplina
    const deleteResult = flashcardRepo.deleteSubject(user.id, sub.id);
    assert.equal(deleteResult.deleted, true);
    assert.equal(deleteResult.deckCount, 2);
    assert.equal(deleteResult.cardCount, 3);

    // Confirmação de ausência de registros órfãos no banco de dados
    const remainingDecks = rawDb.prepare('SELECT COUNT(*) as cnt FROM flashcard_decks WHERE user_id = ?').get(user.id) as any;
    const remainingCards = rawDb.prepare('SELECT COUNT(*) as cnt FROM flashcards WHERE user_id = ?').get(user.id) as any;
    const remainingReviews = rawDb.prepare('SELECT COUNT(*) as cnt FROM flashcard_reviews WHERE user_id = ?').get(user.id) as any;

    assert.equal(remainingDecks.cnt, 0);
    assert.equal(remainingCards.cnt, 0);
    assert.equal(remainingReviews.cnt, 0);
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Migração segura e não destrutiva de student_flashcard_state', () => {
  const { userRepo, flashcardRepo, rawDb, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'aluno_legado', email: 'legado@cfo.test', passwordHash: 'hash' });

    // Popula estado legado na tabela antiga student_flashcard_state
    const legacyDecks = [
      { id: 'deck_legado_quimica', title: 'Química Geral', subject: 'Química', description: 'Deck importado' },
      { id: 'deck_legado_historia', title: 'Segundo Reinado', subject: 'História', description: 'História do Brasil' },
    ];
    const legacyCards = [
      { id: 'card_legado_1', deckId: 'deck_legado_quimica', question: 'Massa do elétron?', answer: 'Desprezível' },
      { id: 'card_legado_2', deckId: 'deck_legado_historia', question: 'Ano do golpe da maioridade?', answer: '1840' },
    ];

    const now = new Date().toISOString();
    rawDb.prepare(`
      INSERT INTO student_flashcard_state (user_id, decks_json, cards_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, JSON.stringify(legacyDecks), JSON.stringify(legacyCards), now, now);

    // Executa migração
    const result = flashcardRepo.migrateLegacyState(user.id);
    assert.equal(result.migratedDecks, 2);
    assert.equal(result.migratedCards, 2);

    // Verifica que disciplinas foram criadas
    const subjects = flashcardRepo.listSubjects(user.id);
    assert.equal(subjects.length, 2);
    const subNames = subjects.map((s) => s.name);
    assert.ok(subNames.includes('Química'));
    assert.ok(subNames.includes('História'));

    // Verifica que baralhos e cards estão acessíveis
    const decks = flashcardRepo.listDecks(user.id);
    assert.equal(decks.length, 2);

    const { cards } = flashcardRepo.listCards(user.id);
    assert.equal(cards.length, 2);
    const questions = cards.map((c) => c.front);
    assert.ok(questions.includes('Massa do elétron?'));
    assert.ok(questions.includes('Ano do golpe da maioridade?'));
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Integração HTTP REST com isolamento e resposta 404 para IDOR', async () => {
  const http = await import('node:http');
  const { app } = await import('../server');
  const { AuthService } = await import('../src/db/authService');
  const { getDb } = await import('../src/db/database');

  const authService = new AuthService(getDb());
  await authService.ensureDefaultAccounts();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    const bcrypt = await import('bcryptjs');
    const { UserRepository } = await import('../src/db/repositories');
    const userRepo = new UserRepository(getDb().getRawDb());

    const passHash = await bcrypt.hash('SenhaHttp123!', 10);
    const suffix = Date.now();
    const userHttpA = userRepo.create({
      username: `user_a_${suffix}`,
      email: `user_a_${suffix}@cfo.test`,
      passwordHash: passHash,
      role: 'cadet',
      status: 'active',
    });
    const userHttpB = userRepo.create({
      username: `user_b_${suffix}`,
      email: `user_b_${suffix}@cfo.test`,
      passwordHash: passHash,
      role: 'cadet',
      status: 'active',
    });

    const loginA = await authService.login(userHttpA.username, 'SenhaHttp123!');
    const tokenA = loginA.token;

    const loginB = await authService.login(userHttpB.username, 'SenhaHttp123!');
    const tokenB = loginB.token;

    assert.ok(tokenA, 'Token do Usuário A deve ser gerado');
    assert.ok(tokenB, 'Token do Usuário B deve ser gerado');

    // 2. Usuário A cria uma disciplina
    const createSubRes = await fetch(`${baseUrl}/api/flashcards/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'História Militar', description: 'CBMERJ' }),
    });
    assert.equal(createSubRes.status, 201);
    const subData = await createSubRes.json();
    const subjectId = subData.subject.id;

    // 3. Usuário A cria um baralho nesta disciplina
    const createDeckRes = await fetch(`${baseUrl}/api/flashcards/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ subjectId, name: 'Origens do Corpo de Bombeiros' }),
    });
    assert.equal(createDeckRes.status, 201);
    const deckData = await createDeckRes.json();
    const deckId = deckData.deck.id;

    // 4. Usuário A cria um flashcard neste baralho
    const createCardRes = await fetch(`${baseUrl}/api/flashcards/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ deckId, front: 'Ano de criação do CBMERJ?', back: '1856 (Decreto Imperial 1.775)' }),
    });
    assert.equal(createCardRes.status, 201);
    const cardData = await createCardRes.json();
    const cardId = cardData.card.id;

    // 5. TESTES CRÍTICOS DE IDOR (Usuário B tentando acessar/alterar recursos do Usuário A)
    // 5.1 GET Disciplina do Usuário A por Usuário B -> DEVE RETORNAR 404
    const getSubOther = await fetch(`${baseUrl}/api/flashcards/subjects/${subjectId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getSubOther.status, 404);

    // 5.2 PATCH Disciplina do Usuário A por Usuário B -> DEVE RETORNAR 404
    const patchSubOther = await fetch(`${baseUrl}/api/flashcards/subjects/${subjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ name: 'Hackeado' }),
    });
    assert.equal(patchSubOther.status, 404);

    // 5.3 DELETE Disciplina do Usuário A por Usuário B -> DEVE RETORNAR 404
    const deleteSubOther = await fetch(`${baseUrl}/api/flashcards/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(deleteSubOther.status, 404);

    // 5.4 GET Baralho do Usuário A por Usuário B -> DEVE RETORNAR 404
    const getDeckOther = await fetch(`${baseUrl}/api/flashcards/decks/${deckId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getDeckOther.status, 404);

    // 5.5 Criar Baralho associando à disciplina do Usuário A -> DEVE RETORNAR 404
    const createDeckOther = await fetch(`${baseUrl}/api/flashcards/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ subjectId, name: 'Baralho Não Autorizado' }),
    });
    assert.equal(createDeckOther.status, 404);

    // 5.6 GET Flashcard do Usuário A por Usuário B -> DEVE RETORNAR 404
    const getCardOther = await fetch(`${baseUrl}/api/flashcards/cards/${cardId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getCardOther.status, 404);

    // 5.7 Review no Flashcard do Usuário A por Usuário B -> DEVE RETORNAR 404
    const reviewOther = await fetch(`${baseUrl}/api/flashcards/cards/${cardId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ rating: 4 }),
    });
    assert.equal(reviewOther.status, 404);

    // 6. Usuário A legítimo executa revisão SM-2 com sucesso -> 200
    const reviewCadet = await fetch(`${baseUrl}/api/flashcards/cards/${cardId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ rating: 3 }),
    });
    assert.equal(reviewCadet.status, 200);
    const revResult = await reviewCadet.json();
    assert.equal(revResult.success, true);
    assert.equal(revResult.card.status, 'review');
    assert.equal(revResult.card.intervalDays, 1);

    // 7. Usuário A exclui a disciplina -> cascata limpa baralhos e cartões
    const deleteSubCadet = await fetch(`${baseUrl}/api/flashcards/subjects/${subjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(deleteSubCadet.status, 200);
    const delResult = await deleteSubCadet.json();
    assert.equal(delResult.success, true);
    assert.equal(delResult.deckCount, 1);
    assert.equal(delResult.cardCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Flashcards Anki: Lote atômico, fila consolidada por disciplina, previsão e heatmap', () => {
  const { userRepo, flashcardRepo, cleanup } = createTempDb();

  try {
    const userA = userRepo.create({ username: 'cadete_batch_a', email: 'batch_a@cfo.test', passwordHash: 'hashA' });
    const userB = userRepo.create({ username: 'cadete_batch_b', email: 'batch_b@cfo.test', passwordHash: 'hashB' });

    const subA = flashcardRepo.createSubject(userA.id, { name: 'Física', description: 'Termodinâmica' });
    const deckA1 = flashcardRepo.createDeck(userA.id, { subjectId: subA.id, name: 'Calorimetria' });
    const deckA2 = flashcardRepo.createDeck(userA.id, { subjectId: subA.id, name: 'Gases' });

    // Inserção em lote para User A
    const batchCards = flashcardRepo.createCardsBatch(userA.id, deckA1.id, [
      { front: 'Defina calor latente', back: 'Calor necessário para mudança de fase' },
      { front: 'Fórmula da capacidade térmica', back: 'C = m * c' },
    ]);
    assert.equal(batchCards.length, 2);
    assert.equal(batchCards[0].deckId, deckA1.id);
    assert.equal(batchCards[0].subjectId, subA.id);

    // User B tenta inserir no deck de User A -> DEVE LANÇAR ERRO DECK_NOT_FOUND
    assert.throws(() => {
      flashcardRepo.createCardsBatch(userB.id, deckA1.id, [
        { front: 'Invasor', back: 'Bloqueado' }
      ]);
    }, /DECK_NOT_FOUND/);

    // Insere cartão no deck A2
    flashcardRepo.createCard(userA.id, { deckId: deckA2.id, front: 'Equação de Clapeyron', back: 'PV = nRT' });

    // Fila consolidada da disciplina Física (deve agregar deckA1 e deckA2)
    const queueA = flashcardRepo.getSubjectStudyQueue(userA.id, subA.id);
    assert.equal(queueA.length, 3);

    // User B tenta buscar fila da matéria de User A -> DEVE LANÇAR SUBJECT_NOT_FOUND
    assert.throws(() => {
      flashcardRepo.getSubjectStudyQueue(userB.id, subA.id);
    }, /SUBJECT_NOT_FOUND/);

    // Simula 4 falhas (lapses) no primeiro cartão para virar leech
    for (let i = 0; i < 4; i++) {
      flashcardRepo.reviewCard(userA.id, batchCards[0].id, 1);
    }
    const updatedCard = flashcardRepo.getCard(userA.id, batchCards[0].id);
    assert.equal(updatedCard?.lapses, 4);

    // Estatísticas de previsão (Forecast)
    const forecast = flashcardRepo.getForecastStats(userA.id);
    assert.equal(forecast.leechCount, 1);
    assert.ok(forecast.dueToday >= 1);

    // Heatmap
    const heatmap = flashcardRepo.getHeatmapStats(userA.id, 30);
    assert.ok(Array.isArray(heatmap));
    assert.ok(heatmap.length >= 1);
    assert.ok(heatmap[0].count >= 4);

    // User B não vê os dados de User A
    const forecastB = flashcardRepo.getForecastStats(userB.id);
    assert.equal(forecastB.leechCount, 0);
    assert.equal(forecastB.dueToday, 0);
  } finally {
    cleanup();
  }
});

test('Flashcards Anki: Endpoints HTTP de Lote, Fila por Matéria, Heatmap e Previsão', async () => {
  const http = await import('node:http');
  const { app } = await import('../server');
  const { AuthService } = await import('../src/db/authService');
  const { getDb } = await import('../src/db/database');
  const bcrypt = await import('bcryptjs');
  const { UserRepository } = await import('../src/db/repositories');

  const authService = new AuthService(getDb());
  await authService.ensureDefaultAccounts();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  try {
    const userRepo = new UserRepository(getDb().getRawDb());
    const passHash = await bcrypt.hash('SenhaBatch123!', 10);
    const suffix = Date.now();
    const userA = userRepo.create({
      username: `batch_u1_${suffix}`,
      email: `batch_u1_${suffix}@cfo.test`,
      passwordHash: passHash,
      role: 'cadet',
      status: 'active',
    });
    const userB = userRepo.create({
      username: `batch_u2_${suffix}`,
      email: `batch_u2_${suffix}@cfo.test`,
      passwordHash: passHash,
      role: 'cadet',
      status: 'active',
    });

    const loginA = await authService.login(userA.username, 'SenhaBatch123!');
    const tokenA = loginA.token;
    const loginB = await authService.login(userB.username, 'SenhaBatch123!');
    const tokenB = loginB.token;

    // 1. Cria disciplina e baralho para User A
    const subRes = await fetch(`${baseUrl}/api/flashcards/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Química Geral', description: 'Estudo de Reações' }),
    });
    const subData = await subRes.json();
    const subjectId = subData.subject.id;

    const deckRes = await fetch(`${baseUrl}/api/flashcards/decks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ subjectId, name: 'Cinética Química' }),
    });
    const deckData = await deckRes.json();
    const deckId = deckData.deck.id;

    // 2. User B tenta inserir batch no deck de User A -> 404
    const badBatch = await fetch(`${baseUrl}/api/flashcards/decks/${deckId}/cards/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ cards: [{ front: 'Invasão', back: 'Bloqueado' }] }),
    });
    assert.equal(badBatch.status, 404);

    // 3. User A insere batch -> 201
    const goodBatch = await fetch(`${baseUrl}/api/flashcards/decks/${deckId}/cards/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        cards: [
          { front: 'O que é catalisador?', back: 'Diminui a energia de ativação' },
          { front: 'O que é ordem de reação?', back: 'Expoente na equação de velocidade' },
        ],
      }),
    });
    assert.equal(goodBatch.status, 201);
    const goodBatchData = await goodBatch.json();
    assert.equal(goodBatchData.success, true);
    assert.equal(goodBatchData.count, 2);

    // 4. User B tenta pegar fila por matéria de User A -> 404
    const badQueue = await fetch(`${baseUrl}/api/flashcards/study-queue/subject/${subjectId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(badQueue.status, 404);

    // 5. User A pega fila por matéria -> 200
    const goodQueue = await fetch(`${baseUrl}/api/flashcards/study-queue/subject/${subjectId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(goodQueue.status, 200);
    const goodQueueData = await goodQueue.json();
    assert.equal(goodQueueData.cards.length, 2);

    // 6. Forecast stats
    const forecastRes = await fetch(`${baseUrl}/api/flashcards/stats/forecast`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(forecastRes.status, 200);
    const forecastData = await forecastRes.json();
    assert.ok(forecastData.forecast);
    assert.equal(forecastData.forecast.dueToday, 2);

    // 7. Heatmap stats
    const heatmapRes = await fetch(`${baseUrl}/api/flashcards/stats/heatmap`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(heatmapRes.status, 200);
    const heatmapData = await heatmapRes.json();
    assert.ok(Array.isArray(heatmapData.heatmap));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


