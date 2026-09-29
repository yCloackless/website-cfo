import React from 'react';
import { TrendingUp, ShieldCheck, Sparkles, BarChart2, BookOpen, Layers } from 'lucide-react';
import { BoardStats } from './types';

interface BoardDnaAnalyticsProps {
  stats?: BoardStats | null;
  isLoading: boolean;
}

export const BoardDnaAnalytics: React.FC<BoardDnaAnalyticsProps> = ({ stats, isLoading }) => {
  const hasDnaData = Boolean(
    stats &&
    stats.dna &&
    Object.keys(stats.dna).length > 0 &&
    stats.questionCount > 0
  );

  const dnaLabels: Record<string, { label: string; description: string }> = {
    interpretation: {
      label: 'Interpretação de Texto',
      description: 'Enunciados que exigem inferência e compreensão crítica',
    },
    calculation: {
      label: 'Cálculo & Exatas',
      description: 'Questões com fórmulas, operações matemáticas ou física',
    },
    memorization: {
      label: 'Memorização & Legislação',
      description: 'Cobrança direta de normas, prazos ou definições estritas',
    },
    contextualization: {
      label: 'Contextualização Prática',
      description: 'Problemas aplicados a situações reais e estudos de caso',
    },
    traps: {
      label: 'Pegadinhas & Distratores',
      description: 'Frequência de alternativas com termos restritivos e armadilhas',
    },
    graphUsage: {
      label: 'Gráficos & Imagens',
      description: 'Uso de suporte visual, esquemas, tabelas ou mapas',
    },
    longQuestions: {
      label: 'Extensão dos Enunciados',
      description: 'Carga de leitura por questão em relação à média geral',
    },
  };

  return (
    <section className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              DNA da Banca & Perfil Cognitivo
            </h2>
            <p className="text-[11px] text-slate-400">
              Assinatura estatística calibrada automaticamente com base nas provas homologadas.
            </p>
          </div>
        </div>
      </div>

      {!hasDnaData ? (
        <div className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400">
            <BarChart2 className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-slate-300">
            O perfil ainda não possui dados suficientes
          </h3>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            Adicione e homologue provas históricas para gerar a matriz cognitiva e as características estatísticas da banca.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Grid de Dimensões Cognitivas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Object.entries(stats.dna || {}).map(([key, value]) => {
              const info = dnaLabels[key] || {
                label: key,
                description: 'Indicador estatístico da banca',
              };
              const numericValue = typeof value === 'number' ? Math.min(100, Math.max(0, value)) : 0;

              return (
                <div
                  key={key}
                  className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between hover:border-slate-700/80 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-white truncate">
                        {info.label}
                      </span>
                      <span className="text-xs font-bold font-mono text-cyan-400 shrink-0">
                        {numericValue}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                      {info.description}
                    </p>
                  </div>

                  {/* Barra de Progresso HSL/Cyan Elegante */}
                  <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${numericValue}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Métricas de Estilo e Textura */}
          {stats.styleMetrics && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400">
                    Extensão Média dos Enunciados
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {stats.styleMetrics.averageStatementWords || 0} palavras / questão
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-slate-400">
                    Formato de Alternativas
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    Média de {stats.styleMetrics.averageAlternatives || 0} opções (A a E)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nota de Governança e Qualidade (Substitui termos técnicos internos por linguagem de produto) */}
      <div className="pt-2 border-t border-slate-800/70 flex items-center gap-2 text-[11px] text-slate-400">
        <ShieldCheck className="w-4 h-4 text-emerald-400/90 shrink-0" />
        <span>
          Somente provas homologadas e aprovadas são utilizadas para compor o perfil ativo e treinar a inteligência da banca.
        </span>
      </div>
    </section>
  );
};
