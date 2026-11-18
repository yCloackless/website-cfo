import crypto from 'node:crypto';
import { Type } from '@google/genai';
import {
  PRIZE_LADDER,
  type AnswerResult,
  type MillionDifficultyBlock,
  type MillionHelpType,
  type MillionHistoryEntry,
  type MillionMatchStatus,
  type MillionStateResponse,
  type PrizeStep,
  type SanitizedActiveMatch,
  type SanitizedMillionQuestion,
  type StopResult,
  type UniversitariosHint,
} from '../utils/millionGameShared';

export {
  PRIZE_LADDER,
  type AnswerResult,
  type MillionDifficultyBlock,
  type MillionHelpType,
  type MillionHistoryEntry,
  type MillionMatchStatus,
  type MillionStateResponse,
  type PrizeStep,
  type SanitizedActiveMatch,
  type SanitizedMillionQuestion,
  type StopResult,
  type UniversitariosHint,
};

export const MILLION_ACTIVE_KEY = 'million_game_active_v1';
export const MILLION_HISTORY_KEY = 'million_game_history_v1';

export interface UserStateStore {
  getValue(userId: string, key: string): string | null;
  upsertValue(userId: string, key: string, value: string): string;
}

export interface GeminiLike {
  models: {
    generateContent(params: any): Promise<{ text?: string }>;
  };
}

export interface StoredMillionQuestion {
  id: string;
  level: number;
  block: MillionDifficultyBlock;
  discipline: string;
  statement: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  referenceTip: string;
}

