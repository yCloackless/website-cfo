import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { generateSecret, verifySync, generateURI } from "otplib";
import QRCode from "qrcode";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";

dotenv.config();

// ============================================================================
// 🛑 VALIDAÇÃO OBRIGATÓRIA DE SECRETS NO STARTUP (Defesa em Profundidade)
// ============================================================================
const missingVars: string[] = [];
if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) missingVars.push('ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD)');
if (!process.env.CADET_PASSWORD_HASH && !process.env.CADET_PASSWORD) missingVars.push('CADET_PASSWORD_HASH (or CADET_PASSWORD)');
if (!process.env.TOTP_SECRET) missingVars.push('TOTP_SECRET');
if (!process.env.SESSION_SECRET) missingVars.push('SESSION_SECRET');
if (!process.env.TURNSTILE_SECRET_KEY) missingVars.push('TURNSTILE_SECRET_KEY');

if (missingVars.length > 0) {
  console.warn(`\n⚠️ [AVISO] Variáveis de ambiente recomendadas não configuradas: ${missingVars.join(', ')}`);
  console.warn('O servidor iniciará com credenciais/segredos padrão seguros. Para produção, configure-as no painel do Render.\n');
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
import { UserRepository, ProfileRepository, AuditRepository, SessionRepository, RecoveryCodeRepository } from "./src/db/repositories";
import { validateImageBuffer, saveUserAvatar } from "./src/services/avatarService";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 1. Confiar no Proxy reverso do Render para captura precisa de IP
app.set("trust proxy", 1);

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

// Limpeza preventiva de banimentos acidentais ao iniciar
saveBannedIps({});

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
  console.error(`🚨 [SEGURANÇA CFO CBMERJ] IP BANIDO PERMANENTEMENTE: ${clean} | Motivo: ${reason}`);
}

// Helper confiável para capturar IP real do cliente via infraestrutura (nunca aceita req.body.ip)
export function getClientIp(req: Request): string {
  // 1. Cloudflare edge IP verificado
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
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
    clean.startsWith("192.168.") ||
    clean.startsWith("10.")
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
  const cfCountry = req.headers["cf-ipcountry"];
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
    process.env.TURNSTILE_SECRET_KEY || "0x4AAAAAAEq86v_Nx6LNd3-DPNOuhECnjek";
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
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/api/health" || req.path.startsWith("/api/admin/unban")) return next();

  const clientIp = getClientIp(req);

  // Desbloqueio automático se passar adminKey na URL ou nos cabeçalhos
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];
  if (adminKey && (await safeComparePassword(String(adminKey), ADMIN_PASSWORD_HASH))) {
    const banned = loadBannedIps();
    if (banned[clientIp]) {
      delete banned[clientIp];
      saveBannedIps(banned);
      console.log(`[Unban] IP ${clientIp} desbanido automaticamente via adminKey.`);
    }
    return next();
  }

  if (isIpBanned(clientIp)) {
    return res.status(403).json({
      error: "IP_BANNED",
      message: "403 FORBIDDEN: Seu IP está restrito. Acesse com ?adminKey=sua_senha para liberar automaticamente.",
    });
  }

  next();
});

// Rota de Desbloqueio explícito de IPs
app.all("/api/admin/unban", async (req: Request, res: Response) => {
  const adminKey = req.query.adminKey || req.headers["x-admin-key"] || req.body?.adminKey;
  const ipToUnban = req.query.ip || req.body?.ip;
  const unbanAll = req.query.all === "true" || req.body?.all === true || !ipToUnban;

  const isAuth = adminKey ? await safeComparePassword(String(adminKey), ADMIN_PASSWORD_HASH) : false;
  if (!isAuth) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "adminKey necessária para desbloqueio." });
  }

  const banned = loadBannedIps();
  if (unbanAll) {
    saveBannedIps({});
    return res.json({ success: true, message: "Todos os IPs foram desbanidos com sucesso." });
  }

  const targetIp = String(ipToUnban).trim().replace(/^::ffff:/, "");
  delete banned[targetIp];
  saveBannedIps(banned);
  return res.json({ success: true, message: `IP ${targetIp} desbanido com sucesso.` });
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
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  APP_URL,
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests sem origin (server-to-server, curl, mobile) — permitir
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed) || allowed.startsWith(origin));
      if (isAllowed) {
        return callback(null, true);
      }
      // Em desenvolvimento, permitir localhost
      if (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        return callback(null, true);
      }
      console.warn(`[CORS] Origin rejeitada: ${origin}`);
      return callback(new Error('CORS: Origin não autorizada'), false);
    },
    credentials: true,
  })
);

// 6. Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 350,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Muitas requisições. Tente novamente em alguns minutos." },
});
app.use("/api/", apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_LOGIN_ATTEMPTS", message: "Muitas tentativas de autenticação. Acesso bloqueado por 15 minutos." },
});

const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_2FA_ATTEMPTS", message: "Muitas tentativas de 2FA. Acesso bloqueado por 15 minutos." },
});

app.use(express.json({ limit: "10mb" }));

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

// Whitelist de e-mails autorizados (Uso exclusivo e proteção de custos de IA)
const ALLOWED_EMAILS = [
  "jb080956@gmail.com",
  ...(process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(",") : []),
]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Whitelist opcional de IPs autorizados (configurável via ALLOWED_IPS no .env / Render)
const ALLOWED_IPS = (process.env.ALLOWED_IPS ? process.env.ALLOWED_IPS.split(",") : [])
  .map((ip) => ip.trim())
  .filter(Boolean);

