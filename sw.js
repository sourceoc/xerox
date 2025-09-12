const CACHE_NAME = 'xerox-system-v1.0.0';
const STATIC_CACHE = 'xerox-static-v1.0.0';
const DYNAMIC_CACHE = 'xerox-dynamic-v1.0.0';

// Configuração de logging otimizada
const LOG_CONFIG = {
    enabled: true,
    level: 'warn', // 'debug', 'info', 'warn', 'error'
    maxLogEntries: 100,
    enablePerformanceLogs: false
};

// Sistema de logging otimizado
class ServiceWorkerLogger {
    constructor() {
        this.logs = [];
        this.startTime = Date.now();
    }

    shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return LOG_CONFIG.enabled && levels[level] >= levels[LOG_CONFIG.level];
    }

    log(level, message, data = null) {
        if (!this.shouldLog(level)) return;

        const logEntry = {
            timestamp: Date.now(),
            level,
            message,
            data: data ? JSON.stringify(data) : null,
            uptime: Date.now() - this.startTime
        };

        // Limitar número de logs em memória
        if (this.logs.length >= LOG_CONFIG.maxLogEntries) {
            this.logs.shift();
        }
        this.logs.push(logEntry);

        // Log apenas para níveis importantes
        if (level === 'error') {
            console.error(`[SW] ${message}`, data);
        } else if (level === 'warn') {
            console.warn(`[SW] ${message}`, data);
        } else if (level === 'debug' && LOG_CONFIG.enablePerformanceLogs) {
            console.debug(`[SW] ${message}`, data);
        }
    }

    debug(message, data) { this.log('debug', message, data); }
    info(message, data) { this.log('info', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, data) { this.log('error', message, data); }

    getLogs() { return this.logs; }
    clearLogs() { this.logs = []; }
}

const logger = new ServiceWorkerLogger();

const STATIC_FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/data.json',
    '/manifest.json',
    '/js/crypto-utils.js',
    '/js/toast.js',
    '/js/auth.js',
    '/js/utils.js',
    '/js/validation.js',
    '/js/export.js'
];

const DYNAMIC_FILES = [
    'https://api.github.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com'
];

// Install event
self.addEventListener('install', (event) => {
    logger.info('Installing Service Worker');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                logger.debug('Caching static files', { count: STATIC_FILES.length });
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                logger.info('Static files cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                logger.error('Error caching static files', error);
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    logger.info('Activating Service Worker');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                const oldCaches = cacheNames.filter(name => 
                    name !== STATIC_CACHE && name !== DYNAMIC_CACHE
                );
                
                if (oldCaches.length > 0) {
                    logger.info('Cleaning up old caches', { count: oldCaches.length });
                }
                
                return Promise.all(
                    oldCaches.map((cacheName) => {
                        logger.debug('Deleting cache', { cacheName });
                        return caches.delete(cacheName);
                    })
                );
            })
            .then(() => {
                logger.info('Service Worker activated successfully');
                return self.clients.claim();
            })
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Handle static files
    if (STATIC_FILES.includes(url.pathname) || url.pathname === '/') {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        logger.debug('Serving from cache', { url: request.url });
                        return response;
                    }
                    
                    // Fallback to network
                    return fetch(request)
                        .then((response) => {
                            // Clone response for caching
                            const responseClone = response.clone();
                            
                            caches.open(STATIC_CACHE)
                                .then((cache) => {
                                    cache.put(request, responseClone);
                                });
                            
                            return response;
                        })
                        .catch(() => {
                            // Return offline page for navigation requests
                            if (request.mode === 'navigate') {
                                return caches.match('/index.html');
                            }
                        });
                })
        );
        return;
    }
    
    // Handle API requests (cache first, network fallback)
    if (url.hostname === 'api.github.com') {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        // Serve from cache but update in background
                        fetch(request)
                            .then((fetchResponse) => {
                                if (fetchResponse.ok) {
                                    caches.open(DYNAMIC_CACHE)
                                        .then((cache) => {
                                            cache.put(request, fetchResponse.clone());
                                        });
                                }
                            })
                            .catch(() => {
                                logger.debug('Network failed, serving from cache');
                            });
                        
                        return response;
                    }
                    
                    // Fetch from network and cache
                    return fetch(request)
                        .then((fetchResponse) => {
                            if (fetchResponse.ok) {
                                const responseClone = fetchResponse.clone();
                                caches.open(DYNAMIC_CACHE)
                                    .then((cache) => {
                                        cache.put(request, responseClone);
                                    });
                            }
                            return fetchResponse;
                        })
                        .catch(() => {
                            // Return cached response or custom offline response
                            return new Response(
                                JSON.stringify({
                                    error: 'Sem conexão com a internet',
                                    offline: true,
                                    timestamp: Date.now()
                                }),
                                {
                                    status: 503,
                                    statusText: 'Service Unavailable',
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        });
                })
        );
        return;
    }
    
    // Handle other requests (network first, cache fallback)
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE)
                        .then((cache) => {
                            cache.put(request, responseClone);
                        });
                }
                return response;
            })
            .catch(() => {
                return caches.match(request);
            })
    );
});

