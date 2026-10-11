process.env.NODE_ENV = 'test';

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseService } from '../src/db/database';
import { TemporarySourceBlockRepository, SystemIntegrationRepository } from '../src/db/repositories';

let testDbPath: string;
let dbService: DatabaseService;

beforeEach(() => {
  testDbPath = path.join(process.cwd(), 'data', `test_perf_cache_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`);
  dbService = new DatabaseService(testDbPath);
});

afterEach(() => {
  try {
    dbService.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch {}
});

test('Performance Cache & Security Invalidation Suite', async (t) => {
  await t.test('1. TemporarySourceBlockRepository: cache de IP e invalidação imediata em blockIp e unblockIp', () => {
    const db = dbService.getRawDb();
    const repo = new TemporarySourceBlockRepository(db);
    const testIp = '198.51.100.42';

    // 1.1 IP limpo inicialmente
    const initialCheck = repo.isIpBlocked(testIp);
    assert.equal(initialCheck.isBlocked, false);

    // 1.2 Bloqueia IP -> deve invalidar o cache imediatamente
    repo.blockIp(testIp, 'Tentativa de ataque de força bruta', 1);

    // 1.3 Deve refletir bloqueio imediatamente (sem esperar expiração de TTL)
    const blockedCheck = repo.isIpBlocked(testIp);
    assert.equal(blockedCheck.isBlocked, true);
    assert.ok(blockedCheck.block);
    assert.equal(blockedCheck.block?.reason, 'Tentativa de ataque de força bruta');

    // 1.4 Segunda leitura em cache deve retornar cópia idêntica
    const cachedBlockedCheck = repo.isIpBlocked(testIp);
    assert.equal(cachedBlockedCheck.isBlocked, true);
    assert.equal(cachedBlockedCheck.block?.id, blockedCheck.block?.id);

    // 1.5 Desbloqueio manual (unblockIp) -> invalidação imediata
    const unblocked = repo.unblockIp(testIp);
    assert.equal(unblocked, true);

    const postUnblockCheck = repo.isIpBlocked(testIp);
    assert.equal(postUnblockCheck.isBlocked, false, 'IP desbloqueado deve ser liberado imediatamente sem delay de cache');
  });

  await t.test('2. SystemIntegrationRepository: cache de maintenance_config e invalidação atômica em set e delete', () => {
    const db = dbService.getRawDb();
    const repo = new SystemIntegrationRepository(db);

    // 2.1 Leitura inicial vazia
    assert.equal(repo.get('maintenance_config'), null);

    // 2.2 Gravação ativa modo manutenção
    const configPayload = JSON.stringify({
      global: true,
      message: 'Manutenção programada',
      pages: {},
      updatedAt: new Date().toISOString(),
    });
    repo.set('maintenance_config', configPayload);

    // 2.3 Leitura imediata deve refletir payload gravado
    const read1 = repo.get('maintenance_config');
    assert.ok(read1);
    assert.equal(read1?.encryptedPayload, configPayload);

    // 2.4 Atualização (desativação do lockdown) deve invalidar na hora
    const updatedPayload = JSON.stringify({
      global: false,
      message: '',
      pages: {},
      updatedAt: new Date().toISOString(),
    });
    repo.set('maintenance_config', updatedPayload);

    const read2 = repo.get('maintenance_config');
    assert.ok(read2);
    assert.equal(read2?.encryptedPayload, updatedPayload, 'Alteração de lockdown deve invalidar o cache na hora');

    // 2.5 Delete deve invalidar
    repo.delete('maintenance_config');
    assert.equal(repo.get('maintenance_config'), null);
  });
});
