import React from 'react';
import {
  Calendar,
  Clock,
  BarChart3,
  BookOpen,
  Flame,
  FileCheck,
  BrainCircuit,
  Trophy,
  Layers,
  Sparkles,
  Bot,
  CalendarDays,
  Heart,
  Presentation,
  LayoutDashboard,
  Users,
  ShieldAlert,
  KeyRound,
  FileText,
  ShieldCheck,
  Settings,
  Shield,
  Scale,
  Power,
  type LucideIcon,
} from 'lucide-react';

export type ModuleGroup = 'student' | 'admin';

export interface SystemModule {
  /** Identificador canônico e estável do módulo */
  id: string;
  /** Nome legível para apresentação na interface */
  name: string;
  /** Rota associada ao módulo */
  route: string;
  /** Ícone oficial do módulo no design system */
  icon: LucideIcon;
  /** Descrição clara da funcionalidade e objetivo */
  description: string;
  /** Agrupamento lógico: aluno ou administração */
  group: ModuleGroup;
  /** Rótulo legível do grupo */
  groupLabel: string;
  /** Indica se o módulo pode ser colocado em manutenção */
  maintenanceEligible: boolean;
  /** Ordem lógica de exibição para manter consistência com o menu */
  order: number;
}

/**
 * 🏛️ FONTE OFICIAL CENTRALIZADA DE MÓDULOS DO SISTEMA
 * 
 * Todo módulo operacional deve ser registrado aqui.
 * A área de Modo de Manutenção consome esta lista dinamicamente,
 * garantindo que qualquer nova aba adicionada ao sistema passe a aparecer
 * automaticamente sem a necessidade de edição manual de listas duplicadas.
 */
