/* Pont·Line — etat.js : état central, calculs de vol, actions. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, MIN = T.MIN;

  var TYPES = ['PTR', 'CMN', 'DPN'];
  var TYPES_NOMS = { PTR: 'Panther', CMN: 'Caïman', DPN: 'Dauphin' };
  // Contrôle de vraisemblance de l'autonomie (aide, pas une donnée constructeur) :
  // au-delà de ce seuil, Pont·Line demande une confirmation ; au-delà d'AUTO_MAX, refus.
  var AUTO_SEUIL = { PTR: 180, CMN: 300, DPN: 210 }, AUTO_MIN = 10, AUTO_MAX = 360;
  var SEQ_TYPES = [
    ['mer', 'Mise en route'], ['vol', 'Vol'], ['ravito', 'Ravitaillement'], ['pax', 'Pax'],
    ['treuil', 'Treuillage'], ['vertrep', 'VERTREP'], ['autre', 'Autre']
  ];
  var LOG_TYPES = {
    note: 'Note', dec: 'Décollage', app: 'Appontage', pax: 'Pax', fuel: 'Carburant',
    deck: 'Pont', pontprevu: 'Pont prévu', radio: 'Radio', incident: 'Incident', correction: 'Correction', system: 'Système',
    eta: 'ETA', seq: 'Séquence' // V5
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ms(iso) { return iso ? Date.parse(iso) : null; }
  function iso(m) { return new Date(m).toISOString(); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function etatVide() {
    return {
      app: 'pontline', schemaVersion: 6,
      settings: {
        offsetMin: 60, theme: 'jour', zoomH: 6, finQuart: '', showDone: false, hideCards: null, // null = cartes masquées (V5.1 : la bande des vols les remplace) ; false = cartes affichées
       
        conflits: true, conflictMarginMin: 5, eveil: true, son: true, opsNormalMin: 30, // V5 : rappel « ops normal » par défaut (0 = jamais)
        autoClore: 30, autoDl: 4, controleHeure: '',
        missions: ['Liaison', 'SAR', 'Surveillance', 'VERTREP', 'Entraînement', 'Transfert pax'],
        demo: false
      },
      flights: [], log: [], deckPlans: [], nextLogId: 1, lastExport: null, updatedAt: null // V5.3 : deckPlans = pont programmé
    };
  }

  /* ---- validation des données chargées ou importées (V3, P2-7) ----
     Tout ce qui vient d'un fichier est vérifié : identifiants, dates, nombres, réglages bornés.
     Un vol sans heure lisible est écarté ; une ligne de main courante n'est JAMAIS écartée (ajout seul). */
  var ZOOMS = [2, 6, 12, 24];
  function txt(x, max) { return x == null ? '' : String(x).slice(0, max || 200); }
  function dateOk(x) { return typeof x === 'string' && x.length <= 40 && !isNaN(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null; }
  function entier(x, a, b, def) { var n = typeof x === 'number' ? x : (typeof x === 'string' && /^-?\d+$/.test(x.trim()) ? parseInt(x, 10) : NaN); return isFinite(n) && Math.round(n) === n && n >= a && n <= b ? n : def; }
  function idOk(x) { return typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x) ? x : null; }
  function offsetOk(x) { return entier(x, -720, 840, null) != null && x % 15 === 0 ? x : null; }
  function reglages(s, v) {
    var r = v.settings, n;
    if ((n = offsetOk(s.offsetMin)) != null) r.offsetMin = n;
    if (s.theme === 'nuit' || s.theme === 'jour') r.theme = s.theme;
    if (ZOOMS.indexOf(s.zoomH) >= 0) r.zoomH = s.zoomH;
    r.finQuart = typeof s.finQuart === 'string' && /^\d{1,2}:\d{2}$/.test(s.finQuart.trim()) ? s.finQuart.trim() : '';
    ['showDone', 'hideCards', 'conflits', 'eveil', 'son', 'demo'].forEach(function (k) { if (typeof s[k] === 'boolean') r[k] = s[k]; });
    r.conflictMarginMin = entier(s.conflictMarginMin, 0, 60, r.conflictMarginMin);
    r.autoClore = entier(s.autoClore, 0, 720, r.autoClore);
    r.opsNormalMin = entier(s.opsNormalMin, 0, 240, r.opsNormalMin);
    r.autoDl = entier(s.autoDl, 0, 24, r.autoDl);
    r.controleHeure = typeof s.controleHeure === 'string' && /^\d{8}$/.test(s.controleHeure) ? s.controleHeure : '';
    if (Array.isArray(s.missions)) r.missions = s.missions.filter(function (m) { return typeof m === 'string' && m.trim(); }).slice(0, 30).map(function (m) { return txt(m.trim(), 40); });
  }
  function volPropre(f, ids) {
    if (!f || typeof f !== 'object') return null;
    var g = {};
    g.id = idOk(f.id); if (!g.id || ids[g.id]) g.id = uid('f'); ids[g.id] = 1;
    g.callsign = txt(f.callsign, 20).trim().toUpperCase() || '(SANS NOM)';
    g.type = typeof f.type === 'string' && /^[A-Za-z0-9 -]{1,10}$/.test(f.type) ? f.type : 'PTR';
    g.crew = txt(f.crew, 60); g.mission = txt(f.mission, 60); g.notes = txt(f.notes, 1000);
    g.pax = entier(f.pax, 0, 60, 0);
    ['takeoffPlanned', 'landingPlanned', 'takeoffActual', 'landingActual', 'createdAt', 'updatedAt'].forEach(function (c) { g[c] = dateOk(f[c]); });
    if (!g.takeoffPlanned) g.takeoffPlanned = g.takeoffActual;
    if (!g.takeoffPlanned) return null; // vol sans aucune heure lisible : écarté
    if (!g.takeoffActual) g.landingActual = null;
    // autonomie : minutes entières ; illisible -> 0 (la fin d'autonomie tombe au décollage : alerte rouge, donc visible)
    g.enduranceMin = entier(f.enduranceMin, 0, 1440, 0);
    g.fuel = f.fuel && typeof f.fuel === 'object' && dateOk(f.fuel.at) && entier(f.fuel.min, 0, 1440, null) != null ? { at: dateOk(f.fuel.at), min: f.fuel.min } : null;
    g.closed = f.closed === true; g.deleted = f.deleted === true; if (f.cancelled === true) g.cancelled = true;
    g.opsNormalMin = entier(f.opsNormalMin, 0, 240, null); // V5 : null = réglage général, 0 = pas de rappel
    g.sequences = (Array.isArray(f.sequences) ? f.sequences : []).filter(function (q) { return q && dateOk(q.start) && entier(q.dur, 1, 1440, null) != null; }).slice(0, 50).map(function (q) {
      var kinds = SEQ_TYPES.map(function (x) { return x[0]; }).concat(['treuil', 'vertrep']);
      var g2 = { id: idOk(q.id) || uid('s'), kind: kinds.indexOf(q.kind) >= 0 ? q.kind : 'autre', label: txt(q.label, 60), start: dateOk(q.start), dur: q.dur };
      if (q.fait === 'fait' || q.fait === 'ignore') g2.fait = q.fait; // V5.3 : rappel de ravitaillement traité
      return g2;
    });
    if (f.rotation != null) g.rotation = entier(f.rotation, 1, 99, 1);
    if (idOk(f.parentId)) g.parentId = f.parentId;
    return g;
  }
  function lignePropre(l, v, vus, prec) {
    if (!l || typeof l !== 'object') l = { text: String(l) };
    var g = {};
    g.id = entier(l.id, 1, 1e9, null);
    if (g.id == null || vus[g.id]) g.id = null; else vus[g.id] = 1;
    g.at = dateOk(l.at);
    g.kind = typeof l.kind === 'string' && Object.prototype.hasOwnProperty.call(LOG_TYPES, l.kind) ? l.kind : 'note';
    g.text = txt(l.text, 4000);
    if (!g.at) { g.at = prec || new Date(0).toISOString(); g.text = '[heure illisible dans le fichier] ' + g.text; }
    g.flightId = idOk(l.flightId);
    if (l.callsign != null) g.callsign = txt(l.callsign, 20);
    if (l.deck === 'vert' || l.deck === 'rouge') g.deck = l.deck;
    if (typeof l.value === 'number' && isFinite(l.value)) g.value = l.value;
    var c = entier(l.correctsId, 1, 1e9, null); if (c != null) g.correctsId = c;
    g.off = offsetOk(l.off); if (g.off == null) g.off = v.settings.offsetMin;
    return g;
  }

  // Remet un état chargé dans la forme attendue (champs manquants -> valeurs par défaut).
  // Migre aussi les données des versions précédentes : v.migreDepuis indique la version d'origine.
  function normaliser(e) {
    var v = etatVide();
    if (!e || typeof e !== 'object') return v;
    var version = entier(e.schemaVersion, 1, 99, 1);
    reglages(e.settings && typeof e.settings === 'object' ? e.settings : {}, v);
    if (version < 6) v.migreDepuis = version;
    if (version < 4) {
      // V4 (audit V3b, P1-1) : le son des alertes devient actif par défaut, aussi pour les données reprises
      v.settings.son = true;
      // V4 (P2-9) : « cartes affichées » était le défaut : on passe au réglage automatique (masquées sur un petit écran)
      if (v.settings.hideCards === false) v.settings.hideCards = null;
    }
    var ids = {}, ecartes = 0;
    (Array.isArray(e.flights) ? e.flights : []).forEach(function (f) { delete (f || {}).jokerMin; delete (f || {}).bingoMin; // Joker/Bingo supprimés en V2.1
      var g = volPropre(f, ids); if (g) v.flights.push(g); else ecartes++; });
    // V3 : chaque ligne garde le fuseau du bord au moment où elle a été écrite.
    // Lignes plus anciennes : on fige le fuseau réglé au moment de la mise à jour.
    var vus = {}, prec = null, sansId = [];
    (Array.isArray(e.log) ? e.log : []).forEach(function (l) { var g = lignePropre(l, v, vus, prec); prec = g.at; v.log.push(g); if (g.id == null) sansId.push(g); });
    var maxId = 0; v.log.forEach(function (l) { if (l.id > maxId) maxId = l.id; });
    sansId.forEach(function (l) { l.id = ++maxId; }); // identifiants manquants ou en double : renumérotés à la suite
    v.nextLogId = Math.max(entier(e.nextLogId, 1, 1e9, 1), maxId + 1);
    // V5.3 : pont programmé (vert / rouge à une heure donnée, fin facultative)
    var pids = {};
    (Array.isArray(e.deckPlans) ? e.deckPlans : []).slice(0, 200).forEach(function (q) {
      if (!q || (q.deck !== 'vert' && q.deck !== 'rouge') || !dateOk(q.start)) return;
      var id = idOk(q.id) && !pids[q.id] ? q.id : uid('p'); pids[id] = 1;
      var fin = dateOk(q.end); if (fin && (ms(fin) <= ms(q.start) || ms(fin) - ms(q.start) > 1440 * MIN)) fin = null;
      var STS = ['prevu', 'fait', 'ignore'];
      v.deckPlans.push({ id: id, deck: q.deck, start: dateOk(q.start), end: fin, statut: STS.indexOf(q.statut) >= 0 ? q.statut : 'prevu',
        statutFin: fin ? (STS.indexOf(q.statutFin) >= 0 ? q.statutFin : 'prevu') : null, createdAt: dateOk(q.createdAt) });
    });
    v.deckPlans.sort(function (a, b) { return ms(a.start) - ms(b.start); });
    v.lastExport = dateOk(e.lastExport);
    v.updatedAt = dateOk(e.updatedAt);
    if (ecartes || sansId.length) v.rejets = { vols: ecartes, lignes: sansId.length };
    return v;
  }

  /* ---------- calculs de vol ---------- */
  function decollage(f) { return ms(f.takeoffActual || f.takeoffPlanned); }
  function finAuto(f) {
    if (f.fuel && f.fuel.at != null) return ms(f.fuel.at) + f.fuel.min * MIN;
    return decollage(f) + (f.enduranceMin || 0) * MIN;
  }
  var H30_MIN = 30; // repère fixe : 30 min avant la fin d'autonomie
  function h30At(f) { return finAuto(f) - H30_MIN * MIN; }
  function seqFin(s) { return ms(s.start) + (s.dur || 0) * MIN; }
  function appontagePrevu(f) {
    if (f.landingPlanned) return ms(f.landingPlanned);
    var fin = null;
    (f.sequences || []).forEach(function (s) { if (s.kind === 'vol' || s.kind === 'treuil' || s.kind === 'vertrep') { var e = seqFin(s); if (fin == null || e > fin) fin = e; } });
    return fin;
  }
  function statut(f) {
    if (f.deleted) return 'supprime';
    if (f.cancelled) return 'annule'; // V4 (audit V3b, P2-3) : vol jamais parti
    if (f.closed) return 'termine';
    if (f.landingActual) return 'pose';
    if (f.takeoffActual) return 'envol';
    return 'prevu';
  }
  var STATUT_NOMS = { prevu: 'Prévu', envol: 'En vol', pose: 'Posé', termine: 'Terminé', annule: 'Annulé', supprime: 'Supprimé' };
  function etendue(f) {
    var a = decollage(f), b = finAuto(f);
    (f.sequences || []).forEach(function (s) { a = Math.min(a, ms(s.start)); b = Math.max(b, seqFin(s)); });
    var l = appontagePrevu(f); if (l) b = Math.max(b, l);
    if (f.landingActual) b = Math.max(b, ms(f.landingActual));
    return [a, b];
  }
  function volParId(id) { for (var i = 0; i < PL.etat.data.flights.length; i++) if (PL.etat.data.flights[i].id === id) return PL.etat.data.flights[i]; return null; }
  function volsVisibles(avecTermines) {
    return PL.etat.data.flights.filter(function (f) {
      var st = statut(f);
      if (st === 'supprime') return false;
      if ((st === 'termine' || st === 'annule') && !avecTermines) return false;
      return true;
    }).sort(function (a, b) { return (RANG[statut(a)] - RANG[statut(b)]) || (decollage(a) - decollage(b)); });
  }
  var RANG = { envol: 0, prevu: 1, pose: 2, termine: 3, annule: 3, supprime: 4 };
  function etatPont() {
    var log = PL.etat.data.log;
    for (var i = log.length - 1; i >= 0; i--) if (log[i].kind === 'deck') return { etat: log[i].deck, at: ms(log[i].at) };
    return null;
  }

  /* ---------- annulation (vols et séquences) ----------
     Avant chaque action, on garde une copie des SEULS vols concernés (V3 : plus jamais toute la liste).
     Annuler remet ces vols et AJOUTE une ligne de correction : la main courante n'est jamais effacée. */
  var pile = [], PILE_MAX = 40;
  function memoriser(libelle, ids) {
    var m = { libelle: libelle, avant: [], logId: null, at: Date.now() };
    (ids || []).forEach(function (id) { ajouterAvant(m, id); });
    pile.push(m);
    if (pile.length > PILE_MAX) pile.shift();
    return m;
  }
  // id d'un vol touché par l'action ; copie = null si le vol n'existait pas encore (création)
  function ajouterAvant(m, id) {
    for (var i = 0; i < m.avant.length; i++) if (m.avant[i].id === id) return;
    var f = volParId(id);
    m.avant.push({ id: id, copie: f ? JSON.parse(JSON.stringify(f)) : null });
  }
  function oublierDernier(m) { if (pile[pile.length - 1] === m) pile.pop(); }
  function viderPile() { pile.length = 0; }
  function prochaineAnnulation() { return pile.length ? pile[pile.length - 1] : null; }
  function annuler() {
    if (!pile.length) { PL.ui && PL.ui.toast('Rien à annuler.'); return null; }
    if (!peutEcrire()) return null;
    var m = pile.pop(), fl = PL.etat.data.flights;
    if (m.plans) PL.etat.data.deckPlans = m.plans; // V5.3 : pont programmé
    m.avant.forEach(function (a) {
      var idx = -1;
      for (var i = 0; i < fl.length; i++) if (fl[i].id === a.id) idx = i;
      if (a.copie == null) { if (idx >= 0) fl.splice(idx, 1); }
      else if (idx >= 0) fl[idx] = a.copie; else fl.push(a.copie);
    });
    var orig = null;
    PL.etat.data.log.forEach(function (l) { if (l.id === m.logId) orig = l; });
    ajouterLog({ kind: 'correction', correctsId: m.logId || null, flightId: orig ? orig.flightId : null, text: 'Annulation : ' + m.libelle }, true);
    commit();
    return m;
  }

  /* ---------- actions (chacune sauvegarde) ---------- */
  function peutEcrire() {
    if (PL.stockage.lectureSeule) { PL.ui && PL.ui.toast('Lecture seule : Pont·Line est ouvert dans une autre fenêtre.', true); return false; }
    return true;
  }
  function commit() { PL.etat.data.updatedAt = iso(Date.now()); var ok = PL.stockage.save(); if (PL.ui) PL.ui.renderTout(); return ok; }

  function ajouterLog(o, sansCommit) {
    var d = PL.etat.data;
    var l = {
      id: d.nextLogId++, at: iso(o.at || Date.now()), kind: o.kind || 'note', text: o.text || '',
      flightId: o.flightId || null
    };
    if (o.deck) l.deck = o.deck;
    if (o.value != null) l.value = o.value;
    if (o.correctsId) l.correctsId = o.correctsId;
    l.off = d.settings.offsetMin; // fuseau du bord au moment de l'écriture
    if (l.flightId) { var f = volParId(l.flightId); if (f) l.callsign = f.callsign; }
    d.log.push(l);
    if (!sansCommit) commit();
    return l;
  }

  // V3 (P2-2) : seule l'action logique suivante est acceptée. Renvoie { err } (refus), { redec: true } (proposer un redécollage) ou {}.
  function controleAction(f, kind, at) {
    if (f && kind === 'fuel' && !f.takeoffActual) return { err: f.callsign + ' n\'a pas décollé : modifiez l\'autonomie dans la fiche du vol (le carburant se recale en vol).' };
    if (at != null && at > Date.now() + 2 * MIN) return { err: 'heure dans le futur (ou plus de 3 h avant) : vérifiez l\'heure saisie.' };
    if (!f || (kind !== 'dec' && kind !== 'app')) return {};
    var off = PL.etat.data.settings.offsetMin;
    if (kind === 'dec') {
      if (f.landingActual) return { redec: true };
      if (f.takeoffActual) return { err: f.callsign + ' est déjà en vol (décollé à ' + T.hm(ms(f.takeoffActual), off) + ').' };
    } else {
      if (!f.takeoffActual) return { err: f.callsign + ' n\'a pas décollé : saisissez d\'abord le décollage.' };
      if (f.landingActual) return { err: f.callsign + ' est déjà posé (appontage à ' + T.hm(ms(f.landingActual), off) + ').' };
      if (at != null && at <= ms(f.takeoffActual)) return { err: 'appontage à ' + T.hm(at, off) + ' avant le décollage de ' + f.callsign + ' (' + T.hm(ms(f.takeoffActual), off) + ').' };
    }
    return {};
  }
  // Entrée de main courante avec effets sur le vol (décollage, appontage, carburant)
  function saisir(o) {
    if (!peutEcrire()) return null;
    var f = o.flightId ? volParId(o.flightId) : null;
    var ctl = controleAction(f, o.kind, o.at);
    if (ctl.err || ctl.redec) { if (PL.ui) PL.ui.toast(ctl.err || (f.callsign + ' est posé : utilisez « Redécollage ».'), true); return null; }
    var now = Date.now(), mem = null;
    if (f && (o.kind === 'dec' || o.kind === 'app' || (o.kind === 'fuel' && o.value != null))) {
      mem = memoriser({ dec: 'décollage ', app: 'appontage ', fuel: 'carburant ' }[o.kind] + f.callsign, [f.id]);
    }
    if (f && o.kind === 'dec') { f.takeoffActual = iso(o.at != null ? o.at : now); f.updatedAt = iso(now); }
    if (f && o.kind === 'app') { f.landingActual = iso(o.at != null ? o.at : now); f.updatedAt = iso(now); }
    if (f && o.kind === 'fuel' && o.value != null) { f.fuel = { at: iso(o.at != null ? o.at : now), min: o.value }; f.updatedAt = iso(now); }
    var l = ajouterLog({ kind: o.kind, text: o.text, flightId: o.flightId, deck: o.deck, value: o.value, correctsId: o.correctsId, at: now });
    if (mem) mem.logId = l.id;
    return l;
  }

  var CHAMPS = {
    callsign: 'indicatif', type: 'type', crew: 'équipage', pax: 'pax', mission: 'mission', notes: 'remarques',
    takeoffPlanned: 'décollage prévu', landingPlanned: 'appontage prévu', enduranceMin: 'autonomie',
    takeoffActual: 'décollage réel', landingActual: 'appontage réel', sequences: 'séquences', opsNormalMin: 'rappel ops normal'
  };
  function resumeVol(f) {
    var off = PL.etat.data.settings.offsetMin;
    return f.callsign + ' (' + f.type + ') déc. ' + T.hm(decollage(f), off) + ', autonomie ' + T.fmtDuree(f.enduranceMin) +
      ', fin auto. ' + T.hm(finAuto(f), off);
  }
  function enregistrerVol(donnees, id) {
    if (!peutEcrire()) return null;
    var d = PL.etat.data, now = iso(Date.now()), f, mem, l = null;
    if (id) {
      f = volParId(id); if (!f) return null;
      mem = memoriser('modification de ' + f.callsign, [f.id]);
      // V3 (P2-1) : la fiche ne connaît que HH:MM ; si la minute est la même, on garde l'heure exacte d'origine
      ['takeoffActual', 'landingActual', 'takeoffPlanned', 'landingPlanned'].forEach(function (c) {
        if (donnees[c] && f[c] && Math.floor(ms(donnees[c]) / MIN) === Math.floor(ms(f[c]) / MIN)) donnees[c] = f[c];
      });
      var changes = [];
      for (var k in CHAMPS) {
        if (JSON.stringify(f[k] == null ? null : f[k]) !== JSON.stringify(donnees[k] == null ? null : donnees[k])) changes.push(CHAMPS[k]);
      }
      if (donnees.takeoffActual !== f.takeoffActual || donnees.enduranceMin !== f.enduranceMin) {
        // un recalage carburant antérieur au nouveau décollage n'a plus de sens
        if (f.fuel && donnees.takeoffActual && ms(f.fuel.at) < ms(donnees.takeoffActual)) f.fuel = null;
      }
      for (var k2 in donnees) f[k2] = donnees[k2];
      f.updatedAt = now;
      if (changes.length) l = ajouterLog({ kind: 'system', flightId: f.id, text: 'Vol modifié (' + changes.join(', ') + ') : ' + resumeVol(f) }, true);
      else oublierDernier(mem);
    } else {
      mem = memoriser('création de ' + donnees.callsign);
      f = { id: uid('f'), createdAt: now, updatedAt: now, takeoffActual: null, landingActual: null, fuel: null, closed: false, deleted: false, sequences: [] };
      for (var k3 in donnees) f[k3] = donnees[k3];
      d.flights.push(f);
      mem.avant.push({ id: f.id, copie: null });
      l = ajouterLog({ kind: 'system', flightId: f.id, text: 'Vol créé : ' + resumeVol(f) }, true);
    }
    if (l) mem.logId = l.id;
    commit();
    return f;
  }
  function supprimerVol(id) {
    if (!peutEcrire()) return;
    var f = volParId(id); if (!f) return;
    var mem = memoriser('suppression de ' + f.callsign, [id]);
    f.deleted = true; f.updatedAt = iso(Date.now());
    mem.logId = ajouterLog({ kind: 'system', flightId: id, text: 'Vol supprimé : ' + f.callsign + ' (reste dans les exports)' }, true).id;
    commit();
  }
  function restaurerVol(id) {
    if (!peutEcrire()) return;
    var f = volParId(id); if (!f) return;
    var mem = memoriser('restauration de ' + f.callsign, [id]);
    f.deleted = false; f.updatedAt = iso(Date.now());
    mem.logId = ajouterLog({ kind: 'system', flightId: id, text: 'Vol restauré : ' + f.callsign }, true).id;
    commit();
  }
  function clore(id, oui) {
    if (!peutEcrire()) return;
    var f = volParId(id); if (!f) return;
    var mem = memoriser((oui ? 'clôture de ' : 'réouverture de ') + f.callsign, [id]);
    f.closed = !!oui; f.updatedAt = iso(Date.now());
    mem.logId = ajouterLog({ kind: 'system', flightId: id, text: (oui ? 'Vol clos : ' : 'Vol rouvert : ') + f.callsign }, true).id;
    commit();
  }
  // V4 (audit V3b, P2-3) : « Vol annulé » pour un vol prévu qui ne partira pas (plus d'alerte), ou réactivation
  function annulerVol(id, oui, motif) {
    if (!peutEcrire()) return false;
    var f = volParId(id); if (!f || f.deleted) return false;
    if (oui && (f.takeoffActual || f.cancelled)) { if (PL.ui) PL.ui.toast(f.takeoffActual ? f.callsign + ' a décollé : il ne peut pas être annulé (utilisez Appontage ou Clore).' : f.callsign + ' est déjà annulé.', true); return false; }
    if (!oui && !f.cancelled) return false;
    var mem = memoriser((oui ? 'annulation du vol ' : 'réactivation de ') + f.callsign, [id]);
    if (oui) f.cancelled = true; else delete f.cancelled;
    f.updatedAt = iso(Date.now());
    mem.logId = ajouterLog({ kind: 'system', flightId: id, text: oui ? 'Vol annulé : ' + f.callsign + ' (décollage prévu ' + T.hm(decollage(f), PL.etat.data.settings.offsetMin) + ')' + (motif ? ' — ' + motif : '') : 'Vol réactivé : ' + f.callsign }, true).id;
    commit();
    return true;
  }
  // Clôture automatique des vols posés depuis settings.autoClore minutes (0 = jamais). Renvoie le nombre clos.
  function cloreAuto(now) {
    var d = PL.etat.data, n = d.settings.autoClore, nb = 0;
    if (!(n > 0) || PL.stockage.lectureSeule) return 0;
    d.flights.forEach(function (f) {
      if (f.deleted || f.closed || !f.landingActual) return;
      if (now - ms(f.landingActual) >= n * MIN) {
        f.closed = true; f.updatedAt = iso(now); nb++;
        ajouterLog({ kind: 'system', flightId: f.id, text: 'Vol clos automatiquement : ' + f.callsign + ' (posé depuis ' + n + ' min)' }, true);
      }
    });
    if (nb) { d.updatedAt = iso(now); PL.stockage.save(); }
    return nb;
  }
  // Contrôle de vraisemblance d'une autonomie : { err } si refus, { conf } si confirmation demandée
  function controleAutonomie(type, min) {
    if (min == null) return { err: 'autonomie invalide' };
    if (min < AUTO_MIN) return { err: 'autonomie trop courte (moins de ' + AUTO_MIN + ' min)' };
    if (min > AUTO_MAX) return { err: 'autonomie de ' + T.fmtDuree(min) + ' impossible (maximum ' + T.fmtDuree(AUTO_MAX) + ')' };
    var seuil = AUTO_SEUIL[type];
    if (seuil && min > seuil) return { conf: 'Autonomie de ' + T.fmtDuree(min) + ' pour un ' + type + ' : c\'est plus que d\'habitude (au-delà de ' + T.fmtDuree(seuil) + ').' };
    return {};
  }
  // V3 (P2-10) : redécollage d'un vol posé (rotation pax, ravitaillement rotors tournants).
  // Le vol posé est clos ; une nouvelle rotation (même indicatif, même équipage) part maintenant avec l'autonomie saisie.
  function redecoller(id, enduranceMin, texte, at, paxRot) {
    if (!peutEcrire()) return null;
    var f = volParId(id); if (!f || !f.landingActual) return null;
    var now = Date.now(), rot = (f.rotation || 1) + 1, t = at != null ? at : now;
    if (t > now + 2 * MIN || t < ms(f.landingActual)) { if (PL.ui) PL.ui.toast('Heure de redécollage impossible (avant l\'appontage ou dans le futur).', true); return null; }
    var mem = memoriser('redécollage ' + f.callsign, [f.id]);
    f.closed = true; f.updatedAt = iso(now);
    var n = { id: uid('f'), createdAt: iso(now), updatedAt: iso(now), callsign: f.callsign, type: f.type, crew: f.crew, pax: paxRot != null ? paxRot : 0, mission: f.mission, notes: '',
      takeoffPlanned: iso(t), takeoffActual: iso(t), landingPlanned: null, landingActual: null, enduranceMin: enduranceMin,
      fuel: null, closed: false, deleted: false, sequences: [], rotation: rot, parentId: f.id, opsNormalMin: f.opsNormalMin == null ? null : f.opsNormalMin };
    PL.etat.data.flights.push(n);
    mem.avant.push({ id: n.id, copie: null });
    var l = ajouterLog({ kind: 'dec', flightId: n.id, at: now, text: 'Redécollage' + (t < now - 30000 ? ' à ' + T.hm(t, PL.etat.data.settings.offsetMin) : '') + ' (rotation ' + rot + ') — autonomie ' + T.fmtDuree(enduranceMin) + ', fin d\'autonomie ' + T.hm(finAuto(n), PL.etat.data.settings.offsetMin) + (texte ? ' — ' + texte : '') }, true);
    mem.logId = l.id;
    commit();
    return n;
  }
  /* ---- V4 (audit V3b, P1-2) : corriger une ligne Décollage / Appontage / Carburant recale AUSSI le vol ---- */
  function ligneParId(id) { var log = PL.etat.data.log; for (var i = log.length - 1; i >= 0; i--) if (log[i].id === id) return log[i]; return null; }
  function dernierCarburant(f) { var log = PL.etat.data.log; for (var i = log.length - 1; i >= 0; i--) if (log[i].kind === 'fuel' && log[i].flightId === f.id && log[i].value != null) return log[i]; return null; }
  // Peut-on recaler le vol depuis cette ligne ? -> { f, kind } ou null
  function corrigeable(l) {
    if (!l || !l.flightId || (l.kind !== 'dec' && l.kind !== 'app' && l.kind !== 'fuel')) return null;
    var f = volParId(l.flightId); if (!f || f.deleted) return null;
    if (l.kind === 'dec' && !f.takeoffActual) return null;
    if (l.kind === 'app' && !f.landingActual) return null;
    if (l.kind === 'fuel' && (!f.fuel || dernierCarburant(f) !== l)) return null;
    return { f: f, kind: l.kind };
  }
  // val : instant (ms) pour dec/app, minutes restantes pour fuel. Renvoie { err } ou { f, avant, apres } (simulation sans rien changer)
  function simulerCorrection(l, val) {
    var c = corrigeable(l); if (!c) return { err: 'cette ligne ne peut pas recaler le vol' };
    var f = c.f, off = PL.etat.data.settings.offsetMin, g = JSON.parse(JSON.stringify(f)), now = Date.now();
    if (val == null || isNaN(val)) return { err: c.kind === 'fuel' ? 'durée invalide (ex. 1h10)' : 'heure invalide (HH:MM)' };
    if (c.kind === 'dec') {
      if (val > now + 2 * MIN) return { err: 'heure dans le futur (ou plus de 3 h avant)' };
      if (f.landingActual && val >= ms(f.landingActual)) return { err: 'décollage après l\'appontage (' + T.hm(ms(f.landingActual), off) + ')' };
      g.takeoffActual = iso(val);
      if (g.fuel && ms(g.fuel.at) < val) g.fuel = null;
    } else if (c.kind === 'app') {
      if (val > now + 2 * MIN) return { err: 'heure dans le futur (ou plus de 3 h avant)' };
      if (val <= ms(f.takeoffActual)) return { err: 'appontage avant le décollage (' + T.hm(ms(f.takeoffActual), off) + ')' };
      g.landingActual = iso(val);
    } else {
      if (val > AUTO_MAX) return { err: 'autonomie restante impossible' };
      g.fuel = { at: f.fuel.at, min: val };
    }
    return { f: f, g: g, kind: c.kind, avant: finAuto(f), apres: finAuto(g) };
  }
  function corrigerAction(lid, val) {
    if (!peutEcrire()) return null;
    var l = ligneParId(lid), r = simulerCorrection(l, val);
    if (r.err) { if (PL.ui) PL.ui.toast('Correction refusée : ' + r.err, true); return null; }
    var off = PL.etat.data.settings.offsetMin, f = r.f, now = Date.now();
    var mem = memoriser('correction ' + f.callsign, [f.id]);
    var quoi = r.kind === 'dec' ? 'décollage à ' + T.hm(ms(r.g.takeoffActual), off) + ' (au lieu de ' + T.hm(ms(f.takeoffActual), off) + ')' :
      r.kind === 'app' ? 'appontage à ' + T.hm(ms(r.g.landingActual), off) + ' (au lieu de ' + T.hm(ms(f.landingActual), off) + ')' :
      'autonomie restante ' + T.fmtDuree(val) + ' (au lieu de ' + T.fmtDuree(f.fuel.min) + ')';
    f.takeoffActual = r.g.takeoffActual; f.landingActual = r.g.landingActual; f.fuel = r.g.fuel; f.updatedAt = iso(now);
    var nl = ajouterLog({ kind: 'correction', correctsId: lid, flightId: f.id, value: r.kind === 'fuel' ? val : undefined,
      text: 'Correction : ' + quoi + ' — fin d\'autonomie ' + T.hm(r.avant, off) + ' → ' + T.hm(r.apres, off) }, true);
    mem.logId = nl.id;
    commit();
    return nl;
  }

  // Copie pour une nouvelle rotation : nouveaux horaires à saisir
  function copieVol(id) {
    var f = volParId(id); if (!f) return null;
    var c = JSON.parse(JSON.stringify(f));
    delete c.id; delete c.createdAt; delete c.updatedAt;
    c.takeoffActual = null; c.landingActual = null; c.fuel = null; c.closed = false; c.deleted = false;
    var decal = Math.max(0, (appontagePrevu(f) || decollage(f)) - decollage(f)) + 30 * MIN;
    c.takeoffPlanned = iso(decollage(f) + decal);
    if (c.landingPlanned) c.landingPlanned = iso(ms(c.landingPlanned) + decal);
    c.sequences = (c.sequences || []).map(function (s) { s.id = uid('s'); s.start = iso(ms(s.start) + decal); return s; });
    return c;
  }

  /* ---- V5 : séquence ajoutée depuis la timeline, ETA en un clic, rappel « ops normal » ---- */
  var VOLANTS = ['vol', 'treuil', 'vertrep'];
  function nomSeq(k) { var t = SEQ_TYPES.filter(function (x) { return x[0] === k; })[0]; return t ? t[1] : k; }
  // o : { kind, start (ms), dur (min) }. Jamais refusée si elle dépasse la fin d'autonomie (choix de l'utilisateur) :
  // c'est seulement signalé (dans la fenêtre et dans la ligne de main courante).
  function ajouterSequence(id, o) {
    if (!peutEcrire()) return null;
    var f = volParId(id); if (!f || f.deleted) return null;
    var dur = entier(o && o.dur, 1, 1440, null), kind = o && SEQ_TYPES.some(function (x) { return x[0] === o.kind; }) ? o.kind : null;
    if (dur == null || !kind || o.start == null || isNaN(o.start)) return null;
    if ((f.sequences || []).length >= 50) { if (PL.ui) PL.ui.toast('50 séquences au plus par vol.', true); return null; }
    var off = PL.etat.data.settings.offsetMin, now = Date.now(), mem = memoriser('séquence ' + nomSeq(kind) + ' ' + f.callsign, [f.id]);
    f.sequences = f.sequences || [];
    var s = { id: uid('s'), kind: kind, label: '', start: iso(Math.round(o.start / MIN) * MIN), dur: dur };
    f.sequences.push(s);
    f.sequences.sort(function (a, b) { return ms(a.start) - ms(b.start); });
    f.updatedAt = iso(now);
    var fin = finAuto(f), b = seqFin(s), apres = b > fin;
    mem.logId = ajouterLog({ kind: 'seq', flightId: f.id, text: 'Séquence ajoutée : ' + nomSeq(kind) + ' ' + T.hm(ms(s.start), off) + '–' + T.hm(b, off) + ' (' + T.fmtDuree(dur) + ')' + (apres ? ' — finit APRÈS la fin d\'autonomie ' + T.hm(fin, off) : '') }, true).id;
    commit();
    return { seq: s, apresFin: apres };
  }
  function baseEta(f, now) { var a = appontagePrevu(f); return a != null && a > now ? a : now; }
  function eta(id, plusMin) {
    if (!peutEcrire()) return null;
    var f = volParId(id); if (!f || statut(f) !== 'envol') return null;
    var n = entier(plusMin, 1, 240, null); if (n == null) return null;
    var off = PL.etat.data.settings.offsetMin, now = Date.now(), avant = appontagePrevu(f), base = baseEta(f, now), nouv = Math.floor(base / MIN) * MIN + n * MIN;
    var mem = memoriser('ETA ' + f.callsign, [f.id]);
    // la dernière séquence de vol suit l'ETA (sinon le bloc affiché ne bouge pas) ; l'autonomie n'est JAMAIS touchée
    var der = null; (f.sequences || []).forEach(function (q) { if (VOLANTS.indexOf(q.kind) >= 0 && (!der || seqFin(q) > seqFin(der))) der = q; });
    if (der && nouv > ms(der.start)) der.dur = Math.min(1440, Math.round((nouv - ms(der.start)) / MIN));
    f.landingPlanned = iso(nouv); f.updatedAt = iso(now);
    var fin = finAuto(f);
    mem.logId = ajouterLog({ kind: 'eta', flightId: f.id, value: n, text: 'ETA +' + n + ' min : appontage prévu ' + (avant != null ? T.hm(avant, off) + ' → ' : '') + T.hm(nouv, off) + (nouv > fin ? ' — APRÈS la fin d\'autonomie ' + T.hm(fin, off) : '') }, true).id;
    commit();
    return { avant: avant, apres: nouv };
  }
  function opsNormal(f) { var d = PL.etat.data.settings.opsNormalMin; return f.opsNormalMin == null ? (d == null ? 30 : d) : f.opsNormalMin; }
  // dernier contact : décollage réel ou dernière ligne « Radio » du vol (un « Radio ✓ » écrit aussi une ligne Radio)
  function dernierContact(f) {
    var t = f.takeoffActual ? ms(f.takeoffActual) : null, log = PL.etat.data.log;
    for (var i = log.length - 1; i >= 0; i--) if (log[i].kind === 'radio' && log[i].flightId === f.id) { var a = ms(log[i].at); if (t == null || a > t) t = a; break; }
    return t;
  }
  function opsEnRetard(f, now) {
    var iv = opsNormal(f); if (!iv || statut(f) !== 'envol') return null;
    var t = dernierContact(f); if (t == null) return null;
    var att = t + iv * MIN, mn = Math.floor((now - t) / MIN); return now >= att ? { dernier: t, attendu: att, minutes: mn, intervalle: iv, rappel: Math.floor(mn / iv) } : null;
  }
  function radioOk(id) {
    var f = volParId(id); if (!f) return null;
    return saisir({ kind: 'radio', flightId: id, text: 'Contact radio — ops normal' });
  }


  /* ---------- V5.3 : pont programmé et rappels (jamais de changement automatique) ---------- */
  var RAPPEL_MAX_MS = 12 * 60 * MIN, RAVITO_FENETRE = 60; // un rappel de pont reste 12 h ; un ravitaillement 60 min
  function plans() { var d = PL.etat.data; if (!Array.isArray(d.deckPlans)) d.deckPlans = []; return d.deckPlans; }
  function planParId(id) { return plans().filter(function (p) { return p.id === id; })[0] || null; }
  function memoriserPont(libelle) { var m = memoriser(libelle, []); m.plans = JSON.parse(JSON.stringify(plans())); return m; }
  function libPlan(p, off) {
    return 'Pont ' + p.deck + ' prévu ' + T.hm(ms(p.start), off) + (off ? ' (' + T.hm(ms(p.start), 0) + 'Z)' : '') + (p.end ? ' → ' + T.hm(ms(p.end), off) : '');
  }
  function plageOk(o) {
    if (o.deck !== 'vert' && o.deck !== 'rouge') return 'choisir vert ou rouge';
    if (!(o.start > 0)) return 'heure de début ?';
    if (o.end != null && (!(o.end > o.start) || o.end - o.start > 1440 * MIN)) return 'la fin doit être après le début (24 h au plus)';
    return null;
  }
  function programmerPont(o) {
    if (!peutEcrire()) return null;
    var err = plageOk(o); if (err) { PL.ui && PL.ui.toast('Pont programmé : ' + err + '.', true); return null; }
    if (plans().length >= 200) { PL.ui && PL.ui.toast('200 programmations au plus : supprimez les anciennes.', true); return null; }
    var off = PL.etat.data.settings.offsetMin, now = Date.now();
    var mem = memoriserPont('pont ' + o.deck + ' programmé');
    var p = { id: uid('p'), deck: o.deck, start: iso(Math.round(o.start / MIN) * MIN), end: o.end != null ? iso(Math.round(o.end / MIN) * MIN) : null, statut: 'prevu', statutFin: o.end != null ? 'prevu' : null, createdAt: iso(now) };
    plans().push(p); plans().sort(function (a, b) { return ms(a.start) - ms(b.start); });
    mem.logId = ajouterLog({ kind: 'pontprevu', text: 'Programmé : ' + libPlan(p, off) + ' (prévu, rien ne change avant confirmation)' }, true).id;
    commit(); return p;
  }
  function modifierPlan(id, o) {
    if (!peutEcrire()) return null;
    var p = planParId(id); if (!p) return null;
    var err = plageOk(o); if (err) { PL.ui && PL.ui.toast('Pont programmé : ' + err + '.', true); return null; }
    var off = PL.etat.data.settings.offsetMin, avant = libPlan(p, off);
    var mem = memoriserPont('modification du pont programmé');
    var ns = iso(Math.round(o.start / MIN) * MIN), ne = o.end != null ? iso(Math.round(o.end / MIN) * MIN) : null;
    if (ns !== p.start || o.deck !== p.deck) p.statut = 'prevu';
    if (ne !== p.end) p.statutFin = ne ? 'prevu' : null;
    p.deck = o.deck; p.start = ns; p.end = ne;
    plans().sort(function (a, b) { return ms(a.start) - ms(b.start); });
    mem.logId = ajouterLog({ kind: 'pontprevu', text: 'Programmation modifiée : ' + avant + ' ⇒ ' + libPlan(p, off) + ' (prévu)' }, true).id;
    commit(); return p;
  }
  function supprimerPlan(id) {
    if (!peutEcrire()) return null;
    var p = planParId(id); if (!p) return null;
    var mem = memoriserPont('suppression du pont programmé');
    PL.etat.data.deckPlans = plans().filter(function (x) { return x.id !== id; });
    mem.logId = ajouterLog({ kind: 'pontprevu', text: 'Programmation supprimée : ' + libPlan(p, PL.etat.data.settings.offsetMin) }, true).id;
    commit(); return p;
  }
  // Confirmer = noter le VRAI changement de pont, à l'heure réelle (comme le bouton PONT). Pas dans « Annuler » : c'est une ligne de main courante.
  function confirmerPlan(id, phase) {
    var p = planParId(id); if (!p || !peutEcrire()) return null;
    var off = PL.etat.data.settings.offsetMin, fin = phase === 'fin', deck = fin ? (p.deck === 'vert' ? 'rouge' : 'vert') : p.deck;
    var av = [p.statut, p.statutFin];
    if (fin) p.statutFin = 'fait'; else p.statut = 'fait';
    var l = saisir({ kind: 'deck', deck: deck, text: 'Pont ' + deck + ' (' + (fin ? 'fin du pont ' + p.deck + ' prévue ' + T.hm(ms(p.end), off) : 'prévu ' + T.hm(ms(p.start), off)) + ', confirmé)' });
    if (!l) { p.statut = av[0]; p.statutFin = av[1]; }
    return l;
  }
  function ignorerPlan(id, phase) {
    var p = planParId(id); if (!p || !peutEcrire()) return null;
    var off = PL.etat.data.settings.offsetMin, fin = phase === 'fin';
    var mem = memoriserPont('rappel de pont ignoré');
    if (fin) p.statutFin = 'ignore'; else { p.statut = 'ignore'; if (p.end) p.statutFin = 'ignore'; }
    mem.logId = ajouterLog({ kind: 'pontprevu', text: (fin ? 'Fin du pont ' + p.deck + ' prévue ' + T.hm(ms(p.end), off) : libPlan(p, off)) + ' : rappel ignoré, pont inchangé' }, true).id;
    commit(); return p;
  }
  function rappelsPont(now) {
    var out = [];
    plans().forEach(function (p) {
      var a = ms(p.start);
      if (p.statut === 'prevu' && now >= a && now - a <= RAPPEL_MAX_MS) out.push({ plan: p, phase: 'debut', at: a });
      else if (p.statut === 'fait' && p.end && p.statutFin === 'prevu' && now >= ms(p.end) && now - ms(p.end) <= RAPPEL_MAX_MS) out.push({ plan: p, phase: 'fin', at: ms(p.end) });
    });
    return out;
  }
  // ravitaillements programmés (séquence « Ravitaillement » d'un vol) dont l'heure est arrivée
  function rappelsRavito(now) {
    var out = [];
    PL.etat.data.flights.forEach(function (f) {
      var st = statut(f); if (st === 'supprime' || st === 'annule' || st === 'termine') return;
      (f.sequences || []).forEach(function (s) {
        var a = ms(s.start);
        if (s.kind === 'ravito' && !s.fait && now >= a && now - a <= RAVITO_FENETRE * MIN) out.push({ vol: f, seq: s, at: a });
      });
    });
    return out;
  }
  function seqDuVol(fid, sid) { var f = volParId(fid); return f ? (f.sequences || []).filter(function (s) { return s.id === sid; })[0] || null : null; }
  function traiterRavito(fid, sid, fait) {
    if (!peutEcrire()) return null;
    var f = volParId(fid), s = seqDuVol(fid, sid); if (!f || !s) return null;
    var off = PL.etat.data.settings.offsetMin;
    var mem = memoriser(fait ? 'ravitaillement confirmé' : 'rappel de ravitaillement ignoré', [fid]);
    s.fait = fait ? 'fait' : 'ignore'; f.updatedAt = iso(Date.now());
    mem.logId = ajouterLog({ kind: 'seq', flightId: fid, text: fait ? 'Ravitaillement commencé (prévu ' + T.hm(ms(s.start), off) + ', ' + T.fmtDuree(s.dur) + ')' : 'Ravitaillement prévu ' + T.hm(ms(s.start), off) + ' : rappel ignoré' }, true).id;
    commit(); return s;
  }
  PL.etat = {
    data: etatVide(), TYPES: TYPES, TYPES_NOMS: TYPES_NOMS, SEQ_TYPES: SEQ_TYPES, LOG_TYPES: LOG_TYPES, STATUT_NOMS: STATUT_NOMS,
    esc: esc, ms: ms, iso: iso, uid: uid, etatVide: etatVide, normaliser: normaliser,
    decollage: decollage, finAuto: finAuto, h30At: h30At, H30_MIN: H30_MIN, seqFin: seqFin, appontagePrevu: appontagePrevu,
    statut: statut, etendue: etendue, volParId: volParId, volsVisibles: volsVisibles, etatPont: etatPont,
    commit: commit, ajouterLog: ajouterLog, saisir: saisir, enregistrerVol: enregistrerVol, supprimerVol: supprimerVol,
    restaurerVol: restaurerVol, clore: clore, annulerVol: annulerVol, copieVol: copieVol, peutEcrire: peutEcrire,
    annuler: annuler, prochaineAnnulation: prochaineAnnulation, viderPile: viderPile, memoriser: memoriser, ajouterAvant: ajouterAvant,
    ajouterSequence: ajouterSequence, eta: eta, baseEta: baseEta, opsNormal: opsNormal, dernierContact: dernierContact, opsEnRetard: opsEnRetard, radioOk: radioOk, nomSeq: nomSeq,
    planParId: planParId, programmerPont: programmerPont, modifierPlan: modifierPlan, supprimerPlan: supprimerPlan, confirmerPlan: confirmerPlan, ignorerPlan: ignorerPlan, rappelsPont: rappelsPont, rappelsRavito: rappelsRavito, traiterRavito: traiterRavito, libPlan: libPlan, plageOk: plageOk,
    cloreAuto: cloreAuto, controleAction: controleAction, ligneParId: ligneParId, corrigeable: corrigeable, simulerCorrection: simulerCorrection, corrigerAction: corrigerAction, redecoller: redecoller, controleAutonomie: controleAutonomie, AUTO_SEUIL: AUTO_SEUIL, AUTO_MIN: AUTO_MIN, AUTO_MAX: AUTO_MAX, VERSION: '5.5'
  };
})(window.PL);
