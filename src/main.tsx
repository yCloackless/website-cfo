import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initRumCollector } from './services/rumCollector.ts';
import { appUpdateService } from './services/appUpdateService.ts';
import './index.css';

if (typeof document !== 'undefined') {
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  // Registro de Service Worker PWA para suporte offline e atualizações em background (Padrão Amazon)
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        appUpdateService.registerServiceWorkerRegistration(reg);
      }).catch(() => {
        // Falhas no registro do SW não degradam a aplicação
      });
    });
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
