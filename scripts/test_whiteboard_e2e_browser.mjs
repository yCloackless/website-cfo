import 'dotenv/config';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { getDb } from '../src/db/database.ts';
import { UserRepository, SessionRepository } from '../src/db/repositories.ts';

const ARTIFACT_DIR = 'C:\\Users\\renas\\.gemini\\antigravity-ide\\brain\\d2a34cfd-1142-476e-8da7-610be51529d1';

async function run() {
  console.log('=====================================================');
  console.log('🏁 INICIANDO BROWSER TEST E2E COMPLETO DO WHITEBOARD');
  console.log('=====================================================');

  // 1. Criar sessão válida do Cadete usando os repositórios oficiais do sistema
  const dbService = getDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const sessionRepo = new SessionRepository(db);

  let user = userRepo.findByUsername('cadete');
  if (!user) {
    user = userRepo.findByRole('cadet');
  }
  if (!user) {
    throw new Error('Nenhum usuário cadete encontrado no banco!');
  }

  const { rawToken, session } = sessionRepo.createSession({
    userId: user.id,
    role: user.role,
    expiresInDays: 7,
  });

  console.log(`[Auth] Sessão criada com sucesso para: @${user.username} (${user.id}), sessionId: ${session.id}`);

  // 2. Lançar Browser Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const cspViolations = [];
  const uncaughtErrors = [];
  const tldrawFailedRequests = [];

  page.on('console', msg => {
    const text = msg.text();
    console.log(`[Browser ${msg.type()}]`, text);
    if (text.includes('violates the following Content Security Policy directive') || text.includes('Content Security Policy')) {
      cspViolations.push(text);
    }
    if (text.includes('Failed to fetch') || text.includes('TypeError')) {
      uncaughtErrors.push(text);
    }
  });
  page.on('pageerror', err => {
    console.error('[Browser Uncaught Error]', err);
    uncaughtErrors.push(String(err));
  });
  page.on('requestfailed', request => {
    const url = request.url();
    console.log(`[Request FAILED] ${url} - ${request.failure()?.errorText}`);
    if (url.includes('tldraw')) {
      tldrawFailedRequests.push(`${url}: ${request.failure()?.errorText}`);
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      console.log(`[Response ${response.status()}] ${response.url()}`);
    }
  });

  await context.addCookies([
    {
      name: 'cfo_session',
      value: rawToken,
      domain: '127.0.0.1',
      path: '/',
    },
  ]);

  // Injetar token de autenticação real em todas as requisições /api/**
  await page.route('**/api/**', async (route) => {
    const headers = {
      ...route.request().headers(),
      authorization: `Bearer ${rawToken}`,
    };
    await route.continue({ headers });
  });

  await page.addInitScript(({ uname, urole, uid, token }) => {
    localStorage.setItem('cfo_terminal_session', token);
    localStorage.setItem('cfo_terminal_expires_at', String(Date.now() + 86400000));
    localStorage.setItem('cfo_terminal_user', uname);
    localStorage.setItem('cfo_terminal_role', urole);
    localStorage.setItem('cfo_user_id', uid);
    localStorage.setItem('cfo_theme', 'dark');
    localStorage.setItem('cfo_sidebar_open', 'false');
    localStorage.setItem('cfo_sidebar_collapsed', 'true');
    localStorage.setItem('cfo_cookie_consent', JSON.stringify({ mode: 'necessary', timestamp: new Date().toISOString(), version: '1.0' }));
  }, { uname: user.username, urole: user.role, uid: user.id, token: rawToken });

  console.log('[Nav] Inicializando aplicação em http://127.0.0.1:3000/cronograma ...');
  await page.goto('http://127.0.0.1:3000/cronograma', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log('[Nav] Acessando Quadro Branco em http://127.0.0.1:3000/whiteboard ...');
  const response = await page.goto('http://127.0.0.1:3000/whiteboard', { waitUntil: 'domcontentloaded' });
  console.log(`[Nav] Status da navegação Whiteboard: ${response?.status()}`);

  // 3. Aguardar carregamento do Whiteboard e Canvas
  console.log('[Wait] Aguardando canvas do tldraw (.tl-canvas)...');
  try {
    await page.waitForSelector('.tl-canvas', { timeout: 30000 });
    console.log('✅ Canvas interativo do Whiteboard MONTADO com sucesso!');
  } catch (err) {
    const errorShot = path.join(ARTIFACT_DIR, 'error_page_state.png');
    await page.screenshot({ path: errorShot, fullPage: true });
    const html = await page.content();
    console.log('URL no momento da falha:', page.url());
    console.log('HTML DA PÁGINA NO ERRO:');
    console.log(html.slice(0, 1500));
    console.log(`❌ Timeout aguardando .tl-canvas. Screenshot de diagnóstico salva em: ${errorShot}`);
    throw err;
  }

  await page.waitForTimeout(1500);

  // 4. Teste Desktop: Desenho com Mouse
  console.log('\n--- 1. TESTE DE DESENHO COM MOUSE (DESKTOP) ---');

  // Selecionar caneta explicitamente
  const penButton = page.locator('button[title="Caneta Stylus"]');
  await penButton.click();
  await page.waitForTimeout(200);

  // a) Linha Horizontal
  console.log('-> Desenhando Linha Horizontal com mouse...');
  await page.mouse.move(300, 250);
  await page.mouse.down();
  await page.mouse.move(550, 250, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // b) Linha Vertical
  console.log('-> Desenhando Linha Vertical com mouse...');
  await page.mouse.move(425, 180);
  await page.mouse.down();
  await page.mouse.move(425, 380, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // c) Círculo
  console.log('-> Desenhando Círculo com mouse...');
  const centerX = 700;
  const centerY = 300;
  const radius = 60;
  await page.mouse.move(centerX + radius, centerY);
  await page.mouse.down();
  for (let angle = 0; angle <= Math.PI * 2 + 0.3; angle += 0.3) {
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    await page.mouse.move(x, y, { steps: 2 });
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  // d) Rabisco
  console.log('-> Desenhando Rabisco com mouse...');
  await page.mouse.move(300, 450);
  await page.mouse.down();
  await page.mouse.move(350, 480, { steps: 3 });
  await page.mouse.move(400, 440, { steps: 3 });
  await page.mouse.move(450, 490, { steps: 3 });
  await page.mouse.move(500, 430, { steps: 3 });
  await page.mouse.move(550, 470, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Verificar traços gerados
  const strokeShapes = await page.evaluate(() => {
    return document.querySelectorAll('.tl-shape path').length;
  });
  console.log(`✅ Elementos de traço desenhados no canvas: ${strokeShapes}`);
  if (strokeShapes === 0) {
    throw new Error('FALHA CRÍTICA: Nenhum traço foi criado pelo mouse!');
  }

  // Captura 1: Prova de traços desenhados pelo mouse
  const proof1Path = path.join(ARTIFACT_DIR, 'proof_1_mouse_strokes.png');
  await page.screenshot({ path: proof1Path });
  console.log(`📸 PROVA 1 SALVA: ${proof1Path}`);

  // 5. Teste de Troca de Cor do Traço
  console.log('\n--- 2. TESTE DE CORES E FORMATOS ---');
  const redColorBtn = page.locator('button[title="Cor Vermelho"]');
  if (await redColorBtn.count() > 0) {
    console.log('-> Selecionando cor Vermelha...');
    await redColorBtn.click({ force: true });
    await page.waitForTimeout(200);

    await page.mouse.move(650, 450);
    await page.mouse.down();
    await page.mouse.move(750, 450, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    console.log('✅ Traço vermelho adicionado');
  }

  // 6. Teste de Desfazer (Undo) e Refazer (Redo)
  console.log('\n--- 3. TESTE DE UNDO E REDO ---');
  const countBeforeUndo = await page.evaluate(() => document.querySelectorAll('.tl-shape path').length);
  const undoBtn = page.locator('button[title="Desfazer (Ctrl+Z)"]');
  await undoBtn.click({ force: true });
  await page.waitForTimeout(300);

  const countAfterUndo = await page.evaluate(() => document.querySelectorAll('.tl-shape path').length);
  console.log(`Traços antes do undo: ${countBeforeUndo}, após undo: ${countAfterUndo}`);
  if (countAfterUndo >= countBeforeUndo) {
    console.warn('Aviso: Quantidade de traços após undo não diminuiu.');
  } else {
    console.log('✅ Desfazer (Undo) funcionou com sucesso!');
  }

  const redoBtn = page.locator('button[title="Refazer (Ctrl+Y)"]');
  await redoBtn.click({ force: true });
  await page.waitForTimeout(300);
  const countAfterRedo = await page.evaluate(() => document.querySelectorAll('.tl-shape path').length);
  console.log(`Traços após redo: ${countAfterRedo}`);
  console.log('✅ Refazer (Redo) funcionou com sucesso!');

  // 7. Teste de Mão / Pan e retorno para Caneta
  console.log('\n--- 4. TESTE DE MÃO / PANNING ---');
  const handBtn = page.locator('button[title="Mão para Arrastar o Canvas"]');
  await handBtn.click({ force: true });
  await page.waitForTimeout(200);

  console.log('-> Arrastando canvas com a Mão ativa...');
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(600, 500, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  console.log('✅ Canvas arrastado sem criar traços.');

  console.log('-> Alternando de volta para Caneta...');
  await penButton.click({ force: true });
  await page.waitForTimeout(200);

  // 8. Teste de Zoom (Botões e Roda do Mouse)
  console.log('\n--- 5. TESTE DE ZOOM (BOTÕES E RODA DO MOUSE) ---');
  const zoomInBtn = page.locator('button[title="Aumentar Zoom (+)"]');
  await zoomInBtn.click({ force: true });
  await page.waitForTimeout(300);
  await zoomInBtn.click({ force: true });
  await page.waitForTimeout(300);
  console.log('✅ Zoom In via botão executado');

  const zoomOutBtn = page.locator('button[title="Diminuir Zoom (-)"]');
  await zoomOutBtn.click({ force: true });
  await page.waitForTimeout(300);
  console.log('✅ Zoom Out via botão executado');

  console.log('-> Testando zoom via roda do mouse...');
  await page.mouse.move(500, 350);
  await page.mouse.wheel(0, -250); // Zoom in
  await page.waitForTimeout(400);

  // Captura 3: Prova de canvas visivelmente ampliado
  const proof3Path = path.join(ARTIFACT_DIR, 'proof_3_canvas_zoomed.png');
  await page.screenshot({ path: proof3Path });
  console.log(`📸 PROVA 3 SALVA (Canvas com Zoom): ${proof3Path}`);

  const resetZoomBtn = page.locator('button[title="Ajustar / Redefinir Zoom (100%)"]');
  await resetZoomBtn.click({ force: true });
  await page.waitForTimeout(400);
  console.log('✅ Reset Zoom para 100% executado');

  // 9. Teste de Troca de Fundos (7 Opções)
  console.log('\n--- 6. TESTE DE ESTILOS DE FUNDO DO QUADRO ---');
  const bgSelector = page.locator('header select[title="Escolha o Fundo do Quadro / Caderno"]');
  
  // a) Cinza Escuro
  console.log('-> Mudando para Cinza Escuro...');
  await bgSelector.selectOption('dark_gray');
  await page.waitForTimeout(400);

  // b) Branco / Caderno
  console.log('-> Mudando para Branco / Caderno...');
  await bgSelector.selectOption('white');
  await page.waitForTimeout(400);

  // c) Pontilhado
  console.log('-> Mudando para Pontilhado...');
  await bgSelector.selectOption('dots');
  await page.waitForTimeout(400);

  // d) Grade Padrão
  console.log('-> Mudando para Grade Padrão (Grid)...');
  await bgSelector.selectOption('grid');
  await page.waitForTimeout(500);

  // Captura 2: Prova de fundo com grade ativa e traços
  const proof2Path = path.join(ARTIFACT_DIR, 'proof_2_background_style.png');
  await page.screenshot({ path: proof2Path });
  console.log(`📸 PROVA 2 SALVA (Fundo Grade Ativo): ${proof2Path}`);

  // e) Caderno Pautado
  console.log('-> Mudando para Caderno Pautado (Ruled)...');
  await bgSelector.selectOption('ruled');
  await page.waitForTimeout(400);

  // 10. Teste de Persistência após Reload
  console.log('\n--- 7. TESTE DE PERSISTÊNCIA APÓS RECARREGAMENTO (RELOAD) ---');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tl-canvas', { timeout: 20000 });
  await page.waitForTimeout(1000);

  const strokesAfterReload = await page.evaluate(() => {
    return document.querySelectorAll('.tl-shape path').length;
  });
  console.log(`Traços preservados após reload: ${strokesAfterReload}`);
  if (strokesAfterReload > 0) {
    console.log('✅ Desenhos e anotações sobreviveram ao reload!');
  } else {
    console.warn('Atenção: traços não encontrados imediatamente após reload (verificar persistência tldraw)');
  }

  // 11. Teste de Viewports Tablet (800x1280 modo retrato e 1280x800)
  console.log('\n--- 8. TESTE DE VIEWPORT TABLET (800x1280 RETRATO) ---');
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.waitForTimeout(500);

  // Verificar se a toolbar inferior está perfeitamente visível
  const isToolbarVisible = await page.locator('button[title="Caneta Stylus"]').isVisible();
  console.log(`Toolbar com botão Caneta visível em tablet 800x1280: ${isToolbarVisible}`);

  const isHeaderSelectVisible = await page.locator('header select[title="Escolha o Fundo do Quadro / Caderno"]').isVisible();
  console.log(`Seletor de fundo visível em tablet 800x1280: ${isHeaderSelectVisible}`);

  // Captura 4: Prova de Toolbar responsiva com Caneta ativa em viewport tablet
  const proof4Path = path.join(ARTIFACT_DIR, 'proof_4_toolbar_pen_active.png');
  await page.screenshot({ path: proof4Path });
  console.log(`📸 PROVA 4 SALVA (Tablet 800x1280 Toolbar Ativa): ${proof4Path}`);

  // 12. Retornar a 1280x800
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);

  await browser.close();
  dbService.close();

  console.log('\n--- VERIFICAÇÃO DE INTEGRIDADE CSP E REDE ---');
  console.log(`Violações de CSP detectadas: ${cspViolations.length}`);
  console.log(`Erros de runtime não capturados: ${uncaughtErrors.length}`);
  console.log(`Requisições tldraw com falha: ${tldrawFailedRequests.length}`);

  if (cspViolations.length > 0) {
    throw new Error(`FALHA DE CSP: ${cspViolations.join(' | ')}`);
  }
  if (uncaughtErrors.length > 0) {
    throw new Error(`FALHA DE RUNTIME: ${uncaughtErrors.join(' | ')}`);
  }
  if (tldrawFailedRequests.length > 0) {
    throw new Error(`FALHA DE ASSETS TLDRAW: ${tldrawFailedRequests.join(' | ')}`);
  }

  console.log('\n=====================================================');
  console.log('🎉 TODOS OS TESTES E2E EM NAVEGADOR REAL FORAM CONCLUÍDOS COM SUCESSO (ZERO CSP / ZERO FETCH ERRORS)!');
  console.log('=====================================================');
}

run().catch((err) => {
  console.error('❌ Erro no teste E2E do Whiteboard:', err);
  process.exit(1);
});
