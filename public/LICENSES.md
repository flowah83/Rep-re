# Licences

Ce fichier est servi avec Repère. Il décrit le corps 3D et les bibliothèques qui l’affichent.

## Corps

Fichier `models/body.glb`.

Modèle d’origine : « Human base mesh with editable 53-bone rig », publié par Innerscene.
Page : https://www.innerscene.com/tools/library/3d-parts/human-base-mesh-with-editable-53-bone-rig-8e7c8ab1

La page indique, le 23 octobre 2026 : **Public domain (CC0)**. On peut l’utiliser, le modifier et le redistribuer, y compris à des fins commerciales, sans obligation de crédit.

Innerscene précise que le corps, le squelette et la peau viennent de MakeHuman / MPFB, eux aussi en CC0, puis ont été réexportés.
Licence des assets MakeHuman : https://static.makehumancommunity.org/about/license.html
Les assets graphiques sont en CC0. Le code source de MakeHuman (AGPL) et de MPFB (GPL) ne s’applique pas à ces assets.

Le fichier livré ici est une version allégée : soudure, simplification à 21 344 triangles, compression meshopt, sans texture. Le squelette (53 os) et les poids de peau sont conservés. Un short couvre le bassin.

## Code

- three.js r170 : licence MIT
- décodeur meshoptimizer 0.22 : licence MIT
- La géométrie de la barre, des disques, des haltères, du banc, du rack, de la barre de traction, des poulies et du short est originale.

## Police

Inter, déjà utilisée par Repère. Licence SIL Open Font License.

## Ce qui n’est pas utilisé

- Mixamo : l’usage personnel des animations est permis, mais pas la redistribution du fichier. Une page GitHub Pages serait un téléchargement direct. Écarté.
- Z-Anatomy : CC BY-SA 4.0, atlas lourd, pas prévu pour une boucle sur téléphone.
- MuscleWiki : les vidéos ne peuvent pas être retéléchargées ni réhébergées.
- Quaternius : CC0, mais personnages stylisés, sans ces exercices.
