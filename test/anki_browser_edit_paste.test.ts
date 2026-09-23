import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('o editor do navegador Anki encaminha imagens coladas para o upload do campo atual', async () => {
  const source = await readFile(new URL('../src/components/anki/AnkiBrowserModal.tsx', import.meta.url), 'utf8');
  assert.match(source, /clipboardData\.items[\s\S]*?item\.type\.startsWith\('image\/'\)/);
  assert.match(source, /event\.preventDefault\(\);\s*void uploadEditImage\(image, fieldIndex\);/);
  assert.match(source, /onPaste=\{\(event\) => handleEditPaste\(event, idx\)\}/);
});
