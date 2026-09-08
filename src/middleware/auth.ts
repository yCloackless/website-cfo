import { Request, Response, NextFunction } from 'express';

export interface TerminalSession {
  valid: boolean;
  username?: string;
  role?: string;
  userId?: string;
  sessionId?: string;
  impersonatedByUserId?: string | null;
  parentSessionId?: string | null;
}

type VerifySession = (token?: string | null) => TerminalSession;

export function createAuthMiddlewares(verifySession: VerifySession) {
  function bearerToken(req: Request): string | null {
    const value = req.headers.authorization;
    return value?.startsWith('Bearer ') ? value.slice(7).trim() : null;
  }
  function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
    const session = verifySession(bearerToken(req));
    if (session.valid && (session.role === 'admin' || session.role === 'support')) { (req as any).user = session; return next(); }
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Acesso administrativo restrito.' });
  }
  function requireAdminWriteAuth(req: Request, res: Response, next: NextFunction) {
    const session = verifySession(bearerToken(req));
    if (session.valid && session.role === 'admin') { (req as any).user = session; return next(); }
    if (session.valid && session.role === 'support') return res.status(403).json({ error: 'PERMISSION_DENIED', message: 'Operador de suporte possui permissão apenas de leitura. Ação restrita a administradores.' });
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Acesso administrativo restrito.' });
  }
  function requireUserAuth(req: Request, res: Response, next: NextFunction) {
    const session = verifySession(bearerToken(req));
    if (session.valid) { (req as any).user = session; return next(); }
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Autenticação necessária.' });
  }
  return { requireAdminAuth, requireAdminWriteAuth, requireUserAuth };
}
