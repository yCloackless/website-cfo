import React from 'react';
import { GitCompareArrows, Sparkles, Loader2, Check, Clock, History, AlertCircle } from 'lucide-react';
import { BoardVersion, BoardStats } from './types';

interface BoardVersionsHistoryProps {
  versions: BoardVersion[];
  stats?: BoardStats | null;
  onGenerateVersion: () => Promise<void>;
  onPublishVersion: (versionId: string) => Promise<void>;
  isGeneratingVersion: boolean;
  publishingVersionId: string | null;
  canWrite: boolean;
}

export const BoardVersionsHistory: React.FC<BoardVersionsHistoryProps> = ({
  versions,
  stats,
  onGenerateVersion,
  onPublishVersion,
  isGeneratingVersion,
  publishingVersionId,
  canWrite,
}) => {
  const hasApprovedExams = Boolean(stats && stats.examCount > 0 && stats.questionCount > 0);

  const getStatusBadge = (status: BoardVersion['status']) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" />
            Ativa
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Rascunho
          </span>
        );
      case 'SUPERSEDED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60">
            Arquivada
          </span>
        );
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <section className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <GitCompareArrows className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              Histórico de Versões & Snapshots
            </h2>
            <p className="text-[11px] text-slate-400">
              Snapshots imutáveis das características estatísticas da banca.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerateVersion}
            disabled={!canWrite || !hasApprovedExams || isGeneratingVersion}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shrink-0"
            title={!hasApprovedExams ? 'É necessário possuir ao menos uma prova aprovada' : 'Gerar novo snapshot'}
          >
            {isGeneratingVersion ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Gerando versão...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Gerar nova versão</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!hasApprovedExams && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>É necessário possuir ao menos uma prova aprovada para gerar uma nova versão imutável.</span>
        </div>
      )}

      {versions.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400">
            <History className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-slate-300">
            Nenhuma versão publicada
          </h3>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            Depois que provas forem homologadas, gere uma versão imutável para consolidar o perfil estatístico da banca.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {versions.map((ver) => {
            const isPublishing = publishingVersionId === ver.id;
            return (
              <div
                key={ver.id}
                className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/50 hover:bg-slate-900/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">
                      V{ver.version}
                    </span>
                    {getStatusBadge(ver.status)}
                    {ver.createdAt && (
                      <span className="text-[10px] text-slate-400">
                        {formatDate(ver.publishedAt || ver.createdAt)}
                      </span>
                    )}
                  </div>
                  {ver.styleSummary && (
                    <p className="text-[11px] text-slate-300 leading-snug">
                      {ver.styleSummary}
                    </p>
                  )}
                </div>

                {ver.status === 'DRAFT' && (
                  <div className="shrink-0">
                    <button
                      type="button"
                      disabled={!canWrite || isPublishing}
                      onClick={() => onPublishVersion(ver.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isPublishing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Publicando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Publicar como Ativa</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
