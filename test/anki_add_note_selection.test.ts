import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('o modal de notas preserva o baralho selecionado após recarregar a lista', async () => {
  const source = await readFile(new URL('../src/components/anki/AnkiAddNoteModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /selectedDeckId && decks\.some\(\(deck\) => deck\.id === selectedDeckId\)\) return/);
  assert.match(source, /decks\.find\(\(deck\) => deck\.id === defaultDeckId\)\?\.id \|\| decks\[0\]\?\.id \|\| ''/);
});
