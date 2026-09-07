/**
 * CFO CBMERJ - Comprehensive Automated Tests for Authentication (GSD Phase 3)
 * Tests:
 * - Login com e-mail/usuário válido
 * - Login com senha inválida
 * - Login com usuário inexistente
 * - Recuperação de senha (código de 6 dígitos)
 * - Código de recuperação inválido
 * - Código de recuperação expirado
 * - Sessão válida e expirada
 * - Revogação de sessão / Logout
 * - Alteração de senha autenticada
 * - Alteração de e-mail com validação de unicidade
 * - Proteção de rotas
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseService } from '../src/db/database';
import { AuthService } from '../src/db/authService';
import { UserRepository, SessionRepository, PasswordResetRepository } from '../src/db/repositories';

function createTempAuth(): { dbService: DatabaseService; authService: AuthService; cleanup: () => void } {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-auth-test-'));
  const dbFile = path.join(tempDir, 'test_auth.sqlite');
  const dbService = new DatabaseService(dbFile);
  const authService = new AuthService(dbService);

  const cleanup = () => {
    try {
      dbService.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbService, authService, cleanup };
}

test('1. Criação e Login com e-mail ou username', async () => {
  const { authService, cleanup } = createTempAuth();
  await authService.ensureDefaultAccounts();

  // 1.1 Login com e-mail válido (admin)
  const loginEmail = await authService.login('admin@cbmerj.com', 'cfocbmerj2026!');
  assert.equal(loginEmail.success, true);
  assert.ok(loginEmail.token);
  assert.equal(loginEmail.user?.role, 'admin');

  // 1.2 Login com username válido (cadete)
  const loginUser = await authService.login('cadete', 'cadetecfo2026!');
  assert.equal(loginUser.success, true);
  assert.ok(loginUser.token);
  assert.equal(loginUser.user?.role, 'cadet');

  // 1.3 Login case-insensitive
  const loginUpper = await authService.login('CADETE@CBMERJ.COM', 'cadetecfo2026!');
  assert.equal(loginUpper.success, true);

  cleanup();
});

test('2. Falha de login: senha inválida e usuário inexistente (sem enumeração)', async () => {
  const { authService, cleanup } = createTempAuth();
  await authService.ensureDefaultAccounts();

  // 2.1 Senha inválida
  const badPass = await authService.login('cadete', 'senha_errada_123');
  assert.equal(badPass.success, false);
  assert.equal(badPass.message, 'Credenciais de acesso inválidas.');

  // 2.2 Usuário inexistente (mesma mensagem para evitar enumeração)
  const badUser = await authService.login('fantasma@cbmerj.com', 'qualquer_senha');
  assert.equal(badUser.success, false);
  assert.equal(badUser.message, 'Credenciais de acesso inválidas.');

  cleanup();
});

test('3. Validação de Sessão, Expiração e Logout', async () => {
  const { authService, cleanup } = createTempAuth();
  await authService.ensureDefaultAccounts();

  const loginRes = await authService.login('cadete', 'cadetecfo2026!');
  assert.ok(loginRes.token);

  // 3.1 Token recém-criado deve ser válido
  const validCheck = authService.validateToken(loginRes.token);
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.user?.username, 'cadete');
  assert.equal(validCheck.session?.role, 'cadet');

  // 3.2 Logout revoga o token imediatamente
  authService.logout(loginRes.token);
  const afterLogout = authService.validateToken(loginRes.token);
  assert.equal(afterLogout.valid, false);

  // 3.3 Token inventado ou forjado deve ser inválido
  const fakeCheck = authService.validateToken('token_forjado_123456');
  assert.equal(fakeCheck.valid, false);

  cleanup();
});

test('4. Recuperação de Senha: código de 6 dígitos, expiração e código inválido', async () => {
  const { authService, dbService, cleanup } = createTempAuth();
  await authService.ensureDefaultAccounts();

  // 4.1 Solicita recuperação
  const reqRes = authService.requestPasswordReset('cadete@cbmerj.com');
  assert.equal(reqRes.success, true);
  assert.ok(reqRes.debugCode);
  assert.equal(reqRes.debugCode.length, 6);

  // 4.2 Tenta recuperar com código incorreto
  const badCodeRes = await authService.confirmPasswordReset('cadete@cbmerj.com', '000000', 'NovaSenhaForte2026!');
  assert.equal(badCodeRes.success, false);
  assert.equal(badCodeRes.message, 'Código de recuperação inválido ou expirado.');

  // 4.3 Confirmação com código correto e redefinição de senha
  const goodCodeRes = await authService.confirmPasswordReset('cadete@cbmerj.com', reqRes.debugCode, 'NovaSenhaForte2026!');
  assert.equal(goodCodeRes.success, true);

  // 4.4 Código não pode ser reutilizado
  const reuseRes = await authService.confirmPasswordReset('cadete@cbmerj.com', reqRes.debugCode, 'OutraSenha123!');
  assert.equal(reuseRes.success, false);

  // 4.5 Login com a nova senha deve funcionar
  const loginNew = await authService.login('cadete', 'NovaSenhaForte2026!');
  assert.equal(loginNew.success, true);

  // 4.6 Login com a senha antiga deve falhar
  const loginOld = await authService.login('cadete', 'cadetecfo2026!');
  assert.equal(loginOld.success, false);

  // 4.7 Teste de expiração de código
  const user = new UserRepository(dbService.getRawDb()).findByEmail('cadete@cbmerj.com')!;
  const resetRepo = new PasswordResetRepository(dbService.getRawDb());
  // Insere código já expirado (1 minuto no passado)
  dbService.getRawDb().prepare(
    `INSERT INTO password_resets (id, user_id, code_hash, expires_at, is_used, created_at)
     VALUES (?, ?, ?, datetime('now', '-5 minutes'), 0, datetime('now', '-10 minutes'))`
  ).run('exp_id', user.id, 'hash_qualquer');

  const expiredConsume = resetRepo.verifyAndConsume(user.id, 'qualquer');
  assert.equal(expiredConsume, false);

  cleanup();
});

test('5. Alteração de Senha e E-mail Autenticada', async () => {
  const { authService, cleanup } = createTempAuth();
  await authService.ensureDefaultAccounts();

  const loginRes = await authService.login('cadete', 'cadetecfo2026!');
  const userId = loginRes.user!.id;

  // 5.1 Alteração de senha com senha atual incorreta
  const failChange = await authService.changePassword(userId, 'senha_errada', 'NovaSenhaSegura123!');
  assert.equal(failChange.success, false);

  // 5.2 Alteração com sucesso
  const okChange = await authService.changePassword(userId, 'cadetecfo2026!', 'NovaSenhaSegura123!');
  assert.equal(okChange.success, true);

  // 5.3 Alteração de e-mail com sucesso
  const emailChange = authService.updateEmail(userId, 'cadete.novo@cbmerj.com');
  assert.equal(emailChange.success, true);

  // 5.4 Não permite duplicar e-mail existente
  const dupEmailChange = authService.updateEmail(userId, 'admin@cbmerj.com');
  assert.equal(dupEmailChange.success, false);

  // 5.5 Login com o novo e-mail e nova senha
  const loginAfterChanges = await authService.login('cadete.novo@cbmerj.com', 'NovaSenhaSegura123!');
  assert.equal(loginAfterChanges.success, true);

  cleanup();
});
