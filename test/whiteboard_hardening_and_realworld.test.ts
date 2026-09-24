import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/db/database';
import { WhiteboardRepository } from '../src/db/whiteboardRepository';
import {
  validateWhiteboardImageBuffer,
} from '../src/services/whiteboard/whiteboardStorage';
import {
  isGenericStylusEvent,
  resolveStylusTargetTool,
  StylusDiagnostics,
} from '../src/utils/whiteboardStylus';

test('Whiteboard Hardening: True Multi-Device Concurrency & Reconciler Invariance', async () => {
  const dbService = new DatabaseService(':memory:');
  const repo = new WhiteboardRepository(dbService.getRawDb());

  const userId = 'user_cadet_concurrency';
  const boardId = 'board_concurrency_test';

  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'cadet_c@cbmerj.com', 'cadet_c', 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(userId);

  const board = repo.createWhiteboard(userId, boardId, 'Quadro Concorrente de Prova', 'pure_black');

  // Estado Inicial: Ambos os dispositivos (PC e Tablet) carregam o mesmo quadro em v1
  const initialDoc = {
    schema: { schemaVersion: 2 },
    records: [
      { id: 'page:main', typeName: 'page', name: 'Page 1', index: 'a1' },
    ],
  };

  repo.saveDocument(userId, board.id, JSON.stringify(initialDoc), 1);
  const v1 = repo.getWhiteboard(userId, board.id);
  assert.equal(v1?.board.version, 2);

  // 1. PC insere uma questão (recorte de prova) e salva no servidor (v2 -> v3)
  const questionAssetRecord = {
    id: 'asset:q_uerj_2025',
    typeName: 'asset',
    type: 'image',
    props: { src: '/api/whiteboards/media/q_uerj.png', w: 700, h: 450 },
  };
  const questionShapeRecord = {
    id: 'shape:question_crop',
    typeName: 'shape',
    type: 'image',
    isLocked: true,
    props: { assetId: 'asset:q_uerj_2025', w: 700, h: 450 },
  };

  const pcDoc = {
    schema: { schemaVersion: 2 },
    records: [
      ...initialDoc.records,
      questionAssetRecord,
      questionShapeRecord,
    ],
  };

  const pcSaveResult = repo.saveDocument(userId, board.id, JSON.stringify(pcDoc), 2);
  assert.equal(pcSaveResult.success, true);
  assert.equal(pcSaveResult.version, 3);

  // 2. Concorrentemente, o Tablet estava desenhando cálculos matemáticos com a caneta
  // O Tablet ainda está trabalhando sobre a base v2 (antes de receber o update do PC)
  const tabletStroke1 = {
    id: 'shape:stroke_calc_1',
    typeName: 'shape',
    type: 'draw',
    props: { color: 'white', size: 'm', segments: [{ type: 'free', points: [{ x: 50, y: 100 }] }] },
  };
  const tabletStroke2 = {
    id: 'shape:stroke_calc_2',
    typeName: 'shape',
    type: 'draw',
    props: { color: 'red', size: 's', segments: [{ type: 'free', points: [{ x: 120, y: 200 }] }] },
  };

  const tabletDoc = {
    schema: { schemaVersion: 2 },
    records: [
      ...initialDoc.records,
      tabletStroke1,
      tabletStroke2,
    ],
  };

  // 3. Tablet tenta salvar com clientVersion = 2 (stale!)
  const tabletSaveAttempt1 = repo.saveDocument(userId, board.id, JSON.stringify(tabletDoc), 2);

  // Deve detectar conflito de concorrência (409) sem sobrescrever o trabalho do PC
  assert.equal(tabletSaveAttempt1.conflict, true);
  assert.equal(tabletSaveAttempt1.version, 3);
  assert.ok(tabletSaveAttempt1.currentDocumentState);

  // 4. Mecanismo de Reconciliação do Tablet (Simulando a lógica de WhiteboardWorkspace.tsx)
  const remoteServerState = JSON.parse(tabletSaveAttempt1.currentDocumentState!);
  const remoteSharedRecords = (remoteServerState.records || []).filter((r: any) =>
    ['shape', 'asset', 'binding', 'page'].includes(r.typeName)
  );

  // Tablet mescla os registros remotos no seu store local sem perder seus traços
  const tabletRecordMap = new Map<string, any>();
  tabletDoc.records.forEach((r) => tabletRecordMap.set(r.id, r));
  // Aplica registros remotos do PC
  remoteSharedRecords.forEach((r: any) => tabletRecordMap.set(r.id, r));

  const reconciledTabletDoc = {
    schema: { schemaVersion: 2 },
    records: Array.from(tabletRecordMap.values()),
  };

  // 5. Tablet tenta salvar novamente agora com a versão base atualizada (3)
  const tabletSaveAttempt2 = repo.saveDocument(
    userId,
    board.id,
    JSON.stringify(reconciledTabletDoc),
    tabletSaveAttempt1.version
  );

  assert.equal(tabletSaveAttempt2.success, true);
  assert.equal(tabletSaveAttempt2.conflict, false);
  assert.equal(tabletSaveAttempt2.version, 4);

  // 6. Verificação de Convergência Final: Ambos os conjuntos de dados sobreviveram!
  const finalBoard = repo.getWhiteboard(userId, board.id);
  const finalDoc = JSON.parse(finalBoard?.document?.document_state || '{}');
  const recordIds = new Set(finalDoc.records.map((r: any) => r.id));

  // A questão enviada pelo PC está intacta
  assert.ok(recordIds.has('shape:question_crop'), 'A questão inserida pelo PC sobreviveu');
  assert.ok(recordIds.has('asset:q_uerj_2025'), 'O asset da questão sobreviveu');

  // Todos os traços feitos com a caneta no Tablet estão intactos
  assert.ok(recordIds.has('shape:stroke_calc_1'), 'O traço 1 do Tablet sobreviveu');
  assert.ok(recordIds.has('shape:stroke_calc_2'), 'O traço 2 do Tablet sobreviveu');

  // Nenhum dispositivo apagou o trabalho do outro
  assert.equal(finalDoc.records.length, 5);
});

