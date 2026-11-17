process.env.NODE_ENV = 'test';

import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  const { app } = await import('../server');

  const distIndex = path.join(process.cwd(), 'dist', 'public', 'index.html');
  const indexHtml = fs.readFileSync(distIndex, 'utf-8');
  app.use(express.static(path.dirname(distIndex), { index: false }));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
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

test('Calculadora Matemática: comandos /, cálculo 124/4 -> 31, KaTeX, Mostrar mais e Copiar', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});

  await page.route('**/api/auth/verify-session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        valid: true,
        user: {
          id: 'test-user-id',
          username: 'cadete_teste',
          fullName: 'Cadete Teste',
          role: 'cadet',
        },
        expiresAt: Date.now() + 30 * 86400000,
        canAccessNotion: true,
      }),
    });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('cfo_terminal_session', 'mock-token-cfo-cadet-2026');
    window.localStorage.setItem('cfo_terminal_expires_at', String(Date.now() + 86400000));
    window.localStorage.setItem('cfo_terminal_user', 'Cadete Teste');
    window.localStorage.setItem('cfo_terminal_role', 'cadet');
    window.localStorage.setItem('cfo_theme', 'dark');
    window.localStorage.setItem('cfo_sidebar_open', 'false');
  });

  await page.route('**/api/math/commands', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        wolframConfigured: false,
        commands: [],
      }),
    });
  });

  await page.route('**/api/math/solve', async (route) => {
    const body = route.request().postDataJSON();
    if (body?.expression === '124/4') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          source: 'local',
          sourceLabel: 'Motor Local (mathjs / nerdamer)',
          input: '124/4',
          inputLatex: '\\frac{124}{4}',
          exactResult: '31',
          exactResultLatex: '31',
          steps: [
            {
              title: 'Divisão exata',
              expressionLatex: '\\frac{124}{4} = 31',
              explanation: '124 é divisível por 4, resultando exatamente em 31.',
            },
          ],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(`${baseUrl}/calculadora`, { waitUntil: 'domcontentloaded' });

  const input = page.getByTestId('math-chat-input');
  await expect(input).toBeVisible({ timeout: 15_000 });

  // Abre paleta de comandos com /
  await input.fill('/');
  await expect(page.getByTestId('math-command-menu')).toBeVisible();

  // Fecha paleta e envia 124/4 com Enter
  await input.fill('124/4');
  await input.press('Enter');

  const card = page.getByTestId('math-result-card');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText('Resultados matemáticos');
  await expect(card).toContainText('Entrada');
  await expect(card).toContainText('Resultado exato');
  await expect(page.getByTestId('math-card-input').locator('.katex')).toBeVisible();
  await expect(page.getByTestId('math-card-exact')).toContainText('31');

  // Expande Mostrar mais
  await page.getByTestId('math-show-more-btn').click();
  await expect(page.getByTestId('math-expanded-details')).toBeVisible();
  await expect(page.getByTestId('math-expanded-details')).toContainText('Divisão exata');

  // Copia resultado
  await page.getByTestId('math-copy-btn').click();
  await expect(page.getByTestId('math-copy-btn')).toContainText('Copiado!');
});
