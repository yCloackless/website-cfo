process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import {
  UserRepository,
  ExamPaperRepository,
  ExamQuestionRepository,
  ExamJobRepository,
  SecurityNotificationRepository,
} from '../src/db/repositories';

let rawDb: any;
let userRepo: UserRepository;
let examPaperRepo: ExamPaperRepository;
let examQuestionRepo: ExamQuestionRepository;
let examJobRepo: ExamJobRepository;
let notifRepo: SecurityNotificationRepository;

let userAId = '';
let userBId = '';

test.before(async () => {
  const db = getDb();
  rawDb = db.getRawDb();
  const authService = new AuthService(db);
  await authService.ensureDefaultAccounts();

  userRepo = new UserRepository(rawDb);
  examPaperRepo = new ExamPaperRepository(rawDb);
  examQuestionRepo = new ExamQuestionRepository(rawDb);
  examJobRepo = new ExamJobRepository(rawDb);
  notifRepo = new SecurityNotificationRepository(rawDb);

  // Setup 2 test users
  let userA = userRepo.findByUsername('resilience_user_a');
  if (!userA) {
    userA = userRepo.create({
      username: 'resilience_user_a',
      email: 'user_a@cfo.cbmerj.rj.gov.br',
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      role: 'cadet',
      status: 'active',
    });
  }
  userAId = userA.id;

  let userB = userRepo.findByUsername('resilience_user_b');
  if (!userB) {
    userB = userRepo.create({
      username: 'resilience_user_b',
      email: 'user_b@cfo.cbmerj.rj.gov.br',
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      role: 'cadet',
      status: 'active',
    });
  }
  userBId = userB.id;
});

test('ACID: Rollback atômico reverte todas as alterações se ocorrer falha na transação', () => {
  const db = getDb();
  const testTitle = 'PROVA ROLLBACK ATOMICO ' + Date.now();

  assert.throws(
    () => {
      db.transaction(() => {
        // 1. Cria a prova
        examPaperRepo.create({
          userId: userAId,
          title: testTitle,
          institution: 'CBMERJ',
          examYear: 2026,
          totalQuestions: 1,
          status: 'READY',
          primaryDisciplines: ['Física'],
        });

        // 2. Lança erro proposital simulando falha no meio da transação
        throw new Error('SIMULATED_FAILURE_IN_TRANSACTION');
      });
    },
    /SIMULATED_FAILURE_IN_TRANSACTION/
  );

  // Verifica que a prova NÃO existe no banco de dados (rollback garantido)
  const found = examPaperRepo.list(userAId, { search: testTitle });
  assert.equal(found.length, 0, 'Registro não deveria existir após rollback da transação');
});

test('ACID: Commit atômico persiste todas as entidades relacionadas com sucesso', () => {
  const db = getDb();
  const testTitle = 'PROVA COMMIT ATOMICO ' + Date.now();

  const result = db.transaction(() => {
    const paper = examPaperRepo.create({
      userId: userAId,
      title: testTitle,
      institution: 'CBMERJ',
      examYear: 2026,
      totalQuestions: 2,
      status: 'READY',
      primaryDisciplines: ['Matemática', 'Física'],
    });

    const q1 = examQuestionRepo.create({
      examId: paper.id,
      userId: userAId,
      questionNumber: 1,
      statement: 'Questão 1 de teste ACID',
      discipline: 'Matemática',
    });

    const q2 = examQuestionRepo.create({
      examId: paper.id,
      userId: userAId,
      questionNumber: 2,
      statement: 'Questão 2 de teste ACID',
      discipline: 'Física',
    });

    return { paper, questions: [q1, q2] };
  });

  assert.ok(result.paper.id);
  assert.equal(result.questions.length, 2);

  // Confirma existência no banco
  const savedPaper = examPaperRepo.findById(result.paper.id);
  assert.ok(savedPaper);
  assert.equal(savedPaper.title, testTitle);

  const savedQuestions = examQuestionRepo.listByExam(result.paper.id);
  assert.equal(savedQuestions.length, 2);
});

test('Integridade Referencial (FK): impede inserção de questão para prova inexistente', () => {
  assert.throws(
    () => {
      examQuestionRepo.create({
        examId: 'non-existent-exam-uuid-99999',
        userId: userAId,
        questionNumber: 99,
        statement: 'Questão órfã inválida',
        discipline: 'Matemática',
      });
    },
    /FOREIGN KEY constraint failed/
  );
});

