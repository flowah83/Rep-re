const BASE = /*__BASE__*/ "";
const CACHE = /*__CACHE__*/ "repere-dev";
const INDEX = `${BASE}/index.html`;
const PRECACHE = /*__PRECACHE__*/ [];

function isOptional(url) {
  return String(url).endsWith(".glb") || String(url).includes("/models/");
}

function shouldStore(response) {
  return Boolean(response) && response.ok === true && response.status >= 200 && response.status < 300;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const required = PRECACHE.filter((url) => !isOptional(url));
      const optional = PRECACHE.filter((url) => isOptional(url));
      if (required.length) await cache.addAll(required);
      await Promise.all(
        optional.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* un modèle manquant n’empêche pas l’installation */
          }
        }),
      );
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "repere-reload") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("repere-") && key !== CACHE).map((key) => caches.delete(key))))
      // Les caches dont le nom ne commence pas par repere- sont laissés en place.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BASE && !url.pathname.startsWith(`${BASE}/`) && url.pathname !== BASE) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (shouldStore(response)) {
            const cache = await caches.open(CACHE);
            await cache.put(INDEX, response.clone());
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(CACHE);
          const hit =
            (await cache.match(request)) ||
            (await cache.match(INDEX)) ||
            (await cache.match(`${BASE}/`)) ||
            (await cache.match(BASE || "/"));
          return hit || new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (shouldStore(response)) {
          const copy = response.clone();
          const cache = await caches.open(CACHE);
          await cache.put(request, copy);
        }
        return response;
      });
    }),
  );
});
