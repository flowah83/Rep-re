# Repère — audit et décisions

Application personnelle de musculation, pour iPhone, ajoutée à l’écran d’accueil.

22 octobre 2026. Pour Florian. Ce document décide de la première version. Il ne construit pas encore l’application.

Les chiffres des maquettes (90 kg au couché, 105 kg d’estimation, mollets à 4 séries, etc.) sont inventés. Ils servent à juger l’écran, pas à décrire votre entraînement.

---

## En bref

Repère est un carnet, pas un deuxième coach. Chef sport continue de décider le plan et de poser le rappel dans le calendrier iCloud, avec l’émoji 🏋️. Repère reçoit ce plan, vous notez ce que vous avez vraiment soulevé, et l’application prépare un compte-rendu que vous envoyez vous-même.

Tout reste dans le téléphone. Il n’y a pas de compte, pas de publicité, pas de réseau social. Une copie de secours est un fichier que vous rangez dans Fichiers, donc dans iCloud si vous le souhaitez.

Trois onglets : **Aujourd’hui**, **Progrès**, **Carnet**. Pendant la séance, ces onglets disparaissent. L’écran sert à noter la série et à voir le temps de repos.

Les courbes suivent le vrai calendrier. Une séance légère ne fait pas semblant que vous avez perdu des forces. La carte du corps compte les séries dures de la semaine, muscle par muscle. Le geste de chaque exercice est un mannequin en boucle, silencieux, avec les muscles concernés en cuivre. On ne lance pas un gros décor 3D au milieu d’une série.

Le lien avec Chef sport est un petit texte convenu, collé ou déposé en fichier, en gros une fois par semaine. Le retour part par la feuille de partage de l’iPhone, seulement quand vous appuyez, après avoir lu le message.

On ne fait pas, dans cette première version : la montre, un minuteur sur l’écran verrouillé, une lecture automatique du calendrier, un programme qui choisirait les poids à la place de Chef sport, ni une bibliothèque de mille exercices en 3D.

---

## Comment lire la suite

Sept regards de métier suivent : préparation physique, design iPhone, courbes, habitudes, image du geste, fonctionnement sur iPhone, vie privée. Ce sont des points de vue, pas des citations de personnes réelles. Quand un fait concerne une application du commerce, la source est en bas de page.

Ensuite, une décision. Elle tranche. Les maquettes dans `mockups/` montrent le résultat à taille d’iPhone 15.

---

## Ce que font les applications déjà là

J’ai regardé Hevy, Strong, Fitbod, MuscleWiki, JEFIT, Gymshark Training et Apple Fitness+. Le but n’est pas de les copier. C’est de voir ce que les gens aiment vraiment une fois la nouveauté passée, et ce qui les fait partir.

### Hevy

Hevy est aujourd’hui le carnet le plus cité par les gens qui soulèvent sérieusement. Noter une série est rapide. On voit ce qu’on a fait la dernière fois. Le temps de repos, le ressenti d’effort (RPE) et les records sont là. La version gratuite va loin : le suivi des séances, quatre routines, sept exercices créés par vous, trois mois d’historique. La version payante ouvre l’historique complet, le détail des séries par muscle, et un « trainer » qui propose des poids. Hevy le décrit lui-même dans son guide des fonctions, mis à jour en 2026.

Deux limites reviennent.

Hevy enregistre. Il ne conduit pas le plan. Si la programmation est le point difficile, l’application vous laisse seul avec. C’est exactement votre cas à l’envers : vous avez déjà Chef sport pour conduire. Vous n’avez pas besoin d’un deuxième avis qui contredit le premier.

Les courbes gênent des utilisateurs depuis longtemps. L’axe du temps n’est pas un vrai calendrier : une semaine et un an peuvent occuper la même largeur, selon le nombre de points. Les gens le demandent depuis des mois, avec des copies d’écran, en février 2025 puis encore en mai 2025. C’est une règle simple du dessin de données, et elle change ce qu’on croit voir.

Hevy exporte un fichier tableur, ce qui est sain. Cet export ne revient pas dans Hevy : c’est une sortie, pas une sauvegarde ronde. Vos routines ne sont pas dans le fichier des séances.

### Strong

Strong est le vieux carnet soigné de l’iPhone. Note autour de 4,9 sur plus de 100 000 avis, d’après un suivi d’avis consulté en octobre 2026. L’écran est calme. Beaucoup de gens l’utilisent depuis des années et apprécient qu’il bouge peu : une application qu’on ouvre six jours sur sept a le droit d’être stable.

Les griefs sont ailleurs. L’abonnement se fait remarquer (environ 8 % des avis récents parlent de facturation, et des fils décrivent un double prélèvement ou un accès Pro qui disparaît en pleine séance). Les nouveautés arrivent lentement. En mai 2026, des abonnés de longue date demandaient encore des choses petites et concrètes, comme indiquer le poids réel de leur barre. Une mise à jour de la montre, commentée en mai 2025, a enlevé des réflexes que les gens avaient dans les doigts : le poids de la dernière fois mal repris, l’historique invisible sans sortir le téléphone.

Strong sait exporter un fichier, et Hevy sait le relire. Votre historique n’est donc pas prisonnier. En revanche, le calcul des disques — « 80 kg, qu’est-ce que je mets de chaque côté ? » — est souvent réservé à la version payante. Pour un carnet personnel, ce calcul est trop utile pour être une option.

