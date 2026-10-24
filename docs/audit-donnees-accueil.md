# Données pour Accueil

Ce qu’on peut montrer sur le tableau de bord, et ce qu’on ne doit pas inventer. Accueil ne démarre pas la séance. Aujourd’hui reste le seul endroit pour la charge et pour « Commencer ». Ici, il s’agit seulement des données.

Rien dans ce document ne modifie l’application.

## Où vivent les données

| Endroit | Clé | Contenu |
| --- | --- | --- |
| IndexedDB `repere`, version 1 | magasin `sessions`, clé `id` | Toutes les séances |
| IndexedDB `repere` | magasin `customs`, clé `id` | Exercices ajoutés à la main |
| IndexedDB `repere` | magasin `meta`, clé `settings` | `onboarded`, `theme`, `barKg`, `lastBackupAt` |
| `localStorage` | `repere-progression-batch` | Choix de charge par séance, 40 dernières clés |
| `localStorage` | `repere-plan-snapshot` | Copie du plan avant le départ, pour annuler |
| `localStorage` | `repere-coach-messages` | Fil du coach, 40 derniers tours |
| `localStorage` | `repere-coach-memo` | 8 dernières lignes mémorisées |
| `localStorage` | `repere-coach-notices` | 30 derniers avis, dont ceux pas encore envoyés |
| `localStorage` | `repere-coach-url`, `repere-coach-token` | Adresse et code. Ce n’est pas une donnée d’entraînement |
| `localStorage` | `repere-theme`, `repere-imported-on`, `repere-rest-alert-asked` | Réglages d’interface |
| `sessionStorage` | `repere-progression-ask` | La question de charge de l’ouverture en cours. Éphémère |
| Worker `POST /calendar` | rien en local | Événements iCloud le temps de la réponse : `uid`, `href`, `etag`, `title`, `start`, `end` |

Le modèle d’une séance est dans `lib/types.ts`. Les calculs sont dans `lib/calc.ts`, `lib/progression.ts`, `lib/display.ts`, `lib/history.ts`, `lib/session.ts`.

## Tableau court

| Donnée | Source | Disponible | Visuel proposé | Priorité |
| --- | --- | --- | --- | --- |
| Séances tenues / prévues / manquées | `sessions.status`, `date` | Oui | Anneau + bande lun–dim | Indispensable |
| Tonnage de la semaine | `tonnage()` | Oui, à calculer | Anneau ou barres, face à la moyenne 4 sem. | Indispensable |
| Estimation couché (et squat s’il y a 3 séances) | `epley` + `e1rmSeries` | Oui | Courbe, % sur 4 sem. | Indispensable |
| Record de charge kg × reps | `bestLoads` | Oui | Tuile, seulement si la série est vraiment plus lourde | Indispensable |
| Séries par muscle | `muscleTotals` | Oui | Barres | Indispensable |
| Palier d’après | `programPreview` | Oui | Une phrase, pas une carte | Indispensable |
| Prochaine séance | `nextSession` | Oui | Une ligne vers Aujourd’hui | Indispensable |
| Semaine légère / deux échecs | `trainingBlock`, `deloadLoad` | Oui | Capsules de cycle | Utile |
| Plan Chef sport tenu | `keepsCoachPlan` | Oui | La phrase du plan, à la place du palier | Utile |
| Série de semaines tenues | dérivé des statuts | Oui, à écrire | Chiffre à côté d’une grille 8 sem. | Utile |
| Haut du corps / jambes, poussée / tirage | `pattern`, `historyBucket` | Oui | Deux barres, pas un troisième anneau | Utile |
| Durée réelle | `startedAt`, `endedAt` | Oui si la séance a été faite dans l’app | Petite courbe, plus tard | Plus tard |
| Cardio noté dans Repère | `session.cardio` | Oui, souvent vide | Une ligne km / min | Plus tard |
| Course et nage du calendrier | Worker, titres 🏃 🏊 | Oui, en ligne, pas stocké | Charge d’endurance à part du tonnage | Plus tard |
| RPE, RIR | `SetLog`, souvent vides | Fragile | Pas de moyenne | Non |
| Poids, sommeil, VFC, pas | absents | Non | Rien tant qu’il n’y a pas une saisie | Non |

