process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';

function createMemoryRepo() {
  const store = new Map<string, string>();
  return {
    getValue(userId: string, key: string): string | null {
      return store.get(`${userId}::${key}`) ?? null;
    },
    upsertValue(userId: string, key: string, value: string): string {
      store.set(`${userId}::${key}`, value);
      return new Date().toISOString();
    },
  };
}

function buildValidGeneratedPayload() {
  const makeQ = (idx: number, block: 1 | 2 | 3 | 4, isReserve = false) => ({
    id: isReserve ? `res_b${block}` : `q_${idx}`,
    level: isReserve ? 0 : idx,
    block,
    discipline: 'História do Brasil',
    statement: `Questão ${isReserve ? `reserva bloco ${block}` : idx} sobre História do Brasil no estilo UERJ/CFO.`,
    options: [
      `Alternativa A (${idx})`,
      `Alternativa B (${idx})`,
      `Alternativa C (${idx})`,
      `Alternativa D (${idx})`,
    ],
    correctIndex: idx % 4,
    explanation: `Explicação tática da questão ${idx}.`,
    referenceTip: `Dica CFO ${idx}.`,
  });

  const questions = [
    ...Array.from({ length: 5 }, (_, i) => makeQ(i + 1, 1)),
    ...Array.from({ length: 5 }, (_, i) => makeQ(i + 6, 2)),
    ...Array.from({ length: 5 }, (_, i) => makeQ(i + 11, 3)),
    makeQ(16, 4),
  ];
  const reserves = [makeQ(101, 1, true), makeQ(102, 2, true), makeQ(103, 3, true)];
  return { questions, reserves };
}

function createFakeAiClient(payloadOverride?: unknown) {
  return {
    models: {
      async generateContent() {
        const data = payloadOverride ?? buildValidGeneratedPayload();
        return { text: JSON.stringify(data) };
      },
    },
  };
}

test('startMillionMatch rejects when aiClient is null and validates incomplete batch', async () => {
  const { startMillionMatch } = await import('../src/services/millionGameService');
  const repo = createMemoryRepo();

  const noAi = await startMillionMatch({
    repo,
    userId: 'u1',
    topic: 'História do Brasil',
    aiClient: null,
  });
  assert.equal(noAi.ok, false);
  assert.equal(noAi.status, 503);
  assert.equal(noAi.error, 'AI_UNAVAILABLE');

  const incomplete = await startMillionMatch({
    repo,
    userId: 'u1',
    topic: 'História do Brasil',
    aiClient: createFakeAiClient({ questions: [], reserves: [] }),
  });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.status, 502);
});

test('sanitizeMatchForClient hides correctIndex, explanation, and future questions, and blocks concurrent start with 409', async () => {
  const { startMillionMatch, getMillionState } = await import('../src/services/millionGameService');
  const repo = createMemoryRepo();

  const started = await startMillionMatch({
    repo,
    userId: 'u1',
    topic: 'História do Brasil',
    aiClient: createFakeAiClient(),
  });
  assert.equal(started.ok, true);
  assert.equal(started.data.currentLevel, 1);
  const serialized = JSON.stringify(started.data);
  assert.equal(serialized.includes('correctIndex'), false);
  assert.equal(serialized.includes('Explicação tática'), false);
  assert.equal(serialized.includes('q_2'), false);
  assert.equal(serialized.includes('res_b1'), false);

  const duplicateStart = await startMillionMatch({
    repo,
    userId: 'u1',
    topic: 'Física',
    aiClient: createFakeAiClient(),
  });
  assert.equal(duplicateStart.ok, false);
  assert.equal(duplicateStart.status, 409);
  assert.equal(duplicateStart.error, 'ACTIVE_MATCH_EXISTS');

  const state = getMillionState(repo, 'u1');
  assert.equal(state.activeMatch?.id, started.data.id);
});

