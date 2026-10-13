import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = path.join(root, 'extension');
const chromePath = [
  'C:\\Users\\renas\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(fs.existsSync);
assert.ok(chromePath, 'Chrome ou Edge instalado é necessário para o teste real do popup.');

const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-extension-reopen-'));
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath: chromePath,
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const openPopup = async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.locator('#tab-btn-leveling').click();
    await page.locator('#btn-question-correct').waitFor();
    return page;
  };
  let popup = await openPopup();
  await popup.locator('#btn-question-correct').click();
  await popup.locator('#btn-question-wrong').click();
  await popup.locator('#stat-progress').getByText('Questão 3 de 5').waitFor();
  await popup.close();

  popup = await openPopup();
  await popup.locator('#stat-progress').getByText('Questão 3 de 5').waitFor();
  const restored = await popup.evaluate(() => new Promise((resolve) => chrome.storage.local.get('cfo_ext_leveling', resolve)));
  assert.deepEqual(restored.cfo_ext_leveling.activeBattery.answers, ['correct', 'wrong']);
  for (const answer of ['wrong', 'wrong', 'wrong']) await popup.locator('#btn-question-wrong').click();
  await popup.locator('#stat-progress').getByText('Questão 1 de 5').waitFor();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), false);

  for (let index = 0; index < 4; index += 1) await popup.locator('#btn-question-correct').click();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), false, 'A meta só é calculada após a quinta resposta.');
  await popup.locator('#btn-question-wrong').click();
  await popup.getByText('4 de 5 questões corretas — 80%').waitFor();
  const completed = await popup.evaluate(() => new Promise((resolve) => chrome.storage.local.get('cfo_ext_leveling', resolve)));
  assert.equal(completed.cfo_ext_leveling.history.length, 2);
  assert.equal(completed.cfo_ext_leveling.achievement.shown, true);
  await popup.close();

  popup = await openPopup();
  await popup.locator('#stat-progress').getByText('Questão 1 de 5').waitFor();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), false, 'A conquista não deve reaparecer após reabrir.');
  const reopenedAfterCompletion = await popup.evaluate(() => new Promise((resolve) => chrome.storage.local.get('cfo_ext_leveling', resolve)));
  assert.equal(reopenedAfterCompletion.cfo_ext_leveling.history.length, 2, 'O histórico deve sobreviver ao início da nova bateria.');
  console.log('Popup real: retomada em 3/5, transição automática e conquista única validadas.');
} finally {
  await context?.close();
  fs.rmSync(profilePath, { recursive: true, force: true });
}
