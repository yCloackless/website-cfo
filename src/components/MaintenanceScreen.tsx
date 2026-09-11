import React from 'react';
import { RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';
import { AppTheme } from '../types';

interface MaintenanceScreenProps {
  theme?: AppTheme;
  title?: string;
  pageName?: string;
  message?: string;
  isAdmin?: boolean;
  onGoHome?: () => void;
  onRefresh?: () => void;
  onOpenAdmin?: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  theme = 'dark',
  title = 'EM MANUTENÇÃO',
  pageName,
  message,
  isAdmin = false,
  onGoHome,
  onRefresh,
  onOpenAdmin,
}) => {
  const isLight = theme === 'light';

  return (
    <div
      className={`relative min-h-[75vh] w-full flex flex-col items-center justify-center p-6 text-center overflow-hidden rounded-3xl select-none ${
        isLight
          ? 'bg-gradient-to-b from-red-50/70 via-white to-red-100/40 text-slate-900 border-2 border-red-300 shadow-2xl'
          : 'bg-gradient-to-b from-red-950/40 via-[#0a0a0f] to-[#0d070a] text-white border-2 border-red-900/60 shadow-[0_0_50px_rgba(239,68,68,0.15)]'
      }`}
    >
      {/* Luz ambiente de alerta vermelho */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-800/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Marca d'água de grade tática */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#ef4444 1px, transparent 1px), linear-gradient(90deg, #ef4444 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Faixas diagonais sutis de advertência no topo e base */}
      <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />
      <div className="absolute bottom-0 inset-x-0 h-2 bg-gradient-to-r from-red-700 via-red-500 to-red-700 animate-pulse" />

      {/* Banner discreto para administradores */}
      {isAdmin && (
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between bg-red-950/80 border border-red-600/50 rounded-xl px-4 py-2 text-xs text-red-200 backdrop-blur-md shadow-lg z-20">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-400" />
            <span>
              <strong>Visão do Administrador:</strong> Esta página está bloqueada para alunos e cadetes.
            </span>
          </div>
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors text-xs"
            >
              Configurar no Painel Admin
            </button>
          )}
        </div>
      )}

      <div className="relative z-10 max-w-2xl mx-auto flex flex-col items-center">
        {/* ============================================================ */}
        {/* ❌ GIGANTE 'X' MARCADO EM VERMELHO BRILHANTE                 */}
        {/* ============================================================ */}
        <div className="relative mb-6 group">
          {/* Pulso de fundo */}
          <div className="absolute inset-0 bg-red-600/30 rounded-full blur-2xl animate-ping opacity-40 pointer-events-none" />

          <div className="relative flex items-center justify-center w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-red-500/80 bg-red-950/50 backdrop-blur-md shadow-[0_0_60px_rgba(239,68,68,0.5)]">
            <svg
              viewBox="0 0 100 100"
              className="w-24 h-24 sm:w-28 sm:h-28 text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.9)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Círculo com corte e 'X' marcado bem grosso */}
              <line x1="22" y1="22" x2="78" y2="78" />
              <line x1="78" y1="22" x2="22" y2="78" />
            </svg>

            {/* Badge tático de interdição */}
            <span className="absolute -bottom-3 px-3 py-0.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-md border border-red-400">
              INTERDITADO
            </span>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 🚨 ESCRITA GIGANTE EM VERMELHO                                */}
        {/* ============================================================ */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-widest text-red-600 uppercase drop-shadow-[0_0_35px_rgba(239,68,68,0.7)] leading-tight mb-2">
          {title}
        </h1>

        {pageName && (
          <div className="inline-block px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-sm tracking-wider uppercase mb-4">
            SEÇÃO: {pageName}
          </div>
        )}

        <p className="text-base sm:text-lg font-bold text-red-400/90 tracking-wide uppercase max-w-xl mb-3">
          Acesso temporariamente interrompido para atualizações e melhorias táticas
        </p>

        {message && (
          <div className={`p-4 rounded-xl border text-sm max-w-lg mb-6 ${
            isLight
              ? 'bg-red-100/80 border-red-300 text-red-900 font-medium'
              : 'bg-red-950/40 border-red-800/60 text-red-200'
          }`}>
            <p>{message}</p>
          </div>
        )}

        <p className="text-xs text-neutral-400 max-w-md mb-8">
          Nossa equipe está trabalhando para liberar este módulo com a máxima segurança e precisão. Por favor, tente novamente em alguns instantes.
        </p>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-sm transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 border border-neutral-700"
            >
              <ArrowLeft size={16} />
              Voltar ao Início
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] hover:-translate-y-0.5"
            >
              <RefreshCw size={16} />
              Verificar Status
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
