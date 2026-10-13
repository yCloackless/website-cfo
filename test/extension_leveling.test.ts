import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);
const leveling = require('../extension/leveling-state.js');
const solve = (answers: string[]) => answers.reduce((state: any, answer: string, index: number) => leveling.answer(state, answer, `2026-10-13T12:00:0${index}.000Z`), leveling.createSession('2026-10-13T12:00:00.000Z'));

test('EXT-L01: 4/5 conclui a bateria com 80%, histórico e conquista pendente', () => {
  const state = solve(['correct', 'correct', 'correct', 'correct', 'wrong']);
  assert.equal(state.levelingCompleted, true);
  assert.equal(state.history[0].percentage, 80);
  assert.equal(state.history[0].status, 'approved');
  assert.equal(state.activeBattery, null);
  assert.equal(state.achievement.shown, false);
});

test('EXT-L02: 5/5 conclui com 100%', () => {
  const state = solve(Array(5).fill('correct'));
  assert.equal(state.history[0].correctAnswersCount, 5);
  assert.equal(state.history[0].percentage, 100);
});

test('EXT-L03: 3/5 arquiva a bateria e continua automaticamente em outra', () => {
  const first = solve(['correct', 'correct', 'correct', 'wrong', 'wrong']);
  assert.equal(first.levelingCompleted, false);
  assert.equal(first.history[0].percentage, 60);
  assert.equal(first.activeBattery.answers.length, 0);
  assert.equal(first.activeBattery.batteryNumber, 2);
});

test('EXT-L04/05: respostas insuficientes não são mostradas na interface', () => {
  const html = read('extension/popup.html');
  const js = read('extension/popup.js');
  assert.doesNotMatch(html, /id="stat-(correct|wrong|accuracy)"|id="leveling-result"/);
  assert.doesNotMatch(js, /Faltam .* acerto|Bateria finalizada|Revise seus erros|resultAccuracy|statCorrect|statWrong/);
  assert.match(html, /Questão 1 de 5/);
});

test('EXT-L06: várias baterias abaixo de 80% continuam até a primeira aprovação', () => {
  let state = leveling.createSession();
  for (const score of [2, 3, 3, 3]) {
    const answers = [...Array(score).fill('correct'), ...Array(5 - score).fill('wrong')];
    for (const answer of answers) state = leveling.answer(state, answer);
    assert.equal(state.levelingCompleted, false);
  }
  for (const answer of ['correct', 'correct', 'correct', 'correct', 'wrong']) state = leveling.answer(state, answer);
  assert.equal(state.levelingCompleted, true);
  assert.equal(state.history.length, 5);
  assert.equal(state.bestScore, 80);
});

test('EXT-L07/08: reabrir restaura bateria, questão e respostas; bateria nova não volta à antiga', () => {
  let state = leveling.createSession();
  state = leveling.answer(state, 'correct');
  state = leveling.answer(state, 'wrong');
  const reopened = leveling.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(reopened.activeBattery.batteryId, state.activeBattery.batteryId);
  assert.equal(reopened.activeBattery.currentQuestionIndex, 2);
  assert.deepEqual(reopened.activeBattery.answers, ['correct', 'wrong']);
  let next = state;
  for (const answer of ['wrong', 'wrong', 'wrong']) next = leveling.answer(next, answer);
  assert.notEqual(next.activeBattery.batteryId, state.activeBattery.batteryId);
  assert.equal(leveling.normalizeState(next).activeBattery.batteryId, next.activeBattery.batteryId);
});

test('EXT-L09/10/11: conquista exibida uma vez, estado concluído não restaura bateria, histórico continua', () => {
  let state = solve(['correct', 'correct', 'correct', 'correct', 'wrong']);
  state = leveling.markAchievementShown(state);
  const reopened = leveling.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(reopened.achievement.shown, true);
  assert.equal(reopened.activeBattery, null);
  const next = leveling.beginNewSession(reopened);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].percentage, 80);
  assert.notEqual(next.sessionId, reopened.sessionId);
  assert.equal(next.activeBattery.answers.length, 0);
});

