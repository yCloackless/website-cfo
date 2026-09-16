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

test('atualizações do service worker aguardam o comando explícito do usuário', async () => {
  const serviceWorker = await readFile(new URL('public/sw.js', root), 'utf8');
  const installHandler = serviceWorker.match(/self\.addEventListener\('install',[\s\S]*?\n\}\);/);

  assert.ok(installHandler, 'O handler de instalação do service worker deve existir.');
  assert.doesNotMatch(installHandler[0], /skipWaiting\(\)/);
  assert.match(serviceWorker, /event\.data\.type === 'SKIP_WAITING'[\s\S]*?self\.skipWaiting\(\)/);
});
