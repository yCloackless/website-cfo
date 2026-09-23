/**
 * CFO CBMERJ — Content Script Bridge (Manifest V3)
 * Estabelece a ponte de comunicação bidirecional em tempo real (< 5ms)
 * entre a aplicação Web (cronômetro no navegador) e a extensão Chrome.
 */

(function () {
  'use strict';

  let bridgePort = null;
  let reconnectTimeout = null;

  // Envia mensagem ao background service worker de forma resiliente
  function sendToBackground(msg) {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    // Usa um único canal para que a mesma ação não seja aplicada duas vezes.
    if (bridgePort) {
      try {
        bridgePort.postMessage(msg);
        return;
      } catch {
        bridgePort = null;
      }
    }

    try {
      chrome.runtime.sendMessage(msg, () => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  // Notifica a aplicação web via postMessage e CustomEvent (0ms)
  function dispatchToWeb(payload) {
    if (!payload) return;

    try {
      document.dispatchEvent(
        new CustomEvent('cfo-timer-ext-event', {
          detail: {
            source: 'cfo-extension',
            type: 'TIMER_SYNC_FROM_EXTENSION',
            payload: payload,
          },
        })
      );
    } catch {
      /* ignore */
    }
  }

  function connectToBackground() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
        return;
      }

      bridgePort = chrome.runtime.connect({ name: 'cfo-web-bridge' });

      bridgePort.onMessage.addListener((message) => {
        if (!message || !message.type) return;
        if (message.type === 'EXTENSION_TIMER_SYNC') {
          dispatchToWeb(message.payload);
        }
      });

      bridgePort.onDisconnect.addListener(() => {
        bridgePort = null;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectToBackground, 1000);
      });

      // Solicita estado inicial do cronômetro da extensão
      sendToBackground({ type: 'REQUEST_INITIAL_TIMER_STATE' });

      // Sincroniza credenciais
      syncAuthToken();
    } catch {
      bridgePort = null;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connectToBackground, 2000);
    }
  }

  // Escuta mensagens recebidas via chrome.runtime.onMessage (caso enviadas fora do port)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === 'EXTENSION_TIMER_SYNC') {
        dispatchToWeb(message.payload);
        if (typeof sendResponse === 'function') {
          sendResponse({ received: true });
        }
      }
    });
  }

  // Escuta alterações reativas em chrome.storage.onChanged para cfo_ext_timer
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes && changes.cfo_ext_timer && changes.cfo_ext_timer.newValue) {
        dispatchToWeb(changes.cfo_ext_timer.newValue);
      }
    });
  }

  // Sincroniza sessão ativa do site com a extensão (suporte tanto a localStorage quanto a cookie)
  let lastTokenSyncTime = 0;
  function syncAuthToken(force = false) {
    try {
      const session = window.localStorage.getItem('cfo_terminal_session');
      if (session && session !== 'cookie') {
        sendToBackground({
          type: 'AUTH_SESSION_UPDATE',
          payload: {
            token: session,
            serverUrl: window.location.origin,
          },
        });
        return;
      }

      // Evita requisições repetidas ao endpoint caso tenha sincronizado há menos de 30 segundos
      const now = Date.now();
      if (!force && now - lastTokenSyncTime < 30000) {
        return;
      }

      // Se for sessão via cookie, obtém a chave de extensão através da rota autenticada
      fetch('/api/user/extension-token', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.token) {
            lastTokenSyncTime = Date.now();
            sendToBackground({
              type: 'AUTH_SESSION_UPDATE',
              payload: {
                token: data.token,
                serverUrl: window.location.origin,
              },
            });
          }
        })
        .catch(() => {});
    } catch {
      // Ignora restrições de storage caso ocorram
    }
  }

  // Trata eventos disparados pela página web
  function handleWebTimerEvent(payload) {
    if (!payload) return;
    sendToBackground({
      type: 'WEB_TIMER_UPDATE',
      payload: payload,
    });
  }

  // 1. Listener via window.postMessage
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.source === 'cfo-web' && event.data.type === 'TIMER_SYNC_FROM_WEB') {
      handleWebTimerEvent(event.data.payload);
    }

    if (event.data.source === 'cfo-web' && event.data.type === 'AUTH_SESSION_SYNC') {
      syncAuthToken();
    }
  });

  // 2. Listener via CustomEvent no document
  document.addEventListener('cfo-timer-web-event', (event) => {
    const detail = event && event.detail;
    if (detail && detail.source === 'cfo-web' && detail.type === 'TIMER_SYNC_FROM_WEB') {
      handleWebTimerEvent(detail.payload);
    }
  });

  // Conexão imediata
  connectToBackground();

  // Re-sincroniza ao focar na janela
  window.addEventListener('focus', () => {
    syncAuthToken();
    sendToBackground({ type: 'REQUEST_INITIAL_TIMER_STATE' });
  });
})();
