process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { app } = await import('../server');
const { getDb } = await import('../src/db/database');
const { AuthService } = await import('../src/db/authService');
const { secureUploadService, DEFAULT_UPLOAD_LIMITS } = await import('../src/services/secureUploadService');
const { UploadedFileRepository, UserRepository, SessionRepository } = await import('../src/db/repositories');

let server: http.Server;
let baseUrl: string;
let adminToken = '';
let cadetToken = '';
let otherUserToken = '';
let uploadedFileRepo: any;

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body: any = {};
  try { body = JSON.parse(text); } catch {}
  return { response, body, text };
}

// Helpers para gerar buffers de arquivos sintéticos válidos
function createValidPdfBuffer(): Buffer {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n170\n%%EOF`;
  return Buffer.from(content, 'utf-8');
}

function createValidPngBuffer(width = 100, height = 100): Buffer {
  // Cabeçalho PNG padrão + chunk IHDR mínimo
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0); // length
  ihdr.write('IHDR', 4, 'ascii'); // chunk type
  ihdr.writeUInt32BE(width, 8); // width
  ihdr.writeUInt32BE(height, 12); // height
  ihdr.writeUInt8(8, 16); // bit depth
  ihdr.writeUInt8(2, 17); // color type (RGB)
  ihdr.writeUInt8(0, 18); // compression
  ihdr.writeUInt8(0, 19); // filter
  ihdr.writeUInt8(0, 20); // interlace
  ihdr.writeUInt32BE(0, 21); // crc mock
  return Buffer.concat([header, ihdr, Buffer.from('mockpngpayload')]);
}

function createValidJpgBuffer(width = 100, height = 100): Buffer {
  // SOI (0xFFD8) + SOF0 (0xFFC0) com dimensões + EOI (0xFFD9)
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  const dim = Buffer.alloc(4);
  dim.writeUInt16BE(height, 0);
  dim.writeUInt16BE(width, 2);
  const tail = Buffer.from([0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]);
  return Buffer.concat([header, dim, tail]);
}

function createValidWebpBuffer(): Buffer {
  // RIFF (4b) + Size (4b) + WEBP (4b) + VP8 (4b)
  const header = Buffer.alloc(16);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(20, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8 ', 12, 'ascii');
  return Buffer.concat([header, Buffer.from('mockpayload1234')]);
}

test.before(async () => {
  const rawDb = getDb().getRawDb();
  const authService = new AuthService(getDb());
  await authService.ensureDefaultAccounts();
  uploadedFileRepo = new UploadedFileRepository(rawDb);
  const userRepo = new UserRepository(rawDb);
  const sessionRepo = new SessionRepository(rawDb);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;

  // Logins para testes via sessionRepo para garantir isolamento e validade
  const adminUser = userRepo.findByUsername('admin')!;
  const adminSession = sessionRepo.createSession({ userId: adminUser.id, role: 'admin' });
  adminToken = adminSession.rawToken;

  const cadetUser = userRepo.findByUsername('cadete')!;
  const cadetSession = sessionRepo.createSession({ userId: cadetUser.id, role: 'cadet' });
  cadetToken = cadetSession.rawToken;

  // Cria ou reutiliza segundo usuário comum para testes de controle de acesso e ownership
  let createdUser = userRepo.findByUsername('user_tester_sec');
  if (!createdUser) {
    createdUser = userRepo.create({
      username: 'user_tester_sec',
      email: 'user_tester_sec@cfo.cbmerj.rj.gov.br',
      passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
      role: 'cadet',
      status: 'active',
    });
  }
  const session = sessionRepo.createSession({ userId: createdUser.id, role: 'cadet' });
  otherUserToken = session.rawToken;
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ============================================================================
// SUÍTE DE TESTES: PIPELINE DE SEGURANÇA DE UPLOAD (DEFENSE-IN-DEPTH)
// ============================================================================

test('SEC-UP-01: Deve permitir upload de PDF legítimo com magic bytes e estrutura válidos', async () => {
  const pdfBuffer = createValidPdfBuffer();
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'documento_estudo.pdf',
      declaredMime: 'application/pdf',
      contentBase64: pdfBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.file.mimeType, 'application/pdf');
  assert.equal(res.body.file.status, 'READY');
  assert.ok(res.body.file.id);
});

test('SEC-UP-02: Deve permitir upload de imagem PNG legítima', async () => {
  const pngBuffer = createValidPngBuffer(200, 200);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'grafico.png',
      declaredMime: 'image/png',
      contentBase64: pngBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.file.mimeType, 'image/png');
});

test('SEC-UP-03: Deve permitir upload de imagem JPG/JPEG legítima', async () => {
  const jpgBuffer = createValidJpgBuffer(300, 300);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'foto.jpg',
      declaredMime: 'image/jpeg',
      contentBase64: jpgBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.file.mimeType, 'image/jpeg');
});

test('SEC-UP-04: Deve permitir upload de imagem WEBP legítima', async () => {
  const webpBuffer = createValidWebpBuffer();
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'banner.webp',
      declaredMime: 'image/webp',
      contentBase64: webpBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.file.mimeType, 'image/webp');
});

test('SEC-UP-05: Deve REJEITAR binário executável (EXE) disfarçado de .pdf (Magic Bytes Incompatíveis)', async () => {
  // Magic bytes MZ de PE executável Windows
  const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'apostila_maliciosa.pdf',
      declaredMime: 'application/pdf',
      contentBase64: exeBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.match(res.body.message, /incompatível|não permitido|assinatura|executáveis|bloqueados/i);
});

test('SEC-UP-06: Deve REJEITAR arquivo com MIME falso (HTML disfarçado de imagem PNG)', async () => {
  const htmlBuffer = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>', 'utf-8');
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'foto.png',
      declaredMime: 'image/png',
      contentBase64: htmlBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
});

test('SEC-UP-07: Deve REJEITAR arquivo com dupla extensão perigosa (.pdf.exe / .png.php)', async () => {
  const pdfBuffer = createValidPdfBuffer();
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'apostila.pdf.exe',
      declaredMime: 'application/pdf',
      contentBase64: pdfBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.match(res.body.message, /dupla extensão|extensão/i);
});

test('SEC-UP-08: Deve REJEITAR arquivo com tentativa de Path Traversal no nome', async () => {
  const pdfBuffer = createValidPdfBuffer();
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: '../../../../etc/passwd.pdf',
      declaredMime: 'application/pdf',
      contentBase64: pdfBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
});

test('SEC-UP-09: Deve REJEITAR formatos bloqueados (SVG, HTML, ZIP, Scripts)', async () => {
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf-8');
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'vetor.svg',
      declaredMime: 'image/svg+xml',
      contentBase64: svgBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
});

test('SEC-UP-10: Deve REJEITAR arquivo vazio ou corrompido', async () => {
  const emptyBuffer = Buffer.alloc(0);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'vazio.pdf',
      declaredMime: 'application/pdf',
      contentBase64: emptyBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
});

test('SEC-UP-11: Deve REJEITAR arquivo que exceda o tamanho limite permitido', async () => {
  // Cria um buffer maior que 10MB
  const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'gigante.pdf',
      declaredMime: 'application/pdf',
      contentBase64: largeBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.match(res.body.message, /tamanho/i);
});

test('SEC-UP-12: Deve REJEITAR imagem com dimensões absurdas (Decompression Bomb)', async () => {
  // PNG com 20.000 x 20.000 px de dimensão declarada
  const bombBuffer = createValidPngBuffer(20000, 20000);
  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'bomb.png',
      declaredMime: 'image/png',
      contentBase64: bombBuffer.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.match(res.body.message, /dimensões/i);
});

test('SEC-UP-13: Deve DETECTAR e QUARENTENAR assinatura de malware (EICAR Test String)', async () => {
  // Assinatura de teste padrão antimalware EICAR
  const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
  const eicarPdf = Buffer.concat([createValidPdfBuffer(), Buffer.from(`\n% ${eicarString}\n`, 'ascii')]);

  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'eicar_test.pdf',
      declaredMime: 'application/pdf',
      contentBase64: eicarPdf.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.equal(res.body.status, 'REJECTED');
  assert.match(res.body.message, /malware|ameaça|assinatura/i);
});

test('SEC-UP-14: Deve REJEITAR PDF com scripts embutidos perigosos (/JavaScript /Launch)', async () => {
  const maliciousPdf = Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS (app.alert('PWNED');) >> >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f\n0000000010 00000 n\n0000000120 00000 n\ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n180\n%%EOF`,
    'utf-8'
  );

  const res = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'exploit_js.pdf',
      declaredMime: 'application/pdf',
      contentBase64: maliciousPdf.toString('base64'),
    }),
  });

  assert.equal(res.response.status, 400);
  assert.equal(res.body.error, 'UPLOAD_REJECTED');
  assert.match(res.body.message, /script|javascript|ações automáticas|ameaça|malicioso/i);
});

