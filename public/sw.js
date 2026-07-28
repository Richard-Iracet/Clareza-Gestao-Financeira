const CACHE_NAME = 'clareza-shell-v2'
const CACHE_PREFIXES = ['clareza-shell-', 'clareza-static-']
const INITIAL_SHELL = ['/', '/index.html', '/icons/icon.svg', '/icons/icon-maskable.svg']
const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image'])
const SUPABASE_PATH_PREFIXES = ['/auth/', '/rest/', '/realtime/', '/storage/']

const isSupabaseRequest = (url) => (
  url.hostname === 'supabase.co'
  || url.hostname.endsWith('.supabase.co')
  || SUPABASE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
)

const isCacheableResponse = (response) => (
  response.status === 200
  && response.type !== 'opaque'
  && response.type === 'basic'
  && !response.bodyUsed
)

const putInCacheSafely = async (key, response) => {
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(key, response)
  } catch (error) {
    console.warn('Clareza: não foi possível atualizar o cache estático.', error)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    await cache.addAll(INITIAL_SHELL)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (isSupabaseRequest(url)) return
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('.json') || url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (!isCacheableResponse(response)) return response

        // Clone immediately, before returning the original response or awaiting cache APIs.
        const responseForCache = response.clone()
        await putInCacheSafely('/index.html', responseForCache)
        return response
      } catch {
        return caches.match('/index.html')
      }
    })())
    return
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) return

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached

    const response = await fetch(request)
    if (!isCacheableResponse(response)) return response

    // Clone immediately, before returning the original response or awaiting cache APIs.
    const responseForCache = response.clone()
    await putInCacheSafely(request, responseForCache)
    return response
  })())
})
