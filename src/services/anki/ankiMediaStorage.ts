import crypto from 'node:crypto';

export type StorageConfig = {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

export interface R2EnvironmentValidation {
  configured: boolean;
  valid: boolean;
  missing: string[];
  bucket?: string;
  endpointHost?: string;
  region: string;
}

export class MediaStorageNotConfiguredError extends Error {
  constructor(message = 'Persistent Anki media storage (Cloudflare R2) is not configured.') {
    super(message);
    this.name = 'MediaStorageNotConfiguredError';
  }
}

export function validateR2Environment(): R2EnvironmentValidation {
  const missing: string[] = [];
  const {
    BACKUP_S3_ENDPOINT,
    BACKUP_S3_BUCKET,
    BACKUP_S3_ACCESS_KEY,
    BACKUP_S3_SECRET_KEY,
  } = process.env;

  if (!BACKUP_S3_ENDPOINT || !BACKUP_S3_ENDPOINT.trim()) missing.push('BACKUP_S3_ENDPOINT');
  if (!BACKUP_S3_BUCKET || !BACKUP_S3_BUCKET.trim()) missing.push('BACKUP_S3_BUCKET');
  if (!BACKUP_S3_ACCESS_KEY || !BACKUP_S3_ACCESS_KEY.trim()) missing.push('BACKUP_S3_ACCESS_KEY');
  if (!BACKUP_S3_SECRET_KEY || !BACKUP_S3_SECRET_KEY.trim()) missing.push('BACKUP_S3_SECRET_KEY');

  const region = (process.env.BACKUP_S3_REGION || 'auto').trim();
  const configured = missing.length < 4;
  const valid = missing.length === 0;

  let endpointHost: string | undefined;
  if (BACKUP_S3_ENDPOINT) {
    try {
      const u = new URL(BACKUP_S3_ENDPOINT);
      endpointHost = u.host;
    } catch {
      if (!missing.includes('BACKUP_S3_ENDPOINT')) {
        missing.push('BACKUP_S3_ENDPOINT (URL inválida)');
      }
    }
  }

  return {
    configured,
    valid: valid && Boolean(endpointHost),
    missing,
    bucket: BACKUP_S3_BUCKET ? BACKUP_S3_BUCKET.trim() : undefined,
    endpointHost,
    region,
  };
}

export function logR2StartupCheck(): void {
  const validation = validateR2Environment();
  if (validation.valid) {
    console.info(
      `[Storage] Cloudflare R2 configurado para persistência de mídias Anki (bucket: "${validation.bucket}", endpoint: "${validation.endpointHost}", região: "${validation.region}").`
    );
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[Storage] ATENÇÃO: Armazenamento persistente Cloudflare R2 incompleto no ambiente de produção. Variáveis ausentes: ${validation.missing.join(', ')}. As imagens de flashcard não persistirão após novos deploys até que sejam configuradas.`
    );
  } else {
    console.info(
      `[Storage] Cloudflare R2 não configurado localmente (${validation.missing.join(', ')} ausentes). Modo de desenvolvimento/teste ativo.`
    );
  }
}

export function getConfig(): StorageConfig | null {
  const validation = validateR2Environment();
  if (!validation.valid || !validation.bucket || !validation.endpointHost) {
    return null;
  }

  const endpoint = new URL(process.env.BACKUP_S3_ENDPOINT!.trim());
  if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') {
    throw new MediaStorageNotConfiguredError('O endpoint do Cloudflare R2 deve usar HTTPS em produção.');
  }

  return {
    endpoint,
    bucket: validation.bucket,
    accessKey: process.env.BACKUP_S3_ACCESS_KEY!.trim(),
    secretKey: process.env.BACKUP_S3_SECRET_KEY!.trim(),
    region: validation.region,
  };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

async function requestObject(
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
  key: string,
  body?: Buffer,
  contentType?: string
): Promise<Response | null> {
  const config = getConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') {
      throw new MediaStorageNotConfiguredError();
    }
    return null;
  }

  const cleanKey = key.replace(/^\/+/, '');
  const encodedKey = cleanKey.split('/').map(encodeURIComponent).join('/');
  const url = new URL(config.endpoint.href);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}/${encodeURIComponent(config.bucket)}/${encodedKey}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const headers: Record<string, string> = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  if (method === 'PUT') {
    headers['content-type'] = contentType || 'application/octet-stream';
  }

  const canonicalHeaders = Object.entries({ ...headers, host: url.host })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value.trim()}\n`)
    .join('');
  const signedHeaders = Object.keys({ ...headers, host: url.host }).sort().join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const dateKey = hmac(`AWS4${config.secretKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: body as BodyInit | undefined });
  } catch (err: any) {
    console.error(`[R2 Storage] Erro de rede na requisição ${method} "${cleanKey}": ${err?.message || err}`);
    throw new Error(`Falha de conexão com Cloudflare R2: ${err?.message || 'erro de rede'}`);
  }

  if (response.status === 404) {
    if (method === 'GET' || method === 'HEAD') {
      return null;
    }
    if (method === 'DELETE') {
      // Objeto já inexistente; exclusão é considerada cumprida de forma idempotente.
      return response;
    }
  }

  if (response.status === 401 || response.status === 403) {
    console.error(
      `[R2 Storage] Erro de permissão HTTP ${response.status} ao executar ${method} "${cleanKey}". Verifique BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY e permissões do bucket.`
    );
    throw new Error(`Permissão negada no Cloudflare R2 (HTTP ${response.status}). Verifique as credenciais.`);
  }

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = (await response.text()).slice(0, 300);
    } catch {}
    console.error(
      `[R2 Storage] Erro HTTP ${response.status} em ${method} "${cleanKey}": ${errBody}`
    );
    throw new Error(`Cloudflare R2 retornou HTTP ${response.status}.`);
  }

  return response;
}

export async function putAnkiMedia(key: string, body: Buffer, contentType?: string): Promise<boolean> {
  const response = await requestObject('PUT', key, body, contentType);
  return response !== null;
}

export async function getAnkiMedia(key: string): Promise<{ buffer: Buffer; contentType?: string } | null> {
  const response = await requestObject('GET', key);
  if (!response) return null;
  const rawContentType = response.headers.get('content-type');
  const contentType = rawContentType && rawContentType !== 'application/octet-stream' ? rawContentType : undefined;
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType,
  };
}

export async function deleteAnkiMedia(key: string): Promise<boolean> {
  const response = await requestObject('DELETE', key);
  return response !== null;
}

export function persistentMediaStorageConfigured(): boolean {
  return Boolean(getConfig());
}
