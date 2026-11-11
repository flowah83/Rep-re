/* Pont·Line — timeline.js : axe des heures, lignes de vol, séquences, repères, barre « maintenant ». */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, esc = E.esc;
  var vue = { suivi: true, debut: null };

  function fenetre(now) {
    var span = (PL.etat.data.settings.zoomH || 6) * 60 * MIN;
    var debut = vue.suivi || vue.debut == null ? now - span / 3 : vue.debut;
    return { debut: debut, fin: debut + span, span: span };
  }
  function pas(zoomH) { return { 2: [15, 30], 6: [30, 60], 12: [60, 120], 24: [120, 240] }[zoomH] || [30, 60]; }

  function ticks(w, off, avecLabels) {
    var p = pas(PL.etat.data.settings.zoomH), step = p[0] * MIN, lab = p[1] * MIN;
    var j0 = T.debutJourBord(w.debut, off);
    var t = j0 + Math.ceil((w.debut - j0) / step) * step, h = '';
    for (; t <= w.fin; t += step) {
      var pc = (t - w.debut) / w.span * 100;
      var majeur = ((t - j0) % (60 * MIN)) === 0;
      h += '<div class="tick' + (majeur ? ' h' : '') + '" style="left:' + pc + '%"></div>';
      if (avecLabels && ((t - j0) % lab) === 0) h += '<div class="tickl' + (pc < 6 ? ' bordg' : pc > 94 ? ' bordd' : '') + '" style="left:' + pc + '%">' + T.hm(t, off) + (off ? '<small>' + T.hm(t, 0).replace(':', '') + 'Z</small>' : '') + '</div>'; // V4 (P2-2) : heure Z sous l'heure bord
    }
    return h;
  }
  function pc(t, w) { return (t - w.debut) / w.span * 100; }
  function bloc(a, b, w, cls, html, extra) {
    if (b < w.debut || a > w.fin) return '';
    var l = Math.max(pc(a, w), -1), r = Math.min(pc(b, w), 101);
    return '<div class="' + cls + '" style="left:' + l + '%;width:' + Math.max(r - l, 0.4) + '%"' + (extra || '') + '>' + (html || '') + '</div>';
  }
  function repere(t, w, cls, label, aDroite) {
    if (t == null || t < w.debut || t > w.fin) return '';
    var p = pc(t, w), h = '<div class="repere ' + cls + '" style="left:' + p + '%"></div>';
    if (label) {
      var style = 'left:' + p + '%';
      // près des bords : on retourne l'étiquette pour qu'elle reste visible
      if (aDroite && p > 86) style += ';transform:translateX(-100%);padding-right:5px;padding-left:0';
      if (!aDroite && p < 12) style += ';transform:none;padding-left:5px;padding-right:0';
      h += '<div class="reperel ' + cls + '" style="' + style + '">' + esc(label) + '</div>';
    }
    return h;
  }
  function ligneMaint(now, w) {
    if (now < w.debut || now > w.fin) return '';
    return '<div class="maint" style="left:' + pc(now, w) + '%"></div>';
  }

  function render(now) {
    var d = PL.etat.data, off = d.settings.offsetMin, w = fenetre(now);
    var axe = '<div class="zone-lab">Heure bord (' + esc(T.lettreFuseau(off) || T.offsetLabel(off)) + ')' + (off ? '<small>dessous : Z</small>' : '') + '</div><div class="zone-piste">' + ticks(w, off, true);
    if (now >= w.debut && now <= w.fin) axe += '<div class="maintl" style="left:' + pc(now, w) + '%">' + T.hm(now, off) + '</div>';
    axe += '</div>';
    PL.ui.poser(document.getElementById('tlAxe'), axe);

    var fond = ticks(w, off, false), html = '';
    // ligne de l'état du pont
    var deck = d.log.filter(function (l) { return l.kind === 'deck'; }), segs = '';
    deck.forEach(function (l, i) {
      var a = Date.parse(l.at), b = i + 1 < deck.length ? Date.parse(deck[i + 1].at) : Math.max(now, a);
      segs += bloc(a, b, w, 'pontseg ' + (l.deck === 'vert' ? 'vert' : 'rouge'));
    });
    // V5.3 : pont programmé (bande hachurée en bas de la ligne ; le réel reste en plein, en haut)
    var plans = (d.deckPlans || []).filter(function (p) { return p.statut === 'prevu' || p.statutFin === 'prevu'; }), prog = '';
    plans.forEach(function (p, i) {
      var a = Date.parse(p.start), b = p.end ? Date.parse(p.end) : a + 30 * MIN, lib = p.deck + ' ' + T.hm(a, off) + (p.end ? '–' + T.hm(b, off) : ' →');
      prog += bloc(a, b, w, 'pontplan ' + p.deck + (p.end ? '' : ' ouvert') + (p.statut === 'fait' ? ' commence' : ''), '<span>' + esc(lib) + '</span>',
        ' data-plan="' + esc(p.id) + '" title="' + esc('Pont ' + p.deck + ' PRÉVU ' + T.hm(a, off) + (p.end ? ' → ' + T.hm(b, off) : '') + ' — cliquer pour modifier ou supprimer') + '"');
    });
    html += '<div class="lane pont"><div class="lab pontlab" tabindex="0" role="group" aria-label="État du pont : Entrée ou P pour programmer pont vert ou rouge à une heure">ÉTAT DU PONT<small class="pont-aide">clic = programmer</small></div><div class="piste" title="Cliquer à une heure pour programmer pont vert / rouge">' + fond + segs + prog + ligneMaint(now, w) + '</div></div>';

    var tous = E.volsVisibles(d.settings.showDone), conf = PL.conflitsCourants || [];
    // V3 : une ligne seulement pour les vols en l'air ou visibles dans la fenêtre affichée (les autres sont comptés)
    var vols = tous.filter(function (f) { if (E.statut(f) === 'envol') return true; var e = E.etendue(f); return e[1] >= w.debut && e[0] <= w.fin; });
    var caches = tous.length - vols.length;
    if (!tous.length) html += '<div class="vide">Aucun vol pour l\'instant. Appuyez sur « + Vol » pour en créer un.</div>';
    vols.forEach(function (f) {
      var st = E.statut(f), fin = E.finAuto(f), h30 = E.h30At(f);
      var actif = st === 'envol' || st === 'prevu';
      var lab = '<b>' + (PL.conflits.pourVol(conf, f.id).length ? '<span class="conf-ico" title="Conflit de planning">⚠</span> ' : '') + esc(f.callsign) + (f.rotation > 1 ? ' <small>rot. ' + esc(f.rotation) + '</small>' : '') + ' <small class="tyc">' + esc(f.type) + '</small></b><span>' + esc(f.type) + (f.crew ? ' · ' + esc(f.crew) : '') + '</span>' +
        '<span>' + (f.pax ? esc(f.pax) + ' pax' : '0 pax') + (f.mission ? ' · ' + esc(f.mission) : '') + '</span>' +
        '<span class="pill ' + st + '">' + E.STATUT_NOMS[st] + '</span>' +
        (st === 'prevu' ? '<button class="btn petit act" data-act="dec" data-vol="' + esc(f.id) + '" title="Décollage de ' + esc(f.callsign) + '">Décollage</button>' :
          st === 'envol' ? '<button class="btn petit act" data-act="app" data-vol="' + esc(f.id) + '" title="Appontage de ' + esc(f.callsign) + '">Appontage</button>' : ''); // V4 (P2-10)
      var p = fond, cf = PL.conflits.pourVol(conf, f.id), seqConf = {};
      cf.forEach(function (c) {
        c.seqs.forEach(function (sid) { seqConf[sid] = true; });
        p += bloc(c.debut, Math.max(c.fin, c.debut + MIN), w, 'conf-zone', '', ' title="' + esc(c.texte) + '" data-vol="' + esc(f.id) + '"');
      });
      if (actif) {
        p += bloc(h30, fin, w, 'reserve');
      }
      var seqs = f.sequences || [];
      // V5 : sans séquence de vol (ex. seulement un ravito ajouté par clic), le bloc « Vol » par défaut reste dessous
      var volant = seqs.some(function (s) { return s.kind === 'vol' || s.kind === 'treuil' || s.kind === 'vertrep'; });
      if (!volant) {
        var a0 = E.decollage(f), b0 = f.landingActual ? Date.parse(f.landingActual) : (E.appontagePrevu(f) || fin);
        var cls0 = 'seg vol' + (b0 <= now && st !== 'envol' ? ' passe' : (a0 > now ? ' futur' : ''));
        p += bloc(a0, b0, w, cls0, '<b>Vol' + (f.mission ? ' · ' + esc(f.mission) : '') + '</b><small>' + T.hm(a0, off) + '–' + T.hm(b0, off) + '</small>', ' data-vol="' + esc(f.id) + '"');
      }
      if (seqs.length) {
        seqs.forEach(function (s) {
          var a = Date.parse(s.start), b = E.seqFin(s);
          var cls = 'seg ' + s.kind + (b <= now ? ' passe' : (a > now ? ' futur' : '')) + (seqConf[s.id] ? ' conflit' : '');
          var nom = s.label || (E.SEQ_TYPES.filter(function (x) { return x[0] === s.kind; })[0] || ['', ''])[1];
          p += bloc(a, b, w, cls, '<b>' + esc(nom) + '</b><small>' + T.hm(a, off) + '–' + T.hm(b, off) + '</small>', ' data-vol="' + esc(f.id) + '"');
        });
      }
      // V4 (audit V3b, P2-8) : vol encore en l'air après l'appontage prévu / la fin d'autonomie : prolongé jusqu'à maintenant
      if (st === 'envol') {
        var finPrevue = E.appontagePrevu(f) || fin; // V5 : suit l'ETA (appontage prévu, sinon fin des séquences de vol)
        if (now > finPrevue && finPrevue < fin) p += bloc(finPrevue, Math.min(now, fin), w, 'seg prolonge', '<b>En vol</b><small>appontage prévu dépassé</small>', ' data-vol="' + esc(f.id) + '"');
        if (now > fin) p += bloc(fin, now, w, 'seg depasse', '<b>+' + T.fmtDuree(Math.round((now - fin) / MIN)) + '</b><small>au-delà de la fin d\'autonomie</small>', ' data-vol="' + esc(f.id) + '" title="' + esc(f.callsign) + ' en l\'air au-delà de sa fin d\'autonomie"');
      }
      if (f.takeoffActual) { var ta = Date.parse(f.takeoffActual); if (ta >= w.debut && ta <= w.fin) p += '<div class="evt" style="left:' + pc(ta, w) + '%">▲ ' + T.hm(ta, off) + '</div>'; }
      if (f.landingActual) { var la = Date.parse(f.landingActual); if (la >= w.debut && la <= w.fin) p += '<div class="evt" style="left:' + pc(la, w) + '%">▼ ' + T.hm(la, off) + '</div>'; }
      if (actif) {
        p += repere(h30, w, 'h30', 'H-30 ' + T.hm(h30, off), false);
        p += repere(fin, w, 'fin', 'Fin auto. ' + T.hm(fin, off), true);
      }
      p += ligneMaint(now, w);
      html += '<div class="lane" data-vol="' + esc(f.id) + '"><div class="lab" data-vol="' + esc(f.id) + '" tabindex="0" role="group" aria-label="' + esc(f.callsign + ', ' + E.STATUT_NOMS[st] + (actif ? ', H-30 ' + T.hm(h30, off) + ', fin d\'autonomie ' + T.hm(fin, off) : '') + ' — Entrée pour ouvrir la fiche, S pour ajouter une séquence') + '">' + lab + '</div><div class="piste" data-vol="' + esc(f.id) + '">' + p + '</div></div>';
    });
    if (caches) html += '<div class="vide hors" id="tlHors">' + caches + ' autre' + (caches > 1 ? 's vols' : ' vol') + ' en dehors de la fenêtre affichée (◀ ▶ ou zoom pour ' + (caches > 1 ? 'les' : 'le') + ' voir).</div>';
    PL.ui.poser(document.getElementById('tlLanes'), html); // V4 (P2-7) : focus et défilement gardés

    var z = document.querySelectorAll('#zoom button');
    for (var i = 0; i < z.length; i++) z[i].classList.toggle('actif', +z[i].getAttribute('data-z') === d.settings.zoomH);
    document.getElementById('tlMaint').classList.toggle('actif', vue.suivi);
    var sansCartes = cartesMasquees();
    document.body.classList.toggle('sans-cartes', sansCartes);
    // V6 : « Afficher les » / « Masquer les » se masque sur un écran étroit (le texte complet reste en infobulle)
    var bc = document.getElementById('btnCartes'), bt = document.getElementById('btnTermines'), mc = sansCartes ? 'Afficher les ' : 'Masquer les ', mt = d.settings.showDone ? 'Masquer les ' : 'Afficher les ';
    bc.innerHTML = '<span class="mot">' + mc + '</span>cartes'; bc.title = mc + 'cartes';
    bt.innerHTML = '<span class="mot">' + mt + '</span>vols terminés'; bt.title = mt + 'vols terminés';
  }

  // V4 (P2-9) : réglage automatique (null) : cartes masquées sur un écran de moins de 800 px de haut
  function cartesMasquees() { var h = PL.etat.data.settings.hideCards; return h !== false; } // V5.1 : la bande des vols remplace les cartes ; « Afficher les cartes » les remet
  function deplacer(sens) {
    var w = fenetre(Date.now());
    vue.suivi = false; vue.debut = w.debut + sens * w.span / 2;
    PL.ui.renderTout();
  }
  function init() {
    document.getElementById('zoom').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      PL.etat.data.settings.zoomH = +b.getAttribute('data-z');
      PL.stockage.save(); PL.ui.renderTout();
    });
    document.getElementById('tlAvant').addEventListener('click', function () { deplacer(-1); });
    document.getElementById('tlApres').addEventListener('click', function () { deplacer(1); });
    document.getElementById('tlMaint').addEventListener('click', function () { vue.suivi = true; PL.ui.renderTout(); });
    document.getElementById('btnTermines').addEventListener('click', function () {
      PL.etat.data.settings.showDone = !PL.etat.data.settings.showDone; PL.stockage.save(); PL.ui.renderTout();
    });
    document.getElementById('btnCartes').addEventListener('click', function () {
      PL.etat.data.settings.hideCards = !cartesMasquees(); PL.stockage.save(); PL.ui.renderTout();
    });
    document.getElementById('tlLanes').addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]'); if (a) { PL.journal.actionVol(a.getAttribute('data-vol'), a.getAttribute('data-act')); return; }
      var el = e.target.closest('[data-vol]'); if (el) PL.vols.ouvrir(el.getAttribute('data-vol'));
    });
    document.getElementById('tlLanes').addEventListener('keydown', function (e) { // V4 (P2-11)
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('lab') && e.target.hasAttribute('data-vol')) { e.preventDefault(); PL.vols.ouvrir(e.target.getAttribute('data-vol')); }
    });
  }

  PL.timeline = { render: render, init: init, vue: vue, fenetre: fenetre };
})(window.PL);
