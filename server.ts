import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { isIP } from 'node:net';
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { generateSecret, verifySync, generateURI } from "otplib";
import QRCode from "qrcode";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV !== 'test') dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL_REQUIRED_IN_PRODUCTION');
}

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET e obrigatoria em producao; inicializacao abortada para evitar sessoes e arquivos irrecuperaveis.');
}

// ============================================================================
// 🛑 VALIDAÇÃO DE SEGURANÇA E SECRETS NO STARTUP
// ============================================================================
const recommendedVars: string[] = [];
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) recommendedVars.push('ADMIN_PASSWORD');
if (!process.env.CADET_PASSWORD_HASH && !process.env.CADET_PASSWORD) recommendedVars.push('CADET_PASSWORD');
if (!process.env.SESSION_SECRET) recommendedVars.push('SESSION_SECRET');
if (!process.env.TURNSTILE_SECRET_KEY) recommendedVars.push('TURNSTILE_SECRET_KEY');
if (!process.env.RESEND_API_KEY) recommendedVars.push('RESEND_API_KEY');
if (!process.env.EMAIL_FROM) recommendedVars.push('EMAIL_FROM');

if (recommendedVars.length > 0) {
  console.warn(`\n⚠️ [AVISO DE AMBIENTE] As seguintes variáveis recomendadas não foram detectadas no host: ${recommendedVars.join(', ')}`);
  console.warn('O servidor iniciará com fallbacks seguros e geradores criptográficos.');
  console.warn('Para máxima persistência no Render, configure-as na aba "Environment" do dashboard.\n');
}

import {
  getNotionConfig,
  fetchRevisoesFromNotion,
  updateCheckinInNotion,
  createStudyInNotion,
} from "./notionBackend";
import {
  createFullBackup,
  getBackupStatus,
  loadBackupIndex,
  verifyBackupIntegrity,
  restoreBackup,
  initBackupScheduler,
  stopBackupScheduler,
} from "./src/services/backupService";
import { logAuditEvent, readRecentAuditLogs } from "./src/services/auditLogger";
import { AuthService } from "./src/db/authService";
import { getDb } from "./src/db/database";
import {
  UserRepository,
  ProfileRepository,
  AuditRepository,
  SessionRepository,
  RecoveryCodeRepository,
  UserStateRepository,
  SecurityNotificationRepository,
  UploadedFileRepository,
  ExamPaperRepository,
  ExamQuestionRepository,
  ExamJobRepository,
  QuestionSegmentRepository,
  QuestionAssetRepository,
  SupportMaterialRepository,
  QuestionAuditRepository,
  StudySessionRepository,
  SystemIntegrationRepository,
  ConsentRepository,
  PrivacyRequestRepository,
  HoneypotRepository,
  TemporarySourceBlockRepository,
  FlashcardRepository,
} from "./src/db/repositories";
import { honeypotRouter, honeytokenDetectionMiddleware } from "./src/services/honeypot/honeypotRoutes";
import { UserRole, DbUser, DbExamPaper } from "./src/db/schema";
import { validateImageBuffer } from "./src/services/avatarService";
import { secureUploadService, SecureUploadService } from "./src/services/secureUploadService";
import { ExamService } from "./src/services/examService";
import { ExamJobWorker } from "./src/services/examJobWorker";
import { StudentLearningService } from "./src/services/studentLearningService";
import { getBoardIntelligenceService } from "./src/services/boardIntelligenceService";
import { adminRealtimeHub, AdminRealtimeEventType } from "./src/services/realtimeHub";
import { createAuthMiddlewares } from "./src/middleware/auth";
import { createRateLimitRedisStore, isRedisAvailable } from "./src/services/redisService";
import { telemetryService } from "./src/services/telemetryService";
import { StudentStudyRepository } from "./src/db/studentStudyRepository";
import { calculatePriorityScore, classifyPriority, weightedAverage } from "./src/services/studentStudyPriority";
import { createAnkiRouter } from "./src/routes/ankiRouter";
import { AnkiRepository } from "./src/db/ankiRepository";

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use((req: Request, res: Response, next: NextFunction) => {
  const supplied = req.headers['x-request-id'];
  const requestId = typeof supplied === 'string' && /^[a-zA-Z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-cfo_session' : 'cfo_session';
function readSessionCookie(req: Request): string | null {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}
function requestSessionToken(req: Request): string | null {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer && bearer !== 'cookie') return bearer;
  return readSessionCookie(req);
}
function setSessionCookie(res: Response, rawToken: string, expiresAt: number): void {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}
function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

// 1. Proxy reverso: suporte automático para Render e produção (1 hop confiável) ou TRUSTED_PROXIES
const isProxyEnvironment = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID);
const trustedProxyEntries = (process.env.TRUSTED_PROXIES || '')
  .split(',').map(value => value.trim()).filter(value => value && value !== '*' && value !== 'true');
app.set("trust proxy", trustedProxyEntries.length > 0 ? trustedProxyEntries : (isProxyEnvironment ? 1 : false));

const isProduction = process.env.NODE_ENV === 'production';

// Security headers must be registered before public operational/static routes.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProduction
          ? ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://challenges.cloudflare.com", "https://accounts.google.com"],
        styleSrc: ["'self'"],
        styleSrcElem: ["'self'"],
        // KaTeX, Motion and Recharts still require runtime style attributes.
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'", "https://challenges.cloudflare.com", "https://accounts.google.com"],
        connectSrc: isProduction
          ? [
              "'self'",
              "https://challenges.cloudflare.com",
              "https://*.googleapis.com",
              "https://generativelanguage.googleapis.com",
              "https://*.google.com",
            ]
          : [
              "'self'",
              "ws:",
              "wss:",
              "http://localhost:*",
              "http://127.0.0.1:*",
              "https://challenges.cloudflare.com",
              "https://*.googleapis.com",
              "https://generativelanguage.googleapis.com",
              "https://*.google.com",
            ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        reportTo: ["csp-violations"],
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: isProduction ? ({ policy: 'credentialless' } as any) : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: isProduction ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    } : false,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)');
  res.setHeader('Reporting-Endpoints', 'csp-violations="/api/csp-report"');
  next();
});

// Reject excess in-flight work before any route allocates expensive resources.
let activeRequests = 0;
const MAX_ACTIVE_REQUESTS = 200;
app.use((req: Request, res: Response, next: NextFunction) => {
  // Keep the platform liveness probe available even under application pressure.
  if (req.path === '/api/health') return next();
  if (activeRequests >= MAX_ACTIVE_REQUESTS) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({
      error: 'SERVICE_OVERLOADED',
      message: 'Servidor temporariamente sobrecarregado. Tente novamente em instantes.',
    });
  }

  activeRequests++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeRequests = Math.max(0, activeRequests - 1);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
});

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));

const operationalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  store: createRateLimitRedisStore('operational'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Muitas requisições ao endpoint operacional." },
});
app.use(['/api/health', '/api/ready', '/api/version'], operationalLimiter);

app.get("/sw.js", (_req: Request, res: Response) => {
  const swPath = path.join(process.cwd(), "public", "sw.js");
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  return res.sendFile(swPath);
});

app.get("/manifest.webmanifest", (_req: Request, res: Response) => {
  const manifestPath = path.join(process.cwd(), "public", "manifest.webmanifest");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  return res.sendFile(manifestPath);
});

// 2. Rota de Health Check operacional detalhada e ultraleve
app.get("/api/health", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  let dbReady = false;
  try {
    const check = getDb().getRawDb().prepare("SELECT 1 AS ok").get();
    dbReady = check?.ok === 1;
  } catch {
    dbReady = false;
  }

  return res.status(200).json({
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    service: "cfo-cbmerj-backend",
    version: "1.0.0",
    database: { connected: dbReady },
    redis: { connected: isRedisAvailable() },
    lockdown: getMaintenanceConfig().global,
    memory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
    },
    cpu: {
      userMs: Math.round(cpu.user / 1000),
      systemMs: Math.round(cpu.system / 1000),
    },
  });
});

app.get("/api/ready", (_req: Request, res: Response) => {
  try {
    const result = getDb().getRawDb().prepare('SELECT 1 AS ok').get();
    if (result?.ok !== 1) throw new Error('DATABASE_NOT_READY');
    return res.status(200).json({ status: 'ready' });
  } catch {
    return res.status(503).json({ status: 'not_ready' });
  }
});

// 3. Rota de versão e telemetria de deploy em tempo real (Zero-downtime client sync)
const SERVER_BOOT_TIME = Date.now();
const SERVER_BUILD_VERSION = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.npm_package_version || "1.0.0";

app.get("/api/version", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(200).json({
    version: SERVER_BUILD_VERSION,
    startedAt: SERVER_BOOT_TIME,
    timestamp: Date.now(),
  });
});

app.get('/oauth-callback.js', (_req: Request, res: Response) => {
  res.type('application/javascript').setHeader('Cache-Control', 'no-store');
  return res.send(`(function(){try{var el=document.getElementById('oauth-payload');if(!el)return;var data=JSON.parse(el.textContent||'{}');localStorage.setItem('cfo_calendar_status',JSON.stringify(data));localStorage.setItem('cfo_calendar_auth_success',JSON.stringify(data));if(window.opener&&data.targetOrigin)window.opener.postMessage(data,data.targetOrigin);if(typeof BroadcastChannel!=='undefined'){var channel=new BroadcastChannel('cfo_google_calendar_auth');channel.postMessage(data);channel.close();}}catch(_e){}setTimeout(function(){window.close();},250);}());`);
});

// ── CSP Violation Report Endpoint ────────────────────────────────────────────
// Recebe relatórios de violação de Content-Security-Policy enviados por navegadores
// via diretiva report-to. Não requer autenticação (navegador envia sem cookies).
// Rate limiting dedicado para evitar spam/flood neste endpoint.
const cspReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  store: createRateLimitRedisStore('csp_report'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "TOO_MANY_REQUESTS" });
  },
});

app.post('/api/csp-report', cspReportLimiter, (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';
  // Navegadores enviam application/csp-report ou application/reports+json
  if (!contentType.includes('csp-report') && !contentType.includes('reports+json') && !contentType.includes('json')) {
    return res.status(415).end();
  }
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > 50 * 1024) { req.destroy(); return; } // 50 KB máx
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const ip = getClientIp(req);
      const report = body?.['csp-report'] || body;
      logAuditEvent({
        eventType: 'CSP_VIOLATION',
        action: 'CSP_VIOLATION',
        ip,
        details: {
          blockedUri: report?.['blocked-uri'] ?? report?.blockedURL,
          violatedDirective: report?.['violated-directive'] ?? report?.effectiveDirective,
          documentUri: report?.['document-uri'] ?? report?.documentURL,
          disposition: report?.disposition,
        },
      });
      console.warn(`[CSP] Violação reportada por ${maskIpForClient(ip)}: ${report?.['violated-directive'] ?? report?.effectiveDirective} — ${report?.['blocked-uri'] ?? report?.blockedURL}`);
    } catch {
      // Relatório malformado; ignorar silenciosamente
    }
    res.status(204).end();
  });
  req.on('error', () => res.status(400).end());
});

// ============================================================================
// 🛑 GERENCIAMENTO DE IPs BANIDOS & LISTA NEGRA PERMANENTE
// ============================================================================
const BANNED_IPS_FILE = path.join(process.cwd(), "data", "banned-ips.json");

interface BannedIpRecord {
  ip: string;
  reason: string;
  bannedAt: string;
  geo?: { country?: string; region?: string };
}

function loadBannedIps(): Record<string, BannedIpRecord> {
  try {
    // Migração de compatibilidade se existia na raiz
    const legacyPath = path.join(process.cwd(), "banned-ips.json");
    if (!fs.existsSync(BANNED_IPS_FILE) && fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, BANNED_IPS_FILE);
      } catch {}
    }

    if (fs.existsSync(BANNED_IPS_FILE)) {
      const raw = fs.readFileSync(BANNED_IPS_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Falha ao ler banned-ips.json:", err);
  }
  return {};
}

function saveBannedIps(data: Record<string, BannedIpRecord>): void {
  try {
    const dir = path.dirname(BANNED_IPS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BANNED_IPS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Falha ao gravar banned-ips.json:", err);
  }
}

// Garante que banned-ips.json começa vazio a cada inicialização
// (ban automático por geolocalização foi removido; IPs nunca são banidos automaticamente)

function isIpBanned(ip: string): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^::ffff:/, "");
  const banned = loadBannedIps();
  return Boolean(banned[clean]);
}

function banIp(ip: string, reason: string, geo?: { country?: string; region?: string }): void {
  if (!ip) return;
  const clean = ip.trim().replace(/^::ffff:/, "");
  const banned = loadBannedIps();
  banned[clean] = {
    ip: clean,
    reason,
    bannedAt: new Date().toISOString(),
    geo,
  };
  saveBannedIps(banned);
  logAuditEvent({
    eventType: 'ACCOUNT_SUSPENDED',
    action: 'ACCOUNT_SUSPENDED',
    ip: clean,
    details: { reason, geo },
  });
  adminRealtimeHub.publish('SECURITY_ALERT', {
    action: 'IP_BANNED',
    ip: clean,
    reason,
    geo,
  });
  console.error(`🚨 [SEGURANÇA CFO CBMERJ] IP BANIDO PERMANENTEMENTE: ${clean} | Motivo: ${reason}`);
}

// Helper confiável para capturar IP real do cliente via infraestrutura (nunca aceita req.body.ip)
function isTrustedEdge(req: Request): boolean {
  const trust = req.app?.get('trust proxy fn');
  return process.env.TRUST_CLOUDFLARE_HEADERS === 'true' && typeof trust === 'function' &&
    !!req.socket?.remoteAddress && trust(req.socket.remoteAddress, 0);
}

export function getClientIp(req: Request): string {
  // 1. Cloudflare edge IP verificado
  const cfIp = req.headers["cf-connecting-ip"];
  if (isTrustedEdge(req) && typeof cfIp === "string" && isIP(cfIp.trim())) {
    return cfIp.trim().replace(/^::ffff:/, "");
  }

  // 2. Express req.ip (respeita 'trust proxy' configurado para 1 hop confiável)
  if (req.ip && typeof req.ip === "string" && req.ip.trim()) {
    return req.ip.replace(/^::ffff:/, "").trim();
  }

  // 3. Socket remoto direto
  const remote = req.socket?.remoteAddress || "";
  return remote.replace(/^::ffff:/, "").trim() || "127.0.0.1";
}

// Valida se o IP é o do Admin (Bypass de Turnstile)
function isAdminIp(ip: string): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^::ffff:/, "");
  const isLocalOrPrivate =
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "localhost" ||
    clean === "0.0.0.0" ||
    clean.startsWith("192.168.") ||
    clean.startsWith("10.") ||
    clean.startsWith("172.16.") ||
    clean.startsWith("172.17.") ||
    clean.startsWith("172.18.") ||
    clean.startsWith("172.19.") ||
    clean.startsWith("172.20.") ||
    clean.startsWith("172.21.") ||
    clean.startsWith("172.22.") ||
    clean.startsWith("172.23.") ||
    clean.startsWith("172.24.") ||
    clean.startsWith("172.25.") ||
    clean.startsWith("172.26.") ||
    clean.startsWith("172.27.") ||
    clean.startsWith("172.28.") ||
    clean.startsWith("172.29.") ||
    clean.startsWith("172.30.") ||
    clean.startsWith("172.31.");

  // Redes privadas servem apenas para desenvolvimento local. Em producao,
  // somente IPs explicitamente configurados podem receber privilegio.
  if (process.env.NODE_ENV !== "production" && isLocalOrPrivate) {
    return true;
  }

  const trustedEnv = process.env.ADMIN_TRUSTED_IPS || "";
  const trustedList = trustedEnv
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/, ""))
    .filter(Boolean);

  return trustedList.includes(clean);
}

function maskIpForClient(value: unknown): string {
  const ip = String(value || "").trim().replace(/^::ffff:/, "");
  if (!ip) return "[PROTECTED]";
  if (ip.includes(".")) {
    const parts = ip.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.x.x` : "[PROTECTED]";
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return `${parts.slice(0, 2).join(":") || "ipv6"}:…`;
  }
  return "[PROTECTED]";
}

function sanitizeSecurityPayload(value: any, key = ""): any {
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["ip", "clientip", "targetip", "remoteip", "ipaddress"].includes(normalizedKey)) {
    return maskIpForClient(value);
  }
  if (["password", "secret", "token", "authorization", "cookie", "apikey", "accesstoken", "refreshtoken", "useragent"].includes(normalizedKey)) {
    return "[PROTECTED]";
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeSecurityPayload(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeSecurityPayload(childValue, childKey)])
    );
  }
  return value;
}

function maskSensitiveText(text: string): string {
  return text
    .replace(/(password|senha|secret|token|authorization|jwt|bearer)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1: [REDACTED]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, (email) => {
      const parts = email.split("@");
      return parts[0].slice(0, 2) + "***@" + parts[1];
    });
}

function logInternalError(scope: string, err: any): void {
  const errMsg = typeof err?.message === "string" ? maskSensitiveText(err.message) : undefined;
  console.error(`[${scope}]`, {
    name: typeof err?.name === "string" ? err.name : "Error",
    code: typeof err?.code === "string" ? err.code : undefined,
    message: errMsg,
  });
}

// Cache de GeoIP para consultas rápidas
const geoCache = new Map<string, { country: string; region: string; isRJ: boolean; timestamp: number }>();

async function getIpGeoLocation(
  ip: string,
  req: Request
): Promise<{ country: string; region: string; isRJ: boolean }> {
  // Localhost e redes internas são consideradas ambiente seguro no RJ
  if (isAdminIp(ip)) {
    return { country: "BR", region: "RJ", isRJ: true };
  }

  // 1. Cabeçalhos diretos da Cloudflare (quando sob proxy Cloudflare)
  const cfCountry = isTrustedEdge(req) ? req.headers["cf-ipcountry"] : undefined;
  const cfRegion = req.headers["cf-region"] || req.headers["cf-region-code"];
  if (typeof cfCountry === "string" && cfCountry) {
    const country = cfCountry.toUpperCase();
    const region = typeof cfRegion === "string" ? cfRegion.toUpperCase() : "";
    const isRJ = country === "BR" && (region === "RJ" || region === "RIO DE JANEIRO");
    return { country, region, isRJ };
  }

  // 2. Cache em memória (1 hora)
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return { country: cached.country, region: cached.region, isRJ: cached.isRJ };
  }

  // Não transmite o IP do cliente a terceiros. Geolocalização somente por
  // cabeçalhos autenticados da borda; sem borda confiável, falha como UNKNOWN.
  return { country: "UNKNOWN", region: "UNKNOWN", isRJ: false };
}

// Verificação do Token do Cloudflare Turnstile
async function verifyTurnstileToken(token?: string, remoteip?: string): Promise<boolean> {
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY || "";
  if (!secretKey) return true;
  if (!token) return false;

  // Chave de teste oficial da Cloudflare que sempre passa em desenvolvimento
  if (secretKey === "1x0000000000000000000000000000000AA") {
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (remoteip) formData.append("remoteip", remoteip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const result = (await res.json()) as any;
      if (!result.success && result["error-codes"]) {
        console.warn("[Turnstile] Validação falhou:", result["error-codes"]);
      }
      return Boolean(result.success);
    }
  } catch (err) {
    console.error("[Turnstile] Erro ao validar token com Cloudflare:", err);
  }
  return false;
}

// 🛑 MIDDLEWARE GLOBAL DE BLOQUEIO DE IPs BANIDOS E BLOQUEIOS TEMPORÁRIOS
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/health") return next();

  const clientIp = getClientIp(req);

  if (isIpBanned(clientIp)) {
    return res.status(403).json({
      error: "IP_BANNED",
      message: "403 FORBIDDEN: Seu endereço IP está restrito por medidas de segurança.",
    });
  }

  // Verifica se a origem possui bloqueio temporário ativo com TTL (ex: por gatilho de alta gravidade da camada de decepção)
  const allowlistKey = process.env.SECURITY_TEST_ALLOWLIST_KEY;
  const isBypass = Boolean(allowlistKey && req.headers['x-security-scan-bypass'] === allowlistKey);
  if (!isBypass) {
    const tempBlock = new TemporarySourceBlockRepository(getDb().getRawDb()).isIpBlocked(clientIp);
    if (tempBlock.isBlocked) {
      return res.status(403).json({
        error: "SOURCE_TEMPORARILY_BLOCKED",
        message: "403 FORBIDDEN: Seu endereço de origem está temporariamente restrito por medidas de segurança.",
        lockedUntil: tempBlock.block?.lockedUntil,
      });
    }
  }

  next();
});

// Middleware Global de Detecção de Honeytokens em todas as requisições
app.use(honeytokenDetectionMiddleware);

// Evita cache de dados autenticados, indexacao de APIs e payloads abusivos
// antes que o parser JSON aloque memoria. Uploads conhecidos mantem o limite maior.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");

  const largePayloadRoute = /^\/(uploads|exams)(\/|$)/.test(req.path)
    || /^\/admin\/board-intelligence(\/|$)/.test(req.path)
    || /\/avatar(\/|$)/.test(req.path);
  const maxBytes = largePayloadRoute ? 75 * 1024 * 1024 : 2 * 1024 * 1024;
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return res.status(413).json({
      error: "PAYLOAD_TOO_LARGE",
      message: "O conteudo enviado excede o limite permitido.",
    });
  }
  next();
});

// 5. Configuração Estrita de CORS
const renderHostnameUrl = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '';
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || renderHostnameUrl || `http://localhost:${PORT}`;
const allowedOriginsList = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://cfo-oficial-agorasim.onrender.com",
  APP_URL,
  process.env.RENDER_EXTERNAL_URL,
  renderHostnameUrl,
].filter(Boolean) as string[];

function extractOrigin(urlStr: string): string | null {
  try {
    return new URL(urlStr).origin.toLowerCase();
  } catch {
    return null;
  }
}

const normalizedAllowedOrigins = new Set(
  allowedOriginsList.map(extractOrigin).filter(Boolean) as string[]
);

// Cookie sessions require a same-origin browser signal on state-changing API calls.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !readSessionCookie(req)) return next();

  const sourceOrigin = extractOrigin(String(req.headers.origin || req.headers.referer || ''));
  if (sourceOrigin && normalizedAllowedOrigins.has(sourceOrigin)) return next();
  if (sourceOrigin && process.env.NODE_ENV !== 'production') {
    const hostname = new URL(sourceOrigin).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return next();
  }

  // Permite requisições same-host legítimas do navegador
  if (sourceOrigin) {
    try {
      const originHost = new URL(sourceOrigin).host.toLowerCase();
      const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
      if (requestHost && (originHost === requestHost || originHost === requestHost.split(':')[0])) return next();
    } catch {}
  }

  return res.status(403).json({
    error: 'CSRF_ORIGIN_REJECTED',
    message: 'Origem da requisição não autorizada.',
  });
});

// Os visuais de ponto são documentos HTML autocontidos: precisam executar o
// módulo inline e importar somente o Three.js do CDN, sem abrir essa exceção
// para as demais páginas da aplicação.
app.use(['/point-sphere.html', '/blackhole-disc.html'], (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self'; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  );
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests server-to-server do not need CORS headers.
      if (!origin) return callback(null, false);

      const normalized = extractOrigin(origin);
      if (normalized && normalizedAllowedOrigins.has(normalized)) {
        return callback(null, true);
      }

      // Permite comunicação segura com extensões de navegador (Chrome, Edge, Brave, Firefox)
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        return callback(null, true);
      }

      // Em desenvolvimento/testes, permitir localhost e 127.0.0.1
      if (process.env.NODE_ENV !== 'production') {
        try {
          const parsed = new URL(origin);
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return callback(null, true);
          }
        } catch {
          // url inválida
        }
      }

      console.warn(`[CORS] Origin rejeitada: ${origin}`);
      return callback(Object.assign(new Error('CORS: Origin não autorizada'), { status: 403 }), false);
    },
    // The SPA and API share the same origin; cross-origin cookie access is not needed.
    credentials: false,
  })
);

// 6. Rate Limiters
// ── Global: 350 req / 15 min por IP (alinhado com SECURITY.md)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 350,
  store: createRateLimitRedisStore('global'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const ip = getClientIp(req);
    console.warn(`[RATE_LIMIT_TRIGGERED] Limiter: api_global | Method: ${req.method} | Path: ${req.path} | Status: 429 | IP: ${ip}`);
    res.status(429).json({ error: "TOO_MANY_REQUESTS", message: "Muitas requisições. Tente novamente em alguns minutos." });
  },
});
app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  store: createRateLimitRedisStore('auth'),
  // Testes podem exercitar muitos logins no mesmo processo. Producao e
  // desenvolvimento continuam protegidos, inclusive em IPs administrativos.
  skip: () => process.env.NODE_ENV === "test",
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    const ip = getClientIp(req);
    console.warn(`[RATE_LIMIT_TRIGGERED] Limiter: auth | Method: ${req.method} | Path: ${req.path} | Status: 429 | IP: ${ip}`);
    res.status(429).json({ error: "TOO_MANY_LOGIN_ATTEMPTS", message: "Muitas tentativas de autenticação. Acesso bloqueado por 15 minutos." });
  },
});
app.use("/api/auth/", authLimiter);

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  store: createRateLimitRedisStore('registration'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "TOO_MANY_REGISTRATION_ATTEMPTS", message: "Muitas tentativas de cadastro. Aguarde alguns minutos." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: createRateLimitRedisStore('2fa'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_2FA_ATTEMPTS", message: "Muitas tentativas de 2FA. Acesso bloqueado por 15 minutos." },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  store: createRateLimitRedisStore('ai'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = String((req as any).user?.userId || '').trim();
    return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip || getClientIp(req))}`;
  },
  message: {
    error: "AI_RATE_LIMITED",
    message: "Limite de gerações por IA atingido. Tente novamente em alguns minutos.",
  },
});

const calendarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  store: createRateLimitRedisStore('calendar'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = String((req as any).user?.userId || '').trim();
    return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip || getClientIp(req))}`;
  },
  message: { error: 'CALENDAR_RATE_LIMITED', message: 'Limite de sincronizações atingido. Tente novamente mais tarde.' },
});

const studentAiMaxRequestsPerDay = Math.max(1, Number(process.env.AI_MAX_REQUESTS_PER_DAY || 10));
const studentAiMaxReportAnalysesPerDay = Math.max(1, Number(process.env.AI_MAX_REPORT_ANALYSES_PER_DAY || 2));
const studentAiMaxOutputTokens = Math.min(1200, Math.max(80, Number(process.env.AI_MAX_OUTPUT_TOKENS || 400)));

function studentBodyText(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function studentNumeric(value: unknown, min: number, max: number, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'string') {
    value = value.trim().replace(',', '.');
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function studentUserId(req: Request): string | null {
  const userId = String((req as any).user?.userId || '').trim();
  return userId || null;
}

function openAiStructuredText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = (data?.output || []).flatMap((item: any) => item?.content || []).filter((item: any) => item?.type === 'output_text' && typeof item?.text === 'string');
  return parts.map((item: any) => item.text).join('\n');
}

async function runStudentOpenAI(args: { userId: string; type: string; prompt: string; schema: Record<string, unknown>; file?: { buffer: Buffer; mimeType: string; filename: string }; report?: boolean }): Promise<{ data?: any; error?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: 'AI_UNAVAILABLE' };
  if (!studentStudyRepoInstance.reserveAiRequest(args.userId, { requests: studentAiMaxRequestsPerDay, reports: studentAiMaxReportAnalysesPerDay }, Boolean(args.report))) return { error: 'AI_LIMIT_REACHED' };
  const content: any[] = [{ type: 'input_text', text: args.prompt }];
  if (args.file) {
    const dataUrl = `data:${args.file.mimeType};base64,${args.file.buffer.toString('base64')}`;
    content.push(args.file.mimeType === 'application/pdf'
      ? { type: 'input_file', filename: args.file.filename, file_data: dataUrl }
      : { type: 'input_image', image_url: dataUrl, detail: 'low' });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_STUDENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna',
        max_output_tokens: studentAiMaxOutputTokens,
        instructions: 'Você é uma orientadora acadêmica brasileira. Use somente os dados fornecidos. Nunca invente notas, datas ou regras. Quando algo estiver ilegível ou ausente, marque como incerto e explique com objetividade.',
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: args.type.replace(/[^a-zA-Z0-9_-]/g, '_'), strict: true, schema: args.schema } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { error: 'AI_UNAVAILABLE' };
    const body = await response.json() as any;
    const text = openAiStructuredText(body);
    if (!text) return { error: 'AI_EMPTY_RESPONSE' };
    try { return { data: JSON.parse(text) }; } catch { return { error: 'AI_INVALID_RESPONSE' }; }
  } catch {
    return { error: 'AI_UNAVAILABLE' };
  }
}

// ── RUM Telemetry Endpoint (LGPD-compliant / anônimo / beacon)
const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  store: createRateLimitRedisStore('telemetry'),
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Limite de telemetria atingido." },
});

app.post("/api/telemetry/vitals", telemetryLimiter, express.json({ limit: '16kb' }), (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const payload = req.body;
  if (payload && typeof payload === "object") {
    telemetryService.recordVital(payload as any);
  }
  return res.status(204).end();
});

// Body parser JSON: 2 MiB global. Rotas de upload têm guard pré-parser em /api
// (linhas acima) que já permite até 75 MiB antes de alocar memória (suporta PDFs de até 50MB em Base64).
// Parse payloads grandes somente nas rotas que realmente os aceitam. O parser
// de 75 MiB roda antes do limite global para que o serviço de upload possa
// devolver sua resposta de validação (400) em vez de um erro genérico (413).
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const largePayloadRoute = /^\/(uploads|exams)(\/|$)/.test(req.path)
    || /^\/admin\/board-intelligence(\/|$)/.test(req.path)
    || /\/avatar(\/|$)/.test(req.path);

  if (!largePayloadRoute) return next();
  return express.json({ limit: "85mb" })(req, res, next);
});
app.use(express.json({ limit: "2mb" }));

// Google OAuth 2.0 Credentials & Storage Configuration
let defaultClientId = "";
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    const cfg = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
    if (cfg.oAuthClientId) defaultClientId = cfg.oAuthClientId;
  }
} catch (e) {
  console.warn("Não foi possível carregar o clientId de firebase-applet-config.json:", e);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || defaultClientId;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CALENDAR_SESSION_FILE = path.join(process.cwd(), "data", "calendar-session.json");

// ── Key Derivation: SHA-256 era fraco para senhas com baixa entropia.
// Versão 1 (legada): sha256(secret) — mantido apenas para descriptografar dados antigos.
// Versão 2 (atual): scrypt(secret, contextSalt, 32) — resistente a ataques de dicionário.
function deriveDataKeyLegacy(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error('DATA_ENCRYPTION_KEY ou SESSION_SECRET e obrigatoria para persistir segredos');
  return crypto.createHash('sha256').update(secret).digest();
}

function deriveDataKey(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error('DATA_ENCRYPTION_KEY ou SESSION_SECRET e obrigatoria para persistir segredos');
  // scrypt com salt de contexto fixo; N=16384, r=8, p=1 → ~0.1s em hardware moderno
  return crypto.scryptSync(secret, 'cfo-data-enc-v1', 32, { N: 16384, r: 8, p: 1 });
}

function encryptStoredJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveDataKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 2,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64'),
  });
}

function decryptStoredJson<T>(raw: string): { value: T; legacy: boolean } {
  const parsed = JSON.parse(raw);
  const version = parsed?.version;
  if (version !== 1 && version !== 2) {
    // Payload plaintext sem envelope (legado anterior à criptografia)
    return { value: parsed as T, legacy: true };
  }
  // Versão 1 usa sha256 direto; versão 2 usa scrypt
  const key = version === 1 ? deriveDataKeyLegacy() : deriveDataKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const clear = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8');
  // version 1 está desatualizado → sinalizar para re-criptografar com v2
  return { value: JSON.parse(clear) as T, legacy: version === 1 };
}

// Google Calendar is a shared administrative integration.
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || process.env.CALENDAR_EMAIL || process.env.ADMIN_USER_EMAIL || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);

interface CalendarSession {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  email?: string;
  name?: string;
  scope?: string;
  updatedAt: string;
}

let systemIntegrationRepoInstance: SystemIntegrationRepository | null = null;
function getSystemIntegrationRepo(): SystemIntegrationRepository | null {
  try {
    if (!systemIntegrationRepoInstance) {
      systemIntegrationRepoInstance = new SystemIntegrationRepository(getDb().getRawDb());
    }
    return systemIntegrationRepoInstance;
  } catch (_err) {
    return null;
  }
}

function readCalendarSession(): CalendarSession | null {
  // 1. Tentar ler do banco de dados relacional (PostgreSQL em produção no Render / SQLite local)
  try {
    const repo = getSystemIntegrationRepo();
    const integration = repo?.get("google_calendar");
    if (integration?.encryptedPayload) {
      const stored = decryptStoredJson<CalendarSession>(integration.encryptedPayload);
      if (stored.legacy) saveCalendarSession(stored.value);
      return stored.value;
    }
  } catch (err) {
    console.warn("Falha ao ler sessão do Google Agenda no banco de dados:", err);
  }

  // 2. Fallback de migração transparente do arquivo local legado
  try {
    if (fs.existsSync(CALENDAR_SESSION_FILE)) {
      const raw = fs.readFileSync(CALENDAR_SESSION_FILE, "utf-8");
      const stored = decryptStoredJson<CalendarSession>(raw);
      // Auto-migra a sessão legada de arquivo diretamente para o banco de dados
      saveCalendarSession(stored.value);
      return stored.value;
    }
  } catch (err) {
    console.warn("Falha ao ler sessão do Google Agenda:", err);
  }

  // 3. Resiliência de Nuvem: Fallback em variável de ambiente (evita perda se o disco reiniciar no Render)
  const envRefreshToken = process.env.CALENDAR_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (envRefreshToken) {
    const session: CalendarSession = {
      access_token: "",
      refresh_token: envRefreshToken,
      email: process.env.CALENDAR_EMAIL || undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      saveCalendarSession(session);
    } catch {}
    return session;
  }

  return null;
}

function saveCalendarSession(session: CalendarSession): void {
  const encrypted = encryptStoredJson(session);

  // 1. Persistir no Banco de Dados (PostgreSQL / SQLite) para sobreviver a deploys perpétuos
  try {
    const repo = getSystemIntegrationRepo();
    if (repo) {
      repo.set("google_calendar", encrypted);
      if (session.refresh_token) {
        console.log(`[Google Agenda Resiliente] Sessão persistida no banco de dados. Token preservado para persistência perpétua.`);
      }
    }
  } catch (err) {
    console.error("Falha ao gravar sessão do Google Agenda no banco de dados:", err);
  }

  // 2. Espelhamento defensivo em disco (se o diretório for gravável)
  try {
    const dir = path.dirname(CALENDAR_SESSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(CALENDAR_SESSION_FILE, encrypted, { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    // Não-fatal em ambientes com filesystem efêmero
  }
}

function clearCalendarSession(): void {
  // 1. Remover do banco de dados
  try {
    const repo = getSystemIntegrationRepo();
    if (repo) {
      repo.delete("google_calendar");
    }
  } catch (err) {
    console.warn("Falha ao remover sessão do Google Agenda do banco:", err);
  }

  // 2. Remover do arquivo local
  try {
    if (fs.existsSync(CALENDAR_SESSION_FILE)) {
      fs.unlinkSync(CALENDAR_SESSION_FILE);
    }
  } catch (err) {
    console.warn("Falha ao remover arquivo de sessão:", err);
  }
}

/**
 * Retorna um access_token válido e renovado automaticamente se expirado.
 */
async function getValidCalendarAccessToken(clientToken?: string): Promise<string | null> {
  const session = readCalendarSession();
  
  if (session) {
    const now = Date.now();
    // 5 min buffer
    const isStillValid = session.expiry_date && session.expiry_date > now + 300000;

    if (isStillValid && session.access_token) {
      return session.access_token;
    }

    // Token expirado ou próximo de expirar: renovação automática com refresh_token
    if (session.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
      try {
        console.log("Renovando token do Google Agenda silenciosamente via refresh_token no backend...");
        const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: session.refresh_token,
            grant_type: "refresh_token",
          }),
        });

        if (refreshResp.ok) {
          const freshData = (await refreshResp.json()) as any;
          session.access_token = freshData.access_token;
          session.expiry_date = now + (freshData.expires_in || 3600) * 1000;
          if (freshData.refresh_token) {
            session.refresh_token = freshData.refresh_token;
          }
          session.updatedAt = new Date().toISOString();
          saveCalendarSession(session);
          console.log("Token do Google Agenda renovado com sucesso!");
          return session.access_token;
        } else {
          const errText = await refreshResp.text();
          console.warn("Falha ao renovar token do Google:", errText ? 'provider_error' : 'unknown_error');
        }
      } catch (err) {
        console.error("Erro durante renovação de token do Google Agenda.");
      }
    }

    if (session.access_token) {
      return session.access_token;
    }
  }

  if (clientToken) {
    return clientToken;
  }

  return null;
}

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const externalAiEnabled = process.env.ENABLE_EXTERNAL_AI === 'true' || process.env.NODE_ENV !== 'production';
  if (!externalAiEnabled) return null;
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// (Rota /api/health definida anteriormente na linha ~40)

// ==========================================
// 🛡️ TERMINAL DE ACESSO RESTRITO (2FA TOTP)
// ==========================================
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const CONFIGURED_SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SECURITY_CONFIG_FILE = path.join(process.cwd(), "data", "security-config.json");

async function safeComparePassword(input: string, hash: string): Promise<boolean> {
  if (!input || !hash || !hash.startsWith('$2')) return false;
  try { return await bcrypt.compare(input, hash); } catch { return false; }
}

interface SecurityConfig {
  totpSecret: string;
  sessionSecret: string;
  is2faActive: boolean;
  createdAt: string;
}

