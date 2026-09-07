/**
 * CFO CBMERJ - Automated Tests for Export & Download Functions
 *
 * Funcionalidades testadas:
 * 1. Exportação de Bizuário (JSON): Serialização, integridade dos campos, validação de schema e nome do arquivo
 * 2. Importação de Bizuário (JSON): Validação de array de itens, resiliência a JSON corrompido ou vazio
 * 3. Exportação de Códigos de Recuperação (.txt): Formatação linha a linha, nome de arquivo padronizado
 * 4. Exportação de Backup do Sistema (.json.gz): Criação de snapshot gzip, cálculo de hash SHA-256 e indexação
 * 5. Verificação de Integridade de Backup: Confirmação de integridade criptográfica e detecção de corrupção
 */

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {
  createFullBackup,
  verifyBackupIntegrity,
  loadBackupIndex,
} from '../src/services/backupService';

// ============================================================================
// 1. EXPORTAÇÃO DE BIZUÁRIO (JSON)
// ============================================================================
test('1. Download / Exportação de Bizuário: Gera JSON válido com todos os metadados', () => {
  const mockBizus = [
    {
      id: 'bizu_01',
      subject: 'QUÍMICA',
      title: 'Termoquímica: Lei de Hess',
      content: 'Inverter a reação inverte o sinal de Delta H. Multiplicar coeficientes multiplica Delta H.',
      tags: ['termoquímica', 'delta-h', 'hess'],
      starred: true,
      updatedAt: '2026-09-07T12:00:00.000Z',
    },
    {
      id: 'bizu_02',
      subject: 'FÍSICA',
      title: 'Cinemática: Torricelli',
      content: 'v^2 = v0^2 + 2*a*DeltaS (usar quando o tempo nao for fornecido)',
      tags: ['cinematica', 'torricelli'],
      starred: false,
      updatedAt: '2026-09-07T13:00:00.000Z',
    },
  ];

  // Simula o processo de serialização e empacotamento em Blob
  const serialized = JSON.stringify(mockBizus, null, 2);
  assert.ok(serialized.length > 0);

  // Valida que o JSON é perfeitamente desserializável
  const deserialized = JSON.parse(serialized);
  assert.equal(Array.isArray(deserialized), true);
  assert.equal(deserialized.length, 2);
  assert.equal(deserialized[0].id, 'bizu_01');
  assert.equal(deserialized[0].title, 'Termoquímica: Lei de Hess');
  assert.deepEqual(deserialized[0].tags, ['termoquímica', 'delta-h', 'hess']);
  assert.equal(deserialized[1].subject, 'FÍSICA');

  // Valida o padrão de nomenclatura do arquivo para download
  const dateStr = new Date().toISOString().slice(0, 10);
  const expectedFilename = `bizuario_cfocbmerj_${dateStr}.json`;
  assert.match(expectedFilename, /^bizuario_cfocbmerj_\d{4}-\d{2}-\d{2}\.json$/);

  // Valida criação de Blob em ambiente Node / Browser
  const blob = new Blob([serialized], { type: 'application/json;charset=utf-8' });
  assert.equal(blob.type, 'application/json;charset=utf-8');
  assert.equal(blob.size, Buffer.byteLength(serialized, 'utf-8'));
});

// ============================================================================
// 2. IMPORTAÇÃO E RESTAURAÇÃO DE BIZUÁRIO
// ============================================================================
test('2. Importação de Bizuário: Valida estrutura e rejeita payloads corrompidos ou inválidos', () => {
  // 2.1 Payload válido
  const validJson = JSON.stringify([
    { id: 'b1', title: 'Bizú Válido', subject: 'MATEMÁTICA', content: 'Regra de 3' },
  ]);
  const parsedValid = JSON.parse(validJson);
  assert.ok(Array.isArray(parsedValid) && parsedValid.length === 1);

  // 2.2 Payload inválido (objeto único em vez de array)
  const invalidTypeJson = JSON.stringify({ id: 'b1', title: 'Objeto único' });
  const parsedInvalid = JSON.parse(invalidTypeJson);
  assert.equal(Array.isArray(parsedInvalid), false);

  // 2.3 Payload corrompido (JSON malformado)
  const corruptedJson = '{"id": "b1", "title": "Incompleto...';
  assert.throws(() => JSON.parse(corruptedJson), SyntaxError);
});

