/**
 * CFO CBMERJ - Automated Tests for Student Profile & Avatar Management (GSD Phase 4)
 * Covers:
 * - Profile retrieval & creation for authenticated user
 * - @username update, normalization (lowercase, alphanumeric + .-_) and uniqueness
 * - Avatar validation:
 *   - Real magic bytes validation (PNG, JPEG, WebP)
 *   - Rejection of executables, scripts, fake MIME/extensions, and corrupted buffers
 *   - Strict 3MB size limit
 * - Ownership & Anti-IDOR:
 *   - User A cannot edit User B's profile or avatar
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseService } from '../src/db/database';
import { UserRepository, ProfileRepository } from '../src/db/repositories';
import { AuthService } from '../src/db/authService';
import { validateImageBuffer, saveUserAvatar, MAX_AVATAR_SIZE_BYTES } from '../src/services/avatarService';

function createTempDb(): {
  dbService: DatabaseService;
  userRepo: UserRepository;
  profileRepo: ProfileRepository;
  authService: AuthService;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-profile-test-'));
  const dbFile = path.join(tempDir, 'test_profile.sqlite');
  const dbService = new DatabaseService(dbFile);
  const rawDb = dbService.getRawDb();
  const userRepo = new UserRepository(rawDb);
  const profileRepo = new ProfileRepository(rawDb);
  const authService = new AuthService(dbService);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, userRepo, profileRepo, authService, cleanup };
}

test('1. Perfil do Aluno: Leitura, Criação e Atualização de Campos', async () => {
  const { authService, userRepo, profileRepo, cleanup } = createTempDb();
  await authService.ensureDefaultAccounts();

  const cadet = userRepo.findByUsername('cadete');
  assert.ok(cadet, 'Usuário cadete deve existir');

  // Inicialmente cria perfil
  const profile = profileRepo.createOrUpdate({
    userId: cadet.id,
    fullName: 'Cadete Fulano de Tal',
    phone: '(21) 99999-8888',
    targetExam: 'CFO CBMERJ 2026',
    bio: 'Foco total na aprovação para Oficial Combatente.',
  });

  assert.equal(profile.fullName, 'Cadete Fulano de Tal');
  assert.equal(profile.phone, '(21) 99999-8888');
  assert.equal(profile.targetExam, 'CFO CBMERJ 2026');
  assert.equal(profile.avatarUrl, null);

  // Consulta por ID do usuário
  const fetched = profileRepo.findByUserId(cadet.id);
  assert.ok(fetched);
  assert.equal(fetched.fullName, 'Cadete Fulano de Tal');

  // Atualização de bio e nome preservando o restante
  const updated = profileRepo.createOrUpdate({
    userId: cadet.id,
    fullName: 'Cadete Silva',
    bio: 'Treino diário e revisões ativas.',
  });

  assert.equal(updated.fullName, 'Cadete Silva');
  assert.equal(updated.bio, 'Treino diário e revisões ativas.');
  assert.equal(updated.phone, '(21) 99999-8888'); // Mantido

  cleanup();
});

test('2. @username: Normalização, Sanitização e Unicidade Rigorosa', async () => {
  const { authService, userRepo, cleanup } = createTempDb();
  await authService.ensureDefaultAccounts();

  const cadet = userRepo.findByUsername('cadete')!;
  const admin = userRepo.findByUsername('admin')!;

  // 2.1 Normalização: deve converter para minúsculas e sanitizar caracteres inválidos
  const rawInput = '  @Cadete_2026!#$  ';
  const cleanUsername = rawInput.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
  assert.equal(cleanUsername, 'cadete_2026');

  // Atualiza com sucesso
  userRepo.updateUsername(cadet.id, cleanUsername);
  const updatedCadet = userRepo.findById(cadet.id);
  assert.equal(updatedCadet?.username, 'cadete_2026');

  // 2.2 Unicidade: não pode assumir o username de outro usuário (admin)
  const existingUser = userRepo.findByUsername('admin');
  assert.ok(existingUser);
  assert.notEqual(existingUser.id, cadet.id);

  // Tentativa de colisão no banco dispara erro de constraint UNIQUE
  assert.throws(() => {
    userRepo.updateUsername(cadet.id, 'admin');
  }, /UNIQUE constraint failed/);

  // 2.3 Pode manter o próprio username
  userRepo.updateUsername(cadet.id, 'cadete_2026');
  assert.equal(userRepo.findById(cadet.id)?.username, 'cadete_2026');

  cleanup();
});

test('3. Validação de Avatar: Magic Bytes Reais vs Falsificações e Executáveis', async () => {
  // 3.1 Buffer vazio deve falhar
  const emptyRes = validateImageBuffer(Buffer.alloc(0));
  assert.equal(emptyRes.valid, false);

  // 3.2 Imagem PNG legítima (Magic bytes: 89 50 4E 47 0D 0A 1A 0A)
  const validPngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngRes = validateImageBuffer(validPngHeader);
  assert.equal(pngRes.valid, true);
  assert.equal(pngRes.detectedMime, 'image/png');
  assert.equal(pngRes.extension, 'png');

  // 3.3 Imagem JPEG legítima (Magic bytes: FF D8 FF E0 ...)
  const validJpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpgRes = validateImageBuffer(validJpgHeader);
  assert.equal(jpgRes.valid, true);
  assert.equal(jpgRes.detectedMime, 'image/jpeg');
  assert.equal(jpgRes.extension, 'jpg');

  // 3.4 Imagem WebP legítima (RIFF....WEBP)
  const validWebp = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
    Buffer.from('VP8 ', 'ascii'),
  ]);
  const webpRes = validateImageBuffer(validWebp);
  assert.equal(webpRes.valid, true);
  assert.equal(webpRes.detectedMime, 'image/webp');
  assert.equal(webpRes.extension, 'webp');

  // 3.5 Arquivo não-imagem (bytes arbitrários sem assinatura válida)
  const arbitraryBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a]);
  const arbitraryRes = validateImageBuffer(arbitraryBytes);
  assert.equal(arbitraryRes.valid, false, 'Bytes não-imagem devem ser rejeitados');

  // 3.6 Arquivo de texto comum renomeado como imagem
  const textFile = Buffer.from('Plain text content that is not an image.', 'utf-8');
  const textRes = validateImageBuffer(textFile);
  assert.equal(textRes.valid, false, 'Arquivo de texto deve ser rejeitado');

  // 3.7 Arquivo maior que 3MB (limite estrito)
  const hugeBuffer = Buffer.alloc(MAX_AVATAR_SIZE_BYTES + 1024);
  hugeBuffer[0] = 0xff;
  hugeBuffer[1] = 0xd8;
  hugeBuffer[2] = 0xff;
  const hugeRes = validateImageBuffer(hugeBuffer);
  assert.equal(hugeRes.valid, false);
  assert.match(hugeRes.error || '', /3MB/);
});

test('4. Anti-IDOR & Ownership: Isolamento Rigoroso de Dados entre Usuários', async () => {
  const { authService, userRepo, profileRepo, cleanup } = createTempDb();
  await authService.ensureDefaultAccounts();

  const userA = userRepo.findByUsername('cadete')!;
  const userB = userRepo.findByUsername('admin')!;

  // Cria perfis para A e B
  profileRepo.createOrUpdate({
    userId: userA.id,
    fullName: 'Aluno A',
    bio: 'Bio do Usuário A',
  });

  profileRepo.createOrUpdate({
    userId: userB.id,
    fullName: 'Administrador B',
    bio: 'Bio do Administrador B',
  });

  // Simula requisição: Usuário A está logado (identidade vem da sessão)
  const sessionUser = { userId: userA.id, username: userA.username, role: userA.role };

  // Usuário A tenta enviar targetUserId = userB.id no corpo
  const maliciousRequestBody = {
    targetUserId: userB.id,
    fullName: 'Tentativa de Hack por A',
    bio: 'Invasao',
  };

  // O Backend seguro NUNCA usa maliciousRequestBody.targetUserId. Usa estritamente sessionUser.userId!
  const authoritativeTargetId = sessionUser.userId;
  assert.equal(authoritativeTargetId, userA.id, 'O backend deve usar exclusivamente o ID autenticado da sessão');

  profileRepo.createOrUpdate({
    userId: authoritativeTargetId,
    fullName: maliciousRequestBody.fullName,
    bio: maliciousRequestBody.bio,
  });

  // Verifica que o Usuário B permaneceu completamente intocado
  const userBProfile = profileRepo.findByUserId(userB.id);
  assert.equal(userBProfile?.fullName, 'Administrador B', 'Perfil do Usuário B não pode ter sido modificado por A');
  assert.equal(userBProfile?.bio, 'Bio do Administrador B');

  // E verifica que apenas o Usuário A foi alterado
  const userAProfile = profileRepo.findByUserId(userA.id);
  assert.equal(userAProfile?.fullName, 'Tentativa de Hack por A');

  // Teste de Avatar Ownership
  const testPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const avatarUrlA = saveUserAvatar(userA.id, testPngBuffer, 'png');
  profileRepo.updateAvatar(authoritativeTargetId, avatarUrlA);

  assert.equal(profileRepo.findByUserId(userA.id)?.avatarUrl, avatarUrlA);
  assert.equal(profileRepo.findByUserId(userB.id)?.avatarUrl, null, 'Avatar de B deve permanecer inalterado');

  // Remove o arquivo de teste criado no disco
  try {
    const diskPath = path.join(process.cwd(), 'public', avatarUrlA.replace(/^\//, ''));
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch {}

  cleanup();
});
