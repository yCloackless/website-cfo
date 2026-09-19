import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../services/apiFetch';
import {
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Flag,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  X,
  XCircle,
  Download,
  Monitor,
  Puzzle,
} from 'lucide-react';
import { AppTheme } from '../types';
import { getUserStorageKey } from '../utils/userStorage';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../components/ui/dialog';
import {
  calculateLevelingAccuracy,
  clampLevelingCount,
  hasPassedLeveling,
  MAX_LEVELING_QUESTIONS,
  requiredLevelingCorrect,
} from '../utils/leveling';

const ExtensionModal = React.lazy(() => import('./ExtensionModal').then(({ ExtensionModal }) => ({ default: ExtensionModal })));

type Mode = 'live' | 'manual';
type Answer = 'correct' | 'wrong';

interface SavedLevelingState {
  mode: Mode;
  total: number;
  answers: Answer[];
  manualCorrect: number;
  manualWrong: number;
  started: boolean;
}

interface CompletionState {
  correct: number;
  total: number;
}

interface LevelingTabProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const GOAL = 80;
const STORAGE_KEY = 'cfo_leveling_session';
const CONFETTI_COLORS = ['#fbbf24', '#38bdf8', '#34d399', '#fb7185', '#a78bfa', '#f97316'];

const Confetti = () => (
  <div className="nivelamento-confetti" aria-hidden="true">
    {Array.from({ length: 54 }, (_, index) => (
      <i
        key={index}
        style={{
          '--confetti-left': `${(index * 37) % 101}%`,
          '--confetti-delay': `${(index % 11) * -0.18}s`,
          '--confetti-rotate': `${(index * 43) % 360}deg`,
          '--confetti-color': CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          '--confetti-width': `${7 + (index % 4) * 2}px`,
        } as React.CSSProperties}
      />
    ))}
  </div>
);

