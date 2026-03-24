const CACHE_NAME = 'lookis-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  'https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.js',
  'https://cdn.jsdelivr.net/npm/omggif@1.0.10/omggif.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      // Return cached response if found, else fetch from network
      return res || fetch(e.request);
    }).catch(() => {
      // Fallback for failed network request when offline
      if (e.request.url.includes('.html')) {
        return caches.match('./index.html');
      }
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});