function getSecurityConfig(): SecurityConfig {
  try {
    if (fs.existsSync(SECURITY_CONFIG_FILE)) {
      const raw = fs.readFileSync(SECURITY_CONFIG_FILE, "utf-8");
      const stored = decryptStoredJson<SecurityConfig>(raw);
      const parsed = stored.value;
      if (stored.legacy) saveSecurityConfig(parsed);
      const secret = process.env.TOTP_SECRET || parsed.totpSecret || generateSecret();
      const sessionSecret = process.env.SESSION_SECRET || parsed.sessionSecret || CONFIGURED_SESSION_SECRET;

      if (!parsed.totpSecret && secret) {
        parsed.totpSecret = secret;
        saveSecurityConfig(parsed);
      }

      // An explicit production mandate always wins, otherwise preserve the state
      // activated through the authenticated setup flow.
      const is2faActive = process.env.ADMIN_REQUIRE_2FA === 'true' || parsed.is2faActive === true;

      return {
        totpSecret: secret,
        sessionSecret,
        is2faActive,
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("Falha ao ler security-config.json:", e);
  }

  const is2faActive = process.env.ADMIN_REQUIRE_2FA === 'true';

  const newConfig: SecurityConfig = {
    totpSecret: process.env.TOTP_SECRET || generateSecret(),
    sessionSecret: process.env.SESSION_SECRET || CONFIGURED_SESSION_SECRET,
    is2faActive,
    createdAt: new Date().toISOString(),
  };

  saveSecurityConfig(newConfig);
  return newConfig;
}

function saveSecurityConfig(config: SecurityConfig): void {
  try {
    const dir = path.dirname(SECURITY_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(SECURITY_CONFIG_FILE, encryptStoredJson(config), { encoding: 'utf-8', mode: 0o600 });
  } catch (e) {
    console.warn("Falha ao gravar security-config.json:", e);
  }
}

function createTerminalSession(identifierOrUser: string | DbUser, rememberMe: boolean, role: string = 'admin') {
  let user: DbUser | null = null;
  if (typeof identifierOrUser === 'object' && identifierOrUser && 'id' in identifierOrUser) {
    user = identifierOrUser as DbUser;
  } else if (typeof identifierOrUser === 'string') {
    const clean = identifierOrUser.trim().toLowerCase();
    user = userRepoInstance.findByUsername(clean) ||
           userRepoInstance.findByEmail(clean) ||
           userRepoInstance.findByEmailPrefix(clean) ||
           userRepoInstance.findById(identifierOrUser);
  }
  if (!user || user.status !== 'active' || user.role !== role) throw new Error('SESSION_USER_INVALID');
  const created = sessionRepoInstance.createSession({ userId: user.id, role: user.role, expiresInDays: rememberMe ? 30 : 1 });
  return { token: created.rawToken, expiresAt: Date.parse(created.session.expiresAt), role: user.role, canAccessNotion: user.role === 'admin' || user.canAccessNotion, canAccessIfrj: user.role === 'admin' || user.canAccessIfrj };
}

const databaseService = getDb();
const authServiceInstance = new AuthService(databaseService);
const auditRepoInstance = new AuditRepository(getDb().getRawDb());
const userRepoInstance = new UserRepository(getDb().getRawDb());
const recoveryCodeRepoInstance = new RecoveryCodeRepository(getDb().getRawDb());
const profileRepoInstance = new ProfileRepository(getDb().getRawDb());
const userStateRepoInstance = new UserStateRepository(getDb().getRawDb());
const sessionRepoInstance = new SessionRepository(getDb().getRawDb());
const uploadedFileRepoInstance = new UploadedFileRepository(getDb().getRawDb());
const examPaperRepoInstance = new ExamPaperRepository(getDb().getRawDb());
const examQuestionRepoInstance = new ExamQuestionRepository(getDb().getRawDb());
const examJobRepoInstance = new ExamJobRepository(getDb().getRawDb());
const questionSegmentRepoInstance = new QuestionSegmentRepository(getDb().getRawDb());
const questionAssetRepoInstance = new QuestionAssetRepository(getDb().getRawDb());
const supportMaterialRepoInstance = new SupportMaterialRepository(getDb().getRawDb());
const questionAuditRepoInstance = new QuestionAuditRepository(getDb().getRawDb());
systemIntegrationRepoInstance = new SystemIntegrationRepository(getDb().getRawDb());
const consentRepoInstance = new ConsentRepository(getDb().getRawDb());
const privacyRequestRepoInstance = new PrivacyRequestRepository(getDb().getRawDb());
const flashcardRepoInstance = new FlashcardRepository(getDb().getRawDb());
const studentStudyRepoInstance = new StudentStudyRepository(getDb().getRawDb());

// Migração inicial e garantia de persistência no boot do servidor
try {
  if (!systemIntegrationRepoInstance.get("google_calendar")) {
    const existing = readCalendarSession();
    if (existing) {
      saveCalendarSession(existing);
      console.log("[Google Agenda] Integração inicial sincronizada e salva no banco de dados.");
    }
  }
} catch (syncInitErr) {
  console.warn("[Google Agenda] Verificação inicial de persistência:", syncInitErr);
}

const examServiceInstance = new ExamService(
  examPaperRepoInstance,
  examQuestionRepoInstance,
  examJobRepoInstance,
  uploadedFileRepoInstance,
  questionSegmentRepoInstance,
  questionAssetRepoInstance,
  supportMaterialRepoInstance,
  questionAuditRepoInstance
);
const examJobWorker = new ExamJobWorker(examJobRepoInstance, examServiceInstance);
const studentLearningService = new StudentLearningService(getDb().getRawDb());
const rawDb = getDb().getRawDb();
const boardIntelligenceServiceInstance = getBoardIntelligenceService();

function logSecurityEvent(
  req: Request,
  event: {
    action: string;
    actor: string;
    actorUserId?: string | null;
    resource: string;
    status: 'SUCCESS' | 'FAILED' | 'WARNING';
    targetType?: string | null;
    targetId?: string | null;
    userId?: string | null;
    previousState?: Record<string, any> | null;
    newState?: Record<string, any> | null;
    details?: Record<string, any>;
  }
): void {
  try {
    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] as string) || null;
    const actorUser = (req as any).user;
    const actorUserId = event.actorUserId ?? (actorUser?.id || null);

    const loggedEvent = auditRepoInstance.log({
      action: event.action,
      actor: event.actor,
      actorUserId,
      resource: event.resource,
      status: event.status,
      targetType: event.targetType,
      targetId: event.targetId,
      ip,
      userAgent,
      userId: event.userId,
      previousState: event.previousState,
      newState: event.newState,
      details: event.details,
    });

    logAuditEvent({
      eventType: event.action,
      action: event.action,
      actor: event.actor,
      resource: event.resource,
      status: event.status,
      ip,
      userAgent,
      userId: event.userId,
      details: {
        ...event.details,
        ...(event.previousState ? { previousState: event.previousState } : {}),
        ...(event.newState ? { newState: event.newState } : {}),
      },
    });

    // Transmissão realtime com baixa latência para os administradores conectados
    let realtimeType: AdminRealtimeEventType = 'METRICS_UPDATED';
    if (event.action === 'ADMIN_LOGIN_FAILED') realtimeType = 'ADMIN_LOGIN_FAILED';
    else if (event.action === 'LOGIN_FAILED') realtimeType = 'LOGIN_FAILED';
    else if (event.action === 'ACCOUNT_SUSPENDED' || event.action === 'USER_SUSPENDED') realtimeType = 'ACCOUNT_SUSPENDED';
    else if (event.action === 'SESSION_REVOKED') realtimeType = 'SESSION_REVOKED';
    else if (event.action === 'USER_CREATED' || event.action === 'USER_REGISTERED') realtimeType = 'USER_CREATED';
    else if (event.action === 'USER_UPDATED' || event.action === 'ROLE_CHANGED' || event.action === 'ACCOUNT_ACTIVATED' || event.action === 'USER_REACTIVATED') realtimeType = 'USER_UPDATED';
    else if (event.action === '2FA_FAILED' || event.status === 'FAILED' || event.action === 'IP_BANNED') realtimeType = 'SECURITY_ALERT';

    adminRealtimeHub.publish(realtimeType, {
      id: loggedEvent.id,
      action: event.action,
      actor: event.actor,
      actorUserId,
      resource: event.resource,
      status: event.status,
      targetType: event.targetType,
      targetId: event.targetId,
      ip,
      userAgent,
      userId: event.userId,
      createdAt: loggedEvent.createdAt,
      details: event.details,
      previousState: event.previousState,
      newState: event.newState,
    });
  } catch (err) {
    console.error("[Security Event Log Error]:", err);
  }
}

function verifyTerminalSession(token?: string | null): {
  valid: boolean;
  username?: string;
  role?: string;
  canAccessNotion?: boolean;
  canAccessIfrj?: boolean;
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
  impersonatedByUserId?: string | null;
  parentSessionId?: string | null;
  authScope?: 'default' | 'extension';
} {
  if (!token || typeof token !== "string") return { valid: false };

  // 1. Verificação primária na nova base de sessões do banco de dados
  const dbCheck = authServiceInstance.validateToken(token);
  if (dbCheck.valid && dbCheck.user && dbCheck.session) {
    const authScope = dbCheck.session.userAgent === 'cfo-browser-extension' ? 'extension' : 'default';
    const role = authScope === 'extension' ? 'cadet' : dbCheck.user.role;
    const canAccessNotion = authScope === 'default' && (role === "admin" || dbCheck.user.canAccessNotion);
    const canAccessIfrj = authScope === 'default' && (role === "admin" || dbCheck.user.canAccessIfrj);
    const expiresAt = new Date(dbCheck.session.expiresAt).getTime();
    return {
      valid: true,
      username: dbCheck.user.username,
      role,
      canAccessNotion,
      canAccessIfrj,
      expiresAt,
      userId: dbCheck.user.id,
      sessionId: dbCheck.session.id,
      impersonatedByUserId: dbCheck.session.impersonatedByUserId || null,
      parentSessionId: dbCheck.session.parentSessionId || null,
      authScope,
    };
  }

  return { valid: false };
}

// ==========================================
// 🛡️ STEP-UP AUTHENTICATION (Tokens Assinados de Curta Duração - 5 Minutos)
// ==========================================
const {
  requireAdminAuth: baseRequireAdminAuth,
  requireAdminOnlyAuth: baseRequireAdminOnlyAuth,
  requireAdminWriteAuth: baseRequireAdminWriteAuth,
  requireUserAuth,
  authenticatedSession,
} = createAuthMiddlewares(verifyTerminalSession);

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  return baseRequireAdminAuth(req, res, next);
}

// A trilha de auditoria contém IPs, dispositivos e ações administrativas.
// Mesmo o suporte, que possui leitura de outras áreas, não pode consultar estes dados.
function requireAdminOnlyAuth(req: Request, res: Response, next: NextFunction) {
  return baseRequireAdminOnlyAuth(req, res, next);
}

function requireAdminWriteAuth(req: Request, res: Response, next: NextFunction) {
  return baseRequireAdminWriteAuth(req, res, next);
}
app.use('/avatars', requireUserAuth, express.static(path.join(process.cwd(), 'data', 'avatars'), { dotfiles: 'deny', index: false }));

// ==========================================
// 🚨 EMERGENCY LOCKDOWN & SYSTEM CONTAINMENT MIDDLEWARE
// Desliga o acesso a todas as APIs para alunos, visitantes e invasores,
// preservando acesso irrestrito para administradores autenticados.
// ==========================================
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const relPath = req.path;
  const fullPath = req.originalUrl || req.url;

  // 1. Endpoints que precisam responder mesmo durante lockdown
  if (
    relPath === '/maintenance/status' ||
    relPath === '/health' ||
    relPath === '/ready' ||
    relPath.startsWith('/telemetry') ||
    relPath.startsWith('/admin') ||
    fullPath.startsWith('/api/admin') ||
    fullPath.startsWith('/api/maintenance/status') ||
    fullPath.startsWith('/api/health') ||
    fullPath.startsWith('/api/ready') ||
    fullPath.startsWith('/api/telemetry')
  ) {
    return next();
  }

  // 2. Consulta configuração de manutenção global / contenção de emergência
  const config = getMaintenanceConfig();
  if (config.global) {
    // Se for administrador autenticado com sessão válida, permite o acesso normal
    const session = authenticatedSession(req);
    if (session.valid && (session.role === 'admin' || session.role === 'support')) {
      return next();
    }

    // Para alunos, visitantes e potenciais invasores: bloqueio imediato no backend
    res.setHeader('Retry-After', '300');
    return res.status(503).json({
      success: false,
      error: 'SYSTEM_LOCKDOWN',
      lockdown: true,
      message: config.message || 'Sistema em procedimento de contingência e contenção de segurança. Acesso suspenso para manutenção emergencial.',
    });
  }

  return next();
});

function createStepUpToken(username: string, userId?: string): { token: string; expiresIn: number } {
  const config = getSecurityConfig();
  const expiresIn = 5 * 60; // 5 minutos (300 segundos)
  const expiresAt = Date.now() + expiresIn * 1000;
  const payload = {
    u: username,
    userId: userId || null,
    purpose: "admin_step_up",
    exp: expiresAt,
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(`stepup:${payloadB64}`).digest("base64url");
  return {
    token: `${payloadB64}.${signature}`,
    expiresIn,
  };
}

function verifyStepUpToken(token?: string | null): { valid: boolean; username?: string; userId?: string } {
  if (!token || typeof token !== "string") return { valid: false };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, signature] = parts;
  const config = getSecurityConfig();
  const expectedSig = crypto.createHmac("sha256", config.sessionSecret).update(`stepup:${payloadB64}`).digest("base64url");

  if (expectedSig.length !== signature.length) return { valid: false };
  const sigBufA = Buffer.from(signature, "utf-8");
  const sigBufB = Buffer.from(expectedSig, "utf-8");
  if (!crypto.timingSafeEqual(sigBufA, sigBufB)) return { valid: false };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (payload.purpose !== "admin_step_up") return { valid: false };
    if (!payload.exp || Date.now() > payload.exp) return { valid: false };
    return {
      valid: true,
      username: payload.u,
      userId: payload.userId,
    };
  } catch {
    return { valid: false };
  }
}

