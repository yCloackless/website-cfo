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

let authInstance: any = null;
let providerInstance: GoogleAuthProvider | null = null;

export function getFirebaseAuth() {
  if (!authInstance) {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(app);
  }
  return authInstance;
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!providerInstance) {
    providerInstance = new GoogleAuthProvider();
    providerInstance.addScope('https://www.googleapis.com/auth/calendar.events');
    providerInstance.setCustomParameters({ prompt: 'select_account' });
  }
  return providerInstance;
}

export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_, prop) {
    return (getFirebaseAuth() as any)[prop];
  },
});

const STORAGE_TOKEN_KEY = 'cfo_cbmerj_google_calendar_token';
const STORAGE_EXPIRY_KEY = 'cfo_cbmerj_google_calendar_token_expiry';
const STORAGE_EMAIL_KEY = 'cfo_cbmerj_google_calendar_user_email';

// Whitelist de usuários autorizados
const configuredAllowedEmails = String(import.meta.env.VITE_ALLOWED_GOOGLE_EMAILS || '');
export const ALLOWED_EMAILS = configuredAllowedEmails.split(',').map((value: string) => value.trim().toLowerCase()).filter(Boolean);

export const isEmailAuthorized = (email?: string | null): boolean => {
  if (!email) return false;
  // Se nenhuma whitelist de frontend estiver definida, a autorização é validada pelo backend
  if (ALLOWED_EMAILS.length === 0) return true;
  return ALLOWED_EMAILS.includes(email.toLowerCase().trim());
};

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const getStoredAccessToken = (): string | null => {
  if (cachedAccessToken) return cachedAccessToken;
  return null;
};

export const persistAccessToken = (
  token: string,
  expiresInSeconds: number = 3600,
  email?: string
) => {
  cachedAccessToken = token;
  try {
    // OAuth access tokens remain memory-only; the refresh token is kept by the
    // encrypted backend session instead of JavaScript-readable web storage.
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
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
    // Falha fechada: indisponibilidade de rede nunca transforma token nao
    // verificado em sessao valida.
    return { valid: false };
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
    const result = await signInWithPopup(auth, getGoogleProvider());
    
    // Validação de segurança por e-mail
    if (result.user?.email && !isEmailAuthorized(result.user.email)) {
      await signOut(auth);
      clearStoredAccessToken();
      throw new Error('Acesso não autorizado para esta conta Google.');
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
