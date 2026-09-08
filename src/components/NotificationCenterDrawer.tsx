import React, { useState } from 'react';
import { X, ShieldAlert, Bell, Check, Filter } from 'lucide-react';
import { AppTheme } from '../types';

export interface NotificationItem {
  id: string;
  type: 'CADET_SECURITY_ALERT' | 'SYSTEM_ALERT' | 'INFO';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadataJson?: string | null;
}

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  theme: AppTheme;
}

export const NotificationCenterDrawer: React.FC<NotificationCenterDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkAsRead,
  onMarkAllAsRead,
  theme,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'SECURITY' | 'UNREAD'>('ALL');
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.isRead;
    if (filter === 'SECURITY') return n.type === 'CADET_SECURITY_ALERT';
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel - Responsive: Full Width on Mobile (w-full), Max-w-md on Desktop */}
      <aside
        className={`relative z-10 w-full max-w-full sm:max-w-md h-full shadow-2xl flex flex-col transition-transform duration-300 ${
          isDark ? 'bg-[#0B1528] text-slate-100 border-l border-slate-800' : 'bg-white text-slate-900 border-l border-slate-200'
        }`}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight flex items-center gap-2">
                Central de Notificações
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-500 text-white">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">Alertas de segurança e atividade do sistema</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3 sm:p-4 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {(['ALL', 'SECURITY', 'UNREAD'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  filter === f
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : isDark
                    ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f === 'ALL' ? 'Todas' : f === 'SECURITY' ? 'Segurança' : 'Não lidas'}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              Marcar lidas
            </button>
          )}
        </div>

        {/* Notifications List Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-3 text-slate-500">
                <Bell className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-400">Nenhuma notificação encontrada</p>
              <p className="text-xs text-slate-500 mt-1">Sua central está atualizada.</p>
            </div>
          ) : (
            filteredNotifications.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all relative ${
                  !item.isRead
                    ? isDark
                      ? 'bg-blue-950/20 border-blue-500/40 shadow-sm shadow-blue-900/10'
                      : 'bg-blue-50/70 border-blue-200 shadow-sm'
                    : isDark
                    ? 'bg-slate-900/40 border-slate-800/80 opacity-80'
                    : 'bg-slate-50 border-slate-200 opacity-80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      item.type === 'CADET_SECURITY_ALERT'
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-100 leading-snug truncate">
                        {item.title}
                      </h3>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed break-words">
                      {item.message}
                    </p>

                    {!item.isRead && (
                      <div className="mt-2.5 flex justify-end">
                        <button
                          onClick={() => onMarkAsRead(item.id)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600/80 hover:bg-blue-600 text-white transition-colors flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Marcar como lida
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
};