export const SYSTEM_MODULES: SystemModule[] = [
  // =========================================================================
  // 1. ÁREA DO ALUNO (ESTUDOS & DESEMPENHO)
  // =========================================================================
  {
    id: 'ifrij',
    name: 'Rumo ao VEST',
    route: '/ifrj',
    icon: Heart,
    description: 'Módulo preparatório específico para o vestibular IFRJ/UERJ',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 10,
  },
  {
    id: 'table',
    name: 'Cronograma Geral',
    route: '/cronograma',
    icon: Calendar,
    description: 'Grade principal e ciclos semanais de estudos do aluno',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 20,
  },
  {
    id: 'examBank',
    name: 'Banco de Provas & Questões',
    route: '/banco-de-provas',
    icon: FileCheck,
    description: 'Acervo de provas anteriores, resoluções e leitor PDF',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 30,
  },
  {
    id: 'bizuario',
    name: 'Bizuário Tático',
    route: '/bizuario',
    icon: BookOpen,
    description: 'Material de resumos, mapas mentais e bizus estratégicos',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 40,
  },
  {
    id: 'highyield',
    name: 'Temas Quentes (High Yield)',
    route: '/mais-caem',
    icon: Flame,
    description: 'Módulos prioritários de alta probabilidade de cobrança',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 50,
  },
  {
    id: 'monthlyHours',
    name: 'Carga Horária & Heatmap',
    route: '/agenda-horas',
    icon: BarChart3,
    description: 'Histórico mensal e mapa de calor de horas de estudo',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 60,
  },
  {
    id: 'timer',
    name: 'Cronômetro Tático',
    route: '/cronometro',
    icon: Clock,
    description: 'Contador de horas líquidas e sessões de estudo pomodoro',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 70,
  },
  {
    id: 'learning',
    name: 'Radar & Desempenho do Aluno',
    route: '/desempenho',
    icon: Sparkles,
    description: 'Métricas de maestria, consistência e taxa de acertos',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 80,
  },
  {
    id: 'ai',
    name: 'Equilíbrio IA',
    route: '/equilibrio-ia',
    icon: Bot,
    description: 'Diagnóstico inteligente e sugestões automatizadas de estudo',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 90,
  },
  {
    id: 'simulations',
    name: 'Simulados Táticos',
    route: '/simulados',
    icon: BrainCircuit,
    description: 'Execução de simulados cronometrados e gabaritos táticos',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 100,
  },
  {
    id: 'leveling',
    name: 'Nivelamento',
    route: '/nivelamento',
    icon: Trophy,
    description: 'Bateria de questões com meta mínima de 80% de acertos',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 110,
  },
  {
    id: 'flashcards',
    name: 'Flashcards & Repetição Espaçada',
    route: '/flashcards',
    icon: Layers,
    description: 'Decks de memorização ativa e algoritmo de repetição FSRS',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 120,
  },
  {
    id: 'whiteboard',
    name: 'Quadro Branco',
    route: '/whiteboard',
    icon: Presentation,
    description: 'Lousa tática interativa com stylus e anotações visuais',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 130,
  },
  {
    id: 'calendar',
    name: 'Agenda Notion',
    route: '/agenda-notion',
    icon: CalendarDays,
    description: 'Sincronização e visualização da agenda de estudos do Notion',
    group: 'student',
    groupLabel: 'Área do Aluno',
    maintenanceEligible: true,
    order: 140,
  },

  // =========================================================================
  // 2. PAINEL ADMINISTRATIVO (GESTÃO & OPERAÇÃO)
  // =========================================================================
  {
    id: 'dashboard',
    name: 'Dashboard Administrativo',
    route: '/admin',
    icon: LayoutDashboard,
    description: 'Visão executiva com métricas globais e alertas operacionais',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 200,
  },
  {
    id: 'boardIntelligence',
    name: 'Inteligência da Banca',
    route: '/admin?tab=boardIntelligence',
    icon: BrainCircuit,
    description: 'Laboratório de provas históricas, snapshots e perfis cognitivos',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 210,
  },
  {
    id: 'users',
    name: 'Gestão de Usuários',
    route: '/admin?tab=users',
    icon: Users,
    description: 'Controle de contas, suspensão e concessão de privilégios',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 220,
  },
  {
    id: 'security',
    name: 'Segurança & 2FA',
    route: '/admin?tab=security',
    icon: ShieldAlert,
    description: 'Monitoramento de anomalias, bloqueio de IPs e 2FA do Dragão',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 230,
  },
  {
    id: 'honeypot',
    name: 'Honeypots & Decepção',
    route: '/admin?tab=honeypot',
    icon: Shield,
    description: 'Armadilhas táticas e telemetria de contenção contra invasores',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 240,
  },
  {
    id: 'sessions',
    name: 'Gestão de Sessões',
    route: '/admin?tab=sessions',
    icon: Clock,
    description: 'Monitoramento de sessões ativas e revogação remota em lote',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 250,
  },
  {
    id: 'audit',
    name: 'Auditoria & Logs',
    route: '/admin?tab=audit',
    icon: FileText,
    description: 'Trilha de auditoria forense e histórico imutável de eventos',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 260,
  },
  {
    id: 'admins',
    name: 'Gestão de Administradores',
    route: '/admin?tab=admins',
    icon: ShieldCheck,
    description: 'Gerenciamento de contas administrativas e chaves de recuperação',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 270,
  },
  {
    id: 'notion',
    name: 'Notion / Contas',
    route: '/admin?tab=notion',
    icon: KeyRound,
    description: 'Chaves de cadastro e controle de acesso integrado ao Notion',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 280,
  },
  {
    id: 'privacy',
    name: 'Privacidade & LGPD',
    route: '/admin?tab=privacy',
    icon: Scale,
    description: 'Conformidade com LGPD, consentimentos e expurgo de dados',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 290,
  },
  {
    id: 'settings',
    name: 'Configurações do Servidor',
    route: '/admin?tab=settings',
    icon: Settings,
    description: 'Políticas de retenção de dados e parâmetros de segurança',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: true,
    order: 300,
  },
  // ⚠️ SEGURANÇA CRÍTICA: Modo Manutenção NÃO é elegível para manutenção
  // para impedir categoricamente auto-bloqueio acidental do administrador.
  {
    id: 'maintenance',
    name: 'Modo Manutenção',
    route: '/admin?tab=maintenance',
    icon: Power,
    description: 'Chave geral de emergência e bloqueio granular de páginas',
    group: 'admin',
    groupLabel: 'Painel Administrativo',
    maintenanceEligible: false,
    order: 310,
  },
];

/**
 * Retorna todos os módulos elegíveis para manutenção, ordenados logicamente.
 */
export function getMaintenanceEligibleModules(): SystemModule[] {
  return SYSTEM_MODULES
    .filter((mod) => mod.maintenanceEligible)
    .sort((a, b) => a.order - b.order);
}

/**
 * Retorna os módulos elegíveis de um grupo específico.
 */
export function getModulesByGroup(group: ModuleGroup): SystemModule[] {
  return SYSTEM_MODULES
    .filter((mod) => mod.maintenanceEligible && mod.group === group)
    .sort((a, b) => a.order - b.order);
}

/**
 * Busca a definição de um módulo pelo ID estável.
 */
export function getModuleById(id: string): SystemModule | undefined {
  return SYSTEM_MODULES.find((mod) => mod.id === id);
}