export interface StoredMillionMatch {
  id: string;
  userId: string;
  topic: string;
  focusHint: string;
  status: MillionMatchStatus;
  currentLevel: number; // 1..16
  earnedPrize: number;
  questions: StoredMillionQuestion[];
  reservesByBlock: Record<'1' | '2' | '3', StoredMillionQuestion | null>;
  helps: {
    cardsUsed: boolean;
    universitariosUsed: boolean;
    skipsUsed: number;
    skipsUsedByBlock: Record<'1' | '2' | '3', boolean>;
  };
  currentQuestionState: {
    questionId: string;
    eliminatedIndices: number[];
    universitariosHint: UniversitariosHint | null;
  };
  answeredHistory: Array<{
    questionId: string;
    level: number;
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type ServiceFailure = { ok: false; status: number; error: string; message: string };
export type ServiceResult<T> = { ok: true; data: T } | ServiceFailure;

export interface HelpResult {
  helpType: MillionHelpType;
  eliminatedIndices: number[];
  universitariosHint: UniversitariosHint | null;
  question: SanitizedMillionQuestion;
  helps: SanitizedActiveMatch['helps'];
}

function getPrizeStep(level: number): PrizeStep {
  return PRIZE_LADDER[Math.max(0, Math.min(PRIZE_LADDER.length - 1, level - 1))];
}

function readJson<T>(repo: UserStateStore, userId: string, key: string): T | null {
  const raw = repo.getValue(userId, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readHistory(repo: UserStateStore, userId: string): MillionHistoryEntry[] {
  const parsed = readJson<MillionHistoryEntry[]>(repo, userId, MILLION_HISTORY_KEY);
  return Array.isArray(parsed) ? parsed : [];
}

function appendHistory(repo: UserStateStore, userId: string, match: StoredMillionMatch): void {
  if (match.status === 'IN_PROGRESS') return;
  const history = readHistory(repo, userId);
  const entry: MillionHistoryEntry = {
    id: match.id,
    topic: match.topic,
    status: match.status,
    earnedPrize: match.earnedPrize,
    reachedLevel: match.currentLevel,
    correctCount: match.answeredHistory.filter((item) => item.isCorrect).length,
    finishedAt: match.updatedAt,
  };
  const next = [entry, ...history.filter((item) => item.id !== match.id)].slice(0, 20);
  repo.upsertValue(userId, MILLION_HISTORY_KEY, JSON.stringify(next));
}

function buildClientHelps(match: StoredMillionMatch): SanitizedActiveMatch['helps'] {
  const step = getPrizeStep(match.currentLevel);
  const atMillion = match.currentLevel === 16;
  const blockKey = String(step.block) as '1' | '2' | '3';
  const skipAvailableInCurrentBlock =
    !atMillion &&
    (step.block === 1 || step.block === 2 || step.block === 3) &&
    !match.helps.skipsUsedByBlock[blockKey] &&
    Boolean(match.reservesByBlock[blockKey]);

  return {
    cardsAvailable: !atMillion && !match.helps.cardsUsed,
    universitariosAvailable: !atMillion && !match.helps.universitariosUsed,
    skipsRemainingTotal: atMillion ? 0 : Math.max(0, 3 - match.helps.skipsUsed),
    skipAvailableInCurrentBlock,
    disabledAtMillion: atMillion,
  };
}

function sanitizeQuestion(
  question: StoredMillionQuestion,
  level: number,
  qState: StoredMillionMatch['currentQuestionState']
): SanitizedMillionQuestion {
  const step = getPrizeStep(level);
  const sameQuestion = qState.questionId === question.id;
  return {
    id: question.id,
    level,
    block: step.block,
    blockLabel: step.blockLabel,
    statement: question.statement,
    options: [...question.options] as [string, string, string, string],
    discipline: question.discipline,
    eliminatedIndices: sameQuestion ? [...qState.eliminatedIndices] : [],
    universitariosHint: sameQuestion ? qState.universitariosHint : null,
  };
}

export function sanitizeMatchForClient(match: StoredMillionMatch): SanitizedActiveMatch {
  const idx = Math.max(0, Math.min(match.questions.length - 1, match.currentLevel - 1));
  const current = match.questions[idx];
  const step = getPrizeStep(match.currentLevel);

  return {
    id: match.id,
    topic: match.topic,
    focusHint: match.focusHint,
    status: match.status,
    currentLevel: match.currentLevel,
    earnedPrize: match.earnedPrize,
    prizeInfo: step,
    helps: buildClientHelps(match),
    currentQuestion: sanitizeQuestion(current, match.currentLevel, match.currentQuestionState),
    createdAt: match.createdAt,
  };
}

export function getMillionState(repo: UserStateStore, userId: string): MillionStateResponse {
  const active = readJson<StoredMillionMatch>(repo, userId, MILLION_ACTIVE_KEY);
  const history = readHistory(repo, userId);
  const bestPrize = history.reduce((max, item) => Math.max(max, item.earnedPrize || 0), 0);
  const wins = history.filter((item) => item.status === 'WON').length;

  return {
    activeMatch: active && active.status === 'IN_PROGRESS' ? sanitizeMatchForClient(active) : null,
    stats: {
      bestPrize,
      totalMatches: history.length,
      wins,
    },
    history,
  };
}

function normalizeQuestion(
  raw: any,
  fallbackId: string,
  block: MillionDifficultyBlock,
  level: number,
  seenIds: Set<string>
): StoredMillionQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const statement = String(raw.statement || '').trim();
  const explanation = String(raw.explanation || '').trim();
  const discipline = String(raw.discipline || 'Edital CFO CBMERJ').trim() || 'Edital CFO CBMERJ';
  const referenceTip = String(raw.referenceTip || '').trim();
  const optionsRaw = Array.isArray(raw.options) ? raw.options.map((o: unknown) => String(o || '').trim()) : [];
  const rawCorrect = raw.correctIndex;

  if (
    !statement ||
    !explanation ||
    optionsRaw.length !== 4 ||
    optionsRaw.some((o: string) => !o) ||
    typeof rawCorrect !== 'number' ||
    !Number.isInteger(rawCorrect) ||
    rawCorrect < 0 ||
    rawCorrect > 3
  ) {
    return null;
  }

  const candidateId = typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = candidateId && !seenIds.has(candidateId) ? candidateId : fallbackId;
  seenIds.add(id);

  return {
    id,
    level,
    block,
    discipline,
    statement,
    options: [optionsRaw[0], optionsRaw[1], optionsRaw[2], optionsRaw[3]],
    correctIndex: rawCorrect,
    explanation,
    referenceTip,
  };
}

function parseGeneratedBatch(rawText: string): {
  questions: StoredMillionQuestion[];
  reservesByBlock: Record<'1' | '2' | '3', StoredMillionQuestion>;
} | null {
  if (!rawText || !rawText.trim()) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return null;
  }

  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const rawReserves = Array.isArray(parsed?.reserves) ? parsed.reserves : [];
  if (rawQuestions.length < 16 || rawReserves.length < 3) return null;

  const seenIds = new Set<string>();
  const questions: StoredMillionQuestion[] = [];
  for (let i = 0; i < 16; i += 1) {
    const level = i + 1;
    const expectedBlock = getPrizeStep(level).block;
    const normalized = normalizeQuestion(
      rawQuestions[i],
      `q_${level}_${crypto.randomBytes(3).toString('hex')}`,
      expectedBlock,
      level,
      seenIds
    );
    if (!normalized) return null;
    questions.push(normalized);
  }

  const usedReserves = new Set<unknown>();
  const reserves: StoredMillionQuestion[] = [];
  for (let i = 0; i < 3; i += 1) {
    const block = (i + 1) as 1 | 2 | 3;
    const candidate = rawReserves.find((r: any) => !usedReserves.has(r) && Number(r?.block) === block);
    if (!candidate) return null;
    usedReserves.add(candidate);
    const normalized = normalizeQuestion(
      candidate,
      `res_b${block}_${crypto.randomBytes(3).toString('hex')}`,
      block,
      0,
      seenIds
    );
    if (!normalized) return null;
    reserves.push(normalized);
  }

  return {
    questions,
    reservesByBlock: {
      '1': reserves[0],
      '2': reserves[1],
      '3': reserves[2],
    },
  };
}

const MILLION_QUESTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    level: { type: Type.INTEGER },
    block: { type: Type.INTEGER },
    discipline: { type: Type.STRING },
    statement: { type: Type.STRING },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    correctIndex: { type: Type.INTEGER },
    explanation: { type: Type.STRING },
    referenceTip: { type: Type.STRING },
  },
  required: ['level', 'block', 'discipline', 'statement', 'options', 'correctIndex', 'explanation'],
};

