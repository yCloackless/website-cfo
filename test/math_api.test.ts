import test from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import { createMathRouter } from '../src/routes/mathRouter';

function createTestServer(allowAuth: boolean) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));
  const mockAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!allowAuth) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    (req as any).user = { userId: 'test-user', role: 'student' };
    next();
  };
  app.use('/api/math', createMathRouter(mockAuth));
  return app;
}

async function requestJson(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('mathRouter: rejects unauthenticated requests with 401', async () => {
  const app = createTestServer(false);
  const res = await requestJson(app, 'POST', '/api/math/solve', { expression: '124/4' });
  assert.equal(res.status, 401);
});

test('mathRouter: GET /api/math/commands returns command list', async () => {
  const app = createTestServer(true);
  const res = await requestJson(app, 'GET', '/api/math/commands');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.commands));
  assert.ok(res.data.commands.some((c: any) => c.command === '/derivar'));
  assert.equal(typeof res.data.wolframConfigured, 'boolean');
});

test('mathRouter: POST /api/math/solve computes 124/4 -> 31', async () => {
  const app = createTestServer(true);
  const res = await requestJson(app, 'POST', '/api/math/solve', {
    expression: '124/4',
    preferLocal: true,
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.inputLatex, '\\frac{124}{4}');
  assert.equal(res.data.exactResult, '31');
});

test('mathRouter: POST /api/math/solve rejects unsafe expression with 400', async () => {
  const app = createTestServer(true);
  const res = await requestJson(app, 'POST', '/api/math/solve', {
    expression: 'process.exit(1)',
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.ok, false);
});

test('mathRouter: POST /api/math/solve-image rejects disguised SVG with 400', async () => {
  const app = createTestServer(true);
  const fakePngBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  const res = await requestJson(app, 'POST', '/api/math/solve-image', {
    imageBase64: fakePngBase64,
    mimeType: 'image/png',
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.ok, false);
});