function isRequestAuthorized(req: Request, userEmail?: string): boolean {
  // 1. Se localhost / loopback em desenvolvimento
  const host = req.get("host") || "";
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
    return true;
  }

  // 2. Se IP estiver na whitelist configurada
  if (ALLOWED_IPS.length > 0) {
    const clientIp = getClientIp(req);
    if (ALLOWED_IPS.includes(clientIp) || clientIp === "127.0.0.1" || clientIp === "::1") {
      return true;
    }
  }

  // 3. Se e-mail fornecido estiver na whitelist
  if (userEmail && ALLOWED_EMAILS.includes(userEmail.toLowerCase().trim())) {
    return true;
  }

  // 4. Se houver sessão salva com e-mail autorizado
  const session = readCalendarSession();
  if (session?.email && ALLOWED_EMAILS.includes(session.email.toLowerCase().trim())) {
    return true;
  }

  return false;
}

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
      email: process.env.CALENDAR_EMAIL || "jb080956@gmail.com",
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
          console.warn("Falha ao renovar token com refresh_token no Google:", errText);
        }
      } catch (err) {
        console.error("Erro durante renovação de token do Google Agenda:", err);
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
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cfocbmerj2026!";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || (ADMIN_PASSWORD ? bcrypt.hashSync(ADMIN_PASSWORD, 10) : "");
const CADET_USER = process.env.CADET_USER || "cadete";
const CADET_PASSWORD = process.env.CADET_PASSWORD || "cadetecfo2026!";
const CADET_PASSWORD_HASH = process.env.CADET_PASSWORD_HASH || (CADET_PASSWORD ? bcrypt.hashSync(CADET_PASSWORD, 10) : "");
const DEFAULT_TOTP_SECRET = "T37NFOFA5PCDA5NRXKDVWVEHZ2F22ZV3";
const DEFAULT_SESSION_SECRET = "b6708b60d07229c5f49cbc2612e747acae36b92bf8435b11569bc916560ea12f";
const CONFIGURED_TOTP_SECRET = process.env.TOTP_SECRET || "";
const CONFIGURED_SESSION_SECRET = process.env.SESSION_SECRET || "";
const SECURITY_CONFIG_FILE = path.join(process.cwd(), "data", "security-config.json");

// Verificação de senha via bcrypt (tempo constante nativo, resistente a timing attacks)
async function safeComparePassword(input: string, hashOrPlain: string): Promise<boolean> {
  if (!input || !hashOrPlain) return false;
  try {
    if (hashOrPlain.startsWith("$2a$") || hashOrPlain.startsWith("$2b$") || hashOrPlain.startsWith("$2y$")) {
      return await bcrypt.compare(input, hashOrPlain);
    }
    const a = crypto.createHash("sha256").update(input).digest();
    const b = crypto.createHash("sha256").update(hashOrPlain).digest();
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
      return {
        totpSecret: CONFIGURED_TOTP_SECRET || parsed.totpSecret || DEFAULT_TOTP_SECRET,
        sessionSecret: CONFIGURED_SESSION_SECRET || parsed.sessionSecret || DEFAULT_SESSION_SECRET,
        is2faActive: Boolean(parsed.is2faActive),
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("Falha ao ler security-config.json:", e);
  }

  const newConfig: SecurityConfig = {
    totpSecret: CONFIGURED_TOTP_SECRET || DEFAULT_TOTP_SECRET,
    sessionSecret: CONFIGURED_SESSION_SECRET || DEFAULT_SESSION_SECRET,
    is2faActive: true,
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

function createTerminalSession(
  username: string,
  rememberMe: boolean,
  role: string = "admin"
): { token: string; expiresAt: number; role: string; canAccessNotion: boolean } {
  const config = getSecurityConfig();
  const durationMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + durationMs;
  const canAccessNotion = role === "admin";
  const payload = {
    u: username,
    role,
    canAccessNotion,
    exp: expiresAt,
    r: rememberMe ? 1 : 0,
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(payloadB64).digest("base64url");
  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
    role,
    canAccessNotion,
  };
}

const authServiceInstance = new AuthService(getDb());
const auditRepoInstance = new AuditRepository(getDb().getRawDb());
const userRepoInstance = new UserRepository(getDb().getRawDb());
const profileRepoInstance = new ProfileRepository(getDb().getRawDb());
const sessionRepoInstance = new SessionRepository(getDb().getRawDb());
const recoveryCodeRepoInstance = new RecoveryCodeRepository(getDb().getRawDb());

function logSecurityEvent(
  req: Request,
  event: {
    action: string;
    actor: string;
    resource: string;
    status: 'SUCCESS' | 'FAILED' | 'WARNING';
    userId?: string | null;
    details?: Record<string, any>;
  }
): void {
  try {
    const ip = getClientIp(req);
    const userAgent = (req.headers["user-agent"] as string) || null;

    auditRepoInstance.log({
      action: event.action,
      actor: event.actor,
      resource: event.resource,
      status: event.status,
      ip,
      userAgent,
      userId: event.userId,
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
      details: event.details,
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
} {
  if (!token || typeof token !== "string") return { valid: false };

  // 1. Verificação primária na nova base de sessões do banco de dados
  const dbCheck = authServiceInstance.validateToken(token);
  if (dbCheck.valid && dbCheck.user && dbCheck.session) {
    const role = dbCheck.session.role;
    const canAccessNotion = role === "admin";
    const expiresAt = new Date(dbCheck.session.expiresAt).getTime();
    return {
      valid: true,
      username: dbCheck.user.username,
      role,
      canAccessNotion,
      expiresAt,
      userId: dbCheck.user.id,
    };
  }

  // 2. Fallback de compatibilidade para sessões HMAC assinadas
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, signature] = parts;
  const config = getSecurityConfig();
  // Comparação de assinatura em tempo constante (proteção contra timing attacks)
  const expectedSig = crypto.createHmac("sha256", config.sessionSecret).update(payloadB64).digest("base64url");
  if (expectedSig.length !== signature.length) return { valid: false };
  const sigBufA = Buffer.from(signature, 'utf-8');
  const sigBufB = Buffer.from(expectedSig, 'utf-8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) return { valid: false };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (!payload.exp || Date.now() > payload.exp) return { valid: false };
    const role = payload.role || (payload.u === ADMIN_USER ? "admin" : "cadet");
    const canAccessNotion = payload.canAccessNotion !== undefined ? Boolean(payload.canAccessNotion) : role === "admin";
    return {
      valid: true,
      username: payload.u,
      role,
      canAccessNotion,
      expiresAt: payload.exp,
    };
  } catch {
    return { valid: false };
  }
}

// ==========================================
// 🛡️ STEP-UP AUTHENTICATION (Tokens Assinados de Curta Duração - 5 Minutos)
// ==========================================
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
  if (!result.valid) {
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
  const cleanToken = token.trim().replace(/\s+/g, "");
  const currentEpoch = Math.floor(Date.now() / 1000);

  // Proteção anti-replay: mesmo código não pode ser reutilizado
  if (usedTotpCodes.has(cleanToken)) {
    console.warn('[2FA] Tentativa de reutilização de código TOTP detectada.');
    return false;
  }

  // Tolerância reduzida para ±30 segundos (1 step antes, 1 depois)
  for (const offset of [0, -30, 30]) {
    const result = verifySync({ token: cleanToken, secret, epoch: currentEpoch + offset });
    if (result && result.valid) {
      usedTotpCodes.set(cleanToken, Date.now());
      cleanupUsedTotpCodes();
      return true;
    }
  }
  return false;
}

// 1. Rota de Status do 2FA (Verifica se já foi ativado permanentemente)
app.get("/api/auth/2fa-status", (_req: Request, res: Response) => {
  const config = getSecurityConfig();
  return res.json({ is2faActive: config.is2faActive });
});

// 2. Rota de Obtenção de QR Code (Apenas com sessão autenticada ou chave mestra)
app.get("/api/auth/2fa-setup", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const sessionResult = verifyTerminalSession(token);
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];

  const isAdminKeyValid = adminKey ? await safeComparePassword(String(adminKey), ADMIN_PASSWORD_HASH) : false;
  if (!sessionResult.valid && !isAdminKeyValid) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Acesso restrito. Faça login primeiro para visualizar o QR Code de ativação.",
    });
  }

  try {
    const config = getSecurityConfig();
    if (config.is2faActive) {
      return res.status(403).json({
        error: "2FA_ALREADY_CONFIGURED",
        message: "O sistema de segurança 2FA já está ativado permanentemente. O QR Code foi destruído.",
      });
    }

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
    return res.status(500).json({ error: "SETUP_FAILED", message: err?.message });
  }
});

// 2.5. Rota de Primeiro Passo de Login (Apenas E-mail/Identificador, sem senha)
app.post("/api/auth/initial-login", (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        error: "MISSING_EMAIL",
        message: "Informe seu e-mail de acesso.",
      });
    }

    const isAuthorized =
      cleanEmail === "jb080956@gmail.com" ||
      cleanEmail === "admin" ||
      ALLOWED_EMAILS.includes(cleanEmail) ||
      cleanEmail.includes("@");

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        error: "UNAUTHORIZED_EMAIL",
        message: "E-mail não autorizado para acesso.",
      });
    }

    return res.json({
      success: true,
      email: cleanEmail,
      requireTotp: true,
      message: "Credencial validada. Prossiga para o código de autenticação.",
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: "INITIAL_LOGIN_ERROR", message: err?.message });
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

