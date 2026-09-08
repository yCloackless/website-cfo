import React from 'react';
import {
  Flame,
  Calendar,
  Clock,
  RotateCcw,
  Plus,
  Sparkles,
  LogOut,
  CheckCircle2,
  Sun,
  Moon,
  LayoutGrid,
  BookOpen,
  Target,
  Lock,
  PanelLeft,
  User as UserIcon,
  Shield,
  Bell,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppTheme } from '../types';
interface HeaderProps {
  user: User | null;
  userProfile?: { fullName?: string; username?: string; avatarUrl?: string | null; role?: string } | null;
  onOpenAccount?: () => void;
  isAdmin?: boolean;
  onOpenAdminSecurity?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  hasCalendarAccess?: boolean;
  calendarEmail?: string | null;
  calendarName?: string | null;
  isPermanentCalendar?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  isSigningIn: boolean;
  cycleLabel: string;
  onOpenRevisions: () => void;
  onOpenAddSubject: () => void;
  onOpenHistory: () => void;
  onForceReset: () => void;
  pendingRevisionsCount: number;
  theme: AppTheme;
  onToggleTheme: () => void;
  activeTab?: 'table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar' | 'simulations' | 'flashcards';
  onSelectTab?: (tab: 'table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar' | 'simulations' | 'flashcards') => void;
  onLockTerminal?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  userProfile = null,
  onOpenAccount,
  isAdmin = false,
  onOpenAdminSecurity,
  onOpenNotifications,
  unreadNotificationsCount = 0,
  hasCalendarAccess = false,
  calendarEmail = null,
  calendarName = null,
  isPermanentCalendar = false,
  onSignIn,
  onSignOut,
  isSigningIn,
  cycleLabel,
  onOpenRevisions,
  onOpenAddSubject,
  onOpenHistory,
  onForceReset,
  pendingRevisionsCount,
  theme,
  onToggleTheme,
  activeTab,
  onSelectTab,
  onLockTerminal,
  isSidebarOpen = true,
  onToggleSidebar,
}) => {
  const isDark = theme === 'dark';
  const mobileSurface = isDark
    ? 'border-slate-800 bg-[#0B1528] text-slate-200 hover:border-blue-500/60 hover:bg-slate-900'
    : 'border-slate-200 bg-slate-100 text-slate-800 hover:border-blue-500 hover:bg-slate-200';
  const mobileCircle = 'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border p-1.5 transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';
  const mobileLabel = 'max-w-full truncate text-center text-[10px] font-semibold leading-none';

  return (
    <header
      className={`sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] shadow-xl backdrop-blur-md transition-colors ${
        isDark
          ? 'bg-[#070D18]/95 border-slate-800/80 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50'
      }`}
    >
      <div className="max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-2.5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 min-w-0">
          
          {/* Brand & Toggle Sidebar Button */}
          <div className="flex items-center gap-3 shrink-0">
            {onToggleSidebar && (
              <button
                type="button"
                id="btn-toggle-sidebar"
                onClick={onToggleSidebar}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? 'border-slate-800 bg-[#0B1528] text-slate-300 hover:text-white hover:border-blue-500/50'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-900 hover:border-blue-500/50'
                }`}
                title={isSidebarOpen ? 'Recolher menu lateral' : 'Expandir menu lateral'}
              >
                <PanelLeft className="w-5 h-5" />
              </button>
            )}

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="font-extrabold text-sm tracking-tight leading-none bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  CFO CBMERJ
                </h1>
                <span className="text-[10px] text-slate-400 font-mono">ESTUDOS TÁTICOS</span>
              </div>
            </div>
          </div>

          {/* Mobile action panel: primary pills and secondary icon shortcuts. */}
          <div className="basis-full min-w-0 sm:hidden">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                id="btn-revisoes-inteligentes-mobile"
                onClick={onOpenRevisions}
                aria-label="Abrir revisões inteligentes"
                className={`relative flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  pendingRevisionsCount > 0
                    ? isDark
                      ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                    : mobileSurface
                }`}
                title="Acessar painel de revisões espaçadas ativas"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-blue-400" />
                <span className="truncate">Revisões</span>
                {pendingRevisionsCount > 0 && (
                  <span className="absolute -right-0.5 -top-1 min-w-4 rounded-full bg-blue-600 px-1 py-0.5 text-[9px] font-black leading-none text-white">
                    {pendingRevisionsCount > 99 ? '99+' : pendingRevisionsCount}
                  </span>
                )}
              </button>
              <button
                id="btn-adicionar-materia-mobile"
                onClick={onOpenAddSubject}
                aria-label="Adicionar matéria"
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${mobileSurface}`}
                title="Adicionar disciplina personalizada ao seu ciclo"
              >
                <Plus className="h-4 w-4 shrink-0 text-blue-400" />
                <span className="truncate">Adicionar</span>
              </button>
              <button
                id="btn-historico-ciclos-mobile"
                onClick={onOpenHistory}
                aria-label="Abrir histórico de ciclos"
                className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${mobileSurface}`}
                title="Ver histórico de semanas anteriores"
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span className="truncate">Histórico</span>
              </button>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-x-1.5 gap-y-2">
              {onOpenNotifications && (
                <button
                  type="button"
                  id="btn-open-notifications-mobile"
                  onClick={onOpenNotifications}
                  aria-label={`Alertas${unreadNotificationsCount > 0 ? `, ${unreadNotificationsCount} não lidas` : ''}`}
                  className={`${mobileCircle} relative ${mobileSurface}`}
                  title="Central de notificações"
                >
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300">
                    <Bell className="h-5 w-5" />
                    {unreadNotificationsCount > 0 && (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-black leading-none text-white shadow-md shadow-red-500/40">
                        {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                      </span>
                    )}
                  </span>
                  <span className={mobileLabel}>Alertas</span>
                </button>
              )}

              <div className={`${mobileCircle} ${hasCalendarAccess ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.12)]' : 'border-red-500/40 bg-red-500/5 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.1)]'}`}>
                {hasCalendarAccess ? (
                  <button
                    id="btn-google-signout-mobile"
                    onClick={onSignOut}
                    aria-label="Agenda conectada. Desconectar"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    title="Agenda conectada. Tocar para desconectar"
                  >
                    <span className="relative"><Calendar className="h-5 w-5" /><span className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" /></span>
                  </button>
                ) : (
                  <button
                    id="btn-google-signin-mobile"
                    onClick={onSignIn}
                    disabled={isSigningIn}
                    aria-label="Agenda desconectada. Conectar"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-red-400/40 bg-red-500/10 text-red-300 transition-all duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                    title="Agenda desconectada. Tocar para conectar"
                  >
                    <span className="relative"><Calendar className="h-5 w-5" /><span className="absolute -right-2 -top-1 h-2.5 w-2.5 rounded-full bg-red-400 shadow-sm shadow-red-400/60" /></span>
                  </button>
                )}
                <span className={mobileLabel}>Agenda</span>
              </div>

              {(isAdmin || userProfile?.role === 'admin') && onOpenAdminSecurity && (
                <button
                  type="button"
                  id="btn-admin-security-mobile"
                  onClick={onOpenAdminSecurity}
                  aria-label="Abrir segurança e auditoria"
                  className={`${mobileCircle} border-amber-500/40 bg-amber-500/10 text-amber-300 hover:border-amber-400`}
                  title="Painel de monitoramento de segurança e auditoria"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10"><Shield className="h-5 w-5" /></span>
                  <span className={mobileLabel}>Segurança</span>
                </button>
              )}

              {onLockTerminal && (
                <button
                  type="button"
                  id="btn-lock-terminal-mobile"
                  onClick={onLockTerminal}
                  aria-label="Bloquear terminal"
                  className={`${mobileCircle} border-blue-500/40 bg-blue-500/10 text-blue-300 hover:border-blue-400`}
                  title="Bloquear terminal e retornar à página inicial"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/40 bg-blue-500/10"><Lock className="h-5 w-5" /></span>
                  <span className={mobileLabel}>Bloqueio</span>
                </button>
              )}

              <button
                type="button"
                id="btn-alternar-tema-mobile"
                onClick={onToggleTheme}
                aria-label="Alternar tema de cores"
                className={`${mobileCircle} ${mobileSurface}`}
                title={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300">{isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</span>
                <span className={mobileLabel}>Tema</span>
              </button>

              <button
                type="button"
                id="btn-reiniciar-ciclo-mobile"
                onClick={onForceReset}
                aria-label="Reiniciar ciclo"
                className={`${mobileCircle} ${mobileSurface}`}
                title="Iniciar novo ciclo semanal agora"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-500/30 bg-slate-500/10"><RotateCcw className="h-5 w-5" /></span>
                <span className={mobileLabel}>Reiniciar</span>
              </button>

              {onOpenAccount && (
                <button
                  type="button"
                  id="btn-open-account-mobile"
                  onClick={onOpenAccount}
                  aria-label="Abrir minha conta e perfil"
                  className={`${mobileCircle} ${mobileSurface}`}
                  title="Minha conta e perfil do aluno"
                >
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-blue-500/30 bg-blue-600 text-white">
                    {userProfile?.avatarUrl ? <img src={userProfile.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-5 w-5" />}
                  </span>
                  <span className={mobileLabel}>Perfil</span>
                </button>
              )}
            </div>
          </div>

          {/* Desktop action buttons and utilities. Kept unchanged for desktop. */}
          <div className="ml-0 hidden min-w-0 max-w-full basis-full items-center gap-1.5 overflow-visible py-0.5 sm:ml-auto sm:flex sm:basis-auto sm:flex-1 sm:flex-nowrap sm:gap-2.5 sm:overflow-x-auto scrollbar-none [&>button]:min-h-10 sm:[&>button]:min-h-0">
            {/* Smart Revisions Button */}
            <button
              id="btn-revisoes-inteligentes"
              onClick={onOpenRevisions}
              className={`relative inline-flex items-center min-h-11 sm:min-h-0 gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                pendingRevisionsCount > 0
                  ? isDark
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 hover:bg-blue-600/30'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : isDark
                  ? 'text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border-slate-800'
                  : 'text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-200'
              }`}
              title="Acessar painel de revisões espaçadas ativas"
            >
              <Sparkles className={`w-3.5 h-3.5 ${pendingRevisionsCount > 0 ? 'text-blue-400 animate-pulse' : ''}`} />
              <span className="hidden sm:inline">Revisões</span>
              {pendingRevisionsCount > 0 && (
                <span className="absolute -top-1 -right-1 sm:static sm:ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                  {pendingRevisionsCount}
                </span>
              )}
            </button>

            {/* Add Custom Subject Button */}
            <button
              id="btn-adicionar-materia"
              onClick={onOpenAddSubject}
              className={`inline-flex items-center min-h-11 sm:min-h-0 gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                isDark
                  ? 'text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border-slate-800'
                  : 'text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-200'
              }`}
              title="Adicionar disciplina personalizada ao seu ciclo"
            >
              <Plus className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Matéria</span>
            </button>

            {/* History Button */}
            <button
              id="btn-historico-ciclos"
              onClick={onOpenHistory}
              className={`inline-flex items-center min-h-11 sm:min-h-0 gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isDark
                  ? 'text-slate-300 hover:text-white bg-slate-900/80 hover:bg-slate-800 border-slate-800'
                  : 'text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border-slate-200'
              }`}
              title="Ver histórico de semanas anteriores"
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Histórico</span>
            </button>

            {/* Reset Cycle Button */}
            <button
              id="btn-reiniciar-ciclo"
              onClick={onForceReset}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                isDark
                  ? 'text-slate-400 hover:text-red-400 bg-slate-900/80 hover:bg-red-950/30 border-slate-800 hover:border-red-900/40'
                  : 'text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 border-slate-200 hover:border-red-200'
              }`}
              title="Iniciar novo ciclo semanal agora"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Dark / Light Theme Toggle Button */}
            <button
              id="btn-alternar-tema"
              onClick={onToggleTheme}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-1.5 ${
                isDark
                  ? 'text-sky-400 bg-slate-900 hover:bg-slate-800 border-slate-800'
                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border-slate-200'
              }`}
              title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
              aria-label="Alternar tema de cores"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-sky-400" />
                  <span className="hidden xl:inline text-[11px] font-semibold text-slate-300">Claro</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-slate-700" />
                  <span className="hidden xl:inline text-[11px] font-semibold text-slate-700">Escuro</span>
                </>
              )}
            </button>

            {/* Notification Bell 🔔 */}
            {onOpenNotifications && (
              <button
                type="button"
                id="btn-open-notifications"
                onClick={onOpenNotifications}
                className={`relative shrink-0 p-2 rounded-xl border transition-all cursor-pointer ${
                  isDark
                    ? 'border-slate-800 bg-[#0B1528] text-slate-300 hover:text-white hover:border-blue-500/50'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:text-slate-900 hover:border-blue-500/50'
                }`}
                title="Central de Notificações"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute top-0 right-0 sm:-top-1 sm:-right-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-red-500 text-white leading-none shadow-md shadow-red-500/40 animate-pulse">
                    {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Google Calendar Connection Area */}
            <div
              className={`min-w-0 sm:border-l sm:pl-2 sm:ml-1 ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              {hasCalendarAccess ? (
                <div
                  className={`relative w-full min-h-10 sm:min-h-0 flex items-center justify-center gap-2 border rounded-lg sm:rounded-full p-1.5 sm:px-2.5 sm:py-1 text-xs ${
                    isDark
                      ? 'bg-slate-900/80 border-slate-800 text-slate-300'
                      : 'bg-slate-100 border-slate-200 text-slate-800'
                  }`}
                  title={
                    isPermanentCalendar
                      ? 'Google Agenda Conectado Permanentemente (Auto-renovação de Token via Backend)'
                      : 'Google Agenda Conectado e Sincronizado'
                  }
                >
                  <div className="hidden sm:block w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"></div>
                  <span
                    className="hidden sm:block truncate max-w-[125px] font-semibold text-[11px]"
                    title={
                      calendarName
                        ? `${calendarName} (${calendarEmail || ''})`
                        : calendarEmail || 'Google Agenda'
                    }
                  >
                    {calendarName && calendarName.trim().length > 0
                      ? calendarName.trim().split(' ').slice(0, 2).join(' ')
                      : user?.displayName && user.displayName.trim().length > 0
                      ? user.displayName.trim().split(' ').slice(0, 2).join(' ')
                      : calendarEmail?.split('@')[0] || 'Agenda'}
                  </span>

                  {isPermanentCalendar && (
                    <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800/60 hidden sm:inline">
                      Permanente
                    </span>
                  )}
                  <button
                    id="btn-google-signout"
                    onClick={onSignOut}
                    className="absolute inset-0 sm:static flex items-center justify-center text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                    title="Desconectar do Google Agenda"
                    aria-label="Google Agenda conectada. Desconectar"
                  >
                    <Calendar className="w-4 h-4 sm:hidden" />
                    <span className="sm:hidden absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/60" aria-hidden="true" />
                    <LogOut className="hidden sm:block w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-google-signin"
                  onClick={onSignIn}
                  disabled={isSigningIn}
                  className={`relative inline-flex items-center justify-center gap-1.5 w-full min-h-10 sm:w-auto sm:min-h-0 sm:px-2.5 sm:py-1.5 rounded-lg sm:rounded-full text-xs font-medium border shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50 ${
                    isDark
                      ? 'text-slate-200 bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
                      : 'text-slate-800 bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                  title="Conectar com o Google Agenda para sincronizar seus estudos permanentemente"
                >
                  <Calendar className="w-4 h-4 sm:hidden" />
                  <span className="sm:hidden absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm shadow-red-500/60" aria-hidden="true" />
                  <svg className="hidden sm:block w-3.5 h-3.5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="hidden md:inline">
                    {isSigningIn ? 'Conectando...' : 'Google Agenda'}
                  </span>
                </button>
              )}
            </div>

            {/* Minha Conta / Perfil do Aluno */}
            {onOpenAccount && (
              <button
                type="button"
                id="btn-open-account"
                onClick={onOpenAccount}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                  isDark
                    ? 'bg-[#0B1528] border-slate-800 hover:border-blue-500/60 text-slate-200'
                    : 'bg-slate-100 border-slate-200 hover:border-blue-500 text-slate-800'
                }`}
                title="Minha Conta & Perfil do Aluno"
              >
                {userProfile?.avatarUrl ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt="Foto do Aluno"
                    className="w-4 h-4 rounded-full object-cover border border-blue-500 shrink-0"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-black shrink-0">
                    {(userProfile?.username || userProfile?.fullName || 'A').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:inline font-mono text-[11px] text-blue-400 font-semibold">
                  @{userProfile?.username || 'perfil'}
                </span>
              </button>
            )}

            {/* Painel de Monitoramento e Segurança (Admin) */}
            {(isAdmin || userProfile?.role === 'admin') && onOpenAdminSecurity && (
              <button
                type="button"
                id="btn-admin-security"
                onClick={onOpenAdminSecurity}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                  isDark
                    ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400 text-amber-300'
                    : 'bg-amber-50 border-amber-200 hover:border-amber-400 text-amber-800'
                }`}
                title="Painel de Monitoramento de Segurança e Auditoria (Admin)"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline font-mono text-[11px] font-bold">
                  Segurança
                </span>
              </button>
            )}

            {/* Lock Terminal 2FA Button */}
            {onLockTerminal && (
              <button
                onClick={onLockTerminal}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-sans font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                  isDark
                    ? 'bg-blue-950/40 border-blue-900/60 text-blue-300 hover:bg-blue-900/50 hover:border-blue-500/50'
                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
                title="Bloquear terminal e retornar à Landing Page"
              >
                <Lock className="w-3 h-3 text-blue-400" />
              </button>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};
