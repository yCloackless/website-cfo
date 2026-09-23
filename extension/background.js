/**
 * CFO CBMERJ — Background Service Worker (Manifest V3)
 * Mantém o cronômetro ativo em segundo plano e orquestra a sincronização com a plataforma.
 */

// Chaves no chrome.storage.local
const STORAGE_KEYS = {
  TIMER: 'cfo_ext_timer',
  SETTINGS: 'cfo_ext_settings',
  LEVELING: 'cfo_ext_leveling',
  SERVER_OFFSET: 'cfo_ext_server_offset',
};

let serverOffset = 0;
let timerRevision = 0;
let commandRevision = 0;
let pendingTimerWrites = 0;
let timerWrites = Promise.resolve();

// Start/pause/reset chegam ao servidor na mesma ordem dos cliques.
function writeTimer(url, options) {
  pendingTimerWrites += 1;
  const request = timerWrites.then(async () => {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error('Falha ao sincronizar cronômetro');
    return response.json();
  });
  timerWrites = request.catch(() => {});
  return request.finally(() => { pendingTimerWrites -= 1; });
}
chrome.storage.local.get([STORAGE_KEYS.SERVER_OFFSET], (result) => {
  if (typeof result[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
    serverOffset = result[STORAGE_KEYS.SERVER_OFFSET];
  }
});

function getServerNow() {
  return Date.now() + (Number(serverOffset) || 0);
}

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
  chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SERVER_OFFSET], (res) => {
    if (typeof res[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
      serverOffset = res[STORAGE_KEYS.SERVER_OFFSET];
    }
    let timer = res[STORAGE_KEYS.TIMER];
    if (typeof timerOrStatus === 'object' && timerOrStatus !== null) {
      timer = timerOrStatus;
    }

    if (!timer || timer.status === 'STOPPED') {
      chrome.action.setBadgeText({ text: '' });
      chrome.action.setTitle({ title: 'CFO CBMERJ — Painel Tático' });
      return;
    }

    const now = getServerNow();

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
      const prevRest = Number(timer.restAccumulatedMs) || 0;
      const restStart = timer.restStartTime || now;
      const restElapsed = prevRest + Math.max(0, now - restStart);
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

let activeTicker = null;
function ensureTicker(status) {
  if (status === 'RUNNING' || status === 'PAUSED') {
    if (!activeTicker) {
      activeTicker = setInterval(() => updateBadge(), 1000);
    }
  } else {
    if (activeTicker) {
      clearInterval(activeTicker);
      activeTicker = null;
    }
  }
}

// Alarme para manter o badge atualizado caso o service worker seja suspenso e reativado
function setupAlarms() {
  chrome.alarms.get('cfo_timer_tick', (existing) => {
    if (!existing) {
      chrome.alarms.create('cfo_timer_tick', { periodInMinutes: 1 });
    }
  });
}
setupAlarms();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cfo_timer_tick') {
    updateBadge();
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  updateBadge();
});

// Web bridge - Conexões persistentes em tempo real via content.js
const webBridgePorts = new Set();

function broadcastToWeb(timerState) {
  if (!timerState) return;
  timerState = { ...timerState, serverOffset };

  // 1. Envia para portas abertas na conexão persistente (webBridgePorts)
  for (const port of webBridgePorts) {
    try {
      port.postMessage({
        type: 'EXTENSION_TIMER_SYNC',
        payload: timerState,
      });
    } catch {
      webBridgePorts.delete(port);
    }
  }

  // 2. Envia diretamente para todas as abas ativas via tabs.sendMessage (resiliente contra quedas de porta)
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      chrome.tabs.query({}, (tabs) => {
        if (chrome.runtime.lastError || !tabs) return;
        for (const tab of tabs) {
          if (!tab.id) continue;
          try {
            chrome.tabs.sendMessage(
              tab.id,
              {
                type: 'EXTENSION_TIMER_SYNC',
                payload: timerState,
              },
              () => {
                if (chrome.runtime.lastError) {
                  // Contingência: se a aba perdeu a conexão com o content script (ex.: recarregamento da extensão),
                  // injeta e dispara diretamente via chrome.scripting no DOM da aba!
                  if (chrome.scripting && chrome.scripting.executeScript) {
                    chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: (payload) => {
                        window.postMessage({
                          source: 'cfo-extension',
                          type: 'TIMER_SYNC_FROM_EXTENSION',
                          payload: payload,
                        }, '*');
                        try {
                          document.dispatchEvent(new CustomEvent('cfo-timer-ext-event', {
                            detail: { source: 'cfo-extension', type: 'TIMER_SYNC_FROM_EXTENSION', payload }
                          }));
                        } catch {}
                      },
                      args: [timerState],
                    }).catch(() => {});
                  }
                }
              }
            );
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      /* ignore */
    }
  }
}