test('SEC-UP-15: Controle de Acesso e Ownership: Usuário B não pode acessar arquivo do Usuário A', async () => {
  // 1. Cadete A faz upload de arquivo legítimo
  const pdfBuffer = createValidPdfBuffer();
  const uploadRes = await request('/api/uploads/file', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cadetToken}` },
    body: JSON.stringify({
      fileName: 'documento_privado_cadete.pdf',
      declaredMime: 'application/pdf',
      contentBase64: pdfBuffer.toString('base64'),
    }),
  });
  assert.equal(uploadRes.response.status, 201);
  const fileId = uploadRes.body.file.id;

  // 2. Outro Usuário B tenta acessar o arquivo de A -> DEVE RETORNAR 403 FORBIDDEN
  const unauthorizedRes = await request(`/api/files/${fileId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${otherUserToken}` },
  });
  assert.equal(unauthorizedRes.response.status, 403);
  assert.equal(unauthorizedRes.body.error, 'ACCESS_DENIED');

  // 3. Usuário A acessa o próprio arquivo -> DEVE TER SUCESSO (200 OK com headers seguros)
  const authorizedRes = await request(`/api/files/${fileId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cadetToken}` },
  });
  assert.equal(authorizedRes.response.status, 200);
  assert.equal(authorizedRes.response.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(authorizedRes.response.headers.get('content-security-policy'));

  // 4. Administrador acessa qualquer arquivo -> SUCESSO (200 OK)
  const adminRes = await request(`/api/files/${fileId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(adminRes.response.status, 200);
});

test('SEC-UP-16: Bloqueio de download de arquivos em Quarentena / Não Liberados', async () => {
  const userRepo = new UserRepository(getDb().getRawDb());
  const adminUser = userRepo.findByUsername('admin')!;
  // Cria arquivo direto no banco com status 'QUARANTINED'
  const mockFile = uploadedFileRepo.create({
    userId: adminUser.id,
    originalFilename: 'teste_quarentena.pdf',
    storagePath: path.join(DEFAULT_UPLOAD_LIMITS.quarantineDir, 'mock-quarantine.pdf'),
    extension: 'pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
    sha256: 'mocksha256',
    status: 'QUARANTINED',
  });

  // Tenta download direto
  const res = await request(`/api/files/${mockFile.id}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.response.status, 403);
  assert.equal(res.body.error, 'ACCESS_DENIED');
  assert.match(res.body.message, /quarentena|processamento/i);
});
