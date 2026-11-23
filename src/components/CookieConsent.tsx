import React, { useState } from 'react';
import { ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { AppAppearance, AppTheme } from '../types';
import { CookiePolicyModal } from './CookiePolicyModal';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

const STORAGE_KEY = 'cfo_cookie_consent';

interface CookieConsentProps {
  theme?: AppTheme;
  appearance?: AppAppearance;
}

export const CookieConsent: React.FC<CookieConsentProps> = ({
  theme = 'dark',
  appearance = 'default',
}) => {
  const isDark = theme === 'dark';
  const isNotion = appearance === 'notion';
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

  const bannerClasses = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#202020]/95 text-[#e6e6e4]'
      : 'border-[#e6e6e3] bg-[#fbfbfa]/95 text-[#37352f]'
    : 'border-blue-900/50 bg-slate-950/95 text-slate-300';

  const shieldClasses = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#262626] text-[#e6e6e4]'
      : 'border-[#e6e6e3] bg-[#f1f1ef] text-[#37352f]'
    : 'border-blue-800/40 bg-blue-950/40 text-blue-400';

  const bodyTextClasses = isNotion
    ? isDark
      ? 'text-[#e6e6e4]/90'
      : 'text-[#37352f]'
    : 'text-slate-300';

  const linkClasses = isNotion
    ? isDark
      ? 'text-white hover:text-[#e6e6e4] underline font-semibold cursor-pointer'
      : 'text-[#37352f] hover:opacity-75 underline font-semibold cursor-pointer'
    : 'text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer';

  const prefsButtonClasses = isNotion
    ? isDark
      ? 'border-white/[0.12] bg-[#262626] text-[#e6e6e4] hover:bg-[#2f2f2f] hover:text-white'
      : 'border-[#e6e6e3] bg-white text-[#37352f] hover:bg-[#f1f1ef]'
    : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white';

  const acceptButtonClasses = isNotion
    ? isDark
      ? 'bg-[#2f2f2f] hover:bg-[#3a3a3a] text-white border border-white/[0.14] focus:ring-white/30'
      : 'bg-[#37352f] hover:bg-[#262521] text-white focus:ring-[#37352f]/30'
    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/20 focus:ring-blue-500';

  return (
    <>
      {acknowledged === false && (
        <div
          role="region"
          aria-label="Aviso de privacidade e cookies"
          className={`fixed bottom-0 left-0 right-0 z-50 w-full border-t shadow-2xl backdrop-blur-md transition-colors ${bannerClasses}`}
          style={{ contain: 'layout paint' }}
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-3.5 sm:px-6 md:flex-row lg:px-8">
            <div className="flex w-full items-start gap-3 md:w-auto sm:items-center">
              <div className={`hidden shrink-0 rounded-lg border p-2 sm:flex ${shieldClasses}`}>
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className={`max-w-3xl text-[12px] leading-relaxed ${bodyTextClasses}`}>
                Utilizamos cookies estritamente necessários para autenticação segura (com criptografia e isolamento <em>HttpOnly</em>) e armazenamento local para o cronômetro tático e estudo offline. Não usamos rastreadores publicitários. Saiba mais em nossa{' '}
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className={linkClasses}
                >
                  Política de Privacidade
                </button>{' '}
                e{' '}
                <button
                  type="button"
                  onClick={() => setIsCookieModalOpen(true)}
                  className={linkClasses}
                >
                  Política de Cookies
                </button>.
              </p>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsCookieModalOpen(true)}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${prefsButtonClasses}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Preferências
              </button>
              <button
                type="button"
                onClick={acknowledgeNecessary}
                className={`shrink-0 rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 cursor-pointer ${acceptButtonClasses}`}
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
        theme={theme}
        appearance={appearance}
        onSavedPreferences={() => {
          acknowledgeNecessary();
          setIsCookieModalOpen(false);
        }}
      />
      <PrivacyPolicyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
        theme={theme}
        appearance={appearance}
      />
    </>
  );
};

export default CookieConsent;
