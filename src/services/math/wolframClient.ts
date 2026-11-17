import { parse as mathParse } from 'mathjs';
import type { MathExtraPod, MathSolveResponse, MathStep } from './types';

const WOLFRAM_ENDPOINT = 'https://api.wolframalpha.com/v2/query';
const SOURCE_LABEL = 'WolframAlpha API';

export function isWolframConfigured(): boolean {
  const key = (process.env.WOLFRAM_APP_ID || '').trim();
  return key.length >= 6 && !key.includes('COLE_AQUI') && !key.includes('exemplo');
}

export function buildWolframQuery(expression: string, command?: string): string {
  const trimmed = expression.trim();
  if (!command) return trimmed;
  switch (command.toLowerCase()) {
    case '/derivar':
      return `derivative of ${trimmed}`;
    case '/integrar':
      return `integrate ${trimmed}`;
    case '/limite': {
      const parts = trimmed.split(',').map((s) => s.trim());
      if (parts.length >= 3) {
        return `limit of ${parts[0]} as ${parts[1]} -> ${parts[2]}`;
      }
      return `limit ${trimmed}`;
    }
    case '/resolver':
      return `solve ${trimmed}`;
    case '/sistema':
      return `solve ${trimmed.replace(/;/g, ', ')}`;
    case '/fatorar':
      return `factor ${trimmed}`;
    case '/expandir':
      return `expand ${trimmed}`;
    case '/simplificar':
      return `simplify ${trimmed}`;
    case '/matriz':
      return trimmed;
    case '/log':
    case '/trig':
    case '/cientifica':
    default:
      return trimmed;
  }
}

function plaintextToLatex(text: string, fallbackExpr?: string): string {
  const clean = text.trim();
  // Convert simple "a / b" into \frac{a}{b} for clean KaTeX display
  const simpleFrac = clean.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (simpleFrac) {
    return `\\frac{${simpleFrac[1]}}{${simpleFrac[2]}}`;
  }
  try {
    return mathParse(clean).toTex({ parenthesis: 'auto' });
  } catch {
    if (fallbackExpr && fallbackExpr !== clean) {
      try {
        return mathParse(fallbackExpr).toTex({ parenthesis: 'auto' });
      } catch {
        // ignore
      }
    }
    return clean;
  }
}

export function parseWolframJsonResponse(
  rawJson: any,
  originalInput: string,
  command?: string
): MathSolveResponse | null {
  const qr = rawJson?.queryresult;
  if (!qr || qr.success !== true || qr.error === true || !Array.isArray(qr.pods)) {
    return null;
  }

  const pods: Array<{ id?: string; title?: string; primary?: boolean; subpods?: Array<{ plaintext?: string }> }> =
    qr.pods;

  const getPodText = (pod: any): string =>
    (pod?.subpods || [])
      .map((s: any) => (s?.plaintext || '').trim())
      .filter(Boolean)
      .join('\n');

  const inputPod = pods.find((p) => p.id === 'Input' || /^input/i.test(p.title || ''));
  const resultPod =
    pods.find((p) => p.primary === true) ||
    pods.find((p) => /^(Result|Exact result|Solution|Derivative|Indefinite integral|Limit)$/i.test(p.title || '')) ||
    pods.find((p) => p.id === 'Result' || p.id === 'Solution');

  const decimalPod = pods.find((p) => /decimal approximation|numerical/i.test(p.title || ''));
  const stepPod = pods.find((p) => /step-by-step/i.test(p.title || '') || p.id === 'StepByStep');

  const inputText = getPodText(inputPod) || originalInput;
  const exactText = getPodText(resultPod);
  if (!exactText) {
    return null;
  }

  const decimalText = getPodText(decimalPod) || undefined;

  const steps: MathStep[] = [];
  if (stepPod) {
    const rawSteps = getPodText(stepPod)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    rawSteps.forEach((line, idx) => {
      steps.push({
        title: `Passo ${idx + 1}`,
        explanation: line,
      });
    });
  }

  const extraPods: MathExtraPod[] = pods
    .filter((p) => p !== inputPod && p !== resultPod && p !== decimalPod && p !== stepPod)
    .map((p) => ({
      title: p.title || 'Informação adicional',
      content: getPodText(p),
    }))
    .filter((p) => p.content.length > 0)
    .slice(0, 6);

  return {
    ok: true,
    source: 'wolfram',
    sourceLabel: SOURCE_LABEL,
    command,
    input: originalInput,
    inputLatex: plaintextToLatex(inputText, originalInput),
    exactResult: exactText,
    exactResultLatex: plaintextToLatex(exactText),
    decimalApproximation: decimalText,
    steps,
    extraPods,
  };
}

export async function solveWithWolfram(
  expression: string,
  command?: string,
  fetchImpl: typeof fetch = fetch
): Promise<MathSolveResponse | null> {
  if (!isWolframConfigured()) {
    return null;
  }

  const appId = process.env.WOLFRAM_APP_ID!.trim();
  const query = buildWolframQuery(expression, command);

  const params = new URLSearchParams({
    appid: appId,
    input: query,
    output: 'json',
    format: 'plaintext',
    podstate: 'Step-by-step solution',
  });

  try {
    const response = await fetchImpl(`${WOLFRAM_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    return parseWolframJsonResponse(json, expression, command);
  } catch {
    return null;
  }
}
