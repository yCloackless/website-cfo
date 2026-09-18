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

// Atualiza o badge do ícone do navegador
function updateBadge(status) {
  if (status === 'RUNNING') {
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  } else if (status === 'PAUSED') {
    chrome.action.setBadgeText({ text: '||' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Alarme para manter sincronização e badges
chrome.alarms.create('cfo_timer_tick', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cfo_timer_tick') {
    chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
      const timer = res[STORAGE_KEYS.TIMER];
      if (timer && timer.status === 'RUNNING') {
        updateBadge('RUNNING');
      } else if (timer && timer.status === 'PAUSED') {
        updateBadge('PAUSED');
      }
    });
  }
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

      let restAccumulatedMs = prev.restAccumulatedMs || 0;
      if (prev.status === 'PAUSED' && prev.restStartTime) {
        restAccumulatedMs += Math.max(0, now - prev.restStartTime);
      }

      const newTimer = {
        status: 'RUNNING',
        accumulatedMs: prev.status === 'PAUSED' ? prev.accumulatedMs : (prev.accumulatedMs || 0),
        startTime: now,
        restAccumulatedMs,
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
      const prev = res[STORAGE_KEYS.TIMER];
      const settings = res[STORAGE_KEYS.SETTINGS] || {};
      if (!prev || prev.status !== 'RUNNING') {
        sendResponse({ success: false });
        return;
      }

      const now = Date.now();
      const elapsed = Math.max(0, now - (prev.startTime || now));
      const newTimer = {
        ...prev,
        status: 'PAUSED',
        accumulatedMs: prev.accumulatedMs + elapsed,
        startTime: null,
        restStartTime: now,
        restAccumulatedMs: prev.restAccumulatedMs || 0,
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
