import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  Calendar,
  Clock,
  BookOpen,
  Target,
  Sparkles,
  Crosshair,
  Layers,
  FileText,
  X,
  UserCircle,
  ArrowLeftRight,
  Flame,
  Plus,
  RotateCcw,
  Settings,
  Bell,
  Shield,
  Pin,
} from 'lucide-react';
import { AppTheme } from '../types';

export type TabType =
  | 'table'
  | 'monthlyHours'
  | 'timer'
  | 'bizuario'
  | 'highyield'
  | 'examBank'
  | 'learning'
  | 'ai'
  | 'calendar'
  | 'simulations'
  | 'flashcards';

interface TacticalSidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  theme: AppTheme;
  isOpen: boolean; // Mobile drawer toggle
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  pendingRevisionsCount?: number;
  unreadNotificationsCount?: number;
  canAccessNotion?: boolean;
  userProfile?: { fullName?: string; username?: string; avatarUrl?: string | null; role?: string } | null;
  isAdmin?: boolean;
  canReturnToAdmin?: boolean;
  onOpenAccountSwitcher?: () => void;
  onReturnToAdmin?: () => void;

  // Integrated Action Callbacks
  onOpenRevisions?: () => void;
  onOpenAddSubject?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onOpenNotifications?: () => void;
  onOpenAdminSecurity?: () => void;
}

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabId?: TabType;
  action?: () => void;
  badge?: string;
  badgeClass?: { dark: string; light: string };
  isNumericBadge?: boolean;
}

interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