function createLoginChallenge(user: DbUser): string {
  const payload = Buffer.from(JSON.stringify({ userId: user.id, purpose: 'admin_login_2fa', exp: Date.now() + 300_000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecurityConfig().sessionSecret).update(`login2fa:${payload}`).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyLoginChallenge(challenge?: unknown): DbUser | null {
  if (typeof challenge !== 'string') return null;
  const [payload, signature, extra] = challenge.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', getSecurityConfig().sessionSecret).update(`login2fa:${payload}`).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.purpose !== 'admin_login_2fa' || !decoded.exp || Date.now() > decoded.exp) return null;
    const user = userRepoInstance.findById(String(decoded.userId || ''));
    return user?.role === 'admin' && user.status === 'active' ? user : null;
  } catch {
    return null;
  }
}

function requireStepUpAuth(req: Request, res: Response, next: NextFunction) {
  const stepUpHeader = req.headers["x-admin-step-up-token"] || req.headers["x-step-up-token"];
  const token = typeof stepUpHeader === "string" ? String(stepUpHeader).trim() : null;

  const result = verifyStepUpToken(token);
  if (!result.valid || result.userId !== (req as any).user?.userId) {
    return res.status(403).json({
      error: "STEP_UP_REQUIRED",
      message: "Esta ação administrativa crítica exige confirmação recente de identidade (Step-Up 2FA/Senha).",
    });
  }

  (req as any).stepUp = result;
  return next();
}

// Cache de códigos TOTP já usados para proteção anti-replay
const usedTotpCodes = new Map<string, number>(); // code -> timestamp
function cleanupUsedTotpCodes(): void {
  const now = Date.now();
  for (const [code, ts] of usedTotpCodes) {
    if (now - ts > 180000) usedTotpCodes.delete(code); // 3 minutos
  }
}

function verifyTotpToken(token: string, secret: string): boolean {
  const cleanToken = token.trim().replace(/[\s-]+/g, "");

  // Proteção anti-replay: mesmo código não pode ser reutilizado no mesmo ciclo
  if (usedTotpCodes.has(cleanToken)) {
    console.warn('[2FA] Tentativa de reutilização de código TOTP detectada.');
    return false;
  }

  // Tolerância profissional com epochTolerance de 60s (±2 intervalos de 30s para drift de celular)
  const result = verifySync({ token: cleanToken, secret, epochTolerance: 60 });
  if (result && result.valid) {
    usedTotpCodes.set(cleanToken, Date.now());
    cleanupUsedTotpCodes();
    return true;
  }

  return false;
}

// 1. Rota de Status do 2FA (Verifica se já foi ativado permanentemente)
app.get("/api/auth/2fa-status", (_req: Request, res: Response) => {
  const config = getSecurityConfig();
  return res.json({ is2faActive: config.is2faActive });
});

// 2. Rota de Obtenção de QR Code (Apenas com sessão de admin autenticada)
app.get("/api/auth/2fa-setup", async (req: Request, res: Response) => {
  const token = requestSessionToken(req);
  const sessionResult = verifyTerminalSession(token);

  if (!sessionResult.valid || sessionResult.role !== "admin") {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Acesso restrito. Faça login como administrador para visualizar o QR Code de ativação.",
    });
  }

  try {
    const config = getSecurityConfig();

    if (config.is2faActive) {
      return res.status(409).json({
        error: "2FA_ALREADY_ACTIVE",
        message: "O 2FA já está ativo. O segredo existente não pode ser exibido novamente.",
      });
    }

    res.setHeader("Cache-Control", "no-store");

    const otpauthUrl = generateURI({
      label: `${ADMIN_USER}@cfo-cbmerj`,
      issuer: "CFO CBMERJ Terminal",
      secret: config.totpSecret,
    });

    const qrCode = await QRCode.toDataURL(otpauthUrl, {
      margin: 2,
      color: {
        dark: "#ef4444",
        light: "#0b0f19",
      },
      width: 320,
    });

    return res.json({
      username: ADMIN_USER,
      secret: config.totpSecret,
      otpauthUrl,
      qrCode,
      issuer: "CFO CBMERJ Terminal",
      is2faActive: config.is2faActive,
    });
  } catch (err: any) {
    console.error('[2FA setup]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// ============================================================================
// ⏱️ CLOUD TIMER (Sincronizado entre PC e Celular via Servidor)
// ============================================================================

interface TimerInterval {
  type: "study" | "rest";
  durationMs: number;
  startTime: number;
  endTime: number;
  subjectId?: string;
}

interface TimerState {
  status: "STOPPED" | "RUNNING" | "PAUSED";
  accumulatedTime: number; // milissegundos acumulados de estudo
  startTime: number | null; // timestamp de início da última contagem de estudo
  activeSubjectId?: string;
  activeSubjectName?: string;
  updatedAt: string;
  restAccumulatedMs?: number; // milissegundos acumulados em descanso
  restStartTime?: number | null; // timestamp de início do descanso atual (se PAUSED)
  intervals?: TimerInterval[]; // lista de blocos de estudo e descanso
}

app.use('/api/timer', requireUserAuth, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// As sessões de estudo pertencem ao usuário autenticado. Este middleware
// precisa ser aplicado antes das rotas de gravação e consulta do banco de horas.
app.use('/api/study-sessions', requireUserAuth, (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
function timerStateFile(userId: string): string {
  const hash = crypto.createHash('sha256').update(String(userId || '')).digest('hex');
  const baseDir = path.resolve(process.cwd(), 'data');
  const target = path.resolve(baseDir, `timer-${hash}.json`);
  if (!target.startsWith(baseDir + path.sep)) {
    throw new Error('INVALID_TIMER_PATH');
  }
  return target;
}

function readTimerState(userId: string): TimerState {
  const TIMER_STATE_FILE = timerStateFile(userId);
  try {
    if (fs.existsSync(TIMER_STATE_FILE)) {
      const raw = fs.readFileSync(TIMER_STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...parsed,
        restAccumulatedMs: typeof parsed.restAccumulatedMs === "number" ? parsed.restAccumulatedMs : 0,
        restStartTime: parsed.restStartTime || null,
        intervals: Array.isArray(parsed.intervals) ? parsed.intervals : [],
      };
    }
  } catch (e) {
    console.warn("Falha ao ler timer-state.json:", e);
  }
  return {
    status: "STOPPED",
    accumulatedTime: 0,
    startTime: null,
    restAccumulatedMs: 0,
    restStartTime: null,
    intervals: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveTimerState(userId: string, state: TimerState): void {
  const TIMER_STATE_FILE = timerStateFile(userId);
  try {
    const dir = path.dirname(TIMER_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TIMER_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.warn("Falha ao salvar timer-state.json:", e);
  }
}

// 1. Status do Cronômetro (Calculado no servidor para sincronização multidispositivo)
app.get("/api/timer/status", (req: Request, res: Response) => {
  const state = readTimerState((req as any).user.userId);
  const now = Date.now();
  let totalElapsedMs = state.accumulatedTime;
  let totalRestMs = state.restAccumulatedMs || 0;

  if (state.status === "RUNNING" && state.startTime) {
    totalElapsedMs += Math.max(0, now - state.startTime);
  } else if (state.status === "PAUSED") {
    if (!state.restStartTime) {
      state.restStartTime = now;
      saveTimerState((req as any).user.userId, state);
    }
    totalRestMs += Math.max(0, now - state.restStartTime);
  }

  return res.json({
    ...state,
    restAccumulatedMs: state.restAccumulatedMs || 0,
    totalElapsedMs,
    totalRestMs,
    serverTime: now,
  });
});

// 2. Iniciar / Retomar Cronômetro
app.post("/api/timer/start", (req: Request, res: Response) => {
  const { subjectId, subjectName, accumulatedTime, resetAccumulated } = req.body || {};
  const state = readTimerState((req as any).user.userId);
  const now = Date.now();

  // Sincronização explícita de tempo acumulado enviada pelo cliente (evita ressuscitar tempos residuais)
  if (resetAccumulated === true) {
    state.accumulatedTime = 0;
    state.restAccumulatedMs = 0;
    state.intervals = [];
  } else if (typeof accumulatedTime === 'number' && Number.isFinite(accumulatedTime) && accumulatedTime >= 0) {
    state.accumulatedTime = accumulatedTime;
  }

  // Se estava em pausa/descanso, encerra o ciclo de descanso e acumula no tempo total de pausas da sessão
  if (state.status === "PAUSED" && state.restStartTime) {
    const restDelta = Math.max(0, now - state.restStartTime);
    state.restAccumulatedMs = (state.restAccumulatedMs || 0) + restDelta;
    if (!state.intervals) state.intervals = [];
    state.intervals.push({
      type: "rest",
      durationMs: restDelta,
      startTime: state.restStartTime,
      endTime: now,
    });
    state.restStartTime = null;
  }

  // Ao iniciar ou retomar, registra status RUNNING e o timestamp de início deste ciclo
  state.status = "RUNNING";
  state.startTime = now;

  if (subjectId) state.activeSubjectId = subjectId;
  if (subjectName) state.activeSubjectName = subjectName;
  state.updatedAt = new Date().toISOString();

  saveTimerState((req as any).user.userId, state);

  const totalElapsedMs = state.accumulatedTime + (state.startTime ? Math.max(0, now - state.startTime) : 0);
  const totalRestMs = state.restAccumulatedMs || 0;
  return res.json({
    success: true,
    ...state,
    restAccumulatedMs: totalRestMs,
    totalElapsedMs,
    totalRestMs,
    serverTime: now,
  });
});

// 3. Pausar Cronômetro (Inicia o descanso em andamento)
app.post("/api/timer/pause", (req: Request, res: Response) => {
  const state = readTimerState((req as any).user.userId);
  const now = Date.now();

  if (state.status === "RUNNING" && state.startTime) {
    const delta = Math.max(0, now - state.startTime);
    state.accumulatedTime += delta;
    if (!state.intervals) state.intervals = [];
    state.intervals.push({
      type: "study",
      durationMs: delta,
      startTime: state.startTime,
      endTime: now,
      subjectId: state.activeSubjectId,
    });
  }

  state.startTime = null;
  state.status = "PAUSED";
  state.restStartTime = now;
  // Preserva restAccumulatedMs acumulado das pausas anteriores da sessão
  state.updatedAt = new Date().toISOString();
  saveTimerState((req as any).user.userId, state);

  const totalRestMs = state.restAccumulatedMs || 0;
  return res.json({
    success: true,
    ...state,
    restAccumulatedMs: totalRestMs,
    totalElapsedMs: state.accumulatedTime,
    totalRestMs,
    serverTime: now,
  });
});

// 4. Resetar Cronômetro
app.post("/api/timer/reset", (req: Request, res: Response) => {
  const state: TimerState = {
    status: "STOPPED",
    accumulatedTime: 0,
    startTime: null,
    restAccumulatedMs: 0,
    restStartTime: null,
    intervals: [],
    updatedAt: new Date().toISOString(),
  };
  saveTimerState((req as any).user.userId, state);
  return res.json({
    success: true,
    ...state,
    totalElapsedMs: 0,
    totalRestMs: 0,
    serverTime: Date.now(),
  });
});

// 5. Salvar Sessão do Cronômetro diretamente no Banco de Dados (SQLite)
const studySessionRepoInstance = new StudySessionRepository(getDb().getRawDb());

app.post("/api/timer/save-session", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const { subjectId, subjectName, topic, durationSeconds, notes } = req.body || {};

    const cleanSubjectId = String(subjectId || "geral").slice(0, 80);
    const cleanSubjectName = String(subjectName || "Estudo Geral").slice(0, 120);
    const cleanTopic = topic ? String(topic).slice(0, 200) : null;
    const cleanNotes = notes ? String(notes).slice(0, 1000) : null;

    // Converte e valida durationSeconds
    const parsedDuration = Math.round(Number(durationSeconds) || 0);
    if (parsedDuration <= 0) {
      return res.status(400).json({ error: "INVALID_DURATION", message: "A sessão precisa ter pelo menos 1 segundo." });
    }

    // Limite razoável de segurança: máx 24 horas por sessão (86400s)
    if (parsedDuration > 86400) {
      return res.status(400).json({ error: "DURATION_EXCEEDS_MAX", message: "Duração máxima por sessão é de 24 horas." });
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;

    const session = studySessionRepoInstance.create({
      userId,
      subjectId: cleanSubjectId,
      subjectName: cleanSubjectName,
      topic: cleanTopic,
      dateStr,
      durationSeconds: parsedDuration,
      endedAt: now.toISOString(),
      notes: cleanNotes,
    });

    // Ao salvar a sessão com sucesso, reseta o cronômetro ativo e descanso
    const state: TimerState = {
      status: "STOPPED",
      accumulatedTime: 0,
      startTime: null,
      restAccumulatedMs: 0,
      restStartTime: null,
      intervals: [],
      updatedAt: now.toISOString(),
    };
    saveTimerState(userId, state);

    logAuditEvent({
      action: "STUDY_SESSION_SAVED",
      actor: (req as any).user.username || userId,
      resource: "study_sessions",
      status: "SUCCESS",
      ip: getClientIp(req),
      details: {
        sessionId: session.id,
        subjectId: cleanSubjectId,
        durationSeconds: parsedDuration,
        dateStr,
      },
    });

    return res.status(201).json({
      success: true,
      session,
      timerState: state,
    });
  } catch (err: any) {
    console.error("Erro ao salvar sessão de estudo:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Falha ao salvar sessão de estudo." });
  }
});

// Registra ou atualiza o tempo informado manualmente no cronograma.
app.post("/api/study-sessions/manual", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const { entryId, subjectId, subjectName, topic, dateStr, durationMinutes, notes, replaceSubjectTime } = req.body || {};
    const cleanEntryId = String(entryId || "").slice(0, 120);
    const cleanSubjectId = String(subjectId || "geral").slice(0, 80);
    const cleanSubjectName = String(subjectName || "Estudo Geral").slice(0, 120);
    const cleanTopic = topic ? String(topic).slice(0, 200) : null;
    const cleanNotes = notes ? String(notes).slice(0, 1000) : null;
    const cleanDate = String(dateStr || "");
    const parsedMinutes = Math.round(Number(durationMinutes) || 0);

    if (!cleanEntryId || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return res.status(400).json({ error: "INVALID_MANUAL_SESSION", message: "Registro manual inválido." });
    }
    if (parsedMinutes < 0 || parsedMinutes > 1440) {
      return res.status(400).json({ error: "INVALID_DURATION", message: "O tempo deve estar entre 0 e 1440 minutos." });
    }

    const sessionId = `manual_${userId}_${cleanDate}_${cleanSubjectId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);

    // Se o tempo for zero ou replaceSubjectTime for true, limpa sessões anteriores desta matéria neste dia
    if (parsedMinutes === 0 || replaceSubjectTime) {
      studySessionRepoInstance.deleteByDateAndSubjectForUser(userId, cleanDate, cleanSubjectId);
      studySessionRepoInstance.deleteByIdForUser(sessionId, userId);
      if (parsedMinutes === 0) {
        logAuditEvent({
          action: "STUDY_SESSION_DELETED",
          actor: (req as any).user?.username || userId,
          resource: "study_sessions",
          status: "SUCCESS",
          ip: getClientIp(req),
          details: { dateStr: cleanDate, subjectId: cleanSubjectId },
        });
        return res.json({ success: true, removed: true });
      }
    }

    const now = new Date();
    const session = studySessionRepoInstance.upsertManual(sessionId, {
      userId,
      subjectId: cleanSubjectId,
      subjectName: cleanSubjectName,
      topic: cleanTopic,
      dateStr: cleanDate,
      durationSeconds: parsedMinutes * 60,
      endedAt: now.toISOString(),
      notes: cleanNotes,
    });

    logAuditEvent({
      action: "STUDY_SESSION_MANUAL_SAVED",
      actor: (req as any).user?.username || userId,
      resource: "study_sessions",
      status: "SUCCESS",
      ip: getClientIp(req),
      details: {
        sessionId: session.id,
        subjectId: cleanSubjectId,
        durationMinutes: parsedMinutes,
        dateStr: cleanDate,
        replaceSubjectTime: Boolean(replaceSubjectTime),
      },
    });

    return res.status(200).json({ success: true, session });
  } catch (err: any) {
    console.error("Erro ao salvar estudo manual:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Falha ao salvar tempo de estudo manual." });
  }
});

// 6. Consultar Resumo Mensal de Horas (para a Agenda Mensal / Heatmap Azul)
app.get("/api/study-sessions/daily-summary", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rawMonth = String(req.query.month || currentYM);

    // Valida formato YYYY-MM
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonth)) {
      return res.status(400).json({ error: "INVALID_MONTH_FORMAT", message: "Formato esperado: YYYY-MM" });
    }

    const summary = studySessionRepoInstance.getDailySummaryByMonth(userId, rawMonth);
    const totals = studySessionRepoInstance.getMonthlyTotal(userId, rawMonth);

    return res.json({
      success: true,
      month: rawMonth,
      summary,
      totals,
    });
  } catch (err: any) {
    console.error("Erro ao consultar resumo diário de estudo:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 6b. Consultar Resumo de Horas por Intervalo de Datas (para sincronizar o Ciclo Semanal com a Agenda)
app.get("/api/study-sessions/range", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const startDate = String(req.query.startDate || "");
    const endDate = String(req.query.endDate || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: "INVALID_DATE_RANGE", message: "Formato esperado para startDate e endDate: YYYY-MM-DD" });
    }

    const summary = studySessionRepoInstance.getDailySummaryBetweenDates(userId, startDate, endDate);
    return res.json({
      success: true,
      startDate,
      endDate,
      summary,
    });
  } catch (err: any) {
    console.error("Erro ao consultar resumo de estudo por período:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 7. Consultar Sessões Detalhadas de uma Data Específica
app.get("/api/study-sessions/day/:dateStr", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const dateStr = String(req.params.dateStr || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "INVALID_DATE_FORMAT" });
    }

    const sessions = studySessionRepoInstance.getSessionsByDate(userId, dateStr);
    return res.json({ success: true, dateStr, sessions });
  } catch (err: any) {
    console.error("Erro ao obter sessões do dia:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// 8. Excluir horas de uma disciplina específica em uma data
app.delete("/api/study-sessions/day-subject", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const cleanDate = String(req.body?.dateStr || req.query?.dateStr || "");
    const cleanSubjectId = String(req.body?.subjectId || req.query?.subjectId || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate) || !cleanSubjectId) {
      return res.status(400).json({ error: "INVALID_PARAMS", message: "Data e disciplina são obrigatórias." });
    }

    studySessionRepoInstance.deleteByDateAndSubjectForUser(userId, cleanDate, cleanSubjectId);

    logAuditEvent({
      action: "STUDY_SESSION_DELETED",
      actor: (req as any).user?.username || userId,
      resource: "study_sessions",
      status: "SUCCESS",
      ip: getClientIp(req),
      details: { dateStr: cleanDate, subjectId: cleanSubjectId },
    });

    return res.json({ success: true, removed: true, dateStr: cleanDate, subjectId: cleanSubjectId });
  } catch (err: any) {
    console.error("Erro ao excluir horas da disciplina:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Falha ao excluir horas da disciplina." });
  }
});

// 9. Limpar todas as horas registradas em uma data específica
app.delete("/api/study-sessions/day/:dateStr", (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });

    const dateStr = String(req.params.dateStr || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "INVALID_DATE_FORMAT" });
    }

    studySessionRepoInstance.deleteByDateForUser(userId, dateStr);

    logAuditEvent({
      action: "STUDY_DAY_CLEARED",
      actor: (req as any).user?.username || userId,
      resource: "study_sessions",
      status: "SUCCESS",
      ip: getClientIp(req),
      details: { dateStr },
    });

    return res.json({ success: true, removed: true, dateStr });
  } catch (err: any) {
    console.error("Erro ao limpar horas do dia:", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Falha ao limpar horas do dia." });
  }
});

// ============================================================================
// 🛡️ AUTENTICAÇÃO E SECURITY GATE (Dragão Carmesim - 2FA TOTP)
// ============================================================================

// 2.7. Rota de Status de Segurança do Cliente (Turnstile check - sem revelar lógica interna)
app.get("/api/auth/security-status", (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const isAdm = isAdminIp(clientIp);
  const hasSecret = Boolean(process.env.TURNSTILE_SECRET_KEY);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEq86txU4BLgFVmp";

  return res.json({
    // Não expor clientIp nem isAdminIp — revelaria lógica interna de bypass
    turnstileRequired: hasSecret && !isAdm,
    siteKey,
  });
});

// 2.8. Rota de Verificação Prévia de Credenciais (Passo 1 do Login)
// Cadastro público protegido por chave de uso único emitida pelo Admin.
app.post("/api/auth/register", registrationLimiter, async (req: Request, res: Response) => {
  try {
    const { key, accountCreationKey, email, username, password, fullName, termsAccepted, privacyAccepted, policyVersion, termsVersion } = req.body || {};
    const keyToUse = key || accountCreationKey;
    const cleanKey = typeof keyToUse === 'string' ? keyToUse.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const cleanFullName = typeof fullName === 'string' ? fullName.trim() : cleanUsername;

    if (termsAccepted === false || privacyAccepted === false) {
      return res.status(400).json({
        success: false,
        error: 'CONSENT_REQUIRED',
        message: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade para criar a conta.',
      });
    }

    if (!cleanKey || !cleanEmail || !cleanEmail.includes('@') || !/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, error: 'INVALID_FIELDS', message: 'Informe uma chave válida, e-mail e username válidos.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, error: 'WEAK_PASSWORD', message: 'A senha deve possuir pelo menos 8 caracteres.' });
    }

    const keyHash = crypto.createHash('sha256').update(cleanKey, 'utf8').digest('hex');
    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(password, 12);

    const clientIp = getClientIp(req);
    const ipHash = clientIp ? crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 16) : null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

    const createdUser = databaseService.transaction(() => {
      const keyRow = rawDb.prepare(
        `SELECT id FROM account_creation_keys
         WHERE key_hash = ? AND used_at IS NULL
           AND (expires_at IS NULL OR expires_at > ?)
         LIMIT 1`
      ).get(keyHash, now) as any;

      if (!keyRow) throw new Error('INVALID_ACCOUNT_CREATION_KEY');
      if (userRepoInstance.findByEmail(cleanEmail) || userRepoInstance.findByUsername(cleanUsername)) {
        throw new Error('ACCOUNT_ALREADY_EXISTS');
      }

      const created = userRepoInstance.create({
        email: cleanEmail,
        username: cleanUsername,
        passwordHash,
        role: 'cadet',
        canAccessNotion: false,
      });
      profileRepoInstance.createOrUpdate({ userId: created.id, fullName: cleanFullName || cleanUsername });

      const consumed = rawDb.prepare(
        `UPDATE account_creation_keys
         SET used_at = ?, used_by_user_id = ?
         WHERE id = ? AND used_at IS NULL`
      ).run(now, created.id, keyRow.id);
      if (Number(consumed.changes || 0) !== 1) throw new Error('INVALID_ACCOUNT_CREATION_KEY');

      // Registra consentimento com versão do documento e hash de evidência (LGPD Art. 7, 8 e 9)
      consentRepoInstance.recordConsent({
        userId: created.id,
        category: 'necessary',
        policyVersion: typeof policyVersion === 'string' && policyVersion.trim() ? policyVersion.trim() : '1.0',
        termsVersion: typeof termsVersion === 'string' && termsVersion.trim() ? termsVersion.trim() : '1.0',
        status: 'granted',
        ipHash,
        userAgent,
      });

      return created;
    });

    logSecurityEvent(req, {
      action: 'ACCOUNT_REGISTERED',
      actor: createdUser.username,
      actorUserId: createdUser.id,
      targetType: 'user',
      targetId: createdUser.id,
      userId: createdUser.id,
      resource: `/users/${createdUser.id}`,
      status: 'SUCCESS',
      details: { registration: 'ACCOUNT_CREATION_KEY' },
    });

    return res.status(201).json({ success: true, message: 'Conta criada com sucesso. Agora entre com seu usuário e senha.' });
  } catch (err: any) {
    if (err?.message === 'INVALID_ACCOUNT_CREATION_KEY') {
      return res.status(403).json({ success: false, error: 'INVALID_ACCOUNT_CREATION_KEY', message: 'Chave inválida, expirada ou já utilizada.' });
    }
    if (err?.message === 'ACCOUNT_ALREADY_EXISTS' || /UNIQUE constraint|duplicate key/i.test(String(err?.message || ''))) {
      return res.status(409).json({ success: false, error: 'ACCOUNT_ALREADY_EXISTS', message: 'E-mail ou username já cadastrado.' });
    }
    console.error('[Auth Register]', err);
    return res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR', message: 'Falha interna ao criar a conta.' });
  }
});

app.post("/api/auth/check-credentials", authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password, turnstileToken } = req.body || {};
    const inputUser = (email || username || "").trim().toLowerCase();
    const clientIp = getClientIp(req);
    const isAdmIp = isAdminIp(clientIp);

    if (!inputUser || !password) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "E-mail e senha são obrigatórios.",
      });
    }

    // 1. Verificação Cloudflare Turnstile (Bypass automático se não configurado ou para IP do Admin)
    const hasSecret = Boolean(process.env.TURNSTILE_SECRET_KEY);
    if (hasSecret && !isAdmIp) {
      const token = turnstileToken || (req.headers["cf-turnstile-response"] as string);
      const isTurnstileValid = await verifyTurnstileToken(token, clientIp);
      if (!isTurnstileValid) {
        return res.status(403).json({
          success: false,
          error: "TURNSTILE_FAILED",
          message: "Validação de segurança anti-bot Cloudflare Turnstile pendente ou inválida.",
        });
      }
    }

    const dbUser = await authServiceInstance.verifyCredentials(inputUser, password);
    if (!dbUser) {
      logSecurityEvent(req, { action: 'LOGIN_FAILED', actor: inputUser, resource: '/api/auth/check-credentials', status: 'FAILED' });
      return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS', message: 'Credenciais de acesso inválidas.' });
    }
    if (dbUser.role !== 'admin') {
      const loginResult = await authServiceInstance.login(inputUser, password, {
        ip: clientIp,
        userAgent: (req.headers["user-agent"] as string) || undefined,
        rememberMe: req.body.rememberMe === true,
      });
      if (!loginResult.success) {
        return res.status(403).json({ success: false, error: 'LOGIN_BLOCKED', message: loginResult.message });
      }
      if (loginResult.token && loginResult.expiresAt) {
        setSessionCookie(res, loginResult.token, Date.parse(loginResult.expiresAt));
      }
      return res.json({
        success: true,
        directLogin: true,
        token: loginResult.token,
        expiresAt: loginResult.expiresAt ? Date.parse(loginResult.expiresAt) : undefined,
        username: dbUser.username,
        role: dbUser.role,
        canAccessNotion: dbUser.canAccessNotion,
        canAccessIfrj: dbUser.canAccessIfrj,
      });
    }

    // 2. Geo-fencing: Conta Admin só é acessível a partir do Brasil
    const isAdminTarget =
      dbUser.role === 'admin';

    if (isAdminTarget && !isAdmIp) {
      const geo = await getIpGeoLocation(clientIp, req);
      if (geo.country && geo.country !== "BR" && geo.country !== "UNKNOWN") {
        // Registra evento de segurança sem banir o IP permanentemente
        logSecurityEvent(req, {
          action: "ADMIN_LOGIN_FAILED",
          actor: inputUser,
          resource: "/api/auth/check-credentials",
          status: "FAILED",
          details: { reason: `Acesso fora do Brasil bloqueado [País: ${geo.country}]`, geo },
        });

        return res.status(403).json({
          success: false,
          error: "GEO_BLOCKED",
          message: "ACESSO BLOQUEADO: Conexões fora do território nacional são restritas para esta conta.",
        });
      }
    }

    const config = getSecurityConfig();
    if (config.is2faActive) {
      return res.json({
        success: true,
        message: "Credenciais válidas. Prossiga para o código Authenticator.",
        requireTotp: true,
        challenge: createLoginChallenge(dbUser),
      });
    }

    const session = createTerminalSession(dbUser.username, req.body.rememberMe !== false, dbUser.role);
    setSessionCookie(res, session.token, session.expiresAt);
    logSecurityEvent(req, {
      action: 'LOGIN_SUCCESS',
      actor: dbUser.username,
      resource: '/api/auth/check-credentials',
      status: 'SUCCESS',
    });
    logSecurityEvent(req, {
      action: 'ADMIN_LOGIN',
      actor: dbUser.username,
      resource: '/api/auth/check-credentials',
      status: 'SUCCESS',
      details: { role: 'admin', method: 'PASSWORD_DIRECT', rememberMe: req.body.rememberMe !== false },
    });
    return res.json({
      success: true,
      directLogin: true,
      ...session,
      username: dbUser.username,
      role: dbUser.role,
      canAccessNotion: true,
      canAccessIfrj: true,
    });
  } catch (err: any) {
    console.error('[Auth]', err);
    return res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 3. Rota de Validação de Código Authenticator / Recovery Code (com twoFactorLimiter anti-força bruta)
app.post("/api/auth/verify-2fa", twoFactorLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password, token, recoveryCode, rememberMe, turnstileToken, challenge } = req.body || {};
    const inputUser = (username || email || "").trim().toLowerCase();
    const clientIp = getClientIp(req);
    const challengedUser = verifyLoginChallenge(challenge);
    const isAdmIp = isAdminIp(clientIp) || Boolean(challengedUser);

    if (!inputUser || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Usuário e senha são obrigatórios.",
      });
    }

    // 1. Verificação Cloudflare Turnstile (Bypass para Admin IP)
    if (!isAdmIp) {
      const turnstile = turnstileToken || (req.headers["cf-turnstile-response"] as string);
      const isTurnstileValid = await verifyTurnstileToken(turnstile, clientIp);
      if (!isTurnstileValid) {
        return res.status(403).json({
          error: "TURNSTILE_FAILED",
          message: "Validação de segurança anti-bot Cloudflare Turnstile pendente ou inválida.",
        });
      }
    }

    const dbUser = challengedUser || await authServiceInstance.verifyCredentials(inputUser, password);
    if (!dbUser || dbUser.role !== 'admin') {
      logSecurityEvent(req, { action: 'ADMIN_LOGIN_FAILED', actor: inputUser, resource: '/api/auth/verify-2fa', status: 'FAILED' });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Credenciais de acesso inválidas.' });
    }
    const cleanUser = dbUser.username;

    // 2. Geo-fencing: Conta Admin só pode ser acessada a partir do Brasil
    const isAdminTarget = dbUser.role === 'admin';

    if (isAdminTarget && !isAdmIp) {
      const geo = await getIpGeoLocation(clientIp, req);
      if (geo.country && geo.country !== "BR" && geo.country !== "UNKNOWN") {
        // Registra evento de segurança sem banir o IP permanentemente
        logSecurityEvent(req, {
          action: "ADMIN_LOGIN_FAILED",
          actor: cleanUser,
          resource: "/api/auth/verify-2fa",
          status: "FAILED",
          details: { reason: `Acesso 2FA fora do Brasil bloqueado [País: ${geo.country}]`, geo },
        });

        return res.status(403).json({
          error: "GEO_BLOCKED",
          message: "ACESSO BLOQUEADO: Conexões fora do território nacional são restritas para esta conta.",
        });
      }
    }

    const config = getSecurityConfig();
    let authMethod = "TOTP";

    // Validação de 2FA: TOTP ou Recovery Code de uso único
    if (!token && !recoveryCode) {
      return res.status(400).json({
        error: "2FA_REQUIRED",
        message: "Código Google Authenticator de 6 dígitos ou Recovery Code é obrigatório.",
      });
    }

    if (token) {
      if (typeof token !== "string" || token.trim().length !== 6) {
        return res.status(400).json({
          error: "TOTP_REQUIRED",
          message: "Código Google Authenticator de 6 dígitos é obrigatório.",
        });
      }

      const isCodeValid = verifyTotpToken(token, config.totpSecret);
      if (!isCodeValid) {
        logSecurityEvent(req, {
          action: "2FA_FAILED",
          actor: cleanUser,
          resource: "/api/auth/verify-2fa",
          status: "FAILED",
          details: { reason: "Código TOTP inválido ou expirado" },
        });
        return res.status(401).json({
          error: "INVALID_TOTP",
          message: "Código Authenticator incorreto ou expirado. Verifique o relógio do seu celular.",
        });
      }
      authMethod = "TOTP";
    } else if (recoveryCode) {
      const userId = dbUser.id;

      const isRecoveryValid = recoveryCodeRepoInstance.verifyAndConsumeCode(userId, String(recoveryCode));
      if (!isRecoveryValid) {
        logSecurityEvent(req, {
          action: "2FA_FAILED",
          actor: cleanUser,
          resource: "/api/auth/verify-2fa",
          status: "FAILED",
          details: { reason: "Recovery code inválido ou já utilizado" },
        });
        return res.status(401).json({
          error: "INVALID_RECOVERY_CODE",
          message: "Código de recuperação inválido ou já utilizado.",
        });
      }
      authMethod = "RECOVERY_CODE";
    }

    const session = createTerminalSession(cleanUser, rememberMe !== false, "admin");
    setSessionCookie(res, session.token, session.expiresAt);
    logSecurityEvent(req, {
      action: "2FA_SUCCESS",
      actor: cleanUser,
      resource: "/api/auth/verify-2fa",
      status: "SUCCESS",
      details: { method: authMethod },
    });
    logSecurityEvent(req, {
      action: "ADMIN_LOGIN",
      actor: cleanUser,
      resource: "/api/auth/verify-2fa",
      status: "SUCCESS",
      details: { role: "admin", rememberMe: rememberMe !== false, method: authMethod },
    });
    console.log(`[Terminal CFO CBMERJ] Acesso autenticado via 2FA (${authMethod}) para '${cleanUser}' (30 dias: ${rememberMe !== false})`);

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      username: cleanUser,
      role: "admin",
      canAccessNotion: true,
      canAccessIfrj: true,
      rememberMe: rememberMe !== false,
      is2faActive: true,
      expiresInDays: rememberMe !== false ? 30 : 1,
      authMethod,
    });
  } catch (err: any) {
    console.error('[2FA]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 4. Rota de Ativação Permanente do 2FA (Ao confirmar o primeiro código dentro do site)
app.post("/api/auth/activate-2fa", async (req: Request, res: Response) => {
  try {
    const sessionToken = requestSessionToken(req);
    const sessionResult = verifyTerminalSession(sessionToken);

    if (!sessionResult.valid || sessionResult.role !== "admin") {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Sessão inválida para ativação do 2FA." });
    }

    const { token } = req.body || {};
    if (!token || token.trim().length !== 6) {
      return res.status(400).json({ error: "INVALID_CODE", message: "Digite o código de 6 dígitos gerado no Google Authenticator." });
    }

    const config = getSecurityConfig();
    const isCodeValid = verifyTotpToken(token, config.totpSecret);
    if (!isCodeValid) {
      return res.status(400).json({
        error: "INVALID_TOTP",
        message: "Código incorreto. Sincronize o relógio do celular e tente o código atual gerado pelo app.",
      });
    }

    // Ativa permanentemente o 2FA
    config.is2faActive = true;
    saveSecurityConfig(config);
    console.log(`[Terminal CFO CBMERJ] ✅ 2FA ATIVADO PERMANENTEMENTE PARA ${ADMIN_USER}!`);

    return res.json({
      success: true,
      message: "Blindagem 2FA ativada com sucesso! O QR Code não será mais exibido e o código será solicitado nos próximos logins.",
      is2faActive: true,
    });
  } catch (err: any) {
    console.error('[2FA activation]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 5. Rota de Verificação de Sessão Ativa
app.post("/api/auth/verify-session", (req: Request, res: Response) => {
  const token = requestSessionToken(req);

  const result = verifyTerminalSession(token);
  if (!result.valid) {
    return res.status(401).json({ valid: false, message: "Sessão expirada ou terminal bloqueado." });
  }

  const config = getSecurityConfig();
  if (token && result.expiresAt) setSessionCookie(res, token, result.expiresAt);

  return res.json({
    valid: true,
    username: result.username,
    role: result.role,
    canAccessNotion: result.canAccessNotion,
    canAccessIfrj: result.canAccessIfrj,
    expiresAt: result.expiresAt,
    sessionId: result.sessionId,
    isImpersonation: Boolean(result.impersonatedByUserId),
    impersonatedByUserId: result.impersonatedByUserId || null,
    is2faActive: config.is2faActive,
  });
});

// 6. Rota de Logout (Revogação Segura de Sessão)
app.post("/api/admin/impersonation/start", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminSession = (req as any).user;
    const targetUserId = typeof req.body?.targetUserId === 'string' ? req.body.targetUserId.trim() : '';
    const targetUser = targetUserId ? userRepoInstance.findById(targetUserId) : null;
    if (!targetUser) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'Conta nao encontrada.' });
    if (targetUser.role === 'admin') return res.status(400).json({ success: false, error: 'ADMIN_TARGET_NOT_ALLOWED', message: 'A visao de outra conta admin nao pode ser assumida.' });
    if (targetUser.status !== 'active') return res.status(400).json({ success: false, error: 'USER_INACTIVE', message: 'A conta precisa estar ativa.' });

    const created = sessionRepoInstance.createSession({
      userId: targetUser.id,
      role: targetUser.role,
      ip: getClientIp(req),
      userAgent: (req.headers['user-agent'] as string) || null,
      expiresInDays: 1,
      impersonatedByUserId: adminSession.userId,
      parentSessionId: adminSession.sessionId,
    });
    const profile = profileRepoInstance.findByUserId(targetUser.id);
    setSessionCookie(res, created.rawToken, Date.parse(created.session.expiresAt));
    logSecurityEvent(req, {
      action: 'IMPERSONATION_STARTED',
      actor: adminSession.username || 'admin',
      actorUserId: adminSession.userId || null,
      targetType: 'user',
      targetId: targetUser.id,
      resource: `/admin/impersonation/${targetUser.id}`,
      status: 'SUCCESS',
      userId: targetUser.id,
      details: { targetUsername: targetUser.username },
    });
    return res.json({
      success: true,
      token: created.rawToken,
      expiresAt: Date.parse(created.session.expiresAt),
      username: targetUser.username,
      role: targetUser.role,
      canAccessNotion: targetUser.canAccessNotion,
      profile: { id: targetUser.id, fullName: profile?.fullName || targetUser.username, avatarUrl: profile?.avatarUrl || null },
    });
  } catch (err: any) {
    console.error('[Admin Impersonation Start Error]:', err);
    return res.status(500).json({ success: false, message: 'Erro ao trocar de conta.' });
  }
});

app.post("/api/auth/impersonation/stop", requireUserAuth, (req: Request, res: Response) => {
  try {
    const session = (req as any).user;
    if (!session.impersonatedByUserId) return res.status(400).json({ success: false, message: 'Esta sessao nao e uma troca de conta.' });
    const token = requestSessionToken(req) || '';
    if (token) sessionRepoInstance.revokeSession(token);
    const adminUser = userRepoInstance.findById(session.impersonatedByUserId);
    if (!adminUser || adminUser.role !== 'admin' || adminUser.status !== 'active') {
      clearSessionCookie(res);
      return res.status(403).json({ success: false, message: 'A sessao administrativa original nao esta mais disponivel.' });
    }
    const restored = sessionRepoInstance.createSession({
      userId: adminUser.id,
      role: 'admin',
      ip: getClientIp(req),
      userAgent: (req.headers['user-agent'] as string) || null,
      expiresInDays: 1,
    });
    setSessionCookie(res, restored.rawToken, Date.parse(restored.session.expiresAt));
    logSecurityEvent(req, {
      action: 'IMPERSONATION_STOPPED',
      actor: session.username || 'impersonated_user',
      actorUserId: session.userId || null,
      targetType: 'admin_session',
      targetId: session.impersonatedByUserId,
      resource: '/api/auth/impersonation/stop',
      status: 'SUCCESS',
      userId: session.userId || null,
    });
    return res.json({ success: true, adminUserId: session.impersonatedByUserId, expiresAt: Date.parse(restored.session.expiresAt) });
  } catch (err: any) {
    console.error('[Impersonation Stop Error]:', err);
    return res.status(500).json({ success: false, message: 'Erro ao voltar para a conta ADM.' });
  }
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  const token = requestSessionToken(req);
  if (token) {
    authServiceInstance.logout(token, getClientIp(req));
    try {
      sessionRepoInstance.revokeSession(token);
    } catch {}
    logSecurityEvent(req, {
      action: "LOGOUT",
      actor: "authenticated_session",
      resource: "/api/auth/logout",
      status: "SUCCESS",
    });
  }
  clearSessionCookie(res);
  return res.json({ success: true, message: "Sessão encerrada com sucesso." });
});

// 7. Rota de Solicitação de Recuperação de Senha (Código de 6 dígitos enviado com validade de 15min)
app.post("/api/auth/forgot-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    const clientIp = getClientIp(req);
    const result = await authServiceInstance.requestPasswordReset(email, clientIp);
    logSecurityEvent(req, {
      action: "PASSWORD_RESET_REQUEST",
      actor: (email || "").trim().toLowerCase() || "unknown",
      resource: "/api/auth/forgot-password",
      status: "SUCCESS",
      details: { email },
    });
    // 🛡️ Segurança: debugCode NUNCA é retornado em produção ou desenvolvimento
    const isTest = process.env.NODE_ENV === 'test';
    return res.json({
      success: result.success,
      message: result.message,
      ...(isTest && result.debugCode ? { debugCode: result.debugCode } : {}),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao processar solicitação de recuperação." });
  }
});

// 8. Rota de Confirmação de Recuperação de Senha (Valida código de uso único e define nova senha)
app.post("/api/auth/reset-password", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body || {};
    const clientIp = getClientIp(req);
    const result = await authServiceInstance.confirmPasswordReset(email, code, newPassword, clientIp);
    logSecurityEvent(req, {
      action: "PASSWORD_CHANGED",
      actor: (email || "").trim().toLowerCase() || "unknown",
      resource: "/api/auth/reset-password",
      status: result.success ? "SUCCESS" : "FAILED",
      details: { method: "RESET_CODE", reason: result.message },
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao redefinir senha." });
  }
});

// 9. Rota de Alteração de Senha (Autenticada)
app.post("/api/auth/change-password", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { currentPassword, newPassword } = req.body || {};
    const clientIp = getClientIp(req);

    const result = await authServiceInstance.changePassword(user.userId || user.username, currentPassword, newPassword, clientIp);
    logSecurityEvent(req, {
      action: "PASSWORD_CHANGED",
      actor: user.username || user.userId,
      resource: "/api/auth/change-password",
      status: result.success ? "SUCCESS" : "FAILED",
      userId: user.userId,
      details: { method: "AUTHENTICATED_CHANGE", reason: result.message },
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao alterar senha." });
  }
});

// 10. Rota de Atualização de E-mail (Autenticada com verificação adequada de senha e unicidade server-side)
app.post("/api/auth/update-email", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { newEmail, currentPassword } = req.body || {};
    const clientIp = getClientIp(req);

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        message: "A confirmação da senha atual é obrigatória para autorizar a alteração de e-mail.",
      });
    }

    const result = await authServiceInstance.updateEmail(user.userId || user.username, newEmail, currentPassword, clientIp);
    logSecurityEvent(req, {
      action: "EMAIL_VERIFIED",
      actor: user.username || user.userId,
      resource: "/api/auth/update-email",
      status: result.success ? "SUCCESS" : "FAILED",
      userId: user.userId,
      details: { newEmail, reason: result.message },
    });
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao atualizar e-mail." });
  }
});

// ============================================================================
// 🛡️ MONITORAMENTO DE AUTENTICAÇÃO E SEGURANÇA (Admin -> Segurança)
// ============================================================================

// 11. Consulta Paginada e Filtrada de Eventos de Auditoria e Segurança (Restrito a Admin e Suporte)
app.get("/api/admin/security/events", requireAdminOnlyAuth, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const action = req.query.action ? String(req.query.action).trim() : undefined;
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const actor = req.query.actor ? String(req.query.actor).trim() : undefined;
    const actorUserId = req.query.actorUserId ? String(req.query.actorUserId).trim() : undefined;
    const resource = req.query.resource ? String(req.query.resource).trim() : undefined;
    const targetType = req.query.targetType ? String(req.query.targetType).trim() : undefined;
    const targetId = req.query.targetId ? String(req.query.targetId).trim() : undefined;
    const ip = req.query.ip ? String(req.query.ip).trim() : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate).trim() : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate).trim() : undefined;

    const result = auditRepoInstance.findFiltered({
      page,
      limit,
      action,
      status,
      actor,
      actorUserId,
      resource,
      targetType,
      targetId,
      ip,
      search,
      startDate,
      endDate,
    });

    const safeItems = sanitizeSecurityPayload(result.items);
    return res.json({
      success: true,
      ...result,
      items: safeItems,
      logs: safeItems,
    });
  } catch (err: any) {
    console.error("[Admin Security Events Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao buscar eventos de segurança." });
  }
});

// 12. Métricas de Segurança e Detecção de Anomalias em Tempo Real (Restrito a Admin)
app.get("/api/admin/security/metrics", requireAdminOnlyAuth, (_req: Request, res: Response) => {
  try {
    const metrics = auditRepoInstance.getSecurityMetrics();
    return res.json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    console.error("[Admin Security Metrics Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao carregar métricas de segurança." });
  }
});

// 12.1. Telemetria e Eventos da Camada de Decepção Defensiva (Honeypot & Honeytokens)
app.get("/api/admin/honeypot/events", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const honeypotRepo = new HoneypotRepository(getDb().getRawDb());
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const eventType = req.query.eventType ? String(req.query.eventType).trim() : undefined;
    const minRisk = req.query.minRisk ? parseInt(String(req.query.minRisk), 10) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate).trim() : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate).trim() : undefined;

    const result = honeypotRepo.findFiltered({
      page,
      limit,
      eventType,
      minRisk,
      search,
      startDate,
      endDate,
    });

    return res.json({
      success: true,
      ...result,
      items: sanitizeSecurityPayload(result.items),
    });
  } catch (err: any) {
    console.error("[Admin Honeypot Events Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao carregar eventos da camada de decepção." });
  }
});

app.get("/api/admin/honeypot/metrics", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const honeypotRepo = new HoneypotRepository(getDb().getRawDb());
    const metrics = honeypotRepo.getMetrics();
    return res.json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    console.error("[Admin Honeypot Metrics Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao carregar métricas de honeypot." });
  }
});

app.post("/api/admin/honeypot/unblock", requireAdminWriteAuth, (req: Request, res: Response) => {
  try {
    const { ip } = req.body || {};
    if (!ip || typeof ip !== "string") {
      return res.status(400).json({ success: false, message: "Endereço IP é obrigatório para desbloqueio." });
    }

    const cleanIp = ip.trim().replace(/^::ffff:/, "");
    const blockRepo = new TemporarySourceBlockRepository(getDb().getRawDb());
    const unblocked = blockRepo.unblockIp(cleanIp);

    logAuditEvent({
      eventType: 'SUSPICIOUS_ACCESS_DENIED',
      action: 'ADMIN_SOURCE_UNBLOCKED',
      actor: (req as any).user?.username || 'admin',
      userId: (req as any).user?.id || null,
      status: 'SUCCESS',
      ip: getClientIp(req),
      details: { unblockedIp: cleanIp, targetType: 'ip' },
    });

    return res.json({
      success: true,
      unblocked,
      message: unblocked ? "Origem desbloqueada com sucesso." : "Nenhum bloqueio ativo encontrado para esta origem.",
    });
  } catch (err: any) {
    console.error("[Admin Honeypot Unblock Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao processar desbloqueio de origem." });
  }
});

// 13. Verificação de Acesso Administrativo (Handshake seguro para /admin)
app.get("/api/admin/verify", requireAdminAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  return res.json({
    success: true,
    verified: true,
    user: {
      username: adminUser.username,
      role: adminUser.role,
      expiresAt: adminUser.expiresAt,
    },
  });
});

// 13.0. Transmissão em Tempo Real para o Painel Administrativo (Server-Sent Events)
app.get("/api/admin/realtime/stream", requireAdminOnlyAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const lastEventId = (req.headers["last-event-id"] as string) || (req.query.lastEventId as string) || undefined;

  // Configuração estrita de headers SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const streamToken = req.headers.authorization?.slice(7) || '';
  const clientId = adminRealtimeHub.addClient(res, adminUser.username, lastEventId, () => {
    const session = verifyTerminalSession(streamToken);
    return session.valid && (session.role === 'admin' || session.role === 'support');
  });

  req.on("close", () => {
    adminRealtimeHub.removeClient(clientId);
  });
});

// 13.1. Elevação de Privilégios / Confirmação de Identidade (Step-Up Authentication - 5 minutos)
app.post("/api/admin/step-up", requireAdminAuth, twoFactorLimiter, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { password, totpCode } = req.body || {};
    const config = getSecurityConfig();

    if (!password && !totpCode) {
      return res.status(400).json({
        error: "MISSING_CREDENTIAL",
        message: "Informe a senha do administrador ou o código TOTP para confirmar a operação.",
      });
    }

    let isAuthorized = false;

    // 1. Verificação por Código TOTP
    if (totpCode) {
      if (verifyTotpToken(String(totpCode), config.totpSecret)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && password && adminUser.userId) {
      const dbUser = userRepoInstance.findById(adminUser.userId);
      isAuthorized = !!dbUser && await safeComparePassword(String(password), dbUser.passwordHash);
    }

    if (!isAuthorized) {
      logSecurityEvent(req, {
        action: "2FA_FAILED",
        actor: adminUser.username || "admin",
        resource: "/api/admin/step-up",
        status: "FAILED",
        details: { reason: "Credencial incorreta na confirmação de Step-Up" },
      });
      return res.status(401).json({
        error: "INVALID_STEP_UP_CREDENTIALS",
        message: "Credencial de confirmação incorreta. Acesso sensível negado.",
      });
    }

    const { token: stepUpToken, expiresIn } = createStepUpToken(adminUser.username, adminUser.userId);

    logSecurityEvent(req, {
      action: "2FA_SUCCESS",
      actor: adminUser.username || "admin",
      resource: "/api/admin/step-up",
      status: "SUCCESS",
      details: { stepUp: true, expiresIn },
    });

    return res.json({
      success: true,
      stepUpToken,
      expiresIn,
      message: "Confirmação de identidade realizada com sucesso.",
    });
  } catch (err: any) {
    console.error('[Step-up]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 13.2. Geração de Novos Códigos de Recuperação (Requer Step-Up prévio)
app.post("/api/admin/2fa/generate-recovery-codes", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    let targetUser = adminUser.userId ? userRepoInstance.findById(adminUser.userId) : null;
    if (!targetUser) {
      targetUser = userRepoInstance.findByUsername(adminUser.username) || userRepoInstance.findByUsername(ADMIN_USER);
    }
    const userId = targetUser ? targetUser.id : (adminUser.userId || "admin-default-id");

    const { rawCodes, count } = recoveryCodeRepoInstance.generateCodesForUser(userId, 8);

    logSecurityEvent(req, {
      action: "RECOVERY_CODES_GENERATED",
      actor: adminUser.username || "admin",
      resource: "/api/admin/2fa/generate-recovery-codes",
      status: "SUCCESS",
      details: { count },
    });

    return res.json({
      success: true,
      codes: rawCodes,
      count,
      message: "Novos códigos de recuperação gerados com sucesso. Guarde-os em local seguro!",
    });
  } catch (err: any) {
    console.error('[Recovery codes]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 13.3. Consulta de Quantidade de Recovery Codes Restantes
app.get("/api/admin/2fa/recovery-codes-count", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    let targetUser = adminUser.userId ? userRepoInstance.findById(adminUser.userId) : null;
    if (!targetUser) {
      targetUser = userRepoInstance.findByUsername(adminUser.username) || userRepoInstance.findByUsername(ADMIN_USER);
    }
    const userId = targetUser ? targetUser.id : (adminUser.userId || "admin-default-id");
    const remainingCount = recoveryCodeRepoInstance.getRemainingCount(userId);

    return res.json({
      success: true,
      remainingCount,
    });
  } catch (err: any) {
    console.error('[Recovery count]', err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 14. Dashboard Administrativo (Métricas Consolidadas em Tempo Real)
app.get("/api/admin/dashboard", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const userStats = userRepoInstance.getDashboardStats();
    const securityMetrics = auditRepoInstance.getSecurityMetrics();
    const activeSessions = sanitizeSecurityPayload(sessionRepoInstance.listActiveSessions(10));
    const recentEvents = auditRepoInstance.findFiltered({ limit: 10 });

    return res.json({
      success: true,
      stats: {
        totalUsers: userStats.totalUsers,
        activeUsers24h: userStats.activeUsers24h,
        newUsers30d: userStats.newUsers30d,
        suspendedUsers: userStats.suspendedUsers,
        adminCount: userStats.adminCount,
        loginSuccess24h: securityMetrics.loginSuccess24h,
        loginFailed24h: securityMetrics.loginFailed24h,
        twoFactorFailed24h: securityMetrics.twoFactorFailed24h,
        anomalousIpsCount: securityMetrics.anomalousIps.length,
      },
      anomalies: sanitizeSecurityPayload(securityMetrics.anomalousIps),
      recentSessions: activeSessions,
      recentEvents: sanitizeSecurityPayload(recentEvents.items),
    });
  } catch (err: any) {
    console.error("[Admin Dashboard Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao carregar dados do dashboard." });
  }
});

// 15. Consulta Paginada e Filtrada de Usuários (Admin)
// Chaves de cadastro: o valor bruto só é retornado no momento da geração.
app.get("/api/admin/account-keys", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const rows = rawDb.prepare(
      `SELECT k.id, k.created_at, k.used_at, k.expires_at,
              k.used_by_user_id, u.username AS used_by_username
       FROM account_creation_keys k
       LEFT JOIN users u ON u.id = k.used_by_user_id
       ORDER BY k.created_at DESC
       LIMIT 30`
    ).all() as any[];
    return res.json({
      success: true,
      keys: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        usedAt: row.used_at,
        expiresAt: row.expires_at,
        usedByUsername: row.used_by_username || null,
        isUsed: Boolean(row.used_at),
        isExpired: Boolean(row.expires_at && Date.parse(row.expires_at) <= Date.now()),
      })),
    });
  } catch (err: any) {
    console.error('[Admin Account Keys List]', err);
    return res.status(500).json({ success: false, message: 'Erro ao listar chaves de cadastro.' });
  }
});

app.post("/api/admin/account-keys", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const rawKey = `CFO-${crypto.randomBytes(18).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    rawDb.prepare(
      `INSERT INTO account_creation_keys (id, key_hash, created_by_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, keyHash, adminUser.userId, createdAt, expiresAt);

    logSecurityEvent(req, {
      action: 'ACCOUNT_CREATION_KEY_GENERATED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.userId || null,
      targetType: 'account_creation_key',
      targetId: id,
      resource: `/account-creation-keys/${id}`,
      status: 'SUCCESS',
      details: { expiresAt },
    });

    return res.status(201).json({
      success: true,
      key: { id, rawKey, createdAt, expiresAt },
      message: 'Chave gerada. Copie agora: ela não será exibida novamente.',
    });
  } catch (err: any) {
    console.error('[Admin Account Key Generate]', err);
    return res.status(500).json({ success: false, message: 'Erro ao gerar chave de cadastro.' });
  }
});

app.get("/api/admin/users", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const role = req.query.role ? String(req.query.role).trim() : undefined;
    const status = req.query.status ? String(req.query.status).trim() : undefined;

    const result = userRepoInstance.findAdminFiltered({
      page,
      limit,
      search,
      role,
      status,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[Admin Users Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao listar usuários." });
  }
});

// 15.1. Consulta Detalhada de Usuário Específico (Admin ou Support - Sem vazamento de senhas)
app.get("/api/admin/users/:id", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const targetUser = userRepoInstance.findById(userId);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "Usuário não encontrado no sistema.",
      });
    }

    const profile = profileRepoInstance.findByUserId(targetUser.id);
    const activeSessions = sanitizeSecurityPayload(sessionRepoInstance.listActiveSessionsByUserId(targetUser.id));
    const securityEvents = sanitizeSecurityPayload(auditRepoInstance.findEventsByUserId(targetUser.id, 25));

    // DADOS PROTEGIDOS: Senhas, hashes, totp e recovery codes NUNCA são expostos
    const adminUser = (req as any).user;
    logSecurityEvent(req, {
      action: 'USER_VIEWED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: targetUser.id,
      userId: targetUser.id,
      resource: `/users/${targetUser.id}`,
      status: 'SUCCESS',
      details: {
        viewedUsername: targetUser.username,
        viewedEmail: targetUser.email,
        viewedRole: targetUser.role,
      },
    });

    return res.json({
      success: true,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        role: targetUser.role,
        status: targetUser.status,
        canAccessNotion: targetUser.role === 'admin' || targetUser.canAccessNotion,
        canAccessIfrj: targetUser.role === 'admin' || targetUser.canAccessIfrj,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
        profile: {
          fullName: profile?.fullName || targetUser.username,
          phone: profile?.phone || null,
          targetExam: profile?.targetExam || null,
          bio: profile?.bio || null,
          avatarUrl: profile?.avatarUrl || null,
        },
        activeSessions,
        securityEvents,
      },
    });
  } catch (err: any) {
    console.error("[Admin User Detail Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao obter detalhes do usuário." });
  }
});

// 16. Alterar Status de Conta de Usuário (Suspender ou Reativar - Requer Step-Up e Admin pleno)
app.post("/api/admin/users", requireAdminWriteAuth, requireStepUpAuth, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { email, username, password, role = 'cadet', fullName, phone, canAccessNotion = false, canAccessIfrj = false } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    const cleanFullName = typeof fullName === 'string' ? fullName.trim() : cleanUsername;

    if (!cleanEmail || !cleanEmail.includes('@') || !/^[a-z0-9._-]{3,32}$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: "Informe um e-mail e username validos." });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, message: "A senha deve possuir pelo menos 8 caracteres." });
    }
    if (!['cadet', 'support', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: "Papel invalido." });
    }
    if (userRepoInstance.findByEmail(cleanEmail) || userRepoInstance.findByUsername(cleanUsername)) {
      return res.status(409).json({ success: false, message: "E-mail ou username ja cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const createdUser = userRepoInstance.create({
      email: cleanEmail,
      username: cleanUsername,
      passwordHash,
      role: role as UserRole,
      canAccessNotion: role === 'admin' || Boolean(canAccessNotion),
      canAccessIfrj: role === 'admin' || Boolean(canAccessIfrj),
    });
    profileRepoInstance.createOrUpdate({
      userId: createdUser.id,
      fullName: cleanFullName || cleanUsername,
      phone: typeof phone === 'string' ? phone.trim() || null : null,
    });

    logSecurityEvent(req, {
      action: 'USER_CREATED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: createdUser.id,
      resource: `/users/${createdUser.id}`,
      status: 'SUCCESS',
      userId: createdUser.id,
      newState: { role: createdUser.role, canAccessNotion: createdUser.canAccessNotion, canAccessIfrj: createdUser.canAccessIfrj },
      details: { targetUsername: createdUser.username, targetEmail: createdUser.email },
    });

    return res.status(201).json({
      success: true,
      message: "Conta criada com sucesso.",
      user: {
        id: createdUser.id,
        email: createdUser.email,
        username: createdUser.username,
        role: createdUser.role,
        status: createdUser.status,
        canAccessNotion: createdUser.role === 'admin' || createdUser.canAccessNotion,
        canAccessIfrj: createdUser.role === 'admin' || createdUser.canAccessIfrj,
      },
    });
  } catch (err: any) {
    console.error("[Admin Create User Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao criar conta." });
  }
});

app.patch("/api/admin/users/:id/notion-access", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const targetUser = userRepoInstance.findById(req.params.id);
    const requestedAccess = req.body?.canAccessNotion;

    if (!targetUser) return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuario nao encontrado." });
    if (typeof requestedAccess !== 'boolean') return res.status(400).json({ success: false, message: "Informe canAccessNotion como booleano." });
    if (targetUser.role === 'admin' && !requestedAccess) return res.status(400).json({ success: false, message: "Administradores sempre mantem acesso ao Notion." });

    const previousAccess = targetUser.role === 'admin' || targetUser.canAccessNotion;
    userRepoInstance.updateNotionAccess(targetUser.id, requestedAccess);
    logSecurityEvent(req, {
      action: 'NOTION_ACCESS_CHANGED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: targetUser.id,
      resource: `/users/${targetUser.id}/notion-access`,
      status: 'SUCCESS',
      userId: targetUser.id,
      previousState: { canAccessNotion: previousAccess },
      newState: { canAccessNotion: requestedAccess },
      details: { targetUsername: targetUser.username },
    });
    return res.json({ success: true, message: requestedAccess ? "Acesso ao Notion liberado." : "Acesso ao Notion removido.", user: { id: targetUser.id, username: targetUser.username, canAccessNotion: requestedAccess } });
  } catch (err: any) {
    console.error("[Admin Notion Access Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao alterar acesso ao Notion." });
  }
});

app.patch("/api/admin/users/:id/ifrij-access", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const targetUser = userRepoInstance.findById(req.params.id);
    const requestedAccess = req.body?.canAccessIfrj;
    if (!targetUser) return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuario nao encontrado." });
    if (typeof requestedAccess !== 'boolean') return res.status(400).json({ success: false, message: "Informe canAccessIfrj como booleano." });
    if (targetUser.role === 'admin' && !requestedAccess) return res.status(400).json({ success: false, message: "Administradores sempre mantem acesso ao IFRJ." });
    const previousAccess = targetUser.role === 'admin' || targetUser.canAccessIfrj;
    userRepoInstance.updateIfrjAccess(targetUser.id, requestedAccess);
    logSecurityEvent(req, { action: 'IFRJ_ACCESS_CHANGED', actor: adminUser?.username || 'admin', actorUserId: adminUser?.id || null, targetType: 'user', targetId: targetUser.id, resource: `/users/${targetUser.id}/ifrij-access`, status: 'SUCCESS', userId: targetUser.id, previousState: { canAccessIfrj: previousAccess }, newState: { canAccessIfrj: requestedAccess }, details: { targetUsername: targetUser.username } });
    return res.json({ success: true, message: requestedAccess ? "Acesso ao IFRJ liberado." : "Acesso ao IFRJ removido.", user: { id: targetUser.id, username: targetUser.username, canAccessIfrj: requestedAccess } });
  } catch (err) {
    console.error('[Admin IFRJ Access Error]', err);
    return res.status(500).json({ success: false, message: "Erro ao alterar acesso ao IFRJ." });
  }
});

app.delete("/api/admin/users/:id", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const targetUser = userRepoInstance.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuario nao encontrado." });
    if (targetUser.username === ADMIN_USER) return res.status(400).json({ success: false, message: "A conta do administrador mestre nao pode ser excluida." });
    if (targetUser.id === adminUser?.userId || targetUser.id === adminUser?.id) return res.status(400).json({ success: false, message: "O administrador nao pode excluir a propria conta." });

    sessionRepoInstance.revokeAllUserSessions(targetUser.id);
    if (!userRepoInstance.deleteById(targetUser.id)) return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuario nao encontrado." });
    logSecurityEvent(req, {
      action: 'USER_DELETED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: targetUser.id,
      resource: `/users/${targetUser.id}`,
      status: 'SUCCESS',
      details: { targetUserId: targetUser.id, targetUsername: targetUser.username },
    });
    return res.json({ success: true, message: "Conta excluida com sucesso.", userId: targetUser.id });
  } catch (err: any) {
    console.error("[Admin Delete User Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao excluir conta." });
  }
});

app.patch("/api/admin/users/:id/status", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { status } = req.body || {};
    const adminUser = (req as any).user;

    if (!['active', 'suspended', 'pending_activation'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido." });
    }

    const targetUser = userRepoInstance.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuário não encontrado." });
    }

    // Proteção: não permitir suspender o administrador mestre
    if (targetUser.username === ADMIN_USER && status === 'suspended') {
      return res.status(400).json({ success: false, message: "Não é permitido suspender a conta do administrador mestre." });
    }

    const previousStatus = targetUser.status;
    userRepoInstance.updateStatus(userId, status);

    // Se suspenso, revoga imediatamente todas as sessões ativas do usuário
    if (status === 'suspended') {
      sessionRepoInstance.revokeAllUserSessions(userId);
    }

    const specificAction = status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED';
    const legacyAction = status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ACTIVATED';

    logSecurityEvent(req, {
      action: legacyAction,
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: userId,
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      userId,
      previousState: { status: previousStatus },
      newState: { status },
      details: {
        targetUserId: userId,
        targetUsername: targetUser.username,
      },
    });

    logSecurityEvent(req, {
      action: specificAction,
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: userId,
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      userId,
      previousState: { status: previousStatus },
      newState: { status },
      details: {
        targetUserId: userId,
        targetUsername: targetUser.username,
      },
    });

    return res.json({
      success: true,
      message: `Status do usuário atualizado para '${status}' com sucesso.`,
      user: { id: targetUser.id, username: targetUser.username, status },
    });
  } catch (err: any) {
    console.error("[Admin Update Status Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao atualizar status do usuário." });
  }
});

// 17. Alterar Papel / Privilégio de Usuário (Admin / Support / Cadet - Requer Step-Up e Admin pleno)
app.patch("/api/admin/users/:id/role", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { role } = req.body || {};
    const adminUser = (req as any).user;

    if (!['cadet', 'admin', 'support'].includes(role)) {
      return res.status(400).json({ success: false, message: "Papel (role) inválido. Permitidos: cadet, support, admin." });
    }

    const targetUser = userRepoInstance.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuário não encontrado." });
    }

    if (targetUser.username === ADMIN_USER && role !== 'admin') {
      return res.status(400).json({ success: false, message: "O papel do administrador mestre não pode ser alterado." });
    }

    const previousRole = targetUser.role;
    userRepoInstance.updateRole(userId, role);

    logSecurityEvent(req, {
      action: 'ROLE_CHANGED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: userId,
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      userId,
      previousState: { role: previousRole },
      newState: { role },
      details: {
        targetUserId: userId,
        targetUsername: targetUser.username,
      },
    });

    if (previousRole !== 'admin' && role === 'admin') {
      logSecurityEvent(req, {
        action: 'ADMIN_CREATED',
        actor: adminUser?.username || 'admin',
        actorUserId: adminUser?.id || null,
        targetType: 'user',
        targetId: userId,
        resource: `/users/${userId}`,
        status: 'SUCCESS',
        userId,
        previousState: { role: previousRole },
        newState: { role },
        details: { targetUsername: targetUser.username },
      });
    } else if (previousRole === 'admin' && role !== 'admin') {
      logSecurityEvent(req, {
        action: 'ADMIN_REMOVED',
        actor: adminUser?.username || 'admin',
        actorUserId: adminUser?.id || null,
        targetType: 'user',
        targetId: userId,
        resource: `/users/${userId}`,
        status: 'SUCCESS',
        userId,
        previousState: { role: previousRole },
        newState: { role },
        details: { targetUsername: targetUser.username },
      });
    }

    return res.json({
      success: true,
      message: `Papel do usuário atualizado para '${role}' com sucesso.`,
      user: { id: targetUser.id, username: targetUser.username, role },
    });
  } catch (err: any) {
    console.error("[Admin Update Role Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao alterar privilégios do usuário." });
  }
});

// 17.1. Revogar Todas as Sessões de um Usuário Específico (Requer Step-Up e Admin pleno)
app.post("/api/admin/users/:id/revoke-sessions", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const adminUser = (req as any).user;

    const targetUser = userRepoInstance.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "USER_NOT_FOUND", message: "Usuário não encontrado." });
    }

    const activeSessionsBefore = sessionRepoInstance.listActiveSessionsByUserId(targetUser.id);
    sessionRepoInstance.revokeAllUserSessions(targetUser.id);

    logSecurityEvent(req, {
      action: 'SESSION_REVOKED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user_sessions',
      targetId: targetUser.id,
      resource: `/users/${targetUser.id}/sessions`,
      status: 'SUCCESS',
      userId: targetUser.id,
      previousState: { activeSessionsCount: activeSessionsBefore.length },
      newState: { activeSessionsCount: 0 },
      details: {
        targetUserId: targetUser.id,
        targetUsername: targetUser.username,
        revokedSessionsCount: activeSessionsBefore.length,
      },
    });

    return res.json({
      success: true,
      message: `Todas as sessões ativas do usuário '${targetUser.username}' foram revogadas com sucesso.`,
      revokedCount: activeSessionsBefore.length,
    });
  } catch (err: any) {
    console.error("[Admin Revoke All User Sessions Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao revogar sessões do usuário." });
  }
});

// 17.2. Desbloqueio/Reset Manual do Lock de Sessão Exclusiva do Cadete (Requer Admin)
app.post("/api/admin/cadet-lock/reset", requireAdminWriteAuth, requireStepUpAuth, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { cadetUserId, targetUserId } = req.body || {};
    const targetId = cadetUserId || targetUserId;

    if (!targetId) {
      return res.status(400).json({ success: false, error: "MISSING_CADET_USER_ID", message: "Identificador do cadete é obrigatório." });
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers["user-agent"] as string) || undefined;

    const result = await authServiceInstance.resetCadetLock(adminUser.userId || adminUser.username, targetId, clientIp, userAgent);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    console.error("[Admin Reset Cadet Lock Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao resetar bloqueio do cadete." });
  }
});

// 17.3. Desbloqueio Manual de IP Bloqueado por 5 Horas (Requer Admin)
app.post("/api/admin/temporary-block/reset", requireAdminWriteAuth, requireStepUpAuth, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { ip } = req.body || {};
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({ success: false, error: "MISSING_IP", message: "IP é obrigatório." });
    }

    const clientIp = getClientIp(req);
    const userAgent = (req.headers["user-agent"] as string) || undefined;

    const result = await authServiceInstance.unblockTemporarySourceIp(adminUser.userId || adminUser.username, ip, clientIp, userAgent);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    console.error("[Admin Reset Source Block Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao desbloquear origem temporária." });
  }
});

// 17.4. Consulta de Notificações de Segurança & Alertas (Requer Autenticação Administrativa)
app.get("/api/admin/notifications", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const filter = (req.query.filter as 'ALL' | 'SECURITY' | 'UNREAD') || 'ALL';
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
    const notifications = authServiceInstance.getNotifications({ filter, limit });
    return res.json({ success: true, ...notifications });
  } catch (err: any) {
    console.error("[Admin Notifications Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao consultar notificações." });
  }
});

// 17.5. Marcar Notificação como Lida (Requer Autenticação Administrativa)
app.post("/api/admin/notifications/:id/read", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const result = authServiceInstance.markNotificationAsRead(notificationId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Admin Mark Notification Read Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao marcar notificação como lida." });
  }
});

app.post("/api/admin/notifications/read-all", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    new SecurityNotificationRepository(getDb().getRawDb()).markAllAsRead();
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[Admin Mark All Notifications Read Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao marcar notificações como lidas." });
  }
});



// 18. Listagem de Sessões Ativas (Admin)
app.get("/api/admin/sessions", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
    const sessions = sanitizeSecurityPayload(sessionRepoInstance.listActiveSessions(limit));
    return res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (err: any) {
    console.error("[Admin Sessions Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao listar sessões." });
  }
});

// 19. Revogação de Sessão Específica por ID (Admin - Requer Step-Up e Admin pleno)
app.post("/api/admin/sessions/:id/revoke", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const sessionId = req.params.id;
    const adminUser = (req as any).user;
    const revoked = sessionRepoInstance.revokeSessionById(sessionId);

    if (!revoked) {
      return res.status(404).json({ success: false, message: "Sessão não encontrada ou já revogada." });
    }

    logSecurityEvent(req, {
      action: 'SESSION_REVOKED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'session',
      targetId: sessionId,
      resource: `/sessions/${sessionId}`,
      status: 'SUCCESS',
      previousState: { status: 'active' },
      newState: { status: 'revoked' },
      details: { sessionId },
    });

    return res.json({
      success: true,
      message: "Sessão revogada com sucesso.",
    });
  } catch (err: any) {
    console.error("[Admin Revoke Session Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao revogar sessão." });
  }
});

// 20. Listagem de Administradores
app.get("/api/admin/admins", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const admins = userRepoInstance.findAdminFiltered({ role: 'admin', limit: 50 });
    return res.json({
      success: true,
      admins: admins.items,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao carregar administradores." });
  }
});

// 21. Status e Configurações Gerais do Sistema
app.get("/api/admin/settings", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const config = getSecurityConfig();
    return res.json({
      success: true,
      settings: {
        twoFactorActive: config.is2faActive,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeEnv: process.env.NODE_ENV || 'development',
        sessionDurationDays: 30,
        retentionDays: 30,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao carregar configurações." });
  }
});

// 21.1. Atualizar Configurações de Segurança do Sistema (Requer Step-Up e Admin pleno)
app.patch("/api/admin/settings", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { retentionDays, sessionDurationDays, twoFactorEnforced } = req.body || {};

    const previousConfig = {
      retentionDays: 30,
      sessionDurationDays: 30,
      twoFactorActive: getSecurityConfig().is2faActive,
    };

    if (twoFactorEnforced !== undefined && typeof twoFactorEnforced !== 'boolean') {
      return res.status(400).json({ success: false, message: "twoFactorEnforced deve ser booleano." });
    }

    const securityConfig = getSecurityConfig();
    if (typeof twoFactorEnforced === 'boolean') {
      securityConfig.is2faActive = process.env.ADMIN_REQUIRE_2FA === 'true' ? true : twoFactorEnforced;
      saveSecurityConfig(securityConfig);
    }

    const newConfig = {
      retentionDays: Number(retentionDays) || previousConfig.retentionDays,
      sessionDurationDays: Number(sessionDurationDays) || previousConfig.sessionDurationDays,
      twoFactorActive: securityConfig.is2faActive,
    };

    logSecurityEvent(req, {
      action: 'SECURITY_SETTING_CHANGED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'system_settings',
      targetId: 'global',
      resource: '/api/admin/settings',
      status: 'SUCCESS',
      previousState: previousConfig,
      newState: newConfig,
      details: { changedBy: adminUser?.username || 'admin' },
    });

    return res.json({
      success: true,
      message: "Parâmetros de segurança atualizados com sucesso.",
      settings: newConfig,
    });
  } catch (err: any) {
    console.error("[Admin Settings Update Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao atualizar configurações." });
  }
});

// 21.2. Rota de Desbloqueio explícito de IPs (Apenas Administrador Pleno com Step-Up)
app.post("/api/admin/unban", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const { ip, all } = req.body || {};
  const unbanAll = all === true || !ip;

  const banned = loadBannedIps();
  if (unbanAll) {
    logSecurityEvent(req, {
      action: 'SECURITY_SETTING_CHANGED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'ip_ban_list',
      targetId: 'all',
      resource: '/api/admin/unban',
      status: 'SUCCESS',
      details: { unbannedAll: true },
    });
    return res.json({ success: true, message: "Todos os IPs foram desbanidos com sucesso pelo administrador." });
  }

  const targetIp = String(ip).trim().replace(/^::ffff:/, "");
  delete banned[targetIp];
  saveBannedIps(banned);
  logSecurityEvent(req, {
    action: 'SECURITY_SETTING_CHANGED',
    actor: adminUser?.username || 'admin',
    actorUserId: adminUser?.id || null,
    targetType: 'ip_ban_list',
    targetId: targetIp,
    resource: '/api/admin/unban',
    status: 'SUCCESS',
    details: { targetIp },
  });
  return res.json({ success: true, message: `IP ${targetIp} desbanido com sucesso.` });
});

// ==========================================
// 🛡️ GESTÃO DE PRIVACIDADE E REQUISIÇÕES LGPD (ADMIN)
// ==========================================

// 1. Listar Requisições LGPD com Paginação e Filtros
app.get("/api/admin/privacy/requests", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { status, requestType, search, page, limit } = req.query as any;
    const result = privacyRequestRepoInstance.findAdminFiltered({
      status: status ? String(status) : undefined,
      requestType: requestType ? String(requestType) : undefined,
      search: search ? String(search) : undefined,
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
    });
    return res.json({ success: true, items: result.items, requests: result.items, total: result.total });
  } catch (err: any) {
    console.error("[Admin Privacy Requests Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao listar requisições de privacidade." });
  }
});

// 2. Atualizar Status e Notas da Requisição LGPD (Com Step-Up)
app.patch("/api/admin/privacy/requests/:id", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { id } = req.params;
    const { status, adminNotes } = req.body || {};

    const validStatuses = ['pending', 'under_review', 'completed', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido." });
    }

    const updated = privacyRequestRepoInstance.updateStatus(id, status, adminUser.id || adminUser.userId, adminNotes);
    if (!updated) {
      return res.status(404).json({ success: false, message: "Requisição não encontrada." });
    }

    logSecurityEvent(req, {
      action: 'PRIVACY_REQUEST_UPDATED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'privacy_request',
      targetId: updated.id,
      resource: `/admin/privacy/requests/${updated.requestCode}`,
      status: 'SUCCESS',
      details: { requestCode: updated.requestCode, newStatus: status },
    });

    return res.json({ success: true, message: "Requisição atualizada com sucesso.", request: updated });
  } catch (err: any) {
    console.error("[Admin Update Privacy Request Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao atualizar requisição de privacidade." });
  }
});

// 3. Executar Anonimização do Titular (LGPD Art. 16 - Apenas Administrador com Step-Up)
app.post("/api/admin/privacy/requests/:id/anonymize", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { id } = req.params;
    const request = privacyRequestRepoInstance.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Requisição não encontrada." });
    }
    if (!request.userId) {
      return res.status(400).json({ success: false, message: "Requisição não vinculada a um usuário cadastrado." });
    }

    const targetUser = userRepoInstance.findById(request.userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Usuário alvo não encontrado." });
    }
    if (targetUser.username === ADMIN_USER) {
      return res.status(400).json({ success: false, message: "A conta do administrador mestre não pode ser anonimizada." });
    }

    const ok = userRepoInstance.anonymizeUser(targetUser.id);
    if (!ok) {
      return res.status(500).json({ success: false, message: "Falha ao anonimizar usuário." });
    }

    privacyRequestRepoInstance.updateStatus(
      request.id,
      'completed',
      adminUser.id || adminUser.userId,
      'Anonimização de dados pessoais executada em cumprimento ao Art. 16 da LGPD.'
    );

    logSecurityEvent(req, {
      action: 'USER_ANONYMIZED_LGPD',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'user',
      targetId: targetUser.id,
      resource: `/users/${targetUser.id}`,
      status: 'SUCCESS',
      details: { requestCode: request.requestCode },
    });

    return res.json({
      success: true,
      message: "Dados pessoais do titular anonimizados com sucesso em conformidade com a LGPD.",
    });
  } catch (err: any) {
    console.error("[Admin Anonymize User Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao executar anonimização do usuário." });
  }
});

// ==========================================
// 🛠️ MODO DE MANUTENÇÃO (PERSISTÊNCIA RELACIONAL)
// ==========================================

export interface MaintenanceConfig {
  global: boolean;
  message?: string;
  pages: Record<string, boolean>;
  updatedAt: string;
  updatedBy?: string;
}

function getMaintenanceConfig(): MaintenanceConfig {
  try {
    const repo = getSystemIntegrationRepo();
    const row = repo?.get("maintenance_config");
    if (row?.encryptedPayload) {
      const parsed = JSON.parse(row.encryptedPayload);
      return {
        global: Boolean(parsed.global),
        message: typeof parsed.message === 'string' ? parsed.message : '',
        pages: typeof parsed.pages === 'object' && parsed.pages !== null ? parsed.pages : {},
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        updatedBy: parsed.updatedBy || undefined,
      };
    }
  } catch (err) {
    console.warn("Falha ao ler manutenção do banco:", err);
  }
  return {
    global: false,
    message: '',
    pages: {},
    updatedAt: new Date().toISOString(),
  };
}

function saveMaintenanceConfig(config: MaintenanceConfig): void {
  try {
    const repo = getSystemIntegrationRepo();
    if (repo) {
      repo.set("maintenance_config", JSON.stringify(config));
    }
  } catch (err) {
    console.error("Falha ao salvar configuração de manutenção no banco:", err);
  }
}

// 1. Status de Manutenção (Acesso público para consulta dos clientes)
app.get("/api/maintenance/status", (_req: Request, res: Response) => {
  try {
    const config = getMaintenanceConfig();
    return res.json({
      success: true,
      global: config.global,
      pages: config.pages,
      message: config.message || "",
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Erro ao consultar status de manutenção." });
  }
});

// 2. Consulta detalhada de Manutenção para o Painel Admin
app.get("/api/admin/maintenance", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const config = getMaintenanceConfig();
    return res.json({
      success: true,
      config,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Erro ao carregar configuração de manutenção." });
  }
});

// 3. Atualização do Modo de Manutenção (Apenas Admin com permissão de escrita)
app.post("/api/admin/maintenance", requireAdminWriteAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { global, pages, message } = req.body || {};

    const previousConfig = getMaintenanceConfig();

    const newPages: Record<string, boolean> = {};
    if (pages && typeof pages === 'object') {
      for (const [key, val] of Object.entries(pages)) {
        if (typeof key === 'string' && typeof val === 'boolean') {
          newPages[key] = val;
        }
      }
    }

    const newConfig: MaintenanceConfig = {
      global: Boolean(global),
      pages: newPages,
      message: typeof message === 'string' ? message.slice(0, 500) : '',
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser?.username || 'admin',
    };

    saveMaintenanceConfig(newConfig);

    logSecurityEvent(req, {
      action: 'MAINTENANCE_MODE_UPDATED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.id || null,
      targetType: 'maintenance_mode',
      targetId: 'global',
      resource: '/api/admin/maintenance',
      status: 'SUCCESS',
      previousState: previousConfig,
      newState: newConfig,
      details: { changedBy: adminUser?.username || 'admin' },
    });

    try {
      adminRealtimeHub.publish('METRICS_UPDATED' as AdminRealtimeEventType, newConfig);
    } catch {}

    return res.json({
      success: true,
      message: "Configurações de modo de manutenção atualizadas com sucesso.",
      config: newConfig,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Erro ao atualizar modo de manutenção." });
  }
});

// 4. Modo de Emergência / Kill Switch Anti-Invasão (Desliga o site para todos exceto admin)
app.post("/api/admin/system/emergency-lockdown", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { active, message, revokeActiveSessions } = req.body || {};

    const isLockdown = Boolean(active);
    const previousConfig = getMaintenanceConfig();

    const newConfig: MaintenanceConfig = {
      ...previousConfig,
      global: isLockdown,
      message: typeof message === 'string' && message.trim()
        ? message.trim().slice(0, 500)
        : (isLockdown ? 'Sistema em procedimento de contingência e contenção de segurança. Acesso suspenso para manutenção emergencial.' : ''),
      updatedAt: new Date().toISOString(),
      updatedBy: adminUser?.username || 'admin',
    };

    saveMaintenanceConfig(newConfig);

    let revokedCount = 0;
    if (isLockdown && revokeActiveSessions) {
      revokedCount = sessionRepoInstance.revokeAllNonAdminSessions();
    }

    logSecurityEvent(req, {
      action: isLockdown ? 'EMERGENCY_LOCKDOWN_ACTIVATED' : 'EMERGENCY_LOCKDOWN_DEACTIVATED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.userId || null,
      targetType: 'system_lockdown',
      targetId: 'global',
      resource: '/api/admin/system/emergency-lockdown',
      status: 'SUCCESS',
      previousState: previousConfig,
      newState: newConfig,
      details: {
        active: isLockdown,
        revokeActiveSessions: Boolean(revokeActiveSessions),
        revokedSessionsCount: revokedCount,
        changedBy: adminUser?.username || 'admin',
      },
    });

    try {
      adminRealtimeHub.publish('METRICS_UPDATED' as AdminRealtimeEventType, newConfig);
    } catch {}

    return res.json({
      success: true,
      message: isLockdown
        ? `Modo de emergência/invasão ATIVADO. O site foi desligado para todos os usuários comuns.${revokeActiveSessions ? ` (${revokedCount} sessões de alunos foram encerradas imediatamente)` : ''}`
        : "Modo de emergência DESATIVADO. Acesso ao site normalizado com sucesso.",
      config: newConfig,
      revokedSessions: revokedCount,
    });
  } catch (err: any) {
    console.error("Erro ao processar comando de emergência:", err);
    return res.status(500).json({ success: false, message: "Erro ao processar comando de emergência." });
  }
});

// 5. Reinicialização Tática do Servidor (Graceful Restart)
app.post("/api/admin/system/restart", requireAdminWriteAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;

    logSecurityEvent(req, {
      action: 'SYSTEM_RESTART_TRIGGERED',
      actor: adminUser?.username || 'admin',
      actorUserId: adminUser?.userId || null,
      targetType: 'system_process',
      targetId: 'node_server',
      resource: '/api/admin/system/restart',
      status: 'SUCCESS',
      details: {
        triggeredBy: adminUser?.username || 'admin',
        pid: process.pid,
      },
    });

    res.json({
      success: true,
      message: "Comando de reinicialização aceito pelo servidor. O serviço será reiniciado em 800ms.",
      restartingInMs: 800,
    });

    if (process.env.NODE_ENV === 'test') {
      return;
    }

    setTimeout(() => {
      console.warn(`🚨 [RESTART] Servidor reiniciando por solicitação do administrador ${adminUser?.username || 'admin'} (PID: ${process.pid})...`);
      process.kill(process.pid, 'SIGTERM');
    }, 800);
  } catch (err: any) {
    console.error("Erro ao acionar reinicialização do servidor:", err);
    return res.status(500).json({ success: false, message: "Falha ao acionar reinicialização do servidor." });
  }
});

// ==========================================
// 👤 MINHA CONTA & GESTÃO DE PERFIL
// ==========================================

// 1. Obter Perfil do Usuário Autenticado (Protegido contra IDOR)
app.get("/api/user/profile", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }

    const profile = profileRepoInstance.findByUserId(user.id);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        canAccessIfrj: user.role === 'admin' || user.canAccessIfrj,
        fullName: profile?.fullName || user.username,
        phone: profile?.phone || "",
        targetExam: profile?.targetExam || "CFO CBMERJ 2026",
        bio: profile?.bio || "",
        avatarUrl: profile?.avatarUrl || null,
        createdAt: user.createdAt,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao carregar perfil." });
  }
});

// 2. Atualizar Dados do Perfil (Nome, Username, Telefone, Bio) - Protegido contra IDOR e Mass Assignment
app.patch("/api/user/profile", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }

    // Apenas campos explicitamente permitidos
    const { fullName, username, phone, targetExam, bio } = req.body || {};

    // Validação e normalização de username se enviado
    if (username && typeof username === "string") {
      const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, "");
      if (cleanUsername.length < 3 || cleanUsername.length > 30) {
        return res.status(400).json({
          success: false,
          message: "O nome de usuário deve conter entre 3 e 30 caracteres válidos (letras, números, '.', '-' ou '_').",
        });
      }

      // Se alterou o username, valida unicidade
      if (cleanUsername !== user.username) {
        const existing = userRepoInstance.findByUsername(cleanUsername);
        if (existing && existing.id !== user.id) {
          return res.status(400).json({
            success: false,
            message: "Este nome de usuário já está em uso por outro operador.",
          });
        }
        userRepoInstance.updateUsername(user.id, cleanUsername);
      }
    }

    // Atualiza dados cadastrais do perfil
    const updatedProfile = profileRepoInstance.createOrUpdate({
      userId: user.id,
      fullName: typeof fullName === "string" ? fullName.trim() : (profileRepoInstance.findByUserId(user.id)?.fullName || user.username),
      phone: typeof phone === "string" ? phone.trim() : undefined,
      targetExam: typeof targetExam === "string" ? targetExam.trim() : undefined,
      bio: typeof bio === "string" ? bio.trim() : undefined,
    });

    const refreshedUser = userRepoInstance.findById(user.id)!;

    return res.json({
      success: true,
      message: "Perfil atualizado com sucesso!",
      user: {
        id: refreshedUser.id,
        email: refreshedUser.email,
        username: refreshedUser.username,
        role: refreshedUser.role,
        fullName: updatedProfile.fullName,
        phone: updatedProfile.phone || "",
        targetExam: updatedProfile.targetExam || "",
        bio: updatedProfile.bio || "",
        avatarUrl: updatedProfile.avatarUrl || null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao atualizar dados do perfil." });
  }
});

// 3. Upload e Atualização Segura de Foto de Perfil (Validação Real de Magic Bytes e Ownership)
app.post("/api/user/avatar", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }

    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ success: false, message: "Arquivo de imagem ausente ou inválido." });
    }

    // Extrai os dados binários puros
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Validação server-side estrita de magic bytes e tamanho (rejeita executáveis, scripts e MIME adulterado)
    const validation = validateImageBuffer(buffer);
    if (!validation.valid || !validation.extension) {
      return res.status(400).json({
        success: false,
        message: validation.error || "Formato de arquivo inválido. Apenas imagens reais JPG, PNG ou WEBP são permitidas.",
      });
    }

    // Mantém a imagem no registro persistido do perfil. O filesystem local do
    // deploy pode ser recriado, enquanto o banco permanece disponível após
    // uma nova versão da aplicação.
    const avatarUrl = `data:${validation.detectedMime};base64,${buffer.toString("base64")}`;
    profileRepoInstance.updateAvatar(user.id, avatarUrl);

    return res.json({
      success: true,
      message: "Foto de perfil atualizada com sucesso!",
      avatarUrl,
    });
  } catch (err: any) {
    console.error("[Avatar Upload Error]:", err);
    return res.status(500).json({ success: false, message: "Falha ao processar e salvar foto de perfil." });
  }
});

// ==========================================
// 🛡️ CENTRAL DE PRIVACIDADE E DIREITOS DO TITULAR (LGPD - LEI 13.709/2018)
// ==========================================

// 0. Informações Públicas de Privacidade e Contato do DPO (LGPD Art. 41)
app.get("/api/privacy/info", (_req: Request, res: Response) => {
  return res.json({
    success: true,
    privacyContactEmail: process.env.PRIVACY_CONTACT_EMAIL || "privacidade@rumoaocfo.com.br",
    dpoName: process.env.PRIVACY_DPO_NAME || "Encarregado de Proteção de Dados - Rumo ao CFO",
    policyVersion: "1.0",
    termsVersion: "1.0",
  });
});

// 1. Submeter Solicitação do Titular (Acesso, Retificação, Eliminação, Portabilidade, Informação, Revogação)
app.post("/api/privacy/requests", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const { requestType, details } = req.body || {};
    const validTypes = ['access', 'rectification', 'deletion', 'export', 'information', 'revocation'];
    if (!requestType || !validTypes.includes(requestType)) {
      return res.status(400).json({ success: false, message: "Tipo de solicitação inválido." });
    }

    const cleanDetails = typeof details === 'string' ? details.trim().slice(0, 1000) : null;
    const request = privacyRequestRepoInstance.create({
      userId: user.id,
      email: user.email,
      requestType,
      details: cleanDetails,
    });

    logSecurityEvent(req, {
      action: 'PRIVACY_REQUEST_CREATED',
      actor: user.username,
      actorUserId: user.id,
      targetType: 'privacy_request',
      targetId: request.id,
      userId: user.id,
      resource: `/privacy/requests/${request.requestCode}`,
      status: 'SUCCESS',
      details: { requestType, requestCode: request.requestCode },
    });

    return res.status(201).json({
      success: true,
      message: "Solicitação registrada com sucesso. O protocolo foi gerado e será processado pelo Encarregado de Proteção de Dados.",
      request: {
        id: request.id,
        requestCode: request.requestCode,
        requestType: request.requestType,
        status: request.status,
        createdAt: request.createdAt,
      },
    });
  } catch (err: any) {
    console.error("[Privacy Request Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao registrar solicitação de privacidade." });
  }
});

// 2. Consultar Minhas Solicitações LGPD
app.get("/api/privacy/my-requests", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const requests = privacyRequestRepoInstance.findByUserId(user.id);
    return res.json({
      success: true,
      requests: requests.map((r) => ({
        id: r.id,
        requestCode: r.requestCode,
        userId: r.userId,
        requestType: r.requestType,
        status: r.status,
        details: r.details,
        adminNotes: r.adminNotes,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao carregar solicitações de privacidade." });
  }
});

// 3. Exportação de Dados Portáveis do Titular (LGPD Art. 18, II e V)
app.get("/api/privacy/export", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const profile = profileRepoInstance.findByUserId(user.id);
    const consents = consentRepoInstance.findLatestForUser(user.id);
    const privacyRequests = privacyRequestRepoInstance.findByUserId(user.id);
    const studySessions = studySessionRepoInstance.listForUser(user.id, 1000);

    const exportData = {
      exportMetadata: {
        platform: "Rumo ao CFO CBMERJ",
        exportedAt: new Date().toISOString(),
        legalBasis: "Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018, Art. 18, II e V)",
        format: "application/json",
      },
      account: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
      profile: {
        fullName: profile?.fullName || user.username,
        phone: profile?.phone || null,
        targetExam: profile?.targetExam || null,
        bio: profile?.bio || null,
        createdAt: profile?.createdAt || user.createdAt,
      },
      consents: consents.map((c) => ({
        category: c.category,
        policyVersion: c.policyVersion,
        termsVersion: c.termsVersion,
        status: c.status,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
      })),
      privacyRequests: privacyRequests.map((r) => ({
        requestCode: r.requestCode,
        requestType: r.requestType,
        status: r.status,
        createdAt: r.createdAt,
        processedAt: r.processedAt,
      })),
      studyHistory: {
        totalSessions: studySessions.length,
        sessions: studySessions.map((s) => ({
          subjectName: s.subjectName,
          topic: s.topic,
          dateStr: s.dateStr,
          durationSeconds: s.durationSeconds,
          notes: s.notes,
        })),
      },
    };

    logSecurityEvent(req, {
      action: 'DATA_EXPORT_GENERATED',
      actor: user.username,
      actorUserId: user.id,
      targetType: 'user',
      targetId: user.id,
      userId: user.id,
      resource: '/privacy/export',
      status: 'SUCCESS',
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dados-pessoais-cfo-${user.username}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, ...exportData, export: exportData });
  } catch (err: any) {
    console.error("[Privacy Export Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao gerar exportação de dados pessoais." });
  }
});

// 4. Salvar / Atualizar Preferências de Consentimento
app.post("/api/privacy/consent", requireUserAuth, (req: Request, res: Response) => {
  try {
    const sessionUser = (req as any).user;
    const user = userRepoInstance.findById(sessionUser.userId) || userRepoInstance.findByUsername(sessionUser.username);
    if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

    const { category, status, granted, policyVersion, termsVersion } = req.body || {};
    const validCategories = ['necessary', 'analytics', 'marketing', 'preferences', 'ai_processing', 'terms_of_use', 'privacy_policy'];
    if (!category || !validCategories.includes(category)) {
      return res.status(400).json({ success: false, message: "Categoria de consentimento inválida." });
    }

    const isRevoked = status === 'revoked' || granted === false;
    const resolvedStatus = isRevoked ? 'revoked' : 'granted';

    if (isRevoked) {
      consentRepoInstance.revokeConsent(user.id, category);
    }

    const clientIp = getClientIp(req);
    const ipHash = clientIp ? crypto.createHash('sha256').update(clientIp).digest('hex').slice(0, 16) : null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 200);

    const record = consentRepoInstance.recordConsent({
      userId: user.id,
      category,
      status: resolvedStatus,
      policyVersion: typeof policyVersion === 'string' && policyVersion.trim() ? policyVersion.trim() : '1.0',
      termsVersion: typeof termsVersion === 'string' && termsVersion.trim() ? termsVersion.trim() : '1.0',
      ipHash,
      userAgent,
    });

    logSecurityEvent(req, {
      action: 'CONSENT_UPDATED',
      actor: user.username,
      actorUserId: user.id,
      targetType: 'consent_record',
      targetId: record.id,
      userId: user.id,
      resource: '/privacy/consent',
      status: 'SUCCESS',
      details: { category, status: record.status },
    });

    return res.json({ success: true, message: "Preferências de privacidade registradas com sucesso.", record });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: "Erro ao salvar consentimento." });
  }
});

// Helper for next day string in Google Calendar all-day events
function getNextDayStr(dateStr: string): string {
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      date.setUTCDate(date.getUTCDate() + 1);
      return date.toISOString().split("T")[0];
    }
  } catch {}
  return dateStr;
}

// Check Google Calendar to prevent duplicate event creation
async function findExistingCalendarEvent(
  token: string,
  summary: string,
  dateStr: string
): Promise<string | null> {
  try {
    const timeMin = `${dateStr}T00:00:00Z`;
    const nextDay = getNextDayStr(dateStr);
    const timeMax = `${nextDay}T23:59:59Z`;

    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "30");

    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.ok) {
      const data = (await resp.json()) as any;
      const cleanTargetSummary = summary.trim().toLowerCase();
      const existing = data.items?.find((item: any) => {
        if (!item.summary) return false;
        const itemSummary = item.summary.trim().toLowerCase();
        return itemSummary === cleanTargetSummary;
      });
      if (existing) {
        return existing.id;
      }
    }
  } catch (err) {
    console.warn("Verificação de evento existente na Google Agenda falhou:", err);
  }
  return null;
}

// Google Calendar API proxy helper with duplicate check
async function postGoogleCalendarEvent(
  token: string,
  event: { summary: string; description: string; dateStr: string; colorId?: string }
) {
  // First check if an event with the exact same summary already exists on this date
  const existingId = await findExistingCalendarEvent(token, event.summary, event.dateStr);
  if (existingId) {
    return { id: existingId, existed: true };
  }

  const nextDay = getNextDayStr(event.dateStr);
  const body = {
    summary: event.summary,
    description: event.description,
    start: { date: event.dateStr },
    end: { date: nextDay },
    colorId: event.colorId || "11",
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 540 }],
    },
  };

  const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errorBody = (await resp.json().catch(() => ({}))) as any;
    const errorObj = new Error(
      errorBody?.error?.message || `Google Calendar API error ${resp.status}`
    );
    (errorObj as any).status = resp.status;
    (errorObj as any).googleError = errorBody;
    throw errorObj;
  }

  return (await resp.json()) as any;
}

// 1. Google Calendar Connection Status endpoint
app.use("/api/calendar", requireUserAuth);
app.get("/api/calendar/status", async (_req: Request, res: Response) => {
  try {
    const session = readCalendarSession();
    if (!session || (!session.access_token && !session.refresh_token)) {
      return res.json({
        connected: false,
        permanent: false,
        hasRefreshToken: false,
        needsClientSecret: !GOOGLE_CLIENT_SECRET,
        clientIdConfigured: !!GOOGLE_CLIENT_ID,
      });
    }

    const now = Date.now();
    const isExpired = session.expiry_date ? now >= session.expiry_date : false;
    const canRefresh = !!(session.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

    // Se estiver expirado mas puder renovar, tenta renovação prévia
    let activeToken = session.access_token;
    if (isExpired && canRefresh) {
      activeToken = (await getValidCalendarAccessToken()) || "";
    }

    const isConnected = !!activeToken && (!isExpired || canRefresh);

    let apiOperational: boolean | null = null;
    let apiErrorMessage: string | null = null;
    let enableUrl: string | null = null;

    if (isConnected && activeToken) {
      try {
        const testResp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1", {
          headers: { Authorization: `Bearer ${activeToken}` },
          signal: AbortSignal.timeout(3500),
        });
        if (testResp.ok) {
          apiOperational = true;
        } else {
          const errData = (await testResp.json().catch(() => ({}))) as any;
          const errMsg = errData?.error?.message || "";
          if (testResp.status === 403 && errMsg.includes("Google Calendar API has not been used")) {
            apiOperational = false;
            apiErrorMessage = errMsg;
            const projectNumber = (GOOGLE_CLIENT_ID || "").split("-")[0] || "1077493396610";
            enableUrl = `https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${projectNumber}`;
          }
        }
      } catch {}
    }

    return res.json({
      connected: isConnected,
      permanent: !!session.refresh_token,
      email: session.email || null,
      name: session.name || null,
      hasRefreshToken: !!session.refresh_token,
      needsClientSecret: !GOOGLE_CLIENT_SECRET,
      clientIdConfigured: !!GOOGLE_CLIENT_ID,
      updatedAt: session.updatedAt,
      apiOperational,
      apiErrorMessage,
      enableUrl,
    });
  } catch (error: any) {
    console.error('[Calendar status]', error);
    return res.status(500).json({ connected: false, error: "INTERNAL_SERVER_ERROR" });
  }
});

const calendarOAuthStates = new Map<string, { origin: string; token: string; expiresAt: number }>();
const calendarRedirectUri = process.env.REDIRECT_URI || new URL('/api/auth/google/callback', APP_URL).href;
app.get('/api/calendar/auth-url', requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'MISSING_CLIENT_ID' });
  const origin = extractOrigin(String(req.query.origin || APP_URL));
  if (!origin || !normalizedAllowedOrigins.has(origin)) return res.status(403).json({ error: 'INVALID_ORIGIN' });
  for (const [key, value] of calendarOAuthStates) if (value.expiresAt < Date.now()) calendarOAuthStates.delete(key);
  const state = crypto.randomBytes(32).toString('hex');
  const sessionToken = requestSessionToken(req) || '';
  if (!sessionToken) return res.status(401).json({ error: 'UNAUTHORIZED' });
  calendarOAuthStates.set(state, { origin, token: sessionToken, expiresAt: Date.now() + 600000 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: calendarRedirectUri,
    response_type: 'code', state, scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    access_type: 'offline', prompt: 'consent' }).toString();
  return res.json({ url: url.href, redirectUri: calendarRedirectUri });
});

app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const pending = calendarOAuthStates.get(state);
  calendarOAuthStates.delete(state);
  const session = pending ? verifyTerminalSession(pending.token) : null;
  if (!pending || pending.expiresAt < Date.now() || !session?.valid || session.role !== 'admin') {
    return res.status(403).json({ error: 'INVALID_OAUTH_STATE' });
  }
  if (req.query.error || typeof req.query.code !== 'string') return res.status(400).send('Autorização Google cancelada ou inválida.');
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: req.query.code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: calendarRedirectUri, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10000) });
    if (!tokenResp.ok) return res.status(400).send('Não foi possível autorizar o Google Calendar.');
    const tokenData = await tokenResp.json() as any;
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token }, signal: AbortSignal.timeout(10000) });
    if (!profileResp.ok) return res.status(400).send('Não foi possível verificar a conta Google.');
    const profile = await profileResp.json() as any;
    const email = String(profile.email || '').toLowerCase();
    if (!email || (ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(email))) return res.status(403).send('Conta Google não autorizada.');
    const existing = readCalendarSession();
    saveCalendarSession({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token || (existing?.email === email ? existing.refresh_token : undefined),
      expiry_date: Date.now() + (tokenData.expires_in || 3600) * 1000, email, name: String(profile.name || ''), scope: tokenData.scope, updatedAt: new Date().toISOString() });
    const safeData = {
      type: 'GOOGLE_CALENDAR_CONNECTED',
      success: true,
      connected: true,
      email,
      name: String(profile.name || ''),
      targetOrigin: pending.origin,
    };
    const safeJson = JSON.stringify(safeData).replace(/[<>/]/g, c => ({ '<': '\\u003c', '>': '\\u003e', '/': '\\u002f' }[c] || c));
    return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Google Agenda conectado</title></head><body><h1>Google Agenda conectado</h1><p>Você pode fechar esta janela.</p><script id="oauth-payload" type="application/json">${safeJson}</script><script src="/oauth-callback.js" defer></script></body></html>`);
  } catch { return res.status(502).send('Falha ao conectar com o Google Calendar.'); }
});

// 4. Save client token on backend (backup store com whitelist)
app.post("/api/calendar/save-token", requireAdminWriteAuth, async (req: Request, res: Response) => {
  try {
    const { token, expiresIn = 3600, email, name } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token não fornecido" });
    }

    // 🔒 Blindagem de Segurança (Whitelist)
    if (email && ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email.toLowerCase())) {
      return res.status(403).json({
        error: "UNAUTHORIZED_EMAIL",
        message: `O e-mail ${email} não possui autorização de acesso a este cronograma.`,
      });
    }

    const existing = readCalendarSession();
    const session: CalendarSession = {
      access_token: token,
      refresh_token: existing?.refresh_token,
      expiry_date: Date.now() + expiresIn * 1000,
      email: email || existing?.email,
      name: name || existing?.name,
      updatedAt: new Date().toISOString(),
    };

    saveCalendarSession(session);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Calendar save token]', error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

// 5. Disconnect Google Calendar endpoint
app.post("/api/calendar/disconnect", requireAdminWriteAuth, (_req: Request, res: Response) => {
  clearCalendarSession();
  return res.json({ success: true, message: "Desconectado do Google Agenda com sucesso." });
});

// 6. Verify Google Calendar Token endpoint (compatibilidade legada)
app.post("/api/calendar/verify-token", requireAdminAuth, calendarLimiter, async (req: Request, res: Response) => {
  try {
    // Google OAuth tokens are server-side state; never accept one from a browser body/header.
    const token = await getValidCalendarAccessToken();

    if (!token) {
      return res.status(400).json({ valid: false, error: "Token não disponível" });
    }

    const verifyResp = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`
    );

    if (!verifyResp.ok) {
      return res.json({
        valid: false,
        reason: "expired_or_invalid",
        status: verifyResp.status,
      });
    }

    const tokenInfo = (await verifyResp.json()) as any;
    return res.json({
      valid: true,
      expiresIn: tokenInfo.expires_in,
      email: tokenInfo.email,
      scope: tokenInfo.scope,
    });
  } catch (error: any) {
    console.error('[Calendar verify token]', error);
    return res.json({ valid: false, error: "TOKEN_VERIFICATION_FAILED" });
  }
});

// 7. Create single Calendar Event endpoint (com auto-refresh de token)
app.post("/api/calendar/create-event", requireAdminWriteAuth, calendarLimiter, async (req: Request, res: Response) => {
  try {
    let token = await getValidCalendarAccessToken();

    if (!token) {
      return res.status(401).json({
        error: "TOKEN_MISSING",
        message: "Google Agenda não está conectado. Conecte sua conta para sincronizar.",
      });
    }

    const { event } = req.body;
    if (!event || !event.summary || !event.dateStr) {
      return res
        .status(400)
        .json({ error: "INVALID_PAYLOAD", message: "Campos obrigatórios: summary e dateStr." });
    }

    try {
      const data = await postGoogleCalendarEvent(token, event);
      return res.json({ success: true, eventId: data.id });
    } catch (apiErr: any) {
      // Se deu 401 e temos refresh_token, força renovação e tenta novamente
      if (apiErr?.status === 401) {
        const session = readCalendarSession();
        if (session?.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          session.expiry_date = 0; // força renovação
          saveCalendarSession(session);
          const freshToken = await getValidCalendarAccessToken();
          if (freshToken) {
            const retryData = await postGoogleCalendarEvent(freshToken, event);
            return res.json({ success: true, eventId: retryData.id });
          }
        }
        return res.status(401).json({
          error: "TOKEN_EXPIRED",
          message: "A autorização do Google Agenda expirou. Por favor, reconecte sua conta.",
        });
      }
      throw apiErr;
    }
  } catch (error: any) {
    const isApiDisabled = error?.googleError?.error?.message?.includes('Google Calendar API has not been used') ||
                          error?.message?.includes('Google Calendar API has not been used');
    const projectNumber = (GOOGLE_CLIENT_ID || "").split("-")[0] || "1077493396610";
    const message = isApiDisabled
      ? `A Google Calendar API precisa ser ativada no seu Google Cloud Console: https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${projectNumber}`
      : (error?.googleError?.error?.message || error?.message || (error?.status === 401 ? "A autorização do Google Agenda expirou." : "Falha ao criar evento na Google Agenda"));
    return res.status(error?.status || 500).json({
      error: isApiDisabled ? "GOOGLE_CALENDAR_API_DISABLED" : "CALENDAR_SYNC_FAILED",
      message,
    });
  }
});

// 8. Batch Sync Study Session & Spaced Revisions endpoint (com auto-refresh de token)
app.post("/api/calendar/batch-sync", requireAdminWriteAuth, calendarLimiter, async (req: Request, res: Response) => {
  try {
    let token = await getValidCalendarAccessToken();

    if (!token) {
      return res.status(401).json({
        error: "TOKEN_MISSING",
        message: "Google Agenda não está conectado. Conecte sua conta para sincronizar.",
      });
    }

    const { studyEvent, revisions = [] } = req.body;
    if (!studyEvent || !studyEvent.summary || !studyEvent.dateStr) {
      return res.status(400).json({
        error: "INVALID_PAYLOAD",
        message: "studyEvent com summary e dateStr é obrigatório.",
      });
    }

    // Função de sincronização com retentativa se 401
    const syncAll = async (authToken: string) => {
      // 1. Criar evento principal
      const mainEventData = await postGoogleCalendarEvent(authToken, studyEvent);
      const studyEventId = mainEventData.id;

      // 2. Criar revisões inteligentes em lote
      const revisionResults: Record<string, string> = {};
      for (const rev of revisions) {
        if (rev?.dateStr && rev?.summary) {
          try {
            const revData = await postGoogleCalendarEvent(authToken, rev);
            if (rev.tag) {
              revisionResults[rev.tag] = revData.id;
            }
          } catch (revErr) {
            console.warn(`Aviso: Falha ao criar revisão ${rev.tag}:`, revErr);
          }
        }
      }

      return { studyEventId, revisionResults };
    };

    try {
      const result = await syncAll(token);
      return res.json({
        success: true,
        studyEventId: result.studyEventId,
        revisionIds: result.revisionResults,
      });
    } catch (syncErr: any) {
      if (syncErr?.status === 401) {
        const session = readCalendarSession();
        if (session?.refresh_token && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          session.expiry_date = 0;
          saveCalendarSession(session);
          const freshToken = await getValidCalendarAccessToken();
          if (freshToken) {
            const retryResult = await syncAll(freshToken);
            return res.json({
              success: true,
              studyEventId: retryResult.studyEventId,
              revisionIds: retryResult.revisionResults,
            });
          }
        }
        return res.status(401).json({
          error: "TOKEN_EXPIRED",
          message: "A autorização do Google Agenda expirou. Por favor, reconecte sua conta.",
        });
      }
      throw syncErr;
    }
  } catch (error: any) {
    const isApiDisabled = error?.googleError?.error?.message?.includes('Google Calendar API has not been used') ||
                          error?.message?.includes('Google Calendar API has not been used');
    const projectNumber = (GOOGLE_CLIENT_ID || "").split("-")[0] || "1077493396610";
    const message = isApiDisabled
      ? `A Google Calendar API precisa ser ativada no seu Google Cloud Console: https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${projectNumber}`
      : (error?.googleError?.error?.message || error?.message || (error?.status === 401 ? "A autorização do Google Agenda expirou." : "Falha ao sincronizar eventos com Google Agenda"));
    return res.status(error?.status || 500).json({
      error: isApiDisabled ? "GOOGLE_CALENDAR_API_DISABLED" : "CALENDAR_SYNC_FAILED",
      message,
    });
  }
});

// ============================================================================
// RUMO ESTUDOS — módulo acadêmico isolado e sempre escopado ao usuário
// ============================================================================
app.use('/api/rumo-estudos', requireUserAuth);

app.use('/api/rumo-estudos', (req: Request, res: Response, next: NextFunction) => {
  const sessionUser = (req as any).user;
  const user = sessionUser?.userId ? userRepoInstance.findById(sessionUser.userId) : null;
  if (!user || (user.role !== 'admin' && !user.canAccessIfrj)) {
    return res.status(403).json({ error: 'IFRJ_FORBIDDEN', message: 'Acesso ao espaço IFRJ não liberado pelo administrador.' });
  }
  next();
});

function studentRouteUser(req: Request, res: Response): string | null {
  const userId = studentUserId(req);
  if (!userId) { res.status(401).json({ error: 'UNAUTHORIZED', message: 'Autenticação necessária.' }); return null; }
  return userId;
}

function isStudentDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

app.get('/api/rumo-estudos/dashboard', (req, res) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  return res.json({ success: true, dashboard: studentStudyRepoInstance.dashboard(userId) });
});

app.get('/api/rumo-estudos/profile', (req, res) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  studentStudyRepoInstance.ensureDefaults(userId);
  return res.json({ success: true, profile: studentStudyRepoInstance.getProfile(userId) });
});
const handleStudentProfileUpsert = (req: Request, res: Response) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'INVALID_PROFILE_PAYLOAD', message: 'Dados de perfil inválidos.' });
  }
  const textFields = ['displayName', 'institution', 'campus', 'course', 'schoolYear', 'className', 'shift', 'availableTimeJson'];
  if (!textFields.some((field) => body[field] !== undefined)) {
    return res.status(400).json({ error: 'INVALID_PROFILE_PAYLOAD', message: 'Informe ao menos um campo do perfil.' });
  }
  if (textFields.some((field) => body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string')) {
    return res.status(400).json({ error: 'INVALID_PROFILE_FIELD', message: 'Os campos do perfil devem ser textos válidos.' });
  }
  if (body.onboardingCompleted !== undefined && typeof body.onboardingCompleted !== 'boolean') {
    return res.status(400).json({ error: 'INVALID_PROFILE_FIELD', message: 'Status de onboarding inválido.' });
  }
  try {
    const payload: any = {};
    if (body.displayName !== undefined) payload.displayName = studentBodyText(body.displayName, 120);
    if (body.institution !== undefined) payload.institution = studentBodyText(body.institution, 120, 'IFRJ');
    if (body.campus !== undefined) payload.campus = studentBodyText(body.campus, 120);
    if (body.course !== undefined) payload.course = studentBodyText(body.course, 160);
    if (body.schoolYear !== undefined) payload.schoolYear = studentBodyText(body.schoolYear, 80);
    if (body.className !== undefined) payload.className = studentBodyText(body.className, 80);
    if (body.shift !== undefined) payload.shift = studentBodyText(body.shift, 40);
    if (body.availableTimeJson !== undefined) payload.availableTimeJson = studentBodyText(body.availableTimeJson, 8000);
    if (body.onboardingCompleted !== undefined) payload.onboardingCompleted = body.onboardingCompleted;

    const current = studentStudyRepoInstance.getProfile(userId);
    if (payload.onboardingCompleted && ![payload.displayName ?? current?.displayName, payload.campus ?? current?.campus, payload.course ?? current?.course].every((value) => value?.trim())) {
      return res.status(400).json({ error: 'INCOMPLETE_PROFILE', message: 'Informe nome, campus e curso antes de concluir o perfil.' });
    }

    databaseService.getRawDb().exec('BEGIN TRANSACTION;');
    const profile = studentStudyRepoInstance.upsertProfile(userId, payload);
    if (payload.displayName) {
      profileRepoInstance.createOrUpdate({ userId, fullName: payload.displayName });
    }
    databaseService.getRawDb().exec('COMMIT;');
    return res.json({ success: true, profile });
  } catch (err: any) {
    try { databaseService.getRawDb().exec('ROLLBACK;'); } catch {}
    logInternalError(`Student Profile Upsert Error userId=${userId}`, err);
    return res.status(500).json({ error: 'PROFILE_UPDATE_FAILED', message: 'Não foi possível salvar o perfil no momento. Tente novamente.' });
  }
};
app.patch('/api/rumo-estudos/profile', handleStudentProfileUpsert);
app.put('/api/rumo-estudos/profile', handleStudentProfileUpsert);

app.get('/api/rumo-estudos/subjects', (req, res) => { const userId=studentRouteUser(req,res); if(!userId)return; studentStudyRepoInstance.ensureDefaults(userId); return res.json({success:true,subjects:studentStudyRepoInstance.listSubjects(userId),periods:studentStudyRepoInstance.listPeriods(userId)}); });
app.post('/api/rumo-estudos/subjects', (req, res) => { const userId=studentRouteUser(req,res); if(!userId)return; const name=studentBodyText(req.body?.name,120); if(!name)return res.status(400).json({error:'INVALID_SUBJECT'}); try{return res.status(201).json({success:true,subject:studentStudyRepoInstance.createSubject(userId,{name,category:studentBodyText(req.body?.category,40,'custom'),source:'custom'})});}catch{return res.status(409).json({error:'SUBJECT_ALREADY_EXISTS'});} });
app.patch('/api/rumo-estudos/subjects/:id', (req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const updated=studentStudyRepoInstance.updateSubject(userId,req.params.id,{name:studentBodyText(req.body?.name,120),category:studentBodyText(req.body?.category,40)});return updated?res.json({success:true,subject:updated}):res.status(404).json({error:'NOT_FOUND'});});
app.delete('/api/rumo-estudos/subjects/:id', (req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return studentStudyRepoInstance.deleteSubject(userId,req.params.id)?res.status(204).end():res.status(404).json({error:'NOT_FOUND'});});
app.get('/api/rumo-estudos/subjects/:id/topics',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;if(!studentStudyRepoInstance.getSubject(userId,req.params.id))return res.status(404).json({error:'NOT_FOUND'});return res.json({success:true,topics:studentStudyRepoInstance.listTopics(userId,req.params.id)});});
app.post('/api/rumo-estudos/subjects/:id/topics',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;if(!studentStudyRepoInstance.getSubject(userId,req.params.id))return res.status(404).json({error:'NOT_FOUND'});const name=studentBodyText(req.body?.name,120);if(!name)return res.status(400).json({error:'INVALID_TOPIC'});return res.status(201).json({success:true,topic:studentStudyRepoInstance.createTopic(userId,req.params.id,name)});});
app.delete('/api/rumo-estudos/topics/:id',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return studentStudyRepoInstance.deleteTopic(userId,req.params.id)?res.status(204).end():res.status(404).json({error:'NOT_FOUND'});});

app.get('/api/rumo-estudos/grades',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,grades:studentStudyRepoInstance.listGrades(userId)});});
app.post('/api/rumo-estudos/grades', (req, res) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  const body = req.body || {};
  const score = studentNumeric(body.score, 0, 10);
  const assessmentName = studentBodyText(body.assessmentName, 120);
  if (!assessmentName || score === undefined) return res.status(400).json({ error: 'INVALID_GRADE', message: 'A nota deve estar entre 0 e 10 e o nome da avaliação é obrigatório.' });
  const subjectId = studentBodyText(body.subjectId, 80);
  if (!subjectId) return res.status(400).json({ error: 'INVALID_SUBJECT', message: 'Selecione uma matéria válida.' });
  const created = studentStudyRepoInstance.createGrade(userId, {
    subjectId,
    periodId: body.periodId ? studentBodyText(body.periodId, 80) : null,
    assessmentName,
    score,
    weight: studentNumeric(body.weight, 0.01, 100, 1) ?? 1,
    source: studentBodyText(body.source, 40, 'manual'),
    isUncertain: Boolean(body.isUncertain)
  });
  return created ? res.status(201).json({ success: true, grade: created }) : res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Matéria ou período não encontrado para este estudante.' });
});
app.patch('/api/rumo-estudos/grades/:id', (req, res) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  const body = req.body || {};
  const score = body.score === undefined ? undefined : studentNumeric(body.score, 0, 10);
  if (body.score !== undefined && score === undefined) return res.status(400).json({ error: 'INVALID_GRADE', message: 'A nota deve estar entre 0 e 10.' });
  const updated = studentStudyRepoInstance.updateGrade(userId, req.params.id, {
    subjectId: body.subjectId ? studentBodyText(body.subjectId, 80) : undefined,
    periodId: body.periodId === undefined ? undefined : (body.periodId ? studentBodyText(body.periodId, 80) : null),
    assessmentName: body.assessmentName === undefined ? undefined : studentBodyText(body.assessmentName, 120),
    score,
    weight: body.weight === undefined ? undefined : studentNumeric(body.weight, 0.01, 100),
    source: body.source ? studentBodyText(body.source, 40) : undefined,
    isUncertain: body.isUncertain === undefined ? undefined : Boolean(body.isUncertain)
  });
  return updated ? res.json({ success: true, grade: updated }) : res.status(404).json({ error: 'NOT_FOUND', message: 'Avaliação não encontrada.' });
});
app.delete('/api/rumo-estudos/grades/:id',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return studentStudyRepoInstance.deleteGrade(userId,req.params.id)?res.status(204).end():res.status(404).json({error:'NOT_FOUND'});});

app.get('/api/rumo-estudos/exams',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,exams:studentStudyRepoInstance.listExams(userId)});});
app.post('/api/rumo-estudos/exams',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const b=req.body||{},examDate=b.examDate; if(!studentBodyText(b.name,160)||!isStudentDate(examDate))return res.status(400).json({error:'INVALID_EXAM'});const exam=studentStudyRepoInstance.createExam(userId,{subjectId:b.subjectId?studentBodyText(b.subjectId,80):null,name:studentBodyText(b.name,160),examDate,examTime:studentBodyText(b.examTime,20),weight:studentNumeric(b.weight,0.01,100,1),targetGrade:b.targetGrade===null?null:studentNumeric(b.targetGrade,0,10),topics:Array.isArray(b.topics)?b.topics.slice(0,40):[],notes:studentBodyText(b.notes,2000),room:studentBodyText(b.room,120),status:['planned','completed','cancelled'].includes(b.status)?b.status:'planned'});return exam?res.status(201).json({success:true,exam}):res.status(404).json({error:'SUBJECT_NOT_FOUND'});});
app.patch('/api/rumo-estudos/exams/:id',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const b=req.body||{},updated=studentStudyRepoInstance.updateExam(userId,req.params.id,{subjectId:b.subjectId===undefined?undefined:(b.subjectId?studentBodyText(b.subjectId,80):null),name:b.name===undefined?undefined:studentBodyText(b.name,160),examDate:b.examDate===undefined?undefined:(isStudentDate(b.examDate)?b.examDate:undefined),examTime:b.examTime===undefined?undefined:studentBodyText(b.examTime,20),weight:b.weight===undefined?undefined:studentNumeric(b.weight,0.01,100),targetGrade:b.targetGrade===undefined?undefined:(b.targetGrade===null?null:studentNumeric(b.targetGrade,0,10)),topics:Array.isArray(b.topics)?b.topics.slice(0,40):undefined,notes:b.notes===undefined?undefined:studentBodyText(b.notes,2000),room:b.room===undefined?undefined:studentBodyText(b.room,120),status:b.status});return updated?res.json({success:true,exam:updated}):res.status(404).json({error:'NOT_FOUND'});});
app.delete('/api/rumo-estudos/exams/:id',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return studentStudyRepoInstance.deleteExam(userId,req.params.id)?res.status(204).end():res.status(404).json({error:'NOT_FOUND'});});

app.get('/api/rumo-estudos/calendar',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,events:studentStudyRepoInstance.listEvents(userId)});});
app.post('/api/rumo-estudos/calendar',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const b=req.body||{},allowed=['exam','assignment','vestibular','academic','custom'];if(!allowed.includes(b.eventType)||!studentBodyText(b.title,160)||!isStudentDate(b.eventDate))return res.status(400).json({error:'INVALID_EVENT'});const event=studentStudyRepoInstance.createEvent(userId,{eventType:b.eventType,title:studentBodyText(b.title,160),eventDate:b.eventDate,startTime:studentBodyText(b.startTime,20),endTime:studentBodyText(b.endTime,20),examId:b.examId?studentBodyText(b.examId,80):null,notes:studentBodyText(b.notes,2000)});return event?res.status(201).json({success:true,event}):res.status(404).json({error:'EXAM_NOT_FOUND'});});
app.delete('/api/rumo-estudos/calendar/:id',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return studentStudyRepoInstance.deleteEvent(userId,req.params.id)?res.status(204).end():res.status(404).json({error:'NOT_FOUND'});});

app.get('/api/rumo-estudos/goals',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,goals:studentStudyRepoInstance.listGoals(userId)});});
app.post('/api/rumo-estudos/goals',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const degree=studentBodyText(req.body?.degree,160);if(!degree)return res.status(400).json({error:'INVALID_GOAL'});return res.status(201).json({success:true,goal:studentStudyRepoInstance.createGoal(userId,{degree,selectionSystem:studentBodyText(req.body?.selectionSystem,60,'ENEM'),institutions:Array.isArray(req.body?.institutions)?req.body.institutions.slice(0,20):[]})});});

app.get('/api/rumo-estudos/universities/institutions',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,items:studentStudyRepoInstance.searchInstitutions(userId,studentBodyText(req.query.q,80),Number(req.query.limit)||25,Number(req.query.offset)||0)});});
app.get('/api/rumo-estudos/universities/courses',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,items:studentStudyRepoInstance.searchCourses(userId,studentBodyText(req.query.q,80),Number(req.query.limit)||25,Number(req.query.offset)||0)});});
app.get('/api/rumo-estudos/ai/history',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,items:studentStudyRepoInstance.listAnalyses(userId),usage:studentStudyRepoInstance.usage(userId)});});
app.get('/api/rumo-estudos/ai/usage',(req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;return res.json({success:true,usage:studentStudyRepoInstance.usage(userId),limits:{requestsPerDay:studentAiMaxRequestsPerDay,reportsPerDay:studentAiMaxReportAnalysesPerDay}});});

app.post('/api/rumo-estudos/ai/analysis', aiLimiter, async (req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const dashboard=studentStudyRepoInstance.dashboard(userId),schema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},priorities:{type:'array',items:{type:'object',additionalProperties:false,properties:{subject:{type:'string'},reason:{type:'string'},action:{type:'string'}},required:['subject','reason','action']}},todayPlan:{type:'array',items:{type:'string'}}},required:['summary','priorities','todayPlan']};const result=await runStudentOpenAI({userId,type:'performance_analysis',prompt:`Analise apenas este contexto acadêmico resumido e recomende o foco de hoje. Escola e vestibular são prioridades separadas. Contexto: ${JSON.stringify({profile:dashboard.profile,performance:dashboard.performance.slice(0,8),exams:dashboard.exams.slice(0,5),goals:dashboard.goals})}`,schema});if(result.data){studentStudyRepoInstance.saveAnalysis(userId,'performance_analysis',result.data.summary,result.data);return res.json({success:true,source:'openai',analysis:result.data});}return res.status(result.error==='AI_LIMIT_REACHED'?429:503).json({error:result.error||'AI_UNAVAILABLE',message:result.error==='AI_LIMIT_REACHED'?'Limite diário de IA atingido.':'Não foi possível realizar a análise agora. Suas informações continuam salvas.'});});

app.post('/api/rumo-estudos/ai/assistant', aiLimiter, async (req, res) => {
  const userId = studentRouteUser(req, res); if (!userId) return;
  const question = studentBodyText(req.body?.question, 600);
  if (!question) return res.status(400).json({ error: 'INVALID_QUESTION' });

  // Guarda de escopo estrito: o assistente NÃO responde questões de prova, vestibulares ou exercícios acadêmicos
  const qLower = question.toLowerCase();
  const isQuestionSolvingRequest =
    /(\bquest[aã]o\b|\bexerc[íi]cio\b|\balternativa\b|\bassinale\b|\bmarque a op[cç][aã]o\b|\bgabarito\b|\bresolva (esta|a|o|os|as)\b|\bqual (a|é a) resposta\b|\bcalcule\b|\b[a-e]\)\s+)/i.test(qLower) &&
    !/(\bcomo organizar\b|\bminhas provas\b|\bquando [eé]\b|\bmeu boletim\b|\bcomo estudar\b|\bcalend[aá]rio\b|\bgrade\b)/i.test(qLower);

  if (isQuestionSolvingRequest) {
    const refusal = {
      answer: "Como assistente acadêmica do seu espaço IFRJ, meu foco é exclusivamente a organização da sua rotina de estudos, matérias, boletim, provas cadastradas e ferramentas da plataforma. Não resolvo questões ou exercícios de provas diretamente. Que tal conversarmos sobre como organizar seu cronograma para essa matéria ou cadastrar suas próximas provas no calendário?",
      actions: ["Revisar matérias cadastradas", "Ver próximas provas no calendário", "Acessar o Banco de Provas"]
    };
    studentStudyRepoInstance.saveAnalysis(userId, 'study_plan', refusal.answer, refusal);
    return res.json({ success: true, source: 'system_guardrail', ...refusal });
  }

  const dashboard = studentStudyRepoInstance.dashboard(userId);
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      actions: { type: 'array', items: { type: 'string' } }
    },
    required: ['answer', 'actions']
  };

  const systemPrompt = `Você é a Assistente Acadêmica do Espaço IFRJ (Rumo Estudos).
Seu objetivo é orientar a aluna exclusivamente sobre organização acadêmica, rotina de estudos, matérias escolares do IFRJ, boletim, próximas provas e uso dos recursos da plataforma.
REGRA INEGOCIÁVEL DE ESCOPO:
Você NUNCA deve responder questões de provas, vestibulares, concursos ou exercícios escolares. Se o aluno pedir resolução de exercícios, enunciados ou gabaritos, recuse educadamente explicando que você é focada na gestão da rotina e planejamento do site, e sugira como a aluna pode organizar seus horários para estudar esse conteúdo.
Pergunta da estudante: ${question}
Contexto acadêmico da estudante: ${JSON.stringify({ performance: dashboard.performance.slice(0, 6), exams: dashboard.exams.slice(0, 5), goals: dashboard.goals.slice(0, 2), profile: { course: dashboard.profile?.course } })}`;

  const result = await runStudentOpenAI({
    userId,
    type: 'study_assistant',
    prompt: systemPrompt,
    schema
  });

  if (result.data) {
    studentStudyRepoInstance.saveAnalysis(userId, 'study_plan', result.data.answer, result.data);
    return res.json({ success: true, source: 'openai', ...result.data });
  }
  return res.status(result.error === 'AI_LIMIT_REACHED' ? 429 : 503).json({
    error: result.error || 'AI_UNAVAILABLE',
    message: result.error === 'AI_LIMIT_REACHED' ? 'Limite diário de IA atingido.' : 'Não foi possível responder agora.'
  });
});

app.post('/api/rumo-estudos/report-cards', (req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const fileId=studentBodyText(req.body?.fileId,80);const file=uploadedFileRepoInstance.findById(fileId);if(!file||file.userId!==userId)return res.status(404).json({error:'FILE_NOT_FOUND'});const reportCard=studentStudyRepoInstance.createReportCard(userId,fileId,req.body?.periodId?studentBodyText(req.body.periodId,80):null);return reportCard?res.status(201).json({success:true,reportCard}):res.status(404).json({error:'PERIOD_NOT_FOUND'});});
app.post('/api/rumo-estudos/report-cards/analyze', aiLimiter, async (req,res)=>{const userId=studentRouteUser(req,res);if(!userId)return;const fileId=studentBodyText(req.body?.fileId,80);const file=uploadedFileRepoInstance.findById(fileId);if(!file||file.userId!==userId)return res.status(404).json({error:'FILE_NOT_FOUND'});const access=secureUploadService.getAuthorizedFile(fileId,userId,false);if(!access.authorized||!access.file||!access.buffer)return res.status(400).json({error:'FILE_NOT_READY',message:'Não foi possível ler este arquivo.'});const schema={type:'object',additionalProperties:false,properties:{subjects:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:{type:'string'},grade:{type:['number','null']},period:{type:'string'},assessment:{type:'string'},uncertain:{type:'boolean'}},required:['name','grade','period','assessment','uncertain']}}},required:['subjects']};const result=await runStudentOpenAI({userId,type:'report_card_extraction',prompt:'Extraia somente notas acadêmicas visíveis neste boletim. Para cada item, informe matéria, nota numérica de 0 a 10 se legível, período e avaliação. Se não for possível identificar a nota, use null e uncertain=true. Não crie dados ausentes.',schema,file:{buffer:access.buffer,mimeType:access.file.mimeType,filename:access.file.originalFilename},report:true});if(result.data){studentStudyRepoInstance.saveAnalysis(userId,'report_card',`Boletim analisado: ${result.data.subjects.length} item(ns) encontrado(s).`,result.data);return res.json({success:true,source:'openai',extracted:result.data});}return res.status(result.error==='AI_LIMIT_REACHED'?429:503).json({error:result.error||'AI_UNAVAILABLE',message:result.error==='AI_LIMIT_REACHED'?'Limite diário de análises de boletim atingido.':'Não foi possível analisar o arquivo agora.'});});

// AI identity is derived solely from the authenticated server session.
app.use('/api/ai', requireUserAuth, aiLimiter);

function validateAiTextFields(
  res: Response,
  fields: Array<{ name: string; value: unknown; maxBytes: number }>,
): boolean {
  for (const field of fields) {
    if (field.value !== undefined && typeof field.value !== 'string') {
      res.status(400).json({ error: 'INVALID_AI_INPUT', message: `${field.name} deve ser texto.` });
      return false;
    }
    if (typeof field.value === 'string' && Buffer.byteLength(field.value, 'utf8') > field.maxBytes) {
      res.status(413).json({ error: 'AI_INPUT_TOO_LARGE', message: `${field.name} excede o limite permitido.` });
      return false;
    }
  }
  return true;
}

// AI Study Analysis Endpoint
app.post("/api/ai/study-analysis", requireUserAuth, aiLimiter, async (req: Request, res: Response) => {
  try {
    const { weeklySummary } = req.body;

    if (!weeklySummary || typeof weeklySummary !== 'object' || Array.isArray(weeklySummary)) {
      return res.status(400).json({ error: "weeklySummary is required" });
    }

    if (Buffer.byteLength(JSON.stringify(weeklySummary), 'utf8') > 64 * 1024) {
      return res.status(413).json({ error: 'AI_INPUT_TOO_LARGE', message: 'weeklySummary excede o limite permitido.' });
    }

    const {
      totalSessions = 0,
      totalHours = 0,
      subjectsStudied = [],
      subjectsNotStudied = [],
      allSubjects = [],
    } = weeklySummary;

    const ai = getGeminiClient();

    // If Gemini is available, attempt generateContent with fallback models
    if (ai) {
      const prompt = `Você é o Coordenador Pedagógico e Estrategista Chefe para o concurso de Oficial Combatente do Corpo de Bombeiros Militar do Estado do Rio de Janeiro (CFO CBMERJ).
Analise o desempenho de estudos do candidato na semana atual e determine:
1. Qual a matéria mais estudada e sua eficácia.
2. Quais matérias ele DEVE priorizar na próxima semana para equilibrar a preparação, considerando a exigência do edital do CFO CBMERJ (onde Física, Matemática, Química, Português/Redação têm peso decisivo).
3. Um plano tático de equilíbrio para a próxima semana (segunda a domingo).
4. Uma pontuação de equilíbrio (0 a 100).

Dados dos estudos da semana atual:
- Total de sessões concluídas: ${totalSessions}
- Total de horas estudadas: ${totalHours}h
- Matérias estudadas e carga horária: ${JSON.stringify(subjectsStudied)}
- Matérias NÃO estudadas nesta semana: ${JSON.stringify(subjectsNotStudied)}
- Grade total de matérias: ${JSON.stringify(allSubjects)}

Gere uma resposta estruturada e personalizada focada na aprovação no CFO CBMERJ.`;

      const candidateModels = [
        "gemini-2.5-flash",
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
      ];
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction:
                "Você é um tutor especialista de elite focado em aprovar alunos no concurso CFO CBMERJ. Seja motivador, cirúrgico, tático e objetivo.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  topStudiedSubject: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      hours: { type: Type.NUMBER },
                      sessions: { type: Type.NUMBER },
                      analysis: { type: Type.STRING },
                      status: { type: Type.STRING },
                    },
                    required: ["name", "hours", "sessions", "analysis", "status"],
                  },
                  prioritySubjectsForNextWeek: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        reason: { type: Type.STRING },
                        recommendedHours: { type: Type.NUMBER },
                        urgency: { type: Type.STRING },
                        topicsSuggested: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                      },
                      required: [
                        "name",
                        "reason",
                        "recommendedHours",
                        "urgency",
                        "topicsSuggested",
                      ],
                    },
                  },
                  balanceDiagnosis: { type: Type.STRING },
                  weeklyActionPlan: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        day: { type: Type.STRING },
                        focusSubject: { type: Type.STRING },
                        goal: { type: Type.STRING },
                        suggestedMinutes: { type: Type.NUMBER },
                      },
                      required: ["day", "focusSubject", "goal", "suggestedMinutes"],
                    },
                  },
                  tacticalTip: { type: Type.STRING },
                  equilibriumScore: { type: Type.NUMBER },
                },
                required: [
                  "topStudiedSubject",
                  "prioritySubjectsForNextWeek",
                  "balanceDiagnosis",
                  "weeklyActionPlan",
                  "tacticalTip",
                  "equilibriumScore",
                ],
              },
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            return res.json({
              source: "gemini",
              data: parsed,
            });
          }
        } catch (geminiError: any) {
          const status =
            geminiError?.status ||
            geminiError?.code ||
            (geminiError?.message?.includes("503")
              ? 503
              : geminiError?.message?.includes("429")
              ? 429
              : "indisponível");
          const isTransient =
            status === 503 || status === 429 || geminiError?.status === "UNAVAILABLE";
          console.info(
            `[AI Router] Modelo ${modelName} ${
              isTransient ? "sob alta demanda temporária (503/429)" : "indisponível"
            }. Alternando para modelo seguinte...`
          );
          if (isTransient) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }
      }
    }

    // Heuristic intelligent fallback when API key is not configured or all Gemini models are experiencing temporary demand spikes
    const topStudied =
      subjectsStudied.length > 0
        ? [...subjectsStudied].sort((a: any, b: any) => b.minutes - a.minutes)[0]
        : {
            name: allSubjects[0]?.name || "Nenhuma matéria registrada",
            minutes: 0,
            sessions: 0,
          };

    // Priority candidates: subjects with zero or lowest minutes
    const sortedLow = [...allSubjects].sort((a: any, b: any) => {
      const minA =
        subjectsStudied.find((s: any) => s.name === a.name)?.minutes || 0;
      const minB =
        subjectsStudied.find((s: any) => s.name === b.name)?.minutes || 0;
      return minA - minB;
    });

    const priorityList = sortedLow.slice(0, 4).map((sub: any) => {
      const isExatas = ["Física", "Matemática", "Química"].includes(sub.name);
      return {
        name: sub.name,
        reason: isExatas
          ? `Disciplina com alto peso no edital do CFO CBMERJ. Teve pouca ou nenhuma carga horária nesta semana.`
          : `Necessária para manter a nota de corte equilibrada nas provas objetivas da banca.`,
        recommendedHours: isExatas ? 3.5 : 2.0,
        urgency: isExatas ? "alta" : "media",
        topicsSuggested: [
          `Revisão de conceitos fundamentais e resolução de questões de bancas anteriores`,
          `Simulado temático focado em erros comuns`,
        ],
      };
    });

    const studiedCount = subjectsStudied.length;
    const totalCount = allSubjects.length || 1;
    const equilibriumScore = Math.min(
      100,
      Math.round((studiedCount / totalCount) * 70 + (totalHours > 10 ? 30 : totalHours * 3))
    );

    const fallbackData = {
      topStudiedSubject: {
        name: topStudied.name,
        hours: Number((topStudied.minutes / 60).toFixed(1)),
        sessions: topStudied.sessions || 1,
        analysis:
          topStudied.minutes > 0
            ? `Você dedicou a maior parte da sua energia em ${topStudied.name}. Isso demonstra consistência, mas é fundamental evitar hiperfoco para não desfalcar outras matérias da prova.`
            : `Você ainda não registrou matérias estudadas nesta semana. Inicie marcando seus estudos para a IA calcular o balanço.`,
        status: topStudied.minutes > 0 ? "Líder em Carga Horária" : "Aguardando Início",
      },
      prioritySubjectsForNextWeek: priorityList,
      balanceDiagnosis:
        subjectsNotStudied.length > 0
          ? `Você tem ${subjectsNotStudied.length} matéria(s) sem nenhum registro nesta semana. Para a prova de Oficial Combatente, o equilíbrio entre Exatas, Linguagens e Humanas é o diferencial para a classificação.`
          : `Excelente distribuição! Todas as matérias principais tiveram contato nesta semana. Continue mantendo a rotina equilibrada.`,
      weeklyActionPlan: [
        {
          day: "Segunda-feira",
          focusSubject: priorityList[0]?.name || "Física",
          goal: "Teoria e 25 exercícios de fixação",
          suggestedMinutes: 90,
        },
        {
          day: "Terça-feira",
          focusSubject: priorityList[1]?.name || "Matemática",
          goal: "Resolução comentada de provas do CFO",
          suggestedMinutes: 90,
        },
        {
          day: "Quarta-feira",
          focusSubject: priorityList[2]?.name || "Química",
          goal: "Leitura de tópicos prioritários do edital",
          suggestedMinutes: 90,
        },
        {
          day: "Quinta-feira",
          focusSubject: topStudied.name || "Língua Portuguesa",
          goal: "Manutenção do ritmo e redação temática",
          suggestedMinutes: 60,
        },
        {
          day: "Sexta-feira",
          focusSubject: priorityList[3]?.name || "Biologia",
          goal: "Mapas mentais e bateria rápida de testes",
          suggestedMinutes: 60,
        },
        {
          day: "Sábado",
          focusSubject: "Simulado Geral & Revisões",
          goal: "Revisões inteligentes agendadas de 7d e 30d",
          suggestedMinutes: 120,
        },
        {
          day: "Domingo",
          focusSubject: "Descanso Ativo & TAF",
          goal: "Revisão leve de fórmulas e treino físico para o CFO",
          suggestedMinutes: 45,
        },
      ],
      tacticalTip:
        "O CFO CBMERJ elimina candidatos que zeram ou tiram nota muito baixa em Exatas. Não deixe Física ou Química de lado mesmo que sua afinidade seja menor!",
      equilibriumScore,
    };

    return res.json({
      source: "heuristic",
      data: fallbackData,
    });
  } catch (error: any) {
    console.warn("Rota /api/ai/study-analysis acionando contingência pedagógica:", error?.message || error);
    // Return a safe minimal fallback so client never gets an error alert
    res.json({
      source: "heuristic",
      data: {
        topStudiedSubject: {
          name: "Matérias do Edital CFO CBMERJ",
          hours: 0,
          sessions: 0,
          analysis: "Ciclo de estudos em andamento. Mantenha a constância.",
          status: "Em evolução",
        },
        prioritySubjectsForNextWeek: [
          {
            name: "Física",
            reason: "Disciplina de alto peso no CFO CBMERJ",
            recommendedHours: 3,
            urgency: "Alta",
            topicsSuggested: ["Cinemática", "Dinâmica e Leis de Newton"],
          },
          {
            name: "Matemática",
            reason: "Critério eliminatório de pontuação mínima",
            recommendedHours: 3,
            urgency: "Alta",
            topicsSuggested: ["Funções", "Trigonometria e Geometria"],
          },
        ],
        balanceDiagnosis: "Equilíbrio semanal focado nas matérias centrais do CFO CBMERJ.",
        weeklyActionPlan: [
          { day: "Segunda-feira", focusSubject: "Física", goal: "Teoria e 15 questões", suggestedMinutes: 60 },
          { day: "Terça-feira", focusSubject: "Matemática", goal: "Resolução comentada", suggestedMinutes: 60 },
          { day: "Quarta-feira", focusSubject: "Química", goal: "Estequiometria", suggestedMinutes: 60 },
          { day: "Quinta-feira", focusSubject: "Português", goal: "Interpretação e Redação", suggestedMinutes: 60 },
          { day: "Sexta-feira", focusSubject: "Biologia", goal: "Fisiologia humana", suggestedMinutes: 60 },
          { day: "Sábado", focusSubject: "Simulados e Revisões", goal: "Revisão ativa", suggestedMinutes: 120 },
          { day: "Domingo", focusSubject: "Treinamento Físico (TAF)", goal: "Corrida e barra fixa", suggestedMinutes: 45 },
        ],
        tacticalTip: "O CFO CBMERJ recompensa a constância. Estude um pouco todos os dias sem deixar Exatas zeradas.",
        equilibriumScore: 75,
      },
    });
  }
});

// Helper function to guarantee strictly separated topics with blank lines
function formatNotesIntoSeparatedTopics(raw: string): string {
  if (!raw) return "";
  let text = raw.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip excessive initial header if generic
  text = text.replace(/^RESUMO TÁTICO\s*(?:&|E)?\s*BIZUS?:[^\n]*\n+/i, "").trim();

  // Normalize numbers like "1. 📌 CONCEITO...", "1. Conceito...", "1 - Conceito..." into "Tópico 1 - Conceito..."
  text = text.replace(
    /(?:^|\n|\s{2,})(?:T[oó]pico\s*)?([1-9])\s*(?:[.)\-–—:]\s*)(?:[📌📐⚡⚠️🎯💡🔍*]*\s*)([^\n]+?)(?::|\n|$)/gi,
    (_match, num, rawTitle) => {
      let cleanTitle = rawTitle.trim().replace(/^[-–—:* ]+|[-–—:* ]+$/g, "").trim();
      return `\n\nTópico ${num} - ${cleanTitle}\n`;
    }
  );

  // Guarantee double newline before any "Tópico X -"
  text = text.replace(/([^\n])\s*(T[oó]pico\s*[1-9]\s*[-–—:])/gi, "$1\n\n$2");

  // Collapse 3 or more newlines to exactly 2
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  return text;
}

function parseAiJsonResponse(raw: string): any {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

// Endpoint: AI Bizu Notes Generator using Gemini
app.post("/api/ai/bizu-notes", requireUserAuth, aiLimiter, async (req: Request, res: Response) => {
  try {
    const {
      title = "",
      subject = "",
      category = "",
      existingNotes = "",
      promptHint = "",
    } = req.body;

    if (!validateAiTextFields(res, [
      { name: 'title', value: title, maxBytes: 500 },
      { name: 'subject', value: subject, maxBytes: 200 },
      { name: 'category', value: category, maxBytes: 200 },
      { name: 'existingNotes', value: existingNotes, maxBytes: 20 * 1024 },
      { name: 'promptHint', value: promptHint, maxBytes: 2 * 1024 },
    ])) return;

    if (!title && !subject) {
      return res.status(400).json({ error: "Título ou matéria são obrigatórios." });
    }

    const ai = getGeminiClient();
    if (ai) {
      const prompt = `Você é o Estrategista Pedagógico Chefe e Especialista nas bancas do concurso CFO CBMERJ (Oficial Combatente do Corpo de Bombeiros Militar do Estado do Rio de Janeiro) e exames militares (UERJ, EsPCEx, EEAR, AFA).
O concurseiro está criando um Bizu Tático para o seu Bizuário de estudos informando apenas o assunto ou matéria.

Dados fornecidos:
- Matéria informada: ${subject || "Não especificada"}
- Conteúdo / Assunto solicitado: ${title || subject}
- Categoria sugerida: ${category || "Edital CFO CBMERJ"}
- Anotações prévias (se houver): ${existingNotes || "Nenhuma"}
- Foco específico: ${promptHint || "Geração direta de anotação detalhada com fórmulas militares mais importantes em LaTeX"}

INSTRUÇÃO CRÍTICA 1 - AUTO-IDENTIFICAÇÃO DE MATÉRIA:
Analise o Conteúdo / Assunto fornecido (ex: 'Circuito Elétrico', 'Calorimetria', 'Trigonometria', 'Cartografia', 'Concordância Verbal').
IDENTIFIQUE E CONFIRME a Matéria principal exata a qual este assunto pertence no edital (ex: para 'Circuito Elétrico' ou 'Eletrodinâmica', a matéria é 'Física'; para 'Escalas', é 'Geografia'). Retorne o nome exato da matéria no campo "detectedSubject" (ex: "Física", "Matemática", "Química", "Geografia", "História", "Língua Portuguesa", "Biologia").

INSTRUÇÃO CRÍTICA 2 - FÓRMULAS E BIZUS MAIS IMPORTANTES DE PROVAS MILITARES:
Se o aluno forneceu um tópico genérico ou amplo (ex: 'Circuito Elétrico'), selecione e sintetize APENAS AS FÓRMULAS, LEIS E DICAS MAIS IMPORTANTES E MAIS RECORRENTES NAS PROVAS MILITARES (ex: $V = R \\cdot i$, $P = V \\cdot i$, $P = R \\cdot i^2$, Associação Série/Paralelo $R_{eq}$, Leis de Kirchhoff). Se o aluno pediu algo mais específico, aborde o especificou mais os pontos fundamentais de prova.

IMPORTANTE SOBRE NOTAÇÃO MATEMÁTICA / FÍSICA E DESTAQUES:
SEMPRE utilize notação LaTeX com delimitadores $...$ (em linha) ou $$...$$ (em bloco) para quaisquer fórmulas matemáticas, físicas, químicas ou de escalas (ex: $E = \\frac{d}{D}$, $Q = m \\cdot c \\cdot \\Delta T$, $v^2 = v_0^2 + 2a\\Delta s$, etc.).
Para palavras em negrito no texto normal, use a sintaxe markdown **destaque** (não use comandos LaTeX como \\textbf fora de delimitadores matemáticos).

INSTRUÇÃO CRÍTICA DE SEPARAÇÃO EM TÓPICOS NO CAMPO "notes":
O texto do campo "notes" NÃO PODE DE FORMA ALGUMA FICAR AMONTOADO EM UM PARÁGRAFO CORRIDO.
DEVE FICAR RIGOROSAMENTE SEPARADO EM TÓPICOS COM UMA LINHA EM BRANCO (duplo \n\n) ENTRE CADA UM DELES, exatamente neste formato:

Tópico 1 - Conceito Essencial & Fundamentos
• Definição clara, formal e didática do assunto.
• Relações fundamentais de causa e efeito e aplicabilidade no CFO CBMERJ.

Tópico 2 - Fórmulas & Equações de Alta Incidência nas Provas Militares (LaTeX)
• Todas as equações vitais para o concurso com notação LaTeX ($...$).
• Significado de cada grandeza e unidades no Sistema Internacional (SI).

Tópico 3 - Bizus Táticos & Mnemônicos
• Frases mnemônicas, macetes consagrados e regras práticas para memorização rápida.

Tópico 4 - Pegadinhas Clássicas das Bancas (UERJ / FGV / IDECAN)
• Armadilhas frequentes em enunciados recentes do CFO CBMERJ e distratores que eliminam candidatos.

Tópico 5 - Método de Prova & Resolução Rápida
• Passo a passo para matar a questão em menos de 2 minutos sem perder tempo com contas desnecessárias.

Estruture a resposta JSON contendo:
1. "detectedSubject": Nome da matéria identificada pela IA (ex: "Física", "Matemática", "Química", "Geografia", "História", "Língua Portuguesa", "Biologia").
2. "refinedTitle": Título elegante, profissional e direto para o Conteúdo/Bizu (ex: "Pigmentos vegetais e cores das folhas", "Física: Leis de Ohm e Potência").
3. "statement": Enunciado contextualizado ou contexto de questão clássica do concurso CFO CBMERJ sobre esse tópico (opcional, 1 a 3 frases sintetizando como a banca cobra o assunto em prova).
4. "category": Categoria ou eixo temático refinado (ex: "Eletrodinâmica & Circuitos", "Geopolítica & Cartografia", "Mecânica Clássica", etc.).
5. "notes": Texto com os tópicos OBRIGATORIAMENTE separados por linhas em branco conforme o modelo acima.
6. "keyPoints": Array com 4 a 6 tópicos estratégicos ultra-sintéticos (bullets diretos com fórmulas em $...$).
7. "tags": Array com 4 a 6 tags/palavras-chave estratégicas para filtragem no Bizuário.`;

      const candidateModels = [
        "gemini-2.5-flash",
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
      ];
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              systemInstruction:
                "Você é um tutor especialista de elite focado na aprovação no concurso CFO CBMERJ. Forneça anotações táticas completas com auto-detecção da matéria, foco em fórmulas militares mais importantes em LaTeX e estrutura rígida em tópicos.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  detectedSubject: { type: Type.STRING },
                  refinedTitle: { type: Type.STRING },
                  statement: { type: Type.STRING },
                  category: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  keyPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["notes", "keyPoints", "tags"],
              },
            },
          });

          if (response.text) {
            const parsed = parseAiJsonResponse(response.text);
            // Guarantee strictly separated topics with blank lines
            if (parsed.notes) {
              parsed.notes = formatNotesIntoSeparatedTopics(parsed.notes);
            }
            return res.json({
              success: true,
              source: "gemini",
              model: modelName,
              data: parsed,
            });
          }
        } catch (modelErr: any) {
          const status =
            modelErr?.status ||
            modelErr?.code ||
            (modelErr?.message?.includes("503")
              ? 503
              : modelErr?.message?.includes("429")
              ? 429
              : "indisponível");
          const isTransient =
            status === 503 || status === 429 || modelErr?.status === "UNAVAILABLE";
          console.info(
            `[AI Router] Modelo ${modelName} para bizu-notes ${
              isTransient ? "sob alta demanda temporária (503/429)" : "indisponível"
            }. Alternando para modelo seguinte...`
          );
          if (isTransient) {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
        }
      }
    }

    // Rich Heuristic Fallback in case of lack of credentials/offline
    const subjectUpper = (subject || "DISCIPLINA").toUpperCase();
    const titleUpper = (title || subject || "CONTEÚDO").toUpperCase();
    const isPhysics = subjectUpper.includes("FÍSICA") || subjectUpper.includes("FISICA");
    const isMath = subjectUpper.includes("MATEMÁTICA") || subjectUpper.includes("MATEMATICA");
    const isGeo = subjectUpper.includes("GEOGRAFIA") || titleUpper.includes("CARTOGRAFIA") || titleUpper.includes("ESCALA");
    const isChem = subjectUpper.includes("QUÍMICA") || subjectUpper.includes("QUIMICA");

    let specificFormulas = "";
    let specificMnemonic = "";
    let specificTrap = "";

    if (isGeo) {
      specificFormulas = `• Escala Cartográfica: $E = \\frac{d}{D}$ onde $d$ é a distância no mapa (geralmente em cm) e $D$ é a distância real no terreno.\n• Lembrete de conversão de unidades: $1\\text{ km} = 100.000\\text{ cm}$ (corta 5 zeros) e $1\\text{ m} = 100\\text{ cm}$ (corta 2 zeros).`;
      specificMnemonic = `• "Escala Grande = Pouco denominador, Muito detalhe, Área pequena (planta de prédio)".\n• "Escala Pequena = Muito denominador, Pouco detalhe, Área grande (mapa mundi)".`;
      specificTrap = `• A banca tenta induzir que $1:50.000$ é menor que $1:500.000$. Falso! Como é uma fração, $1/50.000$ é DEZ VEZES MAIOR que $1/500.000$.\n• Curvas de nível muito próximas indicam terreno com declive acentuado (íngreme); curvas espaçadas indicam relevo suave/plano.`;
    } else if (isPhysics) {
      specificFormulas = `• Equação Fundamental: $v = \\frac{\\Delta s}{\\Delta t}$, $\\quad$ $v = v_0 + a \\cdot t$, $\\quad$ $S = S_0 + v_0 t + \\frac{a t^2}{2}$, $\\quad$ $v^2 = v_0^2 + 2a\\Delta s$\n• Calorimetria e Termodinâmica: $Q = m \\cdot c \\cdot \\Delta T$, $\\quad$ $Q = m \\cdot L$, $\\quad$ $\\Delta U = Q - W$`;
      specificMnemonic = `• "Vi Você Mais Duas Asas Delta": Equação de Torricelli ($v^2 = v_0^2 + 2a\\Delta s$).\n• "Que Macete": $Q = m \\cdot c \\cdot \\Delta T$ (calor sensível com variação de temperatura).\n• "Que Moleza": $Q = m \\cdot L$ (calor latente em mudança de estado físico).`;
      specificTrap = `• Mistura de unidades: calor específico dado em $\\text{cal}/(\\text{g}\\cdot^\\circ\\text{C})$ e massa fornecida no enunciado em $\\text{kg}$. Sempre compatibilize antes de calcular!\n• Confundir trabalho do gás na expansão ($W > 0$) e na compressão ($W < 0$).`;
    } else if (isMath) {
      specificFormulas = `• Relações Métricas e Áreas: $A = \\frac{b \\cdot h}{2}$, $\\quad$ $A = \\pi r^2$, $\\quad$ $A = \\frac{l^2\\sqrt{3}}{4}$ (triângulo equilátero)\n• Análise Combinatória: $C_{n, p} = \\frac{n!}{p!(n-p)!}$, $\\quad$ $A_{n, p} = \\frac{n!}{(n-p)!}$`;
      specificMnemonic = `• "Se a ordem importa, Arranjo (A-h!). Se a ordem não importa, Combinação (C-omissão)".\n• Bhaskara e Vértice da Parábola: $x_v = -\\frac{b}{2a}$, $\\quad$ $y_v = -\\frac{\\Delta}{4a}$.`;
      specificTrap = `• Esquecer de dividir pela permutação em comissões onde a ordem não diferencia os membros selecionados.\n• Em geometria, confundir raio com diâmetro fornecido no enunciado.`;
    } else if (isChem) {
      specificFormulas = `• Estequiometria e Soluções: $n = \\frac{m}{M}$, $\\quad$ $C = \\frac{m}{V}$, $\\quad$ $M = \\frac{n}{V}$\n• Equação dos Gases Ideais: $P \\cdot V = n \\cdot R \\cdot T$ ("Por Você Nunca Rezei Tanto")`;
      specificMnemonic = `• "PANELA" para Forças Intermoleculares: Pontes de Hidrogênio > Dipolo-Dipolo > Forças de London (Van der Waals).\n• "Por Você Nunca Rezei Tanto": $P \\cdot V = n \\cdot R \\cdot T$.`;
      specificTrap = `• Em termoquímica, esquecer de inverter o sinal do $\\Delta H$ quando uma reação intermediária da Lei de Hess é invertida.\n• Esquecer o rendimento percentual ou pureza dos reagentes antes de aplicar a proporção molar.`;
    } else {
      specificFormulas = `• Esquematização lógica dos tópicos centrais com relações de causa, efeito e hierarquia conceitual.`;
      specificMnemonic = `• Crie acrônimos com as iniciais dos elementos para retenção rápida na memória ativa.\n• Associe termos técnicos a exemplos do cotidiano operacional dos Bombeiros.`;
      specificTrap = `• Enunciados com duplo negativo ("não é incorreto afirmar") e alternativas com generalizações indevidas ("sempre", "unicamente").`;
    }

    const fallbackNotes = formatNotesIntoSeparatedTopics(`Tópico 1 - Conceito Essencial & Fundamentos
• Conteúdo com alto índice de recorrência nas provas recentes do CFO CBMERJ.
• Compreenda o princípio estruturante antes de memorizar detalhes ou exceções pontuais.

Tópico 2 - Fórmulas & Relações Chave (LaTeX)
${specificFormulas}

Tópico 3 - Bizus Táticos & Mnemônicos
${specificMnemonic}

Tópico 4 - Pegadinhas Clássicas das Bancas (UERJ / FGV / IDECAN)
${specificTrap}

Tópico 5 - Método de Prova & Resolução Rápida
• Identifique os dados principais e as restrições nas primeiras 2 linhas do enunciado.
• Descarte imediatamente os 2 distratores óbvios antes de iniciar os cálculos ou análise final.`);

    return res.json({
      success: true,
      source: "heuristic",
      data: {
        refinedTitle: `${title || subject} (${subject || "CFO CBMERJ"})`,
        category: category || (isGeo ? "Geopolítica & Cartografia" : isPhysics ? "Física & Termologia" : isMath ? "Matemática & Geometria" : "Edital CFO CBMERJ"),
        notes: fallbackNotes,
        keyPoints: [
          `Dominar a definição essencial de ${title || subject}`,
          isGeo ? "Lembrar que $E = d/D$ e converter km para cm cortando 5 zeros" : isPhysics ? "Verificar unidades do SI e aplicar equações com rigor de sinais" : "Atenção às pegadinhas clássicas de enunciados no CFO CBMERJ",
          "Atenção aos distratores com generalizações absolutas da banca",
          "Resolver bateria de questões com foco no estilo da banca oficial",
        ],
        tags: [subject || "Geral", title || "Bizu", "CFO-CBMERJ", "Revisão-Tática"],
      },
    });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/bizu-notes:", error);
    console.error('[AI Bizu]', error);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar o Bizu." });
  }
});

// Helper para parsear os 20 flashcards gerados pela IA
function parseFlashcardsText(text: string): Array<{ question: string; answer: string }> {
  const cards: Array<{ question: string; answer: string }> = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let currentP = "";

  for (const line of lines) {
    if (/^(?:P|Pergunta)\s*[:\-–]\s*/i.test(line)) {
      currentP = line.replace(/^(?:P|Pergunta)\s*[:\-–]\s*/i, "").trim();
    } else if (/^(?:R|Resposta)\s*[:\-–]\s*/i.test(line) && currentP) {
      const currentR = line.replace(/^(?:R|Resposta)\s*[:\-–]\s*/i, "").trim();
      cards.push({ question: currentP, answer: currentR });
      currentP = "";
    }
  }

  if (cards.length === 0) {
    const regex = /(?:P|Pergunta)\s*[:\-–]\s*(.*?)\s*(?:R|Resposta)\s*[:\-–]\s*(.*?)(?=(?:(?:P|Pergunta)\s*[:\-–])|$)/gis;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const q = match[1].trim();
      const a = match[2].trim();
      if (q && a) {
        cards.push({ question: q, answer: a });
      }
    }
  }

  return cards;
}

// Fallback heurístico de alta retenção para tópicos comuns
function generateHeuristicFlashcards(topic: string): Array<{ question: string; answer: string }> {
  const t = topic.toUpperCase();
  if (t.includes("ESTEQUIOMETRIA") || t.includes("QUÍM") || t.includes("QUIM")) {
    return [
      { question: "O que diz a Lei de Lavoisier?", answer: "Na natureza nada se cria, tudo se transforma (massa conservada)." },
      { question: "O que diz a Lei de Proust?", answer: "Proporção fixa e constante em massa entre reagentes e produtos." },
      { question: "Qual o valor do volume molar nas CNTP?", answer: "22,4 litros por mol de qualquer gás ideal." },
      { question: "Qual o número de Avogadro?", answer: "6,02 x 10^23 entidades por mol." },
      { question: "Fórmula de número de mols (n)?", answer: "n = m / M (massa dada sobre massa molar)." },
      { question: "O que é reagente limitante?", answer: "O que acaba primeiro e limita a quantidade máxima de produto." },
      { question: "O que é reagente em excesso?", answer: "O que sobra sem reagir ao término da transformação química." },
      { question: "O que é grau de pureza?", answer: "Porcentagem da substância ativa real presente na amostra impura." },
      { question: "Quando aplicar a pureza no cálculo estequiométrico?", answer: "Sempre na primeira etapa sobre os reagentes fornecidos." },
      { question: "O que é rendimento de uma reação?", answer: "Razão entre a quantidade real obtida e a quantidade teórica esperada." },
      { question: "Quando aplicar o rendimento no cálculo estequiométrico?", answer: "Sempre na última etapa sobre a quantidade teórica do produto." },
      { question: "Fórmula da densidade?", answer: "d = m / V (massa sobre volume)." },
      { question: "Fórmula da concentração comum (C)?", answer: "C = m_soluto / V_solucao (em g/L)." },
      { question: "Fórmula da molaridade (M)?", answer: "M = n / V ou M = m / (Molar * V) (em mol/L)." },
      { question: "Fórmula de diluição de soluções?", answer: "C1 * V1 = C2 * V2." },
      { question: "O que ocorre com a concentração ao dobrar o solvente?", answer: "A concentração cai pela metade." },
      { question: "Qual a massa molar aproximada do H2O?", answer: "18 g/mol." },
      { question: "Qual a massa molar aproximada do CO2?", answer: "44 g/mol." },
      { question: "Qual a massa molar aproximada do CaCO3?", answer: "100 g/mol." },
      { question: "Qual a pegadinha clássica das questões de estequiometria?", answer: "Esquecer de balancear a equação antes de calcular as proporções." },
    ];
  }

  if (t.includes("CINEMÁTICA") || t.includes("FÍSICA") || t.includes("FISICA") || t.includes("TORRICELLI")) {
    return [
      { question: "Qual a equação da velocidade no MU?", answer: "v = delta s / delta t." },
      { question: "Qual a função horária do espaço no MU?", answer: "S = S0 + v * t." },
      { question: "Qual a função horária da velocidade no MUV?", answer: "v = v0 + a * t." },
      { question: "Qual a função horária da posição no MUV?", answer: "S = S0 + v0*t + (a*t^2)/2." },
      { question: "Qual a Equação de Torricelli?", answer: "v^2 = v0^2 + 2 * a * delta s." },
      { question: "Quando usar Torricelli?", answer: "Sempre que o tempo (t) não for dado nem pedido." },
      { question: "Qual a aceleração no ponto mais alto de um lançamento vertical?", answer: "Gravidade (g = 10 m/s^2 para baixo)." },
      { question: "Qual a velocidade no ponto mais alto de um lançamento vertical?", answer: "v = 0 m/s no eixo vertical." },
      { question: "Como converter km/h para m/s?", answer: "Dividir por 3,6." },
      { question: "Como converter m/s para km/h?", answer: "Multiplicar por 3,6." },
      { question: "O que representa a área no gráfico v x t?", answer: "O deslocamento escalar (delta s)." },
      { question: "O que representa a inclinação no gráfico s x t?", answer: "A velocidade instantânea." },
      { question: "O que representa a inclinação no gráfico v x t?", answer: "A aceleração escalar." },
      { question: "Em lançamento oblíquo, qual o movimento no eixo X?", answer: "Movimento Uniforme (MU, velocidade constante)." },
      { question: "Em lançamento oblíquo, qual o movimento no eixo Y?", answer: "Movimento Uniformemente Variado (MUV com aceleração g)." },
      { question: "Qual ângulo gera o alcance horizontal máximo (terreno plano)?", answer: "45 graus." },
      { question: "Qual a fórmula do tempo de queda livre a partir do repouso?", answer: "t = raiz(2h / g)." },
      { question: "Qual a fórmula da velocidade ao tocar o solo em queda livre?", answer: "v = raiz(2 * g * h)." },
      { question: "O que significa movimento acelerado?", answer: "Velocidade e aceleração possuem o mesmo sinal." },
      { question: "O que significa movimento retardado?", answer: "Velocidade e aceleração possuem sinais opostos." },
    ];
  }

  // Generic 20 high-yield flashcards
  return Array.from({ length: 20 }, (_, i) => ({
    question: `Ponto Chave ${i + 1} sobre ${topic}: Qual a regra ou definição fundamental?`,
    answer: `Conceito prioritário e de alta incidência de ${topic} em provas de oficiais.`,
  }));
}

// ==========================================
// ROTA DE FLASHCARDS COM IA (ESTILO ANKI)
// ==========================================
app.post("/api/ai/flashcards", requireUserAuth, aiLimiter, async (req: Request, res: Response) => {
  try {
    const { subjectOrTopic } = req.body || {};
    if (!subjectOrTopic || typeof subjectOrTopic !== "string" || !subjectOrTopic.trim()) {
      return res.status(400).json({
        error: "MISSING_TOPIC",
        message: "Por favor, informe a matéria ou tópico para gerar os flashcards.",
      });
    }

    if (!validateAiTextFields(res, [
      { name: 'subjectOrTopic', value: subjectOrTopic, maxBytes: 500 },
    ])) return;

    const topic = subjectOrTopic.trim();
    const promptText = `Atue como um especialista em criação de materiais de estudo focado em revisão rápida (bate e pronto). 

Eu vou te passar o nome de uma matéria ou tópico. Você deve gerar uma lista de flashcards para revisão.

REGRAS OBRIGATÓRIAS (NÃO QUEBRE ESSAS REGRAS):
FORMATO: Cada flashcard deve ser escrito exatamente no formato:
P: [Pergunta direta, clara e objetiva]
R: [Resposta extremamente curta, com no máximo 1 linha. Use palavras-chave, siglas ou frases curtas. NADA de texto corrido ou explicações longas].
CONTEÚDO: Foque APENAS nos conceitos mais importantes, facts históricos, fórmulas, leis, ou definições que mais caem em provas. Nada de curiosidades irrelevantes.
QUANTIDADE: Gere exatamente 20 flashcards.
TOM: Seja seco, direto e prático. É apenas para relembrar. A resposta precisa ser tão curta que caiba em um post-it.
NÃO escreva introduções, resumos ou agradecimentos. Comece diretamente com o primeiro "P:" e termine no último "R:".

A MATÉRIA QUE EU QUERO É: ${topic}`;

    const geminiKey = (process.env.ENABLE_EXTERNAL_AI === 'true' || process.env.NODE_ENV !== 'production')
      ? process.env.GEMINI_API_KEY
      : undefined;
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const candidateModels = [
        "gemini-2.5-flash",
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
      ];

      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: promptText,
            config: {
              systemInstruction:
                "Você é um especialista em criação de flashcards táticos para alta retenção estilo Anki. Siga estritamente o formato 'P:' e 'R:' com respostas ultra-curtas de no máximo 1 linha.",
            },
          });

          if (response.text) {
            const parsedCards = parseFlashcardsText(response.text);
            if (parsedCards.length >= 10) {
              return res.json({
                success: true,
                source: "gemini",
                model: modelName,
                topic,
                cards: parsedCards,
              });
            }
          }
        } catch (modelErr: any) {
          console.warn(`[AI Flashcards Router] Modelo ${modelName} falhou:`, modelErr?.message);
        }
      }
    }

    // Contingência heurística caso os modelos estejam temporariamente ocupados
    const heuristicCards = generateHeuristicFlashcards(topic);
    return res.json({
      success: true,
      source: "heuristic",
      topic,
      cards: heuristicCards,
    });
  } catch (error: any) {
    console.error("Erro na rota /api/ai/flashcards:", error);
    return res.status(500).json({
      error: "FLASHCARDS_GENERATION_FAILED",
      message: "Falha ao gerar flashcards.",
    });
  }
});

// ==========================================
// ROTAS DE INTEGRAÇÃO NOTION - REVISÕES CFO
// ==========================================

// 🛑 MIDDLEWARE DE SEGURANÇA NOTION: Acesso exclusivo do Administrador
app.use("/api/notion", (req: Request, res: Response, next: NextFunction) => {
  const token = requestSessionToken(req) || (req.headers["x-terminal-session"] as string);

  // Valida a sessão e permissão da conta
  const session = verifyTerminalSession(token);
  if (!session.valid || !session.canAccessNotion) {
    return res.status(403).json({
      error: "NOTION_FORBIDDEN",
      message: "403 Acesso Negado: A integração e agenda do Notion são restritas exclusivamente ao Administrador.",
    });
  }

  next();
});

// 1. Status da Conexão com o Notion
app.get("/api/notion/status", (_req: Request, res: Response) => {
  const cfg = getNotionConfig();
  return res.json({
    isConfigured: cfg.isConfigured,
    hasApiKey: Boolean(cfg.apiKey),
    hasDatabaseId: Boolean(cfg.databaseId),
  });
});

// 2. Buscar Lista de Revisões (Notion API com Fallback e Cache Local)
app.get("/api/notion/revisoes", async (_req: Request, res: Response) => {
  try {
    const result = await fetchRevisoesFromNotion();
    return res.json({
      success: true,
      items: result.items,
      source: result.source,
      error: result.error,
    });
  } catch (e: any) {
    console.error("Erro ao buscar revisões do Notion:", e);
    return res.status(500).json({
      error: "NOTION_FETCH_ERROR",
      message: "Falha ao obter dados do Notion",
    });
  }
});

// 3. Fazer Check-in (Atualiza caixas Semana, Mês 1, Mês 2, Mês 3)
app.patch("/api/notion/checkin", async (req: Request, res: Response) => {
  try {
    const { pageId, cycleKey, checked } = req.body || {};
    if (!pageId || !cycleKey) {
      return res.status(400).json({
        error: "MISSING_PARAMS",
        message: "pageId e cycleKey (semana, mes1, mes2, mes3) são obrigatórios.",
      });
    }

    const validKeys = ["semana", "mes1", "mes2", "mes3"];
    if (!validKeys.includes(cycleKey)) {
      return res.status(400).json({
        error: "INVALID_CYCLE_KEY",
        message: "cycleKey deve ser: semana, mes1, mes2 ou mes3.",
      });
    }

    const checkedVal = checked !== undefined ? Boolean(checked) : true;
    const result = await updateCheckinInNotion(pageId, cycleKey, checkedVal);

    if (!result.success) {
      return res.status(404).json({
        error: result.error || "NOTION_PAGE_NOT_FOUND",
        message: "A revisão informada não pertence ao conjunto autorizado.",
      });
    }

    return res.json({
      success: result.success,
      item: result.item,
      error: result.error,
    });
  } catch (e: any) {
    console.error("Erro ao processar check-in do Notion:", e);
    return res.status(500).json({
      error: "CHECKIN_ERROR",
      message: "Falha ao registrar check-in",
    });
  }
});

// 4. Cadastrar Novo Estudo (Cria linha no Notion e atualiza calendário)
app.post("/api/notion/novo-estudo", async (req: Request, res: Response) => {
  try {
    const { assunto, materia, data, tipoRevisao } = req.body || {};
    if (!assunto || !materia || !data) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "assunto, materia e data são campos obrigatórios.",
      });
    }

    const result = await createStudyInNotion({
      assunto: String(assunto).trim(),
      materia: String(materia).trim(),
      data: String(data).trim(),
      tipoRevisao: Array.isArray(tipoRevisao) ? tipoRevisao : ["Questões"],
    });

    return res.json({
      success: result.success,
      item: result.item,
      syncedToNotion: result.syncedToNotion,
    });
  } catch (e: any) {
    console.error("Erro ao cadastrar novo estudo no Notion:", e);
    return res.status(500).json({
      error: "CREATE_STUDY_ERROR",
      message: "Falha ao registrar estudo no Notion",
    });
  }
});

// ============================================================================
// 💾 SISTEMA PROFISSIONAL DE BACKUP E SINCRONIZAÇÃO RESILIENTE
// ============================================================================

// 1. Sincronização de Progresso do Usuário (Backup em Nuvem Privada do Aluno/Cadete)
app.get("/api/user/state", requireUserAuth, (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId || '');
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const saved = userStateRepoInstance.get(userId);
    return res.json({ success: true, state: saved?.payload || {}, updatedAt: saved?.updatedAt || null });
  } catch (err) {
    console.error('[User State] Falha ao carregar estado:', err);
    return res.status(500).json({ error: 'STATE_READ_ERROR' });
  }
});

app.put("/api/user/state", requireUserAuth, (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId || '');
    const state = req.body?.state;
    if (!userId || !state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error: 'INVALID_STATE' });
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(state)) {
      if (!/^(cfo_[a-zA-Z0-9_.-]+|.*anki_[a-zA-Z0-9_.-]+)$/.test(key)) continue;
      if (typeof value !== 'string' || value.length > 2_000_000) return res.status(413).json({ error: 'STATE_VALUE_TOO_LARGE' });
      sanitized[key] = value;
    }
    const savedAt = userStateRepoInstance.upsert(userId, sanitized);
    logAuditEvent({ action: 'USER_STATE_SYNC', actor: (req as any).user.username || userId, resource: 'user_state_snapshots', status: 'SUCCESS', ip: getClientIp(req), details: { userId, keys: Object.keys(sanitized).length } });
    return res.json({ success: true, savedAt });
  } catch (err) {
    console.error('[User State] Falha ao salvar estado:', err);
    return res.status(500).json({ error: 'STATE_WRITE_ERROR' });
  }
});

// ============================================================================
// 🎯 SINCRONIZAÇÃO DE BATERIA DE NIVELAMENTO (EXTENSÃO & PLATAFORMA)
// ============================================================================
app.get("/api/leveling/session", requireUserAuth, (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId || '');
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const saved = userStateRepoInstance.get(userId);
    const levelingRaw = saved?.payload?.['cfo_leveling_session'];
    let session = null;
    if (levelingRaw) {
      try {
        session = JSON.parse(levelingRaw);
      } catch {
        session = null;
      }
    }
    return res.json({ success: true, session });
  } catch (err) {
    console.error('[Leveling Sync] Falha ao ler sessão de nivelamento:', err);
    return res.status(500).json({ error: 'LEVELING_READ_ERROR' });
  }
});

app.post("/api/leveling/session", requireUserAuth, (req: Request, res: Response) => {
  try {
    const userId = String((req as any).user.userId || '');
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const { mode, total, answers, manualCorrect, manualWrong, started } = req.body || {};
    const validAnswers = Array.isArray(answers)
      ? answers.filter((a: any) => a === 'correct' || a === 'wrong').slice(0, 300)
      : [];
    const validTotal = Math.min(Math.max(1, Math.trunc(Number(total) || 30)), 300);

    const snapshot = {
      mode: mode === 'manual' ? 'manual' : 'live',
      total: validTotal,
      answers: validAnswers,
      manualCorrect: Math.max(0, Math.trunc(Number(manualCorrect) || 0)),
      manualWrong: Math.max(0, Math.trunc(Number(manualWrong) || 0)),
      started: Boolean(started),
      updatedAt: new Date().toISOString(),
    };

    const currentSaved = userStateRepoInstance.get(userId);
    const updatedPayload = {
      ...(currentSaved?.payload || {}),
      cfo_leveling_session: JSON.stringify(snapshot),
    };

    userStateRepoInstance.upsert(userId, updatedPayload);
    return res.json({ success: true, session: snapshot });
  } catch (err) {
    console.error('[Leveling Sync] Falha ao salvar sessão de nivelamento:', err);
    return res.status(500).json({ error: 'LEVELING_WRITE_ERROR' });
  }
});

// Endpoint para emissão segura de token de vinculação para a extensão do navegador
app.get("/api/user/extension-token", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = String(user?.userId || '');
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Usuário não autenticado." });
    }

    const created = sessionRepoInstance.createSession({
      userId,
      role: user.role || 'cadet',
      expiresInDays: 90,
      userAgent: 'cfo-browser-extension',
    });

    return res.json({
      success: true,
      token: created.rawToken,
      expiresAt: Date.parse(created.session.expiresAt),
    });
  } catch (err) {
    console.error("[Extension Token Error]:", err);
    return res.status(500).json({ error: "FAILED_TO_GENERATE_TOKEN" });
  }
});

// Endpoint seguro para download direto do pacote ZIP da extensão para desktop
app.get("/api/download/extension", (_req: Request, res: Response) => {
  const zipPath = path.resolve(process.cwd(), "public", "cfo-extensao-cbmerj.zip");
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      error: "FILE_NOT_FOUND",
      message: "Pacote da extensão não encontrado para download.",
    });
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="cfo-cbmerj-extensao.zip"');
  return res.sendFile(zipPath);
});

app.post("/api/user/sync-backup", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { snapshot } = req.body || {};

    if (!snapshot || typeof snapshot !== "object") {
      return res.status(400).json({
        error: "INVALID_SNAPSHOT",
        message: "Dados de backup de estudo inválidos.",
      });
    }

    // Proteção anti-DoS: limitar tamanho do snapshot a 2MB serializado
    const snapshotJson = JSON.stringify(snapshot);
    const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2 MB
    if (Buffer.byteLength(snapshotJson, 'utf-8') > MAX_SNAPSHOT_BYTES) {
      return res.status(413).json({
        error: "SNAPSHOT_TOO_LARGE",
        message: "O tamanho do backup de progresso excede o limite de 2MB. Reduza os dados antes de sincronizar.",
      });
    }

    // Compatibility endpoint: persist the legacy snapshot in SQLite as well,
    // keyed by the authenticated user id. Do not derive ownership from username.
    const userId = String(user.userId || '');
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const savedAt = userStateRepoInstance.upsert(userId, { cfo_legacy_snapshot: JSON.stringify(snapshot) });
    return res.json({ success: true, message: "Progresso sincronizado no banco de dados.", savedAt });
  } catch (err: any) {
    console.error("[User Backup] Falha ao salvar backup do usuário:", err);
    return res.status(500).json({
      error: "SYNC_ERROR",
      message: "Falha ao gravar backup de progresso no servidor.",
    });
  }
});

// 2. Restauração de Progresso do Usuário
app.get("/api/user/restore-backup", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const state = userStateRepoInstance.get(String(user.userId || ''));
    if (state?.payload?.cfo_legacy_snapshot) {
      return res.json({ success: true, backup: { snapshot: JSON.parse(state.payload.cfo_legacy_snapshot), savedAt: state.updatedAt } });
    }
    return res.status(404).json({ error: "NO_BACKUP_FOUND", message: "Nenhum estado persistente encontrado para este usuário." });
  } catch (err: any) {
    console.error("[User Backup] Falha ao ler backup do usuário:", err);
    return res.status(500).json({
      error: "RESTORE_ERROR",
      message: "Falha ao recuperar backup de progresso do servidor.",
    });
  }
});

// 3. Status Geral do Sistema de Backup do Servidor (Painel de Administração)
app.get("/api/admin/backup/status", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const status = getBackupStatus();
    return res.json({
      success: true,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "BACKUP_STATUS_ERROR",
      message: "Falha ao consultar status de backup.",
    });
  }
});

// 4. Listagem de Backups Disponíveis com Verificação de Integridade
app.get("/api/admin/backup/list", requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const backups = loadBackupIndex();
    return res.json({
      success: true,
      backups,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "BACKUP_LIST_ERROR",
      message: "Falha ao listar backups.",
    });
  }
});

// 5. Criação Manual Imediata de Backup Completo
app.post("/api/admin/backup/create", requireAdminWriteAuth, async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user?.username || "admin";
    const clientIp = getClientIp(req);

    logAuditEvent({
      action: "BACKUP_CREATE_MANUAL_REQUESTED",
      actor,
      resource: "server_data_backup",
      status: "PENDING",
      ip: clientIp,
    });

    const meta = await createFullBackup("manual");

    if (meta && meta.filename) {
      logAuditEvent({
        action: "BACKUP_CREATE_SUCCESS",
        actor,
        resource: meta.filename,
        status: "SUCCESS",
        ip: clientIp,
        details: {
          sizeBytes: meta.sizeBytes,
          sha256: meta.sha256,
        },
      });

      return res.json({
        success: true,
        message: "Backup completo gerado e verificado com sucesso.",
        meta,
      });
    } else {
      logAuditEvent({
        action: "BACKUP_CREATE_FAILED",
        actor,
        resource: "server_data_backup",
        status: "FAILED",
        ip: clientIp,
      });

      return res.status(500).json({
        success: false,
        error: "BACKUP_FAILED",
        message: "Falha ao gerar backup.",
      });
    }
  } catch (err: any) {
    return res.status(500).json({
      error: "BACKUP_ERROR",
      message: "Erro inesperado ao gerar backup.",
    });
  }
});

// 6. Restauração Crítica de Backup do Servidor (Requer confirmação explícita e Step-Up)
app.post("/api/admin/backup/restore", requireAdminWriteAuth, requireStepUpAuth, async (req: Request, res: Response) => {
  try {
    const { filename, confirm } = req.body || {};
    const actor = (req as any).user?.username || "admin";
    const clientIp = getClientIp(req);

    if (!filename) {
      return res.status(400).json({
        error: "MISSING_FILENAME",
        message: "O nome do arquivo de backup (.json.gz) é obrigatório.",
      });
    }

    if (confirm !== true && confirm !== "RESTORE_CONFIRMED") {
      return res.status(400).json({
        error: "CONFIRMATION_REQUIRED",
        message: "A restauração de backup sobrescreverá dados do servidor. Envie confirm: 'RESTORE_CONFIRMED' para prosseguir.",
      });
    }

    logAuditEvent({
      action: "BACKUP_RESTORE_REQUESTED",
      actor,
      resource: filename,
      status: "PENDING",
      ip: clientIp,
    });

    const result = await restoreBackup(String(filename));

    logAuditEvent({
      action: "BACKUP_RESTORE_SUCCESS",
      actor,
      resource: filename,
      status: "SUCCESS",
      ip: clientIp,
      details: { message: result.message },
    });

    return res.json({
      success: true,
      message: result.message || "Backup restaurado com sucesso no servidor. Dados restabelecidos.",
    });
  } catch (err: any) {
    logAuditEvent({
      action: "BACKUP_RESTORE_FAILED",
      actor: (req as any).user?.u || "admin",
      resource: req.body?.filename,
      status: "FAILED",
      ip: req.ip || "UNKNOWN",
      details: { error: 'INTERNAL_SERVER_ERROR' },
    });
    return res.status(500).json({
      error: "RESTORE_ERROR",
      message: "Erro inesperado durante restauração.",
    });
  }
});

// Proteção de Integridade: Auditoria é estritamente Append-Only (Imutável via API)
app.all(["/api/admin/audit-logs", "/api/admin/audit-logs/*"], (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    return res.status(405).json({
      error: "METHOD_NOT_ALLOWED",
      message: "AUDIT_LOG_IMMUTABLE: Trilha de auditoria é estritamente append-only e não permite modificação ou exclusão.",
    });
  }
  next();
});

// 7. Auditoria de Segurança: Consulta de Trilha de Auditoria (Audit Log com filtros completos)
app.get("/api/admin/audit-logs", requireAdminOnlyAuth, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "50"), 10)));
    const action = req.query.action ? String(req.query.action).trim() : undefined;
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const actor = req.query.actor ? String(req.query.actor).trim() : undefined;
    const actorUserId = req.query.actorUserId ? String(req.query.actorUserId).trim() : undefined;
    const resource = req.query.resource ? String(req.query.resource).trim() : undefined;
    const targetType = req.query.targetType ? String(req.query.targetType).trim() : undefined;
    const targetId = req.query.targetId ? String(req.query.targetId).trim() : undefined;
    const ip = req.query.ip ? String(req.query.ip).trim() : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate).trim() : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate).trim() : undefined;

    const result = auditRepoInstance.findFiltered({
      page,
      limit,
      action,
      status,
      actor,
      actorUserId,
      resource,
      targetType,
      targetId,
      ip,
      search,
      startDate,
      endDate,
    });

    const safeItems = sanitizeSecurityPayload(result.items);
    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      items: safeItems,
      logs: safeItems,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "AUDIT_LOG_ERROR",
      message: "Falha ao ler registros de auditoria.",
    });
  }
});

// ============================================================================
// 🔒 CAMADA OBRIGATÓRIA DE SEGURANÇA PARA UPLOADS (DEFENSE-IN-DEPTH)
// ============================================================================

// 1. Rate Limiter Dedicado para Uploads (Anti-DoS / Anti-Flooding)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 uploads por 15 min por IP/usuário
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = String((req as any).user?.userId || '').trim();
    return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip || getClientIp(req))}`;
  },
  message: {
    error: "UPLOAD_RATE_LIMITED",
    message: "Limite de uploads atingido para esta janela de tempo. Tente novamente mais tarde.",
  },
});

// 2. Endpoint de Upload Seguro: POST /api/uploads/file
app.post("/api/uploads/file", requireUserAuth, uploadLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.userId) {
      return res.status(401).json({ error: "UNAUTHORIZED", message: "Autenticação obrigatória." });
    }

    const { fileName, originalName, declaredMime, contentBase64 } = req.body || {};
    const effectiveOriginalName = originalName || fileName;

    if (typeof contentBase64 !== 'string') {
      return res.status(400).json({ error: "INVALID_PAYLOAD", message: "Buffer base64 do arquivo não fornecido." });
    }

    if (!effectiveOriginalName || typeof effectiveOriginalName !== 'string') {
      return res.status(400).json({ error: "INVALID_FILENAME", message: "Nome do arquivo não informado." });
    }

    // Decodifica buffer base64 com proteção contra estouro de memória
    let buffer: Buffer;
    try {
      // Remove prefixos data:image/...;base64, se enviados
      const cleanBase64 = contentBase64.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(cleanBase64, 'base64');
    } catch {
      return res.status(400).json({ error: "INVALID_ENCODING", message: "Falha ao decodificar conteúdo base64." });
    }

    const result = await secureUploadService.processUpload({
      buffer,
      originalName: effectiveOriginalName,
      declaredMime: declaredMime || 'application/octet-stream',
      userId: user.userId,
      ip: getClientIp(req),
      userAgent: (req.headers['user-agent'] as string) || undefined,
    });

    if (!result.success || !result.file) {
      return res.status(400).json({
        error: "UPLOAD_REJECTED",
        message: result.error || "Arquivo rejeitado pela política de segurança.",
        status: result.status,
      });
    }

    logSecurityEvent(req, {
      action: 'FILE_UPLOADED_SECURE',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'uploaded_files',
      status: 'SUCCESS',
      targetType: 'file',
      targetId: result.file.id,
      details: {
        fileId: result.file.id,
        mime: result.file.mimeType,
        size: result.file.sizeBytes,
        sha256: result.file.sha256,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Arquivo validado e armazenado com sucesso no cofre seguro.",
      file: {
        id: result.file.id,
        originalName: result.file.originalFilename,
        mimeType: result.file.mimeType,
        sizeBytes: result.file.sizeBytes,
        status: result.file.status,
        createdAt: result.file.createdAt,
      },
    });
  } catch (err: any) {
    logInternalError("Upload Processing Error", err);
    return res.status(500).json({
      error: "UPLOAD_PROCESSING_FAILED",
      message: "Falha interna ao processar o arquivo enviado.",
    });
  }
});

// 3. Endpoint de Download/Acesso Seguro com Autorização Server-Side: GET /api/files/:id
app.get("/api/files/:id", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const fileId = req.params.id;

    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({ error: "INVALID_FILE_ID", message: "Identificador de arquivo inválido." });
    }

    const isAdmin = user.role === 'admin';
    const access = secureUploadService.getAuthorizedFile(fileId, user.userId, isAdmin);

    if (!access.authorized || !access.file || !access.buffer) {
      logSecurityEvent(req, {
        action: 'FILE_ACCESS_DENIED',
        actor: user.username || user.userId,
        actorUserId: user.userId,
        resource: 'uploaded_files',
        status: 'FAILED',
        targetType: 'file',
        targetId: fileId,
        details: { reason: access.error },
      });
      return res.status(403).json({
        error: "ACCESS_DENIED",
        message: access.error || "Acesso não autorizado ao arquivo solicitado.",
      });
    }

    // Cabeçalhos de Segurança Estritos para Entrega de Arquivos
    res.setHeader('Content-Type', access.file.mimeType);
    res.setHeader('Content-Length', access.buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    // Sanitiza nome para Content-Disposition (evita header injection / CRLF)
    const sanitizedFilename = access.file.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);

    return res.send(access.buffer);
  } catch (err: any) {
    logInternalError("File Download Error", err);
    return res.status(500).json({
      error: "DOWNLOAD_FAILED",
      message: "Falha ao recuperar o arquivo seguro.",
    });
  }
});

// 4. Listagem de Arquivos do Próprio Usuário: GET /api/files
app.get("/api/files", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const files = uploadedFileRepoInstance.findByUserId(user.userId);

    const safeList = files.map(f => ({
      id: f.id,
      originalName: f.originalFilename,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      status: f.status,
      createdAt: f.createdAt,
    }));

    return res.json({
      success: true,
      files: safeList,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "LIST_FILES_FAILED",
      message: "Falha ao consultar repositório de arquivos.",
    });
  }
});

