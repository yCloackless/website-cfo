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

test('EXT-04: botão de extensão no cabeçalho é exclusivo para computadores (oculto no mobile)', () => {
  const headerCode = readSource('src/components/Header.tsx');
  assert.match(headerCode, /id="btn-extension-token"/);
  assert.match(headerCode, /hidden md:inline-flex/, 'Deve ser oculto no mobile e visível apenas em telas md+');
  assert.match(headerCode, /setIsExtensionModalOpen\(true\)/);
});

test('EXT-05: popup.js possui suporte a cronômetro e atalhos táteis de certa e errada', () => {
  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /recordAnswer\('correct'\)/);
  assert.match(popupJs, /recordAnswer\('wrong'\)/);
  assert.match(popupJs, /formatTime/);
  assert.match(popupJs, /\/api\/leveling\/session/);
  assert.match(popupJs, /\/api\/timer\/save-session/);
});

test('EXT-06: pacote ZIP da extensão existe em public e endpoint de download está registrado', () => {
  const zipPath = path.join(root, 'public/cfo-extensao-cbmerj.zip');
  assert.equal(fs.existsSync(zipPath), true, 'cfo-extensao-cbmerj.zip deve existir em public/');
  assert.ok(fs.statSync(zipPath).size > 1000, 'Arquivo ZIP deve conter conteúdo empacotado');

  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/download\/extension["']/);
  assert.match(serverCode, /cfo-extensao-cbmerj\.zip/);
});

test('EXT-07: banner de download no Nivelamento e modal são exclusivos para desktop', () => {
  const levelingCode = readSource('src/components/LevelingTab.tsx');
  assert.match(levelingCode, /hidden md:flex/, 'Banner do nivelamento deve ser oculto no mobile');
  assert.match(levelingCode, /ExtensionModal/);

  const modalCode = readSource('src/components/ExtensionModal.tsx');
  assert.match(modalCode, /\/api\/download\/extension/);
  assert.match(modalCode, /Exclusivo para Computador/);
});

test('EXT-08: endpoint seguro /api/user/extension-token emite token para a extensão', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/user\/extension-token["'],\s*requireUserAuth/);
  assert.match(serverCode, /sessionRepoInstance\.createSession/);
});

test('EXT-09: ExtensionModal não utiliza alert() ou prompt() nativos do navegador', () => {
  const modalCode = readSource('src/components/ExtensionModal.tsx');
  assert.doesNotMatch(modalCode, /\balert\(/, 'Não deve utilizar window.alert nativo');
  assert.doesNotMatch(modalCode, /\bwindow\.prompt\(/, 'Não deve utilizar window.prompt nativo');
  assert.match(modalCode, /\/api\/user\/extension-token/);
});

