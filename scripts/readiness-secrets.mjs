// Checks literal private .env values without ever printing those values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const env = fs.existsSync(envPath) ? parse(fs.readFileSync(envPath)) : {};
const secrets = Object.entries(env).filter(([key, value]) =>
  /SECRET|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN/i.test(key) && value.length >= 8 && !/SITE_KEY|PUBLIC/i.test(key));
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const files = walk(path.join(root, 'dist')).filter(file => /\.(js|cjs|map|html|css|json)$/.test(file));
const matches = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [key, value] of secrets) if (text.includes(value)) matches.push({ variable: key, file: path.relative(root, file) });
}
console.log(JSON.stringify({ checkedPrivateValues: secrets.length, checkedTextArtifacts: files.length,
  matches, sourceMaps: files.filter(file => file.endsWith('.map')).map(file => path.relative(root, file)),
  environmentPresence: Object.fromEntries(['NODE_ENV','APP_URL','ADMIN_PASSWORD','ADMIN_PASSWORD_HASH','CADET_PASSWORD',
    'CADET_PASSWORD_HASH','SUPPORT_PASSWORD','TOTP_SECRET','SESSION_SECRET','TURNSTILE_SECRET_KEY',
    'RESEND_API_KEY','EMAIL_FROM','BACKUP_S3_BUCKET'].map(key => [key, !!env[key]])) }, null, 2));
process.exitCode = matches.length ? 1 : 0;