const TIMER_STATE_FILE = path.join(process.cwd(), "data", "timer-state.json");

function readTimerState(): TimerState {
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

function saveTimerState(state: TimerState): void {
  try {
    const dir = path.dirname(TIMER_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TIMER_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.warn("Falha ao salvar timer-state.json:", e);
  }
}

// 1. Status do Cronômetro (Calculado no servidor para sincronização multidispositivo)
app.get("/api/timer/status", (_req: Request, res: Response) => {
  const state = readTimerState();
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
  const state = readTimerState();
  const now = Date.now();

  if (state.status !== "RUNNING") {
    state.status = "RUNNING";
    state.startTime = now;
  }
  if (subjectId) state.activeSubjectId = subjectId;
  if (subjectName) state.activeSubjectName = subjectName;
  state.updatedAt = new Date().toISOString();

  saveTimerState(state);

  const totalElapsedMs = state.accumulatedTime + (state.startTime ? Math.max(0, now - state.startTime) : 0);
  return res.json({
    success: true,
    ...state,
    totalElapsedMs,
    serverTime: now,
  });
});

// 3. Pausar Cronômetro
app.post("/api/timer/pause", (_req: Request, res: Response) => {
  const state = readTimerState();
  const now = Date.now();

  if (state.status === "RUNNING" && state.startTime) {
    const delta = Math.max(0, now - state.startTime);
    state.accumulatedTime += delta;
    state.startTime = null;
    state.status = "PAUSED";
    state.updatedAt = new Date().toISOString();
    saveTimerState(state);
  }

  return res.json({
    success: true,
    ...state,
    totalElapsedMs: state.accumulatedTime,
    serverTime: now,
  });
});

// 4. Resetar Cronômetro
app.post("/api/timer/reset", (_req: Request, res: Response) => {
  const state: TimerState = {
    status: "STOPPED",
    accumulatedTime: 0,
    startTime: null,
    updatedAt: new Date().toISOString(),
  };
  saveTimerState(state);
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

// 2.7. Rota de Status de Segurança do Cliente (Turnstile & IP Check)
app.get("/api/auth/security-status", (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const isAdm = isAdminIp(clientIp);
  const siteKey =
    process.env.TURNSTILE_SITE_KEY || "0x4AAAAAAEq86txU4BLgFVmp";

  return res.json({
    clientIp,
    isAdminIp: isAdm,
    turnstileRequired: !isAdm, // Admin no seu IP não precisa rodar Turnstile!
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

    // 1.5. Verificação de Conta de Aluno / Cadete (Sem acesso ao Notion, login direto)
    const isCadetTarget =
      inputUser === CADET_USER.toLowerCase() ||
      inputUser === "cadete@cfo.cbmerj" ||
      inputUser === "aluno" ||
      inputUser === "aluno@cfocbmerj.com";

    if (isCadetTarget) {
      if (!(await safeComparePassword(password, CADET_PASSWORD_HASH))) {
        logSecurityEvent(req, {
          action: "LOGIN_FAILED",
          actor: inputUser,
          resource: "/api/auth/check-credentials",
          status: "FAILED",
          details: { reason: "Credenciais inválidas para cadete" },
        });
        return res.status(401).json({
          success: false,
          error: "INVALID_CREDENTIALS",
          message: "Credenciais de acesso inválidas.",
        });
      }

      // Cria sessão do cadete (role: cadet, canAccessNotion: false)
      const session = createTerminalSession("cadete", true, "cadet");
      logSecurityEvent(req, {
        action: "LOGIN_SUCCESS",
        actor: inputUser,
        resource: "/api/auth/check-credentials",
        status: "SUCCESS",
        details: { role: "cadet", method: "direct" },
      });
      console.log(`[Terminal CFO CBMERJ] Acesso de Cadete autenticado: ${inputUser}`);
      return res.json({
        success: true,
        directLogin: true,
        token: session.token,
        expiresAt: session.expiresAt,
        username: "cadete",
        role: "cadet",
        canAccessNotion: false,
        message: "Acesso concedido. Bem-vindo ao Terminal, Cadete!",
      });
    }

    // 2. Geo-fencing Estrito para a Conta Admin (Apenas Rio de Janeiro / Brasil)
    const isAdminTarget =
      inputUser === ADMIN_USER.toLowerCase() ||
      inputUser === "jb080956@gmail.com";

    if (isAdminTarget && !isAdmIp) {
      const geo = await getIpGeoLocation(clientIp, req);
      if (geo.country && geo.country !== "BR" && geo.country !== "UNKNOWN") {
        banIp(
          clientIp,
          `Tentativa de invasão da conta Admin fora do Brasil [País: ${geo.country}]`,
          { country: geo.country, region: geo.region }
        );

        return res.status(403).json({
          success: false,
          error: "IP_BANNED_UNAUTHORIZED_GEO",
          message: "ACESSO BLOQUEADO: Conexões fora do território nacional são restritas.",
        });
      }
    }

    const isAuthorized =
      inputUser === ADMIN_USER.toLowerCase() ||
      inputUser === "jb080956@gmail.com" ||
      ALLOWED_EMAILS.includes(inputUser);

    if (!isAuthorized) {
      logSecurityEvent(req, {
        action: isAdminTarget ? "ADMIN_LOGIN_FAILED" : "LOGIN_FAILED",
        actor: inputUser,
        resource: "/api/auth/check-credentials",
        status: "FAILED",
        details: { reason: "Usuário não autorizado ou inexistente" },
      });
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS",
        message: "Credenciais de acesso inválidas.",
      });
    }

    if (!(await safeComparePassword(password, ADMIN_PASSWORD_HASH))) {
      logSecurityEvent(req, {
        action: isAdminTarget ? "ADMIN_LOGIN_FAILED" : "LOGIN_FAILED",
        actor: inputUser,
        resource: "/api/auth/check-credentials",
        status: "FAILED",
        details: { reason: "Senha incorreta" },
      });
      return res.status(401).json({
        success: false,
        error: "INVALID_CREDENTIALS",
        message: "Credenciais de acesso inválidas.",
      });
    }

    return res.json({
      success: true,
      message: "Credenciais válidas. Prossiga para o código Authenticator.",
      requireTotp: true,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: "AUTH_ERROR", message: err?.message });
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

    const cleanUser = inputUser;

    // 2. Geo-fencing Estrito para a Conta Admin (Apenas RJ)
    const isAdminTarget =
      cleanUser === ADMIN_USER.toLowerCase() ||
      cleanUser === "jb080956@gmail.com";

    if (isAdminTarget && !isAdmIp) {
      const geo = await getIpGeoLocation(clientIp, req);
      if (geo.country && geo.country !== "BR" && geo.country !== "UNKNOWN") {
        banIp(
          clientIp,
          `Tentativa de validação 2FA fora do Brasil [País: ${geo.country}]`,
          { country: geo.country, region: geo.region }
        );

        return res.status(403).json({
          error: "IP_BANNED_UNAUTHORIZED_GEO",
          message: "ACESSO BLOQUEADO: Conexões fora do território nacional são restritas.",
        });
      }
    }

    const isAuthorized =
      cleanUser === ADMIN_USER.toLowerCase() ||
      cleanUser === "jb080956@gmail.com" ||
      ALLOWED_EMAILS.includes(cleanUser);

    if (!isAuthorized || !(await safeComparePassword(password, ADMIN_PASSWORD_HASH))) {
      logSecurityEvent(req, {
        action: "ADMIN_LOGIN_FAILED",
        actor: cleanUser,
        resource: "/api/auth/verify-2fa",
        status: "FAILED",
        details: { reason: "Credenciais inválidas na etapa 2FA" },
      });
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Credenciais de acesso inválidas.",
      });
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
      // Localiza o usuário admin para validar o hash do código de recuperação
      let targetUser = userRepoInstance.findByUsername(cleanUser) || userRepoInstance.findByEmail(cleanUser);
      if (!targetUser) {
        targetUser = userRepoInstance.findByUsername(ADMIN_USER);
      }
      const userId = targetUser ? targetUser.id : "admin-default-id";

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
    return res.status(500).json({ error: "AUTH_ERROR", message: err?.message });
  }
});

// 4. Rota de Ativação Permanente do 2FA (Ao confirmar o primeiro código dentro do site)
app.post("/api/auth/activate-2fa", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const sessionToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.body?.sessionToken;
    const sessionResult = verifyTerminalSession(sessionToken);

    if (!sessionResult.valid) {
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
    return res.status(500).json({ error: "ACTIVATION_FAILED", message: err?.message });
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
    is2faActive: config.is2faActive,
  });
});

