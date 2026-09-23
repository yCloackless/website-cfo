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

const VIEWPORTS = [
  { name: '1920x1080 (Desktop FHD)', width: 1920, height: 1080 },
  { name: '1536x864 (Laptop Médio)', width: 1536, height: 864 },
  { name: '1366x768 (Laptop Compacto)', width: 1366, height: 768 },
  { name: '1280x720 (HD Padrão)', width: 1280, height: 720 },
  { name: '390x844 (Mobile)', width: 390, height: 844 },
];

test.describe('Validação Responsiva do Painel de Conexão da Extensão (Sem Clipping)', () => {
  for (const vp of VIEWPORTS) {
    test(`Modal de Extensão abre perfeitamente sem corte superior em ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

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

      await page.route('**/api/user/extension-token', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'mock-ext-token-12345' }),
        });
      });

      await page.addInitScript(() => {
        window.localStorage.setItem('cfo_terminal_session', 'mock-token-cfo-cadet-2026');
        window.localStorage.setItem('cfo_terminal_expires_at', String(Date.now() + 86400000));
        window.localStorage.setItem('cfo_terminal_user', 'Cadete Teste');
        window.localStorage.setItem('cfo_terminal_role', 'cadet');
        window.localStorage.setItem('cfo_theme', 'dark');
      });

      await page.goto(`${baseUrl}/cronograma`, { waitUntil: 'domcontentloaded' });

      // Se for desktop, clica no botão com o ícone de quebra-cabeça (#btn-extension-token)
      // Se for mobile, o botão é oculto por design (`hidden md:inline-flex`), então abre pela rota /extensao
      const btn = page.locator('#btn-extension-token');
      const isBtnVisible = await btn.isVisible().catch(() => false);

      if (isBtnVisible) {
        await btn.click();
      } else {
        await page.goto(`${baseUrl}/extensao`, { waitUntil: 'domcontentloaded' });
      }

      const overlay = page.locator('#extension-modal-overlay');
      const panel = page.locator('#extension-modal-panel');

      await expect(overlay).toBeVisible();
      await expect(panel).toBeVisible();

      // Checa métricas de geometria no DOM
      const box = await panel.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;

      // 1. O topo do modal NUNCA deve ser cortado (y >= 0)
      expect(box.y).toBeGreaterThanOrEqual(0);

      // 2. O modal deve caber na altura da viewport
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 2);

      // 3. Título e emblema no topo devem estar visíveis e com y >= 0
      const title = page.locator('#extension-modal-title');
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();
      expect(titleBox).not.toBeNull();
      if (titleBox) {
        expect(titleBox.y).toBeGreaterThanOrEqual(0);
      }

      // 4. Botão X superior deve estar visível
      const closeX = page.getByRole('button', { name: /fechar modal/i });
      await expect(closeX).toBeVisible();

      // 5. Scroll inicial deve ser 0
      const scrollTop = await panel.evaluate((el) => el.scrollTop);
      expect(scrollTop).toBe(0);

      // Salva captura do modal aberto e íntegro no viewport
      const artifactDir = 'C:/Users/renas/.gemini/antigravity-ide/brain/4c04ec4c-2944-475b-990c-475b0ed5e992';
      const cleanName = vp.name.split(' ')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      await page.screenshot({ path: `${artifactDir}/modal_${cleanName}.png` });

      // 6. Teste de rolagem interna até o botão "Fechar Painel"
      await panel.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });

      const closeBottom = page.getByRole('button', { name: /fechar painel/i });
      await expect(closeBottom).toBeVisible();

      // 7. Fechamento suave
      await closeBottom.click();
      await expect(overlay).toHaveCount(0);
    });
  }
});
