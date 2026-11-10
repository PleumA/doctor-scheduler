const CACHE_NAME = 'doctor-scheduler-v5';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.js',
    './structuredInputs.js',
    './translations.js',
    './calendarExport.js',
    './dist/output.css',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://unpkg.com/lucide@1.55.0',
    'https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // One failed CDN request must not abort the whole install
            Promise.allSettled(ASSETS_TO_CACHE.map((url) => cache.add(url)))
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((n) => n.startsWith('doctor-scheduler-') && n !== CACHE_NAME)
                        .map((n) => caches.delete(n))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return; // e.g. chrome-extension:
    const sameOrigin = url.origin === self.location.origin;
    const cached = (r) => caches.match(r).then((hit) => hit || Promise.reject(new Error('miss')));
    const network = () =>
        // no-cache: skip the browser's HTTP cache so a new deploy is seen at once
        fetch(req, sameOrigin ? { cache: 'no-cache' } : undefined).then((res) => {
            if (res.ok) {
                const copy = res.clone();
                // A 206 or a full cache must not become an unhandled rejection
                event.waitUntil(
                    caches
                        .open(CACHE_NAME)
                        .then((c) => c.put(req, copy))
                        .catch(() => {})
                );
            }
            return res;
        });
    // Our own files: network first, so a deploy shows on the next load and offline still works.
    // CDN files are version-pinned, so the cache is always right.
    const response = sameOrigin ? network().catch(() => cached(req)) : cached(req).catch(network);
    event.respondWith(
        response.catch(() =>
            req.mode === 'navigate' ? caches.match('./index.html') : Response.error()
        )
    );
});