export const LevelingTab: React.FC<LevelingTabProps> = ({ theme = 'dark', showToast }) => {
  const isDark = theme === 'dark';
  const [mode, setMode] = useState<Mode>('live');
  const [totalInput, setTotalInput] = useState('30');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [started, setStarted] = useState(false);
  const [manualCorrect, setManualCorrect] = useState('');
  const [manualWrong, setManualWrong] = useState('');
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getUserStorageKey(STORAGE_KEY));
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<SavedLevelingState>;
      const savedTotal = clampLevelingCount(saved.total);
      const savedCorrect = clampLevelingCount(saved.manualCorrect);
      const savedWrong = clampLevelingCount(saved.manualWrong, MAX_LEVELING_QUESTIONS - savedCorrect);
      if (saved.mode === 'live' || saved.mode === 'manual') setMode(saved.mode);
      if (savedTotal > 0) setTotalInput(String(savedTotal));
      if (Array.isArray(saved.answers) && saved.answers.every((item) => item === 'correct' || item === 'wrong')) {
        setAnswers(saved.answers.slice(0, savedTotal));
      }
      if (savedCorrect > 0) setManualCorrect(String(savedCorrect));
      if (savedWrong > 0) setManualWrong(String(savedWrong));
      setStarted(Boolean(saved.started && savedTotal > 0));
    } catch {
      // A malformed local snapshot must never prevent the leveling page from opening.
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Sincronização em nuvem com a extensão de navegador CFO CBMERJ
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await apiFetch('/api/leveling/session');
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        if (data?.session && Array.isArray(data.session.answers) && data.session.answers.length > 0) {
          const s = data.session;
          const sTotal = clampLevelingCount(s.total);
          if (sTotal > 0) {
            setTotalInput(String(sTotal));
            setAnswers(s.answers.slice(0, sTotal));
            setStarted(Boolean(s.started && sTotal > 0));
            if (s.mode === 'live' || s.mode === 'manual') setMode(s.mode);
            if (s.manualCorrect) setManualCorrect(String(clampLevelingCount(s.manualCorrect)));
            if (s.manualWrong) setManualWrong(String(clampLevelingCount(s.manualWrong)));
          }
        }
      } catch {
        // Fallback transparente para o armazenamento local
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const total = clampLevelingCount(totalInput);
  const correct = answers.filter((answer) => answer === 'correct').length;
  const wrong = answers.length - correct;
  const answered = answers.length;
  const accuracy = calculateLevelingAccuracy(correct, answered);
  const isComplete = started && total > 0 && answered === total;
  const requiredCorrect = requiredLevelingCorrect(total, GOAL);
  const isGoalSecured = total > 0 && correct >= requiredCorrect;
  const remaining = Math.max(total - answered, 0);
  const manualCorrectNumber = clampLevelingCount(manualCorrect);
  const manualWrongNumber = clampLevelingCount(manualWrong, MAX_LEVELING_QUESTIONS - manualCorrectNumber);
  const manualTotal = manualCorrectNumber + manualWrongNumber;

  const normalizeCountInput = (value: string, maximum = MAX_LEVELING_QUESTIONS) => {
    if (value === '') return '';
    return String(clampLevelingCount(value, maximum));
  };

  useEffect(() => {
    if (!isHydrated) return;
    const snapshot: SavedLevelingState = {
      mode,
      total,
      answers,
      manualCorrect: manualCorrectNumber,
      manualWrong: manualWrongNumber,
      started,
    };
    try {
      localStorage.setItem(getUserStorageKey(STORAGE_KEY), JSON.stringify(snapshot));
    } catch {
      // Local persistence is a convenience; the active session remains usable without it.
    }
    const syncTimer = setTimeout(() => {
      apiFetch('/api/leveling/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(syncTimer);
  }, [answers, isHydrated, manualCorrectNumber, manualWrongNumber, mode, started, total]);

  const goalStatus = useMemo(() => {
    if (!answered) return `Meta de ${GOAL}%`;
    if (isGoalSecured) return 'Meta assegurada';
    const needed = Math.max(requiredCorrect - correct, 0);
    return needed ? `Faltam ${needed} acerto${needed > 1 ? 's' : ''} para a meta` : `Meta de ${GOAL}%`;
  }, [answered, correct, isGoalSecured, requiredCorrect]);

  const startSession = () => {
    if (total < 1) {
      showToast?.('Defina pelo menos 1 questão para iniciar.', 'error');
      return;
    }
    setAnswers([]);
    setStarted(true);
    setCompletion(null);
  };

  const registerAnswer = (answer: Answer) => {
    if (!started || answered >= total) return;
    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    if (nextAnswers.length === total) {
      const nextCorrect = nextAnswers.filter((item) => item === 'correct').length;
      setCompletion({ correct: nextCorrect, total });
    }
  };

  const undoAnswer = () => {
    if (!answers.length) return;
    setAnswers((current) => current.slice(0, -1));
    setCompletion(null);
  };

  const resetSession = () => {
    setAnswers([]);
    setStarted(false);
    setCompletion(null);
  };

  const confirmManualResult = () => {
    if (!manualTotal) {
      showToast?.('Informe seus acertos e/ou erros.', 'error');
      return;
    }

    const manualAnswers: Answer[] = [
      ...Array.from({ length: manualCorrectNumber }, () => 'correct' as const),
      ...Array.from({ length: manualWrongNumber }, () => 'wrong' as const),
    ];
    setTotalInput(String(manualTotal));
    setAnswers(manualAnswers);
    setStarted(true);
    setCompletion({ correct: manualCorrectNumber, total: manualTotal });
  };

  const showAnswerCard = () => {
    setMode('live');
    setCompletion(null);
  };

  const completionAccuracy = completion ? calculateLevelingAccuracy(completion.correct, completion.total) : 0;
  const completionPassed = completion ? hasPassedLeveling(completion.correct, completion.total, GOAL) : false;

  return (
    <div className="nivelamento-page animate-in fade-in duration-300 pb-12">
      <style>{`
        @keyframes nivelamento-fall {
          0% { transform: translate3d(0, -12vh, 0) rotate(var(--confetti-rotate)); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate3d(8vw, 114vh, 0) rotate(calc(var(--confetti-rotate) + 720deg)); opacity: 0; }
        }
        @keyframes nivelamento-trophy { 0% { transform: scale(.35) rotate(-16deg); opacity: 0; } 65% { transform: scale(1.13) rotate(5deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes nivelamento-glow { 0%,100% { opacity: .38; transform: scale(.9); } 50% { opacity: .78; transform: scale(1.12); } }
        .nivelamento-confetti { position: fixed; inset: 0; overflow: hidden; pointer-events: none; z-index: 80; }
        .nivelamento-confetti i { position: absolute; top: 0; left: var(--confetti-left); width: var(--confetti-width); height: 16px; border-radius: 2px; background: var(--confetti-color); animation: nivelamento-fall 3.7s cubic-bezier(.13,.76,.38,1) var(--confetti-delay) both; }
        .nivelamento-trophy { animation: nivelamento-trophy .65s cubic-bezier(.22,1,.36,1) both; }
        .nivelamento-glow { animation: nivelamento-glow 2.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .nivelamento-confetti { display: none; }
          .nivelamento-trophy, .nivelamento-glow { animation: none; }
        }
      `}</style>

      <section className={`relative overflow-hidden rounded-[2rem] border px-5 py-7 sm:px-8 sm:py-9 ${
        isDark ? 'border-white/10 bg-[#090d18] shadow-2xl shadow-blue-950/30' : 'border-slate-200 bg-white shadow-xl shadow-slate-200/70'
      }`}>
        <div className="absolute inset-0 opacity-70" style={{ background: isDark ? 'radial-gradient(circle at 85% -10%, rgba(66, 133, 255, .34), transparent 35%), radial-gradient(circle at 0% 115%, rgba(112, 52, 255, .22), transparent 42%)' : 'radial-gradient(circle at 92% 0%, rgba(65, 130, 255, .18), transparent 34%)' }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-blue-300">
              <Sparkles size={14} /> Sua missão de precisão
            </div>
            <h1 className={`text-3xl font-black tracking-[-0.055em] sm:text-5xl ${isDark ? 'text-white' : 'text-slate-950'}`}>Nivelamento</h1>
            <p className={`mt-3 max-w-xl text-base leading-relaxed sm:text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Faça sua bateria, marque cada resultado e persiga o seu padrão: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{GOAL}% de acerto.</strong>
            </p>
          </div>
          <div className={`flex min-w-[190px] items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white/70'}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-blue-600/30"><Target size={20} /></div>
            <div><p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Meta mínima</p><p className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-950'}`}>{GOAL}%</p></div>
          </div>
        </div>
      </section>

      {/* Banner Exclusivo para Computador (oculto no mobile): Download e Conexão da Extensão */}
      <div className={`mt-5 hidden md:flex items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 transition-all ${
        isDark ? 'border-blue-500/25 bg-blue-950/20 text-white' : 'border-blue-200 bg-blue-50/70 text-slate-900'
      }`}>
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl overflow-hidden border border-amber-500/40 shadow-md shadow-orange-500/20 bg-black/40">
            <img src="/rumo-ao-cfo-emblem.png" alt="Rumo ao CFO" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black tracking-tight">Estude em sites de questões com a Extensão Oficial</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase">
                <Monitor size={10} /> Computador
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Resolva no QConcursos ou TEC com botões de Certa/Errada sincronizados em tempo real com este Nivelamento.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExtensionModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-blue-600/20 transition hover:scale-[1.02] shrink-0"
        >
          <Download size={15} /> Baixar Extensão (.ZIP)
        </button>
      </div>

      <div className={`mt-6 grid w-full grid-cols-2 rounded-2xl border p-1.5 sm:inline-grid sm:w-auto ${isDark ? 'border-white/10 bg-slate-950/80' : 'border-slate-200 bg-slate-100'}`} role="tablist" aria-label="Modo de lançamento">
        {([
          ['live', 'Responder agora', Play],
          ['manual', 'Lançar resultado', Award],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} id={`nivelamento-tab-${value}`} type="button" role="tab" aria-controls={`nivelamento-panel-${value}`} aria-selected={mode === value} onClick={() => { setMode(value); setCompletion(null); }} className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-bold transition-all sm:px-5 ${mode === value ? (isDark ? 'bg-white text-slate-950 shadow-lg' : 'bg-white text-slate-950 shadow-md') : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950')}`}><Icon size={16} className="shrink-0" /><span className="truncate">{label}</span></button>
        ))}
      </div>

      {mode === 'live' ? (
        <section id="nivelamento-panel-live" role="tabpanel" aria-labelledby="nivelamento-tab-live" className={`mt-5 overflow-hidden rounded-[2rem] border ${isDark ? 'border-white/10 bg-[#0b1020]' : 'border-slate-200 bg-white shadow-xl shadow-slate-200/50'}`}>
          <div className={`flex flex-col gap-5 border-b p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Quantas questões você vai fazer?</p>
              <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>A cada resposta, marque se acertou ou errou. Os quadrados acompanham tudo.</p>
            </div>
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <label className="sr-only" htmlFor="nivelamento-total">Quantidade de questões</label>
              <input id="nivelamento-total" type="number" min="1" max={MAX_LEVELING_QUESTIONS} inputMode="numeric" value={totalInput} disabled={started} onChange={(event) => setTotalInput(normalizeCountInput(event.target.value))} className={`h-12 w-full rounded-xl border px-4 text-lg font-black outline-none transition focus:ring-4 focus:ring-blue-500/20 sm:w-32 ${isDark ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-600' : 'border-slate-200 bg-slate-50 text-slate-950'}`} />
              {!started ? <button type="button" onClick={startSession} className="flex h-12 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:scale-[1.02] active:scale-[.98]"><Play size={16} fill="currentColor" /> Iniciar</button> : <button type="button" onClick={resetSession} className={`flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><RotateCcw size={16} /> Reiniciar</button>}
            </div>
          </div>

          {started ? <div className="p-5 sm:p-7">
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="mb-2 flex items-center justify-between gap-4"><p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Progresso da missão</p><span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-950'}`}>{answered} / {total}</span></div>
                <div role="progressbar" aria-label="Progresso do nivelamento" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} className={`h-3 overflow-hidden rounded-full ${isDark ? 'bg-white/10' : 'bg-slate-100'}`}><div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-400 transition-all duration-500" style={{ width: `${total ? (answered / total) * 100 : 0}%` }} /></div>
              </div>
              <div className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${isGoalSecured ? 'bg-emerald-500/15 text-emerald-400' : isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{goalStatus}</div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3" aria-live="polite">
              <Metric title="Acertos" value={correct} icon={<CheckCircle2 size={18} />} color="emerald" isDark={isDark} />
              <Metric title="Erros" value={wrong} icon={<XCircle size={18} />} color="rose" isDark={isDark} />
              <Metric title="Aproveitamento" value={`${accuracy}%`} icon={<Target size={18} />} color="blue" isDark={isDark} />
            </div>

            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between"><p className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Seu cartão-resposta</p><span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{remaining ? `${remaining} pendente${remaining > 1 ? 's' : ''}` : 'Bateria finalizada'}</span></div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2" role="list" aria-label="Cartão-resposta do nivelamento">
                {Array.from({ length: total }, (_, index) => {
                  const answer = answers[index];
                  const answerLabel = answer === 'correct' ? `Questão ${index + 1}: acertou` : answer === 'wrong' ? `Questão ${index + 1}: errou` : `Questão ${index + 1}: pendente`;
                  return <div key={index} role="listitem" aria-label={answerLabel} title={answerLabel} className={`flex aspect-square items-center justify-center rounded-lg border text-xs font-black transition-all ${answer === 'correct' ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/10' : answer === 'wrong' ? 'border-rose-400/40 bg-rose-500/20 text-rose-400 shadow-sm shadow-rose-500/10' : isDark ? 'border-white/10 bg-white/[.03] text-slate-600' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>{answer === 'correct' ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : answer === 'wrong' ? <X size={16} strokeWidth={3} aria-hidden="true" /> : index + 1}</div>;
                })}
              </div>
            </div>

            {!isComplete && <div className={`mt-7 grid gap-3 border-t pt-5 sm:grid-cols-3 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
              <button type="button" onClick={() => registerAnswer('correct')} disabled={answered >= total} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-5 text-base font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:-translate-y-0.5 hover:bg-emerald-400 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={22} /> Acertei</button>
              <button type="button" onClick={() => registerAnswer('wrong')} disabled={answered >= total} className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-rose-500 px-5 text-base font-black text-white shadow-lg shadow-rose-500/20 transition hover:-translate-y-0.5 hover:bg-rose-400 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"><XCircle size={22} /> Errei</button>
              <button type="button" onClick={undoAnswer} disabled={!answered} className={`flex min-h-16 items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><ChevronLeft size={18} /> Desfazer última</button>
            </div>}
          </div> : <div className={`flex min-h-72 flex-col items-center justify-center px-5 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><CircleDashed size={36} strokeWidth={1.4} /><p className={`mt-4 text-base font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Pronto para medir seu nível?</p><p className="mt-1 text-sm">Defina a quantidade e toque em “Iniciar”.</p></div>}
        </section>
      ) : (
        <section id="nivelamento-panel-manual" role="tabpanel" aria-labelledby="nivelamento-tab-manual" className={`mt-5 overflow-hidden rounded-[2rem] border p-5 sm:p-8 ${isDark ? 'border-white/10 bg-[#0b1020]' : 'border-slate-200 bg-white shadow-xl shadow-slate-200/50'}`}>
          <div className="max-w-xl"><h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>Lançamento rápido</h2><p className={`mt-2 text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Já terminou a bateria? Informe somente seus acertos e erros. O total e o desempenho são calculados automaticamente.</p></div>
          <div className="mt-7 grid max-w-2xl gap-4 sm:grid-cols-2">
            <NumberField id="nivelamento-acertos" label="Quantas você acertou?" value={manualCorrect} onChange={(value) => setManualCorrect(normalizeCountInput(value, MAX_LEVELING_QUESTIONS - manualWrongNumber))} icon={<CheckCircle2 size={20} />} color="emerald" isDark={isDark} />
            <NumberField id="nivelamento-erros" label="Quantas você errou?" value={manualWrong} onChange={(value) => setManualWrong(normalizeCountInput(value, MAX_LEVELING_QUESTIONS - manualCorrectNumber))} icon={<XCircle size={20} />} color="rose" isDark={isDark} />
          </div>
          <div className={`mt-5 flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[.03]' : 'border-slate-100 bg-slate-50'}`}><Flag size={19} className="text-blue-400" /><span className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Total calculado: <strong className={isDark ? 'text-white' : 'text-slate-950'}>{manualTotal} questões</strong></span>{manualTotal > 0 && <span className={`rounded-full px-2.5 py-1 text-xs font-black ${hasPassedLeveling(manualCorrectNumber, manualTotal, GOAL) ? 'bg-emerald-500/15 text-emerald-400' : isDark ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>{calculateLevelingAccuracy(manualCorrectNumber, manualTotal)}%</span>}</div>
          <button type="button" onClick={confirmManualResult} disabled={!manualTotal} className="mt-6 flex min-h-14 w-full max-w-md items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 px-5 text-base font-black text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"><Award size={21} /> Ver resultado do nivelamento</button>
        </section>
      )}

      {completion && <Confetti />}
      <Dialog open={Boolean(completion)} onOpenChange={(open) => { if (!open) setCompletion(null); }}>
        {completion && (
          <DialogContent showCloseButton={false} className={`nivelamento-result-dialog z-[70] max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto rounded-[2rem] border p-0 text-center shadow-2xl ring-0 ${isDark ? 'border-white/15 bg-[#10182b] text-white' : 'border-white bg-white text-slate-950'}`}>
            <button type="button" onClick={() => setCompletion(null)} aria-label="Fechar resultado" className={`absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 ${isDark ? 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 focus-visible:ring-white/20' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 focus-visible:ring-slate-300/50'}`}><X size={18} aria-hidden="true" /></button>
            <div className="nivelamento-trophy relative overflow-hidden p-7 sm:p-10">
              <div className={`nivelamento-glow absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl ${completionPassed ? 'bg-amber-400/40' : 'bg-blue-500/25'}`} />
              <div className={`relative mx-auto flex h-20 w-20 items-center justify-center rounded-[1.4rem] shadow-xl ${completionPassed ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-500 text-amber-950 shadow-amber-500/30' : 'bg-gradient-to-br from-blue-500 to-indigo-700 text-white shadow-blue-500/30'}`}><Trophy size={42} strokeWidth={2.2} aria-hidden="true" /></div>
              <p className={`relative mt-7 text-xs font-black uppercase tracking-[.22em] ${completionPassed ? 'text-amber-400' : 'text-blue-400'}`}>{completionPassed ? 'Meta conquistada' : 'Bateria finalizada'}</p>
              <DialogTitle id="nivelamento-completion-title" className={`relative mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl ${isDark ? 'text-white' : 'text-slate-950'}`}>Nivelamento concluído</DialogTitle>
              <DialogDescription className={`relative mx-auto mt-3 max-w-sm text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{completionPassed ? 'Você atingiu o padrão de precisão. Continue assim.' : `Você fechou com ${completionAccuracy}%. Para sua meta, faltaram ${Math.max(requiredLevelingCorrect(completion.total, GOAL) - completion.correct, 0)} acerto${Math.max(requiredLevelingCorrect(completion.total, GOAL) - completion.correct, 0) === 1 ? '' : 's'}.`}</DialogDescription>
              <div className={`relative mt-7 grid grid-cols-3 divide-x rounded-2xl border py-3 ${isDark ? 'divide-white/10 border-white/10 bg-white/[.03]' : 'divide-slate-100 border-slate-100 bg-slate-50'}`}><CompletionMetric label="Acertos" value={completion.correct} tone="text-emerald-400" /><CompletionMetric label="Erros" value={completion.total - completion.correct} tone="text-rose-400" /><CompletionMetric label="Resultado" value={`${completionAccuracy}%`} tone={completionPassed ? 'text-amber-400' : 'text-blue-400'} /></div>
              <button type="button" onClick={showAnswerCard} className={`relative mt-7 w-full rounded-xl py-3.5 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 ${completionPassed ? 'bg-white text-slate-950 hover:bg-amber-50 focus-visible:ring-amber-300/40' : isDark ? 'bg-white text-slate-950 hover:bg-slate-100 focus-visible:ring-blue-300/40' : 'bg-slate-950 text-white hover:bg-slate-800 focus-visible:ring-slate-400/40'}`}>Ver meu cartão-resposta</button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <React.Suspense fallback={null}>
        <ExtensionModal
          isOpen={isExtensionModalOpen}
          onClose={() => setIsExtensionModalOpen(false)}
          theme={theme}
        />
      </React.Suspense>
    </div>
  );
};

const Metric = ({ title, value, icon, color, isDark }: { title: string; value: string | number; icon: React.ReactNode; color: 'emerald' | 'rose' | 'blue'; isDark: boolean }) => {
  const colors = { emerald: 'bg-emerald-500/15 text-emerald-400', rose: 'bg-rose-500/15 text-rose-400', blue: 'bg-blue-500/15 text-blue-400' };
  return <div className={`flex items-center gap-3 rounded-2xl border p-4 ${isDark ? 'border-white/10 bg-white/[.025]' : 'border-slate-100 bg-slate-50/70'}`}><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div><div><p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</p><p className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-950'}`}>{value}</p></div></div>;
};

const NumberField = ({ id, label, value, onChange, icon, color, isDark }: { id: string; label: string; value: string; onChange: (value: string) => void; icon: React.ReactNode; color: 'emerald' | 'rose'; isDark: boolean }) => <label htmlFor={id} className={`block rounded-2xl border p-4 transition focus-within:ring-4 ${color === 'emerald' ? 'focus-within:ring-emerald-500/15' : 'focus-within:ring-rose-500/15'} ${isDark ? 'border-white/10 bg-white/[.025]' : 'border-slate-100 bg-slate-50/70'}`}><span className={`flex items-center gap-2 text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}><span className={color === 'emerald' ? 'text-emerald-400' : 'text-rose-400'}>{icon}</span>{label}</span><input id={id} type="number" min="0" max={MAX_LEVELING_QUESTIONS} inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} placeholder="0" className={`mt-4 w-full bg-transparent text-3xl font-black tracking-tight outline-none ${isDark ? 'text-white placeholder:text-slate-700' : 'text-slate-950 placeholder:text-slate-300'}`} /></label>;

const CompletionMetric = ({ label, value, tone }: { label: string; value: string | number; tone: string }) => <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-xl font-black ${tone}`}>{value}</p></div>;