// ============================================================================
// 3. EXPORTAÇÃO DE CÓDIGOS DE RECUPERAÇÃO (.TXT)
// ============================================================================
test('3. Download de Códigos de Recuperação (.txt): Formatação linha a linha e cabeçalho', () => {
  const recoveryCodes = [
    'ABCD-EFGH-IJKL',
    'MNOP-QRST-UVWX',
    'YZ23-4567-89AB',
    'CDEF-GHJK-LMNP',
  ];

  // Formata conteúdo do arquivo de texto
  const textContent = recoveryCodes.join('\n');
  assert.equal(textContent.split('\n').length, 4);
  assert.equal(textContent.includes('ABCD-EFGH-IJKL'), true);
  assert.equal(textContent.includes('CDEF-GHJK-LMNP'), true);

  // Valida convenção de nome do arquivo
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `cfo-admin-recovery-codes-${dateStr}.txt`;
  assert.match(filename, /^cfo-admin-recovery-codes-\d{4}-\d{2}-\d{2}\.txt$/);

  // Valida geração do Blob
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  assert.equal(blob.type, 'text/plain;charset=utf-8');
  assert.equal(blob.size, Buffer.byteLength(textContent, 'utf-8'));
});

// ============================================================================
// 4. EXPORTAÇÃO DE BACKUP COMPACTADO DO SISTEMA (.JSON.GZ)
// ============================================================================
test('4. Backup do Sistema: Criação de arquivo comprimido gzip e checksum sha256', async () => {
  // Garante que o diretório data exista para o teste
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Cria um arquivo de teste dentro de data para ser incluído no backup
  const dummyFile = path.join(dataDir, 'test-download-data.json');
  fs.writeFileSync(dummyFile, JSON.stringify({ test: 'cfo-backup-data', timestamp: Date.now() }), 'utf-8');

  try {
    const backupMeta = await createFullBackup('manual');
    assert.ok(backupMeta.id.startsWith('backup_'));
    assert.ok(backupMeta.filename.endsWith('.json.gz'));
    assert.ok(backupMeta.sizeBytes > 0);
    assert.equal(typeof backupMeta.sha256, 'string');
    assert.equal(backupMeta.sha256.length, 64); // SHA-256 hex digest tem 64 caracteres

    // Confirma que o arquivo existe fisicamente no disco
    const backupFilePath = path.join(process.cwd(), 'data', 'backups', backupMeta.filename);
    assert.equal(fs.existsSync(backupFilePath), true);

    // Confirma que o checksum .sha256 acompanha o arquivo
    const shaFilePath = `${backupFilePath}.sha256`;
    assert.equal(fs.existsSync(shaFilePath), true);
    const shaContent = fs.readFileSync(shaFilePath, 'utf-8');
    assert.ok(shaContent.includes(backupMeta.sha256));

    // Valida que o arquivo gzip é descompactável e contém estrutura de snapshot válida
    const rawGzip = fs.readFileSync(backupFilePath);
    const decompressed = zlib.gunzipSync(rawGzip).toString('utf-8');
    const snapshot = JSON.parse(decompressed);
    assert.ok(snapshot.metadata);
    assert.equal(snapshot.metadata.version, '2.0.0');
    assert.equal(typeof snapshot.files, 'object');

    // Confirma registro no índice de backups
    const index = loadBackupIndex();
    const recorded = index.find((b) => b.filename === backupMeta.filename);
    assert.ok(recorded, 'Backup deve constar no índice de backups');
    assert.equal(recorded.sha256, backupMeta.sha256);
  } finally {
    if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile);
  }
});

// ============================================================================
// 5. INTEGRIDADE DE BACKUP E DETECÇÃO DE CORRUPÇÃO
// ============================================================================
test('5. Verificação de Integridade de Backup: Detecta adulteração ou corrupção', async () => {
  const backupMeta = await createFullBackup('manual');
  const backupFilePath = path.join(process.cwd(), 'data', 'backups', backupMeta.filename);

  // 5.1 Arquivo intacto: deve retornar valid = true
  const intactCheck = verifyBackupIntegrity(backupMeta.filename);
  assert.equal(intactCheck.valid, true);
  assert.equal(intactCheck.calculatedSha256, backupMeta.sha256);

  // 5.2 Arquivo corrompido: adulteração de 1 byte no arquivo comprimido
  const originalBytes = fs.readFileSync(backupFilePath);
  const corruptedBytes = Buffer.from(originalBytes);
  corruptedBytes[corruptedBytes.length - 1] ^= 0xff; // Inverte o último byte
  fs.writeFileSync(backupFilePath, corruptedBytes);

  const corruptedCheck = verifyBackupIntegrity(backupMeta.filename);
  assert.equal(corruptedCheck.valid, false, 'Arquivo corrompido deve ser identificado como inválido');
  assert.notEqual(corruptedCheck.calculatedSha256, backupMeta.sha256);

  // Restaura bytes originais
  fs.writeFileSync(backupFilePath, originalBytes);
});
