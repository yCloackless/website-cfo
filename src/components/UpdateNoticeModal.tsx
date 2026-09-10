import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import FibonacciSphere from './FibonacciSphere';

// Versão temporária de teste: a opção Saturno foi removida deste aviso.
export const SITE_RELEASE_VERSION = '2026-09-10-blackhole-only';
const ACK_KEY = `cfo_update_ack_${SITE_RELEASE_VERSION}`;

export const UpdateNoticeModal: React.FC = () => {
  const [needsRefresh, setNeedsRefresh] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(ACK_KEY) !== 'true') setNeedsRefresh(true);

    const checkForNewRelease = async () => {
      try {
        const response = await fetch(`/release.json?check=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.version && data.version !== SITE_RELEASE_VERSION) setNeedsRefresh(true);
      } catch {
        // O aviso inicial continua funcionando mesmo sem conexão momentânea.
      }
    };

    void checkForNewRelease();
    const interval = window.setInterval(checkForNewRelease, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!needsRefresh) return null;

  const handleRefresh = () => {
    localStorage.setItem(ACK_KEY, 'true');
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-black text-white">
      <FibonacciSphere className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between bg-black/10 px-5 py-8 sm:py-12">
        <div className="max-w-xl text-center drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
          <div className="flex items-center justify-center gap-2 text-blue-200">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">Site atualizado</span>
          </div>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">Dê F5 para continuar</h2>
          <p className="mt-2 text-sm text-slate-200 sm:text-base">
            Uma nova versão foi publicada. Atualize a página para carregar as melhorias.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="pointer-events-auto flex min-h-12 w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-blue-300/40 bg-blue-600/95 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-blue-950/70 transition hover:bg-blue-500"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar agora (F5)
        </button>
      </div>
    </div>
  );
};
