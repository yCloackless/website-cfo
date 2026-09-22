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

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-hier-test-'));
  const dbFile = path.join(tempDir, 'test_anki_hier.sqlite');
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

test('Hierarchical Decks: Criação de raiz e sub-baralhos até 5 níveis', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'cadete_hier_1', email: 'hier1@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);

    // Nível 1: História
    const deck1 = ankiRepo.createDeck(user.id, { name: 'História' });
    assert.equal(deck1.depth, 1);
    assert.equal(deck1.parentDeckId, null);

    // Nível 2: Brasil
    const deck2 = ankiRepo.createDeck(user.id, { name: 'Brasil', parentDeckId: deck1.id });
    assert.equal(deck2.depth, 2);
    assert.equal(deck2.parentDeckId, deck1.id);

    // Nível 3: 1ª República
    const deck3 = ankiRepo.createDeck(user.id, { name: '1ª República', parentDeckId: deck2.id });
    assert.equal(deck3.depth, 3);
    assert.equal(deck3.parentDeckId, deck2.id);

    // Nível 4: Revoltas
    const deck4 = ankiRepo.createDeck(user.id, { name: 'Revoltas', parentDeckId: deck3.id });
    assert.equal(deck4.depth, 4);
    assert.equal(deck4.parentDeckId, deck3.id);

    // Nível 5: Canudos (Permitido)
    const deck5 = ankiRepo.createDeck(user.id, { name: 'Canudos', parentDeckId: deck4.id });
    assert.equal(deck5.depth, 5);
    assert.equal(deck5.parentDeckId, deck4.id);

    // Nível 6: Rejeição obrigatória no backend
    assert.throws(
      () => {
        ankiRepo.createDeck(user.id, { name: 'Guerra', parentDeckId: deck5.id });
      },
      (err: any) => {
        assert.equal(err.code, 'MAX_DEPTH_EXCEEDED');
        assert.match(err.message, /Maximum deck nesting depth reached \(5 levels\)/i);
        return true;
      }
    );

    // Listagem deve computar profundidades corretas
    const list = ankiRepo.listDecks(user.id);
    assert.equal(list.length, 5);
    const d5 = list.find((d) => d.id === deck5.id);
    assert.ok(d5);
    assert.equal(d5.depth, 5);
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Prevenção contra ciclos e auto-parentesco', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'cadete_hier_2', email: 'hier2@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);

    const a = ankiRepo.createDeck(user.id, { name: 'Deck A' });
    const b = ankiRepo.createDeck(user.id, { name: 'Deck B', parentDeckId: a.id });
    const c = ankiRepo.createDeck(user.id, { name: 'Deck C', parentDeckId: b.id });

    // 1. Não pode ser pai de si mesmo
    assert.throws(
      () => {
        ankiRepo.updateDeck(user.id, a.id, { parentDeckId: a.id });
      },
      (err: any) => {
        assert.equal(err.code, 'CYCLIC_RELATIONSHIP');
        return true;
      }
    );

    // 2. Não pode mover Deck A para dentro de Deck B (filho) ou Deck C (neto)
    assert.throws(
      () => {
        ankiRepo.updateDeck(user.id, a.id, { parentDeckId: b.id });
      },
      (err: any) => {
        assert.equal(err.code, 'CYCLIC_RELATIONSHIP');
        return true;
      }
    );

    assert.throws(
      () => {
        ankiRepo.updateDeck(user.id, a.id, { parentDeckId: c.id });
      },
      (err: any) => {
        assert.equal(err.code, 'CYCLIC_RELATIONSHIP');
        return true;
      }
    );

    // 3. Mover Deck C para a raiz (parentDeckId = null) deve funcionar
    const movedC = ankiRepo.updateDeck(user.id, c.id, { parentDeckId: null });
    assert.ok(movedC);
    assert.equal(movedC.parentDeckId, null);
    assert.equal(ankiRepo.getDeckDepth(user.id, c.id), 1);
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Validação de altura de subárvore ao mover', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'cadete_hier_3', email: 'hier3@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);

    // Árvore 1: P1 -> P2 -> P3 -> P4 (Profundidade 4)
    const p1 = ankiRepo.createDeck(user.id, { name: 'P1' });
    const p2 = ankiRepo.createDeck(user.id, { name: 'P2', parentDeckId: p1.id });
    const p3 = ankiRepo.createDeck(user.id, { name: 'P3', parentDeckId: p2.id });
    const p4 = ankiRepo.createDeck(user.id, { name: 'P4', parentDeckId: p3.id });

    // Árvore 2: X -> Y (Altura da subárvore em X é 2)
    const x = ankiRepo.createDeck(user.id, { name: 'X' });
    const y = ankiRepo.createDeck(user.id, { name: 'Y', parentDeckId: x.id });

    // Mover X para P3 (profundidade de P3 é 3, 3 + 2 = 5 -> VÁLIDO)
    const movedX = ankiRepo.updateDeck(user.id, x.id, { parentDeckId: p3.id });
    assert.ok(movedX);
    assert.equal(ankiRepo.getDeckDepth(user.id, x.id), 4);
    assert.equal(ankiRepo.getDeckDepth(user.id, y.id), 5);

    // Agora tentar mover X para P4 (profundidade de P4 é 4, 4 + 2 = 6 -> DEVE REJEITAR)
    assert.throws(
      () => {
        ankiRepo.updateDeck(user.id, x.id, { parentDeckId: p4.id });
      },
      (err: any) => {
        assert.equal(err.code, 'MAX_DEPTH_EXCEEDED');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Limite de 300 baralhos e validação de nome', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'cadete_hier_4', email: 'hier4@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);

    // 1. Nome vazio ou só espaços
    assert.throws(
      () => {
        ankiRepo.createDeck(user.id, { name: '   ' });
      },
      (err: any) => {
        assert.equal(err.code, 'INVALID_NAME');
        return true;
      }
    );

    // 2. Nome maior que 80 caracteres
    const longName = 'A'.repeat(81);
    assert.throws(
      () => {
        ankiRepo.createDeck(user.id, { name: longName });
      },
      (err: any) => {
        assert.equal(err.code, 'NAME_TOO_LONG');
        return true;
      }
    );

    // 3. Nome de 80 caracteres com trim deve funcionar
    const valid80 = 'B'.repeat(80);
    const d80 = ankiRepo.createDeck(user.id, { name: `  ${valid80}  ` });
    assert.equal(d80.name, valid80);

    // 4. Limite de 300 baralhos por usuário
    // Cria 299 baralhos adicionais em lote (já temos 1 criado)
    for (let i = 2; i <= 300; i++) {
      ankiRepo.createDeck(user.id, { name: `Deck ${i}` });
    }

    assert.equal(ankiRepo.countDecks(user.id), 300);

    // Tentativa de criar o 301º baralho deve ser barrada
    assert.throws(
      () => {
        ankiRepo.createDeck(user.id, { name: 'Deck 301' });
      },
      (err: any) => {
        assert.equal(err.code, 'MAX_DECKS_EXCEEDED');
        return true;
      }
    );
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Isolamento Multi-Tenant estrito (Zero IDOR)', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const userA = userRepo.create({ username: 'cadete_a_hier', email: 'a_hier@cfo.test', passwordHash: 'hashA' });
    const userB = userRepo.create({ username: 'cadete_b_hier', email: 'b_hier@cfo.test', passwordHash: 'hashB' });

    ankiRepo.ensureDefaultDeckConfig(userA.id);
    ankiRepo.ensureDefaultDeckConfig(userB.id);

    const deckA = ankiRepo.createDeck(userA.id, { name: 'Deck do Cadete A' });
    const deckB = ankiRepo.createDeck(userB.id, { name: 'Deck do Cadete B' });

    // 1. User B não pode criar subdeck apontando para deck de User A
    assert.throws(
      () => {
        ankiRepo.createDeck(userB.id, { name: 'Invasão B', parentDeckId: deckA.id });
      },
      (err: any) => {
        assert.equal(err.code, 'PARENT_DECK_NOT_FOUND');
        return true;
      }
    );

    // 2. User B não pode mover seu deck para dentro do deck de User A
    assert.throws(
      () => {
        ankiRepo.updateDeck(userB.id, deckB.id, { parentDeckId: deckA.id });
      },
      (err: any) => {
        assert.equal(err.code, 'PARENT_DECK_NOT_FOUND');
        return true;
      }
    );

    // 3. User B não pode excluir nem consultar deck de User A
    assert.equal(ankiRepo.getDeck(userB.id, deckA.id), null);
    assert.equal(ankiRepo.deleteDeck(userB.id, deckA.id), false);
    assert.ok(ankiRepo.getDeck(userA.id, deckA.id));
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Exclusão em cascata de sub-baralhos e cartões', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user = userRepo.create({ username: 'cadete_hier_5', email: 'hier5@cfo.test', passwordHash: 'hash' });
    const notetypes = ankiRepo.ensureDefaultNoteTypes(user.id);
    const basicNt = notetypes[0];

    const root = ankiRepo.createDeck(user.id, { name: 'Química' });
    const sub1 = ankiRepo.createDeck(user.id, { name: 'Orgânica', parentDeckId: root.id });
    const sub2 = ankiRepo.createDeck(user.id, { name: 'Funções Oxigenadas', parentDeckId: sub1.id });

    // Inserir cartões em cada nível
    ankiRepo.createNote(user.id, {
      deckId: root.id,
      notetypeId: basicNt.id,
      fields: ['O que é matéria?', 'Tudo que tem massa e ocupa lugar no espaço.'],
    });

    ankiRepo.createNote(user.id, {
      deckId: sub2.id,
      notetypeId: basicNt.id,
      fields: ['O que é um álcool?', 'Possui hidroxila ligada a carbono saturado.'],
    });

    // 1. Estudar a partir da raiz carrega ambos os cartões
    const queueRoot = ankiRepo.getStudyQueue(user.id, root.id);
    assert.equal(queueRoot.length, 2, 'Fila da raiz deve conter cartões da raiz e do sub-baralho');

    // 2. Excluir root deve apagar root, sub1, sub2 e todos os cartões
    const deleted = ankiRepo.deleteDeck(user.id, root.id);
    assert.ok(deleted);

    const listRemaining = ankiRepo.listDecks(user.id);
    assert.equal(listRemaining.length, 0);

    const queueEmpty = ankiRepo.getStudyQueue(user.id);
    assert.equal(queueEmpty.length, 0);
  } finally {
    cleanup();
  }
});

