# Accueil

Écran de synthèse pour Repère. Une lecture, pas un second carnet et pas une seconde séance.

Florian le décrit ainsi : « un truc qui résume un peu tout, synthétique, très visuel, intelligent ». La proposition tient en une règle. **Accueil dit ce que ce jour change pour la charge, et une seule action.** Aujourd’hui reste l’endroit où l’on s’entraîne. Progrès garde les courbes. Carnet garde l’historique. La bulle du coach reste la bulle.

Les maquettes (390 × 844, @2x, clair et sombre, jetons réels de `app/globals.css`) sont livrées à part de ce dépôt. La liste est en fin de document. Rien ici ne modifie l’application.

## 1. Rôle de l’écran

Accueil répond à une question : qu’est-ce que je fais de mon corps aujourd’hui ?

Le jour d’entraînement, la réponse est un chiffre et un bouton. Le jour de repos, c’est le mot « Repos » et la séance qui vient. Le soir d’un record, c’est le record. La semaine d’allègement, c’est la charge allégée, expliquée en une phrase.

L’écran ne saisit pas de série, n’édite pas un plan, ne trace pas de courbe. Il choisit un état, montre le fait qui compte, et renvoie vers l’écran qui sait déjà faire le reste.

## 2. Ce que l’app sait déjà

Tout le nécessaire est déjà en mémoire, sauf l’agenda.

| Fait utile à Accueil | Où c’est calculé aujourd’hui | Déjà fiable |
| --- | --- | --- |
| Séance du jour, prévue, en cours ou notée | `sessions` IndexedDB, `TodayScreen`, `rank` (en cours, puis prévue) | Oui |
| Prochaine séance au-delà d’aujourd’hui | `nextSession` dans `today-screen.tsx` | Oui |
| Carnet : passé d’abord, « À venir » replié | `splitCarnet` | Oui, et ce n’est pas à refaire ici |
| Record en kg × reps, séances terminées seulement, pas le cardio | `countsForProgress`, `bestLoads`, `heaviestSet` | Oui, avec une réserve au § 4 |
| Courbes et 1RM estimé (Epley, 1 à 10 reps) | `e1rmSeries`, écran Progrès | Oui, et elles restent là-bas |
| Hausse : 80 kg tenus → « Commencer à 82,5 kg » / « Garder 80 kg » | `startOffer`, `programPreview` | Oui. Suite affichée : 82,5 × 6, puis × 7, puis × 8 |
| Allègement après deux échecs | `trainingBlock` → `stall`, `deloadLoad` | Oui. 80 kg, pas de 2,5 → **72,5 kg**. Phrase : `STALL_SENTENCE` |
| Allègement après un bloc réussi | `trainingBlock` → `cadence` | La règle part à **3** séances (`DELOAD_EVERY = 3`). La phrase dit encore « Quatre séances réussies ». Accueil ne doit pas répéter « quatre ». |
| Plan de Chef sport prioritaire | `keepsCoachPlan` : `source === "coach"` et (note d’exercice ou mot reprise / deload / léger / récupération) | Oui. `startOffer` renvoie `hold`. Le bouton reste « Commencer », sans appliquer la hausse. |
| Note du coach sur la séance | `coachNote` | Oui |
| Agenda iCloud | Worker `POST /calendar`, CalDAV, événements du jour | Le Worker sait lister. Aucun écran ne les montre. |
| Coach | `CoachLayer`, jeton et fil en local | La bulle existe. Elle n’est pas un onglet. |

Les chiffres des maquettes sortent de ces fonctions, pas d’un scénario inventé.

- Samedi 24 octobre, Upper B, 18:15. Dernière série tenue : couché 80 kg × 6. Offre : **82,5 kg**. C’est le test « ajoute des répétitions après la hausse ».
- Le soir du même jour, la série 82,5 × 6 est strictement plus lourde que 80 × 6. C’est un record au sens de `bestLoads` (la charge prime).
- Dimanche 25 octobre, rien de prévu. La prochaine séance est lundi, Upper A. Hier porte le record.
- Samedi 7 novembre, deux séances à 80 kg sans l’objectif de 6 reps. Offre : **72,5 kg**, puis retour à 80 × 6, puis 80 × 7. C’est le test « allège après deux séances sans l’objectif ».

