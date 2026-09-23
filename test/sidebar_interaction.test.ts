import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('a barra lateral responde sem temporizadores e fecha após navegar', async () => {
  const source = await readFile(new URL('../src/components/TacticalSidebar.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /openTimerRef|closeTimerRef|setTimeout\(/);
  assert.match(source, /const handleMouseEnter = \(\) => \{\s*setIsHovered\(true\);\s*\};/);
  assert.match(source, /const handleMouseLeave = \(\) => \{\s*setIsHovered\(false\);\s*setIsFocused\(false\);\s*\};/);
  assert.match(source, /const handleItemClick = \(item: SidebarItem\) => \{\s*setIsHovered\(false\);\s*setIsFocused\(false\);/);
  assert.equal((source.match(/item\.badge && item\.isNumericBadge/g) || []).length, 3);
  assert.ok(source.indexOf('Abrir perfil e configurações') < source.indexOf('/* Nav list Mobile */'));
  assert.ok(source.indexOf('Abrir perfil e configurações') < source.indexOf('/* Navigation Items List Grouped Semantically */'));
  assert.ok(source.indexOf('/* Nav list Mobile */') < source.indexOf('aria-label="Sair da conta"'));
  assert.ok(source.lastIndexOf('Abrir perfil e configurações') < source.lastIndexOf('/* Navigation Items List Grouped Semantically */'));
  assert.ok(source.lastIndexOf('/* Navigation Items List Grouped Semantically */') < source.lastIndexOf('aria-label="Sair da conta"'));
});
