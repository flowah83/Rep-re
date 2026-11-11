/* Pont·Line — alertes.js : alertes d'autonomie, prochain événement. Calcul pur (état + heure). */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, MIN = T.MIN;

  // Renvoie les alertes triées (danger > warn > info), plus urgentes d'abord
  function calculer(data, now) {
    var E = PL.etat, off = data.settings.offsetMin, out = [];
    data.flights.forEach(function (f) {
      var st = E.statut(f);
      if (st !== 'envol' && st !== 'prevu') return;
      var fin = E.finAuto(f), h30 = E.h30At(f), app = E.appontagePrevu(f);
      var reste = Math.round((fin - now) / MIN);
      var cs = f.callsign;
      // V3 : un vol « prévu » dont l'heure de décollage est passée est surveillé comme s'il avait décollé
      // à l'heure prévue (on ne sait pas s'il est parti : mieux vaut une alerte de trop qu'un silence).
      var dec = E.decollage(f), oublie = st === 'prevu' && now >= dec;
      var suff = oublie ? ' (décollage non saisi, calcul sur l\'heure prévue)' : '';
      if (st === 'envol' || oublie) {
        if (reste <= 0) out.push({ niveau: 'danger', cle: f.id + ':depasse', vol: f.id, texte: cs + ' : fin d\'autonomie DÉPASSÉE (' + T.hm(fin, off) + ')' + suff });
        else if (now >= h30) out.push({ niveau: 'warn', cle: f.id + ':h30', vol: f.id, texte: cs + ' : H-30 passé — fin d\'autonomie ' + T.hm(fin, off) + ' (dans ' + T.fmtDuree(reste) + ')' + suff });
      }
      if (app != null && app > fin) {
        out.push({ niveau: 'danger', cle: f.id + ':app>' + app, vol: f.id, texte: cs + ' : appontage prévu ' + T.hm(app, off) + ' APRÈS la fin d\'autonomie ' + T.hm(fin, off) });
      } else if (app != null && app > h30) {
        out.push({ niveau: 'warn', cle: f.id + ':apph30>' + app, vol: f.id, texte: cs + ' : appontage prévu ' + T.hm(app, off) + ' après H-30 (' + T.hm(h30, off) + ')' });
      }
      // V5 : rappel « ops normal » : contact radio attendu toutes les N min (orange, un seul bip par rappel ; acquitté, il revient à l'intervalle suivant)
      var ops = st === 'envol' && E.opsEnRetard ? E.opsEnRetard(f, now) : null;
      if (ops) out.push({ niveau: 'warn', cle: f.id + ':ops:' + ops.dernier + ':' + ops.rappel, vol: f.id, action: { radio: f.id }, ops: true,
        texte: cs + ' : OPS NORMAL attendu — dernier contact radio ' + T.hm(ops.dernier, off) + ' (il y a ' + T.fmtDuree(ops.minutes) + ')' });
      if (st === 'prevu' && now - dec > 10 * MIN) {
        out.push({ niveau: 'warn', cle: f.id + ':retard', vol: f.id, action: { decolle: f.id, t: dec },
          texte: cs + ' : décollage prévu à ' + T.hm(dec, off) + ' NON SAISI — est-il parti ?' });
      }
    });
    // Rappel d'export en fin de quart
    var fq = T.parseHM(data.settings.finQuart);
    if (fq != null) {
      var finQ = T.plusProche(fq, now, off, 720);
      var dernier = data.lastExport ? Date.parse(data.lastExport) : 0;
      if (now >= finQ - 15 * MIN && now <= finQ + 60 * MIN && dernier < finQ - 15 * MIN) {
        out.push({ niveau: 'info', cle: 'quart:' + finQ, texte: 'Fin de quart à ' + T.hm(finQ, off) + ' : pensez à exporter la sauvegarde (Données → Exporter).' });
      }
    }
    // V5.3 : rappels de pont programmé et de ravitaillement programmé (orange, un bip, jamais de changement automatique)
    if (E.rappelsPont) E.rappelsPont(now).forEach(function (r) {
      var p = r.plan, fin = r.phase === 'fin', dk = fin ? (p.deck === 'vert' ? 'rouge' : 'vert') : p.deck, z = off ? ' (' + T.hm(r.at, 0) + 'Z)' : '';
      out.push({ niveau: 'warn', cle: 'pont:' + p.id + ':' + r.phase + ':' + p.start + ':' + (p.end || ''), action: { pont: p.id, phase: r.phase, deck: dk }, pont: true,
        texte: fin ? 'Fin du pont ' + p.deck + ' prévue ' + T.hm(r.at, off) + z + ' — passer au pont ' + dk + ' ?' : 'Pont ' + p.deck + ' prévu ' + T.hm(r.at, off) + z + ' — confirmer ?' });
    });
    if (E.rappelsRavito) E.rappelsRavito(now).forEach(function (r) {
      out.push({ niveau: 'warn', cle: 'ravito:' + r.seq.id + ':' + r.seq.start, vol: r.vol.id, action: { ravito: r.vol.id, seq: r.seq.id }, ravito: true,
        texte: r.vol.callsign + ' : ravitaillement prévu ' + T.hm(r.at, off) + (off ? ' (' + T.hm(r.at, 0) + 'Z)' : '') + ' — confirmer ?' });
    });
    var rang = { danger: 0, warn: 1, info: 2 };
    // audit V5 : le rappel « ops normal » passe APRÈS les autres alertes orange (décollage non saisi, H-30…), pour ne jamais les cacher
    var r = function (x) { return rang[x.niveau] + (x.ops ? 0.5 : (x.pont || x.ravito) ? 0.3 : 0); };
    out.sort(function (a, b) { return r(a) - r(b); });
    return out;
  }

  // Prochain événement prévu (décollage, appontage, H-30, fin d'autonomie)
  function prochain(data, now) {
    var E = PL.etat, best = null;
    function cand(t, txt) { if (t != null && t > now && (!best || t < best.t)) best = { t: t, texte: txt }; }
    data.flights.forEach(function (f) {
      var st = E.statut(f);
      if (st === 'prevu') cand(E.decollage(f), 'Décollage ' + f.callsign);
      if (st === 'envol' || (st === 'prevu' && now >= E.decollage(f))) {
        cand(E.appontagePrevu(f), 'Appontage ' + f.callsign);
        cand(E.h30At(f), 'H-30 ' + f.callsign);
        cand(E.finAuto(f), 'Fin d\'autonomie ' + f.callsign);
      }
    });
    return best;
  }

  PL.alertes = { calculer: calculer, prochain: prochain };
})(window.PL);
