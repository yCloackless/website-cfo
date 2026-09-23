export type StopwatchStatus = 'STOPPED' | 'RUNNING' | 'PAUSED';

export interface StopwatchInterval {
  type: 'study' | 'rest';
  durationMs: number;
  startTime: number;
  endTime: number;
  subjectId?: string;
}

export interface StopwatchState {
  status: StopwatchStatus;
  accumulatedTime: number;
  startTime: number | null;
  restAccumulatedMs?: number;
  restStartTime?: number | null;
  activeSubjectId?: string;
  activeSubjectName?: string;
  intervals?: StopwatchInterval[];
  resetAt?: number | null;
  lastAction?: string;
}

/**
 * Retorna o tempo real de estudo decorrido em milissegundos, derivado estritamente de timestamps.
 * Imune a atrasos de setInterval, congelamento de abas e descompassos do navegador.
 */
export function getElapsedStudyMs(state: StopwatchState, now: number): number {
  const base = Number.isFinite(state.accumulatedTime) && state.accumulatedTime >= 0 ? state.accumulatedTime : 0;
  if (state.status === 'RUNNING' && typeof state.startTime === 'number' && Number.isFinite(state.startTime) && state.startTime > 0) {
    return base + Math.max(0, now - state.startTime);
  }
  return base;
}

/**
 * Retorna o tempo real de descanso decorrido em milissegundos, derivado estritamente de timestamps.
 */
export function getElapsedRestMs(state: StopwatchState, now: number): number {
  const base = Number.isFinite(state.restAccumulatedMs) && state.restAccumulatedMs! >= 0 ? state.restAccumulatedMs! : 0;
  if (state.status === 'PAUSED' && typeof state.restStartTime === 'number' && Number.isFinite(state.restStartTime) && state.restStartTime > 0) {
    return base + Math.max(0, now - state.restStartTime);
  }
  return base;
}

/**
 * Transição pura da máquina de estados do cronômetro.
 * Status suportados: STOPPED, RUNNING, PAUSED.
 * Garante monotonicidade e preservação integral dos tempos acumulados.
 */
export function transitionStopwatchState(
  current: StopwatchState,
  target: StopwatchStatus,
  now: number,
  subject?: { id?: string; name?: string },
): StopwatchState | null {
  if (current.status === target) return null;
  if (target === 'PAUSED' && current.status !== 'RUNNING') return null;

  if (target === 'STOPPED') {
    return {
      status: 'STOPPED',
      accumulatedTime: 0,
      startTime: null,
      restAccumulatedMs: 0,
      restStartTime: null,
      activeSubjectId: subject?.id || current.activeSubjectId,
      activeSubjectName: subject?.name || current.activeSubjectName,
      intervals: [],
      resetAt: now,
      lastAction: 'reset',
    };
  }

  if (target === 'RUNNING') {
    const restElapsed = current.status === 'PAUSED' && current.restStartTime
      ? Math.max(0, now - current.restStartTime)
      : 0;
    const intervals = current.intervals ? [...current.intervals] : [];
    if (restElapsed > 0 && current.restStartTime) {
      intervals.push({
        type: 'rest',
        durationMs: restElapsed,
        startTime: current.restStartTime,
        endTime: now,
      });
    }

    return {
      ...current,
      status: 'RUNNING',
      startTime: now,
      restStartTime: null,
      restAccumulatedMs: (current.restAccumulatedMs || 0) + restElapsed,
      activeSubjectId: subject?.id || current.activeSubjectId,
      activeSubjectName: subject?.name || current.activeSubjectName,
      intervals,
      lastAction: 'start',
    };
  }

  // target === 'PAUSED'
  const studyElapsed = current.status === 'RUNNING' && current.startTime
    ? Math.max(0, now - current.startTime)
    : 0;
  const intervals = current.intervals ? [...current.intervals] : [];
  if (studyElapsed > 0 && current.startTime) {
    intervals.push({
      type: 'study',
      durationMs: studyElapsed,
      startTime: current.startTime,
      endTime: now,
      subjectId: current.activeSubjectId,
    });
  }

  return {
    ...current,
    status: 'PAUSED',
    startTime: null,
    restStartTime: now,
    accumulatedTime: current.accumulatedTime + studyElapsed,
    restAccumulatedMs: current.restAccumulatedMs || 0,
    activeSubjectId: subject?.id || current.activeSubjectId,
    activeSubjectName: subject?.name || current.activeSubjectName,
    intervals,
    lastAction: 'pause',
  };
}

/**
 * Transição atômica de troca de disciplina.
 * Se o cronômetro estiver em RUNNING: fecha o intervalo da disciplina anterior,
 * acumula o tempo e abre o intervalo da nova disciplina sem perda de milissegundos.
 */
export function switchStopwatchSubject(
  current: StopwatchState,
  newSubject: { id: string; name: string },
  now: number,
): StopwatchState {
  if (current.activeSubjectId === newSubject.id && current.activeSubjectName === newSubject.name) {
    return current;
  }

  if (current.status === 'RUNNING' && current.startTime) {
    const studyDelta = Math.max(0, now - current.startTime);
    const intervals = current.intervals ? [...current.intervals] : [];
    if (studyDelta > 0) {
      intervals.push({
        type: 'study',
        durationMs: studyDelta,
        startTime: current.startTime,
        endTime: now,
        subjectId: current.activeSubjectId,
      });
    }

    return {
      ...current,
      accumulatedTime: current.accumulatedTime + studyDelta,
      startTime: now,
      activeSubjectId: newSubject.id,
      activeSubjectName: newSubject.name,
      intervals,
    };
  }

  return {
    ...current,
    activeSubjectId: newSubject.id,
    activeSubjectName: newSubject.name,
  };
}
