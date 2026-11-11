/* Pont·Line — stockage.js : sauvegarde locale, verrou d'onglet, export / import. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var KEY = 'pontline.v2', ANCIEN = 'pontline.v1', LOCK = 'pontline.verrou', TAB = Math.random().toString(36).slice(2, 10);
  var S = {
    KEY: KEY, lectureSeule: false, derniereSauvegarde: null, erreur: null, avertissement: null, tab: TAB
  };

  function lsDispo() {
    try { var t = '__pl_test'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; } catch (e) { return false; }
  }

  S.load = function () {
    if (!lsDispo()) { S.erreur = 'Le navigateur bloque la sauvegarde locale (mode privé ?). Rien ne sera conservé.'; return PL.etat.etatVide(); }
    var brut = localStorage.getItem(KEY);
    if (!brut) brut = localStorage.getItem(ANCIEN); // données de la version 1 : migrées par normaliser()
    if (!brut) return PL.etat.etatVide();
    try {
      var e = JSON.parse(brut);
      if (!e || e.app !== 'pontline') throw new Error('format');
      if (e.schemaVersion > 4) S.avertissement = 'Données créées par une version plus récente de Pont·Line.';
      var n = PL.etat.normaliser(e); delete n.rejets;
      return n;
    } catch (err) {
      var cle = KEY + '.corrompu.' + Date.now();
      try { localStorage.setItem(cle, brut); } catch (e2) { /* plein */ }
      S.avertissement = 'Données illisibles : copie conservée (' + cle + '), démarrage à vide.';
      return PL.etat.etatVide();
    }
  };

  /* ---- copie de secours IndexedDB : écrite sur disque immédiatement (durabilité stricte) ----
     localStorage peut garder les dernières secondes en mémoire avant de les écrire : en cas de coupure
     brutale du PC ou du navigateur, c'est la copie IndexedDB qui fait foi au redémarrage. */
  var db = null, dbEnAttente = null, dbEcriture = false;
  S.idbOk = false;
  S.ouvrirIDB = function (cb) {
    try {
      var req = indexedDB.open('pontline', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('etat'); };
      req.onsuccess = function () { db = req.result; S.idbOk = true; cb && cb(); };
      req.onerror = function () { S.idbOk = false; cb && cb(); };
    } catch (e) { S.idbOk = false; cb && cb(); }
  };
  S.lireIDB = function (cb) {
    if (!db) return cb(null);
    try {
      var r = db.transaction('etat', 'readonly').objectStore('etat').get('courant');
      r.onsuccess = function () { cb(r.result || null); };
      r.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  };
  function ecrireIDB(json) {
    if (!db) return;
    if (dbEcriture) { dbEnAttente = json; return; } // une écriture à la fois, on garde la plus récente
    dbEcriture = true;
    try {
      var tx = db.transaction('etat', 'readwrite', { durability: 'strict' });
      tx.objectStore('etat').put(json, 'courant');
      var fin = function () { dbEcriture = false; if (dbEnAttente) { var j = dbEnAttente; dbEnAttente = null; ecrireIDB(j); } };
      tx.oncomplete = function () { S.derniereEcritureDisque = Date.now(); fin(); };
      tx.onerror = tx.onabort = function () { S.idbOk = false; fin(); };
    } catch (e) { dbEcriture = false; S.idbOk = false; }
  }

  S.save = function () {
    if (S.lectureSeule) return false;
    var json = JSON.stringify(PL.etat.data), ok = true;
    try {
      localStorage.setItem(KEY, json);
    } catch (e) {
      ok = false;
      S.erreur = 'ÉCHEC DE SAUVEGARDE (' + (e && e.name) + '). Exportez vos données maintenant.';
    }
    ecrireIDB(json);
    if (ok) { S.derniereSauvegarde = Date.now(); S.erreur = null; }
    if (PL.fichier) PL.fichier.planifier(); // V3 : copie dans le dossier de sauvegarde choisi
    return ok;
  };

  // Au démarrage : si la copie IndexedDB est plus récente que localStorage, on la reprend.
  function poids(e) { return e ? [Date.parse(e.updatedAt || 0) || 0, (e.log || []).length] : [0, 0]; }
  S.recupererSiPlusRecent = function (cb) {
    S.lireIDB(function (json) {
      if (!json) return cb(false);
      try {
        var e = JSON.parse(json), a = poids(e), b = poids(PL.etat.data);
        if (e.app === 'pontline' && (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]))) {
          PL.etat.data = PL.etat.normaliser(e);
          try { localStorage.setItem(KEY, json); } catch (x) { /* rien */ }
          return cb(true);
        }
      } catch (x) { /* copie illisible : on garde localStorage */ }
      cb(false);
    });
  };

  S.taille = function () { var b = localStorage.getItem(KEY); return b ? b.length : 0; };

  S.persister = function () {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* rien */ }
  };

  /* ---- verrou : une seule fenêtre en écriture ----
     V3 (P2-9) : verrou du navigateur (navigator.locks) : il tient tant que la fenêtre est ouverte, même cachée
     ou ralentie, et il est libéré tout seul à la fermeture. « Prendre la main ici » le reprend (steal) : l'autre
     fenêtre passe AUSSITÔT en lecture seule. Ancien verrou (localStorage) seulement si le navigateur ne l'a pas. */
  var NOM_VERROU = 'pontline-ecriture', locksOk = !!(navigator.locks && navigator.locks.request), changeVerrou = false, enFile = false;
  S.modeVerrou = locksOk ? 'navigateur' : 'localStorage';
  function reprendreDonnees() {
    PL.etat.viderPile(); // l'historique d'annulation de cette fenêtre n'est plus valable
    PL.etat.data = S.load();
    S.recupererSiPlusRecent(function () { if (PL.ui) PL.ui.renderTout(); });
  }
  function tenir(lock) {
    if (!lock) { S.lectureSeule = true; changeVerrou = true; attendreVerrou(); return; }
    var etait = S.lectureSeule; S.lectureSeule = false; S.mainPerdue = false; changeVerrou = true;
    if (etait && PL.pret) { reprendreDonnees(); if (PL.ui) PL.ui.toast('Vous avez maintenant la main dans cette fenêtre.'); }
    return new Promise(function () { /* gardé jusqu'à la fermeture de la fenêtre ou une reprise ailleurs */ });
  }
  function perdu() { S.lectureSeule = true; S.mainPerdue = true; changeVerrou = true; if (PL.ui && PL.pret) PL.ui.renderTout(); attendreVerrou(); }
  function attendreVerrou() { // file d'attente : la main revient ici dès que l'autre fenêtre est fermée
    if (enFile) return; enFile = true;
    navigator.locks.request(NOM_VERROU, function (l) { enFile = false; return tenir(l); }).catch(function () { enFile = false; perdu(); });
  }
  S.initVerrou = function (cb) {
    if (!locksOk) { S.verifierVerrou(false); return cb(); }
    var fait = false, fin = function () { if (!fait) { fait = true; changeVerrou = false; cb(); } };
    try {
      navigator.locks.request(NOM_VERROU, { ifAvailable: true }, function (l) { var r = tenir(l); fin(); return r; }).catch(function () { perdu(); fin(); });
    } catch (e) { locksOk = false; S.modeVerrou = 'localStorage'; S.verifierVerrou(false); fin(); }
  };
  function lireVerrou() { try { return JSON.parse(localStorage.getItem(LOCK) || 'null'); } catch (e) { return null; } }
  S.verifierVerrou = function (forcer) {
    if (locksOk) {
      if (forcer && S.lectureSeule) {
        navigator.locks.request(NOM_VERROU, { steal: true }, tenir).catch(perdu);
        S.lectureSeule = false; reprendreDonnees(); // la main est prise tout de suite (steal ne peut pas échouer)
        return true;
      }
      var c = changeVerrou; changeVerrou = false; return c;
    }
    var v = lireVerrou(), now = Date.now();
    var etaitLecture = S.lectureSeule;
    if (forcer || !v || v.tab === TAB || now - v.ts > 6000) {
      try { localStorage.setItem(LOCK, JSON.stringify({ tab: TAB, ts: now })); } catch (e) { /* rien */ }
      S.lectureSeule = false;
      if (etaitLecture) { // reprendre les données les plus récentes
        PL.etat.viderPile(); // V3 : l'historique d'annulation de cette fenêtre n'est plus valable
        PL.etat.data = S.load();
        S.recupererSiPlusRecent(function (r) { if (r && PL.ui) PL.ui.renderTout(); });
      }
    } else {
      S.lectureSeule = true;
    }
    return etaitLecture !== S.lectureSeule;
  };
  /* V4 (audit V3b, P2-6) : présence de la fenêtre qui a la main. Après un redémarrage, Chrome rouvre souvent l'ancien
     onglet, caché, qui garde la main : la fenêtre visible la prend automatiquement si l'autre est cachée depuis plus de
     10 s (ou ne donne plus signe de vie depuis 15 s). Deux fenêtres visibles : rien d'automatique (bouton « Prendre la main »). */
  var PRES = 'pontline.titulaire', visible = function () { return document.visibilityState === 'visible'; };
  var cacheDepuis = visible() ? null : Date.now(), visibleDepuis = visible() ? Date.now() : null;
  S.presence = function () {
    if (S.lectureSeule) return;
    try { localStorage.setItem(PRES, JSON.stringify({ tab: TAB, t: Date.now(), cache: cacheDepuis })); } catch (e) { /* rien */ }
  };
  S.CACHE_MS = 10000; S.MUET_MS = 15000;
  S.priseAuto = function () {
    if (!S.lectureSeule || !visible() || !visibleDepuis || Date.now() - visibleDepuis < 1000) return false;
    var p = null; try { p = JSON.parse(localStorage.getItem(PRES) || 'null'); } catch (e) { p = null; }
    var now = Date.now();
    if (!p || p.tab === TAB) return false;
    if (!((p.cache && now - p.cache > S.CACHE_MS) || now - p.t > S.MUET_MS)) return false;
    S.verifierVerrou(true); S.presence(); S.priseAutoA = now;
    return true;
  };
  document.addEventListener('visibilitychange', function () {
    if (visible()) { cacheDepuis = null; visibleDepuis = Date.now(); } else { cacheDepuis = Date.now(); visibleDepuis = null; }
    S.presence();
  });
  S.libererVerrou = function () { if (locksOk) return; /* libéré par le navigateur à la fermeture */ var v = lireVerrou(); if (v && v.tab === TAB) try { localStorage.removeItem(LOCK); } catch (e) { /* rien */ } };

  /* ---- export / import ---- */
  function telecharger(nom, contenu, type) {
    var blob = new Blob([contenu], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nom;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  S.exporterJSON = function (suffixe) {
    var d = PL.etat.data, now = Date.now();
    if (!S.lectureSeule) { d.lastExport = new Date(now).toISOString(); S.save(); }
    var nom = 'pontline-' + PL.temps.dateIso(now, d.settings.offsetMin) + (suffixe || '') + '.json';
    telecharger(nom, JSON.stringify(d, null, 2), 'application/json');
    if (PL.ui && PL.ui.majFichier) PL.ui.majFichier(); // « Dernier export : à l'instant » tout de suite
    return nom;
  };
  // V4 (audit V3b, P3-3) : cellule CSV sûre : pas de formule dans Excel (= + - @ en tête), guillemets doublés
  S.celluleCSV = function (c) {
    c = String(c);
    if (/^[=+\-@\t\r]/.test(c)) c = "'" + c;
    return /[;"\n\r]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
  };
  S.exporterCSV = function () {
    var d = PL.etat.data, off = d.settings.offsetMin, T = PL.temps, now = Date.now();
    var corrigees = {};
    d.log.forEach(function (l) { if (l.correctsId) corrigees[l.correctsId] = l.id; });
    var lignes = [['N°', 'Date bord', 'Heure bord', 'Fuseau bord', 'Heure Z', 'Vol', 'Type', 'Texte', 'Corrige N°', 'Corrigée par N°']];
    d.log.forEach(function (l) {
      var m = Date.parse(l.at), o = typeof l.off === 'number' ? l.off : off; // V3 : fuseau de la ligne
      lignes.push([l.id, T.dateBord(m, o), T.hms(m, o), T.offsetLabel(o), T.hms(m, 0) + 'Z', l.callsign || '', PL.etat.LOG_TYPES[l.kind] || l.kind,
        l.text, l.correctsId || '', corrigees[l.id] || '']);
    });
    var csv = '\ufeff' + lignes.map(function (r) {
      return r.map(S.celluleCSV).join(';');
    }).join('\r\n');
    var nom = 'main-courante-' + T.dateIso(now, off) + '.csv';
    telecharger(nom, csv, 'text/csv;charset=utf-8');
    return nom;
  };

  // Analyse un fichier importé. Les fichiers de démonstration (demoNow) sont recalés sur l'heure actuelle.
  S.analyserImport = function (texte) {
    var e = JSON.parse(texte);
    if (!e || e.app !== 'pontline' || !Array.isArray(e.flights) || !Array.isArray(e.log)) throw new Error('Ce fichier n\'est pas une sauvegarde Pont·Line.');
    if (e.demoNow) {
      var decal = Date.now() - Date.parse(e.demoNow);
      var dec = function (v) { return v ? new Date(Date.parse(v) + decal).toISOString() : v; };
      e.flights.forEach(function (f) {
        if (!f || typeof f !== 'object') return;
        ['takeoffPlanned', 'landingPlanned', 'takeoffActual', 'landingActual', 'createdAt', 'updatedAt'].forEach(function (k) { f[k] = dec(f[k]); });
        if (f.fuel && typeof f.fuel === 'object') f.fuel.at = dec(f.fuel.at);
        if (Array.isArray(f.sequences)) f.sequences.forEach(function (s) { if (s && typeof s === 'object') s.start = dec(s.start); });
      });
      e.log.forEach(function (l) { if (l && typeof l === 'object') l.at = dec(l.at); });
      delete e.demoNow;
      e.settings = e.settings || {}; e.settings.demo = true;
    }
    return PL.etat.normaliser(e);
  };

  PL.stockage = S;
})(window.PL);
