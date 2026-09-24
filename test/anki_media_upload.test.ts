process.env.NODE_ENV = 'test';
delete process.env.ADMIN_REQUIRE_2FA;

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { DatabaseService } from '../src/db/database';
import { UserRepository } from '../src/db/repositories';
import { AnkiRepository } from '../src/db/ankiRepository';
import { createAnkiRouter } from '../src/routes/ankiRouter';
import { AnkiRenderer } from '../src/services/anki/ankiRenderer';

// Minimal real 1x1 transparent PNG buffer
const REAL_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function createTempDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-anki-media-test-'));
  const dbFile = path.join(tempDir, 'test_anki_media.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const ankiRepo = new AnkiRepository(rawDb);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, rawDb, userRepo, ankiRepo, cleanup };
}

test('1. Media Upload: accepts real image and saves with safe filename and proper magic bytes', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user1 = userRepo.create({ username: 'aluno_media_1', email: 'media1@cfo.test', passwordHash: 'hash' });
    userRepo.create({ username: 'aluno_media_2', email: 'media2@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultNoteTypes(user1.id);
    ankiRepo.createDeck(user1.id, { name: 'Física' });

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    let currentUserId = user1.id;
    const mockAuth = (req: any, _res: any, next: any) => {
      req.user = { userId: currentUserId, username: currentUserId };
      next();
    };

    app.use('/api/anki', createAnkiRouter(mockAuth, () => ankiRepo));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. Upload valid PNG
      const res = await fetch(`http://127.0.0.1:${port}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/png;base64,${REAL_PNG_BUFFER.toString('base64')}`,
          filename: 'questao_12_fisica.png',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.filename.startsWith('questao_12_fisica_'));
      assert.ok(data.filename.endsWith('.png'));
      assert.strictEqual(data.url, `/api/anki/media/${data.filename}`);
      assert.strictEqual(data.mimeType, 'image/png');

      // 2. Fetch the uploaded media asset via GET
      const getRes = await fetch(`http://127.0.0.1:${port}/api/anki/media/${data.filename}`);
      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.headers.get('content-type'), 'image/png');
      assert.strictEqual(getRes.headers.get('x-content-type-options'), 'nosniff');
      const downloadedBuffer = Buffer.from(await getRes.arrayBuffer());
      assert.deepStrictEqual(downloadedBuffer, REAL_PNG_BUFFER);

      // 3. Multi-tenant isolation: u2 cannot access u1's media
      currentUserId = 'media2_id';
      const forbiddenRes = await fetch(`http://127.0.0.1:${port}/api/anki/media/${data.filename}`);
      assert.strictEqual(forbiddenRes.status, 404);
    } finally {
      server.close();
    }
  } finally {
    cleanup();
  }
});

