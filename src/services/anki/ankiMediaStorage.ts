import crypto from 'node:crypto';

type StorageConfig = {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region: string;
};

export class MediaStorageNotConfiguredError extends Error {
  constructor() {
    super('Persistent Anki media storage is not configured.');
    this.name = 'MediaStorageNotConfiguredError';
  }
}

function getConfig(): StorageConfig | null {
  const { BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY } = process.env;
  if (!BACKUP_S3_ENDPOINT || !BACKUP_S3_BUCKET || !BACKUP_S3_ACCESS_KEY || !BACKUP_S3_SECRET_KEY) return null;
  const endpoint = new URL(BACKUP_S3_ENDPOINT);
  if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') throw new MediaStorageNotConfiguredError();
  return {
    endpoint,
    bucket: BACKUP_S3_BUCKET,
    accessKey: BACKUP_S3_ACCESS_KEY,
    secretKey: BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION || 'auto',
  };
}

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

async function requestObject(method: 'GET' | 'PUT', key: string, body?: Buffer): Promise<Response | null> {
  const config = getConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') throw new MediaStorageNotConfiguredError();
    return null;
  }

  const url = new URL(config.endpoint);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(config.bucket)}/${key}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const headers: Record<string, string> = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (method === 'PUT') headers['content-type'] = 'application/octet-stream';

  const canonicalHeaders = Object.entries({ ...headers, host: url.host }).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value.trim()}\n`).join('');
  const signedHeaders = Object.keys({ ...headers, host: url.host }).sort().join(';');
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const dateKey = hmac(`AWS4${config.secretKey}`, date);
  const regionKey = hmac(dateKey, config.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign).toString('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(url, { method, headers, body: body as BodyInit | undefined });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) throw new Error(`Persistent media storage returned HTTP ${response.status}.`);
  return response;
}

export async function putAnkiMedia(key: string, body: Buffer): Promise<boolean> {
  const response = await requestObject('PUT', key, body);
  return response !== null;
}

export async function getAnkiMedia(key: string): Promise<Buffer | null> {
  const response = await requestObject('GET', key);
  return response ? Buffer.from(await response.arrayBuffer()) : null;
}

export function persistentMediaStorageConfigured(): boolean {
  return Boolean(getConfig());
}