test('EXT-L12: quatro acertos não encerram antes da quinta resposta', () => {
  let state = leveling.createSession();
  for (let i = 0; i < 4; i += 1) state = leveling.answer(state, 'correct');
  assert.equal(state.levelingCompleted, false);
  assert.equal(state.history.length, 0);
  assert.equal(state.activeBattery.currentQuestionIndex, 4);
});

test('EXT-L13/16: botões ficam bloqueados durante salvamento e snapshots locais/remotos são serializados', () => {
  const js = read('extension/popup.js');
  assert.match(js, /if \(levelingMutationPending \|\| state\.leveling\.levelingCompleted/);
  assert.match(js, /levelingWriteQueue = levelingWriteQueue\.catch\(\(\) => \{\}\)\.then/);
  assert.match(js, /levelingCloudWrites = levelingCloudWrites\.catch\(\(\) => \{\}\)\.then/);
  assert.match(js, /await persistLevelingState\(nextState\);\s*state\.leveling = nextState/);
});

test('EXT-L14: a resposta só avança após escrita local concluída', () => {
  const js = read('extension/popup.js');
  assert.match(js, /await persistLevelingState\(nextState\);\s*state\.leveling = nextState/);
  assert.match(js, /Não foi possível salvar\. A resposta não foi avançada/);
});

test('EXT-L15: snapshots legados mantêm as respostas e convertem o restante para uma bateria ativa', () => {
  const legacy = { total: 30, answers: ['correct', 'wrong', 'correct'], mode: 'live', updatedAt: '2026-10-12T12:00:00.000Z' };
  const restored = leveling.normalizeState(legacy);
  assert.deepEqual(restored.activeBattery.answers, legacy.answers);
  assert.equal(restored.activeBattery.currentQuestionIndex, 3);
  assert.equal(restored.schemaVersion, 2);
});

test('EXT-L17: transição sem aprovação cria bateria válida e mantém histórico após resposta 5/5', () => {
  let state = solve(['wrong', 'wrong', 'wrong', 'wrong', 'wrong']);
  assert.equal(state.activeBattery.questionIds.length, 5);
  const newBatteryId = state.activeBattery.batteryId;
  state = leveling.answer(state, 'correct');
  assert.equal(state.activeBattery.batteryId, newBatteryId);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].percentage, 0);
});

test('EXT-L18: animação respeita movimento reduzido e contém botão de continuação', () => {
  assert.match(read('extension/popup.css'), /prefers-reduced-motion: reduce/);
  assert.match(read('extension/popup.html'), /id="btn-achievement-continue"/);
});

test('EXT-L19: backend guarda o snapshot da extensão separadamente do nivelamento web', () => {
  const server = read('server.ts');
  assert.match(server, /cfo_ext_leveling_session/);
  assert.match(server, /revision <= Number\(current\.revision\)/);
  assert.match(server, /cfo_leveling_session/);
  assert.match(server, /req\.query\.client === 'extension'/);
  assert.match(server, /cfo_ext_leveling_session'\]\s*\|\|\s*saved\?\.payload\?\.\['cfo_leveling_session'\]/);
  assert.match(read('extension/popup.js'), /leveling\/session\?client=extension/);
});

test('EXT-L20: ZIP distribuído inclui o motor novo e a versão publicada da extensão', async () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.equal(manifest.version, '1.0.2');
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'public/cfo-extensao-cbmerj.zip')));
  assert.ok(zip.file('leveling-state.js'));
  assert.ok(zip.file('popup.js'));
});

test('EXT-L21: novo estado só vai à nuvem depois da leitura inicial e não substitui progresso offline', () => {
  const popup = read('extension/popup.js');
  assert.match(popup, /if \(!savedSnapshot\.cloudHydrated \|\| !state\.settings\.serverUrl/);
  assert.match(popup, /state\.leveling\.activeBattery\?\.answers\.length === 0/);
  assert.match(popup, /if \(data\?\.session\) state\.leveling = CfoLevelingState\.normalizeState\(data\.session\)/);
  assert.equal(leveling.createSession().cloudHydrated, false);
});
