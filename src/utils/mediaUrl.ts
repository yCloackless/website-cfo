/**
 * Utilitário para resolução de URLs de mídia de flashcards (Anki).
 * Garante que tags nativas <img> carreguem imagens autenticadas
 * anexando o token da sessão quando aplicável.
 */

export function getAnkiSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token =
    localStorage.getItem('cfo_terminal_session') ||
    localStorage.getItem('cfo_terminal_token') ||
    null;
  if (!token || token === 'cookie') return null;
  return token;
}

/**
 * Normaliza e anexa o token de autenticação a uma URL de mídia do Anki.
 */
export function resolveAnkiMediaUrl(src: string): string {
  if (!src) return '';
  const trimmed = src.trim();
  let normalized = trimmed;

  // Se o caminho não tiver protocolo ou barra inicial, assume que é o filename do Anki
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:') &&
    !trimmed.startsWith('/')
  ) {
    normalized = `/api/anki/media/${encodeURIComponent(trimmed)}`;
  }

  // Se for uma requisição para a API de mídia do Anki, anexa o token para permitir GET nativo
  if (normalized.startsWith('/api/anki/media/')) {
    const token = getAnkiSessionToken();
    if (token && !normalized.includes('token=')) {
      const separator = normalized.includes('?') ? '&' : '?';
      return `${normalized}${separator}token=${encodeURIComponent(token)}`;
    }
  }

  return normalized;
}

/**
 * Varre uma string HTML e reescreve todos os <img src="..."> para usar URLs autenticadas.
 */
export function resolveHtmlMediaUrls(html: string): string {
  if (!html) return '';
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (_tag, before, src, after) => `${before}${resolveAnkiMediaUrl(src)}${after}`
  );
}
