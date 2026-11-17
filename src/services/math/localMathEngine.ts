import { create, all, MathNode } from 'mathjs';
import nerdamer from 'nerdamer';
import type { MathSolveResponse, MathStep } from './types';

const math = create(all, {
  number: 'number',
  precision: 14,
});

const SOURCE_LABEL = 'Motor Local (mathjs / nerdamer)';
const MAX_INPUT_LENGTH = 500;

const FORBIDDEN_TOKENS =
  /\b(?:process|require|import|export|eval|Function|window|global|globalThis|__proto__|constructor|prototype|child_process|fs)\b/i;

const KNOWN_COMMANDS = new Set([
  '/resolver',
  '/sistema',
  '/derivar',
  '/integrar',
  '/limite',
  '/simplificar',
  '/fatorar',
  '/expandir',
  '/matriz',
  '/log',
  '/trig',
  '/cientifica',
]);

export interface ValidatedMathInput {
  valid: boolean;
  normalized: string;
  command?: string;
  error?: string;
}

function hasBalancedDelimiters(input: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const ch of input) {
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}

export function validateMathInput(raw: string): ValidatedMathInput {
  if (typeof raw !== 'string') {
    return { valid: false, normalized: '', error: 'Expressão inválida.' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, normalized: '', error: 'Digite uma expressão matemática.' };
  }

  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      valid: false,
      normalized: '',
      error: `A expressão excede o limite de ${MAX_INPUT_LENGTH} caracteres.`,
    };
  }

  if (FORBIDDEN_TOKENS.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      error: 'Expressão contém termos não permitidos por segurança.',
    };
  }

  let command: string | undefined;
  let body = trimmed;

  const cmdMatch = trimmed.match(/^(\/[a-zA-ZÀ-ÿ]+)(?:\s+([\s\S]*))?$/);
  if (cmdMatch) {
    const candidate = cmdMatch[1].toLowerCase();
    if (!KNOWN_COMMANDS.has(candidate)) {
      return {
        valid: false,
        normalized: '',
        error: `Comando desconhecido: ${candidate}. Use / para ver os comandos disponíveis.`,
      };
    }
    command = candidate;
    body = (cmdMatch[2] || '').trim();
    if (!body) {
      return {
        valid: false,
        normalized: '',
        command,
        error: `Informe uma expressão após o comando ${command}.`,
      };
    }
  }

  if (!hasBalancedDelimiters(body)) {
    return {
      valid: false,
      normalized: '',
      command,
      error: 'Parênteses ou colchetes desbalanceados na expressão.',
    };
  }

  return { valid: true, normalized: body, command };
}

function safeToTex(expr: string): string {
  try {
    const parsed: MathNode = math.parse(expr);
    return parsed.toTex({ parenthesis: 'auto' });
  } catch {
    try {
      return nerdamer(expr).toTeX();
    } catch {
      return expr;
    }
  }
}

