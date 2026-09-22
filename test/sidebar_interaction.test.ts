import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('a barra lateral responde sem temporizadores e fecha após navegar', async () => {
  const source = await readFile(new URL('../src/components/TacticalSidebar.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /openTimerRef|closeTimerRef|setTimeout\(/);
  assert.match(source, /const handleMouseEnter = \(\) => \{\s*setIsHovered\(true\);\s*\};/);
  assert.match(source, /const handleMouseLeave = \(\) => \{\s*setIsHovered\(false\);\s*\};/);
  assert.match(source, /const handleItemClick = \(item: SidebarItem\) => \{\s*setIsHovered\(false\);\s*setIsFocused\(false\);/);
});