function applyWebTimerUpdate(web) {
  if (!web) return;

  chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
    const prev = res[STORAGE_KEYS.TIMER] || {};

    if (web.status === 'STOPPED') {
      const resetTimer = {
        status: 'STOPPED',
        accumulatedMs: 0,
        accumulatedTime: 0,
        startTime: null,
        restAccumulatedMs: 0,
        restStartTime: null,
        subjectId: 'geral',
        subjectName: 'Estudo Geral',
      };
      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: resetTimer }, () => {
        updateBadge(resetTimer);
        ensureTicker('STOPPED');
      });
      return;
    }

    if (Number.isFinite(web.serverOffset) || typeof web.serverTime === 'number') {
      serverOffset = Number.isFinite(web.serverOffset) ? web.serverOffset : web.serverTime - Date.now();
      chrome.storage.local.set({ [STORAGE_KEYS.SERVER_OFFSET]: serverOffset });
    }

    const pauseDelta = web.status === 'PAUSED' && prev.status === 'RUNNING' && prev.startTime
      ? Math.max(0, (web.restStartTime || getServerNow()) - prev.startTime) : 0;
    const nextAcc = typeof web.accumulatedTime === 'number'
      ? web.accumulatedTime
      : (typeof web.accumulatedMs === 'number' ? web.accumulatedMs : (Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0) + pauseDelta);
    const nextRestAcc = typeof web.restAccumulatedMs === 'number'
      ? web.restAccumulatedMs
      : (typeof web.totalRestMs === 'number' ? web.totalRestMs : prev.restAccumulatedMs || 0);

    const updatedTimer = {
      serverOffset,
      status: web.status || prev.status || 'STOPPED',
      accumulatedMs: nextAcc,
      accumulatedTime: nextAcc,
      startTime: web.startTime !== undefined ? web.startTime : (web.status === 'RUNNING' ? getServerNow() : null),
      restAccumulatedMs: nextRestAcc,
      restStartTime: web.restStartTime !== undefined ? web.restStartTime : (web.status === 'PAUSED' ? getServerNow() : null),
      subjectId: web.activeSubjectId || web.subjectId || prev.subjectId || 'geral',
      subjectName: web.activeSubjectName || web.subjectName || prev.subjectName || 'Estudo Geral',
    };

    chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: updatedTimer }, () => {
      updateBadge(updatedTimer);
      ensureTicker(updatedTimer.status);
    });
  });
}

function applyAuthSessionUpdate(payload) {
  const { token, serverUrl } = payload || {};
  if (token && typeof token === 'string' && token !== 'cookie') {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (res) => {
      const prevSettings = res[STORAGE_KEYS.SETTINGS] || {};
      const targetServerUrl = serverUrl || prevSettings.serverUrl || 'https://cfo-oficial-agorasim.onrender.com';
      if (prevSettings.token === token && prevSettings.serverUrl === targetServerUrl) {
        return; // Token e servidor já atualizados e sincronizados
      }
      const newSettings = {
        ...prevSettings,
        token: token,
        serverUrl: targetServerUrl,
      };
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: newSettings }, () => {
        pollServerStatus();
      });
    });
  }
}

