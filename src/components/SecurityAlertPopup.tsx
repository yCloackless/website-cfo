import React from 'react';
import { ArrowRight, Clock, MapPin, ShieldAlert, Siren, X } from 'lucide-react';
import { AppTheme } from '../types';
import { NotificationItem } from './NotificationCenterDrawer';

interface SecurityAlertPopupProps {
  alert: NotificationItem | null;
  onClose: () => void;
  onOpenCenter: () => void;
  onMarkAsRead: (id: string) => void;
  canViewIp?: boolean;
  theme: AppTheme;
}

export const SecurityAlertPopup: React.FC<SecurityAlertPopupProps> = ({
  alert,
  onClose,
  onOpenCenter,
  onMarkAsRead,
  canViewIp = false,
  theme,
}) => {
  if (!alert || alert.isRead) return null;

  const isDark = theme === 'dark';
  const metadata = (() => {
    if (!alert.metadataJson) return null;
    try {
      const parsed = JSON.parse(alert.metadataJson);
      return parsed && typeof parsed === 'object' ? (parsed as { ip?: unknown }) : null;
    } catch {
      return null;
    }
  })();
  const sourceIp = typeof metadata?.ip === 'string' ? metadata.ip : '';
  const eventType = alert.type === 'CADET_SECURITY_ALERT' ? 'CADET_SECURITY_ALERT' : alert.type;

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed left-3 right-3 bottom-[calc(0.75rem_+_env(safe-area-inset-bottom))] top-auto z-40 max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_1.5rem)] overflow-hidden sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-labelledby="security-alert-title"
        className={`max-h-[inherit] rounded-xl border shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col ${
          isDark
            ? 'bg-[#0E1B31]/95 border-red-500/45 text-slate-100 shadow-red-950/30'
            : 'bg-white/95 border-orange-300 text-slate-900 shadow-orange-200/60'
        }`}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />

        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 pb-2 sm:p-5 sm:pb-3">
          <div className="flex items-start gap-3 sm:gap-3.5 min-w-0">
            <div
              className={`p-2 sm:p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                isDark
                  ? 'bg-red-500/15 border-red-500/30 text-orange-300'
                  : 'bg-orange-50 border-orange-200 text-orange-700'
              }`}
            >
              <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border min-w-0 max-w-full ${
                    isDark
                      ? 'bg-red-500/10 text-orange-300 border-red-500/20'
                      : 'bg-orange-50 text-orange-700 border-orange-200'
                  }`}
                >
                  <Siren className="w-3 h-3" />
                  Alerta de segurança
                </span>
                {alert.createdAt && (
                  <span
                    className={`text-[11px] font-medium flex items-center gap-1 shrink-0 ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    {formatTime(alert.createdAt)}
                  </span>
                )}
              </div>

              <h3
                id="security-alert-title"
                className={`font-extrabold text-base leading-snug mb-1 break-words ${
                  isDark ? 'text-slate-100' : 'text-slate-950'
                }`}
              >
                {alert.title || 'Tentativa de acesso bloqueada'}
              </h3>

              <p
                className={`text-xs leading-relaxed break-words mb-3 ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {alert.message || 'Uma tentativa suspeita de acesso à conta cadete foi impedida.'}
              </p>

              <div
                className={`flex flex-wrap items-center gap-2 mb-1 text-[11px] min-w-0 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                <span
                  className={`px-2 py-1 rounded-lg font-mono border break-all ${
                    isDark ? 'bg-slate-950/40 border-slate-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {eventType}
                </span>
                {canViewIp && sourceIp && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border max-w-full break-all ${
                      isDark ? 'bg-slate-950/40 border-slate-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <MapPin className="w-3 h-3 shrink-0" />
                    IP {sourceIp}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg transition-colors shrink-0 ${
                isDark
                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
              }`}
              title="Fechar aviso"
              aria-label="Fechar aviso de segurança"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          className={`shrink-0 flex flex-wrap items-center gap-2 px-3.5 pb-3.5 pt-2 sm:px-5 sm:pb-5 sm:pt-0 ${
            isDark ? 'bg-[#0E1B31]/95' : 'bg-white/95'
          }`}
        >
          <button
            onClick={() => {
              onOpenCenter();
              onClose();
            }}
            className="min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            Ver detalhes
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              onMarkAsRead(alert.id);
              onClose();
            }}
            className={`min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
            }`}
          >
            Marcar como lido
          </button>
        </div>
      </div>
    </div>
  );
};
