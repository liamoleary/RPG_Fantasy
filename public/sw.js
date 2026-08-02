/* Bannerfell service worker: the shell stays offline-capable, but the document
   itself is network-first — index.html points at hashed bundles, and serving a
   stale copy would pin returning players to an old deploy forever.
   Bump CACHE to invalidate. */
const CACHE = 'bannerfell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/healthz') return

  // The document: fresh if we can reach the network, cached if we can't.
  if (request.mode === 'navigate' || url.pathname === '/index.html') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))),
    )
    return
  }

  // Everything else is content-addressed (/assets/ is hashed) — cache-first.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        }),
    ),
  )
})
