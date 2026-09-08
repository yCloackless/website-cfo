import React from 'react';
import { useEffect } from 'react';
import {
  LayoutGrid,
  Calendar,
  Clock,
  BookOpen,
  Target,
  Sparkles,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  X,
  UserCircle,
  ArrowLeftRight,
} from 'lucide-react';
import { AppTheme } from '../types';

export type TabType =
  | 'table'
  | 'timer'
  | 'bizuario'
  | 'highyield'
  | 'ai'
  | 'calendar'
  | 'simulations'
  | 'flashcards';

interface TacticalSidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  theme: AppTheme;
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose?: () => void;
  pendingRevisionsCount?: number;
  canAccessNotion?: boolean;
  userProfile?: { fullName?: string; username?: string; avatarUrl?: string | null; role?: string } | null;
  isAdmin?: boolean;
  canReturnToAdmin?: boolean;
  onOpenAccountSwitcher?: () => void;
  onReturnToAdmin?: () => void;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClass?: { dark: string; light: string };
  description?: string;
}

export const TacticalSidebar: React.FC<TacticalSidebarProps> = ({
  activeTab,
  onSelectTab,
  theme,
  isOpen,
  isCollapsed,
  onToggleCollapse,
  onClose,
  pendingRevisionsCount = 0,
  canAccessNotion = true,
  userProfile,
  isAdmin = false,
  canReturnToAdmin = false,
  onOpenAccountSwitcher,
  onReturnToAdmin,
}) => {
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateScrollLock = () => {
      if (mediaQuery.matches) document.body.style.overflow = 'hidden';
      else document.body.style.overflow = '';
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mediaQuery.matches) onClose?.();
    };

    updateScrollLock();
    mediaQuery.addEventListener('change', updateScrollLock);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      mediaQuery.removeEventListener('change', updateScrollLock);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const NAV_ITEMS: NavItem[] = [
    {
      id: 'table',
      label: 'Cronograma',
      icon: LayoutGrid,
      description: 'Grade semanal de estudos',
    },
    ...(canAccessNotion
      ? [
          {
            id: 'calendar' as TabType,
            label: 'Agenda Notion',
            icon: Calendar,
            badge: 'Notion',
            badgeClass: {
              dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
              light: 'bg-blue-100 text-blue-900 border-blue-300',
            },
            description: 'Revisões contínuas',
          },
        ]
      : []),
    {
      id: 'timer',
      label: 'Cronômetro',
      icon: Clock,
      description: 'Foco & Pomodoro tático',
    },
    {
      id: 'bizuario',
      label: 'Bizuário',
      icon: BookOpen,
      description: 'Caderno de resumos',
    },
    {
      id: 'highyield',
      label: 'Mais Caem',
      icon: Target,
      badge: 'Raio-X',
      badgeClass: {
        dark: 'bg-blue-600 text-white',
        light: 'bg-blue-600 text-white',
      },
      description: 'Incidência de provas',
    },
    {
      id: 'ai',
      label: 'IA Equilíbrio',
      icon: Sparkles,
      description: 'Diagnóstico pedagógico',
    },
    {
      id: 'simulations',
      label: 'Simulados',
      icon: Crosshair,
      description: 'Central de simulados',
    },
    {
      id: 'flashcards',
      label: 'Caderno de Erros',
      icon: Layers,
      badge: 'Anki',
      badgeClass: {
        dark: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
        light: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      },
      description: 'Flashcards nível Anki',
    },
  ];

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
        onClick={onClose || onToggleCollapse}
        aria-hidden="true"
      />

      <aside
        aria-label="Navegação Principal do Sistema"
        role="dialog"
        aria-modal="true"
        className={`fixed inset-y-0 left-0 z-50 md:static md:z-20 shrink-0 transition-all duration-300 select-none flex flex-col border-r h-full max-h-[100dvh] overflow-hidden md:max-h-none md:overflow-visible ${
          isCollapsed ? 'w-16' : 'w-64 md:w-60'
        } ${
          isDark
            ? 'bg-[#070D18] md:bg-[#070D18]/95 border-slate-800/80 text-slate-200 backdrop-blur-md'
            : 'bg-white md:bg-white/95 border-slate-200 text-slate-800 shadow-sm backdrop-blur-md'
        }`}
      >
      {/* Top Header of Sidebar */}
      <div
        className={`p-3 border-b flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#0056D2] dark:text-sky-400">
              Módulos Táticos
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleCollapse}
          className={`min-h-11 min-w-11 md:min-h-0 md:min-w-0 p-1.5 rounded-lg border transition-all cursor-pointer ${
            isDark
              ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:border-slate-700'
              : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:border-slate-400'
          }`}
          title={isCollapsed ? 'Expandir Menu Lateral' : 'Recolher Menu Lateral'}
          aria-label={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`min-h-11 min-w-11 md:hidden p-1.5 rounded-lg border transition-all cursor-pointer ${
            isDark
              ? 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:border-slate-700'
              : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-black hover:border-slate-400'
          }`}
          title="Fechar menu"
          aria-label="Fechar menu lateral"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav Items List */}
      <nav className="flex-1 py-3 px-2 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isSimulations = item.id === 'simulations';

          return (
            <button
              key={item.id}
              type="button"
              id={`sidebar-tab-${item.id}`}
              onClick={() => {
                onSelectTab(item.id);
                if (onClose) onClose();
              }}
              className={`w-full min-h-11 md:min-h-0 group flex items-center rounded-xl transition-all cursor-pointer ${
                isCollapsed
                  ? 'justify-center p-2.5'
                  : 'justify-between px-3 py-2.5 text-left'
              } ${
                isActive
                  ? isSimulations
                    ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/50 font-bold'
                    : 'bg-[#0056D2] text-white shadow-md shadow-blue-950/40 font-bold'
                  : isDark
                  ? 'text-slate-400 hover:text-white hover:bg-slate-900/60 font-medium'
                  : 'text-slate-700 hover:text-black hover:bg-slate-100 font-bold'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive
                      ? 'text-white'
                      : isSimulations
                      ? 'text-red-500'
                      : isDark
                      ? 'text-slate-400 group-hover:text-blue-400'
                      : 'text-slate-600 group-hover:text-blue-600'
                  }`}
                />
                {!isCollapsed && (
                  <span className="text-xs truncate tracking-wide">
                    {item.label}
                  </span>
                )}
              </div>

              {!isCollapsed && item.badge && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase border shrink-0 ${
                    item.badgeClass
                      ? isDark
                        ? item.badgeClass.dark
                        : item.badgeClass.light
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Perfil e troca de conta: a visibilidade da acao e apenas um conforto de UI; o backend autoriza a operacao. */}
      {(userProfile || canReturnToAdmin) && (
        <div className={`p-2.5 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
          {!isCollapsed ? (
            <div className={`rounded-xl border p-2 ${isDark ? 'bg-slate-900/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 min-w-0">
                {userProfile?.avatarUrl ? <img src={userProfile.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover border border-blue-500/50 shrink-0" /> : <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 flex items-center justify-center shrink-0"><UserCircle className="w-5 h-5" /></div>}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate text-slate-200">{userProfile?.fullName || userProfile?.username || 'Perfil'}</p>
                  <p className="text-[10px] font-mono truncate text-blue-400">@{userProfile?.username || 'conta'}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1">
                {isAdmin && onOpenAccountSwitcher && <button type="button" onClick={onOpenAccountSwitcher} className="w-full min-h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[11px] font-bold cursor-pointer"><ArrowLeftRight className="w-3.5 h-3.5" /> Trocar de conta</button>}
                {canReturnToAdmin && onReturnToAdmin && <button type="button" onClick={onReturnToAdmin} className="w-full min-h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] font-bold cursor-pointer"><ArrowLeftRight className="w-3.5 h-3.5" /> Voltar ao ADM</button>}
              </div>
            </div>
          ) : (
            <button type="button" onClick={canReturnToAdmin ? onReturnToAdmin : onOpenAccountSwitcher} className="w-full min-h-11 flex items-center justify-center rounded-xl border border-slate-800 text-cyan-300 cursor-pointer" title={canReturnToAdmin ? 'Voltar ao ADM' : 'Trocar de conta'}><ArrowLeftRight className="w-4 h-4" /></button>
          )}
        </div>
      )}

      {/* Footer of Sidebar */}
      <div
        className={`p-2.5 border-t text-center ${
          isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-500'
        }`}
      >
        {!isCollapsed ? (
          <div className="flex items-center justify-between text-[10px] px-1 font-mono">
            <span className="text-slate-500">CFO CBMERJ</span>
            <span className="text-emerald-500 font-bold">● V1.1.0</span>
          </div>
        ) : (
          <span className="text-[9px] font-black text-emerald-500 block">●</span>
        )}
      </div>
    </aside>
    </>
  );
};
