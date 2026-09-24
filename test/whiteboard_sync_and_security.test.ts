import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { DatabaseService } from '../src/db/database';
import { WhiteboardRepository } from '../src/db/whiteboardRepository';
import { createWhiteboardRouter } from '../src/routes/whiteboardRouter';
import { whiteboardRealtimeHub } from '../src/services/whiteboard/whiteboardRealtimeHub';
import { validateWhiteboardImageBuffer } from '../src/services/whiteboard/whiteboardStorage';

test('Whiteboard Repository & Multi-Tenant Security Tests', async (t) => {
  const dbService = new DatabaseService(':memory:');
  const repo = new WhiteboardRepository(dbService.getRawDb());

  const userA = 'user_cadet_a';
  const userB = 'user_cadet_b';

  // Inserir usuários no banco em memória
  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(userA, 'cadet_a@cbmerj.com', 'cadet_a');

  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(userB, 'cadet_b@cbmerj.com', 'cadet_b');

  await t.test('1. User A cria quadro e User B não consegue acessar (Zero IDOR)', () => {
    const boardA = repo.createWhiteboard(userA, 'board_123', 'Física - Termodinâmica', 'dots');
    assert.equal(boardA.id, 'board_123');
    assert.equal(boardA.version, 1);
    assert.equal(boardA.background_type, 'dots');

    // User A acessa normalmente
    const fetchedA = repo.getWhiteboard(userA, 'board_123');
    assert.ok(fetchedA);
    assert.equal(fetchedA.board.title, 'Física - Termodinâmica');

    // User B tenta acessar o ID do User A -> Retorna null (zero vazamento de dados)
    const fetchedB = repo.getWhiteboard(userB, 'board_123');
    assert.equal(fetchedB, null);
  });

  await t.test('2. Versionamento monotônico e proteção contra conflitos', () => {
    // Salvamento com versão 1 -> Avança para versão 2
    const save1 = repo.saveDocument(userA, 'board_123', '{"shapes":{"shape1":{}}}', 1);
    assert.equal(save1.success, true);
    assert.equal(save1.conflict, false);
    assert.equal(save1.version, 2);

    // Tablet salvou e avançou para versão 3
    const save2 = repo.saveDocument(userA, 'board_123', '{"shapes":{"shape1":{},"shape2":{}}}', 2);
    assert.equal(save2.version, 3);

    // PC tenta enviar salvamento antigo (versão 1) quando servidor já está na versão 3
    const staleSave = repo.saveDocument(userA, 'board_123', '{"shapes":{"shape1_old":{}}}', 1);
    assert.equal(staleSave.success, false);
    assert.equal(staleSave.conflict, true);
    assert.equal(staleSave.version, 3);
    assert.ok(staleSave.currentDocumentState?.includes('shape2'));
  });

  await t.test('3. Criação e isolamento de assets no banco', () => {
    const asset = repo.createAsset({
      id: 'asset_q1',
      whiteboardId: 'board_123',
      userId: userA,
      filename: 'questao_1.png',
      storageKey: 'whiteboard-assets/user_cadet_a/board_123/asset_q1.png',
      mimeType: 'image/png',
      fileSize: 1024,
      width: 800,
      height: 600,
    });
    assert.equal(asset.id, 'asset_q1');

    // User A acessa seu asset
    const getA = repo.getAsset(userA, 'asset_q1');
    assert.ok(getA);
    assert.equal(getA.filename, 'questao_1.png');

    // User B tenta acessar asset do User A -> Retorna null
    const getB = repo.getAsset(userB, 'asset_q1');
    assert.equal(getB, null);
  });

  await t.test('4. Validação rigorosa de Magic Bytes em imagens', () => {
    // PNG válido (89 50 4E 47 ...)
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const valPng = validateWhiteboardImageBuffer(pngBuffer);
    assert.equal(valPng.mimeType, 'image/png');
    assert.equal(valPng.extension, 'png');

    // JPEG válido (FF D8 FF ...)
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const valJpeg = validateWhiteboardImageBuffer(jpegBuffer);
    assert.equal(valJpeg.mimeType, 'image/jpeg');

    // Arquivo falso / executável disfarçado -> Lança INVALID_IMAGE_MAGIC_BYTES
    const fakeBuffer = Buffer.from('MZ...fake executable content');
    assert.throws(() => {
      validateWhiteboardImageBuffer(fakeBuffer);
    }, /INVALID_IMAGE_MAGIC_BYTES/);
  });

  await t.test('5. Realtime Hub e Broadcast sem eco', (done) => {
    let received = 0;
    const mockRes1: any = {
      write: (data: string) => {
        if (data.includes('VERSION_UPDATE')) received++;
      },
      on: () => {},
    };
    const mockRes2: any = {
      write: (data: string) => {
        if (data.includes('VERSION_UPDATE')) received++;
      },
      on: () => {},
    };

    whiteboardRealtimeHub.registerClient({
      userId: userA,
      boardId: 'board_rt',
      deviceId: 'device_pc',
      res: mockRes1,
    });

    whiteboardRealtimeHub.registerClient({
      userId: userA,
      boardId: 'board_rt',
      deviceId: 'device_tablet',
      res: mockRes2,
    });

    // Enviar broadcast originado no PC -> Deve entregar apenas no Tablet (sem eco no PC)
    whiteboardRealtimeHub.broadcastToBoard('board_rt', {
      type: 'VERSION_UPDATE',
      boardId: 'board_rt',
      version: 5,
      updatedAt: new Date().toISOString(),
      senderDeviceId: 'device_pc',
    });

    assert.equal(received, 1);
  });
});
