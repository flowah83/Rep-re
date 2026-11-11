/* Pont·Line — temps.js : heure bord / Z, formats, durées. Aucune dépendance. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var MIN = 60000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Date UTC décalée de l'offset bord -> on lit les champs UTC pour obtenir l'heure bord
  function shifted(ms, offsetMin) { return new Date(ms + offsetMin * MIN); }

  function hm(ms, offsetMin) {
    var d = shifted(ms, offsetMin || 0);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }
  function hms(ms, offsetMin) {
    var d = shifted(ms, offsetMin || 0);
    return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
  }
  function z(ms) { return hm(ms, 0) + 'Z'; }

  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function dateBord(ms, offsetMin) {
    var d = shifted(ms, offsetMin || 0);
    return JOURS[d.getUTCDay()] + ' ' + pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1);
  }
  function dateIso(ms, offsetMin) { // AAAAMMJJ-HHMM en heure bord, pour les noms de fichiers
    var d = shifted(ms, offsetMin || 0);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + '-' + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
  }

  // "17:00", "1700", "17h00", "17h" -> minutes depuis minuit, ou null
  function parseHM(txt) {
    if (txt == null) return null;
    var s = String(txt).trim().toLowerCase().replace(/\s/g, '');
    var m = s.match(/^(\d{1,2})[:h.]?(\d{2})?$/);
    if (!m) return null;
    if (!m[2] && m[1].length > 2) return null;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
    if (s.length === 4 && /^\d{4}$/.test(s)) { h = parseInt(s.slice(0, 2), 10); mi = parseInt(s.slice(2), 10); }
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  // V4 : heure bord « HH:MM », ou heure Z si elle finit par Z (« 0430Z », « 04:30z ») -> minutes bord, ou null
  function lireHeure(txt, offsetMin) {
    if (txt == null) return null;
    var s = String(txt).trim().toLowerCase().replace(/\s/g, ''), z = /z$/.test(s);
    if (z) s = s.slice(0, -1);
    var m = parseHM(s); if (m == null) return null;
    return z ? (((m + (offsetMin || 0)) % 1440) + 1440) % 1440 : m;
  }

  // Durée stricte : "1h50", "1:50", "1 h 50", "2h", "90min", "90 mn" -> minutes, ou null.
  // Un nombre seul ("230") est REFUSÉ : 2 h 30 ou 230 min ? (audit V2.1, P0-1)
  function parseDuree(txt) {
    if (txt == null) return null;
    var s = String(txt).trim().toLowerCase().replace(/\s/g, '');
    if (s === '') return null;
    var m;
    if ((m = s.match(/^(\d{1,2})[h:](\d{2})?(min|mn)?$/))) {
      if (m[2] && parseInt(m[2], 10) > 59) return null;
      if (m[3] && !m[2]) return null;
      return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
    }
    if ((m = s.match(/^(\d{1,3})(min|mn|m)$/))) return parseInt(m[1], 10);
    return null;
  }
  // Même chose, avec un message clair quand la saisie est refusée
  function analyseDuree(txt) {
    var min = parseDuree(txt), s = String(txt == null ? '' : txt).trim().toLowerCase();
    if (min != null) return { min: min, err: null };
    var err = 'durée invalide : écrire par exemple « 1h50 » ou « 110min »';
    if (s === '') err = 'durée manquante (ex. 1h50)';
    else if (/kg|\blb|\bl\b|litre|livre|%/.test(s)) err = 'c\'est une quantité : saisir une DURÉE d\'autonomie (ex. « 1h20 »)';
    else if (/^\d+$/.test(s.replace(/\s/g, ''))) {
      var n = s.replace(/\s/g, ''), hh = n.length >= 3 && n.length <= 4 && parseInt(n.slice(-2), 10) <= 59 ? parseInt(n.slice(0, -2), 10) + 'h' + n.slice(-2) : null;
      err = 'préciser l\'unité : « ' + n + ' » veut dire ' + (hh ? '« ' + hh + ' » ou ' : '') + '« ' + n + 'min » ?';
    }
    else if (/[,.]/.test(s)) err = 'pas de virgule : écrire « 1h30 » plutôt que « 1,5 »';
    else if (/h\d$/.test(s.replace(/\s/g, ''))) err = 'minutes sur deux chiffres : « 1h05 »';
    else if (/[h:](\d{2})/.test(s) && parseInt(s.replace(/\s/g, '').split(/[h:]/)[1], 10) > 59) err = 'minutes de 00 à 59 (« 1h75 » refusé)';
    return { min: null, err: err };
  }
  // Début de texte qui ressemble à une durée (pour « Carburant : 1h20 secteur sud »)
  function dureeEnTete(txt) {
    var m = String(txt || '').match(/^\s*(\d{1,2}\s*[h:]\s*(?:\d{2})?(?:\s*(?:min|mn))?|\d{1,3}\s*(?:min|mn|m)(?![a-z])|\S+)\s*(.*)$/i);
    return m ? { tete: m[1], reste: m[2] } : { tete: '', reste: '' };
  }
  function fmtDuree(min) {
    if (min == null || isNaN(min)) return '—';
    var neg = min < 0; min = Math.abs(Math.round(min));
    var s = Math.floor(min / 60) + ' h ' + pad(min % 60);
    if (min < 60) s = min + ' min';
    return (neg ? '−' : '') + s;
  }

  // Début du jour bord (minuit heure bord) contenant ms, en ms UTC
  function debutJourBord(ms, offsetMin) {
    var d = shifted(ms, offsetMin);
    var minuitDecale = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return minuitDecale - offsetMin * MIN;
  }

  // Heure bord "HH:MM" + jour relatif (-1, 0, +1 par rapport au jour bord de refMs) -> ms UTC
  function versMs(minutesJour, jourRel, refMs, offsetMin) {
    return debutJourBord(refMs, offsetMin) + (jourRel * 1440 + minutesJour) * MIN;
  }

  // Heure bord la plus proche de refMs (fenêtre [ref - avantMin, ref + 1440 - avantMin[)
  function plusProche(minutesJour, refMs, offsetMin, avantMin) {
    if (avantMin == null) avantMin = 360;
    var base = versMs(minutesJour, 0, refMs, offsetMin);
    while (base < refMs - avantMin * MIN) base += 1440 * MIN;
    while (base >= refMs - avantMin * MIN + 1440 * MIN) base -= 1440 * MIN;
    return base;
  }

  // Jour relatif d'un instant par rapport au jour bord de refMs
  function jourRelatif(ms, refMs, offsetMin) {
    return Math.round((debutJourBord(ms, offsetMin) - debutJourBord(refMs, offsetMin)) / (1440 * MIN));
  }

  function offsetLabel(offsetMin) {
    var s = offsetMin < 0 ? '−' : '+';
    var a = Math.abs(offsetMin);
    return 'UTC' + s + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : '');
  }

  // Lettre de fuseau militaire pour un décalage entier (heures)
  function lettreFuseau(offsetMin) {
    if (offsetMin % 60 !== 0) return '';
    var h = offsetMin / 60;
    if (h === 0) return 'Z';
    var pos = 'ABCDEFGHIKLM', neg = 'NOPQRSTUVWXY';
    if (h > 0 && h <= 12) return pos.charAt(h - 1);
    if (h < 0 && h >= -12) return neg.charAt(-h - 1);
    return '';
  }

  var FUSEAUX_PARTIELS = [-570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765, 825];
  PL.temps = { FUSEAUX_PARTIELS: FUSEAUX_PARTIELS, MIN: MIN, pad: pad, hm: hm, hms: hms, z: z, dateBord: dateBord, dateIso: dateIso,
    parseHM: parseHM, lireHeure: lireHeure, parseDuree: parseDuree, analyseDuree: analyseDuree, dureeEnTete: dureeEnTete, fmtDuree: fmtDuree, debutJourBord: debutJourBord,
    versMs: versMs, plusProche: plusProche, jourRelatif: jourRelatif, offsetLabel: offsetLabel, lettreFuseau: lettreFuseau };
})(window.PL);
