/**
 * CFO CBMERJ - Armazenamento Persistente de PDFs do Banco de Provas
 * Integração Soberana com Cloudflare R2 / S3 e Cache Local em Vault
 * Garante sobrevivência de arquivos a novos deploys e reinicializações de containers
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { getConfig, MediaStorageNotConfiguredError } from '../anki/ankiMediaStorage';

const localVaultDir = path.join(process.cwd(), 'data', 'vault');

function hmac(key: Buffer | string, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value).digest();
}

/**
 * Tenta comprimir o buffer do PDF usando Gzip no nível máximo (9).
 * Se o buffer comprimido for comprovadamente menor que o original, retorna o comprimido.
 * Caso contrário (ex: PDF que já possui compressão interna pesada), mantém o original.
 */
export function compressPdfBuffer(buffer: Buffer): { buffer: Buffer; isCompressed: boolean; savingsBytes: number } {
  try {
    const compressed = zlib.gzipSync(buffer, { level: 9 });
    if (compressed.length < buffer.length) {
      return {
        buffer: compressed,
        isCompressed: true,
        savingsBytes: buffer.length - compressed.length,
      };
    }
  } catch (err) {
    console.warn('[Exam Storage] Falha na compressão do PDF, mantendo original:', err);
  }
  return { buffer, isCompressed: false, savingsBytes: 0 };
}

/**
 * Detecta se o buffer está comprimido em Gzip (magic bytes 0x1f 0x8b)
 * e o descomprime em tempo real. Se já for o PDF descompactado (%PDF-),
 * retorna intacto com 100% de compatibilidade retroativa.
 */
export function decompressPdfBuffer(buffer: Buffer): Buffer {
  if (buffer && buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return zlib.gunzipSync(buffer);
    } catch (err) {
      console.warn('[Exam Storage] Falha ao descompactar buffer Gzip, retornando buffer bruto:', err);
    }
  }
  return buffer;
}

/**
 * Executa requisição assinada via AWS Signature V4 para o Cloudflare R2
 */
async function requestExamR2Object(
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
  key: string,
  body?: Buffer,
  contentType?: string,
  contentEncoding?: string
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
  if (contentEncoding && method === 'PUT') {
    headers['content-encoding'] = contentEncoding;
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
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
    return response;
  } catch (err: any) {
    console.error(`[Exam R2 Storage] Erro de rede na requisição ${method} "${normalizedKey}": ${err?.message || err}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Falha de conexão com Cloudflare R2: ${err?.message || 'erro de rede'}`);
    }
    return null;
  }
}

/**
 * Constrói a chave lógica isolada por aluno no Cloudflare R2
 */
export function getExamR2StorageKey(userId: string, fileId: string): string {
  const cleanUser = (userId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanFile = (fileId || 'document').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `exams/${cleanUser}/${cleanFile}.pdf`;
}

/**
 * Salva o PDF da prova com compressão transparente no Cloudflare R2 e em cache local
 */
export async function putExamPdf(
  userId: string,
  fileId: string,
  buffer: Buffer
): Promise<{ isCompressed: boolean; savingsBytes: number; storedBytes: number }> {
  const storageKey = getExamR2StorageKey(userId, fileId);

  // Comprime o buffer se houver economia real de espaço
  const { buffer: storedBuffer, isCompressed, savingsBytes } = compressPdfBuffer(buffer);

  // 1. Grava no cache local em disco (para leituras ultra-rápidas)
  try {
    if (!fs.existsSync(localVaultDir)) {
      fs.mkdirSync(localVaultDir, { recursive: true });
    }
    const localFilePath = path.join(localVaultDir, `${fileId}.pdf`);
    fs.writeFileSync(localFilePath, storedBuffer);
  } catch (err) {
    console.warn('[Exam Storage] Falha ao gravar cache local do PDF:', err);
  }

  // 2. Persiste no Cloudflare R2
  const r2Response = await requestExamR2Object(
    'PUT',
    storageKey,
    storedBuffer,
    'application/pdf',
    isCompressed ? 'gzip' : undefined
  );
  if (r2Response) {
    if (!r2Response.ok) {
      const errText = await r2Response.text().catch(() => '');
      throw new Error(`R2_EXAM_UPLOAD_FAILED: ${r2Response.status} ${errText}`);
    }
  }

  return { isCompressed, savingsBytes, storedBytes: storedBuffer.length };
}

/**
 * Recupera o PDF da prova:
 * 1. Primeiro verifica o cache local em disco.
 * 2. Se não estiver no disco local (ex: após novo deploy ou reinicialização de container),
 *    busca no Cloudflare R2 e restaura o cache local.
 * 3. Descomprime automaticamente em memória antes de entregar ao leitor.
 */
export async function getExamPdf(userId: string, fileId: string): Promise<Buffer | null> {
  const localFilePath = path.join(localVaultDir, `${fileId}.pdf`);

  // 1. Tenta recuperar do cache local em disco
  if (fs.existsSync(localFilePath)) {
    try {
      const localBuf = fs.readFileSync(localFilePath);
      if (localBuf && localBuf.length > 0) {
        return decompressPdfBuffer(localBuf);
      }
    } catch {}
  }

  // 2. Não encontrado localmente (cenário pós-deploy com disco efêmero) -> Busca no Cloudflare R2
  const storageKey = getExamR2StorageKey(userId, fileId);
  const r2Response = await requestExamR2Object('GET', storageKey);

  if (r2Response) {
    if (r2Response.status === 404) return null;
    if (!r2Response.ok) {
      throw new Error(`R2_EXAM_FETCH_FAILED: ${r2Response.status}`);
    }

    const arrayBuffer = await r2Response.arrayBuffer();
    const storedBuffer = Buffer.from(arrayBuffer);

    // Restaura o arquivo no cache local para que as próximas leituras sejam instantâneas
    try {
      if (!fs.existsSync(localVaultDir)) {
        fs.mkdirSync(localVaultDir, { recursive: true });
      }
      fs.writeFileSync(localFilePath, storedBuffer);
    } catch (cacheErr) {
      console.warn('[Exam Storage] Falha ao recriar cache local após busca no R2:', cacheErr);
    }

    // Descomprime se foi armazenado comprimido
    return decompressPdfBuffer(storedBuffer);
  }

  return null;
}

/**
 * Remove o PDF da prova do Cloudflare R2 e purga o cache local
 */
export async function deleteExamPdf(userId: string, fileId: string): Promise<void> {
  const storageKey = getExamR2StorageKey(userId, fileId);

  // 1. Remove do Cloudflare R2
  try {
    await requestExamR2Object('DELETE', storageKey);
  } catch (err) {
    console.warn('[Exam Storage] Falha ao remover PDF do R2:', err);
  }

  // 2. Purga do cache local
  const localFilePath = path.join(localVaultDir, `${fileId}.pdf`);
  if (fs.existsSync(localFilePath)) {
    try {
      fs.unlinkSync(localFilePath);
    } catch {}
  }
}
