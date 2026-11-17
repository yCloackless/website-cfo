import { GoogleGenAI } from '@google/genai';

export const MAX_MATH_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export type AllowedMathImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageValidationResult {
  valid: boolean;
  mimeType?: AllowedMathImageMime;
  error?: string;
}

export interface MathExtractionResult {
  ok: boolean;
  expression?: string;
  error?: string;
}

function detectImageMimeByMagicBytes(buf: Buffer): AllowedMathImageMime | null {
  if (buf.length < 12) {
    // Allow minimal valid JPEG header (FF D8 FF) even in tiny test buffers
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return 'image/jpeg';
    }
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return 'image/png';
    }
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateMathImageBuffer(
  buffer: Buffer,
  _declaredMime?: string
): ImageValidationResult {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, error: 'Imagem vazia ou inválida.' };
  }

  if (buffer.length > MAX_MATH_IMAGE_BYTES) {
    return {
      valid: false,
      error: 'A imagem excede o limite máximo de 5 MB.',
    };
  }

  const detected = detectImageMimeByMagicBytes(buffer);
  if (!detected) {
    return {
      valid: false,
      error: 'Formato de imagem não suportado. Envie apenas PNG, JPEG ou WEBP válidos.',
    };
  }

  return { valid: true, mimeType: detected };
}

const VISION_SYSTEM_PROMPT = `Você é um extrator preciso de expressões matemáticas para um motor CAS (WolframAlpha / mathjs).
Analise a imagem e extraia APENAS a expressão, equação, sistema, derivada, integral, limite ou matriz matemática principal.
Regras estritas:
1. Retorne SOMENTE uma única linha com a expressão em notação ASCII compatível com CAS (use * para multiplicação, ^ para potência, / para fração, sqrt() para raiz, sin/cos/tan/log/exp).
2. Para sistemas de equações, separe as equações com ";" e prefixe com "/sistema ".
3. Para derivadas, prefixe com "/derivar ". Para integrais, prefixe com "/integrar ". Para limites, use "/limite expr, var, ponto".
4. Não inclua explicações, markdown, crases ou texto extra.
5. Se não houver nenhuma expressão matemática legível na imagem, responda exatamente: NO_MATH_FOUND`;

export async function extractMathFromImage(
  buffer: Buffer,
  mimeType: AllowedMathImageMime,
  hint?: string
): Promise<MathExtractionResult> {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  const base64 = buffer.toString('base64');
  const userText = hint?.trim()
    ? `${VISION_SYSTEM_PROMPT}\nContexto do usuário: ${hint.trim()}`
    : VISION_SYSTEM_PROMPT;

  if (geminiKey && !geminiKey.includes('COLE_A_CHAVE')) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: userText },
              { inlineData: { mimeType, data: base64 } },
            ],
          },
        ],
      });
      const text = (response.text || '').trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
      if (!text || text === 'NO_MATH_FOUND') {
        return {
          ok: false,
          error: 'Não foi possível identificar uma expressão matemática legível na foto.',
        };
      }
      return { ok: true, expression: text };
    } catch {
      return {
        ok: false,
        error: 'Falha ao processar a imagem com o serviço de visão. Tente digitar a expressão manualmente.',
      };
    }
  }

  if (openaiKey && !openaiKey.includes('COLE_A_CHAVE')) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          max_tokens: 150,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return {
          ok: false,
          error: 'Falha ao processar a imagem no provedor de visão.',
        };
      }
      const data: any = await res.json();
      const text = String(data?.choices?.[0]?.message?.content || '')
        .trim()
        .replace(/^```[a-z]*\n?|\n?```$/g, '')
        .trim();
      if (!text || text === 'NO_MATH_FOUND') {
        return {
          ok: false,
          error: 'Não foi possível identificar uma expressão matemática legível na foto.',
        };
      }
      return { ok: true, expression: text };
    } catch {
      return {
        ok: false,
        error: 'Erro de comunicação ao extrair matemática da imagem.',
      };
    }
  }

  return {
    ok: false,
    error:
      'Extração de foto requer GEMINI_API_KEY ou OPENAI_API_KEY configurada no servidor. Digite a expressão manualmente no chat.',
  };
}
