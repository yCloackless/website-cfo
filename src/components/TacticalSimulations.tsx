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
  XCircle,
  Clock,
  BookOpen,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Cpu,
  Zap,
  Filter,
  FileText,
  X,
  RefreshCw,
  Calculator,
  Plus,
} from 'lucide-react';
import { AppTheme } from '../types';

export interface SimulationRecord {
  id: string;
  dateStr: string;
  title: string;
  examType: string; // Banca / Tipo livre: UERJ, CBMERJ, ENEM, FGV, Geral, etc.
  totalQuestions: number; // Quantas questões fiz
  correctCount: number; // Quantas acertei
  wrongCount: number; // Quantas errei (total - acertos)
  concept: 'A' | 'B' | 'C' | 'D' | 'Risco';
  selfEvaluation: string;
  reviewTargets: string[];
  createdAt: string;
}

interface TacticalSimulationsProps {
  theme?: AppTheme;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

import { getUserStorageKey } from '../utils/userStorage';

export const TacticalSimulations: React.FC<TacticalSimulationsProps> = ({
  theme = 'dark',
  showToast,
}) => {
  const isDark = theme === 'dark';

  // 1. Estado de Filtro de Tempo
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | 'all'>('all');

  // 2. Estado de Simulados com persistência em localStorage (Totalmente vazio por padrão, sem dados de exemplo)
  const [simulations, setSimulations] = useState<SimulationRecord[]>(() => {
    try {
      const storageKey = getUserStorageKey('cfo_tactical_simulations');
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Remove dados mockados antigos de exemplo (sim_01, sim_02, etc.)
          const userSims = parsed.filter(
            (s: any) =>
              s &&
              s.id &&
              !['sim_01', 'sim_02', 'sim_03', 'sim_04'].includes(s.id) &&
              !s.title?.includes('Modelo Oficial UERJ EQ')
          );
          return userSims;
        }
      }
    } catch (e) {
      console.warn('[Simulations] Falha ao ler do localStorage:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      const storageKey = getUserStorageKey('cfo_tactical_simulations');
      localStorage.setItem(storageKey, JSON.stringify(simulations));
    } catch (e) {
      console.error('[Simulations] Falha ao salvar no localStorage:', e);
    }
  }, [simulations]);

  // 3. Estado do Formulário de Inserção (Limpo, sem valores pré-preenchidos)
  const [formData, setFormData] = useState({
    dateStr: new Date().toISOString().split('T')[0],
    examType: '',
    title: '',
    totalQuestions: '',
    correctCount: '',
    selfEvaluation: '',
    tagInput: '',
    reviewTargets: [] as string[],
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isAiRegenerating, setIsAiRegenerating] = useState(false);
  const [aiAnalysisIndex, setAiAnalysisIndex] = useState(0);

  // Cálculos dinâmicos em tempo real do formulário
  const totalNum = Number(formData.totalQuestions) || 0;
  const correctNum = Number(formData.correctCount) || 0;
  // Quantas errou = Total - Acertos (mínimo 0)
  const wrongNum = Math.max(0, totalNum - correctNum);
  const calculatedAccuracy = totalNum > 0 ? Math.round((correctNum / totalNum) * 100) : 0;

  // Conceito balístico calculado
  const calculatedConcept: 'A' | 'B' | 'C' | 'D' | 'Risco' = useMemo(() => {
    if (totalNum <= 0) return 'Risco';
    const ratio = correctNum / totalNum;
    if (ratio >= 0.8) return 'A';
    if (ratio >= 0.7) return 'B';
    if (ratio >= 0.6) return 'C';
    if (ratio >= 0.5) return 'D';
    return 'Risco';
  }, [correctNum, totalNum]);

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

    if (totalNum <= 0) {
      showToast?.('Informe a quantidade de questões feitas.', 'error');
      return;
    }

    if (correctNum > totalNum) {
      showToast?.('O número de acertos não pode ser maior que o total de questões!', 'error');
      return;
    }

    const newSim: SimulationRecord = {
      id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      dateStr: formData.dateStr,
      title: formData.title.trim(),
      examType: formData.examType.trim() || 'Geral',
      totalQuestions: totalNum,
      correctCount: correctNum,
      wrongCount: wrongNum,
      concept: calculatedConcept,
      selfEvaluation: formData.selfEvaluation.trim(),
      reviewTargets: formData.reviewTargets,
      createdAt: new Date().toISOString(),
    };

    setSimulations((prev) => [newSim, ...prev]);
    showToast?.('Simulado registrado com sucesso no histórico!', 'success');

    // Reseta campos do formulário para vazio
    setFormData({
      dateStr: new Date().toISOString().split('T')[0],
      examType: '',
      title: '',
      totalQuestions: '',
      correctCount: '',
      selfEvaluation: '',
      tagInput: '',
      reviewTargets: [],
    });
  };