Squat autour de 100 kg, développé incliné 28 kg, élévations 10 kg : ce sont les autres mouvements du bloc. Ils n’apparaissent pas dans le hero. Ils restent dans la séance.

## 3. Blocs

### Ce qui entre

1. **Le hero.** Un seul. Le chiffre du jour, ou le mot « Repos », ou le record. C’est le bloc qui justifie l’onglet.
2. **La semaine**, la même bande que Aujourd’hui (point sauge = notée, point cuivre = prévue, jour sélectionné en plein). Elle situe sans devenir un calendrier. Ici elle ne change pas de semaine : pas de chevrons. Toucher un jour ouvre Aujourd’hui sur cette date.
3. **Une action**, les libellés exacts de `startOffer`. « Commencer à 82,5 kg » et, en lien texte, « Garder 80 kg ». Jamais deux boutons égaux, jamais une confirmation ensuite, jamais une question par exercice.
4. **Les trois prochaines séances**, en pastilles, quand `programPreview` a quelque chose à dire. La première est la charge du bouton. Les deux autres montrent la suite (répétitions, puis charge). La longue phrase de règle ne s’affiche que lorsque le chiffre serait incompréhensible sans elle : allègement, reprise, plan tenu.
5. **Une ligne de contexte**, au plus. Record de la veille, séance manquée, ou événement d’agenda qui n’est pas déjà la séance.

L’engrenage des réglages reste en haut à droite, icône seule, `aria-label="Réglages"`. Le mot « Réglages » à côté du titre a déjà débordé à 160 %. On ne le réintroduit pas.

### Ce qui reste dehors

- **La liste des exercices.** C’est Aujourd’hui et l’aperçu « Voir la séance ». La remettre sur Accueil fait deux écrans d’accueil. La variante B des maquettes le montre : elle est juste, et elle est déjà construite.
- **Les courbes, la carte des muscles, le 1RM estimé.** Progrès. Un sparkline sur Accueil serait un second graphique à tenir à jour, et Epley ne décrit pas la séance du jour.
- **Le carnet et le bloc « À venir ».** Une ligne « lundi, Upper A » suffit. La liste est à un onglet.
- **Modifier la séance, le détail des réglages, la sauvegarde.** L’engrenage ouvre les feuilles déjà là. Le rappel de sauvegarde ancienne reste sur Aujourd’hui, pas sur la synthèse.
- **La conversation du coach.** La bulle. Une citation italique seulement si le plan est tenu et que `coachNote` ajoute un fait que le chiffre ne dit pas.
- **L’agenda de la journée.** Une ligne, plus tard, et seulement si l’événement n’est pas la séance elle-même (même titre, même heure). « Agenda libre » n’apporte rien : on ne l’écrit pas.
- **Les félicitations, les toasts, les pastilles rouges, les confirmations répétées.** Le chiffre sauge est l’accusé de réception d’un record. Rien d’autre.

## 4. Comportement selon le moment

Un seul résolveur, pur, sur les séances déjà chargées. Il choisit un état. L’écran ne mélange pas deux héros.

**Jour d’entraînement, avant la séance.** État par défaut des maquettes « entraînement ». Séance `planned` aujourd’hui. Le hero est la charge proposée pour le premier mouvement qui change (couché, 82,5 kg), pas le nom de tous les exercices. Sous le chiffre : « Développé couché · 4 × 6 » et « Dernière série tenue : 80 kg × 6 ». Pastilles : 82,5 × 6, 82,5 × 7, 82,5 × 8. Bouton « Commencer à 82,5 kg ». Lien « Garder 80 kg ». Lien discret « Voir la séance », qui ouvre l’aperçu déjà existant.

