const CACHE_NAME = 'time-calculator-v1';
const urlsToCache = [
	'/',
	'/index.html',
	'/styles.css',
	'/script.js',
	'/manifest.json',
	'/icon-192.svg',
	'/icon-512.svg',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			console.log('Opened cache');
			return cache.addAll(urlsToCache);
		})
	);
	// Force the waiting service worker to become the active service worker
	self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((cacheName) => {
					if (cacheName !== CACHE_NAME) {
						console.log('Deleting old cache:', cacheName);
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
	// Take control of all pages immediately
	return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
	event.respondWith(
		caches.match(event.request).then((response) => {
			// Cache hit - return response
			if (response) {
				return response;
			}

			// Clone the request
			const fetchRequest = event.request.clone();

			return fetch(fetchRequest).then((response) => {
				// Check if valid response
				if (
					!response ||
					response.status !== 200 ||
					response.type !== 'basic'
				) {
					return response;
				}

				// Clone the response
				const responseToCache = response.clone();

				caches.open(CACHE_NAME).then((cache) => {
					cache.put(event.request, responseToCache);
				});

				return response;
			});
		})
	);
});

// Handle messages from the client
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

