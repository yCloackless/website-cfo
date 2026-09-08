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

dotenv.config();

// ============================================================================
// 🛑 VALIDAÇÃO DE SEGURANÇA E SECRETS NO STARTUP
// ============================================================================
const recommendedVars: string[] = [];
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) recommendedVars.push('ADMIN_PASSWORD');
if (!process.env.CADET_PASSWORD_HASH && !process.env.CADET_PASSWORD) recommendedVars.push('CADET_PASSWORD');
if (!process.env.TOTP_SECRET) recommendedVars.push('TOTP_SECRET');
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
} from "./src/db/repositories";
import { UserRole, DbUser, DbExamPaper } from "./src/db/schema";
import { validateImageBuffer, saveUserAvatar } from "./src/services/avatarService";
import { secureUploadService, SecureUploadService } from "./src/services/secureUploadService";
import { ExamService } from "./src/services/examService";
import { adminRealtimeHub, AdminRealtimeEventType } from "./src/services/realtimeHub";
import { createAuthMiddlewares } from "./src/middleware/auth";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 1. Proxy reverso: suporte automático para Render e produção (1 hop confiável) ou TRUSTED_PROXIES
const isProxyEnvironment = Boolean(process.env.RENDER || process.env.RENDER_EXTERNAL_URL || process.env.RENDER_SERVICE_ID || process.env.NODE_ENV === 'production');
const trustedProxyEntries = (process.env.TRUSTED_PROXIES || '')
  .split(',').map(value => value.trim()).filter(value => value && value !== '*' && value !== 'true');
app.set("trust proxy", trustedProxyEntries.length > 0 ? trustedProxyEntries : (isProxyEnvironment ? 1 : false));

