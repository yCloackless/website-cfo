import React from 'react';
import { Upload, Loader2, AlertCircle, FileText } from 'lucide-react';

interface BoardImportExamCardProps {
  title: string;
  examYear: number;
  rawTextContent: string;
  onChangeTitle: (val: string) => void;
  onChangeYear: (val: number) => void;
  onChangeContent: (val: string) => void;
  onSubmit: () => void;
  isImporting: boolean;
  canWrite: boolean;
  selectedProfileId: string;
  selectedProfileName?: string;
}

export const BoardImportExamCard: React.FC<BoardImportExamCardProps> = ({
  title,
  examYear,
  rawTextContent,
  onChangeTitle,
  onChangeYear,
  onChangeContent,
  onSubmit,
  isImporting,
  canWrite,
  selectedProfileId,
  selectedProfileName,
}) => {
  const isFormValid =
    Boolean(selectedProfileId) &&
    Boolean(title.trim()) &&
    examYear >= 1990 &&
    rawTextContent.trim().length >= 10;

  // Determina mensagem explicativa do estado disabled
  let disabledReason = '';
  if (!canWrite) {
    disabledReason = 'Apenas administradores com permissão de escrita podem importar provas.';
  } else if (!selectedProfileId) {
    disabledReason = 'Selecione um perfil da banca no topo da página antes de importar.';
  } else if (!title.trim() && !rawTextContent.trim()) {
    disabledReason = 'Preencha o nome da prova, o ano e o caderno de questões.';
  } else if (!title.trim()) {
    disabledReason = 'Informe o nome ou identificador da prova (ex: CEDERJ 2026.1).';
  } else if (rawTextContent.trim().length < 10) {
    disabledReason = 'Cole o texto das questões para análise e extração.';
  }

  return (
    <section className="bg-[#0B1220] border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">
              Adicionar Prova Histórica
            </h2>
            <p className="text-[11px] text-slate-400">
              {selectedProfileName ? (
                <span>Vinculando ao perfil <strong className="text-cyan-400 font-semibold">{selectedProfileName}</strong></span>
              ) : (
                <span className="text-amber-400">Selecione um perfil para habilitar o envio</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <label
            htmlFor="exam-title-input"
            className="block text-xs font-semibold text-slate-300"
          >
            Nome da Prova
          </label>
          <input
            id="exam-title-input"
            type="text"
            value={title}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder="Ex: CEDERJ 2026.1 - 1ª Fase"
            disabled={isImporting || !canWrite}
            className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all disabled:opacity-50"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="exam-year-input"
            className="block text-xs font-semibold text-slate-300"
          >
            Ano de Aplicação
          </label>
          <input
            id="exam-year-input"
            type="number"
            min={1990}
            max={new Date().getFullYear() + 2}
            value={examYear}
            onChange={(e) => onChangeYear(Number(e.target.value))}
            disabled={isImporting || !canWrite}
            className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition-all disabled:opacity-50"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="exam-raw-content"
            className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Caderno de Questões (Texto Bruto)
          </label>
          <span className="text-[11px] font-mono text-slate-400">
            {rawTextContent.length.toLocaleString('pt-BR')} caracteres
          </span>
        </div>

        <textarea
          id="exam-raw-content"
          rows={7}
          value={rawTextContent}
          onChange={(e) => onChangeContent(e.target.value)}
          placeholder="Cole aqui o texto da prova com enunciados e alternativas. As questões serão extraídas e enviadas para homologação..."
          disabled={isImporting || !canWrite}
          className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-500 outline-none font-sans leading-relaxed transition-all resize-y min-h-[140px] disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="text-[11px] text-slate-400">
          {!isFormValid && disabledReason ? (
            <span className="flex items-center gap-1.5 text-amber-400/90 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {disabledReason}
            </span>
          ) : (
            <span className="text-slate-400">
              A extração estruturada identificará enunciados, alternativas e taxonomia preliminar.
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!isFormValid || !canWrite || isImporting}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-cyan-900/20 shrink-0"
        >
          {isImporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Analisando prova...</span>
            </>
          ) : (
            <>
              <Upload className="w-3.5 h-3.5" />
              <span>Importar e analisar</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
