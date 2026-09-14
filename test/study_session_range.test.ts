import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../src/db/database';
import { UserRepository, StudySessionRepository } from '../src/db/repositories';

test('Study Session Range & Weekly Synchronization Suite', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-range-'));
  const db = getDb(path.join(dir, 'range.sqlite'));
  const rawDb = db.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const sessionRepo = new StudySessionRepository(rawDb);

  const testUser = userRepo.create({
    username: 'test_cadete',
    email: 'cadete@cfo.test',
    passwordHash: 'hash123',
  });

  const otherUser = userRepo.create({
    username: 'other_cadete',
    email: 'other@cfo.test',
    passwordHash: 'hash123',
  });

  await t.test('1. Insere sessões em datas diferentes e consulta por intervalo semanal', () => {
    // Insere 2 horas de Matemática em 2026-09-08 (Terça-feira da semana)
    sessionRepo.upsertManual(`session_tue_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'matematica',
      subjectName: 'Matemática',
      topic: 'Geometria Espacial',
      dateStr: '2026-09-08',
      durationSeconds: 7200, // 2h = 120min
      endedAt: '2026-09-08T14:00:00.000Z',
    });

    // Insere 1h30 de Física em 2026-09-10 (Quinta-feira da semana)
    sessionRepo.upsertManual(`session_thu_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'fisica',
      subjectName: 'Física',
      topic: 'Termodinâmica',
      dateStr: '2026-09-10',
      durationSeconds: 5400, // 1.5h = 90min
      endedAt: '2026-09-10T16:30:00.000Z',
    });

    // Insere 3h de Química em 2026-09-15 (Fora da semana, na semana seguinte)
    sessionRepo.upsertManual(`session_next_week_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'quimica',
      subjectName: 'Química',
      topic: 'Estequiometria',
      dateStr: '2026-09-15',
      durationSeconds: 10800,
      endedAt: '2026-09-15T18:00:00.000Z',
    });

    // Sessão de outro usuário na mesma semana (deve ser isolada)
    sessionRepo.upsertManual(`session_other_user_${Date.now()}`, {
      userId: otherUser.id,
      subjectId: 'matematica',
      subjectName: 'Matemática',
      topic: 'Álgebra',
      dateStr: '2026-09-08',
      durationSeconds: 3600,
      endedAt: '2026-09-08T10:00:00.000Z',
    });

    // Consulta para a semana de 07/09 a 13/09
    const summary = sessionRepo.getDailySummaryBetweenDates(testUser.id, '2026-09-07', '2026-09-13');

    // Deve conter apenas os 2 dias da semana
    assert.ok(summary['2026-09-08'], 'Dia 2026-09-08 deve constar no resumo');
    assert.ok(summary['2026-09-10'], 'Dia 2026-09-10 deve constar no resumo');
    assert.strictEqual(summary['2026-09-15'], undefined, 'Dia fora do período não deve constar');

    // Verifica valores do dia 08/09
    const day8 = summary['2026-09-08'];
    assert.strictEqual(day8.totalSeconds, 7200);
    assert.strictEqual(day8.totalHours, 2);
    assert.strictEqual(day8.subjects.length, 1);
    assert.strictEqual(day8.subjects[0].subjectId, 'matematica');

    // Verifica valores do dia 10/09
    const day10 = summary['2026-09-10'];
    assert.strictEqual(day10.totalSeconds, 5400);
    assert.strictEqual(day10.totalHours, 1.5);
    assert.strictEqual(day10.subjects[0].subjectId, 'fisica');
  });

  await t.test('2. Agrupa múltiplas sessões da mesma matéria e matérias distintas no mesmo dia', () => {
    // Adiciona mais 30 min de Matemática no mesmo dia 2026-09-08
    sessionRepo.upsertManual(`session_tue_extra_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'matematica',
      subjectName: 'Matemática',
      topic: 'Exercícios',
      dateStr: '2026-09-08',
      durationSeconds: 1800, // 30min
      endedAt: '2026-09-08T18:00:00.000Z',
    });

    const summary = sessionRepo.getDailySummaryBetweenDates(testUser.id, '2026-09-07', '2026-09-13');
    const day8 = summary['2026-09-08'];

    // Total agora deve ser 7200 + 1800 = 9000s (2.5h)
    assert.strictEqual(day8.totalSeconds, 9000);
    assert.strictEqual(day8.totalHours, 2.5);
  });

  await t.test('3. Consulta resumo mensal e totais para a Agenda de Horas (Heatmap Azul)', () => {
    const monthlySummary = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09');
    const monthlyTotals = sessionRepo.getMonthlyTotal(testUser.id, '2026-09');

    // Dias no mês: 08/09 (2.5h), 10/09 (1.5h), 15/09 (3h) -> Total = 7h
    assert.ok(monthlySummary['2026-09-08'], 'Dia 08 deve constar no heatmap mensal');
    assert.ok(monthlySummary['2026-09-10'], 'Dia 10 deve constar no heatmap mensal');
    assert.ok(monthlySummary['2026-09-15'], 'Dia 15 deve constar no heatmap mensal');

    assert.strictEqual(monthlySummary['2026-09-08'].totalHours, 2.5);
    assert.strictEqual(monthlySummary['2026-09-10'].totalHours, 1.5);
    assert.strictEqual(monthlySummary['2026-09-15'].totalHours, 3);

    // Totais do mês
    assert.strictEqual(monthlyTotals.totalHours, 7);
    assert.strictEqual(monthlyTotals.totalSeconds, 25200);
    assert.strictEqual(monthlyTotals.totalSessions, 4);
  });

  await t.test('4. Atualização imediata em caso de exclusão ou remoção de horas manuais', () => {
    // Insere sessão temporária
    const tempSessionId = `session_temp_${Date.now()}`;
    sessionRepo.upsertManual(tempSessionId, {
      userId: testUser.id,
      subjectId: 'historia',
      subjectName: 'História',
      dateStr: '2026-09-20',
      durationSeconds: 3600,
      endedAt: '2026-09-20T12:00:00.000Z',
    });

    let summaryBefore = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09');
    assert.ok(summaryBefore['2026-09-20'], 'Dia 20 deve constar antes da remoção');
    assert.strictEqual(summaryBefore['2026-09-20'].totalHours, 1);

    // Remove sessão (simulando duration 0 minutos)
    sessionRepo.deleteByIdForUser(tempSessionId, testUser.id);

    let summaryAfter = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09');
    assert.strictEqual(summaryAfter['2026-09-20'], undefined, 'Dia 20 não deve mais constar após exclusão');
  });

  await t.test('5. Exclusão específica de uma matéria em um dia com múltiplas matérias', () => {
    // Insere Português e Redação no dia 2026-09-22
    sessionRepo.upsertManual(`session_port_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'portugues',
      subjectName: 'Português',
      dateStr: '2026-09-22',
      durationSeconds: 3600, // 1h
      endedAt: '2026-09-22T10:00:00.000Z',
    });
    sessionRepo.upsertManual(`session_red_${Date.now()}`, {
      userId: testUser.id,
      subjectId: 'redacao',
      subjectName: 'Redação',
      dateStr: '2026-09-22',
      durationSeconds: 5400, // 1.5h
      endedAt: '2026-09-22T12:00:00.000Z',
    });

    let daySummary = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09')['2026-09-22'];
    assert.strictEqual(daySummary.subjects.length, 2);
    assert.strictEqual(daySummary.totalHours, 2.5);

    // Exclui apenas Português
    sessionRepo.deleteByDateAndSubjectForUser(testUser.id, '2026-09-22', 'portugues');

    daySummary = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09')['2026-09-22'];
    assert.strictEqual(daySummary.subjects.length, 1);
    assert.strictEqual(daySummary.subjects[0].subjectId, 'redacao');
    assert.strictEqual(daySummary.totalHours, 1.5);
  });

  await t.test('6. Limpar todas as horas de um dia específico', () => {
    // Limpa todas as sessões do dia 2026-09-22
    sessionRepo.deleteByDateForUser(testUser.id, '2026-09-22');

    const summary = sessionRepo.getDailySummaryByMonth(testUser.id, '2026-09');
    assert.strictEqual(summary['2026-09-22'], undefined, 'Dia 22 deve ser completamente removido');
  });
});
