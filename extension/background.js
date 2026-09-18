/**
 * CFO CBMERJ — Background Service Worker (Manifest V3)
 * Mantém o cronômetro ativo em segundo plano e orquestra a sincronização com a plataforma.
 */

// Chaves no chrome.storage.local
const STORAGE_KEYS = {
  TIMER: 'cfo_ext_timer',
  SETTINGS: 'cfo_ext_settings',
  LEVELING: 'cfo_ext_leveling',
};

// Inicialização
chrome.runtime.onInstalled.addListener(() => {
  console.log('[CFO CBMERJ Extension] Instalada e pronta.');
  chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SETTINGS], (result) => {
    if (!result[STORAGE_KEYS.TIMER]) {
      chrome.storage.local.set({
        [STORAGE_KEYS.TIMER]: {
          status: 'STOPPED',
          accumulatedMs: 0,
          startTime: null,
          restAccumulatedMs: 0,
          restStartTime: null,
          subjectId: 'geral',
          subjectName: 'Estudo Geral',
        },
      });
    }
    if (!result[STORAGE_KEYS.SETTINGS]) {
      chrome.storage.local.set({
        [STORAGE_KEYS.SETTINGS]: {
          serverUrl: 'https://cfo-oficial-agorasim.onrender.com',
          token: '',
        },
      });
    }
  });
});

// Formata tempo compacto para o badge do ícone do navegador (máx 4 caracteres)
function formatBadgeTime(ms) {
  const safeMs = typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : 0;
  const totalSecs = Math.floor(safeMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const hrs = Math.floor(mins / 60);

  if (hrs > 0) {
    return `${hrs}h`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return `${totalSecs}s`;
}

// Atualiza o badge do ícone do navegador com contagem em tempo real fora da extensão
function updateBadge(timerOrStatus) {
  chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
    const timer = (typeof timerOrStatus === 'object' && timerOrStatus !== null)
      ? timerOrStatus
      : res[STORAGE_KEYS.TIMER];

    if (!timer || timer.status === 'STOPPED') {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: 'CFO CBMERJ — Painel Tático' });
      return;
    }

    const now = Date.now();

    if (timer.status === 'RUNNING') {
      const acc = Number(timer.accumulatedMs ?? timer.accumulatedTime) || 0;
      const elapsed = acc + (timer.startTime ? Math.max(0, now - timer.startTime) : 0);
      const text = formatBadgeTime(elapsed);
      chrome.action.setBadgeText({ text });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      chrome.action.setTitle({
        title: `CFO CBMERJ: Em foco (${text}) — ${timer.subjectName || 'Estudos'}`,
      });
    } else if (timer.status === 'PAUSED') {
      const restStart = timer.restStartTime || now;
      const restElapsed = Math.max(0, now - restStart);
      const text = formatBadgeTime(restElapsed);
      chrome.action.setBadgeText({ text });

      const tenMinMs = 10 * 60 * 1000;
      const twentyMinMs = 20 * 60 * 1000;
      if (restElapsed >= twentyMinMs) {
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        chrome.action.setTitle({ title: `CFO CBMERJ: Descanso excessivo (${text}) — Retome o foco!` });
      } else if (restElapsed >= tenMinMs) {
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
        chrome.action.setTitle({ title: `CFO CBMERJ: Limite operacional (${text})` });
      } else {
        chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
        chrome.action.setTitle({ title: `CFO CBMERJ: Em descanso (${text})` });
      }
    }
  });
}

// Loop ativo para atualizar o badge do navegador em tempo real fora da extensão
let badgeInterval = null;
function ensureBadgeTicker() {
  if (badgeInterval) clearInterval(badgeInterval);
  badgeInterval = setInterval(() => {
    chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
      const timer = res[STORAGE_KEYS.TIMER];
      if (timer && (timer.status === 'RUNNING' || timer.status === 'PAUSED')) {
        updateBadge(timer);
      }
    });
  }, 2000);
}
ensureBadgeTicker();

// Alarme para manter sincronização e badges vivos mesmo em suspensão do service worker
chrome.alarms.create('cfo_timer_tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cfo_timer_tick') {
    ensureBadgeTicker();
    updateBadge();
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureBadgeTicker();
  updateBadge();
});

// Comunicação com o popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  if (type === 'GET_TIMER_STATE') {
    chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
      sendResponse({ timer: res[STORAGE_KEYS.TIMER] });
    });
    return true; // async
  }

  if (type === 'TIMER_START') {
    chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SETTINGS], (res) => {
      const prev = res[STORAGE_KEYS.TIMER] || { accumulatedMs: 0 };
      const settings = res[STORAGE_KEYS.SETTINGS] || {};
      const now = Date.now();
      const prevAcc = Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0;

      const newTimer = {
        status: 'RUNNING',
        accumulatedMs: prevAcc,
        accumulatedTime: prevAcc,
        startTime: now,
        restAccumulatedMs: 0,
        restStartTime: null,
        subjectId: payload?.subjectId || prev.subjectId || 'geral',
        subjectName: payload?.subjectName || prev.subjectName || 'Estudo Geral',
      };

      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
        updateBadge('RUNNING');
        sendResponse({ success: true, timer: newTimer });

        // Sincroniza com o backend se houver token
        if (settings.serverUrl && settings.token) {
          fetch(`${settings.serverUrl}/api/timer/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
            body: JSON.stringify({
              subjectId: newTimer.subjectId,
              subjectName: newTimer.subjectName,
            }),
          }).catch((err) => console.warn('[CFO Ext] Falha sync start:', err));
        }
      });
    });
    return true;
  }

  if (type === 'TIMER_PAUSE') {
    chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SETTINGS], (res) => {
      const prev = res[STORAGE_KEYS.TIMER] || { accumulatedMs: 0 };
      const settings = res[STORAGE_KEYS.SETTINGS] || {};

      const now = Date.now();
      const elapsed = prev.status === 'RUNNING' && prev.startTime ? Math.max(0, now - prev.startTime) : 0;
      const prevAcc = Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0;
      const newAcc = prevAcc + elapsed;
      const newTimer = {
        ...prev,
        status: 'PAUSED',
        accumulatedMs: newAcc,
        accumulatedTime: newAcc,
        startTime: null,
        restStartTime: now,
        restAccumulatedMs: 0,
      };

      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
        updateBadge('PAUSED');
        sendResponse({ success: true, timer: newTimer });

        if (settings.serverUrl && settings.token) {
          fetch(`${settings.serverUrl}/api/timer/pause`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
          }).catch((err) => console.warn('[CFO Ext] Falha sync pause:', err));
        }
      });
    });
    return true;
  }

  if (type === 'TIMER_RESET') {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (res) => {
      const settings = res[STORAGE_KEYS.SETTINGS] || {};
      const newTimer = {
        status: 'STOPPED',
        accumulatedMs: 0,
        accumulatedTime: 0,
        startTime: null,
        restAccumulatedMs: 0,
        restStartTime: null,
        subjectId: 'geral',
        subjectName: 'Estudo Geral',
      };

      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
        updateBadge('STOPPED');
        sendResponse({ success: true, timer: newTimer });

        if (settings.serverUrl && settings.token) {
          fetch(`${settings.serverUrl}/api/timer/reset`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
          }).catch((err) => console.warn('[CFO Ext] Falha sync reset:', err));
        }
      });
    });
    return true;
  }
});
