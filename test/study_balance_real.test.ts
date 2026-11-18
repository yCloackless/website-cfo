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

test('notionBackend returns empty array when unconfigured (no fake seed items)', async () => {
  const prevKey = process.env.NOTION_API_KEY;
  const prevDb = process.env.NOTION_DATABASE_ID;
  const prevRevDb = process.env.NOTION_REVISOES_DB_ID;
  delete process.env.NOTION_API_KEY;
  delete process.env.NOTION_DATABASE_ID;
  delete process.env.NOTION_REVISOES_DB_ID;
  try {
    const { fetchRevisoesFromNotion } = await import('../notionBackend');
    const res = await fetchRevisoesFromNotion();
    assert.equal(res.items.length, 0);
  } finally {
    if (prevKey !== undefined) process.env.NOTION_API_KEY = prevKey;
    if (prevDb !== undefined) process.env.NOTION_DATABASE_ID = prevDb;
    if (prevRevDb !== undefined) process.env.NOTION_REVISOES_DB_ID = prevRevDb;
  }
});

test('summarizeOverdueNotionRevisions groups overdue items up to today and finds next unchecked mes5', async () => {
  const { summarizeOverdueNotionRevisions, getNextPendingNotionCycle } = await import('../src/utils/notionRevisions');
  const items = [
    {
      id: 'p1',
      assunto: 'Taxonomia',
      materia: 'Biologia',
      data: '2026-05-27',
      tipoRevisao: ['Questões'],
      proximaRevisao: '2026-11-16',
      semana: true,
      mes1: true,
      mes2: true,
      mes3: true,
      mes4: true,
      mes5: false,
      mes6: false,
    },
    {
      id: 'p2',
      assunto: 'Briófitas',
      materia: 'Biologia',
      data: '2026-06-01',
      tipoRevisao: ['Questões'],
      proximaRevisao: '2026-11-17',
      semana: true,
      mes1: false,
      mes2: false,
      mes3: false,
    },
    {
      id: 'p3',
      assunto: 'Futura',
      materia: 'Física I',
      data: '2026-10-01',
      tipoRevisao: ['Questões'],
      proximaRevisao: '2026-11-30',
      semana: true,
      mes1: false,
      mes2: false,
      mes3: false,
    },
  ];

  assert.equal(getNextPendingNotionCycle(items[0]), 'mes5');
  const summary = summarizeOverdueNotionRevisions(items, '2026-11-17');
  assert.equal(summary.totalPending, 2);
  assert.equal(summary.subjects.length, 1);
  assert.equal(summary.subjects[0].materia, 'Biologia');
  assert.equal(summary.subjects[0].count, 2);
  assert.equal(summary.subjects[0].items[0].pendingCycleKey, 'mes5');
});

