const CACHE_NAME = 'today-with-love-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// ---- Anniversary notifications (best-effort background delivery) ----
// Only fires on Android/Chrome installed PWAs that support Periodic Background
// Sync and have granted it. Everywhere else, the in-page check in index.html
// (run whenever the app is open) is what fires the notification instead.
const TOGETHER_SINCE_YEAR = 2025;
const TOGETHER_SINCE_MONTH = 11; // 0-indexed: December
const TOGETHER_SINCE_DAY = 12;
const LAST_FIRED_CACHE = 'love-date-last-fired';

function anniversaryMessage(now){
  const start = new Date(TOGETHER_SINCE_YEAR, TOGETHER_SINCE_MONTH, TOGETHER_SINCE_DAY);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today.getDate() !== start.getDate()) return null;
  if (today <= start) return null;

  const monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (monthsElapsed <= 0) return null;

  const isYearly = today.getMonth() === start.getMonth();
  if (isYearly) {
    const years = monthsElapsed / 12;
    return years === 1 ? 'One year together today.' : `${years} years together today.`;
  }
  return monthsElapsed === 1 ? 'One month together today.' : `${monthsElapsed} months together today.`;
}

async function alreadyFiredToday(key){
  const store = await caches.open(LAST_FIRED_CACHE);
  const match = await store.match('last-fired');
  if (!match) return false;
  const stored = await match.text();
  return stored === key;
}

async function markFired(key){
  const store = await caches.open(LAST_FIRED_CACHE);
  await store.put('last-fired', new Response(key));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'anniversary-check') return;

  event.waitUntil((async () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (await alreadyFiredToday(key)) return;

    const message = anniversaryMessage(now);
    if (!message) return;

    await self.registration.showNotification('Together since', {
      body: message,
      icon: 'icon-192.png',
      badge: '/icon-192.png',
      tag: 'love-date-anniversary',
      data: { url: './index.html' }
    });
    await markFired(key);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
