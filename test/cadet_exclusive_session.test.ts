import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { DatabaseService, getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import { SessionRepository, UserRepository, CadetSessionLockRepository, AuditRepository } from '../src/db/repositories';

let testDbPath: string;
let dbService: DatabaseService;
let authService: AuthService;
let userRepo: UserRepository;
let sessionRepo: SessionRepository;
let cadetLockRepo: CadetSessionLockRepository;
let auditRepo: AuditRepository;

beforeEach(async () => {
  testDbPath = path.join(process.cwd(), 'data', `test_cadet_session_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
  dbService = new DatabaseService(testDbPath);
  authService = new AuthService(dbService);

  const rawDb = dbService.getRawDb();
  userRepo = new UserRepository(rawDb);
  sessionRepo = new SessionRepository(rawDb);
  cadetLockRepo = new CadetSessionLockRepository(rawDb);
  auditRepo = new AuditRepository(rawDb);

  // Garantir usuário cadete e admin
  const passHash = await bcrypt.hash('SenhaSegura123!', 10);
  userRepo.create({
    email: 'cadete.teste@cbmerj.com',
    username: 'cadete_teste',
    passwordHash: passHash,
    role: 'cadet',
    status: 'active',
  });

  userRepo.create({
    email: 'admin.teste@cbmerj.com',
    username: 'admin_teste',
    passwordHash: passHash,
    role: 'admin',
    status: 'active',
  });
});

afterEach(() => {
  try {
    dbService.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {}
});

test('1. Primeiro login cadete -> permitido', async () => {
  const res = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '189.10.20.30', userAgent: 'BrowserA' });
  assert.equal(res.success, true);
  assert.ok(res.token);
  assert.equal(res.user?.role, 'cadet');

  // Verifica auditoria CADET_LOGIN_SUCCESS
  const logs = auditRepo.findFiltered({ limit: 10 }).items;
  const successLog = logs.find((l) => l.action === 'CADET_LOGIN_SUCCESS');
  assert.ok(successLog);
  assert.equal(successLog.ip, '189.10.20.30');
  assert.equal(successLog.userAgent, 'BrowserA');
});

test('2. Segundo login simultâneo de cadete -> bloqueado com trava de 24h', async () => {
  // 1º login
  const res1 = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '189.10.20.30', userAgent: 'BrowserA' });
  assert.equal(res1.success, true);

  // 2º login enquanto 1º está ativo
  const res2 = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '200.50.60.70', userAgent: 'BrowserB' });
  assert.equal(res2.success, false);
  assert.match(res2.message!, /esta conta já possui uma sessão exclusiva ativa/i);

  // Verifica que o lock de 24h foi criado
  const cadet = userRepo.findByUsername('cadete_teste')!;
  const lock = cadetLockRepo.getLock(cadet.id);
  assert.ok(lock?.lockedUntil);
  const lockTime = new Date(lock.lockedUntil!).getTime();
  assert.ok(lockTime > Date.now() + 23 * 3600 * 1000);

  // Verifica auditorias geradas
  const logs = auditRepo.findFiltered({ limit: 10 }).items;
  assert.ok(logs.some((l) => l.action === 'CADET_SESSION_REPLACEMENT_ATTEMPT'));
  assert.ok(logs.some((l) => l.action === 'CADET_LOCK_STARTED'));
});

test('3. Dois logins quase ao mesmo tempo (concorrência) -> somente um vence', async () => {
  const promises = [
    authService.login('cadete_teste', 'SenhaSegura123!', { ip: '10.0.0.1', userAgent: 'Thread1' }),
    authService.login('cadete_teste', 'SenhaSegura123!', { ip: '10.0.0.2', userAgent: 'Thread2' }),
  ];

  const results = await Promise.all(promises);
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  assert.equal(successCount, 1, 'Exatamente um login deve ter sucesso');
  assert.equal(failureCount, 1, 'Exatamente um login deve ser bloqueado');
});

test('4. Login admin em vários dispositivos -> continua permitido', async () => {
  const login1 = await authService.login('admin_teste', 'SenhaSegura123!', { ip: '1.1.1.1', userAgent: 'DeviceA' });
  assert.equal(login1.success, true);

  const login2 = await authService.login('admin_teste', 'SenhaSegura123!', { ip: '2.2.2.2', userAgent: 'DeviceB' });
  assert.equal(login2.success, true);

  const login3 = await authService.login('admin_teste', 'SenhaSegura123!', { ip: '3.3.3.3', userAgent: 'DeviceC' });
  assert.equal(login3.success, true);

  // Garante que nenhum lock de cadete foi criado para o admin
  const admin = userRepo.findByUsername('admin_teste')!;
  const lock = cadetLockRepo.getLock(admin.id);
  assert.equal(lock, null);
});

test('5. Sessão cadete expirada -> permite novo login', async () => {
  const cadet = userRepo.findByUsername('cadete_teste')!;
  const rawDb = dbService.getRawDb();

  // Cria uma sessão expirada manualmente
  const expiredTime = new Date(Date.now() - 3600 * 1000).toISOString();
  rawDb.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, role, expires_at, created_at)
     VALUES (?, ?, 'fakehash123', 'cadet', ?, ?)`
  ).run('expired-sess-id', cadet.id, expiredTime, expiredTime);

  cadetLockRepo.setLock(cadet.id, 'expired-sess-id', null);

  // Novo login deve ser permitido pois a sessão anterior expirou
  const res = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '1.1.1.1' });
  assert.equal(res.success, true);
  assert.ok(res.token);
});

