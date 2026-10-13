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
const run = (state: any, answers: string[]) => answers.reduce(
  (next: any, answer: string, index: number) => leveling.answer(next, answer, `2026-10-13T12:00:${String(index).padStart(2, '0')}.000Z`), state,
);
const patternForScore = (correct: number) => [...Array(correct).fill('correct'), ...Array(5 - correct).fill('wrong')];

test('EXT-L01/02: 4/5 aprova com 80% e 5/5 aprova com 100%', () => {
  for (const correct of [4, 5]) {
    const state = run(leveling.createSession(), patternForScore(correct));
    assert.equal(state.levelingCompleted, true);
    assert.equal(state.history.at(-1).correctAnswersCount, correct);
    assert.equal(state.history.at(-1).percentage, correct * 20);
    assert.equal(state.history.at(-1).status, 'approved');
    assert.equal(state.activeBattery, null);
    assert.equal(state.achievement.shown, false);
  }
});

test('EXT-L03/05: 0/5 até 3/5 mantêm a sequência e registram uma janela móvel', () => {
  for (const correct of [0, 1, 2, 3]) {
    const state = run(leveling.createSession(), patternForScore(correct));
    assert.equal(state.levelingCompleted, false);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].percentage, correct * 20);
    assert.equal(state.questionsAnswered, 5);
    assert.equal(state.activeBattery.answers.length, 4, 'A janela seguinte herda as quatro respostas mais recentes.');
    assert.equal(state.activeBattery.currentQuestionIndex, 4);
    assert.equal(state.batteryNumber, 2);
  }
});

test('EXT-L04: todos os seis percentuais possíveis são avaliados somente depois da quinta resposta da janela', () => {
  for (let correct = 0; correct <= 5; correct += 1) {
    let state = leveling.createSession();
    const answers = patternForScore(correct);
    state = run(state, answers.slice(0, 4));
    assert.equal(state.levelingCompleted, false);
    assert.equal(state.history.length, 0);
    state = run(state, answers.slice(4));
    assert.equal(state.levelingCompleted, correct >= 4);
    assert.equal(state.history.at(-1).percentage, correct * 20);
  }
});

test('EXT-L06: vinte janelas insuficientes continuam e a janela móvel seguinte pode aprovar', () => {
  let state = run(leveling.createSession(), Array(24).fill('wrong'));
  assert.equal(state.levelingCompleted, false);
  assert.equal(state.history.length, 20);
  assert.equal(state.questionsAnswered, 24);
  state = run(state, Array(4).fill('correct'));
  assert.equal(state.levelingCompleted, true);
  assert.equal(state.history.at(-1).correctAnswersCount, 4);
  assert.equal(state.history.at(-1).percentage, 80);
  assert.equal(state.questionsAnswered, 28);
});

test('EXT-L07: erro não revela gabarito e o popup mostra o histórico completo em quadrados', () => {
  const html = read('extension/popup.html');
  const js = read('extension/popup.js');
  assert.match(html, /id="answer-window"/);
  assert.match(html, /Questões respondidas/);
  assert.doesNotMatch(html, /answer-square pending/);
  assert.doesNotMatch(html, /class="progress-track"|role="progressbar" aria-label="Progresso da bateria"/);
  assert.doesNotMatch(js, /Você errou|Não aprovado|pontuação foi insuficiente|alternativa correta/);
  assert.match(js, /entry\.answer === 'correct' \? '✓' : '×'/);
  assert.match(js, /CfoLevelingState\.getAnswerTimeline/);
});

test('EXT-L08: fechar na questão 3 e reabrir restaura sessão, janela e respostas', () => {
  let state = run(leveling.createSession(), ['correct', 'wrong']);
  const reopened = leveling.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(reopened.sessionId, state.sessionId);
  assert.equal(reopened.activeBattery.batteryId, state.activeBattery.batteryId);
  assert.equal(reopened.activeBattery.currentQuestionIndex, 2);
  assert.deepEqual(reopened.activeBattery.answers, ['correct', 'wrong']);
  state = run(state, ['wrong', 'wrong', 'wrong']);
  assert.notEqual(state.activeBattery.batteryId, reopened.activeBattery.batteryId);
  assert.equal(leveling.normalizeState(state).activeBattery.batteryId, state.activeBattery.batteryId);
});

