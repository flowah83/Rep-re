# Activer le coach

Le coach est le bouton rond, en bas à droite. Il parle avec vous dans l’application. Vos séances restent sur le téléphone. Le coach a besoin d’un petit service sur Internet pour deux choses : répondre, et lire ou écrire le calendrier iCloud « Calendrier Flo ».

Les suggestions de charge, avant une séance, marchent sans rien installer. Vous pouvez les accepter ou les ignorer.

Faites les étapes dans l’ordre. Notez les codes dans un endroit à vous. Ne les envoyez à personne.

## 1. Créer un compte Cloudflare

1. Allez sur [cloudflare.com](https://www.cloudflare.com).
2. Créez un compte gratuit avec votre adresse e-mail.
3. Une fois dedans, ouvrez la page d’accueil du tableau de bord.
4. À droite, copiez **Account ID**. Gardez-le pour l’étape 5. C’est l’identifiant du compte, pas un mot de passe.

## 2. Créer une clé OpenAI

1. Allez sur [platform.openai.com](https://platform.openai.com).
2. Créez un compte, ou connectez-vous.
3. Ouvrez **API keys**, puis **Create new secret key**.
4. Copiez la clé tout de suite. Elle commence par `sk-`. Vous ne la reverrez plus.
5. Le coach utilise un modèle peu coûteux, `gpt-4o-mini`. Vous pouvez le changer plus tard dans Cloudflare, variable `OPENAI_MODEL`.

## 3. Créer un mot de passe pour le calendrier

Ce n’est pas le mot de passe de votre identifiant Apple.

1. Sur l’iPhone : Réglages → votre nom → Connexion et sécurité → Mots de passe pour les apps.
2. Créez un mot de passe. Le nom peut être « Repère ».
3. Copiez les quatre groupes de lettres. C’est `ICLOUD_APP_PASSWORD`.
4. Le calendrier doit s’appeler exactement **Calendrier Flo**, sur le compte **florian.lemen@icloud.com**.
5. Les heures sont celles de Paris. Une garde de 24 h a le mot **Garde** dans le titre. Le coach en tient compte.
6. Les événements de Chef sport commencent par 🏋️, 🏃 ou 🏊. S’il en change un, la modification est ajoutée au texte du bouton « Envoyer à Chef sport ».

## 4. Inventer le code du téléphone

Inventez une longue suite de lettres et de chiffres, par exemple 30 caractères, au hasard. C’est `APP_TOKEN`. Seul votre téléphone l’enverra. Notez-le : vous le collerez dans Repère à la fin.

## 5. Autoriser GitHub à publier le service

1. Ouvrez le dépôt GitHub `flowah83/Rep-re`.
2. Settings → Secrets and variables → Actions → New repository secret.
3. Ajoutez `CLOUDFLARE_API_TOKEN`.
   Pour le créer : dans Cloudflare, **My Profile → API Tokens → Create Token**. Choisissez le modèle **Edit Cloudflare Workers**. Créez le jeton et copiez-le dans GitHub.
4. Ajoutez un second secret, `CLOUDFLARE_ACCOUNT_ID`, avec l’identifiant copié à l’étape 1.
5. Si l’un des deux secrets manque, le site Repère se publie quand même. Seul le coach est ignoré.
6. Le fichier `.github/workflows/deploy-worker.yml` publie le service à chaque envoi sur `main`, dès que les deux secrets existent.
7. Dans l’onglet Actions, le travail « Deploy coach worker » doit être vert. L’adresse ressemble à `https://repere-coach.votre-sous-domaine.workers.dev`. Vous la voyez aussi dans Cloudflare → Workers et Pages → `repere-coach`.

## 6. Donner les trois codes au service

Dans Cloudflare → Workers et Pages → `repere-coach` → Settings → Variables and Secrets, ajoutez trois secrets (pas des variables visibles) :

1. `OPENAI_API_KEY` : la clé de l’étape 2.
2. `ICLOUD_APP_PASSWORD` : le mot de passe d’application de l’étape 3.
3. `APP_TOKEN` : le code inventé à l’étape 4.

Ces trois codes restent chez Cloudflare. Ils ne sont pas dans le téléphone, ni dans GitHub, ni dans le code.

## 7. L’activer dans Repère

1. Ouvrez Repère.
2. Réglages.
3. Dans Coach, collez l’adresse du service (étape 5), sans barre à la fin.
4. Collez le code secret (étape 4).
5. Touchez **Enregistrer le coach**.

Ensuite, le bouton rond ouvre la conversation. Rien n’est modifié dans l’application ni dans le calendrier tant que vous n’avez pas touché **Appliquer**. **Annuler** ne change rien.

S’il manque l’adresse ou le code, le coach affiche qu’il n’est pas encore activé. L’application ne plante pas.