// 2. Rota de Health Check ultraleve para UptimeRobot / anti-sleep do Render
app.get("/api/health", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "healthy",
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now(),
    service: "cfo-cbmerj-backend",
  });
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
  if (
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
    clean.startsWith("172.31.")
  ) {
    return true;
  }

  const trustedEnv = process.env.ADMIN_TRUSTED_IPS || "";
  const trustedList = trustedEnv
    .split(",")
    .map((s) => s.trim().replace(/^::ffff:/, ""))
    .filter(Boolean);

  return trustedList.includes(clean);
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

  // 3. Consulta externa a serviço GeoIP com timeout rápido
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,region,regionName`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = (await resp.json()) as any;
      if (data.status === "success") {
        const country = (data.countryCode || "").toUpperCase();
        const region = (data.region || "").toUpperCase();
        const regionName = (data.regionName || "").toUpperCase();
        const isRJ = country === "BR" && (region === "RJ" || regionName.includes("RIO DE JANEIRO"));

        const result = { country, region, isRJ, timestamp: Date.now() };
        geoCache.set(ip, result);
        return result;
      }
    }
  } catch (e) {
    console.warn(`[GeoIP] Falha na consulta GeoIP para o IP ${ip}:`, e);
  }

  return { country: "UNKNOWN", region: "UNKNOWN", isRJ: false };
}

// Verificação do Token do Cloudflare Turnstile
async function verifyTurnstileToken(token?: string, remoteip?: string): Promise<boolean> {
  const secretKey =
    process.env.TURNSTILE_SECRET_KEY || "";
  if (!secretKey) return false;
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
      return Boolean(result.success);
    }
  } catch (err) {
    console.error("[Turnstile] Erro ao validar token com Cloudflare:", err);
  }
  return false;
}

// 🛑 MIDDLEWARE GLOBAL DE BLOQUEIO DE IPs BANIDOS
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/health") return next();

  const clientIp = getClientIp(req);

  if (isIpBanned(clientIp)) {
    return res.status(403).json({
      error: "IP_BANNED",
      message: "403 FORBIDDEN: Seu endereço IP está restrito por medidas de segurança.",
    });
  }

  next();
});

// 3. Compressão Gzip/Brotli de payloads e assets estáticos
app.use(compression());

// 4. Segurança de Borda e Cabeçalhos com Helmet (Defesa em Profundidade)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://challenges.cloudflare.com",
          "https://accounts.google.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        frameSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
          "https://accounts.google.com",
        ],
        connectSrc: [
          "'self'",
          "https://challenges.cloudflare.com",
          "https://*.googleapis.com",
          "https://generativelanguage.googleapis.com",
          "https://*.google.com",
          "http://ip-api.com",
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// 5. Configuração Estrita de CORS
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const allowedOriginsList = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  APP_URL,
  process.env.RENDER_EXTERNAL_URL,
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

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests sem origin (server-to-server, curl, mobile nativo) — permitir
      if (!origin) return callback(null, true);

      const normalized = extractOrigin(origin);
      if (normalized && normalizedAllowedOrigins.has(normalized)) {
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
    credentials: true,
  })
);

// 6. Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 350,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Muitas requisições. Tente novamente em alguns minutos." },
});
app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: (req) => isAdminIp(getClientIp(req)) || process.env.NODE_ENV === 'development',
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_LOGIN_ATTEMPTS", message: "Muitas tentativas de autenticação. Acesso bloqueado por 15 minutos." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_2FA_ATTEMPTS", message: "Muitas tentativas de 2FA. Acesso bloqueado por 15 minutos." },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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

app.use(express.json({ limit: "20mb" }));
app.use('/avatars', express.static(path.join(process.cwd(), 'data', 'avatars'), { dotfiles: 'deny', index: false }));

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

function readCalendarSession(): CalendarSession | null {
  try {
    if (fs.existsSync(CALENDAR_SESSION_FILE)) {
      const raw = fs.readFileSync(CALENDAR_SESSION_FILE, "utf-8");
      return JSON.parse(raw) as CalendarSession;
    }
  } catch (err) {
    console.warn("Falha ao ler sessão do Google Agenda:", err);
  }

  // Resiliência de Nuvem: Fallback em variável de ambiente (evita perda se o disco reiniciar no Render)
  const envRefreshToken = process.env.CALENDAR_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (envRefreshToken) {
    return {
      access_token: "",
      refresh_token: envRefreshToken,
      email: process.env.CALENDAR_EMAIL || undefined,
      updatedAt: new Date().toISOString(),
    };
  }

  return null;
}

function saveCalendarSession(session: CalendarSession): void {
  try {
    const dir = path.dirname(CALENDAR_SESSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CALENDAR_SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
    if (session.refresh_token) {
      console.log(`[Google Agenda Resiliente] Sessão sincronizada. Token preservado para persistência perpétua.`);
    }
  } catch (err) {
    console.error("Falha ao gravar sessão do Google Agenda:", err);
  }
}

function clearCalendarSession(): void {
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
      const parsed = JSON.parse(raw);
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
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SECURITY_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
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
  return { token: created.rawToken, expiresAt: Date.parse(created.session.expiresAt), role: user.role, canAccessNotion: user.role === 'admin' || user.canAccessNotion };
}

const authServiceInstance = new AuthService(getDb());
const auditRepoInstance = new AuditRepository(getDb().getRawDb());
const userRepoInstance = new UserRepository(getDb().getRawDb());
const profileRepoInstance = new ProfileRepository(getDb().getRawDb());
const userStateRepoInstance = new UserStateRepository(getDb().getRawDb());
const sessionRepoInstance = new SessionRepository(getDb().getRawDb());
const recoveryCodeRepoInstance = new RecoveryCodeRepository(getDb().getRawDb());
const uploadedFileRepoInstance = new UploadedFileRepository(getDb().getRawDb());
const examPaperRepoInstance = new ExamPaperRepository(getDb().getRawDb());
const examQuestionRepoInstance = new ExamQuestionRepository(getDb().getRawDb());
const examJobRepoInstance = new ExamJobRepository(getDb().getRawDb());
const questionSegmentRepoInstance = new QuestionSegmentRepository(getDb().getRawDb());
const questionAssetRepoInstance = new QuestionAssetRepository(getDb().getRawDb());
const supportMaterialRepoInstance = new SupportMaterialRepository(getDb().getRawDb());
const questionAuditRepoInstance = new QuestionAuditRepository(getDb().getRawDb());

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
  expiresAt?: number;
  userId?: string;
  sessionId?: string;
  impersonatedByUserId?: string | null;
  parentSessionId?: string | null;
} {
  if (!token || typeof token !== "string") return { valid: false };

  // 1. Verificação primária na nova base de sessões do banco de dados
  const dbCheck = authServiceInstance.validateToken(token);
  if (dbCheck.valid && dbCheck.user && dbCheck.session) {
    const role = dbCheck.user.role;
    const canAccessNotion = role === "admin" || dbCheck.user.canAccessNotion;
    const expiresAt = new Date(dbCheck.session.expiresAt).getTime();
    return {
      valid: true,
      username: dbCheck.user.username,
      role,
      canAccessNotion,
      expiresAt,
      userId: dbCheck.user.id,
      sessionId: dbCheck.session.id,
      impersonatedByUserId: dbCheck.session.impersonatedByUserId || null,
      parentSessionId: dbCheck.session.parentSessionId || null,
    };
  }

  return { valid: false };
}

// ==========================================
// 🛡️ STEP-UP AUTHENTICATION (Tokens Assinados de Curta Duração - 5 Minutos)
// ==========================================
const { requireAdminAuth, requireAdminWriteAuth, requireUserAuth } = createAuthMiddlewares(verifyTerminalSession);

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

function requireStepUpAuth(req: Request, res: Response, next: NextFunction) {
  const stepUpHeader = req.headers["x-admin-step-up-token"] || req.headers["x-step-up-token"];
  const token = typeof stepUpHeader === "string" ? stepUpHeader.trim() : null;

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
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
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

interface TimerState {
  status: "STOPPED" | "RUNNING" | "PAUSED";
  accumulatedTime: number; // milissegundos acumulados
  startTime: number | null; // timestamp de início da última contagem
  activeSubjectId?: string;
  activeSubjectName?: string;
  updatedAt: string;
}

app.use('/api/timer', requireUserAuth);
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
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("Falha ao ler timer-state.json:", e);
  }
  return {
    status: "STOPPED",
    accumulatedTime: 0,
    startTime: null,
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

  if (state.status === "RUNNING" && state.startTime) {
    totalElapsedMs += Math.max(0, now - state.startTime);
  }

  return res.json({
    ...state,
    totalElapsedMs,
    serverTime: now,
  });
});

// 2. Iniciar Cronômetro
app.post("/api/timer/start", (req: Request, res: Response) => {
  const { subjectId, subjectName } = req.body || {};
  const state = readTimerState((req as any).user.userId);
  const now = Date.now();

  if (state.status !== "RUNNING") {
    state.status = "RUNNING";
    state.startTime = now;
  }
  if (subjectId) state.activeSubjectId = subjectId;
  if (subjectName) state.activeSubjectName = subjectName;
  state.updatedAt = new Date().toISOString();

  saveTimerState((req as any).user.userId, state);

  const totalElapsedMs = state.accumulatedTime + (state.startTime ? Math.max(0, now - state.startTime) : 0);
  return res.json({
    success: true,
    ...state,
    totalElapsedMs,
    serverTime: now,
  });
});

// 3. Pausar Cronômetro
app.post("/api/timer/pause", (req: Request, res: Response) => {
  const state = readTimerState((req as any).user.userId);
  const now = Date.now();

  if (state.status === "RUNNING" && state.startTime) {
    const delta = Math.max(0, now - state.startTime);
    state.accumulatedTime += delta;
    state.startTime = null;
    state.status = "PAUSED";
    state.updatedAt = new Date().toISOString();
    saveTimerState((req as any).user.userId, state);
  }

  return res.json({
    success: true,
    ...state,
    totalElapsedMs: state.accumulatedTime,
    serverTime: now,
  });
});

// 4. Resetar Cronômetro
app.post("/api/timer/reset", (req: Request, res: Response) => {
  const state: TimerState = {
    status: "STOPPED",
    accumulatedTime: 0,
    startTime: null,
    updatedAt: new Date().toISOString(),
  };
  saveTimerState((req as any).user.userId, state);
  return res.json({
    success: true,
    ...state,
    totalElapsedMs: 0,
    serverTime: Date.now(),
  });
});

// ============================================================================
// 🛡️ AUTENTICAÇÃO E SECURITY GATE (Dragão Carmesim - 2FA TOTP)
// ============================================================================

// 2.7. Rota de Status de Segurança do Cliente (Turnstile check - sem revelar lógica interna)
app.get("/api/auth/security-status", (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const isAdm = isAdminIp(clientIp);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEq86txU4BLgFVmp";

  return res.json({
    // Não expor clientIp nem isAdminIp — revelaria lógica interna de bypass
    turnstileRequired: !isAdm,
    siteKey,
  });
});

// 2.8. Rota de Verificação Prévia de Credenciais (Passo 1 do Login)
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

    // 1. Verificação Cloudflare Turnstile (Bypass automático para o IP do Admin)
    if (!isAdmIp) {
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
      return res.json({
        success: true,
        directLogin: true,
        token: loginResult.token,
        expiresAt: loginResult.expiresAt ? Date.parse(loginResult.expiresAt) : undefined,
        username: dbUser.username,
        role: dbUser.role,
        canAccessNotion: dbUser.canAccessNotion,
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
      });
    }

    const session = createTerminalSession(dbUser.username, req.body.rememberMe !== false, dbUser.role);
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
    });
  } catch (err: any) {
    console.error('[Auth]', err);
    return res.status(500).json({ success: false, error: "INTERNAL_SERVER_ERROR", message: "Falha interna no servidor." });
  }
});

// 3. Rota de Validação de Código Authenticator / Recovery Code (com twoFactorLimiter anti-força bruta)
app.post("/api/auth/verify-2fa", twoFactorLimiter, async (req: Request, res: Response) => {
  try {
    const { username, email, password, token, recoveryCode, rememberMe, turnstileToken } = req.body || {};
    const inputUser = (username || email || "").trim().toLowerCase();
    const clientIp = getClientIp(req);
    const isAdmIp = isAdminIp(clientIp);

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

    const dbUser = await authServiceInstance.verifyCredentials(inputUser, password);
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
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.sessionToken;
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
  const authHeader = req.headers.authorization;
  const token =
    req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  const result = verifyTerminalSession(token);
  if (!result.valid) {
    return res.status(401).json({ valid: false, message: "Sessão expirada ou terminal bloqueado." });
  }

  const config = getSecurityConfig();

  return res.json({
    valid: true,
    username: result.username,
    role: result.role,
    canAccessNotion: result.canAccessNotion,
    expiresAt: result.expiresAt,
    sessionId: result.sessionId,
    isImpersonation: Boolean(result.impersonatedByUserId),
    impersonatedByUserId: result.impersonatedByUserId || null,
    is2faActive: config.is2faActive,
  });
});

// 6. Rota de Logout (Revogação Segura de Sessão)
app.post("/api/admin/impersonation/start", requireAdminWriteAuth, (req: Request, res: Response) => {
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
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token) sessionRepoInstance.revokeSession(token);
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
    return res.json({ success: true, adminUserId: session.impersonatedByUserId });
  } catch (err: any) {
    console.error('[Impersonation Stop Error]:', err);
    return res.status(500).json({ success: false, message: 'Erro ao voltar para a conta ADM.' });
  }
});

app.post("/api/auth/logout", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
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
app.get("/api/admin/security/events", requireAdminAuth, (req: Request, res: Response) => {
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

    return res.json({
      success: true,
      ...result,
      logs: result.items,
    });
  } catch (err: any) {
    console.error("[Admin Security Events Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao buscar eventos de segurança." });
  }
});

// 12. Métricas de Segurança e Detecção de Anomalias em Tempo Real (Restrito a Admin)
app.get("/api/admin/security/metrics", requireAdminAuth, (_req: Request, res: Response) => {
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
app.get("/api/admin/realtime/stream", requireAdminAuth, (req: Request, res: Response) => {
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
    const activeSessions = sessionRepoInstance.listActiveSessions(10);
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
      anomalies: securityMetrics.anomalousIps,
      recentSessions: activeSessions,
      recentEvents: recentEvents.items,
    });
  } catch (err: any) {
    console.error("[Admin Dashboard Error]:", err);
    return res.status(500).json({ success: false, message: "Erro ao carregar dados do dashboard." });
  }
});

// 15. Consulta Paginada e Filtrada de Usuários (Admin)
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
    const activeSessions = sessionRepoInstance.listActiveSessionsByUserId(targetUser.id);
    const securityEvents = auditRepoInstance.findEventsByUserId(targetUser.id, 25);

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
    const { email, username, password, role = 'cadet', fullName, phone, canAccessNotion = false } = req.body || {};
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
      newState: { role: createdUser.role, canAccessNotion: createdUser.canAccessNotion },
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
      details: { targetUsername: targetUser.username, targetEmail: targetUser.email },
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
app.post("/api/admin/cadet-lock/reset", requireAdminWriteAuth, async (req: Request, res: Response) => {
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
app.post("/api/admin/temporary-block/reset", requireAdminWriteAuth, async (req: Request, res: Response) => {
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
    const sessions = sessionRepoInstance.listActiveSessions(limit);
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

    // Grava imagem com nome seguro e incriptografado
    const avatarUrl = saveUserAvatar(user.id, buffer, validation.extension);
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
app.use("/api/calendar", requireAdminWriteAuth);
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

    return res.json({
      connected: isConnected,
      permanent: !!session.refresh_token,
      email: session.email || null,
      name: session.name || null,
      hasRefreshToken: !!session.refresh_token,
      needsClientSecret: !GOOGLE_CLIENT_SECRET,
      clientIdConfigured: !!GOOGLE_CLIENT_ID,
      updatedAt: session.updatedAt,
    });
  } catch (error: any) {
    console.error('[Calendar status]', error);
    return res.status(500).json({ connected: false, error: "INTERNAL_SERVER_ERROR" });
  }
});

const calendarOAuthStates = new Map<string, { origin: string; token: string; expiresAt: number }>();
const calendarRedirectUri = process.env.REDIRECT_URI || new URL('/api/auth/google/callback', APP_URL).href;
app.get('/api/calendar/auth-url', (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'MISSING_CLIENT_ID' });
  const origin = extractOrigin(String(req.query.origin || APP_URL));
  if (!origin || !normalizedAllowedOrigins.has(origin)) return res.status(403).json({ error: 'INVALID_ORIGIN' });
  for (const [key, value] of calendarOAuthStates) if (value.expiresAt < Date.now()) calendarOAuthStates.delete(key);
  const state = crypto.randomBytes(32).toString('hex');
  const sessionToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
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
    return res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Google Agenda conectado</title></head><body><h1>Google Agenda conectado</h1><p>Você pode fechar esta janela.</p><script id="oauth-payload" type="application/json">${safeJson}</script><script>
      (function() {
        try {
          var el = document.getElementById('oauth-payload');
          if (!el) return;
          var data = JSON.parse(el.textContent || '{}');
          localStorage.setItem('cfo_calendar_status', JSON.stringify(data));
          localStorage.setItem('cfo_calendar_auth_success', JSON.stringify(data));
          if (window.opener && data.targetOrigin) {
            window.opener.postMessage(data, data.targetOrigin);
          }
          if (typeof BroadcastChannel !== 'undefined') {
            var channel = new BroadcastChannel('cfo_google_calendar_auth');
            channel.postMessage(data);
            channel.close();
          }
        } catch (_) {}
        setTimeout(function() { window.close(); }, 250);
      })();
    </script></body></html>`);
  } catch { return res.status(502).send('Falha ao conectar com o Google Calendar.'); }
});

