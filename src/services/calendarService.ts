import { apiFetch } from './apiFetch';
import { addDays, formatBRDate } from '../utils/dateUtils';
import { Subject, StudyEntry } from '../types';

export class GoogleCalendarAuthError extends Error {
  code: string;
  constructor(message: string = 'Sua autorização do Google Agenda expirou. Reconecte sua conta.') {
    super(message);
    this.name = 'GoogleCalendarAuthError';
    this.code = 'TOKEN_EXPIRED';
  }
}

export interface CalendarEventPayload {
  summary: string;
  description: string;
  dateStr: string; // YYYY-MM-DD
  colorId?: string; // 11=Red (Flamingo), 6=Tangerine, 5=Banana, etc.
  tag?: string; // e.g. '7d', '30d', '60d'
}

export interface BackendCalendarStatus {
  connected: boolean;
  permanent: boolean;
  email: string | null;
  name: string | null;
  hasRefreshToken: boolean;
  needsClientSecret: boolean;
  clientIdConfigured: boolean;
  updatedAt?: string;
  apiOperational?: boolean | null;
  apiErrorMessage?: string | null;
  enableUrl?: string | null;
}

/**
 * Consulta o status da sessão do Google Agenda armazenada e renovada pelo backend.
 */
export async function getBackendCalendarStatus(): Promise<BackendCalendarStatus> {
  try {
    const res = await apiFetch('/api/calendar/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Falha ao checar status do Google Agenda no backend:', e);
  }
  return {
    connected: false,
    permanent: false,
    email: null,
    name: null,
    hasRefreshToken: false,
    needsClientSecret: false,
    clientIdConfigured: false,
  };
}

/**
 * Inicia o fluxo OAuth 2.0 com acesso offline (Refresh Token) abrindo uma janela pop-up segura.
 */
