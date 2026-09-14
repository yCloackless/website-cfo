/**
 * Serviço Central da Camada de Decepção Defensiva (Honeypot & Honeytokens)
 * Rumo ao CFO - Engenharia de Segurança de Aplicação
 * 
 * Responsabilidades:
 * - Avaliação conservadora de risco e resposta progressiva
 * - Isolamento estrito de lógica de autenticação e produção
 * - Deduplicação em memória para proteção contra DoS / exaustão de logs
 * - Bypass seguro para varreduras de pentest autorizadas (ZAP, Strix, Nuclei)
 * - Geração de artefatos canário inofensivos e páginas decoy
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import {
  HoneypotEventType,
  HoneypotAction,
  RiskLevel,
  RiskEvaluationResult,
  DbDeceptionEvent,
  HoneypotMetrics,
} from './honeypotTypes';
import { detectHoneytoken, REGISTERED_HONEYTOKENS } from './honeytokens';
import { getDb } from '../../db/database';
import {
  HoneypotRepository,
  TemporarySourceBlockRepository,
  SecurityNotificationRepository,
  SessionRepository,
} from '../../db/repositories';
import { adminRealtimeHub } from '../realtimeHub';

// Cache em memória para deduplicação de eventos (evita inundação do banco por scanners)
interface DeduplicationEntry {
  count: number;
  firstSeen: number;
  lastSeen: number;
}
const deduplicationCache = new Map<string, DeduplicationEntry>();
const DEDUP_WINDOW_MS = 10_000; // 10 segundos por par (ip_hash + rota)

// Limpeza periódica da memória a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of deduplicationCache.entries()) {
    if (now - entry.lastSeen > 60_000) {
      deduplicationCache.delete(key);
    }
  }
}, 300_000).unref();

export class HoneypotService {
  private repo: HoneypotRepository;
  private blockRepo: TemporarySourceBlockRepository;
  private notifRepo: SecurityNotificationRepository;
  private sessionRepo: SessionRepository;

  constructor() {
    const rawDb = getDb().getRawDb();
    this.repo = new HoneypotRepository(rawDb);
    this.blockRepo = new TemporarySourceBlockRepository(rawDb);
    this.notifRepo = new SecurityNotificationRepository(rawDb);
    this.sessionRepo = new SessionRepository(rawDb);
  }

  /**
   * Gera um hash criptográfico anônimo para o IP (compatível com LGPD/Minimização)
   */
  public hashIp(ip: string): string {
    if (!ip) return 'unknown';
    const clean = ip.trim().replace(/^::ffff:/, '');
    const salt = process.env.SESSION_SECRET || 'cfo_deception_telemetry_salt_2026';
    return crypto.createHmac('sha256', salt).update(clean).digest('hex').slice(0, 32);
  }

  /**
   * Verifica se a requisição possui credenciais de pentest autorizado
   */
  public isAuthorizedPentest(req: Request, clientIp: string): boolean {
    const allowlistKey = process.env.SECURITY_TEST_ALLOWLIST_KEY;
    const bypassHeader = req.headers['x-security-scan-bypass'];

    if (allowlistKey && typeof bypassHeader === 'string' && bypassHeader.trim() === allowlistKey) {
      return true;
    }

    const scannerIps = (process.env.SECURITY_SCANNER_ALLOWLIST_IPS || '')
      .split(',')
      .map((s) => s.trim().replace(/^::ffff:/, ''))
      .filter(Boolean);

    const cleanIp = clientIp.trim().replace(/^::ffff:/, '');
    if (scannerIps.includes(cleanIp)) {
      return true;
    }

    return false;
  }

  /**
   * Avalia o risco da interação e define a ação progressiva defensiva
   */
  public evaluateRisk(
    eventType: HoneypotEventType,
    ipHash: string,
    hasActiveSession: boolean
  ): RiskEvaluationResult {
    let baseScore = 20;

    switch (eventType) {
      case 'HONEYPOT_ROUTE_ACCESSED':
        baseScore = 25;
        break;
      case 'DECOY_RESOURCE_ACCESSED':
        baseScore = 30;
        break;
      case 'HONEYPOT_LOGIN_ATTEMPT':
        baseScore = 70;
        break;
      case 'HONEYTOKEN_TRIGGERED':
        baseScore = 85;
        break;
      case 'AUTOMATED_ENUMERATION_SUSPECTED':
        baseScore = 90;
        break;
    }

    // Consulta histórico recente de eventos desse IP hash (últimos 5 minutos)
    const recentCount = this.repo.countRecentEventsByIpHash(ipHash, 300);

    // Se houver múltiplos eventos recentes, há forte evidência de escaneamento automatizado
    if (recentCount >= 2 && eventType !== 'AUTOMATED_ENUMERATION_SUSPECTED') {
      baseScore = Math.min(100, baseScore + 25);
    }

    let riskLevel: RiskLevel = 'low';
    if (baseScore >= 80) riskLevel = 'critical';
    else if (baseScore >= 60) riskLevel = 'high';
    else if (baseScore >= 40) riskLevel = 'medium';

    let action: HoneypotAction = 'LOGGED';
    let shouldBlockSource = false;
    let shouldInvalidateSession = false;
    let blockDurationHours = 1; // 1 hora por padrão; expira automaticamente

    if (baseScore >= 80) {
      action = 'SOURCE_TEMPORARILY_BLOCKED';
      shouldBlockSource = true;
      if (hasActiveSession) {
        shouldInvalidateSession = true;
      }
    } else if (baseScore >= 45) {
      action = 'THROTTLED';
    }

    return {
      riskScore: baseScore,
      riskLevel,
      action,
      shouldBlockSource,
      shouldInvalidateSession,
      blockDurationHours,
    };
  }

  /**
   * Processa e registra um evento da camada de decepção
   */
  public recordEvent(params: {
    req: Request;
    clientIp: string;
    eventType: HoneypotEventType;
    honeypotId: string;
    userId?: string | null;
    sessionId?: string | null;
  }): { event?: DbDeceptionEvent; actionTaken: HoneypotAction; isPentestBypass: boolean } {
    const { req, clientIp, eventType, honeypotId, userId, sessionId } = params;

    // 1. Checagem de pentest autorizado
    if (this.isAuthorizedPentest(req, clientIp)) {
      return { actionTaken: 'PENTEST_BYPASS', isPentestBypass: true };
    }

    const ipHash = this.hashIp(clientIp);
    const requestPath = req.originalUrl || req.path;
    const method = req.method;
    const userAgent = String(req.headers['user-agent'] || 'Unknown').slice(0, 150);

    // 2. Proteção contra DoS / Inundação de Telemetria (Deduplicação por IP, método, evento e rota)
    const dedupKey = `${ipHash}:${method}:${eventType}:${requestPath}`;
    const now = Date.now();
    const existing = deduplicationCache.get(dedupKey);

    if (process.env.NODE_ENV !== 'test' && existing && now - existing.lastSeen < DEDUP_WINDOW_MS) {
      existing.count++;
      existing.lastSeen = now;
      // Retorna throttled silencioso sem inserir novo registro no banco a cada hit
      return { actionTaken: 'THROTTLED', isPentestBypass: false };
    } else {
      deduplicationCache.set(dedupKey, { count: 1, firstSeen: now, lastSeen: now });
    }

    // 3. Avaliação de risco
    const risk = this.evaluateRisk(eventType, ipHash, Boolean(userId));

    // 4. Execução de respostas defensivas progressivas
    let finalAction = risk.action;

    // Se deve invalidar sessão (usuário cadastrado tentando acessar rota decoy/admin interna)
    if (risk.shouldInvalidateSession && sessionId) {
      try {
        this.sessionRepo.revokeSession(sessionId);
        finalAction = 'SESSION_INVALIDATED';
      } catch (err) {
        console.error('[Honeypot] Erro ao revogar sessão de usuário:', err);
      }
    }

    // Se deve aplicar bloqueio temporário por TTL
    if (risk.shouldBlockSource) {
      try {
        const isTestLocalhost = process.env.NODE_ENV === 'test' && (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost');
        if (!isTestLocalhost) {
          const reason = `Detecção defensiva de honeypot [${eventType}] na rota ${requestPath}`;
          this.blockRepo.blockIp(clientIp, reason, risk.blockDurationHours, userId);
        }

        // Notificação interna para administradores
        this.notifRepo.createNotification({
          userId: null,
          type: 'SYSTEM_ALERT',
          title: '🚨 Honeypot Acionado - Bloqueio Temporário Ativado',
          message: `Origem [${ipHash.slice(0, 8)}...] acionou o decoy "${requestPath}" (Risco: ${risk.riskScore}). Bloqueio temporário de ${risk.blockDurationHours}h aplicado.`,
          metadata: {
            eventType,
            honeypotId,
            requestPath,
            riskScore: risk.riskScore,
            ipHash,
            actionTaken: finalAction,
          },
        });

        // Alerta em tempo real no hub administrativo
        adminRealtimeHub.publish('SECURITY_ALERT', {
          action: 'HONEYPOT_TRIGGERED',
          eventType,
          requestPath,
          riskScore: risk.riskScore,
          ipHash,
          actionTaken: finalAction,
        });
      } catch (err) {
        console.error('[Honeypot] Erro ao aplicar bloqueio temporário:', err);
      }
    }

    // 5. Persistência isolada no banco
    const record = this.repo.createEvent({
      eventType,
      honeypotId,
      requestPath,
      method,
      riskScore: risk.riskScore,
      userId: userId || null,
      ipHash,
      userAgentSummary: userAgent,
      actionTaken: finalAction,
    });

    return { event: record, actionTaken: finalAction, isPentestBypass: false };
  }

  /**
   * Gera o conteúdo canário para arquivos decoy
   */
  public getCanaryContent(resource: string): { contentType: string; body: string | Buffer } {
    switch (resource) {
      case '/.env.backup':
        return {
          contentType: 'text/plain; charset=utf-8',
          body: [
            '# CFO-CBMERJ Sistema de Homologação / Backup de Ambiente',
            '# ARQUIVO DE CONFIGURAÇÃO INTERNO - CONFIDENCIAL',
            'APP_ENV=staging',
            'PORT=8080',
            'BACKUP_OPERATOR=cfo_canary_operator_sec',
            `INTERNAL_SYNC_TOKEN=${REGISTERED_HONEYTOKENS[0].tokenValue}`,
            `CFO_CANARY_INTEGRATION_KEY=${REGISTERED_HONEYTOKENS[2].tokenValue}`,
          ].join('\n'),
        };

      case '/config.old':
        return {
          contentType: 'application/x-yaml; charset=utf-8',
          body: [
            '# Legacy Infrastructure Configuration',
            'version: "2.4"',
            'services:',
            '  backup-agent:',
            `    service_account: "${REGISTERED_HONEYTOKENS[1].tokenValue}"`,
            '    retention_days: 14',
            '    sync_enabled: true',
          ].join('\n'),
        };

      case '/database.sql':
        return {
          contentType: 'application/sql; charset=utf-8',
          body: [
            '-- CFO CBMERJ Database Architecture Dump (Schema Structure Only)',
            '-- Host: internal-db-replica-01.local',
            `-- Auditor Token: ${REGISTERED_HONEYTOKENS[3].tokenValue}`,
            '-- Notice: production data is restricted and isolated.',
            '',
            'CREATE TABLE IF NOT EXISTS _system_meta (',
            '  meta_id VARCHAR(64) PRIMARY KEY,',
            '  status VARCHAR(32) NOT NULL',
            ');',
          ].join('\n'),
        };

      case '/admin-export.json':
        return {
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(
            {
              system: 'CFO-CBMERJ Admin Export Protocol',
              export_type: 'automated_diagnostic',
              canary_verifier: REGISTERED_HONEYTOKENS[2].tokenValue,
              records_count: 0,
              data: [],
            },
            null,
            2
          ),
        };

      case '/backup.zip':
        return {
          contentType: 'application/zip',
          body: this.generateSyntheticZip(),
        };

      default:
        return {
          contentType: 'text/plain',
          body: 'Not found',
        };
    }
  }

  /**
   * Constrói um arquivo ZIP binário sintético inofensivo em memória
   * contendo apenas um arquivo 'README.txt' com metadados canário.
   */
  private generateSyntheticZip(): Buffer {
    const filename = 'README.txt';
    const content = Buffer.from(
      `CFO-CBMERJ Backup Archive (Decoy)\nIdentifier: ${REGISTERED_HONEYTOKENS[4].tokenValue}\nSecurity audit verification canary.\n`
    );

    const fnLen = Buffer.byteLength(filename);
    const cLen = content.length;

    // Cabeçalho Local do Arquivo (30 bytes + fnLen + cLen)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Assinatura Local File Header
    localHeader.writeUInt16LE(20, 4);         // Versão necessária
    localHeader.writeUInt16LE(0, 6);          // Bit flag
    localHeader.writeUInt16LE(0, 8);          // Método de compressão (Store / sem compressão)
    localHeader.writeUInt16LE(0x4521, 10);    // Tempo
    localHeader.writeUInt16LE(0x5628, 12);    // Data
    const crc = this.crc32(content);
    localHeader.writeUInt32LE(crc, 14);       // CRC-32
    localHeader.writeUInt32LE(cLen, 18);      // Tamanho comprimido
    localHeader.writeUInt32LE(cLen, 22);      // Tamanho não comprimido
    localHeader.writeUInt16LE(fnLen, 26);     // Tamanho do nome do arquivo
    localHeader.writeUInt16LE(0, 28);         // Tamanho do campo extra

    // Central Directory Header (46 bytes + fnLen)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Assinatura Central Directory
    centralHeader.writeUInt16LE(20, 4);          // Versão criada
    centralHeader.writeUInt16LE(20, 6);          // Versão necessária
    centralHeader.writeUInt16LE(0, 8);           // Bit flag
    centralHeader.writeUInt16LE(0, 10);          // Método Store
    centralHeader.writeUInt16LE(0x4521, 12);     // Tempo
    centralHeader.writeUInt16LE(0x5628, 14);     // Data
    centralHeader.writeUInt32LE(crc, 16);        // CRC-32
    centralHeader.writeUInt32LE(cLen, 20);       // Comprimido
    centralHeader.writeUInt32LE(cLen, 24);       // Não comprimido
    centralHeader.writeUInt16LE(fnLen, 28);      // Nome do arquivo
    centralHeader.writeUInt16LE(0, 30);          // Campo extra
    centralHeader.writeUInt16LE(0, 32);          // Comentário
    centralHeader.writeUInt16LE(0, 34);          // Número do disco
    centralHeader.writeUInt16LE(0, 36);          // Atributos internos
    centralHeader.writeUInt32LE(0, 38);          // Atributos externos
    centralHeader.writeUInt32LE(0, 42);          // Offset do cabeçalho local

    // End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    const cdOffset = 30 + fnLen + cLen;
    const cdSize = 46 + fnLen;
    eocd.writeUInt32LE(0x06054b50, 0);   // Assinatura EOCD
    eocd.writeUInt16LE(0, 4);            // Número do disco
    eocd.writeUInt16LE(0, 6);            // Disco do diretório central
    eocd.writeUInt16LE(1, 8);            // Total de entradas neste disco
    eocd.writeUInt16LE(1, 10);           // Total de entradas no diretório central
    eocd.writeUInt32LE(cdSize, 12);      // Tamanho do diretório central
    eocd.writeUInt32LE(cdOffset, 16);    // Offset do diretório central
    eocd.writeUInt16LE(0, 20);           // Comentário zip

    return Buffer.concat([
      localHeader,
      Buffer.from(filename, 'utf8'),
      content,
      centralHeader,
      Buffer.from(filename, 'utf8'),
      eocd,
    ]);
  }

  /**
   * Cálculo simples de CRC-32 para o zip sintético
   */
  private crc32(buf: Buffer): number {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  private crcTable: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  /**
   * Gera a página HTML do login administrativo decoy e tela de aviso controlado
   */
  public renderDecoyLoginPage(options: {
    title?: string;
    path: string;
    triggeredScare?: boolean;
    controlledMessage?: string;
  }): string {
    const { title = 'Internal Administration Console', path, triggeredScare, controlledMessage } = options;

    if (triggeredScare) {
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Alert - Monitored Resource</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .card {
      background: #151d2f;
      border: 1px solid #dc2626;
      box-shadow: 0 0 25px rgba(220, 38, 38, 0.25);
      border-radius: 12px;
      max-width: 520px;
      width: 100%;
      padding: 2.5rem;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: rgba(220, 38, 38, 0.15);
      color: #f87171;
      border: 1px solid rgba(220, 38, 38, 0.4);
      padding: 0.4rem 1rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 0.75rem;
    }
    p {
      color: #94a3b8;
      font-size: 0.925rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .notice-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      font-size: 0.85rem;
      color: #cbd5e1;
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .back-btn {
      display: inline-block;
      background: #1e293b;
      color: #f1f5f9;
      text-decoration: none;
      padding: 0.75rem 1.75rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .back-btn:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">MONITORED SECURITY ENDPOINT</span>
    <h1>Recurso de Segurança Monitorado</h1>
    <p>${controlledMessage || 'Security monitoring triggered. This endpoint is a monitored defensive decoy.'}</p>
    <div class="notice-box">
      <strong>Aviso Defensivo:</strong><br>
      Este endpoint não possui vínculos operacionais com o sistema de produção.
      A interação foi catalogada de forma isolada para telemetria de segurança defensiva.
    </div>
    <a href="/" class="back-btn">Retornar à Página Principal</a>
  </div>
</body>
</html>`;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="robots" content="noindex, nofollow, noarchive">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b0f19;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .login-card {
      background: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 12px;
      max-width: 420px;
      width: 100%;
      padding: 2.25rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }
    .header {
      margin-bottom: 2rem;
      text-align: center;
    }
    .header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 0.25rem;
    }
    .header p {
      font-size: 0.8rem;
      color: #64748b;
    }
    .form-group {
      margin-bottom: 1.25rem;
      text-align: left;
    }
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 500;
      color: #94a3b8;
      margin-bottom: 0.4rem;
    }
    input {
      width: 100%;
      padding: 0.75rem 0.9rem;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #f8fafc;
      font-size: 0.9rem;
    }
    input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    button {
      width: 100%;
      padding: 0.8rem;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      margin-top: 0.5rem;
      transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    .footer-note {
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.725rem;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="header">
      <h2>${title}</h2>
      <p>Acesso restrito ao painel operacional interno</p>
    </div>
    <form method="POST" action="${path}">
      <div class="form-group">
        <label for="identifier">Identificador / E-mail</label>
        <input type="text" id="identifier" name="identifier" autocomplete="off" required>
      </div>
      <div class="form-group">
        <label for="password">Chave de Acesso</label>
        <input type="password" id="password" name="password" autocomplete="off" required>
      </div>
      <button type="submit">Autenticar Sessão</button>
    </form>
    <div class="footer-note">
      Sessão protegida por criptografia e monitoramento perimetral.
    </div>
  </div>
</body>
</html>`;
  }

  public getRepository(): HoneypotRepository {
    return this.repo;
  }
}

// Singleton export
let serviceInstance: HoneypotService | null = null;
export function getHoneypotService(): HoneypotService {
  if (!serviceInstance) {
    serviceInstance = new HoneypotService();
  }
  return serviceInstance;
}
