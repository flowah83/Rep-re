/* Pont·Line — rapport.js : impression de la main courante et compte rendu de quart (→ PDF via l'impression). */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, esc = E.esc, MIN = T.MIN;

  function zone() {
    var div = document.getElementById('impression');
    if (!div) { div = document.createElement('div'); div.id = 'impression'; document.body.appendChild(div); }
    return div;
  }
  function lancer(html) {
    zone().innerHTML = html;
    document.body.classList.add('imprime');
    window.print();
    setTimeout(function () { document.body.classList.remove('imprime'); }, 500);
  }
  function lignesLog(log, off) {
    var cor = {}, h = '<table><tr><th>N°</th><th>Bord</th><th>Z</th><th>Vol</th><th>Type</th><th>Texte</th></tr>';
    PL.etat.data.log.forEach(function (l) { if (l.correctsId) cor[l.correctsId] = l.id; });
    log.forEach(function (l) {
      var m = Date.parse(l.at), o = typeof l.off === 'number' ? l.off : off; // V3 : fuseau de la ligne
      h += '<tr' + (cor[l.id] ? ' class="barre"' : '') + '><td>' + esc(l.id) + '</td><td>' + T.dateBord(m, o) + ' ' + T.hms(m, o) + (o !== off ? ' (' + T.offsetLabel(o) + ')' : '') + '</td><td>' + T.hm(m, 0) + 'Z</td><td>' +
        esc(l.callsign || '') + '</td><td>' + esc(E.LOG_TYPES[l.kind] || l.kind) + '</td><td>' + esc(l.text) +
        (l.correctsId ? ' (corrige #' + l.correctsId + ')' : '') + (cor[l.id] ? ' (corrigée par #' + cor[l.id] + ')' : '') + '</td></tr>';
    });
    return h + '</table>';
  }
  function entete(titre, off) {
    var now = Date.now();
    return '<h2>' + titre + ' — Pont·Line</h2><p>Édité le ' + T.dateBord(now, off) + ' à ' + T.hm(now, off) + ' bord (' + T.z(now) + '), fuseau ' + T.offsetLabel(off) +
      '. Outil d\'aide personnel, non certifié.</p>';
  }

  function mainCourante() {
    var d = PL.etat.data, off = d.settings.offsetMin;
    lancer(entete('Main courante', off) + lignesLog(d.log, off));
  }

  // Compte rendu de quart : vols et main courante sur la période [debut, fin]
  function compteRendu(debut, fin) {
    var d = PL.etat.data, off = d.settings.offsetMin;
    var vols = d.flights.filter(function (f) {
      if (f.deleted) return false;
      var e = E.etendue(f); return e[1] >= debut && e[0] <= fin;
    }).sort(function (a, b) { return E.decollage(a) - E.decollage(b); });
    var log = d.log.filter(function (l) { var m = Date.parse(l.at); return m >= debut && m <= fin; });
    var totalVol = 0, apps = 0, pax = 0, annules = 0;
    // V4 (audit V3b, P2-1) : chaque heure dans le fuseau du moment où elle a été saisie (fuseau de la ligne Décollage / Appontage)
    var offEvt = function (f, kind) { var o = null; d.log.forEach(function (l) { if (l.flightId === f.id && l.kind === kind && typeof l.off === 'number') o = l.off; }); return o == null ? off : o; };
    var cell = function (t, o) { return T.hm(t, o) + (o !== off ? ' <small>(' + T.offsetLabel(o) + ')</small>' : '') + '</td><td>' + T.hm(t, 0) + 'Z'; };
    var h = entete('Compte rendu de quart', off) +
      '<p>Période : ' + T.dateBord(debut, off) + ' ' + T.hm(debut, off) + ' → ' + T.dateBord(fin, off) + ' ' + T.hm(fin, off) + ' (heure bord).</p>' +
      '<h3>Vols</h3><table><tr><th>Indicatif</th><th>Type</th><th>Équipage</th><th>Pax</th><th>Mission</th><th>Décollage bord</th><th>Z</th><th>Appontage bord</th><th>Z</th><th>Durée</th><th>Statut</th></tr>';
    vols.forEach(function (f) {
      var dec = f.takeoffActual ? Date.parse(f.takeoffActual) : null, app = f.landingActual ? Date.parse(f.landingActual) : null;
      var duree = dec && app ? Math.round((app - dec) / MIN) : null;
      if (duree) totalVol += duree;
      if (app) apps++;
      var ann = E.statut(f) === 'annule'; if (ann) annules++; else pax += f.pax || 0;
      h += '<tr><td>' + esc(f.callsign) + (f.rotation > 1 ? ' <small>(rotation ' + esc(f.rotation) + ')</small>' : '') + '</td><td>' + esc(f.type) + '</td><td>' + esc(f.crew || '') + '</td><td>' + (ann ? '—' : (f.pax || 0)) + '</td><td>' + esc(f.mission || '') + '</td><td>' +
        (dec ? cell(dec, offEvt(f, 'dec')) : (ann ? 'annulé (prévu ' : 'prévu ') + T.hm(E.decollage(f), off) + (ann ? ')' : '') + '</td><td>' + T.hm(E.decollage(f), 0) + 'Z') + '</td><td>' + (app ? cell(app, offEvt(f, 'app')) : '—</td><td>—') + '</td><td>' + (duree ? T.fmtDuree(duree) : '—') + '</td><td>' +
        E.STATUT_NOMS[E.statut(f)] + '</td></tr>';
    });
    h += '</table><p>' + vols.length + ' vol(s) ou rotation(s)' + (annules ? ' dont ' + annules + ' annulé(s)' : '') + ' · ' + apps + ' appontage(s) · ' + T.fmtDuree(totalVol) + ' de vol réalisées · ' + pax + ' pax prévus/transportés (somme des rotations).</p>';
    h += '<h3>Main courante de la période (' + log.length + ' lignes)</h3>' + lignesLog(log, off);
    lancer(h);
    return { vols: vols.length, lignes: log.length };
  }

  PL.rapport = { mainCourante: mainCourante, compteRendu: compteRendu };
})(window.PL);
