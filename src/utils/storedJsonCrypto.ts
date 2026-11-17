import crypto from 'node:crypto';

const derivedDataKeyCache = new Map<string, Buffer>();

function getCandidateSecrets(): string[] {
  const candidates: string[] = [];
  const pushUnique = (val?: string) => {
    const trimmed = val?.trim();
    if (trimmed && !candidates.includes(trimmed)) {
      candidates.push(trimmed);
    }
  };

  pushUnique(process.env.DATA_ENCRYPTION_KEY);
  pushUnique(process.env.SESSION_SECRET);

  const previous = process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  if (previous) {
    for (const item of previous.split(',')) {
      pushUnique(item);
    }
  }

  if (candidates.length === 0) {
    throw new Error('DATA_ENCRYPTION_KEY ou SESSION_SECRET e obrigatoria para persistir segredos');
  }
  return candidates;
}

function deriveKeyLegacy(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function deriveKeyV2(secret: string): Buffer {
  let key = derivedDataKeyCache.get(secret);
  if (!key) {
    key = crypto.scryptSync(secret, 'cfo-data-enc-v1', 32, { N: 16384, r: 8, p: 1 });
    if (derivedDataKeyCache.size >= 8) {
      derivedDataKeyCache.clear();
    }
    derivedDataKeyCache.set(secret, key);
  }
  return Buffer.from(key);
}

export function encryptStoredJson(value: unknown): string {
  const [primarySecret] = getCandidateSecrets();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKeyV2(primarySecret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 2,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function decryptStoredJson<T>(raw: string): { value: T; legacy: boolean } {
  const parsed = JSON.parse(raw);
  const version = parsed?.version;
  if (version !== 1 && version !== 2) {
    return { value: parsed as T, legacy: true };
  }

  if (typeof parsed.iv !== 'string' || typeof parsed.tag !== 'string' || typeof parsed.data !== 'string') {
    throw new Error('Payload criptografado inválido: campos iv, tag ou data ausentes.');
  }

  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const data = Buffer.from(parsed.data, 'base64');

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Payload criptografado inválido: tamanho de IV ou auth tag incompatível com AES-256-GCM.');
  }

  const secrets = getCandidateSecrets();
  let lastError: unknown = null;

  for (let i = 0; i < secrets.length; i++) {
    const key = version === 1 ? deriveKeyLegacy(secrets[i]) : deriveKeyV2(secrets[i]);
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const clear = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
      return { value: JSON.parse(clear) as T, legacy: version === 1 || i > 0 };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('STORED_JSON_AUTH_FAILED');
}