// Background sync
self.addEventListener('sync', (event) => {
    logger.info('Background sync triggered', { tag: event.tag });
    
    if (event.tag === 'sync-data') {
        event.waitUntil(
            syncDataWithServer()
        );
    }
    
    if (event.tag === 'backup-data') {
        event.waitUntil(
            backupDataToGitHub()
        );
    }
});

// Push notifications
self.addEventListener('push', (event) => {
    logger.info('Push notification received');
    
    const options = {
        body: event.data ? event.data.text() : 'Nova notificação do Sistema Xerox',
        icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🖨️%3C/text%3E%3C/svg%3E',
        badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y=".9em" font-size="90"%3E🖨️%3C/text%3E%3C/svg%3E',
        vibrate: [200, 100, 200],
        data: {
            url: '/',
            timestamp: Date.now()
        },
        actions: [
            {
                action: 'open',
                title: 'Abrir Sistema',
                icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="white"/%3E%3C/svg%3E'
            },
            {
                action: 'dismiss',
                title: 'Dispensar',
                icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="white"/%3E%3C/svg%3E'
            }
        ],
        requireInteraction: true,
        tag: 'xerox-notification'
    };
    
    event.waitUntil(
        self.registration.showNotification('Sistema Xerox', options)
    );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
    logger.info('Notification clicked', { action: event.action });
    
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // Try to focus existing window
                    for (const client of clientList) {
                        if (client.url.includes(self.location.origin) && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    
                    // Open new window if no existing window found
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});

// Message handling
self.addEventListener('message', (event) => {
    logger.debug('Message received', { type: event.data?.type });
    
    if (event.data && event.data.type) {
        switch (event.data.type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;
                
            case 'CACHE_URLS':
                event.waitUntil(
                    cacheUrls(event.data.urls)
                );
                break;
                
            case 'CLEAR_CACHE':
                event.waitUntil(
                    clearCache()
                );
                break;
                
            case 'GET_VERSION':
                event.ports[0].postMessage({
                    version: CACHE_NAME,
                    timestamp: Date.now()
                });
                break;
                
            case 'GET_LOGS':
                event.ports[0].postMessage({
                    logs: logger.getLogs(),
                    config: LOG_CONFIG
                });
                break;
                
            case 'CLEAR_LOGS':
                logger.clearLogs();
                event.ports[0].postMessage({
                    success: true,
                    timestamp: Date.now()
                });
                break;
                
            case 'UPDATE_LOG_CONFIG':
                Object.assign(LOG_CONFIG, event.data.config);
                event.ports[0].postMessage({
                    success: true,
                    config: LOG_CONFIG
                });
                break;
        }
    }
});

// Utility functions
async function syncDataWithServer() {
    try {
        logger.info('Syncing data with server');
        
        // This would normally sync with your backend
        // For now, just update timestamp
        const timestamp = Date.now();
        
        // Broadcast to all clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'SYNC_COMPLETE',
                timestamp: timestamp
            });
        });
        
        logger.info('Data sync completed');
        return Promise.resolve();
        
    } catch (error) {
        logger.error('Error syncing data', error);
        return Promise.reject(error);
    }
}

async function backupDataToGitHub() {
    try {
        logger.info('Backing up data to GitHub');
        
        // This would backup data to GitHub
        // Implementation would depend on authentication and API
        
        logger.info('Backup completed');
        return Promise.resolve();
        
    } catch (error) {
        logger.error('Error backing up data', error);
        return Promise.reject(error);
    }
}

async function cacheUrls(urls) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        return cache.addAll(urls);
    } catch (error) {
        logger.error('Error caching URLs', error);
        throw error;
    }
}

async function clearCache() {
    try {
        const cacheNames = await caches.keys();
        return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
    } catch (error) {
        logger.error('Error clearing cache', error);
        throw error;
    }
}

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    logger.info('Periodic sync triggered', { tag: event.tag });
    
    if (event.tag === 'daily-backup') {
        event.waitUntil(backupDataToGitHub());
    }
});