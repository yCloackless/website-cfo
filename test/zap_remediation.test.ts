process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { app } = await import('../server');

let server: http.Server;
let baseUrl: string;

test.before(async () => {
  // Em ambiente de teste, startServer() não roda para não abrir porta 3000 de produção/vite.
  // Registramos handlers de teste para exercitar o pipeline real de middlewares do Express.
  app.get('/', (_req, res) => res.send('app root'));
  app.get('/point-sphere.html', (_req, res) => res.send('point-sphere'));
  app.get('/blackhole-disc.html', (_req, res) => res.send('blackhole-disc'));

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (server) {
    (server as any).closeAllConnections?.();
    server.close();
  }
});

test('OWASP ZAP 1: Helmet CSP style-src does NOT contain unsafe-inline', async () => {
  const res = await fetch(`${baseUrl}/`);
  const csp = res.headers.get('content-security-policy') || '';

  assert.ok(csp, 'CSP header must be present');
  
  // style-src must allow 'self' and Google Fonts, but NOT 'unsafe-inline'
  const styleSrcMatch = csp.match(/style-src\s+([^;]+)/);
  assert.ok(styleSrcMatch, 'style-src directive must exist in CSP');
  assert.match(styleSrcMatch[1], /'self'/);
  assert.match(styleSrcMatch[1], /https:\/\/fonts\.googleapis\.com/);
  assert.doesNotMatch(styleSrcMatch[1], /'unsafe-inline'/, 'style-src must NOT contain unsafe-inline');

  // style-src-elem must NOT contain 'unsafe-inline'
  const styleSrcElemMatch = csp.match(/style-src-elem\s+([^;]+)/);
  if (styleSrcElemMatch) {
    assert.doesNotMatch(styleSrcElemMatch[1], /'unsafe-inline'/, 'style-src-elem must NOT contain unsafe-inline');
  }

  // style-src-attr may contain 'unsafe-inline' for dynamic runtime styles (KaTeX, Motion, Recharts)
  const styleSrcAttrMatch = csp.match(/style-src-attr\s+([^;]+)/);
  assert.ok(styleSrcAttrMatch, 'style-src-attr directive must exist in CSP Level 3');
  assert.match(styleSrcAttrMatch[1], /'unsafe-inline'/);

  // Default security assertions
  assert.match(csp, /object-src\s+'none'/);
  assert.match(csp, /frame-ancestors\s+'self'/);
  assert.match(csp, /base-uri\s+'self'/);
});

test('OWASP ZAP 1: Three.js visual pages CSP does NOT contain unsafe-inline in style-src', async () => {
  for (const visualPath of ['/point-sphere.html', '/blackhole-disc.html']) {
    const res = await fetch(`${baseUrl}${visualPath}`);
    const csp = res.headers.get('content-security-policy') || '';

    assert.ok(csp, `CSP header must be present for ${visualPath}`);
    const styleSrcMatch = csp.match(/style-src\s+([^;]+)/);
    assert.ok(styleSrcMatch, `style-src directive must exist in CSP for ${visualPath}`);
    assert.match(styleSrcMatch[1], /'self'/);
    assert.doesNotMatch(styleSrcMatch[1], /'unsafe-inline'/, `${visualPath} style-src must NOT contain unsafe-inline`);
  }
});

test('OWASP ZAP 1: Static visuals.css exists and visual HTML files do NOT have inline style tags', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const visualsCssPath = path.resolve(root, 'public', 'visuals.css');
  assert.ok(fs.existsSync(visualsCssPath), 'public/visuals.css must exist on disk');
  const cssContent = fs.readFileSync(visualsCssPath, 'utf8');
  assert.match(cssContent, /overflow:\s*hidden/);
  assert.match(cssContent, /canvas/);

  for (const file of ['point-sphere.html', 'blackhole-disc.html']) {
    const filePath = path.resolve(root, 'public', file);
    const html = fs.readFileSync(filePath, 'utf8');
    assert.match(html, /<link\s+rel="stylesheet"\s+href="\/visuals\.css"/, `${file} must link to visuals.css`);
    assert.doesNotMatch(html, /<style>/i, `${file} must NOT have inline style tag`);
  }
});

test('OWASP ZAP 2: /api/health returns operational Unix timestamp with strict no-cache headers', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  // Cache-Control validation
  const cacheControl = res.headers.get('cache-control') || '';
  assert.match(cacheControl, /no-store/);
  assert.match(cacheControl, /no-cache/);
  assert.match(cacheControl, /must-revalidate/);
  assert.equal(res.headers.get('pragma'), 'no-cache');
  assert.equal(res.headers.get('expires'), '0');

  // Payload verification
  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.ok(typeof data.timestamp === 'number');
  assert.ok(data.timestamp > 1700000000000, 'timestamp must be a valid recent millisecond Unix epoch');
});

test('OWASP ZAP 4: Authenticated / Sensitive /api endpoints use private, no-store, must-revalidate', async () => {
  const res = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'invalid', password: 'bad' }),
  });

  const cacheControl = res.headers.get('cache-control') || '';
  assert.match(cacheControl, /private/);
  assert.match(cacheControl, /no-store/);
  assert.match(cacheControl, /no-cache/);
  assert.match(cacheControl, /must-revalidate/);
  assert.equal(res.headers.get('pragma'), 'no-cache');
  assert.equal(res.headers.get('expires'), '0');
});
