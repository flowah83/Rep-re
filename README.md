# Repère

Carnet de musculation pour iPhone, ajouté à l’écran d’accueil. Les séances restent sur le téléphone. Chef sport écrit le plan. Repère ne propose pas les charges.

## Lancer

```bash
npm install
npm run dev
```

Le site de développement écoute sur le port 8742.

## Construire et publier

```bash
npm test
npm run typecheck
npm run build
```

Le dossier à publier est `out/`. N’importe quel hébergement de fichiers statiques convient : on y copie le contenu de `out/`, pas le dépôt. Le service d’installation (« Sur l’écran d’accueil ») et le mode hors ligne demandent une adresse en HTTPS. En local, `npx serve out` suffit pour essayer.

Pour un sous-chemin, par exemple GitHub Pages à `https://flowah83.github.io/Rep-re/` :

```bash
BASE_PATH=/Rep-re/ npm run build
```

`BASE_PATH` vaut `/` par défaut. Le manifeste, le service worker, les icônes et les fichiers (polices comprises) suivent ce préfixe. Le fichier `.nojekyll` est déjà dans `out/` pour que GitHub Pages serve le dossier `_next`.

## Importer un plan

Dans Réglages, « Importer un plan ». Le texte est un objet JSON. Les accents sont gardés. On peut entourer le texte de balises markdown, elles sont ignorées.

Une semaine :

```json
{
  "semaine": "2026-10-19",
  "seances": [
    {
      "date": "2026-10-22",
      "heure": "18:15",
      "titre": "Poussée",
      "intention": "hypertrophie",
      "note": "On garde le couché à 80 kg.",
      "exercices": [
        {
          "nom": "Développé couché barre",
          "series": 4,
          "repetitions": 6,
          "charge_kg": 80,
          "repos_secondes": 180,
          "rpe_vise": 8,
          "echauffement": [{ "charge_kg": 60, "repetitions": 8 }]
        }
      ]
    }
  ]
}
```

Une seule séance peut être envoyée sans la clé `seances`, du moment qu’elle a `date` et `exercices`.

Le même JSON, encodé en base64url (UTF-8, sans `+`, `/` ni `=`), s’ouvre tout seul dans le lien :

`https://votre-site/#plan=ewogICJzZW1haW5lIjogIjIwMjYtMTAtMTkiLAogICJzZWFuY2VzIjogWwogICAgewogICAgICAiZGF0ZSI6ICIyMDI2LTEwLTIyIiwKICAgICAgImhldXJlIjogIjE4OjE1IiwKICAgICAgInRpdHJlIjogIlBvdXNzw6llIiwKICAgICAgImludGVudGlvbiI6ICJoeXBlcnRyb3BoaWUiLAogICAgICAibm90ZSI6ICJPbiBnYXJkZSBsZSBjb3VjaMOpIMOgIDgwIGtnLiBTaSBsZXMgcXVhdHJlIHPDqXJpZXMgcGFzc2VudCDDoCA2LCBvbiBtb250ZXJhIMOgIDgyLDUga2cuIiwKICAgICAgImV4ZXJjaWNlcyI6IFsKICAgICAgICB7CiAgICAgICAgICAibm9tIjogIkTDqXZlbG9wcMOpIGNvdWNow6kgYmFycmUiLAogICAgICAgICAgInNlcmllcyI6IDQsCiAgICAgICAgICAicmVwZXRpdGlvbnMiOiA2LAogICAgICAgICAgImNoYXJnZV9rZyI6IDgwLAogICAgICAgICAgInJlcG9zX3NlY29uZGVzIjogMTgwLAogICAgICAgICAgInJwZV92aXNlIjogOCwKICAgICAgICAgICJlY2hhdWZmZW1lbnQiOiBbeyAiY2hhcmdlX2tnIjogNjAsICJyZXBldGl0aW9ucyI6IDggfV0KICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJub20iOiAiw4lsw6l2YXRpb25zIGxhdMOpcmFsZXMiLAogICAgICAgICAgInNlcmllcyI6IDMsCiAgICAgICAgICAicmVwZXRpdGlvbnMiOiAxNSwKICAgICAgICAgICJjaGFyZ2Vfa2ciOiAxMCwKICAgICAgICAgICJyZXBvc19zZWNvbmRlcyI6IDc1LAogICAgICAgICAgInJwZV92aXNlIjogOAogICAgICAgIH0KICAgICAgXQogICAgfQogIF0KfQ`

Ce lien contient la poussée du 22 octobre 2026 : développé couché 4×6 à 80 kg, avec un échauffement, puis élévations latérales. Une séance déjà commencée ou terminée, le même jour et avec le même titre, n’est pas remplacée.

La première ouverture est vide. L’exemple fictif se charge dans les réglages, et s’efface sans toucher aux vraies séances.

Les maquettes validées restent dans `mockups/`. L’audit est dans `docs/audit.md`.
