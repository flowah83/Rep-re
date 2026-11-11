/* Pont·Line — systeme.js : écran toujours allumé, son d'alerte, mode en ligne (PWA, version d'essai). */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var Y = { eveilEtat: 'inactif', enLigne: /^https?:$/.test(location.protocol) };
  var verrou = null;

  /* ---- écran toujours allumé (Wake Lock) ---- */
  Y.eveil = function () {
    var veut = PL.etat.data.settings.eveil !== false;
    if (!veut) { if (verrou) { try { verrou.release(); } catch (e) { /* rien */ } verrou = null; } Y.eveilEtat = 'désactivé'; return; }
    if (!('wakeLock' in navigator)) { Y.eveilEtat = 'non disponible sur ce navigateur'; return; }
    if (verrou || document.visibilityState !== 'visible') return;
    try {
      navigator.wakeLock.request('screen').then(function (v) {
        verrou = v; Y.eveilEtat = 'actif';
        v.addEventListener('release', function () { verrou = null; Y.eveilEtat = 'relâché (sera redemandé)'; });
      }).catch(function (e) { Y.eveilEtat = 'refusé par le navigateur (' + (e && e.name) + ')'; });
    } catch (e) { Y.eveilEtat = 'non disponible'; }
  };

  /* ---- son d'alerte (désactivé par défaut) ----
     V3 : le navigateur bloque le son tant qu'on n'a pas cliqué dans la page. Pont·Line réactive le son
     au premier clic ou à la première touche, l'affiche en haut (« son bloqué ») tant que ce n'est pas fait,
     répète l'alerte rouge toutes les 30 s jusqu'à l'acquittement, et fait un bip plus doux à H-30. */
  var ctx = null, dejaSonne = {}, dernierRouge = 0;
  Y.REPETE_MS = 30000;
  function contexte() {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    return ctx;
  }
  Y.debloquer = function () {
    if (!PL.etat.data.settings.son) return;
    var c = contexte();
    if (c && c.state === 'suspended' && c.resume) c.resume().then(function () { if (PL.ui) PL.ui.renderSon(); }).catch(function () {});
  };
  Y.sonEtat = function () {
    if (!PL.etat.data.settings.son) return 'désactivé';
    if (!ctx) return 'bloqué';
    return ctx.state === 'running' ? 'actif' : 'bloqué';
  };
  function tonalite(freq, debut, duree, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + debut); o.stop(ctx.currentTime + debut + duree);
  }
  // type 'danger' : trois bips aigus ; 'warn' : un bip grave
  Y.bip = function (type) {
    try {
      if (!contexte()) return false;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
      if (type === 'warn') tonalite(587, 0, 0.3, 0.12);
      else { tonalite(880, 0, 0.18, 0.18); tonalite(880, 0.28, 0.18, 0.18); tonalite(1175, 0.56, 0.3, 0.18); }
      Y.nbBips = (Y.nbBips || 0) + 1;
      return true;
    } catch (e) { return false; }
  };
  // alertes = alertes affichées et NON acquittées
  Y.sonnerSiNouveau = function (alertes, now) {
    if (!PL.etat.data.settings.son) return;
    if (PL.stockage.lectureSeule) return; // V4 (P2-6) : seule la fenêtre qui a la main sonne
    now = now || Date.now();
    var rouge = false, orange = false, rougesActifs = false;
    alertes.forEach(function (a) {
      if (a.niveau === 'danger') { rougesActifs = true; if (!dejaSonne[a.cle]) { dejaSonne[a.cle] = true; rouge = true; } }
      if (a.niveau === 'warn' && !dejaSonne[a.cle]) { dejaSonne[a.cle] = true; orange = true; }
    });
    if (rouge || (rougesActifs && now - dernierRouge >= Y.REPETE_MS)) { Y.bip('danger'); dernierRouge = now; }
    else if (orange) Y.bip('warn');
  };

  /* ---- version en ligne : PWA + mention « version d'essai » ---- */
  Y.initEnLigne = function () {
    if (!Y.enLigne) return;
    var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json';
    document.head.appendChild(l);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var w = reg.installing;
          if (w) w.addEventListener('statechange', function () {
            if (w.state === 'installed' && navigator.serviceWorker.controller) PL.ui.toast('Nouvelle version disponible : rechargez la page.');
          });
        });
      }).catch(function () { /* hors ligne ou interdit : l'app marche quand même */ });
    }
  };

  PL.systeme = Y;
})(window.PL);
