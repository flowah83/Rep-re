/* Pont·Line — pontprog.js (V5.3) : programmer « Pont vert » / « Pont rouge » à l'avance.
   Clic sur la ligne ÉTAT DU PONT (ou bouton PONT > Programmer…) : petite fenêtre, Entrée pour programmer.
   Une programmation ne change JAMAIS le pont toute seule : à l'heure prévue, un bandeau demande de confirmer. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, esc = E.esc;
  var $ = function (id) { return document.getElementById(id); };
  var etat = null;

  function ouverte() { return !$('popPont').classList.contains('hidden'); }
  function arrondi5(t) { return Math.round(t / (5 * MIN)) * 5 * MIN; }
  function off() { return E.data.settings.offsetMin; }
  function debut() { var h = T.lireHeure($('ppDebut').value, off()); return h == null ? null : T.plusProche(h, etat.ref, off(), etat.avant); }
  // fin facultative : première occurrence de l'heure APRÈS le début (24 h au plus)
  function fin(a) {
    var v = $('ppFin').value.trim(); if (!v) return { vide: true };
    var h = T.lireHeure(v, off()); if (h == null || a == null) return { err: true };
    var t = T.plusProche(h, a + MIN, off(), 0); return t > a ? { t: t } : { err: true };
  }
  function hz(t) { return T.hm(t, off()) + (off() ? ' (' + T.hm(t, 0) + 'Z)' : ''); }
  function maj() {
    if (!etat) return;
    var bs = document.querySelectorAll('#ppTypes [data-pp-k]');
    for (var i = 0; i < bs.length; i++) { var on = bs[i].getAttribute('data-pp-k') === etat.deck; bs[i].classList.toggle('actif', on); bs[i].setAttribute('aria-checked', on ? 'true' : 'false'); }
    var a = debut(), f = fin(a), ok = a != null && !f.err;
    $('ppAjouter').disabled = !ok;
    $('ppDebutAide').textContent = a != null ? '= ' + hz(a) + jour(a) : 'heure HH:MM ou 0430Z';
    $('ppFinAide').textContent = f.vide ? 'facultatif' : f.err ? 'heure de fin après le début' : '= ' + hz(f.t) + jour(f.t);
    $('ppResume').textContent = ok ? 'Pont ' + etat.deck + ' prévu ' + T.hm(a, off()) + (f.t ? ' → ' + T.hm(f.t, off()) : '') + '. Rien ne change avant votre confirmation.' : (a == null ? 'Heure de début non comprise : taper HH:MM (heure bord) ou 0430Z.' : 'Heure de fin non comprise.');
    $('ppResume').classList.toggle('erreur', !ok);
    $('ppPasse').classList.toggle('hidden', !(ok && a < Date.now() - MIN));
    placer();
  }
  function jour(t) { var j = T.jourRelatif ? T.jourRelatif(t, Date.now(), off()) : 0; return j === 1 ? ' · demain' : j === -1 ? ' · hier' : ''; }
  function placer() {
    if (!etat || etat.x == null) return;
    var p = $('popPont'), w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x = etat.x, y = etat.y;
    p.style.left = Math.max(8, Math.min(x - w / 2, vw - w - 8)) + 'px';
    p.style.top = Math.max(8, Math.min(y + 14 + h <= vh - 8 ? y + 14 : y - h - 14, vh - h - 8)) + 'px';
  }
  function liste() {
    var now = Date.now(), l = (E.data.deckPlans || []).filter(function (p) { return (p.statut === 'prevu' || p.statutFin === 'prevu') && (p.end ? Date.parse(p.end) : Date.parse(p.start)) > now - 12 * 60 * MIN; });
    var plus = l.length > 6 ? l.length - 6 : 0; l = l.slice(0, 6); // les 6 prochaines ; les autres : cliquer leur bande
    $('ppListe').innerHTML = l.length ? '<span class="pop-lib">Programmés</span>' + l.map(function (p) {
      return '<button type="button" class="btn petit pp-plan ' + esc(p.deck) + (etat && etat.id === p.id ? ' actif' : '') + '" data-pp-plan="' + esc(p.id) + '" title="Modifier ou supprimer">' + esc(p.deck) + ' ' + T.hm(Date.parse(p.start), off()) + (p.end ? '–' + T.hm(Date.parse(p.end), off()) : '') + '</button>';
    }).join('') + (plus ? '<span class="pop-lib">+' + plus + ' autre(s) : cliquer leur bande</span>' : '') : '';
  }
  // id = programmation à modifier (ou null pour une nouvelle) ; t = heure proposée ; x, y = où ouvrir ; deck = couleur proposée
  function ouvrir(id, t, x, y, deck) {
    if (!E.peutEcrire()) return;
    var p = id ? E.planParId(id) : null; if (id && !p) return;
    var cur = E.etatPont();
    etat = { id: p ? p.id : null, ref: p ? Date.parse(p.start) : t, avant: p ? 720 : 180, deck: p ? p.deck : (deck || (cur && cur.etat === 'vert' ? 'rouge' : 'vert')), retour: etat && etat.retour ? etat.retour : document.activeElement, x: x, y: y };
    $('ppTitre').textContent = p ? 'Modifier le pont programmé' : 'Programmer l\'état du pont';
    $('ppDebut').value = T.hm(p ? Date.parse(p.start) : arrondi5(t), off());
    $('ppFin').value = p && p.end ? T.hm(Date.parse(p.end), off()) : '';
    $('ppSupprimer').classList.toggle('hidden', !p);
    $('ppAjouter').textContent = p ? 'Enregistrer (Entrée)' : 'Programmer (Entrée)';
    $('popPont').classList.remove('hidden');
    liste(); maj();
    setTimeout(function () { var b = document.querySelector('#ppTypes [data-pp-k="' + etat.deck + '"]'); (b || $('ppDebut')).focus(); }, 30);
  }
  function fermer() {
    if (!ouverte()) return;
    $('popPont').classList.add('hidden');
    var r = etat && etat.retour; etat = null;
    if (r && r.focus && document.body.contains(r)) try { r.focus({ preventScroll: true }); } catch (e) { /* rien */ }
  }
  function valider() {
    if (!etat || $('ppAjouter').disabled) return;
    var a = debut(), f = fin(a), o = { deck: etat.deck, start: a, end: f.t != null ? f.t : null };
    var r = etat.id ? E.modifierPlan(etat.id, o) : E.programmerPont(o);
    if (!r) return;
    fermer();
    PL.ui.toast('Pont ' + r.deck + ' programmé à ' + T.hm(Date.parse(r.start), off()) + ' (prévu). Un bandeau demandera de confirmer à l\'heure.');
  }
  function supprimer() {
    if (!etat || !etat.id) return;
    var r = E.supprimerPlan(etat.id); if (!r) return;
    fermer(); PL.ui.toast('Programmation supprimée. « Annuler » en haut pour revenir en arrière.');
  }
  function init() {
    var p = $('popPont');
    $('ppTypes').innerHTML = '<span class="pop-lib">Pont</span><button type="button" class="btn petit pp-k vert" role="radio" data-pp-k="vert">Pont vert</button><button type="button" class="btn petit pp-k rouge" role="radio" data-pp-k="rouge">Pont rouge</button>';
    p.addEventListener('click', function (e) {
      var k = e.target.closest('[data-pp-k]'); if (k) { etat.deck = k.getAttribute('data-pp-k'); maj(); return; }
      var pl = e.target.closest('[data-pp-plan]'); if (pl) { ouvrir(pl.getAttribute('data-pp-plan'), null, etat.x, etat.y); return; }
      if (e.target.id === 'ppAjouter') valider();
      else if (e.target.id === 'ppAnnuler') fermer();
      else if (e.target.id === 'ppSupprimer') supprimer();
    });
    p.addEventListener('input', maj);
    p.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
      if (e.key === 'Enter' && !e.isComposing) {
        var t = e.target; if (t.tagName === 'BUTTON' && t.id !== 'ppAjouter' && !t.hasAttribute('data-pp-k')) return; // Entrée sur un autre bouton : son action
        e.preventDefault(); e.stopPropagation(); valider(); return;
      }
      if (e.key === 'Tab') {
        var f = [].filter.call(p.querySelectorAll('button, input'), function (x) { return !x.disabled && x.getClientRects().length; });
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation();
    });
    document.addEventListener('mousedown', function (e) { if (ouverte() && !e.target.closest('#popPont') && !e.target.closest('#modalConf')) fermer(); }, true);
    // clic sur la ligne ÉTAT DU PONT : nouvelle programmation à cet instant, ou modification d'une bande programmée
    $('tlLanes').addEventListener('click', function (e) {
      var piste = e.target.closest('.lane.pont .piste'); if (!piste) return;
      e.stopImmediatePropagation();
      var b = e.target.closest('[data-plan]');
      if (b) ouvrir(b.getAttribute('data-plan'), null, e.clientX, e.clientY);
      else ouvrir(null, PL.seqclic.instant(piste, e.clientX), e.clientX, e.clientY);
    }, true);
    // clavier : Entrée, Espace ou P sur l'étiquette ÉTAT DU PONT
    $('tlLanes').addEventListener('keydown', function (e) {
      if (!e.target.classList || !e.target.classList.contains('pontlab') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault(); e.stopImmediatePropagation();
        var r = e.target.getBoundingClientRect();
        ouvrir(null, Math.ceil((Date.now() + 15 * MIN) / (5 * MIN)) * 5 * MIN, r.right + 220, r.bottom);
      }
    }, true);
  }
  PL.pontprog = { init: init, ouvrir: ouvrir, fermer: fermer, ouverte: ouverte };
})(window.PL);
