// Runs the existing tests without loading the developer's .env or database.
// Each test file gets its own working directory to avoid shared SQLite state.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = mkdtempSync(path.join(tmpdir(), 'cfo-readiness-'));
const files = ['models', 'auth', 'profile', 'audit_security', 'admin_panel',
  'admin_security_2fa', 'admin_realtime', 'admin_users_management', 'admin_audit',
  'frontend_integration', 'security_review', 'download_functions', 'privacy_minimization',
  'cadet_exclusive_session', 'cadet_security_audit', 'cadet_5h_block_and_alerts',
  'security_hardening', 'csrf_cookie', 'secure_uploads', 'exam_bank', 'exam_phase1_workflow', 'student_learning', 'database_resilience', 'calendar_persistence', 'maintenance_mode', 'study_session_range',
  'lgpd_privacy_compliance', 'zap_remediation', 'honeypot_deception', 'not_found_routing', 'bizuario_enhancements'];
files.push('student_release45');
files.push('emergency_lockdown');
files.push('flashcards_anki');
files.push('anki_real_engine');
files.push('student_study');
files.push('leveling');
files.push('extension_integration');
files.splice(files.indexOf('exam_bank'), 0, 'board_intelligence');
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC|PATHEXT)$/i.test(key)));
env.NODE_ENV = 'test';
Object.assign(env, { ADMIN_PASSWORD: 'fixture-admin-password-2026', CADET_PASSWORD: 'fixture-cadet-password-2026',
  SUPPORT_PASSWORD: 'fixture-support-password-2026', TOTP_SECRET: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  SESSION_SECRET: 'readiness-only-session-secret-64-characters-long-and-not-production',
  DATA_ENCRYPTION_KEY: 'readiness-only-data-encryption-key-never-use-in-production',
  BACKUP_ENCRYPTION_KEY: 'readiness-only-backup-encryption-key-never-use-in-production',
  ADMIN_REQUIRE_2FA: 'true' });
const results = new Array(files.length);
const concurrency = Math.max(1, Math.min(8, Number(process.env.READINESS_CONCURRENCY) || 4));
let nextFile = 0;

async function runTest(name, index) {
  const cwd = mkdtempSync(path.join(reportDir, `${name}-`));
  const child = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'),
    '--test', '--test-reporter=tap', path.join(root, `test/${name}.test.ts`)],
  { cwd, env, timeout: 90000, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const { code, signal, error } = await new Promise(resolve => {
    let error;
    child.once('error', value => { error = value; });
    child.once('close', (code, signal) => resolve({ code, signal, error }));
  });
  const output = `${stdout}\n${stderr}`;
  writeFileSync(path.join(reportDir, `${name}.log`), output);
  const summary = output.split('\n').filter(line => /^# (tests|pass|fail|duration_ms) /.test(line));
  results[index] = { file: name, exitCode: code ?? 1, error: error?.message || (signal ? `signal ${signal}` : undefined), summary };
  console.log(`${name}: exit=${code ?? 1} ${summary.join('; ')}`);
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, async () => {
  while (nextFile < files.length) {
    const index = nextFile++;
    await runTest(files[index], index);
  }
}));
writeFileSync(path.join(reportDir, 'results.json'), JSON.stringify(results, null, 2));
console.log(`Isolated evidence: ${reportDir}`);
process.exitCode = results.every(result => result.exitCode === 0) ? 0 : 1;