export async function initiateGoogleCalendarAuth(): Promise<{ success: boolean; email?: string; name?: string }> {
  // Previne duplo login se já estiver ativamente conectado
  try {
    const initialStatus = await getBackendCalendarStatus();
    if (initialStatus.connected) {
      return { success: true, email: initialStatus.email || undefined, name: initialStatus.name || undefined };
    }
  } catch (_) {}

  const width = 520;
  const height = 680;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  // Abrir o pop-up imediatamente no clique para garantir zero bloqueio de navegador
  const popup = window.open(
    'about:blank',
    'GoogleCalendarOAuth',
    `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,scrollbars=yes`
  );

  if (!popup) {
    throw new Error('Abertura de pop-up bloqueada. Por favor, permita pop-ups para conectar ao Google Agenda.');
  }

  try {
    popup.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Conectando ao Google...</title><meta charset="utf-8"></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;background:#090d16;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <div style="font-size:26px;margin-bottom:12px;">⏳</div>
            <div style="font-size:14px;color:#94a3b8;font-weight:600;">Iniciando conexão segura com o Google Agenda...</div>
          </div>
        </body>
      </html>
    `);
  } catch (_) {}

  try {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await apiFetch(`/api/calendar/auth-url?origin=${encodeURIComponent(currentOrigin)}`);
    if (!res.ok) {
      popup.close();
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Falha ao obter URL de autenticação com o Google');
    }
    const { url } = await res.json();
    popup.location.href = url;
  } catch (err) {
    try {
      popup.close();
    } catch (_) {}
    throw err;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (success: boolean, email?: string, name?: string) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timer);
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (channel) {
        channel.close();
      }
      try {
        if (popup && !popup.closed) {
          popup.close();
        }
      } catch (_) {}

      // Atualiza o cache local imediatamente para a UI reagir em 0ms
      if (success) {
        try {
          const current = localStorage.getItem('cfo_calendar_status');
          const parsed = current ? JSON.parse(current) : {};
          localStorage.setItem(
            'cfo_calendar_status',
            JSON.stringify({
              connected: true,
              permanent: true,
              email: email || parsed.email || null,
              name: name || parsed.name || null,
            })
          );
        } catch (_) {}
      }

      resolve({ success, email, name });
    };

    // 1. BroadcastChannel para comunicação direta entre janelas
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('cfo_google_calendar_auth');
        channel.onmessage = (event) => {
          if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
            finish(true, event.data.email, event.data.name);
          }
        };
      }
    } catch (_) {}

    // 2. Storage event (fallback e sincronização instantânea inter-abas)
    const handleStorage = (e: StorageEvent) => {
      if ((e.key === 'cfo_calendar_auth_success' || e.key === 'cfo_calendar_status') && e.newValue) {
        try {
          const payload = JSON.parse(e.newValue);
          finish(true, payload.email, payload.name);
        } catch (_) {
          finish(true);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // 3. Window postMessage listener com validação estrita de origem
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
        finish(true, event.data.email, event.data.name);
      }
    };
    window.addEventListener('message', handleMessage);

    // 4. Polling de altíssima velocidade (200ms) para captura sem delay
    const timer = setInterval(async () => {
      if (popup.closed) {
        const status = await getBackendCalendarStatus();
        finish(status.connected, status.email || undefined, status.name || undefined);
        return;
      }

      try {
        const status = await getBackendCalendarStatus();
        if (status.connected) {
          finish(true, status.email || undefined, status.name || undefined);
        }
      } catch (_) {}
    }, 200);
  });
}


/**
 * Desconecta a conta do Google Agenda no backend.
 */
export async function disconnectBackendCalendar(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/calendar/disconnect', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Envia o token obtido no frontend para ser salvo no backend.
 */
export async function saveClientTokenToBackend(
  token: string,
  expiresInSeconds: number = 3600,
  email?: string,
  name?: string
): Promise<boolean> {
  try {
    const res = await apiFetch('/api/calendar/save-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, expiresIn: expiresInSeconds, email, name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Cria um evento individual no Google Agenda via backend proxy (com auto-refresh de token).
 */
export async function createGoogleCalendarEvent(
  accessToken: string | null | undefined,
  payload: CalendarEventPayload
): Promise<string> {
  // 1. Tentativa via Backend Proxy (com renovação de token transparente)
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const backendResp = await apiFetch('/api/calendar/create-event', {
      method: 'POST',
      headers,
      body: JSON.stringify({ event: payload }),
    });

    if (backendResp.ok) {
      const data = await backendResp.json();
      if (data.eventId) return data.eventId;
    } else if (backendResp.status === 401) {
      throw new GoogleCalendarAuthError();
    } else {
      const errData = await backendResp.json().catch(() => ({}));
      const message = errData.message || `Erro ao criar evento na Google Agenda (${backendResp.status})`;
      throw new Error(message);
    }
  } catch (err: any) {
    if (err instanceof GoogleCalendarAuthError) throw err;
    if (err?.message?.includes('Google Calendar API')) throw err;
    console.warn('Backend calendar proxy falhou, tentando fallback direto se token disponível:', err?.message);
    if (!accessToken) throw err;
  }

  // 2. Direct fallback to Google Calendar API with duplicate check (se token direto estiver disponível)
  if (!accessToken) {
    throw new GoogleCalendarAuthError();
  }

  try {
    const timeMin = `${payload.dateStr}T00:00:00Z`;
    const nextDay = addDays(payload.dateStr, 1);
    const timeMax = `${nextDay}T23:59:59Z`;
    const searchResp = await apiFetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
        timeMin
      )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (searchResp.ok) {
      const existingData = await searchResp.json();
      const cleanSummary = payload.summary.trim().toLowerCase();
      const match = existingData.items?.find(
        (it: any) => it.summary && it.summary.trim().toLowerCase() === cleanSummary
      );
      if (match) {
        return match.id;
      }
    }
  } catch (checkErr) {
    console.warn('Falha na verificação de duplicata do Google Calendar:', checkErr);
  }

  const nextDay = addDays(payload.dateStr, 1);
  const eventBody = {
    summary: payload.summary,
    description: payload.description,
    start: {
      date: payload.dateStr,
    },
    end: {
      date: nextDay,
    },
    colorId: payload.colorId || '11',
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 540 }, // 9h AM notification
      ],
    },
  };

  const response = await apiFetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleCalendarAuthError();
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      errData.error?.message ||
        `Erro ao criar evento na Google Agenda (${response.status})`
    );
  }

  const data = await response.json();
  return data.id as string;
}

/**
 * Registra a sessão no Google Agenda:
 * - Se 'studied' (Estudado no dia): marcado em Azul (colorId: '9' - Blueberry/Royal Blue)
 * - Se 'reviewing' (Revisando): marcado em Verde (colorId: '2' - Sage/Green)
 * - Opcionalmente agenda revisões inteligentes (1D, 7D, 30D, 60D, 90D) se createRevisions for true.
 */
export async function syncStudySessionAndRevisions(
  accessToken: string | null | undefined,
  subject: Subject,
  entry: Partial<StudyEntry> & { dateStr: string },
  createRevisions: boolean = false
): Promise<{
  studyEventId: string;
  revision1dId?: string;
  revision7dId?: string;
  revision30dId?: string;
  revision60dId?: string;
  revision90dId?: string;
}> {
  const rawTopic = entry.topic?.trim() || '';
  const topicLabel = rawTopic ? ` - ${rawTopic}` : '';
  const displayTopic = rawTopic || 'Conteúdo Programático';

  const isReview = entry.entryType === 'reviewing';
  const wholeHours = entry.durationMinutes ? Math.round(entry.durationMinutes / 60 * 10) / 10 : 0;
  const durationLabel = `\n⏱️ Carga horária: ${wholeHours}h (${wholeHours === 1 ? '1 hora' : `${wholeHours} horas`})`;
  const notesLabel = entry.notes ? `\n📝 Anotações: ${entry.notes}` : '';
  const studiedDateFormatted = formatBRDate(entry.dateStr);

  // Configuração de cores e títulos:
  // Estudado no dia = Azul (colorId: '9')
  // Revisando = Verde (colorId: '2')
  const summaryPrefix = isReview ? '📗 [CFO CBMERJ] Revisando' : '📘 [CFO CBMERJ] Estudado';
  const summary = `${summaryPrefix}: ${subject.name}${topicLabel}`;
  const description = isReview
    ? `Sessão de revisão para o CFO CBMERJ.\n📚 Matéria: ${subject.name} (${subject.category})\n📌 Tópico Revisado: ${displayTopic}${durationLabel}${notesLabel}\n\nAgendado via Aplicativo de Cronograma CFO CBMERJ.`
    : `Sessão de estudos concluída para o CFO CBMERJ.\n📚 Matéria: ${subject.name} (${subject.category})\n📌 Conteúdo: ${displayTopic}${durationLabel}${notesLabel}\n\nAgendado via Aplicativo de Cronograma CFO CBMERJ.`;

  const colorId = isReview ? '2' : '9'; // '9' = Azul (Blueberry / Royal Blue), '2' = Verde (Sage / Green)

  const studyEventPayload: CalendarEventPayload = {
    summary,
    description,
    dateStr: entry.dateStr,
    colorId,
  };

  const revisionsList: CalendarEventPayload[] = [];
  if (createRevisions && !isReview) {
    // 1 day (Próximo dia / 24h)
    revisionsList.push({
      summary: `⚡ [Revisão 24h / Próx Dia • CFO CBMERJ] ${subject.name}${topicLabel}`,
      description: `Revisão do próximo dia (Fixação imediata pós-estudo).\n📚 Matéria: ${subject.name}\n📌 Tópico: ${displayTopic}\n📅 Estudado em: ${studiedDateFormatted}`,
      dateStr: addDays(entry.dateStr, 1),
      colorId: '2', // Verde
      tag: '1d',
    });

    // 7 days (1 semana)
    revisionsList.push({
      summary: `🎯 [Revisão 7D • CFO CBMERJ] ${subject.name}${topicLabel}`,
      description: `Revisão de 1 semana (Curva do Esquecimento).\n📚 Matéria: ${subject.name}\n📌 Tópico: ${displayTopic}\n📅 Estudado originalmente em: ${studiedDateFormatted}`,
      dateStr: addDays(entry.dateStr, 7),
      colorId: '2', // Verde
      tag: '7d',
    });

    // 30 days (1 mês)
    revisionsList.push({
      summary: `⭐ [Revisão 30D • CFO CBMERJ] ${subject.name}${topicLabel}`,
      description: `Revisão mensal de 30 dias (Consolidação de longo prazo).\n📚 Matéria: ${subject.name}\n📌 Tópico: ${displayTopic}\n📅 Estudado em: ${studiedDateFormatted}`,
      dateStr: addDays(entry.dateStr, 30),
      colorId: '2', // Verde
      tag: '30d',
    });

    // 60 days (2 meses)
    revisionsList.push({
      summary: `🏆 [Revisão 60D • CFO CBMERJ] ${subject.name}${topicLabel}`,
      description: `Revisão de 2 meses.\n📚 Matéria: ${subject.name}\n📌 Tópico: ${displayTopic}\n📅 Estudado em: ${studiedDateFormatted}`,
      dateStr: addDays(entry.dateStr, 60),
      colorId: '2', // Verde
      tag: '60d',
    });

    // 90 days (3 meses)
    revisionsList.push({
      summary: `🚀 [Revisão 90D • CFO CBMERJ] ${subject.name}${topicLabel}`,
      description: `Revisão de 3 meses.\n📚 Matéria: ${subject.name}\n📌 Tópico: ${displayTopic}\n📅 Estudado em: ${studiedDateFormatted}`,
      dateStr: addDays(entry.dateStr, 90),
      colorId: '2', // Verde
      tag: '90d',
    });
  }

  const studyEventId = await createGoogleCalendarEvent(accessToken, studyEventPayload);
  let revision1dId: string | undefined;
  let revision7dId: string | undefined;
  let revision30dId: string | undefined;
  let revision60dId: string | undefined;
  let revision90dId: string | undefined;

  for (const rev of revisionsList) {
    try {
      const revId = await createGoogleCalendarEvent(accessToken, rev);
      if (rev.tag === '1d') revision1dId = revId;
      if (rev.tag === '7d') revision7dId = revId;
      if (rev.tag === '30d') revision30dId = revId;
      if (rev.tag === '60d') revision60dId = revId;
      if (rev.tag === '90d') revision90dId = revId;
    } catch (revErr) {
      console.warn(`Aviso: Falha ao criar revisão ${rev.tag}:`, revErr);
    }
  }

  return {
    studyEventId,
    revision1dId,
    revision7dId,
    revision30dId,
    revision60dId,
    revision90dId,
  };
}
