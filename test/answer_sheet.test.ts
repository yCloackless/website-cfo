import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnswerTokens, formatAnswerTokens, gradeAnswerSheet } from '../src/utils/answerSheet';

test('parseAnswerTokens normalizes spacing, case, U blanks, and truncates to totalQuestions', () => {
  assert.deepEqual(
    parseAnswerTokens('e a  b b c u', 8),
    ['E', 'A', 'B', 'B', 'C', 'U', null, null]
  );

  assert.deepEqual(
    parseAnswerTokens('A B C D E F', 4),
    ['A', 'B', 'C', 'D']
  );

  assert.deepEqual(
    parseAnswerTokens('1)a 2.b x ? -', 5),
    ['A', 'B', null, 'U', 'U']
  );
});

test('formatAnswerTokens produces space-separated string keeping unfilled slots visible', () => {
  assert.equal(formatAnswerTokens(['E', 'A', 'B', 'U', null]), 'E A B U -');
});

test('gradeAnswerSheet scores against officialKey treating U as blank/unscored and listing wrongQuestions', () => {
  const result = gradeAnswerSheet(
    ['E', 'A', 'B', 'B', 'C', 'U'],
    ['E', 'D', 'B', 'A', 'C', 'E']
  );

  assert.equal(result.totalQuestions, 6);
  assert.equal(result.totalAnswered, 5);
  assert.equal(result.correctCount, 3); // Q1, Q3, Q5
  assert.equal(result.wrongCount, 2);   // Q2, Q4
  assert.equal(result.blankCount, 1);   // Q6 (U)
  assert.deepEqual(result.wrongQuestions, [2, 4]);
  assert.deepEqual(result.blankQuestions, [6]);
  assert.equal(result.accuracyPct, 50);
});
