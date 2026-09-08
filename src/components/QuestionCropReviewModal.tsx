import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Crop,
  CheckCircle2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Sparkles,
  Move,
  Columns,
  Layers,
  Save,
  Eye,
} from 'lucide-react';
import { AppTheme } from '../types';

interface QuestionSegment {
  id?: string;
  pageNumber: number;
  bbox: [number, number, number, number]; // [x0, y0, x1, y1] em percentuais 0-100 ou pontos
  column?: number;
  readingOrder?: number;
}

interface QuestionCropReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  paperId: string | null;
  question: {
    id: string;
    questionNumber: number;
    statement: string;
    status: string;
    confidenceScore?: number;
    imagesJson?: string | null;
  } | null;
  onCropSaved?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

function getAuthToken(): string | null {
  return localStorage.getItem('cfo_terminal_session') || localStorage.getItem('cfo_terminal_token') || null;
}

export const QuestionCropReviewModal: React.FC<QuestionCropReviewModalProps> = ({
  isOpen,
  onClose,
  theme,
  paperId,
  question,
  onCropSaved,
  showToast,
}) => {
  const isDark = theme === 'dark';

  // Estados de página e imagem
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Bounding box em percentual (0 a 100) da largura e altura da página
  // [x0, y0, x1, y1]
  const [bbox, setBbox] = useState<[number, number, number, number]>([5, 10, 95, 30]);
  const [initialBbox, setInitialBbox] = useState<[number, number, number, number]>([5, 10, 95, 30]);
  const [columnLayout, setColumnLayout] = useState<'single' | 'left' | 'right'>('single');

  // Zoom da página completa
  const [pageZoom, setPageZoom] = useState<number>(1);

  // Ref da imagem para cálculo de coordenadas de mouse
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHandle, setDragHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; originalBbox: [number, number, number, number] } | null>(null);

  // Carrega segmentos existentes da questão
  useEffect(() => {
    if (!isOpen || !question) return;

    let isMounted = true;
    const loadSegments = async () => {
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/exams/questions/${question.id}/segments`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.segments && data.segments.length > 0) {
            const firstSeg = data.segments[0];
            const pNum = firstSeg.pageNumber || 1;
            setCurrentPage(pNum);

            // Se o bbox veio em pontos absolutos (ex: 0 a 600) ou percentuais:
            const rawBbox = firstSeg.bbox;
            if (Array.isArray(rawBbox) && rawBbox.length === 4) {
              if (rawBbox[2] <= 100 && rawBbox[3] <= 100) {
                setBbox([rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]]);
                setInitialBbox([rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]]);
              } else {
                // Estimativa padrão em % sobre página padrão A4 (~595 x 842 pt)
                const norm: [number, number, number, number] = [
                  Math.max(0, Math.min(100, (rawBbox[0] / 595) * 100)),
                  Math.max(0, Math.min(100, (rawBbox[1] / 842) * 100)),
                  Math.max(0, Math.min(100, (rawBbox[2] / 595) * 100)),
                  Math.max(0, Math.min(100, (rawBbox[3] / 842) * 100)),
                ];
                setBbox(norm);
                setInitialBbox(norm);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Não foi possível carregar segmentos:', err);
      }
    };

    loadSegments();

    return () => {
      isMounted = false;
    };
  }, [isOpen, question]);

  // Carrega imagem renderizada da página atual via endpoint do backend
  useEffect(() => {
    if (!isOpen || !paperId) return;

    let active = true;
    const fetchPageImage = async () => {
      setIsLoadingPage(true);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/exams/papers/${paperId}/pages/${currentPage}/render`, { headers });
        if (!res.ok) {
          throw new Error('Falha ao renderizar página');
        }
        const blob = await res.blob();
        if (active) {
          const url = URL.createObjectURL(blob);
          setPageImageUrl((oldUrl) => {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            return url;
          });
        }
      } catch (err) {
        console.warn('Erro ao carregar render da página:', err);
        if (active) {
          showToast?.(`Não foi possível renderizar a página ${currentPage} da prova.`, 'error');
        }
      } finally {
        if (active) setIsLoadingPage(false);
      }
    };

    fetchPageImage();

    return () => {
      active = false;
    };
  }, [isOpen, paperId, currentPage]);

  // Limpeza de ObjectURL ao fechar
  useEffect(() => {
    if (!isOpen && pageImageUrl) {
      URL.revokeObjectURL(pageImageUrl);
      setPageImageUrl(null);
    }
  }, [isOpen]);

  // Presets de Coluna
  const applyColumnPreset = (col: 'single' | 'left' | 'right') => {
    setColumnLayout(col);
    if (col === 'single') {
      setBbox([5, bbox[1], 95, bbox[3]]);
    } else if (col === 'left') {
      setBbox([4, bbox[1], 48, bbox[3]]);
    } else if (col === 'right') {
      setBbox([52, bbox[1], 96, bbox[3]]);
    }
  };

  // Ajustes incrementais de limites
  const adjustLimit = (edge: 'top' | 'bottom' | 'left' | 'right', delta: number) => {
    setBbox((prev) => {
      let [x0, y0, x1, y1] = prev;
      if (edge === 'top') {
        y0 = Math.max(0, Math.min(y1 - 3, y0 + delta));
      } else if (edge === 'bottom') {
        y1 = Math.min(100, Math.max(y0 + 3, y1 + delta));
      } else if (edge === 'left') {
        x0 = Math.max(0, Math.min(x1 - 5, x0 + delta));
      } else if (edge === 'right') {
        x1 = Math.min(100, Math.max(x0 + 5, x1 + delta));
      }
      return [x0, y0, x1, y1];
    });
  };

  // Redefinir para o bbox inicial detectado
  const handleReset = () => {
    setBbox(initialBbox);
  };

  // Manipulação de Drag & Drop da caixa de seleção
  const handleMouseDown = (e: React.MouseEvent, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragHandle(handle);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      originalBbox: [...bbox],
    });
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStart || !imageContainerRef.current) return;

      const rect = imageContainerRef.current.getBoundingClientRect();
      const deltaXPercent = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStart.y) / rect.height) * 100;

      let [ox0, oy0, ox1, oy1] = dragStart.originalBbox;

      if (dragHandle === 'move') {
        const width = ox1 - ox0;
        const height = oy1 - oy0;
        let newX0 = Math.max(0, Math.min(100 - width, ox0 + deltaXPercent));
        let newY0 = Math.max(0, Math.min(100 - height, oy0 + deltaYPercent));
        setBbox([newX0, newY0, newX0 + width, newY0 + height]);
      } else if (dragHandle === 'top') {
        const newY0 = Math.max(0, Math.min(oy1 - 3, oy0 + deltaYPercent));
        setBbox([ox0, newY0, ox1, oy1]);
      } else if (dragHandle === 'bottom') {
        const newY1 = Math.min(100, Math.max(oy0 + 3, oy1 + deltaYPercent));
        setBbox([ox0, oy0, ox1, newY1]);
      } else if (dragHandle === 'left') {
        const newX0 = Math.max(0, Math.min(ox1 - 5, ox0 + deltaXPercent));
        setBbox([newX0, oy0, ox1, oy1]);
      } else if (dragHandle === 'right') {
        const newX1 = Math.min(100, Math.max(ox0 + 5, ox1 + deltaXPercent));
        setBbox([ox0, oy0, newX1, oy1]);
      } else if (dragHandle === 'top-left') {
        const newX0 = Math.max(0, Math.min(ox1 - 5, ox0 + deltaXPercent));
        const newY0 = Math.max(0, Math.min(oy1 - 3, oy0 + deltaYPercent));
        setBbox([newX0, newY0, ox1, oy1]);
      } else if (dragHandle === 'top-right') {
        const newX1 = Math.min(100, Math.max(ox0 + 5, ox1 + deltaXPercent));
        const newY0 = Math.max(0, Math.min(oy1 - 3, oy0 + deltaYPercent));
        setBbox([ox0, newY0, newX1, oy1]);
      } else if (dragHandle === 'bottom-left') {
        const newX0 = Math.max(0, Math.min(ox1 - 5, ox0 + deltaXPercent));
        const newY1 = Math.min(100, Math.max(oy0 + 3, oy1 + deltaYPercent));
        setBbox([newX0, oy0, ox1, newY1]);
      } else if (dragHandle === 'bottom-right') {
        const newX1 = Math.min(100, Math.max(ox0 + 5, ox1 + deltaXPercent));
        const newY1 = Math.min(100, Math.max(oy0 + 3, oy1 + deltaYPercent));
        setBbox([ox0, oy0, newX1, newY1]);
      }
    },
    [isDragging, dragStart, dragHandle]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
    setDragStart(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Salvar novo recorte via API
  const handleSaveCrop = async () => {
    if (!question) return;

    setIsSaving(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        segments: [
          {
            page: currentPage,
            pageNumber: currentPage,
            bbox: [
              Number(bbox[0].toFixed(2)),
              Number(bbox[1].toFixed(2)),
              Number(bbox[2].toFixed(2)),
              Number(bbox[3].toFixed(2)),
            ],
            isPercent: true,
            column: columnLayout === 'left' ? 1 : columnLayout === 'right' ? 2 : 1,
            readingOrder: 1,
          },
        ],
      };

      const res = await fetch(`/api/exams/questions/${question.id}/crop`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Falha ao salvar recorte');
      }

      showToast?.('Recorte atualizado com sucesso!', 'success');
      onCropSaved?.();
      onClose();
    } catch (err: any) {
      showToast?.(err.message || 'Erro ao processar novo recorte da questão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Marcar questão como revisada
  const handleMarkAsReady = async () => {
    if (!question) return;

    setIsSaving(true);
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/exams/questions/${question.id}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'READY' }),
      });

      if (!res.ok) throw new Error('Falha ao atualizar status');

      showToast?.('Questão validada e marcada como Pronta!', 'success');
      onCropSaved?.();
      onClose();
    } catch (err: any) {
      showToast?.(err.message || 'Erro ao validar status da questão.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !question) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div
        className={`relative w-full max-w-6xl h-[94vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden transition-all ${
          isDark ? 'bg-[#0b0f19] border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header Superior */}
        <div className={`px-5 py-3.5 border-b flex items-center justify-between ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">
                  Revisão de Recorte Original • Questão {question.questionNumber}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    question.status === 'READY'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {question.status === 'READY' ? 'Pronta' : 'Revisão Pendente'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ajuste os limites exatos da questão para manter alta fidelidade gráfica de enunciados, fórmulas e figuras.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border transition-colors ${
                isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo do Modal: Visualizador da Página + Painel Lateral de Ajustes */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Lado Esquerdo: Imagem da Página com Bounding Box Interativo */}
          <div className="flex-1 relative flex flex-col bg-slate-950/90 overflow-hidden">
            {/* Barra de Ferramentas de Navegação de Página e Zoom */}
            <div className="h-11 px-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoadingPage}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-slate-200">
                  Página <span className="text-blue-400 font-bold">{currentPage}</span>
                </span>
                <button
                  type="button"
                  disabled={isLoadingPage}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageZoom((z) => Math.max(0.6, z - 0.15))}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700"
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-slate-400 font-mono text-[11px] w-12 text-center">
                  {Math.round(pageZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setPageZoom((z) => Math.min(2.5, z + 0.15))}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700"
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPageZoom(1)}
                  className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-[11px]"
                  title="Resetar Zoom"
                >
                  100%
                </button>
              </div>
            </div>

            {/* Visualizador da Página com Área com Scroll */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative select-none">
              {isLoadingPage ? (
                <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-xs">Renderizando página original em alta fidelidade...</p>
                </div>
              ) : pageImageUrl ? (
                <div
                  ref={imageContainerRef}
                  className="relative shadow-2xl border border-slate-800 bg-white inline-block transition-transform duration-75"
                  style={{
                    transform: `scale(${pageZoom})`,
                    transformOrigin: 'top center',
                  }}
                >
                  {/* Imagem de Alta Fidelidade da Página */}
                  <img
                    src={pageImageUrl}
                    alt={`Página ${currentPage}`}
                    className="max-h-[75vh] w-auto pointer-events-none block"
                    draggable={false}
                  />

                  {/* Bounding Box Interativo Sobreposto */}
                  <div
                    className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] cursor-move group transition-all"
                    style={{
                      left: `${bbox[0]}%`,
                      top: `${bbox[1]}%`,
                      width: `${bbox[2] - bbox[0]}%`,
                      height: `${bbox[3] - bbox[1]}%`,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                  >
                    {/* Badge da Questão */}
                    <div className="absolute -top-7 left-0 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow flex items-center gap-1 whitespace-nowrap">
                      <Crop className="w-3 h-3" />
                      Questão {question.questionNumber}
                    </div>

                    {/* Handles de Redimensionamento dos 4 Cantos */}
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'top-left')}
                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'top-right')}
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'bottom-left')}
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-nesw-resize shadow"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'bottom-right')}
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full cursor-nwse-resize shadow"
                    />

                    {/* Handles de Bordas */}
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'top')}
                      className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-400/50"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'bottom')}
                      className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-400/50"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'left')}
                      className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize hover:bg-blue-400/50"
                    />
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'right')}
                      className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize hover:bg-blue-400/50"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-slate-500 text-xs">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  Nenhuma imagem renderizada disponível para esta página.
                </div>
              )}
            </div>
          </div>

          {/* Lado Direito: Painel de Controles e Pré-visualização Numérica */}
          <div
            className={`w-full lg:w-96 border-t lg:border-t-0 lg:border-l p-5 flex flex-col justify-between overflow-y-auto ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="space-y-5">
              {/* Presets de Coluna */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Layout de Coluna da Prova
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('single')}
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      columnLayout === 'single'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Pág. Única
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('left')}
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      columnLayout === 'left'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Columns className="w-3.5 h-3.5" />
                    Coluna 1
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('right')}
                    className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      columnLayout === 'right'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Columns className="w-3.5 h-3.5" />
                    Coluna 2
                  </button>
                </div>
              </div>

              {/* Controles Precisos de Borda */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Ajuste Fino de Limites (%)
                  </label>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[10px] text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Restaurar Detecção
                  </button>
                </div>

                {/* Topo / Y0 */}
                <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/40 space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Topo (Início do Enunciado)</span>
                    <span className="font-mono text-blue-400">{bbox[1].toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustLimit('top', -2)}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white"
                      title="Subir topo (pegar mais texto)"
                    >
                      -2%
                    </button>
                    <input
                      type="range"
                      min="0"
                      max={bbox[3] - 3}
                      step="0.5"
                      value={bbox[1]}
                      onChange={(e) => setBbox([bbox[0], parseFloat(e.target.value), bbox[2], bbox[3]])}
                      className="flex-1 accent-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => adjustLimit('top', 2)}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white"
                      title="Descer topo"
                    >
                      +2%
                    </button>
                  </div>
                </div>

                {/* Fundo / Y1 */}
                <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/40 space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Fundo (Fim das Alternativas)</span>
                    <span className="font-mono text-blue-400">{bbox[3].toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => adjustLimit('bottom', -2)}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white"
                      title="Subir fundo"
                    >
                      -2%
                    </button>
                    <input
                      type="range"
                      min={bbox[1] + 3}
                      max="100"
                      step="0.5"
                      value={bbox[3]}
                      onChange={(e) => setBbox([bbox[0], bbox[1], bbox[2], parseFloat(e.target.value)])}
                      className="flex-1 accent-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => adjustLimit('bottom', 2)}
                      className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-white"
                      title="Descer fundo (incluir mais espaço)"
                    >
                      +2%
                    </button>
                  </div>
                </div>

                {/* Laterais X0 e X1 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl border border-slate-700/50 bg-slate-800/40 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Esquerda</span>
                      <span className="font-mono text-blue-400">{bbox[0].toFixed(1)}%</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => adjustLimit('left', -2)}
                        className="flex-1 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
                      >
                        -2%
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustLimit('left', 2)}
                        className="flex-1 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
                      >
                        +2%
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl border border-slate-700/50 bg-slate-800/40 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Direita</span>
                      <span className="font-mono text-blue-400">{bbox[2].toFixed(1)}%</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => adjustLimit('right', -2)}
                        className="flex-1 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
                      >
                        -2%
                      </button>
                      <button
                        type="button"
                        onClick={() => adjustLimit('right', 2)}
                        className="flex-1 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-white"
                      >
                        +2%
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Informações de Confiança */}
              <div className="p-3 rounded-xl border border-slate-700/40 bg-slate-800/30 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Detecção Determinística:</span>
                  <span className="text-emerald-400 font-bold">PyMuPDF Layout</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Score de Confiança:</span>
                  <span className="text-slate-200 font-mono">
                    {Math.round((question.confidenceScore || 0.95) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Ações Inferiores de Salvamento e Validação */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveCrop}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar e Re-recortar Questão
              </button>

              <button
                type="button"
                disabled={isSaving}
                onClick={handleMarkAsReady}
                className="w-full py-2.5 px-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Aprovar Sem Alteração
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
