/**
 * CFO CBMERJ - Avatar & Media Validation Service
 * Server-Side Magic Byte / MIME validation, strict size limits, and resilient storage.
 * Enforces ownership and strictly rejects arbitrary executable files.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
  extension?: string;
}

export const ALLOWED_AVATAR_MIMES = {
  'image/jpeg': ['ffd8ff'],
  'image/png': ['89504e47'],
  'image/webp': ['52494646'], // 'RIFF' header
};

export const MAX_AVATAR_SIZE_BYTES = 3 * 1024 * 1024; // 3 Megabytes

/**
 * Validates file buffer by checking actual magic bytes rather than trusting client mime/extension.
 */
export function validateImageBuffer(buffer: Buffer, maxSizeBytes: number = MAX_AVATAR_SIZE_BYTES): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'O arquivo enviado está vazio.' };
  }

  if (buffer.length > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    return { valid: false, error: `O tamanho da imagem excede o limite máximo permitido de ${maxMb}MB.` };
  }

  const hexHead = buffer.subarray(0, 12).toString('hex').toLowerCase();

  // 1. JPEG: starts with ffd8ff
  if (hexHead.startsWith('ffd8ff')) {
    return { valid: true, detectedMime: 'image/jpeg', extension: 'jpg' };
  }

  // 2. PNG: starts with 89504e47
  if (hexHead.startsWith('89504e47')) {
    return { valid: true, detectedMime: 'image/png', extension: 'png' };
  }

  // 3. WebP: starts with 'RIFF' (52494646) and bytes 8..12 are 'WEBP' (57454250)
  if (hexHead.startsWith('52494646') && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { valid: true, detectedMime: 'image/webp', extension: 'webp' };
  }

  return {
    valid: false,
    error: 'Formato de imagem inválido ou não suportado. Envie apenas JPG, PNG ou WEBP válidos.',
  };
}

/**
 * Saves validated avatar image for a user.
 * Generates an unguessable unique filename in persistent data/avatars/.
 */
export function saveUserAvatar(userId: string, buffer: Buffer, extension: string): string {
  const uploadDir = path.join(process.cwd(), 'data', 'avatars');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Unguessable cryptographic filename: hash(userId + randomBytes)
  const safeHash = crypto.createHash('sha256').update(`${userId}-${crypto.randomBytes(16).toString('hex')}`).digest('hex').slice(0, 24);
  const filename = `${safeHash}.${extension}`;
  const filePath = path.join(uploadDir, filename);

  fs.writeFileSync(filePath, buffer);
  return `/avatars/${filename}`;
}

export interface DecodedAvatarData {
  mimeType: string;
  buffer: Buffer;
  etag: string;
}

/**
 * Decodifica data URL de avatar validando magic bytes antes de servir bytes binários.
 */
export function decodeAvatarDataUrl(rawUrl: string | null | undefined): DecodedAvatarData | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const match = rawUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  } catch {
    return null;
  }

  const validation = validateImageBuffer(buffer);
  if (!validation.valid || !validation.detectedMime) return null;

  const etag = `"${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16)}"`;
  return {
    mimeType: validation.detectedMime,
    buffer,
    etag,
  };
}

/**
 * Converte data:image/... pesado do banco em URL curta cacheável no endpoint autenticado.
 */
export function toPublicAvatarUrl(userId: string, rawAvatarUrl: string | null | undefined): string | null {
  if (!rawAvatarUrl || typeof rawAvatarUrl !== 'string') return null;
  if (!rawAvatarUrl.startsWith('data:image/')) return rawAvatarUrl;
  const version = crypto.createHash('sha256').update(rawAvatarUrl).digest('hex').slice(0, 10);
  return `/api/user/avatar/${encodeURIComponent(userId)}?v=${version}`;
}