  const handleDeleteSimulation = (id: string) => {
    if (confirm('Deseja remover este registro de simulado do histórico?')) {
      setSimulations((prev) => prev.filter((s) => s.id !== id));
      showToast?.('Simulado removido com sucesso.', 'info');
    }
  };

  // Métricas agregadas reais com base nos simulados adicionados pelo usuário
  const metrics = useMemo(() => {
    const totalSims = simulations.length;
    if (totalSims === 0) {
      return {
        totalSims: 0,
        totalQuestionsDone: 0,
        totalCorrect: 0,
        totalWrong: 0,
        avgAccuracy: 0,
        conceptACount: 0,
        latestConcept: 'N/A',
      };
    }
    const totalQuestionsDone = simulations.reduce((acc, s) => acc + s.totalQuestions, 0);
    const totalCorrect = simulations.reduce((acc, s) => acc + s.correctCount, 0);
    const totalWrong = simulations.reduce(
      (acc, s) => acc + (s.wrongCount ?? Math.max(0, s.totalQuestions - s.correctCount)),
      0
    );
    const avgAccuracy = totalQuestionsDone > 0 ? Math.round((totalCorrect / totalQuestionsDone) * 100) : 0;
    const conceptACount = simulations.filter((s) => s.concept === 'A').length;
    const latestConcept = simulations[0]?.concept || 'N/A';

    return {
      totalSims,
      totalQuestionsDone,
      totalCorrect,
      totalWrong,
      avgAccuracy,
      conceptACount,
      latestConcept,
    };
  }, [simulations]);