test('useMillionHelp enforces cards (1-3 wrong removed), 1 skip per block, universitarios sum 100, and Q16 block', async () => {
  const { startMillionMatch, useMillionHelp, answerMillionQuestion } = await import('../src/services/millionGameService');
  const repo = createMemoryRepo();
  const started = await startMillionMatch({
    repo,
    userId: 'u1',
    topic: 'História do Brasil',
    aiClient: createFakeAiClient(),
  });
  assert.equal(started.ok, true);
  let match = started.data;

  // Cards removes 1..3 wrong options (never correctIndex) and cannot be reused
  const cards = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: match.currentQuestion.id,
    helpType: 'cards',
  });
  assert.equal(cards.ok, true);
  assert.ok(cards.data.eliminatedIndices.length >= 1 && cards.data.eliminatedIndices.length <= 3);
  assert.equal(cards.data.eliminatedIndices.includes(1 % 4), false);

  const cardsAgain = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: match.currentQuestion.id,
    helpType: 'cards',
  });
  assert.equal(cardsAgain.ok, false);
  assert.equal(cardsAgain.status, 409);

  // Universitarios sums to 100 and cannot be reused
  const univ = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: match.currentQuestion.id,
    helpType: 'universitarios',
  });
  assert.equal(univ.ok, true);
  const sum = univ.data.universitariosHint!.votes.reduce((a, b) => a + b, 0);
  assert.equal(sum, 100);

  // Skip once in Block 1 succeeds, second skip in Block 1 fails with 409
  const skip1 = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: match.currentQuestion.id,
    helpType: 'skip',
  });
  assert.equal(skip1.ok, true);
  assert.equal(skip1.data.question.id, 'res_b1');

  const skip1Again = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: skip1.data.question.id,
    helpType: 'skip',
  });
  assert.equal(skip1Again.ok, false);
  assert.equal(skip1Again.status, 409);
  assert.equal(skip1Again.error, 'HELP_UNAVAILABLE_IN_BLOCK');

  // Advance to Q16 (answering reserve Q1..Q5, then Q6..Q15)
  let currentQId = skip1.data.question.id;
  for (let lvl = 1; lvl <= 15; lvl += 1) {
    const expectedCorrect = lvl === 1 ? 101 % 4 : lvl % 4;
    const ans = answerMillionQuestion({
      repo,
      userId: 'u1',
      matchId: match.id,
      questionId: currentQId,
      selectedIndex: expectedCorrect,
    });
    assert.equal(ans.ok, true);
    assert.equal(ans.data.isCorrect, true);
    currentQId = ans.data.nextQuestion!.id;
  }

  // At Q16, all helps must return 409 HELP_DISABLED_AT_MILLION
  const helpAtMillion = useMillionHelp({
    repo,
    userId: 'u1',
    matchId: match.id,
    questionId: currentQId,
    helpType: 'skip',
  });
  assert.equal(helpAtMillion.ok, false);
  assert.equal(helpAtMillion.status, 409);
  assert.equal(helpAtMillion.error, 'HELP_DISABLED_AT_MILLION');
});

