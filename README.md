# Repère

Carnet de musculation pour iPhone, ajouté à l’écran d’accueil. Les séances restent sur le téléphone. Chef sport écrit le plan. Avant une séance, Repère peut suggérer une charge à partir des séries récentes : on l’accepte ou on l’ignore. Le coach, s’il est activé, est décrit dans `docs/coach-setup.md`.

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

Dans Réglages, « Importer » accepte aussi un historique déjà fait. Le fichier réel du classeur a une liste `seances` : si `series` est un tableau de `{charge_kg, repetitions, rpe, rir, ...}`, ce sont des séances terminées. Si `series` est un nombre, c’est un plan à venir. `null` reste inconnu, il ne devient pas 0.

```json
{
  "historique": [
    {
      "date": "2026-09-14",
      "titre": "Poussée",
      "note": "Séance tenue.",
      "exercices": [
        {
          "nom": "Développé couché barre",
          "series": [{ "charge_kg": 80, "repetitions": 6, "rpe": 8 }]
        }
      ]
    }
  ]
}
```

Un objet `cardio` (course, vélo, natation) s’affiche dans le carnet avec la durée et la distance, et ne compte pas dans les courbes, les records ni la carte des muscles. `unite: "kg/main"` veut dire que `charge_kg` est le poids d’une seule main : l’écran l’écrit ainsi, et les kilos déplacés comptent les deux. Une série vide avec `detail_series_inconnu: true` garde l’exercice et affiche « détail inconnu », sans inventer de séries.

Le même JSON, en base64url, s’ouvre avec `#historique=`. Pour un long historique, on le compresse en gzip (UTF-8) puis on préfixe le base64url :

`https://flowah83.github.io/Rep-re/#historique=gz.<données>`

`#plan=` accepte le même préfixe `gz.` quand le plan est long. Un lien `#plan=` peut contenir à la fois `seances` (séries en nombre) et `historique`. Réglages demande confirmation avant d’écrire : le nombre de séances, la période, les exercices reconnus et ceux créés. Importer deux fois le même fichier n’ajoute pas de doublon (même date, même titre, mêmes exercices).

Un petit historique :

`https://flowah83.github.io/Rep-re/#historique=eyJoaXN0b3JpcXVlIjpbeyJkYXRlIjoiMjAyNi0wOS0xNCIsInRpdHJlIjoiUG91c3PDqWUiLCJleGVyY2ljZXMiOlt7Im5vbSI6IkRDIiwic2VyaWVzIjpbeyJjaGFyZ2Vfa2ciOjgwLCJyZXBldGl0aW9ucyI6NiwicnBlIjo4fV19XX1dfQ`

Le même JSON, encodé en base64url (UTF-8, sans `+`, `/` ni `=`), s’ouvre tout seul dans le lien :

`https://votre-site/#plan=ewogICJzZW1haW5lIjogIjIwMjYtMTAtMTkiLAogICJzZWFuY2VzIjogWwogICAgewogICAgICAiZGF0ZSI6ICIyMDI2LTEwLTIyIiwKICAgICAgImhldXJlIjogIjE4OjE1IiwKICAgICAgInRpdHJlIjogIlBvdXNzw6llIiwKICAgICAgImludGVudGlvbiI6ICJoeXBlcnRyb3BoaWUiLAogICAgICAibm90ZSI6ICJPbiBnYXJkZSBsZSBjb3VjaMOpIMOgIDgwIGtnLiBTaSBsZXMgcXVhdHJlIHPDqXJpZXMgcGFzc2VudCDDoCA2LCBvbiBtb250ZXJhIMOgIDgyLDUga2cuIiwKICAgICAgImV4ZXJjaWNlcyI6IFsKICAgICAgICB7CiAgICAgICAgICAibm9tIjogIkTDqXZlbG9wcMOpIGNvdWNow6kgYmFycmUiLAogICAgICAgICAgInNlcmllcyI6IDQsCiAgICAgICAgICAicmVwZXRpdGlvbnMiOiA2LAogICAgICAgICAgImNoYXJnZV9rZyI6IDgwLAogICAgICAgICAgInJlcG9zX3NlY29uZGVzIjogMTgwLAogICAgICAgICAgInJwZV92aXNlIjogOCwKICAgICAgICAgICJlY2hhdWZmZW1lbnQiOiBbeyAiY2hhcmdlX2tnIjogNjAsICJyZXBldGl0aW9ucyI6IDggfV0KICAgICAgICB9LAogICAgICAgIHsKICAgICAgICAgICJub20iOiAiw4lsw6l2YXRpb25zIGxhdMOpcmFsZXMiLAogICAgICAgICAgInNlcmllcyI6IDMsCiAgICAgICAgICAicmVwZXRpdGlvbnMiOiAxNSwKICAgICAgICAgICJjaGFyZ2Vfa2ciOiAxMCwKICAgICAgICAgICJyZXBvc19zZWNvbmRlcyI6IDc1LAogICAgICAgICAgInJwZV92aXNlIjogOAogICAgICAgIH0KICAgICAgXQogICAgfQogIF0KfQ`

Ce lien contient la poussée du 22 octobre 2026 : développé couché 4×6 à 80 kg, avec un échauffement, puis élévations latérales. Une séance déjà commencée ou terminée, le même jour et avec le même titre, n’est pas remplacée.

La première ouverture est vide. L’exemple fictif se charge dans les réglages, et s’efface sans toucher aux vraies séances.

Les maquettes validées restent dans `mockups/`. L’audit est dans `docs/audit.md`.

## Coach

Le bouton Coach est sur chaque écran. Sans adresse ni code secret dans Réglages, il explique seulement qu’il n’est pas activé. Les suggestions de charge ne passent pas par ce service : elles relisent les séries déjà notées sur le téléphone. L’installation du service est dans `docs/coach-setup.md`.
