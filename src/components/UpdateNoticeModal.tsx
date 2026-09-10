import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';

// Troque este valor a cada publicação para que todos os navegadores reconheçam a nova versão.
export const SITE_RELEASE_VERSION = '2026-09-10-plain-notes';
const ACK_KEY = `cfo_update_ack_${SITE_RELEASE_VERSION}`;

const UPDATE_IMAGES = [
  { src: '/update-black-hole.png', alt: 'Buraco negro com disco de pontos em espiral' },
  { src: '/update-saturn.png', alt: 'Saturno no espaço' },
];

export const UpdateNoticeModal: React.FC = () => {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [imageIndex] = useState(() => Math.floor(Math.random() * UPDATE_IMAGES.length));
  const image = useMemo(() => UPDATE_IMAGES[imageIndex], [imageIndex]);

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-blue-400/30 bg-[#0b1220] text-white shadow-2xl shadow-blue-950/50">
        <div className="relative h-44 overflow-hidden bg-black">
          <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-transparent to-transparent" />
        </div>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2 text-blue-300">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-[0.18em]">Site atualizado</span>
          </div>
          <div>
            <h2 className="text-xl font-black">Uma nova versão está disponível</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Para carregar as melhorias e continuar estudando sem perder seus dados, atualize a página agora.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar agora (F5)
          </button>
        </div>
      </div>
    </div>
  );
};
