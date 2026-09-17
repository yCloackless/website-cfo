import React, { useState, useEffect } from 'react';
import { Download, Check, Copy, Flame, X, Monitor, Loader2, AlertCircle, ShieldCheck, Sparkles, Terminal, ChevronRight } from 'lucide-react';
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
    if (token) return;

    let isMounted = true;
    setIsLoadingToken(true);
    setTokenError(null);

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
      } catch {
        // Fallback para token local
      }

      if (isMounted) {
        const local = localStorage.getItem('cfo_terminal_session');
        if (local && local !== 'cookie') {
          setToken(local);
        } else {
          setTokenError('Não foi possível gerar a chave automaticamente. Recarregue a página ou refaça login.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
      <div
        className={`relative w-full max-w-xl rounded-[28px] sm:rounded-[32px] border p-6 sm:p-8 shadow-[0_25px_80px_-15px_rgba(0,0,0,0.8)] overflow-hidden transition-all duration-300 ${
          isDark
            ? 'bg-[#070D18]/95 border-cyan-500/20 text-white shadow-cyan-950/30'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/50'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extension-modal-title"
      >
        {/* Glows Ambientais Dinâmicos de Cockpit */}
        <div className="absolute -top-28 -right-28 w-64 h-64 rounded-full bg-blue-600/25 blur-[90px] pointer-events-none animate-pulse" />
        <div className="absolute -bottom-28 -left-28 w-64 h-64 rounded-full bg-orange-600/20 blur-[90px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-cyan-600/10 blur-[120px] pointer-events-none" />

        {/* Botão Fechar com Efeito de Vidro */}
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-5 right-5 p-2.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
            isDark
              ? 'border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-950 hover:bg-slate-100 hover:border-slate-300'
          }`}
          aria-label="Fechar modal"
        >
          <X size={18} />
        </button>

        {/* Hero Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="relative">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-red-600 via-orange-500 to-amber-400 flex items-center justify-center text-white shadow-xl shadow-orange-500/30 shrink-0">
              <Flame size={28} className="animate-pulse" />
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-[#070D18]"></span>
            </span>
          </div>

          <div className="min-w-0 pr-8">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/15 text-cyan-300 border border-cyan-500/30">
                <Monitor size={11} /> Exclusivo para Computador
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Sparkles size={10} /> Nuvem Ativa
              </span>
            </div>
            <h3 id="extension-modal-title" className="text-xl sm:text-2xl font-black tracking-tight leading-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Extensão CFO CBMERJ
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Cronômetro tático e marcador de questões (certa/errada) sincronizados em tempo real no seu navegador.
            </p>
          </div>
        </div>

        {/* Card Hero: Download 1-Clique do Pacote ZIP */}
        <div className="relative group overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-[#0B1528] to-[#0A1220] p-4 sm:p-5 mb-4 shadow-lg shadow-blue-950/40">
          <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all duration-500 pointer-events-none" />
          
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                Pacote Oficial (.ZIP)
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              v1.0 • 19 KB • Pronto
            </span>
          </div>

          <a
            href="/api/download/extension"
            download="cfo-cbmerj-extensao.zip"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 px-5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 shadow-xl shadow-blue-600/30 hover:shadow-cyan-500/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
          >
            <Download size={18} className="animate-bounce" />
            <span>Baixar Extensão (.ZIP)</span>
          </a>

          <p className="text-[11px] text-center text-slate-400 mt-2.5 flex items-center justify-center gap-1.5">
            <ShieldCheck size={14} className="text-cyan-400 shrink-0" />
            <span>Download direto do site oficial. Sem necessidade de acessar o GitHub.</span>
          </p>
        </div>

        {/* Console de Conexão: URL Oficial & Chave Pessoal */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-5 mb-5 space-y-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-cyan-400" />
              <span className="text-[11px] font-mono font-black uppercase tracking-wider text-slate-300">
                Console de Vinculação
              </span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Conexão Segura
            </span>
          </div>

          {/* 1. URL da Plataforma */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-url-input" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                1. URL da Plataforma (Pré-Configurada no ZIP)
              </label>
              {copiedUrl && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 animate-in fade-in">
                  <Check size={12} /> Copiada!
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
                className="flex-1 px-3 py-2 rounded-xl text-xs font-mono border border-white/10 bg-[#070D18] text-cyan-300 outline-none select-all focus:border-cyan-500/50 transition-colors"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-200 border border-white/15 shrink-0 active:scale-95 transition-all cursor-pointer"
              >
                {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedUrl ? 'Copiada' : 'Copiar URL'}</span>
              </button>
            </div>
          </div>

          {/* 2. Chave Pessoal (API Key) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="modal-token-input" className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                2. Sua Chave de Acesso Pessoal (API Key)
              </label>
              {copied && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 animate-in fade-in">
                  <Check size={12} /> Chave Copiada!
                </span>
              )}
            </div>

            {isLoadingToken ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400 bg-[#070D18] rounded-xl border border-white/10">
                <Loader2 size={16} className="animate-spin text-cyan-400" />
                <span>Gerando chave de vinculação para sua conta...</span>
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
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-mono border border-white/10 bg-[#070D18] text-slate-200 outline-none select-all focus:border-blue-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleCopyToken}
                  disabled={!token}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 hover:scale-[1.02] active:scale-95'
                  }`}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copiada!' : 'Copiar Chave'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Guia Rápido Visual em 3 Passos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6 text-xs">
          <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-black text-[11px] border border-blue-500/30">
                1
              </span>
              <span className="font-bold text-slate-200 text-[11px]">Baixe e Extraia</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Baixe o arquivo <strong>.zip</strong> acima e extraia em qualquer pasta.
            </p>
          </div>

          <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-black text-[11px] border border-blue-500/30">
                2
              </span>
              <span className="font-bold text-slate-200 text-[11px]">Modo Desenvolvedor</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Abra <code className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10px]">chrome://extensions</code> e ative o botão no topo.
            </p>
          </div>

          <div className="p-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 font-black text-[11px] border border-blue-500/30">
                3
              </span>
              <span className="font-bold text-slate-200 text-[11px]">Carregar Pasta</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Clique em <strong>Carregar sem compactação</strong> e cole sua chave!
            </p>
          </div>
        </div>

        {/* Botão de Fechar */}
        <button
          type="button"
          onClick={onClose}
          className={`w-full py-3 rounded-2xl font-bold text-xs tracking-wide transition-all border cursor-pointer ${
            isDark
              ? 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white'
              : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          Fechar Painel
        </button>
      </div>
    </div>
  );
};
