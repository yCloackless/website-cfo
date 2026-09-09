import fs from 'fs';
import path from 'path';

export interface AuditEntry {
  timestamp: string;
  eventType?: string;
  action?: string;
  username?: string;
  actor?: string;
  resource?: string;
  status?: string;
  ip: string;
  userAgent?: string | null;
  userId?: string | null;
  details?: Record<string, any>;
}

const AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'audit.log');
const MAX_AUDIT_LOG_BYTES = 10 * 1024 * 1024;

export function logAuditEvent(entry: Omit<AuditEntry, 'timestamp'>): void {
  try {
    const dir = path.dirname(AUDIT_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const eventType = entry.eventType || entry.action || 'SECURITY_ALERT';
    const username = entry.username || entry.actor;

    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      eventType,
      action: entry.action || eventType,
      username,
      actor: entry.actor || username,
      resource: entry.resource,
      status: entry.status,
      ip: entry.ip,
      userAgent: entry.userAgent || null,
      userId: entry.userId || null,
      details: entry.details ? { ...entry.details } : undefined,
    };

    // Sanitiza qualquer menção acidental a senhas ou segredos
    if (fullEntry.details) {
      const sensitiveKeys = [
        'password',
        'currentpassword',
        'newpassword',
        'token',
        'secret',
        'totp',
        'code',
        'cookie',
        'authorization',
        'totpsecret',
        'recoverycode',
        'backupcode',
      ];
      for (const key of Object.keys(fullEntry.details)) {
        if (sensitiveKeys.includes(key.toLowerCase())) {
          delete fullEntry.details[key];
        }
      }
    }

    const line = JSON.stringify(fullEntry) + '\n';
    if (fs.existsSync(AUDIT_LOG_FILE) && fs.statSync(AUDIT_LOG_FILE).size >= MAX_AUDIT_LOG_BYTES) {
      const rotated = path.join(dir, `audit-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
      fs.renameSync(AUDIT_LOG_FILE, rotated);
    }
    fs.appendFileSync(AUDIT_LOG_FILE, line, { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    console.error('[Audit Log] Falha ao registrar evento de auditoria:', err);
  }
}

export function readRecentAuditLogs(limit: number = 50): AuditEntry[] {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return [];
    const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries: AuditEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        entries.push(JSON.parse(lines[i]));
      } catch {}
    }
    return entries;
  } catch {
    return [];
  }
}
