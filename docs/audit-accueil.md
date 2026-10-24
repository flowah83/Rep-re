# Accueil

Tableau de bord. Pas un second « Aujourd’hui ».

La première proposition mettait la séance du jour en grand, avec la charge et « Commencer ». Florian n’y voyait pas de différence avec Aujourd’hui. Il a raison. **Accueil ne démarre aucune séance, et ne répète pas la carte de la séance.** Aujourd’hui reste le seul endroit où l’on voit la charge et où l’on commence. Accueil résume le bloc : anneaux, courbes, barres. Une ligne discrète renvoie vers la séance, au plus : « Prochaine séance : Dos vendredi → ».

Les maquettes (390 × 844, @2x, clair et sombre) sont livrées à part. Rien ici ne modifie l’application.

## 1. Rôle

Une seconde, sans lire un paragraphe. Où en est la semaine, est-ce que la charge monte, est-ce qu’un groupe décroche, est-ce qu’une semaine légère arrive.

Le graphique est le contenu. Le chiffre à côté est sa légende, comme dans Santé : grand, tabulaire, unité petite. Pas un titre de séance.

## 2. Ce que l’app sait déjà

| Tuile | Source | Déjà là |
| --- | --- | --- |
| Séances tenues / prévues | `sessions`, statut `done` / `planned`, date | Oui |
| Séance manquée | `planned` et date avant aujourd’hui | Oui. `splitCarnet` la range avec le passé |
| Volume | `tonnage()` : séries dures, charge × répétitions. `kg/main` compte les deux mains. `null` n’est pas zéro | Oui |
| Estimation | `epley`, 1 à 10 répétitions, puis `e1rmSeries`. Une séance légère ne fait pas baisser la courbe | Oui. 80 × 6 → 96 kg. 82,5 × 6 → 99 kg. 100 × 5 → 116,7 kg |
| Séries par muscle | `muscleTotals` : nombre de séries dures, pas des kilos | Oui. Écran Progrès, sept derniers jours |
| Record de charge | `bestLoads` : kg × reps, séance `done`, pas le cardio. La charge la plus lourde gagne | Oui. Ce n’est pas l’estimation |
| Palier d’après | `programPreview` | Oui. Après 80 × 6 tenu : 82,5 × 6, puis × 7, puis × 8 |
| Allègement | `trainingBlock`, `deloadLoad` | Oui. 80 kg, pas de 2,5 → 72,5 kg |
| Plan tenu | `keepsCoachPlan` | Oui. Le plan de Chef sport gagne |
| Coach | la bulle, `CoachLayer` | Oui |

Ce qui n’existe pas, et qu’on n’invente pas : poids de corps suivi, sommeil, récupération, VFC. Le cardio a parfois une fréquence, ce n’est pas une récupération. Pas de soulevé de terre classique dans l’historique (un roumain à 80 kg n’est pas une troisième courbe). Pas de troisième anneau « pour faire comme la montre ».

Les tonnes des maquettes (17,9 t cette semaine, moyenne 20,4 t) sont l’ordre de grandeur de `tonnage()` sur ses charges, poussée autour de 6 t et jambes autour de 12 t. L’écran appellera la fonction. Il ne stockera pas ces nombres.

La courbe des maquettes est celle du travail qu’il reconnaît, autour de 80 kg : l’estimation passe d’environ 93 à 96 kg en quatre semaines, soit +3 %. Si l’historique contient des séries plus lourdes à 5 répétitions, `e1rmSeries` garde cette estimation plus haute et le pourcentage peut être plat. On n’invente pas une pente pour remplir le graphique.

## 3. Ce qui entre

Dans l’ordre d’une semaine ordinaire.

