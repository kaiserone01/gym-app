// Precachea el shell de la app para que la PWA (instalada como "Agregar a
// pantalla de inicio" en el kiosco) abra aunque la red esté caída en ese
// momento. El check-in en sí SIEMPRE requiere red real (o queda en la cola
// de pendientes, ver lib/colaPendientes.ts) — este service worker nunca
// intercepta el POST a /api/checkin.
const CACHE = "kiosco-shell-v1";
const RECURSOS_SHELL = ["/", "/config", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(RECURSOS_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    caches.match(evento.request).then((respuestaCacheada) => {
      return respuestaCacheada || fetch(evento.request).catch(() => caches.match("/"));
    })
  );
});
