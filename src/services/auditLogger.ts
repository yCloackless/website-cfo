import fs from 'fs';
import path from 'path';

export interface AuditEntry {
  timestamp: string;
  eventType:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'ACCESS_BLOCKED_GEO'
    | 'IP_BANNED'
    | 'BACKUP_CREATED'
    | 'BACKUP_RESTORED'
    | 'USER_BACKUP_SYNC'
    | 'USER_BACKUP_RESTORE'
    | 'SECURITY_ALERT';
  username?: string;
  ip: string;
  details?: Record<string, any>;
}

const AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'audit.log');

export function logAuditEvent(entry: Omit<AuditEntry, 'timestamp'>): void {
  try {
    const dir = path.dirname(AUDIT_LOG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Sanitiza qualquer menção acidental a senhas ou segredos
    if (fullEntry.details) {
      delete fullEntry.details.password;
      delete fullEntry.details.token;
      delete fullEntry.details.secret;
      delete fullEntry.details.authorization;
    }

    const line = JSON.stringify(fullEntry) + '\n';
    fs.appendFileSync(AUDIT_LOG_FILE, line, 'utf-8');
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
