// Bumping CACHE_NAME purges old caches (which may hold stale JS chunks that
// cause "module factory not available" after a deploy).
const CACHE_NAME = 'clustergate-v3'
const STATIC_ASSETS = [
  '/favicon.svg',
  '/logo.svg',
  '/manifest.json',
]

// Install: cache a few static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  // API / proxy — always network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/r/')) return

  // Navigation (HTML): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/dashboard').then((c) => c || caches.match(request)))
    )
    return
  }

  // A small allow-list of immutable static assets is served stale-while-revalidate
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        }).catch(() => cached)
        return cached || fetchPromise
      })
    )
    return
  }

  // Everything else (incl. Next.js /_next/ JS chunks): NETWORK-FIRST so a deploy
  // never serves stale, mismatched chunks. Fall back to cache only when offline.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === 'basic') {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
      }
      return response
    }).catch(() => caches.match(request))
  )
})