export const TacticalSidebar: React.FC<TacticalSidebarProps> = ({
  activeTab,
  onSelectTab,
  theme,
  isOpen,
  onClose,
  pendingRevisionsCount = 0,
  unreadNotificationsCount = 0,
  canAccessNotion = true,
  userProfile,
  isAdmin = false,
  canReturnToAdmin = false,
  onOpenAccountSwitcher,
  onReturnToAdmin,
  onOpenRevisions,
  onOpenAddSubject,
  onOpenHistory,
  onOpenSettings,
  onOpenNotifications,
  onOpenAdminSecurity,
}) => {
  const isDark = theme === 'dark';

  // 3-state Machine: COLLAPSED, EXPANDED, PINNED
  const [isPinned, setIsPinned] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('cfo_sidebar_pinned') === 'true';
  });

  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile body scroll lock
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

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('cfo_sidebar_pinned', String(next));
      }
      return next;
    });
  };

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (!openTimerRef.current) {
      openTimerRef.current = setTimeout(() => {
        setIsHovered(true);
      }, 150); // 150ms intent delay
    }
  };

  const handleMouseLeave = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (!closeTimerRef.current) {
      closeTimerRef.current = setTimeout(() => {
        setIsHovered(false);
      }, 450); // 450ms close delay
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  };

  const isExpandedDesktop = isPinned || isHovered || isFocused;

  // Categorized Navigation Groups
  const NAV_GROUPS: SidebarGroup[] = [
    {
      title: 'PRINCIPAL',
      items: [
        {
          id: 'table',
          label: 'Cronograma',
          icon: LayoutGrid,
          tabId: 'table',
        },
        {
          id: 'examBank',
          label: 'Banco de Provas',
          icon: FileText,
          tabId: 'examBank',
          badge: 'IA',
          badgeClass: {
            dark: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            light: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          },
        },
        {
          id: 'bizuario',
          label: 'Bizuário',
          icon: BookOpen,
          tabId: 'bizuario',
        },
        {
          id: 'highyield',
          label: 'Mais Caem',
          icon: Target,
          tabId: 'highyield',
          badge: 'Raio-X',
          badgeClass: {
            dark: 'bg-blue-600 text-white border-blue-500',
            light: 'bg-blue-600 text-white border-blue-500',
          },
        },
      ],
    },
    {
      title: 'ESTUDOS & DESEMPENHO',
      items: [
        {
          id: 'monthlyHours',
          label: 'Agenda de Horas',
          icon: Calendar,
          tabId: 'monthlyHours',
          badge: 'Horas',
          badgeClass: {
            dark: 'bg-blue-600/30 text-sky-300 border-blue-500/40',
            light: 'bg-blue-100 text-blue-800 border-blue-300',
          },
        },
        {
          id: 'timer',
          label: 'Cronômetro',
          icon: Clock,
          tabId: 'timer',
        },
        {
          id: 'learning',
          label: 'Radar',
          icon: Target,
          tabId: 'learning',
          badge: 'Aluno',
          badgeClass: {
            dark: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
            light: 'bg-cyan-100 text-cyan-900 border-cyan-300',
          },
        },
        {
          id: 'ai',
          label: 'IA Equilíbrio',
          icon: Sparkles,
          tabId: 'ai',
        },
        {
          id: 'simulations',
          label: 'Simulados',
          icon: Crosshair,
          tabId: 'simulations',
        },
        {
          id: 'flashcards',
          label: 'Caderno de Erros',
          icon: Layers,
          tabId: 'flashcards',
          badge: 'Anki',
          badgeClass: {
            dark: 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60',
            light: 'bg-indigo-100 text-indigo-900 border-indigo-300',
          },
        },
        ...(canAccessNotion
          ? [
              {
                id: 'calendar',
                label: 'Agenda Notion',
                icon: Calendar,
                tabId: 'calendar' as TabType,
                badge: 'Notion',
                badgeClass: {
                  dark: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
                  light: 'bg-blue-100 text-blue-900 border-blue-300',
                },
              },
            ]
          : []),
      ],
    },
    {
      title: 'AÇÕES TÁTICAS',
      items: [
        ...(onOpenRevisions
          ? [
              {
                id: 'revisions',
                label: 'Revisões Espaçadas',
                icon: Sparkles,
                action: onOpenRevisions,
                badge: pendingRevisionsCount > 0 ? String(pendingRevisionsCount) : undefined,
                isNumericBadge: true,
                badgeClass: {
                  dark: 'bg-blue-600 text-white border-blue-500 font-bold',
                  light: 'bg-blue-600 text-white border-blue-500 font-bold',
                },
              },
            ]
          : []),
        ...(onOpenAddSubject
          ? [
              {
                id: 'addSubject',
                label: 'Adicionar Matéria',
                icon: Plus,
                action: onOpenAddSubject,
              },
            ]
          : []),
        ...(onOpenHistory
          ? [
              {
                id: 'history',
                label: 'Histórico de Ciclos',
                icon: RotateCcw,
                action: onOpenHistory,
              },
            ]
          : []),
      ],
    },
    {
      title: 'SISTEMA & ADMINISTRAÇÃO',
      items: [
        ...(onOpenNotifications
          ? [
              {
                id: 'notifications',
                label: 'Notificações',
                icon: Bell,
                action: onOpenNotifications,
                badge: unreadNotificationsCount > 0 ? String(unreadNotificationsCount) : undefined,
                isNumericBadge: true,
                badgeClass: {
                  dark: 'bg-amber-500 text-black border-amber-400 font-bold',
                  light: 'bg-amber-500 text-black border-amber-400 font-bold',
                },
              },
            ]
          : []),
        ...(onOpenSettings
          ? [
              {
                id: 'settings',
                label: 'Configurações',
                icon: Settings,
                action: onOpenSettings,
              },
            ]
          : []),
        ...((isAdmin || canReturnToAdmin)
          ? [
              {
                id: 'adminSecurity',
                label: canReturnToAdmin ? 'Voltar ao ADM' : 'Painel de Segurança ADM',
                icon: Shield,
                action: canReturnToAdmin ? onReturnToAdmin : onOpenAdminSecurity,
                badge: 'ADM',
                badgeClass: {
                  dark: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                  light: 'bg-amber-100 text-amber-900 border-amber-300',
                },
              },
            ]
          : []),
      ],
    },
  ];

  const handleItemClick = (item: SidebarItem) => {
    if (item.tabId) {
      onSelectTab(item.tabId);
    } else if (item.action) {
      item.action();
    }
    if (onClose) onClose();
  };

  return (
    <>
      {/* ============================================================ */}
      {/* MOBILE DRAWER OVERLAY (< 768px)                               */}
      {/* ============================================================ */}
      {isOpen && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <aside
            aria-label="Navegação Principal do Sistema"
            role="dialog"
            aria-modal="true"
            className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r h-full max-h-[100dvh] overflow-hidden select-none shadow-2xl transition-colors ${
              isDark
                ? 'bg-[#070D18] border-slate-800/80 text-slate-200'
                : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            {/* Header Mobile */}
            <div
              className={`p-3.5 border-b flex items-center justify-between shrink-0 ${
                isDark ? 'border-slate-800/80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="font-extrabold text-sm tracking-tight leading-none bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                    CFO CBMERJ
                  </h1>
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                    ESTUDOS TÁTICOS
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
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

            {/* Nav list Mobile */}
            <nav className="flex-1 py-3 px-2.5 space-y-4 overflow-y-auto">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 text-[9.5px] font-black uppercase tracking-widest text-slate-400/80 mb-1">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.tabId && activeTab === item.tabId;
                    const isSimulations = item.tabId === 'simulations';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={`w-full h-11 flex items-center justify-between px-3 rounded-xl transition-all cursor-pointer ${
                          isActive
                            ? isSimulations
                              ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/50 font-bold'
                              : 'bg-[#0056D2] text-white shadow-md shadow-blue-950/40 font-bold'
                            : isDark
                            ? 'text-slate-400 hover:text-white hover:bg-slate-900/60 font-medium'
                            : 'text-slate-700 hover:text-black hover:bg-slate-100 font-bold'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-5 h-5 shrink-0 ${
                              isActive
                                ? 'text-white'
                                : isSimulations
                                ? 'text-red-500'
                                : isDark
                                ? 'text-slate-400'
                                : 'text-slate-600'
                            }`}
                          />
                          <span className="text-xs truncate tracking-wide font-medium">
                            {item.label}
                          </span>
                        </div>

                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border shrink-0 ${
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
                </div>
              ))}
            </nav>

            {/* Profile Mobile */}
            {(userProfile || canReturnToAdmin) && (
              <div className={`p-3 border-t shrink-0 ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {userProfile?.avatarUrl ? (
                      <img
                        src={userProfile.avatarUrl}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300">
                        <UserCircle className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {userProfile?.fullName || userProfile?.username || 'Perfil'}
                      </p>
                      <p className={`text-[11px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        @{userProfile?.username || 'conta'}
                      </p>
                    </div>
                  </div>

                  {isAdmin && onOpenAccountSwitcher && (
                    <button
                      type="button"
                      onClick={onOpenAccountSwitcher}
                      className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300"
                      title="Trocar de conta"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  )}
                  {canReturnToAdmin && onReturnToAdmin && (
                    <button
                      type="button"
                      onClick={onReturnToAdmin}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      title="Voltar ao ADM"
                    >
                      ADM
                    </button>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* ============================================================ */}
      {/* DESKTOP HOVER / PINNED SMART SIDEBAR (>= 768px md:block)     */}
      {/* ============================================================ */}
      {/* Layout Placeholder: Fixed 72px width so main page content never jumps */}
      <div
        className="hidden md:block w-[72px] shrink-0 h-full relative select-none"
        aria-hidden="true"
      />

      {/* Invisible Hover-Intent Edge Zone (10px wide on right edge) */}
      <div
        className="hidden md:block fixed top-0 bottom-0 left-[68px] w-3 z-30 pointer-events-auto"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/* Floating Animated Sidebar Drawer */}
      <aside
        aria-label="Navegação Principal do Sistema"
        role="navigation"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`hidden md:flex fixed top-0 left-0 bottom-0 z-30 flex-col h-full border-r select-none transition-[width,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${
          isExpandedDesktop
            ? 'w-[260px] shadow-2xl shadow-black/50'
            : 'w-[72px] shadow-none'
        } ${
          isDark
            ? 'bg-[#070D18] border-slate-800/80 text-slate-200'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Top Header Logo & Pin Button */}
        <div
          className={`h-16 px-3 border-b flex items-center justify-between shrink-0 ${
            isDark ? 'border-slate-800/80' : 'border-slate-200'
          }`}
        >
          {/* Centered Logo Icon Container: fixed 48px width aligned to 72px sidebar */}
          <div className="w-[48px] h-10 flex items-center justify-center shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
              <Flame className="w-5 h-5" />
            </div>
          </div>

          {/* Smoothly fading Brand Text & Pin Action */}
          <div
            className={`flex items-center justify-between flex-1 min-w-0 pr-1 transition-all duration-200 ease-in-out ${
              isExpandedDesktop
                ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          >
            <div className="flex flex-col min-w-0">
              <h1 className="font-extrabold text-sm tracking-tight leading-none bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent whitespace-nowrap">
                CFO CBMERJ
              </h1>
              <span className="text-[9.5px] text-slate-400 font-mono tracking-widest uppercase mt-0.5 whitespace-nowrap">
                Módulos Táticos
              </span>
            </div>

            {/* Pin Toggle Button */}
            <button
              type="button"
              onClick={togglePin}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ml-2 ${
                isPinned
                  ? 'border-blue-500/50 bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'
                  : isDark
                  ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700'
                  : 'border-slate-200 bg-slate-100 text-slate-600 hover:text-black hover:border-slate-300'
              }`}
              title={isPinned ? 'Desfixar menu lateral (Modo Automático)' : 'Fixar menu lateral aberto'}
              aria-label={isPinned ? 'Desfixar menu lateral' : 'Fixar menu lateral'}
            >
              <Pin className={`w-3.5 h-3.5 transition-transform ${isPinned ? 'rotate-45 text-blue-400 fill-blue-400/20' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Items List Grouped Semantically */}
        <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto overflow-x-hidden">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              {/* Group Category Header (Fades in when expanded) */}
              <div
                className={`px-3 text-[9px] font-black uppercase tracking-widest transition-all duration-200 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                } ${
                  isExpandedDesktop
                    ? 'opacity-100 translate-x-0 pointer-events-auto'
                    : 'opacity-0 -translate-x-2 pointer-events-none h-0 overflow-hidden my-0'
                }`}
              >
                {group.title}
              </div>

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.tabId && activeTab === item.tabId;
                const isSimulations = item.tabId === 'simulations';

                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`sidebar-tab-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    className={`w-full h-11 group relative flex items-center rounded-xl transition-colors duration-200 cursor-pointer overflow-hidden ${
                      isActive
                        ? isSimulations
                          ? 'bg-gradient-to-r from-red-700 to-red-900 text-white shadow-md shadow-red-950/50 font-bold'
                          : 'bg-[#0056D2] text-white shadow-md shadow-blue-950/40 font-bold'
                        : isDark
                        ? 'text-slate-400 hover:text-white hover:bg-slate-800/60 font-medium'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold'
                    }`}
                    title={!isExpandedDesktop ? item.label : undefined}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {/* Icon Container: Fixed width 56px, perfectly centered horizontally */}
                    <div className="w-[56px] h-11 flex items-center justify-center shrink-0 relative">
                      <Icon
                        className={`w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                          isActive
                            ? 'text-white'
                            : isSimulations
                            ? 'text-red-500'
                            : isDark
                            ? 'text-slate-400 group-hover:text-blue-400'
                            : 'text-slate-600 group-hover:text-blue-600'
                        }`}
                      />

                      {/* Small badge dot/number overlay on icon in COLLAPSED state */}
                      {!isExpandedDesktop && item.badge && item.isNumericBadge && (
                        <span className="absolute top-1.5 right-2 min-w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center shadow-md border border-[#070D18]">
                          {item.badge}
                        </span>
                      )}
                    </div>

                    {/* Text and Badge Container: Fades in/out with delay */}
                    <div
                      className={`flex items-center justify-between flex-1 min-w-0 pr-3 transition-all duration-200 ease-in-out ${
                        isExpandedDesktop
                          ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                          : 'opacity-0 -translate-x-2 pointer-events-none'
                      }`}
                    >
                      <span className="text-xs truncate tracking-wide whitespace-nowrap">
                        {item.label}
                      </span>

                      {item.badge && (
                        <span
                          className={`ml-1.5 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase border shrink-0 ${
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
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profile & Account Switcher Footer */}
        {(userProfile || canReturnToAdmin) && (
          <div
            className={`p-2 border-t shrink-0 ${
              isDark ? 'border-slate-800/80' : 'border-slate-200/80'
            }`}
          >
            <div className="flex items-center h-12 rounded-xl transition-all duration-200 overflow-hidden">
              {/* Avatar Icon Container: Fixed width 56px */}
              <div className="w-[56px] h-12 flex items-center justify-center shrink-0">
                {userProfile?.avatarUrl ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 shrink-0">
                    <UserCircle className="w-5 h-5" />
                  </div>
                )}
              </div>

              {/* Profile Details Container */}
              <div
                className={`flex items-center justify-between flex-1 min-w-0 pr-2 transition-all duration-200 ease-in-out ${
                  isExpandedDesktop
                    ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                    : 'opacity-0 -translate-x-2 pointer-events-none'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-bold truncate leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {userProfile?.fullName || userProfile?.username || 'Perfil'}
                  </p>
                  <p className={`text-[10px] font-mono truncate leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    @{userProfile?.username || 'conta'}
                  </p>
                </div>

                {isAdmin && onOpenAccountSwitcher && (
                  <button
                    type="button"
                    onClick={onOpenAccountSwitcher}
                    className={`p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                      isDark
                        ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-sm'
                    }`}
                    title="Trocar de conta"
                    aria-label="Trocar de conta"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {canReturnToAdmin && onReturnToAdmin && (
                  <button
                    type="button"
                    onClick={onReturnToAdmin}
                    className="ml-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"
                    title="Voltar ao ADM"
                    aria-label="Voltar ao ADM"
                  >
                    ADM
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer Version Tag */}
        <div
          className={`h-8 border-t flex items-center justify-center text-[10px] font-mono shrink-0 ${
            isDark ? 'border-slate-800/80 text-slate-500' : 'border-slate-200 text-slate-400'
          }`}
        >
          <div className="w-[56px] flex items-center justify-center shrink-0">
            <span className="text-emerald-500 font-bold">●</span>
          </div>
          <div
            className={`flex-1 transition-all duration-200 ease-in-out whitespace-nowrap ${
              isExpandedDesktop
                ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          >
            <span>CFO CBMERJ V1.1.0</span>
          </div>
        </div>
      </aside>
    </>
  );
};
