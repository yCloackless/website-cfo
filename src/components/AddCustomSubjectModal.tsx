import React, { useState } from 'react';
import { X, Plus, Palette, BookOpen, Trash2, RotateCcw, Check, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Subject } from '../types';
import { DEFAULT_CFO_SUBJECTS } from '../data/cfoSubjects';

interface AddCustomSubjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: Subject[];
  onAddSubject: (newSubject: Subject) => void;
  onRemoveSubject: (subjectId: string) => void;
  onResetDefaultSubjects: () => void;
}

const PRESET_COLORS = [
  '#ef4444', // Red
  '#2563eb', // Royal Blue
  '#0284c7', // Sky Blue
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#64748b', // Slate
];

const PRESET_CATEGORIES = [
  'Linguagens',
  'Exatas',
  'Biológicas',
  'Humanas',
  'Específica CBMERJ',
  'Simulados & Questões',
  'Outros',
];

export const AddCustomSubjectModal: React.FC<AddCustomSubjectModalProps> = ({
  isOpen,
  onClose,
  subjects,
  onAddSubject,
  onRemoveSubject,
  onResetDefaultSubjects,
}) => {
  const [activeTab, setActiveTab] = useState<'manage' | 'create'>('manage');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(PRESET_CATEGORIES[0]);
  const [color, setColor] = useState(PRESET_COLORS[0]);

  if (!isOpen) return null;

  const activeSubjectIds = new Set(subjects.map((s) => s.id));

  // Combine standard subjects + any custom subjects currently in state
  const allKnownSubjects: Subject[] = [
    ...DEFAULT_CFO_SUBJECTS,
    ...subjects.filter((s) => !DEFAULT_CFO_SUBJECTS.some((def) => def.id === s.id)),
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    onAddSubject({
      id,
      name: name.trim(),
      category,
      color,
      isCustom: true,
    });

    setName('');
    setActiveTab('manage');
  };

  const handleToggleSubject = (subject: Subject) => {
    if (activeSubjectIds.has(subject.id)) {
      onRemoveSubject(subject.id);
    } else {
      onAddSubject(subject);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#111218] rounded-2xl max-w-lg w-full shadow-2xl border border-slate-800 overflow-hidden text-slate-100 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-[#0D0E13] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Gerenciar Matérias do Cronograma
            </h2>
            <p className="text-[11px] text-slate-400">
              Personalize sua grade semanal retirando ou adicionando disciplinas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 px-3 sm:px-6 bg-[#0D0E13]/60 shrink-0 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'manage'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Matérias da Grade ({subjects.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Nova Disciplina</span>
          </button>
        </div>

        {/* Tab 1: Manage & Remove Subjects */}
        {activeTab === 'manage' ? (
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-start gap-2.5">
              <span className="text-base">💡</span>
              <p className="leading-relaxed text-[11px]">
                Você pode <strong>retirar matérias que não for estudar</strong> (por exemplo, <span className="text-amber-400 font-semibold">Química</span>) para manter seu cronograma limpo e enxuto. Basta desativá-las abaixo.
              </p>
            </div>

            <div className="space-y-2">
              {allKnownSubjects.map((sub) => {
                const isActive = activeSubjectIds.has(sub.id);
                return (
                  <div
                    key={sub.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-slate-900/60 border-slate-800'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-3 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {sub.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {sub.category}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <button
                          onClick={() => handleToggleSubject(sub)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-800/40 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title={`Retirar ${sub.name} do cronograma`}
                        >
                          <EyeOff className="w-3 h-3" />
                          <span>Retirar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleSubject(sub)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 hover:bg-emerald-950/60 border border-emerald-800/40 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title={`Adicionar ${sub.name} de volta ao cronograma`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>Ativar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Deseja restaurar todas as 9 disciplinas oficiais do edital do CFO CBMERJ?')) {
                    onResetDefaultSubjects();
                  }
                }}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-red-500" />
                <span>Restaurar Grade Padrão</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* Tab 2: Add Custom Subject */
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Nome da Matéria / Módulo:
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Treinamento Físico Militar (TAF), Geometria Analítica..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Categoria / Área:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors"
              >
                {PRESET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#111218] text-slate-200">
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-slate-400" />
                Cor de Destaque:
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      color === c ? 'scale-125 ring-2 ring-red-500 ring-offset-2 ring-offset-[#111218]' : 'hover:scale-110 opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('manage')}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] rounded-xl shadow-md shadow-red-950/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Salvar e Adicionar</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
