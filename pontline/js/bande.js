/* Pont·Line — bande.js (V5) : bande des vols toujours visible (aussi en 1366×768) : statut, reste, boutons d'action,
   ETA en un clic (+5 / +10 / +15 min) et « Radio ✓ » (rappel ops normal). */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, esc = E.esc;
  var $ = function (id) { return document.getElementById(id); };
  var RANG = { envol: 0, prevu: 1, pose: 2 };

  function vols(now) {
    return E.volsVisibles(false).filter(function (f) { return RANG.hasOwnProperty(E.statut(f)); }).sort(function (a, b) {
      var sa = E.statut(a), sb = E.statut(b);
      if (sa !== sb) return RANG[sa] - RANG[sb];
      if (sa === 'envol') return E.finAuto(a) - E.finAuto(b);
      if (sa === 'prevu') return E.decollage(a) - E.decollage(b);
      return Date.parse(b.landingActual) - Date.parse(a.landingActual);
    });
  }
  function bouton(f, attrs, lib, titre, cls) {
    var v = /data-act="(dec|app)"/.test(attrs) ? PL.journal.btnVerrou(f.id, lib) : { cls: '', attr: '', lib: lib, titre: null };
    return '<button class="btn petit' + (cls ? ' ' + cls : '') + v.cls + '" data-vol="' + esc(f.id) + '" ' + attrs + v.attr + ' title="' + esc(v.titre || titre) + '" aria-label="' + esc(v.titre || titre) + '">' + v.lib + '</button>';
  }
  // V5.1 (retour Florian) : case haute et étroite, sur 3 lignes : indicatif / temps / boutons
  function hz(t, off) { return T.hm(t, off) + (off ? ' <small>' + T.hm(t, 0) + 'Z</small>' : ''); }
  function puce(f, now, off) {
    var st = E.statut(f), cs = esc(f.callsign), l1, l2, l3, cls = 'bv ' + st, opsTxt = '';
    var nom = '<button class="bv-nom" data-ouvrir="1" data-vol="' + esc(f.id) + '" title="Ouvrir la fiche de ' + cs + '">' + cs + (f.rotation > 1 ? ' <small>rot. ' + esc(f.rotation) + '</small>' : '') + '</button><span class="bv-type">' + esc(f.type) + '</span>';
    if (st === 'envol') {
      var fin = E.finAuto(f), reste = Math.round((fin - now) / MIN), app = E.appontagePrevu(f), ops = E.opsEnRetard(f, now), dc = E.dernierContact(f);
      var rc = reste <= 0 ? 'danger' : reste <= E.H30_MIN ? 'warn' : '';
      if (rc) cls += ' ' + rc;
      if (ops) cls += ' ops';
      if (E.opsNormal(f)) opsTxt = '<span class="bv-ops' + (ops ? ' retard' : '') + '" title="Dernier contact radio">' + (ops ? '⚠ ' : '') + 'radio ' + (dc != null ? 'il y a ' + T.fmtDuree(Math.max(0, Math.floor((now - dc) / MIN))) : '—') + '</span>';
      l1 = nom + '<span class="pill envol">En vol</span>';
      l2 = '<span class="bv-reste ' + rc + '">' + (reste <= 0 ? 'DÉPASSÉE' : '<small>reste</small> ' + T.fmtDuree(reste)) + '</span>' +
        '<span class="bv-heures"><span>fin auto. <b>' + hz(fin, off) + '</b></span><span>appontage <b>' + (app != null ? hz(app, off) : '—') + '</b></span></span>';
      var base = E.baseEta(f, now);
      l3 = bouton(f, 'data-act="app"', 'Appontage', 'Appontage de ' + f.callsign) +
        [5, 10, 15].map(function (n) { return bouton(f, 'data-eta="' + n + '"', (n === 5 ? 'ETA +5' : '+' + n), 'ETA +' + n + ' min pour ' + f.callsign + ' : appontage prévu ' + T.hm(base + n * MIN, off) + ' (l\'autonomie ne change pas)', 'eta'); }).join('') +
        (E.opsNormal(f) ? bouton(f, 'data-radio="1"', 'Radio ✓', 'Contact radio reçu de ' + f.callsign + ' : ops normal (écrit dans la main courante)', ops ? 'primaire' : '') : '');
    } else if (st === 'prevu') {
      var dec = E.decollage(f), dans = Math.round((dec - now) / MIN), oublie = now >= dec;
      if (oublie) cls += ' warn';
      l1 = nom + '<span class="pill prevu">Prévu</span>';
      l2 = '<span class="bv-reste' + (oublie ? ' warn' : '') + '"><small>déc.</small> ' + T.hm(dec, off) + '</span><span class="bv-heures"><span>' + (off ? T.hm(dec, 0) + 'Z' : '') + '</span><span class="' + (oublie ? 'bv-info warn' : '') + '">' + (oublie ? 'NON SAISI' : 'dans ' + T.fmtDuree(dans)) + '</span></span>';
      l3 = bouton(f, 'data-act="dec"', 'Décollage', 'Décollage de ' + f.callsign);
    } else {
      var po = Date.parse(f.landingActual);
      l1 = nom + '<span class="pill pose">Posé</span>';
      l2 = '<span class="bv-reste"><small>posé</small> ' + T.hm(po, off) + '</span><span class="bv-heures"><span>' + (off ? T.hm(po, 0) + 'Z' : '') + '</span></span>';
      l3 = bouton(f, 'data-act="dec"', 'Redécollage…', 'Redécollage de ' + f.callsign + ' (nouvelle rotation)');
    }
    return '<div class="' + cls + '" role="group" aria-label="' + cs + '"><div class="bv-l1">' + l1 + opsTxt + '</div><div class="bv-l2">' + l2 + '</div><div class="bv-l3">' + l3 + '</div></div>';
  }
  function render(now) {
    var el = $('bande'); if (!el) return;
    var off = E.data.settings.offsetMin, l = vols(now), sl = el.scrollLeft;
    $('bandeZone').classList.toggle('hidden', !l.length);
    if (PL.ui.poser(el, l.map(function (f) { return puce(f, now, off); }).join(''))) el.scrollLeft = sl;
    defil();
  }
  // V5.2 (PC à la souris, sans tactile) : flèches ◀ ▶, molette, barre de défilement visible, « +N vols → »
  function horsVue() {
    var el = $('bande'), r = el.getBoundingClientRect(), g = 0, d = 0, bs = el.querySelectorAll('.bv');
    for (var i = 0; i < bs.length; i++) { var q = bs[i].getBoundingClientRect(); if (q.left < r.left - 2) g++; else if (q.right > r.right + 2) d++; }
    return { g: g, d: d };
  }
  function defil() {
    var el = $('bande'), z = $('bandeZone'); if (!el || !z) return;
    var deborde = el.scrollWidth > el.clientWidth + 1, h = deborde ? horsVue() : { g: 0, d: 0 };
    z.classList.toggle('defile', deborde);
    var bg = $('bandeG'), bd = $('bandeD');
    var finG = el.scrollLeft <= 1, finD = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    bg.setAttribute('aria-disabled', finG ? 'true' : 'false'); bd.setAttribute('aria-disabled', finD ? 'true' : 'false');
    var tg = h.g ? '+' + h.g + ' vol' + (h.g > 1 ? 's' : '') : '', td = h.d ? '+' + h.d + ' vol' + (h.d > 1 ? 's' : '') : '';
    if ($('bandeGn').textContent !== tg) $('bandeGn').textContent = tg;
    if ($('bandeDn').textContent !== td) $('bandeDn').textContent = td;
    bg.title = h.g ? 'Voir les vols à gauche (' + tg + ' cachés)' : 'Début de la bande';
    bd.title = h.d ? 'Voir les vols à droite (' + td + ' cachés)' : 'Fin de la bande';
    bg.setAttribute('aria-label', bg.title); bd.setAttribute('aria-label', bd.title);
  }
  function fleche(sens) {
    var el = $('bande'), c = el.querySelector('.bv'); if (!c) return;
    var pas = c.getBoundingClientRect().width + 8;
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + sens * pas));
    defil();
  }
  function init() {
    var el = $('bande');
    $('bandeG').addEventListener('click', function () { if ($('bandeG').getAttribute('aria-disabled') !== 'true') fleche(-1); });
    $('bandeD').addEventListener('click', function () { if ($('bandeD').getAttribute('aria-disabled') !== 'true') fleche(1); });
    el.addEventListener('scroll', defil);
    window.addEventListener('resize', defil);
    // molette verticale ordinaire = défilement horizontal de la bande (pas besoin de Maj)
    $('bandeZone').addEventListener('wheel', function (e) {
      if (el.scrollWidth <= el.clientWidth + 1 || e.ctrlKey) return;
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) d *= 40; else if (e.deltaMode === 2) d *= el.clientWidth;
      var avant = el.scrollLeft; el.scrollLeft += d;
      if (el.scrollLeft !== avant) e.preventDefault();
    }, { passive: false });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-vol]'); if (!b) return;
      var id = b.getAttribute('data-vol'), f = E.volParId(id); if (!f) return;
      if (b.hasAttribute('data-ouvrir')) { PL.vols.ouvrir(id); return; }
      if (b.hasAttribute('data-act')) { PL.journal.actionVol(id, b.getAttribute('data-act')); return; }
      if (!E.peutEcrire()) return;
      if (b.hasAttribute('data-eta')) { var r = E.eta(id, +b.getAttribute('data-eta')); if (r) PL.ui.toast('ETA ' + f.callsign + ' : appontage prévu ' + T.hm(r.apres, E.data.settings.offsetMin) + ' (noté dans la main courante).'); return; }
      if (b.hasAttribute('data-radio')) { if (E.radioOk(id)) PL.ui.toast('Contact radio ' + f.callsign + ' noté : ops normal.'); }
    });
  }
  PL.bande = { render: render, init: init, vols: vols, fleche: fleche, horsVue: horsVue };
})(window.PL);
