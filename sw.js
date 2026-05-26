// ============================================================
// EK AWAZ NEWS — SERVICE WORKER v2
// Auto cache version injected by GitHub Actions on every deploy
// ============================================================

// BUILD_TIMESTAMP is replaced by GitHub Actions workflow on every deploy
// e.g. sed -i "s/BUILD_TIMESTAMP/$(date +%Y%m%d%H%M%S)/" sw.js
const CACHE_NAME = 'ekawaz-BUILD_TIMESTAMP';
const OFFLINE_URL = '/index.html';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/ek-awaz-logo.png',
  '/logo-192.png',
  '/logo-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Sans+3:wght@300;400;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — delete ALL old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;
  // Skip browser internals
  if (url.protocol === 'chrome-extension:') return;
  // Skip Firebase (always fresh)
  if (url.hostname.includes('firebaseio.com')) return;
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('firestore')) return;
  // Skip ads (never cache)
  if (url.hostname.includes('pagead2')) return;
  if (url.hostname.includes('pricklyassociation.com')) return;
  if (url.hostname.includes('5gvci.com')) return;
  if (url.hostname.includes('hilltopads')) return;
  if (url.hostname.includes('googletagmanager')) return;
  if (url.hostname.includes('ipapi.co')) return;

  // Navigation (HTML pages) — network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/index.html') ||
            new Response('<h1>You are offline</h1><p>Please check your internet connection.</p>', {
              headers: { 'Content-Type': 'text/html' }
            });
        })
    );
    return;
  }

  // Static assets (fonts, CSS, icons) — cache first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('api.qrserver.com') ||
    request.destination === 'image' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Everything else — network first
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ── PUSH NOTIFICATIONS ──
self.addEventListener('push', event => {
  let data = {
    title: 'Ek Awaz News — Breaking',
    body: 'New article published. Tap to read.',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    url: '/'
  };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      vibrate: [200, 100, 200],
      data: { url: data.url },
      actions: [
        { action: 'read', title: '📰 Read Now' },
        { action: 'close', title: '✕ Dismiss' }
      ],
      tag: 'ekawaz-breaking',
      renotify: true,
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── BACKGROUND SYNC ──
self.addEventListener('sync', event => {
  if (event.tag === 'sync-news') {
    console.log('[SW] Background sync triggered');
  }
});

console.log('[SW] Ek Awaz News Service Worker', CACHE_NAME, 'loaded ✓');
