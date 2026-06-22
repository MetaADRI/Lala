const CACHE_NAME = 'lala-v2';
const DATA_CACHE_NAME = 'lala-data-v2';
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
    })
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

  // Shell assets - Cache first, fallback to network
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request);
    })
  );
});
