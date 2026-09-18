import React, { useEffect } from 'react';
import { RotateCcw, AlertTriangle, Trash2, Info, X } from 'lucide-react';
import { AppTheme } from '../types';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  badgeText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isDestructive?: boolean;
  iconType?: 'reset' | 'warning' | 'danger' | 'info';
  theme?: AppTheme;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  badgeText,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'warning',
  isDestructive = false,
  iconType = 'reset',
  theme = 'dark',
  loading = false,
  onConfirm,
  onClose,
}) => {
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const renderIcon = () => {
    switch (iconType) {
      case 'reset':
        return <RotateCcw className="w-6 h-6 text-amber-400" />;
      case 'danger':
        return <Trash2 className="w-6 h-6 text-red-400" />;
      case 'info':
        return <Info className="w-6 h-6 text-blue-400" />;
      case 'warning':
      default:
        return <AlertTriangle className="w-6 h-6 text-amber-400" />;
    }
  };

  const getVariantStyles = (activeVariant = variant) => {
    if (activeVariant === 'danger') {
      return {
        iconBg: 'bg-red-500/15 border-red-500/30 text-red-400 shadow-red-950/40',
        badgeBg: 'bg-red-500/10 border-red-500/20 text-red-300',
        buttonBg: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-lg shadow-red-950/50',
        glowBg: 'bg-red-600/15',
      };
    }
    if (activeVariant === 'info') {
      return {
        iconBg: 'bg-blue-500/15 border-blue-500/30 text-blue-400 shadow-blue-950/40',
        badgeBg: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
        buttonBg: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-lg shadow-blue-950/50',
        glowBg: 'bg-blue-600/15',
      };
    }
    return {
      iconBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-amber-950/40',
      badgeBg: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
      buttonBg: 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white shadow-lg shadow-amber-950/50',
      glowBg: 'bg-amber-600/15',
    };
  };

  const styles = getVariantStyles(isDestructive ? 'danger' : variant);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all duration-200">
      <div
        className={`relative w-full max-w-md p-6 rounded-3xl border shadow-2xl overflow-hidden transition-all duration-200 ${
          isDark
            ? 'bg-slate-900 border-slate-800 text-slate-100 shadow-black/80'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60'
        }`}
      >
        <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl pointer-events-none ${styles.glowBg}`} />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
          aria-label="Fechar modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4 pt-1">
          <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-xl ${styles.iconBg}`}>
            {renderIcon()}
          </div>

          <div className="space-y-1.5 px-2">
            <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {title}
            </h3>
            {description && (
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                {description}
              </p>
            )}
          </div>

          {badgeText && (
            <div className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-2 ${styles.badgeBg}`}>
              <span>{badgeText}</span>
            </div>
          )}

          <div className="flex items-center gap-3 w-full pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`flex-1 py-3 px-4 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/80 hover:border-slate-600'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              {cancelLabel}
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 py-3 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${styles.buttonBg}`}
            >
              {loading ? 'Processando...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
