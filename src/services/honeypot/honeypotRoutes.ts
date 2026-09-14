/**
 * Rotas Decoy e Middleware de Decepção Defensiva
 * Rumo ao CFO - Engenharia de Segurança de Aplicação
 * 
 * Este módulo registra as rotas administrativas falsas e os recursos canário,
 * além do middleware global de detecção de honeytokens.
 * Nenhuma dessas rotas expõe dados de produção, banco real ou segredos.
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { getHoneypotService } from './honeypotService';
import { detectHoneytoken } from './honeytokens';

export const honeypotRouter = Router();

// Habilita parsing de formulários e JSON apenas dentro do router honeypot
honeypotRouter.use(express.urlencoded({ extended: false }));
honeypotRouter.use(express.json());

function extractClientIp(req: Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim().replace(/^::ffff:/, '');
  }
  if (req.ip && typeof req.ip === 'string') {
    return req.ip.replace(/^::ffff:/, '').trim();
  }
  const remote = req.socket?.remoteAddress || '';
  return remote.replace(/^::ffff:/, '').trim() || '127.0.0.1';
}

// Middleware dedicado de Rate Limiting para as rotas Honeypot (Proteção contra Exaustão / DoS)
const honeypotIpHitTracker = new Map<string, { count: number; resetAt: number }>();
function honeypotRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = extractClientIp(req);
  const now = Date.now();
  const entry = honeypotIpHitTracker.get(ip);

  if (!entry || now > entry.resetAt) {
    honeypotIpHitTracker.set(ip, { count: 1, resetAt: now + 60_000 }); // Janela de 1 minuto
    return next();
  }

  entry.count++;
  if (entry.count > 15) {
    // Limita a 15 requisições por minuto nos endpoints honeypot
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded on security monitored perimeter.',
    });
  }

  next();
}

honeypotRouter.use(honeypotRateLimiter);

/**
 * Middleware Global de Inspeção de Honeytokens
 * Deve ser montado no app Express para interceptar tentativas de uso de credenciais canário
 * em quaisquer requisições (legítimas ou decoys).
 */
export function honeytokenDetectionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Ignora rota de health check
  if (req.path === '/api/health') return next();

  // Inspeciona Authorization, X-API-Key, e query strings
  const authHeader = String(req.headers['authorization'] || '');
  const apiKeyHeader = String(req.headers['x-api-key'] || req.headers['x-token'] || '');
  const queryString = JSON.stringify(req.query || {});
  
  const textToScan = `${authHeader} ${apiKeyHeader} ${queryString} ${req.path}`;
  const inspection = detectHoneytoken(textToScan);

  if (inspection.found) {
    const service = getHoneypotService();
    const clientIp = extractClientIp(req);
    const userId = (req as any).user?.id || null;
    const sessionId = (req as any).session?.id || null;

    service.recordEvent({
      req,
      clientIp,
      eventType: 'HONEYTOKEN_TRIGGERED',
      honeypotId: inspection.token?.id || 'honeytoken_unknown',
      userId,
      sessionId,
    });

    return res.status(403).json({
      error: 'SECURITY_VIOLATION',
      message: 'Security monitoring triggered. Provided credential is an invalid defensive token.',
    });
  }

  next();
}

// ============================================================================
// 1. RECURSOS CANÁRIO (DECOY RESOURCES)
// ============================================================================
const CANARY_RESOURCES = [
  '/.env.backup',
  '/config.old',
  '/database.sql',
  '/admin-export.json',
  '/backup.zip',
];

