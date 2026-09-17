import React, { useState, useEffect } from 'react';
import { Download, Check, Copy, Flame, X, Monitor, Loader2, AlertCircle } from 'lucide-react';
import { AppTheme } from '../types';
import { apiFetch } from '../services/apiFetch';

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
  const [token, setToken] = useState<string>('');
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const PLATFORM_URL = 'https://cfo-oficial-agorasim.onrender.com';

  useEffect(() => {
    if (!isOpen) return;

    // Se já tiver um token válido em memória, não busca novamente
    if (token) return;

    let isMounted = true;
    setIsLoadingToken(true);
    setTokenError(null);

    // Tenta primeiro carregar token dedicado do backend (funciona tanto com cookie de produção quanto com bearer)
    (async () => {
      try {
        const res = await apiFetch('/api/user/extension-token');
        if (res.ok) {
          const data = await res.json();
          if (data?.token && isMounted) {
            setToken(data.token);
            return;
          }
        }
      } catch (err) {
        // Fallback para token local se houver
      }

      // Fallback: verificar se há token no localStorage que não seja o marcador 'cookie'
      if (isMounted) {
        const local = localStorage.getItem('cfo_terminal_session');
        if (local && local !== 'cookie') {
          setToken(local);
        } else {
          setTokenError('Não foi possível gerar o token automaticamente. Recarregue a página ou faça login novamente.');
        }
      }
    })().finally(() => {
      if (isMounted) setIsLoadingToken(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(PLATFORM_URL).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    });
  };

  const handleCopyToken = () => {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }).catch(() => {
      // Fallback sem popup nativo
      const input = document.getElementById('modal-token-input') as HTMLInputElement | null;
      if (input) {
        input.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-lg rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-hidden transition-all ${
          isDark ? 'bg-[#0b1222] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-950'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-modal-title"
      >
        {/* Glow tático de fundo */}
        <div className="absolute -top-24 -right-24 w-52 h-52 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-52 h-52 rounded-full bg-orange-600/15 blur-3xl pointer-events-none" />

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
              Cronômetro de estudos e marcador de questões sincronizados em tempo real.
            </p>
          </div>
        </div>

        {/* Bloco 1: Download Direto do Pacote */}
        <div className={`p-4 rounded-2xl border mb-4 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Pacote da Extensão (.ZIP)
            </span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              19 KB • Pronto para uso
            </span>
          </div>

          <a
            href="/api/download/extension"
            download="cfo-cbmerj-extensao.zip"
            className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-xl font-black text-sm text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 shadow-lg shadow-blue-600/30 hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <Download size={18} />
            Baixar Extensão (.ZIP)
          </a>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            Download direto do site oficial. Sem necessidade de acessar o GitHub.
          </p>
        </div>

        {/* Bloco 2: URL Oficial da Plataforma */}
        <div className={`p-4 rounded-2xl border mb-3 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="modal-url-input" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              URL Oficial da Plataforma
            </label>
            {copiedUrl ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 animate-in fade-in">
                <Check size={12} /> URL Copiada!
              </span>
            ) : (
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wide">
                Pré-configurada no ZIP
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              id="modal-url-input"
              type="text"
              readOnly
              value={PLATFORM_URL}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none select-all ${
                isDark ? 'bg-black/50 border-white/10 text-cyan-300' : 'bg-white border-slate-300 text-cyan-800'
              }`}
            />
            <button
              type="button"
              onClick={handleCopyUrl}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                copiedUrl
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                  : isDark
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              }`}
            >
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
              {copiedUrl ? 'Copiada!' : 'Copiar URL'}
            </button>
          </div>
        </div>

        {/* Bloco 3: Chave de Acesso para Conectar */}
        <div className={`p-4 rounded-2xl border mb-5 ${isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="modal-token-input" className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Sua Chave de Vinculação
            </label>
            {copied && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 animate-in fade-in">
                <Check size={12} /> Copiado para a área de transferência!
              </span>
            )}
          </div>

          {isLoadingToken ? (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
              <Loader2 size={16} className="animate-spin text-blue-400" />
              <span>Gerando chave de acesso segura...</span>
            </div>
          ) : tokenError ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertCircle size={16} className="shrink-0 text-amber-400" />
              <span>{tokenError}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                id="modal-token-input"
                type="text"
                readOnly
                value={token}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono border outline-none select-all ${
                  isDark ? 'bg-black/50 border-white/10 text-slate-200' : 'bg-white border-slate-300 text-slate-900'
                }`}
              />
              <button
                type="button"
                onClick={handleCopyToken}
                disabled={!token}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  copied
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                }`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copiado!' : 'Copiar Chave'}
              </button>
            </div>
          )}
        </div>

        {/* Bloco 3: Guia Rápido de Instalação (3 Passos) */}
        <div className="space-y-2.5 mb-6 text-xs text-slate-300">
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              1
            </span>
            <p>Baixe o arquivo <strong>.zip</strong> acima e extraia os arquivos em uma pasta no seu computador.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              2
            </span>
            <p>
              No Chrome/Edge/Brave, acesse <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px]">chrome://extensions/</code> e ative o <strong>Modo do desenvolvedor</strong>.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] border border-blue-500/30">
              3
            </span>
            <p>Clique em <strong>Carregar sem compactação</strong>, selecione a pasta extraída e cole sua chave na aba <strong>Conexão (⚙️)</strong>.</p>
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