1. **La semaine**, lundi à dimanche. Point sauge : notée. Point cuivre : prévue. Jour passé encore `planned` : cercle creux, couleur pierre, pas de rouge. Le jour même a le filet encre déjà utilisé sur Aujourd’hui. Toucher un jour ouvre Aujourd’hui sur cette date. Pas de chevrons de semaine.
2. **Deux anneaux concentriques**, dans l’esprit des anneaux d’Activité. L’extérieur, cuivre, est les séances tenues sur les séances prévues (2/4). L’intérieur, sauge, est le volume de la semaine sur la moyenne des quatre semaines. Le trait a un bout rond, le fond de l’anneau est le cuivre ou la sauge très dilués dans la carte, pas un gris générique. Avant dimanche, on n’écrit pas « −12 % » : la semaine n’est pas finie, et deux séances dont les jambes peuvent déjà approcher la moyenne. La légende dit « moy. », pas un reproche.
3. **Couché, en courbe.** Huit points, trait lissé, dégradé sous la courbe, deux filets très légers, le dernier point plus marqué. 96 kg, +3 % en 4 semaines. Toucher ouvre Progrès sur ce mouvement.
4. **Squat, sans fausse pente.** 116,7 kg, « une séance notée », un niveau et un point. Pas de pourcentage. Trois points minimum avant une courbe et un pourcentage.
5. **Séries de la semaine**, barres capsules, une seule couleur (cuivre : c’est un seul indicateur). Le nombre est écrit. Quadriceps 10, pectoraux 8, épaules 6, ischios 3, dans l’ordre du plus chargé. Pas de silhouette : elle est déjà dans Progrès, et en petit elle ne se lit pas.
6. **Huit semaines**, grille 7 × 8, cases arrondies. Quatre intensités de cuivre, le vide en `--heat-0`, le manqué en creux pierre, le prévu en creux cuivre, aujourd’hui avec un filet encre. Le chiffre « 6 sem. » est la série de semaines tenues. Une semaine est tenue si aucune séance prévue passée n’est restée `planned`. La semaine en cours compte encore, tant qu’il n’y a pas de manqué.
7. **Une phrase du coach**, une seule, calculée, pas rédigée à la main à chaque fois. Elle ouvre la bulle. Exemple de semaine : « Le palier d’après au couché est 82,5 × 6. »
8. **La ligne du bas.** « Prochaine séance : Dos vendredi → ». Elle ouvre Aujourd’hui. Elle ne lance pas la séance.

## 4. Ce qui reste dehors

- La carte de séance, la liste d’exercices, le RPE, l’heure, « Commencer », « Garder ». C’est Aujourd’hui. Les remettre ici, c’est la maquette que Florian a refusée.
- Le 1RM estimé en grand à la place du record de charge. Les deux nombres ne disent pas la même chose. 82,5 × 6 est le record de charge. 99 kg est l’estimation. On ne les substitue pas l’un à l’autre.
- Une liste de deux ou trois records. Le record récent a sa tuile. La liste vit dans Progrès.
- Le palier d’après en carte séparée. C’est la phrase.
- Douze semaines dans la grille. Huit restent lisibles. Douze rapetissent les cases.
- Le calendrier iCloud. Il ne résume pas l’entraînement.
- Poids, sommeil, récupération. Pas de donnée.
- Soulevé de terre. Pas de série.
- Un delta rouge, une pastille sur l’onglet, un toast.

## 5. Deux présentations

**A · Tuiles.** Proposée. Anneaux en haut, deux graphiques côte à côte, barres, grille. C’est un coup d’œil, proche de Forme. Les mêmes jetons : cuivre pour les séances, le couché et les séries ; sauge pour le volume, le squat et le point de record.

**B · Sections.** La même semaine racontée de haut en bas. Le volume est un histogramme de capsules (sauge), jour par jour, les jours prévus en creux. Une seule courbe, large, pour le couché. Le squat tient sur une ligne, faute de série. Pas d’anneaux, pas de grille : « 6 sem. » est écrit à côté du volume. Plus simple à lire dans l’ordre, moins dense.

A est le bon défaut : Florian a demandé quelque chose de très visuel. B sert si la lecture verticale lui parle davantage. À 160 %, A se rapproche de B : une colonne, anneaux, une courbe, les barres, la phrase. La grille des huit semaines quitte le premier écran plutôt que de devenir illisible.

## 6. Ce qui change de place

Le résolveur ne change pas les données. Il change l’ordre, pour que le fait rare soit en haut, sans faire défiler.

