import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

test('a recuperação de chunks do Vite é limitada a uma tentativa por sessão', async () => {
  const main = await readFile(new URL('src/main.tsx', root), 'utf8');

  assert.match(main, /sessionStorage\.setItem\(reloadKey, 'true'\)/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.doesNotMatch(main, /sessionStorage\.removeItem\('cfo_vite_chunk_reload'\)/);
});
