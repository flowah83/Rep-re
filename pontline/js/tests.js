/* Pont·Line — tests automatiques des calculs (ouvrir tests.html). Aucune donnée réelle touchée. */
(function () {
  'use strict';
  var T = PL.temps, E = PL.etat, MIN = T.MIN, ok = 0, ko = 0, liste = document.getElementById('liste');
  function eq(nom, obtenu, attendu) {
    var bon = JSON.stringify(obtenu) === JSON.stringify(attendu);
    if (bon) ok++; else ko++;
    var li = document.createElement('li'); li.className = bon ? 'ok' : 'ko';
    li.textContent = (bon ? '✔ ' : '✘ ') + nom + (bon ? '' : ' — obtenu ' + JSON.stringify(obtenu) + ', attendu ' + JSON.stringify(attendu));
    liste.appendChild(li);
  }
  var Z = function (s) { return Date.parse(s); };

  // --- formats et analyses ---
  eq('parseHM 17:00', T.parseHM('17:00'), 1020);
  eq('parseHM 1700', T.parseHM('1700'), 1020);
  eq('parseHM 17h05', T.parseHM('17h05'), 1025);
  eq('parseHM 9:30', T.parseHM('9:30'), 570);
  eq('parseHM 930', T.parseHM('930'), 570);
  eq('parseHM 00:00', T.parseHM('00:00'), 0);
  eq('parseHM 24:00 refusé', T.parseHM('24:00'), null);
  eq('parseHM 12:60 refusé', T.parseHM('12:60'), null);
  eq('parseHM texte refusé', T.parseHM('abc'), null);
  eq('parseDuree 1h50', T.parseDuree('1h50'), 110);
  eq('parseDuree 1:50', T.parseDuree('1:50'), 110);
  eq('parseDuree 1 h 50', T.parseDuree('1 h 50'), 110);
  eq('parseDuree 2h', T.parseDuree('2h'), 120);
  eq('parseDuree 95 seul : refusé depuis la V3 (unité obligatoire)', T.parseDuree('95'), null);
  eq('parseDuree 95min', T.parseDuree('95min'), 95);
  eq('parseDuree 30min', T.parseDuree('30min'), 30);
  eq('parseDuree vide', T.parseDuree(''), null);
  eq('fmtDuree 110', T.fmtDuree(110), '1 h 50');
  eq('fmtDuree 45', T.fmtDuree(45), '45 min');
  eq('fmtDuree -20', T.fmtDuree(-20), '−20 min');

  // --- heure bord / Z ---
  var t = Z('2026-11-11T14:42:00Z');
  eq('Z 14:42', T.z(t), '14:42Z');
  eq('bord UTC+1', T.hm(t, 60), '15:42');
  eq('bord UTC-4', T.hm(t, -240), '10:42');
  eq('bord UTC+5:30', T.hm(t, 330), '20:12');
  eq('lettre A', T.lettreFuseau(60), 'A');
  eq('lettre B', T.lettreFuseau(120), 'B');
  eq('lettre M', T.lettreFuseau(720), 'M');
  eq('lettre Q', T.lettreFuseau(-240), 'Q');
  eq('lettre Z', T.lettreFuseau(0), 'Z');
  eq('libellé UTC+1', T.offsetLabel(60), 'UTC+1');
  eq('date bord', T.dateBord(t, 60), 'mer. 11/11');
  // minuit bord à UTC+1 : 23:00Z la veille
  eq('début jour bord', new Date(T.debutJourBord(t, 60)).toISOString(), '2026-11-10T23:00:00.000Z');
  eq('début jour bord (23:30Z = 00:30 bord le 12)', new Date(T.debutJourBord(Z('2026-11-11T23:30:00Z'), 60)).toISOString(), '2026-11-11T23:00:00.000Z');
  eq('versMs 17:00 aujourd\'hui', new Date(T.versMs(1020, 0, t, 60)).toISOString(), '2026-11-11T16:00:00.000Z');
  eq('versMs 01:00 demain', new Date(T.versMs(60, 1, t, 60)).toISOString(), '2026-11-12T00:00:00.000Z');

  // --- passage de minuit ---
  var soir = Z('2026-11-11T22:20:00Z'); // 23:20 bord
  eq('plusProche 00:30 après 23:20 -> lendemain', new Date(T.plusProche(30, soir, 60, 360)).toISOString(), '2026-11-11T23:30:00.000Z');
  eq('plusProche 22:00 avant 23:20 -> même jour', new Date(T.plusProche(1320, soir, 60, 360)).toISOString(), '2026-11-11T21:00:00.000Z');
  eq('plusProche avant=0 : 23:00 depuis 23:20 -> lendemain', new Date(T.plusProche(1380, soir, 60, 0)).toISOString(), '2026-11-12T22:00:00.000Z');
  eq('jourRelatif lendemain', T.jourRelatif(T.plusProche(30, soir, 60, 360), soir, 60), 1);

  var volNuit = { callsign: 'TEST 1', type: 'PTR', takeoffPlanned: '2026-11-11T22:30:00.000Z', enduranceMin: 110, sequences: [] };
  eq('fin auto. après minuit (bord)', T.hm(E.finAuto(volNuit), 60), '01:20');
  eq('fin auto. après minuit (date bord)', T.dateBord(E.finAuto(volNuit), 60), 'jeu. 12/11');
  eq('H-30 = fin − 30 min (après minuit)', T.hm(E.h30At(volNuit), 60), '00:50');
  volNuit.sequences = [{ id: 's', kind: 'vol', start: '2026-11-11T22:30:00.000Z', dur: 90 }];
  eq('appontage prévu = fin des séquences de vol', T.hm(E.appontagePrevu(volNuit), 60), '01:00');

  // --- autonomie ---
  var v = { callsign: 'TEST 2', type: 'CMN', takeoffPlanned: '2026-11-11T14:00:00.000Z', enduranceMin: 120, sequences: [] };
  eq('fin auto. depuis décollage prévu', E.finAuto(v), Z('2026-11-11T16:00:00Z'));
  v.takeoffActual = '2026-11-11T14:10:00.000Z';
  eq('fin auto. depuis décollage réel', E.finAuto(v), Z('2026-11-11T16:10:00Z'));
  v.fuel = { at: '2026-11-11T15:00:00.000Z', min: 50 };
  eq('fin auto. recalée par le carburant', E.finAuto(v), Z('2026-11-11T15:50:00Z'));
  eq('H-30 suit la fin recalée par le carburant', E.h30At(v), Z('2026-11-11T15:20:00Z'));
  eq('statut en vol', E.statut(v), 'envol');
  v.landingActual = '2026-11-11T15:40:00.000Z';
  eq('statut posé', E.statut(v), 'pose');

  // --- alertes ---
  var data = E.etatVide();
  var a1 = { id: 'a1', callsign: 'ALPHA', type: 'PTR', takeoffPlanned: '2026-11-11T14:00:00.000Z', takeoffActual: '2026-11-11T14:00:00.000Z', enduranceMin: 120, sequences: [] };
  data.flights = [a1];
  var niv = function (iso) { var r = PL.alertes.calculer(data, Z(iso)).filter(function (a) { return !a.ops; }); return r.length ? r[0].niveau + ':' + r[0].cle.split(':')[1] : 'aucune'; };
  eq('alerte : aucune à 1h restante', niv('2026-11-11T15:00:00Z'), 'aucune');
  eq('alerte : aucune juste avant H-30', niv('2026-11-11T15:29:00Z'), 'aucune');
  eq('alerte : orange à H-30', niv('2026-11-11T15:30:00Z'), 'warn:h30');
  eq('alerte : toujours orange 5 min avant la fin', niv('2026-11-11T15:55:00Z'), 'warn:h30');
  eq('alerte : rouge à la fin d\'autonomie', niv('2026-11-11T16:00:00Z'), 'danger:depasse');
  eq('alerte : rouge après la fin d\'autonomie', niv('2026-11-11T16:01:00Z'), 'danger:depasse');
  a1.landingPlanned = '2026-11-11T15:40:00.000Z';
  eq('alerte : appontage prévu après H-30', niv('2026-11-11T15:00:00Z'), 'warn:apph30>' + Z('2026-11-11T15:40:00Z'));
  a1.landingPlanned = '2026-11-11T16:10:00.000Z';
  eq('alerte : appontage prévu après fin d\'autonomie', niv('2026-11-11T15:00:00Z'), 'danger:app>' + Z('2026-11-11T16:10:00Z'));
  a1.landingPlanned = null; a1.landingActual = '2026-11-11T15:50:00.000Z';
  eq('alerte : aucune une fois posé', niv('2026-11-11T16:05:00Z'), 'aucune');
  var p = { id: 'p', callsign: 'BRAVO', type: 'DPN', takeoffPlanned: '2026-11-11T14:00:00.000Z', enduranceMin: 90, sequences: [] };
  data.flights = [p];
  eq('rappel : décollage prévu non saisi (orange depuis la V3)', niv('2026-11-11T14:15:00Z'), 'warn:retard');
  data.flights = [];
  data.settings.finQuart = '18:00';
  eq('rappel export fin de quart', niv('2026-11-11T16:50:00Z'), 'info:' + Z('2026-11-11T17:00:00Z'));
  data.lastExport = '2026-11-11T16:50:00.000Z';
  eq('pas de rappel si export récent', niv('2026-11-11T16:55:00Z'), 'aucune');

  // --- prochain événement ---
  data = E.etatVide();
  data.flights = [{ id: 'x', callsign: 'X', type: 'PTR', takeoffPlanned: '2026-11-11T14:00:00.000Z', takeoffActual: '2026-11-11T14:00:00.000Z', enduranceMin: 120, sequences: [], landingPlanned: '2026-11-11T15:20:00.000Z' }];
  var pr = PL.alertes.prochain(data, Z('2026-11-11T15:00:00Z'));
  eq('prochain = H-30 si avant l\'appontage', (function () { var r = PL.alertes.prochain(data, Z('2026-11-11T15:21:00Z')); return r.texte + '@' + new Date(r.t).toISOString(); })(), 'H-30 X@2026-11-11T15:30:00.000Z');
  eq('prochain = appontage', pr.texte + '@' + new Date(pr.t).toISOString(), 'Appontage X@2026-11-11T15:20:00.000Z');

  // --- import démo recalé ---
  var demo = { app: 'pontline', schemaVersion: 1, demoNow: '2026-01-01T12:00:00.000Z', settings: {}, flights: [{ id: 'd', callsign: 'D', type: 'PTR', takeoffPlanned: '2026-01-01T11:00:00.000Z', enduranceMin: 100, sequences: [{ id: 's', kind: 'vol', start: '2026-01-01T11:00:00.000Z', dur: 60 }] }], log: [{ id: 1, at: '2026-01-01T11:59:00.000Z', kind: 'note', text: 'x' }] };
  var avant = Date.now(), r = PL.stockage.analyserImport(JSON.stringify(demo)), apres = Date.now();
  var dec = Date.parse(r.flights[0].takeoffPlanned);
  eq('démo recalée : décollage 1 h avant maintenant', dec >= avant - 60 * MIN - 5 && dec <= apres - 60 * MIN + 5, true);
  eq('démo recalée : séquence suit', Date.parse(r.flights[0].sequences[0].start) === dec, true);
  eq('démo marquée', r.settings.demo, true);
  eq('nextLogId recalculé', r.nextLogId, 2);
  var refus = false; try { PL.stockage.analyserImport('{"app":"autre"}'); } catch (e) { refus = true; }
  eq('import refusé si pas Pont·Line', refus, true);

  // --- normalisation ---
  var n = E.normaliser({ app: 'pontline', flights: [{ id: 'q', callsign: 'Q', takeoffPlanned: '2026-11-11T10:00:00.000Z' }], log: [{ id: 7, at: '2026-11-11T10:00:00.000Z' }] });
  eq('normaliser : séquences ajoutées', Array.isArray(n.flights[0].sequences), true);
  eq('normaliser : réglages par défaut', n.settings.offsetMin, 60);
  eq('normaliser : nextLogId', n.nextLogId, 8);
  eq('échappement HTML', E.esc('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');

  // ===================== V2 =====================
  // --- conflits de pont ---
  var cd = E.etatVide(), now = Z('2026-11-11T09:00:00Z');
  PL.etat.data = cd; // les libellés d'heure utilisent l'état courant
  var A = { id: 'A', callsign: 'ALPHA', type: 'PTR', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 120, sequences: [
    { id: 'a1', kind: 'mer', start: '2026-11-11T09:45:00.000Z', dur: 15 }, { id: 'a2', kind: 'vol', start: '2026-11-11T10:00:00.000Z', dur: 60 } ] };
  var B = { id: 'B', callsign: 'BRAVO', type: 'CMN', takeoffPlanned: '2026-11-11T10:30:00.000Z', enduranceMin: 120, sequences: [
    { id: 'b1', kind: 'mer', start: '2026-11-11T10:15:00.000Z', dur: 15 }, { id: 'b2', kind: 'vol', start: '2026-11-11T10:30:00.000Z', dur: 60 } ] };
  cd.flights = [A, B];
  var types = function () { return PL.conflits.calculer(cd, now).map(function (c) { return c.type; }).join(','); };
  eq('conflits : aucun quand le pont est libre', types(), '');
  B.sequences[0].start = '2026-11-11T09:50:00.000Z'; // mise en route de BRAVO pendant celle d'ALPHA
  var c1 = PL.conflits.calculer(cd, now);
  eq('conflit : deux mises en route en même temps', c1.length >= 1 && c1[0].type === 'pont' && c1[0].seqs.indexOf('a1') >= 0 && c1[0].seqs.indexOf('b1') >= 0, true);
  B.sequences[0].start = '2026-11-11T10:15:00.000Z';
  B.takeoffPlanned = '2026-11-11T10:02:00.000Z'; B.sequences[0].start = '2026-11-11T09:20:00.000Z'; B.sequences[1].start = '2026-11-11T10:02:00.000Z';
  eq('conflit : deux décollages à 2 min d\'écart (marge 5)', PL.conflits.calculer(cd, now).some(function (c) { return c.type === 'pont' && /Décollage/.test(c.texte); }), true);
  var cg = PL.conflits.calculer(cd, now).filter(function (c) { return c.type === 'pont'; });
  eq('un seul avertissement par paire de vols (chevauchements regroupés)', cg.length === 1 && cg[0].nb >= 2 && /autre\(s\) chevauchement/.test(cg[0].texte), true);
  cd.settings.conflictMarginMin = 0;
  eq('marge 0 : plus de conflit de mouvement', PL.conflits.calculer(cd, now).some(function (c) { return /Décollage .*Décollage/.test(c.texte); }), false);
  cd.settings.conflictMarginMin = 5;
  cd.settings.conflits = false;
  eq('détection désactivable', PL.conflits.calculer(cd, now).length, 0);
  cd.settings.conflits = true;
  B.takeoffPlanned = '2026-11-11T10:30:00.000Z'; B.sequences[0].start = '2026-11-11T10:15:00.000Z'; B.sequences[1].start = '2026-11-11T10:30:00.000Z';
  eq('retour à aucun conflit', types(), '');
  B.closed = true; A.sequences[0].start = '2026-11-11T10:20:00.000Z';
  eq('vol terminé ignoré', PL.conflits.calculer(cd, now).filter(function (c) { return c.vols.indexOf('B') >= 0; }).length, 0);
  B.closed = false; A.sequences[0].start = '2026-11-11T09:45:00.000Z';
  eq('conflit passé ignoré', PL.conflits.calculer(cd, Z('2026-11-11T13:00:00Z')).length, 0);
  // même vol : mise en route pendant le vol
  A.sequences.push({ id: 'a3', kind: 'ravito', start: '2026-11-11T10:30:00.000Z', dur: 15 });
  eq('incohérence : ravito pendant une séquence de vol', PL.conflits.calculer(cd, now).some(function (c) { return c.type === 'sequence' && c.vols[0] === 'A'; }), true);
  A.sequences.pop();
  // doublon
  var A2 = JSON.parse(JSON.stringify(A)); A2.id = 'A2';
  cd.flights.push(A2);
  eq('doublon : même indicatif qui se chevauche', PL.conflits.calculer(cd, now).some(function (c) { return c.type === 'doublon'; }), true);
  cd.flights.pop();
  // minuit : mise en route 23:55 bord et appontage 00:05 bord d'un autre vol
  var M1 = { id: 'M1', callsign: 'M1', type: 'PTR', takeoffPlanned: '2026-11-11T22:30:00.000Z', enduranceMin: 120, landingPlanned: '2026-11-11T23:05:00.000Z', sequences: [] };
  var M2 = { id: 'M2', callsign: 'M2', type: 'PTR', takeoffPlanned: '2026-11-11T23:10:00.000Z', enduranceMin: 120, sequences: [{ id: 'm', kind: 'mer', start: '2026-11-11T22:55:00.000Z', dur: 15 }] };
  cd.flights = [M1, M2];
  eq('conflit à cheval sur minuit détecté', PL.conflits.calculer(cd, Z('2026-11-11T22:00:00Z')).some(function (c) { return c.type === 'pont'; }), true);

  // --- annulation (sans toucher aux vraies données : sauvegarde neutralisée) ---
  var saveOrig = PL.stockage.save; PL.stockage.save = function () { return true; };
  PL.etat.data = E.etatVide(); E.viderPile();
  var vol = E.enregistrerVol({ callsign: 'UNDO 1', type: 'PTR', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 90, sequences: [] });
  eq('annulation : action mémorisée', E.prochaineAnnulation() && E.prochaineAnnulation().libelle, 'création de UNDO 1');
  var nLog = PL.etat.data.log.length;
  E.annuler();
  eq('annuler une création : le vol disparaît', PL.etat.data.flights.length, 0);
  eq('annuler : la main courante n\'est jamais raccourcie', PL.etat.data.log.length, nLog + 1);
  eq('annuler : ligne de correction qui pointe la ligne d\'origine', PL.etat.data.log[nLog].kind + ':' + PL.etat.data.log[nLog].correctsId, 'correction:' + PL.etat.data.log[nLog - 1].id);
  vol = E.enregistrerVol({ callsign: 'UNDO 2', type: 'CMN', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 90, sequences: [] });
  E.enregistrerVol({ callsign: 'UNDO 2', type: 'CMN', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 120,
    sequences: [{ id: 'u1', kind: 'vol', label: '', start: '2026-11-11T10:00:00.000Z', dur: 60 }] }, vol.id);
  eq('modification enregistrée', E.volParId(vol.id).enduranceMin + '/' + E.volParId(vol.id).sequences.length, '120/1');
  E.annuler();
  eq('annuler une modification : autonomie et séquences reviennent', E.volParId(vol.id).enduranceMin + '/' + E.volParId(vol.id).sequences.length, '90/0');
  E.supprimerVol(vol.id); E.annuler();
  eq('annuler une suppression', E.volParId(vol.id).deleted, false);
  E.saisir({ kind: 'dec', flightId: vol.id, text: 'Décollage' });
  eq('décollage saisi', !!E.volParId(vol.id).takeoffActual, true);
  E.annuler();
  eq('annuler un décollage : vol de nouveau prévu', E.volParId(vol.id).takeoffActual, null);
  var lDec = PL.etat.data.log.filter(function (l) { return l.kind === 'dec'; })[0];
  eq('la ligne « Décollage » reste, corrigée', PL.etat.data.log.some(function (l) { return l.correctsId === lDec.id; }), true);
  E.saisir({ kind: 'note', text: 'simple note' });
  eq('une note ne s\'empile pas dans l\'annulation', E.prochaineAnnulation() && E.prochaineAnnulation().libelle, 'création de UNDO 2');
  E.enregistrerVol(JSON.parse(JSON.stringify(E.volParId(vol.id))), vol.id);
  eq('modification sans changement : rien à annuler en plus', E.prochaineAnnulation().libelle, 'création de UNDO 2');
  PL.stockage.save = saveOrig; E.viderPile();

  // --- compatibilité version 1 ---
  var v1 = { app: 'pontline', schemaVersion: 1, settings: { offsetMin: 120, theme: 'nuit', zoomH: 6 }, flights: [{ id: 'f', callsign: 'OLD', type: 'PTR', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 100, sequences: [{ kind: 'vol', start: '2026-11-11T10:00:00.000Z', dur: 60 }] }], log: [{ id: 3, at: '2026-11-11T10:00:00.000Z', kind: 'note', text: 'v1' }], nextLogId: 4 };
  var mg = E.normaliser(JSON.parse(JSON.stringify(v1)));
  eq('migration v1 : version 6', mg.schemaVersion, 6);
  eq('migration v1 : signalée', mg.migreDepuis, 1);
  eq('migration v1 : réglages conservés', mg.settings.offsetMin + '/' + mg.settings.theme, '120/nuit');
  eq('migration v1 : nouveaux réglages par défaut', mg.settings.conflits + '/' + mg.settings.conflictMarginMin + '/' + mg.settings.eveil + '/' + mg.settings.son, 'true/5/true/true');
  eq('migration v1 : champs de vol complétés', !('jokerMin' in mg.flights[0]) && mg.flights[0].fuel === null && !!mg.flights[0].sequences[0].id, true);
  eq('migration v1 : main courante intacte', mg.log[0].text + '/' + mg.nextLogId, 'v1/4');
  eq('données v6 : pas de migration signalée', E.normaliser({ app: 'pontline', schemaVersion: 6, flights: [], log: [] }).migreDepuis, undefined);
  eq('données v2 : migration signalée', E.normaliser({ app: 'pontline', schemaVersion: 2, flights: [], log: [] }).migreDepuis, 2);
  var vjb = JSON.parse(JSON.stringify(v1)); vjb.settings.warnMin = 20; vjb.settings.dangerMin = 10; vjb.flights[0].jokerMin = 30; vjb.flights[0].bingoMin = 20;
  var mjb = PL.stockage.analyserImport(JSON.stringify(vjb));
  eq('ancien Joker/Bingo ignorés à l\'import', !('jokerMin' in mjb.flights[0]) && !('bingoMin' in mjb.flights[0]) && !('warnMin' in mjb.settings) && !('dangerMin' in mjb.settings) && mjb.flights[0].enduranceMin === 100, true);
  eq('ancien Joker/Bingo : H-30 calculé normalement', T.hm(E.h30At(mjb.flights[0]), 0), '11:10');
  eq('import d\'un export v1', PL.stockage.analyserImport(JSON.stringify(v1)).flights[0].callsign, 'OLD');


  // ===================== V3 — LOT 1 (audit V2.1) =====================
  // P0-1 : autonomie stricte
  eq('L1 230 refusé (2h30 ou 230min ?)', T.parseDuree('230'), null);
  eq('L1 230 : message qui propose 2h30', /2h30/.test(T.analyseDuree('230').err), true);
  eq('L1 1h75 refusé', T.parseDuree('1h75'), null);
  eq('L1 9999 refusé', T.parseDuree('9999'), null);
  eq('L1 1h5 refusé (minutes sur 2 chiffres)', T.parseDuree('1h5'), null);
  eq('L1 2h30 accepté', T.parseDuree('2h30'), 150);
  eq('L1 2:30 accepté', T.parseDuree('2:30'), 150);
  eq('L1 150min accepté', T.parseDuree('150min'), 150);
  eq('L1 150 mn accepté', T.parseDuree('150 mn'), 150);
  eq('L1 0h45 accepté', T.parseDuree('0h45'), 45);
  eq('L1 vraisemblance : PTR 2h30 accepté sans question', JSON.stringify(E.controleAutonomie('PTR', 150)), '{}');
  eq('L1 vraisemblance : PTR 4h demande confirmation', !!E.controleAutonomie('PTR', 240).conf, true);
  eq('L1 vraisemblance : CMN 4h accepté', JSON.stringify(E.controleAutonomie('CMN', 240)), '{}');
  eq('L1 vraisemblance : 7h refusé', !!E.controleAutonomie('CMN', 420).err, true);
  eq('L1 vraisemblance : 5 min refusé', !!E.controleAutonomie('DPN', 5).err, true);
  // P0-2 : carburant
  eq('L1 carburant : 450 kg refusé', T.parseDuree(T.dureeEnTete('450 kg').tete), null);
  eq('L1 carburant : message « quantité » pour kg', /quantité/.test(T.analyseDuree('450 kg').err), true);
  eq('L1 carburant : 1,20 refusé', T.parseDuree(T.dureeEnTete('1,20').tete), null);
  eq('L1 carburant : 2,5h refusé', T.parseDuree(T.dureeEnTete('2,5h').tete), null);
  eq('L1 carburant : 1h20 secteur sud', JSON.stringify([T.parseDuree(T.dureeEnTete('1h20 secteur sud').tete), T.dureeEnTete('1h20 secteur sud').reste]), '[80,"secteur sud"]');
  eq('L1 carburant : 80 min reste', T.parseDuree(T.dureeEnTete('80 min reste').tete), 80);
  // P1-1 : décollage oublié
  data = E.etatVide();
  var ob = { id: 'ob', callsign: 'OUBLI', type: 'CMN', takeoffPlanned: '2026-11-11T08:00:00.000Z', enduranceMin: 100, sequences: [] };
  data.flights = [ob];
  var alv = function (iso) { return PL.alertes.calculer(data, Z(iso)).map(function (a) { return a.niveau + ':' + a.cle.split(':')[1]; }).join(','); };
  eq('L1 décollage oublié : rien avant l\'heure', alv('2026-11-11T07:55:00Z'), '');
  eq('L1 décollage oublié : orange « non saisi » à +11 min', alv('2026-11-11T08:11:00Z'), 'warn:retard');
  eq('L1 décollage oublié : H-30 calculé sur l\'heure prévue', alv('2026-11-11T09:15:00Z'), 'warn:h30,warn:retard');
  eq('L1 décollage oublié : ROUGE à la fin d\'autonomie prévue', alv('2026-11-11T09:41:00Z').split(',')[0], 'danger:depasse');
  eq('L1 décollage oublié : bouton « Décollé à »', PL.alertes.calculer(data, Z('2026-11-11T08:20:00Z'))[0].action.t, Z('2026-11-11T08:00:00Z'));
  eq('L1 décollage oublié : prochain événement = fin d\'autonomie', PL.alertes.prochain(data, Z('2026-11-11T09:20:00Z')).texte, 'Fin d\'autonomie OUBLI');

  var saveOrig3 = PL.stockage.save; PL.stockage.save = function () { return true; };
  // P1-2 : fuseau figé dans chaque ligne
  PL.etat.data = E.etatVide(); E.viderPile();
  PL.etat.data.settings.offsetMin = 60;
  var lg = E.ajouterLog({ kind: 'note', text: 'à UTC+1' }, true);
  eq('L1 fuseau : la ligne garde UTC+1', lg.off, 60);
  PL.etat.data.settings.offsetMin = 240;
  eq('L1 fuseau : changement de fuseau, la ligne reste à UTC+1', PL.etat.data.log[0].off, 60);
  eq('L1 fuseau : nouvelle ligne à UTC+4', E.ajouterLog({ kind: 'note', text: 'à UTC+4' }, true).off, 240);
  var vieux = E.normaliser({ app: 'pontline', schemaVersion: 2, settings: { offsetMin: 180 }, flights: [], log: [{ id: 1, at: '2026-11-11T10:00:00.000Z', kind: 'note', text: 'v2' }] });
  eq('L1 fuseau : lignes V2 figées au fuseau réglé', vieux.log[0].off, 180);
  eq('L1 fuseau : une ligne déjà figée ne change pas', E.normaliser({ app: 'pontline', schemaVersion: 3, settings: { offsetMin: 180 }, flights: [], log: [{ id: 1, at: '2026-11-11T10:00:00.000Z', kind: 'note', text: 'v3', off: 60 }] }).log[0].off, 60);
  // P1-3 : annuler ne touche que le vol concerné
  PL.etat.data = E.etatVide(); E.viderPile();
  var al1 = E.enregistrerVol({ callsign: 'ALPHA 1', type: 'PTR', takeoffPlanned: '2026-11-11T10:00:00.000Z', enduranceMin: 90, sequences: [] });
  PL.etat.data.flights.push({ id: 'autre', callsign: 'BRAVO 2', type: 'CMN', takeoffPlanned: '2026-11-11T11:00:00.000Z', enduranceMin: 90, sequences: [], closed: false, deleted: false });
  E.annuler();
  eq('L1 annuler : seul ALPHA 1 disparaît, BRAVO 2 (autre fenêtre) reste', PL.etat.data.flights.map(function (f) { return f.callsign; }).join(','), 'BRAVO 2');
  var br = E.volParId('autre');
  var al2 = E.enregistrerVol({ callsign: 'ALPHA 2', type: 'PTR', takeoffPlanned: '2026-11-11T12:00:00.000Z', enduranceMin: 90, sequences: [] });
  E.saisir({ kind: 'dec', flightId: al2.id, text: 'Décollage' });
  br.pax = 7; // modifié ailleurs entre-temps
  E.annuler();
  eq('L1 annuler un décollage : ALPHA 2 revient prévu', E.volParId(al2.id).takeoffActual, null);
  eq('L1 annuler un décollage : BRAVO 2 garde sa modification', E.volParId('autre').pax, 7);
  E.viderPile();
  eq('L1 pile vidée', E.prochaineAnnulation(), null);
  // P1-1 : décollage saisi après coup à l'heure prévue
  var tDec = Math.floor((Date.now() - 30 * MIN) / MIN) * MIN; // V4 : une heure réelle dans le futur est refusée -> heure passée
  E.saisir({ kind: 'dec', flightId: al2.id, at: tDec, text: 'Décollage (heure prévue, saisi après coup)' });
  eq('L1 « Décollé à » : heure réelle = heure prévue', E.volParId(al2.id).takeoffActual, new Date(tDec).toISOString());
  eq('L1 « Décollé à » : la ligne est horodatée maintenant (vérité de la main courante)', Math.abs(Date.parse(PL.etat.data.log[PL.etat.data.log.length - 1].at) - Date.now()) < 5000, true);
  // P1-5 : clôture automatique et tri
  PL.etat.data = E.etatVide(); E.viderPile();
  var nowT = Date.now();
  PL.etat.data.flights = [
    { id: 'p1', callsign: 'POSE', type: 'PTR', takeoffPlanned: new Date(nowT - 120 * MIN).toISOString(), takeoffActual: new Date(nowT - 120 * MIN).toISOString(), landingActual: new Date(nowT - 45 * MIN).toISOString(), enduranceMin: 100, sequences: [], closed: false, deleted: false },
    { id: 'p2', callsign: 'POSE RECENT', type: 'PTR', takeoffPlanned: new Date(nowT - 100 * MIN).toISOString(), takeoffActual: new Date(nowT - 100 * MIN).toISOString(), landingActual: new Date(nowT - 10 * MIN).toISOString(), enduranceMin: 100, sequences: [], closed: false, deleted: false },
    { id: 'p3', callsign: 'PREVU', type: 'CMN', takeoffPlanned: new Date(nowT + 60 * MIN).toISOString(), enduranceMin: 100, sequences: [], closed: false, deleted: false },
    { id: 'p4', callsign: 'EN VOL', type: 'DPN', takeoffPlanned: new Date(nowT + 30 * MIN).toISOString(), takeoffActual: new Date(nowT - 5 * MIN).toISOString(), enduranceMin: 100, sequences: [], closed: false, deleted: false }];
  eq('L1 clôture auto : 1 vol posé depuis plus de 30 min', E.cloreAuto(nowT), 1);
  eq('L1 clôture auto : le bon vol', E.volParId('p1').closed + '/' + E.volParId('p2').closed, 'true/false');
  eq('L1 clôture auto : tracée dans la main courante', /clos automatiquement/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), true);
  eq('L1 tri : en vol, puis prévu, puis posé', E.volsVisibles(false).map(function (f) { return f.callsign; }).join(','), 'EN VOL,PREVU,POSE RECENT');
  PL.etat.data.settings.autoClore = 0;
  PL.etat.data.flights[1].landingActual = new Date(nowT - 300 * MIN).toISOString();
  eq('L1 clôture auto désactivable (0)', E.cloreAuto(nowT), 0);
  PL.stockage.save = saveOrig3; E.viderPile();

  // ================= LOT 2 (V3) =================
  var saveOrig4 = PL.stockage.save; PL.stockage.save = function () { return true; };
  // P2-7 : validation à l'import
  var piege = E.normaliser({ app: 'pontline', schemaVersion: 3,
    settings: { offsetMin: 'abc', zoomH: 3000, conflictMarginMin: -5, theme: '<b>', missions: ['<img src=x>', 42, ''], autoClore: 1e9, finQuart: 'x' },
    flights: [
      { id: '"><img src=x onerror=1>', callsign: '<b>X</b>'.repeat(20), type: '<script>', takeoffPlanned: '2026-11-11T10:00:00Z', enduranceMin: '90', pax: 999, sequences: [{ start: 'nan', dur: 5 }, { start: '2026-11-11T10:00:00Z', dur: 30, kind: 'evil' }] },
      { id: 'sansheure', callsign: 'SANS HEURE', takeoffPlanned: 'n importe quoi' },
      'pas un objet'],
    log: [{ id: 1, at: '2026-11-11T10:00:00Z', kind: 'constructor', text: 'ok' }, { id: 1, at: 'mauvaise', kind: 'note', text: 'doublon' }, { id: 'x', text: 'sans id' }, 12],
    nextLogId: 'abc' });
  eq('L2 import : fuseau illisible -> défaut', piege.settings.offsetMin, 60);
  eq('L2 import : zoom borné', piege.settings.zoomH, 6);
  eq('L2 import : marge bornée', piege.settings.conflictMarginMin, 5);
  eq('L2 import : thème inconnu ignoré', piege.settings.theme, 'jour');
  eq('L2 import : clôture auto bornée', piege.settings.autoClore, 30);
  eq('L2 import : missions nettoyées (texte seulement)', piege.settings.missions, ['<img src=x>']);
  eq('L2 import : vol sans heure lisible écarté, non-objet écarté', piege.flights.length, 1);
  eq('L2 import : identifiant de vol dangereux remplacé', /^[A-Za-z0-9_-]+$/.test(piege.flights[0].id), true);
  eq('L2 import : indicatif limité à 20 caractères', piege.flights[0].callsign.length <= 20, true);
  eq('L2 import : type inconnu -> PTR', piege.flights[0].type, 'PTR');
  eq('L2 import : autonomie texte « 90 » lue en minutes entières', piege.flights[0].enduranceMin, 90);
  eq('L2 import : pax bornés', piege.flights[0].pax, 0);
  eq('L2 import : séquences invalides retirées, type inconnu -> autre', piege.flights[0].sequences.map(function (q) { return q.kind; }), ['autre']);
  eq('L2 import : AUCUNE ligne de main courante écartée', piege.log.length, 4);
  eq('L2 import : type de ligne inconnu -> note', piege.log[0].kind, 'note');
  eq('L2 import : identifiants uniques', piege.log.map(function (l) { return l.id; }), [1, 2, 3, 4]);
  eq('L2 import : heure illisible signalée dans le texte', /heure illisible/.test(piege.log[1].text), true);
  eq('L2 import : nextLogId cohérent', piege.nextLogId, 5);
  eq('L2 import : rejets comptés', piege.rejets, { vols: 2, lignes: 3 });
  eq('L2 import : autonomie illisible -> 0 (alerte rouge visible)', E.normaliser({ app: 'pontline', flights: [{ id: 'a', callsign: 'A', takeoffPlanned: '2026-11-11T10:00:00Z', enduranceMin: 'beaucoup' }] }).flights[0].enduranceMin, 0);
  eq('L2 import : demi-heure de fuseau acceptée (+5:30)', E.normaliser({ app: 'pontline', settings: { offsetMin: 330 } }).settings.offsetMin, 330);
  eq('L2 import : fuseau hors bornes refusé', E.normaliser({ app: 'pontline', settings: { offsetMin: 2000 } }).settings.offsetMin, 60);
  // P2-1 : modifier les pax d'un vol en l'air ne touche pas au décollage réel
  PL.etat.data = E.etatVide(); E.viderPile();
  var v21 = E.enregistrerVol({ callsign: 'MOD', type: 'PTR', takeoffPlanned: '2026-11-11T08:45:00.000Z', enduranceMin: 120, sequences: [] });
  v21.takeoffActual = '2026-11-11T08:52:41.123Z';
  var d21 = JSON.parse(JSON.stringify(v21)); d21.pax = 4; d21.takeoffActual = '2026-11-11T08:52:00.000Z';
  E.enregistrerVol(d21, v21.id);
  eq('L2 P2-1 décollage réel exact conservé (même minute)', E.volParId(v21.id).takeoffActual, '2026-11-11T08:52:41.123Z');
  eq('L2 P2-1 journal : « pax » seulement', /Vol modifié \(pax\)/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), true);
  var d22 = JSON.parse(JSON.stringify(E.volParId(v21.id))); d22.takeoffActual = '2026-11-11T08:55:00.000Z';
  E.enregistrerVol(d22, v21.id);
  eq('L2 P2-1 vraie modification de l\'heure : appliquée', E.volParId(v21.id).takeoffActual, '2026-11-11T08:55:00.000Z');
  // P2-2 : actions incohérentes
  PL.etat.data = E.etatVide(); E.viderPile();
  var a22 = E.enregistrerVol({ callsign: 'ACT', type: 'PTR', takeoffPlanned: new Date(Date.now() - 5 * MIN).toISOString(), enduranceMin: 120, sequences: [] });
  var nLog = PL.etat.data.log.length;
  eq('L2 P2-2 appontage avant décollage : refusé', E.saisir({ kind: 'app', flightId: a22.id, text: 'Appontage' }), null);
  eq('L2 P2-2 appontage refusé : aucune ligne', PL.etat.data.log.length, nLog);
  E.saisir({ kind: 'dec', flightId: a22.id, text: 'Décollage' });
  eq('L2 P2-2 second décollage : refusé', E.saisir({ kind: 'dec', flightId: a22.id, text: 'Décollage' }), null);
  eq('L2 P2-2 un seul « Décollage » dans la main courante', PL.etat.data.log.filter(function (l) { return l.kind === 'dec'; }).length, 1);
  E.saisir({ kind: 'app', flightId: a22.id, text: 'Appontage' });
  eq('L2 P2-2 second appontage : refusé', E.saisir({ kind: 'app', flightId: a22.id, text: 'Appontage' }), null);
  eq('L2 P2-2 décollage d\'un vol posé : redécollage proposé', E.controleAction(E.volParId(a22.id), 'dec'), { redec: true });
  // P2-10 : redécollage
  var r2 = E.redecoller(a22.id, 75, 'pax 4');
  eq('L2 P2-10 redécollage : nouvelle rotation en vol', E.statut(r2), 'envol');
  eq('L2 P2-10 redécollage : rotation 2, même indicatif', r2.rotation + ' ' + r2.callsign, '2 ACT');
  eq('L2 P2-10 redécollage : autonomie saisie', r2.enduranceMin, 75);
  eq('L2 P2-10 redécollage : vol précédent clos', E.volParId(a22.id).closed, true);
  eq('L2 P2-10 redécollage : ligne « Redécollage (rotation 2) »', /Redécollage \(rotation 2\).*1 h 15|Redécollage \(rotation 2\).*1h15/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), true);
  E.annuler();
  eq('L2 P2-10 annuler le redécollage : rotation retirée, vol précédent rouvert', PL.etat.data.flights.length + ' ' + E.volParId(a22.id).closed, '1 false');
  eq('L2 P2-10 redécollage refusé sur un vol non posé', E.redecoller(E.enregistrerVol({ callsign: 'NP', type: 'PTR', takeoffPlanned: new Date().toISOString(), enduranceMin: 60, sequences: [] }).id, 60), null);
  PL.stockage.save = saveOrig4; E.viderPile();

  // ================= LOT 3 (V3) =================
  eq('L3 fuseau +5:30 : libellé', T.offsetLabel(330), 'UTC+5:30');
  eq('L3 fuseau −3:30 : libellé', T.offsetLabel(-210), 'UTC−3:30');
  eq('L3 fuseau +5:45 : pas de lettre militaire', T.lettreFuseau(345), '');
  eq('L3 fuseau +5:30 : heure bord', T.hm(Date.parse('2026-11-11T10:00:00Z'), 330), '15:30');
  eq('L3 fuseaux partiels proposés', [330, 345, -210, 570].every(function (m) { return T.FUSEAUX_PARTIELS.indexOf(m) >= 0; }), true);

  // ================= V4 — LOT A (audit V3b) =================
  var saveA = PL.stockage.save; PL.stockage.save = function () { return true; }; E.viderPile();
  PL.etat.data = E.etatVide(); PL.etat.data.settings.offsetMin = 180;
  eq('A état neuf : version 6', E.etatVide().schemaVersion, 6);
  eq('A P1-1 son des alertes actif par défaut', E.etatVide().settings.son, true);
  var m3 = E.normaliser({ app: 'pontline', schemaVersion: 3, settings: { son: false }, flights: [], log: [] });
  eq('A P1-1 données V3 : migration signalée et son activé', m3.migreDepuis + '/' + m3.settings.son, '3/true');
  eq('A P1-1 données V4 : choix « son coupé » respecté', E.normaliser({ app: 'pontline', schemaVersion: 4, settings: { son: false }, flights: [], log: [] }).settings.son, false);
  eq('A heure Z : 0430Z à UTC+3 = 07:30 bord', T.lireHeure('0430Z', 180), 450);
  eq('A heure Z : 04:30z', T.lireHeure('04:30z', 180), 450);
  eq('A heure Z : 23:30Z à UTC+3 = 02:30 bord', T.lireHeure('2330Z', 180), 150);
  eq('A heure bord : 07:30', T.lireHeure('07:30', 180), 450);
  eq('A heure invalide', T.lireHeure('7h75', 180), null);
  var nA = Date.now(), MA = 60000;
  var vA = E.enregistrerVol({ callsign: 'CORA', type: 'PTR', takeoffPlanned: new Date(nA - 20 * MA).toISOString(), enduranceMin: 100, sequences: [] });
  eq('A P3-4 carburant refusé avant le décollage', !!E.controleAction(E.volParId(vA.id), 'fuel').err, true);
  eq('A P1-2 décollage à une heure future refusé', E.saisir({ kind: 'dec', flightId: vA.id, at: nA + 10 * MA, text: 'x' }), null);
  var lA = E.saisir({ kind: 'dec', flightId: vA.id, at: nA - 7 * MA, text: 'Décollage à -7' });
  eq('A P1-2 décollage saisi à l\'heure réelle (−7 min)', Date.parse(E.volParId(vA.id).takeoffActual), nA - 7 * MA);
  eq('A P1-2 la ligne garde l\'heure d\'écriture (ordre de la main courante)', Math.abs(Date.parse(lA.at) - nA) < 5000, true);
  eq('A P1-2 appontage avant le décollage refusé', E.saisir({ kind: 'app', flightId: vA.id, at: nA - 9 * MA, text: 'x' }), null);
  var finA = E.finAuto(E.volParId(vA.id));
  eq('A P1-2 ligne Décollage : recalage possible', !!E.corrigeable(lA), true);
  eq('A P1-2 simulation : fin d\'autonomie recalculée', E.simulerCorrection(lA, nA - 12 * MA).apres, finA - 5 * MA);
  eq('A P1-2 correction : décollage dans le futur refusé', E.corrigerAction(lA.id, nA + 30 * MA), null);
  var cA = E.corrigerAction(lA.id, nA - 12 * MA);
  eq('A P1-2 correction : vol recalé (décollage −12 min)', Date.parse(E.volParId(vA.id).takeoffActual), nA - 12 * MA);
  eq('A P1-2 correction : fin d\'autonomie 5 min plus tôt', E.finAuto(E.volParId(vA.id)), finA - 5 * MA);
  eq('A P1-2 correction : ligne de correction liée', cA.correctsId === lA.id && cA.kind === 'correction' && /fin d'autonomie/.test(cA.text), true);
  eq('A P1-2 la ligne d\'origine reste recalable (nouvelle correction possible)', !!E.corrigeable(lA), true);
  E.annuler();
  eq('A P1-2 Annuler la correction : heure d\'origine', Date.parse(E.volParId(vA.id).takeoffActual), nA - 7 * MA);
  var fA = E.saisir({ kind: 'fuel', flightId: vA.id, value: 60, text: 'Carburant 1h00' });
  eq('A P1-2 carburant recalable', !!E.corrigeable(fA), true);
  E.corrigerAction(fA.id, 50);
  eq('A P1-2 correction carburant : 50 min restantes', E.volParId(vA.id).fuel.min, 50);
  var pA = E.saisir({ kind: 'app', flightId: vA.id, at: nA - 1 * MA, text: 'Appontage −1' });
  eq('A P1-2 appontage à l\'heure réelle', Date.parse(E.volParId(vA.id).landingActual), nA - MA);
  eq('A P1-2 correction appontage avant le décollage refusée', E.corrigerAction(pA.id, nA - 30 * MA), null);
  eq('A P1-2 redécollage avant l\'appontage refusé', E.redecoller(vA.id, 60, '', nA - 5 * MA), null);
  var rA = E.redecoller(vA.id, 60, '', nA);
  eq('A P1-2 redécollage à l\'heure donnée', !!rA && Date.parse(rA.takeoffActual), nA);
  eq('A note sans vol : non recalable', E.corrigeable(E.saisir({ kind: 'note', text: 'n' })), null);
  PL.stockage.save = saveA; E.viderPile();

  // ================= V4 — LOT B (audit V3b) =================
  var saveB = PL.stockage.save; PL.stockage.save = function () { return true; }; E.viderPile();
  PL.etat.data = E.etatVide(); PL.etat.data.settings.offsetMin = 180;
  var nB = Date.now(), MB = 60000;
  var vB = E.enregistrerVol({ callsign: 'JAMAIS', type: 'PTR', takeoffPlanned: new Date(nB - 400 * MB).toISOString(), enduranceMin: 100, sequences: [] });
  eq('B P2-3 vol jamais parti : alerte rouge avant annulation', PL.alertes.calculer(PL.etat.data, nB).some(function (a) { return a.vol === vB.id && a.niveau === 'danger'; }), true);
  eq('B P2-3 annuler le vol', E.annulerVol(vB.id, true, 'météo'), true);
  eq('B P2-3 statut « Annulé »', E.statut(E.volParId(vB.id)) + ' ' + E.STATUT_NOMS.annule, 'annule Annulé');
  eq('B P2-3 plus aucune alerte pour un vol annulé', PL.alertes.calculer(PL.etat.data, nB).filter(function (a) { return a.vol === vB.id; }).length, 0);
  eq('B P2-3 ligne « Vol annulé : JAMAIS … — météo »', /Vol annulé : JAMAIS .*— météo/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), true);
  eq('B P2-3 vol annulé caché, visible avec les vols terminés', E.volsVisibles(false).length + '/' + E.volsVisibles(true).length, '0/1');
  eq('B P2-3 vol annulé : pas de conflit de planning', PL.conflits.calculer(PL.etat.data, nB).length, 0);
  eq('B P2-3 annulation conservée à l\'export / import', E.normaliser(JSON.parse(JSON.stringify(PL.etat.data))).flights[0].cancelled, true);
  E.annuler();
  eq('B P2-3 Annuler : le vol redevient prévu', E.statut(E.volParId(vB.id)), 'prevu');
  E.saisir({ kind: 'dec', flightId: vB.id, text: 'Décollage' });
  eq('B P2-3 un vol qui a décollé ne peut pas être annulé', E.annulerVol(vB.id, true), false);
  E.saisir({ kind: 'app', flightId: vB.id, text: 'Appontage' });
  var rB = E.redecoller(vB.id, 60, '');
  eq('B P3-7 redécollage : les pax de la rotation 1 ne sont pas recopiés', rB.pax, 0);
  eq('B P2-9 cartes : réglage automatique par défaut', E.etatVide().settings.hideCards, null);
  eq('B P2-9 données V3 « cartes affichées » (défaut) -> automatique', E.normaliser({ app: 'pontline', schemaVersion: 3, settings: { hideCards: false }, flights: [], log: [] }).settings.hideCards, null);
  eq('B P2-9 choix « cartes masquées » gardé', E.normaliser({ app: 'pontline', schemaVersion: 3, settings: { hideCards: true }, flights: [], log: [] }).settings.hideCards, true);
  PL.stockage.save = saveB; E.viderPile();

  // ================= V4 — LOT C (audit V3b) =================
  eq('C P3-3 CSV : « =1+1 » neutralisé', PL.stockage.celluleCSV('=1+1'), "'=1+1");
  eq('C P3-3 CSV : « +33 6… », « -5 », « @x » neutralisés', [PL.stockage.celluleCSV('+33 6'), PL.stockage.celluleCSV('-5'), PL.stockage.celluleCSV('@x')].join('|'), "'+33 6|'-5|'@x");
  eq('C P3-3 CSV : texte normal inchangé, point-virgule entre guillemets', PL.stockage.celluleCSV('Pont vert; vent 20 kt'), '"Pont vert; vent 20 kt"');
  eq('C P3-3 CSV : formule avec guillemets', PL.stockage.celluleCSV('=A1&"x"'), '"\'=A1&""x"""');

  // ================= V5 — séquence par clic, bande des vols, ETA, ops normal =================
  var saveV5 = PL.stockage.save; PL.stockage.save = function () { return true; }; E.viderPile();
  PL.etat.data = E.etatVide(); PL.etat.data.settings.offsetMin = 180;
  var n5 = Date.now(), M5 = 60000, i5 = function (m) { return new Date(n5 + m * M5).toISOString(); };
  eq('V5 schéma (6 depuis V5.3) et ops normal 30 min par défaut', [E.etatVide().schemaVersion, E.etatVide().settings.opsNormalMin], [6, 30]);
  var m4 = E.normaliser({ app: 'pontline', schemaVersion: 4, settings: { son: false }, flights: [{ id: 'f4', callsign: 'OLD4', type: 'CMN', takeoffPlanned: i5(-60), takeoffActual: i5(-60), enduranceMin: 120, sequences: [] }], log: [{ id: 1, at: i5(-60), kind: 'dec', text: 'Décollage', flightId: 'f4' }] });
  eq('V5 migration v4 : signalée, rien perdu, son gardé tel quel (choix V4)', [m4.migreDepuis, m4.flights.length, m4.log.length, m4.settings.son, m4.settings.opsNormalMin, m4.flights[0].opsNormalMin], [4, 1, 1, false, 30, null]);
  eq('V5 ops normal par vol : 0 gardé, valeur folle écartée', [E.normaliser({ flights: [{ id: 'a', callsign: 'A', takeoffPlanned: i5(0), enduranceMin: 60, opsNormalMin: 0 }] }).flights[0].opsNormalMin, E.normaliser({ flights: [{ id: 'a', callsign: 'A', takeoffPlanned: i5(0), enduranceMin: 60, opsNormalMin: 9999 }] }).flights[0].opsNormalMin], [0, null]);
  eq('V5 types de main courante ETA et Séquence relus', E.normaliser({ log: [{ id: 1, at: i5(0), kind: 'eta', text: 'x' }, { id: 2, at: i5(0), kind: 'seq', text: 'y' }] }).log.map(function (l) { return l.kind; }), ['eta', 'seq']);
  // séquence ajoutée
  var v5a = E.enregistrerVol({ callsign: 'SEQ 1', type: 'PTR', takeoffPlanned: i5(30), enduranceMin: 110, sequences: [] });
  var r5 = E.ajouterSequence(v5a.id, { kind: 'ravito', start: n5 + 60 * M5 + 17000, dur: 20 });
  var f5 = E.volParId(v5a.id);
  eq('V5 séquence ajoutée (minute arrondie), durée gardée', [f5.sequences.length, f5.sequences[0].kind, f5.sequences[0].dur, Date.parse(f5.sequences[0].start) % M5], [1, 'ravito', 20, 0]);
  eq('V5 séquence : ligne « Séquence » dans la main courante', [PL.etat.data.log[PL.etat.data.log.length - 1].kind, /Séquence ajoutée : Ravitaillement/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], ['seq', true]);
  eq('V5 séquence avant la fin d\'autonomie : pas d\'avertissement', r5.apresFin, false);
  eq('V5 séquence : appontage prévu inchangé (ravito n\'est pas du vol)', E.appontagePrevu(f5), null);
  var r5b = E.ajouterSequence(v5a.id, { kind: 'pax', start: n5 + 135 * M5, dur: 30 });
  eq('V5 séquence APRÈS la fin d\'autonomie : acceptée, seulement signalée', [!!r5b, r5b && r5b.apresFin, E.volParId(v5a.id).sequences.length, /APRÈS la fin d'autonomie/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], [true, true, 2, true]);
  E.annuler();
  eq('V5 Annuler retire la dernière séquence', E.volParId(v5a.id).sequences.length, 1);
  eq('V5 séquence : type inconnu ou durée nulle refusés', [E.ajouterSequence(v5a.id, { kind: 'xx', start: n5, dur: 10 }), E.ajouterSequence(v5a.id, { kind: 'vol', start: n5, dur: 0 })], [null, null]);
  eq('V5 séquences triées par heure', (function () { E.ajouterSequence(v5a.id, { kind: 'mer', start: n5 + 15 * M5, dur: 15 }); return E.volParId(v5a.id).sequences.map(function (s) { return s.kind; }); })(), ['mer', 'ravito']);
  // ETA
  var v5e = E.enregistrerVol({ callsign: 'ETA 1', type: 'CMN', takeoffPlanned: i5(-40), takeoffActual: i5(-40), landingPlanned: new Date(Math.floor(n5 / M5) * M5 + 20 * M5).toISOString(), enduranceMin: 160, sequences: [] });
  var finE = E.finAuto(E.volParId(v5e.id)), appE = E.appontagePrevu(E.volParId(v5e.id));
  var rE = E.eta(v5e.id, 10);
  eq('V5 ETA +10 : appontage prévu +10 min exactement', (rE.apres - appE) / M5, 10);
  eq('V5 ETA : fin d\'autonomie et H-30 inchangées', [E.finAuto(E.volParId(v5e.id)), E.volParId(v5e.id).enduranceMin, E.volParId(v5e.id).fuel], [finE, 160, null]);
  eq('V5 ETA : ligne « ETA » avec avant → après', [PL.etat.data.log[PL.etat.data.log.length - 1].kind, /ETA \+10 min : appontage prévu \d\d:\d\d → \d\d:\d\d/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], ['eta', true]);
  E.annuler();
  eq('V5 ETA annulable', E.appontagePrevu(E.volParId(v5e.id)), appE);
  var v5p = E.enregistrerVol({ callsign: 'ETA 2', type: 'PTR', takeoffPlanned: i5(-90), takeoffActual: i5(-90), landingPlanned: i5(-10), enduranceMin: 110, sequences: [{ id: 's1', kind: 'vol', label: '', start: i5(-90), dur: 80 }] });
  var rP = E.eta(v5p.id, 5), fP = E.volParId(v5p.id);
  eq('V5 ETA sur un appontage prévu déjà dépassé : maintenant + 5 (minute pleine)', [Math.ceil((rP.apres - Date.now()) / M5), rP.apres % M5], [5, 0]);
  eq('V5 ETA : la séquence de vol suit l\'ETA (à la minute)', Math.abs(E.seqFin(fP.sequences[0]) - rP.apres) < M5, true);
  eq('V5 ETA : refusée sur un vol pas en l\'air', E.eta(v5a.id, 5), null);
  // ops normal
  var v5o = E.enregistrerVol({ callsign: 'OPS 1', type: 'DPN', takeoffPlanned: i5(-45), takeoffActual: i5(-45), enduranceMin: 130, sequences: [] });
  var fo = E.volParId(v5o.id), opsA = function (t) { return PL.alertes.calculer(PL.etat.data, t).filter(function (a) { return a.vol === v5o.id && a.ops; }); };
  eq('V5 ops normal : 45 min sans contact (défaut 30) -> alerte orange avec bouton Radio', opsA(n5).map(function (a) { return [a.niveau, a.action.radio === v5o.id, /OPS NORMAL attendu/.test(a.texte)]; }), [['warn', true, true]]);
  eq('V5 ops normal : pas d\'alerte à 29 min', opsA(n5 - 16 * M5).length, 0);
  var cle0 = opsA(n5)[0].cle;
  E.radioOk(v5o.id);
  eq('V5 « Radio ✓ » : ligne Radio et alerte remise à zéro', [PL.etat.data.log[PL.etat.data.log.length - 1].kind, PL.etat.data.log[PL.etat.data.log.length - 1].flightId === v5o.id, opsA(Date.now()).length], ['radio', true, 0]);
  eq('V5 ops normal : revient 30 min après le dernier contact (nouvelle clé)', opsA(Date.now() + 31 * M5).length === 1 && opsA(Date.now() + 31 * M5)[0].cle !== cle0, true);
  eq('V5 rappel acquitté sans contact : même alerte jusqu\'à 59 min, nouvelle (nouveau bip) à 60 min', (function () { var t0 = E.dernierContact(fo); var k = function (m) { var a = opsA(t0 + m * M5)[0]; return a && a.cle; }; return [k(31) === k(59), k(59) !== k(61), !!k(61)]; })(), [true, true, true]);
  E.saisir({ kind: 'radio', flightId: v5o.id, text: 'Contact radio' });
  eq('V5 une ligne « Contact radio » du vol remet aussi à zéro', E.dernierContact(fo) >= Date.now() - 2000, true);
  fo.opsNormalMin = 60;
  eq('V5 intervalle par vol (60 min)', [opsA(Date.now() + 45 * M5).length, opsA(Date.now() + 61 * M5).length], [0, 1]);
  fo.opsNormalMin = 0;
  eq('V5 rappel désactivé pour ce vol (0)', opsA(Date.now() + 300 * M5).length, 0);
  fo.opsNormalMin = null; PL.etat.data.settings.opsNormalMin = 0;
  eq('V5 rappel désactivé partout (réglage général 0)', opsA(Date.now() + 300 * M5).length, 0);
  PL.etat.data.settings.opsNormalMin = 30;
  eq('V5 ops normal : jamais pour un vol prévu', PL.alertes.calculer(PL.etat.data, n5 + 600 * M5).filter(function (a) { return a.vol === v5a.id && a.ops; }).length, 0);
  eq('V5 ops normal gardé au redécollage', (function () { fo.opsNormalMin = 45; E.saisir({ kind: 'app', flightId: v5o.id, text: 'Appontage' }); var r = E.redecoller(v5o.id, 60, ''); return r.opsNormalMin; })(), 45);
  eq('V5 rappel ops normal classé après un décollage non saisi et un H-30 (ne les cache pas)', (function () {
    var d = E.etatVide(); d.settings.offsetMin = 0;
    d.flights = [E.normaliser({ flights: [{ id: 'o1', callsign: 'O1', takeoffPlanned: i5(-50), takeoffActual: i5(-50), enduranceMin: 300 }] }).flights[0],
      E.normaliser({ flights: [{ id: 'o2', callsign: 'O2', takeoffPlanned: i5(-20), enduranceMin: 90 }] }).flights[0],
      E.normaliser({ flights: [{ id: 'o3', callsign: 'O3', takeoffPlanned: i5(-80), takeoffActual: i5(-80), enduranceMin: 100 }] }).flights[0]];
    var s0 = PL.etat.data; PL.etat.data = d; var a = PL.alertes.calculer(d, n5).map(function (x) { return x.vol + (x.ops ? ':ops' : ':' + x.cle.split(':')[1]); }); PL.etat.data = s0; return a;
  })().slice(2), ['o1:ops', 'o3:ops']);
  PL.stockage.save = saveV5; E.viderPile();

  // ================= V5.3 — pont programmé, ravitaillement programmé =================
  var save53 = PL.stockage.save; PL.stockage.save = function () { return true; }; E.viderPile();
  PL.etat.data = E.etatVide(); PL.etat.data.settings.offsetMin = 180;
  var n3 = Math.floor(Date.now() / M5) * M5, at3 = function (m) { return n3 + m * M5; };
  var m5 = E.normaliser({ app: 'pontline', schemaVersion: 5, flights: [], log: [{ id: 1, at: i5(0), kind: 'deck', deck: 'rouge', text: 'Pont rouge' }] });
  eq('V5.3 migration v5 -> 6 : signalée, deckPlans vide, rien perdu', [m5.schemaVersion, m5.migreDepuis, m5.deckPlans.length, m5.log.length], [6, 5, 0, 1]);
  eq('V5.3 normalisation : plans invalides écartés, fin avant début retirée', (function () {
    var d = E.normaliser({ deckPlans: [{ id: 'a', deck: 'vert', start: i5(60), end: i5(30) }, { id: 'b', deck: 'bleu', start: i5(10) }, { id: 'c', deck: 'rouge', start: 'xx' }, { id: 'd', deck: 'rouge', start: i5(5), end: i5(20), statut: 'zz' }] });
    return d.deckPlans.map(function (p) { return p.id + ':' + p.deck + ':' + (p.end ? 'fin' : '-') + ':' + p.statut; });
  })(), ['d:rouge:fin:prevu', 'a:vert:-:prevu']);
  var etat0 = E.etatPont(), nLog = PL.etat.data.log.length;
  var p1 = E.programmerPont({ deck: 'vert', start: at3(30), end: at3(60) });
  eq('V5.3 programmer : plan prévu, ligne « Pont prévu », état du pont INCHANGÉ', [!!p1, p1.statut, PL.etat.data.log[PL.etat.data.log.length - 1].kind, /Programmé : Pont vert prévu .* → /.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), JSON.stringify(E.etatPont()) === JSON.stringify(etat0)], [true, 'prevu', 'pontprevu', true, true]);
  eq('V5.3 programmer : fin avant début ou couleur inconnue refusées', [E.programmerPont({ deck: 'vert', start: at3(30), end: at3(10) }), E.programmerPont({ deck: 'bleu', start: at3(30) })], [null, null]);
  eq('V5.3 pas de rappel avant l\'heure', E.rappelsPont(at3(29)).length, 0);
  eq('V5.3 rappel à l\'heure prévue (phase début)', E.rappelsPont(at3(30)).map(function (r) { return r.phase + ':' + r.plan.id; }), ['debut:' + p1.id]);
  eq('V5.3 alerte orange « Pont vert prévu … — confirmer ? » avec action', PL.alertes.calculer(PL.etat.data, at3(31)).filter(function (a) { return a.action && a.action.pont; }).map(function (a) { return [a.niveau, /^Pont vert prévu \d\d:\d\d \(\d\d:\d\dZ\) — confirmer \?$/.test(a.texte), a.action.phase]; }), [['warn', true, 'debut']]);
  eq('V5.3 l\'état du pont ne change JAMAIS tout seul (rappel passé, rien saisi)', [JSON.stringify(E.etatPont()) === JSON.stringify(etat0), PL.etat.data.log.filter(function (l) { return l.kind === 'deck'; }).length], [true, 0]);
  var p1m = E.modifierPlan(p1.id, { deck: 'rouge', start: at3(40), end: null });
  eq('V5.3 modifier : couleur, heure, fin retirée ; ligne « modifiée »', [p1m.deck, Date.parse(p1m.start) === at3(40), p1m.end, p1m.statutFin, /Programmation modifiée : .* ⇒ Pont rouge prévu/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], ['rouge', true, null, null, true]);
  E.annuler();
  eq('V5.3 Annuler la modification : plan d\'origine revenu', [E.planParId(p1.id).deck, Date.parse(E.planParId(p1.id).start) === at3(30), Date.parse(E.planParId(p1.id).end) === at3(60)], ['vert', true, true]);
  var lc = E.confirmerPlan(p1.id, 'debut');
  eq('V5.3 Confirmer : vraie ligne « Pont vert » à l\'heure réelle, pont vert', [lc && lc.kind, lc && lc.deck, lc && Math.abs(Date.parse(lc.at) - Date.now()) < 5000, /Pont vert \(prévu \d\d:\d\d, confirmé\)/.test(lc && lc.text), E.etatPont().etat || E.etatPont(), E.planParId(p1.id).statut], ['deck', 'vert', true, true, 'vert', 'fait']);
  eq('V5.3 après confirmation : plus de rappel de début ; rappel de fin à l\'heure de fin', [E.rappelsPont(at3(45)).length, E.rappelsPont(at3(60)).map(function (r) { return r.phase; })], [0, ['fin']]);
  eq('V5.3 rappel de fin : « passer au pont rouge ? »', PL.alertes.calculer(PL.etat.data, at3(61)).filter(function (a) { return a.action && a.action.pont; }).map(function (a) { return [/Fin du pont vert prévue .* — passer au pont rouge \?/.test(a.texte), a.action.deck]; }), [[true, 'rouge']]);
  E.ignorerPlan(p1.id, 'fin');
  eq('V5.3 Ignorer la fin : pont inchangé (vert), rappel parti, ligne « rappel ignoré »', [E.etatPont().etat || E.etatPont(), E.rappelsPont(at3(70)).length, /rappel ignoré, pont inchangé/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], ['vert', 0, true]);
  E.annuler();
  eq('V5.3 Annuler « ignorer » : le rappel de fin revient', E.rappelsPont(at3(70)).length, 1);
  var lf = E.confirmerPlan(p1.id, 'fin');
  eq('V5.3 Confirmer la fin : pont rouge noté', [lf.deck, E.etatPont().etat || E.etatPont()], ['rouge', 'rouge']);
  var p2 = E.programmerPont({ deck: 'vert', start: at3(-10) });
  eq('V5.3 plan à une heure déjà passée : rappel tout de suite', E.rappelsPont(Date.now()).filter(function (r) { return r.plan.id === p2.id; }).length, 1);
  eq('V5.3 rappel trop ancien (> 12 h) : plus affiché', E.rappelsPont(at3(13 * 60)).filter(function (r) { return r.plan.id === p2.id; }).length, 0);
  E.supprimerPlan(p2.id);
  eq('V5.3 supprimer : plan retiré, ligne « supprimée »', [E.planParId(p2.id), /Programmation supprimée/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text)], [null, true]);
  E.annuler();
  eq('V5.3 Annuler la suppression : plan revenu', !!E.planParId(p2.id), true);
  eq('V5.3 libellé : texte échappé à l\'affichage (pas de HTML dans les plans)', E.normaliser({ deckPlans: [{ id: '<img>', deck: 'vert', start: i5(5) }] }).deckPlans[0].deck, 'vert');
  eq('V5.3 plans gardés à l\'export / import', E.normaliser(JSON.parse(JSON.stringify(PL.etat.data))).deckPlans.length, PL.etat.data.deckPlans.length);
  // ravitaillement programmé
  var vr = E.enregistrerVol({ callsign: 'RAV 1', type: 'PTR', takeoffPlanned: i5(-30), takeoffActual: i5(-30), enduranceMin: 150, sequences: [] });
  E.ajouterSequence(vr.id, { kind: 'ravito', start: at3(20), dur: 15 });
  var sq = E.volParId(vr.id).sequences[0];
  eq('V5.3 ravito : pas de rappel avant l\'heure, rappel à l\'heure', [E.rappelsRavito(at3(19)).length, E.rappelsRavito(at3(20)).length], [0, 1]);
  eq('V5.3 ravito : alerte orange « ravitaillement prévu … — confirmer ? »', PL.alertes.calculer(PL.etat.data, at3(21)).filter(function (a) { return a.action && a.action.ravito; }).map(function (a) { return [a.niveau, a.vol === vr.id, /RAV 1 : ravitaillement prévu \d\d:\d\d .*— confirmer \?/.test(a.texte)]; }), [['warn', true, true]]);
  eq('V5.3 ravito : rappel disparaît 60 min après l\'heure', E.rappelsRavito(at3(81)).length, 0);
  E.traiterRavito(vr.id, sq.id, true);
  eq('V5.3 ravito confirmé : ligne « Ravitaillement commencé », rappel parti', [/Ravitaillement commencé/.test(PL.etat.data.log[PL.etat.data.log.length - 1].text), E.volParId(vr.id).sequences[0].fait, E.rappelsRavito(at3(21)).length], [true, 'fait', 0]);
  E.annuler();
  eq('V5.3 ravito : Annuler, le rappel revient', E.rappelsRavito(at3(21)).length, 1);
  E.traiterRavito(vr.id, sq.id, false);
  eq('V5.3 ravito ignoré : marqué, rappel parti', [E.volParId(vr.id).sequences[0].fait, E.rappelsRavito(at3(21)).length], ['ignore', 0]);
  eq('V5.3 ravito : « fait » gardé à l\'import', E.normaliser(JSON.parse(JSON.stringify(PL.etat.data))).flights.filter(function (f) { return f.id === vr.id; })[0].sequences[0].fait, 'ignore');
  eq('V5.3 ravito : pas de rappel pour un vol annulé', (function () { var v = E.enregistrerVol({ callsign: 'RAV 2', type: 'PTR', takeoffPlanned: i5(30), enduranceMin: 150, sequences: [] }); E.ajouterSequence(v.id, { kind: 'ravito', start: at3(40), dur: 15 }); E.annulerVol(v.id, true); return E.rappelsRavito(at3(41)).filter(function (r) { return r.vol.id === v.id; }).length; })(), 0);
  PL.stockage.save = save53; E.viderPile();

  var res = document.getElementById('resume');
  res.textContent = (ko ? '✘ ' + ko + ' ÉCHEC(S), ' : '✔ TOUS LES TESTS PASSENT — ') + ok + ' réussi(s)';
  res.className = ko ? 'ko' : 'ok';
  document.title = ko ? 'TESTS ECHEC ' + ko : 'TESTS OK ' + ok;
})();