## 1. Déjà là

### Séances

Chaque séance (`lib/types.ts`) a `id`, `date` (`AAAA-MM-JJ`), `time` optionnelle (heure prévue, pas l’heure réelle), `title`, `intention`, `status` (`planned` | `active` | `done`), `source` (`coach` | `manual` | `demo`), `startedAt`, `endedAt`, `closed` (`full` | `partial`), `exercises`, parfois `cardio` et `durationMin`.

Notes : `coachNote`, `noteForMe`, `noteForCoach`, et `note` sur l’exercice. Ce sont des textes. Une phrase du coach peut les citer. Ce n’est pas une courbe.

**À montrer.** Bande de la semaine et anneau « tenues / prévues ». Une séance `planned` dont la date est passée est manquée : cercle creux, pas un rouge. `active` est « en cours », et la ligne du bas renvoie à Aujourd’hui.

**Fiabilité.** Bonne, c’est le carnet lui-même. `closed: "partial"` (`components/session-screen.tsx`, `keepLogged`) veut dire que la séance est finie avec seulement ce qui était noté : le volume est un plancher, pas le total. `source: "demo"` ne doit pas entrer dans les graphiques une fois que de vraies séances existent. `detailUnknown` sur un exercice veut dire « fait, séries inconnues » : ce n’est pas zéro.

### Séries

`SetLog` : `loadKg`, `reps`, `rpe`, `rir`, `side` (`D` | `G`), `unit` (`kg`, `kg/main`, `kg/jambe`, ou poids du corps), `restRealSec`, `precision`, `warmup`, `done`, `skipped`.

`isHardSet` (`lib/calc.ts`) : `done`, pas un échauffement, répétitions > 0. Une série `skipped` est remise `done: false` (`skipSet`). Elle ne compte pas.

Le prévu est `Planned` : `sets`, `reps`, `loadKg`, `restSec`, `rpe`.

**À montrer.** Pas le détail des séries. C’est Aujourd’hui. Accueil n’en garde que les agrégats.

**Fiabilité.** `loadKg` et `reps` sont le cœur du carnet. `rpe` et `rir` sont facultatifs : une moyenne de RPE sur la semaine mélange des séries notées et des trous, et un trou n’est pas un RPE bas. `restRealSec` n’est rempli qu’à l’import (`repos_reel_s` dans `lib/history.ts`). L’app, pendant la séance, ne l’écrit pas. Le repos prévu, `planned.restSec`, est un plan, pas une mesure. `side` sert à ne pas additionner droite et gauche comme une seule barre. `unit === "kg/main"` double le tonnage (`loadFactor`).

### Exercices et muscles

`ExerciseLog` : `name`, `pattern` (poussée ou tirage, horizontal ou vertical, squat, charnière, fente, curl, triceps, latéral, mollets, gainage), `muscles`, `stepKg`, `cues`, `unit`.

Les muscles possibles : pectoraux, épaules, triceps, biceps, dos, quadriceps, ischios, fessiers, mollets, abdos (`lib/types.ts`). Le lien motif → muscles est `PATTERN_MUSCLES` dans `lib/exercises.ts`.

**À montrer.** Barres du nombre de séries dures par muscle sur la semaine civile, via `muscleTotals(sessions, lundi, dimanche)`. Aujourd’hui, Progrès appelle la même fonction sur sept jours glissants (`components/progress-screen.tsx`). Accueil doit choisir la semaine civile, la même que la bande lun–dim, et l’écrire, sinon les deux écrans se contredisent.

**Fiabilité.** Bonne pour dire « les ischios ont peu de séries ». Mauvaise si on la lit comme des kilos : `muscleTotals` compte des séries, pas un tonnage. Un exercice compte dans chacun de ses muscles : le développé couché remplit pectoraux, épaules et triceps ensemble. Ce n’est pas une répartition qui somme à 100 %.

