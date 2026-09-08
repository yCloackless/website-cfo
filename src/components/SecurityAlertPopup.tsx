import React from 'react';
import { ShieldAlert, X, ArrowRight, Clock } from 'lucide-react';
import { AppTheme } from '../types';
import { NotificationItem } from './NotificationCenterDrawer';

interface SecurityAlertPopupProps {
  alert: NotificationItem | null;
  onClose: () => void;
  onOpenCenter: () => void;
  onMarkAsRead: (id: string) => void;
  theme: AppTheme;
}

export const SecurityAlertPopup: React.FC<SecurityAlertPopupProps> = ({
  alert,
  onClose,
  onOpenCenter,
  onMarkAsRead,
  theme,
}) => {
  if (!alert || alert.isRead) return null;

  const isDark = theme === 'dark';

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-md w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-2xl backdrop-blur-xl relative overflow-hidden ${
          isDark
            ? 'bg-[#0E1B31]/95 border-red-500/50 text-slate-100 shadow-red-950/30'
            : 'bg-white/95 border-red-400 text-slate-900 shadow-red-200/50'
        }`}
      >
        {/* Glow Accent Header line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />

        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-500 shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                Alerta de Segurança
              </span>
              {alert.createdAt && (
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatDate(alert.createdAt)}
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base leading-snug text-slate-100 mb-1">
              {alert.title || 'Tentativa de Acesso Bloqueada'}
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed break-words mb-3">
              {alert.message || 'Uma tentativa suspeita de acesso à conta cadete foi impedida.'}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => {
                  onOpenCenter();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Ver detalhes
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  onMarkAsRead(alert.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                Marcar como lido
              </button>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
            title="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
