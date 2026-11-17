import test from 'node:test';
import assert from 'node:assert/strict';
import type { MathSolveResponse } from '../src/services/math/types';
import {
  validateMathInput,
  solveWithLocalEngine,
} from '../src/services/math/localMathEngine';

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

test('localMathEngine: divides 124/4 exactly with LaTeX and steps', () => {
  const res = solveWithLocalEngine('124/4');
  assert.equal(res.ok, true);
  assert.equal(res.source, 'local');
  assert.equal(res.inputLatex, '\\frac{124}{4}');
  assert.equal(res.exactResult, '31');
  assert.equal(res.exactResultLatex, '31');
  assert.ok(res.steps.length >= 1);
});

test('localMathEngine: simplifies fraction 18/24 to 3/4 and decimal 0.75', () => {
  const res = solveWithLocalEngine('18/24');
  assert.equal(res.ok, true);
  assert.equal(res.exactResultLatex, '\\frac{3}{4}');
  assert.equal(res.decimalApproximation, '0.75');
});

test('localMathEngine: powers and roots sqrt(144) + 2^5', () => {
  const res = solveWithLocalEngine('sqrt(144) + 2^5');
  assert.equal(res.ok, true);
  assert.equal(res.exactResult, '44');
});

test('localMathEngine: solves 1st degree equation /resolver 2*x + 6 = 14', () => {
  const res = solveWithLocalEngine('/resolver 2*x + 6 = 14');
  assert.equal(res.ok, true);
  assert.match(res.exactResult, /4/);
  assert.ok(res.steps.length >= 1);
});

test('localMathEngine: solves 2nd degree equation x^2 - 5*x + 6 = 0 with Bhaskara steps', () => {
  const res = solveWithLocalEngine('x^2 - 5*x + 6 = 0');
  assert.equal(res.ok, true);
  assert.match(res.exactResult, /2/);
  assert.match(res.exactResult, /3/);
  assert.ok(res.steps.some((s) => /delta|discriminante|bhaskara/i.test(s.title + ' ' + s.explanation)));
});

test('localMathEngine: solves linear system /sistema x + y = 10; x - y = 2', () => {
  const res = solveWithLocalEngine('/sistema x + y = 10; x - y = 2');
  assert.equal(res.ok, true);
  assert.match(res.exactResult, /6/);
  assert.match(res.exactResult, /4/);
});

test('localMathEngine: logarithms and exponentials', () => {
  const logRes = solveWithLocalEngine('log(100, 10)');
  assert.equal(logRes.ok, true);
  assert.equal(logRes.exactResult, '2');

  const expRes = solveWithLocalEngine('exp(0)');
  assert.equal(expRes.ok, true);
  assert.equal(expRes.exactResult, '1');
});

test('localMathEngine: trigonometry sin(pi/6)', () => {
  const res = solveWithLocalEngine('sin(pi/6)');
  assert.equal(res.ok, true);
  assert.ok(res.exactResult === '1/2' || res.exactResult === '0.5' || res.decimalApproximation === '0.5');
});

test('localMathEngine: derivative /derivar x^3 + 2*x', () => {
  const res = solveWithLocalEngine('/derivar x^3 + 2*x');
  assert.equal(res.ok, true);
  assert.match(res.exactResult, /3.*x\^2/);
  assert.match(res.exactResult, /2/);
});

test('localMathEngine: integral /integrar 3*x^2', () => {
  const res = solveWithLocalEngine('/integrar 3*x^2');
  assert.equal(res.ok, true);
  assert.match(res.exactResult, /x\^3/);
});

test('localMathEngine: limit /limite sin(x)/x, x, 0', () => {
  const res = solveWithLocalEngine('/limite sin(x)/x, x, 0');
  assert.equal(res.ok, true);
  assert.equal(res.exactResult, '1');
});

test('localMathEngine: matrix determinant /matriz det([[1, 2], [3, 4]])', () => {
  const res = solveWithLocalEngine('/matriz det([[1, 2], [3, 4]])');
  assert.equal(res.ok, true);
  assert.equal(res.exactResult, '-2');
});

test('localMathEngine: scientific notation 3.2e4 * 2', () => {
  const res = solveWithLocalEngine('3.2e4 * 2');
  assert.equal(res.ok, true);
  assert.equal(res.exactResult, '64000');
});

