(function (root) {
  const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

  function createBattery(sessionId, batteryNumber, now = new Date().toISOString()) {
    const batteryId = makeId();
    return {
      batteryId,
      batteryNumber,
      questionIds: Array.from({ length: 5 }, (_, index) => `${batteryId}:${index + 1}`),
      answers: [],
      currentQuestionIndex: 0,
      status: 'in_progress',
      startedAt: now,
      updatedAt: now,
    };
  }

  function createSession(now = new Date().toISOString()) {
    const sessionId = makeId();
    return {
      schemaVersion: 2,
      cloudHydrated: false,
      sessionId,
      revision: 1,
      batteryNumber: 1,
      activeBattery: createBattery(sessionId, 1, now),
      history: [],
      levelingCompleted: false,
      achievement: null,
      bestScore: 0,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };
  }

  function beginNewSession(previous, now = new Date().toISOString()) {
    const session = createSession(now);
    session.history = previous?.history || [];
    session.cloudHydrated = previous?.cloudHydrated !== false;
    session.batteryNumber = session.history.length + 1;
    session.activeBattery = createBattery(session.sessionId, session.batteryNumber, now);
    session.bestScore = previous?.bestScore || 0;
    session.revision = (previous?.revision || 0) + 1;
    return session;
  }

  function normalizeState(raw, now = new Date().toISOString()) {
    if (raw?.schemaVersion === 2 && raw.sessionId && Array.isArray(raw.history)) {
      const normalized = { ...raw, cloudHydrated: raw.cloudHydrated !== false };
      if (raw.levelingCompleted) return { ...normalized, activeBattery: null };
      const battery = raw.activeBattery;
      if (battery && Array.isArray(battery.answers) && battery.answers.length < 5
        && battery.questionIds?.length === 5) return normalized;
      return { ...normalized, activeBattery: createBattery(raw.sessionId, (raw.batteryNumber || 0) + 1, now) };
    }

    const migratedAnswers = Array.isArray(raw?.answers)
      ? raw.answers.filter((answer) => answer === 'correct' || answer === 'wrong')
      : [];
    const session = createSession(now);
    const legacyStartedAt = raw?.updatedAt || now;
    for (let offset = 0; offset + 5 <= migratedAnswers.length; offset += 5) {
      const answers = migratedAnswers.slice(offset, offset + 5);
      const correct = answers.filter((answer) => answer === 'correct').length;
      session.history.push({
        batteryId: makeId(),
        batteryNumber: session.history.length + 1,
        questionIds: answers.map((_, index) => `legacy:${offset + index + 1}`),
        answers,
        correctAnswersCount: correct,
        percentage: correct * 20,
        status: correct >= 4 ? 'approved' : 'failed',
        startedAt: legacyStartedAt,
        completedAt: legacyStartedAt,
        migrated: true,
      });
    }
    const remainder = migratedAnswers.length % 5;
    session.batteryNumber = session.history.length + 1;
    session.activeBattery = createBattery(session.sessionId, session.batteryNumber, legacyStartedAt);
    session.activeBattery.answers = migratedAnswers.slice(-remainder || migratedAnswers.length);
    session.activeBattery.currentQuestionIndex = session.activeBattery.answers.length;
    session.activeBattery.updatedAt = legacyStartedAt;
    session.history.forEach((item) => { session.bestScore = Math.max(session.bestScore, item.percentage); });
    session.revision += 1;
    session.cloudHydrated = true;
    return session;
  }

  function answer(state, answer, now = new Date().toISOString()) {
    if (!['correct', 'wrong'].includes(answer) || state.levelingCompleted || !state.activeBattery) return state;
    const battery = state.activeBattery;
    if (battery.answers.length >= 5) return state;
    const nextAnswers = [...battery.answers, answer];
    const next = { ...state, revision: state.revision + 1, updatedAt: now };
    if (nextAnswers.length < 5) {
      next.activeBattery = { ...battery, answers: nextAnswers, currentQuestionIndex: nextAnswers.length, updatedAt: now };
      return next;
    }

    const correct = nextAnswers.filter((item) => item === 'correct').length;
    const result = {
      batteryId: battery.batteryId,
      batteryNumber: battery.batteryNumber,
      questionIds: battery.questionIds,
      answers: nextAnswers,
      correctAnswersCount: correct,
      percentage: correct * 20,
      status: correct >= 4 ? 'approved' : 'failed',
      startedAt: battery.startedAt,
      completedAt: now,
    };
    next.history = [...state.history, result];
    next.bestScore = Math.max(state.bestScore || 0, result.percentage);
    next.batteryNumber = battery.batteryNumber + 1;
    if (correct >= 4) {
      next.levelingCompleted = true;
      next.activeBattery = null;
      next.completedAt = now;
      next.achievement = { id: makeId(), batteryId: battery.batteryId, shown: false, createdAt: now };
    } else {
      next.activeBattery = createBattery(state.sessionId, next.batteryNumber, now);
    }
    return next;
  }

  function markAchievementShown(state) {
    if (!state.achievement || state.achievement.shown) return state;
    return { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString(), achievement: { ...state.achievement, shown: true } };
  }

  root.CfoLevelingState = { createSession, beginNewSession, createBattery, normalizeState, answer, markAchievementShown };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CfoLevelingState;
})(globalThis);
