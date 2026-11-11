/* Pont·Line — etiquettes.js (V5.5) : noms des séquences toujours lisibles dans la timeline.
   Après chaque dessin de la timeline (et quand la fenêtre change de taille) :
   1. séquences qui se chevauchent dans le temps : rangées en sous-lignes (2 sous-lignes dans la hauteur normale,
      au-delà la ligne du vol grandit) — plus aucun bloc ne cache le nom d'un autre ;
   2. bloc trop étroit pour son nom : le nom complet est écrit à côté (à gauche, sinon à droite, sinon dessous
      avec un trait de rappel), sans chevaucher un autre nom, une heure ▲/▼ ou les repères H-30 / Fin auto. ;
   3. H-30 et Fin auto. trop proches : l'étiquette H-30 est décalée pour rester lisible ;
   4. survol à la souris ou flèches du clavier (depuis le nom du vol) : bulle avec le nom complet et les heures. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var GAP = 3;
  function px(el, p) { return parseFloat(getComputedStyle(el)[p]) || 0; }
  function rel(el, base) { var r = el.getBoundingClientRect(); return { l: r.left - base.left, t: r.top - base.top, r: r.right - base.left, b: r.bottom - base.top }; }
  function inter(a, b) { return Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5; }
  function libre(c, obs) { for (var i = 0; i < obs.length; i++) if (inter(c, obs[i])) return false; return true; }

  function remettre(piste) {
    [].slice.call(piste.querySelectorAll('.segl, .segfil')).forEach(function (e) { e.remove(); });
    piste.style.minHeight = '';
    [].slice.call(piste.querySelectorAll('.seg')).forEach(function (s) {
      s.classList.remove('etroit', 'sousl', 'coupe'); s.style.top = ''; s.style.height = ''; s.style.lineHeight = ''; s.style.paddingLeft = ''; s.style.zIndex = '';
    });
    [].slice.call(piste.querySelectorAll('.reperel.h30')).forEach(function (e) { e.style.marginLeft = ''; e.style.top = ''; });
    [].slice.call(piste.querySelectorAll('.evt')).forEach(function (e) { e.classList.remove('evtg', 'evtd', 'evtc', 'evtx'); e.removeAttribute('title'); });
  }

  function placerPiste(piste) {
    remettre(piste);
    var W = piste.clientWidth; if (!W) return;
    var segs = [].slice.call(piste.querySelectorAll('.seg'));
    if (!segs.length) return;
    var base = piste.getBoundingClientRect(), H0 = piste.offsetHeight;
    var T0 = px(segs[0], 'top'), SH = segs[0].offsetHeight, rem = px(document.documentElement, 'fontSize') || 16;
    // 1. sous-lignes pour les séquences qui se chevauchent
    var it = segs.map(function (s) { return { el: s, l: s.offsetLeft, r: s.offsetLeft + s.offsetWidth }; });
    it.sort(function (a, b) { return a.l - b.l || (b.r - b.l) - (a.r - a.l); });
    var fins = [];
    it.forEach(function (x) {
      var k = 0; while (k < fins.length && fins[k] > x.l + 1) k++;
      fins[k] = x.r; x.ligne = k;
    });
    var n = fins.length, bas = H0;
    if (n > 1) {
      var h = n === 2 ? (SH - 2) / 2 : Math.round(1.125 * rem);
      it.forEach(function (x) {
        x.el.classList.add('sousl');
        x.el.style.top = (T0 + x.ligne * (h + 2)) + 'px'; x.el.style.height = h + 'px'; x.el.style.lineHeight = (h - 3) + 'px';
      });
      var besoin = T0 + n * (h + 2) + 4;
      if (besoin > H0) { piste.style.minHeight = besoin + 'px'; bas = besoin; }
    }
    // 3. H-30 / Fin auto. : pas l'une sur l'autre
    var h30 = piste.querySelector('.reperel.h30'), fin = piste.querySelector('.reperel.fin');
    if (h30 && fin) {
      var a = rel(h30, base), b = rel(fin, base);
      if (inter(a, b)) {
        var d = (b.l - GAP) - a.r;
        if (a.l + d >= 0) h30.style.marginLeft = d + 'px';
        else { d = (b.r + GAP) - a.l; if (a.r + d <= W) h30.style.marginLeft = d + 'px'; else h30.style.top = '0px'; }
      }
    }
    // obstacles : blocs, heures ▲/▼, repères
    var obs = segs.map(function (s) { return rel(s, base); });
    [].slice.call(piste.querySelectorAll('.reperel')).forEach(function (e) { obs.push(rel(e, base)); });
    // heures ▲/▼ : obstacles aussi, mais elles peuvent se pousser (voir 4) si un nom a besoin du haut de la ligne
    var evts = [].slice.call(piste.querySelectorAll('.evt')).map(function (e) { var r = rel(e, base); r.evt = e; obs.push(r); return r; });
    function libreSansEvt(c) { for (var i = 0; i < obs.length; i++) if (!obs[i].evt && inter(c, obs[i])) return false; return true; }
    // 2. blocs trop étroits : nom à côté ou dessous
    var bas0 = bas;
    it.forEach(function (x) {
      var s = x.el, nom = s.getAttribute('data-nom'), bEl = s.querySelector('b');
      if (!nom || !bEl) return;
      var vl = Math.max(0, x.l), vr = Math.min(W, x.r);
      if (x.l < 0) s.style.paddingLeft = (-x.l + px(s, 'paddingRight')) + 'px'; // bloc commencé avant la fenêtre : nom au bord visible
      var dispo = vr - vl - px(s, 'paddingRight') * 2 - 2;
      if (bEl.offsetWidth <= dispo) {
        // le nom tient dans le bloc : il ne doit pas non plus être caché par une heure ▲/▼ ou un repère H-30 / Fin auto.
        var br = rel(bEl, base), cache = false;
        br.r = Math.min(br.r, vr); br.l = Math.max(br.l, vl);
        for (var q = segs.length; q < obs.length; q++) if (inter(br, obs[q])) cache = true;
        if (!cache) { obs.push(br); return; }
      }
      s.classList.add('etroit');
      var lab = document.createElement('div');
      lab.className = 'segl ' + (s.className.match(/\b(vol|mer|ravito|pax|treuil|vertrep|autre|prolonge|depasse)\b/) || ['', ''])[1];
      lab.textContent = s.getAttribute('data-court') || nom; lab.setAttribute('data-pour', s.getAttribute('data-seg'));
      lab.setAttribute('data-vol', s.getAttribute('data-vol')); lab.setAttribute('aria-hidden', 'true');
      piste.appendChild(lab);
      var lw = lab.offsetWidth, lh = lab.offsetHeight, st = s.offsetTop, sh = s.offsetHeight;
      lab.classList.add('haut'); var lw2 = lab.offsetWidth, lh2 = lab.offsetHeight; lab.classList.remove('haut');
      var y = st + (sh - lh) / 2, cands = [{ l: vl - GAP - lw, t: y }, { l: vr + GAP, t: y }], pose = null, fil = false, haut = false;
      // haut de la ligne (bande des heures ▲/▼), en plus petit : sans faire grandir la ligne
      if (lh2 <= T0 + 1) [vl, vr - lw2, (vl + vr) / 2 - lw2 / 2].forEach(function (x0) { cands.push({ l: x0, t: Math.max(-1, T0 - lh2), haut: true, fil: st > T0 + 1 }); });
      // centré sous / sur le bloc (relié par un trait) : d'abord aux autres niveaux déjà présents (haut de ligne, sous-lignes), puis dessous
      var cx = Math.max(0, Math.min(W - lw, (vl + vr) / 2 - lw / 2)), niveaux = [-1];
      for (var r = 0; r < n; r++) niveaux.push(T0 + r * ((n > 1 ? parseFloat(it[0].el.style.height) : SH) + 2) + ((n > 1 ? parseFloat(it[0].el.style.height) : SH) - lh) / 2);
      niveaux.sort(function (a, b) { return Math.abs(a - y) - Math.abs(b - y); });
      niveaux.forEach(function (t) { if (Math.abs(t - y) > 1) cands.push({ l: cx, t: t, fil: true }); });
      for (var k = 0; k < 6; k++) cands.push({ l: cx, t: Math.max(H0, bas0) + k * (lh + 2), fil: true });
      for (var i = 0; i < cands.length && !pose; i++) {
        var H = cands[i].haut, c = { l: cands[i].l, t: cands[i].t, r: cands[i].l + (H ? lw2 : lw), b: cands[i].t + (H ? lh2 : lh) };
        if (c.l >= 0 && c.r <= W && c.t >= -1 && (H ? libreSansEvt(c) : libre(c, obs))) { pose = c; fil = !!cands[i].fil; haut = !!H; }
      }
      if (haut) lab.classList.add('haut');
      if (!pose) { lab.remove(); s.classList.remove('etroit'); s.classList.add('coupe'); return; }
      lab.style.left = pose.l + 'px'; lab.style.top = pose.t + 'px';
      obs.push(pose);
      if (fil) {
        var f = document.createElement('div'), haut = pose.b <= st; f.className = 'segfil';
        f.style.left = Math.round((vl + vr) / 2) + 'px';
        f.style.top = (haut ? pose.b : st + sh) + 'px'; f.style.height = Math.max(2, haut ? st - pose.b : pose.t - st - sh) + 'px';
        piste.appendChild(f);
      }
      bas = Math.max(bas, pose.b + 3);
    });
    // 4. heure ▲/▼ sur un nom : à droite du trait, sinon à gauche, sinon le seul triangle (heure dans la bulle et l'infobulle)
    evts.forEach(function (r) {
      var autres = obs.filter(function (o) { return o !== r; });
      if (libre(r, autres)) return;
      var e = r.evt, x = e.offsetLeft, w = r.r - r.l, ok = false;
      [[x - 1, 'g'], [x - w + 1, 'd']].forEach(function (c) {
        if (ok) return;
        var q = { l: c[0], r: c[0] + w, t: r.t, b: r.b };
        if (q.l >= 0 && q.r <= W && libre(q, autres)) { e.classList.add(c[1] === 'g' ? 'evtg' : 'evtd'); ok = true; r.l = q.l; r.r = q.r; }
      });
      if (!ok) { e.setAttribute('data-g', e.textContent.charAt(0)); e.classList.add('evtc'); e.title = (e.textContent.charAt(0) === '▲' ? 'Décollage réel ' : 'Appontage réel ') + e.textContent.slice(2); 
        ok = ['evtg', 'evtd', ''].some(function (k) { if (k) e.classList.add(k); var q2 = rel(e, base); if (libre(q2, autres)) { r.l = q2.l; r.r = q2.r; return true; } if (k) e.classList.remove(k); return false; });
        if (!ok) { e.classList.add('evtx'); r.l = r.r = -9; } // vraiment pas la place : l'heure réelle reste dans la bande des vols et la main courante
      }
    });
    if (bas > H0 + 0.5 && bas > (parseFloat(piste.style.minHeight) || 0)) piste.style.minHeight = Math.ceil(bas) + 'px';
  }

  function placer() {
    var p = document.querySelectorAll('#tlLanes .lane[data-vol] > .piste');
    if (!p.length) return;
    // une ligne qui grandit peut faire apparaître la barre de défilement (pistes plus étroites) : on recalcule alors une fois
    for (var passe = 0; passe < 3; passe++) {
      var w0 = p[0].clientWidth;
      for (var i = 0; i < p.length; i++) placerPiste(p[i]);
      if (p[0].clientWidth === w0) break;
    }
  }

  // ---- bulle (survol souris et focus clavier) ----
  var tip = null, tipPour = null;
  function bulle(el) {
    if (!tip) { tip = document.createElement('div'); tip.id = 'tipSeg'; tip.className = 'hidden'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    var s = el.classList.contains('segl') ? el.parentNode.querySelector('.seg[data-seg="' + CSS.escape(el.getAttribute('data-pour')) + '"]') : el;
    if (!s) return;
    if (tipPour && tipPour !== s) tipPour.classList.remove('lie');
    tipPour = s; s.classList.add('lie');
    tip.innerHTML = ''; var b = document.createElement('b'); b.textContent = s.getAttribute('data-nom'); tip.appendChild(b);
    tip.appendChild(document.createTextNode(' · ' + (s.getAttribute('data-h') || '')));
    tip.classList.remove('hidden');
    var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 4)), y = r.top - h - 6;
    if (y < 4) y = r.bottom + 6;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function cacher() { if (tip) tip.classList.add('hidden'); if (tipPour) tipPour.classList.remove('lie'); tipPour = null; }
  function segsDe(lane) {
    return [].slice.call(lane.querySelectorAll('.seg')).sort(function (a, b) { return a.offsetLeft - b.offsetLeft || a.offsetTop - b.offsetTop; });
  }

  function init() {
    var L = document.getElementById('tlLanes');
    L.addEventListener('mouseover', function (e) { var t = e.target.closest('.seg[data-nom], .segl'); if (t) bulle(t); else cacher(); });
    L.addEventListener('mouseleave', cacher);
    L.addEventListener('scroll', cacher);
    L.addEventListener('focusin', function (e) { if (e.target.classList.contains('seg')) bulle(e.target); else cacher(); });
    L.addEventListener('focusout', function () { setTimeout(function () { var a = document.activeElement; if (!a || !a.classList || !a.classList.contains('seg')) cacher(); }, 0); });
    // clavier : sur le nom du vol, → entre dans ses séquences ; ← → passent de l'une à l'autre ; Entrée ouvre la fiche ; Échap revient au vol
    L.addEventListener('keydown', function (e) {
      var t = e.target; if (!t.classList || e.ctrlKey || e.metaKey || e.altKey) return;
      var lane = t.closest('.lane[data-vol]'); if (!lane) return;
      if (t.classList.contains('lab') && e.key === 'ArrowRight') {
        var l0 = segsDe(lane); if (l0.length) { e.preventDefault(); l0[0].focus(); }
      } else if (t.classList.contains('seg')) {
        var l = segsDe(lane), i = l.indexOf(t);
        if (e.key === 'ArrowRight' && i < l.length - 1) { e.preventDefault(); l[i + 1].focus(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); (i > 0 ? l[i - 1] : lane.querySelector('.lab')).focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); lane.querySelector('.lab').focus(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cacher(); PL.vols.ouvrir(t.getAttribute('data-vol')); }
      }
    });
    var tm = null;
    window.addEventListener('resize', function () { cacher(); clearTimeout(tm); tm = setTimeout(placer, 120); });
    // la largeur des lignes change aussi sans redimensionner la fenêtre (barre de défilement, bandeaux, bande des vols) : on replace
    if (window.ResizeObserver) {
      var lw = 0, rq = 0;
      new ResizeObserver(function () { var w = L.clientWidth; if (w !== lw) { lw = w; cancelAnimationFrame(rq); rq = requestAnimationFrame(placer); } }).observe(L);
    }
  }
  PL.etiquettes = { placer: placer, init: init, bulle: bulle };
})(window.PL);
