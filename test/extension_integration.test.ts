import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('EXT-01: arquivos da extensão Manifest V3 existem e são válidos', () => {
  const manifestPath = path.join(root, 'extension/manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'manifest.json deve existir');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3, 'Deve ser Manifest V3');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);

  // Verifica existência dos arquivos essenciais
  for (const file of [
    'extension/popup.html',
    'extension/popup.css',
    'extension/popup.js',
    'extension/background.js',
    'extension/icon16.png',
    'extension/icon48.png',
    'extension/icon128.png',
    'extension/README.md',
  ]) {
    const fullPath = path.join(root, file);
    assert.equal(fs.existsSync(fullPath), true, `Arquivo ${file} deve existir`);
    assert.ok(fs.statSync(fullPath).size > 0, `Arquivo ${file} não pode estar vazio`);
  }
});

test('EXT-02: CORS no server.ts permite extensões de navegadores de forma segura', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /chrome-extension:\/\//, 'CORS deve aceitar origin chrome-extension://');
  assert.match(serverCode, /moz-extension:\/\//, 'CORS deve aceitar origin moz-extension://');
});

test('EXT-03: rotas de sincronização de nivelamento estão protegidas por autenticação', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/leveling\/session["'],\s*requireUserAuth/);
  assert.match(serverCode, /app\.post\(["']\/api\/leveling\/session["'],\s*requireUserAuth/);
  assert.match(serverCode, /cfo_leveling_session/);
});

test('EXT-04: botão de cópia de token para a extensão está presente no cabeçalho', () => {
  const headerCode = readSource('src/components/Header.tsx');
  assert.match(headerCode, /id="btn-extension-token"/);
  assert.match(headerCode, /handleCopyExtensionToken/);
  assert.match(headerCode, /cfo_terminal_session/);
});

test('EXT-05: popup.js possui suporte a cronômetro e atalhos táteis de certa e errada', () => {
  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /recordAnswer\('correct'\)/);
  assert.match(popupJs, /recordAnswer\('wrong'\)/);
  assert.match(popupJs, /formatTime/);
  assert.match(popupJs, /\/api\/leveling\/session/);
  assert.match(popupJs, /\/api\/timer\/save-session/);
});
