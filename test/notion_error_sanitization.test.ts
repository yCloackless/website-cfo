process.env.NODE_ENV = 'test';
process.env.NOTION_API_KEY = 'synthetic-notion-key';
process.env.NOTION_DATABASE_ID = 'synthetic-notion-database';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-notion-error-'));
const originalCwd = process.cwd();
process.chdir(tempDir);
const nativeFetch = globalThis.fetch;
const { fetchRevisoesFromNotion } = await import('../notionBackend');

test.after(() => {
  globalThis.fetch = nativeFetch;
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Notion network errors return a stable public code without exception details', async () => {
  globalThis.fetch = async () => { throw new Error('synthetic internal host and credential detail'); };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const result = await fetchRevisoesFromNotion();
    assert.equal(result.error, 'NOTION_UNAVAILABLE');
    assert.equal(result.error?.includes('synthetic'), false);
  } finally {
    console.error = originalError;
  }
});