// ============================================================================
// 📚 ROTAS DO BANCO DE PROVAS (EXAM BANK) & INTELIGÊNCIA ARTIFICIAL
// ============================================================================

function ensureBoardIntelligenceEnabled(res: Response): boolean {
  if (boardIntelligenceServiceInstance.isEnabled()) return true;
  res.status(404).json({
    error: 'FEATURE_DISABLED',
    message: 'Inteligencia da Banca esta desativada pela feature flag ADMIN_BOARD_INTELLIGENCE.',
  });
  return false;
}

app.get("/api/admin/board-intelligence/profiles", requireAdminAuth, (_req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  return res.json({ success: true, profiles: boardIntelligenceServiceInstance.listProfiles() });
});

app.post("/api/admin/board-intelligence/profiles", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const { name, institution, board, contest, roleName, periodStart, periodEnd, description } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'INVALID_PROFILE_NAME', message: 'Nome do perfil e obrigatorio.' });
    }
    const profile = boardIntelligenceServiceInstance.createProfile({
      name,
      institution,
      board,
      contest,
      roleName,
      periodStart: periodStart ? Number(periodStart) : null,
      periodEnd: periodEnd ? Number(periodEnd) : null,
      description,
      actorUserId: user.userId,
    });
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_PROFILE_CREATED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_intelligence_profiles',
      status: 'SUCCESS',
      targetType: 'board_intelligence_profile',
      targetId: profile.id,
      details: { name: profile.name, board: profile.board },
    });
    return res.status(201).json({ success: true, profile });
  } catch (err: any) {
    logInternalError("Create Board Profile Error", err);
    return res.status(500).json({ error: 'CREATE_BOARD_PROFILE_FAILED', message: 'Falha ao criar perfil da banca.' });
  }
});

