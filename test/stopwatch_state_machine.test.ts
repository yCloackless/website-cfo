import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transitionStopwatchState,
  switchStopwatchSubject,
  getElapsedStudyMs,
  getElapsedRestMs,
  type StopwatchState,
} from '../src/utils/stopwatchState';

test('30 transições Start/Pause/Resume/Stop são aplicadas uma vez e mantêm tempos monotônicos', () => {
  let state: StopwatchState = { status: 'STOPPED', accumulatedTime: 0, startTime: null };
  let now = 1_000;
  const sequence = ['RUNNING', 'PAUSED', 'RUNNING', 'PAUSED', 'RUNNING', 'STOPPED'] as const;
  let validTransitions = 0;

  for (let cycle = 0; cycle < 5; cycle += 1) {
    for (const target of sequence) {
      now += 1_000;
      const next = transitionStopwatchState(state, target, now);
      assert.ok(next, `transição válida para ${target} deve ocorrer no ciclo ${cycle + 1}`);
      state = next;
      validTransitions += 1;
      assert.equal(state.status, target);
      if (target === 'RUNNING') assert.ok(state.startTime);
      if (target !== 'RUNNING') assert.equal(state.startTime, null);
    }
  }

  assert.equal(validTransitions, 30);
  assert.equal(state.status, 'STOPPED');
  assert.equal(state.accumulatedTime, 0);
  assert.equal(transitionStopwatchState(state, 'STOPPED', now + 1), null, 'duplo clique em STOP não cria ação duplicada');
  assert.equal(transitionStopwatchState(state, 'PAUSED', now + 1), null, 'PAUSE em STOPPED não é transição válida');
});

test('tempo de estudo e descanso deriva de timestamps, sem acumular ticks perdidos', () => {
  let state: StopwatchState = { status: 'STOPPED', accumulatedTime: 2_000, startTime: null, restAccumulatedMs: 500 };
  state = transitionStopwatchState(state, 'RUNNING', 10_000)!;
  state = transitionStopwatchState(state, 'PAUSED', 25_000)!;
  assert.equal(state.accumulatedTime, 17_000);
  assert.equal(state.restStartTime, 25_000);
  state = transitionStopwatchState(state, 'RUNNING', 32_000)!;
  assert.equal(state.restAccumulatedMs, 7_500);
  assert.equal(state.startTime, 32_000);
});

test('switchStopwatchSubject fecha bloco de estudo anterior e inicia o próximo atomicamente quando RUNNING', () => {
  let state: StopwatchState = {
    status: 'STOPPED',
    accumulatedTime: 0,
    startTime: null,
    activeSubjectId: 'matematica',
    activeSubjectName: 'Matemática',
  };

  // Inicia em Matemática no t = 1000
  state = transitionStopwatchState(state, 'RUNNING', 1000)!;

  // No t = 3000 (2s depois), troca para Física
  state = switchStopwatchSubject(state, { id: 'fisica', name: 'Física' }, 3000);
  assert.equal(state.status, 'RUNNING');
  assert.equal(state.activeSubjectId, 'fisica');
  assert.equal(state.activeSubjectName, 'Física');
  assert.equal(state.accumulatedTime, 2000, 'tempo de Matemática acumulado');
  assert.equal(state.startTime, 3000, 'startTime resetado para o início de Física');
  assert.equal(state.intervals?.length, 1);
  assert.deepEqual(state.intervals![0], {
    type: 'study',
    durationMs: 2000,
    startTime: 1000,
    endTime: 3000,
    subjectId: 'matematica',
  });

  // No t = 6000 (3s depois de Física), troca para Química
  state = switchStopwatchSubject(state, { id: 'quimica', name: 'Química' }, 6000);
  assert.equal(state.activeSubjectId, 'quimica');
  assert.equal(state.accumulatedTime, 5000, '2s de Mat + 3s de Física');
  assert.equal(state.startTime, 6000);
  assert.equal(state.intervals?.length, 2);
  assert.deepEqual(state.intervals![1], {
    type: 'study',
    durationMs: 3000,
    startTime: 3000,
    endTime: 6000,
    subjectId: 'fisica',
  });

  // No t = 8000 (2s de Química), calcula tempo total decorrido via getElapsedStudyMs
  const currentElapsed = getElapsedStudyMs(state, 8000);
  assert.equal(currentElapsed, 7000, '2s Mat + 3s Fís + 2s Quím = 7s');

  // Pausa no t = 8000
  state = transitionStopwatchState(state, 'PAUSED', 8000)!;
  assert.equal(state.status, 'PAUSED');
  assert.equal(state.accumulatedTime, 7000);
  assert.equal(state.intervals?.length, 3);
  assert.deepEqual(state.intervals![2], {
    type: 'study',
    durationMs: 2000,
    startTime: 6000,
    endTime: 8000,
    subjectId: 'quimica',
  });

  // Troca de matéria durante a pausa (t = 9000)
  state = switchStopwatchSubject(state, { id: 'historia', name: 'História' }, 9000);
  assert.equal(state.status, 'PAUSED');
  assert.equal(state.activeSubjectId, 'historia');
  assert.equal(state.accumulatedTime, 7000, 'tempo de estudo não muda durante a pausa');
});