test('EXT-L09: depois de falhar, a nova janela preserva as quatro respostas recentes e seus IDs', () => {
  const failed = run(leveling.createSession(), Array(5).fill('wrong'));
  const ids = failed.answerLog.slice(-4).map((entry: any) => entry.questionId);
  assert.deepEqual(failed.activeBattery.answers, Array(4).fill('wrong'));
  assert.deepEqual(failed.activeBattery.questionIds.slice(0, 4), ids);
  assert.equal(new Set(failed.activeBattery.questionIds).size, 5);
  const reopened = leveling.normalizeState(JSON.parse(JSON.stringify(failed)));
  assert.deepEqual(reopened.activeBattery.answers, failed.activeBattery.answers);
  assert.equal(reopened.questionsAnswered, 5);
  const withoutRollingCache = { ...failed, answerLog: undefined };
  const recoveredCache = leveling.normalizeState(withoutRollingCache);
  assert.deepEqual(recoveredCache.answerLog.map((entry: any) => entry.questionId), ids);
});

test('EXT-L10/11: conquista exibida uma vez; bateria aprovada não volta e histórico permanece', () => {
  let state = run(leveling.createSession(), patternForScore(4));
  state = leveling.markAchievementShown(state);
  const reopened = leveling.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(reopened.achievement.shown, true);
  assert.equal(reopened.history[0].achievementShown, true);
  assert.equal(reopened.history[0].achievementId, reopened.achievement.id);
  assert.equal(reopened.activeBattery, null);
  const next = leveling.beginNewSession(reopened);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].percentage, 80);
  assert.equal(next.history[0].achievementShown, true);
  assert.notEqual(next.sessionId, reopened.sessionId);
  assert.equal(next.questionsAnswered, 0);
  assert.equal(next.activeBattery.answers.length, 0);
});

test('EXT-L12: janela sem aprovação avança automaticamente sem pedir ação extra', () => {
  let state = run(leveling.createSession(), [...patternForScore(2), 'wrong']);
  assert.equal(state.levelingCompleted, false);
  assert.equal(state.questionsAnswered, 6);
  assert.equal(state.history.length, 2);
  assert.equal(state.activeBattery.currentQuestionIndex, 4);
  assert.equal(state.activeBattery.answers.length, 4);
});

test('EXT-L13: clique repetido depois da conclusão não pode inserir resposta adicional', () => {
  const complete = run(leveling.createSession(), patternForScore(4));
  const duplicate = leveling.answer(complete, 'wrong');
  assert.equal(duplicate, complete);
  assert.equal(duplicate.questionsAnswered, 5);
  assert.equal(duplicate.history.length, 1);
});

test('EXT-L14/16: popup bloqueia cliques enquanto salva e serializa gravações local e remota', () => {
  const js = read('extension/popup.js');
  assert.match(js, /if \(levelingMutationPending \|\| state\.leveling\.levelingCompleted/);
  assert.match(js, /levelingWriteQueue = levelingWriteQueue\.catch\(\(\) => \{\}\)\.then/);
  assert.match(js, /levelingCloudWrites = levelingCloudWrites\.catch\(\(\) => \{\}\)\.then/);
  assert.match(js, /await persistLevelingState\(nextState\);\s*state\.leveling = nextState/);
});

test('EXT-L15: estado legado migra sem apagar respostas e inclui contador/log persistentes', () => {
  const legacy = { total: 30, answers: ['correct', 'wrong', 'correct'], mode: 'live', updatedAt: '2026-10-12T12:00:00.000Z' };
  const restored = leveling.normalizeState(legacy);
  assert.deepEqual(restored.activeBattery.answers, legacy.answers);
  assert.equal(restored.activeBattery.currentQuestionIndex, 3);
  assert.equal(restored.questionsAnswered, 3);
  assert.equal(restored.answerLog.length, 3);
  assert.equal(restored.schemaVersion, 3);
});

test('EXT-L17: migração v2 mantém histórico, sessão e progresso parcial válidos', () => {
  const original = run(leveling.createSession(), ['correct', 'wrong']);
  const old = { ...original, schemaVersion: 2 };
  delete old.questionsAnswered;
  delete old.answerLog;
  const restored = leveling.normalizeState(old);
  assert.equal(restored.sessionId, original.sessionId);
  assert.equal(restored.activeBattery.batteryId, original.activeBattery.batteryId);
  assert.deepEqual(restored.activeBattery.answers, ['correct', 'wrong']);
  assert.equal(restored.questionsAnswered, 2);
});

test('EXT-L18: dados inválidos não fazem o motor aceitar respostas duplicadas ou completar sem cinco respostas', () => {
  const state = leveling.createSession();
  assert.equal(leveling.answer(state, 'unknown'), state);
  assert.equal(state.history.length, 0);
  assert.equal(state.levelingCompleted, false);
});

test('EXT-L19: animação respeita movimento reduzido e oferece continuidade', () => {
  assert.match(read('extension/popup.css'), /prefers-reduced-motion: reduce/);
  assert.match(read('extension/popup.html'), /id="btn-achievement-continue"/);
});

test('EXT-L20: backend separa estado da extensão e rejeita revisões antigas', () => {
  const server = read('server.ts');
  assert.match(server, /cfo_ext_leveling_session/);
  assert.match(server, /body\.schemaVersion === 2 \|\| body\.schemaVersion === 3/);
  assert.match(server, /Array\.isArray\(body\.answerLog\)/);
  assert.match(server, /\[2, 3\]\.includes\(current\?\.schemaVersion\)/);
  assert.match(server, /revision <= Number\(current\.revision\)/);
  assert.match(server, /cfo_leveling_session/);
  assert.match(server, /req\.query\.client === 'extension'/);
  assert.match(server, /cfo_ext_leveling_session'\]\s*\|\|\s*saved\?\.payload\?\.\['cfo_leveling_session'\]/);
  assert.match(read('extension/popup.js'), /leveling\/session\?client=extension/);
});

test('EXT-L21: ZIP distribuído contém motor e popup atuais da extensão', async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'public/cfo-extensao-cbmerj.zip')));
  assert.ok(zip.file('leveling-state.js'));
  assert.ok(zip.file('popup.js'));
  assert.equal(await zip.file('popup.js')!.async('string'), read('extension/popup.js'));
  assert.equal(await zip.file('popup.css')!.async('string'), read('extension/popup.css'));
});