**Plan de Chef sport tenu.** `keepsCoachPlan` vrai. Le hero montre la charge écrite, 80 kg, pas 82,5. Phrase : « Le plan de Chef sport reste prioritaire, et cette suite ne le remplace pas. » Bouton « Commencer ». Pas de lien « Garder », puisqu’il n’y a pas de choix. La note du coach peut tenir sur la ligne sous le chiffre si elle dit autre chose que la phrase.

**Jour de repos.** Rien de prévu aujourd’hui, et pas de séance en cours. Le mot « Repos » a la même taille que le chiffre. Une phrase : « Prochaine séance lundi, Upper A. » Une ligne de fait : « Hier, couché tenu à 82,5 kg × 6. » Un lien « Voir lundi », qui sélectionne ce jour et ouvre Aujourd’hui. Pas de bouton « Commencer » sur du vide.

**Séance en cours.** `status === "active"`, même si la date n’est pas aujourd’hui. Le hero devient le titre et « Reprendre ». On ne repropose pas 82,5 kg : le choix est déjà fait. On n’ouvre pas le mode sport tout seul au démarrage à froid. Si l’app était déjà sur l’overlay, elle le reste, comme aujourd’hui.

**Juste après la séance, avec record.** Séance du jour `done`, et la série du jour est un vrai record : charge plus lourde, ou même charge avec plus de répétitions. On n’utilise pas le départage par date de `bestLoads`, qui remplacerait le record à chaque séance à charge égale et ferait une fête à chaque Upper B. Affichage **kg × reps**, couleur sauge (`--sage`, 6,7:1 sur la carte claire, 10:1 en sombre). Pas de 1RM estimé ici. Pas de bouton plein : le bilan est un lien « Bilan de la séance ». Les pastilles « Ensuite » sont la suite calculée (82,5 × 7, 82,5 × 8, 85 × 6), sans écrire de séance.

**Juste après, sans record.** Même squelette, chiffre en encre et non en sauge, phrase « Upper B terminée. » Pas de mot « record ».

**Séance manquée.** `planned` et date avant aujourd’hui. `splitCarnet` la range déjà avec le passé. Accueil peut dire, une fois : « Upper B d’hier n’est pas notée. » Lien « Ouvrir ». Pas de pastille sur l’onglet, pas de rouge, pas de rappel à chaque ouverture de la journée suivante.

**Semaine légère.** `trainingBlock` vaut `stall` ou `cadence`, et le plan n’est pas tenu. Le hero est la charge allégée. Pour deux échecs à 80 kg : **72,5 kg**, bouton « Commencer à 72,5 kg », lien « Garder 80 kg », phrase exacte « Deux séances sans l’objectif : on allège une fois, puis on reprend la charge. » Pastilles : 72,5 × 6, 80 × 6, 80 × 7. Le kicker dit « Semaine légère », pas « échec ». Pas de fond d’alerte.

Pour le bloc réussi, la phrase affichée doit suivre le code : trois séances, pas quatre. `CADENCE_SENTENCE` dit « Quatre » alors que `DELOAD_EVERY` vaut 3. À corriger dans la même phrase que l’écran réutilisera, pas à masquer par une rédaction maison.

**Reprise après une pause.** Pas de fonction dédiée aujourd’hui. Même squelette que la semaine légère, kicker « Reprise », si la dernière séance de force terminée a plus de 14 jours. La charge proposée est `deloadLoad` de la dernière charge tenue, pas un retour silencieux à un vieux record. Si un plan de Chef sport est tenu, il gagne, comme toujours. Le seuil de 14 jours est une constante d’écran, pas une nouvelle règle d’entraînement.

**Record pendant la reprise ou l’allègement.** L’état « record » ne s’applique qu’à une séance déjà terminée. Le matin, l’allègement prime.

## 5. Hiérarchie

De haut en bas, toujours dans cet ordre.