test('answerMillionQuestion awards 1_000_000 on Q16 win, 0 on Q16 loss, 2_500 on Q6 loss, and blocks replay', async () => {
  const { startMillionMatch, answerMillionQuestion, getMillionState } = await import('../src/services/millionGameService');
  const repo = createMemoryRepo();

  // Win full match
  const s1 = await startMillionMatch({ repo, userId: 'u1', topic: 'História', aiClient: createFakeAiClient() });
  assert.equal(s1.ok, true);
  let qId = s1.data.currentQuestion.id;
  for (let lvl = 1; lvl <= 15; lvl += 1) {
    const res = answerMillionQuestion({ repo, userId: 'u1', matchId: s1.data.id, questionId: qId, selectedIndex: lvl % 4 });
    assert.equal(res.ok, true);
    qId = res.data.nextQuestion!.id;
  }
  const win = answerMillionQuestion({ repo, userId: 'u1', matchId: s1.data.id, questionId: qId, selectedIndex: 16 % 4 });
  assert.equal(win.ok, true);
  assert.equal(win.data.status, 'WON');
  assert.equal(win.data.earnedPrize, 1_000_000);

  // Replay same Q16 returns 409
  const replay = answerMillionQuestion({ repo, userId: 'u1', matchId: s1.data.id, questionId: qId, selectedIndex: 16 % 4 });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);

  // Q6 wrong pays 2_500
  const s2 = await startMillionMatch({ repo, userId: 'u1', topic: 'Química', aiClient: createFakeAiClient() });
  assert.equal(s2.ok, true);
  qId = s2.data.currentQuestion.id;
  for (let lvl = 1; lvl <= 5; lvl += 1) {
    const res = answerMillionQuestion({ repo, userId: 'u1', matchId: s2.data.id, questionId: qId, selectedIndex: lvl % 4 });
    assert.equal(res.ok, true);
    qId = res.data.nextQuestion!.id;
  }
  const loseQ6 = answerMillionQuestion({ repo, userId: 'u1', matchId: s2.data.id, questionId: qId, selectedIndex: (6 + 1) % 4 });
  assert.equal(loseQ6.ok, true);
  assert.equal(loseQ6.data.status, 'LOST');
  assert.equal(loseQ6.data.earnedPrize, 2_500);

  // Q16 wrong pays 0
  const s3 = await startMillionMatch({ repo, userId: 'u1', topic: 'Física', aiClient: createFakeAiClient() });
  assert.equal(s3.ok, true);
  qId = s3.data.currentQuestion.id;
  for (let lvl = 1; lvl <= 15; lvl += 1) {
    const res = answerMillionQuestion({ repo, userId: 'u1', matchId: s3.data.id, questionId: qId, selectedIndex: lvl % 4 });
    assert.equal(res.ok, true);
    qId = res.data.nextQuestion!.id;
  }
  const loseQ16 = answerMillionQuestion({ repo, userId: 'u1', matchId: s3.data.id, questionId: qId, selectedIndex: (16 + 1) % 4 });
  assert.equal(loseQ16.ok, true);
  assert.equal(loseQ16.data.status, 'LOST');
  assert.equal(loseQ16.data.earnedPrize, 0);

  const finalState = getMillionState(repo, 'u1');
  assert.equal(finalState.activeMatch, null);
  assert.equal(finalState.stats.bestPrize, 1_000_000);
  assert.equal(finalState.stats.wins, 1);
  assert.equal(finalState.stats.totalMatches, 3);
});

test('stopMillionMatch stops at Q1 with 0 and at Q6 with 5_000', async () => {
  const { startMillionMatch, answerMillionQuestion, stopMillionMatch } = await import('../src/services/millionGameService');
  const repo = createMemoryRepo();

  const s1 = await startMillionMatch({ repo, userId: 'u1', topic: 'Português', aiClient: createFakeAiClient() });
  assert.equal(s1.ok, true);
  const stop1 = stopMillionMatch({ repo, userId: 'u1', matchId: s1.data.id });
  assert.equal(stop1.ok, true);
  assert.equal(stop1.data.status, 'STOPPED');
  assert.equal(stop1.data.earnedPrize, 0);

  const s2 = await startMillionMatch({ repo, userId: 'u1', topic: 'Biologia', aiClient: createFakeAiClient() });
  assert.equal(s2.ok, true);
  let qId = s2.data.currentQuestion.id;
  for (let lvl = 1; lvl <= 5; lvl += 1) {
    const res = answerMillionQuestion({ repo, userId: 'u1', matchId: s2.data.id, questionId: qId, selectedIndex: lvl % 4 });
    assert.equal(res.ok, true);
    qId = res.data.nextQuestion!.id;
  }
  const stop6 = stopMillionMatch({ repo, userId: 'u1', matchId: s2.data.id });
  assert.equal(stop6.ok, true);
  assert.equal(stop6.data.status, 'STOPPED');
  assert.equal(stop6.data.earnedPrize, 5_000);
});
