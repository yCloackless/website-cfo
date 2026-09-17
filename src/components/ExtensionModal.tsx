import React, { useState } from 'react';
import { Download, Check, Copy, ExternalLink, Flame, Shield, X, Monitor } from 'lucide-react';
import { AppTheme } from '../types';

interface ExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: AppTheme;
}

export const ExtensionModal: React.FC<ExtensionModalProps> = ({
  isOpen,
  onClose,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const sessionToken = localStorage.getItem('cfo_terminal_session') || '';

  const handleCopyToken = () => {
    if (!sessionToken || sessionToken === 'cookie') {
      alert('Faça login na plataforma para gerar seu token de acesso.');
      return;
    }
    navigator.clipboard.writeText(sessionToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      window.prompt('Copie seu token da extensão:', sessionToken);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-hidden transition-all ${
          isDark ? 'bg-[#0c1322] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-950'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-modal-title"
      >
        {/* Glow de fundo */}
        <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-48 h-48 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />

        {/* Botão Fechar */}
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-5 right-5 p-2 rounded-xl border transition-colors ${
            isDark ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:text-slate-950 hover:bg-slate-100'
          }`}
          aria-label="Fechar modal"
        >
          <X size={18} />
        </button>

        {/* Cabeçalho */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 via-orange-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-orange-500/25 shrink-0">
            <Flame size={24} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 mb-1">
              <Monitor size={11} /> Exclusivo para Computador
            </div>
            <h3 id="extension-modal-title" className="text-xl font-black tracking-tight leading-tight">
              Extensão CFO CBMERJ
            </h3>
            <p className="text-xs text-slate-400">
              Cronômetro de estudos e marcador de questões (certa/errada) sincronizados.
            </p>
          </div>
        </div>

        {/* Bloco 1: Download Direto do Pacote */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Pacote da Extensão (Manifest V3)
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              19 KB • Pronto para uso
            </span>
          </div>

          <a
            href="/cfo-extensao-cbmerj.zip"
            download="cfo-cbmerj-extensao.zip"
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 shadow-lg shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Download size={18} />
            Baixar Extensão (.ZIP)
          </a>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            Download direto. Não precisa baixar o repositório completo do GitHub.
          </p>
        </div>

        {/* Bloco 2: Chave de Acesso para Conectar */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <label htmlFor="modal-token-input" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Sua Chave de Vinculação
          </label>
          <div className="flex gap-2">
            <input
              id="modal-token-input"
              type="password"
              readOnly
              value={sessionToken && sessionToken !== 'cookie' ? sessionToken : 'Faça login para gerar sua chave'}
              className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none ${
                isDark ? 'bg-black/40 border-white/10 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
              }`}
            />
            <button
              type="button"
              onClick={handleCopyToken}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                copied
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                  : isDark
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
              }`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Bloco 3: Guia Rápido de Instalação (3 Passos) */}
        <div className="space-y-2.5 mb-6 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              1
            </span>
            <p>Baixe o arquivo <strong>.zip</strong> acima e descompacte a pasta no seu computador.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              2
            </span>
            <p>
              No Chrome/Edge/Brave, acesse <code className="px-1 py-0.5 rounded bg-white/10 font-mono text-[11px]">chrome://extensions/</code> e ative o <strong>Modo do desenvolvedor</strong>.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              3
            </span>
            <p>Clique em <strong>Carregar sem compactação</strong>, selecione a pasta e cole sua chave na aba <strong>Conexão (⚙️)</strong>.</p>
          </div>
        </div>

        {/* Botão de Fechar */}
        <button
          type="button"
          onClick={onClose}
          className={`w-full py-2.5 rounded-xl font-bold text-sm transition-colors border ${
            isDark ? 'border-white/10 hover:bg-white/5 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
          }`}
        >
          Entendido, fechar
        </button>
      </div>
    </div>
  );
};
