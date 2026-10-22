import type { CustomExercise, Muscle, Pattern } from "./types";
import { stripAccents } from "./utils";

export type CatalogExercise = {
  id: string;
  name: string;
  pattern: Pattern;
  aliases: string[];
  cues: string[];
  equipment: "barre" | "halteres" | "poulie" | "machine" | "corps";
  stepKg: number;
};

export const PATTERN_LABEL: Record<Pattern, string> = {
  hpush: "Poussée horizontale",
  hpull: "Tirage horizontal",
  vpush: "Poussée verticale",
  vpull: "Tirage vertical",
  squat: "Squat",
  hinge: "Charnière de hanche",
  lunge: "Fente",
  curl: "Curl",
  tricep: "Extension des triceps",
  lateral: "Élévation latérale",
  calf: "Mollets",
  core: "Gainage",
};

export const MUSCLE_LABEL: Record<Muscle, string> = {
  pectoraux: "Pectoraux",
  epaules: "Épaules",
  triceps: "Triceps",
  biceps: "Biceps",
  dos: "Dos",
  quadriceps: "Quadriceps",
  ischios: "Ischios",
  fessiers: "Fessiers",
  mollets: "Mollets",
  abdos: "Abdos",
};

export const PATTERN_MUSCLES: Record<Pattern, Muscle[]> = {
  hpush: ["pectoraux", "epaules", "triceps"],
  hpull: ["dos", "biceps", "epaules"],
  vpush: ["epaules", "triceps"],
  vpull: ["dos", "biceps"],
  squat: ["quadriceps", "fessiers"],
  hinge: ["ischios", "fessiers", "dos"],
  lunge: ["quadriceps", "fessiers"],
  curl: ["biceps"],
  tricep: ["triceps"],
  lateral: ["epaules"],
  calf: ["mollets"],
  core: ["abdos"],
};

const C = (
  id: string,
  name: string,
  pattern: Pattern,
  equipment: CatalogExercise["equipment"],
  stepKg: number,
  aliases: string[],
  cues: string[],
): CatalogExercise => ({ id, name, pattern, equipment, stepKg, aliases, cues });

