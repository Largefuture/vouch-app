/* Vouch service worker — network-first app shell: always fresh when online,
   fully offline-capable from cache. Bump CACHE on any shell change to purge old assets.
   Scoped: only touches caches named "vouch-*" (GitHub project sites can share an origin). */
const CACHE = "vouch-v7";
const ASSETS = ["./", "index.html", "styles.css", "qrcode.js", "trust.js", "api.js", "data.js", "app.js", "manifest.json",
  "icon.svg", "icon-192.png", "icon-512.png", "icon-512-maskable.png", "apple-touch-icon.png"];
const SCOPE = self.registration ? self.registration.scope : "./";
const ASSET_URLS = new Set(ASSETS.map(a => new URL(a, SCOPE).href));

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith("vouch-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;          // never cache cross-origin (the API lives elsewhere)
  if (url.pathname.includes("/api/")) return;               // never cache API calls
  const isNav = e.request.mode === "navigate";
  const isAsset = ASSET_URLS.has(url.href.split("?")[0]);
  if (!isNav && !isAsset) return;                           // only the app shell is cached
  // network-first: fetch fresh, cache only SUCCESSFUL shell responses, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(isNav ? new URL("index.html", SCOPE).href : e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(isNav ? new URL("index.html", SCOPE).href : e.request)
      .then(hit => hit || (isNav ? caches.match(new URL("index.html", SCOPE).href) : Response.error())))
  );
});

// --- Web Push: the retention loop ("a customer just vouched for you") ---
self.addEventListener("push", e => {
  let payload = { title: "Vouch", body: "Someone left you a new vouch 💚", url: new URL("#/worker", SCOPE).href };
  try { if (e.data) payload = Object.assign(payload, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, icon: "icon.svg", badge: "icon.svg", data: { url: payload.url },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || new URL("#/worker", SCOPE).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
