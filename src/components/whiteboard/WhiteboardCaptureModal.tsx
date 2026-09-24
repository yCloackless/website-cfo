import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Crop, Check, Camera, Upload, AlertCircle, RefreshCw } from 'lucide-react';

interface WhiteboardCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64: string, width: number, height: number) => void;
}

export const WhiteboardCaptureModal: React.FC<WhiteboardCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isCapturingScreen, setIsCapturingScreen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetState = useCallback(() => {
    setImageSrc(null);
    setCropBox(null);
    setErrorMsg(null);
    setIsCapturingScreen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);

  // Capturar via Screen Capture API do navegador
  const handleStartScreenCapture = async () => {
    setErrorMsg(null);
    setIsCapturingScreen(true);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('A API de Captura de Tela não é suportada neste navegador.');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as any,
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      // Aguarda 200ms para renderizar o primeiro frame limpo
      await new Promise((res) => setTimeout(res, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setImageSrc(dataUrl);
        // Default crop: centralizado
        setCropBox({
          x: canvas.width * 0.1,
          y: canvas.height * 0.1,
          w: canvas.width * 0.8,
          h: canvas.height * 0.8,
        });
      }

      // Parar todas as trilhas da câmera/tela
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMsg(err.message || 'Falha ao iniciar captura de tela.');
      }
    } finally {
      setIsCapturingScreen(false);
    }
  };

  // Upload manual de imagem do computador
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, selecione um arquivo de imagem válido (PNG, JPEG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageSrc(result);
      setCropBox(null);
      setErrorMsg(null);
    };
    reader.readAsDataURL(file);
  };

  // Interceptar colagem (Ctrl+V) dentro do modal
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setImageSrc(event.target?.result as string);
              setCropBox(null);
              setErrorMsg(null);
            };
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Manipulação de recorte com o mouse/touch
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    isDraggingRef.current = true;
    dragStartRef.current = { x, y };
    setCropBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const x = Math.min(dragStartRef.current.x, currentX);
    const y = Math.min(dragStartRef.current.y, currentY);
    const w = Math.abs(currentX - dragStartRef.current.x);
    const h = Math.abs(currentY - dragStartRef.current.y);

    setCropBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Confirmar e extrair recorte
  const handleConfirmCrop = () => {
    if (!imageSrc || !imgRef.current) return;

    const img = imgRef.current;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const displayW = img.clientWidth;
    const displayH = img.clientHeight;

    const scaleX = naturalW / displayW;
    const scaleY = naturalH / displayH;

    const canvas = document.createElement('canvas');

    if (!cropBox || cropBox.w < 20 || cropBox.h < 20) {
      // Se não houver recorte específico, envia imagem inteira
      canvas.width = naturalW;
      canvas.height = naturalH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const fullBase64 = canvas.toDataURL('image/png');
        onCapture(fullBase64, naturalW, naturalH);
        onClose();
      }
      return;
    }

    const cropX = cropBox.x * scaleX;
    const cropY = cropBox.y * scaleY;
    const cropW = cropBox.w * scaleX;
    const cropH = cropBox.h * scaleY;

    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedBase64 = canvas.toDataURL('image/png');
      onCapture(croppedBase64, Math.round(cropW), Math.round(cropH));
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#121216] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#16161c]">
          <div className="flex items-center gap-2.5">
            <Crop className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Adicionar Questão ao Quadro
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!imageSrc ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 border-2 border-dashed border-slate-800 rounded-2xl bg-[#0c0c0e] text-center space-y-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleStartScreenCapture}
                  disabled={isCapturingScreen}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  {isCapturingScreen ? 'Capturando Tela...' : 'Capturar da Tela (PC)'}
                </button>

                <label className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm cursor-pointer border border-slate-700 active:scale-95 transition-all">
                  <Upload className="w-4 h-4 text-slate-300" />
                  <span>Selecionar Arquivo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <p className="text-xs text-slate-400 max-w-md">
                Dica: Você também pode simplesmente pressionar <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[11px]">Ctrl+V</kbd> a qualquer momento para colar um print da área de transferência!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Arraste sobre a imagem para selecionar a área exata do enunciado:</span>
                <button
                  onClick={() => setImageSrc(null)}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Trocar Imagem
                </button>
              </div>

              <div
                ref={containerRef}
                className="relative overflow-hidden rounded-xl border border-slate-800 bg-black max-h-[60vh] flex items-center justify-center select-none"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Pré-visualização da questão"
                  className="max-h-[60vh] max-w-full object-contain pointer-events-none"
                />

                {/* Caixa de Recorte Selecionada */}
                {cropBox && cropBox.w > 5 && cropBox.h > 5 && (
                  <div
                    className="absolute border-2 border-amber-400 bg-amber-400/10 pointer-events-none shadow-2xl"
                    style={{
                      left: `${cropBox.x}px`,
                      top: `${cropBox.y}px`,
                      width: `${cropBox.w}px`,
                      height: `${cropBox.h}px`,
                    }}
                  >
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-black text-[10px] font-bold">
                      {Math.round(cropBox.w)} × {Math.round(cropBox.h)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-[#16161c]">
          <span className="text-xs text-slate-500">
            {imageSrc ? 'Pronto para enviar ao caderno de cálculo' : 'Aguardando imagem'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmCrop}
              disabled={!imageSrc}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-40"
            >
              <Check className="w-4 h-4" />
              Inserir no Quadro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