app.get("/api/admin/board-intelligence/profiles/:id", requireAdminAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  const overview = boardIntelligenceServiceInstance.getOverview(req.params.id);
  if (!overview) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
  return res.json({ success: true, ...overview });
});

app.post("/api/admin/board-intelligence/profiles/:id/import-exam", requireAdminWriteAuth, uploadLimiter, async (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const profile = boardIntelligenceServiceInstance.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: 'PROFILE_NOT_FOUND' });
    const { title, institution, examYear, fileName, declaredMime, contentBase64, rawTextContent, board, roleName, phase, discipline, examType, officialAnswerKey, notes } = req.body || {};
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'INVALID_TITLE', message: 'O titulo da prova e obrigatorio.' });
    }
    const cleanTitle = title.trim();
    const parsedYear = Number(examYear) || new Date().getFullYear();
    let fileId: string | undefined;

    if (contentBase64 && typeof contentBase64 === 'string') {
      let buffer: Buffer;
      try {
        buffer = Buffer.from(contentBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
      } catch {
        return res.status(400).json({ error: 'INVALID_ENCODING', message: 'Buffer base64 corrompido.' });
      }
      const uploadRes = await secureUploadService.processUpload({
        buffer,
        originalName: fileName || `${cleanTitle}.pdf`,
        declaredMime: declaredMime || 'application/pdf',
        userId: user.userId,
        ip: getClientIp(req),
        userAgent: (req.headers['user-agent'] as string) || undefined,
      });
      if (!uploadRes.success || !uploadRes.file) {
        return res.status(400).json({ error: 'UPLOAD_REJECTED', message: uploadRes.error || 'Arquivo rejeitado pelo pipeline seguro.' });
      }
      fileId = uploadRes.file.id;
    }

    const extraction = await examServiceInstance.extractAndRegisterExam({
      userId: user.userId,
      fileId,
      title: cleanTitle,
      institution: institution || profile.institution,
      examYear: parsedYear,
      rawTextContent: typeof rawTextContent === 'string' ? rawTextContent : undefined,
    });
    const boardExam = boardIntelligenceServiceInstance.registerImportedExam({
      profileId: profile.id,
      examPaperId: extraction.paper.id,
      name: cleanTitle,
      examYear: parsedYear,
      board: board || profile.board,
      roleName,
      phase,
      discipline,
      examType,
      officialAnswerKey: officialAnswerKey && typeof officialAnswerKey === 'object' ? officialAnswerKey : null,
      notes,
      actorUserId: user.userId,
    });
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_EXAM_IMPORTED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_intelligence_exams',
      status: 'SUCCESS',
      targetType: 'board_intelligence_exam',
      targetId: boardExam.id,
      details: { profileId: profile.id, examPaperId: extraction.paper.id, questions: extraction.questions.length },
    });
    return res.status(201).json({
      success: true,
      exam: boardExam,
      paper: extraction.paper,
      questionsCount: extraction.questions.length,
      message: 'Prova importada e extraida. Revisao administrativa obrigatoria antes do aprendizado.',
    });
  } catch (err: any) {
    const status = String(err?.message || '').includes('UNIQUE constraint failed') ? 409 : 500;
    logInternalError("Import Board Exam Error", err);
    return res.status(status).json({ error: 'IMPORT_BOARD_EXAM_FAILED', message: 'Falha ao importar prova antiga.' });
  }
});

