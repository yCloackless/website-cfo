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
import { UserRepository, FlashcardRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { createAnkiRouter } from '../src/routes/ankiRouter';
import { Rating } from '../src/services/anki/ankiTypes';

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-delete-test-'));
  const dbFile = path.join(tempDir, 'test_anki_delete.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const ankiRepo = new AnkiRepository(rawDb);
  const flashcardRepo = new FlashcardRepository(rawDb);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, dbFile, rawDb, userRepo, ankiRepo, flashcardRepo, cleanup };
}

function startTestServer(rawDb: any, currentUserId: () => string) {
  const app = express();
  app.use(express.json());

  const mockAuthMiddleware = (req: any, _res: any, next: any) => {
    req.user = { userId: currentUserId(), role: 'user' };
    next();
  };

  const router = createAnkiRouter(mockAuthMiddleware, () => new AnkiRepository(rawDb));
  app.use('/api/anki', router);

  const server = http.createServer(app);
  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('1. Criar Flashcard. Excluir. Buscar novamente no banco: não existe', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_del_1', email: 'del1@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Física' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Segunda Lei de Newton', 'F = m * a'],
    });

    assert.equal(cards.length, 1);
    const cardId = cards[0].id;

    // Confirma que existe no banco
    assert.ok(ankiRepo.getCard(user.id, cardId));

    // Exclui
    const deletedCount = ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(deletedCount, 1);

    // Busca novamente no banco
    const fetched = ankiRepo.getCard(user.id, cardId);
    assert.equal(fetched, null);

    // Consulta SQL direta
    const row = rawDb.prepare('SELECT * FROM anki_cards WHERE id = ?').get(cardId);
    assert.equal(row, undefined);
  } finally {
    cleanup();
  }
});

test('2. Criar Note + Card. Excluir. Recriar AnkiRepository. Buscar novamente: não pode reaparecer', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_del_2', email: 'del2@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Química' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { note, cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Número atômico do Carbono', '6'],
    });

    const cardId = cards[0].id;
    const noteId = note.id;

    // Exclui o card
    ankiRepo.bulkDeleteCards(user.id, [cardId]);

    // Recria a instância do repositório do zero
    const freshRepo = new AnkiRepository(rawDb);
    assert.equal(freshRepo.getCard(user.id, cardId), null);
    assert.equal(freshRepo.getNote(user.id, noteId), null);
  } finally {
    cleanup();
  }
});

test('3. Simular novo processo/startup. Executar migrations/bootstrap: o Flashcard apagado NÃO pode reaparecer', () => {
  const { userRepo, ankiRepo, rawDb, dbFile, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_del_3', email: 'del3@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'História' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Proclamação da República', '15 de novembro de 1889'],
    });
    const cardId = cards[0].id;

    // Exclui
    ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    // Simula novo startup: novo DatabaseService apontando para o mesmo banco
    const startupDb = new DatabaseService(dbFile);
    try {
      AnkiRepository.migrateLegacyData(startupDb.getRawDb());
      const postStartupRepo = new AnkiRepository(startupDb.getRawDb());
      assert.equal(postStartupRepo.getCard(user.id, cardId), null);
    } finally {
      startupDb.close();
    }
  } finally {
    cleanup();
  }
});

