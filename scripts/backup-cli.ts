import { createFullBackup, restoreBackup, verifyBackupIntegrity } from '../src/services/backupService';

const [command, filename] = process.argv.slice(2);

if (command === 'create') {
  const metadata = await createFullBackup('manual');
  console.log(JSON.stringify(metadata, null, 2));
} else if (command === 'verify' && filename) {
  const result = verifyBackupIntegrity(filename);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
} else if (command === 'restore' && filename) {
  const result = await restoreBackup(filename);
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error('Uso: backup-cli create | verify <arquivo> | restore <arquivo>');
  process.exitCode = 2;
}
