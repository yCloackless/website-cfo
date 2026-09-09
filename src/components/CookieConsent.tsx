import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const STORAGE_KEY = 'cfo_cookie_consent';

export const CookieConsent: React.FC = () => {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setAcknowledged(Boolean(localStorage.getItem(STORAGE_KEY)));
    } catch {
      setAcknowledged(true);
    }
  }, []);

  const acknowledge = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: 'necessary',
        timestamp: new Date().toISOString(),
        version: '2.0',
      }));
    } catch (error) {
      console.warn('[CookieConsent] Falha ao gravar preferencia:', error);
    }
    setAcknowledged(true);
  };

  if (acknowledged !== false) return null;

  return (
    <div role="region" aria-label="Aviso de privacidade" className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-blue-900/50 bg-slate-950/95 shadow-2xl backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-3.5 sm:px-6 md:flex-row lg:px-8">
        <div className="flex w-full items-start gap-3 md:w-auto sm:items-center">
          <div className="hidden shrink-0 rounded-lg border border-blue-800/40 bg-blue-950/40 p-2 text-blue-400 sm:flex">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="max-w-3xl text-[12px] leading-relaxed text-slate-300">
            Usamos somente um cookie de sessao essencial, protegido e inacessivel ao JavaScript, alem do armazenamento local necessario a interface. Nao usamos cookies publicitarios. Dados de estudo sao enviados a provedores de IA apenas quando voce aciona um recurso de IA.
          </p>
        </div>
        <button type="button" onClick={acknowledge} className="shrink-0 rounded-md bg-blue-700 px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          Entendi
        </button>
      </div>
    </div>
  );
};

export default CookieConsent;