### Fitbod

Fitbod est l’exemple de l’application qui décide à votre place, avec une carte du corps colorée selon la récupération. L’idée est séduisante. L’usage, sur la durée, l’est moins.

Un pratiquant formé en sciences de l’exercice raconte, en avril 2025, une année à suivre l’algorithme : progression très lente, exercices d’isolation placés avant les gros mouvements, et une « force estimée » qui s’effondre dès qu’on quitte un exercice, sans que le corps ait changé. Quand il a repris la main, ses charges sont montées. D’autres fils, en juillet 2025, janvier 2026 et février 2026, décrivent la même famille de surprises après un changement d’algorithme : séries qui sautent de 9 à 20 répétitions, matériel ignoré, un seul muscle martelé, historique peu respecté. Le correctif proposé est souvent « ajustez à la main, l’application apprendra ». Au bout de plusieurs mois, des gens annulent.

La leçon est nette. Une carte du corps est une bonne image. Un robot qui réécrit la séance à votre place, à côté d’un coach que vous avez déjà, est une mauvaise idée. Deux pilotes sur le même banc, ça finit en discussion, pas en série.

### MuscleWiki

MuscleWiki a trouvé la bonne façon de montrer un geste : on touche une zone du corps, on voit une boucle courte, on comprend le mouvement sans mode d’emploi. Les vidéos sont claires. Le site ne vous dit pas combien de séries faire, et c’est très bien pour une encyclopédie.

Ce n’est pas un carnet. Et les vidéos appartiennent à MuscleWiki. Les reprendre serait du vol, même pour un usage personnel qu’on finirait par montrer. L’application iPhone a depuis ajouté un journal et un générateur de séances. Le geste fort reste l’image, pas la programmation.

Une revue honnête du site rappelle aussi la limite de toute vidéo : elle montre le geste juste, elle ne voit pas le vôtre. Repère ne prétendra pas corriger votre dos par la caméra.

### JEFIT

JEFIT a une grande bibliothèque, annoncée à plus de 1 400 exercices avec vidéos, des graphiques, une carte des muscles, et un abonnement Elite affiché sur l’App Store autour de 12,99 dollars par mois ou 69,99 dollars par an. C’est complet, et c’est lourd.

Les plaintes récentes parlent d’un produit qui pousse sans cesse vers le payant (un commentaire public de juillet 2025 sur quinze ans de JEFIT cite les courbes de volume mises derrière l’abonnement), de défauts de synchronisation (février 2025 : séries manquantes, montre et téléphone désaccordés), et d’écrans qui interrompent la séance pour vendre. Quand l’historique d’entraînement vit sur le serveur de quelqu’un d’autre, un défaut n’est plus une gêne : c’est votre mémoire qui clignote.

### Gymshark Training

Gymshark a une qualité que les autres facturent : des vidéos propres, des plans, et longtemps tout cela gratuit. C’est agréable pour suivre une séance filmée. C’est mince pour un carnet de charges, de répétitions et de records.

Deux faits pèsent plus que le catalogue. En octobre 2025, une mise à jour a laissé des gens devant un écran noir ; en réinstallant, certains ont perdu leurs séances. Le support a reconnu des données irrécupérables après le 30 septembre. Et le 27 juillet 2026, Gymshark a écrit que l’application ne recevrait plus ni correctifs ni nouveautés, sur iPhone comme sur Android. Une application abandonnée peut rester ouverte encore un moment. Ce n’est pas un endroit où laisser dix ans de développé couché.

### Apple Fitness+

Fitness+ est le sommet du soin visuel : lumière, cadrage, coachs, musique. En janvier 2025, Apple a ajouté un cycle de trois semaines de force, avec l’idée de surcharge progressive, à refaire en augmentant les haltères. C’est un programme filmé, le même pour tout le monde.

On ne peut pas y noter le poids de chaque série. Les utilisateurs le demandent, sur le forum Apple et ailleurs, et la réponse reste : notez-le ailleurs. Fitness+ vous donne envie de bouger. Il ne garde pas la mémoire d’une barre.

### Ce que ça change pour vous

Votre situation est particulière : quelqu’un écrit déjà le plan. Vous voulez voir si vous progressez, reconnaître le geste, et renvoyer le résultat sans le retaper. Vous voulez que ça reste à vous.

Il vous manque un carnet très beau, très rapide, privé, qui parle le même langage que Chef sport.

---

## Le regard du panel

### Préparation physique

Ce qui fait progresser en musculation, sur des mois, tient en peu de choses. Vous essayez de faire un peu plus qu’avant : un peu plus lourd, une répétition de plus, ou la même chose avec moins de peine. Vous laissez le temps au corps de s’en remettre. Vous revenez.

Une synthèse de chercheurs publiée en 2021 (International Universities Strength and Conditioning Association) dit, en langage de salle :

- Autour de **10 séries dures par muscle et par semaine** est un bon départ. Beaucoup de pratiquants progressent entre 10 et 20. Au-delà, la fatigue monte souvent plus vite que le bénéfice.
- Entasser plus d’une dizaine de séries dures du même muscle dans la même séance rapporte de moins en moins.
- Le nombre de jours compte surtout parce qu’il répartit ce volume. À quantité égale, s’entraîner une fois ou trois fois dans la semaine ne change pas beaucoup le muscle. Ça change la fatigue et l’emploi du temps.
- Sur les gros mouvements, un repos de **2 à 3 minutes** permet de refaire une belle série. Sur un petit exercice, 1 minute à 1 minute 30 suffisent souvent. Les repos très courts font surtout baisser la charge, pas monter le muscle.

