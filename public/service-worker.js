// public/service-worker.js
const CACHE_NAME = 'offline-cache-v1';
const OFFLINE_URL = '/offline.html';

// Liste des URL spécifiques qui doivent être traitées avec une stratégie network-first
const NETWORK_FIRST_URLS = [
    'http://localhost:3000/playlist/6648b89bc941053e18d115d3/1716825357924',// Assurez-vous que c'est le bon chemin pour la page avec les vidéos
    'https://tvapp-uiwl.onrender.com/playlist/6648b89bc941053e18d115d3/1716825357924'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll([
                OFFLINE_URL,
                '/styles.css',
                '/img/error_image.jpg'
            ]);
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        if (NETWORK_FIRST_URLS.some(url => event.request.url.includes(url))) {
            // Stratégie réseau d'abord pour les pages spécifiques
            event.respondWith(
                fetch(event.request).then(response => {
                    return caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                }).catch(() => {
                    return caches.match(event.request).then(response => {
                        return response || caches.match(OFFLINE_URL);
                    });
                })
            );
        } else {
            // Stratégie cache d'abord pour les autres pages
            event.respondWith(
                caches.match(event.request).then(cacheResponse => {
                    const fetchPromise = fetch(event.request).then(networkResponse => {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                        });
                        return networkResponse;
                    }).catch(() => {
                        return caches.match(OFFLINE_URL);
                    });
                    return cacheResponse || fetchPromise;
                })
            );
        }
    } else {
        // Stratégie cache d'abord pour les autres requêtes
        event.respondWith(
            caches.match(event.request).then(cacheResponse => {
                return cacheResponse || fetch(event.request).then(networkResponse => {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                    return networkResponse;
                });
            })
        );
    }
});




/*const CACHE_NAME = 'offline-cache';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll([
                OFFLINE_URL,
                '/styles.css',
                '/img/error_image.jpg'
            ]);
        })
    );
});

self.addEventListener('fetch', event => {
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OFFLINE_URL);
            })
        );
    }
});
*/