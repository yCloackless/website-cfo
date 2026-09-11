process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../src/db/database';
import { SystemIntegrationRepository } from '../src/db/repositories';

test('Maintenance Mode Persistence and Configuration Suite', async (t) => {
  const db = getDb();
  const rawDb = db.getRawDb();
  const repo = new SystemIntegrationRepository(rawDb);

  await t.test('1. Repositório persiste e recupera configuração de modo de manutenção', () => {
    const config = {
      global: false,
      pages: {
        examBank: true,
        simulations: true,
      },
      message: 'Estamos atualizando o acervo com as provas mais recentes.',
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
    };

    repo.set('maintenance_config', JSON.stringify(config));

    const row = repo.get('maintenance_config');
    assert.ok(row, 'A configuração deve ser gravada no banco.');

    const parsed = JSON.parse(row.encryptedPayload);
    assert.equal(parsed.global, false);
    assert.equal(parsed.pages.examBank, true);
    assert.equal(parsed.pages.simulations, true);
    assert.equal(parsed.pages.table, undefined);
    assert.equal(parsed.message, 'Estamos atualizando o acervo com as provas mais recentes.');
  });

  await t.test('2. Ativação de Modo Global bloqueia todas as páginas', () => {
    const config = {
      global: true,
      pages: {},
      message: 'Sistema em manutenção programada para atualização do servidor.',
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
    };

    repo.set('maintenance_config', JSON.stringify(config));

    const row = repo.get('maintenance_config');
    assert.ok(row);
    const parsed = JSON.parse(row.encryptedPayload);
    assert.equal(parsed.global, true);
  });

  await t.test('3. Atualização individual desativa manutenção preservando o estado', () => {
    const config = {
      global: false,
      pages: {
        examBank: false,
        simulations: false,
      },
      message: '',
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin',
    };

    repo.set('maintenance_config', JSON.stringify(config));

    const row = repo.get('maintenance_config');
    assert.ok(row);
    const parsed = JSON.parse(row.encryptedPayload);
    assert.equal(parsed.global, false);
    assert.equal(parsed.pages.examBank, false);
  });
});