app.get("/api/admin/board-intelligence/exams/:examId/review", requireAdminAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  const review = boardIntelligenceServiceInstance.getReview(req.params.examId);
  if (!review) return res.status(404).json({ error: 'BOARD_EXAM_NOT_FOUND' });
  return res.json({ success: true, review });
});

app.post("/api/admin/board-intelligence/exams/:examId/approve", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const result = boardIntelligenceServiceInstance.approveExam(req.params.examId, user.userId);
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_EXAM_APPROVED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_intelligence_exams',
      status: 'SUCCESS',
      targetType: 'board_intelligence_exam',
      targetId: result.exam.id,
      details: { analysesCreated: result.analysesCreated },
    });
    return res.json({ success: true, ...result, message: 'Prova aprovada para aprendizado estruturado.' });
  } catch (err: any) {
    logInternalError("Approve Board Exam Error", err);
    return res.status(400).json({ error: 'APPROVE_BOARD_EXAM_FAILED', message: 'Falha ao aprovar prova.' });
  }
});

app.post("/api/admin/board-intelligence/exams/:examId/reject", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const exam = boardIntelligenceServiceInstance.rejectExam(req.params.examId, user.userId);
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_EXAM_REJECTED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_intelligence_exams',
      status: 'WARNING',
      targetType: 'board_intelligence_exam',
      targetId: exam.id,
    });
    return res.json({ success: true, exam });
  } catch (err: any) {
    logInternalError("Reject Board Exam Error", err);
    return res.status(400).json({ error: 'REJECT_BOARD_EXAM_FAILED', message: 'Falha ao rejeitar prova.' });
  }
});

