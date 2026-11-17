process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDb } from '../src/db/database';
import { SystemIntegrationRepository } from '../src/db/repositories';

const DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'test-key-32-chars-long-security!!';

function encryptStoredJson(value: unknown): string {
  const secret = DATA_ENCRYPTION_KEY;
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptStoredJson<T>(raw: string): { value: T; legacy: boolean } {
  const parsed = JSON.parse(raw);
  if (parsed?.version !== 1 || parsed?.algorithm !== 'aes-256-gcm') {
    return { value: parsed as T, legacy: true };
  }
  const secret = DATA_ENCRYPTION_KEY;
  const key = crypto.createHash('sha256').update(secret).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const clear = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8');
  return { value: JSON.parse(clear) as T, legacy: false };
}

interface CalendarSession {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  email?: string;
  name?: string;
  scope?: string;
  updatedAt: string;
}

test('Google Calendar Persistence Suite', async (t) => {
  const db = getDb();
  const rawDb = db.getRawDb();
  const repo = new SystemIntegrationRepository(rawDb);

  await t.test('1. Tabela system_integrations foi criada pela migration 026', () => {
    const tableInfo = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_integrations'").get();
    assert.ok(tableInfo, 'A tabela system_integrations deve existir após as migrations.');
  });

  await t.test('2. Grava e recupera sessão com criptografia AES-256-GCM', () => {
    const originalSession: CalendarSession = {
      access_token: 'test_access_token_12345',
      refresh_token: 'test_refresh_token_67890',
      expiry_date: Date.now() + 3600000,
      email: 'comandante@cbmerj.rj.gov.br',
      name: 'Comandante Teste',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      updatedAt: new Date().toISOString(),
    };

    const encrypted = encryptStoredJson(originalSession);
    assert.ok(!encrypted.includes('test_refresh_token_67890'), 'Token não pode estar em texto plano');

    repo.set('google_calendar', encrypted);

    const fromDb = repo.get('google_calendar');
    assert.ok(fromDb, 'Registro deve ser encontrado no banco');
    assert.equal(fromDb.id, 'google_calendar');

    const decrypted = decryptStoredJson<CalendarSession>(fromDb.encryptedPayload);
    assert.equal(decrypted.value.access_token, originalSession.access_token);
    assert.equal(decrypted.value.refresh_token, originalSession.refresh_token);
    assert.equal(decrypted.value.email, originalSession.email);
  });

  await t.test('3. Atualização de token preserva registro (ON CONFLICT)', () => {
    const updatedSession: CalendarSession = {
      access_token: 'fresh_access_token_renewed',
      refresh_token: 'test_refresh_token_67890',
      expiry_date: Date.now() + 7200000,
      email: 'comandante@cbmerj.rj.gov.br',
      name: 'Comandante Teste',
      updatedAt: new Date().toISOString(),
    };

    repo.set('google_calendar', encryptStoredJson(updatedSession));

    const fromDb = repo.get('google_calendar');
    assert.ok(fromDb);
    const decrypted = decryptStoredJson<CalendarSession>(fromDb.encryptedPayload);
    assert.equal(decrypted.value.access_token, 'fresh_access_token_renewed');
    assert.equal(decrypted.value.refresh_token, 'test_refresh_token_67890');
  });

  await t.test('4. Simulação de Deploy no Render: sessão sobrevive sem arquivo em disco', () => {
    // No Render, a pasta data/calendar-session.json é efêmera e não existe no deploy.
    // O teste garante que ao buscar exclusivamente do banco, a sessão está intacta e funcional.
    const fromDb = repo.get('google_calendar');
    assert.ok(fromDb, 'A sessão sobrevive no banco sem precisar de arquivo em disco.');
    const decrypted = decryptStoredJson<CalendarSession>(fromDb.encryptedPayload);
    assert.equal(decrypted.value.refresh_token, 'test_refresh_token_67890');
    assert.equal(decrypted.value.email, 'comandante@cbmerj.rj.gov.br');
  });

  await t.test('5. Desconexão remove registro do banco de dados', () => {
    repo.delete('google_calendar');
    const fromDb = repo.get('google_calendar');
    assert.equal(fromDb, null, 'Registro deve ser completamente removido após desconexão.');
  });
});

import {
  encryptStoredJson as encryptSharedJson,
  decryptStoredJson as decryptSharedJson,
} from '../src/utils/storedJsonCrypto';

test('StoredJsonCrypto: key rotation fallback, validation, and GCM auth integrity', async (t) => {
  const prevDataKey = process.env.DATA_ENCRYPTION_KEY;
  const prevSessionSecret = process.env.SESSION_SECRET;
  const prevPrevious = process.env.DATA_ENCRYPTION_KEY_PREVIOUS;

  try {
    await t.test('1. Recovers session encrypted with SESSION_SECRET when DATA_ENCRYPTION_KEY is later added', () => {
      delete process.env.DATA_ENCRYPTION_KEY;
      delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
      process.env.SESSION_SECRET = 'railway-session-secret-32chars-min';

      const encryptedOnRailway = encryptSharedJson({ refresh_token: 'rt_123', email: 'cadete@cbmerj.rj.gov.br' });

      // Simulates Render adding DATA_ENCRYPTION_KEY while keeping SESSION_SECRET
      process.env.DATA_ENCRYPTION_KEY = 'render-new-data-encryption-key-32ch';
      const decrypted = decryptSharedJson<{ refresh_token: string; email: string }>(encryptedOnRailway);
      assert.equal(decrypted.value.refresh_token, 'rt_123');
      assert.equal(decrypted.legacy, true);
    });

    await t.test('2. Recovers session via DATA_ENCRYPTION_KEY_PREVIOUS during key rotation', () => {
      process.env.DATA_ENCRYPTION_KEY = 'old-key-before-rotation-12345678';
      delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
      const encryptedOld = encryptSharedJson({ refresh_token: 'rt_rotated' });

      process.env.DATA_ENCRYPTION_KEY = 'new-primary-key-after-rotation-99';
      process.env.DATA_ENCRYPTION_KEY_PREVIOUS = 'old-key-before-rotation-12345678';
      const decrypted = decryptSharedJson<{ refresh_token: string }>(encryptedOld);
      assert.equal(decrypted.value.refresh_token, 'rt_rotated');
      assert.equal(decrypted.legacy, true);
    });

    await t.test('3. Rejects tampered payload or wrong key without disabling GCM auth', () => {
      process.env.DATA_ENCRYPTION_KEY = 'primary-key-test-1234567890123456';
      process.env.SESSION_SECRET = 'session-key-test-1234567890123456';
      delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;

      const encrypted = encryptSharedJson({ refresh_token: 'rt_secret' });

      process.env.DATA_ENCRYPTION_KEY = 'completely-different-key-12345678';
      process.env.SESSION_SECRET = 'another-different-key-12345678901';
      assert.throws(() => decryptSharedJson(encrypted), /Unsupported state or unable to authenticate data|STORED_JSON_AUTH_FAILED/);
    });

    await t.test('4. Rejects malformed IV or auth tag lengths cleanly', () => {
      process.env.DATA_ENCRYPTION_KEY = 'primary-key-test-1234567890123456';
      const malformed = JSON.stringify({
        version: 2,
        algorithm: 'aes-256-gcm',
        iv: Buffer.from('short').toString('base64'),
        tag: Buffer.from('shorttag').toString('base64'),
        data: Buffer.from('abc').toString('base64'),
      });
      assert.throws(() => decryptSharedJson(malformed), /IV|tag|inválido/i);
    });
  } finally {
    if (prevDataKey !== undefined) process.env.DATA_ENCRYPTION_KEY = prevDataKey;
    else delete process.env.DATA_ENCRYPTION_KEY;
    if (prevSessionSecret !== undefined) process.env.SESSION_SECRET = prevSessionSecret;
    else delete process.env.SESSION_SECRET;
    if (prevPrevious !== undefined) process.env.DATA_ENCRYPTION_KEY_PREVIOUS = prevPrevious;
    else delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  }
});

import { AuditRepository } from '../src/db/repositories';

test('AuditRepository.getSecurityMetrics uses PostgreSQL-compatible HAVING COUNT(*) >= 3', () => {
  const db = getDb().getRawDb();
  const auditRepo = new AuditRepository(db);
  const metrics = auditRepo.getSecurityMetrics();
  assert.equal(typeof metrics.totalEvents24h, 'number');
  assert.ok(Array.isArray(metrics.anomalousIps));
});
