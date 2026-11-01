// Service Worker for Dajja POS & Restaurant Dashboard (Offline-First Resilience)
const CACHE_NAME = 'dajja-pos-cache-v1';

const STATIC_ASSETS = [
  '/',
  '/dajja-dashboard',
  '/restaurant-dashboard',
  '/order',
  '/sounds/talabat_order_alert.wav'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Cache prefetch partial warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip caching for API calls or non-GET requests
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Network-First with Cache Fallback for HTML pages & static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        if (event.request.mode === 'navigate') {
          const dashboardFallback = await caches.match('/dajja-dashboard') || await caches.match('/');
          if (dashboardFallback) return dashboardFallback;
        }

        return new Response('Offline: Network unavailable and no cached version found.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
