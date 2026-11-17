import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { GamificationService } from '../src/services/gamificationService';

function createTempEnv() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-gamification-'));
  const dbService = new DatabaseService(path.join(tempDir, 'test.sqlite'));
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const user = userRepo.create({
    email: 'cadete_gamif@cbmerj.com',
    username: 'cadetegamif',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
    role: 'cadet',
  });

  const insertSession = (dateStr: string, durationSeconds: number, suffix = '1') => {
    rawDb.prepare(`
      INSERT INTO study_sessions (
        id, user_id, subject_id, subject_name, topic, date_str, duration_seconds, started_at, ended_at, notes, created_at
      ) VALUES (?, ?, 'mat', 'Matemática', NULL, ?, ?, ?, ?, NULL, ?)
    `).run(
      `sess_${dateStr}_${suffix}`,
      user.id,
      dateStr,
      durationSeconds,
      `${dateStr}T10:00:00.000Z`,
      `${dateStr}T12:00:00.000Z`,
      `${dateStr}T12:00:00.000Z`
    );
  };

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, rawDb, user, insertSession, cleanup };
}

test('1. Backfill calcula ofensiva histórica sem gerar modal retroativo e exige >= 30 min/dia', () => {
  const { rawDb, user, insertSession, cleanup } = createTempEnv();
  try {
    // Dia 2026-11-12 teve só 15 min (não conta); 13..16 tiveram 1h cada
    insertSession('2026-11-12', 900);
    insertSession('2026-11-13', 3600);
    insertSession('2026-11-14', 3600);
    insertSession('2026-11-15', 3600);
    insertSession('2026-11-16', 3600);

    const svc = new GamificationService(rawDb);
    const status = svc.getStatus(user.id, '2026-11-17');

    assert.equal(status.currentStreakDays, 4);
    assert.equal(status.iceShields, 1);
    assert.equal(status.pendingShieldEvent, null);
    assert.equal(status.rank.id, 'soldado');
    assert.ok(status.nextRank);
  } finally {
    cleanup();
  }
});

test('2. Falhar um dia consome 1 escudo automático, salva ofensiva com evento e zera só se não houver escudos', () => {
  const { rawDb, user, insertSession, cleanup } = createTempEnv();
  try {
    insertSession('2026-11-14', 3600);
    insertSession('2026-11-15', 3600);
    const svc = new GamificationService(rawDb);

    // Avaliado no dia 15 com 2 dias de ofensiva e 1 escudo inicial
    let status = svc.getStatus(user.id, '2026-11-15');
    assert.equal(status.currentStreakDays, 2);
    assert.equal(status.iceShields, 1);

    // Faltou dia 16 -> no dia 17 o escudo salva a ofensiva de 2 dias
    status = svc.getStatus(user.id, '2026-11-17');
    assert.equal(status.currentStreakDays, 2);
    assert.equal(status.iceShields, 0);
    assert.ok(status.pendingShieldEvent);
    assert.equal(status.pendingShieldEvent?.savedStreakDays, 2);

    // Confirma leitura do modal -> não repete
    status = svc.acknowledgeShieldEvent(user.id, '2026-11-17');
    assert.equal(status.pendingShieldEvent, null);

    // Faltou dia 17 também -> no dia 18, sem escudos, ofensiva zera, mas patente nunca cai abaixo de Soldado
    status = svc.getStatus(user.id, '2026-11-18');
    assert.equal(status.currentStreakDays, 0);
    assert.equal(status.rank.id, 'soldado');
  } finally {
    cleanup();
  }
});

test('3. Ganho quinzenal de escudo de gelo (+1 a cada 14 dias consecutivos, teto 3)', () => {
  const { rawDb, user, insertSession, cleanup } = createTempEnv();
  try {
    const svc = new GamificationService(rawDb);
    for (let day = 1; day <= 13; day++) {
      const d = `2026-11-${String(day).padStart(2, '0')}`;
      insertSession(d, 3600);
      svc.getStatus(user.id, d);
    }

    let status = svc.getStatus(user.id, '2026-11-13');
    assert.equal(status.currentStreakDays, 13);
    assert.equal(status.iceShields, 1);

    insertSession('2026-11-14', 3600);
    status = svc.recomputeFromSessions(user.id, '2026-11-14');
    assert.equal(status.currentStreakDays, 14);
    assert.equal(status.iceShields, 2);
  } finally {
    cleanup();
  }
});

test('4. Escala de patentes até 12h/dia (Coronel) + recálculo sem zerar + reembolso retroativo de escudo', () => {
  const { rawDb, user, insertSession, cleanup } = createTempEnv();
  try {
    const svc = new GamificationService(rawDb);
    // 30 dias seguidos estudando 12h/dia -> Coronel Comandante
    const start = new Date('2026-10-15T12:00:00Z');
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      insertSession(d, 12 * 3600);
    }

    const lastDay = new Date(start.getTime() + 29 * 86400000).toISOString().slice(0, 10);
    const coronelStatus = svc.getStatus(user.id, lastDay);
    assert.equal(coronelStatus.rank.id, 'coronel');
    assert.equal(coronelStatus.currentStreakDays, 30);

    // Registro retroativo no dia seguinte após escudo consumido reembolsa o escudo
    const nextDay1 = new Date(start.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const nextDay2 = new Date(start.getTime() + 31 * 86400000).toISOString().slice(0, 10);
    const beforeRefund = svc.getStatus(user.id, nextDay2);
    assert.ok(beforeRefund.pendingShieldEvent);
    const shieldsBefore = beforeRefund.iceShields;

    insertSession(nextDay1, 3600);
    const afterRefund = svc.recomputeFromSessions(user.id, nextDay2);
    assert.equal(afterRefund.iceShields, Math.min(3, shieldsBefore + 1));
    assert.equal(afterRefund.pendingShieldEvent, null);
  } finally {
    cleanup();
  }
});
