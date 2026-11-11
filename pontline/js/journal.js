/* Pont·Line — journal.js : main courante en ajout seul, boutons rapides, corrections. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, esc = E.esc;
  var $ = function (id) { return document.getElementById(id); };
  var attente = null; // { kind, correctsId? }

  var ATTENTES = {
    pax: 'Pax : nombre et détail (ex. « 4 pax débarqués »), puis Entrée',
    fuel: 'Carburant : AUTONOMIE RESTANTE en durée (ex. « 1h20 » ou « 80min », pas de kg), puis Entrée',
    incident: 'Incident : décrire, puis Entrée',
    correction: 'Correction : écrire le texte corrigé, puis Entrée'
  };

  function volChoisi() { return $('jVol').value || null; }
  // V4 (audit V3b, P1-2) : heure de l'action (vide = maintenant). Renvoie { at } (ms, ou null = maintenant) ou { err }.
  function heureAction() {
    var v = $('jHeure').value.trim(); if (!v) return { at: null };
    var off = PL.etat.data.settings.offsetMin, h = T.lireHeure(v, off);
    if (h == null) return { err: 'heure de l\'action invalide : HH:MM (ex. 10:02), ou 0702Z' };
    var t = T.plusProche(h, Date.now(), off, 180);
    if (t > Date.now() + 2 * T.MIN) return { err: 'heure de l\'action dans le futur (ou plus de 3 h avant) : ' + v };
    return { at: t };
  }
  function majHeureAide() {
    var a = heureAction(), off = PL.etat.data.settings.offsetMin, e = $('jHeureAide');
    if (!$('jHeure').value.trim()) { e.textContent = ''; e.className = 'aide'; return; }
    if (a.err) { e.textContent = a.err; e.className = 'aide err'; return; }
    e.textContent = '= ' + T.hm(a.at, off) + ' bord (' + T.z(a.at) + ')'; e.className = 'aide lu';
  }
  function suffixeHeure(at) { return at != null ? ' à ' + T.hm(at, PL.etat.data.settings.offsetMin) + ' (saisi à ' + T.hm(Date.now(), PL.etat.data.settings.offsetMin) + ')' : ''; }
  function apresAction() { $('jHeure').value = ''; majHeureAide(); $('jVol').value = ''; } // V4 (P2-10) : retour à « Aucun vol »
  // V4 (P2-10) : action lancée depuis une carte ou une ligne de la timeline
  function actionVol(id, k) {
    if (!E.peutEcrire()) return;
    majSelects(); $('jVol').value = id;
    if ($('jVol').value !== id) { PL.ui.toast('Ce vol n\'est plus dans la liste des vols actifs.', true); return; }
    rapide(k);
  }

  function majSelects() {
    var d = PL.etat.data, vols = E.volsVisibles(true);
    var cur = $('jVol').value, curF = $('jFiltre').value;
    var hv = '<option value="">— Aucun vol (note générale) —</option>' + vols.filter(function (f) { return E.statut(f) === 'annule' ? false : E.statut(f) !== 'termine' || (f.landingActual && !f.deleted && Date.now() - Date.parse(f.landingActual) < 120 * T.MIN && !PL.etat.data.flights.some(function (g) { return g.parentId === f.id && !g.deleted; })); }).map(function (f) {
      return '<option value="' + esc(f.id) + '">' + esc(f.callsign) + (f.rotation > 1 ? ' (rot. ' + f.rotation + ')' : '') + ' · ' + E.STATUT_NOMS[E.statut(f)] + '</option>';
    }).join('');
    if ($('jVol').getAttribute('data-h') !== hv) { $('jVol').innerHTML = hv; $('jVol').setAttribute('data-h', hv); }
    var tous = d.flights.slice().sort(function (a, b) { return E.decollage(a) - E.decollage(b); });
    var hf = '<option value="">Toutes les lignes</option><option value="__nonsys">Sans les lignes système</option>' + tous.map(function (f) {
      return '<option value="' + esc(f.id) + '">' + esc(f.callsign) + (f.rotation > 1 ? ' (rot. ' + f.rotation + ')' : '') + (f.deleted ? ' (supprimé)' : '') + '</option>';
    }).join('');
    if ($('jFiltre').getAttribute('data-h') !== hf) { $('jFiltre').innerHTML = hf; $('jFiltre').setAttribute('data-h', hf); }
    if (cur && E.volParId(cur)) $('jVol').value = cur;
    $('jFiltre').value = curF;
    if ($('jFiltre').value !== curF) $('jFiltre').value = '';
  }

  function render() {
    var d = PL.etat.data, off = d.settings.offsetMin;
    majSelects();
    var filtre = $('jFiltre').value, q = $('jRecherche').value.trim().toLowerCase();
    var corrigeePar = {};
    d.log.forEach(function (l) { if (l.correctsId) corrigeePar[l.correctsId] = l.id; });
    var h = '', n = 0;
    for (var i = d.log.length - 1; i >= 0; i--) {
      var l = d.log[i];
      if (filtre === '__nonsys' && l.kind === 'system') continue;
      if (filtre && filtre !== '__nonsys' && l.flightId !== filtre) continue;
      if (q && (l.text + ' ' + (l.callsign || '')).toLowerCase().indexOf(q) < 0) continue;
      n++;
      if (n > 400 && !q && !filtre) { h += '<div class="info-ligne">… lignes plus anciennes : utilisez la recherche ou l\'export CSV.</div>'; break; }
      var m = Date.parse(l.at), o = typeof l.off === 'number' ? l.off : off; // V3 : heure bord d'origine
      h += '<div class="ent k-' + esc(l.kind) + (l.kind === 'system' ? ' system' : '') + (corrigeePar[l.id] ? ' corrigee' : '') + '" data-id="' + esc(l.id) + '">' +
        (l.kind !== 'system' && (!corrigeePar[l.id] || E.corrigeable(l)) ? '<button class="cor" data-cor="' + esc(l.id) + '" title="' + (E.corrigeable(l) ? 'Corriger l\'heure ou la valeur : le vol est recalé' : 'Corriger le texte') + '">Corriger</button>' : '') +
        '<span class="tm">' + T.hms(m, o) + '</span>' + (o !== off ? '<span class="fz" title="Fuseau du bord au moment de la saisie">' + T.offsetLabel(o) + '</span>' : '') + '<span class="z">' + T.hm(m, 0) + 'Z</span>' +
        (l.callsign ? '<span class="vol">' + esc(l.callsign) + '</span>' : '') +
        '<span class="k">#' + esc(l.id) + ' · ' + esc(E.LOG_TYPES[l.kind] || l.kind) + '</span>' +
        '<p>' + esc(l.text) + '</p>' +
        (l.correctsId ? '<div class="meta">↳ corrige la ligne #' + esc(l.correctsId) + '</div>' : '') +
        (corrigeePar[l.id] ? '<div class="meta">corrigée par la ligne #' + esc(corrigeePar[l.id]) + '</div>' : '') +
        '</div>';
    }
    PL.ui.poser($('jListe'), h || '<div class="info-ligne">Aucune ligne.</div>'); // V4 (P2-7) : contenu identique = rien ne bouge (sélection gardée)
    $('jCompte').textContent = d.log.length + ' lignes';
    var bs = document.querySelectorAll('#rapides button');
    for (var j = 0; j < bs.length; j++) bs[j].classList.toggle('actif', !!attente && bs[j].getAttribute('data-k') === attente.kind);
  }

  function setAttente(a) {
    attente = a;
    if (a) { $('jPending').textContent = ATTENTES[a.kind] + (a.kind === 'correction' ? ' (ligne #' + a.correctsId + ')' : '') + ' — Échap pour annuler'; $('jPending').classList.remove('hidden'); $('jTexte').focus(); }
    else { $('jPending').classList.add('hidden'); }
    render();
  }

  function nomVol(id) { var f = id ? E.volParId(id) : null; return f ? f.callsign : ''; }

  function rapide(k) {
    var txt = $('jTexte').value.trim(), vol = volChoisi(), l = null;
    if (k === 'dec' || k === 'app') {
      if (!vol) { PL.ui.toast('Choisissez d\'abord le vol dans la liste au-dessus des boutons.', true); $('jVol').focus(); return; }
      var ha = heureAction(); if (ha.err) { PL.ui.toast(ha.err, true); $('jHeure').focus(); return; }
      var ctl = E.controleAction(E.volParId(vol), k, ha.at);
      if (ctl.err) { PL.ui.toast(ctl.err, true); return; }
      if (ctl.redec) { proposerRedecollage(vol, txt, ha.at); return; }
      l = E.saisir({ kind: k, flightId: vol, at: ha.at, text: (k === 'dec' ? 'Décollage' : 'Appontage') + suffixeHeure(ha.at) + (txt ? ' — ' + txt : '') });
      if (l) apresAction();
    } else if (k === 'deck-vert' || k === 'deck-rouge') {
      var v = k === 'deck-vert' ? 'vert' : 'rouge';
      l = E.saisir({ kind: 'deck', deck: v, text: 'Pont ' + v + (txt ? ' — ' + txt : '') });
    } else if (k === 'radio') {
      var hr = heureAction(); if (hr.err) { PL.ui.toast(hr.err, true); return; }
      l = E.saisir({ kind: 'radio', flightId: vol, text: 'Contact radio' + suffixeHeure(hr.at) + (txt ? ' — ' + txt : '') });
    } else {
      if ((k === 'pax' || k === 'fuel') && !vol) { PL.ui.toast('Choisissez d\'abord le vol.', true); $('jVol').focus(); return; }
      if (k === 'fuel') { var cf = E.controleAction(E.volParId(vol), 'fuel'); if (cf.err) { PL.ui.toast(cf.err, true); return; } }
      setAttente(attente && attente.kind === k ? null : { kind: k });
      return;
    }
    if (l) { $('jTexte').value = ''; apresAction(); setAttente(null); }
  }

  // V3 (P2-10) : « Décollage » sur un vol posé -> nouvelle rotation, avec l'autonomie au redécollage (durée stricte)
  function proposerRedecollage(id, txt, at) {
    var f = E.volParId(id); if (!f) return;
    var off = PL.etat.data.settings.offsetMin;
    var html = '<b>' + esc(f.callsign) + '</b> (' + esc(f.type) + ') est posé depuis ' + T.hm(Date.parse(f.landingActual), off) + '.<br>Redécollage ' + (at != null ? 'à ' + T.hm(at, off) : 'maintenant') + ' : une nouvelle rotation est créée et la précédente est close.<br><small>Repris de la rotation précédente : équipage « ' + esc(f.crew || '—') + ' ». Pax de la nouvelle rotation : 0, à saisir dans la fiche (rotation précédente : ' + esc(f.pax || 0) + ' pax, comptés une seule fois au compte rendu).</small>';
    PL.ui.confirmer('Redécollage ?', html, function (v) {
      var an = T.analyseDuree(v); if (an.min == null) return;
      var n = E.redecoller(id, an.min, txt, at);
      if (n) { $('jTexte').value = ''; apresAction(); $('jVol').value = n.id; render(); PL.ui.toast(f.callsign + ' : redécollage enregistré (rotation ' + n.rotation + ').'); }
    }, 'Redécoller', 'Annuler', { champ: {
      libelle: 'Autonomie au redécollage (durée, ex. 1h30)', placeholder: '1h30',
      analyse: function (v) {
        if (!v.trim()) return { ok: false, aide: 'Saisir l\'autonomie en durée (ex. 1h30 ou 90min).' };
        var an = T.analyseDuree(v); if (an.min == null) return { ok: false, aide: an.err, cls: 'err' };
        var ca = E.controleAutonomie(f.type, an.min); if (ca.err) return { ok: false, aide: ca.err, cls: 'err' };
        var fin = (at != null ? at : Date.now()) + an.min * T.MIN;
        return { ok: true, cls: ca.conf ? 'lu attention' : 'lu', aide: '= ' + T.fmtDuree(an.min) + ' · fin d\'autonomie ' + T.hm(fin, off) + ' · H-30 ' + T.hm(fin - 30 * T.MIN, off) + (ca.conf ? ' — ' + ca.conf : ''),
          libOui: ca.conf ? 'Oui, ' + T.fmtDuree(an.min) + ' (inhabituel)' : 'Redécoller (' + T.fmtDuree(an.min) + ')' };
      } } });
  }

  // V4 (audit V3b, P1-2) : « Corriger » sur Décollage / Appontage / Carburant propose de recaler le vol
  function corriger(lid) {
    var l = E.ligneParId(lid), c = E.corrigeable(l);
    if (!c) { setAttente({ kind: 'correction', correctsId: lid }); return; }
    var f = c.f, off = PL.etat.data.settings.offsetMin, estHeure = c.kind !== 'fuel';
    var actuel = c.kind === 'dec' ? Date.parse(f.takeoffActual) : c.kind === 'app' ? Date.parse(f.landingActual) : null;
    var lire = function (v) {
      if (!estHeure) { var an = T.analyseDuree(v); return an.min; }
      var h = T.lireHeure(v, off); return h == null ? null : T.plusProche(h, actuel, off, 720);
    };
    var nom = { dec: 'décollage', app: 'appontage', fuel: 'carburant' }[c.kind];
    PL.ui.confirmer('Corriger le ' + nom + ' de ' + f.callsign, 'Ligne #' + lid + ' : « ' + esc(l.text) + ' ».<br>La correction est ajoutée à la main courante (l\'ancienne ligne reste, barrée) et le vol est recalé.', function (v) {
      E.corrigerAction(lid, lire(v));
    }, 'Recaler le vol', 'Annuler', {
      autre: { lib: 'Corriger seulement le texte', cb: function () { setAttente({ kind: 'correction', correctsId: lid }); } },
      champ: { libelle: estHeure ? 'Heure réelle du ' + nom + ' (bord, ou suivie de Z)' : 'Autonomie restante réelle (durée, ex. 1h10)', placeholder: estHeure ? 'HH:MM' : '1h10', max: 7,
        valeur: estHeure ? T.hm(actuel, off) : '',
        analyse: function (v) {
          if (!v.trim()) return { ok: false, aide: estHeure ? 'Saisir l\'heure (HH:MM)' : 'Saisir la durée (ex. 1h10)' };
          var r = E.simulerCorrection(l, lire(v));
          if (r.err) return { ok: false, cls: 'err', aide: r.err };
          return { ok: true, cls: 'lu', aide: (estHeure ? '= ' + T.hm(lire(v), off) + ' bord (' + T.z(lire(v)) + ') · ' : '= ' + T.fmtDuree(lire(v)) + ' · ') + 'fin d\'autonomie ' + T.hm(r.avant, off) + ' → ' + T.hm(r.apres, off) };
        } } });
  }

  function valider() {
    var txt = $('jTexte').value.trim(), vol = volChoisi(), l = null;
    var hn = attente && attente.kind === 'fuel' ? { at: null } : heureAction();
    if (hn.err) { PL.ui.toast(hn.err, true); $('jHeure').focus(); return; }
    var pre = hn.at != null ? '[' + T.hm(hn.at, PL.etat.data.settings.offsetMin) + '] ' : ''; // heure réelle d'une note saisie après coup
    if (!attente) {
      if (!txt) return;
      l = E.saisir({ kind: 'note', flightId: vol, text: pre + txt });
    } else if (attente.kind === 'fuel') {
      // V3 : durée stricte (pas de kg, pas de nombre seul), puis confirmation qui montre le changement
      var f = E.volParId(vol), dt = T.dureeEnTete(txt), an = T.analyseDuree(dt.tete);
      if (/\d\s*(kg|lb|l\b|litres?|livres?|%)/i.test(txt)) an = { min: null, err: 'c\'est une quantité de carburant : saisir l\'AUTONOMIE RESTANTE en durée (ex. « 1h20 »)' };
      if (an.min == null) { PL.ui.toast('Carburant refusé : ' + an.err, true); return; }
      if (an.min > E.AUTO_MAX) { PL.ui.toast('Carburant refusé : ' + T.fmtDuree(an.min) + ' restantes est impossible.', true); return; }
      var ha2 = heureAction(); if (ha2.err) { PL.ui.toast(ha2.err, true); $('jHeure').focus(); return; }
      var min = an.min, reste = dt.reste.trim(), off = PL.etat.data.settings.offsetMin, now = ha2.at != null ? ha2.at : Date.now();
      var avant = f ? E.finAuto(f) : null, apres = now + min * T.MIN;
      var html = '<b>' + E.esc(f ? f.callsign : '') + '</b> : autonomie restante <b>' + T.fmtDuree(min) + '</b><br>Fin d\'autonomie : <b>' +
        (avant != null ? T.hm(avant, off) : '—') + ' → ' + T.hm(apres, off) + '</b> (' + (avant != null ? (apres >= avant ? '+' : '−') + T.fmtDuree(Math.abs(Math.round((apres - avant) / T.MIN))) : 'nouveau') + ')' +
        '<br>H-30 : <b>' + T.hm(apres - 30 * T.MIN, off) + '</b>';
      if (f && min > f.enduranceMin) html += '<div class="conf-fiche">⚠ Plus que l\'autonomie initiale du vol (' + T.fmtDuree(f.enduranceMin) + '). Vérifiez : c\'est bien une durée ?</div>';
      PL.ui.confirmer('Recaler l\'autonomie ?', html, function () {
        var l2 = E.saisir({ kind: 'fuel', flightId: vol, value: min, at: ha2.at, text: 'Carburant : autonomie restante ' + T.fmtDuree(min) + suffixeHeure(ha2.at) + (reste ? ' — ' + reste : '') });
        if (l2) { $('jTexte').value = ''; apresAction(); setAttente(null); $('jTexte').focus(); }
      }, 'Recaler');
      return;
    } else if (attente.kind === 'pax') {
      if (!txt) return;
      l = E.saisir({ kind: 'pax', flightId: vol, text: pre + 'Pax : ' + txt });
    } else if (attente.kind === 'incident') {
      if (!txt) return;
      l = E.saisir({ kind: 'incident', flightId: vol, text: pre + txt });
    } else if (attente.kind === 'correction') {
      if (!txt) return;
      var orig = null; PL.etat.data.log.forEach(function (x) { if (x.id === attente.correctsId) orig = x; });
      l = E.saisir({ kind: 'correction', flightId: orig ? orig.flightId : vol, correctsId: attente.correctsId, text: txt });
    }
    if (l) { $('jTexte').value = ''; apresAction(); setAttente(null); $('jTexte').focus(); }
  }

  function init() {
    $('rapides').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) rapide(b.getAttribute('data-k')); });
    $('jAjout').addEventListener('click', valider);
    $('jTexte').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); valider(); }
      if (e.key === 'Escape') { setAttente(null); }
    });
    $('jFiltre').addEventListener('change', render);
    $('jHeure').addEventListener('input', majHeureAide);
    $('jHeureMoins').addEventListener('click', function (e) {
      var b = e.target.closest('[data-moins]'); if (!b) return;
      $('jHeure').value = T.hm(Date.now() - (+b.getAttribute('data-moins')) * T.MIN, PL.etat.data.settings.offsetMin); majHeureAide();
    });
    $('jRecherche').addEventListener('input', render);
    $('jListe').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cor]'); if (!b) return;
      corriger(+b.getAttribute('data-cor'));
    });
  }

  PL.journal = { init: init, render: render, nomVol: nomVol, actionVol: actionVol };
})(window.PL);
