/* Service worker: precaches the app shell, serves navigation requests offline,
 * caches API reads with a network-first strategy and training media on demand. */
declare const __PRECACHE__: string[];
declare const __SW_VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const SHELL = `rm-shell-${__SW_VERSION__}`;
const API = 'rm-api';
const MEDIA = 'rm-media';

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(__PRECACHE__))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rm-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) void caches.open(API).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r ?? new Response(JSON.stringify({ error: 'Offline', offline: true }), { status: 503, headers: { 'content-type': 'application/json' } }))),
    );
    return;
  }

  if (url.pathname.startsWith('/training/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok && req.method === 'GET' && !req.headers.has('range')) void caches.open(MEDIA).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Static assets: cache first, fall back to network and populate the cache.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && req.method === 'GET') void caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});
