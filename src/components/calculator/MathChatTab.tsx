import React, { useEffect, useRef, useState } from 'react';
import {
  Calculator,
  Camera,
  Loader2,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { AppTheme } from '../../types';
import { apiFetch } from '../../services/apiFetch';
import type { MathCommandDefinition, MathSolveResponse } from '../../services/math/types';
import { MATH_COMMANDS } from '../../services/math/commands';
import { MathResultCard } from './MathResultCard';
import { MathCommandMenu } from './MathCommandMenu';

interface MathChatTabProps {
  theme: AppTheme;
  userProfile?: { fullName?: string; username?: string } | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  imagePreviewUrl?: string;
  result?: MathSolveResponse;
  timestamp: string;
}

const QUICK_EXAMPLES = [
  '124/4',
  '/resolver x^2 - 5*x + 6 = 0',
  '/derivar x^3 + 2*x',
  '/integrar 3*x^2',
  '/sistema x + y = 10; x - y = 2',
  '/matriz det([[1, 2], [3, 4]])',
];

const SESSION_STORAGE_KEY = 'cfo_math_chat_history_v1';

export const MathChatTab: React.FC<MathChatTabProps> = ({ theme, userProfile }) => {
  const isDark = theme !== 'light';
  const requestedBy = userProfile?.fullName || userProfile?.username || 'Cadete';

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [wolframConfigured, setWolframConfigured] = useState<boolean | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [pendingImage, setPendingImage] = useState<{
    base64: string;
    mimeType: string;
    previewUrl: string;
    name: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch('/api/math/commands')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.wolframConfigured === 'boolean') {
          setWolframConfigured(data.wolframConfigured);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore quota
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageFile = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          result: {
            ok: false,
            source: 'local',
            sourceLabel: 'Validação',
            input: '',
            inputLatex: '',
            exactResult: '',
            exactResultLatex: '',
            steps: [],
            error: 'Formato inválido. Envie uma imagem PNG, JPEG ou WEBP.',
          },
        },
      ]);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          result: {
            ok: false,
            source: 'local',
            sourceLabel: 'Validação',
            input: '',
            inputLatex: '',
            exactResult: '',
            exactResultLatex: '',
            steps: [],
            error: 'A imagem deve ter no máximo 5 MB.',
          },
        },
      ]);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPendingImage({
        base64: dataUrl,
        mimeType: file.type,
        previewUrl: dataUrl,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleImageFile(file);
          break;
        }
      }
    }
  };

  const handleSelectCommand = (cmd: MathCommandDefinition) => {
    setInput(`${cmd.command} `);
    setShowCommands(false);
    setCmdSelectedIndex(0);
    textareaRef.current?.focus();
  };

  const submitCalculation = async (overrideExpression?: string) => {
    const expr = (overrideExpression ?? input).trim();
    if ((!expr && !pendingImage) || loading) return;

    setShowCommands(false);
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: expr || (pendingImage ? 'Foto enviada para resolução' : ''),
      imagePreviewUrl: pendingImage?.previewUrl,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideExpression) setInput('');
    const imageToSend = pendingImage;
    setPendingImage(null);
    setLoading(true);

    try {
      let res: Response;
      if (imageToSend) {
        res = await apiFetch('/api/math/solve-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageToSend.base64,
            mimeType: imageToSend.mimeType,
            hint: expr || undefined,
          }),
        });
      } else {
        res = await apiFetch('/api/math/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expression: expr }),
        });
      }

      const data: MathSolveResponse = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          result: data,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          result: {
            ok: false,
            source: 'local',
            sourceLabel: 'Rede',
            input: expr,
            inputLatex: expr,
            exactResult: '',
            exactResultLatex: '',
            steps: [],
            error: 'Falha de conexão ao tentar calcular. Verifique sua internet e tente novamente.',
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      setShowCommands(true);
      setCmdSelectedIndex(0);
    } else if (!val.startsWith('/')) {
      setShowCommands(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCmdSelectedIndex((i) => i + 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCmdSelectedIndex((i) => (i > 0 ? i - 1 : MATH_COMMANDS.length - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitCalculation();
    }
  };

  const clearHistory = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`flex flex-col h-[calc(100vh-8.5rem)] min-h-[520px] rounded-2xl border overflow-hidden shadow-xl ${
        isDark
          ? 'bg-[#121316] border-white/10 text-zinc-100'
          : 'bg-zinc-50 border-zinc-200 text-zinc-900'
      }`}
    >
      {/* Header do Chat */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b ${
          isDark ? 'bg-[#1a1b1f] border-white/10' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold">
                Calculadora Matemática
              </h2>
              {wolframConfigured !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    wolframConfigured
                      ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                      : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                  }`}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  {wolframConfigured ? 'WolframAlpha + Local' : 'Motor Local'}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              Digite uma expressão, use <code className="text-orange-400">/</code> para comandos ou envie uma foto
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="math-commands-toggle-btn"
            onClick={() => setShowCommands((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
              isDark
                ? 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-200'
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-800'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-orange-400" />
            Comandos
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                isDark
                  ? 'bg-white/5 hover:bg-rose-500/15 border-white/10 text-zinc-300 hover:text-rose-300'
                  : 'bg-white hover:bg-rose-50 border-zinc-300 text-zinc-700 hover:text-rose-600'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {messages.length === 0 && (
          <div className="max-w-2xl mx-auto my-6 text-center space-y-5">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-rose-500/20 border border-orange-500/30 text-orange-400">
              <Calculator className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold">Pronto para resolver seus cálculos</h3>
              <p className="text-sm text-zinc-400">
                Frações, equações, sistemas, derivadas, integrais, limites, matrizes e fotos de questões.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => submitCalculation(ex)}
                  className={`rounded-full px-3 py-1.5 text-xs font-mono border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-[#1e1f22] hover:bg-orange-500/15 border-white/10 hover:border-orange-500/40 text-zinc-200'
                      : 'bg-white hover:bg-orange-50 border-zinc-300 text-zinc-800'
                  }`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-lg rounded-2xl rounded-tr-sm bg-orange-600 px-4 py-2.5 text-sm text-white shadow">
                {msg.imagePreviewUrl && (
                  <img
                    src={msg.imagePreviewUrl}
                    alt="Questão enviada"
                    className="mb-2 max-h-48 rounded-lg border border-white/20 object-contain"
                  />
                )}
                {msg.text && <p className="whitespace-pre-wrap font-mono text-xs sm:text-sm">{msg.text}</p>}
              </div>
            ) : (
              msg.result && (
                <MathResultCard result={msg.result} requestedBy={requestedBy} />
              )
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-zinc-400">
            <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            <span>Calculando resultado matemático...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Barra de entrada */}
      <div
        className={`relative border-t p-3 sm:p-4 ${
          isDark ? 'bg-[#1a1b1f] border-white/10' : 'bg-white border-zinc-200'
        }`}
      >
        {showCommands && (
          <MathCommandMenu
            filter={input}
            selectedIndex={cmdSelectedIndex}
            onSelect={handleSelectCommand}
            onClose={() => setShowCommands(false)}
          />
        )}

        {pendingImage && (
          <div className="mb-2.5 inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5">
            <img
              src={pendingImage.previewUrl}
              alt="Preview"
              className="h-10 w-10 rounded object-cover"
            />
            <span className="text-xs text-zinc-200 max-w-[180px] truncate">
              {pendingImage.name}
            </span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              aria-label="Remover imagem"
              className="rounded p-0.5 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            data-testid="math-upload-image-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar foto de equação ou questão"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
              isDark
                ? 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
                : 'bg-zinc-100 hover:bg-zinc-200 border-zinc-300 text-zinc-700'
            }`}
          >
            <Camera className="w-4 h-4" />
          </button>

          <textarea
            ref={textareaRef}
            data-testid="math-chat-input"
            rows={1}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Ex: 124/4, /derivar x^3 + 2*x, ou cole uma foto (Ctrl+V)..."
            className={`flex-1 resize-none rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 ${
              isDark
                ? 'bg-[#121316] border-white/10 text-white placeholder:text-zinc-500'
                : 'bg-zinc-50 border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
            }`}
          />

          <button
            type="button"
            data-testid="math-send-btn"
            disabled={loading || (!input.trim() && !pendingImage)}
            onClick={() => submitCalculation()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Calcular</span>
          </button>
        </div>
      </div>
    </div>
  );
};
