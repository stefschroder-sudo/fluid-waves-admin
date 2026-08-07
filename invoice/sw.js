/* Smart Invoice — service worker.
   Doel: de app-schil offline beschikbaar maken en de app installeerbaar.
   API-aanroepen (/api/*) en Supabase gaan ALTIJD via het netwerk — nooit cachen. */
var CACHE = "smart-invoice-v1";
var SCHIL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SCHIL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(namen){
    return Promise.all(namen.map(function(n){ if(n !== CACHE) return caches.delete(n); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                       // alleen GET cachen
  var url = new URL(req.url);
  if(url.pathname.indexOf("/api/") === 0) return;        // API nooit uit cache
  if(url.origin !== self.location.origin) return;        // Supabase/CDN: netwerk

  // App-schil: cache-first met stille netwerk-verversing.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && res.status === 200){ var kopie = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, kopie); }); }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
