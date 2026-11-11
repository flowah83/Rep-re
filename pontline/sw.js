/* Pont·Line — service worker (version en ligne uniquement) : met l'app en cache pour marcher hors ligne.
   Aucune donnée utilisateur n'est mise en cache ni envoyée : seulement les fichiers du programme. */
var CACHE = 'pontline-v5.4.0';
var FICHIERS = [
  './', './index.html', './style.css', './manifest.json', './LISEZMOI.txt',
  './js/temps.js', './js/etat.js', './js/stockage.js', './js/fichier.js', './js/alertes.js', './js/conflits.js', './js/systeme.js',
  './js/rapport.js', './js/timeline.js', './js/vols.js', './js/journal.js', './js/bande.js', './js/seqclic.js', './js/pontprog.js', './js/main.js',
  './demo/pontline-demo.json', './icones/icone-192.png', './icones/icone-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k.indexOf('pontline-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// Cache d'abord (marche hors ligne), puis réseau ; seulement pour les fichiers de ce site.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) {
    return r || fetch(e.request).then(function (rep) {
      if (rep.ok) { var copie = rep.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copie); }); }
      return rep;
    });
  }));
});
