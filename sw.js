// Primero la red (siempre la última versión y el último plan); si no hay conexión, la copia guardada.
const CACHE = 'cerebro-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'plan.json',
  'js/logic.js', 'js/ui.js', 'js/tareas-memoria.js', 'js/tareas-lenguaje.js', 'js/tareas-ejecutivas.js',
  'js/tareas-complejas.js', 'js/app.js'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        if (r.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
