import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { DatabaseService } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import { TemporarySourceBlockRepository, UserRepository } from '../src/db/repositories';

let testDbPath: string;
let dbService: DatabaseService;
let authService: AuthService;
let userRepo: UserRepository;
let sourceBlocks: TemporarySourceBlockRepository;

beforeEach(async () => {
  testDbPath = path.join(process.cwd(), 'data', `test_cadet_alerts_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
  dbService = new DatabaseService(testDbPath);
  authService = new AuthService(dbService);
  const db = dbService.getRawDb();
  userRepo = new UserRepository(db);
  sourceBlocks = new TemporarySourceBlockRepository(db);
  const passwordHash = await bcrypt.hash('SenhaCadete123!', 10);
  userRepo.create({ email: 'cadete.test@cbmerj.com', username: 'cadete_test', passwordHash, role: 'cadet', status: 'active' });
  userRepo.create({ email: 'admin.test@cbmerj.com', username: 'admin_test', passwordHash, role: 'admin', status: 'active' });
});

afterEach(() => {
  try { dbService.close(); if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch {}
});

test('source block needs three blocked cadet replacement attempts in fifteen minutes', async () => {
  const first = await authService.login('cadete_test', 'SenhaCadete123!', { ip: '192.168.1.50', userAgent: 'AuthorizedBrowser' });
  assert.equal(first.success, true);
  const suspectIp = '10.200.0.99';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await authService.login('cadete_test', 'SenhaCadete123!', { ip: suspectIp, userAgent: 'OtherBrowser' });
    assert.equal(result.success, false);
    assert.equal(result.code, 'CADET_SESSION_LOCKED');
    assert.equal(sourceBlocks.isIpBlocked(suspectIp).isBlocked, attempt === 3);
  }

  const blocked = await authService.login('cadete_test', 'SenhaCadete123!', { ip: suspectIp, userAgent: 'OtherBrowser' });
  assert.equal(blocked.success, false);
  assert.equal(blocked.code, 'SOURCE_IP_BLOCKED');
  const record = sourceBlocks.isIpBlocked(suspectIp).block;
  assert.ok(record);
  assert.equal(record?.reason, 'CADET_REPEATED_CONCURRENT_SESSION_ATTEMPTS');
  assert.ok(Date.parse(record!.lockedUntil) > Date.now() + 4 * 60 * 60 * 1000);
});

test('one blocked attempt creates a persistent unread security notification', async () => {
  const first = await authService.login('cadete_test', 'SenhaCadete123!', { ip: '192.168.1.10' });
  assert.equal(first.success, true);
  const blocked = await authService.login('cadete_test', 'SenhaCadete123!', { ip: '172.16.0.44' });
  assert.equal(blocked.code, 'CADET_SESSION_LOCKED');

  const notifications = authService.getNotifications({ filter: 'SECURITY' });
  assert.equal(notifications.unreadCount, 1);
  assert.equal(notifications.items.length, 1);
  assert.equal(notifications.items[0].type, 'CADET_SECURITY_ALERT');
  assert.equal(notifications.items[0].isRead, false);
  assert.equal(authService.markNotificationAsRead(notifications.items[0].id).success, true);
  assert.equal(authService.getNotifications({ filter: 'UNREAD' }).unreadCount, 0);
});

test('admin is not affected by a cadet-source block', async () => {
  const first = await authService.login('cadete_test', 'SenhaCadete123!', { ip: '192.168.1.1' });
  assert.equal(first.success, true);
  const suspectIp = '192.168.99.99';
  await authService.login('cadete_test', 'SenhaCadete123!', { ip: suspectIp });
  await authService.login('cadete_test', 'SenhaCadete123!', { ip: suspectIp });
  await authService.login('cadete_test', 'SenhaCadete123!', { ip: suspectIp });
  assert.equal(sourceBlocks.isIpBlocked(suspectIp).isBlocked, true);

  const adminLogin = await authService.login('admin_test', 'SenhaCadete123!', { ip: suspectIp });
  assert.equal(adminLogin.success, true);
});
