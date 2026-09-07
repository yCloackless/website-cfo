import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

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
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup_${timestamp}`;
  const filename = `${backupId}.json.gz`;
  const filePath = path.join(BACKUP_DIR, filename);

  const filesToBackup = fs.readdirSync(DATA_DIR).filter((f) => {
    return f !== 'backups' && !f.endsWith('.tmp');
  });

  const snapshot: Record<string, any> = {
    metadata: {
      id: backupId,
      createdAt: new Date().toISOString(),
      type,
      version: '1.0.0',
    },
    files: {},
  };

  for (const file of filesToBackup) {
    const fullPath = path.join(DATA_DIR, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        snapshot.files[file] = fs.readFileSync(fullPath, 'utf-8');
      } else if (stat.isDirectory() && file === 'user-backups') {
        const userFiles = fs.readdirSync(fullPath);
        snapshot.userBackups = {};
        for (const uf of userFiles) {
          snapshot.userBackups[uf] = fs.readFileSync(path.join(fullPath, uf), 'utf-8');
        }
      }
    } catch (e) {
      console.warn(`[Backup] Não foi possível ler arquivo ${file}:`, e);
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
  const filePath = path.join(BACKUP_DIR, filename);
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
  ensureBackupDir();
  const filePath = path.join(BACKUP_DIR, filename);
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

  if (!snapshot.files || typeof snapshot.files !== 'object') {
    throw new Error(`Estrutura de dados corrompida dentro do backup.`);
  }

  // 3. Backup de segurança antes do restore (Salvaguarda de contingência)
  await createFullBackup('manual');

  // 4. Restauração dos arquivos
  for (const [fname, content] of Object.entries(snapshot.files)) {
    const target = path.join(DATA_DIR, fname);
    fs.writeFileSync(target, content as string, 'utf-8');
  }

  if (snapshot.userBackups && typeof snapshot.userBackups === 'object') {
    const userDir = path.join(DATA_DIR, 'user-backups');
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    for (const [uf, content] of Object.entries(snapshot.userBackups)) {
      fs.writeFileSync(path.join(userDir, uf), content as string, 'utf-8');
    }
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

  const destination = process.env.BACKUP_S3_BUCKET
    ? `S3 Compatible (${process.env.BACKUP_S3_BUCKET}) + Local (/app/data/backups)`
    : 'Local Protegido (/app/data/backups)';

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
    if (now.getHours() === 3) {
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
  }, 60 * 60 * 1000);
}