let isPolling = false;
function pollServerStatus() {
  if (isPolling || pendingTimerWrites) return;
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.TIMER, STORAGE_KEYS.SERVER_OFFSET], (res) => {
    const settings = res[STORAGE_KEYS.SETTINGS] || {};
    if (!settings.serverUrl || !settings.token) return;

    if (typeof res[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
      serverOffset = res[STORAGE_KEYS.SERVER_OFFSET];
    }

    isPolling = true;
    const revision = timerRevision;
    fetch(`${settings.serverUrl}/api/timer/status`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((cloud) => {
        if (!cloud || !cloud.status || pendingTimerWrites || revision !== timerRevision) return;

        if (typeof cloud.serverTime === 'number') {
          serverOffset = cloud.serverTime - Date.now();
          chrome.storage.local.set({ [STORAGE_KEYS.SERVER_OFFSET]: serverOffset });
        }

        const current = res[STORAGE_KEYS.TIMER] || {};
        const cloudAcc = Number(cloud.accumulatedTime ?? cloud.accumulatedMs ?? 0);
        const cloudRestAcc = Number(cloud.restAccumulatedMs ?? cloud.totalRestMs) || 0;

        const nextTimer = {
          serverOffset,
          status: cloud.status,
          accumulatedMs: cloudAcc,
          accumulatedTime: cloudAcc,
          startTime: cloud.startTime || null,
          restAccumulatedMs: cloudRestAcc,
          restStartTime: cloud.restStartTime || null,
          subjectId: cloud.activeSubjectId || current.subjectId || 'geral',
          subjectName: cloud.activeSubjectName || current.subjectName || 'Estudo Geral',
        };

        const statusChanged = current.status !== nextTimer.status;
        const startTimeChanged =
          nextTimer.status === 'RUNNING' &&
          nextTimer.startTime &&
          current.startTime !== nextTimer.startTime;
        const accChanged =
          (current.accumulatedMs || 0) !== nextTimer.accumulatedMs;
        const subjectChanged = nextTimer.subjectId && current.subjectId !== nextTimer.subjectId;

        const changed = statusChanged || startTimeChanged || accChanged || subjectChanged || current.serverOffset !== serverOffset;

        if (changed) {
          chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: nextTimer }, () => {
            updateBadge(nextTimer);
            ensureTicker(nextTimer.status);
            broadcastToWeb(nextTimer);
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        isPolling = false;
      });
  });
}

// Inicia polling periódico de servidor com cadência balanceada (evita HTTP 429)
setInterval(pollServerStatus, 12000);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'cfo-web-bridge') {
    webBridgePorts.add(port);

    port.onDisconnect.addListener(() => {
      webBridgePorts.delete(port);
    });

    port.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'REQUEST_INITIAL_TIMER_STATE') {
        chrome.storage.local.get([STORAGE_KEYS.TIMER], (res) => {
          if (res[STORAGE_KEYS.TIMER]) {
            try {
              port.postMessage({
                type: 'EXTENSION_TIMER_SYNC',
                payload: res[STORAGE_KEYS.TIMER],
              });
            } catch {
              webBridgePorts.delete(port);
            }
          }
        });
      } else if (msg.type === 'WEB_TIMER_UPDATE') {
        applyWebTimerUpdate(msg.payload);
      } else if (msg.type === 'AUTH_SESSION_UPDATE') {
        applyAuthSessionUpdate(msg.payload);
      }
    });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes[STORAGE_KEYS.TIMER]) {
      timerRevision += 1;
      const next = changes[STORAGE_KEYS.TIMER].newValue;
      updateBadge(next);
      ensureTicker(next?.status);
      broadcastToWeb(next);
    }
    if (changes[STORAGE_KEYS.SERVER_OFFSET]) {
      if (typeof changes[STORAGE_KEYS.SERVER_OFFSET].newValue === 'number') {
        serverOffset = changes[STORAGE_KEYS.SERVER_OFFSET].newValue;
      }
    }
    if (changes[STORAGE_KEYS.SETTINGS]) {
      pollServerStatus();
    }
  }
});

