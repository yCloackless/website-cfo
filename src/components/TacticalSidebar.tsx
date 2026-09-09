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
  isCollapsed: _isCollapsed,
  onToggleCollapse: _onToggleCollapse,
  onClose,
  pendingRevisionsCount: _pendingRevisionsCount = 0,
  canAccessNotion = true,
  userProfile,
  isAdmin = false,
  canReturnToAdmin = false,
  onOpenAccountSwitcher,
  onReturnToAdmin,
}) => {
  const isDark = theme === 'dark';
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Clean timeout on unmount
  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
    }
    leaveTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  };

  const isExpandedDesktop = isHovered || isFocused;

  const NAV_ITEMS: NavItem[] = [
    {
      id: 'table',
      label: 'Cronograma',
      icon: LayoutGrid,
      description: 'Grade semanal de estudos',
    },
    {
      id: 'monthlyHours',
      label: 'Agenda de Horas',
      icon: Calendar,
      badge: 'Horas',
      badgeClass: {
        dark: 'bg-blue-600/30 text-sky-300 border-blue-500/40',
        light: 'bg-blue-100 text-blue-800 border-blue-300',
      },
      description: 'Horas líquidas diárias',
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
        dark: 'bg-blue-600 text-white border-blue-500',
        light: 'bg-blue-600 text-white border-blue-500',
      },
      description: 'Incidência de provas',
    },
    {
      id: 'examBank',
      label: 'Banco de Provas',
      icon: FileText,
      badge: 'IA',
      badgeClass: {
        dark: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        light: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      },
      description: 'Questões & Resolução IA',
    },
    {
      id: 'learning',
      label: 'Radar',
      icon: Target,
      badge: 'Aluno',
      badgeClass: {
        dark: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        light: 'bg-cyan-100 text-cyan-900 border-cyan-300',
      },
      description: 'Domínio e prioridades',
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
            <nav className="flex-1 py-3 px-2.5 space-y-1.5 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isSimulations = item.id === 'simulations';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      if (onClose) onClose();
                    }}
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
      {/* DESKTOP HOVER SIDEBAR (>= 768px md:block)                     */}
      {/* ============================================================ */}
      {/* Layout Placeholder: Fixed 72px width so page layout never jumps */}
      <div
        className="hidden md:block w-[72px] shrink-0 h-full relative select-none"
        aria-hidden="true"
      />

      {/* Floating Animated Sidebar Drawer overlaying over content */}
      <aside
        aria-label="Navegação Principal do Sistema"
        role="navigation"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`hidden md:flex fixed top-0 left-0 bottom-0 z-30 flex-col h-full border-r select-none transition-[width,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${
          isExpandedDesktop
            ? 'w-[260px] shadow-2xl shadow-black/40'
            : 'w-[72px] shadow-none'
        } ${
          isDark
            ? 'bg-[#070D18] border-slate-800/80 text-slate-200'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Top Header Logo */}
        <div
          className={`h-16 px-3 border-b flex items-center shrink-0 ${
            isDark ? 'border-slate-800/80' : 'border-slate-200'
          }`}
        >
          {/* Centered Logo Icon Container: fixed 48px width aligned to 72px sidebar */}
          <div className="w-[48px] h-10 flex items-center justify-center shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
              <Flame className="w-5 h-5" />
            </div>
          </div>

          {/* Smoothly fading Brand Text */}
          <div
            className={`flex items-center justify-between flex-1 min-w-0 pr-1 transition-all duration-200 ease-in-out ${
              isExpandedDesktop
                ? 'opacity-100 translate-x-0 delay-75 pointer-events-auto'
                : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
          >
            <div className="flex flex-col">
              <h1 className="font-extrabold text-sm tracking-tight leading-none bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent whitespace-nowrap">
                CFO CBMERJ
              </h1>
              <span className="text-[9.5px] text-slate-400 font-mono tracking-widest uppercase mt-0.5 whitespace-nowrap">
                Módulos Táticos
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 py-3 px-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
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
                <div className="w-[56px] h-11 flex items-center justify-center shrink-0">
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