test('notionBackend paginates next_cursor, parses mes4-mes10, and updates mes5 with Notion recalculated date', async () => {
  const prevKey = process.env.NOTION_API_KEY;
  const prevDb = process.env.NOTION_DATABASE_ID;
  const nativeFetch = globalThis.fetch;
  process.env.NOTION_API_KEY = 'test-notion-key';
  process.env.NOTION_DATABASE_ID = 'test-notion-db';

  let queryCount = 0;
  let patchedProp: Record<string, any> | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/databases/test-notion-db/query')) {
      queryCount += 1;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (!body.start_cursor) {
        return new Response(JSON.stringify({
          has_more: true,
          next_cursor: 'cursor-page-2',
          results: [{
            id: 'page-1',
            properties: {
              Assunto: { title: [{ plain_text: 'Taxonomia' }] },
              'Matéria': { select: { name: 'Biologia' } },
              Data: { date: { start: '2026-05-27' } },
              'Próxima Revisão': { formula: { date: { start: '2026-11-16' } } },
              Semana: { checkbox: true },
              'Mês 1': { checkbox: true },
              'Mês 2': { checkbox: true },
              'Mês 3': { checkbox: true },
              'Mês 4': { checkbox: true },
              'Mês 5': { checkbox: false },
            },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        has_more: false,
        results: [{
          id: 'page-2',
          properties: {
            Assunto: { title: [{ plain_text: 'Termoquímica' }] },
            'Matéria': { select: { name: 'Química' } },
            Data: { date: { start: '2026-06-01' } },
            'Próxima Revisão': { formula: { date: { start: '2026-12-01' } } },
            Semana: { checkbox: true },
            'Mês 10': { checkbox: false },
          },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/pages/page-1') && init?.method === 'PATCH') {
      patchedProp = JSON.parse(String(init.body)).properties;
      return new Response(JSON.stringify({
        id: 'page-1',
        properties: {
          Assunto: { title: [{ plain_text: 'Taxonomia' }] },
          'Matéria': { select: { name: 'Biologia' } },
          Data: { date: { start: '2026-05-27' } },
          'Próxima Revisão': { formula: { date: { start: '2026-12-16' } } },
          Semana: { checkbox: true },
          'Mês 1': { checkbox: true },
          'Mês 2': { checkbox: true },
          'Mês 3': { checkbox: true },
          'Mês 4': { checkbox: true },
          'Mês 5': { checkbox: true },
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return nativeFetch(input, init);
  }) as typeof fetch;

  try {
    const { fetchRevisoesFromNotion, updateCheckinInNotion } = await import('../notionBackend');
    const fetched = await fetchRevisoesFromNotion();
    assert.equal(queryCount, 2);
    assert.equal(fetched.items.length, 2);
    assert.equal(fetched.items[0].mes4, true);
    assert.equal(fetched.items[0].mes5, false);
    assert.equal(fetched.items[1].mes10, false);

    const checkin = await updateCheckinInNotion('page-1', 'mes5', true);
    assert.equal(checkin.success, true);
    assert.deepEqual(patchedProp, { 'Mês 5': { checkbox: true } });
    assert.equal(checkin.item?.mes5, true);
    assert.equal(checkin.item?.proximaRevisao, '2026-12-16');
  } finally {
    globalThis.fetch = nativeFetch;
    if (prevKey === undefined) delete process.env.NOTION_API_KEY; else process.env.NOTION_API_KEY = prevKey;
    if (prevDb === undefined) delete process.env.NOTION_DATABASE_ID; else process.env.NOTION_DATABASE_ID = prevDb;
  }
});

test('fetchAIStudyAnalysis client fallback never fabricates hours, score, or unrelated subjects', async () => {
  const { fetchAIStudyAnalysis } = await import('../src/services/aiService');
  const zeroSummary = buildMonthlyStudySummary(
    [{ id: 'hist', name: 'História', category: 'Humanas', color: '#8b5cf6' }],
    null,
    [],
    {},
    new Date('2026-11-17T12:00:00Z'),
  );
  const res = await fetchAIStudyAnalysis(zeroSummary);
  assert.equal(res.source, 'heuristic');
  assert.equal(res.data.equilibriumScore, 0);
  assert.equal(res.data.topStudiedSubject.hours, 0);
  assert.equal(res.data.topStudiedSubject.sessions, 0);
  assert.equal(
    res.data.prioritySubjectsForNextWeek.some((p) => p.name === 'Física' || p.name === 'Química'),
    false,
  );
});

test('fetchNotionRevisoes returns empty and clears access on 403 NOTION_FORBIDDEN for non-admin accounts', async () => {
  const { fetchNotionRevisoes } = await import('../src/services/notionService');
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'NOTION_FORBIDDEN' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  try {
    const res = await fetchNotionRevisoes();
    assert.equal(res.items.length, 0);
    assert.equal(res.source, 'unavailable');
    assert.equal(res.error, 'NOTION_FORBIDDEN');
  } finally {
    globalThis.fetch = nativeFetch;
  }
});

test('notionBackend renames, duplicates, archives (deletes), and blocks unauthorized page IDs', async () => {
  const prevKey = process.env.NOTION_API_KEY;
  const prevDb = process.env.NOTION_DATABASE_ID;
  const nativeFetch = globalThis.fetch;
  process.env.NOTION_API_KEY = 'test-notion-key';
  process.env.NOTION_DATABASE_ID = 'test-notion-db';

  let notionCalls = 0;
  let lastPatchBody: any = null;
  let lastPostBody: any = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.notion.com/')) {
      notionCalls += 1;
      if (url.endsWith('/databases/test-notion-db/query')) {
        return new Response(JSON.stringify({
          has_more: false,
          results: [{
            id: 'page-1111-2222-3333-444444444444',
            properties: {
              Assunto: { title: [{ plain_text: 'Estequiometria' }] },
              'Matéria': { select: { name: 'Química' } },
              Data: { date: { start: '2026-11-10' } },
              'Tipo de Revisão': { multi_select: [{ name: 'Questões' }] },
              'Próxima Revisão': { date: { start: '2026-11-17' } },
              Semana: { checkbox: false },
            },
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/pages/page-1111-2222-3333-444444444444') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({
          id: 'page-1111-2222-3333-444444444444',
          properties: {
            Assunto: { type: 'title', title: [{ plain_text: 'Estequiometria' }] },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/pages/page-1111-2222-3333-444444444444') && init?.method === 'PATCH') {
        lastPatchBody = JSON.parse(String(init.body));
        if (lastPatchBody.archived === true) {
          return new Response(JSON.stringify({ id: 'page-1111-2222-3333-444444444444', archived: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          id: 'page-1111-2222-3333-444444444444',
          properties: {
            Assunto: { title: [{ plain_text: lastPatchBody.properties.Assunto.title[0].text.content }] },
            'Matéria': { select: { name: 'Química' } },
            Data: { date: { start: '2026-11-10' } },
            'Tipo de Revisão': { multi_select: [{ name: 'Questões' }] },
            'Próxima Revisão': { date: { start: '2026-11-17' } },
            Semana: { checkbox: false },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/v1/pages') && init?.method === 'POST') {
        lastPostBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify({
          id: 'page-copy-5555-6666-777777777777',
          properties: {
            Assunto: { title: [{ plain_text: lastPostBody.properties.Assunto.title[0].text.content }] },
            'Matéria': { select: { name: lastPostBody.properties['Matéria'].select.name } },
            Data: { date: { start: lastPostBody.properties.Data.date.start } },
            'Tipo de Revisão': { multi_select: [{ name: 'Questões' }] },
            Semana: { checkbox: false },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return nativeFetch(input, init);
  }) as typeof fetch;

  try {
    const {
      fetchRevisoesFromNotion,
      renameStudyInNotion,
      duplicateStudyInNotion,
      deleteStudyInNotion,
      readLocalRevisoes,
    } = await import('../notionBackend');

    await fetchRevisoesFromNotion();

    const callsBeforeRejected = notionCalls;
    const rejected = await deleteStudyInNotion('../other-page');
    assert.equal(rejected.success, false);
    assert.equal(rejected.error, 'NOTION_PAGE_NOT_FOUND');
    assert.equal(notionCalls, callsBeforeRejected);

    const renamed = await renameStudyInNotion('page-1111-2222-3333-444444444444', 'Estequiometria Avançada');
    assert.equal(renamed.success, true);
    assert.equal(renamed.item?.assunto, 'Estequiometria Avançada');
    assert.equal(lastPatchBody.properties.Assunto.title[0].text.content, 'Estequiometria Avançada');

    const duplicated = await duplicateStudyInNotion('page-1111-2222-3333-444444444444');
    assert.equal(duplicated.success, true);
    assert.equal(duplicated.item?.id, 'page-copy-5555-6666-777777777777');
    assert.equal(duplicated.item?.assunto, 'Estequiometria Avançada (cópia)');
    assert.equal(lastPostBody.properties['Matéria'].select.name, 'Química');

    const deleted = await deleteStudyInNotion('page-1111-2222-3333-444444444444');
    assert.equal(deleted.success, true);
    assert.equal(lastPatchBody.archived, true);
    assert.equal(readLocalRevisoes().some((it) => it.id === 'page-1111-2222-3333-444444444444'), false);
    assert.equal(readLocalRevisoes().some((it) => it.id === 'page-copy-5555-6666-777777777777'), true);
  } finally {
    globalThis.fetch = nativeFetch;
    if (prevKey === undefined) delete process.env.NOTION_API_KEY; else process.env.NOTION_API_KEY = prevKey;
    if (prevDb === undefined) delete process.env.NOTION_DATABASE_ID; else process.env.NOTION_DATABASE_ID = prevDb;
  }
});
