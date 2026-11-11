/* Pont·Line — seqclic.js (V5) : créer une séquence en cliquant sur la ligne d'un hélico dans la timeline, à l'heure voulue.
   Type et durée en deux touches, Entrée pour ajouter, annulable, écrit dans la main courante.
   Une séquence qui finit après la fin d'autonomie n'est JAMAIS refusée : avertissement visuel seulement. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, esc = E.esc;
  var $ = function (id) { return document.getElementById(id); };
  var TYPES = [['ravito', 'Ravitaillement'], ['vol', 'Vol'], ['pax', 'Pax'], ['treuil', 'Treuil'], ['vertrep', 'VERTREP'], ['mer', 'Mise en route'], ['autre', 'Autre']];
  var etat = null, dernierType = 'ravito', dernierDur = 30;

  function ouverte() { return !$('popSeq').classList.contains('hidden'); }
  function arrondi5(t) { return Math.round(t / (5 * MIN)) * 5 * MIN; }
  // heure lue dans le champ « Début » (HH:MM bord ou 0430Z), au plus près de l'heure cliquée
  function debut() {
    var off = E.data.settings.offsetMin, h = T.lireHeure($('psDebut').value, off);
    return h == null ? null : T.plusProche(h, etat.ref, off, 720);
  }
  function duree() { var v = $('psDur').value.trim(); return /^\d{1,4}$/.test(v) && +v >= 1 && +v <= 1440 ? +v : null; }
  function maj() {
    if (!etat) return;
    var f = E.volParId(etat.id), off = E.data.settings.offsetMin, a = debut(), d = duree();
    var bs = document.querySelectorAll('#psTypes [data-ps-k]');
    for (var i = 0; i < bs.length; i++) { var on = bs[i].getAttribute('data-ps-k') === etat.kind; bs[i].classList.toggle('actif', on); bs[i].setAttribute('aria-checked', on ? 'true' : 'false'); }
    var ds = document.querySelectorAll('#psDurees [data-ps-d]');
    for (var j = 0; j < ds.length; j++) { var on2 = +ds[j].getAttribute('data-ps-d') === d; ds[j].classList.toggle('actif', on2); ds[j].setAttribute('aria-checked', on2 ? 'true' : 'false'); }
    var ok = !!f && a != null && d != null;
    $('psAjouter').disabled = !ok;
    $('psDebutAide').textContent = a != null ? '= ' + T.hm(a, off) + ' bord (' + T.hm(a, 0) + 'Z)' + jour(a, off) : 'heure HH:MM ou 0430Z';
    $('psResume').textContent = ok ? E.nomSeq(etat.kind) + ' ' + T.hm(a, off) + '–' + T.hm(a + d * MIN, off) + ' (' + T.fmtDuree(d) + ')' : a == null ? 'Heure de début non comprise : taper HH:MM (heure bord) ou 0430Z.' : (d == null ? 'Durée : 1 à 1440 min' : '');
    $('psResume').classList.toggle('erreur', !ok);
    var fin = f ? E.finAuto(f) : null, av = ok && fin != null && a + d * MIN > fin;
    $('psAvert').classList.toggle('hidden', !av);
    $('psAvert').textContent = av ? '⚠ Finit à ' + T.hm(a + d * MIN, off) + ', après la fin d\'autonomie (' + T.hm(fin, off) + '). Ajout possible quand même.' : '';
    placer();
  }
  // la petite fenêtre reste entière dans l'écran, même quand le cadre orange l'agrandit (audit V5)
  function placer() {
    if (!etat || etat.x == null) return;
    var p = $('popSeq'), w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x = etat.x, y = etat.y;
    p.style.left = Math.max(8, Math.min(x - w / 2, vw - w - 8)) + 'px';
    p.style.top = Math.max(8, Math.min(y + 14 + h <= vh - 8 ? y + 14 : y - h - 14, vh - h - 8)) + 'px';
  }
  function jour(t, off) { var j = T.jourRelatif ? T.jourRelatif(t, Date.now(), off) : 0; return j === 1 ? ' · demain' : j === -1 ? ' · hier' : ''; }
  function ouvrir(id, t, x, y) {
    if (!E.peutEcrire()) return;
    var f = E.volParId(id); if (!f) return;
    var off = E.data.settings.offsetMin;
    etat = { id: id, ref: t, kind: dernierType, retour: document.activeElement };
    $('psTitre').textContent = f.callsign + ' — nouvelle séquence';
    $('psTypes').innerHTML = '<span class="pop-lib">Type</span>' + TYPES.map(function (k) { return '<button class="btn petit" role="radio" data-ps-k="' + k[0] + '">' + esc(k[1]) + '</button>'; }).join('');
    $('psDebut').value = T.hm(arrondi5(t), off);
    $('psDur').value = String(dernierDur);
    var p = $('popSeq'); p.classList.remove('hidden');
    etat.x = x; etat.y = y;
    maj();
    setTimeout(function () { var b = document.querySelector('#psTypes [data-ps-k="' + etat.kind + '"]'); (b || $('psAjouter')).focus(); }, 30);
  }
  function fermer() {
    if (!ouverte()) return;
    $('popSeq').classList.add('hidden');
    var r = etat && etat.retour; etat = null;
    if (r && r.focus && document.body.contains(r)) try { r.focus({ preventScroll: true }); } catch (e) { /* rien */ }
  }
  function ajouter() {
    if (!etat || $('psAjouter').disabled) return;
    var a = debut(), d = duree(), id = etat.id, kind = etat.kind;
    var r = E.ajouterSequence(id, { kind: kind, start: a, dur: d });
    if (!r) return;
    dernierType = kind; dernierDur = d;
    fermer();
    PL.ui.toast(E.nomSeq(kind) + ' ajouté' + (r.apresFin ? ' (finit après la fin d\'autonomie)' : '') + '. « Annuler » en haut pour revenir en arrière.');
  }
  // instant correspondant à un clic dans une ligne de la timeline
  function instant(piste, clientX) {
    var r = piste.getBoundingClientRect(), w = PL.timeline.fenetre(Date.now());
    return w.debut + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * w.span;
  }
  function init() {
    var p = $('popSeq');
    p.addEventListener('click', function (e) {
      var k = e.target.closest('[data-ps-k]'); if (k) { etat.kind = k.getAttribute('data-ps-k'); maj(); return; }
      var d = e.target.closest('[data-ps-d]'); if (d) { $('psDur').value = d.getAttribute('data-ps-d'); maj(); return; }
      if (e.target.id === 'psAjouter') ajouter();
      else if (e.target.id === 'psAnnuler') fermer();
      else if (e.target.id === 'psFiche') { var id = etat.id; fermer(); PL.vols.ouvrir(id); }
    });
    p.addEventListener('input', maj);
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
      if (e.key === 'Enter' && !e.isComposing) {
        var t = e.target; if (t.tagName === 'BUTTON' && t.id !== 'psAjouter' && !t.hasAttribute('data-ps-k') && !t.hasAttribute('data-ps-d')) return; // Entrée sur Annuler / Ouvrir la fiche : leur action
        e.preventDefault(); e.stopPropagation(); ajouter(); return;
      }
      if (e.key === 'Tab') { // Tab reste dans la fenêtre
        var f = [].filter.call(p.querySelectorAll('button, input'), function (x) { return !x.disabled && x.getClientRects().length; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation(); // les raccourcis de la page (N…) ne s'appliquent pas dans cette fenêtre
    });
    document.addEventListener('mousedown', function (e) { if (ouverte() && !e.target.closest('#popSeq')) fermer(); }, true);
    // clic dans la piste d'un vol (pas sur un bouton) : nouvelle séquence à cet instant
    $('tlLanes').addEventListener('click', function (e) {
      if (e.target.closest('button,[data-act]')) return;
      var piste = e.target.closest('.piste[data-vol]'); if (!piste) return;
      e.stopImmediatePropagation();
      ouvrir(piste.getAttribute('data-vol'), instant(piste, e.clientX), e.clientX, e.clientY);
    }, true);
    // clavier : touche S (ou +) sur l'étiquette d'un vol = nouvelle séquence, à partir de maintenant (ou du décollage)
    $('tlLanes').addEventListener('keydown', function (e) {
      if (!e.target.classList || !e.target.classList.contains('lab') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 's' || e.key === 'S' || e.key === '+') {
        e.preventDefault();
        var id = e.target.getAttribute('data-vol'), f = E.volParId(id); if (!f) return;
        var r = e.target.getBoundingClientRect();
        ouvrir(id, Math.max(Date.now(), E.decollage(f)), r.right + 160, r.top);
      }
    });
  }
  PL.seqclic = { init: init, ouvrir: ouvrir, fermer: fermer, ouverte: ouverte, ajouter: ajouter, instant: instant };
})(window.PL);
