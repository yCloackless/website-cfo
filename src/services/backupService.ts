import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import os from 'node:os';
import { DatabaseSync, backup } from 'node:sqlite';
import { isDatabaseOpen } from '../db/database';

export interface BackupMetadata {
  id: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  type: 'manual' | 'scheduled';
  fileCount: number;
  status: 'completed' | 'failed';
}

export interface BackupStatus {
  lastBackup: BackupMetadata | null;
  nextScheduledBackup: string;
  totalBackups: number;
  storageDestination: string;
  retentionDays: number;
}

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const BACKUP_INDEX_FILE = path.join(BACKUP_DIR, 'backup-index.json');
const DATA_DIR = path.join(process.cwd(), 'data');

function backupPath(filename: string): string {
  if (path.basename(filename) !== filename || !/^backup_[\w.-]+\.json\.gz$/.test(filename)) throw new Error('INVALID_BACKUP_NAME');
  return path.join(BACKUP_DIR, filename);
}

function dataPath(name: string): string {
  if (!/^(?:(?:user-backups|avatars)\/)?[\w.-]+$/.test(name) || name.includes('..') || /-(?:wal|shm)$/.test(name)) throw new Error('INVALID_BACKUP_PATH');
  const target = path.resolve(DATA_DIR, name);
  if (!target.startsWith(path.resolve(DATA_DIR) + path.sep)) throw new Error('INVALID_BACKUP_PATH');
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('INVALID_BACKUP_PATH');
  const parent = path.dirname(target);
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('INVALID_BACKUP_PATH');
  return target;
}

async function snapshotFile(file: string): Promise<string> {
  if (!/\.(sqlite|db)$/.test(file)) return fs.readFileSync(file).toString('base64');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-sqlite-backup-'));
  const snapshot = path.join(temporary, 'snapshot.sqlite');
  const source = new DatabaseSync(file, { readOnly: true });
  try {
    await backup(source, snapshot);
    return fs.readFileSync(snapshot).toString('base64');
  } finally {
    source.close();
    if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot);
    fs.rmdirSync(temporary);
  }
}

