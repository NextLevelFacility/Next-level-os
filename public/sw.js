// Next Level OS — service worker. Network first (so you always get the newest build); the last good copy of the app shell is kept for offline.
const CACHE = 'nlos-shell-v1'
self.addEventListener('install', (e) => { self.skipWaiting() })
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin) || req.url.includes('/.netlify/')) return
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (req.mode === 'navigate' || /\.(js|css|png|svg|woff2?)$/.test(new URL(req.url).pathname))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
    return res
  }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('/index.html') : undefined))))
})
