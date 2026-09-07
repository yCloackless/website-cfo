import React from 'react';
import {
  Sparkles,
  Trophy,
  Target,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  BookOpen,
  Calendar,
  Zap,
  Flame,
} from 'lucide-react';
import { AIAnalysisResult, Subject, AppTheme, WeeklyCycle } from '../types';
import { WeeklyStudySummary } from '../services/aiService';
import { StudyColumnCharts } from './StudyColumnCharts';

interface AIBalanceTabProps {
  theme: AppTheme;
  summary: WeeklyStudySummary;
  analysis: AIAnalysisResult | null;
  isLoading: boolean;
  onRefresh: () => void;
  analysisSource: string | null;
  lastUpdated: Date | null;
  subjects?: Subject[];
  currentCycle?: WeeklyCycle | null;
  cyclesHistory?: WeeklyCycle[];
}

export const AIBalanceTab: React.FC<AIBalanceTabProps> = ({
  theme,
  summary,
  analysis,
  isLoading,
  onRefresh,
  analysisSource,
  lastUpdated,
  subjects = [],
  currentCycle = null,
  cyclesHistory = [],
}) => {
  const isDark = theme === 'dark';

  // Calculate percentages for top subject
  const topSubjectMinutes = summary.subjectsStudied[0]?.minutes || 0;
  const totalMinutes = summary.totalHours * 60;
  const topPercentage =
    totalMinutes > 0 ? Math.round((topSubjectMinutes / totalMinutes) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner & Status bar */}
      <div
        className={`p-5 rounded-2xl border transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xl ${
          isDark
            ? 'bg-[#111218] border-slate-800'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#0056D2] to-sky-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                className={`text-base font-bold tracking-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Inteligência Artificial de Equilíbrio Semanal
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20">
                CFO CBMERJ
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                  analysisSource === 'gemini'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                }`}
              >
                {analysisSource === 'gemini'
                  ? '⚡ Google Gemini 3.8'
                  : '🤖 Inteligência CBMERJ'}
              </span>
            </div>
            <p
              className={`text-xs mt-1 max-w-2xl ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              A IA monitora automaticamente a matéria em que você mais colocou carga horária e projeta quais disciplinas você precisa priorizar na próxima semana para não deixar buracos no edital de Oficial Combatente.
            </p>
          </div>
        </div>

        {/* Auto update status & button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="flex items-center gap-1.5 justify-end text-[11px] font-medium text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Atualização Automática</span>
            </div>
            {lastUpdated && (
              <p
                className={`text-[10px] ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Última leitura: {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              isDark
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
            } disabled:opacity-50`}
            title="Recalcular análise pedagógica com a IA agora"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0056D2]' : ''}`} />
            <span>{isLoading ? 'Analisando...' : 'Reanalisar com IA'}</span>
          </button>
        </div>
      </div>

      {/* Gráfico em Coluna de Matérias Estudadas (Diário, Semanal, Mensal e Total) */}
      <StudyColumnCharts
        subjects={subjects}
        currentCycle={currentCycle}
        cyclesHistory={cyclesHistory}
        theme={theme}
      />

      {/* Grid: Most Studied Subject vs Equilibrium Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Card 1: Matéria Mais Estudada na Semana (Takes 2 cols) */}
        <div
          className={`lg:col-span-2 p-6 rounded-2xl border transition-colors shadow-xl flex flex-col justify-between ${
            isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-[#0056D2] dark:text-sky-400">
                    Maior Carga Horária na Semana
                  </p>
                  <h3
                    className={`text-lg font-bold ${
                      isDark ? 'text-slate-100' : 'text-slate-900'
                    }`}
                  >
                    {analysis?.topStudiedSubject?.name || summary.subjectsStudied[0]?.name || 'Nenhuma matéria concluída'}
                  </h3>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-[#0056D2] dark:text-sky-400 border border-blue-500/30">
                {analysis?.topStudiedSubject?.status || 'Foco Líder'}
              </span>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-3 my-4">
              <div
                className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p
                  className={`text-[10px] uppercase font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Tempo Dedicado
                </p>
                <p className="text-xl font-bold text-[#0056D2] dark:text-sky-400 mt-0.5">
                  {Math.max(1, Math.round(analysis?.topStudiedSubject?.hours || (topSubjectMinutes / 60)))}h
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p
                  className={`text-[10px] uppercase font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Sessões
                </p>
                <p
                  className={`text-xl font-bold mt-0.5 ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                >
                  {analysis?.topStudiedSubject?.sessions || summary.subjectsStudied[0]?.sessions || 0}
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <p
                  className={`text-[10px] uppercase font-semibold ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  % do Estudo Semanal
                </p>
                <p className="text-xl font-bold text-[#0056D2] dark:text-sky-400 mt-0.5">
                  {topPercentage}%
                </p>
              </div>
            </div>

            {/* AI Analysis Narrative */}
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                isDark
                  ? 'bg-slate-900/40 border-slate-800/80 text-slate-300'
                  : 'bg-blue-50/50 border-blue-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-[#0056D2] dark:text-sky-400 mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Diagnóstico Pedagógico da IA:</span>
              </div>
              <p>
                {analysis?.topStudiedSubject?.analysis ||
                  'À medida que você estuda matérias na tabela semanal, a IA correlaciona suas horas para verificar se você está desenvolvendo domínio técnico ou se está em hiperfoco inconsciente.'}
              </p>
            </div>
          </div>

          {/* Quick Topics studied under this subject */}
          {summary.subjectsStudied[0]?.topics && summary.subjectsStudied[0].topics.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800/60">
              <p
                className={`text-[11px] font-semibold mb-1.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Tópicos registrados nesta matéria:
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {summary.subjectsStudied[0].topics.map((top, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    📌 {top}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Termômetro de Equilíbrio & Pontuação */}
        <div
          className={`p-6 rounded-2xl border transition-colors shadow-xl flex flex-col justify-between ${
            isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-bold text-[#0056D2] dark:text-sky-400">
                  Termômetro de Equilíbrio
                </p>
                <h3
                  className={`text-base font-bold ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  Índice de Balanço Geral
                </h3>
              </div>
            </div>

            {/* Score Big Display */}
            <div className="my-4 text-center">
              <div className="inline-flex items-baseline gap-1">
                <span
                  className={`text-4xl font-black tracking-tight ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  {analysis?.equilibriumScore ?? 75}
                </span>
                <span className="text-sm font-semibold text-slate-500">/ 100</span>
              </div>
              <p
                className={`text-xs mt-1 ${
                  (analysis?.equilibriumScore ?? 75) >= 70
                    ? 'text-emerald-400 font-semibold'
                    : 'text-[#0056D2] dark:text-sky-400 font-semibold'
                }`}
              >
                {(analysis?.equilibriumScore ?? 75) >= 70
                  ? '✅ Boa distribuição de matérias'
                  : 'ℹ️ Necessário rebalancear próxima semana'}
              </p>

              {/* Progress bar */}
              <div
                className={`w-full h-2.5 rounded-full mt-3 overflow-hidden ${
                  isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-200'
                }`}
              >
                <div
                  className="h-full bg-gradient-to-r from-[#0056D2] via-blue-500 to-sky-400 transition-all duration-500"
                  style={{ width: `${analysis?.equilibriumScore ?? 75}%` }}
                />
              </div>
            </div>

            {/* General diagnosis */}
            <p
              className={`text-xs leading-relaxed mt-4 p-3 rounded-xl border ${
                isDark
                  ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              {analysis?.balanceDiagnosis ||
                'O concurso CFO CBMERJ exige nota mínima em cada disciplina. Manter todas as matérias ativas ao longo do mês garante que nenhuma caia no esquecimento.'}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <span>Matérias atendidas nesta semana:</span>
            <strong className="text-[#0056D2] dark:text-sky-400">
              {summary.subjectsStudied.length} de {summary.allSubjects.length}
            </strong>
          </div>
        </div>
      </div>

      {/* Section 2: Matérias a Priorizar na Próxima Semana (O que o usuário pediu explicitamente) */}
      <div
        className={`p-6 rounded-2xl border transition-colors shadow-xl ${
          isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-[#0056D2] dark:text-sky-400 border border-blue-500/20 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h3
                className={`text-base font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Matérias para Priorizar na Próxima Semana
              </h3>
              <p
                className={`text-xs ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Calculadas pela IA para equilibrar a grade com base nas lacunas da semana atual e no peso do edital do CBMERJ.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-[#0056D2] dark:text-sky-400 uppercase tracking-wider">
            Recomendação Tática
          </span>
        </div>

        {/* Priority Subjects Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {analysis?.prioritySubjectsForNextWeek && analysis.prioritySubjectsForNextWeek.length > 0 ? (
            analysis.prioritySubjectsForNextWeek.map((p, idx) => {
              const isHigh = p.urgency?.toLowerCase().includes('alta');

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all hover:scale-[1.01] ${
                    isHigh
                      ? isDark
                        ? 'bg-blue-950/20 border-blue-800/60 ring-1 ring-blue-800/40'
                        : 'bg-blue-50/60 border-blue-300'
                      : isDark
                      ? 'bg-slate-900/60 border-slate-800'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={`text-xs font-bold truncate ${
                          isDark ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {p.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          isHigh
                            ? 'bg-[#0056D2] text-white'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {isHigh ? 'Alta Prioridade' : 'Equilibrar'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-semibold text-[#0056D2] dark:text-sky-400 mb-2">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Meta sugerida: <strong>{p.recommendedHours}h</strong> na semana</span>
                    </div>

                    <p
                      className={`text-xs leading-relaxed mb-3 ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {p.reason}
                    </p>
                  </div>

                  {p.topicsSuggested && p.topicsSuggested.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/60 text-[11px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Foco recomendado:
                      </span>
                      <ul className="space-y-1">
                        {p.topicsSuggested.slice(0, 2).map((top, tIdx) => (
                          <li key={tIdx} className="text-slate-400 flex items-start gap-1">
                            <span className="text-[#0056D2] dark:text-sky-400">•</span>
                            <span className="truncate">{top}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="col-span-full py-8 text-center text-xs text-slate-500">
              Carregando matérias prioritárias...
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Plano Semanal Automatizado Sugerido pela IA (Segunda a Domingo) */}
      <div
        className={`p-6 rounded-2xl border transition-colors shadow-xl ${
          isDark ? 'bg-[#111218] border-slate-800' : 'bg-white border-slate-200 shadow-slate-200/50'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3
                className={`text-base font-bold ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Cronograma Tático Sugerido para a Próxima Semana
              </h3>
              <p
                className={`text-xs ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Estruturado de segunda a domingo para compensar as matérias que ficaram para trás nesta semana.
              </p>
            </div>
          </div>

          <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
            7 Dias Balanceados
          </span>
        </div>

        {/* Days Horizontal Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {analysis?.weeklyActionPlan?.map((plan, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border flex flex-col justify-between ${
                isDark
                  ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#0056D2] dark:text-sky-400 mb-1 truncate">
                  {plan.day.split('-')[0]}
                </p>
                <p
                  className={`text-xs font-bold truncate ${
                    isDark ? 'text-slate-100' : 'text-slate-900'
                  }`}
                >
                  {plan.focusSubject}
                </p>
                <p
                  className={`text-[11px] mt-1.5 line-clamp-2 leading-tight ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {plan.goal}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                <span>Meta:</span>
                <span className="text-[#0056D2] dark:text-sky-400 font-bold">{Math.max(1, Math.round((plan.suggestedMinutes || 60) / 60))}h</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Dica de Ouro Estratégica da IA */}
      {analysis?.tacticalTip && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 shadow-lg ${
            isDark
              ? 'bg-gradient-to-r from-blue-950/40 via-slate-900 to-blue-900/20 border-blue-900/50 text-slate-200'
              : 'bg-gradient-to-r from-blue-50 via-white to-sky-50 border-blue-200 text-slate-800'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-[#0056D2] text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-900/30">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#0056D2] dark:text-sky-400 mb-0.5">
              Dica Tática do CFO CBMERJ (Gerada pela IA)
            </h4>
            <p className="text-xs leading-relaxed">
              {analysis.tacticalTip}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