// Comunicação com o popup e content script via runtime message
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  if (type === 'WEB_TIMER_UPDATE') {
    applyWebTimerUpdate(payload);
    sendResponse({ success: true });
    return true;
  }

  if (type === 'AUTH_SESSION_UPDATE') {
    applyAuthSessionUpdate(payload);
    sendResponse({ success: true });
    return true;
  }

  if (type === 'GET_TIMER_STATE') {
    chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SERVER_OFFSET], (res) => {
      if (typeof res[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
        serverOffset = res[STORAGE_KEYS.SERVER_OFFSET];
      }
      sendResponse({ timer: res[STORAGE_KEYS.TIMER], serverOffset });
    });
    return true; // async
  }

  if (type === 'TIMER_START') {
    const command = ++commandRevision;
    chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.SERVER_OFFSET], (res) => {
      if (typeof res[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
        serverOffset = res[STORAGE_KEYS.SERVER_OFFSET];
      }
      const prev = res[STORAGE_KEYS.TIMER] || { accumulatedMs: 0 };
      const settings = res[STORAGE_KEYS.SETTINGS] || {};
      const now = getServerNow();
      const prevAcc = typeof payload?.accumulatedTime === 'number'
        ? payload.accumulatedTime
        : (Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0);
      const prevRestAcc = Number(prev.restAccumulatedMs) || 0;
      const restDelta = prev.status === 'PAUSED' && prev.restStartTime ? Math.max(0, now - prev.restStartTime) : 0;
      const newRestAcc = prevRestAcc + restDelta;

      const newTimer = {
        serverOffset,
        status: 'RUNNING',
        accumulatedMs: prevAcc,
        accumulatedTime: prevAcc,
        startTime: now,
        restAccumulatedMs: newRestAcc,
        restStartTime: null,
        subjectId: payload?.subjectId || prev.subjectId || 'geral',
        subjectName: payload?.subjectName || prev.subjectName || 'Estudo Geral',
      };

      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
        updateBadge(newTimer);
        ensureTicker('RUNNING');
        broadcastToWeb(newTimer);
        sendResponse({ success: true, timer: newTimer, serverOffset });

        // Sincroniza com o backend se houver token
        if (settings.serverUrl && settings.token) {
          writeTimer(`${settings.serverUrl}/api/timer/start`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
            body: JSON.stringify({
              subjectId: newTimer.subjectId,
              subjectName: newTimer.subjectName,
              accumulatedTime: newTimer.accumulatedMs,
              resetAccumulated: newTimer.accumulatedMs === 0,
            }),
          })
            .then((cloud) => {
              if (command !== commandRevision) return;
              if (!cloud) return;
              if (typeof cloud.serverTime === 'number') {
                serverOffset = cloud.serverTime - Date.now();
                chrome.storage.local.set({ [STORAGE_KEYS.SERVER_OFFSET]: serverOffset });
              }
              if (cloud.startTime) {
                newTimer.serverOffset = serverOffset;
                newTimer.startTime = cloud.startTime;
                newTimer.accumulatedMs = Number(cloud.accumulatedTime ?? newTimer.accumulatedMs);
                newTimer.accumulatedTime = newTimer.accumulatedMs;
                chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
                  broadcastToWeb(newTimer);
                });
              }
            })
            .catch((err) => console.warn('[CFO Ext] Falha sync start:', err));
        }
      });
    });
    return true;
  }

  if (type === 'TIMER_PAUSE') {
    const command = ++commandRevision;
    chrome.storage.local.get([STORAGE_KEYS.TIMER, STORAGE_KEYS.SETTINGS, STORAGE_KEYS.SERVER_OFFSET], (res) => {
      if (typeof res[STORAGE_KEYS.SERVER_OFFSET] === 'number') {
        serverOffset = res[STORAGE_KEYS.SERVER_OFFSET];
      }
      const prev = res[STORAGE_KEYS.TIMER] || { accumulatedMs: 0 };
      const settings = res[STORAGE_KEYS.SETTINGS] || {};

      const now = getServerNow();
      const elapsed = prev.status === 'RUNNING' && prev.startTime ? Math.max(0, now - prev.startTime) : 0;
      const prevAcc = Number(prev.accumulatedMs ?? prev.accumulatedTime) || 0;
      const newAcc = prevAcc + elapsed;
      const prevRestAcc = Number(prev.restAccumulatedMs) || 0;

      const newTimer = {
        ...prev,
        serverOffset,
        status: 'PAUSED',
        accumulatedMs: newAcc,
        accumulatedTime: newAcc,
        startTime: null,
        restStartTime: now,
        restAccumulatedMs: prevRestAcc,
      };

      chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: newTimer }, () => {
        updateBadge(newTimer);
        ensureTicker('PAUSED');
        broadcastToWeb(newTimer);
        sendResponse({ success: true, timer: newTimer, serverOffset });

        if (settings.serverUrl && settings.token) {
          writeTimer(`${settings.serverUrl}/api/timer/pause`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
            body: JSON.stringify({ accumulatedTime: newAcc }),
          })
            .then((cloud) => {
              if (command !== commandRevision) return;
              if (cloud && typeof cloud.serverTime === 'number') {
                serverOffset = cloud.serverTime - Date.now();
                chrome.storage.local.set({ [STORAGE_KEYS.SERVER_OFFSET]: serverOffset });
              }
              if (cloud && cloud.status === 'PAUSED') {
                const cloudAcc = Number(cloud.accumulatedTime ?? cloud.accumulatedMs ?? newTimer.accumulatedMs);
                const cloudRestAcc = Number(cloud.restAccumulatedMs ?? cloud.totalRestMs ?? newTimer.restAccumulatedMs);
                const cloudTimer = {
                  ...newTimer,
                  serverOffset,
                  accumulatedMs: cloudAcc,
                  accumulatedTime: cloudAcc,
                  startTime: null,
                  restStartTime: cloud.restStartTime || newTimer.restStartTime,
                  restAccumulatedMs: cloudRestAcc,
                };
                chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: cloudTimer }, () => {
                  broadcastToWeb(cloudTimer);
                });
              }
            })
            .catch((err) => console.warn('[CFO Ext] Falha sync pause:', err));
        }
      });
    });
    return true;
  }

  if (type === 'TIMER_RESET') {
    const command = ++commandRevision;
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS], (res) => {
      const settings = res[STORAGE_KEYS.SETTINGS] || {};
      const newTimer = {
        serverOffset,
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
        updateBadge(newTimer);
        ensureTicker('STOPPED');
        broadcastToWeb(newTimer);
        sendResponse({ success: true, timer: newTimer });

        if (settings.serverUrl && settings.token) {
          writeTimer(`${settings.serverUrl}/api/timer/reset`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.token}`,
            },
          })
            .then((cloud) => {
              if (command !== commandRevision) return;
              if (cloud && typeof cloud.serverTime === 'number') {
                serverOffset = cloud.serverTime - Date.now();
                chrome.storage.local.set({ [STORAGE_KEYS.SERVER_OFFSET]: serverOffset });
              }
              broadcastToWeb(newTimer);
            })
            .catch((err) => console.warn('[CFO Ext] Falha sync reset:', err));
        }
      });
    });
    return true;
  }
});
