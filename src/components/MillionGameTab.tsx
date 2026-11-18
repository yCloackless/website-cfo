import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookMarked,
  CheckCircle2,
  Crown,
  Flame,
  GraduationCap,
  Hand,
  History,
  Layers,
  Mic,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Sparkles,
  Spade,
  Trophy,
  Volume2,
  VolumeX,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import { AppTheme } from '../types';
import { apiFetch } from '../services/apiFetch';
import { DEFAULT_CFO_SUBJECTS } from '../data/cfoSubjects';
import LatexRenderer from './LatexRenderer';
import { ConfirmModal } from './ConfirmModal';
import { PrizeLadder, formatBRL } from './million/PrizeLadder';
import {
  type AnswerResult,
  type MillionHelpType,
  type MillionStateResponse,
  type SanitizedActiveMatch,
  type SanitizedMillionQuestion,
  type StopResult,
} from '../utils/millionGameShared';
import { MILLION_PRESENTER_AUDIO_CONFIG } from '../config/millionPresenterAudio';
import { isMillionAudioMuted, playMillionCue, setMillionAudioMuted } from '../utils/millionAudio';

interface MillionGameTabProps {
  theme: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

interface ResolvedFeedback {
  question: SanitizedMillionQuestion;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean | null;
  explanation: string;
  referenceTip: string;
  nextResult?: AnswerResult;
  stopResult?: StopResult;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
const QUICK_TOPICS = [
  'História do Brasil',
  'Brasil República & Era Vargas',
  'Física: Eletrodinâmica',
  'Química: Estequiometria',
  'Matemática: Análise Combinatória',
  'Língua Portuguesa: Crase e Regência',
  'Geografia do Brasil',
  'Biologia: Ecologia e Citologia',
];

export const MillionGameTab: React.FC<MillionGameTabProps> = ({ theme, showToast }) => {
  const isDark = theme === 'dark';

  const [loadingState, setLoadingState] = useState(true);
  const [serverState, setServerState] = useState<MillionStateResponse>({
    activeMatch: null,
    stats: { bestPrize: 0, totalMatches: 0, wins: 0 },
    history: [],
  });
  const [activeMatch, setActiveMatch] = useState<SanitizedActiveMatch | null>(null);
  const [inGameView, setInGameView] = useState(false);

  const [topicInput, setTopicInput] = useState('História do Brasil');
  const [focusHintInput, setFocusHintInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isUsingHelp, setIsUsingHelp] = useState<MillionHelpType | null>(null);
  const [isStopping, setIsStopping] = useState(false);
  const [isStopConfirmOpen, setIsStopConfirmOpen] = useState(false);
  const [isAbandonConfirmOpen, setIsAbandonConfirmOpen] = useState(false);

  const [resolvedFeedback, setResolvedFeedback] = useState<ResolvedFeedback | null>(null);
  const [finalOutcome, setFinalOutcome] = useState<{
    status: 'WON' | 'LOST' | 'STOPPED';
    earnedPrize: number;
    topic: string;
    lastFeedback: ResolvedFeedback;
  } | null>(null);

  const [savedToAnkiIds, setSavedToAnkiIds] = useState<Record<string, boolean>>({});
  const [savingAnkiId, setSavingAnkiId] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => isMillionAudioMuted());

