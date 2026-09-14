process.env.NODE_ENV = 'test';
process.env.SECURITY_TEST_ALLOWLIST_KEY = 'authorized-pentest-scan-key-2026';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import {
  HoneypotRepository,
  TemporarySourceBlockRepository,
  AuditRepository,
  SessionRepository,
} from '../src/db/repositories';
import { REGISTERED_HONEYTOKENS } from '../src/services/honeypot/honeytokens';

const { app } = await import('../server');

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let honeypotRepo: HoneypotRepository;
let blockRepo: TemporarySourceBlockRepository;
let adminToken: string;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  honeypotRepo = new HoneypotRepository(db.getRawDb());
  blockRepo = new TemporarySourceBlockRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Login como Admin legítimo para testar endpoints de telemetria
  const adminLogin = await authService.login('admin@cbmerj.com', 'fixture-admin-password-2026');
  assert.equal(adminLogin.success, true);
  adminToken = adminLogin.token!;
});

test.after(() => {
  if (server) {
    (server as any).closeAllConnections?.();
    server.close();
  }
});

test('1. Rotas decoy administrativas retornam respostas isoladas e não expõem dados reais', async () => {
  // Teste de /internal-admin com Accept: text/html
  const htmlRes = await fetch(`${baseUrl}/internal-admin`, {
    headers: { Accept: 'text/html' },
  });
  assert.equal(htmlRes.status, 200);
  const html = await htmlRes.text();
  assert.match(html, /Internal Administration/i);
  assert.match(html, /name="password"/i);
  // Não expõe segredos reais
  assert.doesNotMatch(html, /DATABASE_URL/i);
  assert.doesNotMatch(html, /SESSION_SECRET/i);

  // Teste de /api/internal
  const apiRes = await fetch(`${baseUrl}/api/internal`);
  assert.equal(apiRes.status, 403);
  const apiData = await apiRes.json();
  assert.equal(apiData.error, 'FORBIDDEN_INTERNAL_SERVICE');
  assert.equal(apiData.status, 'unreachable');

  // Teste de /system-console
  const consoleRes = await fetch(`${baseUrl}/system-console`, {
    headers: { Accept: 'application/json' },
  });
  assert.equal(consoleRes.status, 401);
});

