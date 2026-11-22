const SHELL = 'louvre-shell-v45';
const AUDIO = 'louvre-audio-v2';
const IMAGES = 'louvre-images-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './src/app-config.js',
  './src/my-plan.js',
  './src/main.js',
  './src/catalog.js',
  './src/floor-map.js',
  './src/floor-map-geo.js',
  './src/navigation.js',
  './src/route-progress.js',
  './src/location-support.js',
  './src/navigation-graph.json',
  './src/artwork-images.json',
  './src/image-credits.json',
  './src/works.json',
  './src/routes.json',
  './src/provenance.json',
  './src/style.css',
  './src/update.css',
  './src/selection.css',
  './images/mona.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => (key.startsWith('louvre-shell-') && key !== SHELL) || (key.startsWith('louvre-audio-') && key !== AUDIO)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) {
    event.respondWith(
      caches.open(AUDIO).then(async cache => (await cache.match(event.request)) || fetch(event.request))
    );
    return;
  }
  if (url.pathname.includes('/images/')) {
    event.respondWith(
      caches.open(IMAGES).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
