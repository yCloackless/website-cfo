import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  Filter,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'UNREAD') return !notification.isRead;
    if (filter === 'SECURITY') return notification.type === 'CADET_SECURITY_ALERT';
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
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

  const getTypeLabel = (type: NotificationItem['type']) => {
    if (type === 'CADET_SECURITY_ALERT') return 'Segurança';
    if (type === 'SYSTEM_ALERT') return 'Sistema';
    return 'Informativo';
  };

  const getTypeIcon = (type: NotificationItem['type']) => {
    if (type === 'CADET_SECURITY_ALERT') return ShieldAlert;
    if (type === 'SYSTEM_ALERT') return AlertTriangle;
    return Info;
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] sm:hidden"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="false"
        aria-labelledby="notification-center-title"
        className={`fixed z-50 flex flex-col overflow-hidden shadow-2xl transition-all left-0 right-0 bottom-0 h-[min(88dvh,720px)] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.75rem)] rounded-t-2xl border-t sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:h-auto sm:w-[min(calc(100vw_-_2rem),30rem)] sm:max-h-[calc(100dvh_-_6rem)] sm:rounded-xl sm:border ${
          isDark
            ? 'bg-[#0B1528] text-slate-100 border-slate-800'
            : 'bg-white text-slate-900 border-slate-200'
        }`}
      >
        <div
          className={`p-4 sm:p-5 border-b flex items-center justify-between gap-3 shrink-0 ${
            isDark ? 'border-slate-800/80' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="notification-center-title"
                className="font-bold text-base sm:text-lg leading-tight flex items-center gap-2"
              >
                Central de Notificações
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-500 text-white">
                    {unreadCount}
                  </span>
                )}
              </h2>
              <p className={isDark ? 'text-xs text-slate-400' : 'text-xs text-slate-500'}>
                Alertas de segurança e atividade do sistema
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg transition-colors ${
              isDark
                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
            title="Fechar"
            aria-label="Fechar central de notificações"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className={`p-3 sm:p-4 border-b flex items-center justify-between gap-2 overflow-x-auto ${
            isDark ? 'border-slate-800/60 bg-slate-900/30' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-1.5 shrink-0" role="tablist" aria-label="Filtros de notificações">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1" />
            {(['ALL', 'SECURITY', 'UNREAD'] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setFilter(filterOption)}
                className={`min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  filter === filterOption
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : isDark
                    ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {filterOption === 'ALL' ? 'Todas' : filterOption === 'SECURITY' ? 'Segurança' : 'Não lidas'}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="min-h-11 sm:min-h-0 text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 shrink-0 px-2"
            >
              <Check className="w-3.5 h-3.5" />
              Marcar lidas
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {filteredNotifications.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                  isDark ? 'bg-slate-800/50 text-slate-500' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Bell className="w-6 h-6" />
              </div>
              <p className={isDark ? 'text-sm font-semibold text-slate-400' : 'text-sm font-semibold text-slate-600'}>
                Nenhuma notificação encontrada
              </p>
              <p className="text-xs text-slate-500 mt-1">Sua central está atualizada.</p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const TypeIcon = getTypeIcon(item.type);
              const isExpanded = expandedId === item.id;

              return (
                <article
                  key={item.id}
                  className={`p-3.5 rounded-lg border transition-all relative ${
                    !item.isRead
                      ? isDark
                        ? 'bg-blue-950/20 border-blue-500/40 shadow-sm shadow-blue-900/10'
                        : 'bg-blue-50/70 border-blue-200 shadow-sm'
                      : isDark
                      ? 'bg-slate-900/40 border-slate-800/80 opacity-90'
                      : 'bg-slate-50 border-slate-200 opacity-90'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg shrink-0 border ${
                        item.type === 'CADET_SECURITY_ALERT'
                          ? isDark
                            ? 'bg-red-500/15 text-red-400 border-red-500/30'
                            : 'bg-red-50 text-red-700 border-red-200'
                          : isDark
                          ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      <TypeIcon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.type === 'CADET_SECURITY_ALERT'
                              ? isDark
                                ? 'bg-red-500/10 text-red-300'
                                : 'bg-red-100 text-red-700'
                              : isDark
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {getTypeLabel(item.type)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.isRead
                              ? isDark
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-slate-200 text-slate-600'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          {item.isRead ? 'Lida' : 'Não lida'}
                        </span>
                        <time
                          className={`ml-auto text-[10px] shrink-0 ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                          dateTime={item.createdAt}
                        >
                          {formatDate(item.createdAt)}
                        </time>
                      </div>

                      <h3
                        className={`text-sm font-bold leading-snug break-words ${
                          isDark ? 'text-slate-100' : 'text-slate-950'
                        }`}
                      >
                        {item.title}
                      </h3>

                      <p
                        className={`mt-1 text-xs leading-relaxed break-words ${
                          isDark ? 'text-slate-300' : 'text-slate-700'
                        }`}
                      >
                        {item.message}
                      </p>

                      {isExpanded && item.metadataJson && (
                        <pre
                          className={`mt-3 max-h-36 overflow-auto rounded-lg border p-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all sm:break-words ${
                            isDark
                              ? 'bg-slate-950/50 border-slate-800 text-slate-300'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {item.metadataJson}
                        </pre>
                      )}

                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => {
                            setExpandedId(isExpanded ? null : item.id);
                            if (!item.isRead) onMarkAsRead(item.id);
                          }}
                          className="min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-1.5"
                        >
                          Ver detalhes
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {!item.isRead && (
                          <button
                            onClick={() => onMarkAsRead(item.id)}
                            className={`min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                              isDark
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            Marcar lida
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