Le ressenti d’effort se note sur une échelle simple, le RPE, tenue par les répétitions qu’il vous restait. **8 veut dire : encore deux répétitions propres possibles. 9 : encore une. 10 : plus aucune.** On le demande sur les séries de travail, pas sur l’échauffement. Si vous ne le notez pas, la série compte quand même. Le plan de Chef sport peut afficher le RPE visé, pour que vous sachiez l’intention du jour.

L’estimation du maximum — parfois appelée e-1RM — est le poids théorique que vous soulèveriez une seule fois, calculé à partir d’une série plus légère. La formule retenue est celle d’Epley, vieille et lisible :

**poids × (1 + répétitions / 30)**

90 kg faits 5 fois donnent 105 kg. C’est une estimation, pas un record tenté. Elle devient fantaisiste au-delà de 10 répétitions. On ne l’utilise donc pas pour des séries de 12 ou de 15. Une élévation latérale à 10 kg × 15 reste un record de charge, pas un faux maximum.

Je vous recommande de montrer trois choses côte à côte, et de ne pas les fondre en une flèche verte :

- la charge ;
- les répétitions à cette charge ;
- le RPE, s’il est noté.

« Mieux » peut être plus lourd, une répétition de plus, ou la même série avec un RPE plus bas. Chef sport décide de la suite. Repère décrit l’écart avec le plan et avec la dernière fois. Il ne propose pas 82,5 kg de sa propre initiative : le mot du coach dans l’exemple (« si les quatre séries passent à 6, on montera ») reste le mot du coach.

La carte du corps compte les **séries dures**, pas les kilos additionnés. Un squat et une élévation ne pèsent pas le même sens. Le total de kilos déplacés peut figurer sur le bilan, comme un souvenir de la séance. Il ne sert pas à dire si le mois est réussi.

Le seuil affiché est modeste : en dessous de 8 séries dures dans la semaine, une phrase le dit. Entre 10 et 16, l’application se tait. Les mollets à 4 séries, dans la maquette, sont là pour montrer cette phrase. Ce n’est pas une alarme rouge. Un muscle laissé de côté n’est pas une blessure.

### Design iPhone

Le standard, c’est l’iPhone lui-même : beaucoup d’air, un chiffre grand, peu de couleurs, le doigt qui tombe en bas de l’écran. Hevy et Strong sont rapides. Ils sont rarement beaux au sens où Fitness+ est beau. On peut avoir la rapidité sans le gris utilitaire.

Je vous recommande :

- Une seule couleur d’accent, un cuivre, pour le jour en cours, la courbe, le repos, le record. Le reste est encre sur papier clair, ou encre claire sur fond de salle. L’application suit le réglage Clair / Sombre de l’iPhone. Les maquettes montrent les deux, pour qu’on puisse juger.
- Les gros chiffres en poids moyen, pas en gras criard. On lit 80 kg d’un coup d’œil, entre deux séries.
- Des zones touchables d’au moins 44 points, les actions importantes dans la moitié basse : Commencer, le repos, Envoyer.
- Des mots à l’infinitif : Commencer, Terminer, Passer, Envoyer. Quand une phrase vous parle, elle vous vouvoie. Le mot du coach, dans l’exemple, dit « on », parce que le plan est à deux.
- Pas de flammes, pas de confettis, pas de boutique, pas de fil d’actualité. Un record est une phrase.
- Le même matériau partout : le mannequin couleur pierre, le cuivre sur le muscle qui travaille, le papier chaud. Quand on passe d’Aujourd’hui au geste puis à la courbe, on reste dans la même pièce.

Le nom proposé est **Repère**. Un repère est à la fois une marque qu’on retrouve, et le mot de la répétition. Si vous en préférez un autre, on le change avant de construire. Rien dans la structure n’en dépend.

### Les courbes

Une courbe ment facilement, et en sport ça pousse à de mauvaises décisions. Deux erreurs reviennent dans les applications ci-dessus.

La première : coller les séances les unes contre les autres, quelle que soit la date. Trois séances en mars puis plus rien jusqu’en septembre deviennent une montée continue. On ne voit pas l’arrêt. Hevy est encore là-dessus.

La deuxième : recalculer une « force » à chaque séance, y compris les jours légers, et laisser la courbe plonger. Le corps n’a pas perdu 15 kg de potentiel parce que le plan du jour était en séries de 10. Fitbod en a fait bondir plus d’un.

Je vous recommande, et les maquettes le montrent déjà sur le développé couché :

- L’axe horizontal est le calendrier. Un trou de trois semaines se voit.
- Le trait suit la **meilleure estimation obtenue jusque-là**. Le 17 octobre, les séries à 80 kg ne font pas retomber le 105 kg du 10 octobre.
- Là où il n’y a pas eu de séance de couché, le trait est en pointillés. On n’invente pas la forme de la courbe pendant les vacances.
- Une phrase sous le dessin le dit en français ordinaire.
- On peut changer de mouvement (couché, squat, terre, militaire) et de fenêtre (4 semaines, 12 semaines, un an). Une seule courbe à la fois. Pas un tableau de bord de douze graphes.
- Les records du bas de l’écran sont les charges réellement tenues (90 kg × 5, pas le 105 kg calculé). L’estimation reste le grand chiffre du haut, avec le mot « estimation ».

