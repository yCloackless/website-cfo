import React from 'react';
import { CheckCircle2, Clock, FileCheck2, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { BoardExam } from './types';

interface BoardExamReviewTableProps {
  exams: BoardExam[];
  onApproveExam: (examId: string) => Promise<void>;
  approvingExamId: string | null;
  canWrite: boolean;
}

export const BoardExamReviewTable: React.FC<BoardExamReviewTableProps> = ({
  exams,
  onApproveExam,
  approvingExamId,
  canWrite,
}) => {
  const getStatusBadge = (status: BoardExam['status']) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Aprovada
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" />
            Rejeitada
          </span>
        );
      case 'EXTRACTED':
      case 'REVIEW_REQUIRED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            Aguardando Homologação
          </span>
        );
    }
  };

  return (
    <section className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <FileCheck2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              Revisão e Homologação de Provas
            </h2>
            <p className="text-[11px] text-slate-400">
              Validação das questões extraídas antes da composição estatística oficial.
            </p>
          </div>
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="py-8 px-4 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 space-y-2">
          <div className="w-10 h-10 mx-auto rounded-full bg-slate-800/60 flex items-center justify-center text-slate-400">
            <FileCheck2 className="w-5 h-5" />
          </div>
          <h3 className="text-xs font-semibold text-slate-300">
            Nenhuma prova aguardando revisão
          </h3>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed">
            As provas importadas aparecerão aqui para homologação antes de serem incluídas no perfil ativo da banca.
          </p>
          <p className="text-[11px] text-cyan-400 font-medium pt-1">
            Importe uma prova no formulário acima para iniciar.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 text-[10px] uppercase font-semibold text-slate-400">
                <th className="pb-2.5 font-semibold">Prova</th>
                <th className="pb-2.5 font-semibold">Ano</th>
                <th className="pb-2.5 font-semibold">Status</th>
                <th className="pb-2.5 font-semibold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {exams.map((exam) => {
                const isApproving = approvingExamId === exam.id;
                return (
                  <tr key={exam.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 font-medium text-white">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-100">{exam.name}</span>
                        {exam.board && (
                          <span className="text-[10px] text-slate-400">Banca: {exam.board}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-slate-300 font-mono">
                      {exam.examYear}
                    </td>
                    <td className="py-3">
                      {getStatusBadge(exam.status)}
                    </td>
                    <td className="py-3 text-right">
                      {exam.status !== 'APPROVED' ? (
                        <button
                          type="button"
                          disabled={!canWrite || isApproving}
                          onClick={() => onApproveExam(exam.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                        >
                          {isApproving ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Homologando...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Homologar para aprendizado</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/90 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Integrada ao perfil
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