// 4. Save client token on backend (backup store com whitelist)
app.post("/api/calendar/save-token", async (req: Request, res: Response) => {
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
app.post("/api/calendar/disconnect", (_req: Request, res: Response) => {
  clearCalendarSession();
  return res.json({ success: true, message: "Desconectado do Google Agenda com sucesso." });
});

// 6. Verify Google Calendar Token endpoint (compatibilidade legada)
app.post("/api/calendar/verify-token", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["x-google-access-token"] ? "Bearer " + req.headers["x-google-access-token"] : undefined;
    const clientToken =
      req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    const token = await getValidCalendarAccessToken(clientToken);

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
app.post("/api/calendar/create-event", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["x-google-access-token"] ? "Bearer " + req.headers["x-google-access-token"] : undefined;
    const clientToken =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.token;

    let token = await getValidCalendarAccessToken(clientToken);

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
    return res.status(error?.status || 500).json({
      error: "CALENDAR_SYNC_FAILED",
      message: error?.status === 401 ? "A autorização do Google Agenda expirou." : "Falha ao criar evento na Google Agenda",
    });
  }
});

// 8. Batch Sync Study Session & Spaced Revisions endpoint (com auto-refresh de token)
app.post("/api/calendar/batch-sync", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["x-google-access-token"] ? "Bearer " + req.headers["x-google-access-token"] : undefined;
    const clientToken =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.token;

    let token = await getValidCalendarAccessToken(clientToken);

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
    return res.status(error?.status || 500).json({
      error: "CALENDAR_SYNC_FAILED",
      message: error?.status === 401 ? "A autorização do Google Agenda expirou." : "Falha ao sincronizar eventos com Google Agenda",
    });
  }
});

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
app.post("/api/ai/study-analysis", async (req: Request, res: Response) => {
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
app.post("/api/ai/bizu-notes", async (req: Request, res: Response) => {
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

IMPORTANTE SOBRE NOTAÇÃO MATEMÁTICA / FÍSICA:
SEMPRE utilize notação LaTeX com delimitadores $...$ (em linha) ou $$...$$ (em bloco) para quaisquer fórmulas matemáticas, físicas, químicas ou de escalas (ex: $E = \\frac{d}{D}$, $Q = m \\cdot c \\cdot \\Delta T$, $v^2 = v_0^2 + 2a\\Delta s$, etc.).

INSTRUÇÃO CRÍTICA DE SEPARAÇÃO EM TÓPICOS NO CAMPO "notes":
O texto do campo "notes" NÃO PODE DE FORMA ALGUMA FICAR AMONTOADO EM UM PARÁGRAFO CORRIDO.
DEVE FICAR RIGOROSAMENTE SEPARADO EM TÓPICOS COM UMA LINHA EM BRANCO (duplo \\n\\n) ENTRE CADA UM DELES, exatamente neste formato:

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
2. "refinedTitle": Título elegante, profissional e direto para o Bizu (ex: "Física: Circuitos Elétricos, Leis de Ohm e Potência").
3. "category": Categoria ou eixo temático refinado (ex: "Eletrodinâmica & Circuitos", "Geopolítica & Cartografia", "Mecânica Clássica", etc.).
4. "notes": Texto com os tópicos OBRIGATORIAMENTE separados por linhas em branco conforme o modelo acima.
5. "keyPoints": Array com 4 a 6 tópicos estratégicos ultra-sintéticos (bullets diretos com fórmulas em $...$).
6. "tags": Array com 4 a 6 tags/palavras-chave estratégicas para filtragem no Bizuário.`;

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
app.post("/api/ai/flashcards", async (req: Request, res: Response) => {
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

    const geminiKey = process.env.GEMINI_API_KEY;
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
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-terminal-session"] as string);

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

    const userBackupDir = path.join(process.cwd(), "data", "user-backups");
    if (!fs.existsSync(userBackupDir)) {
      fs.mkdirSync(userBackupDir, { recursive: true });
    }

    const sanitizedUsername = String(user.username || "cadete").replace(/[^a-zA-Z0-9_-]/g, "_");
    const userBackupFile = path.join(userBackupDir, `${sanitizedUsername}.json`);

    const dataToSave = {
      username: user.username,
      role: user.role,
      savedAt: new Date().toISOString(),
      clientIp: getClientIp(req),
      snapshot,
    };

    fs.writeFileSync(userBackupFile, JSON.stringify(dataToSave, null, 2), "utf-8");

    logAuditEvent({
      action: "USER_BACKUP_SYNC",
      actor: user.username,
      resource: `/data/user-backups/${sanitizedUsername}.json`,
      status: "SUCCESS",
      ip: getClientIp(req),
      details: { sizeBytes: Buffer.byteLength(JSON.stringify(dataToSave)) },
    });

    return res.json({
      success: true,
      message: "Progresso tático sincronizado e salvo em backup seguro no servidor.",
      savedAt: dataToSave.savedAt,
    });
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
app.get("/api/admin/audit-logs", requireAdminAuth, (req: Request, res: Response) => {
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

    return res.json({
      success: true,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      logs: result.items,
      items: result.items,
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
    console.error("[Upload Processing Error]:", err?.stack || err?.message || err);
    return res.status(500).json({
      error: "UPLOAD_PROCESSING_FAILED",
      message: err?.message || "Falha interna ao processar o arquivo enviado.",
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
    console.error("[File Download Error]:", err?.message || err);
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

// 1. Upload Seguro de Prova e Registro Estruturado: POST /api/exams/upload-and-process
app.post("/api/exams/upload-and-process", requireUserAuth, uploadLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { title, institution, examYear, fileName, declaredMime, contentBase64, rawTextContent } = req.body || {};

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: "INVALID_TITLE", message: "O título da prova é obrigatório." });
    }

    const cleanTitle = title.trim();
    const cleanInstitution = (institution && typeof institution === 'string' ? institution.trim() : 'Banca Examinadora');
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

    // Extrai e cadastra a prova e suas questões
    const job = examJobRepoInstance.create({ userId: user.userId, jobType: 'EXTRACTION', status: 'processing', totalItems: 1 });

    if (req.body?.async === true) {
      void examServiceInstance.extractAndRegisterExam({
        userId: user.userId,
        fileId,
        title: cleanTitle,
        institution: cleanInstitution,
        examYear: parsedYear,
        rawTextContent: typeof rawTextContent === 'string' ? rawTextContent : undefined,
      }).then((result) => {
        examJobRepoInstance.updateStatus(job.id, 'completed', 1, { paperId: result.paper.id, questionsCount: result.questions.length });
        logSecurityEvent(req, { action: 'EXAM_PAPER_CREATED', actor: user.username || user.userId, actorUserId: user.userId, resource: 'exam_papers', status: 'SUCCESS', targetType: 'exam_paper', targetId: result.paper.id, details: { totalQuestions: result.paper.totalQuestions } });
      }).catch((err) => {
        console.error('[Background Exam Extraction Error]:', err?.message || err);
        examJobRepoInstance.updateStatus(job.id, 'failed', 0, undefined, err?.message || 'Falha ao processar a prova.');
      });

      return res.status(202).json({ success: true, processing: true, jobId: job.id, message: 'Prova recebida. A extração continuará em segundo plano.' });
    }

    const result = await examServiceInstance.extractAndRegisterExam({
      userId: user.userId,
      fileId,
      title: cleanTitle,
      institution: cleanInstitution,
      examYear: parsedYear,
      rawTextContent: typeof rawTextContent === 'string' ? rawTextContent : undefined,
    });

    examJobRepoInstance.updateStatus(job.id, 'completed', 1, { paperId: result.paper.id, questionsCount: result.questions.length });
    logSecurityEvent(req, { action: 'EXAM_PAPER_CREATED', actor: user.username || user.userId, actorUserId: user.userId, resource: 'exam_papers', status: 'SUCCESS', targetType: 'exam_paper', targetId: result.paper.id, details: { totalQuestions: result.paper.totalQuestions } });

    return res.status(201).json({
      success: true,
      paper: result.paper,
      questionsCount: result.questions.length,
      jobId: job.id,
      message: 'Prova cadastrada e processada com sucesso.',
    });

  } catch (err: any) {
    console.error("[Exam Upload & Process Error]:", err?.message || err);
    return res.status(500).json({
      error: "EXAM_PROCESSING_FAILED",
      message: err?.message || "Falha ao processar e extrair dados da prova.",
    });
  }
});

// 2. Listagem de Provas do Usuário com Filtros: GET /api/exams
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
        averageTimeMinutes: stats.totalPapers > 0 ? 2 : 0,
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
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      const existingJob = examJobRepoInstance.findByIdempotencyKey(idempotencyKey);
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
    console.error("[Solve With AI Error]:", err?.message || err);
    return res.status(400).json({
      error: "SOLVE_ERROR",
      message: err?.message || "Falha durante resolução das questões com IA.",
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
    console.error("[Asset Serve Error]:", err?.message || err);
    return res.status(500).json({ error: "ASSET_SERVE_ERROR", message: "Falha ao carregar imagem da questão." });
  }
});

// 9. Entrega de Imagem de Recorte Sanitizada por Nome: GET /api/exams/assets/file/:filename
app.get("/api/exams/assets/file/:filename", requireUserAuth, (req: Request, res: Response) => {
  try {
    const safeName = path.basename(req.params.filename);
    if (!safeName || safeName.includes('..')) {
      return res.status(400).json({ error: "INVALID_FILENAME", message: "Nome de arquivo inválido." });
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

    const baseName = path.basename(renderResult.imagePath || '');
    return res.json({
      success: true,
      page: pageNum,
      widthPx: renderResult.width,
      heightPx: renderResult.height,
      pageWidthPt: renderResult.pageWidthPt,
      pageHeightPt: renderResult.pageHeightPt,
      previewUrl: `/api/exams/assets/file/${baseName}`,
    });
  } catch (err: any) {
    console.error("[Page Preview Error]:", err?.message || err);
    return res.status(500).json({ error: "RENDER_ERROR", message: "Falha ao gerar visualização da página." });
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
    console.error("[Manual Crop Error]:", err?.message || err);
    return res.status(500).json({
      error: "CROP_FAILED",
      message: err?.message || "Falha ao aplicar recorte manual.",
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

// Middleware Centralizado de Tratamento de Erros (Evita vazamento de stacktrace)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Unhandled Server Exception]:", err?.message || err);
  return res.status(err?.status || 500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Ocorreu uma falha no processamento. Tente novamente.",
  });
});

async function startServer() {
  // Inicializa e assegura contas no banco de dados
  await authServiceInstance.ensureDefaultAccounts();

  // Inicializa o agendador automático diário de backup às 03:00 com retenção de 30 dias
  initBackupScheduler();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist", "public");
    app.use(express.static(distPath));
    app.use('/api', (_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
    app.get(['/server.cjs', '/server.cjs.map'], (_req, res) => res.sendStatus(404));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

const isTestEnv = process.env.NODE_ENV === "test";
if (!isTestEnv) {
  startServer();
}

export { app };
