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
import { validateR2Environment } from '../src/services/anki/ankiMediaStorage';

// Minimal real 1x1 transparent PNG buffer
const REAL_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// Minimal real 1x1 JPEG buffer
const REAL_JPEG_BUFFER = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
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

test('2. Media uses private S3-compatible storage with logical prefix and remains readable from a new repository instance', async () => {
  const { userRepo, ankiRepo, rawDb, cleanup } = createTempDb();
  const originalEnv = {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    bucket: process.env.BACKUP_S3_BUCKET,
    access: process.env.BACKUP_S3_ACCESS_KEY,
    secret: process.env.BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION,
  };
  const objects = new Map<string, { buffer: Buffer; contentType?: string }>();
  const objectServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      assert.match(req.headers.authorization || '', /Credential=test-access\/.+\/auto\/s3\/aws4_request/);
      const key = new URL(req.url!, 'http://localhost').pathname;
      if (req.method === 'PUT') {
        const ct = req.headers['content-type'] as string | undefined;
        objects.set(key, { buffer: Buffer.concat(chunks), contentType: ct });
        res.writeHead(200).end();
      } else if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204).end();
      } else if (objects.has(key)) {
        const item = objects.get(key)!;
        res.writeHead(200, { 'content-type': item.contentType || 'image/png' }).end(item.buffer);
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
    const expectedLegacyPath = `anki-media/${user.id}/${legacy.id}.png`;
    assert.equal(rawDb.prepare('SELECT storage_path FROM anki_media WHERE id = ?').get(legacy.id)?.storage_path, expectedLegacyPath);
    assert.deepEqual(objects.get(`/private-test-bucket/${expectedLegacyPath}`)?.buffer, REAL_PNG_BUFFER);

    const media = await ankiRepo.saveMedia(user.id, 'diagram.png', REAL_PNG_BUFFER, 'image/png');
    const expectedMediaPath = `anki-media/${user.id}/${media.id}.png`;
    assert.equal(media.storagePath, expectedMediaPath);
    assert.equal(rawDb.prepare('SELECT storage_path FROM anki_media WHERE id = ?').get(media.id)?.storage_path, media.storagePath);
    assert.deepEqual(objects.get(`/private-test-bucket/${media.storagePath}`)?.buffer, REAL_PNG_BUFFER);
    assert.equal(objects.get(`/private-test-bucket/${media.storagePath}`)?.contentType, 'image/png');

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

test('3. Media Upload: rejects invalid magic bytes and oversized payloads (> 5MB)', async () => {
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

test('4. AnkiRenderer: rewriteMediaUrls preserves absolute URLs and resolves relative media', () => {
  // Relative filename rewritten
  const html1 = '<p>Questão com diagrama:</p><img src="paste_12345.png" alt="Figura">';
  const out1 = AnkiRenderer.rewriteMediaUrls(html1);
  assert.strictEqual(out1, '<p>Questão com diagrama:</p><img src="/api/anki/media/paste_12345.png" alt="Figura">');

  // Absolute / already prefixed preserved
  const html2 = '<img src="/api/anki/media/test.png"><img src="https://example.com/pic.jpg"><img src="data:image/png;base64,abc">';
  const out2 = AnkiRenderer.rewriteMediaUrls(html2);
  assert.strictEqual(out2, html2);
});

test('5. Note Management: PATCH /api/anki/notes/:id updates fields and tags', async () => {
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

test('6. Complete lifecycle flow: upload image -> create flashcard -> reload -> restart backend -> edit/replace image -> delete image -> multi-tenant security', async () => {
  const { userRepo, rawDb, cleanup } = createTempDb();
  const originalEnv = {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    bucket: process.env.BACKUP_S3_BUCKET,
    access: process.env.BACKUP_S3_ACCESS_KEY,
    secret: process.env.BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION,
  };

  const s3Storage = new Map<string, { buffer: Buffer; contentType?: string }>();
  const mockS3Server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://localhost');
      const key = url.pathname;
      if (req.method === 'PUT') {
        const ct = req.headers['content-type'] as string | undefined;
        s3Storage.set(key, { buffer: Buffer.concat(chunks), contentType: ct });
        res.writeHead(200).end();
      } else if (req.method === 'DELETE') {
        s3Storage.delete(key);
        res.writeHead(204).end();
      } else if (req.method === 'GET') {
        if (s3Storage.has(key)) {
          const item = s3Storage.get(key)!;
          res.writeHead(200, { 'content-type': item.contentType || 'image/png' }).end(item.buffer);
        } else {
          res.writeHead(404).end();
        }
      } else {
        res.writeHead(405).end();
      }
    });
  });

  await new Promise<void>((resolve) => mockS3Server.listen(0, '127.0.0.1', resolve));
  const s3Port = (mockS3Server.address() as any).port;

  process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${s3Port}`;
  process.env.BACKUP_S3_BUCKET = 'rumo-cfo-midia';
  process.env.BACKUP_S3_ACCESS_KEY = 'test-r2-access-key';
  process.env.BACKUP_S3_SECRET_KEY = 'test-r2-secret-key';
  process.env.BACKUP_S3_REGION = 'auto';

  try {
    let repo = new AnkiRepository(rawDb);
    const user1 = userRepo.create({ username: 'cadete_flow_1', email: 'flow1@cfo.test', passwordHash: 'hash' });
    const user2 = userRepo.create({ username: 'cadete_flow_2', email: 'flow2@cfo.test', passwordHash: 'hash' });
    const nts = repo.ensureDefaultNoteTypes(user1.id);
    const deck = repo.createDeck(user1.id, { name: 'Física Térmica' });

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    let activeUserId = user1.id;
    const authMiddleware = (req: any, _res: any, next: any) => {
      req.user = { userId: activeUserId, username: activeUserId };
      next();
    };

    app.use('/api/anki', createAnkiRouter(authMiddleware, () => repo));

    const apiServer = http.createServer(app);
    await new Promise<void>((resolve) => apiServer.listen(0, resolve));
    const apiPort = (apiServer.address() as any).port;

    try {
      // 1. Upload first image (PNG)
      const upload1Res = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/png;base64,${REAL_PNG_BUFFER.toString('base64')}`,
          filename: 'termodinamica.png',
        }),
      });
      assert.strictEqual(upload1Res.status, 200);
      const upload1Data: any = await upload1Res.json();
      assert.ok(upload1Data.success);
      assert.ok(upload1Data.filename.includes('termodinamica'));
      const img1Url = upload1Data.url;
      const img1Filename = upload1Data.filename;

      // Verify stored in R2 mock with logical key: /rumo-cfo-midia/anki-media/{user1.id}/{uuid}.png
      const media1Db = rawDb.prepare('SELECT * FROM anki_media WHERE user_id = ? AND filename = ?').get(user1.id, img1Filename) as any;
      assert.ok(media1Db);
      assert.ok(media1Db.storage_path.startsWith(`anki-media/${user1.id}/`));
      assert.ok(media1Db.storage_path.endsWith('.png'));
      assert.ok(s3Storage.has(`/rumo-cfo-midia/${media1Db.storage_path}`));
      assert.deepEqual(s3Storage.get(`/rumo-cfo-midia/${media1Db.storage_path}`)?.buffer, REAL_PNG_BUFFER);
      assert.equal(s3Storage.get(`/rumo-cfo-midia/${media1Db.storage_path}`)?.contentType, 'image/png');

      // 2. Create Flashcard referencing the image
      const noteCreated = repo.createNote(user1.id, {
        deckId: deck.id,
        notetypeId: nts[0].id,
        fields: [`Qual é a 1ª Lei da Termodinâmica?<br><img src="${img1Url}">`, 'ΔU = Q - W'],
        tags: ['fisica', 'termo'],
      });
      assert.ok(noteCreated.note.id);

      // 3. Reload page / fetch media from backend
      const getImg1 = await fetch(`http://127.0.0.1:${apiPort}${img1Url}`);
      assert.strictEqual(getImg1.status, 200);
      assert.strictEqual(getImg1.headers.get('content-type'), 'image/png');
      const buf1 = Buffer.from(await getImg1.arrayBuffer());
      assert.deepEqual(buf1, REAL_PNG_BUFFER);

      // 4. Simulate backend restart: new AnkiRepository instance with fresh state
      repo = new AnkiRepository(rawDb);
      const afterRestartMedia = await repo.getMedia(user1.id, img1Filename);
      assert.ok(afterRestartMedia);
      assert.deepEqual(afterRestartMedia.buffer, REAL_PNG_BUFFER);
      assert.equal(afterRestartMedia.media.mimeType, 'image/png');

      // 5. Upload second image (JPEG) to replace the first image
      const upload2Res = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/jpeg;base64,${REAL_JPEG_BUFFER.toString('base64')}`,
          filename: 'ciclo_carnot.jpg',
        }),
      });
      assert.strictEqual(upload2Res.status, 200);
      const upload2Data: any = await upload2Res.json();
      const img2Url = upload2Data.url;
      const img2Filename = upload2Data.filename;

      const media2Db = rawDb.prepare('SELECT * FROM anki_media WHERE user_id = ? AND filename = ?').get(user1.id, img2Filename) as any;
      assert.ok(s3Storage.has(`/rumo-cfo-midia/${media2Db.storage_path}`));

      // 6. Edit flashcard: replace image 1 with image 2
      const patchRes = await fetch(`http://127.0.0.1:${apiPort}/api/anki/notes/${noteCreated.note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: [`Qual é o rendimento no ciclo de Carnot?<br><img src="${img2Url}">`, 'η = 1 - T_f / T_q'],
        }),
      });
      assert.strictEqual(patchRes.status, 200);

      // Verify that image 1 was removed from R2 because it is no longer referenced anywhere
      assert.strictEqual(s3Storage.has(`/rumo-cfo-midia/${media1Db.storage_path}`), false);
      const deletedMedia1Db = rawDb.prepare('SELECT * FROM anki_media WHERE user_id = ? AND filename = ?').get(user1.id, img1Filename);
      assert.equal(deletedMedia1Db, undefined);

      // Verify image 2 is still in R2
      assert.strictEqual(s3Storage.has(`/rumo-cfo-midia/${media2Db.storage_path}`), true);

      // 7. Explicit delete: delete image 2 via DELETE /api/anki/media/:filename
      const deleteRes = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/${img2Filename}`, {
        method: 'DELETE',
      });
      assert.strictEqual(deleteRes.status, 200);
      const deleteData: any = await deleteRes.json();
      assert.strictEqual(deleteData.success, true);

      // Verify image 2 removed from R2 mock and database
      assert.strictEqual(s3Storage.has(`/rumo-cfo-midia/${media2Db.storage_path}`), false);
      const deletedMedia2Db = rawDb.prepare('SELECT * FROM anki_media WHERE user_id = ? AND filename = ?').get(user1.id, img2Filename);
      assert.equal(deletedMedia2Db, undefined);

      // 8. Multi-tenant security check: user2 cannot access user1's images
      // Upload a new private image for user 1
      const upload3Res = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: `data:image/png;base64,${REAL_PNG_BUFFER.toString('base64')}`,
          filename: 'confidencial_u1.png',
        }),
      });
      const upload3Data: any = await upload3Res.json();
      const u1PrivateFilename = upload3Data.filename;

      // Switch auth to user2
      activeUserId = user2.id;
      const u2GetRes = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/${u1PrivateFilename}`);
      assert.strictEqual(u2GetRes.status, 404);

      const u2DelRes = await fetch(`http://127.0.0.1:${apiPort}/api/anki/media/${u1PrivateFilename}`, {
        method: 'DELETE',
      });
      assert.strictEqual(u2DelRes.status, 404);
    } finally {
      apiServer.close();
    }
  } finally {
    mockS3Server.close();
    const restore = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore('BACKUP_S3_ENDPOINT', originalEnv.endpoint);
    restore('BACKUP_S3_BUCKET', originalEnv.bucket);
    restore('BACKUP_S3_ACCESS_KEY', originalEnv.access);
    restore('BACKUP_S3_SECRET_KEY', originalEnv.secret);
    restore('BACKUP_S3_REGION', originalEnv.region);
    cleanup();
  }
});

