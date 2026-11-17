import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createRateLimitRedisStore } from '../services/redisService';
import { MATH_COMMANDS } from '../services/math/commands';
import { solveWithLocalEngine, validateMathInput } from '../services/math/localMathEngine';
import { isWolframConfigured, solveWithWolfram } from '../services/math/wolframClient';
import {
  extractMathFromImage,
  MAX_MATH_IMAGE_BYTES,
  validateMathImageBuffer,
} from '../services/math/imageExtractor';

async function solveExpressionPipeline(
  rawExpression: string,
  command?: string,
  preferLocal?: boolean
) {
  const inputWithCmd =
    command && !rawExpression.trim().startsWith('/')
      ? `${command} ${rawExpression.trim()}`
      : rawExpression;

  const validation = validateMathInput(inputWithCmd);
  if (!validation.valid) {
    return {
      status: 400,
      payload: {
        ok: false,
        source: 'local' as const,
        sourceLabel: 'Motor Local (mathjs / nerdamer)',
        input: rawExpression,
        inputLatex: rawExpression,
        exactResult: '',
        exactResultLatex: '',
        steps: [],
        error: validation.error || 'Expressão inválida.',
      },
    };
  }

  let warning: string | undefined;

  if (!preferLocal && isWolframConfigured()) {
    const wolframRes = await solveWithWolfram(validation.normalized, validation.command);
    if (wolframRes && wolframRes.ok) {
      return { status: 200, payload: wolframRes };
    }
    warning = 'WolframAlpha indisponível para esta consulta; cálculo resolvido pelo motor local.';
  }

  const localRes = solveWithLocalEngine(validation.normalized, validation.command);
  if (warning && localRes.ok) {
    localRes.warning = warning;
  }

  return {
    status: localRes.ok ? 200 : 400,
    payload: localRes,
  };
}

export function createMathRouter(requireAuthMiddleware: any): Router {
  const router = Router();

  const mathLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 180,
    store: createRateLimitRedisStore('math'),
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        ok: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições na calculadora. Aguarde alguns instantes.',
      });
    },
  });

  router.use(requireAuthMiddleware, mathLimiter);

  router.get('/commands', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      wolframConfigured: isWolframConfigured(),
      commands: MATH_COMMANDS,
    });
  });

  router.post('/solve', async (req: Request, res: Response) => {
    const { expression, command, preferLocal } = req.body || {};
    if (typeof expression !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Informe o campo expression como texto.',
      });
    }

    const result = await solveExpressionPipeline(
      expression,
      typeof command === 'string' ? command : undefined,
      Boolean(preferLocal)
    );
    return res.status(result.status).json(result.payload);
  });

  router.post('/solve-image', async (req: Request, res: Response) => {
    const { imageBase64, mimeType, hint, preferLocal } = req.body || {};
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Nenhuma imagem enviada.',
      });
    }

    const stripped = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    if (stripped.length > Math.ceil((MAX_MATH_IMAGE_BYTES * 4) / 3) + 128) {
      return res.status(400).json({
        ok: false,
        error: 'A imagem excede o limite máximo de 5 MB.',
      });
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(stripped, 'base64');
    } catch {
      return res.status(400).json({
        ok: false,
        error: 'Formato base64 inválido.',
      });
    }

    const validation = validateMathImageBuffer(
      buffer,
      typeof mimeType === 'string' ? mimeType : undefined
    );
    if (!validation.valid || !validation.mimeType) {
      return res.status(400).json({
        ok: false,
        error: validation.error || 'Imagem inválida.',
      });
    }

    const extraction = await extractMathFromImage(
      buffer,
      validation.mimeType,
      typeof hint === 'string' ? hint : undefined
    );
    if (!extraction.ok || !extraction.expression) {
      return res.status(422).json({
        ok: false,
        error: extraction.error || 'Não foi possível extrair expressão matemática da foto.',
      });
    }

    const solved = await solveExpressionPipeline(
      extraction.expression,
      undefined,
      Boolean(preferLocal)
    );
    return res.status(solved.status).json({
      ...solved.payload,
      extractedExpression: extraction.expression,
    });
  });

  return router;
}