Le 105 kg de la maquette se vérifie : 90 × (1 + 5 / 30) = 105. Si un jour la formule change, l’ancienne courbe ne doit pas sauter sans qu’on vous le dise.

### L’habitude

Le risque d’un carnet, c’est qu’il devienne une corvée, ou une morale. Les flammes de séries quotidiennes punissent le repos. Or le repos est dans le plan. L’unité juste, pour vous, c’est **la semaine décidée par Chef sport** : trois séances prévues, deux déjà faites, une ce soir. Les jours vides du ruban ne sont pas des échecs. Ce sont des jours sans séance.

Un créneau précis aide. « Jeudi 18 h 15 » tient mieux qu’un « cette semaine, poussée ». Le calendrier a déjà ce créneau. Aujourd’hui dans Repère montre la même chose, pour que vous n’ayez pas à la chercher.

Je vous recommande un geste très court :

1. Ouvrir. La séance est là, les poids sont déjà écrits.
2. Commencer. Une pression.
3. Noter. Le chiffre du plan est prérempli. Le changer se fait par un grand plus et un grand moins, pas par un petit clavier : les doigts sont parfois mouillés ou couverts de magnésie. On peut quand même taper le nombre si on préfère.
4. Repos. Le temps est énorme. Moins 30 secondes, plus 30 secondes, ou passer.
5. Terminer, même si la séance est incomplète. Une séance à moitié notée vaut mieux qu’une séance perdue.
6. Lire le bilan. Envoyer, ou garder.

Le bilan ne crie pas. Il dit ce qui colle au plan, ce qui est juste à côté, ce qui est au-dessus. Dans l’exemple, le couché s’arrête à 5 répétitions sur la dernière série : c’est « presque », pas un échec. Les élévations passent de 10 kg à 12 kg : la charge est inédite, et le nombre de répétitions baisse. L’écran nomme ce changement, et s’arrête là.

### L’image du geste

Les meilleures images du marché sont des boucles. On les regarde en se plaçant sous la barre, sans bouton lecture, sans son qui coupe la musique. MuscleWiki a compris ça. Fitness+ filme des humains, avec un budget de studio. Fitbod et Hevy colorient un corps pour dire « où ça travaille ». Presque personne ne vous fait tourner un vrai modèle 3D au moment de noter 80 kg, et c’est tant mieux : c’est lourd, ça chauffe le téléphone, et un modèle médiocre a l’air moins soigné qu’un dessin net.

Je vous recommande trois images, pas une usine :

1. **La carte**, sur Progrès. Un mannequin de face, un de dos, couleur pierre, cuivre plus ou moins chaud selon les séries dures des sept derniers jours. C’est un dessin original, à nous. Il ne cherche pas à être un atlas médical.
2. **La boucle du geste**, sur la fiche. Six à huit secondes, sans son, en boucle. Le même mannequin, la même lumière, le même sol, pour tous les exercices. Le cuivre marque les muscles du mouvement. Trois temps lisibles : descente, pause, poussée. Deux ou trois phrases, pas un cours.
3. **L’image fixe** d’abord. Elle apparaît tout de suite. La boucle vient ensuite, depuis la mémoire du téléphone.

Une douzaine de gestes de base couvre presque tout un programme ordinaire : squat, soulevé (hanche), poussée horizontale, tirage horizontal, poussée verticale, tirage vertical, fente, curl, extension des triceps, élévation latérale, mollet, gainage. L’incliné, la prise serrée, le roumain sont le même geste avec une phrase qui dit ce qui change. On anime le geste le jour où Chef sport l’écrit dans un plan. On ne constitue pas une vidéothèque de 1 400 mouvements « au cas où ».

Si un exercice arrive avant sa boucle, la fiche existe quand même : le nom, les muscles, les trois phrases, l’historique. Un cadre calme tient la place de l’image. La séance n’est jamais bloquée par un dessin manquant.

Les licences, dit simplement :

- Les vidéos de MuscleWiki, JEFIT, Gymshark et Apple ne se copient pas.
- Les fichiers bruts de Mixamo (les personnages et animations d’Adobe) peuvent servir de référence sur votre ordinateur. On n’a pas le droit de les redistribuer tels quels, et on ne les mettra ni dans l’application ni dans les fichiers du projet. Le produit fini, si un jour on s’en servait, devrait être une vidéo déjà calculée, pas le fichier source. Le chemin retenu est plus simple : **un mannequin dessiné pour Repère**, dont vous êtes le propriétaire.
- Il existe des modèles 3D de muscles « libres de droits » (licence CC0). Ceux qu’on trouve en ce moment sont très lourds, plusieurs dizaines de mégaoctets, pour une allure de planche d’anatomie. C’est trop pour un iPhone en salle, et l’allure médicale détonne à côté d’un écran calme.
- Faire tourner le modèle au doigt (le site qui dit « tournez la pièce ») peut venir plus tard, pour quelques grands mouvements, si la boucle ne suffit pas. Pas sur l’écran où vous notez les séries.
- Les petits fichiers d’animation appelés Lottie sont parfaits pour une icône ou un trait de courbe. Ils ne feront pas un beau développé couché.

Si le téléphone est réglé sur « réduire les animations », on garde l’image fixe.