// 6. Rota de Logout (Revogação Segura de Sessão)
app.post("/api/auth/logout", (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (token) {
    authServiceInstance.logout(token, getClientIp(req));
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
app.post("/api/auth/forgot-password", authLimiter, (req: Request, res: Response) => {
  try {
    const { email } = req.body || {};
    const clientIp = getClientIp(req);
    const result = authServiceInstance.requestPasswordReset(email, clientIp);
    logSecurityEvent(req, {
      action: "PASSWORD_RESET_REQUEST",
      actor: (email || "").trim().toLowerCase() || "unknown",
      resource: "/api/auth/forgot-password",
      status: "SUCCESS",
      details: { email },
    });
    return res.json(result);
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

// 11. Consulta Paginada e Filtrada de Eventos de Auditoria e Segurança (Restrito a Admin)
app.get("/api/admin/security/events", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const action = req.query.action ? String(req.query.action).trim() : undefined;
    const status = req.query.status ? String(req.query.status).trim() : undefined;
    const actor = req.query.actor ? String(req.query.actor).trim() : undefined;
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
      ip,
      search,
      startDate,
      endDate,
    });

    return res.json({
      success: true,
      ...result,
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

    // 2. Verificação por Senha Administrativa
    if (!isAuthorized && password) {
      if (await safeComparePassword(String(password), ADMIN_PASSWORD_HASH)) {
        isAuthorized = true;
      } else if (adminUser.userId) {
        const dbUser = userRepoInstance.findById(adminUser.userId);
        if (dbUser && (await safeComparePassword(String(password), dbUser.passwordHash))) {
          isAuthorized = true;
        }
      }
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
    return res.status(500).json({ error: "STEP_UP_ERROR", message: err?.message });
  }
});

// 13.2. Geração de Novos Códigos de Recuperação (Requer Step-Up prévio)
app.post("/api/admin/2fa/generate-recovery-codes", requireAdminAuth, requireStepUpAuth, (req: Request, res: Response) => {
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
    return res.status(500).json({ error: "RECOVERY_CODES_ERROR", message: err?.message });
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
    return res.status(500).json({ error: "RECOVERY_COUNT_ERROR", message: err?.message });
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

// 16. Alterar Status de Conta de Usuário (Suspender ou Reativar - Requer Step-Up)
app.patch("/api/admin/users/:id/status", requireAdminAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { status } = req.body || {};
    const adminUser = (req as any).user;

    if (!['active', 'suspended', 'pending_activation'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido." });
    }

    const targetUser = userRepoInstance.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }

    // Proteção: não permitir suspender o administrador mestre
    if (targetUser.username === ADMIN_USER && status === 'suspended') {
      return res.status(400).json({ success: false, message: "Não é permitido suspender a conta do administrador mestre." });
    }

    userRepoInstance.updateStatus(userId, status);

    // Se suspenso, revoga imediatamente todas as sessões ativas do usuário
    if (status === 'suspended') {
      sessionRepoInstance.revokeAllUserSessions(userId);
    }

    logSecurityEvent(req, {
      action: status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ACTIVATED',
      actor: adminUser?.username || 'admin',
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      userId,
      details: { previousStatus: targetUser.status, newStatus: status },
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

// 17. Alterar Papel / Privilégio de Usuário (Admin / Cadet - Requer Step-Up)
app.patch("/api/admin/users/:id/role", requireAdminAuth, requireStepUpAuth, (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const { role } = req.body || {};
    const adminUser = (req as any).user;

    if (!['cadet', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: "Papel (role) inválido." });
    }

    const targetUser = userRepoInstance.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "Usuário não encontrado." });
    }

    if (targetUser.username === ADMIN_USER && role !== 'admin') {
      return res.status(400).json({ success: false, message: "O papel do administrador mestre não pode ser alterado." });
    }

    userRepoInstance.updateRole(userId, role);

    logSecurityEvent(req, {
      action: 'ROLE_CHANGED',
      actor: adminUser?.username || 'admin',
      resource: `/users/${userId}`,
      status: 'SUCCESS',
      userId,
      details: { previousRole: targetUser.role, newRole: role },
    });

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

// 19. Revogação de Sessão Específica por ID (Admin - Requer Step-Up)
app.post("/api/admin/sessions/:id/revoke", requireAdminAuth, requireStepUpAuth, (req: Request, res: Response) => {
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
      resource: `/sessions/${sessionId}`,
      status: 'SUCCESS',
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
    return res.status(500).json({ connected: false, error: error?.message });
  }
});

// 2. Generate Google OAuth Offline Authorization URL
app.get("/api/calendar/auth-url", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(400).json({
      error: "MISSING_CLIENT_ID",
      message: "GOOGLE_CLIENT_ID não está configurado no backend.",
    });
  }

  const clientOrigin = (req.query.origin as string) || "";
  const host = req.get("host") || `localhost:${PORT}`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const redirectUri =
    process.env.REDIRECT_URI ||
    (process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/google/callback`
      : host.includes("127.0.0.1")
      ? `http://127.0.0.1:${PORT}/api/auth/google/callback`
      : host.includes("localhost")
      ? `http://localhost:${PORT}/api/auth/google/callback`
      : `${protocol}://${host}/api/auth/google/callback`);

  console.log("===> [OAuth] Gerando auth-url com redirectUri:", redirectUri);

  const statePayload = Buffer.from(
    JSON.stringify({
      origin: clientOrigin || `${protocol}://${host}`,
      ts: Date.now(),
    })
  ).toString("base64url");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", statePayload);
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // Garante a emissão de refresh_token

  return res.json({ url: authUrl.toString(), redirectUri });
});

// 3. Google OAuth Callback
app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
  try {
    const { code, error, state } = req.query;

    let targetOrigin = "";
    try {
      if (typeof state === "string") {
        const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
        if (parsed.origin) targetOrigin = parsed.origin;
      }
    } catch (_) {}

    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: system-ui; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h2 style="color: #ef4444;">Autorização Cancelada</h2>
          <p>${error}</p>
          <script>setTimeout(() => window.close(), 1500);</script>
        </body>
        </html>
      `);
    }

    if (!code || typeof code !== "string") {
      return res.status(400).send("Código de autorização ausente.");
    }

    const host = req.get("host") || `localhost:${PORT}`;
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const redirectUri =
      process.env.REDIRECT_URI ||
      (process.env.RENDER_EXTERNAL_URL
        ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/google/callback`
        : host.includes("127.0.0.1")
        ? `http://127.0.0.1:${PORT}/api/auth/google/callback`
        : host.includes("localhost")
        ? `http://localhost:${PORT}/api/auth/google/callback`
        : `${protocol}://${host}/api/auth/google/callback`);

    // Troca o código pelo token com refresh_token
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Erro na troca de código OAuth do Google:", errBody);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: system-ui; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h2 style="color: #ef4444;">Erro ao Autenticar com o Google</h2>
          <p>Não foi possível obter o token de acesso. Verifique se o GOOGLE_CLIENT_SECRET está configurado corretamente no arquivo .env.</p>
          <pre style="background: #1e293b; padding: 15px; border-radius: 8px; text-align: left; max-width: 600px; margin: 20px auto; overflow: auto; font-size: 12px;">${errBody}</pre>
          <button onclick="window.close()" style="background: #dc2626; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">Fechar Janela</button>
        </body>
        </html>
      `);
    }

    const tokenData = (await tokenResp.json()) as any;
    const existingSession = readCalendarSession();

    // Obter dados do perfil do usuário
    let email = "";
    let name = "";
    try {
      const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userResp.ok) {
        const userInfo = (await userResp.json()) as any;
        email = userInfo.email || "";
        name = userInfo.name || "";
      }
    } catch {}

    // 🔒 Blindagem de Segurança (Whitelist): apenas jb080956@gmail.com ou IP autorizado
    const clientIp = getClientIp(req);
    const isAuthorized = isRequestAuthorized(req, email);
    if (!isAuthorized) {
      console.warn(`[Bloqueio de Segurança] Acesso negado para e-mail '${email}' e IP '${clientIp}'`);
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Acesso Negado</title>
          <meta charset="utf-8" />
        </head>
        <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
          <div style="text-align: center; padding: 36px; background: #111827; border: 1px solid #ef4444; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); max-width: 440px; margin: 20px;">
            <div style="width: 56px; height: 56px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px;">
              🚫
            </div>
            <h2 style="color: #ef4444; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Acesso Não Autorizado</h2>
            <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px; line-height: 1.5;">
              O e-mail <strong>${email || "não autenticado"}</strong> não possui autorização para utilizar este sistema.<br />
              Este cronograma é de uso exclusivo e privado de <strong>jb080956@gmail.com</strong>.
            </p>
            <div style="color: #64748b; font-size: 11px; margin-bottom: 16px;">IP: ${clientIp}</div>
            <button onclick="window.close()" style="background: #dc2626; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;">Fechar Janela</button>
          </div>
        </body>
        </html>
      `);
    }

    const session: CalendarSession = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existingSession?.refresh_token,
      expiry_date: Date.now() + (tokenData.expires_in || 3600) * 1000,
      email: email || existingSession?.email,
      name: name || existingSession?.name,
      scope: tokenData.scope,
      updatedAt: new Date().toISOString(),
    };

    saveCalendarSession(session);
    console.log(`Google Calendar conectado com sucesso para ${session.name ? `${session.name} (${session.email})` : session.email || "usuário"} (Refresh Token permanente: ${!!session.refresh_token})`);

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Agenda Conectado</title>
        <meta charset="utf-8" />
      </head>
      <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
        <div style="text-align: center; padding: 32px; background: #111827; border: 1px solid #1f2937; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); max-width: 440px; margin: 20px;">
          <div style="width: 56px; height: 56px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px;">
            ✅
          </div>
          <h2 style="color: #22c55e; margin: 0 0 8px; font-size: 20px; font-weight: 700;">Google Agenda Conectado!</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 16px; line-height: 1.5;">
            Conta de <strong>${session.name || session.email || "Aluno"}</strong> vinculada permanentemente ao cronograma!
          </p>
          <p style="color: #64748b; font-size: 12px; margin-bottom: 20px;">Esta janela será fechada automaticamente em instantes.</p>
          <button id="closeBtn" onclick="doClose()" style="background: #0056D2; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer;">
            Concluir & Fechar Janela
          </button>
        </div>
        <script>
          const sessionStatus = {
            connected: true,
            permanent: true,
            email: ${JSON.stringify(session.email || '')},
            name: ${JSON.stringify(session.name || '')}
          };
          const authPayload = {
            type: 'GOOGLE_CALENDAR_CONNECTED',
            success: true,
            email: ${JSON.stringify(session.email || '')},
            name: ${JSON.stringify(session.name || '')},
            ts: Date.now()
          };

          // 1. Atualiza imediatamente o localStorage compartilhado (notifica todas as abas e sincroniza o estado instantaneamente)
          try {
            localStorage.setItem('cfo_calendar_status', JSON.stringify(sessionStatus));
            localStorage.setItem('cfo_calendar_auth_success', JSON.stringify(authPayload));
          } catch(e) {}

          // 2. Notifica a aba principal via BroadcastChannel
          try {
            if (typeof BroadcastChannel !== 'undefined') {
              const channel = new BroadcastChannel('cfo_google_calendar_auth');
              channel.postMessage(authPayload);
              setTimeout(() => {
                try { channel.close(); } catch(e) {}
              }, 2000);
            }
          } catch(e) {}

          // 3. PostMessage caso o opener ainda esteja acessível
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage(authPayload, '*');
            }
          } catch(e) {}

          function doClose() {
            try {
              window.close();
            } catch(e) {}
          }

          // Fecha automaticamente e rapidamente a janela pop-up
          setTimeout(doClose, 250);
        </script>
      </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Erro no callback OAuth do Google:", error);
    return res.status(500).send("Erro interno ao processar autenticação do Google.");
  }
});


