// Destructive restore/upgrade probes operate only on newly created temp files.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-storage-audit-'));
process.chdir(cwd);
const { DatabaseService, MIGRATIONS } = await import(pathToFileURL(path.join(root, 'src/db/database.ts')).href);
const { createFullBackup, restoreBackup } = await import(pathToFileURL(path.join(root, 'src/services/backupService.ts')).href);
const results = [];
function record(name, pass, evidence) {
  results.push({ name, pass, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${evidence}`);
}
fs.mkdirSync('data');
const dbPath = path.join(cwd, 'data/binary.sqlite');
let db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE binary_fixture (content BLOB)');
db.prepare('INSERT INTO binary_fixture VALUES (?)').run(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
db.close();
const original = fs.readFileSync(dbPath);
const backup = await createFullBackup('manual');
await restoreBackup(backup.filename);
record('SQLite backup roundtrip preserves bytes', original.equals(fs.readFileSync(dbPath)), 'Closed database with binary fixture; comparison before/after actual backup+restore');

const upgradePath = path.join(cwd, 'upgrade.sqlite');
db = new DatabaseSync(upgradePath);
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
for (const migration of MIGRATIONS.filter(item => item.id < 6)) {
  db.exec(migration.sql);
  db.prepare('INSERT INTO _migrations VALUES (?, ?, ?)').run(migration.id, migration.name, new Date().toISOString());
}
db.exec("INSERT INTO users VALUES ('fixture-user','audit@example.invalid','audit','synthetic-hash','cadet','active','2026-01-01','2026-01-01'); INSERT INTO profiles (id,user_id,full_name,created_at,updated_at) VALUES ('fixture-profile','fixture-user','Preserve Me','2026-01-01','2026-01-01')");
db.close();
try {
  const upgraded = new DatabaseService(upgradePath);
  const count = upgraded.getRawDb().prepare('SELECT count(*) AS n FROM profiles').get().n;
  record('migration 6 preserves existing profiles', count === 1, `Profiles remaining after upgrade: ${count}`);
  upgraded.close();
} catch (error) { record('migration 6 preserves existing profiles', false, error.message); }
fs.writeFileSync(path.join(cwd, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Isolated evidence: ${cwd}`);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
