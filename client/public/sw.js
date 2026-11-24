const CACHE = "maternacare-shell-v1";
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/index.html", "/manifest.webmanifest"]))));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") event.respondWith(fetch(event.request).then(response => { const copy=response.clone(); void caches.open(CACHE).then(cache=>cache.put("/index.html",copy)); return response; }).catch(() => caches.match("/index.html")));
  else event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if(response.ok) void caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())); return response; })));
});
