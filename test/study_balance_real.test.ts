import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyStudySummary, getCurrentYearMonthAndToday } from '../src/utils/studyBalance';

test('getCurrentYearMonthAndToday formats YYYY-MM and YYYY-MM-DD in Sao Paulo timezone', () => {
  const { yearMonth, monthStart, todayStr } = getCurrentYearMonthAndToday(new Date('2026-11-17T02:30:00Z'));
  // 02:30Z is 23:30 on 2026-11-16 in America/Sao_Paulo (-03:00)
  assert.equal(yearMonth, '2026-11');
  assert.equal(monthStart, '2026-11-01');
  assert.equal(todayStr, '2026-11-16');
});

test('returns 0 hours, score 0, and neutral tier when user has no study records in the month', () => {
  const summary = buildMonthlyStudySummary(
    [{ id: 'fis', name: 'Física', category: 'Exatas', color: '#3b82f6' }],
    null,
    [],
    {},
    new Date('2026-11-17T12:00:00Z'),
  );
  assert.equal(summary.totalHours, 0);
  assert.equal(summary.totalMinutes, 0);
  assert.equal(summary.equilibriumScore, 0);
  assert.equal(summary.bySubject['fis'].tier, 'neutral');
  assert.equal(summary.bySubject['fis'].accentColor, '#3b82f6');
});

test('deduplicates same (subjectId, dateStr) favoring backend study_sessions and classifies red/amber/green', () => {
  const subjects = [
    { id: 'bio', name: 'Biologia', category: 'Natureza', color: '#10b981' },
    { id: 'fis', name: 'Física', category: 'Exatas', color: '#3b82f6' },
    { id: 'qui', name: 'Química', category: 'Exatas', color: '#f59e0b' },
  ];
  const cycle = {
    id: 'c1',
    startDate: '2026-11-16',
    endDate: '2026-11-22',
    label: 'Atual',
    updatedAt: '',
    entries: {
      fis_0: {
        id: 'e1',
        subjectId: 'fis',
        dayIndex: 0,
        dateStr: '2026-11-16',
        completed: true,
        durationMinutes: 120,
      },
      qui_0: {
        id: 'e2',
        subjectId: 'qui',
        dayIndex: 0,
        dateStr: '2026-11-16',
        completed: true,
        durationMinutes: 60,
      },
    },
  };
  const sessionDays = {
    '2026-11-16': {
      dateStr: '2026-11-16',
      subjects: [{ subjectId: 'fis', subjectName: 'Física', durationSeconds: 7200 }],
    },
  };
  const summary = buildMonthlyStudySummary(subjects, cycle, [], sessionDays, new Date('2026-11-17T12:00:00Z'));
  assert.equal(summary.bySubject['fis'].minutes, 120); // deduplicated, not 240
  assert.equal(summary.bySubject['qui'].minutes, 60);
  assert.equal(summary.bySubject['bio'].minutes, 0);
  assert.equal(summary.bySubject['bio'].tier, 'critical');
  assert.equal(summary.bySubject['fis'].tier, 'balanced');
  assert.ok(summary.equilibriumScore > 0 && summary.equilibriumScore < 100);
});
