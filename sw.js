const CACHE_NAME = 'lookis-v2';
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
  self.skipWaiting(); // Force the new version to take over immediately
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
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

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Network First Strategy: Always check GitHub for new updates!
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => {
        // If internet is off (Offline Mode), load from cache
        return caches.match(e.request).then(cachedRes => {
          return cachedRes || caches.match('./index.html');
        });
      })
  );
});
