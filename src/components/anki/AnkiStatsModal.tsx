import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart3,
  Flame,
  Calendar,
  Clock,
  CheckCircle2,
  TrendingUp,
  BrainCircuit,
  Award,
} from 'lucide-react';
import { AnkiStatsSummary } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';

interface AnkiStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckId?: string;
  deckName?: string;
}

export const AnkiStatsModal: React.FC<AnkiStatsModalProps> = ({
  isOpen,
  onClose,
  deckId,
  deckName,
}) => {
  const [stats, setStats] = useState<AnkiStatsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      try {
        setLoading(true);
        const url = deckId
          ? `/api/anki/stats?deckId=${encodeURIComponent(deckId)}`
          : '/api/anki/stats';
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats || null);
        }
      } catch {} finally {
        setLoading(false);
      }
    };

    void fetchStats();
  }, [isOpen, deckId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold text-zinc-100">
              Estatísticas do Anki {deckName ? `· ${deckName}` : '· Toda a Coleção'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6 text-zinc-300">
          {loading ? (
            <div className="py-20 text-center text-zinc-500 text-sm">Carregando estatísticas do Anki...</div>
          ) : !stats ? (
            <div className="py-20 text-center text-zinc-500 text-sm">Nenhum dado estatístico disponível.</div>
          ) : (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-semibold uppercase mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Retenção</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono">
                    {stats.retentionRatePercent}%
                  </div>
                  <span className="text-[11px] text-zinc-500">Taxa de sucesso geral</span>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-semibold uppercase mb-1">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <span>Tempo Hoje</span>
                  </div>
                  <div className="text-2xl font-bold text-sky-400 font-mono">
                    {stats.timeSpentTodayMinutes} min
                  </div>
                  <span className="text-[11px] text-zinc-500">{stats.reviewsToday} revisões hoje</span>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-semibold uppercase mb-1">
                    <BrainCircuit className="w-4 h-4 text-amber-400" />
                    <span>Maduros</span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 font-mono">
                    {stats.matureCards}
                  </div>
                  <span className="text-[11px] text-zinc-500">Intervalo ≥ 21 dias</span>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 font-semibold uppercase mb-1">
                    <Award className="w-4 h-4 text-purple-400" />
                    <span>Total Cards</span>
                  </div>
                  <div className="text-2xl font-bold text-zinc-100 font-mono">
                    {stats.totalCards}
                  </div>
                  <span className="text-[11px] text-zinc-500">Na coleção ativa</span>
                </div>
              </div>

              {/* Cards Breakdown by State */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Distribuição por Estado do Cartão
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="text-sky-400 font-bold font-mono text-base block">{stats.newCards}</span>
                    <span className="text-zinc-500">Novos</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="text-amber-400 font-bold font-mono text-base block">{stats.learnCards + stats.relearnCards}</span>
                    <span className="text-zinc-500">Aprender</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="text-emerald-400 font-bold font-mono text-base block">{stats.reviewCards}</span>
                    <span className="text-zinc-500">Revisão</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="text-zinc-400 font-bold font-mono text-base block">{stats.suspendedCards}</span>
                    <span className="text-zinc-500">Suspensos</span>
                  </div>
                  <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                    <span className="text-zinc-500 font-bold font-mono text-base block">{stats.buriedCards}</span>
                    <span className="text-zinc-500">Enterrados</span>
                  </div>
                </div>
              </div>

              {/* Rating Buttons Distribution (Again, Hard, Good, Easy) */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Histórico de Respostas (Botões de Avaliação)
                </h3>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <span className="text-lg font-bold font-mono text-red-400 block">{stats.againPercent}%</span>
                    <span className="text-xs text-red-300">De novo</span>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-lg font-bold font-mono text-amber-400 block">{stats.hardPercent}%</span>
                    <span className="text-xs text-amber-300">Difícil</span>
                  </div>
                  <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <span className="text-lg font-bold font-mono text-sky-400 block">{stats.goodPercent}%</span>
                    <span className="text-xs text-sky-300">Bom</span>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-lg font-bold font-mono text-emerald-400 block">{stats.easyPercent}%</span>
                    <span className="text-xs text-emerald-300">Fácil</span>
                  </div>
                </div>
              </div>

              {/* Future Workload (Next 30 Days Forecast) */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-sky-400" />
                  <span>Previsão de Carga Futura (Próximos 30 Dias)</span>
                </h3>
                <div className="flex items-end gap-1 h-28 pt-2 overflow-x-auto">
                  {stats.futureWorkload.slice(0, 21).map((item) => {
                    const maxVal = Math.max(1, ...stats.futureWorkload.map((i) => i.dueCount));
                    const heightPercent = Math.min(100, Math.max(8, (item.dueCount / maxVal) * 100));

                    return (
                      <div
                        key={item.date}
                        className="flex-1 flex flex-col items-center gap-1 min-w-[14px] group"
                        title={`${item.date}: ${item.dueCount} revisões`}
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t transition-all ${
                            item.dayOffset === 0
                              ? 'bg-sky-400'
                              : item.dueCount > 0
                              ? 'bg-zinc-700 group-hover:bg-zinc-500'
                              : 'bg-zinc-800/40'
                          }`}
                        />
                        <span className="text-[9px] font-mono text-zinc-600 truncate">
                          {item.dayOffset === 0 ? 'Hoje' : `+${item.dayOffset}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Heatmap Activity */}
              {stats.studyHeatmap && stats.studyHeatmap.length > 0 && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-500" />
                    <span>Mapa de Calor de Revisões (Atividade Recente)</span>
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {stats.studyHeatmap.slice(-30).map((h) => (
                      <div
                        key={h.date}
                        className={`w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-mono ${
                          h.count >= 20
                            ? 'bg-emerald-500 text-zinc-950 font-bold'
                            : h.count >= 10
                            ? 'bg-emerald-600 text-white'
                            : h.count >= 1
                            ? 'bg-emerald-800/80 text-emerald-200'
                            : 'bg-zinc-900 border border-zinc-800 text-zinc-700'
                        }`}
                        title={`${h.date}: ${h.count} revisões`}
                      >
                        {h.count > 0 ? h.count : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
