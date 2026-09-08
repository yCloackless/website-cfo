import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../src/db/database';
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
  testDbPath = path.join(process.cwd(), 'data', `test_cadet_audit_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
  dbService = new DatabaseService(testDbPath);
  authService = new AuthService(dbService);

  const rawDb = dbService.getRawDb();
  userRepo = new UserRepository(rawDb);
  sessionRepo = new SessionRepository(rawDb);
  cadetLockRepo = new CadetSessionLockRepository(rawDb);
  auditRepo = new AuditRepository(rawDb);

  const passHash = await bcrypt.hash('SenhaCadete123!', 10);
  userRepo.create({
    email: 'cadete.audit@cbmerj.com',
    username: 'cadete_audit',
    passwordHash: passHash,
    role: 'cadet',
    status: 'active',
  });

  userRepo.create({
    email: 'admin.audit@cbmerj.com',
    username: 'admin_audit',
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

test('AUDIT 1: Persistência do lock após reinício do backend (nova instância do DB)', async () => {
  const cadet = userRepo.findByUsername('cadete_audit')!;
  const lockUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  cadetLockRepo.setLock(cadet.id, null, lockUntil);

  // Simula restart do backend criando novo DatabaseService no mesmo arquivo
  const newDbService = new DatabaseService(testDbPath);
  const newAuthService = new AuthService(newDbService);

  const res = await newAuthService.login('cadete_audit', 'SenhaCadete123!', { ip: '10.10.10.10' });
  assert.equal(res.success, false);
  assert.match(res.message!, /período de segurança/i);

  newDbService.close();
});

test('AUDIT 2: Logout normal durante lock de 24h NÃO deve permitir bypass da trava', async () => {
  // 1. Cadete realiza login 1
  const login1 = await authService.login('cadete_audit', 'SenhaCadete123!', { ip: '1.1.1.1' });
  assert.equal(login1.success, true);

  // 2. Tentativa 2 a partir de outro dispositivo ativa o lock de 24h
  const login2 = await authService.login('cadete_audit', 'SenhaCadete123!', { ip: '2.2.2.2' });
  assert.equal(login2.success, false);

  // 3. Cadete faz logout da sessão 1
  authService.logout(login1.token!);

  // 4. Tentativa de login após logout deve PERMANECER bloqueada devido ao lock de 24h ativado na substituição
  const login3 = await authService.login('cadete_audit', 'SenhaCadete123!', { ip: '3.3.3.3' });
  assert.equal(login3.success, false);
  assert.match(login3.message!, /período de segurança/i);
});

test('AUDIT 3: Forjamento de headers e body para bypass de role/userId é bloqueado', async () => {
  const cadet = userRepo.findByUsername('cadete_audit')!;

  // Tenta chamar o reset se passando por cadete
  const res = await authService.resetCadetLock(cadet.id, cadet.id);
  assert.equal(res.success, false);
  assert.match(res.message!, /acesso negado/i);
});

test('AUDIT 4: Resposta de bloqueio não expõe IP, sessionId ou dados sensíveis de terceiros', async () => {
  await authService.login('cadete_audit', 'SenhaCadete123!', { ip: '192.168.1.100', userAgent: 'VictimDevice' });

  const res = await authService.login('cadete_audit', 'SenhaCadete123!', { ip: '10.0.0.50', userAgent: 'AttackerDevice' });
  assert.equal(res.success, false);
  const msg = res.message || '';

  assert.equal(msg.includes('192.168.1.100'), false, 'Nenhum IP deve vazar na mensagem');
  assert.equal(msg.includes('VictimDevice'), false, 'Nenhum user agent deve vazar na mensagem');
  assert.equal(msg.includes('session'), false, 'ID interno de sessão não deve figurar na mensagem');
});

test('AUDIT 5: Admin realiza múltiplos logins concorrentes em vários navegadores sem nenhum bloqueio', async () => {
  const adminLogins = await Promise.all([
    authService.login('admin_audit', 'SenhaCadete123!', { ip: '1.1.1.1', userAgent: 'Browser1' }),
    authService.login('admin_audit', 'SenhaCadete123!', { ip: '2.2.2.2', userAgent: 'Browser2' }),
    authService.login('admin_audit', 'SenhaCadete123!', { ip: '3.3.3.3', userAgent: 'Browser3' }),
  ]);

  for (const l of adminLogins) {
    assert.equal(l.success, true);
    assert.ok(l.token);
  }

  const admin = userRepo.findByUsername('admin_audit')!;
  const lock = cadetLockRepo.getLock(admin.id);
  assert.equal(lock, null, 'Conta admin nunca deve registrar lock');
});