**Semaine ordinaire.** Anneaux, courbes, muscles, grille. Maquettes « semaine ». Jeudi 22 octobre : poussée lundi, jambes mercredi, dos vendredi et Upper B samedi encore prévus.

**Après un record.** La bannière passe devant les anneaux. « 82,5 × 6 », en sauge, avec la courbe dont le dernier point est sauge aussi. La légende dit « 99 kg estimés » pour ne pas faire passer le record de charge pour l’estimation. On ne redessine pas le couché une seconde fois en dessous. La grande grille cède la place : l’écran ne doit pas défiler. Phrase : « Record de charge. La suite est 82,5 × 7. » Ligne : « Prochaine séance : Upper B samedi → ». Le record reste en haut pendant la semaine qui suit, puis l’ordre ordinaire revient.

**Semaine légère.** Quatre capsules de cycle. Les trois premières sont pleines, la quatrième est plus claire et s’appelle « légère ». Ce n’est pas un gros « 72,5 » avec un bouton. La charge est une ligne : « Couché 72,5 kg, puis retour à 80. » L’anneau de volume se compare à une semaine légère (moy. 6,0 t dans la maquette), pas à 20 t, sinon la semaine a l’air ratée alors qu’elle est voulue. La courbe du couché ne plonge pas : `e1rmSeries` ne baisse pas sur une séance légère. Phrase : « Deux séances sans l’objectif. On allège, puis on reprend. » On n’écrit pas « quatre séances » : le code allège au bout de trois (`DELOAD_EVERY`), la phrase actuelle dit encore « Quatre ». On aligne la phrase avant de l’afficher.

**Séance en cours.** La ligne du bas devient « Upper B en cours → » et ouvre Aujourd’hui, où « Reprendre » existe déjà. Accueil n’ouvre pas le mode sport.

**Plan de Chef sport tenu.** La phrase est celle du plan, pas le palier calculé. Le cycle ne propose pas 72,5 kg par-dessus un plan tenu.

**Record et semaine légère le même jour.** Le record passe devant. La ligne du cycle reste sous les anneaux.

## 7. Onglets

Accueil est le premier onglet, et l’écran d’ouverture à froid. Aujourd’hui reste le deuxième : c’est là qu’on s’entraîne. Progrès et Carnet ne bougent pas.

Quatre libellés tiennent. À 160 %, ils restent plafonnés autour de 12,5 px pour que « Aujourd’hui » ne se coupe pas. VoiceOver lit le mot entier.

L’import qui ouvre déjà le Carnet continue de l’ouvrir.

## 8. La bulle

Sur Accueil, la bulle flottante est masquée. Dans les maquettes denses elle couvrait les barres. L’entrée du coach est la phrase, avec le visage, hauteur tactile 44 px. Elle ouvre la même feuille. Sur Aujourd’hui, Progrès et Carnet, la bulle reste où elle est. En mode sport, rien ne change : la bulle est déjà masquée sur la séance.

La phrase n’est pas une conversation. Pas de deuxième bulle, pas de message non sollicité.

## 9. État vide

Pas de courbe inventée, pas de grille d’échecs, pas de 80 kg d’exemple. Les deux anneaux sont au repos, sans arc de progression. Une phrase : « Déposez le plan pour voir la semaine. » Un bouton : « Déposer le plan ». Le même geste que l’accueil actuel.

## 10. Performance

Tout est déjà en mémoire. `tonnage`, `e1rmSeries`, `muscleTotals`, `programPreview` sont des fonctions pures. La courbe d’Accueil est un tracé court, pas le graphique complet de Progrès, pas une bibliothèque. Huit semaines de cases ne coûtent rien. Pas d’appel réseau pour peindre l’écran.

## 11. Accessibilité

Contrastes des jetons, déjà mesurés. Cuivre `#9a3e12` sur carte claire : 6,5:1. Sauge `#246346` sur carte claire : 6,7:1. Les mêmes teintes claires en sombre sont au-dessus de 8:1. Le bouton n’est pas sur cet écran. Le cuivre vif ne sert qu’au point et au filet.

