/**
 * Service worker for the installed 5-Mins app.
 *
 * It keeps a copy of the app shell (HTML, CSS, modules and icons) so the app
 * still opens on a phone, tablet or desktop that is offline or on a flaky
 * connection. Alert feeds are always fetched from the network: a cached
 * disaster alert would be worse than no alert at all.
 */
const CACHE_NAME = "5-mins-shell-v3";

/** Everything needed to render the app without a network connection. */
const APP_SHELL = [
  "./",
  "./index.html",
  "./setup.html",
  "./manifest.webmanifest",
  "./assets/styles.css",
  "./assets/js/home.js",
  "./assets/js/setup.js",
  "./assets/js/alerts.js",
  "./assets/js/autocomplete.js",
  "./assets/js/cities.js",
  "./assets/js/places.js",
  "./assets/js/world-land.js",
  "./assets/js/worldmap.js",
  "./assets/js/pwa.js",
  "./assets/js/store.js",
  "./assets/js/theme.js",
  "./assets/js/weather.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheResponse(cache, request, response) {
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Serves the cached asset straight away and refreshes it in the background, so
 * a new deploy is picked up on the next launch without a cache version bump.
 */
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const update = fetch(event.request).then((response) =>
    cacheResponse(cache, event.request, response),
  );

  if (cached) {
    event.waitUntil(update.catch(() => {}));
    return cached;
  }
  return update;
}

/** Keeps the app up to date when online and still opens it when offline. */
async function networkFirst(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    return await fetch(event.request).then((response) =>
      cacheResponse(cache, event.request, response),
    );
  } catch (error) {
    const cached =
      (await cache.match(event.request)) ?? (await cache.match("./index.html"));
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Alert, earthquake and city lookups are cross-origin: leave them alone so
  // the page always talks to the live feeds.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(event));
});