export async function generateMillionQuestionsWithGemini(
  aiClient: GeminiLike,
  topic: string,
  focusHint: string = ''
): Promise<{
  questions: StoredMillionQuestion[];
  reservesByBlock: Record<'1' | '2' | '3', StoredMillionQuestion>;
} | null> {
  const prompt = `Você é a banca elaboradora oficial do concurso CFO CBMERJ (UERJ / Vestibulares Militares) criando uma partida completa do "Show do Milhão CFO CBMERJ".

Tema solicitado pelo candidato: "${topic}"
${focusHint ? `Foco adicional solicitado: "${focusHint}"` : ''}

Gere EXATAMENTE:
- "questions": 16 questões numeradas de level 1 até level 16, divididas em 4 blocos crescentes de dificuldade:
  - Bloco 1 (level 1 a 5 — Aquecimento): conceitos fundamentais diretos e fatos essenciais cobrados em prova.
  - Bloco 2 (level 6 a 10 — Intermediário UERJ/CFO): contextualização de vestibular, interpretação, aplicação de leis/processos históricos/fórmulas.
  - Bloco 3 (level 11 a 15 — Avançado CFO): questões desafiadoras com distratores clássicos de banca, análise profunda e pegadinhas recorrentes.
  - Bloco 4 (level 16 — Pergunta do Milhão): questão de nível máximo, detalhista e decisiva digna do prêmio de R$ 1 milhão no contexto do vestibular/CFO CBMERJ.
- "reserves": 3 questões reservas (uma para block=1, uma para block=2, uma para block=3, todas com level=0) com a mesma qualidade e dificuldade do respectivo bloco.

Regras obrigatórias:
1. Cada questão deve ter exatamente 4 alternativas ("options" com 4 strings distintas e plausíveis), sem prefixo "A)"/"B)".
2. "correctIndex" deve ser um inteiro de 0 a 3 indicando a única alternativa correta; distribua as respostas corretas de forma variada entre 0, 1, 2 e 3.
3. Em matemática, física ou química, use notação LaTeX com $...$ inline quando houver fórmulas.
4. "explanation" deve explicar claramente em 2-4 frases por que a alternativa correta está certa e o erro das principais distratoras.
5. "referenceTip" deve trazer 1 dica curta ou bizu de memorização para o CFO CBMERJ.`;

  const candidateModels = [
    'gemini-2.5-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];

  for (const modelName of candidateModels) {
    try {
      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction:
            'Você é um elaborador sênior de questões do vestibular UERJ e concurso CFO CBMERJ. Retorne apenas JSON estritamente válido seguindo o schema.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: MILLION_QUESTION_SCHEMA,
              },
              reserves: {
                type: Type.ARRAY,
                items: MILLION_QUESTION_SCHEMA,
              },
            },
            required: ['questions', 'reserves'],
          },
        },
      });

      const parsed = parseGeneratedBatch(response?.text || '');
      if (parsed) return parsed;
    } catch (err) {
      console.warn(`[MillionGame] Modelo ${modelName} falhou ao gerar questões:`, err);
    }
  }

  return null;
}

