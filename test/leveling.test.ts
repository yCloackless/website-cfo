import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateLevelingAccuracy,
  clampLevelingCount,
  hasPassedLeveling,
  MAX_LEVELING_QUESTIONS,
  requiredLevelingCorrect,
} from '../src/utils/leveling';

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

test('F-02: quantidades são truncadas e limitadas para proteger a interface', () => {
  assert.equal(clampLevelingCount('30'), 30);
  assert.equal(clampLevelingCount('30.9'), 30);
  assert.equal(clampLevelingCount('-10'), 0);
  assert.equal(clampLevelingCount('999999999'), MAX_LEVELING_QUESTIONS);
  assert.equal(clampLevelingCount(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampLevelingCount('40', 25), 25);
});

test('F-03: persistência espera a hidratação antes de gravar o estado', () => {
  const component = readSource('src/components/LevelingTab.tsx');

  assert.match(component, /const \[isHydrated, setIsHydrated\] = useState\(false\)/);
  assert.match(component, /finally\s*{\s*setIsHydrated\(true\)/);
  assert.match(component, /if \(!isHydrated\) return;\s*const snapshot/);
});

test('F-04: meta de 80% usa o total planejado, sem aprovação prematura', () => {
  assert.equal(requiredLevelingCorrect(30), 24);
  assert.equal(calculateLevelingAccuracy(1, 1), 100);
  assert.equal(1 >= requiredLevelingCorrect(30), false);
  assert.equal(hasPassedLeveling(23, 30), false);
  assert.equal(hasPassedLeveling(24, 30), true);
  assert.equal(hasPassedLeveling(3, 4), false);
  assert.equal(hasPassedLeveling(4, 5), true);
  assert.equal(hasPassedLeveling(0, 0), false);
});