1. La date, en sourcil.
2. Le titre « Accueil ». Un seul `h1`.
3. La semaine.
4. Le fait du jour : chiffre, « Repos », ou record.
5. Une ou deux lignes qui disent de quel mouvement il s’agit.
6. La phrase, seulement si le chiffre ne se suffit pas.
7. Les trois pastilles, s’il y a une suite.
8. Le bouton, puis les liens texte.
9. La barre d’onglets, et la bulle à droite au-dessus d’elle.

Rien en dessous. À 100 % et à 130 %, pas de défilement. À 160 %, le hero d’entraînement tient encore dans l’écran si le bouton reste sur une ligne et si la bulle n’est pas poussée par `10rem` (voir § 10).

## 6. La barre d’onglets

**Accueil devient le premier onglet, et l’écran d’ouverture.**

L’état initial est aujourd’hui `useState<Tab>("today")`. Un démarrage à froid ouvre Accueil. Aujourd’hui reste le deuxième onglet : c’est là que la séance, la liste et « Modifier » vivent. Progrès et Carnet ne bougent pas.

Ordre : Accueil, Aujourd’hui, Progrès, Carnet.

Pourquoi pas remplacer Aujourd’hui. La synthèse et la séance n’ont pas le même travail. Fusionner les deux ramène la liste des exercices sur le premier écran, et l’on perd le calme qui fait l’intérêt d’Accueil.

Quatre mots tiennent à 100 % (libellés à 11 px, « Aujourd’hui » s’arrête vers 177 px dans une cellule d’environ 195). À 160 %, les libellés d’onglets sont plafonnés à 12,5 px. « Aujourd’hui » reste entier (bord droit mesuré à 181 px, cellule à 195). Le titre, lui, passe de 34 px à 54,4 px. Les onglets ne suivent pas le corps du texte jusqu’au bout : une barre de quatre mots qui grossit comme un titre se coupe. Le nom complet reste lu par VoiceOver.

L’import qui ouvre déjà le Carnet (`setTab("history")`) continue de le faire. On ne ramène pas de force sur Accueil quelqu’un qui est en train de lire une autre section.

## 7. Mode sport et bulle du coach

Le mode sport est l’overlay de séance. Il couvre Accueil. On n’y dessine pas un second hero. Les règles déjà en place restent : la bulle est masquée sur la séance, le geste, le bilan, l’aperçu et le repos entre les séries.

Accueil ne démarre pas le mode sport tout seul. Le bouton « Commencer à 82,5 kg » fait exactement ce que fait `StartActions` : `begin(true)` pour la hausse, `begin(false)` pour « Garder ». Ensuite l’overlay prend la main. Au retour du bilan, Accueil est dessous, dans l’état « séance terminée ».

La bulle ne dit rien d’elle-même sur Accueil. Elle ne s’ouvre pas pour commenter le record. Toucher la citation d’un plan tenu peut ouvrir le coach, plus tard. Ce n’est pas nécessaire pour la première version.

La bulle reste à droite, au-dessus de la barre, hors du bouton. Le CSS livré la place à `bottom: calc(10rem + env(safe-area-inset-bottom))`. À 160 %, 10 rem valent 256 px : la bulle monte sur la carte. Les maquettes la fixent en pixels au-dessus de la barre (108 px). C’est le placement à reprendre pour tout l’app, pas seulement pour Accueil.

## 8. États vides

**Aucune séance.** Pas de semaine fictive, pas de 80 kg d’exemple. Le hero dit « Rien encore. » Un bouton : « Déposer le plan ». La même promesse que l’accueil actuel : les séances restent sur ce téléphone.

**Des séances existent, rien aujourd’hui, rien devant.** « Repos », sans phrase de prochaine séance. Lien « Créer une séance », vers la feuille déjà là.

**Agenda indisponible, jeton absent, Worker en erreur.** On n’affiche pas la ligne. Pas de bandeau d’erreur sur Accueil. La synthèse ne dépend pas du réseau.

**Séance cardio.** Le hero peut dire la sortie (« Course, 32 min ») s’il n’y a pas de force ce jour-là. Pas de record de charge, pas de pastilles de répétitions. Le cardio ne compte pas dans `countsForProgress`.