  // Alvos mais frequentes de revisão cadastrados pelo usuário
  const frequentTargets = useMemo(() => {
    const counts: Record<string, number> = {};
    simulations.forEach((sim) => {
      sim.reviewTargets?.forEach((target) => {
        counts[target] = (counts[target] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [simulations]);

  // Diretrizes dinâmicas da IA baseadas nos dados reais do usuário
  const aiDirectives = useMemo(() => {
    if (simulations.length === 0) {
      return [
        {
          title: 'TERMINAL DE INTELIGÊNCIA OPERACIONAL // AGUARDANDO DADOS',
          body: '> STATUS: Nenhum simulado registrado no histórico.\n> AÇÃO: Cadastre seu primeiro teste no formulário abaixo (qualquer banca ou tipo: UERJ, CBMERJ, ENEM, FGV, etc.).\n> O sistema calculará automaticamente suas questões feitas, acertos, erradas e gerará o diagnóstico tático.',
        },
      ];
    }

    const latest = simulations[0];
    const topVulnerabilities = frequentTargets.map(([t]) => t).join(', ') || 'Nenhum alvo crítico cadastrado';

    return [
      {
        title: `DIAGNÓSTICO OPERACIONAL // RENDIMENTO GERAL: ${metrics.avgAccuracy}%`,
        body: `> BANCO DE TESTES: ${metrics.totalSims} simulado(s) registrado(s) | ${metrics.totalQuestionsDone} questões resolvidas.\n> BALANÇO: ${metrics.totalCorrect} acertos e ${metrics.totalWrong} erros acumulados.\n> ALVOS PRIORITÁRIOS: ${topVulnerabilities}.\n> DIRETRIZ: Dedique 60% do tempo de revisão aos alvos recorrentes antes de iniciar a próxima bateria de testes.`,
      },
      {
        title: `ÚLTIMA OPERAÇÃO // ${latest.title.toUpperCase()}`,
        body: `> RESULTADO: ${latest.correctCount} de ${latest.totalQuestions} acertos (${Math.round(
          (latest.correctCount / latest.totalQuestions) * 100
        )}% de rendimento).\n> QUESTÕES ERRADAS: ${latest.wrongCount} itens perdidos.\n> AVALIAÇÃO: ${
          latest.selfEvaluation || 'Sem autoavaliação registrada.'
        }`,
      },
      {
        title: `GESTÃO DE DESEMPENHO E METAS`,
        body: `> META: Atingir média superior a 80% (Conceito A) com taxa de erros inferior a 20%.\n> DESEMPENHO ATUAL: ${metrics.avgAccuracy}% de aproveitamento geral com ${metrics.conceptACount} simulado(s) na faixa A.`,
      },
    ];
  }, [simulations, metrics, frequentTargets]);

  const currentDirective = aiDirectives[aiAnalysisIndex % aiDirectives.length];

  const handleRegenerateAi = () => {
    setIsAiRegenerating(true);
    setTimeout(() => {
      setAiAnalysisIndex((prev) => prev + 1);
      setIsAiRegenerating(false);
      showToast?.('Diretriz tática recalculada.', 'info');
    }, 400);
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-300 pb-12">
      {/* ========================================================================= */}
      {/* 🚀 CABEÇALHO DA CENTRAL DE INTELIGÊNCIA & SIMULADOS */}
      {/* ========================================================================= */}
      <div
        className={`p-6 rounded-2xl border transition-colors shadow-xl relative overflow-hidden ${
          isDark
            ? 'bg-gradient-to-br from-[#0B1528] via-slate-950 to-black border-slate-800'
            : 'bg-white border-slate-200 shadow-slate-200/60'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-red-700 via-red-800 to-red-950 border border-red-500/30 flex items-center justify-center text-white shadow-lg shadow-red-950/60 shrink-0">
              <Crosshair className="w-6 h-6 text-red-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className={`text-xl font-black tracking-tight uppercase flex items-center gap-2 ${
                    isDark ? 'text-white' : 'text-slate-950'
                  }`}
                >
                  Central de Inteligência & Simulados
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-red-950/80 text-red-400 border border-red-800/60">
                  TACTICAL OPS
                </span>
              </div>
              <p
                className={`text-xs mt-1 max-w-2xl leading-relaxed ${
                  isDark ? 'text-slate-400' : 'text-slate-700 font-medium'
                }`}
              >
                Cadastre seus simulados de qualquer banca ou modelo. O sistema calcula automaticamente os
                acertos, contabiliza as erradas e mensura seu rendimento em tempo real.
              </p>
            </div>
          </div>

          {/* Cards de Métricas Reais do Topo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className={`p-3 rounded-xl border shadow-sm flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Simulados
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {metrics.totalSims}
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border shadow-sm flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Acertos
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                >
                  {metrics.totalCorrect}
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border shadow-sm flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-red-500/10 text-red-500">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Erradas
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-red-400' : 'text-red-700'
                  }`}
                >
                  {metrics.totalWrong}
                </p>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border shadow-sm flex items-center gap-3 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase font-bold tracking-wider ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  Rendimento
                </p>
                <p
                  className={`text-lg font-black ${
                    isDark ? 'text-amber-400' : 'text-amber-700'
                  }`}
                >
                  {metrics.avgAccuracy}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🎯 SEÇÃO 1: CONSOLE DA IA TÁTICA */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="rounded-2xl border border-red-950/60 bg-black shadow-2xl p-3.5 sm:p-5 relative overflow-hidden font-mono">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              </div>
              <span className="text-[11px] text-slate-400 tracking-wider flex items-center gap-1.5 truncate">
                <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">CONSOLE_INTELIGENCIA</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                <span className="hidden sm:inline">ONLINE [IA ATIVA]</span>
              </div>
              <button
                type="button"
                onClick={handleRegenerateAi}
                disabled={isAiRegenerating}
                title="Recalcular diretrizes com base nos simulados cadastrados"
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isAiRegenerating ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Recalcular</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 text-xs leading-relaxed">
            <div className="text-emerald-500 font-bold tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span>{currentDirective.title}</span>
            </div>

            <div className="bg-slate-950/90 p-3.5 rounded-xl border border-slate-900 text-slate-200 whitespace-pre-line leading-loose break-words overflow-x-auto">
              {currentDirective.body}
              <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 translate-y-0.5 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Zonas de Alvos Críticos (Calculados dos dados reais) */}
        {frequentTargets.length > 0 && (
          <div
            className={`p-4 rounded-2xl border ${
              isDark ? 'bg-[#0B1528] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <h3
                  className={`text-xs font-black uppercase tracking-wider ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Tópicos Mais Citados para Revisão
                </h3>
              </div>
              <span className="text-[10px] font-bold text-red-400 uppercase">
                Prioridade de Estudo
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {frequentTargets.map(([targetName, count]) => (
                <span
                  key={targetName}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                    isDark
                      ? 'bg-red-950/50 text-red-300 border-red-900/60'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  <Crosshair className="w-3 h-3 text-red-500" />
                  <span>{targetName}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-800 text-white font-bold">
                    {count}x
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* ⚔️ SEÇÃO 2: FORMULÁRIO DE CADASTRO COM CÁLCULO AUTOMÁTICO */}
      {/* ========================================================================= */}
      <section className="space-y-6 pt-2">
        <div
          className={`p-6 rounded-2xl border shadow-xl space-y-5 ${
            isDark ? 'border-slate-800 bg-[#0B1528]' : 'border-slate-200 bg-white shadow-slate-200/50'
          }`}
        >
          <div className="flex items-center gap-3 border-b pb-3 border-slate-700/50">
            <div className="p-2 rounded-xl bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h2
                className={`text-sm font-black uppercase tracking-wider ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                Cadastrar Novo Simulado
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                Informe o nome, a banca/tipo, as questões feitas e acertos. O sistema calcula automaticamente as
                erradas e o percentual.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitSimulation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Data do Simulado */}
              <div>
                <label
                  className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-800'
                  }`}
                >
                  Data da Execução
                </label>
                <input
                  type="date"
                  required
                  value={formData.dateStr}
                  onChange={(e) => setFormData({ ...formData, dateStr: e.target.value })}
                  className={`w-full text-xs rounded-xl px-3 py-2.5 border transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 focus:border-red-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-red-600'
                  }`}
                />
              </div>

              {/* Banca / Tipo (Livre: UERJ, CBMERJ, ENEM, FGV, etc.) */}
              <div>
                <label
                  className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-800'
                  }`}
                >
                  Banca / Tipo de Prova (Livre)
                </label>
                <input
                  type="text"
                  placeholder="Ex: UERJ, CBMERJ, FGV, ENEM, Geral..."
                  value={formData.examType}
                  onChange={(e) => setFormData({ ...formData, examType: e.target.value })}
                  className={`w-full text-xs rounded-xl px-3 py-2.5 border transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-red-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-600'
                  }`}
                />
                {/* Atalhos Rápidos para preencher a banca */}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {['UERJ', 'CBMERJ', 'FGV', 'ENEM', 'Cebraspe', 'Geral'].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setFormData({ ...formData, examType: opt })}
                      className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold transition-colors cursor-pointer ${
                        formData.examType === opt
                          ? 'bg-red-700 text-white border-red-600'
                          : isDark
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-black'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Identificação / Título do Simulado */}
              <div>
                <label
                  className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                    isDark ? 'text-slate-300' : 'text-slate-800'
                  }`}
                >
                  Identificação / Título do Simulado
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Simulado 01, Prova 2024, Lista de Física..."
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full text-xs rounded-xl px-3 py-2.5 border transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-red-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-600'
                  }`}
                />
              </div>
            </div>

            {/* PAINEL DE CONTABILIZAÇÃO AUTOMÁTICA: Feitas, Acertos, Erradas e Rendimento */}
            <div
              className={`p-4 rounded-xl border space-y-3 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-red-500" />
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Contabilização Balística (Cálculo Automático)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Quantas questões fez */}
                <div>
                  <label
                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    1. Quantas Questões Fez (Total)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    placeholder="Ex: 60"
                    value={formData.totalQuestions}
                    onChange={(e) => setFormData({ ...formData, totalQuestions: e.target.value })}
                    className={`w-full text-sm font-black rounded-xl px-3 py-2.5 border transition-colors ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600'
                    }`}
                  />
                </div>

                {/* Quantas questões acertou */}
                <div>
                  <label
                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    2. Quantas Acertou
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalNum || 500}
                    required
                    placeholder="Ex: 50"
                    value={formData.correctCount}
                    onChange={(e) => setFormData({ ...formData, correctCount: e.target.value })}
                    className={`w-full text-sm font-black rounded-xl px-3 py-2.5 border transition-colors ${
                      isDark
                        ? 'bg-slate-900 border-slate-700 text-emerald-400 focus:border-emerald-500'
                        : 'bg-white border-slate-300 text-emerald-700 focus:border-emerald-600'
                    }`}
                  />
                </div>

                {/* Quantas errou (Cálculo Automático) */}
                <div>
                  <label
                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    3. Quantas Errou (Calculado)
                  </label>
                  <div
                    className={`px-3 py-2.5 rounded-xl border flex items-center justify-between ${
                      isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
                    }`}
                  >
                    <span className="text-sm font-black text-red-500">
                      {wrongNum} erradas
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      ({totalNum} - {correctNum})
                    </span>
                  </div>
                </div>

                {/* Porcentagem de Rendimento (Cálculo Automático) */}
                <div>
                  <label
                    className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                      isDark ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    4. % de Rendimento
                  </label>
                  <div
                    className={`px-3 py-2.5 rounded-xl border flex items-center justify-between ${
                      calculatedAccuracy >= 80
                        ? isDark
                          ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/70'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : calculatedAccuracy >= 60
                        ? isDark
                          ? 'bg-blue-950/70 text-blue-400 border-blue-600/70'
                          : 'bg-blue-50 text-blue-800 border-blue-300'
                        : isDark
                        ? 'bg-red-950/70 text-red-400 border-red-700/70'
                        : 'bg-red-50 text-red-800 border-red-300'
                    }`}
                  >
                    <span className="text-sm font-black">{calculatedAccuracy}% de acerto</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      Conceito {calculatedConcept}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Autoavaliação / Anotações */}
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-800'
                }`}
              >
                Observações & Autoavaliação da Prova (Opcional)
              </label>
              <textarea
                rows={2}
                placeholder="Descreva onde o tempo apertou, se houve desatenção, fórmulas esquecidas ou impressões gerais..."
                value={formData.selfEvaluation}
                onChange={(e) => setFormData({ ...formData, selfEvaluation: e.target.value })}
                className={`w-full text-xs rounded-xl p-3 border transition-colors ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-red-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-600'
                }`}
              />
            </div>

            {/* Alvos de Revisão Críticos (Tags) */}
            <div>
              <label
                className={`block text-[11px] font-extrabold uppercase tracking-wider mb-1.5 ${
                  isDark ? 'text-slate-300' : 'text-slate-800'
                }`}
              >
                Matérias ou Assuntos que Você Errou (Para Gerar Revisão)
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Digite um assunto ou disciplina e pressione Enter (Ex: Estequiometria, Funções, Crase...)"
                  value={formData.tagInput}
                  onChange={(e) => setFormData({ ...formData, tagInput: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className={`flex-1 text-xs rounded-xl px-3 py-2.5 border transition-colors ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-red-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-red-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleAddTag()}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  }`}
                >
                  Adicionar
                </button>
              </div>

              {/* Tags Adicionadas */}
              {formData.reviewTargets.length > 0 && (
                <div
                  className={`flex items-center gap-2 flex-wrap mt-3 p-3 rounded-xl border ${
                    isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <span
                    className={`text-[11px] font-bold ${
                      isDark ? 'text-slate-400' : 'text-slate-700'
                    }`}
                  >
                    Alvos Adicionados:
                  </span>
                  {formData.reviewTargets.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-950/60 border border-red-800/60 text-red-300"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        className="text-red-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Botão de Envio */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-red-700 via-red-800 to-red-900 hover:from-red-600 hover:to-red-800 text-white font-black tracking-widest text-xs uppercase shadow-xl shadow-red-950/60 hover:shadow-red-900/70 transition-all flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-red-200" />
                <span>Salvar Simulado no Histórico</span>
              </button>
            </div>
          </form>
        </div>

        {/* ========================================================================= */}
        {/* 📋 HISTÓRICO REAL DE SIMULADOS (Cards Reais) */}
        {/* ========================================================================= */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2
                className={`text-sm font-black uppercase tracking-widest flex items-center gap-2 ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                <FileText className="w-4 h-4 text-red-400" />
                Registro de Batalha // Histórico de Simulados
              </h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Acompanhe o rendimento, o saldo de acertos e as questões erradas de cada teste.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Total Registrado: {simulations.length} simulado(s)
            </span>
          </div>

          {/* Estado Vazio (Sem exemplos prévios, limpo para o usuário preencher) */}
          {simulations.length === 0 ? (
            <div
              className={`p-10 rounded-2xl border text-center space-y-3 ${
                isDark ? 'border-slate-800 bg-[#0B1528]' : 'border-slate-200 bg-white shadow-sm'
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
                <Crosshair className="w-6 h-6" />
              </div>
              <p
                className={`text-sm font-bold ${
                  isDark ? 'text-slate-300' : 'text-slate-800'
                }`}
              >
                Nenhum simulado cadastrado ainda.
              </p>
              <p
                className={`text-xs max-w-md mx-auto leading-relaxed ${
                  isDark ? 'text-slate-500' : 'text-slate-600'
                }`}
              >
                Preencha o formulário acima para registrar sua primeira prova, simulado ou lista de exercícios.
                Você pode colocar qualquer banca (UERJ, CBMERJ, FGV, ENEM, etc.).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {simulations.map((sim) => {
                const isConceptA = sim.concept === 'A';
                const isConceptRisk = sim.concept === 'D' || sim.concept === 'Risco';
                const accuracy = Math.round((sim.correctCount / (sim.totalQuestions || 1)) * 100);
                const wrong = sim.wrongCount ?? Math.max(0, sim.totalQuestions - sim.correctCount);

                return (
                  <div
                    key={sim.id}
                    className={`p-5 rounded-2xl border transition-all duration-200 shadow-xl flex flex-col justify-between space-y-4 relative overflow-hidden ${
                      isDark
                        ? isConceptA
                          ? 'bg-[#091522] border-emerald-500/50 shadow-emerald-950/20'
                          : isConceptRisk
                          ? 'bg-[#150A10] border-red-900/60 shadow-red-950/30'
                          : 'bg-[#0B1528] border-slate-800 shadow-black/40'
                        : isConceptA
                        ? 'bg-white border-emerald-300 shadow-emerald-100'
                        : isConceptRisk
                        ? 'bg-white border-red-300 shadow-red-100'
                        : 'bg-white border-slate-300 shadow-slate-200/50'
                    }`}
                  >
                    {/* Linha de Destaque Superior */}
                    {isConceptA && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />
                    )}
                    {isConceptRisk && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-700 via-red-500 to-red-800" />
                    )}

                    {/* Cabeçalho do Card */}
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
                                isDark
                                  ? 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                                  : 'bg-blue-50 text-blue-800 border-blue-300'
                              }`}
                            >
                              {sim.examType || 'Simulado'}
                            </span>
                          </div>

                          <h3
                            className={`text-sm font-black mt-1 leading-snug ${
                              isDark ? 'text-white' : 'text-slate-950'
                            }`}
                          >
                            {sim.title}
                          </h3>
                        </div>

                        {/* Badge de Conceito / Desempenho */}
                        <div
                          className={`px-3 py-1 rounded-xl text-xs font-black tracking-widest uppercase border flex flex-col items-center shrink-0 ${
                            isConceptA
                              ? isDark
                                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/70'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : sim.concept === 'B'
                              ? isDark
                                ? 'bg-blue-950/80 text-blue-400 border-blue-600/70'
                                : 'bg-blue-50 text-blue-800 border-blue-300'
                              : sim.concept === 'C'
                              ? isDark
                                ? 'bg-amber-950/80 text-amber-400 border-amber-600/70'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                              : isDark
                              ? 'bg-red-950/80 text-red-400 border-red-600/70'
                              : 'bg-red-50 text-red-800 border-red-300'
                          }`}
                        >
                          <span className="text-sm">{sim.concept}</span>
                          <span className="text-[8.5px] font-normal opacity-80">Conceito</span>
                        </div>
                      </div>

                      {/* Bloco de Contabilização: Total, Acertos, Erradas e % */}
                      <div
                        className={`p-2.5 rounded-xl border grid grid-cols-3 gap-2 text-center ${
                          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold block">Feitas</span>
                          <span
                            className={`text-xs font-black ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {sim.totalQuestions}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-500 uppercase font-bold block">Acertos</span>
                          <span className="text-xs font-black text-emerald-500">
                            {sim.correctCount}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-red-500 uppercase font-bold block">Erradas</span>
                          <span className="text-xs font-black text-red-500">
                            {wrong}
                          </span>
                        </div>
                      </div>

                      {/* Rendimento e Barra de Progresso */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-slate-400 font-semibold">Aproveitamento</span>
                        <span
                          className={`font-black ${
                            isConceptA
                              ? 'text-emerald-500'
                              : isConceptRisk
                              ? 'text-red-500'
                              : 'text-blue-500'
                          }`}
                        >
                          {accuracy}% de rendimento
                        </span>
                      </div>

                      <div
                        className={`h-2.5 w-full rounded-full overflow-hidden p-0.5 border ${
                          isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-200 border-slate-300'
                        }`}
                      >
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

                    {/* Autoavaliação */}
                    {sim.selfEvaluation && (
                      <div
                        className={`p-3 rounded-xl border text-xs leading-relaxed italic ${
                          isDark
                            ? 'bg-slate-950/70 border-slate-900 text-slate-300'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        "{sim.selfEvaluation}"
                      </div>
                    )}

                    {/* Alvos de Revisão Críticos */}
                    {sim.reviewTargets && sim.reviewTargets.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Matérias / Assuntos para Revisar:
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sim.reviewTargets.map((target) => (
                            <span
                              key={target}
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 ${
                                isDark
                                  ? 'bg-slate-900 text-red-300 border-red-900/60'
                                  : 'bg-red-50 text-red-800 border-red-200'
                              }`}
                            >
                              <Crosshair className="w-2.5 h-2.5 text-red-500" />
                              {target}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rodapé do Card: ID e Botão Excluir */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                      <span className="text-[10px] text-slate-500 font-mono">
                        ID: {sim.id.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteSimulation(sim.id)}
                        className="text-slate-500 hover:text-red-500 text-xs transition-colors flex items-center gap-1 p-1 cursor-pointer"
                        title="Remover simulado do histórico"
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