export async function startMillionMatch(deps: {
  repo: UserStateStore;
  userId: string;
  topic: string;
  focusHint?: string;
  aiClient: GeminiLike | null;
}): Promise<ServiceResult<SanitizedActiveMatch>> {
  const cleanTopic = String(deps.topic || '').trim();
  const cleanFocus = String(deps.focusHint || '').trim();
  if (!cleanTopic) {
    return {
      ok: false,
      status: 400,
      error: 'TOPIC_REQUIRED',
      message: 'Informe um conteúdo ou matéria para iniciar o Show do Milhão.',
    };
  }

  const existing = readJson<StoredMillionMatch>(deps.repo, deps.userId, MILLION_ACTIVE_KEY);
  if (existing && existing.status === 'IN_PROGRESS') {
    return {
      ok: false,
      status: 409,
      error: 'ACTIVE_MATCH_EXISTS',
      message: 'Já existe uma partida em andamento. Continue ou encerre a partida atual antes de iniciar outra.',
    };
  }

  if (!deps.aiClient) {
    return {
      ok: false,
      status: 503,
      error: 'AI_UNAVAILABLE',
      message: 'Serviço de IA indisponível no momento (GEMINI_API_KEY não configurada).',
    };
  }

  const generated = await generateMillionQuestionsWithGemini(deps.aiClient, cleanTopic, cleanFocus);
  if (!generated) {
    return {
      ok: false,
      status: 502,
      error: 'AI_GENERATION_FAILED',
      message: 'Não foi possível gerar as 16 perguntas inéditas agora. Tente novamente em instantes.',
    };
  }

  const now = new Date().toISOString();
  const match: StoredMillionMatch = {
    id: crypto.randomUUID(),
    userId: deps.userId,
    topic: cleanTopic,
    focusHint: cleanFocus,
    status: 'IN_PROGRESS',
    currentLevel: 1,
    earnedPrize: 0,
    questions: generated.questions,
    reservesByBlock: generated.reservesByBlock,
    helps: {
      cardsUsed: false,
      universitariosUsed: false,
      skipsUsed: 0,
      skipsUsedByBlock: { '1': false, '2': false, '3': false },
    },
    currentQuestionState: {
      questionId: generated.questions[0].id,
      eliminatedIndices: [],
      universitariosHint: null,
    },
    answeredHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));
  return { ok: true, data: sanitizeMatchForClient(match) };
}

function loadActiveMatch(
  repo: UserStateStore,
  userId: string,
  matchId: string
): ServiceResult<StoredMillionMatch> {
  const match = readJson<StoredMillionMatch>(repo, userId, MILLION_ACTIVE_KEY);
  if (!match || match.userId !== userId || match.id !== matchId) {
    return {
      ok: false,
      status: 404,
      error: 'MATCH_NOT_FOUND',
      message: 'Partida não encontrada para esta conta.',
    };
  }
  if (match.status !== 'IN_PROGRESS') {
    return {
      ok: false,
      status: 409,
      error: 'MATCH_ALREADY_FINISHED',
      message: 'Esta partida já foi encerrada.',
    };
  }
  return { ok: true, data: match };
}

