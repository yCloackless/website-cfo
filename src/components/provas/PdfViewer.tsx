import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  RotateCcw,
  Loader2,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Maximize,
  StretchHorizontal,
} from 'lucide-react';
import { AppTheme } from '../../types';
import { apiFetch } from '../../services/apiFetch';

// Configura o worker do PDF.js para o arquivo local servido em public/
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

interface PdfViewerProps {
  pdfUrl: string;
  title: string;
  institution?: string;
  examYear?: number;
  onClose: () => void;
  onDownload?: () => void;
  theme: AppTheme;
}

interface PageDimension {
  width: number;
  height: number;
  aspectRatio: number;
}

// Componente individual de página para renderização lazy em Canvas
interface PageRendererProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  dimension?: PageDimension;
  isVisible: boolean;
  onPageVisible: (pageNumber: number) => void;
}

const PageRenderer: React.FC<PageRendererProps> = ({
  pdfDoc,
  pageNumber,
  scale,
  dimension,
  isVisible,
  onPageVisible,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Monitora visibilidade da página com IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            onPageVisible(pageNumber);
          }
        });
      },
      { threshold: [0.1, 0.3, 0.6] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [pageNumber, onPageVisible]);

  // Renderiza a página no canvas somente quando visível
  useEffect(() => {
    let isCancelled = false;

    const renderPage = async () => {
      if (!isVisible) {
        // Se saiu de perto da viewport, cancela render pendente
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
          renderTaskRef.current = null;
        }
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        // Cancela tarefa anterior em andamento
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {}
          renderTaskRef.current = null;
        }

        const page: PDFPageProxy = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        const renderContext = {
          canvasContext: ctx,
          viewport,
          canvas,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;

        if (!isCancelled) {
          setIsRendered(true);
          setRenderError(null);
        }
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') {
          // Cancelamento esperado durante rolagem rápida
          return;
        }
        if (!isCancelled) {
          console.warn(`[PDF Page ${pageNumber} render error]:`, err);
          setRenderError('Erro ao desenhar página.');
        }
      } finally {
        renderTaskRef.current = null;
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [pdfDoc, pageNumber, scale, isVisible]);

  const baseWidth = dimension ? dimension.width * scale : 600 * scale;
  const baseHeight = dimension ? dimension.height * scale : 850 * scale;

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      style={{
        width: `${baseWidth}px`,
        minHeight: `${baseHeight}px`,
        maxWidth: '100%',
      }}
      className="relative flex items-center justify-center bg-white shadow-2xl rounded-sm mx-auto my-3 overflow-hidden select-none transition-shadow duration-200"
    >
      {/* Canvas onde a página real do PDF é desenhada */}
      <canvas
        ref={canvasRef}
        className={`block max-w-full h-auto transition-opacity duration-200 ${
          isRendered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Placeholder de carregamento enquanto não renderizada */}
      {!isRendered && !renderError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
          <span className="text-xs font-semibold">Página {pageNumber}</span>
        </div>
      )}

      {/* Erro pontual de renderização */}
      {renderError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-50 text-rose-600 gap-2 p-4 text-center">
          <AlertTriangle className="w-6 h-6 text-rose-500" />
          <span className="text-xs font-semibold">{renderError}</span>
        </div>
      )}

      {/* Badge discreta de rodapé com o número da página */}
      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
        {pageNumber}
      </div>
    </div>
  );
};

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  title,
  institution,
  examYear,
  onClose,
  onDownload,
  theme,
}) => {
  const isDark = theme === 'dark';

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageDimensions, setPageDimensions] = useState<PageDimension[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [fitMode, setFitMode] = useState<'custom' | 'width' | 'page'>('width');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Carrega o documento PDF via apiFetch (autenticado) e alimenta o PDF.js
  const loadPdfDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await apiFetch(pdfUrl);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Arquivo PDF não encontrado no servidor.');
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error('Você não possui permissão para visualizar este documento.');
        }
        throw new Error(`Erro ao baixar arquivo (HTTP ${res.status}).`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        throw new Error('O formato retornado pelo servidor não é um arquivo PDF válido.');
      }

      const arrayBuffer = await res.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('O arquivo PDF recebido está vazio.');
      }

      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(arrayBuffer),
      });

      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);

      // Coleta dimensões da primeira página para base de cálculo de proporção
      const firstPage = await doc.getPage(1);
      const vp = firstPage.getViewport({ scale: 1.0 });
      const baseDim: PageDimension = {
        width: vp.width,
        height: vp.height,
        aspectRatio: vp.width / vp.height,
      };

      const dims = Array.from({ length: doc.numPages }, () => baseDim);
      setPageDimensions(dims);

      // Ajuste automático inicial para caber na largura disponível
      if (scrollContainerRef.current) {
        const containerWidth = scrollContainerRef.current.clientWidth - 48;
        if (containerWidth > 0 && baseDim.width > 0) {
          const autoScale = Math.min(Math.max(containerWidth / baseDim.width, 0.6), 1.8);
          setScale(Number(autoScale.toFixed(2)));
          setFitMode('width');
        }
      }
    } catch (err: any) {
      console.error('[PdfViewer Load Error]:', err);
      setErrorMessage(err?.message || 'Não foi possível carregar esta prova.');
      setPdfDoc(null);
    } finally {
      setIsLoading(false);
    }
  }, [pdfUrl]);

  useEffect(() => {
    loadPdfDocument();

    return () => {
      if (pdfDoc) {
        try {
          pdfDoc.cleanup();
          pdfDoc.loadingTask?.destroy();
        } catch {}
      }
    };
  }, [loadPdfDocument]);

  // Ajustar à Largura (Fit Width)
  const handleFitWidth = useCallback(() => {
    if (!scrollContainerRef.current || pageDimensions.length === 0) return;
    const baseWidth = pageDimensions[0]?.width || 600;
    const containerWidth = scrollContainerRef.current.clientWidth - 48;
    if (containerWidth > 0 && baseWidth > 0) {
      const newScale = Math.min(Math.max(containerWidth / baseWidth, 0.5), 2.5);
      setScale(Number(newScale.toFixed(2)));
      setFitMode('width');
    }
  }, [pageDimensions]);

  // Zoom In
  const handleZoomIn = () => {
    setFitMode('custom');
    setScale((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 3.0));
  };

  // Zoom Out
  const handleZoomOut = () => {
    setFitMode('custom');
    setScale((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.5));
  };

  // Reset para 100%
  const handleResetZoom = () => {
    setFitMode('custom');
    setScale(1.0);
  };

  // Alterna Tela Cheia
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Atalhos de Teclado (Esc para fechar, + para zoom in, - para zoom out)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Atualiza página visível ativa
  const handlePageVisible = useCallback((pageNum: number) => {
    setCurrentPage(pageNum);
  }, []);

  // Determina quais páginas estão próximas do viewport para carregamento virtualizado
  // (Páginas entre currentPage - 2 e currentPage + 3 são marcadas para renderização)
  const isPageNearViewport = useCallback(
    (pageNumber: number) => {
      return Math.abs(pageNumber - currentPage) <= 2;
    },
    [currentPage]
  );

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col ${
        isDark ? 'bg-[#06090e] text-gray-100' : 'bg-slate-900 text-gray-100'
      } animate-fadeIn`}
    >
      {/* TOPBAR TÁTICA DO LEITOR */}
      <header className="flex-shrink-0 flex items-center justify-between px-3 sm:px-6 py-2.5 border-b border-white/10 bg-[#0b1019]/95 backdrop-blur-md z-20">
        {/* Identificação da Prova */}
        <div className="flex items-center gap-3 min-w-0 mr-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-600 to-amber-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold truncate text-white leading-tight">
              {title}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              {institution && <span>{institution}</span>}
              {examYear && <span>• Ano {examYear}</span>}
              {numPages > 0 && (
                <span className="hidden sm:inline text-gray-500">• {numPages} páginas</span>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Controles Táticos de Leitura */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Indicador de Páginas */}
          {numPages > 0 && (
            <div className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300">
              <span>{currentPage}</span>
              <span className="text-gray-500 mx-1">/</span>
              <span>{numPages}</span>
            </div>
          )}

          {/* Grupo de Zoom */}
          <div className="flex items-center rounded-lg bg-white/5 border border-white/10 p-0.5">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              title="Reduzir Zoom (-)"
              className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              title="Restaurar 100%"
              className="px-2 text-[11px] font-bold text-gray-300 hover:text-white"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3.0}
              title="Aumentar Zoom (+)"
              className="p-1.5 rounded text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ajustar à Largura */}
          <button
            type="button"
            onClick={handleFitWidth}
            title="Ajustar à Largura da Tela"
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              fitMode === 'width'
                ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                : 'bg-white/5 hover:bg-white/10 text-gray-300'
            }`}
          >
            <StretchHorizontal className="w-3.5 h-3.5" />
            <span>Ajustar</span>
          </button>

          {/* Tela Cheia */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Download Original */}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              title="Baixar PDF Original"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Baixar</span>
            </button>
          )}

          {/* Fechar Leitor */}
          <button
            type="button"
            onClick={onClose}
            title="Fechar Visualizador (Esc)"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-rose-600/20 hover:text-rose-400 transition-colors ml-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ÁREA DE VISUALIZAÇÃO E SCROLL CONTÍNUO */}
      <main
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain px-2 sm:px-6 py-4 bg-[#0a0f18] scrollbar-thin scrollbar-thumb-white/10"
      >
        {/* Estado de Carregamento */}
        {isLoading && (
          <div className="h-full min-h-[500px] flex flex-col items-center justify-center gap-3 text-gray-300">
            <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-white">Carregando prova oficial...</p>
              <p className="text-xs text-gray-400">Processando e renderizando páginas do documento</p>
            </div>
          </div>
        )}

        {/* Estado de Erro Controlado */}
        {errorMessage && !isLoading && (
          <div className="h-full min-h-[500px] flex flex-col items-center justify-center gap-4 text-center p-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-lg">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div className="max-w-md space-y-1">
              <h3 className="text-base font-bold text-white">Não foi possível carregar esta prova</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{errorMessage}</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={loadPdfDocument}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tentar novamente</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Voltar ao Banco
              </button>
            </div>
          </div>
        )}

        {/* Renderização Sequencial de Todas as Páginas */}
        {!isLoading && !errorMessage && pdfDoc && numPages > 0 && (
          <div className="flex flex-col items-center w-full min-h-full pb-12">
            {Array.from({ length: numPages }, (_, idx) => {
              const pageNum = idx + 1;
              const isVisible = isPageNearViewport(pageNum);
              const dim = pageDimensions[idx];

              return (
                <PageRenderer
                  key={pageNum}
                  pdfDoc={pdfDoc}
                  pageNumber={pageNum}
                  scale={scale}
                  dimension={dim}
                  isVisible={isVisible}
                  onPageVisible={handlePageVisible}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
