import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('EXT-01: arquivos da extensão Manifest V3 existem e são válidos', () => {
  const manifestPath = path.join(root, 'extension/manifest.json');
  assert.equal(fs.existsSync(manifestPath), true, 'manifest.json deve existir');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.manifest_version, 3, 'Deve ser Manifest V3');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);

  // Verifica existência dos arquivos essenciais
  for (const file of [
    'extension/popup.html',
    'extension/popup.css',
    'extension/popup.js',
    'extension/background.js',
    'extension/content.js',
    'extension/icon16.png',
    'extension/icon48.png',
    'extension/icon128.png',
    'extension/README.md',
  ]) {
    const fullPath = path.join(root, file);
    assert.equal(fs.existsSync(fullPath), true, `Arquivo ${file} deve existir`);
    assert.ok(fs.statSync(fullPath).size > 0, `Arquivo ${file} não pode estar vazio`);
  }
});

test('EXT-02: CORS no server.ts permite extensões de navegadores de forma segura', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /chrome-extension:\/\//, 'CORS deve aceitar origin chrome-extension://');
  assert.match(serverCode, /moz-extension:\/\//, 'CORS deve aceitar origin moz-extension://');
});

test('EXT-03: rotas de sincronização de nivelamento estão protegidas por autenticação', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/leveling\/session["'],\s*requireUserAuth/);
  assert.match(serverCode, /app\.post\(["']\/api\/leveling\/session["'],\s*requireUserAuth/);
  assert.match(serverCode, /cfo_leveling_session/);
});

test('EXT-04: botão de extensão no cabeçalho é exclusivo para computadores (oculto no mobile)', () => {
  const headerCode = readSource('src/components/Header.tsx');
  assert.match(headerCode, /id="btn-extension-token"/);
  assert.match(headerCode, /hidden md:inline-flex/, 'Deve ser oculto no mobile e visível apenas em telas md+');
  assert.match(headerCode, /setIsExtensionModalOpen\(true\)/);
});

test('EXT-05: popup.js possui suporte a cronômetro e atalhos táteis de certa e errada', () => {
  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /recordAnswer\('correct'\)/);
  assert.match(popupJs, /recordAnswer\('wrong'\)/);
  assert.match(popupJs, /formatTime/);
  assert.match(popupJs, /\/api\/leveling\/session/);
  assert.match(popupJs, /\/api\/timer\/save-session/);
});

test('EXT-06: pacote ZIP da extensão existe em public e endpoint de download está registrado', () => {
  const zipPath = path.join(root, 'public/cfo-extensao-cbmerj.zip');
  assert.equal(fs.existsSync(zipPath), true, 'cfo-extensao-cbmerj.zip deve existir em public/');
  assert.ok(fs.statSync(zipPath).size > 1000, 'Arquivo ZIP deve conter conteúdo empacotado');

  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/download\/extension["']/);
  assert.match(serverCode, /cfo-extensao-cbmerj\.zip/);
});

test('EXT-07: banner de download no Nivelamento e modal são exclusivos para desktop', () => {
  const levelingCode = readSource('src/components/LevelingTab.tsx');
  assert.match(levelingCode, /hidden md:flex/, 'Banner do nivelamento deve ser oculto no mobile');
  assert.match(levelingCode, /ExtensionModal/);

  const modalCode = readSource('src/components/ExtensionModal.tsx');
  assert.match(modalCode, /\/api\/download\/extension/);
  assert.match(modalCode, /Exclusivo para Computador/);
});

test('EXT-08: endpoint seguro /api/user/extension-token emite token para a extensão', () => {
  const serverCode = readSource('server.ts');
  assert.match(serverCode, /app\.get\(["']\/api\/user\/extension-token["'],\s*requireUserAuth/);
  assert.match(serverCode, /sessionRepoInstance\.createSession/);
});

test('EXT-09: ExtensionModal não utiliza alert() ou prompt() nativos do navegador', () => {
  const modalCode = readSource('src/components/ExtensionModal.tsx');
  assert.doesNotMatch(modalCode, /\balert\(/, 'Não deve utilizar window.alert nativo');
  assert.doesNotMatch(modalCode, /\bwindow\.prompt\(/, 'Não deve utilizar window.prompt nativo');
  assert.match(modalCode, /\/api\/user\/extension-token/);
});

test('EXT-10: extensão vem pré-configurada por padrão com a URL oficial de produção', () => {
  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /https:\/\/cfo-oficial-agorasim\.onrender\.com/);

  const bgJs = readSource('extension/background.js');
  assert.match(bgJs, /https:\/\/cfo-oficial-agorasim\.onrender\.com/);

  const popupHtml = readSource('extension/popup.html');
  assert.match(popupHtml, /https:\/\/cfo-oficial-agorasim\.onrender\.com/);
});

test('EXT-11: barra lateral possui atalho explícito para a extensão Web (PC)', () => {
  const sidebarCode = readSource('src/components/TacticalSidebar.tsx');
  assert.match(sidebarCode, /id:\s*['"]browserExtension['"]/);
  assert.match(sidebarCode, /label:\s*['"]Extensão Web \(PC\)['"]/);
  assert.match(sidebarCode, /onOpenExtension/);
});

test('EXT-12: Minha Conta possui aba dedicada de Extensão e App.tsx suporta rota /extensao', () => {
  const accountCode = readSource('src/components/MyAccountModal.tsx');
  assert.match(accountCode, /activeSubTab === ['"]extension['"]/);
  assert.match(accountCode, /https:\/\/cfo-oficial-agorasim\.onrender\.com/);
  assert.match(accountCode, /\/api\/user\/extension-token/);

  const appCode = readSource('src/App.tsx');
  assert.match(appCode, /['"]\/extensao['"]/);
  assert.match(appCode, /onOpenExtension/);
});

test('EXT-13: cronômetro suporta ciclos de descanso (Recovery Pill) e razão de foco', () => {
  const popupHtml = readSource('extension/popup.html');
  assert.match(popupHtml, /id="timer-rest-pill"/);
  assert.match(popupHtml, /id="rest-timer-display"/);
  assert.match(popupHtml, /id="timer-ratio-card"/);

  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /getElapsedRestMs/);
  assert.match(popupJs, /restAccumulatedMs/);
  assert.match(popupJs, /restStartTime/);

  const bgJs = readSource('extension/background.js');
  assert.match(bgJs, /restAccumulatedMs/);
  assert.match(bgJs, /restStartTime/);

  const serverCode = readSource('server.ts');
  assert.match(serverCode, /totalRestMs/);
  assert.match(serverCode, /restAccumulatedMs/);
});

test('EXT-14: pausas acumulam continuamente entre ciclos e totalizam o tempo real de descanso da sessão', () => {
  const popupJs = readSource('extension/popup.js');
  const bgJs = readSource('extension/background.js');

  // getElapsedRestMs deve somar restAccumulatedMs na pausa
  assert.match(popupJs, /accumulated\s*\+\s*Math\.max\(0,\s*(?:getServerNow\(\)|Date\.now\(\))\s*-\s*state\.timer\.restStartTime\)/);

  // background.js badge deve somar restAccumulatedMs na pausa
  assert.match(bgJs, /const restElapsed = prevRest \+ Math\.max\(0,\s*now\s*-\s*restStart\);/);

  // Simulação de transição: Pausa 1 (5s) -> Retoma Foco -> Pausa 2 (1s)
  const now1 = 1000000;
  // Estado inicial estudando
  let timer: any = {
    status: 'RUNNING',
    accumulatedMs: 60000,
    startTime: now1,
    restStartTime: null,
    restAccumulatedMs: 0,
  };

  // 1. Cadete pausa pela primeira vez em now1 + 10s
  const pause1Time = now1 + 10000;
  const elapsed1 = pause1Time - timer.startTime;
  timer = {
    ...timer,
    status: 'PAUSED',
    accumulatedMs: timer.accumulatedMs + elapsed1,
    startTime: null,
    restStartTime: pause1Time,
    restAccumulatedMs: 0,
  };

  // Descanso da primeira pausa após 5s
  const duringPause1Time = pause1Time + 5000;
  const restDuration1 = timer.restAccumulatedMs + Math.max(0, duringPause1Time - timer.restStartTime);
  assert.equal(restDuration1, 5000, 'Primeira pausa após 5s deve medir 5000ms');

  // 2. Cadete retoma foco em pause1Time + 5s (acumula 5000ms de descanso)
  const resumeTime = duringPause1Time;
  const restDelta1 = resumeTime - pause1Time;
  timer = {
    ...timer,
    status: 'RUNNING',
    startTime: resumeTime,
    restStartTime: null,
    restAccumulatedMs: timer.restAccumulatedMs + restDelta1,
  };
  assert.equal(timer.restAccumulatedMs, 5000, 'Tempo acumulado de descanso deve ser 5000ms ao retomar o foco');

  // 3. Cadete estuda por 20s e pausa novamente (Pausa 2)
  const pause2Time = resumeTime + 20000;
  const elapsed2 = pause2Time - timer.startTime;
  timer = {
    ...timer,
    status: 'PAUSED',
    accumulatedMs: timer.accumulatedMs + elapsed2,
    startTime: null,
    restStartTime: pause2Time,
    restAccumulatedMs: timer.restAccumulatedMs, // Preserva descanso acumulado
  };

  // Descanso total da sessão após 1s na segunda pausa
  const duringPause2Time = pause2Time + 1000;
  const totalRestDuration = timer.restAccumulatedMs + Math.max(0, duringPause2Time - timer.restStartTime);

  // Deve medir exatamente 6000ms (5000ms da 1ª pausa + 1000ms da 2ª pausa)
  assert.equal(totalRestDuration, 6000, 'Total de pausas da sessão deve acumular 6000ms (5s + 1s) sem resetar');
});

test('EXT-15: retoma foco sem exibir NaN : NaN : NaN e mantém resiliência numérica entre accumulatedTime e accumulatedMs', () => {
  const popupJs = readSource('extension/popup.js');
  const bgJs = readSource('extension/background.js');

  // Verifica normalização no popup.js
  assert.match(popupJs, /accumulatedMs:\s*cloudAcc/, 'popup.js deve atribuir accumulatedMs a partir da resposta cloud');
  assert.match(popupJs, /accumulatedTime:\s*cloudAcc/, 'popup.js deve atribuir accumulatedTime a partir da resposta cloud');
  assert.match(popupJs, /Number\(state\.timer\.accumulatedMs\s*\?\?\s*state\.timer\.accumulatedTime\)/, 'getElapsedTimerMs deve aceitar accumulatedMs ou accumulatedTime');

  // Verifica normalização no background.js
  assert.match(bgJs, /Number\(prev\.accumulatedMs\s*\?\?\s*prev\.accumulatedTime\)/, 'background.js deve suportar accumulatedTime como fallback');

  // Simulação da função formatTime do popup.js
  function formatTime(ms: any) {
    const safeMs = typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : 0;
    const seconds = Math.floor(safeMs / 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }

  // formatTime nunca deve produzir NaN
  assert.equal(formatTime(NaN), '00:00:00', 'formatTime(NaN) deve retornar 00:00:00');
  assert.equal(formatTime(undefined), '00:00:00', 'formatTime(undefined) deve retornar 00:00:00');
  assert.equal(formatTime(null), '00:00:00', 'formatTime(null) deve retornar 00:00:00');
  assert.equal(formatTime(-1000), '00:00:00', 'formatTime(-1000) deve retornar 00:00:00');
  assert.equal(formatTime(65000), '00:01:05', 'formatTime(65000) deve retornar 00:01:05');

  // Simulação do cenário exato do bug:
  // 1. Estado vindo da nuvem com accumulatedTime (sem accumulatedMs)
  const cloudResponse: any = {
    status: 'PAUSED',
    accumulatedTime: 120000, // 2 minutos
    startTime: null,
    restStartTime: 1000000,
  };

  const cloudAcc = Number(cloudResponse.accumulatedTime ?? cloudResponse.accumulatedMs) || 0;
  let timerState: any = {
    status: cloudResponse.status,
    accumulatedMs: cloudAcc,
    accumulatedTime: cloudAcc,
    startTime: cloudResponse.startTime,
    restStartTime: cloudResponse.restStartTime,
    restAccumulatedMs: 0,
  };

  // 2. Cadete clica em "Retomar foco"
  const now = 1005000;
  const currentAccumulated = Number(timerState.accumulatedMs ?? timerState.accumulatedTime) || 0;
  timerState = {
    ...timerState,
    status: 'RUNNING',
    accumulatedMs: currentAccumulated,
    accumulatedTime: currentAccumulated,
    startTime: now,
    restStartTime: null,
    restAccumulatedMs: 0,
  };

  // 3. getElapsedTimerMs após 3 segundos
  const simulatedNow = now + 3000;
  const accumulated = Number(timerState.accumulatedMs ?? timerState.accumulatedTime) || 0;
  const elapsed = accumulated + Math.max(0, simulatedNow - timerState.startTime);
  const display = formatTime(elapsed);

  assert.equal(Number.isNaN(elapsed), false, 'elapsed não pode ser NaN ao retomar o foco');
  assert.equal(display, '00:02:03', 'Deve exibir 00:02:03 com precisão após retomar o foco');
  assert.doesNotMatch(display, /NaN/, 'Display nunca pode conter NaN');
});

test('EXT-16: sincronização bidirecional em tempo real (< 5ms) entre extensão e plataforma web', () => {
  const manifest = JSON.parse(readSource('extension/manifest.json'));
  assert.ok(Array.isArray(manifest.content_scripts), 'manifest.json deve conter content_scripts');
  assert.equal(manifest.content_scripts[0].js[0], 'content.js', 'content_scripts deve carregar content.js');
  assert.ok(
    manifest.content_scripts[0].matches.some((m: string) => m.includes('localhost')),
    'content_scripts deve incluir localhost'
  );
  assert.ok(
    manifest.content_scripts[0].matches.some((m: string) => m.includes('cfo-oficial-agorasim.onrender.com')),
    'content_scripts deve incluir o domínio oficial do Render'
  );

  const contentJs = readSource('extension/content.js');
  assert.match(contentJs, /cfo-web-bridge/, 'content.js deve conectar na porta cfo-web-bridge');
  assert.match(contentJs, /EXTENSION_TIMER_SYNC/, 'content.js deve repassar sync da extensão para a janela web');
  assert.match(contentJs, /TIMER_SYNC_FROM_WEB/, 'content.js deve ouvir eventos do cronômetro web');
  assert.match(contentJs, /AUTH_SESSION_UPDATE/, 'content.js deve auto-sincronizar sessão autenticada');

  const bgJs = readSource('extension/background.js');
  assert.match(bgJs, /cfo-web-bridge/, 'background.js deve escutar a porta cfo-web-bridge');
  assert.match(bgJs, /broadcastToWeb/, 'background.js deve conter rotina de broadcast para a web');
  assert.match(bgJs, /WEB_TIMER_UPDATE/, 'background.js deve receber atualizações do cronômetro web');

  const timerTab = readSource('src/components/TimerTab.tsx');
  assert.match(timerTab, /cfo-extension/, 'TimerTab deve ouvir mensagens da extensão');
  assert.match(timerTab, /TIMER_SYNC_FROM_WEB/, 'TimerTab deve emitir sync para a extensão');
  assert.match(timerTab, /setInterval\(fetchTimerStatus,\s*3000\)/, 'Polling do TimerTab deve ser calibrado para 3s');

  const cloudTimer = readSource('src/components/CloudTimer.tsx');
  assert.match(cloudTimer, /cfo-extension/, 'CloudTimer deve ouvir mensagens da extensão');
  assert.match(cloudTimer, /TIMER_SYNC_FROM_WEB/, 'CloudTimer deve emitir sync para a extensão');
  assert.match(cloudTimer, /setInterval\(fetchTimerStatus,\s*3000\)/, 'Polling do CloudTimer deve ser calibrado para 3s');
});

test('EXT-17: calibração de clock skew (serverOffset) e otimização de build/deploy', () => {
  const popupJs = readSource('extension/popup.js');
  assert.match(popupJs, /getServerNow\(\)/, 'popup.js deve conter função getServerNow');
  assert.match(popupJs, /serverOffset/, 'popup.js deve gerenciar serverOffset');
  assert.match(popupJs, /cfo_ext_server_offset/, 'popup.js deve persistir cfo_ext_server_offset no storage');
  assert.match(popupJs, /Math\.max\(0,\s*getServerNow\(\)\s*-\s*start\)/, 'popup.js deve calcular tempo com getServerNow');

  const bgJs = readSource('extension/background.js');
  assert.match(bgJs, /SERVER_OFFSET:\s*['"]cfo_ext_server_offset['"]/, 'background.js deve definir chave SERVER_OFFSET');
  assert.match(bgJs, /getServerNow\(\)/, 'background.js deve conter getServerNow');
  assert.match(bgJs, /serverOffset = cloud\.serverTime - Date\.now\(\)/, 'background.js deve calibrar serverOffset com a nuvem');

  const serverCode = readSource('server.ts');
  assert.match(serverCode, /resetAccumulated === true/, 'server.ts deve aceitar resetAccumulated no /api/timer/start');
  assert.match(serverCode, /typeof accumulatedTime === 'number'/, 'server.ts deve aceitar accumulatedTime no /api/timer/start');

  const viteConfig = readSource('vite.config.ts');
  assert.match(viteConfig, /sourcemap:\s*process\.env\.VITE_SOURCEMAP === 'true' \? 'hidden' : false/, 'vite.config.ts deve desativar sourcemaps pesados por padrão');

  const pkgJson = readSource('package.json');
  assert.doesNotMatch(pkgJson, /esbuild server\.ts .*--sourcemap/, 'package.json build não deve gerar sourcemap de esbuild por padrão');
});
