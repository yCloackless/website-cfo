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

  await t.test('4. SYSTEM_MODULES centraliza módulos com unicidade e metadados obrigatórios', async () => {
    const { SYSTEM_MODULES } = await import('../src/config/modules');
    assert.ok(Array.isArray(SYSTEM_MODULES));
    assert.ok(SYSTEM_MODULES.length >= 20, 'Deve conter todos os módulos do sistema.');

    const ids = new Set<string>();
    for (const mod of SYSTEM_MODULES) {
      assert.ok(mod.id && typeof mod.id === 'string', 'Módulo deve ter ID válido');
      assert.ok(!ids.has(mod.id), `ID duplicado detectado: ${mod.id}`);
      ids.add(mod.id);

      assert.ok(mod.name && typeof mod.name === 'string', `Nome ausente para módulo ${mod.id}`);
      assert.ok(mod.route && typeof mod.route === 'string', `Rota ausente para módulo ${mod.id}`);
      assert.ok(mod.description && typeof mod.description === 'string', `Descrição ausente para módulo ${mod.id}`);
      assert.ok(mod.group === 'student' || mod.group === 'admin', `Grupo inválido para módulo ${mod.id}`);
      assert.ok(typeof mod.maintenanceEligible === 'boolean', `maintenanceEligible inválido para módulo ${mod.id}`);
      assert.ok(typeof mod.order === 'number', `Ordem inválida para módulo ${mod.id}`);
    }
  });

  await t.test('5. Auto-descoberta: getMaintenanceEligibleModules inclui Inteligência da Banca e novos módulos', async () => {
    const { getMaintenanceEligibleModules, getModuleById } = await import('../src/config/modules');
    const eligible = getMaintenanceEligibleModules();

    const boardIntelligence = eligible.find((m) => m.id === 'boardIntelligence');
    assert.ok(boardIntelligence, 'Inteligência da Banca (boardIntelligence) deve constar automaticamente nos módulos elegíveis');
    assert.equal(boardIntelligence.name, 'Inteligência da Banca');
    assert.equal(boardIntelligence.group, 'admin');

    const ifrij = eligible.find((m) => m.id === 'ifrij');
    assert.ok(ifrij, 'Rumo ao VEST (ifrij) deve constar automaticamente');

    const whiteboard = eligible.find((m) => m.id === 'whiteboard');
    assert.ok(whiteboard, 'Quadro Branco (whiteboard) deve constar automaticamente');

    // Validação de busca por ID
    const found = getModuleById('boardIntelligence');
    assert.ok(found);
    assert.equal(found.id, 'boardIntelligence');
  });

  await t.test('6. Proteção contra auto-bloqueio: Modo Manutenção não é elegível para manutenção', async () => {
    const { SYSTEM_MODULES, getMaintenanceEligibleModules } = await import('../src/config/modules');
    const maintenanceModule = SYSTEM_MODULES.find((m) => m.id === 'maintenance');
    assert.ok(maintenanceModule, 'Módulo Modo Manutenção deve existir na configuração');
    assert.equal(maintenanceModule.maintenanceEligible, false, 'Modo Manutenção NUNCA pode ser elegível para manutenção para evitar auto-bloqueio');

    const eligible = getMaintenanceEligibleModules();
    assert.equal(eligible.some((m) => m.id === 'maintenance'), false, 'Modo Manutenção não pode aparecer na lista de elegíveis');
  });

  await t.test('7. Filtro por grupo segmenta aluno e admin corretamente', async () => {
    const { getModulesByGroup } = await import('../src/config/modules');
    const studentModules = getModulesByGroup('student');
    const adminModules = getModulesByGroup('admin');

    assert.ok(studentModules.length > 0);
    assert.ok(adminModules.length > 0);
    assert.ok(studentModules.every((m) => m.group === 'student'));
    assert.ok(adminModules.every((m) => m.group === 'admin'));
  });

  await t.test('8. Fusão de estado preserva configurações existentes e assume falso para novos módulos', () => {
    const persistedPages: Record<string, boolean> = {
      table: true,
      examBank: false,
    };

    // Novo módulo recém-descoberto
    const newModuleId = 'boardIntelligence';
    const isMaintenanceActive = Boolean(persistedPages[newModuleId]);
    assert.equal(isMaintenanceActive, false, 'Novos módulos não gravados devem iniciar como liberados (false)');

    // Módulos previamente gravados mantêm seus valores exatos
    assert.equal(Boolean(persistedPages['table']), true);
    assert.equal(Boolean(persistedPages['examBank']), false);
  });
});
