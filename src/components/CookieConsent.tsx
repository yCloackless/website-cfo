import React, { useEffect, useState } from 'react';
import { ShieldCheck, Cookie, SlidersHorizontal } from 'lucide-react';
import { CookiePolicyModal } from './CookiePolicyModal';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

const STORAGE_KEY = 'cfo_cookie_consent';

export const CookieConsent: React.FC = () => {
  const [acknowledged, setAcknowledged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      return Boolean(localStorage.getItem(STORAGE_KEY));
    } catch {
      return true;
    }
  });
  const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  const acknowledgeNecessary = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        mode: 'necessary',
        timestamp: new Date().toISOString(),
        version: '1.0',
      }));
    } catch (error) {
      console.warn('[CookieConsent] Falha ao gravar preferencia:', error);
    }
    setAcknowledged(true);
  };

  return (
    <>
      {acknowledged === false && (
        <div
          role="region"
          aria-label="Aviso de privacidade e cookies"
          className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-blue-900/50 bg-slate-950/95 shadow-2xl backdrop-blur-md"
          style={{ contain: 'layout paint' }}
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-3.5 sm:px-6 md:flex-row lg:px-8">
            <div className="flex w-full items-start gap-3 md:w-auto sm:items-center">
              <div className="hidden shrink-0 rounded-lg border border-blue-800/40 bg-blue-950/40 p-2 text-blue-400 sm:flex">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="max-w-3xl text-[12px] leading-relaxed text-slate-300">
                Utilizamos cookies estritamente necessários para autenticação segura (com criptografia e isolamento <em>HttpOnly</em>) e armazenamento local para o cronômetro tático e estudo offline. Não usamos rastreadores publicitários. Saiba mais em nossa{' '}
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  Política de Privacidade
                </button>{' '}
                e{' '}
                <button
                  type="button"
                  onClick={() => setIsCookieModalOpen(true)}
                  className="text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  Política de Cookies
                </button>.
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsCookieModalOpen(true)}
                className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Preferências
              </button>
              <button
                type="button"
                onClick={acknowledgeNecessary}
                className="shrink-0 rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-500 shadow-md shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Aceitar Essenciais
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modais acionáveis a partir do banner */}
      <CookiePolicyModal
        isOpen={isCookieModalOpen}
        onClose={() => setIsCookieModalOpen(false)}
        onSavedPreferences={() => {
          acknowledgeNecessary();
          setIsCookieModalOpen(false);
        }}
      />
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </>
  );
};

export default CookieConsent;
