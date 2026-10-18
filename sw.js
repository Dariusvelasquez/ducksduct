/* Service worker: makes the app load with no signal. The build fills in BUILD and SHELL.
 * App files are served from the cache first. Map pictures are kept as they are viewed so a job site seen once still
 * shows its map offline. Address and county lookups are never cached: they need a connection. */
const CACHE = 'ductlayout-__BUILD__', TILES = 'ductlayout-tiles', SHELL = __SHELL__;

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ductlayout-') && k !== CACHE && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));

async function trimTiles(max) { const c = await caches.open(TILES), ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match('index.html'))));
  } else if (req.destination === 'image') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(TILES).then((c) => c.put(req, copy)).then(() => trimTiles(400)); return res; }).catch(() => caches.match(req)));
  }
});
