import React, { useState, useEffect } from 'react';
import { X, Cookie, ShieldCheck, Check, Settings2, Info } from 'lucide-react';
import { AppAppearance, AppTheme } from '../types';

interface CookiePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavedPreferences?: () => void;
  theme?: AppTheme;
  appearance?: AppAppearance;
}

export const CookiePolicyModal: React.FC<CookiePolicyModalProps> = ({
  isOpen,
  onClose,
  onSavedPreferences,
  theme = 'dark',
  appearance = 'default',
}) => {
  const isDark = theme === 'dark';
  const isNotion = appearance === 'notion';
  const [preferences, setPreferences] = useState({
    necessary: true, // Sempre obrigatório
    interfaceState: true,
    analytics: false,
    marketing: false,
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cfo_cookie_preferences');
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences({
          necessary: true,
          interfaceState: parsed.interfaceState ?? true,
          analytics: Boolean(parsed.analytics),
          marketing: Boolean(parsed.marketing),
        });
      }
    } catch {}
  }, [isOpen]);

  const handleSave = async () => {
    try {
      localStorage.setItem('cfo_cookie_preferences', JSON.stringify({
        ...preferences,
        necessary: true,
        updatedAt: new Date().toISOString(),
        version: '1.0',
      }));

      // Também sincroniza com backend se autenticado
      await fetch('/api/privacy/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'preferences',
          status: preferences.interfaceState ? 'granted' : 'revoked',
          policyVersion: '1.0',
        }),
      }).catch(() => {});

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
        if (onSavedPreferences) onSavedPreferences();
      }, 1000);
    } catch {
      onClose();
    }
  };

  if (!isOpen) return null;

  const modalShell = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#202020] text-[#e6e6e4]'
      : 'border-[#e6e6e3] bg-white text-[#37352f]'
    : 'border-slate-700/60 bg-slate-900 text-slate-100';
  const headerFooter = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#191919]'
      : 'border-[#e6e6e3] bg-[#fbfbfa]'
    : 'border-slate-800 bg-slate-950/60';
  const headingText = isNotion ? (isDark ? 'text-[#e6e6e4]' : 'text-[#37352f]') : 'text-white';
  const bodyText = isNotion ? (isDark ? 'text-[#e6e6e4]/90' : 'text-[#37352f]') : 'text-slate-300';
  const mutedText = isNotion ? (isDark ? 'text-[#b4b4b0]' : 'text-[#5c5b57]') : 'text-slate-400';
  const cardSurface = isNotion
    ? isDark
      ? 'border-white/[0.08] bg-[#191919]'
      : 'border-[#e6e6e3] bg-[#fbfbfa]'
    : 'border-slate-800 bg-slate-950/50';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className={`relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${modalShell}`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${headerFooter}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isNotion ? (isDark ? 'bg-[#262626] text-[#e6e6e4] border-white/[0.08]' : 'bg-[#f1f1ef] text-[#37352f] border-[#e6e6e3]') : 'bg-purple-600/20 text-purple-400 border-purple-500/30'}`}>
              <Cookie className="h-5 w-5" />
            </div>
            <div>
              <h2 id="cookie-modal-title" className={`text-lg font-bold tracking-tight ${headingText}`}>
                Política de Cookies & Armazenamento Local
              </h2>
              <p className={`text-xs ${mutedText}`}>Classificação transparente e gestão de preferências • LGPD</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-2 transition cursor-pointer ${isNotion ? (isDark ? 'text-[#b4b4b0] hover:bg-[#262626] hover:text-white' : 'text-[#5c5b57] hover:bg-[#ececeb] hover:text-[#37352f]') : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-5 text-sm leading-relaxed ${bodyText}`}>
          <p className={`text-xs ${bodyText}`}>
            A plataforma <strong>Rumo ao CFO CBMERJ</strong> preza pela transparência. Nós não vendemos dados pessoais e não utilizamos cookies de rastreamento publicitário de terceiros. Abaixo você confere como classificamos cada mecanismo e pode personalizar suas escolhas.
          </p>

          <div className="space-y-3">
            {/* Categoria 1: Estritamente Necessários */}
            <div className={`rounded-xl border p-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span className={`font-semibold text-sm ${headingText}`}>Cookies Estritamente Necessários</span>
                </div>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500 border border-emerald-500/25">
                  Sempre Ativo
                </span>
              </div>
              <p className={`text-xs mt-2 ${mutedText}`}>
                Essenciais para a segurança, autenticação e funcionamento do sistema. Inclui o cookie de sessão criptografado <code>__Host-cfo_session</code> (com proteção <em>HttpOnly</em>, <em>SameSite=Strict</em> e inacessível a scripts JavaScript maliciosos) e a proteção anti-robô da Cloudflare.
              </p>
            </div>

            {/* Categoria 2: Armazenamento Local de Interface e Progresso */}
            <div className={`rounded-xl border p-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className={`h-4 w-4 ${isNotion ? headingText : 'text-blue-400'}`} />
                  <span className={`font-semibold text-sm ${headingText}`}>Preferências de Interface & Cache Offline</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.interfaceState}
                    onChange={(e) => setPreferences({ ...preferences, interfaceState: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${isNotion ? (isDark ? 'bg-[#2f2f2f] peer-checked:bg-[#e6e6e4]/45' : 'bg-[#d6d6d2] peer-checked:bg-[#37352f]') : 'bg-slate-700 peer-checked:bg-blue-600'}`}></div>
                </label>
              </div>
              <p className={`text-xs mt-2 ${mutedText}`}>
                Utiliza o <code>localStorage</code> e <code>IndexedDB</code> do seu navegador exclusivamente para salvar a aba aberta no cronograma, minutos do cronômetro tático em andamento e fórmulas em cache para permitir estudo sem interrupções em oscilações de internet.
              </p>
            </div>

            {/* Categoria 3: Cookies Analíticos */}
            <div className={`rounded-xl border p-4 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className={`h-4 w-4 ${isNotion ? headingText : 'text-purple-400'}`} />
                  <span className={`font-semibold text-sm ${headingText}`}>Cookies Analíticos de Terceiros</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className={`w-9 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${isNotion ? (isDark ? 'bg-[#2f2f2f] peer-checked:bg-[#e6e6e4]/45' : 'bg-[#d6d6d2] peer-checked:bg-[#37352f]') : 'bg-slate-700 peer-checked:bg-purple-600'}`}></div>
                </label>
              </div>
              <p className={`text-xs mt-2 ${mutedText}`}>
                Atualmente a plataforma <strong>não utiliza</strong> Google Analytics ou ferramentas invasivas de gravação de tela. Se futuramente utilizarmos telemetria agregada e anônima, sua preferência será rigorosamente respeitada.
              </p>
            </div>

            {/* Categoria 4: Cookies Publicitários e Rastreamento */}
            <div className={`rounded-xl border p-4 opacity-80 ${cardSurface}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-red-500" />
                  <span className={`font-semibold text-sm ${headingText}`}>Cookies de Publicidade / Rastreamento Cruzado</span>
                </div>
                <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500 border border-red-500/25">
                  Desativado / Inexistente
                </span>
              </div>
              <p className={`text-xs mt-2 ${mutedText}`}>
                Não exibimos anúncios comerciais nem compartilhamos identificadores com redes sociais (Meta Pixel, etc.).
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between border-t px-6 py-4 ${headerFooter}`}>
          <button
            type="button"
            onClick={onClose}
            className={`text-xs transition cursor-pointer ${mutedText} hover:opacity-100`}
          >
            Cancelar
          </button>
          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-500 animate-in fade-in">
                <Check className="h-4 w-4" /> Preferências salvas!
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className={`rounded-xl px-5 py-2 text-xs font-semibold shadow-lg transition cursor-pointer ${isNotion ? (isDark ? 'bg-[#2f2f2f] hover:bg-[#3a3a3a] text-white border border-white/[0.12]' : 'bg-[#37352f] hover:bg-[#262521] text-white') : 'bg-purple-600 text-white shadow-purple-600/20 hover:bg-purple-500'}`}
            >
              Salvar Minhas Preferências
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicyModal;