function formatSimpleFractionLatex(expr: string): string | null {
  const fracMatch = expr.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
  if (!fracMatch) return null;
  const num = Number(fracMatch[1]);
  const den = Number(fracMatch[2]);
  if (den === 0) return null;
  return `\\frac{${num}}{${den}}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function formatDecimal(val: number): string {
  if (Object.is(val, -0)) return '0';
  const rounded = Number(val.toPrecision(12));
  return String(rounded);
}

function formatScientific(val: number): string | undefined {
  if (!Number.isFinite(val) || val === 0) return undefined;
  const abs = Math.abs(val);
  if (abs >= 1e4 || abs < 1e-3) {
    return val.toExponential(4).replace(/\.?0+e/, 'e');
  }
  return undefined;
}

function failResponse(input: string, error: string, command?: string): MathSolveResponse {
  return {
    ok: false,
    source: 'local',
    sourceLabel: SOURCE_LABEL,
    command,
    input,
    inputLatex: safeToTex(input),
    exactResult: '',
    exactResultLatex: '',
    steps: [],
    error,
  };
}

function detectMainVariable(expr: string): string {
  const stripped = expr.replace(/\b(?:sin|cos|tan|sec|csc|cot|asin|acos|atan|sqrt|log|ln|exp|abs|pi|e|det|inv|transpose|limit)\b/gi, '');
  const match = stripped.match(/\b([a-zA-Z])\b/);
  return match ? match[1] : 'x';
}

function solveLinearSystem(body: string, originalInput: string, command?: string): MathSolveResponse {
  const equations = body
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (equations.length < 2) {
    return failResponse(originalInput, 'Informe pelo menos duas equações separadas por ";" para resolver o sistema.', command);
  }

  try {
    const solutionObj = (nerdamer as any).solveSystem(equations);
    const solText = String(solutionObj?.toString?.() ?? '');
    // nerdamer 2.0 returns e.g. "[{x => 6, y => 4}]"
    const entryMatches = [...solText.matchAll(/([a-zA-Z]\w*)\s*=>\s*([^,}]+)/g)];
    if (entryMatches.length === 0) {
      return failResponse(originalInput, 'Não foi possível encontrar solução única para o sistema.', command);
    }

    const pairs = entryMatches.map(([, v, val]) => `${v} = ${val.trim()}`);
    const latexPairs = entryMatches.map(([, v, val]) => `${v} = ${safeToTex(val.trim())}`);

    return {
      ok: true,
      source: 'local',
      sourceLabel: SOURCE_LABEL,
      command: command || '/sistema',
      input: originalInput,
      inputLatex: equations.map((eq) => safeToTex(eq)).join(' \\\\ '),
      exactResult: pairs.join(', '),
      exactResultLatex: latexPairs.join(', \\quad '),
      steps: [
        {
          title: 'Equações do sistema',
          expressionLatex: `\\begin{cases} ${equations.map((eq) => safeToTex(eq)).join(' \\\\ ')} \\end{cases}`,
          explanation: 'Organização das equações lineares para eliminação/substituição.',
        },
        {
          title: 'Solução encontrada',
          expressionLatex: latexPairs.join(', \\quad '),
          explanation: 'Valores das incógnitas que satisfazem todas as equações simultaneamente.',
        },
      ],
    };
  } catch {
    return failResponse(originalInput, 'Não foi possível resolver o sistema de equações informado.', command);
  }
}

function solveEquation(body: string, originalInput: string, command?: string): MathSolveResponse {
  const parts = body.split('=');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return failResponse(originalInput, 'Formato de equação inválido. Exemplo: 2*x + 6 = 14', command);
  }

  const varName = detectMainVariable(body);
  const lhs = parts[0].trim();
  const rhs = parts[1].trim();
  const normalizedExpr = `(${lhs}) - (${rhs})`;

  try {
    const expanded = nerdamer(normalizedExpr).expand().text();
    const solved = nerdamer.solve(body, varName);
    const rawText = solved.text().replace(/^[\[{]|[\]}]$/g, '');
    if (!rawText) {
      return failResponse(originalInput, 'Nenhuma solução real ou simbólica encontrada.', command);
    }

    const roots = rawText.split(',').map((r) => r.trim()).filter(Boolean);
    const rootsLatex = roots.map((r) => `${varName} = ${nerdamer(r).toTeX()}`).join(', \\quad ');
    const steps: MathStep[] = [
      {
        title: 'Igualar a zero',
        expressionLatex: `${safeToTex(lhs)} - (${safeToTex(rhs)}) = 0`,
        explanation: `Reorganiza os termos para isolar a incógnita ${varName}.`,
      },
    ];

    // Check quadratic coefficients for Bhaskara explanation when applicable
    try {
      const coeffsText = String((nerdamer as any).coeffs(expanded, varName)?.toString?.() ?? '');
      const coeffList = coeffsText
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((c) => Number(math.evaluate(c.trim())));
      if (coeffList.length === 3 && coeffList.every((n) => Number.isFinite(n)) && coeffList[2] !== 0) {
        const [c, b, a] = coeffList;
        const delta = b * b - 4 * a * c;
        steps.push({
          title: 'Cálculo do discriminante (Bhaskara)',
          expressionLatex: `\\Delta = (${b})^2 - 4 \\cdot (${a}) \\cdot (${c}) = ${delta}`,
          explanation: 'Aplicação da fórmula de Bhaskara para equação do 2º grau.',
        });
      }
    } catch {
      // Non-polynomial or multi-variable; skip Bhaskara step
    }

    steps.push({
      title: 'Conjunto solução',
      expressionLatex: rootsLatex,
      explanation: `Raízes encontradas para ${varName}.`,
    });

    const decimalList = roots
      .map((r) => {
        try {
          const num = Number(math.evaluate(r));
          return Number.isFinite(num) ? formatDecimal(num) : null;
        } catch {
          return null;
        }
      })
      .filter((x): x is string => x !== null);

    const exactText = `${varName} = ${roots.join(', ')}`;
    return {
      ok: true,
      source: 'local',
      sourceLabel: SOURCE_LABEL,
      command: command || '/resolver',
      input: originalInput,
      inputLatex: `${safeToTex(lhs)} = ${safeToTex(rhs)}`,
      exactResult: exactText,
      exactResultLatex: rootsLatex,
      decimalApproximation:
        decimalList.length === roots.length && decimalList.join(', ') !== roots.join(', ')
          ? `${varName} ≈ ${decimalList.join(', ')}`
          : undefined,
      steps,
    };
  } catch {
    return failResponse(originalInput, 'Não foi possível resolver esta equação localmente.', command);
  }
}

export function solveWithLocalEngine(rawInput: string, explicitCommand?: string): MathSolveResponse {
  const inputToValidate =
    explicitCommand && !rawInput.trim().startsWith('/')
      ? `${explicitCommand} ${rawInput.trim()}`
      : rawInput;

  const validation = validateMathInput(inputToValidate);
  if (!validation.valid) {
    return failResponse(rawInput, validation.error || 'Entrada inválida.', validation.command);
  }

  const { normalized, command } = validation;

  // 1. Systems of equations
  if (command === '/sistema' || (normalized.includes(';') && normalized.includes('='))) {
    return solveLinearSystem(normalized, rawInput, command);
  }

  // 2. Derivatives
  if (command === '/derivar') {
    const [exprPart, varPart] = normalized.split(',').map((s) => s.trim());
    const varName = varPart || detectMainVariable(exprPart);
    try {
      const result = nerdamer.diff(exprPart, varName);
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command,
        input: rawInput,
        inputLatex: `\\frac{d}{d${varName}}\\left(${safeToTex(exprPart)}\\right)`,
        exactResult: result.text(),
        exactResultLatex: result.toTeX(),
        steps: [
          {
            title: 'Derivação simbólica',
            expressionLatex: `\\frac{d}{d${varName}}\\left(${safeToTex(exprPart)}\\right) = ${result.toTeX()}`,
            explanation: `Aplicação das regras de derivação em relação à variável ${varName}.`,
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Não foi possível calcular a derivada dessa expressão.', command);
    }
  }

  // 3. Integrals
  if (command === '/integrar') {
    const [exprPart, varPart] = normalized.split(',').map((s) => s.trim());
    const varName = varPart || detectMainVariable(exprPart);
    try {
      const result = nerdamer.integrate(exprPart, varName);
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command,
        input: rawInput,
        inputLatex: `\\int \\left(${safeToTex(exprPart)}\\right)\\,d${varName}`,
        exactResult: `${result.text()} + C`,
        exactResultLatex: `${result.toTeX()} + C`,
        steps: [
          {
            title: 'Primitiva indefinida',
            expressionLatex: `\\int \\left(${safeToTex(exprPart)}\\right)\\,d${varName} = ${result.toTeX()} + C`,
            explanation: `Integração simbólica em relação a ${varName}, acrescentando a constante de integração C.`,
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Não foi possível calcular a integral simbólica dessa expressão.', command);
    }
  }

  // 4. Limits
  if (command === '/limite') {
    const parts = normalized.split(',').map((s) => s.trim());
    if (parts.length < 3) {
      return failResponse(rawInput, 'Use o formato: /limite expressão, variável, ponto (ex: /limite sin(x)/x, x, 0)', command);
    }
    const [exprPart, varPart, pointPart] = parts;
    try {
      const result = nerdamer(`limit(${exprPart}, ${varPart}, ${pointPart})`);
      const text = result.text();
      if (/Infinity|NaN/i.test(text) && !/oo/i.test(pointPart)) {
        return failResponse(rawInput, 'O limite diverge ou é indefinido no ponto informado.', command);
      }
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command,
        input: rawInput,
        inputLatex: `\\lim_{${varPart} \\to ${safeToTex(pointPart)}} ${safeToTex(exprPart)}`,
        exactResult: text,
        exactResultLatex: result.toTeX(),
        steps: [
          {
            title: 'Avaliação do limite',
            expressionLatex: `\\lim_{${varPart} \\to ${safeToTex(pointPart)}} ${safeToTex(exprPart)} = ${result.toTeX()}`,
            explanation: `Análise do comportamento da função quando ${varPart} tende a ${pointPart}.`,
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Não foi possível calcular o limite informado.', command);
    }
  }

  // 5. Factor / Expand
  if (command === '/fatorar') {
    try {
      const result = nerdamer(normalized).factor();
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command,
        input: rawInput,
        inputLatex: safeToTex(normalized),
        exactResult: result.text(),
        exactResultLatex: result.toTeX(),
        steps: [
          {
            title: 'Fatoração algébrica',
            expressionLatex: `${safeToTex(normalized)} = ${result.toTeX()}`,
            explanation: 'Decomposição da expressão em fatores irredutíveis.',
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Não foi possível fatorar a expressão informada.', command);
    }
  }

  if (command === '/expandir') {
    try {
      const result = nerdamer(normalized).expand();
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command,
        input: rawInput,
        inputLatex: safeToTex(normalized),
        exactResult: result.text(),
        exactResultLatex: result.toTeX(),
        steps: [
          {
            title: 'Expansão algébrica',
            expressionLatex: `${safeToTex(normalized)} = ${result.toTeX()}`,
            explanation: 'Aplicação da propriedade distributiva e produtos notáveis.',
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Não foi possível expandir a expressão informada.', command);
    }
  }

  // 6. Equations (=)
  if (command === '/resolver' || normalized.includes('=')) {
    return solveEquation(normalized, rawInput, command);
  }

  // 7. Matrices
  if (command === '/matriz' || /\[\[/.test(normalized) || /\b(?:det|inv|transpose)\s*\(/.test(normalized)) {
    try {
      const evaluated = math.evaluate(normalized);
      const formatted = math.format(evaluated, { precision: 10 });
      const latex = Array.isArray(evaluated?.valueOf?.())
        ? safeToTex(formatted)
        : safeToTex(String(formatted));
      return {
        ok: true,
        source: 'local',
        sourceLabel: SOURCE_LABEL,
        command: command || '/matriz',
        input: rawInput,
        inputLatex: safeToTex(normalized),
        exactResult: formatted,
        exactResultLatex: latex,
        steps: [
          {
            title: 'Operação matricial',
            expressionLatex: `${safeToTex(normalized)} = ${latex}`,
            explanation: 'Cálculo executado com álgebra linear exata/numérica.',
          },
        ],
      };
    } catch {
      return failResponse(rawInput, 'Erro ao calcular operação com matriz. Exemplo: det([[1, 2], [3, 4]])', command);
    }
  }

  // 8. Pure integer fraction (e.g. 124/4 or 18/24)
  const simpleFracMatch = normalized.match(/^\s*(-?\d+)\s*\/\s*(-?\d+)\s*$/);
  if (simpleFracMatch) {
    const num = Number(simpleFracMatch[1]);
    const den = Number(simpleFracMatch[2]);
    if (den === 0) {
      return failResponse(rawInput, 'Divisão por zero não é definida.', command);
    }
    const divisor = gcd(num, den);
    const sign = den < 0 ? -1 : 1;
    const simpNum = (num * sign) / divisor;
    const simpDen = Math.abs(den) / divisor;
    const decimal = num / den;

    const exactResult = simpDen === 1 ? String(simpNum) : `${simpNum}/${simpDen}`;
    const exactResultLatex = simpDen === 1 ? String(simpNum) : `\\frac{${simpNum}}{${simpDen}}`;
    const steps: MathStep[] =
      simpDen === 1
        ? [
            {
              title: 'Divisão exata',
              expressionLatex: `\\frac{${num}}{${den}} = ${simpNum}`,
              explanation: `${num} é divisível por ${den}, resultando exatamente em ${simpNum}.`,
            },
          ]
        : [
            {
              title: 'Simplificação pelo MDC',
              expressionLatex: `\\frac{${num}}{${den}} = \\frac{${num} \\div ${divisor}}{${den} \\div ${divisor}} = ${exactResultLatex}`,
              explanation: `Dividimos numerador e denominador pelo máximo divisor comum (${divisor}).`,
            },
          ];

    return {
      ok: true,
      source: 'local',
      sourceLabel: SOURCE_LABEL,
      command,
      input: rawInput,
      inputLatex: formatSimpleFractionLatex(normalized) || safeToTex(normalized),
      exactResult,
      exactResultLatex,
      decimalApproximation: simpDen === 1 ? undefined : formatDecimal(decimal),
      steps,
    };
  }

  // 9. General numeric & symbolic evaluation
  try {
    // Try symbolic first if expression has free variables
    const hasVariable = /[a-zA-Z]/.test(
      normalized.replace(/\b(?:sin|cos|tan|sec|csc|cot|asin|acos|atan|sqrt|log|ln|exp|abs|pi|e)\b/gi, '')
    );

    if (!hasVariable) {
      const numericVal = math.evaluate(normalized);
      if (typeof numericVal === 'number') {
        if (!Number.isFinite(numericVal) || Number.isNaN(numericVal)) {
          return failResponse(rawInput, 'Divisão por zero ou resultado indefinido.', command);
        }

        // Try exact symbolic form via nerdamer for expressions like sin(pi/6) or 1/3 + 1/6
        let exactText = formatDecimal(numericVal);
        let exactLatex = exactText;
        try {
          const sym = nerdamer(normalized).evaluate();
          const symText = sym.text('fractions');
          if (symText && !/Infinity|NaN|i\b/i.test(symText) && symText.length <= 40) {
            exactText = symText;
            exactLatex = sym.toTeX();
          }
        } catch {
          // Keep numeric result
        }

        const decStr = formatDecimal(numericVal);
        const sciStr = formatScientific(numericVal);
        const decimalApprox = exactText !== decStr ? decStr : sciStr;

        return {
          ok: true,
          source: 'local',
          sourceLabel: SOURCE_LABEL,
          command,
          input: rawInput,
          inputLatex: formatSimpleFractionLatex(normalized) || safeToTex(normalized),
          exactResult: exactText,
          exactResultLatex: exactLatex,
          decimalApproximation: decimalApprox,
          steps: [
            {
              title: 'Avaliação da expressão',
              expressionLatex: `${safeToTex(normalized)} = ${exactLatex}`,
              explanation: 'Cálculo exato respeitando a ordem de precedência dos operadores.',
            },
          ],
        };
      }
    }

    // Symbolic simplification
    const simplified = nerdamer(normalized);
    return {
      ok: true,
      source: 'local',
      sourceLabel: SOURCE_LABEL,
      command: command || '/simplificar',
      input: rawInput,
      inputLatex: safeToTex(normalized),
      exactResult: simplified.text(),
      exactResultLatex: simplified.toTeX(),
      steps: [
        {
          title: 'Simplificação algébrica',
          expressionLatex: `${safeToTex(normalized)} = ${simplified.toTeX()}`,
          explanation: 'Agrupamento de termos semelhantes e simplificação simbólica.',
        },
      ],
    };
  } catch {
    return failResponse(
      rawInput,
      'Não foi possível interpretar esta expressão. Verifique a sintaxe (ex: use * para multiplicação, como 2*x).',
      command
    );
  }
}
