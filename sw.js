// Service worker: works offline, caches the app and its chess libraries.
const VERSION = 'cc-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-180.png'];
const LIBS = {
  'lib/chess.min.js': ['https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js', 'https://cdn.jsdelivr.net/npm/chess.js@0.10.3/chess.min.js'],
  'lib/stockfish.js': ['https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js', 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js']
};
const scopeUrl = p => new URL(p, self.registration.scope).href;

async function fetchLib(path) {
  for (const u of LIBS[path]) {
    try {
      const r = await fetch(u, { mode: 'cors' });
      if (r.ok) {
        const body = await r.blob();
        return new Response(body, { headers: { 'Content-Type': 'application/javascript; charset=utf-8' } });
      }
    } catch (e) {}
  }
  return null;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(CORE);
    for (const p of Object.keys(LIBS)) {
      const r = await fetchLib(p);
      if (r) await c.put(scopeUrl(p), r);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.chess.com') return; // always live
  const libPath = Object.keys(LIBS).find(p => url.href === scopeUrl(p));
  if (libPath) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(url.href);
      if (hit) return hit;
      const r = await fetchLib(libPath);
      if (r) { c.put(url.href, r.clone()); return r; }
      return new Response('', { status: 404 });
    })());
    return;
  }
  if (req.mode === 'navigate') {
    // network first so updates arrive, cache when offline
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(VERSION); c.put(scopeUrl('index.html'), r.clone());
        return r;
      } catch (err) {
        return (await caches.match(scopeUrl('index.html'))) || (await caches.match(scopeUrl('./')));
      }
    })());
    return;
  }
  // everything else (icons, fonts, CDN fallbacks): cache first, then network
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') { const c = await caches.open(VERSION); c.put(req, r.clone()); }
      return r;
    } catch (err) { return hit || Response.error(); }
  })());
});
