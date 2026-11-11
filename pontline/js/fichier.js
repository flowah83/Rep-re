/* Pont·Line — fichier.js : sauvegarde automatique dans un VRAI fichier sur le disque (V3).
   1. Méthode principale : l'utilisateur choisit UNE fois un dossier (ex. Documents\PontLine-sauvegardes).
      Pont·Line y réécrit, quelques secondes après chaque saisie :
        - pontline-sauvegarde.json   (toujours la dernière version)
        - pontline-AAAAMMJJ.json     (une copie par jour, heure bord)
      L'écriture passe par un fichier temporaire remplacé d'un coup : jamais de fichier à moitié écrit.
      Après un redémarrage du navigateur, celui-ci peut redemander l'autorisation : un clic suffit.
   2. Secours (dossier non choisi, en pause ou impossible) : téléchargement automatique de la sauvegarde
      dans Téléchargements toutes les N heures (réglage), seulement s'il y a eu des saisies.
   Rien ne part sur un réseau. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var F = { etat: 'aucun', derniere: null, nom: '', erreur: '', dispo: typeof window.showDirectoryPicker === 'function' };
  var dossier = null, minuterie = null, enCours = false, encore = false;
  var CLE_INFO = 'pontline.fichier';

  function info() { try { return JSON.parse(localStorage.getItem(CLE_INFO) || '{}') || {}; } catch (e) { return {}; } }
  function noterInfo(o) { try { var i = info(); for (var k in o) i[k] = o[k]; localStorage.setItem(CLE_INFO, JSON.stringify(i)); } catch (e) { /* rien */ } }
  F.derniere = info().t || null;

  function db(cb) { // même base IndexedDB que les données ; magasin « etat », clé « dossier »
    try {
      var req = indexedDB.open('pontline', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('etat'); };
      req.onsuccess = function () { cb(req.result); };
      req.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  // window.__plFichierTest : crochet réservé aux tests automatiques (dossier simulé) ; absent en usage normal
  function lireHandle(cb) {
    if (window.__plFichierTest && window.__plFichierTest.lire) return window.__plFichierTest.lire(cb);
    db(function (b) {
      if (!b) return cb(null);
      try { var r = b.transaction('etat', 'readonly').objectStore('etat').get('dossier'); r.onsuccess = function () { cb(r.result || null); }; r.onerror = function () { cb(null); }; }
      catch (e) { cb(null); }
    });
  }
  function garderHandle(h, cb) {
    if (window.__plFichierTest && window.__plFichierTest.garder) return window.__plFichierTest.garder(h, cb);
    db(function (b) {
      if (!b) return cb && cb(false);
      try { var tx = b.transaction('etat', 'readwrite'); tx.objectStore('etat').put(h, 'dossier'); tx.oncomplete = function () { cb && cb(true); }; tx.onerror = function () { cb && cb(false); }; }
      catch (e) { cb && cb(false); }
    });
  }
  function permission(h, demander) {
    var opt = { mode: 'readwrite' };
    if (!h) return Promise.resolve('denied');
    var fn = demander ? h.requestPermission : h.queryPermission;
    if (typeof fn !== 'function') return Promise.resolve('granted');
    return fn.call(h, opt).catch(function () { return 'denied'; });
  }
  function maj() { try { if (PL.ui && PL.ui.majFichier) PL.ui.majFichier(); } catch (e) { /* l'affichage ne doit jamais bloquer la sauvegarde */ } }

  // Au démarrage : retrouve le dossier choisi la dernière fois
  F.init = function (cb) {
    if (!F.dispo && !window.__plFichierTest) { F.etat = 'indispo'; maj(); return cb && cb(); }
    lireHandle(function (h) {
      if (!h) { F.etat = 'aucun'; maj(); return cb && cb(); }
      dossier = h; F.nom = h.name || '';
      permission(h, false).then(function (p) { F.etat = p === 'granted' ? 'actif' : 'pause'; maj(); if (F.etat === 'actif') F.planifier(0); cb && cb(); });
    });
  };
  // Clic « Choisir le dossier » (doit venir d'un clic de l'utilisateur)
  F.choisir = function () {
    F.verifie = false; F.conflit = null;
    var pick = window.showDirectoryPicker;
    if (typeof pick !== 'function') { F.etat = 'indispo'; maj(); return Promise.resolve(false); }
    return pick.call(window, { id: 'pontline', mode: 'readwrite', startIn: 'documents' }).then(function (h) {
      return permission(h, true).then(function (p) {
        if (p !== 'granted') { F.etat = 'pause'; dossier = h; maj(); return false; }
        dossier = h; F.nom = h.name || ''; F.etat = 'actif';
        garderHandle(h);
        if (PL.etat && !PL.stockage.lectureSeule) PL.etat.ajouterLog({ kind: 'system', text: 'Sauvegarde automatique activée dans le dossier « ' + F.nom + ' »' });
        return F.ecrire().then(function (ok) { return ok || F.etat === 'conflit'; });
      });
    }).catch(function (e) { if (e && e.name !== 'AbortError') { F.erreur = e.message; } maj(); return false; });
  };
  // Clic « Réautoriser » après un redémarrage du navigateur
  F.reautoriser = function () {
    if (!dossier) return F.choisir();
    if (F.etat === 'conflit') return Promise.resolve(false);
    return permission(dossier, true).then(function (p) { F.etat = p === 'granted' ? 'actif' : 'pause'; maj(); if (F.etat === 'actif') return F.ecrire().then(function () { return true; }); return false; });
  };
  // V4 (P2-5) : copie de l'archive dans le dossier de sauvegarde (si actif)
  F.copieArchive = function (nom, texte) {
    if (!dossier || F.etat !== 'actif') return Promise.resolve(false);
    return ecrireFichier(nom, texte).then(function () { return true; }).catch(function () { return false; });
  };
  F.oublier = function () { dossier = null; F.conflit = null; F.verifie = false; F.etat = F.dispo ? 'aucun' : 'indispo'; garderHandle(null); maj(); };

  function ecrireFichier(nom, texte) {
    return dossier.getFileHandle(nom, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) { return w.write(texte).then(function () { return w.close(); }); });
    });
  }
  // V4 (audit V3b, P0-1) : lecture d'un fichier existant du dossier ; null s'il n'existe pas ou est illisible
  function lireFichier(nom) {
    return Promise.resolve().then(function () { return dossier.getFileHandle(nom); }).then(function (fh) {
      if (!fh || typeof fh.getFile !== 'function') return null;
      return fh.getFile().then(function (fi) { return fi.text(); }).then(function (t) {
        try { var j = JSON.parse(t); return j && j.app === 'pontline' && Array.isArray(j.log) ? { texte: t, json: j } : null; } catch (e) { return null; }
      });
    }).catch(function () { return null; });
  }
  // Lignes du fichier que les données actuelles n'ont PAS (même numéro et même heure) : s'il y en a,
  // écrire dans le dossier détruirait des saisies -> on n'écrit pas et on propose de les reprendre.
  function lignesManquantes(j, d) {
    var vu = {}, n = 0;
    d.log.forEach(function (l) { vu[l.id + '|' + Date.parse(l.at)] = 1; });
    j.log.forEach(function (l) { if (l && !vu[l.id + '|' + Date.parse(l.at)]) n++; });
    return n;
  }
  F.verifie = false;          // le contenu du dossier a été comparé aux données de cette fenêtre
  var remplacementOK = false; // import, effacement ou archivage : on peut remplacer (après une copie de l'ancien fichier)
  F.autoriserRemplacement = function () { remplacementOK = true; F.verifie = false; };
  F.conflit = null;
  function verifierDossier(d, now) {
    if (F.verifie) return Promise.resolve(true);
    var jour = 'pontline-' + PL.temps.dateIso(now, d.settings.offsetMin).slice(0, 8) + '.json';
    return lireFichier('pontline-sauvegarde.json').then(function (a) {
      return lireFichier(jour).then(function (b) {
        var pire = null;
        [a, b].forEach(function (x, i) {
          if (!x) return; var m = lignesManquantes(x.json, d);
          if (m && (!pire || m > pire.manque)) pire = { manque: m, nom: i ? jour : 'pontline-sauvegarde.json', fichier: x };
        });
        if (!pire) { F.verifie = true; remplacementOK = false; return true; }
        if (remplacementOK) { // remplacement voulu : on garde d'abord une copie de l'ancien fichier
          remplacementOK = false;
          return ecrireFichier('pontline-remplace-' + PL.temps.dateIso(now, d.settings.offsetMin) + '.json', pire.fichier.texte).then(function () { F.verifie = true; return true; });
        }
        var j = pire.fichier.json;
        F.conflit = { nom: pire.nom, manque: pire.manque, lignes: j.log.length, vols: (j.flights || []).filter(function (x) { return x && !x.deleted; }).length, maj: j.updatedAt || null, json: j };
        F.etat = 'conflit';
        return false;
      });
    });
  }
  // Copie horaire tournante (48 dernières heures)
  var HEURES_GARDEES = 48;
  function copieHoraire(json, now, off) {
    var nom = 'pontline-h-' + PL.temps.dateIso(now, off).slice(0, 11) + '.json'; // pontline-h-AAAAMMJJ-HH.json
    if (info().h === nom) return Promise.resolve();
    return ecrireFichier(nom, json).then(function () {
      noterInfo({ h: nom });
      if (typeof dossier.entries !== 'function' || typeof dossier.removeEntry !== 'function') return;
      var noms = [], it = dossier.entries();
      var suivant = function () {
        return it.next().then(function (r) {
          if (r.done) return;
          if (/^pontline-h-\d{8}-\d{2}\.json$/.test(r.value[0])) noms.push(r.value[0]);
          return suivant();
        });
      };
      return suivant().then(function () {
        noms.sort(); var trop = noms.slice(0, Math.max(0, noms.length - HEURES_GARDEES));
        return Promise.all(trop.map(function (n) { return dossier.removeEntry(n).catch(function () {}); }));
      });
    }).catch(function () { /* la copie horaire ne doit jamais bloquer la sauvegarde principale */ });
  }
  F.ecrire = function () {
    if (!dossier || F.etat !== 'actif' || PL.stockage.lectureSeule) return Promise.resolve(false); // seule la fenêtre qui a la main écrit
    if (enCours) { encore = true; return Promise.resolve(false); }
    enCours = true;
    var d = PL.etat.data, now = Date.now();
    var jour = 'pontline-' + PL.temps.dateIso(now, d.settings.offsetMin).slice(0, 8) + '.json';
    return verifierDossier(d, now).then(function (ok) {
      if (!ok) return false;
      var json = JSON.stringify(PL.etat.data, null, 1);
      return ecrireFichier('pontline-sauvegarde.json', json).then(function () { return ecrireFichier(jour, json); }).then(function () {
        return copieHoraire(json, now, d.settings.offsetMin);
      }).then(function () {
        F.derniere = Date.now(); F.erreur = ''; noterInfo({ t: F.derniere }); return true;
      });
    }).catch(function (e) {
      F.erreur = (e && (e.name + ' ' + e.message)) || 'erreur';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) F.etat = 'pause'; else F.etat = 'erreur';
      return false;
    }).then(function (ok) {
      enCours = false; maj();
      if (encore) { encore = false; F.planifier(300); }
      return ok;
    });
  };
  // V4 : reprendre les données du fichier du dossier (après un navigateur vidé)
  F.reprendre = function () {
    var c = F.conflit; if (!c) return false;
    var e = PL.etat.normaliser(c.json); var rj = e.rejets; delete e.rejets; delete e.migreDepuis;
    var d = PL.etat.data;
    if (d.flights.length || d.log.some(function (l) { return l.kind !== 'system'; })) PL.stockage.exporterJSON('-avant-reprise');
    // Re-audit V4 : les saisies faites dans ce navigateur depuis le nettoyage ne disparaissent pas :
    // elles sont ajoutées à la suite des lignes du fichier (renumérotées), avec leurs vols.
    var vu = {}, ids = {}, renum = {}, nAj = 0, vAj = 0;
    e.log.forEach(function (l) { vu[l.id + '|' + Date.parse(l.at)] = 1; });
    e.flights.forEach(function (f) { ids[f.id] = 1; });
    d.flights.forEach(function (f) { if (!ids[f.id]) { e.flights.push(f); ids[f.id] = 1; vAj++; } });
    d.log.forEach(function (l) {
      if (vu[l.id + '|' + Date.parse(l.at)]) return;
      var c2 = JSON.parse(JSON.stringify(l)); renum[l.id] = e.nextLogId; c2.id = e.nextLogId++;
      if (c2.correctsId != null && renum[c2.correctsId] != null) c2.correctsId = renum[c2.correctsId];
      e.log.push(c2); nAj++;
    });
    PL.etat.data = e; PL.etat.viderPile();
    F.conflit = null; F.etat = 'actif'; F.verifie = true;
    PL.etat.ajouterLog({ kind: 'system', text: 'Données reprises depuis le fichier ' + c.nom + ' du dossier « ' + F.nom + ' » (' + (e.log.length - nAj) + ' lignes, ' + c.vols + ' vols)' + (nAj ? ' ; ' + nAj + ' ligne(s)' + (vAj ? ' et ' + vAj + ' vol(s)' : '') + ' saisies ici ajoutées à la suite' : '') + (rj ? ' — fichier en partie abîmé' : '') });
    return true;
  };
  // V4 : écraser quand même (après confirmation) : une copie de l'ancien fichier est gardée
  F.ecraser = function () { F.conflit = null; F.etat = 'actif'; F.autoriserRemplacement(); return F.ecrire(); };

  // Appelé après chaque sauvegarde : écrit le fichier peu après (regroupe les saisies rapides)
  F.planifier = function (delai) {
    if (F.etat !== 'actif') return;
    clearTimeout(minuterie);
    minuterie = setTimeout(F.ecrire, delai == null ? F.DELAI : delai);
  };
  F.DELAI = 1500;

  // Secours : téléchargement automatique toutes les settings.autoDl heures s'il y a du nouveau
  var debutSession = Date.now();
  F.verifierSecours = function (now) {
    var d = PL.etat.data, h = d.settings.autoDl;
    if (F.etat === 'actif' || !(h > 0) || PL.stockage.lectureSeule) return false; // (en conflit : le secours continue)
    if (!d.log.length && !d.flights.length) return false;
    var dernier = d.lastExport ? Date.parse(d.lastExport) : 0, modif = d.updatedAt ? Date.parse(d.updatedAt) : 0;
    if (modif <= dernier) return false;
    var base = Math.max(dernier, debutSession);
    if (now - base < h * 3600000) return false;
    PL.stockage.exporterJSON('-auto');
    return true;
  };

  PL.fichier = F;
})(window.PL);