  const loadState = useCallback(async () => {
    try {
      setLoadingState(true);
      const res = await apiFetch('/api/million-game/state');
      if (!res.ok) return;
      const data = (await res.json()) as MillionStateResponse & { success?: boolean };
      setServerState({
        activeMatch: data.activeMatch || null,
        stats: data.stats || { bestPrize: 0, totalMatches: 0, wins: 0 },
        history: Array.isArray(data.history) ? data.history : [],
      });
      if (data.activeMatch) {
        setActiveMatch(data.activeMatch);
      }
    } catch {
      // Keep quiet on initial network hiccup
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMillionAudioMuted(next);
  };

  const handleStartMatch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanTopic = topicInput.trim();
    if (!cleanTopic) {
      showToast?.('Digite um conteúdo ou matéria para começar!', 'error');
      return;
    }
    if (isStarting) return;

    setIsStarting(true);
    try {
      const res = await apiFetch('/api/ai/million-game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: cleanTopic,
          focusHint: focusHintInput.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === 'ACTIVE_MATCH_EXISTS') {
        await loadState();
        setIsAbandonConfirmOpen(true);
        return;
      }
      if (!res.ok || !data.match) {
        showToast?.(data.message || 'Não foi possível gerar as perguntas agora.', 'error');
        return;
      }

      setActiveMatch(data.match);
      setResolvedFeedback(null);
      setFinalOutcome(null);
      setInGameView(true);
      playMillionCue('intro');
      showToast?.(`Show iniciado: 16 perguntas sobre ${cleanTopic}!`, 'success');
    } catch {
      showToast?.('Falha de conexão ao iniciar o Show do Milhão.', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const handleAnswer = useCallback(
    async (selectedIndex: number) => {
      if (!activeMatch || isAnswering || resolvedFeedback || isUsingHelp) return;
      const question = activeMatch.currentQuestion;
      if (question.eliminatedIndices.includes(selectedIndex)) return;

      setIsAnswering(true);
      try {
        const res = await apiFetch('/api/million-game/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: activeMatch.id,
            questionId: question.id,
            selectedIndex,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as AnswerResult & { message?: string };
        if (!res.ok) {
          showToast?.(data.message || 'Não foi possível validar sua resposta.', 'error');
          return;
        }

        const feedback: ResolvedFeedback = {
          question,
          selectedIndex,
          correctIndex: data.correctIndex,
          isCorrect: data.isCorrect,
          explanation: data.explanation,
          referenceTip: data.referenceTip,
          nextResult: data,
        };
        setResolvedFeedback(feedback);

        if (data.status === 'WON') {
          playMillionCue('millionWin');
        } else if (data.isCorrect) {
          playMillionCue('correct');
        } else {
          playMillionCue('wrong');
        }
      } catch {
        showToast?.('Erro de rede ao enviar resposta.', 'error');
      } finally {
        setIsAnswering(false);
      }
    },
    [activeMatch, isAnswering, isUsingHelp, resolvedFeedback, showToast]
  );

  const handleAdvanceAfterFeedback = () => {
    if (!activeMatch || !resolvedFeedback) return;
    const res = resolvedFeedback.nextResult;
    if (!res) return;

    if (res.status === 'WON' || res.status === 'LOST') {
      setFinalOutcome({
        status: res.status,
        earnedPrize: res.earnedPrize,
        topic: activeMatch.topic,
        lastFeedback: resolvedFeedback,
      });
      setActiveMatch(null);
      setResolvedFeedback(null);
      setInGameView(false);
      void loadState();
      return;
    }

    if (res.nextQuestion && res.prizeInfo && res.helps) {
      setActiveMatch({
        ...activeMatch,
        currentLevel: res.nextQuestion.level,
        earnedPrize: res.earnedPrize,
        currentQuestion: res.nextQuestion,
        prizeInfo: res.prizeInfo,
        helps: res.helps,
      });
      setResolvedFeedback(null);
      playMillionCue('nextQuestion');
    }
  };

  const handleUseHelp = async (helpType: MillionHelpType) => {
    if (!activeMatch || isUsingHelp || resolvedFeedback || isAnswering) return;
    setIsUsingHelp(helpType);
    try {
      const res = await apiFetch('/api/million-game/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: activeMatch.id,
          questionId: activeMatch.currentQuestion.id,
          helpType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(data.message || 'Ajuda indisponível nesta etapa.', 'error');
        return;
      }

      playMillionCue('help');
      setActiveMatch({
        ...activeMatch,
        currentQuestion: data.question,
        helps: data.helps,
      });

      if (helpType === 'cards') {
        showToast?.(`Cartas eliminaram ${data.eliminatedIndices?.length || 1} alternativa(s)!`, 'info');
      } else if (helpType === 'skip') {
        showToast?.('Pergunta pulada! Nova questão do mesmo bloco carregada.', 'info');
      } else if (helpType === 'universitarios') {
        showToast?.('Os universitários enviaram suas apostas!', 'info');
      }
    } catch {
      showToast?.('Falha de rede ao acionar ajuda.', 'error');
    } finally {
      setIsUsingHelp(null);
    }
  };

  const handleConfirmStop = async () => {
    if (!activeMatch || isStopping) return;
    setIsStopping(true);
    try {
      const res = await apiFetch('/api/million-game/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: activeMatch.id }),
      });
      const data = (await res.json().catch(() => ({}))) as StopResult & { message?: string };
      if (!res.ok) {
        showToast?.(data.message || 'Não foi possível parar a partida.', 'error');
        return;
      }
      playMillionCue('stop');
      const feedback: ResolvedFeedback = {
        question: activeMatch.currentQuestion,
        selectedIndex: null,
        correctIndex: data.correctIndex,
        isCorrect: null,
        explanation: data.explanation,
        referenceTip: data.referenceTip,
        stopResult: data,
      };
      setIsStopConfirmOpen(false);
      setIsAbandonConfirmOpen(false);
      setFinalOutcome({
        status: 'STOPPED',
        earnedPrize: data.earnedPrize,
        topic: activeMatch.topic,
        lastFeedback: feedback,
      });
      setActiveMatch(null);
      setResolvedFeedback(null);
      setInGameView(false);
      void loadState();
    } catch {
      showToast?.('Erro de rede ao encerrar partida.', 'error');
    } finally {
      setIsStopping(false);
    }
  };

  const handleSaveToErrorNotebook = async (feedback: ResolvedFeedback) => {
    const q = feedback.question;
    if (savedToAnkiIds[q.id] || savingAnkiId) return;
    setSavingAnkiId(q.id);

    try {
      const decksRes = await apiFetch('/api/anki/decks');
      const decksJson = await decksRes.json().catch(() => ({}));
      const decks = Array.isArray(decksJson.decks) ? decksJson.decks : [];
      const targetName = 'Show do Milhão::Erros';
      let deck = decks.find((d: any) => d.name === targetName);

      if (!deck) {
        const createDeckRes = await apiFetch('/api/anki/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: targetName,
            description: 'Questões erradas ou revisadas no Show do Milhão CFO CBMERJ',
          }),
        });
        const createdDeck = await createDeckRes.json().catch(() => ({}));
        deck = createdDeck.deck || createdDeck;
      }

      if (!deck?.id) {
        showToast?.('Não foi possível localizar ou criar o baralho no Caderno de Erros.', 'error');
        return;
      }

      const correctLetter = OPTION_LETTERS[feedback.correctIndex];
      const front = `[Show do Milhão • ${q.discipline} • Nível ${q.level}]\n\n${q.statement}\n\n${q.options
        .map((opt, i) => `${OPTION_LETTERS[i]}) ${opt}`)
        .join('\n')}`;
      const back = `Gabarito: ${correctLetter}) ${q.options[feedback.correctIndex]}\n\nExplicação:\n${feedback.explanation}${
        feedback.referenceTip ? `\n\nBizu CFO: ${feedback.referenceTip}` : ''
      }`;

      const noteRes = await apiFetch('/api/anki/notes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: deck.id,
          notes: [
            {
              fields: [front, back],
              tags: ['show-do-milhao', q.discipline.toLowerCase().replace(/\s+/g, '-')],
              importance: 'high',
            },
          ],
        }),
      });
      if (!noteRes.ok) {
        const err = await noteRes.json().catch(() => ({}));
        showToast?.(err.message || 'Erro ao salvar questão no Caderno de Erros.', 'error');
        return;
      }

