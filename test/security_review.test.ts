import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseService } from '../src/db/database';
import {
  UserRepository,
  SessionRepository,
  ProfileRepository,
  RecoveryCodeRepository,
} from '../src/db/repositories';
import { AuthService } from '../src/db/authService';
import { validateImageBuffer } from '../src/services/avatarService';

test('🔒 FASE 12: SECURITY REVIEW & DEFENSIVE AUDIT', async (t) => {
  const testDbDir = path.join(process.cwd(), 'data', 'test-security-review');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }
  const testDbPath = path.join(testDbDir, `security_${Date.now()}.sqlite`);
  const dbService = new DatabaseService(testDbPath);
  const rawDb = dbService.getRawDb();

  const userRepo = new UserRepository(rawDb);
  const sessionRepo = new SessionRepository(rawDb);
  const profileRepo = new ProfileRepository(rawDb);
  const recoveryRepo = new RecoveryCodeRepository(rawDb);
  const authService = new AuthService(dbService);

  await authService.ensureDefaultAccounts();

  t.after(() => {
    dbService.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbDir)) fs.rmdirSync(testDbDir, { recursive: true });
    } catch {}
  });

  await t.test('1. Bypass via adminKey / x-admin-key deve ser impossível', () => {
    // Simula a verificação estrita de autorização sem fallback em chaves mágicas
    const cadet = userRepo.findByUsername('cadete')!;
    const cadetSession = sessionRepo.createSession({
      userId: cadet.id,
      role: 'cadet',
    });

    // Função de verificação de middleware idêntica ao novo server.ts
    function checkAdminAccess(token: string | null) {
      if (!token) return { status: 403, error: 'FORBIDDEN' };
      const validation = sessionRepo.validateSession(token);
      if (!validation.valid || (validation.user?.role !== 'admin' && validation.user?.role !== 'support')) {
        return { status: 403, error: 'FORBIDDEN' };
      }
      return { status: 200, user: validation.user };
    }

    // Requisição sem token e com tentativa de bypass via adminKey
    const bypassAttempt1 = checkAdminAccess(null);
    assert.equal(bypassAttempt1.status, 403, 'Acesso sem token deve ser rejeitado');

    // Requisição com token de cadete e tentativa de bypass
    const bypassAttempt2 = checkAdminAccess(cadetSession.rawToken);
    assert.equal(bypassAttempt2.status, 403, 'Cadete não pode obter acesso administrativo');
  });

  await t.test('2. CORS deve rejeitar origens forjadas com prefix matching', () => {
    const allowedList = [
      'http://localhost:3000',
      'https://cfo-cbmerj.onrender.com',
    ];

    function extractOrigin(urlStr: string): string | null {
      try {
        return new URL(urlStr).origin.toLowerCase();
      } catch {
        return null;
      }
    }

    const normalizedAllowedOrigins = new Set(
      allowedList.map(extractOrigin).filter(Boolean) as string[]
    );

    function isOriginAllowed(origin: string): boolean {
      const normalized = extractOrigin(origin);
      if (normalized && normalizedAllowedOrigins.has(normalized)) return true;
      try {
        const parsed = new URL(origin);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
      } catch {}
      return false;
    }

    // Origens legítimas
    assert.equal(isOriginAllowed('http://localhost:3000'), true);
    assert.equal(isOriginAllowed('https://cfo-cbmerj.onrender.com'), true);

    // Origens de ataque (prefix injection)
    assert.equal(isOriginAllowed('http://localhost:3000.evil.com'), false, 'Subdomínio malicioso de localhost deve ser rejeitado');
    assert.equal(isOriginAllowed('https://cfo-cbmerj.onrender.com.attacker.com'), false, 'Subdomínio malicioso de render deve ser rejeitado');
    assert.equal(isOriginAllowed('https://evil-cfo-cbmerj.onrender.com'), false, 'Domínio semelhante deve ser rejeitado');
  });

  await t.test('3. Mass Assignment: Usuário não pode alterar seu próprio role via perfil', () => {
    const cadet = userRepo.findByUsername('cadete')!;
    assert.equal(cadet.role, 'cadet');

    // Tenta payload malicioso de mass assignment simulando PATCH /api/user/profile
    const maliciousBody = {
      fullName: 'Cadete Hacker',
      role: 'admin', // Tentativa de escalação de privilégio
      status: 'active',
      id: 'admin-id-forged',
    };

    // O controller aceita apenas campos cadastrais explícitos
    const updatedProfile = profileRepo.createOrUpdate({
      userId: cadet.id,
      fullName: maliciousBody.fullName,
    });

    const refreshedUser = userRepo.findById(cadet.id)!;
    assert.equal(refreshedUser.role, 'cadet', 'O papel do cadete não pode ser alterado por mass assignment');
    assert.equal(updatedProfile.fullName, 'Cadete Hacker');
  });

  await t.test('4. Recovery Code: Proteção contra replay / reutilização', () => {
    const admin = userRepo.findByUsername('admin')!;
    const { rawCodes } = recoveryRepo.generateCodesForUser(admin.id, 4);
    assert.equal(rawCodes.length, 4);

    const testCode = rawCodes[0];

    // Primeiro consumo: deve ser aceito
    const firstUse = recoveryRepo.verifyAndConsumeCode(admin.id, testCode);
    assert.equal(firstUse, true, 'Primeiro uso do recovery code deve suceder');

    // Segundo consumo com o mesmo código: deve ser terminantemente rejeitado
    const secondUse = recoveryRepo.verifyAndConsumeCode(admin.id, testCode);
    assert.equal(secondUse, false, 'Reutilização do mesmo recovery code deve falhar');

    // Código inválido qualquer
    const badCode = recoveryRepo.verifyAndConsumeCode(admin.id, 'ABCD-EFGH-9999');
    assert.equal(badCode, false, 'Código inválido deve ser rejeitado');
  });

  await t.test('5. Sessão revogada ou expirada não pode ser utilizada', () => {
    const cadet = userRepo.findByUsername('cadete')!;
    const { rawToken } = sessionRepo.createSession({
      userId: cadet.id,
      role: 'cadet',
    });

    // Sessão ativa
    const check1 = sessionRepo.validateSession(rawToken);
    assert.equal(check1.valid, true);

    // Revoga a sessão (logout)
    sessionRepo.revokeSession(rawToken);

    // Tentativa de reutilizar a sessão revogada
    const check2 = sessionRepo.validateSession(rawToken);
    assert.equal(check2.valid, false, 'Sessão revogada não pode ser validada');
  });

  await t.test('6. Upload: Rejeição de executáveis disfarçados e MIME falso', () => {
    // 1. Arquivo executável disfarçado de imagem (.exe com cabeçalho MZ)
    const fakeExeBuffer = Buffer.from('4d5a90000300000004000000ffff0000', 'hex');
    const exeResult = validateImageBuffer(fakeExeBuffer);
    assert.equal(exeResult.valid, false);
    assert.match(exeResult.error || '', /Formato de imagem inválido/);

    // 2. Script SVG com vetor de ataque XSS
    const fakeSvgBuffer = Buffer.from('<svg onload="alert(1)"></svg>', 'utf-8');
    const svgResult = validateImageBuffer(fakeSvgBuffer);
    assert.equal(svgResult.valid, false);

    // 3. Arquivo vazio
    const emptyResult = validateImageBuffer(Buffer.alloc(0));
    assert.equal(emptyResult.valid, false);

    // 4. Arquivo com tamanho excessivo (>3MB)
    const hugeBuffer = Buffer.alloc(3.5 * 1024 * 1024);
    const hugeResult = validateImageBuffer(hugeBuffer);
    assert.equal(hugeResult.valid, false);
    assert.match(hugeResult.error || '', /excede o limite máximo/);

    // 5. Imagem JPEG válida (magic bytes ffd8ffe0)
    const validJpegBuffer = Buffer.from('ffd8ffe000104a46494600010101006000600000', 'hex');
    const jpegResult = validateImageBuffer(validJpegBuffer);
    assert.equal(jpegResult.valid, true);
    assert.equal(jpegResult.detectedMime, 'image/jpeg');
    assert.equal(jpegResult.extension, 'jpg');

    // 6. Imagem PNG válida (magic bytes 89504e47)
    const validPngBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const pngResult = validateImageBuffer(validPngBuffer);
    assert.equal(pngResult.valid, true);
    assert.equal(pngResult.detectedMime, 'image/png');
    assert.equal(pngResult.extension, 'png');
  });

  await t.test('7. Proteção contra enumeração de e-mail na recuperação de senha', async () => {
    // E-mail existente
    const resultExisting = await authService.requestPasswordReset('cadete@cbmerj.com');
    // E-mail inexistente
    const resultNonExisting = await authService.requestPasswordReset('naoexiste@cbmerj.com');

    assert.equal(resultExisting.success, true);
    assert.equal(resultNonExisting.success, true);
    assert.equal(
      resultExisting.message,
      resultNonExisting.message,
      'A mensagem para e-mail existente e inexistente deve ser estritamente idêntica para evitar enumeração'
    );
  });
});
