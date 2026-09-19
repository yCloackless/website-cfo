/**
 * CFO CBMERJ - Secure Upload & Antimalware Quarantine Pipeline
 * Multi-layer Defense-in-Depth for untrusted files:
 * 1. Strict Allowlist (PDF, PNG, JPG/JPEG, WEBP)
 * 2. Magic Bytes & MIME Consistency Verification
 * 3. File Sanitization & Extension Neutralization
 * 4. Quarantined Storage with Cryptographic UUID Naming (Outside webroot)
 * 5. Antivirus / Antimalware Scan (ClamAV daemon / Socket / Heuristic Signature Engine)
 * 6. Structural & Resource Bomb Protection (PDF JS/Embedded objects, Max Image Dimensions)
 * 7. Secure Private Vault & Server-Side Ownership Enforcement
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { UploadScanStatus, DbUploadedFile } from '../db/schema';
import { UploadedFileRepository, AuditRepository } from '../db/repositories';

export interface UploadLimitsConfig {
  maxSizeBytes: number;
  maxImageWidth: number;
  maxImageHeight: number;
  maxPdfPages: number;
  quarantineDir: string;
  vaultDir: string;
}

export const DEFAULT_UPLOAD_LIMITS: UploadLimitsConfig = {
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  maxImageWidth: 4096,
  maxImageHeight: 4096,
  maxPdfPages: 200,
  quarantineDir: path.join(process.cwd(), 'data', 'quarantine'),
  vaultDir: path.join(process.cwd(), 'data', 'vault'),
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
  canonicalExtension?: string;
  details?: Record<string, any>;
}

export interface MalwareScanResult {
  isClean: boolean;
  scanner: string;
  threatName?: string;
  details?: Record<string, any>;
}

export interface ProcessedUploadResult {
  success: boolean;
  file?: DbUploadedFile;
  error?: string;
  status: UploadScanStatus;
  details?: Record<string, any>;
}

// Assinaturas de Magic Bytes Estritas (Allowlist)
const MAGIC_SIGNATURES: Array<{
  mime: string;
  canonicalExt: string;
  validate: (buffer: Buffer) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    canonicalExt: 'jpg',
    validate: (buf: Buffer) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mime: 'image/png',
    canonicalExt: 'png',
    validate: (buf: Buffer) => {
      if (buf.length < 8) return false;
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      return buf.subarray(0, 8).equals(pngHeader);
    },
  },
  {
    mime: 'image/webp',
    canonicalExt: 'webp',
    validate: (buf: Buffer) => {
      if (buf.length < 12) return false;
      const isRiff = buf.subarray(0, 4).toString('ascii') === 'RIFF';
      const isWebp = buf.subarray(8, 12).toString('ascii') === 'WEBP';
      return isRiff && isWebp;
    },
  },
  {
    mime: 'application/pdf',
    canonicalExt: 'pdf',
    validate: (buf: Buffer) => {
      if (buf.length < 32) return false;
      // Header %PDF- nos primeiros 1024 bytes
      const searchHead = buf.subarray(0, Math.min(1024, buf.length)).toString('ascii');
      if (!searchHead.includes('%PDF-')) return false;
      // Tail %%EOF nos últimos 2048 bytes
      const searchTail = buf.subarray(Math.max(0, buf.length - 2048)).toString('ascii');
      return searchTail.includes('%%EOF');
    },
  },
];

// Padrões maliciosos conhecidos (EICAR, scripts perigosos, executáveis embutidos)
const MALICIOUS_PATTERNS: Array<{ name: string; pattern: RegExp | Buffer }> = [
  {
    name: 'EICAR_TEST_VIRUS',
    pattern: /X5O!P%@AP\[4\\PZX54\(P\^\)7CC\)7\}\$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!\$H\+H\*/i,
  },
  {
    name: 'PDF_EMBEDDED_JAVASCRIPT',
    pattern: /\/(JavaScript|JS|Launch|EmbeddedFiles)\s*(\/|<<|\[|<|\()/i,
  },
  {
    name: 'EMBEDDED_HTML_SCRIPT_TAG',
    pattern: /<\s*(script|iframe|object|embed|applet|html|form)[^>]*>/i,
  },
  {
    name: 'PHP_CODE_INJECTION',
    pattern: /<\?(php|=)/i,
  },
  {
    name: 'EXECUTABLE_WINDOWS_DOS_HEADER',
    pattern: Buffer.from([0x4d, 0x5a]), // 'MZ'
  },
  {
    name: 'EXECUTABLE_LINUX_ELF_HEADER',
    pattern: Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // '\x7fELF'
  },
];

export class SecureUploadService {
  private limits: UploadLimitsConfig;

  constructor(
    private fileRepo: UploadedFileRepository,
    private auditRepo?: AuditRepository,
    limits?: Partial<UploadLimitsConfig>
  ) {
    this.limits = { ...DEFAULT_UPLOAD_LIMITS, ...limits };
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!fs.existsSync(this.limits.quarantineDir)) {
      fs.mkdirSync(this.limits.quarantineDir, { recursive: true });
    }
    if (!fs.existsSync(this.limits.vaultDir)) {
      fs.mkdirSync(this.limits.vaultDir, { recursive: true });
    }
  }

  /**
   * Validação Estrita de Magic Bytes, MIME real, Extensão e Limites
   */
  public validateFileBuffer(
    buffer: Buffer,
    declaredFilename: string,
    declaredMime?: string
  ): FileValidationResult {
    if (!buffer || buffer.length === 0) {
      return { valid: false, error: 'O arquivo enviado está vazio.' };
    }

    if (buffer.length > this.limits.maxSizeBytes) {
      return {
        valid: false,
        error: `O arquivo excede o tamanho máximo permitido de ${this.limits.maxSizeBytes / (1024 * 1024)}MB.`,
      };
    }

    // 1. Sanitização do filename e checagem de extensões perigosas / duplas
    const rawFilename = (declaredFilename || '').trim();
    if (
      !rawFilename ||
      rawFilename.includes('\0') ||
      rawFilename.includes('..') ||
      rawFilename.includes('/') ||
      rawFilename.includes('\\')
    ) {
      return { valid: false, error: 'Nome de arquivo inválido ou tentativa de path traversal detectada.' };
    }

    const safeBaseName = path.basename(rawFilename);

    // Bloqueia expressamente extensões perigosas (dupla extensão: .pdf.exe, .png.php, etc.)
    const parts = safeBaseName.toLowerCase().split('.');
    const forbiddenExts = ['exe', 'bat', 'cmd', 'sh', 'php', 'phtml', 'py', 'pl', 'jsp', 'asp', 'aspx', 'cgi', 'js', 'vbs', 'html', 'htm', 'svg', 'zip', 'tar', 'gz', 'rar', '7z'];
    for (let i = 1; i < parts.length; i++) {
      if (forbiddenExts.includes(parts[i])) {
        return {
          valid: false,
          error: `Formato de arquivo ou extensão proibida detectada (.${parts[i]}).`,
        };
      }
    }

    const declaredExt = (parts.pop() || '').toLowerCase();

    // 2. Detecção Real de Magic Bytes via Allowlist
    let matchedSig: (typeof MAGIC_SIGNATURES)[0] | null = null;
    for (const sig of MAGIC_SIGNATURES) {
      if (sig.validate(buffer)) {
        matchedSig = sig;
        break;
      }
    }

    if (!matchedSig) {
      // Checa se é um executável disfarçado para log de segurança
      const isMz = buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a;
      const isElf = buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
      if (isMz || isElf) {
        return { valid: false, error: 'Executáveis e binários não autorizados são expressamente bloqueados.' };
      }
      return {
        valid: false,
        error: 'Formato de arquivo não suportado. Envie apenas PDF, PNG, JPG/JPEG ou WEBP válidos.',
      };
    }

    const normalizedDeclaredMime = declaredMime?.split(';', 1)[0].trim().toLowerCase();
    if (normalizedDeclaredMime && normalizedDeclaredMime !== 'application/octet-stream' && normalizedDeclaredMime !== matchedSig.mime) {
      return {
        valid: false,
        error: `Inconsistência de MIME: ${normalizedDeclaredMime} não corresponde ao conteúdo real (${matchedSig.mime}).`,
      };
    }

    // 3. Consistência Estrita entre Extensão Declarada e Conteúdo Real
    const validExtsForMime: Record<string, string[]> = {
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
      'application/pdf': ['pdf'],
    };

    const allowedExtensions = validExtsForMime[matchedSig.mime] || [];
    if (!allowedExtensions.includes(declaredExt)) {
      return {
        valid: false,
        error: `Inconsistência de formato: a extensão .${declaredExt} não corresponde ao conteúdo real (${matchedSig.canonicalExt.toUpperCase()}).`,
      };
    }

    // 4. Validação Estrutural e Limites Específicos do Tipo
    if (matchedSig.mime === 'image/png' || matchedSig.mime === 'image/jpeg' || matchedSig.mime === 'image/webp') {
      const imgDim = this.extractImageDimensions(buffer, matchedSig.mime);
      if (!imgDim || imgDim.width < 1 || imgDim.height < 1) {
        return { valid: false, error: 'Imagem corrompida ou sem dimensões válidas.' };
      }
      if (imgDim.width > this.limits.maxImageWidth || imgDim.height > this.limits.maxImageHeight) {
        return {
          valid: false,
          error: `Dimensões da imagem (${imgDim.width}x${imgDim.height}) excedem o limite de ${this.limits.maxImageWidth}x${this.limits.maxImageHeight}px.`,
        };
      }
    }

    return {
      valid: true,
      detectedMime: matchedSig.mime,
      canonicalExtension: matchedSig.canonicalExt,
    };
  }

  /**
   * Scanner Antimalware: ClamAV Daemon/Socket com Fallback em Engine Heurística
   */
  public async scanForMalware(buffer: Buffer): Promise<MalwareScanResult> {
    // 1. Scan via ClamAV Socket se configurado via CLAMAV_HOST / CLAMAV_PORT
    const clamHost = process.env.CLAMAV_HOST;
    const clamPort = process.env.CLAMAV_PORT ? parseInt(process.env.CLAMAV_PORT, 10) : 3310;

    if (clamHost) {
      try {
        const clamResult = await this.scanWithClamAvSocket(buffer, clamHost, clamPort);
        if (clamResult) return clamResult;
      } catch (err) {
        console.warn('[Antimalware] ClamAV socket offline ou indisponível, acionando engine de assinaturas heurísticas.');
      }
    }

    // 2. Engine Heurística de Assinaturas e Padrões de Alta Precisão
    for (const item of MALICIOUS_PATTERNS) {
      if (Buffer.isBuffer(item.pattern)) {
        if (buffer.subarray(0, item.pattern.length).equals(item.pattern)) {
          return {
            isClean: false,
            scanner: 'HeuristicSignatureEngine',
            threatName: item.name,
            details: { reason: `Signature match: ${item.name}` },
          };
        }
      } else if (item.pattern instanceof RegExp) {
        // Converte trechos seguros em string para inspecionar
        const sampleText = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('binary');
        if (item.pattern.test(sampleText)) {
          return {
            isClean: false,
            scanner: 'HeuristicSignatureEngine',
            threatName: item.name,
            details: { reason: `Pattern match: ${item.name}` },
          };
        }
      }
    }

    return {
      isClean: true,
      scanner: 'HeuristicSignatureEngine',
      details: { verifiedAt: new Date().toISOString() },
    };
  }

  /**
   * Pipeline Completo de Upload, Quarentena, Antivírus e Liberação para Vault
   */
  public async processUpload(options: {
    userId: string;
    buffer: Buffer;
    originalName: string;
    declaredMime?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<ProcessedUploadResult> {
    const { userId, buffer, originalName, declaredMime, ip, userAgent } = options;
    const fileId = crypto.randomUUID();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // [FASE 1 & 2] Validação de Tamanho, Magic Bytes e Tipos
    const validation = this.validateFileBuffer(buffer, originalName, declaredMime);
    if (validation.valid && validation.detectedMime === 'application/pdf') {
      validation.error = await this.validatePdfPageLimit(buffer);
      validation.valid = !validation.error;
    }
    if (!validation.valid || !validation.canonicalExtension || !validation.detectedMime) {
      if (this.auditRepo) {
        this.auditRepo.log({
          action: 'UPLOAD_REJECTED',
          actor: userId,
          actorUserId: userId,
          resource: `/uploads/${fileId}`,
          status: 'WARNING',
          ip,
          userAgent,
          details: { error: validation.error, originalFilename: originalName },
        });
      }
      return {
        success: false,
        status: 'REJECTED',
        error: validation.error || 'Arquivo rejeitado pela política de segurança.',
      };
    }

    const ext = validation.canonicalExtension;
    const mime = validation.detectedMime;

    // [FASE 3] Quarentena com nome criptográfico seguro fora da webroot
    const quarantineFilename = `${fileId}.${ext}`;
    const quarantinePath = path.join(this.limits.quarantineDir, quarantineFilename);

    // Grava inicialmente em Quarentena
    fs.writeFileSync(quarantinePath, buffer, { mode: 0o600 });

    const fileRecord = this.fileRepo.create({
      id: fileId,
      userId,
      originalFilename: path.basename(originalName),
      storagePath: quarantinePath,
      mimeType: mime,
      extension: ext,
      sizeBytes: buffer.length,
      sha256,
      status: 'QUARANTINED',
    });

    // [FASE 4] Antivírus / Scan Antimalware
    this.fileRepo.updateStatus(fileId, 'SCANNING');

    const scanResult = await this.scanForMalware(buffer);
    if (!scanResult.isClean) {
      // Rejeita e mantém em quarentena isolada
      this.fileRepo.updateStatus(fileId, 'REJECTED', {
        threatName: scanResult.threatName,
        scanner: scanResult.scanner,
        rejectedAt: new Date().toISOString(),
      });

      if (this.auditRepo) {
        this.auditRepo.log({
          action: 'MALWARE_DETECTED',
          actor: userId,
          actorUserId: userId,
          resource: `/uploads/${fileId}`,
          status: 'FAILED',
          ip,
          userAgent,
          details: {
            threatName: scanResult.threatName,
            scanner: scanResult.scanner,
            sha256,
          },
        });
      }

      return {
        success: false,
        status: 'REJECTED',
        error: 'Arquivo bloqueado: ameaça de segurança ou conteúdo malicioso detectado pelo scanner.',
        details: { threatName: scanResult.threatName },
      };
    }

    // [FASE 5] Mover do Quarantine para o Vault Privado Seguro
    const vaultFilename = `${fileId}.${ext}`;
    const vaultPath = path.join(this.limits.vaultDir, vaultFilename);

    try {
      fs.renameSync(quarantinePath, vaultPath);
    } catch {
      fs.copyFileSync(quarantinePath, vaultPath);
      fs.unlinkSync(quarantinePath);
    }

    // [FASE 6] Atualizar para READY
    const readyFile = this.fileRepo.updateStatus(
      fileId,
      'READY',
      {
        scanner: scanResult.scanner,
        scanStatus: 'CLEAN',
        scannedAt: new Date().toISOString(),
      },
      vaultPath
    );

    if (this.auditRepo) {
      this.auditRepo.log({
        action: 'UPLOAD_SUCCESS',
        actor: userId,
        actorUserId: userId,
        resource: `/uploads/${fileId}`,
        status: 'SUCCESS',
        ip,
        userAgent,
        details: { mime, sizeBytes: buffer.length, sha256 },
      });
    }

    return {
      success: true,
      status: 'READY',
      file: readyFile || undefined,
    };
  }

  /**
   * Obter arquivo com verificação de autorização e integridade
   */
  public getAuthorizedFile(
    fileId: string,
    requestingUserId: string,
    isAdmin: boolean = false
  ): { authorized: boolean; file?: DbUploadedFile; error?: string; buffer?: Buffer } {
    const file = this.fileRepo.findById(fileId);
    if (!file) {
      return { authorized: false, error: 'Arquivo não encontrado.' };
    }

    // Verificação Estrita de Ownership
    if (!isAdmin && file.userId !== requestingUserId) {
      return { authorized: false, error: 'Acesso não autorizado a este arquivo.' };
    }

    // Apenas arquivos READY podem ser baixados
    if (file.status !== 'READY') {
      return { authorized: false, error: 'Arquivo ainda em processamento ou em quarentena.' };
    }

    if (!fs.existsSync(file.storagePath)) {
      return { authorized: false, error: 'Arquivo físico não encontrado no repositório seguro.' };
    }

    const buffer = fs.readFileSync(file.storagePath);
    return { authorized: true, file, buffer };
  }

  /**
   * Extração rápida de dimensões PNG / JPEG / WEBP sem bibliotecas nativas inseguras
   */
  private extractImageDimensions(
    buffer: Buffer,
    mime: string
  ): { width: number; height: number } | null {
    try {
      if (mime === 'image/png' && buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
      if (mime === 'image/jpeg' && buffer.length > 4) {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xff) break;
          const marker = buffer[offset + 1];
          // SOF markers: 0xC0 .. 0xC3, 0xC5 .. 0xC7, 0xC9 .. 0xCB, 0xCD .. 0xCF
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
          const length = buffer.readUInt16BE(offset + 2);
          offset += 2 + length;
        }
      }
      if (mime === 'image/webp' && buffer.length >= 30) {
        const chunk = buffer.subarray(12, 16).toString('ascii');
        if (chunk === 'VP8X') {
          return {
            width: 1 + buffer.readUIntLE(24, 3),
            height: 1 + buffer.readUIntLE(27, 3),
          };
        }
        if (chunk === 'VP8L' && buffer[20] === 0x2f) {
          return {
            width: 1 + (buffer[21] | ((buffer[22] & 0x3f) << 8)),
            height: 1 + ((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10)),
          };
        }
        if (chunk === 'VP8 ' && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
          return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff,
          };
        }
      }
    } catch {
      // Ignora falhas de parsing de dimensões
    }
    return null;
  }

  private async validatePdfPageLimit(buffer: Buffer): Promise<string | undefined> {
    try {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: false,
        stopAtErrors: true,
      });
      try {
        const document = await loadingTask.promise;
        return document.numPages > this.limits.maxPdfPages
          ? `O PDF excede o limite de ${this.limits.maxPdfPages} páginas.`
          : undefined;
      } finally {
        await loadingTask.destroy().catch(() => undefined);
      }
    } catch {
      return 'PDF corrompido ou estruturalmente inválido.';
    }
  }

  /**
   * Scanner com ClamAV via INSTREAM protocolo
   */
  private scanWithClamAvSocket(
    buffer: Buffer,
    host: string,
    port: number
  ): Promise<MalwareScanResult | null> {
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(4000);

      client.connect(port, host, () => {
        client.write('zINSTREAM\0');
        const chunkSize = 2048;
        for (let i = 0; i < buffer.length; i += chunkSize) {
          const chunk = buffer.subarray(i, i + chunkSize);
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32BE(chunk.length, 0);
          client.write(sizeBuf);
          client.write(chunk);
        }
        client.write(Buffer.from([0, 0, 0, 0]));
      });

      let response = '';
      client.on('data', (data) => {
        response += data.toString('utf-8');
      });

      client.on('end', () => {
        client.destroy();
        if (response.includes('OK')) {
          resolve({ isClean: true, scanner: 'ClamAV' });
        } else if (response.includes('FOUND')) {
          const threat = response.replace(/^stream:\s*/, '').replace(/FOUND.*$/, '').trim();
          resolve({ isClean: false, scanner: 'ClamAV', threatName: threat });
        } else {
          resolve(null);
        }
      });

      client.on('error', () => {
        client.destroy();
        resolve(null);
      });

      client.on('timeout', () => {
        client.destroy();
        resolve(null);
      });
    });
  }
}

import { getDb } from '../db/database';

let _secureUploadService: SecureUploadService | null = null;
export function getSecureUploadService(): SecureUploadService {
  if (!_secureUploadService) {
    const rawDb = getDb().getRawDb();
    const fileRepo = new UploadedFileRepository(rawDb);
    const auditRepo = new AuditRepository(rawDb);
    _secureUploadService = new SecureUploadService(fileRepo, auditRepo);
  }
  return _secureUploadService;
}

export const secureUploadService = {
  processUpload: (params: Parameters<SecureUploadService['processUpload']>[0]) =>
    getSecureUploadService().processUpload(params),
  validateFileBuffer: (
    buffer: Buffer,
    declaredFilename: string,
    declaredMime?: string
  ) => getSecureUploadService().validateFileBuffer(buffer, declaredFilename, declaredMime),
  scanForMalware: (buffer: Buffer) =>
    getSecureUploadService().scanForMalware(buffer),
  getAuthorizedFile: (fileId: string, requestingUserId: string, isAdmin?: boolean) =>
    getSecureUploadService().getAuthorizedFile(fileId, requestingUserId, isAdmin),
};
