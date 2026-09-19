// Service worker for /book/ only. Network first (content stays fresh), cache as offline fallback.
const CACHE = 'proof-book-v1';
const CORE = [
  '/book/', '/book/en/', '/book/book.css', '/book/book.js',
  '/style.css', '/fonts/fonts.css',
  '/fonts/righteous-latin.woff2', '/fonts/righteous-latin-ext.woff2',
  '/fonts/jetbrainsmono-latin.woff2', '/fonts/jetbrainsmono-latin-ext.woff2',
  '/favicon.svg', '/bringin-logo.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