### Le téléphone

Une application ajoutée à l’écran d’accueil depuis Safari s’ouvre en plein écran, avec sa propre icône, sans App Store. C’est ce que vous avez demandé. Il faut connaître ses bords, pour ne pas vous promettre une montre.

Ce qui marche bien, et ce qu’on utilisera :

- Les trois onglets sont déjà en mémoire. Passer de l’un à l’autre est immédiat, sans rechargement de page.
- Les séances sont enregistrées dans le téléphone au moment où vous validez la série. Pas à la fin, pas « si le réseau veut ».
- Une copie de l’application elle-même (les écrans, les boucles) est gardée sur l’appareil. En salle, sans réseau, ça s’ouvre.
- Le minuteur de repos part de l’heure de fin, pas d’un compte à rebours qui meurt si vous changez d’application. Vous revenez : le temps restant est juste.
- On demande à l’écran de rester allumé pendant la séance. Ça fonctionne sur les iPhone récents quand l’application est sur l’écran d’accueil (à partir d’iOS 18.4). Des retours signalent que ça a pu se casser ensuite, sur iOS 26.1. On ne vous promet donc pas la lumière à tous les coups. Le chiffre du repos, lui, reste vrai.
- Un son de fin de repos seulement si l’application est ouverte devant vous. L’iPhone silencieux reste silencieux. Le vrai signal est visuel : le grand chiffre, puis la série suivante déjà remplie.
- Le vibreur des sites web n’existe pas sur iPhone. On ne fera pas semblant.
- Ajouter à l’écran d’accueil se fait à la main : Safari, partager, « Sur l’écran d’accueil », en laissant « Ouvrir comme app web ». On écrira ces quatre gestes dans l’application, une fois, sans les répéter chaque jour.

Ce qu’un site ne peut pas faire, même très soigné :

- Une application Apple Watch.
- Un minuteur vivant sur l’écran verrouillé, comme les applications natives.
- Lire le calendrier iCloud tout seul.
- Surveiller un dossier iCloud en arrière-plan.
- Vibrer, ni continuer un minuteur sonore une fois l’application quittée.
- Garantir les données si vous supprimez l’icône.

La mémoire d’une application d’écran d’accueil n’est pas celle d’un onglet Safari oublié : Apple ne l’efface pas au bout de sept jours sans visite. Elle est à part. En revanche, supprimer l’icône peut emporter les séances. D’où la copie fichier, ci-dessous. On demandera aussi au téléphone de traiter cette mémoire comme durable. Ce n’est pas une promesse absolue. Le fichier, si.

Le premier affichage d’un onglet doit tenir dans un instant. Une boucle d’exercice reste petite, de l’ordre de quelques centaines de kilo-octets, et se charge quand vous ouvrez Aujourd’hui, pas au milieu d’une série.

### La vie privée

Vos séances disent beaucoup : vos horaires, une douleur d’épaule, les semaines où vous n’y étiez pas. Ça ne doit pas partir se promener.

Je vous recommande, et je le fige dans la décision :

- Pas de compte. Pas d’outil de mesure d’audience. Pas de publicité. Pas de vidéo YouTube incrustée, parce que ces lecteurs regardent qui les ouvre, et parce qu’ils exigent le réseau.
- Les polices et les boucles voyagent avec l’application, pas depuis un service tiers à chaque ouverture.
- Le site qui vous livre Repère — il en faut un, avec une adresse en https, pour l’installer proprement — reçoit la demande « envoyez-moi l’application ». Il ne reçoit pas le contenu des séances. Elles ne quittent pas le téléphone.
- Deux textes distincts. **Une note pour vous**, qui ne sort jamais. **Un mot pour Chef sport**, vide tant que vous n’écrivez rien. Le bilan vous montre le mot avant l’envoi. Le bouton dit « Envoyer à Chef sport ». L’autre dit « Garder seulement ici ».
- La seule sortie, c’est la feuille de partage de l’iPhone, la même que pour une photo. Vous choisissez Messages, Mail, ou le fil du coach. Rien ne part sur un serveur à nous, parce qu’il n’y en a pas.
- Une ligne discrète sur Aujourd’hui si la dernière copie de secours date de plus d’une semaine. Pas un badge rouge. La copie est un fichier que vous enregistrez dans Fichiers.

Comme il n’y a pas de service en ligne qui stocke vos séances, il n’y a pas non plus de compte à pirater. Le risque qui reste est local : perdre le téléphone sans copie, ou supprimer l’icône. La copie fichier est la réponse.

---

## Décision

Je retiens les recommandations ci-dessus. Voici ce qu’on construit en premier, et ce qu’on laisse.

### La promesse

Repère vous montre la séance du jour, vous aide à la noter sans vous ralentir, et vous rend une image honnête de la progression. Chef sport reste le seul à écrire la suite.

### Premier jet, et la suite

**Dans la première version**

