import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/db/database';
import { WhiteboardRepository } from '../src/db/whiteboardRepository';
import { whiteboardRealtimeHub } from '../src/services/whiteboard/whiteboardRealtimeHub';
import { putWhiteboardMedia, getWhiteboardMedia } from '../src/services/whiteboard/whiteboardStorage';

test('End-to-End Simulation: PC Question Upload <-> Tablet Stylus Solution <-> Real-Time Cloud Sync', async (t) => {
  const dbService = new DatabaseService(':memory:');
  const repo = new WhiteboardRepository(dbService.getRawDb());
  const cadetUserId = 'cadet_sim_101';

  // 1. Setup do Aluno no banco
  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'cadet@cbmerj.com', 'cadet_sim', 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(cadetUserId);

  let createdBoardId = '';
  let uploadedAssetId = '';

  await t.test('PASSO 1 (PC): Criação de quadro de estudos pelo Computador', () => {
    createdBoardId = 'board_fisica_01';
    const board = repo.createWhiteboard(cadetUserId, createdBoardId, 'Física - Termodinâmica e Gases', 'grid');
    assert.equal(board.id, createdBoardId);
    assert.equal(board.version, 1);
    assert.equal(board.background_type, 'grid');
  });

  await t.test('PASSO 2 (PC): Captura de screenshot da questão e upload para o storage', async () => {
    uploadedAssetId = 'asset_question_screen_01';
    // Simular imagem PNG válida de enunciado de prova
    const questionImageBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x02, 0x80, 0x00, 0x00, 0x01, 0xe0,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x35, 0x80, 0xaf,
    ]);

    const storageKey = `whiteboard-assets/${cadetUserId}/${createdBoardId}/${uploadedAssetId}.png`;
    await putWhiteboardMedia(storageKey, questionImageBuffer, 'image/png');

    const asset = repo.createAsset({
      id: uploadedAssetId,
      whiteboardId: createdBoardId,
      userId: cadetUserId,
      filename: 'questao_termo_uerj.png',
      storageKey,
      mimeType: 'image/png',
      fileSize: questionImageBuffer.length,
      width: 640,
      height: 480,
    });

    assert.equal(asset.id, uploadedAssetId);
    assert.equal(asset.mime_type, 'image/png');

    // Salvar documento com a imagem da questão travada no centro
    const pcDocumentState = JSON.stringify({
      document: {
        records: [
          {
            id: `asset:${uploadedAssetId}`,
            typeName: 'asset',
            type: 'image',
            props: { name: 'questao_termo_uerj.png', src: `/api/whiteboard/assets/${uploadedAssetId}`, w: 640, h: 480 },
          },
          {
            id: 'shape:question_img_1',
            typeName: 'shape',
            type: 'image',
            x: 100,
            y: 50,
            isLocked: true, // Fixado por padrão
            props: { assetId: `asset:${uploadedAssetId}`, w: 640, h: 480 },
          },
        ],
      },
    });

    const saveResult = repo.saveDocument(cadetUserId, createdBoardId, pcDocumentState, 1);
    assert.equal(saveResult.success, true);
    assert.equal(saveResult.version, 2);
  });

  await t.test('PASSO 3 (TABLET): Tablet abre o mesmo quadro e encontra o enunciado já disponível', async () => {
    const tabletData = repo.getWhiteboard(cadetUserId, createdBoardId);
    assert.ok(tabletData);
    assert.equal(tabletData.board.version, 2);

    // O enunciado está no documento
    const docParsed = JSON.parse(tabletData.document!.document_state);
    const records = docParsed.document.records;
    const questionShape = records.find((r: any) => r.id === 'shape:question_img_1');
    assert.ok(questionShape);
    assert.equal(questionShape.isLocked, true); // Trava confirmada

    // O arquivo de imagem está íntegro no storage
    const assetMeta = tabletData.assets.find((a) => a.id === uploadedAssetId);
    assert.ok(assetMeta);
    const media = await getWhiteboardMedia(assetMeta.storage_key);
    assert.ok(media);
    assert.equal(media.contentType, 'image/png');
  });

  await t.test('PASSO 4 (TABLET): Aluno escreve cálculos e resolução com Stylus e salva', () => {
    // Escuta eventos SSE simulados no PC
    let pcReceivedEvent: any = null;
    const mockPcConnection: any = {
      write: (data: string) => {
        if (data.startsWith('data:')) {
          pcReceivedEvent = JSON.parse(data.slice(5).trim());
        }
      },
      on: () => {},
    };

    whiteboardRealtimeHub.registerClient({
      userId: cadetUserId,
      boardId: createdBoardId,
      deviceId: 'device_pc_browser',
      res: mockPcConnection,
    });

    // Estado do Tablet com a questão + traços de caneta stylus abaixo dela
    const tabletDocumentState = JSON.stringify({
      document: {
        records: [
          {
            id: `asset:${uploadedAssetId}`,
            typeName: 'asset',
            type: 'image',
            props: { name: 'questao_termo_uerj.png', src: `/api/whiteboard/assets/${uploadedAssetId}`, w: 640, h: 480 },
          },
          {
            id: 'shape:question_img_1',
            typeName: 'shape',
            type: 'image',
            x: 100,
            y: 50,
            isLocked: true,
            props: { assetId: `asset:${uploadedAssetId}`, w: 640, h: 480 },
          },
          // Cálculos manuais da caneta stylus (PV = nRT, cálculo de calor e trabalho)
          {
            id: 'shape:stroke_calc_1',
            typeName: 'shape',
            type: 'draw',
            x: 100,
            y: 580,
            props: {
              color: 'white',
              size: 'm',
              segments: [{ points: [{ x: 0, y: 0, z: 0.8 }, { x: 50, y: 20, z: 0.9 }] }],
            },
          },
          {
            id: 'shape:stroke_calc_2_highlight',
            typeName: 'shape',
            type: 'highlight',
            x: 100,
            y: 650,
            props: {
              color: 'yellow',
              size: 'l',
              segments: [{ points: [{ x: 0, y: 0, z: 0.5 }, { x: 120, y: 0, z: 0.5 }] }],
            },
          },
        ],
      },
    });

    const tabletSaveResult = repo.saveDocument(cadetUserId, createdBoardId, tabletDocumentState, 2);
    assert.equal(tabletSaveResult.success, true);
    assert.equal(tabletSaveResult.version, 3);

    // Disparar broadcast em tempo real para os demais dispositivos
    whiteboardRealtimeHub.broadcastToBoard(createdBoardId, {
      type: 'VERSION_UPDATE',
      boardId: createdBoardId,
      version: 3,
      updatedAt: tabletSaveResult.updatedAt,
      senderDeviceId: 'device_tablet_stylus',
    });

    // PC recebe o evento de versão 3 em tempo real sem precisar de F5
    assert.ok(pcReceivedEvent);
    assert.equal(pcReceivedEvent.type, 'VERSION_UPDATE');
    assert.equal(pcReceivedEvent.version, 3);
    assert.equal(pcReceivedEvent.senderDeviceId, 'device_tablet_stylus');
  });

  await t.test('PASSO 5 (PC & TABLET): Recarregar a página — Tudo permanece 100% íntegro e sincronizado', () => {
    // Ambos os dispositivos recarregam e consultam o banco
    const reloaded = repo.getWhiteboard(cadetUserId, createdBoardId);
    assert.ok(reloaded);
    assert.equal(reloaded.board.version, 3);

    const reloadedDoc = JSON.parse(reloaded.document!.document_state);
    const reloadedRecords = reloadedDoc.document.records;

    // Enunciado continua lá
    const imgRecord = reloadedRecords.find((r: any) => r.id === 'shape:question_img_1');
    assert.ok(imgRecord);
    assert.equal(imgRecord.isLocked, true);

    // Resoluções manuscritas continuam lá
    const stroke1 = reloadedRecords.find((r: any) => r.id === 'shape:stroke_calc_1');
    const stroke2 = reloadedRecords.find((r: any) => r.id === 'shape:stroke_calc_2_highlight');
    assert.ok(stroke1);
    assert.ok(stroke2);
    assert.equal(stroke1.props.color, 'white');
    assert.equal(stroke2.props.color, 'yellow');
  });
});
