import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Eye } from 'lucide-react';
import { Latex } from '../LatexRenderer';

interface ClozeSegment {
  type: 'text' | 'cloze';
  content: string;
  clozeId?: string;
  clozeAnswer?: string;
  clozeHint?: string;
}

interface ClozeLatexCardProps {
  text: string;
  isAnswer?: boolean;
  className?: string;
  enableTts?: boolean;
}

/**
 * Remove anotações de cloze {{c1::...}} e delimitadores LaTeX para leitura TTS limpa
 */
function sanitizeForSpeech(rawText: string): string {
  let clean = rawText
    // Remove cloze markup deixando apenas a resposta
    .replace(/\{\{c\d+::([^:}]+)(?:::([^}]+))?\}\}/g, '$1')
    // Remove delimitadores de LaTeX
    .replace(/\$\$|\$|\\\[|\\\]|\\\(|\\\)/g, ' ')
    // Remove caracteres especiais de fórmulas comuns
    .replace(/\\Delta/g, 'variação de ')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 sobre $2')
    .replace(/\^2/g, ' ao quadrado')
    .replace(/\^3/g, ' ao cubo')
    .replace(/[\\_{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

export const ClozeLatexCard: React.FC<ClozeLatexCardProps> = ({
  text,
  isAnswer = false,
  className = '',
  enableTts = true,
}) => {
  const [revealedClozes, setRevealedClozes] = useState<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Reseta clozes revelados manualmente ao trocar de cartão
  useEffect(() => {
    setRevealedClozes(new Set());
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [text, isAnswer]);

  // Cancela áudio se o componente for desmontado
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Faz o parse do texto separando em texto puro e blocos de Cloze {{c1::termo::dica}}
  const segments: ClozeSegment[] = useMemo(() => {
    if (!text) return [];

    const clozeRegex = /\{\{c(\d+)::([^:}]+?)(?:::([^}]+?))?\}\}/g;
    const parts: ClozeSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = clozeRegex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push({
          type: 'text',
          content: text.slice(lastIndex, matchIndex),
        });
      }

      parts.push({
        type: 'cloze',
        content: match[0],
        clozeId: `c${match[1]}`,
        clozeAnswer: match[2]?.trim() || '',
        clozeHint: match[3]?.trim() || '',
      });

      lastIndex = clozeRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex),
      });
    }

    return parts;
  }, [text]);

  const handleToggleCloze = (clozeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRevealedClozes((prev) => {
      const next = new Set(prev);
      if (next.has(clozeId)) {
        next.delete(clozeId);
      } else {
        next.add(clozeId);
      }
      return next;
    });
  };

  const handleToggleSpeech = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }

      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        return;
      }

      const speechText = sanitizeForSpeech(text);
      if (!speechText) return;

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;

      // Tenta usar voz brasileira disponível
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find((v) => v.lang.startsWith('pt') || v.lang === 'pt_BR');
      if (ptVoice) {
        utterance.voice = ptVoice;
      }

      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    },
    [text, isSpeaking]
  );

  return (
    <div className={`relative group/card ${className}`}>
      {/* Botão de Leitura por Voz (TTS) */}
      {enableTts && typeof window !== 'undefined' && 'speechSynthesis' in window && (
        <button
          type="button"
          onClick={handleToggleSpeech}
          title={isSpeaking ? 'Parar leitura por voz' : 'Ouvir com síntese de voz (pt-BR)'}
          className={`absolute -top-2 -right-2 p-1.5 rounded-full transition-all duration-200 shadow-md z-10 ${
            isSpeaking
              ? 'bg-red-600 text-white animate-pulse'
              : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
          }`}
        >
          {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
      )}

      <div className="leading-relaxed break-words">
        {segments.length === 0 ? (
          <Latex content={text} />
        ) : (
          segments.map((seg, idx) => {
            if (seg.type === 'text') {
              return <Latex key={idx} content={seg.content} />;
            }

            const isRevealed = isAnswer || (seg.clozeId && revealedClozes.has(seg.clozeId));

            if (!isRevealed) {
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => seg.clozeId && handleToggleCloze(seg.clozeId, e)}
                  title="Clique para revelar esta lacuna"
                  className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 transition-all cursor-pointer select-none"
                >
                  <Eye className="w-3 h-3 text-blue-400" />
                  <span>{seg.clozeHint ? `[${seg.clozeHint}]` : '[...]'}</span>
                </button>
              );
            }

            return (
              <span
                key={idx}
                className="inline-flex items-center mx-1 px-2 py-0.5 rounded-md font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-sm"
              >
                <Latex content={seg.clozeAnswer || ''} />
              </span>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ClozeLatexCard;
