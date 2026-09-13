import React, { useState, useEffect } from 'react';
import { X, Cookie, ShieldCheck, Check, Settings2, Info } from 'lucide-react';

interface CookiePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSavedPreferences?: () => void;
}

export const CookiePolicyModal: React.FC<CookiePolicyModalProps> = ({ isOpen, onClose, onSavedPreferences }) => {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Cookie className="h-5 w-5" />
            </div>
            <div>
              <h2 id="cookie-modal-title" className="text-lg font-bold text-white tracking-tight">
                Política de Cookies & Armazenamento Local
              </h2>
              <p className="text-xs text-slate-400">Classificação transparente e gestão de preferências • LGPD</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Fechar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm leading-relaxed text-slate-300">
          <p className="text-xs text-slate-300">
            A plataforma <strong>Rumo ao CFO CBMERJ</strong> preza pela transparência. Nós não vendemos dados pessoais e não utilizamos cookies de rastreamento publicitário de terceiros. Abaixo você confere como classificamos cada mecanismo e pode personalizar suas escolhas.
          </p>

          <div className="space-y-3">
            {/* Categoria 1: Estritamente Necessários */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-white text-sm">Cookies Estritamente Necessários</span>
                </div>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                  Sempre Ativo
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Essenciais para a segurança, autenticação e funcionamento do sistema. Inclui o cookie de sessão criptografado <code>__Host-cfo_session</code> (com proteção <em>HttpOnly</em>, <em>SameSite=Strict</em> e inacessível a scripts JavaScript maliciosos) e a proteção anti-robô da Cloudflare.
              </p>
            </div>

            {/* Categoria 2: Armazenamento Local de Interface e Progresso */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-blue-400" />
                  <span className="font-semibold text-white text-sm">Preferências de Interface & Cache Offline</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.interfaceState}
                    onChange={(e) => setPreferences({ ...preferences, interfaceState: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Utiliza o <code>localStorage</code> e <code>IndexedDB</code> do seu navegador exclusivamente para salvar a aba aberta no cronograma, minutos do cronômetro tático em andamento e fórmulas em cache para permitir estudo sem interrupções em oscilações de internet.
              </p>
            </div>

            {/* Categoria 3: Cookies Analíticos */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-purple-400" />
                  <span className="font-semibold text-white text-sm">Cookies Analíticos de Terceiros</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences({ ...preferences, analytics: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Atualmente a plataforma <strong>não utiliza</strong> Google Analytics ou ferramentas invasivas de gravação de tela. Se futuramente utilizarmos telemetria agregada e anônima, sua preferência será rigorosamente respeitada.
              </p>
            </div>

            {/* Categoria 4: Cookies Publicitários e Rastreamento */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 opacity-75">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <X className="h-4 w-4 text-red-400" />
                  <span className="font-semibold text-white text-sm">Cookies de Publicidade / Rastreamento Cruzado</span>
                </div>
                <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400 border border-red-500/20">
                  Desativado / Inexistente
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Não exibimos anúncios comerciais nem compartilhamos identificadores com redes sociais (Meta Pixel, etc.).
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/80 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white transition"
          >
            Cancelar
          </button>
          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 animate-in fade-in">
                <Check className="h-4 w-4" /> Preferências salvas!
              </span>
            )}
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 transition"
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