test('Media uses private S3-compatible storage and remains readable from a new repository instance', async () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  const originalEnv = {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    bucket: process.env.BACKUP_S3_BUCKET,
    access: process.env.BACKUP_S3_ACCESS_KEY,
    secret: process.env.BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION,
  };
  const objects = new Map<string, Buffer>();
  const objectServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      assert.match(req.headers.authorization || '', /Credential=test-access\/.+\/auto\/s3\/aws4_request/);
      const key = new URL(req.url!, 'http://localhost').pathname;
      if (req.method === 'PUT') {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200).end();
      } else if (objects.has(key)) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(objects.get(key));
      } else {
        res.writeHead(404).end();
      }
    });
  });

  try {
    const user = userRepo.create({ username: 'anki_s3_user', email: 'anki-s3@cfo.test', passwordHash: 'hash' });
    delete process.env.BACKUP_S3_ENDPOINT;
    delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_ACCESS_KEY;
    delete process.env.BACKUP_S3_SECRET_KEY;
    delete process.env.BACKUP_S3_REGION;
    const legacy = await ankiRepo.saveMedia(user.id, 'legacy.png', REAL_PNG_BUFFER, 'image/png');
    await new Promise<void>((resolve) => objectServer.listen(0, '127.0.0.1', resolve));
    const port = (objectServer.address() as any).port;
    process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${port}`;
    process.env.BACKUP_S3_BUCKET = 'private-test-bucket';
    process.env.BACKUP_S3_ACCESS_KEY = 'test-access';
    process.env.BACKUP_S3_SECRET_KEY = 'test-secret';
    process.env.BACKUP_S3_REGION = 'auto';

    const migrated = await new AnkiRepository(rawDb).getMedia(user.id, legacy.filename);
    assert.deepEqual(migrated?.buffer, REAL_PNG_BUFFER);
    assert.equal(rawDb.prepare('SELECT storage_path FROM anki_media WHERE id = ?').get(legacy.id)?.storage_path, `anki-media/${legacy.id}`);
    assert.deepEqual(objects.get(`/private-test-bucket/anki-media/${legacy.id}`), REAL_PNG_BUFFER);

    const media = await ankiRepo.saveMedia(user.id, 'diagram.png', REAL_PNG_BUFFER, 'image/png');
    assert.equal(media.storagePath, `anki-media/${media.id}`);
    assert.equal(rawDb.prepare('SELECT storage_path FROM anki_media WHERE id = ?').get(media.id)?.storage_path, media.storagePath);
    assert.deepEqual(objects.get(`/private-test-bucket/${media.storagePath}`), REAL_PNG_BUFFER);

    const afterRestart = await new AnkiRepository(rawDb).getMedia(user.id, media.filename);
    assert.deepEqual(afterRestart?.buffer, REAL_PNG_BUFFER);
  } finally {
    objectServer.close();
    const restore = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore('BACKUP_S3_ENDPOINT', originalEnv.endpoint);
    restore('BACKUP_S3_BUCKET', originalEnv.bucket);
    restore('BACKUP_S3_ACCESS_KEY', originalEnv.access);
    restore('BACKUP_S3_SECRET_KEY', originalEnv.secret);
    restore('BACKUP_S3_REGION', originalEnv.region);
    cleanup();
  }
});

test('2. Media Upload: rejects invalid magic bytes and oversized payloads (> 5MB)', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user1 = userRepo.create({ username: 'aluno_sec_1', email: 'sec1@cfo.test', passwordHash: 'hash' });
    ankiRepo.ensureDefaultNoteTypes(user1.id);
    ankiRepo.createDeck(user1.id, { name: 'Química' });

    const app = express();
    app.use(express.json({ limit: '15mb' }));

    const mockAuth = (req: any, _res: any, next: any) => {
      req.user = { userId: user1.id, username: 'aluno_sec_1' };
      next();
    };

    app.use('/api/anki', createAnkiRouter(mockAuth, () => ankiRepo));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. Fake image: executable or script masquerading as PNG
      const evilPayload = Buffer.from('MZ\x90\x00\x03\x00\x00\x00malicious_binary_content');
      const r1 = await fetch(`http://127.0.0.1:${port}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: evilPayload.toString('base64'),
          filename: 'malware.png',
        }),
      });
      assert.strictEqual(r1.status, 400);
      const d1: any = await r1.json();
      assert.strictEqual(d1.error, 'INVALID_IMAGE');

      // 2. Oversized image (> 5MB)
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(largeBuffer, 0);

      const r2 = await fetch(`http://127.0.0.1:${port}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: largeBuffer.toString('base64'),
          filename: 'giant.png',
        }),
      });
      assert.strictEqual(r2.status, 400);
      const d2: any = await r2.json();
      assert.strictEqual(d2.error, 'INVALID_IMAGE');
      assert.ok(d2.message.includes('limite máximo permitido de 5MB'));
    } finally {
      server.close();
    }
  } finally {
    cleanup();
  }
});

test('3. AnkiRenderer: rewriteMediaUrls preserves absolute URLs and resolves relative media', () => {
  // Relative filename rewritten
  const html1 = '<p>Questão com diagrama:</p><img src="paste_12345.png" alt="Figura">';
  const out1 = AnkiRenderer.rewriteMediaUrls(html1);
  assert.strictEqual(out1, '<p>Questão com diagrama:</p><img src="/api/anki/media/paste_12345.png" alt="Figura">');

  // Absolute / already prefixed preserved
  const html2 = '<img src="/api/anki/media/test.png"><img src="https://example.com/pic.jpg"><img src="data:image/png;base64,abc">';
  const out2 = AnkiRenderer.rewriteMediaUrls(html2);
  assert.strictEqual(out2, html2);
});

test('4. Note Management: PATCH /api/anki/notes/:id updates fields and tags', async () => {
  const { userRepo, ankiRepo, cleanup } = createTempDb();

  try {
    const user1 = userRepo.create({ username: 'aluno_note_1', email: 'note1@cfo.test', passwordHash: 'hash' });
    const user2 = userRepo.create({ username: 'aluno_note_2', email: 'note2@cfo.test', passwordHash: 'hash' });
    const nts = ankiRepo.ensureDefaultNoteTypes(user1.id);
    const deck = ankiRepo.createDeck(user1.id, { name: 'Geral' });

    const created = ankiRepo.createNote(user1.id, {
      deckId: deck.id,
      notetypeId: nts[0].id,
      fields: ['Pergunta Original', 'Resposta Original'],
      tags: ['cbmerj'],
    });

    const app = express();
    app.use(express.json());

    let currentUserId = user1.id;
    const mockAuth = (req: any, _res: any, next: any) => {
      req.user = { userId: currentUserId, username: currentUserId };
      next();
    };

    app.use('/api/anki', createAnkiRouter(mockAuth, () => ankiRepo));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    try {
      // 1. Update note fields
      const res = await fetch(`http://127.0.0.1:${port}/api/anki/notes/${created.note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: ['Pergunta com foto: <img src="q.png">', 'Resposta comentada'],
          tags: ['cbmerj', 'revisado'],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.note.fields[0], 'Pergunta com foto: <img src="q.png">');
      assert.ok(data.note.tags.includes('revisado'));

      // 2. Isolation: user2 cannot update user1's note
      currentUserId = user2.id;
      const forbiddenRes = await fetch(`http://127.0.0.1:${port}/api/anki/notes/${created.note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: ['Hacked', 'Hacked'],
        }),
      });
      assert.strictEqual(forbiddenRes.status, 404);
    } finally {
      server.close();
    }
  } finally {
    cleanup();
  }
});
