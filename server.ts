import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { generateSecret, verifySync, generateURI } from "otplib";
import QRCode from "qrcode";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
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

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

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
  return null;
}

function saveCalendarSession(session: CalendarSession): void {
  try {
    const dir = path.dirname(CALENDAR_SESSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CALENDAR_SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
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

// API Health
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// 🛡️ TERMINAL DE ACESSO RESTRITO (2FA TOTP)
// ==========================================
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cfocbmerj2026!";
const DEFAULT_TOTP_SECRET = "T37NFOFA5PCDA5NRXKDVWVEHZ2F22ZV3";
const DEFAULT_SESSION_SECRET = "b6708b60d07229c5f49cbc2612e747acae36b92bf8435b11569bc916560ea12f";
const SECURITY_CONFIG_FILE = path.join(process.cwd(), "data", "security-config.json");

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
        totpSecret: process.env.TOTP_SECRET || parsed.totpSecret || DEFAULT_TOTP_SECRET,
        sessionSecret: process.env.SESSION_SECRET || parsed.sessionSecret || DEFAULT_SESSION_SECRET,
        is2faActive: Boolean(parsed.is2faActive),
        createdAt: parsed.createdAt || new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("Falha ao ler security-config.json:", e);
  }

  const newConfig: SecurityConfig = {
    totpSecret: process.env.TOTP_SECRET || DEFAULT_TOTP_SECRET,
    sessionSecret: process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET,
    is2faActive: false,
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

function createTerminalSession(username: string, rememberMe: boolean): { token: string; expiresAt: number } {
  const config = getSecurityConfig();
  const durationMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + durationMs;
  const payload = {
    u: username,
    exp: expiresAt,
    r: rememberMe ? 1 : 0,
    iat: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(payloadB64).digest("base64url");
  return {
    token: `${payloadB64}.${signature}`,
    expiresAt,
  };
}

function verifyTerminalSession(token?: string | null): { valid: boolean; username?: string; expiresAt?: number } {
  if (!token || typeof token !== "string") return { valid: false };
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false };

  const [payloadB64, signature] = parts;
  const config = getSecurityConfig();
  const expectedSignature = crypto.createHmac("sha256", config.sessionSecret).update(payloadB64).digest("base64url");

  if (signature !== expectedSignature) return { valid: false };

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (!payload.exp || Date.now() > payload.exp) return { valid: false };
    return { valid: true, username: payload.u, expiresAt: payload.exp };
  } catch {
    return { valid: false };
  }
}

function verifyTotpToken(token: string, secret: string): boolean {
  const cleanToken = token.trim().replace(/\s+/g, "");
  const currentEpoch = Math.floor(Date.now() / 1000);
  // Tolerância estendida para desvios de relógio de celular (+/- 120 segundos)
  for (const offset of [0, -30, 30, -60, 60, -90, 90, -120, 120]) {
    const result = verifySync({ token: cleanToken, secret, epoch: currentEpoch + offset });
    if (result && result.valid) {
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

  if (!sessionResult.valid && adminKey !== ADMIN_PASSWORD) {
    return res.status(403).json({
      error: "FORBIDDEN",
      message: "Acesso restrito. Faça login primeiro para visualizar o QR Code de ativação.",
    });
  }

  try {
    const config = getSecurityConfig();
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

// 3. Rota de Validação de Login no Terminal (Se 2FA ativo, exige TOTP. Se não ativo, permite login inicial)
app.post("/api/auth/verify-2fa", async (req: Request, res: Response) => {
  try {
    const { username, password, token, rememberMe } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: "MISSING_FIELDS",
        message: "Usuário e senha são obrigatórios.",
      });
    }

    if (username.trim().toLowerCase() !== ADMIN_USER.toLowerCase()) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Identificador de operador incorreto.",
      });
    }

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "INVALID_CREDENTIALS",
        message: "Chave mestra de acesso incorreta.",
      });
    }

    const config = getSecurityConfig();

    // Se o 2FA já estiver permanentemente ativado, o código é rigorosamente obrigatório
    if (config.is2faActive) {
      if (!token || token.trim().length !== 6) {
        return res.status(400).json({
          error: "TOTP_REQUIRED",
          message: "Código Authenticator de 6 dígitos é obrigatório.",
        });
      }

      const isCodeValid = verifyTotpToken(token, config.totpSecret);
      if (!isCodeValid) {
        return res.status(401).json({
          error: "INVALID_TOTP",
          message: "Código Authenticator incorreto ou expirado. Verifique o relógio do seu celular.",
        });
      }
    }

    const session = createTerminalSession(ADMIN_USER, !!rememberMe);
    console.log(`[Terminal CFO CBMERJ] Acesso autenticado para '${ADMIN_USER}' (2FA Ativo: ${config.is2faActive})`);

    return res.json({
      success: true,
      token: session.token,
      expiresAt: session.expiresAt,
      username: ADMIN_USER,
      rememberMe: !!rememberMe,
      is2faActive: config.is2faActive,
      expiresInDays: rememberMe ? 30 : 1,
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
    expiresAt: result.expiresAt,
    is2faActive: config.is2faActive,
  });
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

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
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
    const { code, error } = req.query;

    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <body style="font-family: system-ui; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
          <h2 style="color: #ef4444;">Autorização Cancelada</h2>
          <p>${error}</p>
          <script>setTimeout(() => window.close(), 2500);</script>
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
    console.log(`Google Calendar conectado com sucesso para ${session.email || "usuário"} (Refresh Token permanente: ${!!session.refresh_token})`);

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
          <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px; line-height: 1.5;">
            Sua conta <strong>${session.email || ""}</strong> foi vinculada permanentemente. Os estudos e revisões serão sincronizados sem desconectar a cada hora.
          </p>
          <div style="color: #64748b; font-size: 12px;">Fechando janela em instantes...</div>
        </div>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED', success: true, email: '${session.email || ""}' }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              setTimeout(() => { window.location.href = '/'; }, 1500);
            }
          } catch (e) {
            setTimeout(() => window.close(), 1500);
          }
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

async function startServer() {
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

startServer();
