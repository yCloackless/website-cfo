import { apiFetch } from './apiFetch';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Calendar Events scope
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.setCustomParameters({ prompt: 'select_account' });

const STORAGE_TOKEN_KEY = 'cfo_cbmerj_google_calendar_token';
const STORAGE_EXPIRY_KEY = 'cfo_cbmerj_google_calendar_token_expiry';
const STORAGE_EMAIL_KEY = 'cfo_cbmerj_google_calendar_user_email';

// Whitelist de usuários autorizados
export const ALLOWED_EMAILS = ['jb080956@gmail.com'];

export const isEmailAuthorized = (email?: string | null): boolean => {
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase().trim());
};

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const getStoredAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const expiryStr = localStorage.getItem(STORAGE_EXPIRY_KEY);
    if (token) {
      if (expiryStr) {
        const expiry = parseInt(expiryStr, 10);
        // If not expired (with 30-second buffer)
        if (Date.now() < expiry - 30000) {
          cachedAccessToken = token;
          return token;
        }
      } else {
        cachedAccessToken = token;
        return token;
      }
    }
  } catch (e) {
    console.warn('Falha ao ler token salvo:', e);
  }
  return null;
};

export const persistAccessToken = (
  token: string,
  expiresInSeconds: number = 3600,
  email?: string
) => {
  cachedAccessToken = token;
  try {
    localStorage.setItem(STORAGE_TOKEN_KEY, token);
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    localStorage.setItem(STORAGE_EXPIRY_KEY, expiresAt.toString());
    if (email) {
      localStorage.setItem(STORAGE_EMAIL_KEY, email);
    }
  } catch (e) {
    console.warn('Falha ao persistir token no armazenamento local:', e);
  }
};

export const clearStoredAccessToken = () => {
  cachedAccessToken = null;
  try {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
  } catch (e) {
    console.warn('Falha ao limpar token:', e);
  }
};

export const verifyTokenWithBackend = async (
  token: string
): Promise<{ valid: boolean; expiresIn?: number; email?: string }> => {
  try {
    const resp = await apiFetch('/api/calendar/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!resp.ok) return { valid: false };
    return await resp.json();
  } catch {
    // If network fails, do not prematurely disconnect
    return { valid: true };
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void,
  onUserOnly?: (user: User) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (user.email && !isEmailAuthorized(user.email)) {
        console.warn(`[Segurança] Usuário não autorizado: ${user.email}`);
        await signOut(auth);
        clearStoredAccessToken();
        if (onAuthFailure) onAuthFailure();
        return;
      }

      const storedToken = getStoredAccessToken();
      if (storedToken) {
        cachedAccessToken = storedToken;
        if (onAuthSuccess) onAuthSuccess(user, storedToken);

        // Verify with backend in background
        verifyTokenWithBackend(storedToken).then((verification) => {
          if (!verification.valid) {
            console.warn('Sessão do Google Agenda expirada no backend.');
            clearStoredAccessToken();
            if (onUserOnly) {
              onUserOnly(user);
            } else if (onAuthFailure) {
              onAuthFailure();
            }
          } else if (verification.expiresIn) {
            persistAccessToken(storedToken, verification.expiresIn, user.email || undefined);
          }
        });
      } else {
        // User logged into Firebase, but calendar token is expired or not stored
        if (onUserOnly) {
          onUserOnly(user);
        } else if (onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      clearStoredAccessToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    
    // Validação de segurança por e-mail
    if (result.user?.email && !isEmailAuthorized(result.user.email)) {
      await signOut(auth);
      clearStoredAccessToken();
      throw new Error(
        `Acesso não autorizado para ${result.user.email}. Este cronograma é de uso exclusivo de jb080956@gmail.com.`
      );
    }

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter token de acesso do Google Calendar');
    }

    persistAccessToken(credential.accessToken, 3600, result.user.email || undefined);
    return { user: result.user, accessToken: credential.accessToken };
  } catch (error: any) {
    // Normal user cancellation - do not treat as an exception or console.error
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }

    if (error?.code === 'auth/popup-blocked') {
      const blockedErr = new Error(
        'A janela de login foi bloqueada pelo navegador. Permita pop-ups para conectar sua conta Google.'
      );
      (blockedErr as any).code = 'auth/popup-blocked';
      throw blockedErr;
    }

    console.warn('Tentativa de login com Google não completada:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return getStoredAccessToken();
};

export const setCachedAccessToken = (token: string | null) => {
  if (token) {
    persistAccessToken(token, 3600);
  } else {
    clearStoredAccessToken();
  }
};

export const logout = async () => {
  await signOut(auth);
  clearStoredAccessToken();
};