`historyBucket` (`lib/display.ts`) classe le titre : cardio, jambes (`lower`, `jambe`, `squat`), haut du corps (`upper`, `pouss`, `dos`, `tirage`), sinon autre. Utile pour deux barres haut / bas. Fragile si un titre ne contient aucun de ces mots : la séance tombe dans « autre » et disparaît du partage.

### Records

`countsForProgress` : `status === "done"` et pas de `cardio`. Une séance encore `active` n’est ni un record ni un point de courbe.

`bestLoads` : la charge la plus lourde par exercice, en kg × reps. À charge égale, la date la plus récente gagne. Ce départage referait un « record » à chaque séance à la même charge. Accueil ne doit s’allumer que si la charge monte, ou si la charge est égale et les répétitions montent (`heaviestSet` compare déjà les répétitions, `bestLoads` non).

`bestE1rmLabel` (`lib/session.ts`) prend la meilleure estimation d’Epley, et le détail `charge × reps` qui l’a produite. Il ignore `planned`, pas seulement le cardio. Une séance `active` avec une série déjà cochée peut donc y entrer. Pour Accueil, s’aligner sur `countsForProgress`.

**À montrer.** Tuile « 82,5 × 6 » quand c’est vraiment un record de charge. L’estimation à côté, en plus petit, si elle a bougé. Ne pas remplacer l’un par l’autre : 82,5 × 6 n’est pas 99 kg.

### Estimation, 1 à 10 répétitions

`epley` (`lib/calc.ts`) : `charge × (1 + répétitions / 30)`, arrondi au dixième. Refusée si la charge est nulle, ou si les répétitions sont hors de 1 à 10. Au-delà de 10, `heaviestSet` donne la charge tenue, sans estimation.

`e1rmSeries` : meilleure estimation du jour, puis record tenu. Une séance plus légère ne fait pas descendre la courbe.

Exemples justes : 80 × 6 → 96 kg. 82,5 × 6 → 99 kg. 100 × 5 → 116,7 kg.

**À montrer.** Courbe lissée du couché, dernier point marqué, pourcentage sur quatre semaines du record tenu. Toucher ouvre Progrès. Le squat n’a une courbe que le jour où trois séances `done` existent. Avant ça : le nombre, la mention « une séance notée », pas de pente.

**Fiabilité.** Bonne sur le couché, qui a de l’historique. Trompeuse si on trace une seule séance, ou si on mélange un max à 5 répétitions et le travail à 6 : le record tenu reste celui du max, et le pourcentage peut être plat alors que le travail monte. Il faut le dire dans la légende, pas l’effacer.

### Double progression et prochaines séances

`programPreview` (`lib/progression.ts`) ne écrit rien. Il renvoie une phrase et trois étapes.

Phrase ordinaire : on monte la charge, puis les répétitions dans la fourchette, avec un allègement après deux échecs ou quatre réussites. Après un 80 × 6 tenu, les trois étapes sont 82,5 × 6, 82,5 × 7, 82,5 × 8 (`lib/progression.test.ts`).

`startOffer` propose un seul choix pour la séance : « Commencer à 82,5 kg » ou « Garder 80 kg ». Ce choix vit sur Aujourd’hui. Accueil n’a pas le bouton. Il peut dire le palier dans la phrase.

`repere-progression-batch` garde le choix déjà fait (`pending`, `kept`, `reverted`, `ignored`, `accepted`) et le mode `applied` ou `hold`. Au-delà de 40 séances, les plus anciennes sortent. Accueil n’a pas à réafficher un choix déjà tranché.

**Fiabilité.** La phrase « quatre réussites » ne suit pas le code : `DELOAD_EVERY` vaut 3. Ne pas afficher « quatre ».

### Allègement

