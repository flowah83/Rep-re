/* Pont·Line — main.js : démarrage, horloges, bandeaux, réglages, annulation, minuteries. */
window.PL = window.PL || {};
(function (PL) {
  'use strict';
  var T = PL.temps, E = PL.etat, S = PL.stockage, Y = PL.systeme, esc = E.esc, MIN = T.MIN;
  var $ = function (id) { return document.getElementById(id); };
  var acks = lireAcks(), avertissementVu = false, essaiVu = false, toastTimer = null, videVu = false, demarrageVide = false, confCb = null, confOuvertA = 0, confFocus = null, dernierSecours = Date.now();
  PL.alertesCourantes = []; PL.conflitsCourants = [];

  function toast(msg, ko) {
    var t = $('toast'); t.textContent = msg; t.className = ko ? 'ko' : '';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'hidden'; }, ko ? 5000 : 2800);
  }

  /* ---- V4 (audit V3b, P2-7) : mise à jour ciblée d'une zone ----
     Rien ne change si le contenu est identique (sélection de texte, focus et défilement intacts) ; sinon le focus
     clavier est remis sur l'élément équivalent (même id ou mêmes attributs data-…). */
  var CLES = ['data-ack', 'data-act', 'data-cor', 'data-decolle', 'data-annule', 'data-vol', 'data-k', 'data-restaurer', 'data-radio', 'data-eta', 'data-ouvrir', 'data-pconf', 'data-pign', 'data-rconf', 'data-rign'];
  function cleFocus(el) {
    if (!el || !el.getAttribute) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    var p = CLES.filter(function (n) { return el.hasAttribute(n); }).map(function (n) { return '[' + n + '="' + CSS.escape(el.getAttribute(n)) + '"]'; });
    return p.length ? el.tagName.toLowerCase() + p.join('') : null;
  }
  function poser(el, html) {
    if (!el || el.__h === html) return false;
    var act = document.activeElement, k = act && act !== el && el.contains(act) ? cleFocus(act) : null, sc = el.scrollTop;
    el.innerHTML = html; el.__h = html; el.scrollTop = sc;
    if (k) { var n = el.querySelector(k); if (n) try { n.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
    return true;
  }
  // annonce des NOUVELLES alertes seulement (lecteur d'écran), pas de relecture de tous les bandeaux
  var annoncees = {};
  function annoncer(alertes) {
    var neuves = alertes.filter(function (a) { return annoncees[a.cle] !== a.niveau; });
    var vus = {}; alertes.forEach(function (a) { vus[a.cle] = a.niveau; }); annoncees = vus;
    if (neuves.length) $('annonce').textContent = neuves.map(function (a) { return ({ danger: 'Urgent', warn: 'Attention', info: 'Rappel' })[a.niveau] + ' : ' + a.texte; }).join('. ');
  }

  /* ---- fenêtre de confirmation de Pont·Line (remplace confirm() pour les saisies importantes) ---- */
  // opts.champ (V3) : { libelle, placeholder, analyse(texte) -> { ok, aide, cls, libOui } } ; oui(valeur) reçoit le texte saisi
  var confChamp = null, confAutre = null;
  // opts.autre (V4) : { lib, cb } troisième bouton (ex. « Corriger seulement le texte ») ; opts.champ.valeur : texte pré-rempli
  function confirmer(titre, html, oui, libOui, libNon, opts) {
    $('cfTitre').textContent = titre; $('cfTexte').innerHTML = html;
    $('cfOui').textContent = libOui || 'Confirmer'; $('cfNon').textContent = libNon || 'Annuler';
    confCb = oui; confOuvertA = Date.now(); confFocus = document.activeElement;
    confChamp = opts && opts.champ ? opts.champ : null;
    confAutre = opts && opts.autre ? opts.autre : null;
    $('cfAutre').classList.toggle('hidden', !confAutre); if (confAutre) $('cfAutre').textContent = confAutre.lib;
    $('cfZone').classList.toggle('hidden', !confChamp);
    $('modalConf').classList.remove('hidden');
    if (confChamp) {
      $('cfLib').textContent = confChamp.libelle || ''; $('cfChamp').value = confChamp.valeur || ''; $('cfChamp').placeholder = confChamp.placeholder || '';
      $('cfChamp').maxLength = confChamp.max || 12;
      majConfChamp(); setTimeout(function () { $('cfChamp').focus(); }, 60);
    } else { $('cfOui').disabled = false; setTimeout(function () { $('cfOui').focus(); }, 60); }
    if (confChamp && confChamp.valeur) setTimeout(function () { try { $('cfChamp').select(); } catch (e) { /* rien */ } }, 70);
  }
  function majConfChamp() {
    if (!confChamp) return;
    var r = confChamp.analyse($('cfChamp').value) || {};
    $('cfAide').textContent = r.aide || ''; $('cfAide').className = 'aide ' + (r.cls || '');
    $('cfOui').disabled = !r.ok;
    if (r.libOui) $('cfOui').textContent = r.libOui;
  }
  function fermerConf(ok) {
    if ($('modalConf').classList.contains('hidden')) return;
    if (ok && Date.now() - confOuvertA < 250) return; // évite une validation par la même touche Entrée
    $('modalConf').classList.add('hidden');
    if (ok && $('cfOui').disabled) return;
    var cb = confCb, valeur = confChamp ? $('cfChamp').value : undefined; confCb = null; confChamp = null;
    if (confFocus && confFocus.focus && document.body.contains(confFocus)) try { confFocus.focus(); } catch (e) { /* rien */ }
    if (ok && cb) cb(valeur);
  }
  function confAutreClic() {
    if ($('modalConf').classList.contains('hidden') || !confAutre) return;
    var cb = confAutre.cb; $('modalConf').classList.add('hidden'); confCb = null; confChamp = null; confAutre = null;
    if (cb) cb();
  }
  function confOuverte() { return !$('modalConf').classList.contains('hidden'); }

  // V4 (audit V3b, P2-3) : les acquittements sont gardés (rechargement, redémarrage) ; nettoyés quand le vol n'est plus actif
  function lireAcks() { try { return JSON.parse(localStorage.getItem('pontline.acks') || '{}') || {}; } catch (e) { return {}; } }
  function garderAcks() {
    var g = {}, n = 0;
    Object.keys(acks).forEach(function (k) {
      var f = E.volParId(k.split(':')[0]), st = f ? E.statut(f) : null;
      if ((!f && /^quart:/.test(k)) || st === 'prevu' || st === 'envol') { g[k] = acks[k]; n++; }
    });
    acks = g;
    try { localStorage.setItem('pontline.acks', JSON.stringify(g)); } catch (e) { /* stockage plein : l'acquittement reste pour cette session */ }
  }
  function nonAcquittees() { return (PL.alertesCourantes || []).filter(function (a) { return acks[a.cle] !== a.niveau; }); }

  /* ---- état de la sauvegarde fichier et du son, toujours visibles en haut ---- */
  function depuis(ms) {
    var m = Math.round((Date.now() - ms) / MIN);
    return m < 1 ? 'à l\'instant' : 'il y a ' + T.fmtDuree(m);
  }
  function renderSauvegarde() {
    var b = $('btnFichier'); if (!b) return;
    var F = PL.fichier, d = PL.etat.data, off = d.settings.offsetMin, txt, cls;
    var dernierExport = d.lastExport ? Date.parse(d.lastExport) : null;
    if (F.etat === 'actif') {
      txt = F.derniere ? 'Fichier ✓ ' + T.hm(F.derniere, off) : 'Fichier ✓'; cls = 'ok';
      b.title = 'Sauvegarde automatique dans le dossier « ' + F.nom + ' »' + (F.derniere ? ', dernière écriture ' + T.hms(F.derniere, off) : '');
    } else if (F.etat === 'conflit') {
      txt = 'Sauvegarde fichier BLOQUÉE — voir le bandeau'; cls = 'ko';
      b.title = 'Le dossier contient des saisies que ce navigateur n\'a pas : rien n\'a été écrit.';
    } else if (F.etat === 'pause' || F.etat === 'erreur') {
      txt = 'Sauvegarde fichier en PAUSE — cliquer'; cls = 'ko';
      b.title = F.etat === 'erreur' ? 'Erreur d\'écriture : ' + F.erreur : 'Le navigateur redemande l\'autorisation d\'écrire dans le dossier « ' + F.nom + ' ».';
    } else {
      var vieux = !dernierExport || Date.now() - dernierExport > (d.settings.autoDl || 4) * 3600000;
      txt = 'Dernier export : ' + (dernierExport ? depuis(dernierExport) : 'jamais');
      cls = vieux && (d.log.length > 1 || d.flights.length) ? 'warn' : '';
      b.title = 'Pas de dossier de sauvegarde automatique. Cliquer pour en choisir un (Données).';
    }
    b.textContent = txt; b.className = 'btn petit etat-fichier ' + cls;
  }
  function renderSon() {
    var e = $('sonEtat'); if (!e) return;
    var st = Y.sonEtat();
    e.classList.toggle('hidden', st === 'actif');
    e.textContent = st === 'désactivé' ? '🔇 Son des alertes COUPÉ' : '🔇 Son bloqué : cliquer pour l\'activer';
    e.title = st === 'désactivé' ? 'Les alertes ne sonnent pas. Cliquer pour régler le son (Données).' : 'Le navigateur bloque le son tant qu\'on n\'a pas cliqué dans la page.';
  }

  function appliquerTheme() {
    var th = PL.etat.data.settings.theme === 'nuit' ? 'nuit' : 'jour';
    document.documentElement.setAttribute('data-theme', th);
    $('btnTheme').textContent = th === 'nuit' ? 'Jour' : 'Nuit';
  }

  function horloges() {
    var now = Date.now(), d = PL.etat.data, off = d.settings.offsetMin;
    $('hBord').textContent = T.hms(now, off);
    $('hZ').textContent = T.hms(now, 0) + 'Z';
    var lettre = T.lettreFuseau(off);
    $('lBord').textContent = 'BORD ' + (lettre ? lettre + ' · ' : '') + T.offsetLabel(off) + ' · ' + T.dateBord(now, off);
    $('lZ').textContent = 'ZULU · ' + T.dateBord(now, 0);
    var sv = $('sauve');
    if (S.erreur) { sv.textContent = 'NON SAUVEGARDÉ'; sv.className = 'ko'; }
    else if (S.lectureSeule) { sv.textContent = 'lecture seule'; sv.className = 'ko'; }
    else if (S.derniereSauvegarde) { sv.textContent = '● sauvegardé ' + T.hms(S.derniereSauvegarde, off); sv.className = ''; }
    else { sv.textContent = ''; }
  }

  function majAnnuler() {
    var m = E.prochaineAnnulation(), b = $('btnAnnuler');
    b.disabled = !m || S.lectureSeule;
    b.title = m ? 'Annuler : ' + m.libelle + ' (Ctrl+Z)' : 'Rien à annuler';
    // V4 (P3-9) : ce qui sera annulé est écrit sur le bouton
    var lib = m ? '↶ Annuler : ' + (m.libelle.length > 26 ? m.libelle.slice(0, 25) + '…' : m.libelle) : '↶ Annuler';
    if (b.textContent !== lib) b.textContent = lib;
  }

  function renderEntete(now) {
    var d = PL.etat.data, off = d.settings.offsetMin;
    var p = E.etatPont(), b = $('pont');
    b.className = p ? p.etat : '';
    b.textContent = p ? (p.etat === 'vert' ? '✔ PONT VERT' : '✖ PONT ROUGE') : 'PONT —';
    var pr = PL.alertes.prochain(d, now);
    $('prochain').innerHTML = pr ? 'Prochain : <b>' + esc(pr.texte) + ' · ' + T.hm(pr.t, off) + '</b> (dans ' + T.fmtDuree(Math.round((pr.t - now) / MIN)) + ')' : '';
    $('demo').classList.toggle('hidden', !d.settings.demo);
    $('essai').classList.toggle('hidden', !Y.enLigne);
    majAnnuler();
  }

  // le bandeau « aucune donnée » disparaît dès la première vraie saisie (vol ou ligne non système)
  function aDesSaisies() {
    var d = PL.etat.data;
    return d.flights.length > 0 || d.log.some(function (l) { return l.kind !== 'system'; });
  }
  // appelé par fichier.js quand l'état de la sauvegarde fichier change (bouton d'en-tête + bandeaux)
  function majFichier() { renderSauvegarde(); renderBandeaux(); if ($('modalReglages') && !$('modalReglages').classList.contains('hidden') ) majReglagesFichier(); }

  function majReglagesFichier() {
    var off = PL.etat.data.settings.offsetMin;
    var F = PL.fichier;
    $('rgDossierEtat').innerHTML = F.etat === 'actif' ? 'Actif : dossier « <b>' + esc(F.nom) + '</b> »' + (F.derniere ? ', dernière écriture ' + T.hms(F.derniere, off) : '') :
      F.etat === 'conflit' ? 'BLOQUÉE : le dossier contient des saisies que ce navigateur n\'a pas. Voir le bandeau en haut (« Reprendre ces données »).' :
      F.etat === 'pause' ? 'En pause : cliquez « Autoriser » (le navigateur redemande la permission après un redémarrage).' :
      F.etat === 'erreur' ? 'Erreur : ' + esc(F.erreur) :
      F.etat === 'indispo' ? 'Impossible avec ce navigateur : utilisez Chrome ou Edge. Le téléchargement automatique prend le relais.' :
      'Aucun dossier choisi : seul le téléchargement automatique protège vos données.';
    $('rgDossier').textContent = F.etat === 'actif' ? 'Changer de dossier…' : F.etat === 'pause' ? 'Autoriser' : 'Choisir le dossier de sauvegarde…';
    $('rgDossierOublier').classList.toggle('hidden', !(F.etat === 'actif' || F.etat === 'pause' || F.etat === 'erreur' || F.etat === 'conflit'));
  }

  // V3 (P2-8) : une fois par jour (heure bord), faire vérifier l'heure du PC, l'heure bord et l'heure Z
  function jourBord(now) { return T.dateIso(now, PL.etat.data.settings.offsetMin).slice(0, 8); }
  function controleHeureDu() {
    var d = PL.etat.data, now = Date.now(), off = d.settings.offsetMin;
    if (d.settings.controleHeure === jourBord(now)) return '';
    var pcOff = -new Date(now).getTimezoneOffset();
    var t = 'Contrôle du jour — comparez à l\'horloge de référence du bord : bord <b>' + T.hm(now, off) + '</b> (' + esc(T.offsetLabel(off)) + ') · Z <b>' + T.hm(now, 0) + 'Z</b> · PC ' + T.hm(now, pcOff) + ' (Windows ' + esc(T.offsetLabel(pcOff)) + ').';
    if (pcOff !== off) t += ' <i>Windows et le bord n\'ont pas le même fuseau : normal si le bord a changé de fuseau, mais vérifiez que l\'heure Z est juste.</i>';
    return t;
  }
  function heureOk() {
    if (!E.peutEcrire()) return;
    var d = PL.etat.data, now = Date.now(), off = d.settings.offsetMin;
    d.settings.controleHeure = jourBord(now);
    E.ajouterLog({ kind: 'system', text: 'Heure contrôlée : bord ' + T.hms(now, off) + ' (' + T.offsetLabel(off) + '), Z ' + T.hms(now, 0) + 'Z, Windows ' + T.offsetLabel(-new Date(now).getTimezoneOffset()) });
  }

  function renderBandeaux() {
    var h = '';
    if (S.lectureSeule) h += '<div class="bandeau danger"><b>LECTURE SEULE</b><span class="txt">' + (S.mainPerdue ? 'Une autre fenêtre Pont·Line a pris la main. <b>Fermez cette fenêtre-ci</b> (ou reprenez la main ici).' : 'Pont·Line est déjà ouvert dans une autre fenêtre ou un autre onglet. Fermez-la, ou prenez la main ici. Si elle est cachée, cette fenêtre prendra la main toute seule dans quelques secondes.') + '</span><button class="btn petit" id="bPrendre">Prendre la main ici</button></div>';
    if (S.erreur) h += '<div class="bandeau danger"><b>SAUVEGARDE</b><span class="txt">' + esc(S.erreur) + '</span></div>';
    if (S.avertissement && !avertissementVu) h += '<div class="bandeau warn"><b>ATTENTION</b><span class="txt">' + esc(S.avertissement) + '</span><button class="btn petit" id="bAvert">OK</button></div>';
    if (Y.enLigne && !essaiVu) h += '<div class="bandeau info"><b>VERSION D\'ESSAI</b><span class="txt">Version en ligne pour essayer : ne saisissez pas de données réelles. Les données restent dans ce navigateur, rien n\'est envoyé. Pour le bord, utilisez la version à copier sur le PC.</span><button class="btn petit" id="bEssai">Compris</button></div>';
    var F = PL.fichier;
    if (F && F.etat === 'pause') h += '<div class="bandeau warn"><b>SAUVEGARDE FICHIER</b><span class="txt">En pause : le navigateur redemande l\'autorisation d\'écrire dans le dossier « ' + esc(F.nom) + ' ».</span><button class="btn petit" id="bReautoriser">Autoriser</button></div>';
    if (F && F.etat === 'conflit' && F.conflit) {
      var c = F.conflit;
      h += '<div class="bandeau danger" data-fk="b:conflit"><b>DOSSIER</b><span class="txt">Le fichier ' + esc(c.nom) + ' du dossier « ' + esc(F.nom) + ' » contient ' + c.manque + ' ligne(s) de main courante que ce navigateur n\'a pas (' + c.lignes + ' lignes, ' + c.vols + ' vols' + (c.maj ? ', modifié le ' + esc(T.dateBord(Date.parse(c.maj), PL.etat.data.settings.offsetMin) + ' à ' + T.hm(Date.parse(c.maj), PL.etat.data.settings.offsetMin)) : '') + '). Rien n\'a été écrit dans le dossier.</span><button class="btn petit primaire" id="bReprendre">Reprendre ces données</button><button class="btn petit" id="bEcraser">Écraser quand même…</button></div>';
    }
    if (F && F.etat === 'erreur') h += '<div class="bandeau warn"><b>SAUVEGARDE FICHIER</b><span class="txt">Écriture impossible dans le dossier (' + esc(F.erreur) + '). Exportez à la main, ou choisissez un autre dossier dans Données.</span><button class="btn petit" id="bReautoriser">Réessayer</button></div>';
    // V3 : jusqu'à 3 alertes visibles à la fois (rouges d'abord), une ligne chacune
    var visibles = nonAcquittees(), MAXB = window.innerHeight * 16 / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) < 820 ? 2 : 3; // V4 (P2-9) : 2 bandeaux d'alerte sur un petit écran (V6 : hauteur en unités de la mise en page, qui grandit avec l'écran)
    visibles.slice(0, MAXB).forEach(function (a, i) {
      var nom = { danger: '⚠ URGENT', warn: '⚠ ATTENTION', info: 'ℹ RAPPEL' }[a.niveau];
      h += '<div class="bandeau alerte ' + a.niveau + '"><b>' + nom + '</b><span class="txt">' + esc(a.texte) + '</span>' +
        (i === MAXB - 1 && visibles.length > MAXB ? '<span class="autres">+' + (visibles.length - MAXB) + ' autre(s)</span>' : '') +
        (a.action && a.action.decolle ? '<button class="btn petit" data-decolle="' + esc(a.action.decolle) + '">Décollé à ' + T.hm(a.action.t, PL.etat.data.settings.offsetMin) + '</button><button class="btn petit" data-annule="' + esc(a.action.decolle) + '" title="Le vol ne partira pas : plus d\'alerte">Vol annulé…</button>' : '') +
        (a.action && a.action.radio ? '<button class="btn petit primaire" data-radio="1" data-vol="' + esc(a.action.radio) + '" title="Contact radio reçu : ops normal (écrit dans la main courante)">Radio ✓</button>' : '') +
        (a.action && a.action.pont ? '<button class="btn petit primaire" data-pconf="' + esc(a.action.pont) + '" data-phase="' + esc(a.action.phase) + '" title="Noter maintenant le changement de pont dans la main courante">Confirmer : pont ' + esc(a.action.deck) + '</button><button class="btn petit" data-pign="' + esc(a.action.pont) + '" data-phase="' + esc(a.action.phase) + '" title="Le pont ne change pas">Ignorer</button>' : '') +
        (a.action && a.action.ravito ? '<button class="btn petit primaire" data-rconf="' + esc(a.action.ravito) + '" data-seq="' + esc(a.action.seq) + '" title="Noter le début du ravitaillement dans la main courante">Confirmer</button><button class="btn petit" data-rign="' + esc(a.action.ravito) + '" data-seq="' + esc(a.action.seq) + '">Ignorer</button>' : '') +
        (a.pont || a.ravito ? '' : '<button class="btn petit" data-ack="' + esc(a.cle) + '" data-niv="' + esc(a.niveau) + '">Acquitter</button>') + '</div>';
    });
    if (!S.lectureSeule && pctCache >= 70) h += '<div class="bandeau warn"><b>STOCKAGE</b><span class="txt">Stockage du navigateur rempli à ' + pctCache + ' % : archivez (Données → Nouvelle mission / archiver) avant qu\'il soit plein.</span><button class="btn petit" id="bArchiver">Archiver…</button></div>';
    // rappels (heure du jour, démarrage à vide) APRÈS les alertes
    var ctl = controleHeureDu();
    if (ctl && !S.lectureSeule) h += '<div class="bandeau info heure"><b>HEURE</b><span class="txt">' + ctl + '</span><button class="btn petit" id="bHeureOk">Heures justes</button><button class="btn petit" id="bHeureRegler">Régler…</button></div>';
    if (demarrageVide && !videVu && !S.lectureSeule && !aDesSaisies()) h += '<div class="bandeau info"><b>AUCUNE DONNÉE</b><span class="txt">Ce navigateur ne contient aucune donnée Pont·Line. Première utilisation : ignorez. Navigateur vidé ou autre navigateur : reprenez d\'abord vos données (dossier de sauvegarde ou fichier), AVANT toute saisie.</span>' + (PL.fichier.dispo || window.__plFichierTest ? '<button class="btn petit primaire" id="bReprendreDossier">Reprendre depuis le dossier de sauvegarde…</button>' : '') + '<button class="btn petit" id="bImporterVide">Importer un fichier…</button><button class="btn petit" id="bVide">Ignorer</button></div>';
    poser($('bandeaux'), h);
    annoncer(visibles);
  }

  function renderConflits() {
    var c = PL.conflitsCourants, b = $('btnConflits'), l = $('listeConflits'), off = PL.etat.data.settings.offsetMin;
    b.classList.toggle('hidden', !c.length);
    b.textContent = '⚠ ' + c.length + ' conflit' + (c.length > 1 ? 's' : '') + ' de planning';
    if (!c.length) l.classList.add('hidden');
    l.innerHTML = '<div class="conf-tete"><b>Conflits de planning</b><span>(à vérifier — rien n\'est bloqué)</span><button class="btn petit" id="fermerConflits">Fermer</button></div>' +
      c.map(function (x) {
        return '<div class="conf-ligne" data-vol="' + esc(x.vols[0]) + '"><span class="mono">' + T.hm(x.debut, off) + '</span> ' + esc(x.texte) + '</div>';
      }).join('');
  }

  function renderTout() {
    var now = Date.now(), d = PL.etat.data;
    E.cloreAuto(now); // V3 : vols posés depuis plus de N min -> clos
    PL.conflitsCourants = PL.conflits.calculer(d, now);
    var al = PL.alertes.calculer(d, now);
    // un conflit qui commence dans les 20 minutes passe aussi dans le bandeau (une seule ligne à la fois)
    PL.conflitsCourants.forEach(function (c) {
      if (c.debut - now <= 20 * MIN) al.push({ niveau: 'warn', cle: 'conflit:' + c.cle, vol: c.vols[0], texte: 'Conflit : ' + c.texte });
    });
    var rang = { danger: 0, warn: 1, info: 2 };
    al.sort(function (a, b) { return rang[a.niveau] - rang[b.niveau]; });
    PL.alertesCourantes = al;
    Y.sonnerSiNouveau(nonAcquittees(), now);
    appliquerTheme();
    horloges();
    renderEntete(now);
    renderBandeaux();
    renderConflits();
    PL.timeline.render(now);
    PL.bande.render(now); // V5 : bande des vols
    PL.vols.renderCartes(now, al);
    PL.journal.render();
    renderSauvegarde(); renderSon();
  }

  function annuler() {
    var m = E.annuler();
    if (m) toast('Annulé : ' + m.libelle + ' (ligne de correction ajoutée à la main courante).');
  }

  /* ---------- réglages et données ---------- */
  function ouvrirReglages() {
    var d = PL.etat.data, s = d.settings, off = s.offsetMin, now = Date.now(), opts = '';
    // V3 (P3-1) : heures pleines + fuseaux à la demi-heure et au quart d'heure (Inde +5:30, Népal +5:45, etc.)
    var liste = [];
    for (var h = -12; h <= 14; h++) liste.push(h * 60);
    liste = liste.concat(T.FUSEAUX_PARTIELS).sort(function (a, b) { return a - b; });
    liste.forEach(function (m) {
      var l = T.lettreFuseau(m);
      opts += '<option value="' + m + '">' + T.offsetLabel(m) + (l ? ' (' + l + ')' : '') + '</option>';
    });
    $('rgOffset').innerHTML = opts;
    if (!$('rgOffset').querySelector('option[value="' + off + '"]')) $('rgOffset').insertAdjacentHTML('beforeend', '<option value="' + off + '">' + T.offsetLabel(off) + '</option>');
    $('rgOffset').value = String(off);
    $('rgFinQuart').value = s.finQuart || '';
    $('rgMissions').value = (s.missions || []).join(', ');
    $('rgConflits').value = s.conflits === false ? '0' : '1';
    $('rgMarge').value = s.conflictMarginMin;
    $('rgEveil').value = s.eveil === false ? '0' : '1';
    $('rgSon').value = s.son ? '1' : '0';
    $('rgAutoClore').value = s.autoClore;
    $('rgOps').value = s.opsNormalMin;
    $('rgAutoDl').value = s.autoDl;
    majReglagesFichier();
    $('rgEveilEtat').textContent = 'État : ' + Y.eveilEtat;
    var vols = d.flights.filter(function (f) { return !f.deleted; }).length;
    $('rgInfo').innerHTML = 'Dernière sauvegarde automatique : <b>' + (S.derniereSauvegarde ? T.hms(S.derniereSauvegarde, off) : '—') + '</b> · Dernier export : <b>' +
      (d.lastExport ? T.dateBord(Date.parse(d.lastExport), off) + ' ' + T.hm(Date.parse(d.lastExport), off) : 'jamais') + '</b> · ' + vols + ' vol(s), ' + d.log.length + ' ligne(s), ' + Math.ceil(S.taille() / 1024) + ' Ko.<br>' +
      'Stockage principal (IndexedDB) : <b>' + (S.idbOk ? 'OK' : 'INDISPONIBLE — seule la copie rapide est utilisée') + '</b> · copie rapide (localStorage) : <b>' + (S.erreur ? 'ERREUR' : 'OK') + '</b>';
    var pcOff = -new Date().getTimezoneOffset();
    $('rgPC').textContent = 'Horloge du PC : ' + new Date(now).toLocaleString('fr-FR') + ' (' + T.offsetLabel(pcOff) + '). Toutes les heures viennent de cette horloge : si elle est fausse, réglez-la.';
    var sup = d.flights.filter(function (f) { return f.deleted; });
    $('rgSupprimes').innerHTML = sup.length ? sup.map(function (f) { return esc(f.callsign) + ' (' + T.hm(E.decollage(f), off) + ') <button class="btn petit" data-restaurer="' + esc(f.id) + '">Restaurer</button>'; }).join(' &nbsp; ') : 'Aucun.';
    var pct = pctStockage();
    $('rgStockage').innerHTML = 'Stockage du navigateur utilisé : <b class="' + (pct >= 70 ? 'r' : '') + '">' + pct + ' %</b> (' + Math.ceil(stockageUtilise() / 1000) + ' Ko sur ≈ ' + (QUOTA / 1000) + ' Ko, partagés avec les autres pages locales)' + (pct >= 70 ? ' — <b>archivez maintenant</b>.' : '.') +
      '<div class="jauge-sto"><div style="width:' + Math.min(100, pct) + '%" class="' + (pct >= 70 ? 'plein' : '') + '"></div></div>';
    $('rgVersion').textContent = 'Pont·Line V' + E.VERSION + (Y.enLigne ? ' (version d\'essai en ligne)' : '') + ' — outil d\'aide personnel, non certifié. Les procédures du bord font foi. Aucune donnée ne quitte cet appareil.';
    $('modalReglages').classList.remove('hidden');
  }
  function appliquerReglages() {
    if (!E.peutEcrire()) return;
    var s = PL.etat.data.settings, err = [];
    var fq = $('rgFinQuart').value.trim();
    if (fq && T.parseHM(fq) == null) err.push('fin de quart : HH:MM');
    var mg = parseInt($('rgMarge').value, 10);
    if (!(mg >= 0 && mg <= 60)) err.push('marge des conflits : 0 à 60 min');
    var ac = parseInt($('rgAutoClore').value, 10);
    if (!(ac >= 0 && ac <= 720)) err.push('clôture automatique : 0 à 720 min');
    var ad = parseInt($('rgAutoDl').value, 10);
    if (!(ad >= 0 && ad <= 24)) err.push('téléchargement automatique : 0 à 24 h');
    var op = $('rgOps').value.trim(), opn = /^\d{1,3}$/.test(op) ? parseInt(op, 10) : NaN;
    if (!(opn === 0 || (opn >= 5 && opn <= 240))) err.push('rappel ops normal : 0 (jamais) ou 5 à 240 min');
    if (err.length) { toast('À corriger : ' + err.join(' ; '), true); return; }
    var ancien = s.offsetMin;
    s.offsetMin = parseInt($('rgOffset').value, 10);
    s.finQuart = fq ? T.hm(T.versMs(T.parseHM(fq), 0, 0, 0), 0) : '';
    s.conflictMarginMin = mg;
    s.conflits = $('rgConflits').value === '1';
    s.eveil = $('rgEveil').value === '1';
    s.son = $('rgSon').value === '1';
    s.autoClore = ac; s.autoDl = ad;
    if (s.opsNormalMin !== opn) E.ajouterLog({ kind: 'system', text: 'Rappel ops normal par défaut : ' + (opn ? 'toutes les ' + opn + ' min' : 'désactivé') + ' (avant : ' + (s.opsNormalMin ? s.opsNormalMin + ' min' : 'désactivé') + ')' }, true);
    s.opsNormalMin = opn;
    if (s.son) { Y.debloquer(); Y.bip('danger'); }
    s.missions = $('rgMissions').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (ancien !== s.offsetMin) E.ajouterLog({ kind: 'system', text: 'Fuseau du bord changé : ' + T.offsetLabel(ancien) + ' → ' + T.offsetLabel(s.offsetMin) }, true);
    E.commit(); Y.eveil(); toast('Réglages appliqués.'); ouvrirReglages();
  }
  function compteRendu() {
    var d = PL.etat.data, off = d.settings.offsetMin, now = Date.now(), v = $('rgCRDebut').value.trim(), debut;
    if (v) {
      var h = T.parseHM(v);
      if (h == null) { toast('Heure de début : HH:MM', true); return; }
      debut = T.plusProche(h, now, off, 1440);
      if (debut > now) debut -= 1440 * MIN;
    } else debut = now - 12 * 60 * MIN;
    PL.rapport.compteRendu(debut, now);
  }
  function importer(fichier) {
    var r = new FileReader();
    r.onload = function () {
      var nouv;
      try { nouv = S.analyserImport(String(r.result)); } catch (e) { toast('Import impossible : ' + e.message, true); return; }
      var nv = nouv.flights.filter(function (f) { return !f.deleted; }).length;
      var rj = nouv.rejets; delete nouv.rejets;
      var avert = rj ? '\n\n⚠ Fichier en partie abîmé : ' + (rj.vols ? rj.vols + ' vol(s) illisible(s) écarté(s)' : '') + (rj.vols && rj.lignes ? ', ' : '') + (rj.lignes ? rj.lignes + ' ligne(s) renumérotée(s)' : '') + '.' : '';
      confirmer('Importer « ' + fichier.name + ' » ?', esc(nv + ' vol(s) et ' + nouv.log.length + ' ligne(s) de main courante.' + avert).replace(/\n/g, '<br>') + '<br><br>Les données actuelles seront <b>REMPLACÉES</b>. Une sauvegarde des données actuelles va d\'abord être téléchargée.', function () { importerOK(fichier, nouv, nv, rj); }, 'Importer et remplacer', 'Annuler');
    };
    r.readAsText(fichier);
  }
  function importerOK(fichier, nouv, nv, rj) {
    if (!E.peutEcrire()) return;
    if (PL.etat.data.flights.length || PL.etat.data.log.length) S.exporterJSON('-avant-import');
    var migre = nouv.migreDepuis; delete nouv.migreDepuis;
    PL.etat.data = nouv;
    E.viderPile(); PL.fichier.autoriserRemplacement();
    E.ajouterLog({ kind: 'system', text: 'Import du fichier ' + fichier.name + ' (' + nv + ' vols)' + (migre ? ' — fichier de la version ' + migre + ' converti automatiquement' : '') + (rj ? ' — ' + (rj.vols || 0) + ' vol(s) illisible(s) écarté(s), ' + (rj.lignes || 0) + ' ligne(s) renumérotée(s)' : '') }, true);
    E.commit(); PL.vols.fermer(); $('modalReglages').classList.add('hidden'); toast('Import terminé.');
  }
  function effacer() {
    if (!E.peutEcrire()) return;
    // V4 (P3-6) : fenêtre maison (les boîtes du navigateur figeaient l'horloge, les alertes et le son)
    confirmer('Tout effacer ?', 'Tous les vols et toute la main courante de ce navigateur seront effacés. Une sauvegarde est d\'abord téléchargée.', function () {
      S.exporterJSON('-avant-effacement');
      var s = PL.etat.data.settings, neuf = E.etatVide();
      ['offsetMin', 'theme', 'missions', 'finQuart', 'conflits', 'conflictMarginMin', 'eveil', 'son', 'zoomH', 'hideCards', 'autoClore', 'autoDl', 'controleHeure'].forEach(function (k) { neuf.settings[k] = s[k]; });
      PL.etat.data = neuf;
      E.viderPile(); PL.fichier.autoriserRemplacement();
      E.ajouterLog({ kind: 'system', text: 'Données effacées (sauvegarde téléchargée avant).' }, true);
      acks = {}; garderAcks();
      E.commit(); $('modalReglages').classList.add('hidden'); toast('Données effacées.');
    }, 'Tout effacer', 'Annuler', { champ: { libelle: 'Pour confirmer, tapez EFFACER', placeholder: 'EFFACER', max: 10,
      analyse: function (v) { return v.trim().toUpperCase() === 'EFFACER' ? { ok: true, cls: 'lu', aide: 'Les données seront effacées après le téléchargement de la sauvegarde.' } : { ok: false, aide: 'Tapez EFFACER' }; } } });
  }

  // V4 (audit V3b, P2-5) : stockage et archivage
  var pctCache = 0;
  var QUOTA = 5000000; // ≈ caractères que Chrome accepte dans le stockage local (partagé par toutes les pages file://)
  function stockageUtilise() { var n = 0; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { /* rien */ } return n; }
  function pctStockage() { return Math.round(stockageUtilise() / QUOTA * 100); }
  function archiver() {
    if (!E.peutEcrire()) return;
    var d = PL.etat.data, now = Date.now(), lim = now - 7 * 1440 * MIN;
    var garde = function (f) { var st = E.statut(f); return st === 'prevu' || st === 'envol' || st === 'pose' || E.etendue(f)[1] >= lim; };
    var volsG = d.flights.filter(garde), ids = {}; volsG.forEach(function (f) { ids[f.id] = 1; });
    var logG = d.log.filter(function (l) { return Date.parse(l.at) >= lim || (l.flightId && ids[l.flightId] && E.statut(E.volParId(l.flightId)) !== 'termine'); });
    var nV = d.flights.length - volsG.length, nL = d.log.length - logG.length;
    confirmer('Nouvelle mission / archiver', 'Tout est d\'abord exporté dans un fichier d\'archive (Téléchargements' + (PL.fichier.etat === 'actif' ? ' et dossier « ' + esc(PL.fichier.nom) + ' »' : '') + ').<br>Ensuite Pont·Line garde <b>' + volsG.length + ' vol(s)</b> (en cours ou des 7 derniers jours) et <b>' + logG.length + ' ligne(s)</b> ; <b>' + nV + ' vol(s) et ' + nL + ' ligne(s)</b> partent dans l\'archive. L\'archive se réimporte (Données → Importer).', function () {
      var nom = S.exporterJSON('-archive');
      if (PL.fichier.copieArchive) PL.fichier.copieArchive(nom, JSON.stringify(d, null, 1));
      d.flights = volsG; d.log = logG;
      E.viderPile(); PL.fichier.autoriserRemplacement();
      E.ajouterLog({ kind: 'system', text: 'Archivage : ' + nV + ' vol(s) et ' + nL + ' ligne(s) archivés dans ' + nom + ' (gardés : vols en cours et 7 derniers jours).' }, true);
      acks = {}; garderAcks();
      E.commit(); pctCache = pctStockage(); ouvrirReglages(); toast('Archivage terminé : ' + nom);
    }, 'Exporter puis archiver', 'Annuler');
  }

  // Après chargement : si les données viennent de la version 1, on le note une fois dans la main courante
  function noterMigration() {
    var d = PL.etat.data;
    if (!d.migreDepuis) return;
    var v = d.migreDepuis; delete d.migreDepuis;
    if (S.lectureSeule) return;
    E.ajouterLog({ kind: 'system', text: 'Données de la version ' + v + ' migrées automatiquement vers la version 6 (Pont·Line ' + E.VERSION + ', rien n\'a été perdu).' + (v < 4 ? ' Son des alertes activé (nouveau réglage par défaut).' : '') + (v < 5 ? ' Rappel « ops normal » : toutes les ' + PL.etat.data.settings.opsNormalMin + ' min par défaut (réglable).' : '') + ' Nouveau : pont vert / rouge programmable à l\'avance (clic sur la ligne ÉTAT DU PONT).' }, true);
    d.updatedAt = E.iso(Date.now());
    S.save();
    toast('Vos données de la version ' + v + ' ont été reprises automatiquement.');
  }

  function init() {
    PL.etat.data = S.load();
    demarrageVide = !PL.etat.data.flights.length && !PL.etat.data.log.length;
    S.persister();
    Y.initEnLigne();
    PL.timeline.init(); PL.vols.init(); PL.journal.init(); PL.bande.init(); PL.seqclic.init(); PL.pontprog.init();
    S.initVerrou(function () { S.ouvrirIDB(function () {
      S.recupererSiPlusRecent(function (repris) {
        if (repris) toast('Dernières saisies récupérées depuis le stockage principal.');
        demarrageVide = !PL.etat.data.flights.length && !PL.etat.data.log.length;
        noterMigration();
        if (!S.lectureSeule && !S.erreur) S.save();
        PL.fichier.init(function () { renderTout(); PL.pret = true; });
      });
    }); });

    $('btnAnnuler').addEventListener('click', annuler);
    $('btnTheme').addEventListener('click', function () {
      var s = PL.etat.data.settings; s.theme = s.theme === 'nuit' ? 'jour' : 'nuit'; S.save(); renderTout();
    });
    $('btnPlein').addEventListener('click', function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().then(Y.eveil).catch(function () {});
      } catch (e) { /* rien */ }
    });
    $('btnDonnees').addEventListener('click', ouvrirReglages);
    $('btnConflits').addEventListener('click', function () { $('listeConflits').classList.toggle('hidden'); });
    $('listeConflits').addEventListener('click', function (e) {
      if (e.target.id === 'fermerConflits') { $('listeConflits').classList.add('hidden'); return; }
      var l = e.target.closest('[data-vol]'); if (l) PL.vols.ouvrir(l.getAttribute('data-vol'));
    });
    $('rgFermer').addEventListener('click', function () { $('modalReglages').classList.add('hidden'); });
    $('rgExportJSON').addEventListener('click', function () { var n = S.exporterJSON(); toast('Sauvegarde téléchargée : ' + n); ouvrirReglages(); renderTout(); });
    $('rgExportCSV').addEventListener('click', function () { toast('Main courante exportée : ' + S.exporterCSV()); });
    $('rgImprimer').addEventListener('click', PL.rapport.mainCourante);
    $('rgCompteRendu').addEventListener('click', compteRendu);
    $('rgImport').addEventListener('click', function () { if (E.peutEcrire()) $('rgFichier').click(); });
    $('rgFichier').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) importer(f); });
    $('rgAppliquer').addEventListener('click', appliquerReglages);
    $('rgEffacer').addEventListener('click', effacer);
    $('rgArchiver').addEventListener('click', archiver);
    $('rgSupprimes').addEventListener('click', function (e) { var b = e.target.closest('[data-restaurer]'); if (b) { E.restaurerVol(b.getAttribute('data-restaurer')); ouvrirReglages(); } });
    $('pont').addEventListener('click', function () {
      var p = E.etatPont(), v = p && p.etat === 'vert' ? 'rouge' : 'vert';
      confirmer('Pont ' + v, 'Passer le pont au <b>' + v.toUpperCase() + '</b> maintenant ? (écrit dans la main courante)<br><span class="aide">Pour une autre heure : « Programmer… », ou cliquer sur la ligne ÉTAT DU PONT de la timeline.</span>', function () { E.saisir({ kind: 'deck', deck: v, text: 'Pont ' + v }); }, 'Pont ' + v, 'Annuler', // V4 (P3-6)
        { autre: { lib: 'Programmer…', cb: function () { var r = $('pont').getBoundingClientRect(); PL.pontprog.ouvrir(null, Math.ceil((Date.now() + 15 * 60000) / 300000) * 300000, r.left + r.width / 2, r.bottom, v); } } }); // V5.3
    });
    $('bandeaux').addEventListener('click', function (e) {
      var a = e.target.closest('[data-ack]');
      if (a) { acks[a.getAttribute('data-ack')] = a.getAttribute('data-niv'); garderAcks(); renderBandeaux(); return; }
      var ro = e.target.closest('[data-radio]'); // V5 : ops normal
      if (ro) { if (E.peutEcrire() && E.radioOk(ro.getAttribute('data-vol'))) toast('Contact radio ' + ((E.volParId(ro.getAttribute('data-vol')) || {}).callsign || '') + ' noté : ops normal.'); return; }
      var pc = e.target.closest('[data-pconf]'); // V5.3 : pont programmé
      if (pc) { var lp = E.confirmerPlan(pc.getAttribute('data-pconf'), pc.getAttribute('data-phase')); if (lp) toast(lp.text + ' : noté dans la main courante.'); return; }
      var pi = e.target.closest('[data-pign]');
      if (pi) { if (E.ignorerPlan(pi.getAttribute('data-pign'), pi.getAttribute('data-phase'))) toast('Rappel ignoré : le pont ne change pas. « Annuler » en haut pour revenir en arrière.'); return; }
      var rc = e.target.closest('[data-rconf]');
      if (rc) { if (E.traiterRavito(rc.getAttribute('data-rconf'), rc.getAttribute('data-seq'), true)) toast('Ravitaillement noté. Pour la nouvelle autonomie : bouton « Carburant… ».'); return; }
      var ri = e.target.closest('[data-rign]');
      if (ri) { if (E.traiterRavito(ri.getAttribute('data-rign'), ri.getAttribute('data-seq'), false)) toast('Rappel de ravitaillement ignoré.'); return; }
      var an = e.target.closest('[data-annule]');
      if (an) { if (E.peutEcrire()) PL.vols.annulerAvecMotif(an.getAttribute('data-annule')); return; }
      if (e.target.id === 'bAvert') { avertissementVu = true; renderBandeaux(); }
      if (e.target.id === 'bEssai') { essaiVu = true; renderBandeaux(); }
      var dc = e.target.closest('[data-decolle]');
      if (dc) { decolleApres(dc.getAttribute('data-decolle')); return; }
      if (e.target.id === 'bReautoriser') { PL.fichier.reautoriser(); return; }
      if (e.target.id === 'bHeureOk') { heureOk(); return; }
      if (e.target.id === 'bHeureRegler') { ouvrirReglages(); $('rgOffset').focus(); return; }
      if (e.target.id === 'bVide') { videVu = true; renderBandeaux(); return; }
      if (e.target.id === 'bReprendre') { if (E.peutEcrire() && PL.fichier.reprendre()) { toast('Données reprises depuis le dossier.'); } return; }
      if (e.target.id === 'bEcraser') {
        var c = PL.fichier.conflit; if (!c) return;
        confirmer('Écraser la sauvegarde du dossier ?', 'Le fichier du dossier contient <b>' + c.manque + ' ligne(s)</b> que ce navigateur n\'a pas. Elles seront perdues de ce fichier (une copie « pontline-remplace-… » est gardée dans le dossier).<br>En cas de doute : « Reprendre ces données ».', function () { PL.fichier.ecraser(); }, 'Écraser (copie gardée)', 'Ne rien faire');
        return;
      }
      if (e.target.id === 'bReprendreDossier') { var F2 = PL.fichier, pr = F2.etat === 'pause' ? F2.reautoriser() : F2.choisir(); pr.then(function () { renderTout(); if (PL.fichier.etat === 'conflit') toast('Une sauvegarde a été trouvée dans le dossier : cliquez « Reprendre ces données ».'); }); return; }
      if (e.target.id === 'bArchiver') { ouvrirReglages(); archiver(); return; }
      if (e.target.id === 'bImporterVide') { if (E.peutEcrire()) $('rgFichier').click(); return; }
      if (e.target.id === 'bPrendre') { S.verifierVerrou(true); renderTout(); toast('Vous avez la main dans cette fenêtre.'); }
    });
    // fenêtre de confirmation
    $('cfOui').addEventListener('click', function () { fermerConf(true); });
    $('cfNon').addEventListener('click', function () { fermerConf(false); });
    $('cfAutre').addEventListener('click', confAutreClic);
    $('cfChamp').addEventListener('input', majConfChamp);
    $('cfChamp').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); fermerConf(true); } });
    // son : le navigateur exige un geste de l'utilisateur
    document.addEventListener('pointerdown', function () { Y.debloquer(); setTimeout(renderSon, 200); }, true);
    document.addEventListener('keydown', function () { Y.debloquer(); }, true);
    $('rgTestSon').addEventListener('click', function () { Y.debloquer(); Y.bip('danger'); setTimeout(function () { toast(Y.sonEtat() === 'actif' ? 'Son actif : vous devez avoir entendu trois bips.' : 'Son ' + Y.sonEtat() + '. Activez « Son pour les alertes » puis Appliquer.'); renderSon(); }, 300); });
    $('rgDossier').addEventListener('click', function () {
      var F = PL.fichier, p = F.etat === 'pause' ? F.reautoriser() : F.choisir();
      p.then(function (ok) { ouvrirReglages(); toast(ok ? 'Sauvegarde automatique active.' : 'Dossier non choisi.', !ok); });
    });
    $('rgDossierOublier').addEventListener('click', function () { PL.fichier.oublier(); ouvrirReglages(); });
    $('sonEtat').addEventListener('click', function () { if (Y.sonEtat() === 'désactivé') { ouvrirReglages(); $('rgSon').focus(); } else { Y.debloquer(); setTimeout(renderSon, 200); } });
    $('btnFichier').addEventListener('click', function () {
      var F = PL.fichier;
      if (F.etat === 'pause' || F.etat === 'erreur') F.reautoriser(); else ouvrirReglages();
    });
    // V3 (audit) : Tab reste dans la fenêtre ouverte (confirmation, fiche vol, réglages)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var m = confOuverte() ? $('modalConf') : !$('modalVol').classList.contains('hidden') ? $('modalVol') : !$('modalReglages').classList.contains('hidden') ? $('modalReglages') : null;
      if (!m) return;
      var f = [].filter.call(m.querySelectorAll('button, input, select, textarea, [tabindex]'), function (x) { return !x.disabled && x.getClientRects().length && x.tabIndex >= 0; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }, true);
    document.addEventListener('keydown', function (e) {
      if (confOuverte()) {
        if (e.key === 'Escape') { e.preventDefault(); fermerConf(false); }
        return;
      }
      if (e.key === 'Escape') {
        $('modalReglages').classList.add('hidden');
        if (!$('modalVol').classList.contains('hidden')) { e.preventDefault(); PL.vols.fermerSiPossible(); }
      }
      // Raccourci N (aller à la note), hors saisie et hors fenêtre. V4 (P3-1) : plus de raccourci V (nouveau vol).
      // Pas de raccourci pour Décollage / Appontage : un mot tapé hors de la zone de note les déclencherait.
      // Une touche tapée moins d'1 s après une autre est ignorée (c'est de la frappe, pas un raccourci).
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && e.key && e.key.length === 1) {
        var t0 = e.target, enSaisie = t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.tagName === 'SELECT' || t0.isContentEditable);
        var fen = !$('modalVol').classList.contains('hidden') || !$('modalReglages').classList.contains('hidden');
        var k = e.key.toLowerCase(), now0 = Date.now(), rafale = now0 - derniereTouche < 1000;
        if (!enSaisie) derniereTouche = now0;
        if (!enSaisie && !fen && !rafale && RACCOURCIS[k]) { e.preventDefault(); RACCOURCIS[k](); return; }
      }
      // Ctrl+Z : annuler la dernière action sur les vols, sauf pendant la saisie d'un texte ou dans une fenêtre
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        var t = e.target, saisie = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        var fenetre = !$('modalVol').classList.contains('hidden') || !$('modalReglages').classList.contains('hidden');
        if (!saisie && !fenetre) { e.preventDefault(); annuler(); }
      }
    });
    document.addEventListener('visibilitychange', Y.eveil);
    document.addEventListener('click', function () { if (Y.eveilEtat !== 'actif') Y.eveil(); }, true);
    window.addEventListener('storage', function (e) {
      if (e.key === S.KEY && S.lectureSeule) { PL.etat.data = S.load(); E.viderPile(); renderTout(); }
    });
    window.addEventListener('beforeunload', function () { S.libererVerrou(); });
    window.addEventListener('pagehide', function () { S.libererVerrou(); });

    pctCache = pctStockage();
    renderTout();
    Y.eveil();
    setInterval(function () {
      horloges();
      var now = Date.now();
      Y.sonnerSiNouveau(nonAcquittees(), now); // répétition de l'alerte rouge
      if (now - dernierSecours >= 60000) { dernierSecours = now; PL.fichier.verifierSecours(now); renderSauvegarde(); pctCache = pctStockage(); }
    }, 1000);
    setInterval(renderTout, 5000); // V3 (P3-3) : alertes recalculées toutes les 5 s (15 s avant)
    setInterval(function () {
      S.presence();
      if (S.priseAuto()) { renderTout(); toast('Cette fenêtre a pris la main : l\'autre fenêtre Pont·Line était cachée.'); return; }
      if (S.verifierVerrou(false)) renderTout();
    }, 2000);
    document.addEventListener('visibilitychange', function () { setTimeout(function () { if (S.priseAuto()) { renderTout(); toast('Cette fenêtre a pris la main : l\'autre fenêtre Pont·Line était cachée.'); } }, 1100); });
  }

  var derniereTouche = 0;
  var RACCOURCIS = {
    n: function () { $('jTexte').focus(); }
    // V4 (audit V3b, P3-1) : plus de raccourci « V » (taper « Vu hélico » hors d'un champ ouvrait une fiche vol)
  };
  // Bouton « Décollé à HH:MM » du bandeau « décollage non saisi »
  // V4 (audit V3b, P1-2) : l'heure est proposée (heure prévue) mais modifiable
  function decolleApres(id) {
    var f = E.volParId(id); if (!f) return;
    var off = PL.etat.data.settings.offsetMin, prevu = E.decollage(f);
    var lireH = function (v) { // heure prévue laissée telle quelle : on garde l'instant exact prévu
      if (v.trim() === T.hm(prevu, off) && prevu <= Date.now()) return prevu;
      var h = T.lireHeure(v, off); return h == null ? null : T.plusProche(h, Date.now(), off, 720); };
    confirmer('Décollage de ' + f.callsign, 'Décollage prévu à <b>' + T.hm(prevu, off) + '</b>. À quelle heure est-il réellement parti ?', function (v) {
      var t = lireH(v); if (t == null) return;
      var l = E.saisir({ kind: 'dec', flightId: id, at: t, text: 'Décollage à ' + T.hm(t, off) + ' (saisi après coup)' });
      if (l) toast(f.callsign + ' : décollage enregistré à ' + T.hm(t, off) + '.');
    }, 'Enregistrer le décollage', 'Annuler', { champ: { libelle: 'Heure réelle de décollage (bord, ou suivie de Z)', placeholder: 'HH:MM', valeur: T.hm(prevu, off), max: 7,
      analyse: function (v) {
        var t = lireH(v); if (t == null) return { ok: false, cls: 'err', aide: 'heure invalide : HH:MM (ex. 09:05), ou 0605Z' };
        if (t > Date.now() + 2 * MIN) return { ok: false, cls: 'err', aide: 'heure dans le futur (ou plus de 12 h avant)' };
        var g = JSON.parse(JSON.stringify(f)); g.takeoffActual = E.iso(t);
        var fin = E.finAuto(g);
        return { ok: true, cls: 'lu', aide: '= ' + T.hm(t, off) + ' bord (' + T.z(t) + ') · fin d\'autonomie ' + T.hm(fin, off) + ' · H-30 ' + T.hm(fin - 30 * MIN, off), libOui: 'Décollé à ' + T.hm(t, off) };
      } } });
  }

  PL.ui = { renderTout: renderTout, majFichier: majFichier, toast: toast, ouvrirReglages: ouvrirReglages, annuler: annuler, confirmer: confirmer, confOuverte: confOuverte,
    renderSauvegarde: renderSauvegarde, poser: poser, renderSon: renderSon, nonAcquittees: nonAcquittees, decolleApres: decolleApres };
  document.addEventListener('DOMContentLoaded', init);
})(window.PL);
