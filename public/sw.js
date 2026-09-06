/* AccessMap service worker — offline-first app shell.
 *
 * Strategy:
 *   • Navigations  → network-first, fall back to cached shell when offline.
 *   • Static build assets (same-origin JS/CSS/fonts/images) → stale-while-revalidate.
 *   • Map tiles (CartoDB) → cache-first (so visited areas work offline).
 *   • Everything else (Firebase, geocoding/Overpass APIs) → straight to network
 *     so we never serve stale dynamic data.
 *
 * Bump CACHE_VERSION to invalidate old caches on deploy.
 */
const CACHE_VERSION = 'am-v2'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const ASSET_CACHE = `${CACHE_VERSION}-assets`
const TILE_CACHE = `${CACHE_VERSION}-tiles`

const SHELL = [
  '/', '/index.html', '/manifest.json', '/pin.svg',
  '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

// Let the page trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

function isTile(url) {
  return url.hostname.endsWith('basemaps.cartocdn.com')
}

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    /\.(?:js|css|woff2?|ttf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // SPA navigations — network-first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    )
    return
  }

  // Map tiles — cache-first.
  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(request).then((hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone())
            return res
          }).catch(() => hit),
        ),
      ),
    )
    return
  }

  // Build assets — stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(request).then((hit) => {
          const network = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone())
              return res
            })
            .catch(() => hit)
          return hit || network
        }),
      ),
    )
    return
  }

  // Everything else: network only (dynamic APIs, auth, etc.).
})