`trainingBlock` : `stall` si les deux dernières séances du mouvement ont manqué leur objectif de répétitions (celui de la séance d’alors, pas celui d’aujourd’hui). `cadence` si les trois dernières sont réussies et que les charges restent dans une bande. `deloadLoad` : le plus bas entre « moins deux pas » et « 90 % », calé sur le pas (2,5 kg par défaut). 80 kg → 72,5 kg.

**À montrer.** Capsules de cycle, la semaine en cours plus claire. La charge allégée en ligne, pas en hero. Pendant cette semaine, comparer le volume à une semaine légère, pas à la moyenne lourde.

**Fiabilité.** Bonne pour le mouvement qui a déclenché la règle, en général le couché. Ne pas écrire « tout le programme est en deload » si seul un exercice l’est. `keepsCoachPlan` gagne : pas d’allègement proposé par-dessus un plan tenu.

### Plan de Chef sport

`source === "coach"` et une charge écrite, plus une note d’exercice ou un mot de reprise (`reprise`, `deload`, `léger`, `récupération`) : `keepsCoachPlan` est vrai. `startOffer` renvoie `hold`. La phrase dédiée dit que le plan reste prioritaire.

`repere-plan-snapshot` garde le plan d’avant le départ. C’est un filet pour « Revenir au plan », pas un graphique.

**À montrer.** La phrase du plan à la place du palier calculé. Rien d’autre : le plan détaillé est sur Aujourd’hui.

### Durée

Deux choses différentes.

- Durée réelle : `endedAt − startedAt`, si les deux existent. `startSession` pose `startedAt`, `finishSession` ou la clôture pose `endedAt`.
- Durée estimée : `estimateMinutes`. Pour la musculation, 45 secondes par série plus les repos prévus. Pour une course, `cardio.durationMin`, ou un nombre de minutes trouvé dans la note.

**À montrer, plus tard.** La durée réelle, en tendance, seulement les séances qui ont les deux horodatages. L’estimée sert à dire « environ une heure » sur Aujourd’hui. En courbe, elle répète le plan de repos, pas la réalité.

`session.time` est l’heure prévue. L’heure réelle est `startedAt`, en UTC, à lire en Europe/Paris (`buildCoachContext` le dit déjà). Une courbe « heure de la journée » n’a de sens que sur `startedAt`.

### Cardio dans le carnet

`CardioLog` : `sport`, `label`, `durationMin`, `distanceKm`, `rpe`, `pace`, `hrAvg`, `hrMax`, `elevationM`, `kcal`. `cardioSummary` sait les afficher. `countsForProgress` les exclut du record de force et du tonnage de séries.

**À montrer, plus tard.** Une ligne « dernière course, 5 km, 32 min » si les champs sont remplis. Pas une courbe de VMA : `pace` est un texte, `hrAvg` est souvent nul.

### Calendrier iCloud

Le Worker (`worker/src/index.ts`, `worker/src/caldav.ts`) répond à `POST /calendar` avec `{ action: "list", start, end }`. Chaque événement a un titre et deux dates, rien d’autre : pas de lieu, pas de note, pas de type. Il n’est pas copié dans IndexedDB. L’app ne le demande aujourd’hui que lorsque le coach liste le calendrier (`components/coach-panel.tsx`).

Le prompt du coach (`lib/coach.ts`) reconnaît déjà des titres : « Garde » pour un service de 24 h, et les préfixes 🏋️ 🏃 🏊 pour Chef sport.

**À montrer, plus tard.** Les 🏃 et 🏊 de la semaine comme charge d’endurance, à côté du tonnage, pas dedans. Une garde peut expliquer une séance courte. Ça dépend du réseau, du code `repere-coach-token`, et des secrets du Worker. Si l’appel échoue, la ligne disparaît. Pas de bandeau d’erreur.

### Coach

Le fil (`repere-coach-messages`) est une conversation, pas une mesure. La mémoire (`repere-coach-memo`) est huit lignes de texte. S’en servir comme phrase du jour recopierait le coach sur le tableau de bord, y compris une phrase périmée.

