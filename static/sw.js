// ──────────────────────────────────────────────────────────
// Service Worker v3 — Flashcard App
// Phase 4: Caches external CSS/JS, deck data, and audio
// ──────────────────────────────────────────────────────────

const STATIC_CACHE = 'flashcard-static-v3';
const DECK_CACHE   = 'flashcard-decks-v1';
const AUDIO_CACHE  = 'flashcard-audio-v1';
const PAGE_CACHE   = 'flashcard-pages-v1';

// Static assets to pre-cache on install
const PRECACHE = [
    '/',
    '/static/manifest.json',
    '/static/favicon.png',
    '/static/css/common.css',
    '/static/css/index.css',
    '/static/css/story.css',
    '/static/css/folder.css',
    '/static/css/pdf.css',
    '/static/css/match.css',
    '/static/css/spelling.css',
    '/static/css/edit.css',
    '/static/css/create.css',
    '/static/css/line.css',
    '/static/css/hi.css',
    '/static/css/login.css',
    '/static/css/pages.css',
    '/static/js/auth.js',
    '/static/js/utils.js',
    '/static/js/index.js',
    '/static/js/story.js',
    '/static/js/folder.js',
    '/static/js/pdf.js',
    '/static/js/match.js',
    '/static/js/spelling.js',
    '/static/js/edit.js',
    '/static/js/create.js',
    '/static/js/line.js',
    '/static/js/hi.js',
    '/static/js/login.js',
];

// API prefixes that should be cached for offline access
const CACHEABLE_APIS = [
    '/order/folders',
    '/order/decks',
    '/decks/',
    '/deck/',
];

// Audio patterns
const AUDIO_PATTERNS = ['/tts', '/story/audio', '/r2/get'];

// Limits
const MAX_DECK_ENTRIES   = 20;
const MAX_AUDIO_ENTRIES  = 500;

// ─── Install ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(PRECACHE).catch(() => {
                // Don't fail install if some assets are missing
                return Promise.allSettled(
                    PRECACHE.map(url => cache.add(url).catch(() => {}))
                );
            }))
    );
    self.skipWaiting();
});

// ─── Activate — clean old caches ─────────────────────────
self.addEventListener('activate', (event) => {
    const KEEP = new Set([STATIC_CACHE, DECK_CACHE, AUDIO_CACHE, PAGE_CACHE]);
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(
                names.filter(n => !KEEP.has(n)).map(n => caches.delete(n))
            )
        )
    );
    self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET
    if (event.request.method !== 'GET') return;
    // Skip cross-origin (fonts, CDN Tailwind, etc.)
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // ── 1. Static assets (CSS, JS, images) — Cache-first ──
    if (path.startsWith('/static/')) {
        event.respondWith(cacheFirst(event.request, STATIC_CACHE));
        return;
    }

    // ── 2. Audio files — Cache-first ──
    if (AUDIO_PATTERNS.some(p => path.startsWith(p) || path === p)) {
        event.respondWith(cacheFirst(event.request, AUDIO_CACHE, MAX_AUDIO_ENTRIES));
        return;
    }

    // ── 3. API data (deck lists, deck content) — Network-first ──
    if (CACHEABLE_APIS.some(api => path.startsWith(api))) {
        event.respondWith(networkFirst(event.request, DECK_CACHE, MAX_DECK_ENTRIES));
        return;
    }

    // ── 4. Page navigation — Network-first with offline fallback ──
    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request, PAGE_CACHE));
        return;
    }
});

// ──────────────────────────────────────────────────────────
// Strategies
// ──────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response.ok) {
            const clone = response.clone();
            cache.put(request, clone).then(() => {
                if (maxEntries) trimCache(cacheName, maxEntries);
            });
        }
        return response;
    } catch {
        // Completely offline
        return new Response('Offline', { status: 503 });
    }
}

async function networkFirst(request, cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(request);
        if (response.ok) {
            const clone = response.clone();
            cache.put(request, clone).then(() => {
                if (maxEntries) trimCache(cacheName, maxEntries);
            });
        }
        return response;
    } catch {
        // Network failed — serve from cache
        const cached = await cache.match(request);
        if (cached) return cached;
        // For page navigations, try the homepage
        if (request.mode === 'navigate') {
            const fallback = await caches.match('/');
            if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503 });
    }
}

// ─── Cache size limiter ──────────────────────────────────
async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    // Delete oldest entries (FIFO)
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
    }
}

// ─── Messages ────────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
