/**
 * Rumo ao CFO - Service Worker Tático & Resiliente
 * Versão: 1.0.0
 * Estratégias: Cache First (Assets/Fontes), Network First (Navegação/Bizuário), Network Only (Auth/Admin/Financeiro)
 */

const CACHE_VERSION = 'cfo-tactical-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/favicon-32.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/phoenix-logo-header.webp',
  '/phoenix-logo-header.png',
  '/phoenix-logo-cropped.png',
  '/visuals.css'
];

// Instalação do Service Worker e pré-armazenamento dos recursos críticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Listener para comando de atualização imediata enviado pelo frontend
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Ativação e limpeza de caches obsoletos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_VERSION) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação inteligente de requisições
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. NETWORK ONLY ESTRITO (Segurança & Reatividade): Todas as rotas de API (/api/*) e métodos não-GET
  if (
    url.pathname.startsWith('/api/') ||
    request.method !== 'GET'
  ) {
    return; // Passa direto para a rede sem tocar em cache
  }

  // 2. CACHE FIRST / STALE-WHILE-REVALIDATE: Fontes Google, Imagens e Assets com Hash
  const isStaticAsset =
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|woff2?|ttf|eot)$/i);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. NETWORK FIRST COM FALLBACK DE CACHE: Navegação de Páginas e Rotas da Aplicação
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const rootFallback = await caches.match('/index.html') || await caches.match('/');
          return rootFallback;
        })
    );
    return;
  }

  // 4. Default: Stale-While-Revalidate para outros recursos estáticos de leitura
  event.respondWith(
    caches.match(request).then((cached) => {
      const networked = fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || networked;
    })
  );
});