test('Hierarchical Decks: Transferência move apenas cards do baralho selecionado', () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();
  try {
    const user = userRepo.create({ username: 'transfer_user', email: 'transfer@test.local', passwordHash: 'hash' });
    ankiRepo.ensureDefaultDeckConfig(user.id);
    const notetype = ankiRepo.ensureDefaultNoteTypes(user.id)[0];
    const source = ankiRepo.createDeck(user.id, { name: 'Origem' });
    const target = ankiRepo.createDeck(user.id, { name: 'Destino' });
    const child = ankiRepo.createDeck(user.id, { name: 'Filho', parentDeckId: source.id });
    const sourceNote = ankiRepo.createNote(user.id, { deckId: source.id, notetypeId: notetype.id, fields: ['origem', 'resposta'] });
    const childNote = ankiRepo.createNote(user.id, { deckId: child.id, notetypeId: notetype.id, fields: ['filho', 'resposta'] });

    assert.equal(ankiRepo.transferDeckCards(user.id, source.id, target.id), 1);
    assert.equal(ankiRepo.getCard(user.id, sourceNote.cards[0].id)?.deckId, target.id);
    assert.equal(ankiRepo.getCard(user.id, childNote.cards[0].id)?.deckId, child.id);
  } finally {
    cleanup();
  }
});
