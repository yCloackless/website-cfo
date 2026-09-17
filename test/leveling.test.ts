import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

test('F-01: rota de nivelamento está registrada em toda a navegação protegida', () => {
  const app = readSource('src/App.tsx');
  const sidebar = readSource('src/components/TacticalSidebar.tsx');
  const maintenance = readSource('src/components/admin/AdminMaintenanceTab.tsx');

  assert.match(app, /['"]\/nivelamento['"]/);
  assert.match(app, /activeTab === ['"]leveling['"]/);
  assert.match(sidebar, /leveling:\s*['"]\/nivelamento['"]/);
  assert.match(sidebar, /['"]\/nivelamento['"]:\s*['"]leveling['"]/);
  assert.match(maintenance, /key:\s*['"]leveling['"]/);
});
