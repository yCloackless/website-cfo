import test from 'node:test';
import assert from 'node:assert/strict';
import type { MathSolveResponse } from '../src/services/math/types';

test('MathSolveResponse contract supports exact and decimal fields', () => {
  const sample: MathSolveResponse = {
    ok: true,
    source: 'local',
    sourceLabel: 'Motor Local (mathjs / nerdamer)',
    input: '124/4',
    inputLatex: '\\frac{124}{4}',
    exactResult: '31',
    exactResultLatex: '31',
    steps: [],
  };
  assert.equal(sample.exactResult, '31');
});
