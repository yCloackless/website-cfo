import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Home,
  ArrowLeft,
  Calendar,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { AppTheme } from '../types';

interface NotFoundProps {
  theme?: AppTheme;
  onNavigate?: (path: string) => void;
  isAuthenticated?: boolean;
}

export const NotFound: React.FC<NotFoundProps> = ({
  theme = 'dark',
  onNavigate,
  isAuthenticated = false,
}) => {
  const isLight = theme === 'light';
  const routerNavigate = useNavigate();
  const doNavigate = onNavigate || routerNavigate;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      doNavigate(isAuthenticated ? '/cronograma' : '/');
    }
  };

  return (
    <main
      role="main"
      className={`min-h-screen w-full relative flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 text-center select-none overflow-x-hidden ${
        isLight
          ? 'bg-slate-50 text-slate-900'
          : 'bg-[#0B1220] text-slate-100'
      }`}
    >
      {/* Luz ambiente sutil de fundo (sem exageros de neon) */}
      <div
        className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-80 sm:w-96 h-80 sm:h-96 rounded-full blur-[120px] pointer-events-none ${
          isLight ? 'bg-red-500/10' : 'bg-red-600/15'
        }`}
        aria-hidden="true"
      />
      <div
        className={`absolute bottom-1/4 left-1/2 -translate-x-1/2 w-64 sm:w-80 h-64 sm:h-80 rounded-full blur-[100px] pointer-events-none ${
          isLight ? 'bg-blue-500/5' : 'bg-blue-600/10'
        }`}
        aria-hidden="true"
      />

      {/* Grade tática sutil de fundo */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#ef4444 1px, transparent 1px), linear-gradient(90deg, #ef4444 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden="true"
      />

      {/* Conteúdo Central */}
      <div className="relative z-10 max-w-lg w-full mx-auto flex flex-col items-center">
        {/* Badge Tático Superior */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold tracking-wider uppercase mb-6 border ${
            isLight
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-red-950/40 text-red-400 border-red-800/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
          }`}
        >
          <Compass className="w-3.5 h-3.5 animate-[spin_12s_linear_infinite]" aria-hidden="true" />
          <span>Setor Inexplorado • 404</span>
        </div>

        {/* Indicador 404 Dominante e Equilibrado */}
        <div className="relative mb-4">
          <span
            className={`font-black tracking-tighter text-7xl sm:text-8xl md:text-9xl leading-none select-none ${
              isLight
                ? 'text-slate-300'
                : 'text-slate-800/80 drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]'
            }`}
            aria-hidden="true"
          >
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`font-black tracking-tighter text-7xl sm:text-8xl md:text-9xl leading-none bg-clip-text text-transparent ${
                isLight
                  ? 'bg-gradient-to-b from-slate-900 via-slate-800 to-red-700'
                  : 'bg-gradient-to-b from-white via-slate-200 to-red-500'
              }`}
            >
              404
            </span>
          </div>
        </div>

        {/* Título e Descrição */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
          Página não encontrada
        </h1>

        <p
          className={`text-sm sm:text-base leading-relaxed max-w-md mb-8 ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}
        >
          A página que você tentou acessar não existe, foi movida ou não está mais disponível.
        </p>

        {/* Grupo de Ações de Navegação */}
        <nav aria-label="Ações de navegação da página 404" className="w-full flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Ação Primária: Voltar para o início */}
          <button
            type="button"
            onClick={() => doNavigate(isAuthenticated ? '/cronograma' : '/')}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-500 active:scale-[0.98] transition-all shadow-lg shadow-red-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 cursor-pointer"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Voltar para o início</span>
          </button>

          {/* Ação Secundária: Voltar para a página anterior */}
          <button
            type="button"
            onClick={handleBack}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
            }`}
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Voltar para a página anterior</span>
          </button>
        </nav>

        {/* Ação Terciária Sutil: Ir para o cronograma */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => doNavigate(isAuthenticated ? '/cronograma' : '/login')}
            className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors group focus-visible:outline-none focus-visible:underline ${
              isLight
                ? 'text-slate-500 hover:text-red-600'
                : 'text-slate-400 hover:text-red-400'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />
            <span>Ir para o cronograma</span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        </div>

        {/* Rodapé institucional sutil */}
        <div className="mt-12 pt-6 border-t border-slate-800/40 w-full flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500">
          <Shield className="w-3.5 h-3.5 text-red-500/70" aria-hidden="true" />
          <span>Rumo ao CFO • CBMERJ</span>
        </div>
      </div>
    </main>
  );
};