      setSavedToAnkiIds((prev) => ({ ...prev, [q.id]: true }));
      showToast?.('Questão salva no baralho "Show do Milhão::Erros"!', 'success');
    } catch {
      showToast?.('Falha de rede ao salvar no Caderno de Erros.', 'error');
    } finally {
      setSavingAnkiId(null);
    }
  };

  // Atalhos de teclado (1-4 / A-D) quando jogando no palco
  useEffect(() => {
    if (!inGameView || !activeMatch || resolvedFeedback || isStopConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const key = event.key.toUpperCase();
      const map: Record<string, number> = { '1': 0, A: 0, '2': 1, B: 1, '3': 2, C: 2, '4': 3, D: 3 };
      if (key in map) {
        const idx = map[key];
        if (!activeMatch.currentQuestion.eliminatedIndices.includes(idx)) {
          event.preventDefault();
          void handleAnswer(idx);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeMatch, handleAnswer, inGameView, isStopConfirmOpen, resolvedFeedback]);

  const subjectChips = useMemo(() => {
    const names = new Set<string>(QUICK_TOPICS);
    for (const s of DEFAULT_CFO_SUBJECTS) {
      if (s.id !== 'revisao_questoes') names.add(s.name);
    }
    return Array.from(names).slice(0, 12);
  }, []);

  const presenterVoiceActive = useMemo(
    () =>
      MILLION_PRESENTER_AUDIO_CONFIG.enabled &&
      Object.values(MILLION_PRESENTER_AUDIO_CONFIG.clips).some(Boolean),
    []
  );

  // =========================================================================
  // PALCO DA PARTIDA (SHOW DO MILHÃO)
  // =========================================================================
  if (inGameView && activeMatch) {
    const q = activeMatch.currentQuestion;
    const info = activeMatch.prizeInfo;
    const helps = activeMatch.helps;

    return (
      <div className="space-y-5 animate-in fade-in duration-300">
        {/* Studio Shell */}
        <div className="relative overflow-hidden rounded-3xl border border-amber-400/35 bg-[#060b1c] text-slate-100 shadow-[0_24px_80px_rgba(3,7,18,0.75)]">
          {/* Holofotes radiais de estúdio */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(37,99,235,0.34),transparent_48%),radial-gradient(circle_at_85%_0%,rgba(245,158,11,0.22),transparent_45%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.14),transparent_55%)]"
          />

          <div className="relative p-4 sm:p-6 space-y-5">
            {/* Top Studio Bar */}
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 text-slate-950 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.45)] shrink-0">
                  <Crown className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300 border border-rose-500/35">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      Ao Vivo · Palco CFO
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-sky-300 border border-sky-400/30">
                      {q.blockLabel}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-white truncate mt-1">
                    {activeMatch.topic}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <div
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-slate-900/70 text-[11px] text-slate-300"
                  title="Configurável em src/config/millionPresenterAudio.ts"
                >
                  <Mic className={`w-3.5 h-3.5 ${presenterVoiceActive ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>{presenterVoiceActive ? 'Voz do Apresentador Ativa' : 'Slot de Voz Pronto'}</span>
                </div>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-2.5 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-amber-300 transition-colors cursor-pointer"
                  title={muted ? 'Ativar som do estúdio' : 'Silenciar som do estúdio'}
                  aria-label={muted ? 'Ativar som' : 'Silenciar som'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setInGameView(false)}
                  className="px-3 py-2 rounded-xl border border-slate-700/80 bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-slate-200 transition-colors cursor-pointer"
                >
                  Menu
                </button>
              </div>
            </header>

            {/* Stage Main Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              {/* Left 8 Cols: Question Monitor + Options + Lifelines + Feedback */}
              <div className="xl:col-span-8 space-y-4">
                {/* Question Monitor */}
                <div className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-[#0f2357] via-[#0a183d] to-[#08122d] p-5 sm:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_35px_rgba(0,0,0,0.45)]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
                      Pergunta {q.level} de 16 • Valendo {formatBRL(info.winPrize)}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-950/60 border border-sky-400/30 text-[11px] font-semibold text-sky-200">
                      {q.discipline}
                    </span>
                  </div>

                  <div className="text-base sm:text-lg font-semibold leading-relaxed text-white">
                    <LatexRenderer content={q.statement} />
                  </div>
                </div>

                {/* Universitarios Studio Panel */}
                {q.universitariosHint && (
                  <div className="rounded-2xl border border-sky-400/40 bg-sky-950/45 p-4 space-y-2.5 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-300">
                      <GraduationCap className="w-4 h-4" />
                      <span>Palpite dos Universitários</span>
                    </div>
                    <p className="text-xs text-slate-200">{q.universitariosHint.summary}</p>
                    <div className="grid grid-cols-4 gap-2 pt-1 tabular-nums">
                      {q.universitariosHint.votes.map((pct, i) => (
                        <div key={i} className="rounded-xl bg-slate-950/70 border border-sky-500/25 p-2 text-center">
                          <div className="text-[11px] font-black text-amber-300">{OPTION_LETTERS[i]}</div>
                          <div className="text-sm font-black text-white">{pct}%</div>
                          <div className="h-1.5 rounded-full bg-slate-800 mt-1 overflow-hidden">
                            <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4 Classic Studio Option Bars */}
                <div className="grid grid-cols-1 gap-2.5">
                  {q.options.map((optText, idx) => {
                    const isEliminated = q.eliminatedIndices.includes(idx);
                    const isRevealed = Boolean(resolvedFeedback);
                    const isCorrectOpt = isRevealed && resolvedFeedback?.correctIndex === idx;
                    const isSelectedWrong =
                      isRevealed &&
                      resolvedFeedback?.selectedIndex === idx &&
                      resolvedFeedback?.correctIndex !== idx;

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isEliminated || isAnswering || isRevealed}
                        onClick={() => void handleAnswer(idx)}
                        className={`group relative w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all flex items-center gap-3.5 ${
                          isCorrectOpt
                            ? 'border-emerald-400 bg-gradient-to-r from-emerald-700/60 via-emerald-600/45 to-emerald-700/60 text-white shadow-[0_0_24px_rgba(16,185,129,0.45)]'
                            : isSelectedWrong
                              ? 'border-rose-400 bg-gradient-to-r from-rose-800/65 via-rose-700/50 to-rose-800/65 text-white shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                              : isEliminated
                                ? 'border-slate-800 bg-slate-950/50 text-slate-600 opacity-45 line-through cursor-not-allowed'
                                : 'border-amber-400/35 bg-gradient-to-r from-[#0d1c45] via-[#12265c] to-[#0d1c45] hover:border-amber-300 hover:from-[#16306e] hover:to-[#16306e] hover:shadow-[0_0_22px_rgba(251,191,36,0.22)] text-slate-100 cursor-pointer'
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                            isCorrectOpt
                              ? 'bg-emerald-400 text-slate-950'
                              : isSelectedWrong
                                ? 'bg-rose-400 text-slate-950'
                                : isEliminated
                                  ? 'bg-slate-800 text-slate-500'
                                  : 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 shadow-md'
                          }`}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>

                        <div className="flex-1 min-w-0 text-sm sm:text-[15px] font-semibold leading-snug">
                          <LatexRenderer content={optText} />
                        </div>

                        {isCorrectOpt && <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />}
                        {isSelectedWrong && <XCircle className="w-5 h-5 text-rose-300 shrink-0" />}
                        {!isRevealed && !isEliminated && (
                          <span className="hidden sm:inline text-[10px] font-mono text-amber-300/60 shrink-0">
                            [{idx + 1}]
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Lifelines Bar (Ajudas & Parar) */}
                {!resolvedFeedback && (
                  <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!helps.cardsAvailable || Boolean(isUsingHelp) || isAnswering}
                        onClick={() => void handleUseHelp('cards')}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-amber-400/35 bg-[#0f1f4d] hover:bg-[#182e6e] text-xs font-bold text-amber-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Spade className="w-4 h-4 text-amber-300" />
                        <span>{isUsingHelp === 'cards' ? 'Tirando cartas...' : 'Cartas'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!helps.skipAvailableInCurrentBlock || Boolean(isUsingHelp) || isAnswering}
                        onClick={() => void handleUseHelp('skip')}
                        title={
                          helps.disabledAtMillion
                            ? 'Bloqueado na pergunta do milhão'
                            : helps.skipAvailableInCurrentBlock
                              ? '1 pulo disponível neste bloco'
                              : 'Pulo deste bloco já utilizado'
                        }
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-sky-400/35 bg-[#0f1f4d] hover:bg-[#182e6e] text-xs font-bold text-sky-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <SkipForward className="w-4 h-4 text-sky-300" />
                        <span>
                          {isUsingHelp === 'skip'
                            ? 'Pulando...'
                            : `Pular (${helps.skipsRemainingTotal} rest.)`}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={!helps.universitariosAvailable || Boolean(isUsingHelp) || isAnswering}
                        onClick={() => void handleUseHelp('universitarios')}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-indigo-400/35 bg-[#0f1f4d] hover:bg-[#182e6e] text-xs font-bold text-indigo-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <GraduationCap className="w-4 h-4 text-indigo-300" />
                        <span>{isUsingHelp === 'universitarios' ? 'Consultando...' : 'Universitários'}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={isStopping || isAnswering}
                      onClick={() => setIsStopConfirmOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-400/45 bg-rose-950/60 hover:bg-rose-900/70 text-xs font-black uppercase tracking-wider text-rose-200 transition-all cursor-pointer disabled:opacity-40"
                    >
                      <Hand className="w-4 h-4" />
                      <span>Parar ({formatBRL(info.stopPrize)})</span>
                    </button>
                  </div>
                )}

                {helps.disabledAtMillion && !resolvedFeedback && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-200 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />
                    <span>
                      <strong>Pergunta do Milhão!</strong> Ajudas bloqueadas: acertar garante R$ 1.000.000, parar garante {formatBRL(info.stopPrize)} e errar zera o prêmio.
                    </span>
                  </div>
                )}

                {/* Immediate Explanation & Learning Card */}
                {resolvedFeedback && (
                  <div
                    className={`rounded-2xl border-2 p-5 space-y-3 animate-in fade-in duration-200 ${
                      resolvedFeedback.isCorrect
                        ? 'border-emerald-400/50 bg-emerald-950/45'
                        : 'border-rose-400/50 bg-rose-950/45'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {resolvedFeedback.isCorrect ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-rose-400" />
                        )}
                        <h4 className="text-sm font-black uppercase tracking-wider text-white">
                          {resolvedFeedback.isCorrect
                            ? `Certa resposta! +${formatBRL(resolvedFeedback.nextResult?.earnedPrize || 0)}`
                            : `Resposta errada! Gabarito: ${OPTION_LETTERS[resolvedFeedback.correctIndex]}`}
                        </h4>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(savedToAnkiIds[q.id]) || savingAnkiId === q.id}
                        onClick={() => void handleSaveToErrorNotebook(resolvedFeedback)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/40 bg-slate-950/70 hover:bg-slate-900 text-xs font-bold text-amber-200 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <BookMarked className="w-3.5 h-3.5" />
                        <span>
                          {savedToAnkiIds[q.id]
                            ? 'Salvo no Caderno de Erros'
                            : savingAnkiId === q.id
                              ? 'Salvando...'
                              : 'Salvar no Caderno de Erros'}
                        </span>
                      </button>
                    </div>

                    <div className="text-xs sm:text-sm leading-relaxed text-slate-200 space-y-2">
                      <LatexRenderer content={resolvedFeedback.explanation} />
                      {resolvedFeedback.referenceTip && (
                        <p className="rounded-xl border border-amber-400/25 bg-slate-950/50 px-3 py-2 text-xs text-amber-200">
                          <strong>Bizu CFO:</strong> <LatexRenderer content={resolvedFeedback.referenceTip} />
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleAdvanceAfterFeedback}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-500/25 cursor-pointer"
                      >
                        <span>
                          {resolvedFeedback.nextResult?.status === 'IN_PROGRESS'
                            ? 'Próxima Pergunta'
                            : 'Ver Resultado Final'}
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right 4 Cols: Classic Prize Ladder */}
              <div className="xl:col-span-4">
                <PrizeLadder currentLevel={activeMatch.currentLevel} currentPrizeInfo={info} />
              </div>
            </div>
          </div>
        </div>

        <ConfirmModal
          isOpen={isStopConfirmOpen}
          title="Parar e levar o prêmio?"
          description={`Você garante ${formatBRL(info.stopPrize)} e encerra a partida atual sobre "${activeMatch.topic}".`}
          badgeText={`Prêmio de Parada: ${formatBRL(info.stopPrize)}`}
          confirmLabel="Parar e Garantir Prêmio"
          cancelLabel="Continuar Jogando"
          variant="warning"
          iconType="warning"
          theme="dark"
          loading={isStopping}
          onConfirm={() => void handleConfirmStop()}
          onClose={() => {
            if (!isStopping) setIsStopConfirmOpen(false);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // LOBBY + RESULTADO FINAL + HISTÓRICO
  // =========================================================================
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Resultado Final (se acabou de terminar uma partida) */}
      {finalOutcome && (
        <div
          className={`relative overflow-hidden rounded-3xl border-2 p-6 shadow-2xl ${
            finalOutcome.status === 'WON'
              ? 'border-amber-300 bg-gradient-to-br from-[#1b1404] via-[#0a1430] to-[#1b1404] text-white'
              : 'border-sky-500/35 bg-[#091229] text-slate-100'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/35">
                <Trophy className="w-3.5 h-3.5" />
                <span>
                  {finalOutcome.status === 'WON'
                    ? 'VOCÊ CONQUISTOU O MILHÃO!'
                    : finalOutcome.status === 'STOPPED'
                      ? 'Você decidiu parar com segurança'
                      : 'Fim de jogo'}
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-amber-300 tabular-nums">
                Prêmio Final: {formatBRL(finalOutcome.earnedPrize)}
              </h3>
              <p className="text-xs text-slate-300">
                Tema: <strong>{finalOutcome.topic}</strong> • Última pergunta (Nível {finalOutcome.lastFeedback.question.level}/16)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                disabled={
                  Boolean(savedToAnkiIds[finalOutcome.lastFeedback.question.id]) ||
                  savingAnkiId === finalOutcome.lastFeedback.question.id
                }
                onClick={() => void handleSaveToErrorNotebook(finalOutcome.lastFeedback)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-400/40 bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-amber-200 cursor-pointer disabled:opacity-60"
              >
                <BookMarked className="w-4 h-4" />
                <span>
                  {savedToAnkiIds[finalOutcome.lastFeedback.question.id]
                    ? 'Salvo no Caderno de Erros'
                    : 'Salvar Última no Caderno de Erros'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFinalOutcome(null)}
                className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Fechar Resumo
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-200 space-y-1.5">
            <p className="font-bold text-amber-300">
              Gabarito ({OPTION_LETTERS[finalOutcome.lastFeedback.correctIndex]}):{' '}
              {finalOutcome.lastFeedback.question.options[finalOutcome.lastFeedback.correctIndex]}
            </p>
            <LatexRenderer content={finalOutcome.lastFeedback.explanation} />
          </div>
        </div>
      )}

      {/* Hero Stage Launcher */}
      <section className="relative overflow-hidden rounded-3xl border border-amber-400/35 bg-[#070e24] text-slate-100 p-5 sm:p-8 shadow-[0_20px_70px_rgba(3,7,18,0.55)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(37,99,235,0.35),transparent_48%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.22),transparent_45%)]"
        />

        <div className="relative space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 text-slate-950 flex items-center justify-center shadow-[0_0_32px_rgba(245,158,11,0.45)] shrink-0">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400/15 text-amber-300 border border-amber-400/35">
                    Minigame Interativo IA
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-sky-300 border border-sky-400/30">
                    16 Perguntas • 4 Blocos de Dificuldade
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1.5">
                  Show do Milhão CFO CBMERJ
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl mt-1 leading-relaxed">
                  Escolha qualquer tema do edital ou vestibular. A IA monta na hora uma trilha inédita de{' '}
                  <strong className="text-amber-300">R$ 1 mil até R$ 1 milhão</strong> com Cartas, Pulos, Universitários e explicação de banca após cada jogada.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-xs font-bold text-amber-200 cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{muted ? 'Som Mudo' : 'Som Ativo'}</span>
              </button>
            </div>
          </div>

          {/* Retomada de partida em andamento */}
          {activeMatch && (
            <div className="rounded-2xl border border-amber-400/50 bg-amber-950/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  Partida em Andamento
                </p>
                <p className="text-sm font-bold text-white">
                  {activeMatch.topic} — Pergunta {activeMatch.currentLevel}/16 (Valendo{' '}
                  {formatBRL(activeMatch.prizeInfo.winPrize)})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setInGameView(true);
                    playMillionCue('intro');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black uppercase tracking-wider cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Continuar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAbandonConfirmOpen(true)}
                  className="px-3.5 py-2 rounded-xl border border-rose-400/40 bg-rose-950/60 hover:bg-rose-900/70 text-xs font-bold text-rose-200 cursor-pointer"
                >
                  Encerrar Atual
                </button>
              </div>
            </div>
          )}

          {/* Formulário de novo jogo */}
          <form onSubmit={(e) => void handleStartMatch(e)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                  Conteúdo ou Matéria
                </label>
                <input
                  type="text"
                  value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)}
                  maxLength={180}
                  disabled={isStarting}
                  placeholder="Ex: História do Brasil, Termoquímica, Eletrodinâmica, Crase..."
                  className="w-full px-4 py-3 rounded-xl border border-amber-400/35 bg-slate-950/80 text-sm font-semibold text-white placeholder:text-slate-500 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-400/25"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-sky-300 mb-1.5">
                  Foco / Banca (Opcional)
                </label>
                <input
                  type="text"
                  value={focusHintInput}
                  onChange={(e) => setFocusHintInput(e.target.value)}
                  maxLength={300}
                  disabled={isStarting}
                  placeholder="Ex: UERJ, Primeiro Reinado, contas..."
                  className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-950/80 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-400"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {subjectChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setTopicInput(chip)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${
                    topicInput === chip
                      ? 'border-amber-300 bg-amber-400/20 text-amber-200'
                      : 'border-slate-700/80 bg-slate-900/70 hover:border-amber-400/40 text-slate-300'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  19 questões geradas na hora (16 principais + 3 reservas de pulo) • Slot de voz preparado em{' '}
                  <code className="text-amber-300/90">millionPresenterAudio.ts</code>
                </span>
              </div>

              <button
                type="submit"
                disabled={isStarting}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 text-xs sm:text-sm font-black uppercase tracking-wider shadow-[0_0_28px_rgba(245,158,11,0.35)] transition-all cursor-pointer disabled:opacity-60"
              >
                {isStarting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Preparando Palco (16 Perguntas)...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Valendo! Iniciar Show do Milhão</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* KPIs & Histórico */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Recorde Pessoal</span>
            <Crown className="w-4 h-4" />
          </div>
          <p className={`text-2xl font-black mt-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {formatBRL(serverState.stats.bestPrize)}
          </p>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Partidas Jogadas</span>
            <Layers className="w-4 h-4" />
          </div>
          <p className={`text-2xl font-black mt-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {serverState.stats.totalMatches}
          </p>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-[10px] font-bold uppercase tracking-wider">Vitórias (R$ 1M)</span>
            <Award className="w-4 h-4" />
          </div>
          <p className={`text-2xl font-black mt-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {serverState.stats.wins}
          </p>
        </div>
      </div>

      {/* Histórico Recente */}
      <section
        className={`rounded-2xl border p-5 space-y-3 ${
          isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-400" />
            <h3 className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              Histórico de Partidas
            </h3>
          </div>
          {loadingState && <span className="text-[11px] text-slate-400">Carregando...</span>}
        </div>

        {serverState.history.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">
            Nenhuma partida finalizada ainda. Escolha um tema acima e entre no palco!
          </p>
        ) : (
          <div className="space-y-2 tabular-nums">
            {serverState.history.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                  isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-xs sm:text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                    {item.topic}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Nível {item.reachedLevel}/16 • {item.correctCount} acerto(s) •{' '}
                    {new Date(item.finishedAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      item.status === 'WON'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : item.status === 'STOPPED'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {item.status === 'WON' ? 'Ganhou 1M' : item.status === 'STOPPED' ? 'Parou' : 'Errou'}
                  </span>
                  <span className="text-sm font-black text-amber-400">{formatBRL(item.earnedPrize)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={isAbandonConfirmOpen}
        title="Encerrar partida em andamento?"
        description={
          activeMatch
            ? `Você já tem uma partida em andamento ("${activeMatch.topic}" — Pergunta ${activeMatch.currentLevel}/16). Ao encerrá-la agora, será creditado o prêmio de parada (${formatBRL(activeMatch.prizeInfo.stopPrize)}).`
            : undefined
        }
        confirmLabel="Encerrar Partida Atual"
        cancelLabel="Voltar"
        variant="warning"
        iconType="warning"
        theme={theme}
        loading={isStopping}
        onConfirm={() => void handleConfirmStop()}
        onClose={() => {
          if (!isStopping) setIsAbandonConfirmOpen(false);
        }}
      />
    </div>
  );
};