## 9. Performance

Accueil ne charge rien de plus pour se peindre. Les séances sont déjà dans l’état de l’app. `startOffer`, `programPreview`, `bestLoads` sont des fonctions pures, déjà appelées par Aujourd’hui et Progrès.

Pas de courbe sur cet écran, donc pas de canvas. Pas de seconde copie des séances.

L’agenda, le jour où on l’ajoutera, part après le premier rendu. Une requête, un cache pour la journée, échec silencieux. S’il n’y a pas de jeton, on ne tente pas.

Aujourd’hui les trois écrans sont montés ensemble, Progrès inclus, et masqués avec `hidden`. Accueil doit rester un petit DOM. On ne profite pas de ce chantier pour démonter Progrès, sauf si la mesure montre que le premier affichage en souffre.

## 10. Accessibilité

Contrastes mesurés sur les jetons réels.

| Couple | Ratio | Usage |
| --- | --- | --- |
| Encre `#1b1916` sur fond `#efeae2` | 14,6:1 | Titre, chiffre |
| Cuivre `#9a3e12` sur carte `#fbf8f3` | 6,5:1 | Kicker, liens |
| Sauge `#246346` sur carte claire | 6,7:1 | Record, y compris en petit |
| Encre douce `#5c574f` sur fond clair | 6,0:1 | Métadonnées |
| Bouton clair, `#f6f1e8` sur `#1b1916` | 15,6:1 | « Commencer à … » |
| Cuivre sombre `#e8a06a` sur carte `#17191e` | 8,1:1 | Kicker sombre |
| Sauge sombre `#9dcfb0` sur carte sombre | 10:1 | Record sombre |
| Bouton sombre, `#1b120c` sur `#e8925a` | 7,6:1 | Le bouton cuivre |

Le cuivre vif `#c4622d` sur carte claire est à 3,9:1. Il sert au point de la semaine et au filet, pas à une phrase.

**Dynamic Type.** Le corps suit la taille de l’iPhone, comme le reste de l’app.

- 100 %. Titre 34 px, ligne 13,5 px, chiffre 76 px, onglets 11 px.
- 160 %. Titre 54,4 px, ligne 21,6 px, chiffre 86 px. Les onglets restent à 12,5 px pour que « Aujourd’hui » ne se coupe pas. Le bouton d’action est plafonné à 18 px et tenu sur une ligne : à 27 px, « Commencer à 82,5 kg » passait sur deux lignes et la bulle couvrait le lien. Les zones tactiles restent à 44 px. La carte se termine vers 665 px, la bulle commence à 680, la barre à 758. Rien ne se coupe, rien ne passe sous la barre.
- 130 % se situe entre les deux. Le même plafond d’onglet et de bouton évite le cas limite. À vérifier sur appareil au moment de l’implémentation, avec 390 × 844 et 375 × 667.

**VoiceOver**, dans l’ordre du DOM.

- Titre « Accueil ».
- Chaque jour : « samedi 24 octobre, séance prévue » (ou « séance notée », ou « aujourd’hui »). Le point coloré n’est pas une image à part.
- Le hero groupé : « Upper B, développé couché, 82,5 kilogrammes, 4 séries de 6. Dernière série tenue, 80 kilogrammes par 6. »
- Le bouton, puis « Garder 80 kilogrammes », puis « Voir la séance ».
- La bulle : « Ouvrir le coach », déjà en place.
- Les onglets gardent leur nom complet même si le dessin est petit.

Pas d’animation de compteur sur le chiffre. Si un fondu est ajouté plus tard, il respecte `prefers-reduced-motion`, déjà traité pour le coach.

Le focus visible cuivre (`:focus-visible`) s’applique aux liens et au bouton, comme ailleurs.

## 11. Deux héros

Le choix est réel. Les deux sont côte à côte dans les maquettes « comparaison ».