export const CATALOG: CatalogExercise[] = [
  C("bench", "Développé couché barre", "hpush", "barre", 2.5, ["developpe couche", "dc", "bench"], [
    "Omoplates serrées, pieds ancrés au sol.",
    "La barre descend vers le bas des pectoraux.",
    "Les poignets restent droits, les coudes pas trop ouverts.",
  ]),
  C("incline-db", "Développé incliné haltères", "hpush", "halteres", 1, ["developpe incline", "incline"], [
    "Le banc est légèrement incliné, pas assis.",
    "Les haltères descendent au niveau des pectoraux.",
    "Le poids noté est celui d’un seul haltère.",
  ]),
  C("fly", "Écarté poulie", "hpush", "poulie", 2.5, ["ecarte", "ecarte poulie", "cable fly"], [
    "Les coudes restent légèrement fléchis.",
    "Les mains se rejoignent devant les pectoraux.",
    "Le buste ne se referme pas sur la charge.",
  ]),
  C("ohp", "Développé militaire barre", "vpush", "barre", 2.5, ["militaire", "developpe militaire", "ohp"], [
    "Les côtes restent basses, les fessiers serrés.",
    "La barre passe près du visage.",
    "Les bras finissent au-dessus des épaules, pas devant.",
  ]),
  C("lateral", "Élévations latérales", "lateral", "halteres", 1, ["elevations laterales", "lateral"], [
    "Les coudes mènent, un peu fléchis.",
    "On s’arrête à hauteur d’épaules.",
    "Le poids noté est celui d’un seul haltère.",
  ]),
  C("pushdown", "Extension triceps poulie", "tricep", "poulie", 2.5, ["triceps poulie", "pushdown", "extension triceps"], [
    "Les coudes restent près du corps.",
    "Seuls les avant-bras bougent.",
    "On tend sans verrouiller sèchement.",
  ]),
  C("dips", "Dips", "tricep", "corps", 2.5, ["dips", "répulsions"], [
    "Les épaules restent basses.",
    "Le buste penche peu si le but est les triceps.",
    "On descend jusqu’où l’épaule reste confortable.",
  ]),
  C("squat", "Squat barre", "squat", "barre", 2.5, ["squat", "squat barre"], [
    "Les pieds bien à plat, les genoux suivent les orteils.",
    "On descend au moins jusqu’à la cuisse parallèle.",
    "La barre reste sur les trapèzes, le regard devant.",
  ]),
  C("legpress", "Presse à cuisses", "squat", "machine", 5, ["presse", "presse a cuisses"], [
    "Le bas du dos reste collé au dossier.",
    "On ne verrouille pas les genoux en haut.",
    "Les pieds à mi-plateau pour les quadriceps.",
  ]),
  C("deadlift", "Soulevé de terre", "hinge", "barre", 2.5, ["souleve de terre", "sdt", "deadlift"], [
    "La barre part au-dessus du milieu du pied.",
    "On pousse le sol, le dos reste neutre.",
    "La barre longe les jambes jusqu’en haut.",
  ]),
  C("rdl", "Soulevé de terre roumain", "hinge", "barre", 2.5, ["roumain", "sdtr", "rdl"], [
    "Les genoux sont légèrement fléchis, et le restent.",
    "Les hanches reculent, la barre glisse le long des cuisses.",
    "On sent les ischios, le dos ne s’arrondit pas.",
  ]),
  C("lunge", "Fentes haltères", "lunge", "halteres", 1, ["fentes", "fente"], [
    "Le pas est assez long pour que le genou avant reste stable.",
    "Le genou arrière descend vers le sol.",
    "Le poids noté est celui d’un seul haltère.",
  ]),
  C("row", "Rowing barre", "hpull", "barre", 2.5, ["rowing", "rowing barre", "row"], [
    "Le buste est penché, le dos neutre.",
    "On tire la barre vers le bas du ventre.",
    "Les omoplates se serrent en haut.",
  ]),
  C("pulldown", "Tirage vertical", "vpull", "poulie", 5, ["tirage", "tirage vertical", "lat pulldown"], [
    "On tire vers le haut de la poitrine.",
    "Les coudes descendent vers les côtes.",
    "On ne se penche pas en arrière pour tricher.",
  ]),
  C("pullup", "Tractions", "vpull", "corps", 2.5, ["tractions", "traction"], [
    "On part bras tendus, épaules loin des oreilles.",
    "On tire le sternum vers la barre.",
    "La charge ajoutée se note à part du poids du corps.",
  ]),
  C("facepull", "Face pull", "hpull", "poulie", 2.5, ["face pull", "oiseau poulie"], [
    "La poulie est à hauteur de visage.",
    "On écarte les mains en fin de tirage.",
    "Les épaules restent basses.",
  ]),
  C("curl", "Curl haltères", "curl", "halteres", 1, ["curl", "curl halteres"], [
    "Les coudes restent sous les épaules.",
    "On monte sans balancer le buste.",
    "Le poids noté est celui d’un seul haltère.",
  ]),
  C("calf", "Mollets debout", "calf", "machine", 5, ["mollets", "mollet"], [
    "La descente est lente, le talon passe sous le niveau des orteils.",
    "On marque une seconde en haut.",
    "Les genoux restent tendus sans se verrouiller.",
  ]),
  C("plank", "Gainage", "core", "corps", 0, ["gainage", "planche"], [
    "Le corps forme une ligne, des épaules aux talons.",
    "On pousse le sol avec les avant-bras.",
    "On note les secondes dans les répétitions.",
  ]),
  C("reverse-fly", "Oiseau haltères", "lateral", "halteres", 1, ["oiseau", "oiseau halteres"], [
    "Le buste est penché, le dos neutre.",
    "Les coudes s’ouvrent vers l’extérieur.",
    "On s’arrête quand les bras sont dans l’axe des épaules.",
  ]),
];

export function resolveExercise(name: string, customs: CustomExercise[] = []): {
  name: string;
  pattern: Pattern;
  cues: string[];
  stepKg: number;
  muscles: Muscle[];
} {
  const key = stripAccents(name);
  const custom = customs.find((c) => stripAccents(c.name) === key);
  if (custom) {
    return {
      name: custom.name,
      pattern: custom.pattern,
      cues: custom.cues.length ? custom.cues : ["Bougez sur toute l’amplitude qui reste confortable."],
      stepKg: 2.5,
      muscles: PATTERN_MUSCLES[custom.pattern],
    };
  }
  const found =
    CATALOG.find((e) => stripAccents(e.name) === key) ||
    CATALOG.find((e) => e.aliases.some((a) => key.includes(a) || a.includes(key)));
  if (found) {
    return {
      name: found.name,
      pattern: found.pattern,
      cues: found.cues,
      stepKg: found.stepKg || 1,
      muscles: PATTERN_MUSCLES[found.pattern],
    };
  }
  return {
    name,
    pattern: "hpush",
    cues: ["Gardez une amplitude confortable.", "Notez la charge telle que vous la lisez.", "Le geste détaillé arrivera plus tard."],
    stepKg: 2.5,
    muscles: PATTERN_MUSCLES.hpush,
  };
}