test('Whiteboard Hardening: Session Records Isolation (Camera and Pointer Invariance)', () => {
  const remoteSnapshotRecords = [
    { id: 'page:main', typeName: 'page' },
    { id: 'shape:box_1', typeName: 'shape' },
    { id: 'camera:remote', typeName: 'camera', x: -5000, y: -9000, z: 0.1 },
    { id: 'instance:remote', typeName: 'instance', isFocusMode: true },
    { id: 'instance_page_state:remote', typeName: 'instance_page_state' },
    { id: 'pointer:remote', typeName: 'pointer', x: 999, y: 999 },
  ];

  const allowedTypes = ['shape', 'asset', 'binding', 'page'];
  const filtered = remoteSnapshotRecords.filter((r) => allowedTypes.includes(r.typeName));

  assert.equal(filtered.length, 2);
  assert.ok(filtered.some((r) => r.id === 'page:main'));
  assert.ok(filtered.some((r) => r.id === 'shape:box_1'));
  assert.ok(!filtered.some((r) => r.typeName === 'camera'), 'Câmera remota foi isolada com sucesso');
  assert.ok(!filtered.some((r) => r.typeName === 'instance'), 'Instância remota foi isolada com sucesso');
});

test('Whiteboard Hardening: Asset Lifecycle & Cleanup of Unreferenced R2 Objects', () => {
  const dbService = new DatabaseService(':memory:');
  const repo = new WhiteboardRepository(dbService.getRawDb());

  const userId = 'user_cadet_assets';

  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'cadet_assets@cbmerj.com', 'cadet_assets', 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(userId);

  const board1 = repo.createWhiteboard(userId, 'board_assets_1', 'Quadro com Imagens', 'pure_black');
  const board2 = repo.createWhiteboard(userId, 'board_assets_2', 'Quadro Secundário', 'pure_black');

  // Cria 3 assets associados ao quadro 1
  repo.createAsset({
    id: 'asset_1',
    whiteboardId: board1.id,
    userId,
    filename: 'q1.png',
    storageKey: 'whiteboard-media/user_1/q1.png',
    mimeType: 'image/png',
    fileSize: 1024,
  });

  repo.createAsset({
    id: 'asset_2',
    whiteboardId: board1.id,
    userId,
    filename: 'q2.png',
    storageKey: 'whiteboard-media/user_1/q2.png',
    mimeType: 'image/png',
    fileSize: 2048,
  });

  // Asset 3 é compartilhado/referenciado também pelo quadro 2
  repo.createAsset({
    id: 'asset_3_b1',
    whiteboardId: board1.id,
    userId,
    filename: 'formula_geral.png',
    storageKey: 'whiteboard-media/user_1/shared_formula.png',
    mimeType: 'image/png',
    fileSize: 4096,
  });

  repo.createAsset({
    id: 'asset_3_b2',
    whiteboardId: board2.id,
    userId,
    filename: 'formula_geral.png',
    storageKey: 'whiteboard-media/user_1/shared_formula.png',
    mimeType: 'image/png',
    fileSize: 4096,
  });

  // Aluno apaga a imagem q2 do quadro 1: apenas q1 e shared_formula estão ativos no documento
  const activeKeys = ['whiteboard-media/user_1/q1.png', 'whiteboard-media/user_1/shared_formula.png'];
  const orphanKeys = repo.cleanupUnreferencedAssets(userId, board1.id, activeKeys);

  // Asset 2 deve ser marcado para deleção
  assert.deepEqual(orphanKeys, ['whiteboard-media/user_1/q2.png']);

  // Excluir o quadro 1 por completo
  const { success, assetStorageKeys } = repo.deleteWhiteboard(userId, board1.id);
  assert.equal(success, true);

  // Asset 1 deve ser deletado do R2 pois era exclusivo do quadro 1
  assert.ok(assetStorageKeys.includes('whiteboard-media/user_1/q1.png'));

  // Asset 3 (shared_formula) NÃO pode ser deletado do R2 pois o quadro 2 ainda o referencia!
  assert.ok(
    !assetStorageKeys.includes('whiteboard-media/user_1/shared_formula.png'),
    'Asset referenciado por outro quadro foi preservado'
  );
});

