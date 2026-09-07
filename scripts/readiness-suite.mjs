// Runs the existing tests without loading the developer's .env or database.
// Each test file gets its own working directory to avoid shared SQLite state.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = mkdtempSync(path.join(tmpdir(), 'cfo-readiness-'));
const files = ['models', 'auth', 'profile', 'audit_security', 'admin_panel',
  'admin_security_2fa', 'admin_realtime', 'admin_users_management', 'admin_audit',
  'frontend_integration', 'security_review'];
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC|PATHEXT)$/i.test(key)));
env.NODE_ENV = 'test';
const results = [];
for (const name of files) {
  const cwd = mkdtempSync(path.join(reportDir, `${name}-`));
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'),
    '--test', '--test-reporter=tap', path.join(root, `test/${name}.test.ts`)],
  { cwd, env, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  writeFileSync(path.join(reportDir, `${name}.log`), output);
  const summary = output.split('\n').filter(line => /^# (tests|pass|fail|duration_ms) /.test(line));
  results.push({ file: name, exitCode: result.status, error: result.error?.message, summary });
  console.log(`${name}: exit=${result.status} ${summary.join('; ')}`);
}
writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Isolated evidence: ${reportDir}`);
process.exitCode = results.every(result => result.exitCode === 0) ? 0 : 1;
