/* Baran FatoraBox service worker — offline-first shell (bf-v1) */
'use strict';
const VERSION = 'bf-v1.0.2';
const SHELL = [
  '/index.html', '/css/styles.css', '/js/app.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-32.png', '/icons/icon-180.png',
];
const NET_FIRST = new Set(['/index.html', '/css/styles.css', '/js/app.js']); // code freshness wins over cache
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // APIs & exports: network-first (fall back to cache snapshot when offline)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/export/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.ok) {
          const cp = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, cp));
        }
        return res;
      }).catch(() => caches.match(e.request).then(m => m || new Response(JSON.stringify({ ok: false, error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }
  // static shell: network-first for code, cache-first for assets/icons
  e.respondWith(
    NET_FIRST.has(url.pathname)
      ? fetch(e.request).then(res => {
          if (res.ok) {
            const cp = res.clone();
            caches.open(VERSION).then(c => c.put(e.request, cp));
          }
          return res;
        }).catch(() => caches.match(e.request).then(m => m || caches.match('/index.html')))
      : caches.match(e.request).then(m => {
          if (m) return m;
          return fetch(e.request).then(res => {
            if (res.ok && e.request.method === 'GET') {
              const cp = res.clone();
              caches.open(VERSION).then(c => c.put(e.request, cp));
            }
            return res;
          }).catch(() => caches.match('/index.html'));
        })
  );
});
