import { Subject } from '../types';

export const DEFAULT_CFO_SUBJECTS: Subject[] = [
  {
    id: 'portugues',
    name: 'Língua Portuguesa & Literatura',
    category: 'Linguagens',
    color: '#3b82f6', // blue
  },
  {
    id: 'redacao',
    name: 'Redação Discursiva',
    category: 'Linguagens',
    color: '#6366f1', // indigo
  },
  {
    id: 'matematica',
    name: 'Matemática & Raciocínio Lógico',
    category: 'Exatas',
    color: '#0ea5e9', // sky
  },
  {
    id: 'fisica',
    name: 'Física Aplicada',
    category: 'Exatas',
    color: '#ef4444', // red (fire theme)
  },
  {
    id: 'quimica',
    name: 'Química Geral & Orgânica',
    category: 'Exatas & Biológicas',
    color: '#0284c7', // sky blue
  },
  {
    id: 'biologia',
    name: 'Biologia',
    category: 'Biológicas',
    color: '#10b981', // emerald
  },
  {
    id: 'historia',
    name: 'História Geral & do Brasil',
    category: 'Humanas',
    color: '#8b5cf6', // purple
  },
  {
    id: 'geografia',
    name: 'Geografia Geral & do Brasil',
    category: 'Humanas',
    color: '#14b8a6', // teal
  },
  {
    id: 'ingles',
    name: 'Língua Estrangeira (Inglês)',
    category: 'Linguagens',
    color: '#ec4899', // pink
  },
];

export const WEEK_DAYS = [
  { index: 0, short: 'Seg', name: 'Segunda-feira', code: 'seg' },
  { index: 1, short: 'Ter', name: 'Terça-feira', code: 'ter' },
  { index: 2, short: 'Qua', name: 'Quarta-feira', code: 'qua' },
  { index: 3, short: 'Qui', name: 'Quinta-feira', code: 'qui' },
  { index: 4, short: 'Sex', name: 'Sexta-feira', code: 'sex' },
  { index: 5, short: 'Sáb', name: 'Sábado', code: 'sab' },
  { index: 6, short: 'Dom', name: 'Domingo', code: 'dom' },
];
