import React, { useState, useMemo, useEffect } from 'react';
import {
  Crosshair,
  Award,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Calendar,
  Flame,
  Target,
  Sparkles,
  PlusCircle,
  Trash2,
  CheckCircle2,
  Clock,
  BookOpen,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Cpu,
  Zap,
  Filter,
  ArrowUpRight,
  FileText,
  X,
  ChevronDown,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { AppTheme } from '../types';

export interface SimulationRecord {
  id: string;
  dateStr: string;
  title: string;
  phase: 'EQ' | 'ED'; // EQ: Exame de Qualificação, ED: Exame Discursivo
  correctCount: number;
  totalQuestions: number;
  concept: 'A' | 'B' | 'C' | 'D' | 'Risco';
  selfEvaluation: string;
  reviewTargets: string[];
  createdAt: string;
}

interface SubjectStat {
  name: string;
  area: string;
  errorRate: number; // 0 to 100
  accuracyRate: number; // 0 to 100
  questionsFailed: number;
  totalQuestions: number;
  criticalTopic: string;
}

// Dados mockados iniciais de alta fidelidade para o CFO CBMERJ
const INITIAL_SIMULATIONS: SimulationRecord[] = [
  {
    id: 'sim_01',
    dateStr: '2026-05-18',
    title: 'Simulado UERJ 2026 - 1º Exame de Qualificação',
    phase: 'EQ',
    correctCount: 49,
    totalQuestions: 60,
    concept: 'A',
    selfEvaluation:
      'Ritmo excelente na primeira hora. Linguagens e Humanas com 95% de assertividade. Houve hesitação nos cálculos de misturas químicas e estequiometria, perdendo cerca de 12 minutos preciosos.',
    reviewTargets: ['Estequiometria', 'Cinemática Vetorial', 'Termologia'],
    createdAt: '2026-05-18T14:30:00Z',
  },
  {
    id: 'sim_02',
    dateStr: '2026-05-04',
    title: 'Simulado Tático de Exatas e Discursivas #03',
    phase: 'ED',
    correctCount: 34,
    totalQuestions: 50,
    concept: 'C',
    selfEvaluation:
      'Gargalo sério em Matemática III (Geometria Espacial) e Química Orgânica. As questões dissertativas exigiram demonstrações literais que demandaram mais tempo do que o estimado.',
    reviewTargets: ['Estequiometria', 'Trigonometria e Ângulos', 'Reações Inorgânicas'],
    createdAt: '2026-05-04T16:00:00Z',
  },
  {
    id: 'sim_03',
    dateStr: '2026-04-20',
    title: 'Simulado Modelo Oficial UERJ EQ #02',
    phase: 'EQ',
    correctCount: 52,
    totalQuestions: 60,
    concept: 'A',
    selfEvaluation:
      'Melhor desempenho até o momento. Gabaritei Biologia e Geografia (Cartografia perfeita). O controle de tempo foi rigoroso (3h10 no total), restando 50 minutos para passar o gabarito com tranquilidade.',
    reviewTargets: ['Óptica Geométrica', 'P.G', 'Morfologia II'],
    createdAt: '2026-04-20T17:15:00Z',
  },
  {
    id: 'sim_04',
    dateStr: '2026-04-06',
    title: 'Simulado Diagnóstico de Entrada CFO CBMERJ',
    phase: 'EQ',
    correctCount: 33,
    totalQuestions: 60,
    concept: 'D',
    selfEvaluation:
      'Sintoma grave de ansiedade na reta final de prova. Estafa mental após 2h30 de resolução contínua. Faltou água e estratégia de alimentação durante o teste.',
    reviewTargets: ['Estequiometria', 'Fisiologia Humana II', 'Lançamento Oblíquo'],
    createdAt: '2026-04-06T13:00:00Z',
  },
];

// Estatísticas detalhadas por matéria para as barras horizontais
const MOCK_VULNERABLE_SUBJECTS: SubjectStat[] = [
  {
    name: 'Química',
    area: 'Exatas',
    errorRate: 60,
    accuracyRate: 40,
    questionsFailed: 18,
    totalQuestions: 30,
    criticalTopic: 'Estequiometria e Soluções (Reações Consecutivas)',
  },
  {
    name: 'Física I',
    area: 'Exatas',
    errorRate: 52,
    accuracyRate: 48,
    questionsFailed: 13,
    totalQuestions: 25,
    criticalTopic: 'Cinemática Vetorial e Lançamento de Projéteis',
  },
  {
    name: 'Matemática III',
    area: 'Exatas',
    errorRate: 48,
    accuracyRate: 52,
    questionsFailed: 12,
    totalQuestions: 25,
    criticalTopic: 'Trigonometria e Geometria Espacial (Prismas/Pirâmides)',
  },
  {
    name: 'Biologia',
    area: 'Biológicas',
    errorRate: 40,
    accuracyRate: 60,
    questionsFailed: 8,
    totalQuestions: 20,
    criticalTopic: 'Fisiologia Humana II (Sistema Renal e Circulatório)',
  },
  {
    name: 'Geografia',
    area: 'Humanas',
    errorRate: 35,
    accuracyRate: 65,
    questionsFailed: 7,
    totalQuestions: 20,
    criticalTopic: 'Cartografia: Escalas Numéricas e Fusos Horários',
  },
];

const MOCK_DOMINANT_SUBJECTS: SubjectStat[] = [
  {
    name: 'História',
    area: 'Humanas',
    errorRate: 8,
    accuracyRate: 92,
    questionsFailed: 2,
    totalQuestions: 25,
    criticalTopic: 'Período Joanino, Independência e Primeiro Reinado',
  },
  {
    name: 'Português',
    area: 'Linguagens',
    errorRate: 12,
    accuracyRate: 88,
    questionsFailed: 3,
    totalQuestions: 25,
    criticalTopic: 'Morfologia, Sintaxe de Regência e Interpretação Textual',
  },
  {
    name: 'Física II',
    area: 'Exatas',
    errorRate: 18,
    accuracyRate: 82,
    questionsFailed: 4,
    totalQuestions: 22,
    criticalTopic: 'Termologia, Calorimetria e Dilatação Térmica',
  },
  {
    name: 'Química Geral',
    area: 'Exatas',
    errorRate: 20,
    accuracyRate: 80,
    questionsFailed: 4,
    totalQuestions: 20,
    criticalTopic: 'Tabela Periódica, Propriedades e Ligações Químicas',
  },
  {
    name: 'Matemática II',
    area: 'Exatas',
    errorRate: 22,
    accuracyRate: 78,
    questionsFailed: 5,
    totalQuestions: 23,
    criticalTopic: 'Progressão Geométrica (P.G) e Funções Exponenciais',
  },
];

const QUICK_TAGS_SUGGESTIONS = [
  'Estequiometria',
  'Cinemática Vetorial',
  'Trigonometria',
  'Termologia',
  'Morfologia II',
  'Cartografia',
  'Fisiologia Humana',
  'P.G',
  'Óptica Geométrica',
  'Eletrodinâmica',
];

interface TacticalSimulationsProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const TacticalSimulations: React.FC<TacticalSimulationsProps> = ({
  theme = 'dark',
  showToast,
}) => {
  const isDark = theme === 'dark';

  // 1. Estado de Filtro de Tempo (7 Dias, 30 Dias, Geral)
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | 'all'>('all');

  // 2. Estado de Simulados com persistência em localStorage
  const [simulations, setSimulations] = useState<SimulationRecord[]>(() => {
    try {
      const stored = localStorage.getItem('cfo_tactical_simulations');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[Simulations] Falha ao ler do localStorage:', e);
    }
    return INITIAL_SIMULATIONS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('cfo_tactical_simulations', JSON.stringify(simulations));
    } catch (e) {
      console.error('[Simulations] Falha ao salvar no localStorage:', e);
    }
  }, [simulations]);

  // 3. Estado do Formulário de Inserção
  const [formData, setFormData] = useState({
    dateStr: new Date().toISOString().split('T')[0],
    phase: 'EQ' as 'EQ' | 'ED',
    title: '',
    correctCount: 45,
    totalQuestions: 60,
    concept: 'A' as 'A' | 'B' | 'C' | 'D' | 'Risco',
    selfEvaluation: '',
    tagInput: '',
    reviewTargets: [] as string[],
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isAiRegenerating, setIsAiRegenerating] = useState(false);
  const [aiAnalysisIndex, setAiAnalysisIndex] = useState(0);

  // Calcula o conceito automático a partir do número de acertos (regras UERJ / CFO)
  const handleScoreChange = (correct: number, total: number) => {
    const safeTotal = total > 0 ? total : 60;
    const ratio = correct / safeTotal;
    let autoConcept: 'A' | 'B' | 'C' | 'D' | 'Risco' = 'Risco';

    if (ratio >= 0.8) autoConcept = 'A';
    else if (ratio >= 0.7) autoConcept = 'B';
    else if (ratio >= 0.6) autoConcept = 'C';
    else if (ratio >= 0.5) autoConcept = 'D';
    else autoConcept = 'Risco';

    setFormData((prev) => ({
      ...prev,
      correctCount: correct,
      totalQuestions: safeTotal,
      concept: autoConcept,
    }));
  };

  const handleAddTag = (tagToAdd?: string) => {
    const tag = (tagToAdd || formData.tagInput).trim();
    if (!tag) return;
    if (!formData.reviewTargets.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        reviewTargets: [...prev.reviewTargets, tag],
        tagInput: '',
      }));
    } else {
      setFormData((prev) => ({ ...prev, tagInput: '' }));
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      reviewTargets: prev.reviewTargets.filter((t) => t !== tagToRemove),
    }));
  };

  const handleSubmitSimulation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      showToast?.('Por favor, informe a identificação do simulado.', 'error');
      return;
    }

    const newSim: SimulationRecord = {
      id: `sim_${Date.now()}`,
      dateStr: formData.dateStr,
      title: formData.title.trim(),
      phase: formData.phase,
      correctCount: Number(formData.correctCount) || 0,
      totalQuestions: Number(formData.totalQuestions) || 60,
      concept: formData.concept,
      selfEvaluation: formData.selfEvaluation.trim(),
      reviewTargets: formData.reviewTargets,
      createdAt: new Date().toISOString(),
    };

    setSimulations((prev) => [newSim, ...prev]);
    showToast?.('Operação de simulado registrada no histórico tático!', 'success');

    // Reseta campos do formulário
    setFormData({
      dateStr: new Date().toISOString().split('T')[0],
      phase: 'EQ',
      title: '',
      correctCount: 45,
      totalQuestions: 60,
      concept: 'A',
      selfEvaluation: '',
      tagInput: '',
      reviewTargets: [],
    });
  };

  const handleDeleteSimulation = (id: string) => {
    if (confirm('Deseja remover este registro de simulado da Central de Inteligência?')) {
      setSimulations((prev) => prev.filter((s) => s.id !== id));
      showToast?.('Registro removido com sucesso.', 'info');
    }
  };

  // Análises táticas do terminal militar da IA
  const AI_TACTICAL_DIRECTIVES = [
    {
      title: 'DIAGNÓSTICO CRÍTICO: EDITAL UERJ / CFO CBMERJ',
      body: '> ANÁLISE: Desempenho crítico em Estequiometria (40%) e Cinemática Vetorial (48%). Risco alto para o Exame de Qualificação da UERJ onde Química e Física têm peso eliminatório.\n> VULNERABILIDADE DETECTADA: Você cometeu erros reincidentes em cálculos de proporção molar com pureza e rendimento em 3 simulados consecutivos.\n> DIRETRIZ TÁTICA: Pausar avanço de teoria nova. Executar bateria de 50 questões comentadas de Estequiometria nas próximas 24 horas e revisarBizus de Torricelli.',
    },
    {
      title: 'ANÁLISE DE GESTÃO DE TEMPO & FADIGA DE COMBATE',
      body: '> ANÁLISE: Queda de 28% no índice de acertos nas últimas 15 questões dos simulados de 60 itens. Sintoma evidente de esgotamento atencional no último terço da prova.\n> PONTO FORTE CONSOLIDADO: 92% de domínio absoluto em História do Brasil e 88% em Sintaxe e Morfologia.\n> DIRETRIZ TÁTICA: Alterar ordem de resolução no próximo simulado: iniciar por Português (40min), liquidar Humanas (30min) e dedicar 1h30 líquida exclusiva para o bloco de Exatas.',
    },
    {
      title: 'EQUILÍBRIO DE CONCEITO & SEGURANÇA NA NOTA DE CORTE',
      body: '> ANÁLISE: Média acumulada de 80.8% nos últimos 30 dias (Faixa Conceito A garantida com folga de 6 acertos acima da linha de corte).\n> DIRETRIZ TÁTICA: Focar na preparação dos temas discursivos (ED) de Física e Química. Começar a redigir resoluções por extenso justificando passos com notação formal do edital.',
    },
  ];

  const currentDirective = AI_TACTICAL_DIRECTIVES[aiAnalysisIndex % AI_TACTICAL_DIRECTIVES.length];

  const handleRegenerateAi = () => {
    setIsAiRegenerating(true);
    setTimeout(() => {
      setAiAnalysisIndex((prev) => prev + 1);
      setIsAiRegenerating(false);
      showToast?.('Diretriz da IA Tática atualizada com novos parâmetros.', 'info');
    }, 450);
  };

  // Métricas agregadas da Central de Inteligência
  const metrics = useMemo(() => {
    const totalSims = simulations.length;
    if (totalSims === 0) {
      return { totalSims: 0, avgAccuracy: 0, conceptACount: 0, latestConcept: 'Nenhum' };
    }
    const totalCorrect = simulations.reduce((acc, s) => acc + s.correctCount, 0);
    const totalQuestions = simulations.reduce((acc, s) => acc + s.totalQuestions, 0);
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const conceptACount = simulations.filter((s) => s.concept === 'A').length;
    const latestConcept = simulations[0]?.concept || 'A';

    return {
      totalSims,
      avgAccuracy,
      conceptACount,
      latestConcept,
    };
  }, [simulations]);

  return (
    <div className="space-y-7 animate-in fade-in duration-300 pb-12">
      {/* ========================================================================= */}
      {/* 🚀 CABEÇALHO TÁTICO DA CENTRAL DE INTELIGÊNCIA */}
      {/* ========================================================================= */}
      <div
        className={`p-6 rounded-2xl border transition-colors shadow-2xl relative overflow-hidden ${
          isDark
            ? 'bg-gradient-to-br from-[#0B1528] via-slate-950 to-black border-slate-800'
            : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}
      >
        {/* Glow sutil de fundo estilo militar */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-red-700 via-red-800 to-red-950 border border-red-500/30 flex items-center justify-center text-white shadow-lg shadow-red-950/60 shrink-0">
              <Crosshair className="w-6 h-6 animate-pulse text-red-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className={`text-xl font-extrabold tracking-tight uppercase flex items-center gap-2 ${
                    isDark ? 'text-white' : 'text-slate-950 font-black'
                  }`}
                >
                  Central de Inteligência & Simulados
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-red-950/80 text-red-400 border border-red-800/60">
                  CBMERJ TACTICAL OPS
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-950/70 text-blue-400 border border-blue-800/40">
                  UERJ 2026
                </span>
              </div>
              <p
                className={`text-xs mt-1 max-w-2xl leading-relaxed ${
                  isDark ? 'text-slate-400' : 'text-slate-700 font-medium'
                }`}
              >
                Diagnóstico balístico de assertividade, identificação de zonas de vulnerabilidade e ordens
                estratégicas da IA para garantir o <span className="text-red-500 font-bold">Conceito A</span> no
                concurso de Oficial Combatente.
              </p>
            </div>
          </div>

          {/* KPI Mini Badges */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`p-3 rounded-xl border shadow-md flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600 font-bold'
                  }`}
                >
                  Simulados
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-white' : 'text-black'
                  }`}
                >
                  {metrics.totalSims} reg.
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border shadow-md flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600 font-bold'
                  }`}
                >
                  Média Geral
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-emerald-400' : 'text-emerald-800'
                  }`}
                >
                  {metrics.avgAccuracy}%
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border shadow-md flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600 font-bold'
                  }`}
                >
                  Conceito A
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  {metrics.conceptACount} vitórias
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🎯 SEÇÃO 1: DASHBOARD ANALÍTICO E IA (TOPO) */}
      {/* ========================================================================= */}
      <section className="space-y-5">
        {/* Barra de Filtro de Tempo Minimalista */}
        <div
          className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1 border-b ${
            isDark ? 'border-slate-800/80' : 'border-slate-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-red-500" />
            <h2
              className={`text-xs uppercase font-extrabold tracking-widest ${
                isDark ? 'text-slate-300' : 'text-slate-900 font-black'
              }`}
            >
              Período de Análise Operacional
            </h2>
          </div>

          <div
            className={`flex items-center p-1 rounded-xl shadow-inner border ${
              isDark ? 'bg-slate-900/90 border-slate-800/90' : 'bg-slate-100 border-slate-300'
            }`}
          >
            <button
              type="button"
              onClick={() => setTimeFilter('7d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === '7d'
                  ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/60'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-700 hover:text-black font-semibold'
              }`}
            >
              Últimos 7 Dias
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('30d')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === '30d'
                  ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/60'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-700 hover:text-black font-semibold'
              }`}
            >
              Últimos 30 Dias
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'all'
                  ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/60'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-700 hover:text-black font-semibold'
              }`}
            >
              Geral (Histórico Completo)
            </button>
          </div>
        </div>

        {/* Card Central: Console da IA Tática (Terminal Militar) */}
        <div className="rounded-2xl border border-red-950/60 bg-black shadow-2xl p-5 relative overflow-hidden font-mono">
          {/* Barra superior estilo terminal UNIX / Militar */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              </div>
              <span className="text-[11px] text-slate-400 tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                TERMINAL_MILITAR // CFO_CBMERJ_AI_STRATEGY // UERJ_2026
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                <span>ONLINE [IA TÁTICA ATIVA]</span>
              </div>
              <button
                type="button"
                onClick={handleRegenerateAi}
                disabled={isAiRegenerating}
                title="Recalcular diretrizes com base nos simulados"
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isAiRegenerating ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Recalcular</span>
              </button>
            </div>
          </div>

          {/* Conteúdo do Terminal com Tipografia Militar */}
          <div className="space-y-2 text-xs leading-relaxed">
            <div className="text-emerald-500 font-bold tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>{currentDirective.title}</span>
            </div>

            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-900 text-slate-200 whitespace-pre-line leading-loose">
              {currentDirective.body}
              <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 translate-y-0.5 animate-pulse" />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>SISTEMA: Análise baseada no padrão de correção e distribuição de peso da UERJ</span>
              <span>CÓDIGO DE DIRETRIZ: #CFO-UERJ-2026-B{aiAnalysisIndex + 1}</span>
            </div>
          </div>
        </div>

        {/* Zonas de Vulnerabilidade e Domínio (Gráficos Horizontais Interativos) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Top 5 Matérias Mais Erradas (Vermelho-Alerta) */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1528] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-950/70 border border-red-800/60 text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs uppercase font-extrabold tracking-wider text-white flex items-center gap-1.5">
                    Zona de Vulnerabilidade
                    <span className="text-[10px] text-red-400 font-normal">(Top 5 Mais Erradas)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Pontos cegos que custam pontos eliminatórios</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-950/80 text-red-400 border border-red-800/50">
                Alerta Alto
              </span>
            </div>

            {/* Barras Horizontais Customizadas com Tooltips */}
            <div className="space-y-3.5 pt-2">
              {MOCK_VULNERABLE_SUBJECTS.map((item) => {
                const isHovered = activeTooltip === `vuln_${item.name}`;
                return (
                  <div
                    key={item.name}
                    className="relative group"
                    onMouseEnter={() => setActiveTooltip(`vuln_${item.name}`)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {item.questionsFailed}/{item.totalQuestions} erradas
                        </span>
                        <span className="font-bold text-red-400 text-xs">{item.errorRate}% erro</span>
                      </div>
                    </div>

                    {/* Barra de Progresso em Vermelho-Alerta */}
                    <div className="h-3.5 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-950 via-red-700 to-red-500 transition-all duration-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                        style={{ width: `${item.errorRate}%` }}
                      />
                    </div>

                    {/* Tooltip Interativo ao Passar o Mouse */}
                    {isHovered && (
                      <div className="absolute -top-12 right-0 z-30 bg-slate-950 border border-red-700 text-white text-[11px] py-1.5 px-3 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <span className="font-bold text-red-400">Tópico Crítico:</span> {item.criticalTopic} •{' '}
                        <span className="text-slate-300">Taxa de Acerto: {item.accuracyRate}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-red-950/20 border border-red-900/30 text-[11px] text-red-300/90 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>
                <strong>Atenção Tática:</strong> A UERJ penaliza severamente candidatos que erram blocos de Exatas.
                Priorize questões das 3 matérias vermelhas antes do próximo simulado.
              </span>
            </div>
          </div>

          {/* Card 2: Top 5 Matérias Mais Acertadas (Azul / Verde Domínio) */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-[#0B1528] shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-950/70 border border-emerald-800/60 text-emerald-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs uppercase font-extrabold tracking-wider text-white flex items-center gap-1.5">
                    Zona de Domínio Operacional
                    <span className="text-[10px] text-emerald-400 font-normal">(Top 5 Mais Acertadas)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Disciplinas com pontuação sólida para sustentar a nota</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                Alta Eficácia
              </span>
            </div>

            {/* Barras Horizontais de Domínio */}
            <div className="space-y-3.5 pt-2">
              {MOCK_DOMINANT_SUBJECTS.map((item) => {
                const isHovered = activeTooltip === `dom_${item.name}`;
                return (
                  <div
                    key={item.name}
                    className="relative group"
                    onMouseEnter={() => setActiveTooltip(`dom_${item.name}`)}
                    onMouseLeave={() => setActiveTooltip(null)}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">
                          {item.totalQuestions - item.questionsFailed}/{item.totalQuestions} acertos
                        </span>
                        <span className="font-bold text-emerald-400 text-xs">{item.accuracyRate}% acerto</span>
                      </div>
                    </div>

                    {/* Barra de Progresso em Azul-Fênix / Verde-Esmeralda */}
                    <div className="h-3.5 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-900 via-blue-600 to-emerald-400 transition-all duration-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                        style={{ width: `${item.accuracyRate}%` }}
                      />
                    </div>

                    {/* Tooltip Interativo ao Passar o Mouse */}
                    {isHovered && (
                      <div className="absolute -top-12 right-0 z-30 bg-slate-950 border border-emerald-600 text-white text-[11px] py-1.5 px-3 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                        <span className="font-bold text-emerald-400">Ponto Forte:</span> {item.criticalTopic} •{' '}
                        <span className="text-slate-300">Conceito A Consolidado</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-[11px] text-emerald-300/90 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>Manutenção de Domínio:</strong> Mantenha revisões espaçadas ativas (7d e 30d) nestas matérias
                para preservar a velocidade sem sobrecarregar a carga horária semanal.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* ⚔️ SEÇÃO 2: CENTRAL DE INSERÇÃO E HISTÓRICO (ABAIXO DO DASHBOARD) */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-4 border-t border-slate-800/80">
        {/* Formulário de Inserção Tático */}
        <div className="p-6 rounded-2xl border border-slate-800 bg-[#0B1528] shadow-2xl space-y-5">
          <div className="flex items-center gap-3 border-b border-slate-800/80 pb-3">
            <div className="p-2 rounded-xl bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
                Cadastrar Nova Operação de Simulado
              </h2>
              <p className="text-xs text-slate-400">
                Alimente os dados do seu teste para recalcular as zonas de vulnerabilidade e gerar alvos de revisão
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitSimulation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Data do Simulado */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Data da Execução
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={formData.dateStr}
                    onChange={(e) => setFormData({ ...formData, dateStr: e.target.value })}
                    className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"
                  />
                </div>
              </div>

              {/* Fase da Prova */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Fase da Prova
                </label>
                <select
                  value={formData.phase}
                  onChange={(e) => setFormData({ ...formData, phase: e.target.value as 'EQ' | 'ED' })}
                  className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors cursor-pointer"
                >
                  <option value="EQ">Exame de Qualificação - EQ (60 Questões)</option>
                  <option value="ED">Exame Discursivo - ED (Física, Quím., Mat.)</option>
                </select>
              </div>

              {/* Título / Identificação do Simulado */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Identificação do Simulado / Banca
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Simulado UERJ 2026 #03 - Estratégia / QConcursos"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Pontuação e Conceito */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Questões Acertadas
                </label>
                <input
                  type="number"
                  min={0}
                  max={formData.totalQuestions}
                  value={formData.correctCount}
                  onChange={(e) => handleScoreChange(Number(e.target.value), formData.totalQuestions)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm font-bold rounded-xl px-3 py-2 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Total de Questões
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={formData.totalQuestions}
                  onChange={(e) => handleScoreChange(formData.correctCount, Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm font-bold rounded-xl px-3 py-2 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Conceito Calculado (UERJ)
                </label>
                <div
                  className={`px-3 py-2 rounded-xl text-xs font-black tracking-widest uppercase border flex items-center justify-between ${
                    formData.concept === 'A'
                      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/70 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : formData.concept === 'B'
                      ? 'bg-blue-950/70 text-blue-400 border-blue-600/70'
                      : formData.concept === 'C'
                      ? 'bg-amber-950/70 text-amber-400 border-amber-600/70'
                      : 'bg-red-950/70 text-red-400 border-red-700/70 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  }`}
                >
                  <span>Conceito {formData.concept}</span>
                  <span className="text-[10px] font-normal text-slate-300">
                    {Math.round((formData.correctCount / (formData.totalQuestions || 1)) * 100)}% de acerto
                  </span>
                </div>
              </div>
            </div>

            {/* Autoavaliação Crítica */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Autoavaliação Crítica (Diagnóstico de Erros e Sensação de Prova)
              </label>
              <textarea
                rows={3}
                placeholder="Descreva onde o tempo faltou, se houve desatenção em enunciados da UERJ, fórmulas esquecidas ou pegadinhas clássicas que você caiu..."
                value={formData.selfEvaluation}
                onChange={(e) => setFormData({ ...formData, selfEvaluation: e.target.value })}
                className="w-full bg-slate-900/90 border border-slate-700 text-slate-200 text-xs rounded-xl p-3 focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors placeholder:text-slate-600 leading-relaxed"
              />
            </div>

            {/* Alvos de Revisão (Tags) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Alvos de Revisão Imediata (Matérias e Microtópicos que precisam de reforço)
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Digite uma matéria ou tópico crítico e tecle Enter (Ex: Estequiometria)"
                  value={formData.tagInput}
                  onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 bg-slate-900/90 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:border-red-500 focus:ring-1 focus:ring-red-500 placeholder:text-slate-600"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag()}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Adicionar
                </button>
              </div>

              {/* Sugestões Rápidas de Alvos */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-[10px] text-slate-500 uppercase font-semibold mr-1">Sugestões Rápidas:</span>
                {QUICK_TAGS_SUGGESTIONS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="px-2 py-0.5 text-[10.5px] rounded-md bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              {/* Tags Atuais Adicionadas */}
              {formData.reviewTargets.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400">Alvos Selecionados:</span>
                  {formData.reviewTargets.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-950/60 border border-red-800/60 text-red-300"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-red-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Botão de Envio com Gradiente Vermelho-Carmesim */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-700 via-red-800 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-bold tracking-widest text-xs uppercase shadow-xl shadow-red-950/60 hover:shadow-red-900/70 transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-red-200" />
                <span>Salvar Operação no Registro de Batalha</span>
              </button>
            </div>
          </form>
        </div>

        {/* Registro de Batalha (Grid de Histórico de Simulados) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-400" />
                Registro de Batalha // Histórico de Simulados
              </h2>
              <p className="text-xs text-slate-400">
                Memória de combate detalhada para acompanhamento de evolução e análise de gaps
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Total Arquivado: {simulations.length} simulações
            </span>
          </div>

          {/* Grid de Cards de Simulados */}
          {simulations.length === 0 ? (
            <div className="p-8 rounded-2xl border border-slate-800 bg-[#0B1528] text-center space-y-3">
              <Crosshair className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm text-slate-400 font-semibold">Nenhum simulado registrado no histórico.</p>
              <p className="text-xs text-slate-500">
                Preencha o formulário acima para registrar sua primeira operação de simulado.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {simulations.map((sim) => {
                const isConceptA = sim.concept === 'A';
                const isConceptRisk = sim.concept === 'D' || sim.concept === 'Risco';
                const accuracy = Math.round((sim.correctCount / (sim.totalQuestions || 1)) * 100);

                return (
                  <div
                    key={sim.id}
                    className={`p-5 rounded-2xl border transition-all duration-200 shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden ${
                      isConceptA
                        ? 'bg-[#091522] border-emerald-500/50 hover:border-emerald-400 shadow-emerald-950/20'
                        : isConceptRisk
                        ? 'bg-[#150A10] border-red-900/60 hover:border-red-700 shadow-red-950/30'
                        : 'bg-[#0B1528] border-slate-800 hover:border-slate-700 shadow-black/40'
                    }`}
                  >
                    {/* Top Indicator Accent */}
                    {isConceptA && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
                    )}
                    {isConceptRisk && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-800" />
                    )}

                    {/* Card Header */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-500" />
                              {sim.dateStr}
                            </span>
                            <span
                              className={`px-2 py-0.2 rounded text-[9.5px] font-extrabold uppercase tracking-wider border ${
                                sim.phase === 'EQ'
                                  ? 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                                  : 'bg-purple-950/80 text-purple-300 border-purple-800/60'
                              }`}
                            >
                              {sim.phase === 'EQ' ? 'Exame Qualificação' : 'Exame Discursivo'}
                            </span>
                          </div>

                          <h3 className="text-sm font-extrabold text-white mt-1 leading-snug">
                            {sim.title}
                          </h3>
                        </div>

                        {/* Badge de Conceito */}
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-black tracking-widest uppercase border flex flex-col items-center shrink-0 ${
                            isConceptA
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/70 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                              : sim.concept === 'B'
                              ? 'bg-blue-950/80 text-blue-400 border-blue-600/70'
                              : sim.concept === 'C'
                              ? 'bg-amber-950/80 text-amber-400 border-amber-600/70'
                              : 'bg-red-950/80 text-red-400 border-red-600/70 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                          }`}
                        >
                          <span className="text-sm">{sim.concept}</span>
                          <span className="text-[8.5px] font-normal opacity-80">Conceito</span>
                        </div>
                      </div>

                      {/* Progresso de Acertos */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-slate-300 font-bold">
                          {sim.correctCount} de {sim.totalQuestions} acertos
                        </span>
                        <span
                          className={`font-black ${
                            isConceptA
                              ? 'text-emerald-400'
                              : isConceptRisk
                              ? 'text-red-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {accuracy}% de rendimento
                        </span>
                      </div>

                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isConceptA
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : isConceptRisk
                              ? 'bg-gradient-to-r from-red-700 to-red-500'
                              : 'bg-gradient-to-r from-blue-600 to-sky-400'
                          }`}
                          style={{ width: `${accuracy}%` }}
                        />
                      </div>
                    </div>

                    {/* Autoavaliação do Candidato */}
                    {sim.selfEvaluation && (
                      <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-900 text-xs text-slate-300 leading-relaxed italic">
                        "{sim.selfEvaluation}"
                      </div>
                    )}

                    {/* Alvos de Revisão Táticos (Badges idênticas às disciplinas) */}
                    {sim.reviewTargets && sim.reviewTargets.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Alvos de Revisão Críticos:
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sim.reviewTargets.map((target) => (
                            <span
                              key={target}
                              className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-900 text-red-300 border border-red-900/60 shadow-xs flex items-center gap-1"
                            >
                              <Crosshair className="w-2.5 h-2.5 text-red-400" />
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Card Footer: Botão Excluir */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500 font-mono">
                        ID: {sim.id.slice(-8)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSimulation(sim.id)}
                        className="text-slate-500 hover:text-red-400 text-xs transition-colors flex items-center gap-1 p-1 cursor-pointer"
                        title="Remover simulado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default TacticalSimulations;