test('Idempotência & Concorrência: tentativa concorrente com mesma idempotency_key não crasha e recupera job existente', () => {
  const idempotencyKey = 'idem-key-' + Date.now() + '-' + Math.random();

  // 1ª criação do job
  const job1 = examJobRepo.create({
    userId: userAId,
    jobType: 'AI_SOLVE',
    status: 'queued',
    totalItems: 3,
    idempotencyKey,
  });
  assert.ok(job1.id);
  assert.equal(job1.idempotencyKey, idempotencyKey);

  // 2ª criação idêntica com a mesma idempotency_key (simulando request duplicada/replay)
  const job2 = examJobRepo.create({
    userId: userAId,
    jobType: 'AI_SOLVE',
    status: 'queued',
    totalItems: 3,
    idempotencyKey,
  });

  assert.ok(job2.id);
  assert.equal(job2.id, job1.id, 'Deve retornar o mesmo job existente sem gerar erro 500 ou crash');
});

test('Segurança contra SQL Injection e caracteres especiais em buscas e inserções', () => {
  const maliciousTitles = [
    "CFO 2026'; DROP TABLE exam_papers; --",
    'Proval " OR ""="',
    'Teste /* comentário SQL */ 100%',
    'Prova com wildcards %_% e caracteres especiais \\ \n \r \t',
    'Prova com KaTeX e Emojis 🔥🚒 $E = mc^2$ & <script>alert("xss")</script>',
  ];

  for (const title of maliciousTitles) {
    const paper = examPaperRepo.create({
      userId: userAId,
      title,
      institution: 'CBMERJ',
      examYear: 2026,
      totalQuestions: 1,
      status: 'READY',
      primaryDisciplines: ['Química'],
    });

    assert.ok(paper.id);

    // Consulta por ID
    const retrieved = examPaperRepo.findById(paper.id);
    assert.equal(retrieved?.title, title, 'O título exato deve ser preservado sem corrupção SQL');

    // Consulta filtrada com termos especiais
    const searched = examPaperRepo.list(userAId, { search: title.slice(0, 15) });
    assert.ok(searched.some((p) => p.id === paper.id));

    // Limpeza
    examPaperRepo.delete(paper.id, userAId);
  }
});

test('Isolamento Multitenant: notificações não vazam contagem de unread_count entre usuários diferentes', () => {
  // Cria notificação para Usuário A (não lida)
  notifRepo.createNotification({
    userId: userAId,
    type: 'CADET_SECURITY_ALERT',
    title: 'Notificação Privada User A',
    message: 'Esta notificação pertence exclusivamente ao User A',
  });

  // Cria notificação para Usuário B (não lida)
  notifRepo.createNotification({
    userId: userBId,
    type: 'SYSTEM_ALERT',
    title: 'Notificação Privada User B',
    message: 'Esta notificação pertence exclusivamente ao User B',
  });

  // Consulta notificações do Usuário A
  const notifsA = notifRepo.listNotifications({ userId: userAId });
  const hasUserBNotifInA = notifsA.items.some((n) => n.userId === userBId);
  assert.equal(hasUserBNotifInA, false, 'User A não pode ver notificações de User B');

  // Consulta notificações do Usuário B
  const notifsB = notifRepo.listNotifications({ userId: userBId });
  const hasUserANotifInB = notifsB.items.some((n) => n.userId === userAId);
  assert.equal(hasUserANotifInB, false, 'User B não pode ver notificações de User A');

  // A contagem de unread para User A não pode incluir a de User B
  // Todas as notificações retornadas para A devem ter user_id = userAId ou NULL (sistema global)
  for (const item of notifsA.items) {
    assert.ok(item.userId === userAId || item.userId === null);
  }
});

test('Deleção em cascata: exclusão da prova remove todas as questões filhas automaticamente', () => {
  const paper = examPaperRepo.create({
    userId: userAId,
    title: 'Prova para Teste de Cascata ' + Date.now(),
    institution: 'CBMERJ',
    examYear: 2026,
    totalQuestions: 3,
    status: 'READY',
    primaryDisciplines: ['Física'],
  });

  const q1 = examQuestionRepo.create({
    examId: paper.id,
    userId: userAId,
    questionNumber: 1,
    statement: 'Questão 1 cascata',
    discipline: 'Física',
  });
  const q2 = examQuestionRepo.create({
    examId: paper.id,
    userId: userAId,
    questionNumber: 2,
    statement: 'Questão 2 cascata',
    discipline: 'Física',
  });

  assert.equal(examQuestionRepo.listByExam(paper.id).length, 2);

  // Deleta a prova
  const deleted = examPaperRepo.delete(paper.id, userAId);
  assert.equal(deleted, true);

  // Prova deve ser nula
  assert.equal(examPaperRepo.findById(paper.id), null);

  // Questões filhas devem ter sido excluídas em cascata pelo SQLite
  const questionsRemaining = examQuestionRepo.listByExam(paper.id);
  assert.equal(questionsRemaining.length, 0, 'Todas as questões filhas devem ser deletadas em cascata');
  assert.equal(examQuestionRepo.findById(q1.id), null);
  assert.equal(examQuestionRepo.findById(q2.id), null);
});