test('2. Fake Admin Login: Nunca autentica, nunca cria sessão e NUNCA grava senha no banco', async () => {
  const fakePasswordAttempt = 'SuperSecretAttemptedPassword!999';

  const loginRes = await fetch(`${baseUrl}/internal-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      identifier: 'admin@cbmerj.com',
      password: fakePasswordAttempt,
    }).toString(),
  });

  // Retorna HTTP 403 com aviso controlado
  assert.equal(loginRes.status, 403);
  const data = await loginRes.json();
  assert.equal(data.error, 'MONITORED_DECOY_TRIGGERED');
  assert.match(data.message, /Security monitoring triggered/i);

  // Não deve emitir cookie de sessão legítimo
  const setCookie = loginRes.headers.get('set-cookie');
  assert.equal(setCookie, null, 'Login falso não pode emitir cookies de sessão');

  // REGRA CRÍTICA DE SEGURANÇA: A senha NUNCA pode estar salva em nenhuma tabela
  const rawDb = getDb().getRawDb();
  const allEvents = rawDb.prepare('SELECT * FROM security_deception_events').all() as any[];
  for (const ev of allEvents) {
    const serialized = JSON.stringify(ev);
    assert.equal(
      serialized.includes(fakePasswordAttempt),
      false,
      'A senha submetida NUNCA pode ser persistida nem em logs nem na tabela de decepção'
    );
  }

  // Verifica se o evento HONEYPOT_LOGIN_ATTEMPT foi registrado
  const loginEvent = allEvents.find((e: any) => e.event_type === 'HONEYPOT_LOGIN_ATTEMPT');
  assert.ok(loginEvent, 'Deve registrar o evento HONEYPOT_LOGIN_ATTEMPT');
  assert.equal(loginEvent.risk_score >= 70, true, 'Tentativa de login decoy deve ter risco >= 70');
});

test('3. Recursos Canário: Retornam artefatos sintéticos inofensivos e geram telemetria', async () => {
  // 1. .env.backup
  const envRes = await fetch(`${baseUrl}/.env.backup`);
  assert.equal(envRes.status, 200);
  const envContent = await envRes.text();
  assert.match(envContent, /CFO-CBMERJ/);
  assert.match(envContent, /cfo_canary_key_/);
  // Não contém secrets reais de produção
  assert.doesNotMatch(envContent, /readiness-only-session-secret/);

  // 2. database.sql
  const sqlRes = await fetch(`${baseUrl}/database.sql`);
  assert.equal(sqlRes.status, 200);
  const sqlContent = await sqlRes.text();
  assert.match(sqlContent, /CFO CBMERJ Database Architecture Dump/);
  assert.match(sqlContent, /cfo_canary_operator_sec/);

  // 3. backup.zip
  const zipRes = await fetch(`${baseUrl}/backup.zip`);
  assert.equal(zipRes.status, 200);
  assert.equal(zipRes.headers.get('content-type'), 'application/zip');
  const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
  // Verifica assinatura mágica do arquivo ZIP (PK\x03\x04 = 0x04034b50)
  assert.equal(zipBuffer[0], 0x50); // P
  assert.equal(zipBuffer[1], 0x4b); // K
  assert.equal(zipBuffer[2], 0x03);
  assert.equal(zipBuffer[3], 0x04);
  assert.match(zipBuffer.toString('utf8'), /README\.txt/);

  // 4. admin-export.json
  const exportRes = await fetch(`${baseUrl}/admin-export.json`);
  assert.equal(exportRes.status, 200);
  const exportData = await exportRes.json();
  assert.equal(exportData.records_count, 0);
  assert.ok(exportData.canary_verifier);
});

test('4. Detecção de Honeytokens em requisições gerais (HONEYTOKEN_TRIGGERED)', async () => {
  const honeytoken = REGISTERED_HONEYTOKENS[0].tokenValue;

  // Envia requisição em rota normal com honeytoken no header Authorization
  const res = await fetch(`${baseUrl}/api/any-endpoint`, {
    headers: {
      Authorization: `Bearer ${honeytoken}`,
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'SECURITY_VIOLATION');
  assert.match(data.message, /defensive token/i);

  // Verifica se o evento HONEYTOKEN_TRIGGERED foi registrado no banco
  const rawDb = getDb().getRawDb();
  const tokenEvent = rawDb.prepare(`
    SELECT * FROM security_deception_events WHERE event_type = 'HONEYTOKEN_TRIGGERED'
  `).get() as any;
  assert.ok(tokenEvent, 'Deve registrar evento HONEYTOKEN_TRIGGERED');
  assert.equal(tokenEvent.risk_score >= 80, true, 'Uso de honeytoken deve ter risco crítico >= 80');
});

test('5. Resposta defensiva com bloqueio temporário por TTL', async () => {
  const testScannerIp = '198.51.100.42';

  // Simula bloqueio de origem via repositório de segurança com TTL de 1 hora
  const block = blockRepo.blockIp(testScannerIp, 'Detecção de varredura automatizada honeypot', 1);
  assert.ok(block.lockedUntil);
  assert.equal(new Date(block.lockedUntil).getTime() > Date.now(), true);

  // Verifica se o IP é reconhecido como bloqueado
  const check = blockRepo.isIpBlocked(testScannerIp);
  assert.equal(check.isBlocked, true);

  // Desbloqueia e confirma liberação
  const unblocked = blockRepo.unblockIp(testScannerIp);
  assert.equal(unblocked, true);
  const checkAfter = blockRepo.isIpBlocked(testScannerIp);
  assert.equal(checkAfter.isBlocked, false);
});

test('6. Scanner com bypass autorizado de pentest não sofre bloqueio defensivo', async () => {
  const bypassRes = await fetch(`${baseUrl}/internal-admin`, {
    headers: {
      'x-security-scan-bypass': 'authorized-pentest-scan-key-2026',
      Accept: 'text/html',
    },
  });

  // O endpoint responde normalmente a auditoria sem acionar bloqueio
  assert.equal(bypassRes.status, 200);

  // Verifica se nenhum bloqueio foi inserido para o IP local
  const checkLocal = blockRepo.isIpBlocked('127.0.0.1');
  assert.equal(checkLocal.isBlocked, false);
});

test('7. Endpoints administrativos de telemetria e controle de honeypot', async () => {
  // 1. GET /api/admin/honeypot/metrics
  const metricsRes = await fetch(`${baseUrl}/api/admin/honeypot/metrics`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(metricsRes.status, 200);
  const metricsData = await metricsRes.json();
  assert.equal(metricsData.success, true);
  assert.ok(metricsData.metrics.totalEvents >= 1);
  assert.ok(Array.isArray(metricsData.metrics.topTargetedDecoys));

  // 2. GET /api/admin/honeypot/events (paginado e sanitizado)
  const eventsRes = await fetch(`${baseUrl}/api/admin/honeypot/events?page=1&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(eventsRes.status, 200);
  const eventsData = await eventsRes.json();
  assert.equal(eventsData.success, true);
  assert.ok(eventsData.items.length >= 1);
  // Garante que os itens são sanitizados
  for (const item of eventsData.items) {
    assert.ok(item.eventType);
    assert.ok(item.riskScore);
  }

  // 3. Usuário não autenticado não consegue ler telemetria (retorna 403 Forbidden por requireAdminAuth)
  const unauthRes = await fetch(`${baseUrl}/api/admin/honeypot/events`);
  assert.equal(unauthRes.status, 403);

  // 4. POST /api/admin/honeypot/unblock
  const unblockRes = await fetch(`${baseUrl}/api/admin/honeypot/unblock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ip: '203.0.113.5' }),
  });
  assert.equal(unblockRes.status, 200);
  const unblockData = await unblockRes.json();
  assert.equal(unblockData.success, true);
});

test('8. Rotas legítimas da aplicação permanecem 100% inalteradas', async () => {
  // Health check permanece respondendo 200
  const healthRes = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthRes.status, 200);
  const healthData = await healthRes.json();
  assert.equal(healthData.status, 'healthy');

  // Login legítimo com senha real permanece funcionando normalmente
  const validLogin = await authService.login('admin@cbmerj.com', 'fixture-admin-password-2026');
  assert.equal(validLogin.success, true);
  assert.ok(validLogin.token);
});

test('9. Limpeza periódica de retenção de eventos (LGPD)', async () => {
  // Executa rotina de expiração com 30 dias de retenção
  const deletedCount = honeypotRepo.cleanupExpiredEvents(30);
  assert.equal(typeof deletedCount, 'number');
});
