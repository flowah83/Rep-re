/* Pont·Line — conflits.js : détection des chevauchements (pont unique) et incohérences de séquences.
   Calcul pur : ne modifie rien. Ignore les vols terminés / supprimés et les conflits déjà passés. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, MIN = T.MIN;
  var PONT = { mer: 1, ravito: 1, pax: 1 }, AIR = { vol: 1, treuil: 1, vertrep: 1 };

  function nomSeq(s) {
    if (s.label) return s.label;
    var t = PL.etat.SEQ_TYPES.filter(function (x) { return x[0] === s.kind; })[0];
    return t ? t[1] : s.kind;
  }

  // Occupations du pont d'un vol : séquences au pont + mouvements (décollage, appontage) ± marge
  function occupations(f, marge, now) {
    var E = PL.etat, occ = [];
    (f.sequences || []).forEach(function (s) {
      if (!PONT[s.kind]) return;
      var a = Date.parse(s.start), b = E.seqFin(s);
      occ.push({ a: a, b: b, quoi: nomSeq(s), seq: s.id, at: a });
    });
    var st = E.statut(f), dec = E.decollage(f);
    if (st === 'prevu' || (f.takeoffActual && Date.parse(f.takeoffActual) > now - marge * MIN)) {
      occ.push({ a: dec - marge * MIN, b: dec + marge * MIN, quoi: 'Décollage ' + T.hm(dec, PL.etat.data.settings.offsetMin), mvt: 'dec', at: dec });
    }
    var app = f.landingActual ? Date.parse(f.landingActual) : E.appontagePrevu(f);
    if (app != null) occ.push({ a: app - marge * MIN, b: app + marge * MIN, quoi: 'Appontage ' + T.hm(app, PL.etat.data.settings.offsetMin), mvt: 'app', at: app });
    return occ;
  }

  function calculer(data, now) {
    var E = PL.etat, s = data.settings, out = [], off = s.offsetMin;
    if (s.conflits === false) return out;
    var marge = s.conflictMarginMin != null ? s.conflictMarginMin : 5;
    var vols = data.flights.filter(function (f) { var st = E.statut(f); return st === 'prevu' || st === 'envol' || st === 'pose'; });
    var occ = vols.map(function (f) { return occupations(f, marge, now); });
    var plage = function (o) { return T.hm(o.a + (o.mvt ? marge * MIN : 0), off) + (o.mvt ? '' : '–' + T.hm(o.b, off)); };

    // 1. Pont occupé par deux vols en même temps (un seul avertissement par paire de vols)
    for (var i = 0; i < vols.length; i++) {
      for (var j = i + 1; j < vols.length; j++) {
        var lst = [];
        occ[i].forEach(function (x) {
          occ[j].forEach(function (y) {
            var a = Math.max(x.a, y.a), b = Math.min(x.b, y.b);
            if (a < b && b >= now) lst.push({ a: a, b: b, x: x, y: y }); // chevauchement à venir
          });
        });
        if (!lst.length) continue;
        lst.sort(function (u, v) { return u.a - v.a; });
        var p0 = lst[0], seqs = [], deb = p0.a, fin = p0.b;
        lst.forEach(function (o) { deb = Math.min(deb, o.a); fin = Math.max(fin, o.b); [o.x.seq, o.y.seq].forEach(function (id) { if (id && seqs.indexOf(id) < 0) seqs.push(id); }); });
        out.push({
          type: 'pont', vols: [vols[i].id, vols[j].id], seqs: seqs, debut: deb, fin: fin, nb: lst.length,
          cle: 'pont:' + vols[i].id + ':' + vols[j].id + ':' + (p0.x.seq || p0.x.mvt) + ':' + (p0.y.seq || p0.y.mvt),
          texte: 'Pont occupé deux fois vers ' + T.hm(p0.a, off) + ' : ' + vols[i].callsign + ' (' + p0.x.quoi + (p0.x.mvt ? '' : ' ' + plage(p0.x)) + ') et ' +
            vols[j].callsign + ' (' + p0.y.quoi + (p0.y.mvt ? '' : ' ' + plage(p0.y)) + ')' + (lst.length > 1 ? ' — ' + (lst.length - 1) + ' autre(s) chevauchement(s) entre ces deux vols' : '')
        });
      }
    }
    // 2. Même indicatif, deux vols qui se chevauchent (doublon probable)
    for (var k = 0; k < vols.length; k++) {
      for (var l = k + 1; l < vols.length; l++) {
        var f = vols[k], g = vols[l];
        if (f.callsign !== g.callsign) continue;
        var ef = E.etendue(f), eg = E.etendue(g), a2 = Math.max(ef[0], eg[0]), b2 = Math.min(ef[1], eg[1]);
        if (a2 < b2 && b2 >= now) out.push({ type: 'doublon', vols: [f.id, g.id], seqs: [], debut: a2, fin: b2, cle: 'doublon:' + f.id + ':' + g.id,
          texte: 'Deux vols ' + f.callsign + ' se chevauchent (' + T.hm(a2, off) + '–' + T.hm(b2, off) + ') : doublon ?' });
      }
    }
    // 3. Dans un même vol : séquence au pont pendant une séquence en vol
    vols.forEach(function (f) {
      var seqs = f.sequences || [];
      for (var m = 0; m < seqs.length; m++) {
        for (var n = 0; n < seqs.length; n++) {
          var p = seqs[m], q = seqs[n];
          if (!(p.kind === 'mer' || p.kind === 'ravito') || !AIR[q.kind]) continue;
          var a3 = Math.max(Date.parse(p.start), Date.parse(q.start)), b3 = Math.min(E.seqFin(p), E.seqFin(q));
          if (a3 < b3 && b3 >= now) out.push({ type: 'sequence', vols: [f.id], seqs: [p.id, q.id], debut: a3, fin: b3, cle: 'seq:' + f.id + ':' + p.id + ':' + q.id,
            texte: f.callsign + ' : « ' + nomSeq(p) + ' » chevauche « ' + nomSeq(q) + ' » (' + T.hm(a3, off) + '–' + T.hm(b3, off) + ')' });
        }
      }
    });
    out.sort(function (x, y) { return x.debut - y.debut; });
    return out;
  }

  function pourVol(liste, id) { return liste.filter(function (c) { return c.vols.indexOf(id) >= 0; }); }

  PL.conflits = { calculer: calculer, pourVol: pourVol, occupations: occupations };
})(window.PL);
