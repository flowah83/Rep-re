/* Pont·Line — vols.js : cartes de vol et fiche vol (ajout, modification, suppression, duplication). */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, esc = E.esc;
  var $ = function (id) { return document.getElementById(id); };
  var edit = { id: null, seqs: [], jourTouche: false, base: null };

  /* ---------- cartes ---------- */
  // V3 (P3-2) : « J+1 » / « J-1 » à côté d'une heure qui n'est pas aujourd'hui (heure bord)
  function jourCourt(ms, now, off) { var j = T.jourRelatif(ms, now, off); return j ? ' <small class="jr">J' + (j > 0 ? '+' : '') + j + '</small>' : ''; }
  // V4 (P2-2) : heure Z en petit sous l'heure bord
  function zz(ms) { return ' <small class="zh">' + T.z(ms) + '</small>'; }
  // V4 (P2-10) : actions directes selon le statut
  function actions(f, st) {
    var b = function (k, lib, t) { return '<button class="btn petit act" data-act="' + k + '" data-vol="' + esc(f.id) + '" title="' + esc(t) + '">' + lib + '</button>'; };
    if (st === 'prevu') return b('dec', 'Décollage', 'Décollage de ' + f.callsign + ' maintenant (ou à l\'heure du champ « Heure de l\'action »)');
    if (st === 'envol') return b('app', 'Appontage', 'Appontage de ' + f.callsign) + b('fuel', 'Carburant…', 'Autonomie restante de ' + f.callsign);
    if (st === 'pose') return b('dec', 'Redécollage', 'Nouvelle rotation de ' + f.callsign);
    return '';
  }
  function renderCartes(now, alertes) {
    var d = PL.etat.data, off = d.settings.offsetMin;
    var niv = {};
    alertes.forEach(function (a) { if (a.vol && !niv[a.vol]) niv[a.vol] = a.niveau; });
    var h = '';
    E.volsVisibles(d.settings.showDone).forEach(function (f) {
      var st = E.statut(f), dec = E.decollage(f), fin = E.finAuto(f), app = E.appontagePrevu(f);
      var reste = st === 'envol' ? Math.round((fin - now) / MIN) : null;
      var conso = st === 'envol' ? Math.min(1, Math.max(0, (now - dec) / (fin - dec))) : (st === 'prevu' ? 0 : 1);
      var n = niv[f.id] === 'danger' ? 'danger' : (niv[f.id] === 'warn' ? 'warn' : '');
      var cf = PL.conflits.pourVol(PL.conflitsCourants || [], f.id);
      h += '<div class="vcarte' + (n ? ' alerte-' + n : '') + '" data-vol="' + esc(f.id) + '" tabindex="0" role="group" aria-label="' + esc(f.callsign + ', ' + E.STATUT_NOMS[st] + ', fin d\'autonomie ' + T.hm(fin, off) + (n === 'danger' ? ', alerte urgente' : n === 'warn' ? ', alerte' : '') + ' — Entrée pour ouvrir la fiche') + '">' +
        '<h3>' + esc(f.callsign) + (f.rotation > 1 ? ' <small class="rot">rotation ' + esc(f.rotation) + '</small>' : '') + '</h3><div class="ty">' + esc(f.type) + (f.crew ? ' · ' + esc(f.crew) : '') + ' · ' + esc(f.pax || 0) + ' pax' + (f.mission ? ' · ' + esc(f.mission) : '') + '</div>' +
        '<span class="pill ' + st + '">' + E.STATUT_NOMS[st] + '</span><div class="kv">' +
        '<div><i>' + (f.takeoffActual ? 'Décollage réel' : 'Décollage prévu') + '</i><b>' + T.hm(dec, off) + jourCourt(dec, now, off) + zz(dec) + '</b></div>' +
        '<div><i>' + (f.landingActual ? 'Appontage réel' : 'Appontage prévu') + '</i><b>' + (f.landingActual ? T.hm(Date.parse(f.landingActual), off) + zz(Date.parse(f.landingActual)) : (app ? T.hm(app, off) + zz(app) : '—')) + '</b></div>' +
        '<div><i>Fin d\'autonomie' + (f.fuel ? ' (recalée)' : '') + '</i><b>' + T.hm(fin, off) + jourCourt(fin, now, off) + zz(fin) + '</b></div>' +
        '<div><i>' + (st === 'envol' ? 'Reste' : 'Autonomie') + '</i><b>' + (st === 'envol' ? T.fmtDuree(reste) : T.fmtDuree(f.enduranceMin)) + '</b></div>' +
        (st === 'envol' || st === 'prevu' ? '<div><i>H-30</i><b>' + T.hm(E.h30At(f), off) + zz(E.h30At(f)) + '</b></div>' : '') +
        '</div><div class="jauge ' + n + '"><div style="width:' + (conso * 100) + '%"></div></div>' +
        (cf.length ? '<div class="conf-carte">⚠ ' + esc(cf[0].texte) + (cf.length > 1 ? ' (+' + (cf.length - 1) + ')' : '') + '</div>' : '') +
        (actions(f, st) ? '<div class="acts">' + actions(f, st) + '</div>' : '') + '</div>';
    });
    PL.ui.poser($('cartes'), h);
  }

  /* ---------- fiche vol ---------- */
  function optionsJours(refMs, extra) {
    var off = PL.etat.data.settings.offsetMin, h = '', vals = [-1, 0, 1];
    if (extra != null && vals.indexOf(extra) < 0) vals.push(extra);
    vals.sort(function (a, b) { return a - b; });
    vals.forEach(function (j) {
      var nom = j === 0 ? 'aujourd\'hui' : j === -1 ? 'hier' : j === 1 ? 'demain' : (j > 0 ? 'J+' + j : 'J' + j);
      h += '<option value="' + j + '">' + nom + ' (' + T.dateBord(refMs + j * 1440 * MIN, off) + ')</option>';
    });
    $('fvDecJ').innerHTML = h;
  }

  function ouvrir(id, copie) {
    var d = PL.etat.data, off = d.settings.offsetMin, now = Date.now();
    var f = id ? E.volParId(id) : copie || null;
    edit.id = id || null; edit.jourTouche = !!f; edit.base = now;
    $('fvType').innerHTML = E.TYPES.map(function (t) { return '<option value="' + t + '">' + t + ' — ' + E.TYPES_NOMS[t] + '</option>'; }).join('');
    $('listeMissions').innerHTML = (d.settings.missions || []).map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
    $('fvTitre').textContent = id ? 'Modifier le vol · ' + f.callsign : (copie ? 'Nouveau vol (copie de ' + copie.callsign + ')' : 'Nouveau vol');
    ['fvDupliquer', 'fvClore', 'fvSupprimer'].forEach(function (b) { $(b).classList.toggle('hidden', !id); });
    $('fvAnnulerVol').classList.toggle('hidden', !id || !!(f && f.takeoffActual));
    $('fvAnnulerVol').textContent = f && f.cancelled ? 'Réactiver le vol' : 'Vol annulé…';
    $('fvClore').classList.toggle('hidden', !id || !!(f && f.cancelled));
    $('fvErreurs').textContent = '';
    var v = function (x) { return x == null ? '' : String(x); };
    var dur = function (m) { return m == null || m === '' ? '' : Math.floor(m / 60) + 'h' + T.pad(m % 60); };
    $('fvIndicatif').value = f ? f.callsign : '';
    $('fvType').value = f ? f.type : 'PTR';
    $('fvEquipage').value = f ? v(f.crew) : '';
    $('fvPax').value = f ? v(f.pax) : '';
    $('fvOps').value = f && f.opsNormalMin != null ? String(f.opsNormalMin) : ''; $('fvOps').placeholder = String(PL.etat.data.settings.opsNormalMin); // V5
    $('fvMission').value = f ? v(f.mission) : '';
    $('fvNotes').value = f ? v(f.notes) : '';
    $('fvAuto').value = f ? dur(f.enduranceMin) : '';
    var tp = f ? Date.parse(f.takeoffPlanned) : null;
    optionsJours(now, tp != null ? T.jourRelatif(tp, now, off) : null);
    $('fvDecH').value = tp != null ? T.hm(tp, off) : '';
    $('fvDecJ').value = tp != null ? String(T.jourRelatif(tp, now, off)) : '0';
    $('fvAppH').value = f && f.landingPlanned ? T.hm(Date.parse(f.landingPlanned), off) : '';
    $('fvDecReel').value = f && f.takeoffActual ? T.hm(Date.parse(f.takeoffActual), off) : '';
    $('fvAppReel').value = f && f.landingActual ? T.hm(Date.parse(f.landingActual), off) : '';
    if (f && f.closed) $('fvClore').textContent = 'Rouvrir le vol'; else $('fvClore').textContent = 'Clore le vol';
    edit.seqs = (f && f.sequences ? f.sequences : []).map(function (s) {
      return { id: s.id, kind: s.kind, label: s.label || '', hm: T.hm(Date.parse(s.start), off), dur: s.dur, fait: s.fait, start0: s.start };
    });
    renderSeqs();
    $('modalVol').classList.remove('hidden');
    majCalc();
    edit.signature = signature(); edit.copie = !!copie && !id;
    setTimeout(function () { $('fvIndicatif').focus(); }, 30);
  }
  function fermer() { $('modalVol').classList.add('hidden'); }
  // V3 (P2-3) : contenu de la fiche, pour savoir si elle a été modifiée
  function signature() {
    var ch = $('modalVol').querySelectorAll('input, select, textarea'), v = [];
    for (var i = 0; i < ch.length; i++) v.push(ch[i].value);
    return JSON.stringify(v) + JSON.stringify(edit.seqs);
  }
  function modifiee() { return !$('modalVol').classList.contains('hidden') && (edit.copie || signature() !== edit.signature); }
  // Échap : ferme directement une fiche intacte, demande confirmation sinon
  function fermerSiPossible() {
    if (!modifiee()) { fermer(); return; }
    PL.ui.confirmer('Fermer sans enregistrer ?', 'Les informations saisies dans la fiche « ' + esc($('fvIndicatif').value.trim() || 'nouveau vol') + ' » seront perdues.', fermer, 'Fermer sans enregistrer', 'Continuer la saisie');
  }

  function renderSeqs() {
    var opts = E.SEQ_TYPES.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('');
    var h = edit.seqs.length ? '<div class="seqrow tete"><span>Type</span><span>Libellé</span><span>Début (bord)</span><span>Durée (min)</span><span></span></div>' : '<div class="info-ligne">Aucune séquence : la timeline affichera un bloc « Vol » du décollage à l\'appontage prévu.</div>';
    edit.seqs.forEach(function (s, i) {
      h += '<div class="seqrow" data-i="' + i + '"><select class="champ" data-f="kind" aria-label="Séquence ' + (i + 1) + ' : type">' + opts + '</select>' +
        '<input class="champ" data-f="label" value="' + esc(s.label) + '" placeholder="facultatif" aria-label="Séquence ' + (i + 1) + ' : libellé">' +
        '<input class="champ mono" data-f="hm" value="' + esc(s.hm) + '" placeholder="HH:MM" inputmode="numeric" aria-label="Séquence ' + (i + 1) + ' : début HH:MM">' +
        '<input class="champ mono" data-f="dur" value="' + esc(s.dur == null ? '' : s.dur) + '" inputmode="numeric" aria-label="Séquence ' + (i + 1) + ' : durée en minutes">' +
        '<button class="x" data-suppr="' + i + '" title="Retirer" aria-label="Retirer la séquence ' + (i + 1) + '">✕</button></div>';
    });
    $('fvSeqs').innerHTML = h;
    var rows = $('fvSeqs').querySelectorAll('.seqrow[data-i]');
    for (var i = 0; i < rows.length; i++) rows[i].querySelector('select').value = edit.seqs[i].kind;
  }

  // Lit le formulaire -> { donnees, erreurs }
  function lire() {
    var d = PL.etat.data, off = d.settings.offsetMin, now = edit.base || Date.now(), err = [];
    var hb = function (v) { return T.lireHeure(v, off); }; // V4 (P2-2) : heure bord, ou Z avec le suffixe Z
    var cs = $('fvIndicatif').value.trim().toUpperCase();
    if (!cs) err.push('indicatif manquant');
    var decHM = hb($('fvDecH').value);
    if (decHM == null) err.push('heure de décollage prévue invalide (HH:MM)');
    // V3 : durée stricte + contrôle de vraisemblance par type (P0-1)
    var an = T.analyseDuree($('fvAuto').value), auto = an.min, conf = [];
    if (auto == null) err.push('autonomie : ' + an.err);
    else { var ca = E.controleAutonomie($('fvType').value, auto); if (ca.err) err.push(ca.err); else if (ca.conf) conf.push(ca.conf); }
    var pax = $('fvPax').value.trim();
    if (pax && (!/^\d{1,2}$/.test(pax) || +pax > 60)) err.push('pax : nombre entier de 0 à 60');
    if (cs.length > 20) err.push('indicatif : 20 caractères au plus');
    var ops = $('fvOps').value.trim(), opsN = null; // V5 : rappel ops normal (vide = réglage général)
    if (ops) { opsN = /^\d{1,3}$/.test(ops) ? parseInt(ops, 10) : NaN; if (!(opsN === 0 || (opsN >= 5 && opsN <= 240))) err.push('rappel ops normal : vide, 0 (pas de rappel) ou 5 à 240 min'); }
    var dec = decHM != null ? T.versMs(decHM, parseInt($('fvDecJ').value, 10) || 0, now, off) : null;
    var decReel = null, appReel = null, app = null;
    if ($('fvDecReel').value.trim()) {
      var h1 = hb($('fvDecReel').value);
      if (h1 == null) err.push('décollage réel invalide'); else if (dec != null) decReel = T.plusProche(h1, dec, off, 720);
    }
    var refDec = decReel != null ? decReel : dec;
    if ($('fvAppH').value.trim()) {
      var h2 = hb($('fvAppH').value);
      if (h2 == null) err.push('appontage prévu invalide'); else if (refDec != null) app = T.plusProche(h2, refDec, off, 0);
    }
    if ($('fvAppReel').value.trim()) {
      var h3 = hb($('fvAppReel').value);
      if (h3 == null) err.push('appontage réel invalide');
      else if (decReel == null) err.push('appontage réel sans décollage réel');
      else appReel = T.plusProche(h3, decReel, off, 0);
    }
    var seqs = [];
    edit.seqs.forEach(function (s, i) {
      var hmv = T.parseHM(s.hm), du = parseInt(s.dur, 10);
      if (hmv == null || !(du > 0)) { err.push('séquence ' + (i + 1) + ' : début HH:MM et durée en minutes'); return; }
      if (refDec == null) return;
      var ns = { id: s.id || E.uid('s'), kind: s.kind, label: s.label.trim(), start: E.iso(T.plusProche(hmv, dec != null ? dec : refDec, off, 180)), dur: du };
      if (s.fait && s.start0 === ns.start && s.kind === 'ravito') ns.fait = s.fait; // V5.3 : rappel déjà traité, sauf si l'heure a changé
      seqs.push(ns);
    });
    seqs.sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
    var donnees = {
      callsign: cs, type: $('fvType').value, crew: $('fvEquipage').value.trim().toUpperCase(), pax: pax ? parseInt(pax, 10) : 0,
      mission: $('fvMission').value.trim(), notes: $('fvNotes').value.trim(),
      takeoffPlanned: dec != null ? E.iso(dec) : null, landingPlanned: app != null ? E.iso(app) : null,
      enduranceMin: auto,
      takeoffActual: decReel != null ? E.iso(decReel) : null, landingActual: appReel != null ? E.iso(appReel) : null,
      sequences: seqs, opsNormalMin: opsN
    };
    return { donnees: donnees, erreurs: err, confirmations: conf };
  }

  function majCalc() {
    var r = lire(), off = PL.etat.data.settings.offsetMin, x = r.donnees;
    // V4 (P2-2, P3-2) : interprétation de l'heure de décollage sous le champ (« 7 » = 07:00 ; « 0430Z » = heure bord)
    var vd = $('fvDecH').value.trim(), ad = $('fvDecAide');
    if (!vd) { ad.className = 'aide'; ad.textContent = ''; }
    else if (x.takeoffPlanned == null) { ad.className = 'aide err'; ad.textContent = 'heure invalide : HH:MM bord, ou 0430Z'; }
    else { var td = Date.parse(x.takeoffPlanned); ad.className = 'aide lu'; ad.textContent = '= ' + T.hm(td, off) + ' bord (' + T.z(td) + ')'; }
    // interprétation de l'autonomie, en gros, sous le champ
    var va = $('fvAuto').value.trim(), an = T.analyseDuree(va), aide = $('fvAutoAide');
    if (!va) { aide.className = 'aide'; aide.textContent = 'Durée depuis le décollage (ex. 1h50)'; }
    else if (an.min == null) { aide.className = 'aide err'; aide.textContent = an.err; }
    else { var ca = E.controleAutonomie($('fvType').value, an.min); aide.className = 'aide lu' + (ca.err ? ' err' : ca.conf ? ' attention' : ''); aide.textContent = '= ' + T.fmtDuree(an.min) + (ca.err ? ' — ' + ca.err : ca.conf ? ' — inhabituel, confirmation demandée' : ''); }
    if (x.takeoffPlanned == null || x.enduranceMin == null) { $('fvCalc').innerHTML = 'Renseignez le décollage et l\'autonomie pour voir la fin d\'autonomie.'; return; }
    var f = { takeoffPlanned: x.takeoffPlanned, takeoffActual: x.takeoffActual, enduranceMin: x.enduranceMin, landingPlanned: x.landingPlanned, sequences: x.sequences };
    var ancien = edit.id ? E.volParId(edit.id) : null;
    if (ancien && ancien.fuel && (!x.takeoffActual || Date.parse(ancien.fuel.at) >= Date.parse(x.takeoffActual))) f.fuel = ancien.fuel;
    var dec = E.decollage(f), fin = E.finAuto(f), app = E.appontagePrevu(f), h30 = E.h30At(f);
    var jr = T.jourRelatif(dec, Date.now(), off), nomJ = jr === 0 ? 'aujourd\'hui' : jr === 1 ? 'DEMAIN' : jr === -1 ? 'HIER' : (jr > 0 ? 'J+' + jr : 'J' + jr);
    var h = 'Décollage ' + (x.takeoffActual ? 'réel ' : 'prévu ') + '<b>' + nomJ + ' ' + T.dateBord(dec, off) + ' ' + T.hm(dec, off) + '</b> bord (' + T.z(dec) + ')' +
      ' · Fin d\'autonomie' + (f.fuel ? ' (recalée par le carburant)' : '') + ' <b class="r">' + T.hm(fin, off) + ' bord (' + T.z(fin) + ')</b>';
    h += ' · <span class="h30">H-30 <b class="o">' + T.hm(h30, off) + ' bord (' + T.z(h30) + ')</b></span>';
    if (!x.takeoffActual && !edit.id && dec < Date.now() - 30 * MIN) h += '<div class="conf-fiche">⚠ Décollage prévu dans le passé (il y a ' + T.fmtDuree(Math.round((Date.now() - dec) / MIN)) + ') : vérifiez le jour.</div>';
    if (app) {
      var m = Math.round((fin - app) / MIN);
      h += '<br>Appontage prévu <b>' + T.hm(app, off) + '</b> · marge <b class="' + (m < 0 ? 'r' : m <= 15 ? 'o' : 'v') + '">' + T.fmtDuree(m) + '</b>';
    }
    // conflits que provoquerait ce vol (avertissement, n'empêche pas d'enregistrer)
    var essai = JSON.parse(JSON.stringify(PL.etat.data)), idEssai = edit.id || '__nouveau';
    var copie = { id: idEssai, callsign: x.callsign || '(nouveau)', type: x.type, takeoffPlanned: x.takeoffPlanned, takeoffActual: x.takeoffActual, landingActual: x.landingActual,
      landingPlanned: x.landingPlanned, enduranceMin: x.enduranceMin, sequences: x.sequences, fuel: f.fuel || null,
      closed: ancien ? ancien.closed : false, deleted: false };
    essai.flights = essai.flights.filter(function (g) { return g.id !== idEssai; }).concat([copie]);
    var cf = PL.conflits.pourVol(PL.conflits.calculer(essai, Date.now()), idEssai);
    if (cf.length) h += '<div class="conf-fiche">⚠ ' + cf.map(function (c) { return esc(c.texte); }).join('<br>⚠ ') + '<br><small>Avertissement seulement : vous pouvez enregistrer quand même.</small></div>';
    $('fvCalc').innerHTML = h;
  }

  function enregistrer() {
    var r = lire();
    if (r.erreurs.length) { $('fvErreurs').textContent = 'À corriger : ' + r.erreurs.join(' ; '); return; }
    var go = function () {
      var f = E.enregistrerVol(r.donnees, edit.id);
      if (f) { fermer(); PL.ui.toast('Vol ' + f.callsign + ' enregistré.'); }
    };
    if (r.confirmations.length) {
      var x = r.donnees, off = PL.etat.data.settings.offsetMin, dec = Date.parse(x.takeoffActual || x.takeoffPlanned), fin = dec + x.enduranceMin * MIN;
      PL.ui.confirmer('Autonomie inhabituelle', E.esc(r.confirmations.join(' ')) + '<br>Autonomie saisie : <b>' + T.fmtDuree(x.enduranceMin) + '</b> · fin d\'autonomie <b>' + T.hm(fin, off) + '</b> · H-30 <b>' + T.hm(fin - 30 * MIN, off) + '</b><br>Est-ce bien la bonne durée ?', go, 'Oui, ' + T.fmtDuree(x.enduranceMin));
      return;
    }
    go();
  }

  function modele(type) {
    var off = PL.etat.data.settings.offsetMin, decHM = T.lireHeure($('fvDecH').value, off);
    if (decHM == null) { $('fvErreurs').textContent = 'Saisissez d\'abord l\'heure de décollage prévue.'; return; }
    var auto = T.parseDuree($('fvAuto').value) || 90;
    var hm = function (m) { m = ((m % 1440) + 1440) % 1440; return T.pad(Math.floor(m / 60)) + ':' + T.pad(m % 60); };
    if (type === 'pax') {
      edit.seqs.push({ kind: 'mer', label: 'Mise en route', hm: hm(decHM - 15), dur: 15 });
      edit.seqs.push({ kind: 'pax', label: 'Embarquement pax', hm: hm(decHM - 10), dur: 10 });
      edit.seqs.push({ kind: 'vol', label: 'Rotation pax', hm: hm(decHM), dur: Math.min(60, auto - 30 > 15 ? auto - 30 : 15) });
    } else {
      var t = decHM + Math.max(30, Math.floor(auto / 2));
      edit.seqs.push({ kind: 'vol', label: 'Vol', hm: hm(decHM), dur: t - decHM });
      edit.seqs.push({ kind: 'ravito', label: 'Ravito rotors tournants', hm: hm(t), dur: 15 });
      edit.seqs.push({ kind: 'vol', label: 'Vol (suite)', hm: hm(t + 15), dur: 60 });
    }
    renderSeqs(); majCalc();
  }

  function init() {
    $('btnVol').addEventListener('click', function () { if (E.peutEcrire()) ouvrir(null); });
    $('cartes').addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]'); if (a) { PL.journal.actionVol(a.getAttribute('data-vol'), a.getAttribute('data-act')); return; }
      var c = e.target.closest('[data-vol]'); if (c) ouvrir(c.getAttribute('data-vol'));
    });
    // V4 (audit V3b, P2-11) : carte atteinte au clavier (Tab) : Entrée ou Espace ouvre la fiche
    $('cartes').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('vcarte')) { e.preventDefault(); ouvrir(e.target.getAttribute('data-vol')); }
    });
    $('fvAnnuler').addEventListener('click', fermer);
    $('fvEnregistrer').addEventListener('click', enregistrer);
    $('modalVol').addEventListener('input', function (e) {
      var row = e.target.closest('.seqrow[data-i]');
      if (row) { edit.seqs[+row.getAttribute('data-i')][e.target.getAttribute('data-f')] = e.target.value; }
      if (e.target.id === 'fvDecJ') edit.jourTouche = true;
      if (e.target.id === 'fvDecH' && !edit.jourTouche && !edit.id) {
        var off = PL.etat.data.settings.offsetMin, h = T.lireHeure(e.target.value, off), now = edit.base;
        if (h != null) $('fvDecJ').value = String(T.jourRelatif(T.plusProche(h, now, off, 180), now, off)); // V3 : au plus 3 h dans le passé
      }
      majCalc();
    });
    $('modalVol').addEventListener('change', function (e) {
      var row = e.target.closest('.seqrow[data-i]');
      if (row) edit.seqs[+row.getAttribute('data-i')][e.target.getAttribute('data-f')] = e.target.value;
      if (e.target.id === 'fvDecJ') edit.jourTouche = true;
      majCalc();
    });
    $('fvSeqs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-suppr]'); if (!b) return;
      edit.seqs.splice(+b.getAttribute('data-suppr'), 1); renderSeqs(); majCalc();
    });
    $('fvAjSeq').addEventListener('click', function () {
      var last = edit.seqs[edit.seqs.length - 1], hmv = '';
      if (last && T.parseHM(last.hm) != null) { var m = (T.parseHM(last.hm) + (parseInt(last.dur, 10) || 0)) % 1440; hmv = T.pad(Math.floor(m / 60)) + ':' + T.pad(m % 60); }
      else { var hd = T.lireHeure($('fvDecH').value, PL.etat.data.settings.offsetMin); if (hd != null) hmv = T.pad(Math.floor(hd / 60)) + ':' + T.pad(hd % 60); }
      edit.seqs.push({ kind: 'vol', label: '', hm: hmv, dur: 30 }); renderSeqs(); majCalc();
    });
    $('fvAjRavito').addEventListener('click', function () { // V5.3 : ravitaillement programmé en un clic (heure modifiable)
      var last = edit.seqs[edit.seqs.length - 1], hmv = '', o = PL.etat.data.settings.offsetMin;
      if (last && T.parseHM(last.hm) != null) { var m = (T.parseHM(last.hm) + (parseInt(last.dur, 10) || 0)) % 1440; hmv = T.pad(Math.floor(m / 60)) + ':' + T.pad(m % 60); }
      else { var hd = T.lireHeure($('fvDecH').value, o); if (hd != null) hmv = T.pad(Math.floor(hd / 60)) + ':' + T.pad(hd % 60); }
      edit.seqs.push({ kind: 'ravito', label: 'Ravitaillement', hm: hmv, dur: 15 }); renderSeqs(); majCalc();
      setTimeout(function () { var x = $('fvSeqs').querySelectorAll('input[data-f="hm"]'); x = x[x.length - 1]; if (x) { x.focus(); x.select(); } }, 30);
    });
    $('fvModPax').addEventListener('click', function () { modele('pax'); });
    $('fvModRavito').addEventListener('click', function () { modele('ravito'); });
    $('fvSupprimer').addEventListener('click', function () {
      var f = E.volParId(edit.id); if (!f) return;
      var id = edit.id; // V4 (P3-6) : fenêtre maison
      PL.ui.confirmer('Supprimer le vol ' + f.callsign + ' ?', 'Il disparaît de l\'écran mais reste dans la main courante et les exports (restaurable dans Données). Pour un vol qui ne partira pas, préférez « Vol annulé… ».', function () {
        E.supprimerVol(id); fermer(); PL.ui.toast('Vol ' + f.callsign + ' supprimé.');
      }, 'Supprimer', 'Retour');
    });
    $('fvClore').addEventListener('click', function () {
      var f = E.volParId(edit.id); if (!f) return;
      E.clore(edit.id, !f.closed); fermer();
    });
    $('fvAnnulerVol').addEventListener('click', function () {
      var f = E.volParId(edit.id); if (!f) return;
      if (f.cancelled) { E.annulerVol(edit.id, false); fermer(); PL.ui.toast('Vol ' + f.callsign + ' réactivé.'); return; }
      annulerAvecMotif(edit.id, fermer);
    });
    $('fvDupliquer').addEventListener('click', function () {
      var c = E.copieVol(edit.id); if (!c) return;
      fermer(); ouvrir(null, c);
    });
  }

  // V4 (P2-3) : « Vol annulé » avec un motif facultatif (fenêtre maison)
  function annulerAvecMotif(id, apres) {
    var f = E.volParId(id); if (!f) return;
    var off = PL.etat.data.settings.offsetMin;
    PL.ui.confirmer('Vol annulé : ' + f.callsign, 'Décollage prévu à <b>' + T.hm(E.decollage(f), off) + '</b>. Le vol ne partira pas : ses alertes s\'arrêtent, il passe dans les vols terminés (statut « Annulé ») et c\'est écrit dans la main courante. Annulable.', function (motif) {
      if (E.annulerVol(id, true, (motif || '').trim())) { if (apres) apres(); PL.ui.toast('Vol ' + f.callsign + ' annulé.'); }
    }, 'Marquer annulé', 'Retour', { champ: { libelle: 'Motif (facultatif)', placeholder: 'ex. météo, mission annulée', max: 80, analyse: function () { return { ok: true }; } } });
  }

  PL.vols = { annulerAvecMotif: annulerAvecMotif, init: init, ouvrir: ouvrir, fermer: fermer, fermerSiPossible: fermerSiPossible, modifiee: modifiee, renderCartes: renderCartes, lire: lire };
})(window.PL);