- Aujourd’hui, avec la séance importée, le ruban de la semaine, le mot du coach, le bouton Commencer.
- La séance : séries, charge, répétitions, RPE facultatif sur les séries de travail, échauffement à part, temps de repos, poids déjà remplis, grands boutons plus et moins.
- L’aide-disques : vous entrez 80 kg, Repère dit les disques de chaque côté d’une barre de 20 kg (25, 20, 15, 10, 5, 2,5, 1,25). On peut changer le poids de la barre le jour où la vôtre n’est pas à 20 kg.
- La fiche du geste : image, boucle quand elle existe, muscles, trois phrases, dernières fois.
- Progrès : estimation sur un vrai calendrier, carte des muscles, meilleures charges.
- Carnet : les séances passées, groupées par semaine.
- Bilan : écart au plan, mot pour le coach, envoi ou pas.
- Importer un plan en collant le texte, ou en choisissant un fichier.
- Exporter tout le carnet à tout moment : un fichier complet, celui que Chef sport peut relire, et une table ouvrable dans un tableur.
- Kilogrammes, virgule pour les décimales. Le poids d’un haltère est le poids d’**un** haltère, pas la somme des deux. C’est écrit dans le fichier, pour que Chef sport et vous comptiez pareil.
- Clair et sombre, selon l’iPhone. Hors ligne. Icône sur l’écran d’accueil.
- Une séance vide, si aucun plan n’est encore collé. Repère sert dès le premier jour.

**Plus tard, seulement si le premier jet est devenu un réflexe**

- Les supersets, si Chef sport se met à en écrire. En attendant, les exercices s’enchaînent les uns après les autres.
- Le poids du corps.
- Tourner un modèle pour quelques grands mouvements.
- D’autres langues, les livres.

**Pas prévu, parce que l’iPhone ne le donne pas à un site, ou parce que ça abîmerait le produit**

- Apple Watch, écran verrouillé, lecture automatique du calendrier.
- Un compte, un serveur de séances, des amis, un classement.
- Un algorithme qui remplace Chef sport.
- La caméra qui jugerait votre geste.
- Une encyclopédie de mille vidéos.

### Écrans et navigation

Barre du bas, trois onglets.

| Onglet | Rôle |
| --- | --- |
| Aujourd’hui | La semaine, la séance prévue, Commencer. Le petit bouton en haut ouvre la copie de secours, l’import du plan, et le mode d’emploi de l’écran d’accueil. |
| Progrès | L’estimation, la carte, les records de charge. |
| Carnet | L’historique. |

La séance, la fiche et le bilan prennent l’écran entier. On ne change pas d’onglet avec une barre à 80 kg dans les mains.

Les maquettes, dans l’ordre :

1. `mockups/01_aujourdhui.png` — jeudi 22 octobre, poussée à 18 h 15, plan de Chef sport.
2. `mockups/02_seance.png` — couché, série 2 notée, repos de 1 min 24.
3. `mockups/03_exercice.png` — le geste, phase de poussée.
4. `mockups/04_progression.png` — 105 kg d’estimation, carte, meilleures charges.
5. `mockups/05_historique.png` — le carnet, clair.
6. `mockups/06_bilan.png` — la séance finie, le mot prêt, rien n’est encore envoyé.
7. `mockups/00_overview.png` — les six ensemble.

Les fichiers HTML qui ont servi à les dessiner sont dans `mockups/html/`.

### Identité

- Nom : Repère. Icône : un R cuivre sur fond sombre, coins larges comme une icône iPhone.
- Papier : fond `#EFEAE2`, cartes ivoire, encre `#1B1916`.
- Salle : fond `#0E0F12`, cartes `#17191E`, encre `#F4F0E8`.
- Cuivre : `#B4531E` sur le clair, `#E8925A` sur le sombre. Il signale, il ne décore pas.
- Vert sauge pour « c’est noté », jamais pour une flamme.
- Police : Inter, très proche de celle de l’iPhone. Sur l’appareil, on pourra prendre la police du système. Les chiffres sont tabulaires, pour que 80 et 82,5 ne dansent pas.
- Rayons larges, ombres très faibles, séparateurs d’un pixel. Pas de dégradé violet, pas de mascotte.

### Le geste

Mannequin original, boucles courtes, carte dessinée par nous. Le détail et les licences sont dans la partie « image du geste ». La maquette 03 montre le langage visuel : pierre, cuivre, barre, trois phases. La vraie boucle bougera. L’image fixe de la maquette ne prétend pas être déjà le film.

### Les données

Sur le téléphone d’abord. Chaque série est écrite tout de suite.

Une fois par semaine, ou quand la ligne discrète le rappelle, vous enregistrez une copie dans Fichiers. C’est votre sauvegarde. Vous pouvez aussi la poser dans un dossier iCloud Drive : c’est vous qui le faites, l’application ne va pas chercher le dossier toute seule.

Le format de la copie complète est le même esprit que le fichier du coach, avec tout l’historique. Une deuxième sortie, en tableau, permet d’ouvrir les séances dans un tableur. Les deux sont à vous.

Si vous supprimez l’icône, partez du principe que les séances peuvent disparaître avec elle. La copie fichier est faite pour ce cas.

### Chef sport

Le calendrier continue de sonner. Repère ne le lit pas : un site n’en a pas le droit, et ce n’est pas le bon combat. Le calendrier est le réveil. Le fichier est le contenu.

**À l’aller**, une fois par semaine ou quand le plan change, Chef sport vous donne un texte court. Vous le collez dans Repère, ou vous choisissez le fichier dans Fichiers. Deux gestes, pas un branchement. Si le texte est incomplet, Repère dit ce qui manque en français, pas avec un code d’erreur.

Vous pouvez aussi noter une séance à la main. L’import n’est pas une obligation pour que l’application existe.