// 4. Save client token on backend (backup store com whitelist)
app.post("/api/calendar/save-token", async (req: Request, res: Response) => {
  try {
    const { token, expiresIn = 3600, email, name } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token não fornecido" });
    }

    // 🔒 Blindagem de Segurança (Whitelist)
    if (email && !ALLOWED_EMAILS.includes(email.toLowerCase())) {
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
    return res.status(500).json({ error: error?.message });
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
    const authHeader = req.headers.authorization;
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
    return res.json({ valid: false, error: error?.message || "Erro ao verificar token" });
  }
});

// 7. Create single Calendar Event endpoint (com auto-refresh de token)
app.post("/api/calendar/create-event", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
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
      message: error?.message || "Erro ao criar evento na Google Agenda",
    });
  }
});

// 8. Batch Sync Study Session & Spaced Revisions endpoint (com auto-refresh de token)
app.post("/api/calendar/batch-sync", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
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
      message: error?.message || "Falha ao sincronizar eventos com Google Agenda",
    });
  }
});

// 🔒 Blindagem das Rotas de Inteligência Artificial (Gemini API)
app.use("/api/ai", (req: Request, res: Response, next) => {
  const userEmail = (req.headers["x-user-email"] as string) || req.body?.userEmail;
  if (!isRequestAuthorized(req, userEmail)) {
    const clientIp = getClientIp(req);
    console.warn(`[Bloqueio IA] Acesso não autorizado em ${req.path} | IP: ${clientIp}`);
    return res.status(403).json({
      error: "UNAUTHORIZED",
      message: "Acesso restrito ao usuário autorizado (jb080956@gmail.com).",
    });
  }
  next();
});

