export type MathSource = 'wolfram' | 'local';

export interface MathStep {
  title: string;
  expressionLatex?: string;
  explanation: string;
}

export interface MathExtraPod {
  title: string;
  content: string;
  latex?: string;
}

export interface MathSolveRequest {
  expression: string;
  command?: string;
  preferLocal?: boolean;
}

export interface MathSolveResponse {
  ok: boolean;
  source: MathSource;
  sourceLabel: string;
  command?: string;
  input: string;
  inputLatex: string;
  exactResult: string;
  exactResultLatex: string;
  decimalApproximation?: string;
  steps: MathStep[];
  extraPods?: MathExtraPod[];
  extractedExpression?: string;
  warning?: string;
  error?: string;
}

export interface MathCommandDefinition {
  command: string;
  label: string;
  syntax: string;
  example: string;
  description: string;
  category: 'basico' | 'algebra' | 'calculo' | 'matrizes';
}
