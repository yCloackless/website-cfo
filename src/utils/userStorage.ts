/**
 * Utilitário de Namespace para Isolamento de Dados por Usuário
 * - O Administrador (username "admin") mantém as chaves padrão históricas.
 * - Usuários adicionais (ex: "cadete") possuem suas próprias chaves isoladas, gerando uma conta 100% nova.
 */
export function getUserStorageKey(baseKey: string): string {
  try {
    const user = (localStorage.getItem('cfo_terminal_user') || '').trim().toLowerCase();
    if (!user || user === 'admin') {
      return baseKey;
    }
    // Sanitiza nome de usuário para sufixo de chave
    const safeUser = user.replace(/[^a-z0-9_]/g, '_');
    return `${baseKey}_${safeUser}`;
  } catch {
    return baseKey;
  }
}
