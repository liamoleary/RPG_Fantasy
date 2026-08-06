/* Bannerfell service worker: the shell stays offline-capable, but the document
   itself is network-first — index.html points at hashed bundles, and serving a
   stale copy would pin returning players to an old deploy forever.
   Bump CACHE to invalidate. */
const CACHE = 'bannerfell-v4'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

/* The app hands us the plate list once it is idle (see src/ui/preload.ts).
   Keeping it out of `install` means 3.2 MB of art never blocks first paint,
   but a second run — or an offline one — has every card ready. */
self.addEventListener('message', (e) => {
  const data = e.data
  if (!data || data.type !== 'warm-art' || !Array.isArray(data.urls)) return
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      for (const url of data.urls) {
        try {
          if (await c.match(url)) continue
          await c.add(url)
        } catch {
          // A plate that will not fetch just stays uncached.
        }
      }
    }),
  )
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
  /* The API is never cached. The handler below is cache-first, which for
     /api/save means the first "no save yet" 404 would be replayed forever and
     a player's progress would never come back from the server. Sync owns its
     own offline story (Launch Plan §2); it does not want help from here. */
  if (url.pathname.startsWith('/api/')) return

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
