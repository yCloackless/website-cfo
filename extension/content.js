/**
 * CFO CBMERJ — Content Script Bridge (Manifest V3)
 * Estabelece a ponte de comunicação bidirecional em tempo real (< 5ms)
 * entre a aplicação Web (cronômetro no navegador) e a extensão Chrome.
 */

(function () {
  'use strict';

  let bridgePort = null;
  let reconnectTimeout = null;

  function connectToBackground() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
        return;
      }

      bridgePort = chrome.runtime.connect({ name: 'cfo-web-bridge' });

      // Recebe atualizações em tempo real vindas da extensão (popup ou background)
      bridgePort.onMessage.addListener((message) => {
        if (!message || !message.type) return;

        if (message.type === 'EXTENSION_TIMER_SYNC') {
          // Dispara evento imediato para o window da página web
          window.postMessage(
            {
              source: 'cfo-extension',
              type: 'TIMER_SYNC_FROM_EXTENSION',
              payload: message.payload,
            },
            '*'
          );
        }
      });

      // Reconecta automaticamente caso o background service worker seja suspenso pelo Chrome
      bridgePort.onDisconnect.addListener(() => {
        bridgePort = null;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectToBackground, 1500);
      });

      // Solicita estado atual do cronômetro da extensão logo ao carregar a página
      bridgePort.postMessage({ type: 'REQUEST_INITIAL_TIMER_STATE' });

      // Envia token de autenticação ativo do site para sincronização automática da extensão
      syncAuthToken();
    } catch (err) {
      bridgePort = null;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(connectToBackground, 3000);
    }
  }

  // Sincroniza sessão ativa do site com a extensão
  function syncAuthToken() {
    try {
      const session = window.localStorage.getItem('cfo_terminal_session');
      if (session && session !== 'cookie' && bridgePort) {
        bridgePort.postMessage({
          type: 'AUTH_SESSION_UPDATE',
          payload: {
            token: session,
            serverUrl: window.location.origin,
          },
        });
      }
    } catch {
      // Ignora restrições de storage caso ocorram
    }
  }

  // Ouve eventos disparados pelo cronômetro da plataforma Web
  window.addEventListener('message', (event) => {
    // Validação estrita de origem e payload para segurança
    if (event.source !== window || !event.data) return;

    if (event.data.source === 'cfo-web' && event.data.type === 'TIMER_SYNC_FROM_WEB') {
      if (!bridgePort) {
        connectToBackground();
      }

      if (bridgePort) {
        try {
          bridgePort.postMessage({
            type: 'WEB_TIMER_UPDATE',
            payload: event.data.payload,
          });
        } catch {
          connectToBackground();
        }
      }
    }

    if (event.data.source === 'cfo-web' && event.data.type === 'AUTH_SESSION_SYNC') {
      syncAuthToken();
    }
  });

  // Conecta na inicialização do script
  connectToBackground();

  // Verifica token se a aba receber foco ou recarregar
  window.addEventListener('focus', syncAuthToken);
})();