test('localMathEngine: rejects unsafe payloads, long strings, and division by zero', () => {
  const injection = validateMathInput('process.exit(1)');
  assert.equal(injection.valid, false);

  const tooLong = validateMathInput('1+'.repeat(300));
  assert.equal(tooLong.valid, false);

  const divZero = solveWithLocalEngine('1/0');
  assert.equal(divZero.ok, false);
  assert.match(divZero.error || '', /zero|indefinid|divis/i);
});

import {
  isWolframConfigured,
  buildWolframQuery,
  parseWolframJsonResponse,
  solveWithWolfram,
} from '../src/services/math/wolframClient';

test('wolframClient: buildWolframQuery translates slash commands', () => {
  assert.equal(buildWolframQuery('x^2', '/derivar'), 'derivative of x^2');
  assert.equal(buildWolframQuery('3*x^2', '/integrar'), 'integrate 3*x^2');
  assert.equal(buildWolframQuery('124/4'), '124/4');
});

test('wolframClient: parseWolframJsonResponse extracts exact result, decimal, and steps', () => {
  const mockJson = {
    queryresult: {
      success: true,
      error: false,
      pods: [
        {
          title: 'Input',
          id: 'Input',
          subpods: [{ plaintext: '124 / 4' }],
        },
        {
          title: 'Exact result',
          id: 'Result',
          primary: true,
          subpods: [{ plaintext: '31' }],
        },
        {
          title: 'Step-by-step solution',
          id: 'StepByStep',
          subpods: [{ plaintext: 'Divide 124 by 4 to get 31.' }],
        },
      ],
    },
  };

  const parsed = parseWolframJsonResponse(mockJson, '124/4');
  assert.ok(parsed);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, 'wolfram');
  assert.equal(parsed.exactResult, '31');
  assert.ok(parsed.steps.length >= 1);
});

test('wolframClient: returns null when WOLFRAM_APP_ID is absent or fetch fails', async () => {
  const prev = process.env.WOLFRAM_APP_ID;
  delete process.env.WOLFRAM_APP_ID;
  assert.equal(isWolframConfigured(), false);
  const noKeyRes = await solveWithWolfram('124/4');
  assert.equal(noKeyRes, null);

  process.env.WOLFRAM_APP_ID = 'DEMO_KEY';
  const failingFetch = (async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  })) as unknown as typeof fetch;

  const failRes = await solveWithWolfram('124/4', undefined, failingFetch);
  assert.equal(failRes, null);

  if (prev !== undefined) process.env.WOLFRAM_APP_ID = prev;
  else delete process.env.WOLFRAM_APP_ID;
});

import {
  validateMathImageBuffer,
  extractMathFromImage,
} from '../src/services/math/imageExtractor';

test('imageExtractor: validates PNG, JPEG, WEBP magic bytes and rejects disguised files/oversize', () => {
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  assert.deepEqual(validateMathImageBuffer(pngBuf, 'image/png'), {
    valid: true,
    mimeType: 'image/png',
  });

  const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.deepEqual(validateMathImageBuffer(jpgBuf, 'image/jpeg'), {
    valid: true,
    mimeType: 'image/jpeg',
  });

  const webpBuf = Buffer.from('524946460000000057454250', 'hex');
  assert.deepEqual(validateMathImageBuffer(webpBuf, 'image/webp'), {
    valid: true,
    mimeType: 'image/webp',
  });

  const disguisedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const svgRes = validateMathImageBuffer(disguisedSvg, 'image/png');
  assert.equal(svgRes.valid, false);

  const tooBig = Buffer.alloc(5 * 1024 * 1024 + 10);
  const bigRes = validateMathImageBuffer(tooBig, 'image/png');
  assert.equal(bigRes.valid, false);
});

test('imageExtractor: returns friendly error when no vision API key is configured', async () => {
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const res = await extractMathFromImage(pngBuf, 'image/png');
  assert.equal(res.ok, false);
  assert.ok((res.error || '').length > 10);

  if (prevGemini !== undefined) process.env.GEMINI_API_KEY = prevGemini;
  if (prevOpenai !== undefined) process.env.OPENAI_API_KEY = prevOpenai;
});
