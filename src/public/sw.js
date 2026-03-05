const CACHE_NAME = 'creaturelabs-runtime-v1';

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key !== CACHE_NAME) return caches.delete(key);
      return null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const scopeUrl = new URL(self.registration.scope);
  const appShellPath = scopeUrl.pathname;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const networkResponse = await fetch(event.request);
      cache.put(event.request, networkResponse.clone());
      return networkResponse;
    } catch {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;
      const appShell = await cache.match(appShellPath);
      if (appShell) return appShell;
      throw new Error('Offline and resource not cached.');
    }
  })());
});
