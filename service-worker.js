const CACHE = 'remix-studio-v11-export-watchdog-2-8-1';
const ASSETS = ['./', './index.html', './style.css', './preview.css', './timeline-zoom.css', './js/core.js', './js/editor.js', './js/tracks.js', './js/camera.js', './js/render.js', './js/preview-ratio.js', './js/timeline-zoom.js', './js/init.js', './js/final-audit.js', './js/insertion-cursor.js', './js/export-mode2.js', './js/export-watchdog.js', './js/capcut-ui.js', './js/android-bridge.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => cached)));
});
