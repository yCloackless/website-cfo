import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  putWhiteboardMedia,
  getWhiteboardMedia,
  deleteWhiteboardMedia,
  validateWhiteboardImageBuffer,
} from '../src/services/whiteboard/whiteboardStorage';
import { getConfig } from '../src/services/anki/ankiMediaStorage';

test('Real Cloudflare R2 Storage Live Validation (Zero Mocks)', async (t) => {
  const config = getConfig();
  if (!config) {
    console.warn('[R2 Live Test] Configuração do Cloudflare R2 não detectada nas variáveis de ambiente. Pulando teste ao vivo.');
    return;
  }

  const runId = Date.now();
  const testKeyPng = `whiteboard-media/test_live/q_test_${runId}.png`;
  const testKeyJpg = `whiteboard-media/test_live/q_test_${runId}.jpg`;
  const testKeyWebp = `whiteboard-media/test_live/q_test_${runId}.webp`;

  // 1x1 PNG legítimo (67 bytes)
  const realPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  // JPEG legítimo mínimo
  const realJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60,
    0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9,
  ]);

  // WebP legítimo mínimo
  const realWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x0e, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00,
    0x34, 0x25,
  ]);

  await t.test('1. Validação de Magic Bytes e Rejeição de Arquivos Inválidos', () => {
    // Validação correta dos buffers
    const pngVal = validateWhiteboardImageBuffer(realPngBuffer);
    assert.equal(pngVal.mimeType, 'image/png');
    assert.equal(pngVal.extension, 'png');

    const jpgVal = validateWhiteboardImageBuffer(realJpgBuffer);
    assert.equal(jpgVal.mimeType, 'image/jpeg');
    assert.equal(jpgVal.extension, 'jpg');

    const webpVal = validateWhiteboardImageBuffer(realWebpBuffer);
    assert.equal(webpVal.mimeType, 'image/webp');
    assert.equal(webpVal.extension, 'webp');

    // Rejeição de arquivo de texto fingindo ser imagem
    const fakeFile = Buffer.from('malicious payload disguised as image');
    assert.throws(() => validateWhiteboardImageBuffer(fakeFile), /INVALID_IMAGE_MAGIC_BYTES/);

    // Rejeição de arquivo vazio
    assert.throws(() => validateWhiteboardImageBuffer(Buffer.alloc(0)), /EMPTY_IMAGE_BUFFER/);

    // Rejeição de arquivo maior que 10MB
    const tooLarge = Buffer.alloc(10 * 1024 * 1024 + 10);
    assert.throws(() => validateWhiteboardImageBuffer(tooLarge), /IMAGE_TOO_LARGE/);
  });

  await t.test('2. Upload Real de PNG, JPEG e WebP para o Cloudflare R2 (PUT)', async () => {
    // Upload PNG
    await putWhiteboardMedia(testKeyPng, realPngBuffer, 'image/png');

    // Upload JPEG
    await putWhiteboardMedia(testKeyJpg, realJpgBuffer, 'image/jpeg');

    // Upload WebP
    await putWhiteboardMedia(testKeyWebp, realWebpBuffer, 'image/webp');
  });

  await t.test('3. Download e Verificação de Integridade Byte a Byte do R2 (GET)', async () => {
    // GET PNG
    const pngRes = await getWhiteboardMedia(testKeyPng);
    assert.ok(pngRes, 'Objeto PNG recuperado do R2');
    assert.deepEqual(pngRes.buffer, realPngBuffer, 'Bytes do PNG conferem 100%');
    assert.ok(pngRes.contentType.includes('image/png'), 'Content-Type do PNG preservado');

    // GET JPEG
    const jpgRes = await getWhiteboardMedia(testKeyJpg);
    assert.ok(jpgRes, 'Objeto JPEG recuperado do R2');
    assert.deepEqual(jpgRes.buffer, realJpgBuffer, 'Bytes do JPEG conferem 100%');
    assert.ok(jpgRes.contentType.includes('image/jpeg'), 'Content-Type do JPEG preservado');

    // GET WebP
    const webpRes = await getWhiteboardMedia(testKeyWebp);
    assert.ok(webpRes, 'Objeto WebP recuperado do R2');
    assert.deepEqual(webpRes.buffer, realWebpBuffer, 'Bytes do WebP conferem 100%');
    assert.ok(webpRes.contentType.includes('image/webp'), 'Content-Type do WebP preservado');
  });

  await t.test('4. Consulta de Objeto Inexistente retorna null (404 seguro)', async () => {
    const missingRes = await getWhiteboardMedia(`whiteboard-media/missing_${runId}_never_exists.png`);
    assert.equal(missingRes, null, 'Objeto ausente retorna null sem quebrar a aplicação');
  });

  await t.test('5. Exclusão Atômica dos Objetos de Teste do R2 (DELETE)', async () => {
    await deleteWhiteboardMedia(testKeyPng);
    await deleteWhiteboardMedia(testKeyJpg);
    await deleteWhiteboardMedia(testKeyWebp);

    // Confirma que após delete a recuperação retorna null
    const checkDeleted = await getWhiteboardMedia(testKeyPng);
    assert.equal(checkDeleted, null, 'Objeto deletado não é mais retornado pelo R2');
  });
});