test('7. Environment validation check at backend startup reports missing variables without leaking secrets', () => {
  const originalEnv = {
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    bucket: process.env.BACKUP_S3_BUCKET,
    access: process.env.BACKUP_S3_ACCESS_KEY,
    secret: process.env.BACKUP_S3_SECRET_KEY,
    region: process.env.BACKUP_S3_REGION,
  };

  try {
    delete process.env.BACKUP_S3_ENDPOINT;
    delete process.env.BACKUP_S3_BUCKET;
    delete process.env.BACKUP_S3_ACCESS_KEY;
    delete process.env.BACKUP_S3_SECRET_KEY;

    const check1 = validateR2Environment();
    assert.strictEqual(check1.valid, false);
    assert.ok(check1.missing.includes('BACKUP_S3_ENDPOINT'));
    assert.ok(check1.missing.includes('BACKUP_S3_BUCKET'));
    assert.ok(check1.missing.includes('BACKUP_S3_ACCESS_KEY'));
    assert.ok(check1.missing.includes('BACKUP_S3_SECRET_KEY'));
    assert.strictEqual(check1.region, 'auto');

    // Partial config
    process.env.BACKUP_S3_ENDPOINT = 'https://account123.r2.cloudflarestorage.com';
    process.env.BACKUP_S3_BUCKET = 'rumo-cfo-midia';
    const check2 = validateR2Environment();
    assert.strictEqual(check2.valid, false);
    assert.strictEqual(check2.missing.length, 2);
    assert.ok(check2.missing.includes('BACKUP_S3_ACCESS_KEY'));
    assert.ok(check2.missing.includes('BACKUP_S3_SECRET_KEY'));

    // Full config
    process.env.BACKUP_S3_ACCESS_KEY = 'minha_chave_secreta_de_acesso';
    process.env.BACKUP_S3_SECRET_KEY = 'meu_token_super_secreto_r2';
    const check3 = validateR2Environment();
    assert.strictEqual(check3.valid, true);
    assert.strictEqual(check3.missing.length, 0);
    assert.strictEqual(check3.bucket, 'rumo-cfo-midia');
    assert.strictEqual(check3.endpointHost, 'account123.r2.cloudflarestorage.com');
    // Ensure check3 object does NOT contain raw secret values
    assert.strictEqual((check3 as any).accessKey, undefined);
    assert.strictEqual((check3 as any).secretKey, undefined);
  } finally {
    const restore = (key: string, value: string | undefined) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore('BACKUP_S3_ENDPOINT', originalEnv.endpoint);
    restore('BACKUP_S3_BUCKET', originalEnv.bucket);
    restore('BACKUP_S3_ACCESS_KEY', originalEnv.access);
    restore('BACKUP_S3_SECRET_KEY', originalEnv.secret);
    restore('BACKUP_S3_REGION', originalEnv.region);
  }
});
