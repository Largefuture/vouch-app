/* Vouch service worker — network-first app shell: always fresh when online,
   fully offline-capable from cache. Bump CACHE on any shell change to purge old assets. */
const CACHE = "vouch-v4";
const ASSETS = ["./", "index.html", "styles.css", "trust.js", "api.js", "data.js", "app.js", "manifest.json",
  "icon.svg", "icon-192.png", "icon-512.png", "icon-512-maskable.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // never cache API calls — always go to the network (and don't poison the cache)
  if (url.pathname.startsWith("/api/")) return;
  // network-first: fetch fresh, cache it, and fall back to cache (then shell) when offline
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("index.html")))
  );
});

// --- Web Push: the retention loop ("a customer just vouched for you") ---
self.addEventListener("push", e => {
  let payload = { title: "Vouch", body: "Someone left you a new vouch 💚", url: "/#/worker" };
  try { if (e.data) payload = Object.assign(payload, e.data.json()); } catch (_) {}
  e.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body, icon: "icon.svg", badge: "icon.svg", data: { url: payload.url },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/#/worker";
  e.waitUntil(clients.matchAll({ type: "window" }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