for (const resource of CANARY_RESOURCES) {
  honeypotRouter.all(resource, (req: Request, res: Response) => {
    const service = getHoneypotService();
    const clientIp = extractClientIp(req);
    const userId = (req as any).user?.id || null;
    const sessionId = (req as any).session?.id || null;

    service.recordEvent({
      req,
      clientIp,
      eventType: 'DECOY_RESOURCE_ACCESSED',
      honeypotId: `decoy_resource_${resource.replace(/[^a-zA-Z0-9]/g, '_')}`,
      userId,
      sessionId,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const canary = service.getCanaryContent(resource);
    res.type(canary.contentType);
    return res.send(canary.body);
  });
}

// ============================================================================
// 2. ROTAS ADMINISTRATIVAS FALSAS (DECOY ADMIN ROUTES)
// ============================================================================
const DECOY_UI_ROUTES = [
  '/internal-admin',
  '/system-console',
  '/admin-backup',
  '/legacy-admin',
];

for (const route of DECOY_UI_ROUTES) {
  // GET: Entrega a página de login falsa convincente ou JSON caso seja uma API call
  honeypotRouter.get(route, (req: Request, res: Response) => {
    const service = getHoneypotService();
    const clientIp = extractClientIp(req);
    const userId = (req as any).user?.id || null;
    const sessionId = (req as any).session?.id || null;

    service.recordEvent({
      req,
      clientIp,
      eventType: 'HONEYPOT_ROUTE_ACCESSED',
      honeypotId: `decoy_route_${route.replace(/[^a-zA-Z0-9]/g, '_')}`,
      userId,
      sessionId,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    const acceptsHtml = req.accepts('html');
    if (acceptsHtml) {
      const html = service.renderDecoyLoginPage({
        title: route === '/system-console' ? 'System Operator Console' : 'Internal Administration',
        path: route,
      });
      return res.status(200).send(html);
    }

    return res.status(401).json({
      error: 'UNAUTHORIZED_INTERNAL_ENDPOINT',
      message: 'Monitored administrative portal. Credentials required.',
    });
  });

  // POST: Processamento de login falso (NUNCA autentica, NUNCA grava senhas, NUNCA toca na tabela users)
  honeypotRouter.post(route, (req: Request, res: Response) => {
    const service = getHoneypotService();
    const clientIp = extractClientIp(req);
    const userId = (req as any).user?.id || null;
    const sessionId = (req as any).session?.id || null;

    // REGRA DE SEGURANÇA GSD: A senha NUNCA é lida, NUNCA é armazenada em plaintext ou hash.
    // Registra apenas que ocorreu a tentativa de login no honeypot com os metadados mínimos.
    service.recordEvent({
      req,
      clientIp,
      eventType: 'HONEYPOT_LOGIN_ATTEMPT',
      honeypotId: `decoy_login_${route.replace(/[^a-zA-Z0-9]/g, '_')}`,
      userId,
      sessionId,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    const controlledMessage = 'Security monitoring triggered. This endpoint is a monitored decoy.';

    const acceptsHtml = req.accepts('html');
    if (acceptsHtml) {
      const scareHtml = service.renderDecoyLoginPage({
        title: 'Security Notice',
        path: route,
        triggeredScare: true,
        controlledMessage,
      });
      return res.status(403).send(scareHtml);
    }

    return res.status(403).json({
      error: 'MONITORED_DECOY_TRIGGERED',
      message: controlledMessage,
    });
  });
}

// ============================================================================
// 3. APIS ADMINISTRATIVAS / DEBUG DECOY
// ============================================================================
const DECOY_API_ROUTES = [
  '/api/internal',
  '/api/debug',
  '/api/v1/admin-export',
];

for (const apiRoute of DECOY_API_ROUTES) {
  honeypotRouter.all(apiRoute, (req: Request, res: Response) => {
    const service = getHoneypotService();
    const clientIp = extractClientIp(req);
    const userId = (req as any).user?.id || null;
    const sessionId = (req as any).session?.id || null;

    service.recordEvent({
      req,
      clientIp,
      eventType: 'HONEYPOT_ROUTE_ACCESSED',
      honeypotId: `decoy_api_${apiRoute.replace(/[^a-zA-Z0-9]/g, '_')}`,
      userId,
      sessionId,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

    return res.status(403).json({
      error: 'FORBIDDEN_INTERNAL_SERVICE',
      message: 'Access denied. Internal debugging interface is isolated and monitored.',
      status: 'unreachable',
    });
  });
}