export function answerMillionQuestion(deps: {
  repo: UserStateStore;
  userId: string;
  matchId: string;
  questionId: string;
  selectedIndex: number;
}): ServiceResult<AnswerResult> {
  if (!Number.isInteger(deps.selectedIndex) || deps.selectedIndex < 0 || deps.selectedIndex > 3) {
    return { ok: false, status: 400, error: 'INVALID_OPTION', message: 'Alternativa inválida.' };
  }

  const loaded = loadActiveMatch(deps.repo, deps.userId, deps.matchId);
  if ('error' in loaded) return loaded;
  const match = loaded.data;

  const idx = match.currentLevel - 1;
  const currentQuestion = match.questions[idx];
  if (!currentQuestion || currentQuestion.id !== deps.questionId) {
    return {
      ok: false,
      status: 409,
      error: 'QUESTION_ALREADY_RESOLVED',
      message: 'Esta pergunta já foi respondida ou substituída.',
    };
  }

  if (
    match.currentQuestionState.questionId === currentQuestion.id &&
    match.currentQuestionState.eliminatedIndices.includes(deps.selectedIndex)
  ) {
    return {
      ok: false,
      status: 400,
      error: 'OPTION_ELIMINATED',
      message: 'Esta alternativa foi eliminada pela ajuda das Cartas.',
    };
  }

  const step = getPrizeStep(match.currentLevel);
  const isCorrect = deps.selectedIndex === currentQuestion.correctIndex;
  const now = new Date().toISOString();

  match.answeredHistory.push({
    questionId: currentQuestion.id,
    level: match.currentLevel,
    selectedIndex: deps.selectedIndex,
    correctIndex: currentQuestion.correctIndex,
    isCorrect,
  });
  match.updatedAt = now;

  if (!isCorrect) {
    match.status = 'LOST';
    match.earnedPrize = step.wrongPrize;
    deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));
    appendHistory(deps.repo, deps.userId, match);
    return {
      ok: true,
      data: {
        isCorrect: false,
        correctIndex: currentQuestion.correctIndex,
        explanation: currentQuestion.explanation,
        referenceTip: currentQuestion.referenceTip,
        status: 'LOST',
        earnedPrize: match.earnedPrize,
        nextQuestion: null,
        prizeInfo: null,
        helps: null,
      },
    };
  }

  match.earnedPrize = step.winPrize;
  if (match.currentLevel === 16) {
    match.status = 'WON';
    deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));
    appendHistory(deps.repo, deps.userId, match);
    return {
      ok: true,
      data: {
        isCorrect: true,
        correctIndex: currentQuestion.correctIndex,
        explanation: currentQuestion.explanation,
        referenceTip: currentQuestion.referenceTip,
        status: 'WON',
        earnedPrize: 1_000_000,
        nextQuestion: null,
        prizeInfo: null,
        helps: null,
      },
    };
  }

  match.currentLevel += 1;
  const nextRaw = match.questions[match.currentLevel - 1];
  match.currentQuestionState = {
    questionId: nextRaw.id,
    eliminatedIndices: [],
    universitariosHint: null,
  };
  deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));

  return {
    ok: true,
    data: {
      isCorrect: true,
      correctIndex: currentQuestion.correctIndex,
      explanation: currentQuestion.explanation,
      referenceTip: currentQuestion.referenceTip,
      status: 'IN_PROGRESS',
      earnedPrize: match.earnedPrize,
      nextQuestion: sanitizeQuestion(nextRaw, match.currentLevel, match.currentQuestionState),
      prizeInfo: getPrizeStep(match.currentLevel),
      helps: buildClientHelps(match),
    },
  };
}

function buildUniversitariosHint(question: StoredMillionQuestion, block: MillionDifficultyBlock): UniversitariosHint {
  const wrongIndices = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
  const correctShare = block === 1 ? 76 : block === 2 ? 64 : 52;
  const remaining = 100 - correctShare;
  const firstWrong = Math.floor(remaining * 0.55);
  const secondWrong = Math.floor((remaining - firstWrong) * 0.65);
  const thirdWrong = remaining - firstWrong - secondWrong;

  const votes: [number, number, number, number] = [0, 0, 0, 0];
  votes[question.correctIndex] = correctShare;
  votes[wrongIndices[0]] = firstWrong;
  votes[wrongIndices[1]] = secondWrong;
  votes[wrongIndices[2]] = thirdWrong;

  const letters = ['A', 'B', 'C', 'D'];
  const leadIndex = votes.indexOf(Math.max(...votes));
  return {
    votes,
    summary: `Os universitários apontam tendência para a alternativa ${letters[leadIndex]} (${votes[leadIndex]}%), mas vale conferir o enunciado com calma.`,
  };
}

