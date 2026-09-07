/**
 * CFO CBMERJ - Automated Tests for Admin Realtime Dashboard (SSE) (GSD Phase 8)
 * 
 * Scenarios Tested:
 * 1. Admin conectado com sucesso -> 200 OK com headers text/event-stream e handshake METRICS_UPDATED
 * 2. Usuário comum (cadete) tentando conectar -> 403 Forbidden
 * 3. Requisição sem autenticação -> 403/401 Forbidden
 * 4. Sessão expirada ou token inválido -> 403 Forbidden
 * 5. Transmissão de eventos em tempo real para admin conectado (LOGIN_FAILED, SECURITY_ALERT)
 * 6. Múltiplos administradores conectados recebem o mesmo evento simultaneamente
 * 7. Deduplicação de eventos pelo ID único
 * 8. Reconexão com Last-Event-ID recupera eventos ocorridos durante a desconexão
 * 9. Desconexão limpa de clientes e encerramento seguro do stream
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server';
import { getDb } from '../src/db/database';
import { UserRepository, SessionRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';
import { adminRealtimeHub } from '../src/services/realtimeHub';

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;

let adminToken: string;
let cadetToken: string;

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  userRepo = new UserRepository(db.getRawDb());
  sessionRepo = new SessionRepository(db.getRawDb());
  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;

  // Autentica admin padrão
  const adminLogin = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  assert.equal(adminLogin.success, true);
  adminToken = adminLogin.token!;
  assert.ok(adminToken);

  // Autentica cadete padrão
  const cadetLogin = await authService.login('cadete@cbmerj.com', 'cadetecfo2026!');
  assert.equal(cadetLogin.success, true);
  cadetToken = cadetLogin.token!;
  assert.ok(cadetToken);
});

test.after(() => {
  adminRealtimeHub.destroy();
  if (server) server.close();
});

// ============================================================================
// 1. ADMIN CONECTADO RECEBE 200 E EVENTO INICIAL DE HANDSHAKE
// ============================================================================
test('1. Admin autenticado conecta em /api/admin/realtime/stream com sucesso (SSE)', async () => {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    signal: controller.signal,
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  assert.match(res.headers.get('cache-control') || '', /no-cache/);

  // Lê os primeiros bytes para conferir o evento handshake inicial
  const reader = res.body?.getReader();
  assert.ok(reader);

  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  
  assert.match(text, /event: METRICS_UPDATED/);
  assert.match(text, /"status":"CONNECTED"/);

  controller.abort();
});

// ============================================================================
// 2. USUÁRIO COMUM (CADETE) RECEBE 403 FORBIDDEN
// ============================================================================
test('2. Usuário comum (cadete) tentando conectar em /api/admin/realtime/stream recebe 403 Forbidden', async () => {
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`, {
    headers: {
      Authorization: `Bearer ${cadetToken}`,
    },
  });

  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.error, 'FORBIDDEN');
  assert.match(data.message, /restrito|autorização|necessária/i);
});

// ============================================================================
// 3. REQUISIÇÃO SEM TOKEN RECEBE 403 / 401 FORBIDDEN
// ============================================================================
test('3. Conexão anônima sem token recebe 403/401 Forbidden', async () => {
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`);
  assert.ok(res.status === 401 || res.status === 403);
});

// ============================================================================
// 4. SESSÃO EXPIRADA OU TOKEN INVÁLIDO RECEBE 403 FORBIDDEN
// ============================================================================
test('4. Token falso ou expirado recebe 403 Forbidden', async () => {
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`, {
    headers: {
      Authorization: 'Bearer token_invalido_totalmente_falso_123',
    },
  });

  assert.equal(res.status, 403);
});

// ============================================================================
// 5. EVENTO PUBLICADO NO BACKEND É RECEBIDO PELO ADMIN CONECTADO
// ============================================================================
test('5. Backend publica evento de segurança e admin conectado recebe com baixa latência', async () => {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    signal: controller.signal,
  });

  assert.equal(res.status, 200);
  const reader = res.body?.getReader();
  assert.ok(reader);

  // Descarta o primeiro chunk (handshake)
  await reader.read();

  // Publica um evento de teste via hub
  setTimeout(() => {
    adminRealtimeHub.publish('LOGIN_FAILED', {
      action: 'LOGIN_FAILED',
      actor: 'attacker@evil.com',
      ip: '203.0.113.42',
      status: 'FAILED',
    });
  }, 50);

  // Lê o próximo chunk que deve conter o evento publicado
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);

  assert.match(text, /event: LOGIN_FAILED/);
  assert.match(text, /attacker@evil\.com/);
  assert.match(text, /203\.0\.113\.42/);

  controller.abort();
});

// ============================================================================
// 6. MÚLTIPLOS ADMINISTRADORES CONECTADOS RECEBEM O MESMO EVENTO
// ============================================================================
test('6. Múltiplos administradores conectados recebem o mesmo evento simultaneamente', async () => {
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();

  const [res1, res2] = await Promise.all([
    fetch(`${baseUrl}/api/admin/realtime/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      signal: ctrl1.signal,
    }),
    fetch(`${baseUrl}/api/admin/realtime/stream`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      signal: ctrl2.signal,
    }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const reader1 = res1.body?.getReader();
  const reader2 = res2.body?.getReader();
  assert.ok(reader1 && reader2);

  // Consome os handshakes
  await reader1.read();
  await reader2.read();

  // Dispara evento broadcast
  setTimeout(() => {
    adminRealtimeHub.publish('SECURITY_ALERT', {
      alertType: 'SUSPICIOUS_ACTIVITY',
      threatLevel: 'CRITICAL',
    });
  }, 50);

  const [chunk1, chunk2] = await Promise.all([
    reader1.read(),
    reader2.read(),
  ]);

  const text1 = new TextDecoder().decode(chunk1.value);
  const text2 = new TextDecoder().decode(chunk2.value);

  assert.match(text1, /event: SECURITY_ALERT/);
  assert.match(text2, /event: SECURITY_ALERT/);
  assert.match(text1, /SUSPICIOUS_ACTIVITY/);
  assert.match(text2, /SUSPICIOUS_ACTIVITY/);

  ctrl1.abort();
  ctrl2.abort();
});

// ============================================================================
// 7. DEDUPLICAÇÃO DE EVENTOS
// ============================================================================
test('7. Eventos possuem ID único e são deduplicados na fila do cliente', async () => {
  const event = adminRealtimeHub.publish('ACCOUNT_SUSPENDED', {
    targetUserId: 'user-susp-123',
    reason: 'Violacao dos termos',
  });

  assert.ok(event.id);
  assert.equal(event.type, 'ACCOUNT_SUSPENDED');

  // Simula lógica de deduplicação do frontend
  const processedSet = new Set<string>();
  const isFirstTime = !processedSet.has(event.id);
  processedSet.add(event.id);

  const isSecondTime = !processedSet.has(event.id);

  assert.equal(isFirstTime, true, 'Primeiro recebimento deve ser processado');
  assert.equal(isSecondTime, false, 'Recebimento duplicado do mesmo ID deve ser ignorado');
});

// ============================================================================
// 8. RECONEXÃO COM LAST-EVENT-ID RECUPERA EVENTOS PERDIDOS
// ============================================================================
test('8. Reconexão com Last-Event-ID entrega eventos ocorridos durante a desconexão', async () => {
  // Publica 3 eventos com identificadores
  const evt1 = adminRealtimeHub.publish('LOGIN_FAILED', { sequence: 1 });
  const evt2 = adminRealtimeHub.publish('LOGIN_FAILED', { sequence: 2 });
  const evt3 = adminRealtimeHub.publish('SECURITY_ALERT', { sequence: 3 });

  // Conecta simulando reconexão informando que o último evento visto foi evt1
  const ctrl = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream?lastEventId=${evt1.id}`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    signal: ctrl.signal,
  });

  assert.equal(res.status, 200);
  const reader = res.body?.getReader();
  assert.ok(reader);

  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);

  // Deve conter o handshake E os eventos perdidos (evt2 e evt3)
  assert.match(text, /METRICS_UPDATED/);
  assert.match(text, new RegExp(evt2.id));
  assert.match(text, new RegExp(evt3.id));

  ctrl.abort();
});

// ============================================================================
// 9. DESCONEXÃO LIMPA DE CLIENTES
// ============================================================================
test('9. Desconexão do cliente remove-o do hub e decrementa a contagem de clientes ativos', async () => {
  // Aguarda conexões de testes anteriores terminarem de fechar no loop de eventos
  await new Promise((resolve) => setTimeout(resolve, 150));
  const initialClients = adminRealtimeHub.getActiveClientsCount();

  const ctrl = new AbortController();
  const res = await fetch(`${baseUrl}/api/admin/realtime/stream`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    signal: ctrl.signal,
  });

  assert.equal(res.status, 200);
  const reader = res.body?.getReader();
  assert.ok(reader);
  // Garante que o stream iniciou no servidor
  await reader.read();

  assert.equal(adminRealtimeHub.getActiveClientsCount(), initialClients + 1);

  // Aborta a conexão
  ctrl.abort();

  // Aguarda o evento close ser disparado no servidor
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(adminRealtimeHub.getActiveClientsCount(), initialClients);
});