**À montrer.** Une phrase calculée depuis les fonctions ci-dessus, qui ouvre la bulle. Pas le dernier message du fil.

### Réglages qui ne sont pas l’entraînement

`barKg` (défaut 20) sert aux disques sur Aujourd’hui. `lastBackupAt` sert au rappel de sauvegarde, déjà sur Aujourd’hui. `repere-imported-on` aussi. Aucun des trois n’est une tuile.

## 2. Calculable sans rien demander

Tout cela se déduit des séances `done`. Aucune saisie nouvelle.

| Indicateur | Comment | Visuel | Piège |
| --- | --- | --- | --- |
| Tonnage de la semaine | somme de `tonnage()` des séances `done` du lundi au dimanche | barres par jour, ou le second anneau | `kg/main` compte double. Une séance `partial` est un plancher. Ne pas comparer un jeudi à une semaine finie avec un « −40 % » |
| Moyenne 4 semaines | même somme, quatre lundis précédents | légende du second anneau | les semaines avec une seule séance tirent la moyenne vers le bas |
| Volume par muscle | `muscleTotals` sur la semaine civile | barres | ce sont des séries, et un exercice alimente plusieurs muscles |
| Fréquence | nombre de jours avec une séance `done` | le premier anneau, ou « 3 jours » | deux séances le même jour ne font pas deux jours |
| Adhérence | séances `done` / séances qui étaient prévues cette semaine | le premier anneau, 2/4 | une séance `manual` non prévue monte le fait sans monter le prévu. La dire à part |
| Semaines tenues | semaines d’affilée sans séance prévue passée encore `planned` | « 6 sem. » et la grille | la semaine en cours n’est pas un échec |
| Poussée / tirage | séries dont le `pattern` est `hpush`+`vpush` contre `hpull`+`vpull` | deux barres | les épaules sont des deux côtés. Ne pas viser 50/50 comme une loi |
| Haut / bas | `historyBucket`, ou muscles du haut contre quadriceps, ischios, fessiers, mollets | deux barres | un titre sans mot clé tombe dans « autre » |
| Taux de records | séances `done` des 28 derniers jours qui ont battu `bestLoads` d’avant | un chiffre, rare | avec le départage par date de `bestLoads`, presque chaque séance à charge égale serait un record. Exiger une charge plus lourde, ou plus de répétitions |
| Plateau | `e1rmSeries` : le record tenu n’a pas bougé depuis 4 semaines, alors qu’il y a au moins trois séances du mouvement | la courbe plate, pas une alerte | un max ancien à 5 reps fige l’estimation pendant que le travail à 6 progresse |
| Durée réelle | `endedAt − startedAt` | courbe discrète, plus tard | absent si la séance a été importée sans horodatage |
| Heure de départ | heure de Paris de `startedAt` | rien au début | `time` est le plan. Les mélanger donne une fausse habitude |
| Intensité | tonnage / séries, ou pourcentage de l’estimation | plus tard, un nombre | sans estimation (plus de 10 reps, ou charge vide), le pourcentage n’existe pas |
| Écart prévu / fait | `compareExercise` : tenu, presque, au-dessus, en dessous | la phrase, pas un camembert | déjà le langage du bilan. Le répéter en graphique fait double emploi |

La grille de huit semaines est la fréquence, dessinée. Elle n’ajoute pas de donnée.

## 3. Absent, et ce qu’il en coûterait

### Santé et la montre

Repère est une PWA. Sur iPhone, une page web n’a pas HealthKit. Il n’existe pas d’API navigateur pour le poids, le sommeil, la VFC, la fréquence au repos, les pas, l’énergie active, ni les séances course ou natation de la montre. Aucun réglage iOS ne l’ouvre à un site, même installé sur l’écran d’accueil.

Trois chemins, du moins lourd au plus lourd.

