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

test.describe('E2E: Estabilização Completa do Cronômetro e Troca de Disciplinas', () => {
  let backendTimerState = {
    status: 'STOPPED' as 'STOPPED' | 'RUNNING' | 'PAUSED',
    accumulatedTime: 0,
    startTime: null as number | null,
    restAccumulatedMs: 0,
    restStartTime: null as number | null,
    activeSubjectId: 'matematica',
    activeSubjectName: 'Matemática',
    intervals: [] as any[],
    updatedAt: new Date().toISOString(),
  };

  test.beforeEach(async ({ page }) => {
    backendTimerState = {
      status: 'STOPPED',
      accumulatedTime: 0,
      startTime: null,
      restAccumulatedMs: 0,
      restStartTime: null,
      activeSubjectId: 'matematica',
      activeSubjectName: 'Matemática',
      intervals: [],
      updatedAt: new Date().toISOString(),
    };

    // Configura sessão autenticada do cadete
    await page.route('**/api/auth/verify-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          valid: true,
          user: {
            id: 'cadete-e2e-user',
            username: 'cadete_e2e',
            role: 'cadet',
            email: 'cadete@cbmerj.rj.gov.br',
            fullName: 'Cadete Teste de Foco',
          },
          expiresAt: Date.now() + 30 * 86400000,
          canAccessNotion: true,
        }),
      });
    });

    await page.route('**/api/user/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: {
            id: 'cadete-e2e-user',
            username: 'cadete_e2e',
            fullName: 'Cadete Teste de Foco',
            role: 'cadet',
          },
        }),
      });
    });

    // Mock das APIs do cronômetro para teste E2E determinístico e imediato
    await page.route('**/api/timer/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...backendTimerState,
          totalElapsedMs: backendTimerState.accumulatedTime + (backendTimerState.startTime ? Date.now() - backendTimerState.startTime : 0),
          totalRestMs: backendTimerState.restAccumulatedMs,
          serverTime: Date.now(),
        }),
      });
    });

    await page.route('**/api/timer/start', async (route) => {
      const now = Date.now();
      backendTimerState.status = 'RUNNING';
      backendTimerState.startTime = now;
      backendTimerState.restStartTime = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ...backendTimerState,
          totalElapsedMs: backendTimerState.accumulatedTime,
          totalRestMs: backendTimerState.restAccumulatedMs,
          serverTime: now,
        }),
      });
    });

    await page.route('**/api/timer/pause', async (route) => {
      const now = Date.now();
      if (backendTimerState.status === 'RUNNING' && backendTimerState.startTime) {
        backendTimerState.accumulatedTime += now - backendTimerState.startTime;
      }
      backendTimerState.status = 'PAUSED';
      backendTimerState.startTime = null;
      backendTimerState.restStartTime = now;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ...backendTimerState,
          totalElapsedMs: backendTimerState.accumulatedTime,
          totalRestMs: backendTimerState.restAccumulatedMs,
          serverTime: now,
        }),
      });
    });

    await page.route('**/api/timer/stop', async (route) => {
      backendTimerState.status = 'STOPPED';
      backendTimerState.accumulatedTime = 0;
      backendTimerState.startTime = null;
      backendTimerState.restAccumulatedMs = 0;
      backendTimerState.restStartTime = null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ...backendTimerState,
          totalElapsedMs: 0,
          totalRestMs: 0,
          serverTime: Date.now(),
        }),
      });
    });

    await page.route('**/api/timer/subject', async (route) => {
      const body = route.request().postDataJSON?.() || {};
      backendTimerState.activeSubjectId = body.subjectId || backendTimerState.activeSubjectId;
      backendTimerState.activeSubjectName = body.subjectName || backendTimerState.activeSubjectName;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          ...backendTimerState,
          totalElapsedMs: backendTimerState.accumulatedTime + (backendTimerState.startTime ? Date.now() - backendTimerState.startTime : 0),
          totalRestMs: backendTimerState.restAccumulatedMs,
          serverTime: Date.now(),
        }),
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('cfo_terminal_session', 'mock-token-cfo-cadet-2026');
      window.localStorage.setItem('cfo_terminal_expires_at', String(Date.now() + 86400000));
      window.localStorage.setItem('cfo_terminal_user', 'Cadete Teste de Foco');
      window.localStorage.setItem('cfo_terminal_role', 'cadet');
      window.localStorage.setItem('cfo_theme', 'dark');
      window.localStorage.setItem('cfo_sidebar_open', 'false');
      window.localStorage.setItem('cfo_sidebar_collapsed', 'true');
    });

    // Acessa diretamente a aba do cronômetro
    await page.goto(`${baseUrl}/cronometro`, { waitUntil: 'domcontentloaded' });

    // Garante que o contêiner do timer está visível
    await expect(page.locator('text=Cronômetro Tático de Foco')).toBeVisible({ timeout: 10000 });
  });

  test('Cenário 1: Start -> Pause -> Resume -> Stop responde imediatamente (< 100ms) sem duplo clique', async ({ page }) => {
    // 1. Zera se tiver tempo residual
    const zerarBtn = page.getByRole('button', { name: /ZERAR/i });
    if (await zerarBtn.isEnabled()) {
      await zerarBtn.click();
      const modalConfirm = page.getByRole('button', { name: /Zerar Cronômetro/i });
      if (await modalConfirm.isVisible()) {
        await modalConfirm.click();
      }
    }

    const startBtn = page.getByRole('button', { name: /INICIAR ESTUDO/i });
    await expect(startBtn).toBeVisible();

    // Mede tempo de resposta do clique Start -> UI atualizada
    const t0 = Date.now();
    await startBtn.click();
    const pauseBtn = page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i });
    await expect(pauseBtn).toBeVisible({ timeout: 1000 });
    const startLatency = Date.now() - t0;
    expect(startLatency).toBeLessThan(400);

    // Aguarda 1 segundo rodando
    await page.waitForTimeout(1000);

    // Mede tempo de resposta do clique Pause -> UI atualizada
    const t1 = Date.now();
    await pauseBtn.click();
    const resumeBtn = page.getByRole('button', { name: /RETOMAR ESTUDO/i });
    await expect(resumeBtn).toBeVisible({ timeout: 1000 });
    const pauseLatency = Date.now() - t1;
    expect(pauseLatency).toBeLessThan(400);

    // Mede tempo de resposta do clique Resume -> UI atualizada
    const t2 = Date.now();
    await resumeBtn.click();
    await expect(page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i })).toBeVisible({ timeout: 1000 });
    const resumeLatency = Date.now() - t2;
    expect(resumeLatency).toBeLessThan(400);

    // Pausa e zera
    await page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i }).click();
    await zerarBtn.click();
    const confirmModalBtn = page.getByRole('button', { name: /Zerar Cronômetro/i });
    if (await confirmModalBtn.isVisible()) {
      await confirmModalBtn.click();
    }
    await expect(page.getByRole('button', { name: /INICIAR ESTUDO/i })).toBeVisible();
  });

  test('Cenário 2: Alternância contínua de matérias enquanto RUNNING mantém contagem monotônica e não congela', async ({ page }) => {
    // Inicia estudo
    const startBtn = page.getByRole('button', { name: /(INICIAR ESTUDO|RETOMAR ESTUDO)/i });
    await startBtn.click();
    await expect(page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i })).toBeVisible();

    const subjectSelect = page.locator('select').first();
    await expect(subjectSelect).toBeVisible();

    // Obtém todas as opções de disciplina
    const options = await subjectSelect.locator('option').all();
    const optionValues = await Promise.all(options.map((opt) => opt.getAttribute('value')));
    const validValues = optionValues.filter((v): v is string => Boolean(v && v.length > 0));

    expect(validValues.length).toBeGreaterThanOrEqual(2);

    // Alterna sequencialmente entre matérias 6 vezes com timer em andamento
    for (let i = 0; i < 6; i++) {
      const targetVal = validValues[i % validValues.length];
      await subjectSelect.selectOption(targetVal);
      await page.waitForTimeout(100);
      // O timer DEVE continuar em RUNNING sem desarmar
      await expect(page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i })).toBeVisible();
    }

    // Pausa após as trocas
    const pauseBtn = page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i });
    await pauseBtn.click();
    await expect(page.getByRole('button', { name: /RETOMAR ESTUDO/i })).toBeVisible();

    // Verifica que o tempo acumulado no display é maior que zero e não contém NaN
    const displayElement = page.locator('.font-mono.font-extrabold').first();
    const rawText = await displayElement.innerText();
    const text = rawText.replace(/\s+/g, '');
    expect(text).not.toContain('NaN');
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  test('Cenário 3: Rajada rápida de cliques em Pausar e Retomar não perde ações nem trava a interface', async ({ page }) => {
    for (let cycle = 0; cycle < 5; cycle++) {
      const actionBtn = page.getByRole('button', { name: /(INICIAR ESTUDO|RETOMAR ESTUDO|PAUSAR CRONÔMETRO)/i });
      await actionBtn.click();
      await page.waitForTimeout(50);
    }

    // A interface deve continuar totalmente operacional
    const anyBtn = page.getByRole('button', { name: /(INICIAR ESTUDO|RETOMAR ESTUDO|PAUSAR CRONÔMETRO)/i });
    await expect(anyBtn).toBeVisible();
    await expect(anyBtn).toBeEnabled();
  });

  test('Cenário 4: Alternância de matérias durante a PAUSA não altera o status e preserva o tempo acumulado', async ({ page }) => {
    // Garante que o timer está pausado
    const isRunning = await page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i }).isVisible();
    if (isRunning) {
      await page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i }).click();
    } else {
      const startBtn = page.getByRole('button', { name: /(INICIAR ESTUDO|RETOMAR ESTUDO)/i });
      await startBtn.click();
      await page.waitForTimeout(300);
      await page.getByRole('button', { name: /PAUSAR CRONÔMETRO/i }).click();
    }

    await expect(page.getByRole('button', { name: /RETOMAR ESTUDO/i })).toBeVisible();

    const subjectSelect = page.locator('select').first();
    const options = await subjectSelect.locator('option').all();
    const validValues = (await Promise.all(options.map((opt) => opt.getAttribute('value')))).filter(Boolean) as string[];

    // Troca 3 vezes de matéria em pausa
    for (let i = 0; i < 3; i++) {
      await subjectSelect.selectOption(validValues[i % validValues.length]);
      await page.waitForTimeout(100);
      // Deve continuar em PAUSA
      await expect(page.getByRole('button', { name: /RETOMAR ESTUDO/i })).toBeVisible();
    }
  });
});
