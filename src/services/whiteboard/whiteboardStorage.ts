import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateR2Environment, getConfig, MediaStorageNotConfiguredError } from '../anki/ankiMediaStorage';

export interface ValidatedImage {
  buffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  extension: 'png' | 'jpg' | 'webp' | 'gif';
  size: number;
}

export function validateWhiteboardImageBuffer(buffer: Buffer): ValidatedImage {
  if (!buffer || buffer.length === 0) {
    throw new Error('EMPTY_IMAGE_BUFFER');
  }

  // Máximo de 10MB por imagem de questão
  const MAX_SIZE = 10 * 1024 * 1024;
  if (buffer.length > MAX_SIZE) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  // Validação de Magic Bytes rigorosa
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { buffer, mimeType: 'image/png', extension: 'png', size: buffer.length };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { buffer, mimeType: 'image/jpeg', extension: 'jpg', size: buffer.length };
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { buffer, mimeType: 'image/webp', extension: 'webp', size: buffer.length };
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
    buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return { buffer, mimeType: 'image/gif', extension: 'gif', size: buffer.length };
  }

  throw new Error('INVALID_IMAGE_MAGIC_BYTES');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

async function requestR2Object(
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
  key: string,
  body?: Buffer,
  contentType?: string
): Promise<Response | null> {
  const config = getConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') {
      throw new MediaStorageNotConfiguredError(
        'Armazenamento persistente no Cloudflare R2 obrigatório em produção.'
      );
    }
    return null;
  }

  const date = new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const normalizedKey = key.replace(/^\/+/, '');
  const canonicalUri = '/' + config.bucket + '/' + normalizedKey.split('/').map(encodeURIComponent).join('/');
  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const headers: Record<string, string> = {
    host: config.endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType && method === 'PUT') {
    headers['content-type'] = contentType;
  }

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

  const kDate = hmac(`AWS4${config.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${config.endpoint.origin}${canonicalUri}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });

  return response;
}

const localFallbackDir = path.join(process.cwd(), 'data', 'whiteboard_media');

export async function putWhiteboardMedia(
  storageKey: string,
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const r2Response = await requestR2Object('PUT', storageKey, buffer, contentType);
  if (r2Response) {
    if (!r2Response.ok) {
      const errText = await r2Response.text().catch(() => '');
      throw new Error(`R2_UPLOAD_FAILED: ${r2Response.status} ${errText}`);
    }
    return;
  }

  // Fallback local: APENAS em desenvolvimento ou testes
  if (process.env.NODE_ENV === 'production') {
    throw new MediaStorageNotConfiguredError('Cloudflare R2 storage is mandatory in production');
  }

  const filePath = path.join(localFallbackDir, storageKey);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

export async function getWhiteboardMedia(storageKey: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const r2Response = await requestR2Object('GET', storageKey);
  if (r2Response) {
    if (r2Response.status === 404) return null;
    if (!r2Response.ok) {
      throw new Error(`R2_FETCH_FAILED: ${r2Response.status}`);
    }
    const arrayBuffer = await r2Response.arrayBuffer();
    const contentType = r2Response.headers.get('content-type') || 'application/octet-stream';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  // Fallback local: APENAS em desenvolvimento ou testes
  const filePath = path.join(localFallbackDir, storageKey);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(storageKey).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    return {
      buffer: fs.readFileSync(filePath),
      contentType: mimeMap[ext] || 'application/octet-stream',
    };
  }
  return null;
}

export async function deleteWhiteboardMedia(storageKey: string): Promise<void> {
  const r2Response = await requestR2Object('DELETE', storageKey);
  if (r2Response) {
    return;
  }

  // Fallback local
  const filePath = path.join(localFallbackDir, storageKey);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
}