test('4. Segurança Multi-tenant (IDOR): Usuário B não consegue excluir Flashcard do Usuário A', async () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const userA = userRepo.create({ username: 'cadete_a', email: 'a@cfo.test', passwordHash: 'hash' });
    const userB = userRepo.create({ username: 'cadete_b', email: 'b@cfo.test', passwordHash: 'hash' });

    const deckA = ankiRepo.createDeck(userA.id, { name: 'Segredo A' });
    const notetypesA = ankiRepo.ensureDefaultNoteTypes(userA.id);
    const { cards } = ankiRepo.createNote(userA.id, {
      deckId: deckA.id,
      notetypeId: notetypesA[0].id,
      fields: ['Pergunta A', 'Resposta A'],
    });
    const cardId = cards[0].id;

    // Usuário B tenta excluir via repositório
    const deletedByB = ankiRepo.bulkDeleteCards(userB.id, [cardId]);
    assert.equal(deletedByB, 0, 'Usuário B não deve excluir card do Usuário A');

    // Card do Usuário A continua existindo
    assert.ok(ankiRepo.getCard(userA.id, cardId));

    // Teste via HTTP Router
    let activeUser = userB.id;
    const { server, url } = await startTestServer(rawDb, () => activeUser);

    try {
      // 1. DELETE /api/anki/cards/:id
      const delRes = await fetch(`${url}/api/anki/cards/${cardId}`, { method: 'DELETE' });
      assert.equal(delRes.status, 404, 'Deve retornar 404 para ID de outro usuário');

      // 2. POST /api/anki/browser/bulk com action: delete
      const bulkRes = await fetch(`${url}/api/anki/browser/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', cardIds: [cardId] }),
      });
      assert.equal(bulkRes.status, 200);
      const bulkData = await bulkRes.json() as any;
      assert.equal(bulkData.affectedCount, 0, 'Zero cards de terceiros devem ser afetados');

      // Card continua existindo
      assert.ok(ankiRepo.getCard(userA.id, cardId));
    } finally {
      server.close();
    }
  } finally {
    cleanup();
  }
});

test('5. Exclusão em massa: todos os cards selecionados desaparecem permanentemente', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_bulk', email: 'bulk@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Matemática' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const cardIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const { cards } = ankiRepo.createNote(user.id, {
        deckId: deck.id,
        notetypeId: notetypes[0].id,
        fields: [`Equação ${i}`, `Solução ${i}`],
      });
      cardIds.push(cards[0].id);
    }

    assert.equal(cardIds.length, 5);
    for (const cid of cardIds) {
      assert.ok(ankiRepo.getCard(user.id, cid));
    }

    // Exclusão em massa
    const deleted = ankiRepo.bulkDeleteCards(user.id, cardIds);
    assert.equal(deleted, 5);

    // Nenhum deve existir
    for (const cid of cardIds) {
      assert.equal(ankiRepo.getCard(user.id, cid), null);
    }

    const countRow = rawDb.prepare('SELECT COUNT(*) as cnt FROM anki_cards WHERE user_id = ?').get(user.id) as any;
    assert.equal(countRow.cnt, 0);
  } finally {
    cleanup();
  }
});

test('6. Excluir Flashcard com anki_revlog: não deixa registros órfãos ou inconsistentes', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_revlog', email: 'revlog@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Biologia' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Mitocôndria', 'Respiração Celular'],
    });
    const cardId = cards[0].id;

    // Simula 3 revisões
    ankiRepo.rateCard(user.id, cardId, Rating.Good, 5000);
    ankiRepo.rateCard(user.id, cardId, Rating.Easy, 4000);
    ankiRepo.rateCard(user.id, cardId, Rating.Hard, 8000);

    const revlogCountBefore = rawDb.prepare('SELECT COUNT(*) as cnt FROM anki_revlog WHERE card_id = ?').get(cardId) as any;
    assert.equal(revlogCountBefore.cnt, 3);

    // Exclui o card
    ankiRepo.bulkDeleteCards(user.id, [cardId]);

    // O card sumiu
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    // O revlog associado ao card deve ter sido limpo
    const revlogCountAfter = rawDb.prepare('SELECT COUNT(*) as cnt FROM anki_revlog WHERE card_id = ?').get(cardId) as any;
    assert.equal(revlogCountAfter.cnt, 0, 'Revlogs órfãos devem ser expurgados');
  } finally {
    cleanup();
  }
});

test('7. Note com múltiplos Cards (Cloze c1 e c2): excluir card 1 preserva card 2 e a note; excluir card 2 purga a note', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_cloze', email: 'cloze@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Português' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const clozeNt = notetypes.find(n => n.kind === 'cloze')!;

    const { note, cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: clozeNt.id,
      fields: ['O {{c1::oxigênio}} é vital para os seres {{c2::aeróbios}}.', 'Bioquímica'],
    });

    assert.equal(cards.length, 2, 'Cloze com c1 e c2 deve gerar exatamente 2 cards');
    const [card1, card2] = cards;
    const noteId = note.id;

    // Exclui apenas o card 1
    const del1 = ankiRepo.bulkDeleteCards(user.id, [card1.id]);
    assert.equal(del1, 1);

    // Card 1 sumiu
    assert.equal(ankiRepo.getCard(user.id, card1.id), null);

    // Card 2 continua intacto
    const fetchedCard2 = ankiRepo.getCard(user.id, card2.id);
    assert.ok(fetchedCard2);
    assert.equal(fetchedCard2.id, card2.id);

    // A Note continua intacta (pois card 2 ainda depende dela)
    const fetchedNote = ankiRepo.getNote(user.id, noteId);
    assert.ok(fetchedNote);

    // Agora exclui o card 2 (último card da note)
    const del2 = ankiRepo.bulkDeleteCards(user.id, [card2.id]);
    assert.equal(del2, 1);

    // Card 2 sumiu
    assert.equal(ankiRepo.getCard(user.id, card2.id), null);

    // A Note agora tornou-se órfã e deve ter sido removida do banco
    const orphanNote = ankiRepo.getNote(user.id, noteId);
    assert.equal(orphanNote, null, 'Note órfã sem nenhum card deve ser purgada');
  } finally {
    cleanup();
  }
});

test('8. Idempotência: executar exclusão duas vezes não deve quebrar nem restaurar', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_idem', email: 'idem@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Geografia' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Capital do Brasil', 'Brasília'],
    });
    const cardId = cards[0].id;

    // Primeira exclusão
    const del1 = ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(del1, 1);
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    // Segunda exclusão do mesmo card já inexistente
    const del2 = ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(del2, 0, 'Segunda chamada deve retornar 0 de forma limpa e idempotente');
    assert.equal(ankiRepo.getCard(user.id, cardId), null);
  } finally {
    cleanup();
  }
});

test('9. Excluir -> buscar -> reinicializar repository/database -> buscar novamente: continua excluído', () => {
  const { userRepo, ankiRepo, dbFile, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_reinic', email: 'reinic@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Filosofia' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Penso, logo existo', 'René Descartes'],
    });
    const cardId = cards[0].id;

    ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    // Reinicializa todo o motor de banco
    const db2 = new DatabaseService(dbFile);
    try {
      const repo2 = new AnkiRepository(db2.getRawDb());
      assert.equal(repo2.getCard(user.id, cardId), null);
    } finally {
      db2.close();
    }
  } finally {
    cleanup();
  }
});

test('10. Executar todas as migrations após a exclusão: nenhuma migration recria o Flashcard', () => {
  const { userRepo, ankiRepo, rawDb, dbService, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_migr', email: 'migr@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Sociologia' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Conceito de Fato Social', 'Émile Durkheim'],
    });
    const cardId = cards[0].id;

    ankiRepo.bulkDeleteCards(user.id, [cardId]);
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    // Roda migrations novamente (DatabaseService.runMigrations)
    dbService.runMigrations();

    // Roda migrateLegacyData
    AnkiRepository.migrateLegacyData(rawDb);

    assert.equal(ankiRepo.getCard(user.id, cardId), null, 'O card não pode ser recriado pelas migrations');
  } finally {
    cleanup();
  }
});

test('11. CENÁRIO CRÍTICO DO BUG: Cartão vindo da tabela legada flashcards, apagado no Anki, NÃO reaparece pós-deploy', () => {
  const { userRepo, rawDb, dbFile, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_cfo_real', email: 'real@cfo.test', passwordHash: 'hash' });
    const userId = user.id;
    const now = new Date().toISOString();

    // 1. Cria disciplina e baralho na tabela legada
    rawDb.prepare(`
      INSERT INTO flashcard_subjects (id, user_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('sub-leg-1', userId, 'Física', now, now);

    rawDb.prepare(`
      INSERT INTO flashcard_decks (id, user_id, subject_id, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('deck-leg-1', userId, 'sub-leg-1', 'Cinemática', now, now);

    // 2. Cria 2 cartões na tabela legada flashcards
    const cardId1 = 'fc-leg-1';
    const cardId2 = 'fc-leg-2';

    rawDb.prepare(`
      INSERT INTO flashcards (
        id, user_id, subject_id, deck_id, front, back, front_image, back_image,
        last_reviewed_at, next_review_at, interval_days, ease_factor, review_count, lapses, status, importance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '2026-09-26', 0, 2.5, 0, 0, 'new', 'normal', ?, ?)
    `).run(cardId1, userId, 'sub-leg-1', 'deck-leg-1', 'v = v0 + a*t', 'Equação da velocidade no MUV', now, now);

    rawDb.prepare(`
      INSERT INTO flashcards (
        id, user_id, subject_id, deck_id, front, back, front_image, back_image,
        last_reviewed_at, next_review_at, interval_days, ease_factor, review_count, lapses, status, importance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '2026-09-26', 0, 2.5, 0, 0, 'new', 'high', ?, ?)
    `).run(cardId2, userId, 'sub-leg-1', 'deck-leg-1', 'S = S0 + v0*t + a*t^2/2', 'Equação horária da posição no MUV', now, now);

    // 3. Primeira execução de migrateLegacyData (simula primeiro startup quando Anki foi introduzido)
    const mig1 = AnkiRepository.migrateLegacyData(rawDb);
    assert.equal(mig1.decksMigrated, 1);
    assert.equal(mig1.cardsMigrated, 2);

    const ankiRepo = new AnkiRepository(rawDb);
    // Ambos existem em anki_cards
    assert.ok(ankiRepo.getCard(userId, cardId1));
    assert.ok(ankiRepo.getCard(userId, cardId2));

    // 4. O aluno seleciona o card 1 e clica em: "Apagar permanentemente"
    const delCount = ankiRepo.bulkDeleteCards(userId, [cardId1]);
    assert.equal(delCount, 1);

    // Card 1 sumiu do Anki
    assert.equal(ankiRepo.getCard(userId, cardId1), null);
    // Card 2 continua
    assert.ok(ankiRepo.getCard(userId, cardId2));

    // 5. SIMULAÇÃO DE DEPLOY / REINÍCIO DO BACKEND:
    // O servidor sobe do zero e executa startServer() -> AnkiRepository.migrateLegacyData()
    const deployDb = new DatabaseService(dbFile);
    try {
      const deployRawDb = deployDb.getRawDb();
      const migDeploy = AnkiRepository.migrateLegacyData(deployRawDb);

      // Não deve ter migrado novamente o card deletado
      assert.equal(migDeploy.cardsMigrated, 0);

      const deployRepo = new AnkiRepository(deployRawDb);
      // Card 1 DEVE CONTINUAR EXCLUÍDO (não pode ressuscitar!)
      assert.equal(deployRepo.getCard(userId, cardId1), null, 'O card 1 apagado NÃO pode reaparecer após deploy');
      // Card 2 DEVE CONTINUAR ATIVO
      assert.ok(deployRepo.getCard(userId, cardId2), 'O card 2 ativo deve continuar existindo');
    } finally {
      deployDb.close();
    }
  } finally {
    cleanup();
  }
});

test('12. Exclusão explícita de Note via DELETE /notes/:id purga cards e não deixa órfãos', () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'aluno_note_del', email: 'notedel@cfo.test', passwordHash: 'hash' });
    const deck = ankiRepo.createDeck(user.id, { name: 'Literatura' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);

    const { note, cards } = ankiRepo.createNote(user.id, {
      deckId: deck.id,
      notetypeId: notetypes[0].id,
      fields: ['Autor de Memórias Póstumas de Brás Cubas', 'Machado de Assis'],
    });

    const noteId = note.id;
    const cardId = cards[0].id;

    assert.ok(ankiRepo.getNote(user.id, noteId));
    assert.ok(ankiRepo.getCard(user.id, cardId));

    // Exclui a note
    const deleted = ankiRepo.deleteNote(user.id, noteId);
    assert.equal(deleted, true);

    // Note e card devem estar inexistentes
    assert.equal(ankiRepo.getNote(user.id, noteId), null);
    assert.equal(ankiRepo.getCard(user.id, cardId), null);

    const cardsCount = rawDb.prepare('SELECT COUNT(*) as cnt FROM anki_cards WHERE note_id = ?').get(noteId) as any;
    assert.equal(cardsCount.cnt, 0);
  } finally {
    cleanup();
  }
});