Le premier cran de la grille est une marque, pas un texte. Le « 6 sem. » est en encre, à côté.

**Dynamic Type.** Le titre et la phrase suivent la taille de l’iPhone. Les nombres des graphiques grandissent moins, pour que l’anneau et la courbe gardent leur dessin.

- 100 %. Titre 34 px. Phrase 13 px.
- 160 %. Titre 54 px. Phrase 24 px. Les anneaux, la courbe du couché et les barres tiennent encore, avec la ligne « Prochaine séance ». La grille des huit semaines n’est plus dans ce premier écran. Les libellés d’onglets ne dépassent pas leur quart d’écran.

À vérifier sur 390 × 844 et 375 × 667, à 130 % aussi, le jour de l’implémentation.

**VoiceOver**, le texte du graphique, pas seulement la couleur.

- Anneaux : « 2 séances sur 4. Volume 17,9 tonnes, moyenne 20,4 tonnes. »
- Courbe : « Couché, 96 kilogrammes estimés, plus 3 % en quatre semaines. »
- Squat : « Squat, 116,7 kilogrammes estimés, une séance notée. »
- Barres : le nom et le nombre, « Quadriceps, 10 séries. »
- Grille : « 6 semaines tenues sur 8. »
- Manqué et prévu se distinguent par la forme (creux), pas seulement par la couleur.

Pas d’animation de compteur. `prefers-reduced-motion` reste respecté.

## 12. Plan

**P0.** L’onglet existe et ne répète pas Aujourd’hui.

- Accueil en premier, ouverture à froid. Aucun bouton « Commencer ».
- Semaine, anneaux, courbe du couché s’il y a au moins trois points, barres de séries, phrase, ligne « Prochaine séance ».
- Squat sans courbe tant qu’il n’y a pas trois séances.
- Toucher un graphique de charge ouvre Progrès. La ligne et les jours ouvrent Aujourd’hui.
- Clair, sombre, 100 % et 160 %.

**P1.** L’écran réagit.

- Bannière record (kg × reps) séparée de l’estimation, dernier point en sauge, pendant la semaine qui suit.
- Bannière de cycle quand `trainingBlock` est `stall` ou `cadence`, volume comparé à la semaine légère, phrase alignée sur trois séances.
- Grille de huit semaines et série de semaines tenues.
- Plan tenu : la phrase du plan, pas le palier calculé.
- Bulle masquée sur cet onglet seulement.

**P2.** Le squat gagne une courbe le jour où trois séances existent. Rien d’autre tant qu’une donnée nouvelle n’existe pas.

## 13. Maquettes

PNG 390 × 844 points, facteur 2, sauf les comparaisons (deux téléphones). Inter, cartes, onglets et couleurs viennent de l’app. Les graphiques sont dessinés pour cet écran : anneaux à bouts ronds, courbe lissée avec dégradé, barres capsules, grille teintée. Pas dans le dépôt.

| Fichier | Ce qu’on voit |
| --- | --- |
| `dashboard-semaine-clair.png` | Jeudi, semaine en cours. Anneaux 2/4 et 17,9 t, courbes, barres, grille. Clair. |
| `dashboard-semaine-sombre.png` | La même semaine, sombre. |
| `dashboard-record-clair.png` | La semaine d’après le record 82,5 × 6, bannière en haut. Clair. |
| `dashboard-record-sombre.png` | Le même record, sombre. |
| `dashboard-deload-clair.png` | Semaine légère, quatre capsules de cycle, 72,5 kg en ligne. Clair. |
| `dashboard-deload-sombre.png` | La même semaine légère, sombre. |
| `dashboard-texte-160-clair.png` | La semaine ordinaire, texte à 160 %. Clair. |
| `dashboard-texte-160-sombre.png` | Le même texte agrandi, sombre. |
| `dashboard-comparaison-clair.png` | A, les tuiles, à côté de B, les sections. Clair. |
| `dashboard-comparaison-sombre.png` | Les deux présentations, sombre. |

A est marquée « proposée ».