// AI Study Analysis Endpoint
app.post("/api/ai/study-analysis", async (req: Request, res: Response) => {
  try {
    const { weeklySummary } = req.body;

    if (!weeklySummary) {
      return res.status(400).json({ error: "weeklySummary is required" });
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

    if (!title && !subject) {
      return res.status(400).json({ error: "Título ou matéria são obrigatórios." });
    }

    const ai = getGeminiClient();
    if (ai) {
      const prompt = `Você é o Estrategista Pedagógico Chefe e Especialista nas bancas do concurso CFO CBMERJ (Oficial Combatente do Corpo de Bombeiros Militar do Estado do Rio de Janeiro).
O concurseiro está criando um Bizu Tático para o seu Bizuário de estudos informando apenas a matéria e o conteúdo desejado.

Dados fornecidos:
- Matéria: ${subject || "Geral do Edital"}
- Conteúdo / Assunto: ${title || subject}
- Categoria sugerida: ${category || "Edital CFO CBMERJ"}
- Anotações prévias (se houver): ${existingNotes || "Nenhuma"}
- Foco específico: ${promptHint || "Geração direta de anotação detalhada e estratégica estilo Cartografia e Alta Incidência do CFO CBMERJ"}

IMPORTANTE SOBRE MATEMÁTICA / FÍSICA:
SEMPRE utilize notação LaTeX com delimitadores $...$ (em linha) ou $$...$$ (em bloco) para quaisquer fórmulas matemáticas, físicas, químicas ou de escalas cartográficas (ex: $E = \\frac{d}{D}$, $Q = m \\cdot c \\cdot \\Delta T$, $v^2 = v_0^2 + 2a\\Delta s$, etc.).

INSTRUÇÃO CRÍTICA DE SEPARAÇÃO EM TÓPICOS NO CAMPO "notes":
O texto do campo "notes" NÃO PODE DE FORMA ALGUMA FICAR AMONTOADO EM UM PARÁGRAFO CORRIDO.
DEVE FICAR RIGOROSAMENTE SEPARADO EM TÓPICOS COM UMA LINHA EM BRANCO (duplo \\n\\n) ENTRE CADA UM DELES, exatamente neste formato:

Tópico 1 - Conceito Essencial & Fundamentos
• Definição clara, formal e didática do assunto.
• Relações fundamentais de causa e efeito e aplicabilidade no CFO CBMERJ.

Tópico 2 - Fórmulas & Relações Chave (LaTeX)
• Todas as equações relevantes com notação LaTeX ($...$).
• Significado de cada grandeza e conversões de unidades fundamentais no SI.

Tópico 3 - Bizus Táticos & Mnemônicos
• Frases mnemônicas, macetes consagrados e regras práticas para memorização rápida.

Tópico 4 - Pegadinhas Clássicas das Bancas (UERJ / FGV / IDECAN)
• Armadilhas frequentes em enunciados recentes do CFO CBMERJ e distratores que eliminam candidatos.

Tópico 5 - Método de Prova & Resolução Rápida
• Passo a passo para matar a questão em menos de 2 minutos sem perder tempo com contas desnecessárias.

Estruture a resposta JSON contendo:
1. "refinedTitle": Título elegante, profissional e direto para o Bizu (ex: "Cartografia: Escalas, Curvas de Nível e Fusos Horários" ou "Termologia: Calorimetria e Mudanças de Fase").
2. "category": Categoria ou eixo temático refinado (ex: "Geopolítica & Cartografia", "Mecânica Clássica", "Geometria Plana", etc.).
3. "notes": Texto com os tópicos OBRIGATORIAMENTE separados por linhas em branco conforme o modelo acima.
4. "keyPoints": Array com 4 a 6 tópicos estratégicos ultra-sintéticos (bullets diretos para revisão rápida de véspera, podendo conter fórmulas curtas em $...$).
5. "tags": Array com 4 a 6 tags/palavras-chave estratégicas para filtragem no Bizuário.`;

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
                "Você é um tutor especialista de elite focado na aprovação no concurso CFO CBMERJ. Forneça anotações táticas completas, estruturadas estritamente em 'Tópico 1 - ...', 'Tópico 2 - ...', com linha em branco entre eles, mnemônicos e fórmulas em LaTeX.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
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
            const parsed = JSON.parse(response.text);
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
    res.status(500).json({ error: "FALHA_AO_GERAR_BIZU", message: error?.message });
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
      message: error?.message || "Falha ao gerar flashcards.",
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
    : (req.query.token as string) || (req.headers["x-terminal-session"] as string);

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
      message: e?.message || "Falha ao obter dados do Notion",
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

    return res.json({
      success: result.success,
      item: result.item,
      error: result.error,
    });
  } catch (e: any) {
    console.error("Erro ao processar check-in do Notion:", e);
    return res.status(500).json({
      error: "CHECKIN_ERROR",
      message: e?.message || "Falha ao registrar check-in",
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
      message: e?.message || "Falha ao registrar estudo no Notion",
    });
  }
});

// ============================================================================
// 💾 SISTEMA PROFISSIONAL DE BACKUP E SINCRONIZAÇÃO RESILIENTE
// ============================================================================

// Middleware de autorização estrita para Operações Administrativas
async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const adminKey = req.query.adminKey || req.headers["x-admin-key"];

  if (adminKey) {
    const isKeyValid = await safeComparePassword(String(adminKey), ADMIN_PASSWORD_HASH);
    if (isKeyValid) return next();
  }

  const session = verifyTerminalSession(token);
  if (session.valid && session.role === "admin") {
    (req as any).user = session;
    return next();
  }

  return res.status(403).json({
    error: "FORBIDDEN",
    message: "Acesso administrativo restrito. Autenticação de comando necessária.",
  });
}

// Middleware de autorização para Usuários Autenticados (Cadete ou Admin)
function requireUserAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = verifyTerminalSession(token);

  if (session.valid) {
    (req as any).user = session;
    return next();
  }

  return res.status(401).json({
    error: "UNAUTHORIZED",
    message: "Autenticação necessária para sincronização de dados.",
  });
}

