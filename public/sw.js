// v75: pass-through service worker, only so Android offers "Install". No caching: every request goes to the network,
// so visitors always get the latest version. Offline -> the browser's normal offline page.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