test('EXT-L22: sincronização na nuvem espera hidratação e preserva progresso local offline', () => {
  const popup = read('extension/popup.js');
  assert.match(popup, /if \(!savedSnapshot\.cloudHydrated \|\| !state\.settings\.serverUrl/);
  assert.match(popup, /state\.leveling\.activeBattery\?\.answers\.length === 0/);
  assert.match(popup, /if \(data\?\.session\) state\.leveling = CfoLevelingState\.normalizeState\(data\.session\)/);
  assert.equal(leveling.createSession().cloudHydrated, false);
});

test('EXT-L23: manifesto e popup mantêm as proteções de movimento reduzido e storage local', () => {
  const manifest = JSON.parse(read('extension/manifest.json'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.match(read('extension/popup.js'), /chrome\.storage\.local\.set/);
});

test('EXT-L24: o histórico visual preserva cada resposta apesar das janelas sobrepostas', () => {
  let state = run(leveling.createSession(), Array(24).fill('wrong'));
  let timeline = leveling.getAnswerTimeline(state);
  assert.equal(timeline.length, 24);
  assert.equal(new Set(timeline.map((entry: any) => entry.questionId)).size, 24);
  assert.ok(timeline.every((entry: any) => entry.answer === 'wrong'));

  state = run(state, Array(3).fill('correct'));
  timeline = leveling.getAnswerTimeline(state);
  assert.equal(state.levelingCompleted, false);
  assert.equal(timeline.length, 27);
  assert.deepEqual(timeline.slice(-3).map((entry: any) => entry.answer), Array(3).fill('correct'));

  state = run(state, ['correct']);
  assert.equal(state.levelingCompleted, true);
  assert.equal(leveling.getAnswerTimeline(state).length, 0, 'A aprovação deve limpar os quadradinhos visíveis imediatamente.');

  const nextSession = leveling.beginNewSession(state);
  assert.equal(nextSession.history.length, state.history.length, 'A limpeza visual não pode apagar o histórico salvo.');
  assert.equal(leveling.getAnswerTimeline(nextSession).length, 0, 'Uma nova tentativa começa sem quadradinhos anteriores.');

  const nextAttempt = run(nextSession, Array(6).fill('wrong'));
  assert.equal(leveling.getAnswerTimeline(nextAttempt).length, 6, 'Erros da tentativa atual continuam acumulando após uma conquista antiga.');
  const approvedAgain = run(nextAttempt, Array(4).fill('correct'));
  assert.equal(approvedAgain.levelingCompleted, true);
  assert.equal(leveling.getAnswerTimeline(approvedAgain).length, 0);
  assert.deepEqual(approvedAgain.history.slice(0, nextAttempt.history.length), nextAttempt.history, 'A segunda conquista continua preservando o histórico completo.');
  assert.ok(approvedAgain.history.length > nextAttempt.history.length);
});
