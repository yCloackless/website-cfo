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
      schemaVersion: 3,
      cloudHydrated: false,
      sessionId,
      revision: 1,
      batteryNumber: 1,
      questionsAnswered: 0,
      answerLog: [],
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

  function historyQuestionCount(history) {
    return (history || []).reduce((total, item) => total + (Array.isArray(item.answers) ? item.answers.length : 0), 0);
  }

  function restoreRollingLog(history, battery) {
    const entries = [];
    for (const result of history || []) {
      for (let index = 0; index < (result.answers || []).length; index += 1) {
        entries.push({
          questionId: result.questionIds?.[index] || `legacy:${entries.length + 1}`,
          answer: result.answers[index],
          answeredAt: result.completedAt || result.updatedAt || new Date().toISOString(),
        });
      }
    }
    for (let index = 0; index < (battery?.answers || []).length; index += 1) {
      entries.push({
        questionId: battery.questionIds?.[index] || `legacy:active:${index + 1}`,
        answer: battery.answers[index],
        answeredAt: battery.updatedAt || new Date().toISOString(),
      });
    }
    return entries;
  }

  function normalizeState(raw, now = new Date().toISOString()) {
    if ((raw?.schemaVersion === 2 || raw?.schemaVersion === 3) && raw.sessionId && Array.isArray(raw.history)) {
      const version = raw.schemaVersion;
      const normalized = {
        ...raw,
        schemaVersion: 3,
        cloudHydrated: raw.cloudHydrated !== false,
        questionsAnswered: Number.isSafeInteger(raw.questionsAnswered)
          ? raw.questionsAnswered
          : version === 3
            ? (raw.history.at(-1) ? (raw.history.at(-1).batteryNumber || raw.history.length) + 4 : (raw.activeBattery?.answers?.length || 0))
            : historyQuestionCount(raw.history) + (raw.activeBattery?.answers?.length || 0),
      };
      if (raw.levelingCompleted) {
        return {
          ...normalized,
          activeBattery: null,
          answerLog: Array.isArray(raw.answerLog) ? raw.answerLog.slice(-5) : restoreRollingLog(raw.history, null).slice(-5),
        };
      }

      const battery = raw.activeBattery;
      const validBattery = battery && Array.isArray(battery.answers)
        && battery.answers.every((answer) => answer === 'correct' || answer === 'wrong')
        && Array.isArray(battery.questionIds)
        && battery.questionIds.length >= battery.answers.length;
      if (!validBattery) {
        return {
          ...normalized,
          activeBattery: createBattery(raw.sessionId, (raw.batteryNumber || 0) + 1, now),
          answerLog: Array.isArray(raw.answerLog) ? raw.answerLog.slice(-5) : restoreRollingLog(raw.history, null).slice(-5),
        };
      }

      let migratedBattery = { ...battery, questionIds: [...battery.questionIds], answers: [...battery.answers] };
      if (version === 2 && battery.answers.length === 4 && battery.currentQuestionIndex === 4) {
        // A v2 fixed battery's four saved answers are still the newest four rolling responses.
        migratedBattery = { ...migratedBattery, questionIds: migratedBattery.questionIds.slice(-5) };
      }
      const answerLog = Array.isArray(raw.answerLog)
        ? raw.answerLog.slice(-5)
        : restoreRollingLog(version === 3 ? [] : raw.history, migratedBattery).slice(-5);
      return { ...normalized, activeBattery: migratedBattery, answerLog };
    }

    const migratedAnswers = Array.isArray(raw?.answers)
      ? raw.answers.filter((answer) => answer === 'correct' || answer === 'wrong')
      : [];
    const session = createSession(now);
    const legacyStartedAt = raw?.updatedAt || now;
    const answerLog = migratedAnswers.map((answer, index) => ({
      questionId: `legacy:${index + 1}`,
      answer,
      answeredAt: legacyStartedAt,
    }));
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
    session.questionsAnswered = migratedAnswers.length;
    session.answerLog = answerLog.slice(-5);
    session.batteryNumber = session.history.length + 1;
    const remaining = migratedAnswers.slice(-4);
    session.activeBattery = createBattery(session.sessionId, session.batteryNumber, legacyStartedAt);
    session.activeBattery.answers = remaining;
    session.activeBattery.questionIds = [
      ...(remaining.length ? answerLog.slice(-remaining.length).map((entry) => entry.questionId) : []),
      ...Array.from({ length: 5 - remaining.length }, (_, index) => `${session.activeBattery.batteryId}:${index + 1}`),
    ];
    session.activeBattery.currentQuestionIndex = remaining.length;
    session.activeBattery.updatedAt = legacyStartedAt;
    session.bestScore = session.history.reduce((best, item) => Math.max(best, item.percentage), 0);
    session.revision += 1;
    session.cloudHydrated = true;
    return session;
  }

  function answer(state, answer, now = new Date().toISOString()) {
    if (!['correct', 'wrong'].includes(answer) || state.levelingCompleted || !state.activeBattery) return state;
    const battery = state.activeBattery;
    if (battery.answers.length >= 5) return state;
    const questionId = battery.questionIds[battery.answers.length] || `${battery.batteryId}:${battery.answers.length + 1}`;
    const nextAnswers = [...battery.answers, answer];
    const nextAnswerLog = [...(state.answerLog || []).slice(-4), { questionId, answer, answeredAt: now }];
    const next = {
      ...state,
      revision: state.revision + 1,
      questionsAnswered: (state.questionsAnswered || 0) + 1,
      answerLog: nextAnswerLog,
      updatedAt: now,
    };
    if (nextAnswers.length < 5) {
      next.activeBattery = {
        ...battery,
        answers: nextAnswers,
        currentQuestionIndex: nextAnswers.length,
        updatedAt: now,
      };
      return next;
    }

    const correct = nextAnswers.filter((item) => item === 'correct').length;
    const achievement = correct >= 4
      ? { id: makeId(), batteryId: battery.batteryId, shown: false, createdAt: now }
      : null;
    const result = {
      batteryId: battery.batteryId,
      batteryNumber: battery.batteryNumber,
      questionIds: battery.questionIds.slice(-5),
      answers: nextAnswers,
      correctAnswersCount: correct,
      percentage: correct * 20,
      status: correct >= 4 ? 'approved' : 'failed',
      startedAt: battery.startedAt,
      completedAt: now,
      ...(achievement ? { achievementId: achievement.id, achievementShown: false } : {}),
    };
    next.history = [...state.history, result];
    next.bestScore = Math.max(state.bestScore || 0, result.percentage);
    next.batteryNumber = battery.batteryNumber + 1;
    if (correct >= 4) {
      next.levelingCompleted = true;
      next.activeBattery = null;
      next.completedAt = now;
      next.achievement = achievement;
    } else {
      const nextBattery = createBattery(state.sessionId, next.batteryNumber, now);
      nextBattery.answers = nextAnswerLog.slice(-4).map((entry) => entry.answer);
      nextBattery.startedAt = nextAnswerLog.at(-4)?.answeredAt || now;
      nextBattery.questionIds = [
        ...nextAnswerLog.slice(-4).map((entry) => entry.questionId),
        `${nextBattery.batteryId}:5`,
      ];
      nextBattery.currentQuestionIndex = nextBattery.answers.length;
      next.activeBattery = nextBattery;
    }
    return next;
  }

  function markAchievementShown(state) {
    if (!state.achievement || state.achievement.shown) return state;
    const shownAt = new Date().toISOString();
    return {
      ...state,
      revision: state.revision + 1,
      updatedAt: shownAt,
      history: state.history.map((result) => result.achievementId === state.achievement.id
        ? { ...result, achievementShown: true, achievementShownAt: shownAt }
        : result),
      achievement: { ...state.achievement, shown: true, shownAt },
    };
  }

  function getAnswerTimeline(state) {
    const timeline = [];
    const seenQuestionIds = new Set();
    const append = (questionIds, answers, fallbackPrefix, answeredAt) => {
      if (!Array.isArray(answers)) return;
      answers.forEach((answer, index) => {
        if (answer !== 'correct' && answer !== 'wrong') return;
        const questionId = Array.isArray(questionIds) && typeof questionIds[index] === 'string' && questionIds[index]
          ? questionIds[index]
          : `${fallbackPrefix}:${index + 1}`;
        if (seenQuestionIds.has(questionId)) return;
        seenQuestionIds.add(questionId);
        timeline.push({ questionId, answer, answeredAt });
      });
    };

    (state?.history || []).forEach((result, index) => {
      append(result.questionIds, result.answers, `history:${result.batteryId || index}`, result.completedAt || result.updatedAt || null);
    });
    const battery = state?.activeBattery;
    if (battery) append(battery.questionIds, battery.answers, `active:${battery.batteryId || 'battery'}`, battery.updatedAt || null);
    (state?.answerLog || []).forEach((entry, index) => {
      append([entry.questionId], [entry.answer], `answer-log:${index}`, entry.answeredAt || null);
    });
    return timeline;
  }

  root.CfoLevelingState = { createSession, beginNewSession, createBattery, normalizeState, answer, markAchievementShown, getAnswerTimeline };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CfoLevelingState;
})(globalThis);
