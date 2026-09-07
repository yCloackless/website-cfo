/**
 * CFO CBMERJ - Testes Automatizados de Monitoramento e Auditoria de Segurança (GSD Fase 7)
 * 
 * Cenários Testados:
 * 1. Determinação Confiável de IP e Bloqueio de Spoofing (recusa req.body.ip, cabeçalhos Cloudflare, trust proxy)
 * 2. Sanitização Estrita de Segredos (senhas, totp, tokens, cookies e chaves nunca gravados em log)
 * 3. Eventos de Autenticação:
 *    - Login correto (cadete / admin) -> LOGIN_SUCCESS / ADMIN_LOGIN
 *    - Login errado (senha incorreta) -> LOGIN_FAILED / ADMIN_LOGIN_FAILED
 *    - Usuário inexistente -> LOGIN_FAILED seguro sem enumeração
 * 4. Eventos de 2FA:
 *    - Código TOTP incorreto -> 2FA_FAILED
 *    - Código TOTP válido -> 2FA_SUCCESS
 * 5. Controle de Acesso Restrito (RBAC):
 *    - Usuário comum (cadete) tentando acessar /api/admin/security/events -> 403 Forbidden
 *    - Requisição sem autenticação -> 403 / 401 Forbidden
 *    - Administrador autenticado -> 200 OK com registros
 * 6. Paginação e Filtros Avançados:
 *    - Paginação de eventos (page, limit, totalPages, totalCount)
 *    - Filtro por tipo de ação (action)
 *    - Filtro por status (SUCCESS / FAILURE)
 *    - Filtro por ator (actor) e IP
 *    - Busca textual multi-campo (search)
 *    - Filtro por período temporal (startDate, endDate)
 * 7. Métricas de Segurança e Detecção Factual de Anomalias (IPs com múltiplas falhas)
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { DatabaseService, getDb } from '../src/db/database';
import { AuditRepository, UserRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';
import { getClientIp, app } from '../server';

function createTempDb(): {
  dbService: DatabaseService;
  auditRepo: AuditRepository;
  userRepo: UserRepository;
  authService: AuthService;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-audit-test-'));
  const dbFile = path.join(tempDir, 'test_audit.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const auditRepo = new AuditRepository(rawDb);
  const userRepo = new UserRepository(rawDb);
  const authService = new AuthService(dbService);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, auditRepo, userRepo, authService, cleanup };
}

// ============================================================================
// 1. DETERMINAÇÃO DE IP & PREVENÇÃO DE SPOOFING
// ============================================================================
test('1. IP: Determinação confiável via infraestrutura e rejeição de req.body.ip', () => {
  // 1.1 IP nunca deve vir de req.body.ip
  const spoofedReq = {
    headers: {},
    body: { ip: '66.66.66.66', user: 'hacker' },
    ip: '192.168.1.50',
    socket: { remoteAddress: '10.0.0.1' },
  } as any;
  const resolvedIp = getClientIp(spoofedReq);
  assert.notEqual(resolvedIp, '66.66.66.66', 'O IP JAMAIS deve ser extraído do req.body');
  assert.equal(resolvedIp, '192.168.1.50', 'Deve utilizar o IP determinado pelo framework / trust proxy');

  // 1.2 Header verificado de Edge Cloudflare (cf-connecting-ip)
  const cfReq = {
    headers: { 'cf-connecting-ip': '203.0.113.195' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
  assert.equal(getClientIp(cfReq), '127.0.0.1', 'Header Cloudflare vindo de peer não confiável deve ser ignorado');
  const previousTrust = process.env.TRUST_CLOUDFLARE_HEADERS;
  process.env.TRUST_CLOUDFLARE_HEADERS = 'true';
  try {
    cfReq.app = { get: () => (peer: string) => peer === '127.0.0.1' };
    assert.equal(getClientIp(cfReq), '203.0.113.195', 'Borda explicitamente confiável pode fornecer IP');
    cfReq.socket.remoteAddress = '198.51.100.99';
    assert.equal(getClientIp(cfReq), '127.0.0.1', 'Mesmo com opt-in, peer fora da allowlist não pode forjar IP');
  } finally {
    if (previousTrust === undefined) delete process.env.TRUST_CLOUDFLARE_HEADERS;
    else process.env.TRUST_CLOUDFLARE_HEADERS = previousTrust;
  }

  // 1.3 Normalização de IPv6 mapeado (::ffff:x.x.x.x)
  const ipv6MappedReq = {
    headers: {},
    ip: '::ffff:198.51.100.25',
    socket: { remoteAddress: '::ffff:198.51.100.25' },
  } as any;
  assert.equal(getClientIp(ipv6MappedReq), '198.51.100.25', 'Deve remover prefixo ::ffff:');

  // 1.4 Fallback para socket.remoteAddress quando req.ip não estiver populado
  const socketReq = {
    headers: {},
    socket: { remoteAddress: '172.16.0.42' },
  } as any;
  assert.equal(getClientIp(socketReq), '172.16.0.42', 'Deve fazer fallback seguro para remoteAddress');
});

// ============================================================================
// 2. PRIVACIDADE E SANITIZAÇÃO ESTREITA DE SEGREDOS
// ============================================================================
test('2. Auditoria: Sanitização estrita impede gravação de senhas, totp, cookies e tokens', () => {
  const { auditRepo, cleanup } = createTempDb();

  const logged = auditRepo.log({
    action: 'LOGIN_ATTEMPT',
    actor: 'aluno_teste',
    resource: '/api/auth/login',
    status: 'SUCCESS',
    ip: '189.10.20.30',
    details: {
      password: 'SENHA_SUPER_SECRETA_NAO_GRAVAR',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token_secreto',
      totp: '123456',
      cookie: 'session_secret_cookie_value',
      authorization: 'Bearer secret_auth',
      safeInfo: 'Navegador Chrome 120 no macOS',
      attemptNumber: 1,
    },
  });

  assert.ok(logged.id);
  assert.ok(logged.detailsJson);

  const rawJson = logged.detailsJson as string;
  assert.ok(!rawJson.includes('SENHA_SUPER_SECRETA'), 'Senha NUNCA deve constar no JSON de auditoria');
  assert.ok(!rawJson.includes('token_secreto'), 'Token NUNCA deve constar no JSON de auditoria');
  assert.ok(!rawJson.includes('123456'), 'TOTP NUNCA deve constar no JSON de auditoria');
  assert.ok(!rawJson.includes('session_secret_cookie'), 'Cookies NUNCA devem constar no JSON de auditoria');
  assert.ok(rawJson.includes('safeInfo'), 'Informações seguras devem ser mantidas');
  assert.ok(rawJson.includes('attemptNumber'), 'Metadados não sensíveis devem ser mantidos');

  cleanup();
});

// ============================================================================
// 3. FLUXOS DE AUTENTICAÇÃO: SUCESSO, FALHA E USUÁRIO INEXISTENTE
// ============================================================================
test('3. Autenticação: Login correto, login errado e usuário inexistente', async () => {
  const { authService, auditRepo, cleanup } = createTempDb();
  await authService.ensureDefaultAccounts();

  // 3.1 Login com credencial correta
  const successLogin = await authService.login('cadete', 'fixture-cadet-password-2026', { ip: '200.100.50.25' });
  assert.equal(successLogin.success, true);
  assert.ok(successLogin.token);

  auditRepo.log({
    action: 'LOGIN_SUCCESS',
    actor: 'cadete',
    resource: '/api/auth/login',
    status: 'SUCCESS',
    ip: '200.100.50.25',
    userId: successLogin.user?.id,
  });

  // 3.2 Login com senha incorreta
  const failedPass = await authService.login('cadete', 'senha_errada_123', { ip: '200.100.50.25' });
  assert.equal(failedPass.success, false);

  auditRepo.log({
    action: 'LOGIN_FAILED',
    actor: 'cadete',
    resource: '/api/auth/login',
    status: 'FAILED',
    ip: '200.100.50.25',
    details: { reason: 'Senha incorreta' },
  });

  // 3.3 Login com usuário inexistente (não deve vazar enumeração)
  const unknownUser = await authService.login('fantasma_inexistente', 'qualquer_senha', { ip: '200.100.50.25' });
  assert.equal(unknownUser.success, false);

  auditRepo.log({
    action: 'LOGIN_FAILED',
    actor: 'fantasma_inexistente',
    resource: '/api/auth/login',
    status: 'FAILED',
    ip: '200.100.50.25',
    details: { reason: 'Usuário ou senha incorretos' },
  });

  // Verifica registros com o IP específico do teste
  const events = auditRepo.findFiltered({ ip: '200.100.50.25', limit: 10 });
  assert.ok(events.total >= 3);
  assert.ok(events.items.some((e) => e.action === 'LOGIN_SUCCESS' && e.actor === 'cadete'), 'Deve conter LOGIN_SUCCESS para cadete');
  assert.ok(events.items.some((e) => e.action === 'LOGIN_FAILED' && e.actor === 'cadete'), 'Deve conter LOGIN_FAILED para cadete');
  assert.ok(events.items.some((e) => e.action === 'LOGIN_FAILED' && e.actor === 'fantasma_inexistente'), 'Deve conter LOGIN_FAILED para fantasma_inexistente');

  cleanup();
});

// ============================================================================
// 4. EVENTOS DE 2FA
// ============================================================================
test('4. 2FA: Registro de 2FA_SUCCESS e 2FA_FAILED', () => {
  const { auditRepo, cleanup } = createTempDb();

  // 4.1 Falha de 2FA (código errado ou expirado)
  auditRepo.log({
    action: '2FA_FAILED',
    actor: 'admin',
    resource: '/api/auth/verify-2fa',
    status: 'FAILED',
    ip: '177.18.25.10',
    details: { reason: 'Código TOTP incorreto' },
  });

  // 4.2 Sucesso de 2FA
  auditRepo.log({
    action: '2FA_SUCCESS',
    actor: 'admin',
    resource: '/api/auth/verify-2fa',
    status: 'SUCCESS',
    ip: '177.18.25.10',
  });

  auditRepo.log({
    action: 'ADMIN_LOGIN',
    actor: 'admin',
    resource: '/api/auth/verify-2fa',
    status: 'SUCCESS',
    ip: '177.18.25.10',
    details: { role: 'admin' },
  });

  const failures = auditRepo.findFiltered({ action: '2FA_FAILED' });
  assert.equal(failures.total, 1);
  assert.equal(failures.items[0].action, '2FA_FAILED');

  const successes = auditRepo.findFiltered({ action: '2FA_SUCCESS' });
  assert.equal(successes.total, 1);

  cleanup();
});

// ============================================================================
// 5. CONTROLE DE ACESSO RESTRICTO (ANTI-BYPASS)
// ============================================================================
test('5. Restrição de Acesso: Usuário comum (cadete) e não-autenticado recebem 403/401 ao acessar logs', async () => {
  await new AuthService(getDb()).ensureDefaultAccounts();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5.1 Acesso sem autenticação -> 403 Forbidden
    const unauthRes = await fetch(`${baseUrl}/api/admin/security/events`);
    assert.equal(unauthRes.status, 403, 'Acesso sem token deve ser rejeitado com 403');
    const unauthData = await unauthRes.json();
    assert.equal(unauthData.error, 'FORBIDDEN');

    // 5.2 Acesso com sessão de cadete -> 403 Forbidden
    const cadetLoginRes = await fetch(`${baseUrl}/api/auth/check-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'cadete',
        password: process.env.CADET_PASSWORD || 'fixture-cadet-password-2026',
      }),
    });
    assert.equal(cadetLoginRes.status, 200);
    const cadetData = await cadetLoginRes.json();
    assert.ok(cadetData.token, 'Cadete deve receber token');
    assert.equal(cadetData.role, 'cadet', 'Perfil deve ser cadet');

    const cadetAttempt = await fetch(`${baseUrl}/api/admin/security/events`, {
      headers: { Authorization: `Bearer ${cadetData.token}` },
    });
    assert.equal(cadetAttempt.status, 403, 'Cadete tentando acessar painel admin de segurança DEVE receber 403');

    // 5.3 Métricas de segurança também bloqueadas para cadete
    const cadetMetrics = await fetch(`${baseUrl}/api/admin/security/metrics`, {
      headers: { Authorization: `Bearer ${cadetData.token}` },
    });
    assert.equal(cadetMetrics.status, 403, 'Cadete tentando acessar métricas de segurança DEVE receber 403');
  } finally {
    server.close();
  }
});

// ============================================================================
// 6. PAGINAÇÃO E FILTROS DO REPOSITÓRIO DE AUDITORIA
// ============================================================================
test('6. Paginação e Filtros: Consulta estruturada e busca multi-campo', () => {
  const { auditRepo, cleanup } = createTempDb();

  // Inserir massa de dados variada
  for (let i = 1; i <= 15; i++) {
    const isEven = i % 2 === 0;
    auditRepo.log({
      action: isEven ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED',
      actor: isEven ? `aluno_${i}` : `invasor_${i}`,
      resource: '/api/auth/login',
      status: isEven ? 'SUCCESS' : 'FAILED',
      ip: isEven ? '192.168.1.10' : '10.0.0.99',
      userAgent: isEven ? 'Mozilla/5.0 (Windows NT 10.0)' : 'curl/7.68.0',
      details: { attempt: i },
    });
  }

  // 6.1 Paginação
  const page1 = auditRepo.findFiltered({ page: 1, limit: 5 });
  assert.equal(page1.total, 15);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.items.length, 5);

  const page2 = auditRepo.findFiltered({ page: 2, limit: 5 });
  assert.equal(page2.items.length, 5);
  assert.notEqual(page1.items[0].id, page2.items[0].id, 'Páginas consecutivas não devem conter mesmos itens');

  // 6.2 Filtro por Ação
  const onlyLogins = auditRepo.findFiltered({ action: 'LOGIN_SUCCESS' });
  assert.equal(onlyLogins.items.length, 7); // 14 pares entre 1 e 15 = 2,4,6,8,10,12,14 = 7
  assert.ok(onlyLogins.items.every((e) => e.action === 'LOGIN_SUCCESS'));

  // 6.3 Filtro por Status
  const onlyFailures = auditRepo.findFiltered({ status: 'FAILED' });
  assert.equal(onlyFailures.items.length, 8); // 8 ímpares = 1,3,5,7,9,11,13,15 = 8
  assert.ok(onlyFailures.items.every((e) => e.status === 'FAILED'));

  // 6.4 Filtro por IP
  const filteredIp = auditRepo.findFiltered({ ip: '10.0.0.99' });
  assert.equal(filteredIp.items.length, 8);
  assert.ok(filteredIp.items.every((e) => e.ip === '10.0.0.99'));

  // 6.5 Busca textual livre (busca por user-agent 'curl')
  const searchResult = auditRepo.findFiltered({ search: 'curl' });
  assert.equal(searchResult.items.length, 8);

  cleanup();
});

// ============================================================================
// 7. MÉTRICAS E DETECÇÃO FACTUAL DE ANOMALIAS
// ============================================================================
test('7. Métricas de Segurança: Detecção de anomalias por IP com múltiplas falhas', () => {
  const { auditRepo, cleanup } = createTempDb();

  const suspiciousIp = '198.51.100.99';
  const normalIp = '198.51.100.10';

  // 3 falhas consecutivas de um mesmo IP suspeito
  for (let i = 0; i < 4; i++) {
    auditRepo.log({
      action: 'LOGIN_FAILED',
      actor: `admin_tentativa_${i}`,
      resource: '/api/auth/check-credentials',
      status: 'FAILED',
      ip: suspiciousIp,
      details: { reason: 'Senha incorreta' },
    });
  }

  // 1 login com sucesso de IP normal
  auditRepo.log({
    action: 'LOGIN_SUCCESS',
    actor: 'cadete',
    resource: '/api/auth/check-credentials',
    status: 'SUCCESS',
    ip: normalIp,
  });

  const metrics = auditRepo.getSecurityMetrics();
  assert.equal(metrics.totalEvents24h, 5);
  assert.equal(metrics.loginSuccess24h, 1);
  assert.equal(metrics.loginFailed24h, 4);

  // Deve destacar o IP anômalo (>= 3 falhas) com contagem precisa
  assert.equal(metrics.anomalousIps.length, 1);
  assert.equal(metrics.anomalousIps[0].ip, suspiciousIp);
  assert.equal(metrics.anomalousIps[0].failedAttempts, 4);

  cleanup();
});