**Saisie manuelle.** Un champ poids, ou une note de fatigue de 1 à 5, écrit dans `meta` ou un nouveau magasin. Coût : petit à construire, et Florian ne le fera que si c’est rare. Un poids de temps en temps est tenable. Un score de sommeil chaque matin ne l’est pas : le tableau de bord aurait des trous, et un trou n’est pas un mauvais sommeil. Ne pas le demander.

**Raccourci iOS.** L’app Santé n’exporte pas toute seule. Un raccourci peut lire quelques mesures et les envoyer vers une adresse, ou écrire un fichier que Repère importerait. Coût : le raccourci est à maintenir, il ne part que s’il est lancé, et les autorisations Santé sont larges pour un seul chiffre. La VFC et le sommeil arrivent en retard, parfois le lendemain. Ce n’est pas une source assez stable pour un anneau quotidien.

**Application native, ou coque.** HealthKit demande un binaire signé, avec des usages déclarés (poids, sommeil, entraînements). C’est un autre projet que cette PWA : Capacitor ou une coque Swift, revue d’Apple, et un pont vers IndexedDB ou vers une copie. Le gain réel serait les séances de la montre et, plus tard, le poids. Le coût est celui d’une deuxième application. Pas une tuile à ajouter dans l’écran actuel.

Même avec HealthKit, les limites restent. La VFC du matin n’est pas une consigne d’entraînement. Les pas et l’énergie active font de jolis anneaux et disent peu sur le couché. Les séances course de la montre doublonneraient le calendrier de Chef sport si les deux existent, avec des heures qui ne coïncident pas.

### Ce que le calendrier donne déjà, sans Santé

Les titres 🏃 et 🏊, et « Garde », sont déjà une convention du coach. Lister la semaine une fois, après le premier affichage, suffit pour une ligne « course mardi, 45 min » si `end − start` est exploitable. Ce n’est pas un historique d’allure. C’est la charge d’endurance de la semaine, séparée du tonnage de fonte.

Chef sport ne dépose pas aujourd’hui, dans Repère, un volume de course structuré. Seulement un événement. On n’en tire pas une charge d’entraînement au sens TRIMP sans fréquence cardiaque, et cette fréquence n’est pas dans l’événement.

## 4. Quoi montrer, et quoi laisser

**Indispensable, dès le premier Accueil.** Séances de la semaine (anneau et bande). Tonnage face à la moyenne de quatre semaines, sans pourcentage accusateur en milieu de semaine. Courbe d’estimation du couché s’il y a trois séances, sinon le nombre seul. Record de charge seulement s’il est vraiment plus lourd, en kg × reps. Barres de séries par muscle. Phrase du palier, ou phrase du plan s’il est tenu. Ligne « Prochaine séance ».

**Utile, juste après.** Capsules de semaine légère. Grille de huit semaines et semaines tenues. Deux barres poussée / tirage, ou haut / bas, le jour où les deux existent. La phrase s’ajuste : record, allègement, plan tenu.

**Plus tard.** Durée réelle. Dernière course notée dans le carnet. Ligne d’endurance lue dans le calendrier. Heure de départ, seulement le jour où assez de séances ont un `startedAt`.

**À ne pas montrer.** Moyenne de RPE ou de RIR. Repos réel. Fil du coach. Poids, sommeil, VFC, pas, énergie. Soulevé de terre sans séances. Courbe de squat à un point. Trois anneaux calqués sur la montre. « −40 % » un jeudi. Un record à chaque séance de même charge. Les séances `demo` une fois le carnet réel en place. Le tonnage d’une séance `partial` présenté comme complet.

## 5. Pour ajouter des données de santé

Il n’y a rien à brancher dans la PWA. Le seul ajout petit, si Florian le demande un jour, est un poids saisi à la main, daté, dans IndexedDB, affiché en nombre et pas en courbe tant qu’il n’y a pas quatre points. Le sommeil et la VFC attendraient une application native, et même là ils ne méritent pas un anneau sur Accueil : ils n’expliquent pas la séance de fonte mieux que la semaine légère et la garde, qui sont déjà lisibles.
