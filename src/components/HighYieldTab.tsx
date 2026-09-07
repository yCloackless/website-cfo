import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  Target,
  BarChart3,
  TrendingUp,
  Search,
  BookOpen,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Award,
  Zap,
  Filter,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  Lightbulb,
  Layers,
} from 'lucide-react';
import { CFO_INCIDENCE_DATA, SubjectIncidence } from '../data/cfoIncidenceData';
import { getMicroTopicDetail } from '../data/microTopicGuides';
import { Latex } from './LatexRenderer';
import { AppTheme } from '../types';

interface HighYieldTabProps {
  theme?: AppTheme;
  onOpenNewBizuWithTopic?: (subjectName: string, topicName: string) => void;
  onNavigateToSchedule?: () => void;
}

export const HighYieldTab: React.FC<HighYieldTabProps> = ({
  theme = 'dark',
  onOpenNewBizuWithTopic,
  onNavigateToSchedule,
}) => {
  const isDark = theme === 'dark';
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Set of expanded microtopic keys: `${subjectId}__${microTopicName}`
  const [expandedMicroKeys, setExpandedMicroKeys] = useState<Set<string>>(new Set());

  // Mastery tracking for microtopics
  const [masteryStatus, setMasteryStatus] = useState<Record<string, 'not_started' | 'studying' | 'mastered'>>(() => {
    try {
      const saved = localStorage.getItem('cfo_microtopic_mastery');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const setTopicMastery = (key: string, status: 'not_started' | 'studying' | 'mastered') => {
    setMasteryStatus((prev) => {
      const next = { ...prev, [key]: status };
      try {
        localStorage.setItem('cfo_microtopic_mastery', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Copy topic state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const handleCopyTopic = (
    key: string,
    microName: string,
    detail?: { macroCategory?: string; keyFormulaOrConcept: string; examPattern: string; commonTraps: string; recommendedAction: string }
  ) => {
    const text = detail
      ? `🔥 [CFO CBMERJ] ${microName} (${detail.macroCategory || 'Geral'})\n\n📐 FÓRMULA / CONCEITO CHAVE:\n${detail.keyFormulaOrConcept}\n\n🎯 COMO CAI NA PROVA:\n${detail.examPattern}\n\n⚠️ PEGADINHAS DA BANCA:\n${detail.commonTraps}\n\n💡 RECOMENDAÇÃO TÁTICA:\n${detail.recommendedAction}`
      : microName;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const toggleExpandMicro = (key: string) => {
    setExpandedMicroKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllMicrosForSubject = (subject: SubjectIncidence) => {
    setExpandedMicroKeys((prev) => {
      const next = new Set(prev);
      subject.microTopics.forEach((m) => next.add(`${subject.id}__${m.name}`));
      return next;
    });
  };

  const collapseAllMicrosForSubject = (subject: SubjectIncidence) => {
    setExpandedMicroKeys((prev) => {
      const next = new Set(prev);
      subject.microTopics.forEach((m) => next.delete(`${subject.id}__${m.name}`));
      return next;
    });
  };

  const report = CFO_INCIDENCE_DATA;

  // Filter subjects based on selection and search
  const filteredSubjects = useMemo(() => {
    let list = report.subjects;
    if (selectedSubjectId !== 'all') {
      list = list.filter((s) => s.id === selectedSubjectId);
    }

    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase().trim();
    return list
      .map((sub) => {
        const matchName = sub.name.toLowerCase().includes(term);
        const filteredMacro = sub.macroTopics.filter((m) =>
          m.name.toLowerCase().includes(term)
        );
        const filteredMicro = sub.microTopics.filter((m) =>
          m.name.toLowerCase().includes(term)
        );

        if (matchName || filteredMacro.length > 0 || filteredMicro.length > 0) {
          return {
            ...sub,
            macroTopics: matchName ? sub.macroTopics : filteredMacro,
            microTopics: matchName ? sub.microTopics : filteredMicro,
          };
        }
        return null;
      })
      .filter((s): s is SubjectIncidence => s !== null);
  }, [report.subjects, selectedSubjectId, searchTerm]);

  // Overall difficulty totals
  const totalDifficulty = useMemo(() => {
    let easy = 0;
    let medium = 0;
    let hard = 0;
    report.subjects.forEach((s) => {
      easy += s.difficulty.easy;
      medium += s.difficulty.medium;
      hard += s.difficulty.hard;
    });
    return { easy, medium, hard };
  }, [report.subjects]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner Hero */}
      <div
        className={`p-6 rounded-2xl border transition-all shadow-xl relative overflow-hidden ${
          isDark
            ? 'bg-[#111218] border-slate-800 shadow-black/40'
            : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0056D2] via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-950/40 shrink-0">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Estatística Oficial de Provas
                </span>
                <span
                  className={`text-xs ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {report.period}
                </span>
              </div>
              <h2
                className={`text-xl font-bold tracking-tight mt-1 ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Análise de Incidência • O Que Mais Cai no CFO CBMERJ
              </h2>
              <p
                className={`text-xs mt-1 max-w-3xl ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Mapeamento estatístico completo dos assuntos e microassuntos mais
                cobrados nas provas de Oficial Combatente do Corpo de Bombeiros Militar do Estado do Rio de Janeiro.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-300'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              <Award className="w-4 h-4 text-blue-400" />
              <span>{report.totalQuestions} Questões Reais Mapeadas</span>
            </span>
          </div>
        </div>

        {/* Global 4 Key Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total de Questões
            </p>
            <p className="text-xl font-black text-blue-400 mt-0.5">
              {report.totalQuestions}
            </p>
            <p className="text-[10px] text-slate-400">em todos os anos</p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Top 4 Decisivas
            </p>
            <p className="text-xl font-black text-blue-400 mt-0.5">62%</p>
            <p className="text-[10px] text-slate-400">Mat, Port, Fís e Quím</p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Questões Fáceis
            </p>
            <p className="text-xl font-black text-emerald-400 mt-0.5">
              {totalDifficulty.easy}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({Math.round((totalDifficulty.easy / report.totalQuestions) * 100)}%)
              </span>
            </p>
            <p className="text-[10px] text-slate-400">pontos obrigatórios</p>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-900/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Médias &amp; Difíceis
            </p>
            <p className="text-xl font-black text-blue-400 mt-0.5">
              {totalDifficulty.medium + totalDifficulty.hard}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({Math.round(((totalDifficulty.medium + totalDifficulty.hard) / report.totalQuestions) * 100)}%)
              </span>
            </p>
            <p className="text-[10px] text-slate-400">diferencial de aprovação</p>
          </div>
        </div>

        {/* Global Distribution Bar */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Distribuição Proporcional por Disciplina no CFO CBMERJ:
            </span>
            <span className="text-slate-500 text-[11px]">100% da prova</span>
          </div>

          <div className="w-full h-3 rounded-full overflow-hidden flex shadow-inner bg-slate-950 border border-slate-800">
            {report.subjects.map((sub) => (
              <div
                key={sub.id}
                title={`${sub.name}: ${sub.questions} questões (${sub.percentage}%)`}
                style={{
                  width: `${sub.percentage}%`,
                  backgroundColor: sub.color,
                }}
                className="h-full transition-all hover:opacity-85 cursor-pointer"
                onClick={() => setSelectedSubjectId(sub.id)}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[11px] pt-1">
            {report.subjects.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSelectedSubjectId(sub.id)}
                className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                  selectedSubjectId === sub.id
                    ? 'font-bold text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: sub.color }}
                />
                <span>
                  {sub.shortName} ({sub.percentage}%)
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Subject Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedSubjectId('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedSubjectId === 'all'
                ? 'bg-red-600 text-white shadow-md shadow-red-950/40'
                : isDark
                ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            Todas ({report.subjects.length})
          </button>
          {report.subjects.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSelectedSubjectId(sub.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                selectedSubjectId === sub.id
                  ? 'bg-slate-100 text-slate-950 font-black shadow-md'
                  : isDark
                  ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: sub.color }}
              />
              <span>{sub.shortName}</span>
              <span className="text-[10px] opacity-70">({sub.questions})</span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar assunto (ex: Área, MRUV, Gases)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-3.5 py-2 rounded-xl text-xs transition-colors focus:outline-none ${
              isDark
                ? 'bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 focus:border-red-500'
                : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-red-500 shadow-xs'
            }`}
          />
        </div>
      </div>

      {/* Main Subjects Content Grid */}
      <div className="space-y-6">
        {filteredSubjects.length === 0 ? (
          <div
            className={`p-10 rounded-2xl border text-center ${
              isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <HelpCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
            <h3
              className={`text-base font-bold ${
                isDark ? 'text-slate-200' : 'text-slate-800'
              }`}
            >
              Nenhum assunto encontrado para &ldquo;{searchTerm}&rdquo;
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Tente buscar por termos como &ldquo;Cinemática&rdquo;, &ldquo;Morfologia&rdquo;, &ldquo;Geometria&rdquo; ou limpe o filtro.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSubjectId('all');
              }}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          filteredSubjects.map((sub) => {
            const maxMacroQuestions = Math.max(
              ...sub.macroTopics.map((m) => m.questions),
              1
            );

            return (
              <div
                key={sub.id}
                className={`rounded-2xl border overflow-hidden shadow-xl transition-all ${
                  isDark
                    ? 'bg-[#111218] border-slate-800/90'
                    : 'bg-white border-slate-200 shadow-slate-100'
                }`}
              >
                {/* Subject Header */}
                <div
                  className={`p-5 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
                    isDark ? 'bg-[#0D0E13] border-slate-800' : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-3.5 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: sub.color }}
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`text-lg font-bold tracking-tight ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}
                        >
                          {sub.name}
                        </h3>
                        <span
                          className="px-2.5 py-0.5 rounded-full text-xs font-extrabold text-white"
                          style={{ backgroundColor: sub.color }}
                        >
                          {sub.questions} questões • {sub.percentage}% da prova
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 flex items-center gap-1.5 ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{sub.strategicTip}</span>
                      </p>
                    </div>
                  </div>

                  {/* Difficulty Breakdown Badges */}
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-400 mr-1">
                      Dificuldade:
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Fácil: {sub.difficulty.easy}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Média: {sub.difficulty.medium}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                      Difícil: {sub.difficulty.hard}
                    </span>
                  </div>
                </div>

                {/* Topics Layout: Macroassuntos on Left, Microassuntos on Right */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Macroassuntos (Top Cobrados) */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-[#0056D2]" />
                        <h4
                          className={`text-xs font-bold uppercase tracking-wider ${
                            isDark ? 'text-slate-200' : 'text-slate-800'
                          }`}
                        >
                          Macroassuntos ({sub.macroTopics.length})
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500">Ranking por Questões</span>
                    </div>

                    <div className="space-y-2.5">
                      {sub.macroTopics.map((macro, idx) => {
                        const pctOfSubject = Math.round((macro.questions / sub.questions) * 100);
                        const barWidth = Math.round((macro.questions / maxMacroQuestions) * 100);

                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl border transition-all hover:scale-[1.01] ${
                              isDark
                                ? 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                                : 'bg-slate-50 border-slate-200/80 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-semibold flex items-center gap-2">
                                <span
                                  className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center ${
                                    macro.rank <= 3
                                      ? 'bg-[#0056D2] text-white'
                                      : isDark
                                      ? 'bg-slate-800 text-slate-400'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  #{macro.rank}
                                </span>
                                <span className={isDark ? 'text-slate-100' : 'text-slate-900'}>
                                  {macro.name}
                                </span>
                              </span>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-[#0056D2] dark:text-sky-400">
                                  {macro.questions} {macro.questions === 1 ? 'questão' : 'questões'}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  ({pctOfSubject}%)
                                </span>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-950/60 border border-slate-800/50">
                              <div
                                style={{
                                  width: `${barWidth}%`,
                                  backgroundColor: sub.color,
                                }}
                                className="h-full rounded-full transition-all duration-500"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Microassuntos (Detalhe Cirúrgico com Expansão Animada) */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <h4
                          className={`text-xs font-bold uppercase tracking-wider ${
                            isDark ? 'text-slate-200' : 'text-slate-800'
                          }`}
                        >
                          Microassuntos &amp; Detalhes ({sub.microTopics.length})
                        </h4>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 hidden sm:inline">
                          Clique para expandir
                        </span>
                        {(() => {
                          const anyExpanded = sub.microTopics.some((m) =>
                            expandedMicroKeys.has(`${sub.id}__${m.name}`)
                          );
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                anyExpanded
                                  ? collapseAllMicrosForSubject(sub)
                                  : expandAllMicrosForSubject(sub)
                              }
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                isDark
                                  ? 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 bg-slate-900/60'
                                  : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400 bg-white'
                              }`}
                            >
                              {anyExpanded ? 'Recolher todos' : 'Expandir todos'}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[560px] overflow-y-auto pr-1 scrollbar-thin">
                      {sub.microTopics.map((micro, idx) => {
                        const microKey = `${sub.id}__${micro.name}`;
                        const isExpanded = expandedMicroKeys.has(microKey);
                        const mastery = masteryStatus[microKey] || 'not_started';
                        const detail = getMicroTopicDetail(
                          sub.name,
                          micro.name,
                          micro.questions,
                          sub.questions
                        );
                        const pctOfSubject = Math.round(
                          (micro.questions / sub.questions) * 100
                        );
                        const isHighPriority = micro.questions >= 3;
                        const isMediumPriority = micro.questions === 2;

                        return (
                          <motion.div
                            key={microKey}
                            layout
                            transition={{ layout: { duration: 0.25, ease: 'easeOut' } }}
                            className={`rounded-xl border transition-all cursor-pointer ${
                              isExpanded
                                ? isDark
                                  ? 'sm:col-span-2 bg-[#0B1528] border-blue-500/60 shadow-xl shadow-blue-950/20 ring-1 ring-blue-500/30'
                                  : 'sm:col-span-2 bg-blue-50/50 border-blue-400/80 shadow-md ring-1 ring-blue-400/20'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800/70 hover:bg-slate-900/80 hover:border-slate-700'
                                : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                            onClick={() => toggleExpandMicro(microKey)}
                          >
                            {/* Header Row */}
                            <div className="p-2.5 flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 transition-transform ${
                                    isExpanded ? 'scale-125' : ''
                                  }`}
                                  style={{
                                    backgroundColor:
                                      mastery === 'mastered'
                                        ? '#10b981'
                                        : mastery === 'studying'
                                        ? '#0284c7'
                                        : sub.color,
                                  }}
                                  title={
                                    mastery === 'mastered'
                                      ? 'Assunto Dominado'
                                      : mastery === 'studying'
                                      ? 'Em Revisão'
                                      : 'Pendente'
                                  }
                                />
                                <p
                                  className={`font-semibold leading-tight ${
                                    isExpanded
                                      ? 'text-blue-400 font-bold'
                                      : isDark
                                      ? 'text-slate-200'
                                      : 'text-slate-800'
                                  } ${!isExpanded ? 'truncate' : ''}`}
                                  title={micro.name}
                                >
                                  {micro.name}
                                </p>
                              </div>

                              <div
                                className="flex items-center gap-1.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                    isHighPriority
                                      ? 'bg-blue-500/20 text-[#0056D2] dark:text-sky-400 border-blue-500/30'
                                      : isMediumPriority
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      : 'bg-slate-800 text-slate-300 border-slate-700'
                                  }`}
                                >
                                  {micro.questions}{' '}
                                  {micro.questions === 1 ? 'questão' : 'questões'}
                                </span>

                                {onOpenNewBizuWithTopic && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenNewBizuWithTopic(sub.name, micro.name);
                                    }}
                                    title={`Criar Bizu com IA sobre ${micro.name}`}
                                    className="p-1 rounded-md text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpandMicro(microKey);
                                  }}
                                  className={`p-1 rounded-md text-slate-400 hover:text-slate-200 transition-transform duration-300 cursor-pointer ${
                                    isExpanded ? 'rotate-180 text-blue-400' : ''
                                  }`}
                                  title={
                                    isExpanded
                                      ? 'Recolher detalhes'
                                      : 'Expandir para ver tudo'
                                  }
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Animated Expanded Content */}
                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{
                                    duration: 0.28,
                                    ease: [0.16, 1, 0.3, 1],
                                  }}
                                  className="overflow-hidden cursor-default"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className={`px-3.5 pb-3.5 pt-2 border-t space-y-3 ${
                                      isDark
                                        ? 'border-slate-800/80 text-slate-200 bg-slate-950/50'
                                        : 'border-blue-200 text-slate-800 bg-white/70'
                                    }`}
                                  >
                                    {/* Full Title & Category Tags */}
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                                          <Layers className="w-3 h-3 text-blue-400" />
                                          <span>
                                            {detail.macroCategory || sub.name}
                                          </span>
                                        </span>

                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                                            isHighPriority
                                              ? 'bg-blue-600/20 text-[#0056D2] dark:text-sky-400 border-blue-500/40'
                                              : isMediumPriority
                                              ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                              : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                          }`}
                                        >
                                          {isHighPriority
                                            ? '🔥 Prioridade Máxima no CFO'
                                            : isMediumPriority
                                            ? '⚡ Alta Frequência na Prova'
                                            : '📌 Assunto Estratégico'}
                                        </span>

                                        <span className="text-[11px] text-slate-400 font-medium">
                                          {pctOfSubject}% de {sub.shortName} (
                                          {micro.questions}{' '}
                                          {micro.questions === 1
                                            ? 'questão'
                                            : 'questões'}{' '}
                                          históricas)
                                        </span>
                                      </div>

                                      <h5
                                        className={`text-sm font-black leading-snug tracking-tight ${
                                          isDark
                                            ? 'text-slate-100'
                                            : 'text-slate-900'
                                        }`}
                                      >
                                        {micro.name}
                                      </h5>
                                    </div>

                                    {/* Raio-X Blocks */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                                      {/* Como cai na prova */}
                                      <div
                                        className={`p-3 rounded-xl border ${
                                          isDark
                                            ? 'bg-slate-900/80 border-slate-800'
                                            : 'bg-white border-slate-200 shadow-xs'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 font-bold text-blue-400 mb-1">
                                          <Target className="w-3.5 h-3.5" />
                                          <span>Como Cai no CFO CBMERJ:</span>
                                        </div>
                                        <div
                                          className={`text-[11px] leading-relaxed ${
                                            isDark
                                              ? 'text-slate-300'
                                              : 'text-slate-700'
                                          }`}
                                        >
                                          <Latex content={detail.examPattern} />
                                        </div>
                                      </div>

                                      {/* Pegadinhas e Alertas */}
                                      <div
                                        className={`p-3 rounded-xl border ${
                                          isDark
                                            ? 'bg-slate-900/80 border-slate-800'
                                            : 'bg-white border-slate-200 shadow-xs'
                                        }`}
                                      >
                                        <div className="flex items-center gap-1.5 font-bold text-[#0056D2] dark:text-sky-400 mb-1">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          <span>Pegadinhas da Banca:</span>
                                        </div>
                                        <div
                                          className={`text-[11px] leading-relaxed ${
                                            isDark
                                              ? 'text-slate-300'
                                              : 'text-slate-700'
                                          }`}
                                        >
                                          <Latex content={detail.commonTraps} />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Fórmula / Conceito Chave */}
                                    <div
                                      className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                                        isDark
                                          ? 'bg-blue-950/20 border-blue-500/25 text-slate-200'
                                          : 'bg-blue-50 border-blue-200 text-blue-950'
                                      }`}
                                    >
                                      <Lightbulb className="w-4 h-4 text-blue-400 shrink-0 mt-1" />
                                      <div className="w-full min-w-0 overflow-hidden">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="font-bold text-blue-400 block">
                                            Conceito / Fórmula Chave (LaTeX):
                                          </span>
                                          <span className="text-[10px] text-blue-400/80 font-mono">
                                            KaTeX
                                          </span>
                                        </div>
                                        <div className="text-xs leading-relaxed overflow-x-auto scrollbar-thin py-0.5">
                                          <Latex content={detail.keyFormulaOrConcept} />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Recomendação de Estudo */}
                                    {detail.recommendedAction && (
                                      <div
                                        className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs ${
                                          isDark
                                            ? 'bg-blue-950/20 border-blue-500/20 text-blue-200'
                                            : 'bg-blue-50 border-blue-200 text-blue-950'
                                        }`}
                                      >
                                        <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                        <div className="text-[11px] leading-relaxed">
                                          <span className="font-bold mr-1 text-blue-400">Plano Tático:</span>
                                          <Latex content={detail.recommendedAction} />
                                        </div>
                                      </div>
                                    )}

                                    {/* Meu Domínio e Ações */}
                                    <div className="pt-2 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                      {/* Mastery Level Selector */}
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[11px] font-medium text-slate-400 mr-1">
                                          Meu Domínio:
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setTopicMastery(microKey, 'not_started')
                                          }
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                            mastery === 'not_started'
                                              ? 'bg-slate-800 text-white border border-slate-700 shadow-xs'
                                              : 'text-slate-500 hover:text-slate-300'
                                          }`}
                                        >
                                          ⚪ A Iniciar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setTopicMastery(microKey, 'studying')
                                          }
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                            mastery === 'studying'
                                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-xs'
                                              : 'text-slate-500 hover:text-blue-400'
                                          }`}
                                        >
                                          🟡 Em Revisão
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setTopicMastery(microKey, 'mastered')
                                          }
                                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                            mastery === 'mastered'
                                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                                              : 'text-slate-500 hover:text-emerald-400'
                                          }`}
                                        >
                                          🟢 Dominado ✅
                                        </button>
                                      </div>

                                      {/* Action buttons */}
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleCopyTopic(microKey, micro.name, detail)
                                          }
                                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1 cursor-pointer ${
                                            copiedKey === microKey
                                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                              : isDark
                                              ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                          }`}
                                          title="Copiar resumo do microassunto com fórmulas"
                                        >
                                          {copiedKey === microKey ? (
                                            <>
                                              <Check className="w-3 h-3 text-emerald-400" />
                                              <span>Copiado!</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3 text-slate-400" />
                                              <span>Copiar</span>
                                            </>
                                          )}
                                        </button>

                                        {onOpenNewBizuWithTopic && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onOpenNewBizuWithTopic(
                                                sub.name,
                                                micro.name
                                              )
                                            }
                                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-gradient-to-r from-[#0056D2] to-blue-600 hover:from-[#0047B3] hover:to-blue-500 shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                                            title="Gerar Anotações & Mnemônico com Gemini no Bizuário"
                                          >
                                            <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                                            <span>Gerar Bizu com IA</span>
                                          </button>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleExpandMicro(microKey)
                                          }
                                          className="px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
                                          title="Recolher microassunto"
                                        >
                                          ▲
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Bottom Subject Action Card */}
                    <div
                      className={`mt-4 p-3 rounded-xl border flex items-center justify-between gap-3 ${
                        isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-slate-300">
                          Pronto para estudar {sub.shortName}?
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {onOpenNewBizuWithTopic && (
                          <button
                            onClick={() =>
                              onOpenNewBizuWithTopic(
                                sub.name,
                                sub.macroTopics[0]?.name || sub.name
                              )
                            }
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-1"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Bizu com IA</span>
                          </button>
                        )}
                        {onNavigateToSchedule && (
                          <button
                            onClick={onNavigateToSchedule}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                          >
                            Cronograma →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