**Au retour**, le bilan prépare le même genre de texte, plus un résumé en phrases. Vous l’envoyez par la feuille de partage. Chef sport le lit dans la conversation que vous avez déjà avec lui. Pas de serveur entre les deux.

Le poids des haltères est celui d’un seul haltère. Les séries d’échauffement sont marquées comme telles, pour ne pas entrer dans les séries dures.

L’annexe donne la forme exacte du texte. Vous pouvez la transmettre telle quelle à Chef sport : c’est le contrat, et il tient sur une page.

### Les règles qu’on ne lâche pas

- Une seule voix sur le prochain poids : Chef sport.
- Le calendrier des courbes est le vrai calendrier.
- Une séance légère ne fait pas baisser l’estimation.
- Le repos fait partie de la semaine. Pas de flamme.
- Rien ne quitte le téléphone sans un bouton, et sans que vous ayez lu le texte.
- Pas de vidéo empruntée.
- Pas de 3D sur l’écran de la série.
- Le premier jet reste petit. On l’élargit quand vous vous en servez vraiment.

---

## Les maquettes

Ce sont des images fixes, dessinées à la taille d’un iPhone 15 (393 × 852 points, enregistrées nettes pour un écran rétina). Les dates tournent autour du jeudi 22 octobre 2026, pour qu’on puisse suivre une histoire :

- le matin de la séance, vous lisez le plan ;
- à 18 h 26, la série 2 du couché est faite, le repos tourne ;
- la fiche montre la poussée ;
- les courbes s’arrêtent au record du 10 octobre, 90 kg × 5, estimation 105 kg ;
- le carnet s’arrête au mercredi des jambes, la poussée du soir n’est pas encore dedans ;
- le bilan est l’après, à 19 h 14 : dernière série du couché à 5 répétitions, élévations montées à 12 kg, 5 625 kg déplacés, 19 séries dures, 58 minutes. Rien n’a été envoyé.

La charge de 5 625 kg compte le poids écrit, donc un haltère et non les deux. L’échauffement du couché n’est pas dans les 19 séries dures.

---

## Annexe — le texte échangé avec Chef sport

Vous n’avez pas à l’écrire à la main. Chef sport le produit. Vous le collez. La forme est celle-ci.

Plan de la semaine :

```json
{
  "semaine": "2026-10-19",
  "seances": [
    {
      "date": "2026-10-22",
      "heure": "18:15",
      "titre": "Poussée",
      "intention": "hypertrophie",
      "note": "On garde le couché à 80 kg. Si les quatre séries passent à 6, on montera à 82,5 kg.",
      "exercices": [
        {
          "nom": "Développé couché barre",
          "series": 4,
          "repetitions": 6,
          "charge_kg": 80,
          "repos_secondes": 180,
          "rpe_vise": 8,
          "echauffement": [{ "charge_kg": 60, "repetitions": 8 }]
        },
        {
          "nom": "Élévations latérales",
          "series": 3,
          "repetitions": 15,
          "charge_kg": 10,
          "repos_secondes": 75,
          "rpe_vise": 8,
          "note": "Le poids est celui d’un seul haltère."
        }
      ]
    }
  ]
}
```

Compte-rendu, après la séance. Le mot pour le coach n’existe que si vous l’avez écrit.

```json
{
  "date": "2026-10-22",
  "titre": "Poussée",
  "terminee": true,
  "duree_min": 58,
  "series_dures": 19,
  "kilos_deplaces": 5625,
  "note_pour_le_coach": "Latérales montées à 12 kg. Rien à signaler sur les épaules.",
  "exercices": [
    {
      "nom": "Développé couché barre",
      "prevu": { "series": 4, "repetitions": 6, "charge_kg": 80 },
      "fait": [
        { "charge_kg": 80, "repetitions": 6, "rpe": 8, "echauffement": false },
        { "charge_kg": 80, "repetitions": 6, "rpe": 8 },
        { "charge_kg": 80, "repetitions": 6, "rpe": 8 },
        { "charge_kg": 80, "repetitions": 5, "rpe": 9 }
      ]
    }
  ]
}
```

À côté du fichier, Repère montre toujours le résumé en phrases, celui de la maquette 06. C’est ce résumé que vous lisez. Le fichier est là pour que Chef sport puisse le relire sans ambiguïté.

---

## Sources

Consultées le 22 octobre 2026.

Applications