**A · Le chiffre.** Proposée. 82,5 kg occupe la carte. On comprend la décision sans lire la liste. Aujourd’hui reste disponible pour les six exercices.

**B · La carte.** C’est l’écran Aujourd’hui, raccourci : titre Upper B, deux exercices, « puis écarté, militaire… », le même bouton. C’est familier, et c’est un doublon. Le chiffre de la décision y est à 17 px dans un bouton, pas à 76 px.

A est le bon hero pour les quatre états. B n’a pas de forme utile pour « Repos » ni pour un record : elle redeviendrait une fiche de séance vide, ou une fiche déjà notée. Un seul langage, celui du chiffre, couvre l’entraînement, le repos, le record et l’allègement.

## 12. Plan

**P0. L’écran dit juste, et l’on peut s’entraîner depuis lui.**

- Onglet Accueil en première position. Démarrage à froid sur Accueil. Aujourd’hui, Progrès, Carnet inchangés dans leur rôle.
- `homeContext` pur, testé : entraînement, repos, en cours, terminée, record, plan tenu, vide.
- Hero A, libellés de `startOffer` sans les reformuler. `begin(true)` / `begin(false)` comme `StartActions`. Pas de seconde question dans la séance.
- `keepsCoachPlan` gagne : chiffre du plan, bouton « Commencer », phrase du plan.
- Bande de semaine, jour touché → Aujourd’hui.
- État vide « Déposer le plan ».
- Clair et sombre, avec les jetons déjà là.

**P1. L’écran change selon le moment.**

- Record seulement si la série du jour est strictement meilleure, affiché en kg × reps, couleur sauge, lien vers le bilan.
- Semaine légère avec `STALL_SENTENCE` ou la phrase de cadence alignée sur 3 séances.
- Reprise après 14 jours, même formule `deloadLoad`, sauf plan tenu.
- Séance manquée, une ligne, une fois.
- Passage 100 / 130 / 160 % sur 390 × 844 et 375 × 667. Bulle en pixels au-dessus de la barre. Bouton d’action sur une ligne. Onglets plafonnés, noms complets pour VoiceOver.
- Noms accessibles du hero et des jours.

**P2. Ce qui peut attendre.**

- Une ligne d’agenda, après le premier rendu, dédupliquée avec l’heure de la séance, silence si le Worker ne répond pas.
- Citation du `coachNote` quand le plan est tenu.
- Cardio seul au hero, sans pastilles de charge.

Hors de ce chantier : la formule de progression, le Worker, le jeton, le mode sport, le déploiement.

## 13. Maquettes

Fichiers PNG, 390 × 844 points, facteur 2 (780 × 1688 px), sauf les comparaisons (860 × 928 points). Inter, rayons, cartes, bouton, onglets et bulle reprennent les règles de l’app. Les PNG ne sont pas dans le dépôt.

| Fichier | Ce qu’on voit |
| --- | --- |
| `accueil-entrainement-clair.png` | Samedi, Upper B, 82,5 kg, avant la séance. Clair. |
| `accueil-entrainement-sombre.png` | Le même jour, sombre. |
| `accueil-repos-clair.png` | Dimanche, « Repos », prochaine séance lundi. Clair. |
| `accueil-repos-sombre.png` | Le même repos, sombre. |
| `accueil-record-clair.png` | Le soir, record 82,5 × 6, en sauge. Clair. |
| `accueil-record-sombre.png` | Le même record, sombre. |
| `accueil-deload-clair.png` | Samedi 7 novembre, semaine légère, 72,5 kg. Clair. |
| `accueil-deload-sombre.png` | Le même allègement, sombre. |
| `accueil-texte-160-clair.png` | Le jour d’entraînement à 160 % de texte. Clair. |
| `accueil-texte-160-sombre.png` | Le même texte agrandi, sombre. |
| `accueil-hero-comparaison-clair.png` | A, le chiffre, à côté de B, la carte. Clair. |
| `accueil-hero-comparaison-sombre.png` | Les deux héros, sombre. |

A est marquée « proposée » sur les comparaisons.