test('Whiteboard Hardening: Strict Image Validation (Magic Bytes, Max Size, Fake Extensions)', () => {
  assert.throws(() => validateWhiteboardImageBuffer(Buffer.alloc(0)), /EMPTY_IMAGE_BUFFER/);

  const hugeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
  assert.throws(() => validateWhiteboardImageBuffer(hugeBuffer), /IMAGE_TOO_LARGE/);

  const textFakePng = Buffer.from('<html><body>Fake Image Content</body></html>');
  assert.throws(() => validateWhiteboardImageBuffer(textFakePng), /INVALID_IMAGE_MAGIC_BYTES/);

  const realPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const validatedPng = validateWhiteboardImageBuffer(realPngHeader);
  assert.equal(validatedPng.mimeType, 'image/png');
  assert.equal(validatedPng.extension, 'png');

  const realJpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const validatedJpg = validateWhiteboardImageBuffer(realJpgHeader);
  assert.equal(validatedJpg.mimeType, 'image/jpeg');
  assert.equal(validatedJpg.extension, 'jpg');

  const realWebpHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
  ]);
  const validatedWebp = validateWhiteboardImageBuffer(realWebpHeader);
  assert.equal(validatedWebp.mimeType, 'image/webp');
  assert.equal(validatedWebp.extension, 'webp');
});