- Hevy, guide des fonctions (2026) : [help.hevyapp.com](https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide) — gratuit limité à 4 routines, 7 exercices perso, 3 mois d’historique ; le détail des séries par muscle et le trainer sont dans l’offre Pro.
- Export Hevy : [centre d’aide](https://help.hevyapp.com/hc/en-us/articles/43708290987415-Exporting-Your-Data-from-Hevy) et [lecture du fichier](https://griptapp.com/help/export-workouts-from-hevy). L’export des séances ne se réimporte pas dans Hevy.
- Hevy qui enregistre sans programmer : [RepReturn, mars 2026](https://repreturn.com/hevy-app-review/) ; [autre lecture 2026](https://aivancepro.fr/en/blog/hevy-review-workout-app-worth-it-2026/).
- Courbes Hevy, axe du temps : [février 2025](https://www.reddit.com/r/Hevy/comments/1if8621/request_normalize_x_axis/), [mai 2025](https://www.reddit.com/r/Hevy/comments/1kkmfnt/inconsitencies_and_distortion_in_graphs/).
- Strong, note et abonnements, suivi d’avis : [Appslupa](https://appslupa.com/app/strong-workout-tracker-gym-log/id464254577) (environ 4,9 et plus de 100 000 avis ; des avis récents parlent de facturation). Fils : [double abonnement, mars 2025](https://www.reddit.com/r/strongapp/comments/1j5yth3/double_subscription/), [montre, mai 2025](https://www.reddit.com/r/strongapp/comments/1kspk8x/review_of_the_new_strong_app_update_after_months/), [poids de barre et rythme des mises à jour, mai 2026](https://www.reddit.com/r/strongapp/comments/1t57be2/is_strong_worth_premium/).
- Import Strong vers Hevy : [hevyapp.com/import/strong](https://www.hevyapp.com/import/strong/).
- Fitbod : [un an d’usage, avril 2025](https://www.reddit.com/r/fitbod/comments/1joklkd/review_of_fitbod_after_one_year_of_use/), [juillet 2025](https://www.reddit.com/r/fitbod/comments/1ltvded/i_think_im_done/), [janvier 2026](https://www.reddit.com/r/fitbod/comments/1qje0v9/i_hope_fitbod_will_explain_recent_app_behavior/), [février 2026](https://www.reddit.com/r/fitbod/comments/1rg87e0/every_time_i_open_this_app_i_have_to_spend_a/).
- MuscleWiki : [présentation](https://www.insidehook.com/fitness/musclewiki-online-fintess-tool), [limites du geste filmé](https://eathealthy365.com/a-review-of-muscle-wiki-and-its-accuracy-for-workouts/), [fiche App Store](https://apps.apple.com/in/app/musclewiki-workout-fitness/id1096827640).
- JEFIT : [fiche App Store](https://apps.apple.com/us/app/jefit-workout-plan-gym-tracker/id449810000) (bibliothèque, prix Elite), [commentaire public, juillet 2025](https://news.ycombinator.com/item?id=44604147), [synchronisation, février 2025](https://www.reddit.com/r/jefit/comments/1ixyya2/i_feel_like_im_paying_my_annual_subscription_fees/), [incitations à payer](https://www.reddit.com/r/jefit/comments/1onkmqt/setting_to_disable_upsells/).
- Gymshark : [page support, 27 juillet 2026](https://support.gymshark.com/en/articles/11185911-the-gymshark-training-app) (plus de mises à jour), [écran noir et historiques perdus, octobre 2025](https://www.reddit.com/r/Gymshark/comments/1nvgerl/is_the_gymshark_training_app_not_working_for/), avis App Store cités via [AppPricer](https://apppricer.com/app/1139151320), [Tom’s Guide](https://www.tomsguide.com/wellness/fitness/gymshark-training-app-review-effective-workouts-for-free).
- Apple Fitness+ : [annonce, janvier 2025](https://www.apple.com/newsroom/2025/01/apple-fitness-plus-unveils-an-exciting-lineup-of-new-ways-to-stay-active-in-2025/), [lecture du cycle de force](https://www.menshealth.com/fitness/a63316338/apple-fitness-plus-progressive-strength-program-announcements/), [pas de suivi des charges](https://www.reddit.com/r/AppleFitnessPlus/comments/1gzka25/tracking_weights_with_af/), [forum Apple](https://discussions.apple.com/thread/254142824).

Entraînement

- Schoenfeld, Fisher, Grgic, Haun, Helms, Phillips, Steele, Winett (2021). *Resistance Training Recommendations to Maximize Muscle Hypertrophy in an Athletic Population: Position Stand of the IUSCA.* [Texte](https://journal.iusca.org/index.php/Journal/article/download/81/140/5323).
- Schoenfeld, Grgic, Krieger (2019). Fréquence d’entraînement et hypertrophie, à volume égal. *Journal of Sports Sciences.* [Résumé](https://www.tandfonline.com/doi/full/10.1080/02640414.2018.1555906).
- Helms, Cronin, Storey, Zourdos (2016). RPE fondé sur les répétitions en réserve. *Strength and Conditioning Journal.*
- Formule d’Epley (1985), rappelée dans les calculateurs publics : poids × (1 + répétitions / 30).

Image et licences

- Adobe, Mixamo, usage sans redevance dans un projet, pas de redistribution des fichiers bruts : [FAQ Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html), [précisions de licence](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400).
- Exemple de modèle anatomique CC0, trop lourd pour cet usage : [Grab3D, Human Muscles](https://grab3d.com/models/anatomy/human-muscles/) (ordre de 300 000 à 600 000 triangles, fichiers de plusieurs dizaines de mégaoctets).

iPhone et application d’écran d’accueil

- Guide des applications d’écran d’accueil : [progressivewebapps.com](https://progressivewebapps.com/platforms/ios-safari/) — pas d’installation automatique, pas de synchro en arrière-plan, stockage séparé de Safari.
- Apple, WebKit : les applications d’écran d’accueil sont exemptées de l’effacement au bout de sept jours. [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/).
- Quotas et demande de mémoire durable : [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
- Écran qui reste allumé à partir d’iOS 18.4 : [WebKit, Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/). Signalement d’une régression sur iOS 26.1 dans le [suivi WebKit 254545](https://bugs.webkit.org/show_bug.cgi?id=254545) (commentaire de décembre 2025).
- Isolement du stockage : [OpenPWA](https://openpwa.net/reference/storage/home-screen-storage-isolation/).
