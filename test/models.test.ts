/**
 * CFO CBMERJ - Automated Test Suite for Data Foundation & Models (GSD Phase 2)
 * Tests models, unique constraints, foreign keys, activation token consumption,
 * entitlement validation and refund invariants.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseService } from '../src/db/database';
import {
  UserRepository,
  ProfileRepository,
  ProductRepository,
  OrderRepository,
  PaymentRepository,
  ActivationTokenRepository,
  EntitlementRepository,
  RefundRepository,
  AuditRepository,
  StudySessionRepository,
} from '../src/db/repositories';

function createTempDb(): { dbService: DatabaseService; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-db-test-'));
  const dbFile = path.join(tempDir, 'test.sqlite');
  const dbService = new DatabaseService(dbFile);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, cleanup };
}

test('1. Invariantes de USER e PROFILE (Unicidade de email e username, Cascade FK)', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const profileRepo = new ProfileRepository(db);

  // Criação bem-sucedida de usuário
  const user1 = userRepo.create({
    email: 'cadete.teste@cbmerj.com',
    username: 'cadete123',
    passwordHash: '$2b$10$abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    role: 'cadet',
  });

  assert.equal(user1.email, 'cadete.teste@cbmerj.com');
  assert.equal(user1.username, 'cadete123');
  assert.equal(user1.role, 'cadet');
  assert.equal(user1.status, 'active');

  // Tentativa de duplicar email (deve falhar por constraint UNIQUE)
  assert.throws(() => {
    userRepo.create({
      email: 'CADETE.TESTE@CBMERJ.COM', // Teste case-insensitive
      username: 'cadete_outro',
      passwordHash: 'hash',
    });
  }, /UNIQUE constraint failed/);

  // Tentativa de duplicar username (deve falhar por constraint UNIQUE)
  assert.throws(() => {
    userRepo.create({
      email: 'outro@cbmerj.com',
      username: 'CADETE123',
      passwordHash: 'hash',
    });
  }, /UNIQUE constraint failed/);

  // Criação de perfil vinculado
  const profile = profileRepo.createOrUpdate({
    userId: user1.id,
    fullName: 'Cadete Silva',
    phone: '21999999999',
    targetExam: 'CFO CBMERJ 2026',
  });

  assert.equal(profile.userId, user1.id);
  assert.equal(profile.fullName, 'Cadete Silva');

  // FK Constraint: não pode criar perfil para userId inexistente
  assert.throws(() => {
    profileRepo.createOrUpdate({
      userId: 'uuid-inexistente',
      fullName: 'Invasor',
    });
  }, /FOREIGN KEY constraint failed/);

  cleanup();
});

test('2. Invariantes de PRODUCT e ORDER (Preço server-side e unicidade de identificadores)', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const productRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);

  const product = productRepo.create({
    sku: 'CFO-COMPLETO-2026',
    name: 'Cronograma Tático CFO CBMERJ 2026',
    description: 'Acesso completo ao cronograma, bizus e simulados',
    amount: 19700, // R$ 197,00 em centavos
    currency: 'BRL',
  });

  assert.equal(product.amount, 19700);

  // Tentativa de duplicar SKU do produto
  assert.throws(() => {
    productRepo.create({
      sku: 'CFO-COMPLETO-2026',
      name: 'Duplicado',
      description: '...',
      amount: 19700,
    });
  }, /UNIQUE constraint failed/);

  // Criação de pedido com preço consultado do produto server-side
  const order = orderRepo.create({
    customerEmail: 'aluno@gmail.com',
    productId: product.id,
    amount: product.amount, // Server determina o valor real
    paymentProvider: 'mercadopago',
    paymentMethod: 'pix',
  });

  assert.equal(order.status, 'pending');
  assert.ok(order.publicOrderId.startsWith('CFO-ORD-'));
  assert.equal(order.amount, 19700);

  // Pagamento confirmado pelo gateway
  const paidOrder = orderRepo.markAsPaid(order.id, 'MP_PAY_987654321', 'pix');
  assert.equal(paidOrder.status, 'paid');
  assert.equal(paidOrder.externalPaymentId, 'MP_PAY_987654321');
  assert.ok(paidOrder.paidAt);

  // Tentativa de pedido com externalPaymentId duplicado deve falhar
  const order2 = orderRepo.create({
    customerEmail: 'outro@gmail.com',
    productId: product.id,
    amount: product.amount,
    paymentProvider: 'mercadopago',
  });

  assert.throws(() => {
    orderRepo.markAsPaid(order2.id, 'MP_PAY_987654321');
  }, /UNIQUE constraint failed/);

  cleanup();
});

test('3. Invariantes de ACTIVATION_TOKEN (Uso único, expiração e impossibilidade de reutilização)', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const productRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);
  const tokenRepo = new ActivationTokenRepository(db);

  const product = productRepo.create({
    sku: 'PLANO-CFO',
    name: 'Plano CFO',
    description: 'Desc',
    amount: 15000,
  });

  const order = orderRepo.create({
    customerEmail: 'comprador@gmail.com',
    productId: product.id,
    amount: product.amount,
    paymentProvider: 'mercadopago',
  });

  // Gera token de ativação associado ao pedido pago
  const { rawToken, record } = tokenRepo.createToken(order.id, 'comprador@gmail.com', 48);
  assert.equal(record.isUsed, false);
  assert.notEqual(record.tokenHash, rawToken); // Armazenamento seguro de hash

  // Criar o usuário para ativação
  const newUser = userRepo.create({
    email: 'comprador@gmail.com',
    username: 'oficial_comprador',
    passwordHash: 'hash_seguro',
  });

  // 1º consumo do token (deve ter sucesso)
  const firstConsume = tokenRepo.consumeToken(rawToken, newUser.id);
  assert.equal(firstConsume, true);

  // 2º consumo do MESMO token (deve falhar e ser rejeitado)
  const secondConsume = tokenRepo.consumeToken(rawToken, newUser.id);
  assert.equal(secondConsume, false);

  // Token inexistente (deve falhar)
  const fakeConsume = tokenRepo.consumeToken('token_falso_123', newUser.id);
  assert.equal(fakeConsume, false);

  cleanup();
});

test('4. Invariantes de ENTITLEMENTS (Controle rigoroso de liberação e revogação de acesso)', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const productRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);
  const entitlementRepo = new EntitlementRepository(db);

  const user = userRepo.create({
    email: 'estudante@cbmerj.com',
    username: 'estudante',
    passwordHash: 'hash',
  });

  const product = productRepo.create({
    sku: 'CURSO-CFO',
    name: 'Curso CFO',
    description: 'Desc',
    amount: 10000,
  });

  const order = orderRepo.create({
    customerEmail: user.email,
    productId: product.id,
    amount: product.amount,
    paymentProvider: 'manual',
    userId: user.id,
  });

  // Antes da concessão: sem acesso
  assert.equal(entitlementRepo.hasActiveAccess(user.id, product.id), false);

  // Concessão de acesso
  entitlementRepo.grant({
    userId: user.id,
    orderId: order.id,
    productId: product.id,
  });

  // Após concessão: acesso ativo
  assert.equal(entitlementRepo.hasActiveAccess(user.id, product.id), true);

  // Não permite duplo entitlement ativo duplicado para mesmo usuário e produto
  assert.throws(() => {
    entitlementRepo.grant({
      userId: user.id,
      orderId: order.id,
      productId: product.id,
    });
  }, /UNIQUE constraint failed/);

  // Revogação de acesso (ex: estorno ou cancelamento)
  entitlementRepo.revoke(user.id, product.id);
  assert.equal(entitlementRepo.hasActiveAccess(user.id, product.id), false);

  cleanup();
});

test('5. Invariantes de REFUND_REQUEST e AUDIT_EVENT', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const productRepo = new ProductRepository(db);
  const orderRepo = new OrderRepository(db);
  const refundRepo = new RefundRepository(db);
  const auditRepo = new AuditRepository(db);

  const admin = userRepo.create({
    email: 'admin.financeiro@cbmerj.com',
    username: 'admin_fin',
    passwordHash: 'hash',
    role: 'admin',
  });

  const product = productRepo.create({
    sku: 'SIMULADOS-VIP',
    name: 'Simulados VIP',
    description: 'Desc',
    amount: 5000,
  });

  const order = orderRepo.create({
    customerEmail: 'cliente@gmail.com',
    productId: product.id,
    amount: product.amount,
    paymentProvider: 'mercadopago',
  });

  // Cliente solicita reembolso
  const refund = refundRepo.request({
    orderId: order.id,
    reason: 'Arrependimento dentro de 7 dias',
    amount: 5000,
  });

  assert.equal(refund.status, 'requested');
  assert.equal(refund.amount, 5000);

  // Admin analisa e aprova
  refundRepo.updateReviewStatus(
    refund.id,
    'approved_by_admin',
    admin.id,
    'Aprovado conforme CDC Art. 49'
  );

  const reviewed = refundRepo.findById(refund.id)!;
  assert.equal(reviewed.status, 'approved_by_admin');
  assert.equal(reviewed.reviewedByAdminId, admin.id);

  // Auditoria do evento
  const audit = auditRepo.log({
    action: 'REFUND_APPROVED',
    actor: admin.username,
    resource: `/refund_requests/${refund.id}`,
    status: 'SUCCESS',
    ip: '127.0.0.1',
    details: { orderId: order.id, amount: 5000 },
  });

  assert.equal(audit.status, 'SUCCESS');
  assert.equal(audit.actor, 'admin_fin');

  cleanup();
});

test('6. Invariantes de STUDY_SESSIONS (Persistência do Cronômetro e Resumo Diário para Heatmap Azul)', () => {
  const { dbService, cleanup } = createTempDb();
  const db = dbService.getRawDb();
  const userRepo = new UserRepository(db);
  const sessionRepo = new StudySessionRepository(db);

  const cadet = userRepo.create({
    email: 'cadete.cronometro@cbmerj.com',
    username: 'cadete_cronometro',
    passwordHash: 'hash',
    role: 'cadet',
  });

  // Grava sessões no mesmo dia e em dias distintos
  const s1 = sessionRepo.create({
    userId: cadet.id,
    subjectId: 'quimica',
    subjectName: 'Química',
    topic: 'Estequiometria',
    dateStr: '2026-09-09',
    durationSeconds: 3600, // 1h
    endedAt: '2026-09-09T10:00:00.000Z',
    notes: 'Sessão 1',
  });

  const s2 = sessionRepo.create({
    userId: cadet.id,
    subjectId: 'fisica',
    subjectName: 'Física',
    topic: 'Termologia',
    dateStr: '2026-09-09',
    durationSeconds: 5400, // 1.5h
    endedAt: '2026-09-09T14:00:00.000Z',
    notes: 'Sessão 2',
  });

  const s3 = sessionRepo.create({
    userId: cadet.id,
    subjectId: 'matematica',
    subjectName: 'Matemática',
    dateStr: '2026-09-10',
    durationSeconds: 7200, // 2h
    endedAt: '2026-09-10T16:00:00.000Z',
  });

  assert.ok(s1.id.startsWith('session_'));
  assert.equal(s1.durationSeconds, 3600);

  // Consulta por dia
  const day9Sessions = sessionRepo.getSessionsByDate(cadet.id, '2026-09-09');
  assert.equal(day9Sessions.length, 2);

  // Consulta resumo mensal
  const summary = sessionRepo.getDailySummaryByMonth(cadet.id, '2026-09');
  assert.ok(summary['2026-09-09']);
  assert.equal(summary['2026-09-09'].totalSeconds, 9000); // 3600 + 5400
  assert.equal(summary['2026-09-09'].totalHours, 2.5);
  assert.equal(summary['2026-09-09'].sessionsCount, 2);
  assert.equal(summary['2026-09-09'].subjects.length, 2);

  assert.ok(summary['2026-09-10']);
  assert.equal(summary['2026-09-10'].totalHours, 2.0);

  // Totais do mês
  const totals = sessionRepo.getMonthlyTotal(cadet.id, '2026-09');
  assert.equal(totals.totalSeconds, 16200); // 9000 + 7200
  assert.equal(totals.totalHours, 4.5);
  assert.equal(totals.totalSessions, 3);

  cleanup();
});