app.post("/api/admin/board-intelligence/profiles/:id/generate-version", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const version = boardIntelligenceServiceInstance.generateDraftVersion(req.params.id, user.userId);
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_VERSION_DRAFTED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_profile_versions',
      status: 'SUCCESS',
      targetType: 'board_profile_version',
      targetId: version.id,
      details: { profileId: req.params.id, version: version.version, snapshotId: version.snapshotId },
    });
    return res.status(201).json({ success: true, version });
  } catch (err: any) {
    logInternalError("Generate Board Version Error", err);
    return res.status(400).json({ error: 'GENERATE_BOARD_VERSION_FAILED', message: 'Falha ao gerar versao draft.' });
  }
});

app.post("/api/admin/board-intelligence/versions/:versionId/publish", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const version = boardIntelligenceServiceInstance.publishVersion(req.params.versionId, user.userId);
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_VERSION_PUBLISHED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_profile_versions',
      status: 'SUCCESS',
      targetType: 'board_profile_version',
      targetId: version.id,
      details: { profileId: version.profileId, version: version.version },
    });
    return res.json({ success: true, version });
  } catch (err: any) {
    logInternalError("Publish Board Version Error", err);
    return res.status(400).json({ error: 'PUBLISH_BOARD_VERSION_FAILED', message: 'Falha ao publicar versao.' });
  }
});

app.post("/api/admin/board-intelligence/profiles/:id/rollback", requireAdminWriteAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  try {
    const user = (req as any).user;
    const targetVersion = Number(req.body?.version);
    if (!targetVersion) return res.status(400).json({ error: 'INVALID_VERSION' });
    const version = boardIntelligenceServiceInstance.rollbackToVersion(req.params.id, targetVersion, user.userId);
    logSecurityEvent(req, {
      action: 'BOARD_INTELLIGENCE_ROLLBACK',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'board_profile_versions',
      status: 'WARNING',
      targetType: 'board_profile_version',
      targetId: version.id,
      details: { profileId: req.params.id, restoredVersion: version.version },
    });
    return res.json({ success: true, version });
  } catch (err: any) {
    logInternalError("Rollback Board Version Error", err);
    return res.status(400).json({ error: 'ROLLBACK_BOARD_VERSION_FAILED', message: 'Falha ao restaurar versao.' });
  }
});

app.get("/api/admin/board-intelligence/profiles/:id/retrieval", requireAdminAuth, (req: Request, res: Response) => {
  if (!ensureBoardIntelligenceEnabled(res)) return;
  const query = String(req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'QUERY_REQUIRED' });
  return res.json({
    success: true,
    context: boardIntelligenceServiceInstance.getActiveProfileContext(req.params.id),
    questions: boardIntelligenceServiceInstance.getRelevantHistoricalQuestions(req.params.id, query, Number(req.query.topK) || 5),
  });
});

app.get('/api/student/knowledge-profile', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    return res.json({ success: true, algorithmVersion: 'mastery_v1', knowledge: studentLearningService.listKnowledge(user.userId) });
  } catch {
    return res.status(500).json({ error: 'KNOWLEDGE_PROFILE_FAILED' });
  }
});

app.get('/api/student/priority-radar', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const profileId = req.query.boardProfileId ? String(req.query.boardProfileId) : null;
    return res.json({ success: true, algorithmVersion: 'priority_radar_v1', priorities: studentLearningService.getRadar(user.userId, profileId) });
  } catch {
    return res.status(500).json({ error: 'PRIORITY_RADAR_FAILED' });
  }
});

