import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initRumCollector } from './services/rumCollector.ts';
import { appUpdateService } from './services/appUpdateService.ts';
import './index.css';

if (typeof document !== 'undefined') {
  // Em ambiente de desenvolvimento local, limpa Service Workers antigos para evitar cache stale
  if ('serviceWorker' in navigator) {
    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    } else if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          appUpdateService.registerServiceWorkerRegistration(reg);
        }).catch(() => {
          // Falhas no registro do SW não degradam a aplicação
        });
      });
    }
  }

  // Inicializa o detector de versões e deploys zero-downtime
  appUpdateService.init();

  // Auto-recuperação inteligente de chunks do Vite caso um novo deploy substitua os bundles
  window.addEventListener('vite:preloadError', (event) => {
    const reloadKey = 'cfo_vite_chunk_reload';
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, 'true');
      event.preventDefault();
      window.location.reload();
    }
  });

  // Inicializa a telemetria passiva RUM (Core Web Vitals)
  initRumCollector();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
