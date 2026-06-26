const CACHE_NAME = 'lala-v3';
const DATA_CACHE_NAME = 'lala-data-v3';
const ASSETS = [
  '/',
  '/search.html',
  '/listing-detail.html',
  '/signup.html',
  '/common.css',
  '/api.js',
  '/config.js',
  '/logo-removebg-preview.png'
];

// Install event - caching assets
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('📦 Caching shell assets');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.filter(key => key !== CACHE_NAME && key !== DATA_CACHE_NAME).map(key => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Cache API responses (Listings)
  if (url.pathname.includes('/api/listings')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(cache => {
        return fetch(request)
          .then(response => {
            if (response.status === 200) {
              cache.put(request.url, response.clone());
            }
            return response;
          })
          .catch(() => {
            return cache.match(request.url);
          });
      })
    );
    return;
  }

  // HTML pages - Network first, cache as fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // api.js and config.js - Always network (no cache)
  if (url.pathname.endsWith('/api.js') || url.pathname.endsWith('/config.js')) {
    event.respondWith(fetch(request));
    return;
  }

  // Other static assets - Cache first, network fallback
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request);
    })
  );
});
