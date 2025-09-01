// sw.js — cache by APP_VERSION, runtime caching, soft update
const SW_VERSION = (self.APP_VERSION || '0.0.0');
const PRECACHE = `precache:${SW_VERSION}`;
const RUNTIME = `runtime:${SW_VERSION}`;

const CORE = [
  '/',            // adjust if SPA root differs
  '/index.html',
  '/admin.html',
  '/employee.html',
  '/app.js',
  '/admin.js',
  '/employee.js',
  '/styles.css'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(PRECACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![PRECACHE, RUNTIME].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Runtime cache: network-first for HTML, stale-while-revalidate for JS/CSS
self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  if (req.destination === 'document' || (req.headers.get('accept') || '').includes('text/html')) {
    evt.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(RUNTIME);
        cache.put(req, net.clone());
        return net;
      } catch {
        const cache = await caches.open(RUNTIME);
        const match = await cache.match(req);
        return match || caches.match('/index.html');
      }
    })());
    return;
  }

  if (['script','style','font'].includes(req.destination)) {
    evt.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      const fetchAndPut = fetch(req).then(res => {
        cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || await fetchAndPut || fetch(req);
    })());
    return;
  }

  // Default: try cache, then network
  evt.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      cache.put(req, net.clone());
      return net;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});