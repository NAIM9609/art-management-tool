/* eslint-disable no-restricted-globals */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `art-static-${CACHE_VERSION}`;
const API_CACHE = `art-api-${CACHE_VERSION}`;
const PAGES_CACHE = `art-pages-${CACHE_VERSION}`;
const CART_QUEUE_CACHE = 'art-cart-queue';

const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_CACHE_ENTRIES = 500;

const OFFLINE_URL_IT = '/it/offline/';
const OFFLINE_URL_EN = '/en/offline/';

/** Assets to precache on install (app shell) */
const PRECACHE_URLS = [
  '/',
  '/it/',
  '/en/',
  OFFLINE_URL_IT,
  OFFLINE_URL_EN,
  '/it/offline',
  '/en/offline',
  '/manifest.json',
  '/assets/LOGO_SITO-02 1.svg',
  '/assets/AnimantraLogo.svg',
  '/assets/Logo_skull.svg',
];

// ===================== Helpers =====================

function isStaticAsset(pathname) {
  return /\.(js|css|woff|woff2|ttf|otf|svg|png|jpg|jpeg|gif|webp|ico|avif)$/i.test(pathname);
}

async function putInCache(cacheName, request, response) {
  if (!response || !response.ok) return;
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  const cache = await caches.open(cacheName);
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', String(Date.now()));
  const body = await response.arrayBuffer();
  const modifiedResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, modifiedResponse);
  // Enforce size limit asynchronously so it doesn't block the response
  enforceMaxCacheSize(cacheName).catch(() => {});
}

async function enforceMaxCacheSize(cacheName) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > MAX_CACHE_ENTRIES) {
    const entries = [];
    for (const key of keys) {
      const resp = await cache.match(key);
      const cachedAt = Number((resp && resp.headers.get('sw-cached-at')) || 0);
      entries.push({ key, cachedAt });
    }
    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    const removeCount = keys.length - MAX_CACHE_ENTRIES;
    for (let i = 0; i < removeCount; i++) {
      await cache.delete(entries[i].key);
    }
    return;
  }

  let totalSize = 0;
  const entries = [];
  for (const key of keys) {
    const resp = await cache.match(key);
    if (resp) {
      const cachedAt = Number(resp.headers.get('sw-cached-at') || 0);
      const estimatedSize = Number(resp.headers.get('content-length') || 0);
      entries.push({ key, size: estimatedSize, cachedAt });
      totalSize += estimatedSize;
    }
  }
  if (totalSize <= MAX_CACHE_SIZE_BYTES) return;
  // Evict oldest entries first
  entries.sort((a, b) => a.cachedAt - b.cachedAt);
  for (const entry of entries) {
    await cache.delete(entry.key);
    totalSize -= entry.size;
    if (totalSize <= MAX_CACHE_SIZE_BYTES) break;
  }
}

// ===================== Cache strategies =====================

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    const cachedAt = Number(cached.headers.get('sw-cached-at') || 0);
    if (cachedAt && Date.now() - cachedAt > MAX_CACHE_AGE_MS) {
      // Stale-while-revalidate: serve cached, refresh in background
      fetch(request)
        .then((res) => putInCache(cacheName, request, res))
        .catch(() => {});
    }
    return cached;
  }
  try {
    const response = await fetch(request);
    await putInCache(cacheName, request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    await putInCache(cacheName, request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

async function networkFirstWithOfflineFallback(request) {
  const pageCache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    await putInCache(PAGES_CACHE, request, response.clone());
    return response;
  } catch {
    const cached = await pageCache.match(request);
    if (cached) return cached;
    // Serve locale-appropriate offline page
    const url = new URL(request.url);
    const offlineUrl = url.pathname.startsWith('/en') ? OFFLINE_URL_EN : OFFLINE_URL_IT;
    const staticCache = await caches.open(STATIC_CACHE);
    const offlinePage =
      (await staticCache.match(offlineUrl)) ||
      (await staticCache.match(offlineUrl.replace(/\/$/, '')));
    return offlinePage || Response.error();
  }
}

// ===================== Cart sync queue =====================

async function getCartSyncQueue() {
  const queueCache = await caches.open(CART_QUEUE_CACHE);
  const queueResponse = await queueCache.match('queue');
  if (!queueResponse) return [];
  try {
    return await queueResponse.json();
  } catch {
    return [];
  }
}

async function saveCartSyncQueue(queue) {
  const queueCache = await caches.open(CART_QUEUE_CACHE);
  await queueCache.put(
    'queue',
    new Response(JSON.stringify(queue), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

async function syncCartUpdates() {
  const queue = await getCartSyncQueue();
  if (!queue.length) return;
  const remaining = [];
  for (const item of queue) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (!response.ok) {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }
  await saveCartSyncQueue(remaining);
}

// ===================== Lifecycle events =====================

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const requests = PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }));

      const results = await Promise.allSettled(
        requests.map(async (request) => {
          const response = await fetch(request);
          if (!response || !response.ok) {
            throw new Error(`Precache failed for ${request.url} with status ${response && response.status}`);
          }
          await cache.put(request, response);
        })
      );

      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length > 0) {
        // Partial precache is acceptable; keep install successful.
        console.warn(`[SW] Precache: ${failed.length} resource(s) failed to cache.`, failed);
      }

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([STATIC_CACHE, API_CACHE, PAGES_CACHE, CART_QUEUE_CACHE]);
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !currentCaches.has(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// ===================== Fetch handler =====================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests (and allow cross-origin to pass through)
  if (url.origin !== self.location.origin) return;

  // Skip browser-extension and dev-tool requests
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  // API responses: Network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets (images, fonts, scripts, styles): Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // HTML navigation: Network-first with offline page fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Default: Network-first
  event.respondWith(networkFirst(request, PAGES_CACHE));
});

// ===================== Background Sync =====================

self.addEventListener('sync', (event) => {
  if (event.tag === 'cart-sync') {
    event.waitUntil(syncCartUpdates());
  }
});

// ===================== Message handler =====================

self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'QUEUE_CART_UPDATE') {
    const { url, method, headers, body } = event.data.payload;
    event.waitUntil(
      getCartSyncQueue()
        .then((queue) => {
          queue.push({ url, method, headers, body, timestamp: Date.now() });
          return saveCartSyncQueue(queue);
        })
        .then(() => {
          // Use Background Sync if available, otherwise attempt immediate sync
          if ('sync' in self.registration) {
            return self.registration.sync.register('cart-sync');
          }
          return syncCartUpdates();
        })
        .catch((err) => {
          console.warn('[SW] Failed to register cart sync:', err);
        })
    );
  }
});
