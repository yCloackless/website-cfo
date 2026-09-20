process.env.NODE_ENV = 'test';

import { expect, test } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { SessionRepository, UserRepository } from '../src/db/repositories';
import { StudentStudyRepository } from '../src/db/studentStudyRepository';

let server: http.Server;
let baseUrl: string;
let sessionToken: string;

const tabs = ['Dashboard', 'Meu Boletim', 'Matérias', 'Próximas provas', 'Calendário', 'Meu objetivo', 'Faculdades / MEC', 'Assistente IA'];
const viewports = [320, 360, 375, 390, 412, 430, 768, 1024, 1366, 1920];

test.beforeAll(async () => {
  const raw = getDb().getRawDb();
  const users = new UserRepository(raw);
  const user = users.findByUsername('e2e-ifrj-responsive') || users.create({
    username: 'e2e-ifrj-responsive',
    email: 'e2e-ifrj-responsive@test.local',
    passwordHash: 'hash',
    role: 'cadet',
    canAccessIfrj: true,
  });
  new StudentStudyRepository(raw).upsertProfile(user.id, {
    displayName: 'Auditoria IFRJ',
    campus: 'São Gonçalo',
    course: 'Química',
    onboardingCompleted: true,
  });
  sessionToken = new SessionRepository(raw).createSession({ userId: user.id, role: 'cadet' }).rawToken;

  const distPath = path.join(process.cwd(), 'dist', 'public');
  app.use(express.static(distPath, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('IFRJ: todas as telas internas cabem em telas móveis, tablet e desktop', async ({ page }, testInfo) => {
  await page.addInitScript((token) => {
    localStorage.setItem('cfo_terminal_session', token);
    localStorage.setItem('cfo_terminal_expires_at', String(Date.now() + 60 * 60 * 1000));
    localStorage.setItem('cfo_terminal_user', 'e2e-ifrj-responsive');
    localStorage.setItem('cfo_terminal_role', 'cadet');
    localStorage.setItem('cfo_can_access_ifrj', 'true');
  }, sessionToken);

  for (const width of viewports) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseUrl}/ifrj`);
    await expect(page.locator('.rumo-app')).toBeVisible();

    for (const tab of tabs) {
      if (width <= 680) {
        await page.getByRole('button', { name: 'Abrir navegação' }).click();
        await expect(page.locator('.rumo-sidebar.is-open')).toBeVisible();
      }
      await page.locator('.rumo-sidebar nav').getByRole('button', { name: tab, exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }

    if ([375, 390, 430].includes(width)) {
      await page.goto(`${baseUrl}/ifrj`);
      await expect(page.locator('.rumo-app')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`ifrj-${width}px.png`), fullPage: true });
    }
  }
});
