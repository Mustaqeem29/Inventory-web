/* =====================================================
   service-worker.js
   Khuwaja Surgical — Offline Service Worker
   -------------------------------------------------------
   This file runs in the background (separate thread).
   It caches all app files during install so the app
   works fully offline after the first visit.

   SAVE THIS FILE in the ROOT folder of your project:
   khuwaja-surgical/service-worker.js  ← here
   NOT inside the js/ folder.

   REGISTER IT in every HTML page before </body>:
   <script>
     if ('serviceWorker' in navigator) {
       navigator.serviceWorker.register('service-worker.js')
         .then(() => console.log('SW registered'))
         .catch(err => console.error('SW failed:', err));
     }
   </script>
   ===================================================== */


/* -----------------------------------------------------
   CACHE CONFIGURATION
   -------------------------------------------------------
   CACHE_NAME  : Change the version (v2, v3...) whenever
                 you update your app files. This forces
                 the browser to download fresh files and
                 delete the old cache automatically.
   FILES       : Every file the app needs to run offline.
----------------------------------------------------- */
const CACHE_NAME = 'khuwaja-surgical-cache-v1';

const FILES_TO_CACHE = [

    /* ---- Root ---- */
    './',                   /* covers opening the folder directly */
    './offline.html',       /* shown when a page is not cached */

    /* ---- HTML Pages ---- */
    './login.html',
    './dashboard.html',
    './inventory.html',
    './billing.html',
    './bills.html',
    './settings.html',

    /* ---- CSS Files ---- */
    './css/styles.css',
    './css/dark-mode.css',
    './css/print.css',

    /* ---- JavaScript Files ---- */
    './js/db.js',
    './js/helpers.js',
    './js/auth.js',
    './js/ui.js',
    './js/dashboard.js',
    './js/inventory.js',
    './js/billing.js',
    './js/bills.js',
    './js/settings.js',
    './js/print.js',
    './js/backup.js'

];


/* =====================================================
   INSTALL EVENT
   -------------------------------------------------------
   Fires once when the service worker is first registered.
   Downloads and saves every file in FILES_TO_CACHE into
   the browser's cache storage.
   ===================================================== */
self.addEventListener('install', function (event) {

    console.log('[SW] Install event started.');

    event.waitUntil(

        caches.open(CACHE_NAME)
            .then(function (cache) {
                console.log('[SW] Cache opened:', CACHE_NAME);

                /*
                  addAll() fetches every file and stores it.
                  If even one file fails, the whole install fails.
                  We use a loop instead so one missing file does
                  not break the entire app cache.
                */
                const cachePromises = FILES_TO_CACHE.map(function (url) {
                    return cache.add(url).catch(function (err) {
                        /* Log the warning but do not stop the install */
                        console.warn('[SW] Could not cache file:', url, '-', err.message);
                    });
                });

                return Promise.all(cachePromises);
            })
            .then(function () {
                console.log('[SW] All files cached. Install complete.');

                /*
                  skipWaiting() forces this new service worker to
                  become active immediately without waiting for
                  the user to close all tabs.
                */
                return self.skipWaiting();
            })

    );

});


/* =====================================================
   ACTIVATE EVENT
   -------------------------------------------------------
   Fires after install, when the SW takes control.
   Deletes any old caches from previous versions so the
   user's storage does not fill up with stale files.
   ===================================================== */
self.addEventListener('activate', function (event) {

    console.log('[SW] Activate event started.');

    event.waitUntil(

        caches.keys()
            .then(function (allCacheNames) {

                return Promise.all(
                    allCacheNames.map(function (cacheName) {

                        /* Delete any cache that is NOT the current version */
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }

                    })
                );

            })
            .then(function () {
                console.log('[SW] Activation complete. Now controlling all pages.');

                /*
                  clients.claim() makes this SW take control of all
                  open pages immediately without requiring a reload.
                */
                return self.clients.claim();
            })

    );

});


/* =====================================================
   FETCH EVENT  —  Cache-First Strategy
   -------------------------------------------------------
   Fires on every network request the app makes.

   Cache-First Strategy:
     1. Check the cache first
     2. If found → return the cached file immediately (fast + offline)
     3. If NOT found → try the network
     4. If network succeeds → save a copy in cache, return response
     5. If network fails AND not in cache → show offline page
   ===================================================== */
self.addEventListener('fetch', function (event) {

    /* Only handle GET requests — skip POST, PUT, DELETE etc. */
    if (event.request.method !== 'GET') return;

    /* Only handle requests from our own app origin */
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    event.respondWith(

        /* Step 1: Check the cache */
        caches.match(event.request)
            .then(function (cachedResponse) {

                /* Step 2: Cache HIT — return the cached file */
                if (cachedResponse) {
                    console.log('[SW] Serving from cache:', event.request.url);
                    return cachedResponse;
                }

                /* Step 3: Cache MISS — fetch from the network */
                console.log('[SW] Not in cache, fetching from network:', event.request.url);

                return fetch(event.request)
                    .then(function (networkResponse) {

                        /*
                          Only cache valid successful responses.
                          status 200 = OK
                          type 'basic' = same-origin request
                        */
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type !== 'basic'
                        ) {
                            return networkResponse;
                        }

                        /* Step 4: Save a copy in cache for next time */
                        /*
                          We must clone the response because a Response
                          object can only be read/consumed once.
                          One copy goes to the cache, one goes to the browser.
                        */
                        const responseToCache = networkResponse.clone();

                        caches.open(CACHE_NAME)
                            .then(function (cache) {
                                cache.put(event.request, responseToCache);
                                console.log('[SW] Saved new file to cache:', event.request.url);
                            });

                        return networkResponse;

                    })
                    .catch(function () {

                        /*
                          Step 5: Network failed AND file not in cache.
                          Show the offline fallback page for HTML requests.
                        */
                        const acceptHeader = event.request.headers.get('Accept') || '';

                        if (acceptHeader.includes('text/html')) {
                            console.log('[SW] Offline and not cached. Showing offline page.');
                            return caches.match('./offline.html');
                        }

                        /*
                          For non-HTML files (JS, CSS) return an empty
                          response rather than an error so the page
                          does not completely break.
                        */
                        return new Response('', {
                            status: 503,
                            statusText: 'Service Unavailable — Offline'
                        });

                    });

            })

    );

});


/* =====================================================
   MESSAGE EVENT
   -------------------------------------------------------
   Allows the main page to send messages to the SW.
   Used to manually trigger a cache refresh when the
   user clicks a "Check for updates" button.
   ===================================================== */
self.addEventListener('message', function (event) {

    /* Force the SW to activate immediately */
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('[SW] skipWaiting message received.');
        self.skipWaiting();
    }

    /* Refresh the cache for all files */
    if (event.data && event.data.action === 'refreshCache') {
        console.log('[SW] Refreshing all cached files...');

        caches.open(CACHE_NAME).then(function (cache) {
            FILES_TO_CACHE.forEach(function (url) {
                fetch(url)
                    .then(function (response) {
                        if (response.ok) {
                            cache.put(url, response);
                            console.log('[SW] Refreshed:', url);
                        }
                    })
                    .catch(function () {
                        /* Silent fail — already have a cached version */
                    });
            });
        });
    }

});