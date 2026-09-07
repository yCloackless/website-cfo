import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

const STORAGE_KEY = 'cfo_cookie_consent';

export const CookieConsent: React.FC = () => {
  const [hasConsent, setHasConsent] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHasConsent(true);
      } else {
        setHasConsent(false);
      }
    } catch {
      // Se acesso a storage falhar, não bloqueia a interface
      setHasConsent(true);
    }
  }, []);

  const handleConsent = (mode: 'all' | 'necessary') => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          timestamp: new Date().toISOString(),
          version: '1.0',
        })
      );
    } catch (e) {
      console.warn('[CookieConsent] Falha ao gravar preferência no localStorage:', e);
    }
    setHasConsent(true);
  };

  // 1. Se já aceitou ou ainda está checando, não renderiza nada
  if (hasConsent === null || hasConsent === true) {
    return null;
  }

  // 2. Banner fixado na parte inferior
  return (
    <div
      role="region"
      aria-label="Aviso de Privacidade e Cookies LGPD"
      className="fixed bottom-0 left-0 right-0 w-full z-50 bg-slate-950/90 backdrop-blur-md border-t border-red-900/50 shadow-2xl animate-in fade-in slide-in-from-bottom duration-300"
    >
      <div className="max-w-7xl mx-auto px-4 py-3.5 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Descritivo Técnico LGPD */}
        <div className="flex items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="p-2 rounded-lg bg-red-950/40 border border-red-800/40 text-red-400 shrink-0 hidden sm:flex">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <p className="text-[12px] text-slate-400 leading-relaxed max-w-3xl">
            Este terminal utiliza cookies de sessão criptografados para manter seu 2FA ativo e sincronizar seu progresso de estudos no servidor. Ao prosseguir, você concorda com o monitoramento tático de rendimento.
          </p>
        </div>

        {/* Botões Táticos de Ação */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end shrink-0">
          <button
            type="button"
            onClick={() => handleConsent('necessary')}
            className="px-3.5 py-2 text-xs uppercase font-medium rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-500 active:scale-95"
          >
            ESTRITAMENTE NECESSÁRIOS
          </button>
          <button
            type="button"
            onClick={() => handleConsent('all')}
            className="px-4 py-2 text-xs uppercase rounded-md bg-gradient-to-r from-red-700 to-red-900 text-white font-bold tracking-widest shadow-md shadow-red-950/60 hover:from-red-600 hover:to-red-800 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 active:scale-95 flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5 opacity-80" />
            AUTORIZAR ACESSO (Aceitar Todos)
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
