import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';

type PgResult = { rows?: Record<string, unknown>[]; rowCount?: number; command?: string };

const workerSource = `
const { parentPort } = require('node:worker_threads');
const { Pool } = require('pg');

let databaseUrl = process.env.DATABASE_URL || '';
if (databaseUrl && !process.env.RENDER) {
  databaseUrl = databaseUrl.replace(/@(dpg-[a-z0-9]+)(:[0-9]+|[\\/?]|$)/i, (match, host, rest) => {
    if (!host.includes('.')) {
      return '@' + host + '.oregon-postgres.render.com' + rest;
    }
    return match;
  });
}
const needsSsl = databaseUrl.includes('sslmode=require') ||
  process.env.NODE_ENV === 'production' ||
  databaseUrl.includes('neon.tech') ||
  databaseUrl.includes('render.com') ||
  databaseUrl.includes('supabase.co');

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  statement_timeout: 30000,
  query_timeout: 30000,
  application_name: 'cfo-cbmerj-pool',
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

const pending = [];
let ready = false;
let fatalError = null;
let ioPort;

const normalize = (sql) => sql
  .replace(/\\bBEGIN IMMEDIATE TRANSACTION\\b/gi, 'BEGIN')
  .replace(/\\bPRAGMA\\s+[^;]+;?/gi, '')
  .replace(/\\s+COLLATE\\s+NOCASE/gi, '')
  .replace(/\\bINSERT\\s+OR\\s+IGNORE\\s+INTO\\b/gi, 'INSERT INTO')
  .replace(/\\b(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)\\s+INTEGER\\b/gi, '$1 BOOLEAN')
  .replace(/\\b(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)\\s*=\\s*0\\b/gi, '$1 = FALSE')
  .replace(/\\b(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)\\s*=\\s*1\\b/gi, '$1 = TRUE')
  .replace(/\\b(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)\\s+BOOLEAN\\s+NOT NULL DEFAULT\\s+([01])\\b/gi, (_match, column, value) => column + ' BOOLEAN NOT NULL DEFAULT ' + (value === '1' ? 'TRUE' : 'FALSE'))
  .replace(/\\bCHECK\\s*\\(\\s*(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)\\s+IN\\s*\\(\\s*0\\s*,\\s*1\\s*\\)\\s*\\)/gi, '');

// Inicialização com teste de conectividade e circuit breaker
(async () => {
  let attempts = 0;
  while (attempts < 3) {
    try {
      const client = await pool.connect();
      client.release();
      ready = true;
      while (pending.length && ioPort) await handle(pending.shift());
      return;
    } catch (err) {
      attempts++;
      if (attempts >= 3) {
        fatalError = String(err.message || err);
        if (ioPort) {
          while (pending.length) {
            const msg = pending.shift();
            done(msg, { error: fatalError });
          }
          ioPort.postMessage({ fatal: true, error: fatalError });
        }
        return;
      }
      await new Promise((res) => setTimeout(res, attempts * 500));
    }
  }
})().catch((err) => {
  fatalError = String(err.message || err);
  if (ioPort) {
    while (pending.length) {
      const msg = pending.shift();
      done(msg, { error: fatalError });
    }
    ioPort.postMessage({ fatal: true, error: fatalError });
  }
});

async function executeWithRetry(sql, values, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await pool.query({ text: sql, values });
    } catch (err) {
      const isTransient = /ECONNRESET|ETIMEDOUT|57P01|closed unexpectedly|connection timeout/i.test(String(err.message || ''));
      if (isTransient && i < retries) {
        await new Promise((res) => setTimeout(res, (i + 1) * 200));
        continue;
      }
      throw err;
    }
  }
}

async function handle(message) {
  try {
    const sql = normalize(message.sql);
    if (!sql.trim()) return done(message, { rows: [], rowCount: 0 });
    const result = await executeWithRetry(sql, message.params || []);
    const last = Array.isArray(result) ? result[result.length - 1] : result;
    done(message, { rows: last.rows || [], rowCount: last.rowCount || 0, command: last.command });
  } catch (err) {
    done(message, { error: String(err.message || err).replace(/postgresql[^ ]*/gi, '[redacted]') });
  }
}

function done(message, result) {
  if (result.error) ioPort.postMessage({ id: message.id, error: result.error });
  else ioPort.postMessage({ id: message.id, result });
  Atomics.store(new Int32Array(message.signal), 0, 1);
  Atomics.notify(new Int32Array(message.signal), 0);
}

parentPort.on('message', (message) => {
  if (message.port) {
    ioPort = message.port;
    ioPort.on('message', (request) => {
      if (fatalError) {
        done(request, { error: fatalError });
      } else if (ready) {
        void handle(request);
      } else {
        pending.push(request);
      }
    });
  }
});
`;

export function postgresParams(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  let index = 0;
  let text = sql.replace(/\?/g, () => `$${++index}`);
  const values = [...params];
  const boolColumns = '(?:is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)';
  for (const match of text.matchAll(new RegExp(`\\b${boolColumns}\\s*=\\s*\\$(\\d+)`, 'gi'))) values[Number(match[1]) - 1] = Boolean(values[Number(match[1]) - 1]);
  const insert = text.match(/INSERT INTO\s+"?([a-z_]+)"?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insert) {
    const columns = insert[2].split(',').map((column) => column.trim().replaceAll('"', '').toLowerCase());
    const placeholders = [...insert[3].matchAll(/\$(\d+)/g)].map((match) => Number(match[1]) - 1);
    columns.forEach((column, position) => { if (/^(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)$/.test(column) && placeholders[position] !== undefined) values[placeholders[position]] = Boolean(values[placeholders[position]]); });
    const valueTokens = insert[3].split(',').map((token) => token.trim());
    columns.forEach((column, position) => { if (/^(is_used|is_read|is_correct|is_active|can_access_notion|can_access_ifrj|onboarding_completed|is_uncertain|is_manual_review)$/.test(column) && /^(0|1)$/.test(valueTokens[position])) valueTokens[position] = valueTokens[position] === '1' ? 'TRUE' : 'FALSE'; });
    text = text.replace(insert[3], () => valueTokens.join(', '));
  }
  return { text, values };
}

export class PostgresSyncDatabase {
  private readonly worker: Worker;
  private readonly port: MessageChannel['port1'];
  private sequence = 0;

  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.worker = new Worker(workerSource, { eval: true });
    this.worker.postMessage({ port: channel.port2 }, [channel.port2]);
  }

  private request(sql: string, params: unknown[] = []): PgResult {
    const signal = new SharedArrayBuffer(4);
    const id = ++this.sequence;
    const converted = postgresParams(sql, params);
    this.port.postMessage({ id, sql: converted.text, params: converted.values, signal });
    const state = new Int32Array(signal);
    while (Atomics.load(state, 0) === 0) Atomics.wait(state, 0, 0, 1000);
    const response = receiveMessageOnPort(this.port)?.message as { id?: number; error?: string; result?: PgResult } | undefined;
    if (!response || response.id !== id) throw new Error('POSTGRES_SYNC_PROTOCOL_ERROR');
    if (response.error) throw new Error(response.error);
    return response.result || { rows: [], rowCount: 0 };
  }

  exec(sql: string): void { this.request(sql); }

  prepare(sql: string) {
    return {
      get: (...params: unknown[]) => this.request(sql, params).rows?.[0],
      all: (...params: unknown[]) => this.request(sql, params).rows || [],
      run: (...params: unknown[]) => ({ changes: this.request(sql, params).rowCount || 0 }),
    };
  }

  close(): void { void this.worker.terminate(); this.port.close(); }
}