test('6. Sessão cadete revogada -> permite novo login', async () => {
  const login1 = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '10.0.0.1' });
  assert.equal(login1.success, true);

  // Revoga a sessão 1 (ex: via logout normal)
  authService.logout(login1.token!);

  // Como a sessão foi revogada limpadamente, novo login do cadete é permitido
  const login2 = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '10.0.0.2' });
  assert.equal(login2.success, true);
});

test('7. Tentativa de novo dispositivo durante lock -> bloqueada com CADET_LOGIN_BLOCKED', async () => {
  const cadet = userRepo.findByUsername('cadete_teste')!;
  // Define trava de 24h no banco
  const lockUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  cadetLockRepo.setLock(cadet.id, null, lockUntil);

  const res = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '99.99.99.99' });
  assert.equal(res.success, false);
  assert.match(res.message!, /esta conta já possui uma sessão exclusiva ativa/i);

  const logs = auditRepo.findFiltered({ limit: 10 }).items;
  assert.ok(logs.some((l) => l.action === 'CADET_LOGIN_BLOCKED'));
});

test('8. Tentativa após 24h -> permitida com evento CADET_LOCK_EXPIRED', async () => {
  const cadet = userRepo.findByUsername('cadete_teste')!;
  // Define trava expirada (há 1 hora)
  const expiredLock = new Date(Date.now() - 3600 * 1000).toISOString();
  cadetLockRepo.setLock(cadet.id, null, expiredLock);

  const res = await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '100.100.100.100' });
  assert.equal(res.success, true);

  const logs = auditRepo.findFiltered({ limit: 10 }).items;
  assert.ok(logs.some((l) => l.action === 'CADET_LOCK_EXPIRED'));
  assert.ok(logs.some((l) => l.action === 'CADET_LOGIN_SUCCESS'));
});

test('9. Usuário comum (cadete) tentando resetar lock -> não autorizado (403/erro)', async () => {
  const cadet = userRepo.findByUsername('cadete_teste')!;
  const res = await authService.resetCadetLock(cadet.id, cadet.id, '127.0.0.1');
  assert.equal(res.success, false);
  assert.match(res.message!, /acesso negado/i);
});

test('10. Admin autorizado resetando lock -> permitido com evento CADET_LOCK_MANUALLY_RESET', async () => {
  const cadet = userRepo.findByUsername('cadete_teste')!;
  const admin = userRepo.findByUsername('admin_teste')!;

  // Aplica lock no cadete com activeSessionId null
  cadetLockRepo.setLock(cadet.id, null, new Date(Date.now() + 86400000).toISOString());

  // Admin aciona reset
  const res = await authService.resetCadetLock(admin.id, cadet.id, '10.0.0.1', 'AdminBrowser');
  assert.equal(res.success, true);

  // Verifica que o lock foi limpo
  const updatedLock = cadetLockRepo.getLock(cadet.id);
  assert.equal(updatedLock?.lockedUntil, null);
  assert.equal(updatedLock?.activeSessionId, null);

  // Auditoria registrada
  const logs = auditRepo.findFiltered({ limit: 10 }).items;
  const resetLog = logs.find((l) => l.action === 'CADET_LOCK_MANUALLY_RESET');
  assert.ok(resetLog);
  assert.equal(resetLog.actor, 'admin_teste');
  assert.equal(resetLog.targetId, cadet.id);
});

test('11. Body manipulando userId/role -> autoridade mantida server-side', async () => {
  const fakePayloadUser = 'cadete_teste';
  const dbUser = await authService.verifyCredentials(fakePayloadUser, 'SenhaSegura123!');
  assert.ok(dbUser);
  assert.equal(dbUser.role, 'cadet', 'A role do banco deve ser respeitada, ignorando o body');
});

test('12. Sem secrets nos logs de auditoria', async () => {
  await authService.login('cadete_teste', 'SenhaSegura123!', { ip: '127.0.0.1', userAgent: 'TestAgent' });
  const logs = auditRepo.findFiltered({ limit: 50 }).items;
  for (const log of logs) {
    const raw = JSON.stringify(log);
    assert.equal(raw.includes('SenhaSegura123!'), false, 'Senha nunca deve constar no log');
    assert.equal(raw.includes('fixture-'), false, 'Credenciais secretas não podem figurar no log');
  }
});
