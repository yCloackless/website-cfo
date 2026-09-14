process.env.NODE_ENV = 'test';

import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  const { app } = await import('../server');

  const distIndex = path.join(process.cwd(), 'dist', 'public', 'index.html');
  const rootIndex = path.join(process.cwd(), 'index.html');
  const indexHtml = fs.existsSync(distIndex) ? fs.readFileSync(distIndex, 'utf-8') : fs.readFileSync(rootIndex, 'utf-8');

  app.get('/', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(indexHtml);
  });

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(() => {
  if (server) {
    (server as any).closeAllConnections?.();
    server.close();
  }
});

test.describe('Jornada do Aluno & Integridade Operacional (Rumo ao CFO)', () => {
  test('1. Carregamento e renderização da Landing Page com Hero e lema militar', async ({ page }) => {
    await page.goto(`${baseUrl}/`);

    // Valida título da página
    await expect(page).toHaveTitle(/CFO CBMERJ/i);

    // Valida o H1 do Hero estático pré-renderizado (LCP imediato)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Seu caminho até o');
    await expect(heading).toContainText('CFO');

    // Valida o lema tático militar
    const motto = page.locator('.motto');
    await expect(motto).toBeVisible();
    await expect(motto).toContainText('Disciplina hoje.');
    await expect(motto).toContainText('Oficial amanhã.');

    // Valida logotipo da fênix no cabeçalho
    const logoImg = page.locator('header img.brand-phoenix');
    await expect(logoImg).toBeVisible();
  });

  test('2. Presença de metatags PWA e manifesto web', async ({ page }) => {
    await page.goto(`${baseUrl}/`);

    // Valida link do manifesto
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');

    // Valida theme-color dark militar (#020617)
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#020617');
  });

  test('3. Verificação de cabeçalhos de segurança e observabilidade em /api/health', async ({ request }) => {
    const response = await request.get(`${baseUrl}/api/health`);
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['cache-control']).toContain('no-cache');
    expect(headers['x-content-type-options']).toBe('nosniff');

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('cfo-cbmerj-backend');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('number');
    expect(body.version).toBe('1.0.0');
    expect(typeof body.memory).toBe('object');
    expect(typeof body.cpu).toBe('object');
    expect(typeof body.database).toBe('object');
  });

  test('4. Rota de telemetria RUM e isolamento defensivo 404', async ({ request }) => {
    // 4.1 Envio de beacon RUM para /api/telemetry/vitals
    const telemetryRes = await request.post(`${baseUrl}/api/telemetry/vitals`, {
      data: {
        name: 'LCP',
        value: 1200,
        rating: 'good',
        url: '/',
      },
    });
    expect(telemetryRes.status()).toBe(204);

    // 4.2 Rota de API inexistente deve retornar 404 JSON seguro sem vazar stack trace
    const notFoundRes = await request.get(`${baseUrl}/api/rota-inexistente-de-teste-12345`);
    expect(notFoundRes.status()).toBe(404);
    const notFoundBody = await notFoundRes.json();
    expect(notFoundBody.error).toBe('Not Found');
    expect(notFoundRes.headers()['cache-control']).toContain('no-store');
  });

  test('5. Isolamento estrito de rotas protegidas administrativas', async ({ request }) => {
    // Acesso não autenticado a recursos administrativos deve ser rejeitado no backend
    const adminRes = await request.get(`${baseUrl}/api/admin/users`);
    expect([401, 403]).toContain(adminRes.status());
    const adminBody = await adminRes.json();
    expect(adminBody.error || adminBody.message).toBeTruthy();
  });

  test('6. Verificação do Service Worker e Web App Manifest', async ({ request }) => {
    // Valida o endpoint do Service Worker
    const swRes = await request.get(`${baseUrl}/sw.js`);
    expect(swRes.status()).toBe(200);
    expect(swRes.headers()['service-worker-allowed']).toBe('/');
    expect(swRes.headers()['content-type']).toContain('javascript');

    // Valida o endpoint do manifesto
    const manifestRes = await request.get(`${baseUrl}/manifest.webmanifest`);
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.name).toContain('Rumo ao CFO');
    expect(manifestJson.display).toBe('standalone');
    expect(manifestJson.theme_color).toBe('#020617');
    expect(manifestJson.icons.length).toBeGreaterThanOrEqual(4);
  });

  test('7. Validação defensiva de autenticação (tentativa inválida é rejeitada com 400)', async ({ request }) => {
    const authRes = await request.post(`${baseUrl}/api/auth/check-credentials`, {
      data: {
        username: 'usuario_inexistente_teste',
        password: '',
      },
    });
    expect(authRes.status()).toBe(400);
    const authBody = await authRes.json();
    expect(authBody.error).toBe('MISSING_FIELDS');
  });
});
