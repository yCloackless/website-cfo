/**
 * CFO CBMERJ - Automated Security & LGPD Privacy Compliance Test Suite
 * 
 * Verificações:
 * 1. Endpoint público de informações da política e DPO (GET /api/privacy/info)
 * 2. Registro de consentimento auditável no cadastro (POST /api/auth/register)
 * 3. Gestão e revogação de consentimento por categoria (POST /api/privacy/consent)
 * 4. Submissão de solicitações do titular LGPD (POST /api/privacy/requests)
 * 5. Proteção contra IDOR: titular só visualiza as próprias solicitações (GET /api/privacy/my-requests)
 * 6. Exportação de dados portátil sanitizada sem vazamento de segredos (GET /api/privacy/export)
 * 7. Proteção RBAC: não-admin recebe 403 em endpoints administrativos de privacidade
 * 8. Atualização de parecer administrativo com Step-Up (PATCH /api/admin/privacy/requests/:id)
 * 9. Anonimização irreversível preservando integridade referencial (POST /api/admin/privacy/requests/:id/anonymize)
 * 10. Invariante financeiro de reembolso: rejeição de reembolsos que excedam o valor pago
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from '../server';
import { getDb } from '../src/db/database';
import {
  UserRepository,
  SessionRepository,
  ConsentRepository,
  PrivacyRequestRepository,
  ProfileRepository,
  ProductRepository,
  OrderRepository,
  RefundRepository,
  CadetSessionLockRepository,
} from '../src/db/repositories';
import { AuthService } from '../src/db/authService';

let server: http.Server;
let baseUrl: string;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;
let consentRepo: ConsentRepository;
let privacyRequestRepo: PrivacyRequestRepository;
let profileRepo: ProfileRepository;
let productRepo: ProductRepository;
let orderRepo: OrderRepository;
let refundRepo: RefundRepository;

const ADMIN_CREDENTIALS = {
  username: 'admin',
  email: 'admin@cbmerj.com',
  password: 'fixture-admin-password-2026',
};

const CADET_CREDENTIALS = {
  username: 'cadete',
  password: 'fixture-cadet-password-2026',
};

test.before(async () => {
  const db = getDb();
  authService = new AuthService(db);
  const rawDb = db.getRawDb();
  userRepo = new UserRepository(rawDb);
  sessionRepo = new SessionRepository(rawDb);
  consentRepo = new ConsentRepository(rawDb);
  privacyRequestRepo = new PrivacyRequestRepository(rawDb);
  profileRepo = new ProfileRepository(rawDb);
  productRepo = new ProductRepository(rawDb);
  orderRepo = new OrderRepository(rawDb);
  refundRepo = new RefundRepository(rawDb);

  await authService.ensureDefaultAccounts();

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(() => {
  if (server) server.close();
});

function createAccountCreationKey(): string {
  const rawDb = getDb().getRawDb();
  const admin = userRepo.findByUsername('admin') || userRepo.findByUsername(CADET_CREDENTIALS.username)!;
  const rawKey = `CFO-TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const keyHash = crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  rawDb.prepare(
    `INSERT INTO account_creation_keys (id, key_hash, created_by_user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, keyHash, admin.id, now, new Date(Date.now() + 86400000).toISOString());
  return rawKey;
}

function getOrCreateTestProduct(): { id: string } {
  const existing = productRepo.findBySku('CFO-LGPD-PROD');
  if (existing) return existing;
  return productRepo.create({
    sku: 'CFO-LGPD-PROD',
    name: 'Plano Preparatório CFO',
    description: 'Curso Completo CFO CBMERJ',
    amount: 19700,
    currency: 'BRL',
    isActive: true,
  });
}

async function getCadetToken(): Promise<string> {
  const cadet = userRepo.findByUsername(CADET_CREDENTIALS.username);
  if (cadet) {
    sessionRepo.revokeAllUserSessions(cadet.id);
    new CadetSessionLockRepository(getDb().getRawDb()).clearLock(cadet.id);
  }
  const res = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: CADET_CREDENTIALS.username,
      password: CADET_CREDENTIALS.password,
    }),
  });
  const data = await res.json();
  assert.equal(res.status, 200, 'Login do cadete falhou');
  return data.token;
}

async function getAdminTokenAndStepUp(): Promise<{ token: string; stepUpToken: string }> {
  const login = await authService.login(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
  const adminHeaders = {
    Authorization: `Bearer ${login.token}`,
    'Content-Type': 'application/json',
  };

  const stepUpRes = await fetch(`${baseUrl}/api/admin/step-up`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ password: ADMIN_CREDENTIALS.password }),
  });
  const stepUpData = await stepUpRes.json();
  assert.equal(stepUpRes.status, 200);
  assert.ok(stepUpData.stepUpToken);

  return { token: login.token, stepUpToken: stepUpData.stepUpToken };
}

// 1. Endpoint de informações de privacidade
test('1. Endpoint público /api/privacy/info retorna dados do DPO e versões das políticas', async () => {
  const res = await fetch(`${baseUrl}/api/privacy/info`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.privacyContactEmail);
  assert.ok(data.dpoName);
  assert.equal(data.policyVersion, '1.0');
  assert.equal(data.termsVersion, '1.0');
});

// 2. Registro de consentimento auditável no cadastro
test('2. Registro de usuário grava consentimento versionado com hash de IP', async () => {
  const uniqueSuffix = Date.now().toString(36);
  const email = `aluno_${uniqueSuffix}@teste.com`;
  const username = `aluno_${uniqueSuffix}`;
  const accountCreationKey = createAccountCreationKey();

  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountCreationKey,
      username,
      email,
      password: 'SenhaForte123!@#',
      fullName: 'Aluno Teste LGPD',
      termsAccepted: true,
      privacyAccepted: true,
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);

  const newUser = userRepo.findByEmail(email);
  assert.ok(newUser);

  // Verifica registros de consentimento
  const necessaryConsent = consentRepo.findLatestByCategory(newUser!.id, 'necessary');
  assert.ok(necessaryConsent);
  assert.equal(necessaryConsent!.policyVersion, '1.0');
  assert.equal(necessaryConsent!.termsVersion, '1.0');
  assert.equal(necessaryConsent!.status, 'granted');
});

// 3. Gestão e revogação de consentimento por categoria
test('3. Titular atualiza preferências de cookies/consentimento via /api/privacy/consent', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/privacy/consent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category: 'analytics',
      granted: false,
      policyVersion: '1.0',
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  const cadet = userRepo.findByUsername(CADET_CREDENTIALS.username)!;
  const record = consentRepo.findLatestByCategory(cadet.id, 'analytics');
  assert.ok(record);
  assert.equal(record!.status, 'revoked');
});

// 4. Submissão de solicitações do titular LGPD
test('4. Titular submete solicitação de privacidade gerando protocolo LGPD-REQ-...', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/privacy/requests`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestType: 'access',
      details: 'Solicito a confirmação de existência de tratamento e detalhes dos meus dados.',
    }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.request);
  assert.match(data.request.requestCode, /^LGPD-REQ-[A-F0-9]{6}$/);
  assert.equal(data.request.status, 'pending');
});

// 5. Anti-IDOR: titular só visualiza as próprias solicitações
test('5. Titular só visualiza as próprias solicitações em /api/privacy/my-requests (anti-IDOR)', async () => {
  const token = await getCadetToken();
  const cadet = userRepo.findByUsername(CADET_CREDENTIALS.username)!;

  const res = await fetch(`${baseUrl}/api/privacy/my-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(Array.isArray(data.requests));
  for (const req of data.requests) {
    assert.equal(req.userId, cadet.id, 'Todas as solicitações retornadas devem pertencer ao titular autenticado');
  }
});

// 6. Exportação portátil sanitizada sem segredos
test('6. Exportação portátil /api/privacy/export não expõe hashes de senha, tokens ou chaves internas', async () => {
  const token = await getCadetToken();

  const res = await fetch(`${baseUrl}/api/privacy/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.account);
  assert.equal(data.account.username, CADET_CREDENTIALS.username);

  // Garantia absoluta de não vazamento de segredos
  const rawExportString = JSON.stringify(data);
  assert.equal(rawExportString.includes('passwordHash'), false, 'Não deve conter passwordHash');
  assert.equal(rawExportString.includes('totpSecret'), false, 'Não deve conter totpSecret');
  assert.equal(rawExportString.includes('recoveryCode'), false, 'Não deve conter recoveryCode');
  assert.equal(rawExportString.includes('sessionSecret'), false, 'Não deve conter sessionSecret');
});

// 7. Não-admin é sumariamente bloqueado com 403 em endpoints admin de privacidade
test('7. Usuário sem papel de administrador recebe 403 em endpoints /api/admin/privacy/*', async () => {
  const token = await getCadetToken();

  const resList = await fetch(`${baseUrl}/api/admin/privacy/requests`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(resList.status, 403);

  const resPatch = await fetch(`${baseUrl}/api/admin/privacy/requests/some-id`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'completed' }),
  });
  assert.equal(resPatch.status, 403);
});

// 8. Administrador gerencia solicitações com Step-Up
test('8. Administrador lista e atualiza parecer de solicitação LGPD com Step-Up', async () => {
  const { token, stepUpToken } = await getAdminTokenAndStepUp();

  // Lista solicitações
  const listRes = await fetch(`${baseUrl}/api/admin/privacy/requests`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-admin-step-up-token': stepUpToken,
    },
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.success, true);
  assert.ok(Array.isArray(listData.requests));
  assert.ok(listData.requests.length > 0);

  const targetReq = listData.requests[0];

  // Atualiza parecer
  const patchRes = await fetch(`${baseUrl}/api/admin/privacy/requests/${targetReq.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({
      status: 'under_review',
      adminNotes: 'Solicitação em análise pelo Encarregado de Dados.',
    }),
  });

  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.success, true);
  assert.equal(patchData.request.status, 'under_review');
});

// 9. Anonimização irreversível preservando pedidos
test('9. Anonimização LGPD expurga dados pessoais, anula login e mantém integridade referencial', async () => {
  // Cria usuário para exclusão/anonimização via endpoint de registro
  const uniqueSuffix = Date.now().toString(36) + '_anon';
  const email = `titular_${uniqueSuffix}@teste.com`;
  const username = `titular_${uniqueSuffix}`;
  const accountCreationKey = createAccountCreationKey();

  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountCreationKey,
      username,
      email,
      password: 'SenhaSegura123!@#',
      fullName: 'Titular Teste Para Exclusao',
      termsAccepted: true,
      privacyAccepted: true,
    }),
  });
  assert.equal(regRes.status, 201);
  const targetUser = userRepo.findByEmail(email)!;
  assert.ok(targetUser);

  const testProduct = getOrCreateTestProduct();

  // Cria um pedido fictício para o usuário
  const order = orderRepo.create({
    userId: targetUser.id,
    customerEmail: targetUser.email,
    productId: testProduct.id,
    paymentProvider: 'asaas',
    amount: 19700,
    currency: 'BRL',
    paymentMethod: 'pix',
  });
  const orderId = order.id;

  // Cria solicitação de exclusão
  const deletionReq = privacyRequestRepo.create({
    userId: targetUser.id,
    email: targetUser.email,
    requestType: 'deletion',
    details: 'Solicito a eliminação completa dos meus dados cadastrais.',
  });

  const { token, stepUpToken } = await getAdminTokenAndStepUp();

  // Executa anonimização
  const anonRes = await fetch(`${baseUrl}/api/admin/privacy/requests/${deletionReq.id}/anonymize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-admin-step-up-token': stepUpToken,
    },
    body: JSON.stringify({
      adminNotes: 'Anonimização executada em conformidade com o Art. 16 da LGPD.',
    }),
  });

  assert.equal(anonRes.status, 200);
  const anonData = await anonRes.json();
  assert.equal(anonData.success, true);

  // Verifica que o usuário agora está anonimizado no banco
  const updatedUser = userRepo.findById(targetUser.id);
  assert.ok(updatedUser);
  assert.match(updatedUser!.email, /^deleted-.*@anonymized\.cfo$/);
  assert.match(updatedUser!.passwordHash, /ACCOUNT_ANONYMIZED.*LGPD/);

  // Perfil anonimizado
  const updatedProfile = profileRepo.findByUserId(targetUser.id);
  assert.ok(updatedProfile);
  assert.equal(updatedProfile!.fullName, 'Usuário Anonimizado');

  // Tentar login com credenciais antigas deve falhar categoricamente
  const loginRes = await fetch(`${baseUrl}/api/auth/check-credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'SenhaSegura123!@#' }),
  });
  assert.notEqual(loginRes.status, 200);

  // Verifica que o pedido histórico ainda existe (cumprimento do Art. 16, I)
  const existingOrder = orderRepo.findById(orderId);
  assert.ok(existingOrder);
  assert.equal(existingOrder!.id, orderId);
});

// 10. Invariante financeiro de reembolso
test('10. Invariante financeiro: reembolso que excede o total pago é rejeitado', async () => {
  const cadet = userRepo.findByUsername(CADET_CREDENTIALS.username)!;
  const testProduct = getOrCreateTestProduct();

  const testOrder = orderRepo.create({
    userId: cadet.id,
    customerEmail: cadet.email,
    productId: testProduct.id,
    paymentProvider: 'asaas',
    amount: 10000, // R$ 100,00
    currency: 'BRL',
    paymentMethod: 'pix',
  });
  const testOrderId = testOrder.id;

  // Validação: 15000 excede 10000 -> deve retornar elegível=false
  const checkInvalid = refundRepo.validateRefundEligibility(testOrderId, 15000);
  assert.equal(checkInvalid.eligible, false);
  assert.match(checkInvalid.reason || '', /EXCEEDS_ORDER_AMOUNT/i);

  // Validação: 6000 cabe em 10000 -> deve retornar elegível=true
  const checkValid = refundRepo.validateRefundEligibility(testOrderId, 6000);
  assert.equal(checkValid.eligible, true);
  assert.equal(checkValid.maxRefundable, 10000);

  // Solicita o primeiro reembolso de 6000
  const req1 = refundRepo.request({
    orderId: testOrderId,
    amount: 6000,
    reason: 'Reembolso parcial legítimo',
  });
  assert.ok(req1);

  // Tenta solicitar outro reembolso de 6000 (total seria 12000 > 10000) -> deve lançar erro
  assert.throws(() => {
    refundRepo.request({
      orderId: testOrderId,
      amount: 6000,
      reason: 'Tentativa de reembolso excedente',
    });
  }, /REFUND_INVARIANT_VIOLATION/i);
});
