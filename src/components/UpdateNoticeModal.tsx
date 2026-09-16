import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X, ArrowUpRight } from 'lucide-react';
import { appUpdateService, VersionInfo } from '../services/appUpdateService';

const DISMISSED_SESSION_KEY = 'cfo_update_toast_dismissed';

export const UpdateNoticeModal: React.FC = () => {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | undefined>(undefined);

  useEffect(() => {
    // Inscreve-se nas notificações de atualização em tempo real do Service Worker e /api/version
    const unsubscribe = appUpdateService.subscribe((updateAvailable, info) => {
      const isDismissed = sessionStorage.getItem(DISMISSED_SESSION_KEY) === 'true';
      if (updateAvailable && !isDismissed) {
        setHasUpdate(true);
        if (info) setVersionInfo(info);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!hasUpdate) return null;

  const handleApplyUpdate = () => {
    setIsUpdating(true);
    appUpdateService.applyAppUpdate();
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_SESSION_KEY, 'true');
    setHasUpdate(false);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[9999] w-[calc(100vw-2.5rem)] sm:w-96 rounded-2xl border border-amber-500/40 bg-slate-900/95 p-4 text-white shadow-2xl shadow-black/80 backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 shadow-md shadow-amber-500/30">
            <Sparkles className="h-4 w-4 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                Sistema Atualizado
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-white leading-tight">
              Nova versão disponível
            </h4>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Lembrar mais tarde"
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
        Uma nova versão do CFO CBMERJ foi implantada no servidor. Seus dados e cronômetro continuam salvos com segurança.
      </p>

      {versionInfo?.version && (
        <div className="mt-2 flex items-center gap-1 text-[11px] font-mono text-slate-400">
          <span>Build:</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-amber-300">
            {versionInfo.version.slice(0, 10)}
          </span>
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-800/80 hover:text-slate-200"
        >
          Mais tarde
        </button>

        <button
          type="button"
          disabled={isUpdating}
          onClick={handleApplyUpdate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:brightness-110 active:scale-95 disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
          {isUpdating ? 'Atualizando...' : 'Atualizar agora'}
        </button>
      </div>
    </div>
  );
};
