import { test, expect } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer, type ViteDevServer } from 'vite';

let vite: ViteDevServer;
let baseUrl: string;

test.beforeAll(async () => {
  vite = await createServer({
    configFile: false,
    plugins: [react()],
    resolve: { alias: { '@': process.cwd() } },
    server: {
      host: '127.0.0.1',
      port: 0,
      fs: { deny: ['**/package.json', '**/package-lock.json', '**/.env*', '**/server.ts', '**/server.cjs'] },
    },
    appType: 'mpa',
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite harness did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await vite?.close();
});

test('completed study syncs to Google Calendar when the topic is blank', async ({ page }) => {
  await page.goto(`${baseUrl}/test/fixtures/calendar-sync-modal.html`);

  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.getByRole('button', { name: /Salvar Estudo & Sincronizar/i }).click();

  const payload = JSON.parse(await page.getByTestId('saved-payload').textContent() || '{}');
  expect(payload).toMatchObject({
    completed: true,
    topic: '',
    syncWithCalendar: true,
  });
});
