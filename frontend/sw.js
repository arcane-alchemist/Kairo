const CACHE = 'kairo-recovery-v13';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/offline.html'];
const PUBLIC = ['/api/events', '/api/config'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kairo-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Cache only the app shell, explicitly public discovery, and content-addressed artwork. Never wallet lookups, sessions, tickets or staff APIs.
  const safe = !url.search && (SHELL.includes(url.pathname) || PUBLIC.includes(url.pathname) || /^\/media\/(art|metadata)\/[a-f0-9]{64}\.(png|jpg|svg|json)$/.test(url.pathname));
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!safe) {
    if (request.mode === 'navigate' && !url.pathname.startsWith('/api/')) event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil((async () => {
          await cache.put(request, copy);
          // Bound public artwork storage instead of growing the offline cache indefinitely.
          const media = (await cache.keys()).filter(key => new URL(key.url).pathname.startsWith('/media/'));
          await Promise.all(media.slice(0, Math.max(0, media.length - 60)).map(key => cache.delete(key)));
        })());
      }
      return response;
    } catch {
      return await cache.match(request) || (request.mode === 'navigate' ? await cache.match('/offline.html') : null) || new Response(JSON.stringify({error:'Can’t reach Kairo. Check your connection, then retry.',code:'UNREACHABLE'}), {status:503,headers:{'content-type':'application/json','cache-control':'no-store'}});
    }
  })());
});
