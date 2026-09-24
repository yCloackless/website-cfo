import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  RotateCcw,
  Star,
  Flag,
  Edit3,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Volume2,
  Layers,
  Image as ImageIcon,
  Loader2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  AnkiCard,
  CardFlag,
  Rating,
  RenderedCardContent,
  ScheduleIntervalPreview,
} from '../../services/anki/ankiTypes';
import { apiFetch } from '../../services/apiFetch';
import { ClozeLatexCard } from '../flashcards/ClozeLatexCard';

interface AnkiReviewPlayerProps {
  deckId?: string;
  deckName: string;
  onClose: () => void;
  onCardEdited?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnkiReviewPlayer: React.FC<AnkiReviewPlayerProps> = ({
  deckId,
  deckName,
  onClose,
  onCardEdited,
  showToast,
}) => {
  const [queue, setQueue] = useState<AnkiCard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState<number>(0);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active card rendered content & interval previews
  const [renderedContent, setRenderedContent] = useState<RenderedCardContent | null>(null);
  const [displayContent, setDisplayContent] = useState<RenderedCardContent | null>(null);
  const [intervals, setIntervals] = useState<ScheduleIntervalPreview[]>([]);
  const [startTimeMs, setStartTimeMs] = useState<number>(Date.now());

  // Flags & Marked state for current card
  const currentCard = queue[currentCardIndex] || null;

  // Quick Edit Note State
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);
  const [editFields, setEditFields] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState<boolean>(false);
  const [zoomedImageSrc, setZoomedImageSrc] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);
  const activeEditFieldIdxRef = useRef<number>(0);

  // Load study queue
  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      const url = deckId
        ? `/api/anki/study-queue?deckId=${encodeURIComponent(deckId)}&limit=100`
        : '/api/anki/study-queue?limit=100';

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setQueue(data.queue || []);
        setCurrentCardIndex(0);
        setIsAnswerRevealed(false);
      }
    } catch {
      showToast?.('Erro ao carregar fila de estudo.', 'error');
    } finally {
      setLoading(false);
    }
  }, [deckId, showToast]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const activeCardIdRef = useRef<string | null>(null);

  const fetchCardRender = useCallback(async (cardId: string) => {
    try {
      const res = await apiFetch(`/api/anki/cards/${cardId}/render`);
      if (res.ok && activeCardIdRef.current === cardId) {
        const data = await res.json();
        if (activeCardIdRef.current === cardId) {
          setRenderedContent(data.rendered || null);
          setIntervals(data.intervals || []);
        }
      }
    } catch {}
  }, []);

  // When active card changes, render it and get interval previews
  useEffect(() => {
    if (!currentCard) {
      activeCardIdRef.current = null;
      setRenderedContent(null);
      setDisplayContent(null);
      setIntervals([]);
      return;
    }

    activeCardIdRef.current = currentCard.id;
    // Reset immediately so previous card content does not leak into current card during fetch
    setRenderedContent(null);
    setDisplayContent(null);
    setIntervals([]);
    setStartTimeMs(Date.now());
    setIsAnswerRevealed(false);
    void fetchCardRender(currentCard.id);
  }, [currentCard, fetchCardRender]);

  useEffect(() => {
    if (!renderedContent) {
      setDisplayContent(null);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];
    const resolveImages = async (html: string, cache: Map<string, string>) => {
      const sources = [...new Set([...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1]))];
      await Promise.all(sources.map(async (src) => {
        if (!src.startsWith('/api/anki/media/')) return;
        try {
          const response = await apiFetch(src);
          if (!response.ok) return;
          const objectUrl = URL.createObjectURL(await response.blob());
          objectUrls.push(objectUrl);
          cache.set(src, objectUrl);
        } catch {}
      }));
      return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (tag, before, src, after) =>
        `${before}${cache.get(src) || src}${after}`
      );
    };

    void (async () => {
      const cache = new Map<string, string>();
      const [questionHtml, answerHtml] = await Promise.all([
        resolveImages(renderedContent.questionHtml, cache),
        resolveImages(renderedContent.answerHtml, cache),
      ]);
      if (!cancelled) setDisplayContent({ ...renderedContent, questionHtml, answerHtml });
      else objectUrls.forEach(URL.revokeObjectURL);
    })();

    return () => {
      cancelled = true;
      objectUrls.forEach(URL.revokeObjectURL);
    };
  }, [renderedContent]);

  // Rate card action
  const handleRate = async (rating: Rating) => {
    if (!currentCard || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const elapsed = Date.now() - startTimeMs;

      const res = await apiFetch(`/api/anki/cards/${currentCard.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, elapsedTimeMs: elapsed }),
      });

      if (res.ok) {
        // Move to next card in queue
        if (currentCardIndex + 1 < queue.length) {
          setCurrentCardIndex((prev) => prev + 1);
        } else {
          // Finished queue!
          setQueue([]);
        }
      } else {
        showToast?.('Falha ao registrar revisão.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao enviar avaliação.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Undo (Ctrl+Z)
  const handleUndo = async () => {
    try {
      const res = await apiFetch('/api/anki/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        showToast?.('Revisão desfeita com sucesso (Undo).', 'success');
        void loadQueue();
      } else {
        showToast?.('Nenhuma revisão recente para desfazer.', 'info');
      }
    } catch {
      showToast?.('Erro ao tentar desfazer revisão.', 'error');
    }
  };

  // Bury card
  const handleBury = async () => {
    if (!currentCard) return;
    try {
      const res = await apiFetch(`/api/anki/cards/${currentCard.id}/bury`, { method: 'POST' });
      if (res.ok) {
        showToast?.('Card enterrado (buried) até a próxima sessão.', 'info');
        setQueue((prev) => prev.filter((c) => c.id !== currentCard.id));
      }
    } catch {
      showToast?.('Erro ao enterrar card.', 'error');
    }
  };

  // Suspend card
  const handleSuspend = async () => {
    if (!currentCard) return;
    try {
      const res = await apiFetch(`/api/anki/cards/${currentCard.id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: true }),
      });
      if (res.ok) {
        showToast?.('Card suspenso da fila de revisão.', 'info');
        setQueue((prev) => prev.filter((c) => c.id !== currentCard.id));
      }
    } catch {
      showToast?.('Erro ao suspender card.', 'error');
    }
  };

  // Flag card
  const handleSetFlag = async (flag: CardFlag) => {
    if (!currentCard) return;
    try {
      const res = await apiFetch(`/api/anki/cards/${currentCard.id}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag }),
      });
      if (res.ok) {
        setQueue((prev) =>
          prev.map((c) => (c.id === currentCard.id ? { ...c, flags: flag } : c))
        );
      }
    } catch {}
  };

  // Mark card
  const handleToggleMark = async () => {
    if (!currentCard) return;
    const nextMarked = !currentCard.isMarked;
    try {
      const res = await apiFetch(`/api/anki/cards/${currentCard.id}/mark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marked: nextMarked }),
      });
      if (res.ok) {
        setQueue((prev) =>
          prev.map((c) => (c.id === currentCard.id ? { ...c, isMarked: nextMarked } : c))
        );
      }
    } catch {}
  };

  // Quick Edit Handlers
  const handleOpenEdit = () => {
    if (!currentCard?.note) return;
    setEditFields([...currentCard.note.fields]);
    setIsEditingNote(true);
  };

  const uploadEditImageFile = async (file: File, targetIdx?: number) => {
    const idx = targetIdx ?? activeEditFieldIdxRef.current;
    if (!file.type.startsWith('image/')) {
      showToast?.('Arquivo selecionado não é uma imagem válida.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast?.('A imagem não pode ultrapassar 5MB.', 'error');
      return;
    }

    try {
      setIsUploadingEditImage(true);
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await apiFetch('/api/anki/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Data,
          filename: file.name || 'clipboard.png',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const imgTag = `\n<img src="${data.url}" />\n`;
        setEditFields((prev) => {
          const next = [...prev];
          next[idx] = (next[idx] || '') + imgTag;
          return next;
        });
        showToast?.('Imagem anexada com sucesso!', 'success');
      } else {
        showToast?.(data.message || 'Falha ao processar imagem.', 'error');
      }
    } catch {
      showToast?.('Erro ao enviar imagem.', 'error');
    } finally {
      setIsUploadingEditImage(false);
      if (editFileInputRef.current) editFileInputRef.current.value = '';
    }
  };

  const handleEditPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, idx: number) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          void uploadEditImageFile(file, idx);
          return;
        }
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!currentCard?.note) return;
    try {
      setIsSavingEdit(true);
      const res = await apiFetch(`/api/anki/notes/${currentCard.note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: editFields }),
      });
      if (res.ok) {
        currentCard.note.fields = [...editFields];
        void fetchCardRender(currentCard.id);
        setIsEditingNote(false);
        showToast?.('Nota atualizada com sucesso!', 'success');
        onCardEdited?.();
      } else {
        showToast?.('Falha ao atualizar nota.', 'error');
      }
    } catch {
      showToast?.('Erro de conexão ao salvar nota.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openImageViewer = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName !== 'IMG') return;
    const src = (target as HTMLImageElement).src;
    setZoomedImageSrc(src);
    setImageZoom(1);
  };

  const changeImageZoom = (nextZoom: number) => {
    setImageZoom(Math.min(3, Math.max(0.5, Number(nextZoom.toFixed(2)))));
  };

  const handleImageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeImageZoom(imageZoom + (event.deltaY < 0 ? 0.1 : -0.1));
  };

  const touchDistance = (touches: React.TouchList) => {
    const [first, second] = [touches[0], touches[1]];
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  };

  const handleImageTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchRef.current = { distance: touchDistance(event.touches), zoom: imageZoom };
    }
  };

  const handleImageTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      changeImageZoom(pinchRef.current.zoom * (touchDistance(event.touches) / pinchRef.current.distance));
    }
  };

  // Keyboard shortcuts (Space, 1, 2, 3, 4, Ctrl+Z, E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingNote) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsEditingNote(false);
        }
        return;
      }

      // Don't intercept if user is in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && currentCard?.note) {
        e.preventDefault();
        handleOpenEdit();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void handleUndo();
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isAnswerRevealed) {
          setIsAnswerRevealed(true);
        } else {
          // Default Good (3) on space if answer is already revealed
          void handleRate(Rating.Good);
        }
        return;
      }

      if (isAnswerRevealed) {
        if (e.key === '1') {
          e.preventDefault();
          void handleRate(Rating.Again);
        } else if (e.key === '2') {
          e.preventDefault();
          void handleRate(Rating.Hard);
        } else if (e.key === '3') {
          e.preventDefault();
          void handleRate(Rating.Good);
        } else if (e.key === '4') {
          e.preventDefault();
          void handleRate(Rating.Easy);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isAnswerRevealed, currentCard, isSubmitting, isEditingNote, onClose]);

  // Dynamic preview intervals map
  const getIntervalLabel = (rating: Rating): string => {
    const item = intervals.find((i) => i.rating === rating);
    return item ? item.intervalFormatted : '';
  };

  // Remaining counts
  const newRemaining = queue.slice(currentCardIndex).filter((c) => c.queue === 0).length;
  const learnRemaining = queue.slice(currentCardIndex).filter((c) => c.queue === 1 || c.queue === 3).length;
  const reviewRemaining = queue.slice(currentCardIndex).filter((c) => c.queue === 2).length;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col backdrop-blur-sm text-zinc-100 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 sm:px-6 bg-zinc-900/90 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
            title="Voltar aos Baralhos"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <Layers className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-semibold text-sm sm:text-base text-zinc-200 truncate">
              {deckName}
            </span>
          </div>
        </div>

        {/* Anki classic queue counter badges */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums bg-zinc-950 border border-zinc-800 px-3 py-1 rounded-full">
            <span className="text-sky-400 font-bold" title="Novos restantes">
              {newRemaining}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-amber-500 font-bold" title="Aprendizagem restantes">
              {learnRemaining}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400 font-bold" title="Revisões restantes">
              {reviewRemaining}
            </span>
          </div>

          {/* Card Actions: Mark, Flag, Bury, Suspend */}
          {currentCard && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleMark}
                className={`p-1.5 rounded-lg transition-colors ${
                  currentCard.isMarked
                    ? 'text-amber-400 bg-amber-400/10'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
                title="Marcar / Estrela (*)"
              >
                <Star className={`w-4 h-4 ${currentCard.isMarked ? 'fill-current' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleBury}
                className="hidden sm:inline-flex px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                title="Enterrar este card temporariamente"
              >
                Enterrar
              </button>

              <button
                type="button"
                onClick={handleSuspend}
                className="hidden sm:inline-flex px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
                title="Suspender este card da fila"
              >
                Suspender
              </button>

              <button
                type="button"
                onClick={handleOpenEdit}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-sky-400 transition-colors"
                title="Editar Cartão / Inserir Foto (E)"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleUndo}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-sky-400 transition-colors"
                title="Desfazer última revisão (Ctrl+Z)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Study Surface */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start p-4 sm:p-8">
        {loading ? (
          <div className="text-center py-20 text-zinc-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Carregando fila de estudo do Anki...</p>
          </div>
        ) : !currentCard ? (
          <div className="text-center max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl animate-in zoom-in-95">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Parabéns! Fila Concluída!</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Você revisou todos os flashcards agendados para este baralho hoje. O scheduler FSRS
              já organizou as próximas datas de repetição.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleUndo}
                className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-all"
              >
                Desfazer última
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-zinc-950 text-sm font-semibold transition-all shadow-md shadow-sky-500/20"
              >
                Voltar aos Baralhos
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl flex flex-col items-center my-2 sm:my-4">
            {/* The Flashcard Container */}
            <div className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl p-5 sm:p-7 min-h-[220px] flex flex-col justify-between relative overflow-hidden transition-all">
              {/* Question Front */}
              <div className="w-full">
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>Pergunta</span>
                  {currentCard.note?.tags && currentCard.note.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {currentCard.note.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-sm sm:text-base font-normal leading-relaxed text-zinc-100">
                  {displayContent || renderedContent ? (
                    <div
                      className="anki-card-front cursor-zoom-in"
                      onClick={openImageViewer}
                      dangerouslySetInnerHTML={{ __html: (displayContent || renderedContent)!.questionHtml }}
                    />
                  ) : (
                    <ClozeLatexCard text={currentCard.note?.fields[0] || ''} isAnswer={false} />
                  )}
                </div>
              </div>

              {/* Answer Divider & Back */}
              {isAnswerRevealed && (
                <div className="w-full mt-5 pt-5 border-t border-zinc-800 animate-in fade-in duration-150">
                  <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-3">
                    Resposta
                  </div>
                  <div className="text-sm sm:text-base font-normal leading-relaxed text-zinc-100">
                    {displayContent || renderedContent ? (
                      <div
                        className="anki-card-back cursor-zoom-in"
                        onClick={openImageViewer}
                        dangerouslySetInnerHTML={{ __html: (displayContent || renderedContent)!.answerHtml }}
                      />
                    ) : (
                      <ClozeLatexCard text={currentCard.note?.fields[1] || ''} isAnswer={true} />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Bar / Rating Controls */}
      {currentCard && (
        <div className="p-4 sm:p-6 border-t border-zinc-800 bg-zinc-900/90 flex flex-col items-center justify-center shrink-0">
          {!isAnswerRevealed ? (
            <button
              type="button"
              onClick={() => setIsAnswerRevealed(true)}
              className="w-full max-w-md py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold text-base shadow-lg shadow-sky-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
            >
              <Eye className="w-5 h-5" />
              <span>Mostrar Resposta</span>
              <kbd className="hidden sm:inline-block ml-2 px-2 py-0.5 text-xs bg-sky-600/40 text-zinc-950 rounded font-mono font-normal">
                Espaço
              </kbd>
            </button>
          ) : (
            <div className="w-full max-w-2xl">
              {/* 4 Anki Classic Rating Buttons with Dynamic FSRS Intervals */}
              <div className="grid grid-cols-4 gap-2 sm:gap-4">
                {/* 1. Again */}
                <button
                  type="button"
                  onClick={() => handleRate(Rating.Again)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-all active:scale-95 group disabled:opacity-50"
                >
                  <span className="text-[11px] sm:text-xs text-red-400/80 font-mono mb-0.5">
                    {getIntervalLabel(Rating.Again) || '<1m'}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm">De novo</span>
                  <kbd className="hidden sm:inline-block mt-1 text-[10px] text-zinc-500 group-hover:text-red-300 font-mono">
                    1
                  </kbd>
                </button>

                {/* 2. Hard */}
                <button
                  type="button"
                  onClick={() => handleRate(Rating.Hard)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:text-amber-300 transition-all active:scale-95 group disabled:opacity-50"
                >
                  <span className="text-[11px] sm:text-xs text-amber-400/80 font-mono mb-0.5">
                    {getIntervalLabel(Rating.Hard) || '6m'}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm">Difícil</span>
                  <kbd className="hidden sm:inline-block mt-1 text-[10px] text-zinc-500 group-hover:text-amber-300 font-mono">
                    2
                  </kbd>
                </button>

                {/* 3. Good */}
                <button
                  type="button"
                  onClick={() => handleRate(Rating.Good)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:text-sky-300 transition-all active:scale-95 group disabled:opacity-50"
                >
                  <span className="text-[11px] sm:text-xs text-sky-400/80 font-mono mb-0.5">
                    {getIntervalLabel(Rating.Good) || '10m'}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm">Bom</span>
                  <kbd className="hidden sm:inline-block mt-1 text-[10px] text-zinc-500 group-hover:text-sky-300 font-mono">
                    3
                  </kbd>
                </button>

                {/* 4. Easy */}
                <button
                  type="button"
                  onClick={() => handleRate(Rating.Easy)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center justify-center py-2.5 sm:py-3.5 px-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all active:scale-95 group disabled:opacity-50"
                >
                  <span className="text-[11px] sm:text-xs text-emerald-400/80 font-mono mb-0.5">
                    {getIntervalLabel(Rating.Easy) || '4d'}
                  </span>
                  <span className="font-semibold text-xs sm:text-sm">Fácil</span>
                  <kbd className="hidden sm:inline-block mt-1 text-[10px] text-zinc-500 group-hover:text-emerald-300 font-mono">
                    4
                  </kbd>
                </button>
              </div>

              {/* Bottom hint */}
              <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-3 px-1">
                <span>Atalhos: Teclas 1, 2, 3, 4</span>
                <button
                  type="button"
                  onClick={handleUndo}
                  className="hover:text-zinc-300 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Desfazer (Ctrl+Z)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {zoomedImageSrc && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Visualizador de imagem do flashcard"
          onClick={() => setZoomedImageSrc(null)}
        >
          <div className="flex items-center justify-between gap-3 p-3 bg-zinc-950/90 border-b border-zinc-800 shrink-0">
            <span className="text-xs font-mono text-zinc-300">{Math.round(imageZoom * 100)}%</span>
            <div className="flex items-center gap-1.5">
              {[0.5, 1, 1.5, 2].map((zoom) => (
                <button
                  key={zoom}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    changeImageZoom(zoom);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    imageZoom === zoom ? 'bg-sky-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {Math.round(zoom * 100)}%
                </button>
              ))}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  changeImageZoom(imageZoom + 0.1);
                }}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  changeImageZoom(imageZoom - 0.1);
                }}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                title="Diminuir zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomedImageSrc(null)}
                className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Fechar zoom"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div
            className="flex-1 overflow-auto p-4 sm:p-8"
            onClick={(event) => event.stopPropagation()}
            onWheel={handleImageWheel}
            onTouchStart={handleImageTouchStart}
            onTouchMove={handleImageTouchMove}
            onTouchEnd={() => { pinchRef.current = null; }}
            style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
          >
            <img
              src={zoomedImageSrc}
              alt="Imagem ampliada do flashcard"
              className="block h-auto min-w-0 mx-auto object-contain"
              style={{ width: `${imageZoom * 100}%`, maxWidth: 'none' }}
            />
          </div>
          <p className="text-center text-[11px] text-zinc-500 pb-3 shrink-0">
            Role o mouse para aproximar/afastar · use dois dedos no celular para ampliar
          </p>
        </div>
      )}
      {/* ✏️ Modal Editar Nota & Anexar Imagem */}
      {isEditingNote && currentCard?.note && (
        <div
          className="fixed inset-0 z-[60] bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setIsEditingNote(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Editar Flashcard / Questão</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {editFields.map((val, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      {idx === 0 ? 'Frente (Pergunta / Enunciado)' : 'Verso (Resposta)'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        activeEditFieldIdxRef.current = idx;
                        editFileInputRef.current?.click();
                      }}
                      disabled={isUploadingEditImage}
                      className="text-[11px] text-zinc-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
                      title="Inserir imagem do PC (ou use Ctrl+V diretamente no campo)"
                    >
                      {isUploadingEditImage && activeEditFieldIdxRef.current === idx ? (
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                      ) : (
                        <ImageIcon className="w-3 h-3" />
                      )}
                      <span>Foto</span>
                    </button>
                  </div>
                  <textarea
                    value={val}
                    onChange={(e) => {
                      const next = [...editFields];
                      next[idx] = e.target.value;
                      setEditFields(next);
                    }}
                    onFocus={() => {
                      activeEditFieldIdxRef.current = idx;
                    }}
                    onPaste={(e) => handleEditPaste(e, idx)}
                    rows={idx === 0 ? 5 : 4}
                    placeholder={`Conteúdo do campo ${idx === 0 ? 'Pergunta' : 'Resposta'}... (Cole imagem com Ctrl+V se desejar)`}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-sans resize-y leading-relaxed"
                  />
                </div>
              ))}

              <input
                type="file"
                ref={editFileInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadEditImageFile(file);
                }}
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
              />
            </div>

            <div className="p-4 border-t border-zinc-800 flex items-center justify-end gap-2 bg-zinc-950/60">
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || isUploadingEditImage}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-semibold rounded-lg text-xs transition-all disabled:opacity-50"
              >
                {isSavingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
