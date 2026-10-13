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
const evidencePath = path.join(os.tmpdir(), 'cfo-leveling-evidence');
fs.mkdirSync(evidencePath, { recursive: true });
let context;
const pageErrors = [];

async function launch() {
  const nextContext = await chromium.launchPersistentContext(profilePath, {
    executablePath: chromePath,
    headless: false,
    viewport: { width: 400, height: 620 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  nextContext.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  const worker = nextContext.serviceWorkers()[0] || await nextContext.waitForEvent('serviceworker');
  return { context: nextContext, extensionId: new URL(worker.url()).host };
}

async function openPopup(extensionId) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.locator('#tab-btn-leveling').click();
  await page.locator('#answer-window').waitFor({ state: 'attached' });
  return page;
}

async function readProgress(page) {
  return page.evaluate(() => new Promise((resolve) => chrome.storage.local.get('cfo_ext_leveling', resolve)));
}

try {
  ({ context } = await launch());
  let worker = context.serviceWorkers()[0];
  let extensionId = new URL(worker.url()).host;
  let popup = await openPopup(extensionId);
  let firstMarkerSize;
  await popup.screenshot({ path: path.join(evidencePath, 'nivelamento-inicial.png') });

  // Responde e fecha/reabre depois de cada posição, incluindo a resposta 5 e a troca da janela.
  for (let answered = 1; answered <= 5; answered += 1) {
    if (answered === 1) {
      await popup.evaluate(() => {
        const button = document.querySelector('#btn-question-wrong');
        button.click();
        button.click();
      });
    } else {
      await popup.locator('#btn-question-wrong').click();
    }
    await popup.locator('#leveling-status-label').getByText(`Questão ${answered + 1}`).waitFor();
    assert.equal(await popup.locator('#btn-question-correct').isEnabled(), true, 'O botão deve ser reabilitado após persistir a resposta.');
    assert.notEqual(await popup.locator('#btn-question-correct').evaluate((button) => getComputedStyle(button).cursor), 'wait');
    assert.equal((await readProgress(popup)).cfo_ext_leveling.questionsAnswered, answered, 'Um clique duplo não pode registrar duas respostas.');
    assert.equal(await popup.locator('.answer-square').count(), answered, 'Cada resposta deve manter seu próprio quadradinho.');
    if (answered === 1) {
      firstMarkerSize = (await popup.locator('.answer-square').first().boundingBox()).width;
      await popup.screenshot({ path: path.join(evidencePath, 'historico-respostas-1.png') });
    }
    await popup.close();
    popup = await openPopup(extensionId);
    await popup.locator('#leveling-status-label').getByText(`Questão ${answered + 1}`).waitFor();
    const restored = await readProgress(popup);
    assert.equal(restored.cfo_ext_leveling.questionsAnswered, answered);
    assert.equal(restored.cfo_ext_leveling.answerLog.length, answered);
    assert.equal(await popup.locator('.answer-square.wrong').count(), answered);
  }
  assert.equal(await popup.locator('#stat-progress').textContent(), '5');
  const afterFailedWindow = await readProgress(popup);
  assert.equal(afterFailedWindow.cfo_ext_leveling.history.length, 1);
  assert.equal(afterFailedWindow.cfo_ext_leveling.activeBattery.answers.length, 4);
  assert.equal(afterFailedWindow.cfo_ext_leveling.activeBattery.currentQuestionIndex, 4);
  await popup.screenshot({ path: path.join(evidencePath, 'janela-movel-apos-5-erros.png') });
  await popup.close();

  // Reinicia o navegador preservando somente o perfil temporário deste teste.
  await context.close();
  ({ context, extensionId } = await launch());
  popup = await openPopup(extensionId);
  await popup.locator('#leveling-status-label').getByText('Questão 6').waitFor();
  assert.equal((await readProgress(popup)).cfo_ext_leveling.questionsAnswered, 5);

  // Os quadradinhos acumulam durante os erros e diminuem conforme a linha cresce.
  for (let index = 0; index < 15; index += 1) {
    await popup.locator('#btn-question-wrong').click();
    await popup.locator('#leveling-status-label').getByText(`Questão ${7 + index}`).waitFor();
  }
  assert.equal(await popup.locator('.answer-square').count(), 20);
  const finalMarkerSize = (await popup.locator('.answer-square').first().boundingBox()).width;
  assert.ok(finalMarkerSize < firstMarkerSize, 'Os quadrados devem diminuir quando mais respostas precisam caber na faixa.');
  await popup.screenshot({ path: path.join(evidencePath, 'historico-respostas-20.png') });

  // Quatro acertos na janela móvel atual (Q20..Q24) concluem em 80%.
  for (let index = 0; index < 3; index += 1) {
    await popup.locator('#btn-question-correct').click();
    await popup.locator('#leveling-status-label').getByText(`Questão ${22 + index}`).waitFor();
    assert.equal(await popup.locator('#leveling-achievement').isVisible(), false);
  }
  await popup.locator('#btn-question-correct').click();
  await popup.close(); // Fecha imediatamente depois do clique de conclusão, durante a gravação/animação.
  popup = await openPopup(extensionId);
  await popup.locator('#leveling-status-label').getByText('Questão 1').waitFor();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), false);
  const recoveredImmediateCompletion = await readProgress(popup);
  assert.equal(recoveredImmediateCompletion.cfo_ext_leveling.history.at(-1).percentage, 80);
  assert.equal(recoveredImmediateCompletion.cfo_ext_leveling.history.at(-1).status, 'approved');
  assert.equal(recoveredImmediateCompletion.cfo_ext_leveling.history.at(-1).achievementShown, true);
  assert.equal(recoveredImmediateCompletion.cfo_ext_leveling.levelingCompleted, false);
  assert.equal(recoveredImmediateCompletion.cfo_ext_leveling.activeBattery.answers.length, 0);
  assert.equal(await popup.locator('.answer-square').count(), 0, 'A aprovação deve limpar os quadradinhos visíveis.');

  // Uma aprovação visível em 100% também tem celebração única e permanece no histórico.
  for (let index = 0; index < 4; index += 1) {
    await popup.locator('#btn-question-correct').click();
    await popup.locator('.answer-square').nth(index).waitFor({ state: 'visible' });
  }
  assert.equal(await popup.locator('.answer-square').count(), 4, 'A nova tentativa deve começar limpa e acumular suas próprias respostas.');
  await popup.locator('#btn-question-correct').click();
  await popup.getByText('5 de 5 questões corretas — 100%').waitFor();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), true);
  const completed = await readProgress(popup);
  assert.equal(completed.cfo_ext_leveling.history.at(-1).percentage, 100);
  assert.equal(completed.cfo_ext_leveling.history.at(-1).achievementShown, true);
  assert.equal(completed.cfo_ext_leveling.achievement.shown, true);
  assert.equal(completed.cfo_ext_leveling.activeBattery, null);
  assert.equal(await popup.locator('.answer-square').count(), 0, 'Os quadradinhos também somem após a segunda aprovação.');
  await popup.setViewportSize({ width: 366, height: 390 });
  const markerBoxes = await popup.locator('.answer-square').evaluateAll((squares) => squares.map((square) => {
    const { x, width } = square.getBoundingClientRect();
    return { x, width };
  }));
  assert.ok(markerBoxes.every((box) => box.x >= 0 && box.x + box.width <= 366), 'Nenhum quadradinho pode ser cortado na largura do popup.');
  await popup.waitForTimeout(850);
  await popup.screenshot({ path: path.join(evidencePath, 'conquista-100-por-cento.png') });
  const achievementBounds = await popup.locator('.achievement-card').boundingBox();
  const trophyBounds = await popup.locator('.achievement-trophy').boundingBox();
  assert.ok(achievementBounds.y >= 0 && achievementBounds.y + achievementBounds.height <= 390, 'O cartão da conquista deve caber no popup baixo.');
  assert.ok(trophyBounds.y >= achievementBounds.y && trophyBounds.y + trophyBounds.height <= achievementBounds.y + achievementBounds.height, 'O troféu inteiro deve permanecer visível.');
  await popup.locator('#btn-achievement-continue').click();
  await popup.locator('#leveling-achievement').waitFor({ state: 'hidden' });
  await popup.locator('#btn-question-correct').waitFor({ state: 'visible' });
  assert.equal(await popup.locator('#btn-question-correct').isEnabled(), true, 'Continuar deve liberar os botões sem fechar o popup.');
  assert.equal(await popup.locator('#btn-question-wrong').isEnabled(), true);
  assert.notEqual(await popup.locator('#btn-question-correct').evaluate((button) => getComputedStyle(button).cursor), 'wait');
  assert.equal(await popup.locator('.answer-square').count(), 0, 'Continuar começa uma tentativa visualmente limpa.');
  await popup.locator('#btn-question-wrong').click();
  await popup.locator('#leveling-status-label').getByText('Questão 2').waitFor();
  assert.equal((await readProgress(popup)).cfo_ext_leveling.questionsAnswered, 1, 'A nova sessão deve aceitar respostas sem reabrir a extensão.');
  assert.equal(await popup.locator('.answer-square').count(), 1, 'A primeira resposta da tentativa nova cria somente um quadradinho.');
  await popup.close();

  // Depois de reiniciar o navegador, a bateria aprovada não reaparece e a celebração não repete.
  await context.close();
  ({ context, extensionId } = await launch());
  popup = await openPopup(extensionId);
  await popup.locator('#leveling-status-label').getByText('Questão 2').waitFor();
  assert.equal(await popup.locator('#leveling-achievement').isVisible(), false);
  const afterReopen = await readProgress(popup);
  assert.equal(afterReopen.cfo_ext_leveling.history.length, 21);
  assert.equal(afterReopen.cfo_ext_leveling.levelingCompleted, false);
  assert.equal(afterReopen.cfo_ext_leveling.activeBattery.answers.length, 1);

  // Uma falha transitória no storage não avança a UI; a próxima tentativa de gravação se recupera.
  await popup.evaluate(() => {
    const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
    let shouldFail = true;
    chrome.storage.local.set = (items, callback) => {
      if (shouldFail && items.cfo_ext_leveling) {
        shouldFail = false;
        return Promise.reject(new Error('falha transitória de teste'));
      }
      return originalSet(items, callback);
    };
  });
  await popup.locator('#btn-question-wrong').click();
  await popup.getByText('Não foi possível salvar. A resposta não foi avançada.').waitFor();
  assert.equal((await readProgress(popup)).cfo_ext_leveling.questionsAnswered, 1);
  assert.equal(await popup.locator('#leveling-status-label').textContent(), 'Questão 2');
  await popup.locator('#btn-question-wrong').click();
  await popup.locator('#leveling-status-label').getByText('Questão 3').waitFor();
  assert.equal((await readProgress(popup)).cfo_ext_leveling.questionsAnswered, 2);
  assert.deepEqual(pageErrors, []);
  console.log(`Chromium/Manifest V3: retomada em Q1–Q5, reinício do navegador, janela móvel, conclusão 80%, histórico e troféu único validados. Capturas: ${evidencePath}`);
} finally {
  await context?.close();
  fs.rmSync(profilePath, { recursive: true, force: true });
}