// Garantir que a pasta de backups exista
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Carrega o índice de backups
export function loadBackupIndex(): BackupMetadata[] {
  try {
    ensureBackupDir();
    if (fs.existsSync(BACKUP_INDEX_FILE)) {
      const raw = fs.readFileSync(BACKUP_INDEX_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('[Backup] Falha ao carregar índice de backups:', err);
  }
  return [];
}

// Salva o índice de backups
function saveBackupIndex(list: BackupMetadata[]): void {
  try {
    ensureBackupDir();
    fs.writeFileSync(BACKUP_INDEX_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Backup] Falha ao gravar índice de backups:', err);
  }
}

/**
 * Cria um backup arquivado e compactado (tar/gzip simples via streams ou zip de dados em JSON estruturado)
 * Para máxima portabilidade Node puro sem dependência de executáveis do SO:
 * Empacota todos os arquivos de /data (excluindo a própria pasta /data/backups) em um único snapshot compactado gzip.
 */
export async function createFullBackup(type: 'manual' | 'scheduled' = 'manual'): Promise<BackupMetadata> {
  ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(6).toString('hex');
  const backupId = `backup_${timestamp}`;
  const filename = `${backupId}.json.gz`;
  const filePath = backupPath(filename);

  const filesToBackup = fs.readdirSync(DATA_DIR).filter((f) => {
    return f !== 'backups' && !f.endsWith('.tmp') && !/-(wal|shm)$/.test(f);
  });

  const snapshot: Record<string, any> = {
    metadata: {
      id: backupId,
      createdAt: new Date().toISOString(),
      type,
      version: '2.0.0',
      encoding: 'base64',
    },
    files: {},
  };

  for (const file of filesToBackup) {
    const fullPath = path.join(DATA_DIR, file);
    try {
      const stat = fs.lstatSync(fullPath);
      if (stat.isSymbolicLink()) throw new Error('SYMLINK_NOT_ALLOWED');
      if (stat.isFile()) {
        snapshot.files[file] = await snapshotFile(fullPath);
      } else if (stat.isDirectory() && (file === 'user-backups' || file === 'avatars')) {
        const userFiles = fs.readdirSync(fullPath);
        for (const uf of userFiles) {
          const relative = `${file}/${uf}`;
          snapshot.files[relative] = await snapshotFile(dataPath(relative));
        }
      }
    } catch (e) {
      throw new Error(`BACKUP_READ_FAILED: ${file}`);
    }
  }

  const rawJson = JSON.stringify(snapshot, null, 2);
  const compressed = zlib.gzipSync(Buffer.from(rawJson, 'utf-8'));

  // Calcula Hash SHA-256
  const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');

  // Grava arquivo de backup compactado
  fs.writeFileSync(filePath, compressed);

  // Grava arquivo com o checksum SHA-256 independente para auditoria
  fs.writeFileSync(`${filePath}.sha256`, `${sha256}  ${filename}\n`, 'utf-8');

  const meta: BackupMetadata = {
    id: backupId,
    filename,
    sizeBytes: compressed.length,
    sha256,
    createdAt: new Date().toISOString(),
    type,
    fileCount: Object.keys(snapshot.files).length,
    status: 'completed',
  };

  const index = loadBackupIndex();
  index.unshift(meta);

  // Aplica política de retenção (30 dias / 30 backups)
  applyRetentionPolicy(index);
  saveBackupIndex(index);

  console.info(`[Backup] ✅ Backup ${filename} criado com sucesso (${(compressed.length / 1024).toFixed(1)} KB, SHA256: ${sha256.slice(0, 12)}...)`);
  return meta;
}

/**
 * Valida a integridade de um arquivo de backup calculando seu SHA-256
 */
export function verifyBackupIntegrity(filename: string): { valid: boolean; calculatedSha256: string; expectedSha256?: string } {
  ensureBackupDir();
  const filePath = backupPath(filename);
  if (!fs.existsSync(filePath)) {
    return { valid: false, calculatedSha256: '' };
  }

  const fileData = fs.readFileSync(filePath);
  const calculatedSha256 = crypto.createHash('sha256').update(fileData).digest('hex');

  const index = loadBackupIndex();
  const entry = index.find((b) => b.filename === filename);
  const expectedSha256 = entry?.sha256;

  return {
    valid: Boolean(expectedSha256 && calculatedSha256 === expectedSha256),
    calculatedSha256,
    expectedSha256,
  };
}

/**
 * Restaura com segurança um backup prévio
 */
export async function restoreBackup(filename: string): Promise<{ success: boolean; message: string }> {
  // Replacing files under live SQLite connections is unsafe. Restore is an offline operation.
  if (isDatabaseOpen()) throw Object.assign(new Error('RESTORE_REQUIRES_OFFLINE_MAINTENANCE'), { status: 409 });
  ensureBackupDir();
  const filePath = backupPath(filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de backup ${filename} não foi encontrado.`);
  }

  // 1. Validação de integridade
  const check = verifyBackupIntegrity(filename);
  if (!check.valid) {
    throw new Error(`Integridade comprometida: SHA-256 do arquivo difere do índice registrado.`);
  }

  // 2. Descompressão e validação do JSON
  const compressed = fs.readFileSync(filePath);
  const decompressed = zlib.gunzipSync(compressed).toString('utf-8');
  const snapshot = JSON.parse(decompressed);

  if (!snapshot.files || typeof snapshot.files !== 'object' || snapshot.metadata?.version !== '2.0.0' || snapshot.metadata?.encoding !== 'base64') {
    throw new Error(`Estrutura de dados corrompida dentro do backup.`);
  }

  // Validate every path and payload before touching destination files. Legacy text snapshots
  // cannot safely recover SQLite and must be handled separately by an operator.
  const files = Object.entries(snapshot.files).map(([name, value]) => {
    const target = dataPath(name);
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('INVALID_BACKUP_PAYLOAD');
    const content = Buffer.from(value, 'base64');
    return { target, content };
  });

  // 3. Backup de segurança antes do restore (Salvaguarda de contingência)
  await createFullBackup('manual');

  // 4. Restauração dos arquivos
  for (const { target, content } of files) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // No connection may be open; remove stale SQLite sidecars before replacing its main file.
    if (/\.(sqlite|db)$/.test(target)) {
      for (const suffix of ['-wal', '-shm']) if (fs.existsSync(target + suffix)) fs.unlinkSync(target + suffix);
    }
    const staged = target + '.tmp';
    fs.writeFileSync(staged, content);
    fs.renameSync(staged, target);
  }

  console.info(`[Backup] 🔄 Restauração do backup ${filename} concluída com sucesso!`);
  return { success: true, message: `Backup ${filename} restaurado com sucesso.` };
}

/**
 * Aplica política de retenção de 30 dias para backups diários
 */
function applyRetentionPolicy(list: BackupMetadata[]): void {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const toKeep: BackupMetadata[] = [];
  const toDelete: BackupMetadata[] = [];

  for (const item of list) {
    const time = new Date(item.createdAt).getTime();
    // Mantém backups criados nos últimos 30 dias ou os 5 mais recentes como segurança
    if (time > thirtyDaysAgo || toKeep.length < 5) {
      toKeep.push(item);
    } else {
      toDelete.push(item);
    }
  }

  for (const del of toDelete) {
    try {
      const p = path.join(BACKUP_DIR, del.filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      if (fs.existsSync(`${p}.sha256`)) fs.unlinkSync(`${p}.sha256`);
      console.info(`[Backup] 🗑️ Backup antigo removido pela política de retenção: ${del.filename}`);
    } catch {}
  }

  list.length = 0;
  list.push(...toKeep);
}

/**
 * Status consolidado do subsistema de backup
 */
export function getBackupStatus(): BackupStatus {
  const index = loadBackupIndex();
  const last = index.length > 0 ? index[0] : null;

  // Próximo agendado (Próximas 03:00 da manhã)
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(3, 0, 0, 0);

  const destination = 'Local (/app/data/backups); cópia externa deve ser configurada pelo operador';

  return {
    lastBackup: last,
    nextScheduledBackup: next.toISOString(),
    totalBackups: index.length,
    storageDestination: destination,
    retentionDays: 30,
  };
}

/**
 * Inicializa o agendamento de backup diário (03:00)
 */
export function initBackupScheduler(): void {
  // Executa verificação a cada 1 hora se já passou das 03:00 e não houve backup no dia
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 3 && now.getMinutes() < 15) {
      const status = getBackupStatus();
      const lastDate = status.lastBackup ? new Date(status.lastBackup.createdAt).toDateString() : '';
      if (lastDate !== now.toDateString()) {
        console.info('[Backup Scheduler] ⏰ Disparando backup automático diário agendado...');
        try {
          await createFullBackup('scheduled');
        } catch (e) {
          console.error('[Backup Scheduler] Erro ao criar backup diário agendado:', e);
        }
      }
    }
  }, 15 * 60 * 1000);
}
