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
} from 'lucide-react';
import { User } from 'firebase/auth';
import { AppTheme } from '../types';
interface HeaderProps {
  user: User | null;
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
  activeTab: 'table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar';
  onSelectTab: (tab: 'table' | 'timer' | 'bizuario' | 'highyield' | 'ai' | 'calendar') => void;
  onLockTerminal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
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
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      className={`sticky top-0 z-30 shadow-xl border-b backdrop-blur-md transition-colors ${
        isDark
          ? 'bg-[#070D18]/95 border-slate-800/80 text-slate-100'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-slate-200/50'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          
          {/* Brand & Cycle Info with Official Blue Phoenix Logo */}
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B1528] border border-blue-500/30 flex items-center justify-center p-1 shadow-md shrink-0">
              <img
                src="/phoenix-logo-cropped.png"
                alt="Logo Fênix RUMO ao CFO"
                className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,86,210,0.4)]"
              />
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.25em] text-blue-400 font-bold">
                RUMO AO CFO
              </p>
              <div className="flex items-baseline gap-2">
                <h1
                  className={`text-xl font-extrabold tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  Área de Alunos
                </h1>
                <span
                  className={`italic text-xs font-normal ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {cycleLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs (Table, Timer, Bizuario, Mais Caem, IA) */}
          <div
            className={`flex items-center p-1 rounded-xl border ${
              isDark
                ? 'bg-[#0B1528] border-slate-800'
                : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              id="tab-cronograma"
              onClick={() => onSelectTab('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cronograma</span>
            </button>

            <button
              id="tab-agenda-notion"
              onClick={() => onSelectTab('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-blue-400'
                  : 'text-slate-600 hover:text-blue-600'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Agenda</span>
              <span className="px-1 py-0.2 rounded text-[8.5px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
                Notion
              </span>
            </button>

            <button
              id="tab-cronometro"
              onClick={() => onSelectTab('timer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'timer'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-blue-400'
                  : 'text-slate-600 hover:text-blue-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Cronômetro</span>
            </button>

            <button
              id="tab-bizuario"
              onClick={() => onSelectTab('bizuario')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'bizuario'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-blue-400'
                  : 'text-slate-600 hover:text-blue-600'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bizuário</span>
            </button>

            <button
              id="tab-mais-caem"
              onClick={() => onSelectTab('highyield')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'highyield'
                  ? 'bg-[#0056D2] text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-blue-400'
                  : 'text-slate-600 hover:text-blue-600'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-blue-400" />
              <span>Mais Caem</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-blue-600 text-white uppercase">
                Raio-X
              </span>
            </button>

            <button
              id="tab-ia-equilibrio"
              onClick={() => onSelectTab('ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'ai'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-indigo-400'
                  : 'text-slate-600 hover:text-indigo-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>IA</span>
            </button>
          </div>

          {/* Action buttons & Utilities (Uncluttered, CloudTimer moved to its dedicated tab) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Smart Revisions Button */}
            <button
              id="btn-revisoes-inteligentes"
              onClick={onOpenRevisions}
              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border shadow-2xs cursor-pointer ${
                isDark
                  ? 'bg-[#0B1528] hover:bg-[#0F1D38] text-blue-400 border-slate-800 hover:border-blue-500/40'
                  : 'bg-white hover:bg-slate-50 text-blue-600 border-slate-200 hover:border-blue-300'
              }`}
              title="Gerenciador de revisões de 1 semana e mensais"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Revisões</span>
              {pendingRevisionsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#0056D2] text-white animate-pulse">
                  {pendingRevisionsCount}
                </span>
              )}
            </button>

            {/* Add Custom Subject Button */}
            <button
              id="btn-adicionar-materia"
              onClick={onOpenAddSubject}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0056D2] hover:bg-[#0047B3] border border-blue-400/30 shadow-xs transition-colors cursor-pointer"
              title="Adicionar nova disciplina à grade"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Matéria</span>
            </button>

            {/* History Button */}
            <button
              id="btn-historico-ciclos"
              onClick={onOpenHistory}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
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

            {/* Google Calendar Connection Area */}
            <div
              className={`border-l pl-2 ml-1 ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              {hasCalendarAccess ? (
                <div
                  className={`flex items-center gap-2 border rounded-full px-2.5 py-1 text-xs ${
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
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0"></div>
                  <span
                    className="truncate max-w-[125px] font-semibold text-[11px]"
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
                    className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                    title="Desconectar do Google Agenda"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  id="btn-google-signin"
                  onClick={onSignIn}
                  disabled={isSigningIn}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50 ${
                    isDark
                      ? 'text-slate-200 bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
                      : 'text-slate-800 bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                  title="Conectar com o Google Agenda para sincronizar seus estudos permanentemente"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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

