import React from 'react';
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
  pendingRevisionsCount?: number;
  canAccessNotion?: boolean;
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
  pendingRevisionsCount = 0,
  canAccessNotion = true,
}) => {
  const isDark = theme === 'dark';

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
    <aside
      aria-label="Navegação Principal do Sistema"
      className={`shrink-0 z-20 transition-all duration-300 select-none flex flex-col border-r ${
        isCollapsed ? 'w-16' : 'w-60'
      } ${
        isDark
          ? 'bg-[#070D18]/95 border-slate-800/80 text-slate-200 backdrop-blur-md'
          : 'bg-white/95 border-slate-200 text-slate-800 shadow-sm backdrop-blur-md'
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
          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
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
              onClick={() => onSelectTab(item.id)}
              className={`w-full group flex items-center rounded-xl transition-all cursor-pointer ${
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
  );
};
