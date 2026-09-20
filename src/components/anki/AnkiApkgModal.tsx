import React, { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { AnkiDeck } from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';

interface AnkiApkgModalProps {
  decks: AnkiDeck[];
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiApkgModal: React.FC<AnkiApkgModalProps> = ({
  decks,
  isOpen,
  onClose,
  onImportComplete,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [exportDeckId, setExportDeckId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importReport, setImportReport] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.apkg')) {
      showToast?.('Selecione um arquivo de extensão .apkg válido do Anki.', 'error');
      return;
    }

    try {
      setIsProcessing(true);
      setImportReport(null);

      const arrayBuffer = await file.arrayBuffer();
      const base64Data = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const res = await apiFetch('/api/anki/import-apkg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportReport(data);
        showToast?.('Pacote .apkg importado com sucesso!', 'success');
        onImportComplete();
      } else {
        showToast?.('Falha ao importar o pacote .apkg.', 'error');
      }
    } catch {
      showToast?.('Erro ao ler arquivo .apkg.', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    const url = exportDeckId
      ? `/api/anki/export-apkg?deckId=${encodeURIComponent(exportDeckId)}`
      : '/api/anki/export-apkg';

    // Direct browser trigger
    window.open(url, '_blank');
    showToast?.('Exportação iniciada! Seu arquivo .apkg começará a baixar.', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-zinc-100">Interoperabilidade Anki (.apkg)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-2 border-b border-zinc-800 bg-zinc-950 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'import'
                ? 'bg-zinc-800 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Upload className="w-4 h-4 text-sky-400" />
            <span>Importar .apkg</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'export'
                ? 'bg-zinc-800 text-zinc-100 shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Exportar .apkg</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {activeTab === 'import' ? (
            <div className="space-y-4">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                accept=".apkg"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-sky-500 rounded-2xl p-8 text-center cursor-pointer transition-all bg-zinc-950/40 hover:bg-zinc-950 flex flex-col items-center justify-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="font-semibold text-sm text-zinc-200 block">
                    {isProcessing ? 'Importando e processando pacote...' : 'Clique para selecionar arquivo .apkg'}
                  </span>
                  <span className="text-xs text-zinc-500 mt-1 block">
                    Compatível com baralhos exportados do Anki Desktop ou AnkiMobile
                  </span>
                </div>
              </div>

              {importReport && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-emerald-400 mb-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Importação Concluída com Sucesso!</span>
                  </div>
                  <div>• Baralhos criados: {importReport.decksCreated}</div>
                  <div>• Notas importadas: {importReport.notesCreated}</div>
                  <div>• Flashcards gerados: {importReport.cardsCreated}</div>
                  <div>• Arquivos de mídia salvos: {importReport.mediaSaved}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                  Qual baralho deseja exportar?
                </label>
                <select
                  value={exportDeckId}
                  onChange={(e) => setExportDeckId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
                >
                  <option value="">Toda a Coleção (Todos os Baralhos)</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400 space-y-1.5">
                <span className="font-semibold text-zinc-200 block">Garantia de Compatibilidade Anki</span>
                <p>
                  O arquivo gerado é um pacote ZIP nativo contendo o banco SQLite <code>collection.anki2</code>,
                  modelos de notas, agendamento FSRS e assets de mídia prontos para importação direta no Anki Desktop.
                </p>
              </div>

              <button
                type="button"
                onClick={handleExport}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl text-sm transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Pacote .apkg</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
