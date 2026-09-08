import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-user-state-'));
const { DatabaseService } = await import(pathToFileURL(path.join(root, 'src/db/database.ts')).href);
const { UserStateRepository } = await import(pathToFileURL(path.join(root, 'src/db/repositories.ts')).href);
const dbPath = path.join(cwd, 'cfo_app.sqlite');

let db = new DatabaseService(dbPath);
const raw = db.getRawDb();
raw.prepare(`INSERT INTO users (id,email,username,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
  .run('user-a', 'a@example.invalid', 'aluno-a', 'fixture', 'cadet', 'active', '2026-01-01', '2026-01-01');
raw.prepare(`INSERT INTO users (id,email,username,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
  .run('user-b', 'b@example.invalid', 'aluno-b', 'fixture', 'cadet', 'active', '2026-01-01', '2026-01-01');
const repo = new UserStateRepository(raw);
repo.upsert('user-a', { cfo_progress: JSON.stringify({ completed: true }), cfo_bizuario_items: JSON.stringify([{ id: 'bizu-a' }]) });
repo.upsert('user-b', { cfo_progress: JSON.stringify({ completed: false }) });
db.close();

db = new DatabaseService(dbPath);
const reopened = new UserStateRepository(db.getRawDb());
assert.deepEqual(JSON.parse(reopened.get('user-a').payload.cfo_progress), { completed: true });
assert.equal(JSON.parse(reopened.get('user-b').payload.cfo_progress).completed, false);
assert.equal(reopened.get('user-a').payload.cfo_bizuario_items.includes('bizu-a'), true);
assert.equal(reopened.get('user-a').payload.cfo_progress.includes('false'), false);
assert.equal(db.getRawDb().prepare('SELECT COUNT(*) AS count FROM _migrations WHERE id = 8').get().count, 1);
db.close();
console.log('PASS user state survives database close/reopen and remains isolated by user_id');
