import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Flame, Moon, PanelLeft, ShieldCheck, Sun } from 'lucide-react';
import { User } from 'firebase/auth';
import { AppTheme } from '../types';
import { TabType } from './TacticalSidebar';

interface HeaderProps {
  user: User | null;
  userProfile?: { fullName?: string; username?: string; avatarUrl?: string | null; role?: string } | null;
  onOpenAccount?: () => void;
  onOpenSettings?: () => void;
  isAdmin?: boolean;
  onOpenAdminSecurity?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  hasCalendarAccess?: boolean;
  isCalendarApiDisabled?: boolean;
  calendarEmail?: string | null;
  calendarName?: string | null;
  isPermanentCalendar?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onDisconnectCalendar?: () => void;
  isSigningIn: boolean;
  cycleLabel: string;
  onOpenRevisions: () => void;
  onOpenAddSubject: () => void;
  onOpenHistory: () => void;
  onForceReset: () => void;
  pendingRevisionsCount: number;
  theme: AppTheme;
  onToggleTheme: () => void;
  activeTab?: TabType;
  onSelectTab?: (tab: TabType) => void;
  onLockTerminal?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userProfile = null,
  isAdmin = false,
  onOpenAdminSecurity,
  hasCalendarAccess = false,
  isCalendarApiDisabled = false,
  onSignIn,
  onSignOut,
  onDisconnectCalendar,
  isSigningIn,
  theme,
  onToggleTheme,
  isSidebarOpen = true,
  onToggleSidebar,
}) => {
  const isDark = theme === 'dark';
  const surface = isDark
    ? 'border-slate-800/80 bg-[#0B1528]/80 text-slate-300 hover:border-sky-500/50 hover:bg-slate-900'
    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 hover:bg-slate-100';
  const iconButton = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${surface}`;
  const disconnectCalendar = onDisconnectCalendar || onSignOut;

  return (
    <header className={`sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur-md transition-colors ${isDark ? 'border-slate-800/80 bg-[#070D18]/95 text-slate-100' : 'border-slate-200 bg-white/95 text-slate-900'}`}>
      <div className="mx-auto flex min-h-[64px] w-full max-w-[1600px] items-center justify-between gap-3 px-3 py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          {onToggleSidebar && (
            <button
              type="button"
              id="btn-toggle-sidebar"
              onClick={onToggleSidebar}
              className={`md:hidden ${iconButton}`}
              title={isSidebarOpen ? 'Recolher menu lateral' : 'Abrir menu lateral'}
              aria-label={isSidebarOpen ? 'Recolher menu lateral' : 'Abrir menu lateral'}
            >
              <PanelLeft className="topbar-icon h-5 w-5" />
            </button>
          )}
          <Link to="/cronograma" className="flex min-w-0 items-center gap-2.5 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl" title="Ir para o cronograma">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-sm font-extrabold leading-none tracking-tight text-transparent">CFO CBMERJ</h1>
              <span className="hidden text-[10px] font-mono tracking-widest text-slate-400 sm:block">ESTUDOS TÁTICOS</span>
            </div>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button type="button" id="btn-alternar-tema" onClick={onToggleTheme} className={iconButton} title={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'} aria-label="Alterar tema">
            {isDark ? <Sun className="topbar-icon h-5 w-5" /> : <Moon className="topbar-icon h-5 w-5" />}
          </button>
          <button type="button" id="btn-google-agenda" onClick={hasCalendarAccess ? disconnectCalendar : onSignIn} disabled={isSigningIn} className={`${iconButton} ${hasCalendarAccess ? (isCalendarApiDisabled ? 'border-amber-500/40 text-amber-300' : 'border-emerald-500/40 text-emerald-300') : 'border-red-500/30 text-red-300'} disabled:cursor-wait disabled:opacity-60`} title={hasCalendarAccess ? (isCalendarApiDisabled ? 'Google Agenda conectada — Requer ativação no Google Cloud' : 'Google Agenda conectada — desconectar') : 'Conectar Google Agenda'} aria-label={hasCalendarAccess ? 'Desconectar Google Agenda' : 'Conectar Google Agenda'}>
            <span className="relative"><Calendar className="topbar-icon h-5 w-5" /><span className={`absolute -right-1 -top-1 h-2 w-2 rounded-full ${hasCalendarAccess ? (isCalendarApiDisabled ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400') : 'bg-red-400'}`} aria-hidden="true" /></span>
          </button>
          {(isAdmin || userProfile?.role === 'admin') && onOpenAdminSecurity && (
            <button type="button" id="btn-admin-security" onClick={onOpenAdminSecurity} className={`${iconButton} border-amber-500/40 text-amber-300`} title="Abrir segurança e auditoria" aria-label="Abrir segurança e auditoria">
              <ShieldCheck className="topbar-icon h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