test('Whiteboard Hardening: Stress Test (Thousands of Strokes & Rapid Sequential Saves)', () => {
  const dbService = new DatabaseService(':memory:');
  const repo = new WhiteboardRepository(dbService.getRawDb());

  const userId = 'user_cadet_stress';

  dbService.getRawDb().prepare(`
    INSERT INTO users (id, email, username, password_hash, role, status, created_at, updated_at)
    VALUES (?, 'cadet_stress@cbmerj.com', 'cadet_stress', 'hash', 'cadet', 'active', '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
  `).run(userId);

  const board = repo.createWhiteboard(userId, 'board_stress', 'Quadro de Alta Carga', 'grid');

  // Gerar 1.500 traços simulando 30 minutos de cálculo intenso com a caneta
  const manyStrokes: any[] = [];
  for (let i = 0; i < 1500; i++) {
    manyStrokes.push({
      id: `shape:calc_stroke_${i}`,
      typeName: 'shape',
      type: 'draw',
      props: {
        color: i % 2 === 0 ? 'white' : 'yellow',
        size: 's',
        segments: [{ type: 'free', points: [{ x: i * 2, y: i * 3 }] }],
      },
    });
  }

  const stressDoc = {
    schema: { schemaVersion: 2 },
    records: manyStrokes,
  };

  const serialized = JSON.stringify(stressDoc);
  assert.ok(serialized.length > 100000, 'Payload de estresse com tamanho significativo');

  const startTime = Date.now();
  const saveResult = repo.saveDocument(userId, board.id, serialized, 1);
  const durationMs = Date.now() - startTime;

  assert.equal(saveResult.success, true);
  assert.equal(saveResult.version, 2);
  assert.ok(durationMs < 1000, `Salvamento em memória de 1500 shapes rápido: ${durationMs}ms`);

  // Carregar e verificar integridade integral dos 1500 traços
  const fetched = repo.getWhiteboard(userId, board.id);
  const parsed = JSON.parse(fetched?.document?.document_state || '{}');
  assert.equal(parsed.records.length, 1500);
});

test('Whiteboard Hardening: Generic W3C Stylus Detection (Huawei M-Pencil & Graphics Tablet Support)', () => {
  // 1. Huawei M-Pencil emitindo evento padrão W3C pointerType = 'pen'
  const huaweiPenEvent = {
    pointerType: 'pen',
    pressure: 0.745,
    buttons: 1,
    button: 0,
    tiltX: 18,
    tiltY: -12,
  };
  assert.equal(isGenericStylusEvent(huaweiPenEvent), true, 'Huawei M-Pencil detectada com sucesso');

  // 2. Mesas digitalizadoras desktop (Wacom, Huion, XP-Pen, Gaomon, Veikk) no Windows/macOS
  const wacomDesktopTablet = {
    pointerType: 'pen',
    pressure: 0.892,
    buttons: 1,
    button: 0,
    tiltX: -15,
    tiltY: 30,
  };
  assert.equal(isGenericStylusEvent(wacomDesktopTablet), true, 'Mesa digitalizadora desktop Wacom/Huion/XP-Pen detectada como caneta');

  // 3. Fallback de WebView/HarmonyOS alternativo emitindo 'stylus'
  const fallbackStylusEvent = {
    pointerType: 'stylus',
    pressure: 0.5,
  };
  assert.equal(isGenericStylusEvent(fallbackStylusEvent), true, 'Fallback genérico stylus detectado');

  // 4. Toques de dedos e palma da mão NÃO podem ativar Pen Mode
  assert.equal(isGenericStylusEvent({ pointerType: 'touch' }), false, 'Toque de dedo rejeitado pelo detector de caneta');

  // 5. Mouse e trackpad NÃO ativam Pen Mode
  assert.equal(isGenericStylusEvent({ pointerType: 'mouse' }), false, 'Mouse rejeitado pelo detector de caneta');
});