app.get('/api/student/coach-plan', requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const knowledge = studentLearningService.listKnowledge(user.userId).slice(0, 8);
    const revisions = studentLearningService.listRevisions(user.userId, true).slice(0, 8);
    const weakest = knowledge[0];
    const fallback = {
      headline: weakest ? `Priorize ${weakest.topic} hoje` : 'Comece pelo seu primeiro diagnóstico',
      diagnosis: weakest ? `Seu domínio estimado em ${weakest.discipline} · ${weakest.topic} está em ${Math.round(weakest.masteryScore)}%.` : 'Ainda faltam tentativas para gerar uma recomendação personalizada.',
      nextActions: revisions.length ? revisions.slice(0, 3).map((revision) => `Revisar ${revision.topic} (${revision.subtopic})`) : ['Resolver 10 questões do banco de provas', 'Registrar confiança e tempo em cada resposta'],
      warnings: weakest && weakest.attempts < 3 ? ['A amostra deste tópico ainda é pequena; evite conclusões definitivas.'] : [],
    };
    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Crie um plano diário curto para um aluno do CFO CBMERJ. Retorne apenas JSON com headline, diagnosis, nextActions (array de 3 strings) e warnings (array de strings). Dados agregados: ${JSON.stringify({ knowledge, revisions })}`,
          config: { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties: { headline: { type: Type.STRING }, diagnosis: { type: Type.STRING }, nextActions: { type: Type.ARRAY, items: { type: Type.STRING } }, warnings: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['headline', 'diagnosis', 'nextActions', 'warnings'] } },
        });
        const parsed = JSON.parse(response.text || '{}');
        if (parsed.headline && Array.isArray(parsed.nextActions)) return res.json({ success: true, source: 'gemini', coachPlan: parsed });
      } catch { /* fallback pedagógico determinístico */ }
    }
    return res.json({ success: true, source: 'heuristic', coachPlan: fallback });
  } catch {
    return res.status(500).json({ error: 'COACH_PLAN_FAILED' });
  }
});

app.get('/api/student/analytics', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const totals = rawDb.prepare('SELECT COUNT(*) AS attempts, COALESCE(SUM(is_correct), 0) AS correct, AVG(response_seconds) AS average_response_seconds FROM student_question_attempts WHERE user_id = ? AND created_at >= ?').get(user.userId, since) as any;
    const daily = rawDb.prepare("SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS attempts, COALESCE(SUM(is_correct), 0) AS correct FROM student_question_attempts WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day ASC").all(user.userId, since) as any[];
    const weakTopics = rawDb.prepare("SELECT discipline, topic, subtopic, COUNT(*) AS attempts, COALESCE(SUM(is_correct), 0) AS correct FROM student_question_attempts WHERE user_id = ? AND created_at >= ? GROUP BY discipline, topic, subtopic ORDER BY (CAST(correct AS REAL) / COUNT(*)) ASC, attempts DESC LIMIT 10").all(user.userId, since) as any[];
    const simulations = rawDb.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed FROM student_simulations WHERE user_id = ? AND created_at >= ?").get(user.userId, since) as any;
    return res.json({ success: true, periodDays: days, summary: { attempts: Number(totals?.attempts || 0), correct: Number(totals?.correct || 0), accuracyPercent: totals?.attempts ? Math.round((Number(totals.correct) / Number(totals.attempts)) * 100) : 0, averageResponseSeconds: totals?.average_response_seconds == null ? null : Math.round(Number(totals.average_response_seconds)), simulationsCreated: Number(simulations?.total || 0), simulationsCompleted: Number(simulations?.completed || 0) }, daily: daily.map((row) => ({ day: row.day, attempts: Number(row.attempts), correct: Number(row.correct), accuracyPercent: row.attempts ? Math.round((Number(row.correct) / Number(row.attempts)) * 100) : 0 })), weakTopics: weakTopics.map((row) => ({ discipline: row.discipline, topic: row.topic, subtopic: row.subtopic, attempts: Number(row.attempts), correct: Number(row.correct), accuracyPercent: row.attempts ? Math.round((Number(row.correct) / Number(row.attempts)) * 100) : 0 })) });
  } catch {
    return res.status(500).json({ error: 'STUDENT_ANALYTICS_FAILED' });
  }
});

app.post('/api/student/question-attempts', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = studentLearningService.recordAttempt({
      userId: user.userId,
      questionId: req.body?.questionId,
      selectedOption: req.body?.selectedOption,
      simulationId: req.body?.simulationId,
      responseSeconds: req.body?.responseSeconds,
      confidenceScore: req.body?.confidenceScore,
      errorType: req.body?.errorType,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    const known = ['QUESTION_NOT_FOUND', 'QUESTION_HAS_NO_OFFICIAL_ANSWER', 'INVALID_SELECTED_OPTION', 'SIMULATION_NOT_FOUND'];
    const publicError = known.includes(err?.message) ? err.message : 'ATTEMPT_FAILED';
    if (publicError === 'ATTEMPT_FAILED') logInternalError("Question Attempt Error", err);
    return res.status(publicError === 'ATTEMPT_FAILED' ? 500 : 422).json({ error: publicError });
  }
});

app.get('/api/student/revisions', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ success: true, revisions: studentLearningService.listRevisions(user.userId, req.query.dueOnly === 'true') });
});

// =========================================================================
// 🗂️ FLASHCARDS ANKI RELACIONAIS — HIERARQUIA, SRS (SM-2) & ISOLAMENTO
// =========================================================================

// Métricas Globais de Flashcards do Usuário
app.get('/api/flashcards/stats', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stats = flashcardRepoInstance.getStats(user.userId);
    return res.json({ success: true, stats });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_FLASHCARD_STATS_FAILED', message: 'Falha ao obter estatísticas de flashcards.' });
  }
});

// Previsão de carga de revisões (Forecast)
app.get('/api/flashcards/stats/forecast', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const forecast = flashcardRepoInstance.getForecastStats(user.userId);
    return res.json({ success: true, forecast });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_FORECAST_STATS_FAILED', message: 'Falha ao calcular previsão de revisões.' });
  }
});

// Histórico de revisões para Heatmap de constância
app.get('/api/flashcards/stats/heatmap', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const days = req.query.days ? Math.min(365, Math.max(7, Number(req.query.days))) : 30;
    const heatmap = flashcardRepoInstance.getHeatmapStats(user.userId, days);
    return res.json({ success: true, heatmap, days });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_HEATMAP_STATS_FAILED', message: 'Falha ao obter mapa de constância de revisões.' });
  }
});

// --- DISCIPLINAS (SUBJECTS) ---

app.get('/api/flashcards/subjects', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Auto-migra dados legados na primeira leitura caso as tabelas relacionais estejam vazias
    const existingSubs = flashcardRepoInstance.listSubjects(user.userId);
    if (existingSubs.length === 0) {
      flashcardRepoInstance.migrateLegacyState(user.userId);
    }
    const subjects = flashcardRepoInstance.listSubjects(user.userId);
    return res.json({ success: true, subjects });
  } catch (err: any) {
    return res.status(500).json({ error: 'LIST_SUBJECTS_FAILED', message: 'Falha ao listar disciplinas.' });
  }
});

app.post('/api/flashcards/subjects', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description, icon, color } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'O nome da disciplina é obrigatório.' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'NAME_TOO_LONG', message: 'O nome da disciplina não pode exceder 100 caracteres.' });
    }

    const subject = flashcardRepoInstance.createSubject(user.userId, {
      name: name.trim(),
      description: typeof description === 'string' ? description.trim().slice(0, 500) : null,
      icon: typeof icon === 'string' ? icon.trim().slice(0, 50) : null,
      color: typeof color === 'string' ? color.trim().slice(0, 50) : null,
    });
    return res.status(201).json({ success: true, subject });
  } catch (err: any) {
    return res.status(500).json({ error: 'CREATE_SUBJECT_FAILED', message: 'Falha ao criar disciplina.' });
  }
});

app.get('/api/flashcards/subjects/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const subject = flashcardRepoInstance.getSubject(user.userId, req.params.id);
    if (!subject) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada.' });
    }
    const decks = flashcardRepoInstance.listDecks(user.userId, subject.id);
    return res.json({ success: true, subject, decks });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_SUBJECT_FAILED', message: 'Falha ao obter detalhes da disciplina.' });
  }
});

app.patch('/api/flashcards/subjects/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description, icon, color } = req.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Nome da disciplina inválido.' });
    }

    const updated = flashcardRepoInstance.updateSubject(user.userId, req.params.id, {
      name: typeof name === 'string' ? name.trim() : undefined,
      description: typeof description === 'string' ? description.trim() : description === null ? null : undefined,
      icon: typeof icon === 'string' ? icon.trim() : icon === null ? null : undefined,
      color: typeof color === 'string' ? color.trim() : color === null ? null : undefined,
    });
    if (!updated) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada.' });
    }
    return res.json({ success: true, subject: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'UPDATE_SUBJECT_FAILED', message: 'Falha ao atualizar disciplina.' });
  }
});

app.get('/api/flashcards/subjects/:id/cascade-stats', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stats = flashcardRepoInstance.getSubjectCascadeStats(user.userId, req.params.id);
    if (!stats) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada.' });
    }
    return res.json({ success: true, stats });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_CASCADE_STATS_FAILED', message: 'Falha ao obter contagem de dependências.' });
  }
});

app.delete('/api/flashcards/subjects/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = flashcardRepoInstance.deleteSubject(user.userId, req.params.id);
    if (!result.deleted) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada.' });
    }
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'DELETE_SUBJECT_FAILED', message: 'Falha ao excluir disciplina.' });
  }
});

// --- BARALHOS / TÓPICOS (DECKS) ---

app.get('/api/flashcards/decks', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    const decks = flashcardRepoInstance.listDecks(user.userId, subjectId);
    return res.json({ success: true, decks });
  } catch (err: any) {
    return res.status(500).json({ error: 'LIST_DECKS_FAILED', message: 'Falha ao listar baralhos.' });
  }
});

app.post('/api/flashcards/decks', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { subjectId, name, description } = req.body || {};
    if (!subjectId || typeof subjectId !== 'string') {
      return res.status(400).json({ error: 'MISSING_SUBJECT_ID', message: 'ID da disciplina é obrigatório.' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Nome do baralho é obrigatório.' });
    }
    if (name.trim().length > 150) {
      return res.status(400).json({ error: 'NAME_TOO_LONG', message: 'O nome do baralho não pode exceder 150 caracteres.' });
    }

    try {
      const deck = flashcardRepoInstance.createDeck(user.userId, {
        subjectId,
        name: name.trim(),
        description: typeof description === 'string' ? description.trim().slice(0, 500) : null,
      });
      return res.status(201).json({ success: true, deck });
    } catch (createErr: any) {
      if (createErr.message === 'SUBJECT_NOT_FOUND') {
        return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada ou não pertence a você.' });
      }
      throw createErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'CREATE_DECK_FAILED', message: 'Falha ao criar baralho.' });
  }
});

app.get('/api/flashcards/decks/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const deck = flashcardRepoInstance.getDeck(user.userId, req.params.id);
    if (!deck) {
      return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
    }
    return res.json({ success: true, deck });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_DECK_FAILED', message: 'Falha ao obter detalhes do baralho.' });
  }
});

app.patch('/api/flashcards/decks/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description, subjectId } = req.body || {};
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'INVALID_NAME', message: 'Nome do baralho inválido.' });
    }

    try {
      const updated = flashcardRepoInstance.updateDeck(user.userId, req.params.id, {
        name: typeof name === 'string' ? name.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : description === null ? null : undefined,
        subjectId: typeof subjectId === 'string' ? subjectId : undefined,
      });
      if (!updated) {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
      }
      return res.json({ success: true, deck: updated });
    } catch (updateErr: any) {
      if (updateErr.message === 'SUBJECT_NOT_FOUND') {
        return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina informada não encontrada.' });
      }
      throw updateErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'UPDATE_DECK_FAILED', message: 'Falha ao atualizar baralho.' });
  }
});

app.get('/api/flashcards/decks/:id/cascade-stats', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stats = flashcardRepoInstance.getDeckCascadeStats(user.userId, req.params.id);
    if (!stats) {
      return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
    }
    return res.json({ success: true, stats });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_CASCADE_STATS_FAILED', message: 'Falha ao obter dados do baralho.' });
  }
});

app.delete('/api/flashcards/decks/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = flashcardRepoInstance.deleteDeck(user.userId, req.params.id);
    if (!result.deleted) {
      return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
    }
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'DELETE_DECK_FAILED', message: 'Falha ao excluir baralho.' });
  }
});

// --- FLASHCARDS CRUD & REPETIÇÃO ESPAÇADA ---

app.get('/api/flashcards/decks/:id/cards', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const deck = flashcardRepoInstance.getDeck(user.userId, req.params.id);
    if (!deck) {
      return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
    }
    const { status, dueOnly, search, limit, offset } = req.query;
    const result = flashcardRepoInstance.listCards(user.userId, {
      deckId: deck.id,
      status: typeof status === 'string' ? (status as any) : undefined,
      dueOnly: dueOnly === 'true',
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    });
    return res.json({ success: true, deck, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'LIST_DECK_CARDS_FAILED', message: 'Falha ao listar cartões do baralho.' });
  }
});

app.get('/api/flashcards/cards', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { deckId, subjectId, status, dueOnly, search, limit, offset } = req.query;
    const result = flashcardRepoInstance.listCards(user.userId, {
      deckId: typeof deckId === 'string' ? deckId : undefined,
      subjectId: typeof subjectId === 'string' ? subjectId : undefined,
      status: typeof status === 'string' ? (status as any) : undefined,
      dueOnly: dueOnly === 'true',
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? Number(limit) : 100,
      offset: offset ? Number(offset) : 0,
    });
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'LIST_CARDS_FAILED', message: 'Falha ao listar flashcards.' });
  }
});

app.post('/api/flashcards/cards', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { deckId, front, back, frontImage, backImage } = req.body || {};
    if (!deckId || typeof deckId !== 'string') {
      return res.status(400).json({ error: 'MISSING_DECK_ID', message: 'ID do baralho é obrigatório.' });
    }
    const cleanFront = typeof front === 'string' ? front.trim() : '';
    const cleanBack = typeof back === 'string' ? back.trim() : '';

    if (!cleanFront && !frontImage) {
      return res.status(400).json({ error: 'MISSING_FRONT', message: 'Informe a pergunta ou anexe uma imagem na frente.' });
    }
    if (!cleanBack && !backImage) {
      return res.status(400).json({ error: 'MISSING_BACK', message: 'Informe a resposta ou anexe uma imagem no verso.' });
    }

    try {
      const card = flashcardRepoInstance.createCard(user.userId, {
        deckId,
        front: cleanFront || '(Imagem)',
        back: cleanBack || '(Imagem)',
        frontImage: typeof frontImage === 'string' ? frontImage : null,
        backImage: typeof backImage === 'string' ? backImage : null,
      });
      return res.status(201).json({ success: true, card });
    } catch (createErr: any) {
      if (createErr.message === 'DECK_NOT_FOUND') {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado ou não pertence a você.' });
      }
      throw createErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'CREATE_CARD_FAILED', message: 'Falha ao criar flashcard.' });
  }
});

app.get('/api/flashcards/cards/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const card = flashcardRepoInstance.getCard(user.userId, req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'FLASHCARD_NOT_FOUND', message: 'Flashcard não encontrado.' });
    }
    return res.json({ success: true, card });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_CARD_FAILED', message: 'Falha ao buscar flashcard.' });
  }
});

app.patch('/api/flashcards/cards/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { front, back, frontImage, backImage, deckId } = req.body || {};

    try {
      const updated = flashcardRepoInstance.updateCard(user.userId, req.params.id, {
        front: typeof front === 'string' ? front.trim() : undefined,
        back: typeof back === 'string' ? back.trim() : undefined,
        frontImage: typeof frontImage === 'string' ? frontImage : frontImage === null ? null : undefined,
        backImage: typeof backImage === 'string' ? backImage : backImage === null ? null : undefined,
        deckId: typeof deckId === 'string' ? deckId : undefined,
      });
      if (!updated) {
        return res.status(404).json({ error: 'FLASHCARD_NOT_FOUND', message: 'Flashcard não encontrado.' });
      }
      return res.json({ success: true, card: updated });
    } catch (updateErr: any) {
      if (updateErr.message === 'DECK_NOT_FOUND') {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho de destino não encontrado.' });
      }
      throw updateErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'UPDATE_CARD_FAILED', message: 'Falha ao atualizar flashcard.' });
  }
});

app.delete('/api/flashcards/cards/:id', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const deleted = flashcardRepoInstance.deleteCard(user.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'FLASHCARD_NOT_FOUND', message: 'Flashcard não encontrado.' });
    }
    return res.json({ success: true, message: 'Flashcard excluído com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'DELETE_CARD_FAILED', message: 'Falha ao excluir flashcard.' });
  }
});

// Endpoint do Algoritmo Anki / SM-2: Avaliação de Estudo
app.post('/api/flashcards/cards/:id/review', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { rating } = req.body || {};
    const numericRating = Number(rating);
    if (![1, 2, 3, 4].includes(numericRating)) {
      return res.status(400).json({
        error: 'INVALID_RATING',
        message: 'A avaliação deve ser 1 (Errei), 2 (Difícil), 3 (Bom) ou 4 (Fácil).',
      });
    }

    try {
      const result = flashcardRepoInstance.reviewCard(user.userId, req.params.id, numericRating as any);
      return res.json({ success: true, ...result });
    } catch (revErr: any) {
      if (revErr.message === 'FLASHCARD_NOT_FOUND') {
        return res.status(404).json({ error: 'FLASHCARD_NOT_FOUND', message: 'Flashcard não encontrado.' });
      }
      throw revErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'REVIEW_CARD_FAILED', message: 'Falha ao processar revisão de flashcard.' });
  }
});

// Fila de Estudo Prioritária do Baralho
app.get('/api/flashcards/study-queue/:deckId', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const deck = flashcardRepoInstance.getDeck(user.userId, req.params.deckId);
    if (!deck) {
      return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado.' });
    }
    const limit = req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 50;
    const queue = flashcardRepoInstance.getStudyQueue(user.userId, deck.id, limit);
    return res.json({ success: true, deck, queue, total: queue.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'STUDY_QUEUE_FAILED', message: 'Falha ao carregar fila de estudo.' });
  }
});

// Fila de Estudo Consolidada da Disciplina
app.get('/api/flashcards/study-queue/subject/:subjectId', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const subject = flashcardRepoInstance.getSubject(user.userId, req.params.subjectId);
    if (!subject) {
      return res.status(404).json({ error: 'SUBJECT_NOT_FOUND', message: 'Disciplina não encontrada.' });
    }
    const limit = req.query.limit ? Math.min(150, Math.max(1, Number(req.query.limit))) : 100;
    const queue = flashcardRepoInstance.getSubjectStudyQueue(user.userId, subject.id, limit);
    return res.json({ success: true, subject, queue, cards: queue, total: queue.length });
  } catch (err: any) {
    return res.status(500).json({ error: 'SUBJECT_STUDY_QUEUE_FAILED', message: 'Falha ao carregar fila de estudo da disciplina.' });
  }
});

// Importação / Criação em Lote de Flashcards
app.post('/api/flashcards/decks/:deckId/cards/batch', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { cards } = req.body || {};

    if (!Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({ error: 'INVALID_CARDS_LIST', message: 'Envie uma lista com ao menos 1 cartão.' });
    }

    if (cards.length > 100) {
      return res.status(400).json({ error: 'BATCH_TOO_LARGE', message: 'O limite máximo por importação é de 100 cartões.' });
    }

    // Valida e sanitiza cada item
    const validItems: Array<{ front: string; back: string; frontImage?: string | null; backImage?: string | null }> = [];
    for (const item of cards) {
      const front = typeof item.front === 'string' ? item.front.trim() : '';
      const back = typeof item.back === 'string' ? item.back.trim() : '';
      const frontImage = typeof item.frontImage === 'string' ? item.frontImage : null;
      const backImage = typeof item.backImage === 'string' ? item.backImage : null;

      if (!front && !frontImage) continue;
      if (!back && !backImage) continue;

      validItems.push({
        front: front || '(Imagem)',
        back: back || '(Imagem)',
        frontImage,
        backImage,
      });
    }

    if (validItems.length === 0) {
      return res.status(400).json({ error: 'NO_VALID_CARDS', message: 'Nenhum cartão válido foi encontrado com pergunta e resposta preenchidas.' });
    }

    try {
      const createdCards = flashcardRepoInstance.createCardsBatch(user.userId, req.params.deckId, validItems);
      return res.status(201).json({ success: true, count: createdCards.length, cards: createdCards });
    } catch (batchErr: any) {
      if (batchErr.message === 'DECK_NOT_FOUND') {
        return res.status(404).json({ error: 'DECK_NOT_FOUND', message: 'Baralho não encontrado ou não pertence a você.' });
      }
      throw batchErr;
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'BATCH_IMPORT_FAILED', message: 'Falha ao importar cartões em lote.' });
  }
});

// =========================================================================
// 🧠 REAL ANKI ENGINE ROUTER (Decks, Notes, Cards, FSRS, APKG, Browser)
// =========================================================================
app.use('/api/anki', createAnkiRouter(requireUserAuth));

// --- ROTA DE COMPATIBILIDADE LEGADA COM SINCRONIZAÇÃO AUTOMÁTICA ---
app.get('/api/student/flashcards', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  // Consulta estado relacional
  const subjects = flashcardRepoInstance.listSubjects(user.userId);
  if (subjects.length === 0) {
    flashcardRepoInstance.migrateLegacyState(user.userId);
  }

  const decks = flashcardRepoInstance.listDecks(user.userId);
  const { cards } = flashcardRepoInstance.listCards(user.userId, { limit: 500 });

  // Converte para o formato consumido pelo cliente legado se necessário
  const formattedDecks = decks.map((d) => ({
    id: d.id,
    title: d.name,
    subject: d.subjectName || 'Geral',
    description: d.description || undefined,
    createdAt: d.createdAt,
  }));

  const formattedCards = cards.map((c) => ({
    id: c.id,
    deckId: c.deckId,
    question: c.front,
    answer: c.back,
    questionImage: c.frontImage || undefined,
    answerImage: c.backImage || undefined,
    createdAt: c.createdAt,
    lastReviewedAt: c.lastReviewedAt || undefined,
    state: c.status,
    repetitions: c.reviewCount,
    intervalDays: c.intervalDays,
    nextReviewDate: c.nextReviewAt,
  }));

  const row = rawDb.prepare('SELECT updated_at FROM student_flashcard_state WHERE user_id = ?').get(user.userId) as any;
  return res.json({
    success: true,
    decks: formattedDecks,
    cards: formattedCards,
    updatedAt: row?.updated_at || new Date().toISOString(),
  });
});

app.put('/api/student/flashcards', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const decks = Array.isArray(req.body?.decks) ? req.body.decks : [];
  const cards = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (JSON.stringify(decks).length + JSON.stringify(cards).length > 10_000_000) {
    return res.status(413).json({ error: 'FLASHCARD_STATE_TOO_LARGE' });
  }
  const now = new Date().toISOString();
  rawDb.prepare(`
    INSERT INTO student_flashcard_state (user_id, decks_json, cards_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET decks_json = excluded.decks_json, cards_json = excluded.cards_json, updated_at = excluded.updated_at
  `).run(user.userId, JSON.stringify(decks), JSON.stringify(cards), now, now);

  // Sincroniza com as tabelas relacionais em background
  try {
    flashcardRepoInstance.migrateLegacyState(user.userId);
  } catch {}

  return res.json({ success: true, updatedAt: now });
});

app.post('/api/student/revisions/:id/complete', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const revision = studentLearningService.completeRevision(user.userId, req.params.id);
  if (!revision) return res.status(404).json({ error: 'REVISION_NOT_FOUND' });
  return res.json({ success: true, revision });
});

app.get('/api/student/recommendations', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ success: true, recommendations: studentLearningService.recommendQuestions(user.userId, Number(req.query.limit) || 10), algorithmVersion: 'recommendations_v1' });
});

app.post('/api/student/simulations', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const mode = req.body?.mode === 'ADAPTIVE' ? 'ADAPTIVE' : 'TRADITIONAL';
    return res.status(201).json({ success: true, simulation: studentLearningService.createSimulation(user.userId, mode, Number(req.body?.count) || 10) });
  } catch {
    return res.status(500).json({ error: 'SIMULATION_CREATE_FAILED' });
  }
});

app.post('/api/student/simulations/reinforcement', requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const questionIds = Array.isArray(req.body?.questionIds) ? req.body.questionIds.map(String) : [];
    return res.status(201).json({ success: true, simulation: studentLearningService.createReinforcementSimulation(user.userId, questionIds) });
  } catch (error: any) {
    return res.status(422).json({ error: error?.message || 'NO_REINFORCEMENT_QUESTIONS' });
  }
});

app.get('/api/student/simulations/:id', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const simulation = studentLearningService.getSimulation(user.userId, req.params.id);
  if (!simulation) return res.status(404).json({ error: 'SIMULATION_NOT_FOUND' });
  return res.json({ success: true, simulation });
});

app.post('/api/student/simulations/:id/status', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const allowed = new Set(['IN_PROGRESS', 'COMPLETED', 'ABANDONED']);
  const status = String(req.body?.status || '');
  if (!allowed.has(status)) return res.status(422).json({ error: 'INVALID_SIMULATION_STATUS' });
  const simulation = studentLearningService.updateSimulationStatus(user.userId, req.params.id, status as any);
  if (!simulation) return res.status(404).json({ error: 'SIMULATION_NOT_FOUND' });
  return res.json({ success: true, simulation });
});

app.post('/api/student/simulations/:id/adapt', requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const simulation = studentLearningService.adaptSimulation(user.userId, req.params.id, String(req.body?.answeredQuestionId || ''), Boolean(req.body?.isCorrect));
  if (!simulation) return res.status(404).json({ error: 'ADAPTIVE_SIMULATION_NOT_FOUND' });
  return res.json({ success: true, simulation });
});

// 1. Upload Seguro de Prova e Registro Estruturado: POST /api/exams/upload-and-process
app.post("/api/exams/upload-and-process", requireUserAuth, uploadLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, institution, examYear, fileName, declaredMime, contentBase64, rawTextContent, metadata } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: "INVALID_TITLE", message: "O título da prova é obrigatório." });
    }

    const cleanTitle = title.trim().slice(0, 200);
    const cleanInstitution = (institution && typeof institution === 'string' && institution.trim()) ? institution.trim().slice(0, 100) : 'Banca Examinadora';
    const parsedYear = Number(examYear) || new Date().getFullYear();

    let fileId: string | undefined;

    // Se houver arquivo binário fornecido via Base64, passa pelo cofre de upload seguro
    if (contentBase64 && typeof contentBase64 === 'string') {
      let buffer: Buffer;
      try {
        const cleanBase64 = contentBase64.replace(/^data:[^;]+;base64,/, '');
        buffer = Buffer.from(cleanBase64, 'base64');
      } catch {
        return res.status(400).json({ error: "INVALID_ENCODING", message: "Buffer base64 corrompido." });
      }

      const uploadRes = await secureUploadService.processUpload({
        buffer,
        originalName: fileName || `${cleanTitle}.pdf`,
        declaredMime: declaredMime || 'application/pdf',
        userId: user.userId,
        ip: getClientIp(req),
        userAgent: (req.headers['user-agent'] as string) || undefined,
      });

      if (!uploadRes.success || !uploadRes.file) {
        return res.status(400).json({
          error: "UPLOAD_REJECTED",
          message: uploadRes.error || "Arquivo de prova rejeitado pela validação de segurança.",
        });
      }

      fileId = uploadRes.file.id;
    }

    let result: { paper: any; questions: any[] };
    try {
      result = await examServiceInstance.extractAndRegisterExam({
        userId: user.userId,
        fileId,
        title: cleanTitle,
        institution: cleanInstitution,
        examYear: parsedYear,
        rawTextContent: typeof rawTextContent === 'string' ? rawTextContent : undefined,
      });
    } catch (extractErr) {
      console.warn('[Exam Extract Fallback]', extractErr);
      const paper = examPaperRepoInstance.create({
        userId: user.userId,
        title: cleanTitle,
        institution: cleanInstitution,
        examYear: parsedYear,
        fileId,
        status: 'READY',
        totalQuestions: 0,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      });
      result = { paper, questions: [] };
    }

    logSecurityEvent(req, {
      action: 'EXAM_PAPER_CREATED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'exam_papers',
      status: 'SUCCESS',
      targetType: 'exam_paper',
      targetId: result.paper.id,
      details: { title: result.paper.title, year: result.paper.examYear }
    });

    return res.status(201).json({
      success: true,
      paper: result.paper,
      questionsCount: result.questions.length,
      message: 'Prova cadastrada com sucesso no acervo.',
    });

  } catch (err: any) {
    logInternalError("Exam Upload & Process Error", err);
    return res.status(500).json({
      error: "EXAM_PROCESSING_FAILED",
      message: "Falha ao processar e salvar a prova.",
    });
  }
});

// Edição de dados da prova (renomear, alterar ano ou banca): PATCH /api/exams/:id
app.patch("/api/exams/:id", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const paper = examPaperRepoInstance.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED" });
    }

    const { title, institution, examYear, metadata } = req.body || {};
    const updated = examPaperRepoInstance.update(req.params.id, {
      title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : undefined,
      institution: typeof institution === 'string' && institution.trim() ? institution.trim().slice(0, 100) : undefined,
      examYear: Number(examYear) ? Number(examYear) : undefined,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    });

    return res.json({ success: true, paper: updated });
  } catch (err: any) {
    return res.status(500).json({ error: "EXAM_UPDATE_FAILED" });
  }
});

// 2. Listagem de Provas do Usuário com Filtros: GET /api/exams
app.post("/api/exams/:id/review", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const paper = examPaperRepoInstance.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'EXAM_NOT_FOUND' });
    if (paper.userId !== user.userId && user.role !== 'admin') return res.status(403).json({ error: 'ACCESS_DENIED' });
    const questions = examQuestionRepoInstance.findByExamId(paper.id);
    if (questions.length === 0) return res.status(422).json({ error: 'NO_QUESTIONS_TO_REVIEW' });
    for (const question of questions) {
      let options: unknown[] = [];
      try { options = JSON.parse(question.optionsJson); } catch {}
      if (!question.statement.trim() || options.length < 2) return res.status(422).json({ error: 'QUESTION_NOT_REVIEWABLE', questionId: question.id });
    }
    for (const question of questions) examQuestionRepoInstance.setReviewStatus(question.id, 'APPROVED');
    const updated = examPaperRepoInstance.setPublicationStatus(paper.id, 'IN_REVIEW');
    return res.json({ success: true, paper: updated, approvedQuestions: questions.length });
  } catch {
    return res.status(500).json({ error: 'REVIEW_FAILED' });
  }
});

app.post("/api/exams/:id/publish", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const paper = examPaperRepoInstance.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'EXAM_NOT_FOUND' });
    if (paper.userId !== user.userId && user.role !== 'admin') return res.status(403).json({ error: 'ACCESS_DENIED' });
    const questions = examQuestionRepoInstance.findByExamId(paper.id);
    if (questions.length === 0 || questions.some((question) => question.reviewStatus !== 'APPROVED')) return res.status(409).json({ error: 'REVIEW_REQUIRED' });
    const updated = examPaperRepoInstance.setPublicationStatus(paper.id, 'PUBLISHED');
    logSecurityEvent(req, { action: 'EXAM_PAPER_PUBLISHED', actor: user.username || user.userId, actorUserId: user.userId, resource: 'exam_papers', status: 'SUCCESS', targetType: 'exam_paper', targetId: paper.id });
    return res.json({ success: true, paper: updated });
  } catch {
    return res.status(500).json({ error: 'PUBLISH_FAILED' });
  }
});

app.get("/api/exams/jobs/:id", requireUserAuth, (req: Request, res: Response) => {
  const user = (req as any).user;
  const job = examJobRepoInstance.findById(req.params.id);
  if (!job || (job.userId !== user.userId && user.role !== 'admin')) return res.status(404).json({ error: 'JOB_NOT_FOUND' });
  return res.json({ success: true, job });
});

app.get("/api/exams", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const discipline = req.query.discipline ? String(req.query.discipline).trim() : undefined;
    const year = req.query.year ? parseInt(String(req.query.year), 10) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10))) : 50;

    let papers: DbExamPaper[];
    if (user.role === 'admin' && req.query.allUsers === 'true') {
      papers = examPaperRepoInstance.findAll({ search, limit });
    } else {
      papers = examPaperRepoInstance.findByUserId(user.userId, {
        discipline,
        year: isNaN(year!) ? undefined : year,
        search,
        limit,
      });
    }

    return res.json({
      success: true,
      papers,
      total: papers.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "LIST_EXAMS_FAILED",
      message: "Falha ao listar o banco de provas.",
    });
  }
});

// 3. Estatísticas Reais Agregadas do Aluno: GET /api/exams/stats
app.get("/api/exams/stats", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const stats = examPaperRepoInstance.getStatsByUserId(user.userId);

    return res.json({
      success: true,
      stats: {
        totalPapers: stats.totalPapers,
        totalQuestions: stats.totalQuestions,
        resolvedQuestions: stats.resolvedQuestions,
        successRatePercent: stats.successRatePercent,
        // A Fase 1 ainda nao registra tempo por questao; nao inventar metricas.
        averageTimeMinutes: 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "STATS_ERROR",
      message: "Falha ao carregar métricas reais do banco de provas.",
    });
  }
});

// 4. Detalhes de Prova Específica: GET /api/exams/:id
app.get("/api/exams/:id", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const examId = req.params.id;

    const paper = examPaperRepoInstance.findById(examId);
    if (!paper) {
      return res.status(404).json({ error: "EXAM_NOT_FOUND", message: "Prova não encontrada." });
    }

    // Validação estrita de Ownership (IDOR Defense)
    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Você não possui permissão para acessar esta prova." });
    }

    const questions = examQuestionRepoInstance.findByExamId(examId);

    return res.json({
      success: true,
      paper,
      questions,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "GET_EXAM_FAILED",
      message: "Falha ao obter detalhes da prova.",
    });
  }
});

// 5. Questões de uma Prova com Filtro por Disciplina: GET /api/exams/:id/questions
app.get("/api/exams/:id/questions", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const examId = req.params.id;
    const discipline = req.query.discipline ? String(req.query.discipline).trim() : undefined;

    const paper = examPaperRepoInstance.findById(examId);
    if (!paper) {
      return res.status(404).json({ error: "EXAM_NOT_FOUND", message: "Prova não encontrada." });
    }

    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso não autorizado." });
    }

    const questions = examQuestionRepoInstance.findByExamId(examId, discipline);

    return res.json({
      success: true,
      examId,
      discipline: discipline || 'Todas',
      questions,
      total: questions.length,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "GET_QUESTIONS_FAILED",
      message: "Falha ao obter questões da prova.",
    });
  }
});

// 6. Resolução Profunda por IA de até 10 Questões: POST /api/exams/solve-with-ai
app.post("/api/exams/solve-with-ai", requireUserAuth, aiLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { questionIds, idempotencyKey } = req.body || {};

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({
        error: "NO_QUESTIONS_SELECTED",
        message: "Selecione pelo menos uma questão para correção.",
      });
    }

    // 🛑 Validação Rigorosa: Máximo 10 Questões
    if (questionIds.length > 10) {
      return res.status(400).json({
        error: "MAX_QUESTIONS_EXCEEDED",
        message: "Você pode corrigir até 10 questões por vez.",
      });
    }

    // 🛑 Proteção de Idempotência contra Double-Click / Race Condition
    if (typeof idempotencyKey === 'string' && idempotencyKey.length > 200) {
      return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY', message: 'A chave de idempotencia excede 200 caracteres.' });
    }
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      const existingJob = examJobRepoInstance.findByIdempotencyKey(idempotencyKey, user.userId);
      if (existingJob && existingJob.status === 'completed' && existingJob.resultSummaryJson) {
        try {
          const cachedResult = JSON.parse(existingJob.resultSummaryJson);
          return res.json({
            success: true,
            idempotent: true,
            ...cachedResult,
          });
        } catch {}
      }
    }

    // Registra Job de IA
    const job = examJobRepoInstance.create({
      userId: user.userId,
      jobType: 'AI_SOLVE',
      status: 'processing',
      totalItems: questionIds.length,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : null,
    });

    const solveOutput = await examServiceInstance.solveQuestionsWithAI({
      userId: user.userId,
      questionIds,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
    });

    examJobRepoInstance.updateStatus(
      job.id,
      'completed',
      solveOutput.totalSolved,
      { results: solveOutput.results }
    );

    logSecurityEvent(req, {
      action: 'EXAM_AI_SOLVE_COMPLETED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'exam_questions',
      status: 'SUCCESS',
      details: {
        totalRequested: questionIds.length,
        totalSolved: solveOutput.totalSolved,
      },
    });

    return res.json({
      success: true,
      jobId: job.id,
      results: solveOutput.results,
      totalSolved: solveOutput.totalSolved,
    });
  } catch (err: any) {
    logInternalError("Solve With AI Error", err);
    return res.status(400).json({
      error: "SOLVE_ERROR",
      message: "Falha durante resolução das questões com IA.",
    });
  }
});

// 7. Exclusão Segura de Prova: DELETE /api/exams/:id
app.delete("/api/exams/:id", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const examId = req.params.id;

    const paper = examPaperRepoInstance.findById(examId);
    if (!paper) {
      return res.status(404).json({ error: "EXAM_NOT_FOUND", message: "Prova não encontrada." });
    }

    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Permissão negada para excluir esta prova." });
    }

    // Exclui questões e prova em cascata
    examQuestionRepoInstance.deleteByExamId(examId);
    examPaperRepoInstance.delete(examId);

    logSecurityEvent(req, {
      action: 'EXAM_PAPER_DELETED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'exam_papers',
      status: 'SUCCESS',
      targetType: 'exam_paper',
      targetId: examId,
    });

    return res.json({
      success: true,
      message: "Prova e questões associadas removidas com sucesso.",
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "DELETE_EXAM_FAILED",
      message: "Falha ao remover a prova.",
    });
  }
});

// 8. Entrega Segura de Asset de Recorte da Questão: GET /api/exams/assets/:assetId
app.get("/api/exams/assets/:assetId", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { assetId } = req.params;

    const asset = examServiceInstance.getAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ error: "ASSET_NOT_FOUND", message: "Asset de imagem não encontrado." });
    }

    const question = examQuestionRepoInstance.findById(asset.questionId);
    if (!question) {
      return res.status(404).json({ error: "QUESTION_NOT_FOUND", message: "Questão vinculada não encontrada." });
    }

    const paper = examPaperRepoInstance.findById(question.examId);
    if (paper && paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso não autorizado a este recorte." });
    }

    if (!fs.existsSync(asset.filePath)) {
      return res.status(404).json({ error: "FILE_MISSING", message: "Arquivo físico de imagem ausente no disco." });
    }

    res.setHeader('Content-Type', `image/${asset.format || 'webp'}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(path.resolve(asset.filePath));
  } catch (err: any) {
    logInternalError("Asset Serve Error", err);
    return res.status(500).json({ error: "ASSET_SERVE_ERROR", message: "Falha ao carregar imagem da questão." });
  }
});

// 9. Entrega de Imagem de Recorte Sanitizada por Nome: GET /api/exams/assets/file/:filename
app.get("/api/exams/assets/file/:filename", requireUserAuth, (req: Request, res: Response) => {
  try {
    const safeName = path.basename(req.params.filename);
    if (!safeName || safeName.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      return res.status(400).json({ error: "INVALID_FILENAME", message: "Nome de arquivo inválido." });
    }

    const user = (req as any).user;
    const matchingAssets = questionAssetRepoInstance.findByFilename(safeName);
    if (matchingAssets.length === 0) {
      return res.status(404).json({ error: "IMAGE_NOT_FOUND", message: "Imagem nao encontrada no banco de provas." });
    }
    const hasAccess = matchingAssets.some((asset) => {
      const question = examQuestionRepoInstance.findById(asset.questionId);
      const paper = question ? examPaperRepoInstance.findById(question.examId) : null;
      return Boolean(paper && (paper.userId === user.userId || user.role === 'admin'));
    });
    if (!hasAccess) {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso nao autorizado a este recorte." });
    }

    // Busca nas pastas permitidas
    const allowedDirs = [
      path.resolve(process.cwd(), 'data', 'exam_crops'),
      path.resolve(process.cwd(), 'data', 'test_fixtures', 'crops'),
    ];

    let foundPath: string | null = null;
    for (const baseDir of allowedDirs) {
      if (!fs.existsSync(baseDir)) continue;
      // Procura recursivamente ou direto
      const candidate = path.join(baseDir, safeName);
      if (fs.existsSync(candidate)) {
        foundPath = candidate;
        break;
      }
      // Subdiretórios
      const subdirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const sub of subdirs) {
        const subCand = path.join(baseDir, sub.name, safeName);
        if (fs.existsSync(subCand)) {
          foundPath = subCand;
          break;
        }
      }
      if (foundPath) break;
    }

    if (!foundPath) {
      return res.status(404).json({ error: "IMAGE_NOT_FOUND", message: "Imagem não encontrada no servidor." });
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.sendFile(foundPath);
  } catch (err: any) {
    return res.status(500).json({ error: "IMAGE_SERVE_ERROR", message: "Falha ao servir arquivo de imagem." });
  }
});

// 10. Visualização de Página Inteira da Prova (para Editor Visual): GET /api/exams/:id/pages/:pageNumber/preview
app.get("/api/exams/:id/pages/:pageNumber/preview", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const examId = req.params.id;
    const pageNum = parseInt(req.params.pageNumber, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: "INVALID_PAGE", message: "Número de página inválido." });
    }

    const paper = examPaperRepoInstance.findById(examId);
    if (!paper) {
      return res.status(404).json({ error: "EXAM_NOT_FOUND", message: "Prova não encontrada." });
    }

    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso não autorizado a esta prova." });
    }

    const renderResult = await examServiceInstance.renderFullPageForReview(examId, pageNum);
    if (!renderResult.success) {
      return res.status(500).json({ error: "PAGE_RENDER_FAILED", message: renderResult.error || "Falha ao renderizar página do PDF." });
    }

    return res.json({
      success: true,
      page: pageNum,
      widthPx: renderResult.width,
      heightPx: renderResult.height,
      pageWidthPt: renderResult.pageWidthPt,
      pageHeightPt: renderResult.pageHeightPt,
      previewUrl: `/api/exams/${examId}/pages/${pageNum}/preview/image`,
    });
  } catch (err: any) {
    logInternalError("Page Preview Error", err);
    return res.status(500).json({ error: "RENDER_ERROR", message: "Falha ao gerar visualização da página." });
  }
});

app.get("/api/exams/:id/pages/:pageNumber/preview/image", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const pageNum = Number(req.params.pageNumber);
    const paper = examPaperRepoInstance.findById(req.params.id);
    if (!paper) return res.status(404).json({ error: "EXAM_NOT_FOUND" });
    if (paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED" });
    }
    if (!Number.isInteger(pageNum) || pageNum < 1) {
      return res.status(400).json({ error: "INVALID_PAGE" });
    }
    const renderResult = await examServiceInstance.renderFullPageForReview(req.params.id, pageNum);
    if (!renderResult.success || !renderResult.imagePath || !fs.existsSync(renderResult.imagePath)) {
      return res.status(404).json({ error: "PAGE_PREVIEW_NOT_FOUND" });
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(path.resolve(renderResult.imagePath));
  } catch {
    return res.status(500).json({ error: "PAGE_PREVIEW_FAILED" });
  }
});

// 11. Dados de Revisão da Questão (Segmentos + Assets + Auditoria): GET /api/exams/questions/:questionId/review
app.get("/api/exams/questions/:questionId/review", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { questionId } = req.params;

    const data = examServiceInstance.getQuestionReviewData(questionId);
    if (!data) {
      return res.status(404).json({ error: "QUESTION_NOT_FOUND", message: "Questão não encontrada." });
    }

    const paper = examPaperRepoInstance.findById(data.question.examId);
    if (paper && paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso não autorizado a esta questão." });
    }

    return res.json({
      success: true,
      question: data.question,
      segments: data.segments,
      assets: data.assets,
      auditLogs: data.auditLogs,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "REVIEW_DATA_ERROR", message: "Falha ao carregar dados de revisão." });
  }
});

// 12. Recorte Manual / Snapping de Bounding Box: PUT /api/exams/questions/:questionId/crop
app.put("/api/exams/questions/:questionId/crop", requireUserAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { questionId } = req.params;
    const { segmentId, page, x, y, width, height } = req.body || {};

    const qNum = Number(page);
    const qX = Number(x);
    const qY = Number(y);
    const qW = Number(width);
    const qH = Number(height);

    if (isNaN(qNum) || qNum < 1 || isNaN(qX) || qX < 0 || isNaN(qY) || qY < 0 || isNaN(qW) || qW <= 0 || isNaN(qH) || qH <= 0) {
      return res.status(400).json({
        error: "INVALID_GEOMETRY",
        message: "Coordenadas e dimensões de recorte inválidas. Devem ser números estritamente positivos.",
      });
    }

    const question = examQuestionRepoInstance.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: "QUESTION_NOT_FOUND", message: "Questão não encontrada." });
    }

    const paper = examPaperRepoInstance.findById(question.examId);
    if (paper && paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso negado para modificar o recorte." });
    }

    const result = await examServiceInstance.cropQuestionSegment({
      questionId,
      segmentId: typeof segmentId === 'string' ? segmentId : undefined,
      page: qNum,
      x: qX,
      y: qY,
      width: qW,
      height: qH,
      userId: user.userId,
    });

    logSecurityEvent(req, {
      action: 'QUESTION_MANUAL_CROP_SAVED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'question_segments',
      status: 'SUCCESS',
      targetType: 'question_segment',
      targetId: result.segment.id,
      details: { questionId, bbox: { x: qX, y: qY, width: qW, height: qH } },
    });

    return res.json({
      success: true,
      message: "Recorte manual aplicado com sucesso.",
      segment: result.segment,
      asset: result.asset,
    });
  } catch (err: any) {
    logInternalError("Manual Crop Error", err);
    return res.status(500).json({
      error: "CROP_FAILED",
      message: "Falha ao aplicar recorte manual.",
    });
  }
});

// 13. Exclusão de Segmento Específico: DELETE /api/exams/segments/:segmentId
app.delete("/api/exams/segments/:segmentId", requireUserAuth, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { segmentId } = req.params;

    const segment = questionSegmentRepoInstance.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ error: "SEGMENT_NOT_FOUND", message: "Segmento não encontrado." });
    }

    const paper = examPaperRepoInstance.findById(segment.examId);
    if (paper && paper.userId !== user.userId && user.role !== 'admin') {
      return res.status(403).json({ error: "ACCESS_DENIED", message: "Acesso não autorizado para excluir este segmento." });
    }

    examServiceInstance.deleteSegment(segmentId);

    logSecurityEvent(req, {
      action: 'QUESTION_SEGMENT_DELETED',
      actor: user.username || user.userId,
      actorUserId: user.userId,
      resource: 'question_segments',
      status: 'SUCCESS',
      targetType: 'question_segment',
      targetId: segmentId,
    });

    return res.json({ success: true, message: "Segmento removido com sucesso." });
  } catch (err: any) {
    return res.status(500).json({ error: "DELETE_SEGMENT_FAILED", message: "Falha ao remover segmento." });
  }
});

// 🛑 Camada de Decepção Defensiva (Honeypot, Canários e Rotas Decoy)
app.use(honeypotRouter);

// 🛑 Fallback 404 Seguro para rotas /api inexistentes (evita vazamento de stacktrace ou shell HTML)
app.all(["/api", "/api/*"], (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(404).json({ error: "Not Found" });
});

// Middleware Centralizado de Tratamento de Erros (Evita vazamento de stacktrace)
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logInternalError("Unhandled Server Exception", err);
  return res.status(err?.status || 500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Ocorreu uma falha no processamento. Tente novamente.",
    requestId: (req as any).requestId,
  });
});

async function startServer() {
  // Inicializa e assegura contas no banco de dados
  await authServiceInstance.ensureDefaultAccounts();

  // Migra dados legados de flashcards para o motor oficial Anki se existirem
  try {
    AnkiRepository.migrateLegacyData(getDb().getRawDb());
  } catch (ankiMigrateErr) {
    console.warn('[Anki] Migração de dados legados:', ankiMigrateErr);
  }

  // Inicializa o agendador automático diário de backup às 03:00 com retenção de 30 dias
  initBackupScheduler();
  examJobWorker.start();

  if (process.env.NODE_ENV !== "production") {
    app.use((req, res, next) => {
      const blocked = ['/package.json', '/package-lock.json', '/bun.lock', '/.env', '/.env.example'];
      if (blocked.some((path) => req.path === path || req.path.startsWith(`${path}.`))) {
        return res.sendStatus(404);
      }
      return next();
    });
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '127.0.0.1',
        fs: { strict: true },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist", "public");
    app.use(express.static(distPath, {
      maxAge: '30d',
      setHeaders: (res: Response, filePath: string) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (normalized.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (normalized.endsWith('llms.txt')) {
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (normalized.endsWith('robots.txt')) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (normalized.endsWith('sitemap.xml')) {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=86400');
        } else if (/\.(webp|jpg|jpeg|png|gif|svg|ico|woff2|woff)$/i.test(normalized)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }));
    app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
    app.get(['/server.cjs', '/server.cjs.map'], (_req, res) => res.sendStatus(404));
    app.get("*", (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const listenHost = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
  const server = app.listen(PORT, listenHost, () => {
    console.log(`Server running on http://${listenHost}:${PORT}`);
  });
  // Timeouts anti-Slowloris:
  // headersTimeout < requestTimeout: mata conexões que enviam headers lentamente.
  // requestTimeout: tempo máximo total de uma request (suficiente para uploads legítimos).
  server.requestTimeout = 30_000;   // 30s — reduzido de 60s para limitar Slowloris tardio
  server.headersTimeout = 10_000;   // 10s — reduzido de 15s; mata Slowloris na fase de headers
  server.keepAliveTimeout = 5_000;  // 5s — conexões idle fecham rápido
  server.maxHeadersCount = 100;     // Limite de headers por request

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[Shutdown] Recebido ${signal}; encerrando componentes com segurança.`);
    examJobWorker.stop();
    stopBackupScheduler();
    adminRealtimeHub.destroy();
    server.close(() => {
      try { getDb().close(); } catch (error) { logInternalError('Database shutdown', error); }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

const isTestEnv = process.env.NODE_ENV === "test";
if (!isTestEnv) {
  startServer();
}

export { app };