export function useMillionHelp(deps: {
  repo: UserStateStore;
  userId: string;
  matchId: string;
  questionId: string;
  helpType: MillionHelpType;
}): ServiceResult<HelpResult> {
  const loaded = loadActiveMatch(deps.repo, deps.userId, deps.matchId);
  if ('error' in loaded) return loaded;
  const match = loaded.data;

  if (match.currentLevel === 16) {
    return {
      ok: false,
      status: 409,
      error: 'HELP_DISABLED_AT_MILLION',
      message: 'Na pergunta do milhão as ajudas ficam bloqueadas!',
    };
  }

  const idx = match.currentLevel - 1;
  const currentQuestion = match.questions[idx];
  if (!currentQuestion || currentQuestion.id !== deps.questionId) {
    return {
      ok: false,
      status: 409,
      error: 'QUESTION_ALREADY_RESOLVED',
      message: 'Esta pergunta já foi respondida ou substituída.',
    };
  }

  const step = getPrizeStep(match.currentLevel);
  const blockKey = String(step.block) as '1' | '2' | '3';

  if (deps.helpType === 'cards') {
    if (match.helps.cardsUsed) {
      return { ok: false, status: 409, error: 'HELP_ALREADY_USED', message: 'A ajuda das Cartas já foi usada nesta partida.' };
    }
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== currentQuestion.correctIndex);
    // Shuffle deterministically with crypto.randomInt
    for (let i = wrongIndices.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(0, i + 1);
      [wrongIndices[i], wrongIndices[j]] = [wrongIndices[j], wrongIndices[i]];
    }
    const removeCount = crypto.randomInt(1, 4); // 1, 2, or 3 wrong options removed
    const eliminated = wrongIndices.slice(0, removeCount).sort((a, b) => a - b);
    match.helps.cardsUsed = true;
    match.currentQuestionState = {
      questionId: currentQuestion.id,
      eliminatedIndices: eliminated,
      universitariosHint:
        match.currentQuestionState.questionId === currentQuestion.id
          ? match.currentQuestionState.universitariosHint
          : null,
    };
  } else if (deps.helpType === 'universitarios') {
    if (match.helps.universitariosUsed) {
      return { ok: false, status: 409, error: 'HELP_ALREADY_USED', message: 'Os Universitários já foram consultados nesta partida.' };
    }
    match.helps.universitariosUsed = true;
    match.currentQuestionState = {
      questionId: currentQuestion.id,
      eliminatedIndices:
        match.currentQuestionState.questionId === currentQuestion.id
          ? match.currentQuestionState.eliminatedIndices
          : [],
      universitariosHint: buildUniversitariosHint(currentQuestion, step.block),
    };
  } else if (deps.helpType === 'skip') {
    if (match.helps.skipsUsedByBlock[blockKey]) {
      return {
        ok: false,
        status: 409,
        error: 'HELP_UNAVAILABLE_IN_BLOCK',
        message: 'Você já usou o pulo disponível neste bloco de dificuldade.',
      };
    }
    const reserve = match.reservesByBlock[blockKey];
    if (!reserve) {
      return {
        ok: false,
        status: 409,
        error: 'HELP_UNAVAILABLE_IN_BLOCK',
        message: 'Não há questão reserva disponível neste bloco.',
      };
    }
    match.questions[idx] = { ...reserve, level: match.currentLevel, block: step.block };
    match.reservesByBlock[blockKey] = null;
    match.helps.skipsUsed += 1;
    match.helps.skipsUsedByBlock[blockKey] = true;
    match.currentQuestionState = {
      questionId: reserve.id,
      eliminatedIndices: [],
      universitariosHint: null,
    };
  } else {
    return { ok: false, status: 400, error: 'INVALID_HELP_TYPE', message: 'Ajuda desconhecida.' };
  }

  match.updatedAt = new Date().toISOString();
  deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));

  const updatedQuestion = match.questions[idx];
  return {
    ok: true,
    data: {
      helpType: deps.helpType,
      eliminatedIndices: [...match.currentQuestionState.eliminatedIndices],
      universitariosHint: match.currentQuestionState.universitariosHint,
      question: sanitizeQuestion(updatedQuestion, match.currentLevel, match.currentQuestionState),
      helps: buildClientHelps(match),
    },
  };
}

export function stopMillionMatch(deps: {
  repo: UserStateStore;
  userId: string;
  matchId: string;
}): ServiceResult<StopResult> {
  const loaded = loadActiveMatch(deps.repo, deps.userId, deps.matchId);
  if ('error' in loaded) return loaded;
  const match = loaded.data;

  const step = getPrizeStep(match.currentLevel);
  const currentQuestion = match.questions[match.currentLevel - 1];
  match.status = 'STOPPED';
  match.earnedPrize = step.stopPrize;
  match.updatedAt = new Date().toISOString();

  deps.repo.upsertValue(deps.userId, MILLION_ACTIVE_KEY, JSON.stringify(match));
  appendHistory(deps.repo, deps.userId, match);

  return {
    ok: true,
    data: {
      status: 'STOPPED',
      earnedPrize: match.earnedPrize,
      correctIndex: currentQuestion.correctIndex,
      explanation: currentQuestion.explanation,
      referenceTip: currentQuestion.referenceTip,
    },
  };
}