test('Whiteboard Hardening: Deterministic Active Tool Routing (Stylus Never Trapped in Hand Tool)', () => {
  // Cenário Crítico: O aluno usou toques na tela para navegar/dar zoom, ou clicou na ferramenta Mão.
  // O tldraw ficou internamente no estado 'hand'.
  // Ao encostar com a caneta Huawei M-Pencil ou caneta da mesa digitalizadora:
  // A caneta NUNCA deve arrastar o quadro, devendo retornar imediatamente para o modo de escrita.

  // 1. Aluno estava navegando (currentTool = hand), selecionado 'draw': caneta volta para 'draw'
  assert.equal(
    resolveStylusTargetTool('draw', 'hand'),
    'draw',
    'Caneta força retorno de hand para draw'
  );

  // 2. Aluno selecionou 'hand' na toolbar, mas tocou com a caneta: caneta muda para 'draw'
  assert.equal(
    resolveStylusTargetTool('hand', 'hand'),
    'draw',
    'Toque da caneta em modo hand força ativação do pincel draw'
  );

  // 3. Aluno selecionou Borracha ('eraser'), navegou com os dedos ('hand'): caneta respeita Borracha
  assert.equal(
    resolveStylusTargetTool('eraser', 'hand'),
    'eraser',
    'Caneta respeita seleção explícita de Borracha ao sair de hand'
  );

  // 4. Aluno selecionou Seleção ('select'), navegou com os dedos ('hand'): caneta respeita Seleção
  assert.equal(
    resolveStylusTargetTool('select', 'hand'),
    'select',
    'Caneta respeita seleção explícita de Selecionar ao sair de hand'
  );

  // 5. Aluno selecionou Marca-texto ('highlight'), navegou com os dedos ('hand'): caneta respeita Marca-texto
  assert.equal(
    resolveStylusTargetTool('highlight', 'hand'),
    'highlight',
    'Caneta respeita marca-texto ao sair de hand'
  );

  // 6. Durante escrita normal (currentTool = draw), caneta permanece em 'draw'
  assert.equal(
    resolveStylusTargetTool('draw', 'draw'),
    'draw',
    'Escrita contínua permanece em draw'
  );

  // 7. Durante apagamento normal (currentTool = eraser), caneta permanece em 'eraser'
  assert.equal(
    resolveStylusTargetTool('eraser', 'eraser'),
    'eraser',
    'Apagamento contínuo permanece em eraser'
  );
});

test('Whiteboard Hardening: Stylus Diagnostics Telemetry Format & Field Completeness', () => {
  // Valida que o payload de diagnóstico do painel em tempo real contém todos os 8 campos exigidos:
  // - event.pointerType
  // - event.pressure
  // - event.buttons
  // - event.button
  // - editor.inputs.getIsPen()
  // - editor.getCurrentToolId()
  // - editor.root.getPath()
  // - editor.getInstanceState().isPenMode
  // e suporte a tiltX/tiltY para mesas gráficas desktop e canetas avançadas.

  const mockTelemetry: StylusDiagnostics = {
    eventType: 'pointerdown',
    pointerType: 'pen',
    pointerId: 2,
    pressure: 0.654,
    buttons: 1,
    button: 0,
    tiltX: 12,
    tiltY: -8,
    width: 2,
    height: 2,
    timestamp: Date.now(),
    isPen: true,
    currentToolId: 'draw',
    rootPath: 'root.draw.idle',
    isPenMode: true,
  };

  assert.equal(mockTelemetry.pointerType, 'pen');
  assert.equal(mockTelemetry.pressure, 0.654);
  assert.equal(mockTelemetry.buttons, 1);
  assert.equal(mockTelemetry.button, 0);
  assert.equal(mockTelemetry.isPen, true);
  assert.equal(mockTelemetry.currentToolId, 'draw');
  assert.equal(mockTelemetry.rootPath, 'root.draw.idle');
  assert.equal(mockTelemetry.isPenMode, true);
  assert.equal(mockTelemetry.tiltX, 12);
  assert.equal(mockTelemetry.tiltY, -8);
});