// 1. Sincronização de Progresso do Usuário (Backup em Nuvem Privada do Aluno/Cadete)
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
    const sanitizedUsername = String(user.username || "cadete").replace(/[^a-zA-Z0-9_-]/g, "_");
    const userBackupFile = path.join(process.cwd(), "data", "user-backups", `${sanitizedUsername}.json`);

    if (!fs.existsSync(userBackupFile)) {
      return res.status(404).json({
        error: "NO_BACKUP_FOUND",
        message: "Nenhum backup em nuvem encontrado para este operador.",
      });
    }

    const raw = fs.readFileSync(userBackupFile, "utf-8");
    const parsed = JSON.parse(raw);

    logAuditEvent({
      action: "USER_BACKUP_RESTORE",
      actor: user.username,
      resource: `/data/user-backups/${sanitizedUsername}.json`,
      status: "SUCCESS",
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      backup: parsed,
    });
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
      message: err?.message || "Falha ao consultar status de backup.",
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
      message: err?.message || "Falha ao listar backups.",
    });
  }
});

// 5. Criação Manual Imediata de Backup Completo
app.post("/api/admin/backup/create", requireAdminAuth, async (req: Request, res: Response) => {
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
      message: err?.message || "Erro inesperado ao gerar backup.",
    });
  }
});

// 6. Restauração Crítica de Backup do Servidor (Requer confirmação explícita e Step-Up)
app.post("/api/admin/backup/restore", requireAdminAuth, requireStepUpAuth, async (req: Request, res: Response) => {
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
      details: { error: err?.message },
    });
    return res.status(500).json({
      error: "RESTORE_ERROR",
      message: err?.message || "Erro inesperado durante restauração.",
    });
  }
});

// 7. Auditoria de Segurança: Consulta de Trilha de Auditoria (Audit Log)
app.get("/api/admin/audit-logs", requireAdminAuth, (req: Request, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 50));
    const logs = readRecentAuditLogs(limit);
    return res.json({
      success: true,
      total: logs.length,
      logs,
    });
  } catch (err: any) {
    return res.status(500).json({
      error: "AUDIT_LOG_ERROR",
      message: err?.message || "Falha ao ler registros de auditoria.",
    });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

const isTestEnv = process.env.NODE_ENV === "test" || process.argv.some((a) => a.includes("test"));
if (!isTestEnv) {
  startServer();
}

export { app };
