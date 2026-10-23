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
  hinge: "Hanche et dos",
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
  C("row", "Rowing barre", "hpull", "barre", 2.5, ["rowing barre"], [
    "Le buste est penché, le dos neutre.",
    "On tire la barre vers le bas du ventre.",
    "Les omoplates se serrent en haut.",
  ]),
  C("pulldown", "Tirage vertical", "vpull", "poulie", 5, ["tirage vertical", "lat pulldown"], [
    "On tire vers le haut de la poitrine.",
    "Les coudes descendent vers les côtes.",
    "On ne se penche pas en arrière pour tricher.",
  ]),
  C("pullup", "Tractions", "vpull", "corps", 2.5, ["tractions", "traction"], [
    "On part bras tendus, épaules loin des oreilles.",
    "On tire le sternum vers la barre.",
    "La charge ajoutée se note à part du poids du corps.",
  ]),
  C("facepull", "Face pull", "hpull", "poulie", 2.5, ["face pull"], [
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

/** Synonymes explicites, déjà normalisés. Jamais une sous-chaîne. */
const SYNONYMS: Record<string, string> = {
  "back squat": "squat",
  "romanian deadlift": "rdl",
  "elevations laterales halteres": "lateral",
  "mollets debout machine": "calf",
  "bench press": "bench",
};

const ACCEPT_SCORE = 0.86;
const DOUBTFUL_SCORE = 0.4;

export type ExerciseMatch = {
  name: string;
  pattern: Pattern;
  cues: string[];
  stepKg: number;
  muscles: Muscle[];
  /** Faux : le nom doit devenir un exercice personnel, il n’est pas dans le catalogue. */
  matched: boolean;
  catalogId: string | null;
  via: "custom" | "exact" | "synonym" | "tokens" | "none";
  score: number;
  doubtful: boolean;
  near: string | null;
};

export function normalizeExerciseKey(name: string): string {
  return stripAccents(name)
    .replace(/['’`]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(name: string): string[] {
  const stop = new Set(["a", "au", "aux", "de", "des", "du", "la", "le", "les", "et", "ou", "en", "sur", "avec"]);
  return normalizeExerciseKey(name)
    .split(" ")
    .filter((token) => token && !stop.has(token))
    .map(stemToken);
}

function dice(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function sharedCount(left: string[], right: string[]): number {
  const b = new Set(right);
  let shared = 0;
  for (const token of new Set(left)) if (b.has(token)) shared += 1;
  return shared;
}

function isEnduranceName(key: string): boolean {
  return /\b(course|footing|natation|nage|velo|swimming|running|cycling)\b/.test(key);
}

export function inferPattern(name: string): Pattern {
  const key = normalizeExerciseKey(name);
  const rules: [RegExp, Pattern][] = [
    [/leg curl|ischio|souleve|deadlift|hip thrust|roumain|good morning/, "hinge"],
    [/split squat|fente|bulgare|lunge/, "lunge"],
    [/squat|presse/, "squat"],
    [/tirage vertical|traction|pull up|pullup/, "vpull"],
    [/rowing|row\b|tirage/, "hpull"],
    [/militaire|overhead/, "vpush"],
    [/developpe|couche|ecarte|pompe|bench/, "hpush"],
    [/curl/, "curl"],
    [/triceps|extension|pushdown|dips/, "tricep"],
    [/elevation|lateral|oiseau|pec deck|pec-deck/, "lateral"],
    [/mollet/, "calf"],
    [/gainage|planche|abdo|crunch|dead bug/, "core"],
  ];
  for (const [pattern, value] of rules) if (pattern.test(key)) return value;
  return "hpush";
}

export function explainMatch(name: string, customs: CustomExercise[] = []): ExerciseMatch {
  const key = normalizeExerciseKey(name);
  const blank = (partial: Partial<ExerciseMatch>): ExerciseMatch => ({
    name: name.trim() || "Exercice",
    pattern: "hpush",
    cues: [],
    stepKg: 2.5,
    muscles: PATTERN_MUSCLES.hpush,
    matched: false,
    catalogId: null,
    via: "none",
    score: 0,
    doubtful: false,
    near: null,
    ...partial,
  });

  const custom = customs.find((item) => normalizeExerciseKey(item.name) === key);
  if (custom) {
    return blank({
      name: custom.name,
      pattern: custom.pattern,
      cues: custom.cues.length ? custom.cues : ["Bougez sur toute l’amplitude qui reste confortable."],
      muscles: PATTERN_MUSCLES[custom.pattern],
      matched: true,
      via: "custom",
      score: 1,
    });
  }

  const byName = CATALOG.find((exercise) => normalizeExerciseKey(exercise.name) === key);
  const synonymId = SYNONYMS[key];
  const bySynonym = synonymId ? CATALOG.find((exercise) => exercise.id === synonymId) : undefined;
  const byAlias = CATALOG.find((exercise) => exercise.aliases.some((alias) => normalizeExerciseKey(alias) === key));
  const exact = byName ?? bySynonym ?? byAlias;
  if (exact) {
    return blank({
      name: exact.name,
      pattern: exact.pattern,
      cues: exact.cues,
      stepKg: exact.stepKg || 1,
      muscles: PATTERN_MUSCLES[exact.pattern],
      matched: true,
      catalogId: exact.id,
      via: byName ? "exact" : "synonym",
      score: 1,
    });
  }

  const query = tokenize(name);
  let best: { exercise: CatalogExercise; score: number; shared: number } | null = null;
  let second = 0;
  for (const exercise of CATALOG) {
    const tokens = tokenize(exercise.name);
    const score = dice(query, tokens);
    const shared = sharedCount(query, tokens);
    if (!best || score > best.score) {
      second = best?.score ?? 0;
      best = { exercise, score, shared };
    } else if (score > second) second = score;
  }

  const endurance = isEnduranceName(key);
  const pattern = endurance ? "core" : inferPattern(name);
  const unmatched = blank({
    pattern,
    cues: endurance
      ? ["Notez la durée et la distance, si vous les avez."]
      : ["Gardez une amplitude confortable.", "Notez la charge telle que vous la lisez."],
    muscles: endurance ? [] : PATTERN_MUSCLES[pattern],
    score: best?.score ?? 0,
    doubtful: Boolean(best && best.score >= DOUBTFUL_SCORE),
    near: best && best.score >= DOUBTFUL_SCORE ? best.exercise.name : null,
  });

  if (best && best.score >= ACCEPT_SCORE && best.shared >= 2 && best.score - second >= 0.08) {
    return blank({
      name: best.exercise.name,
      pattern: best.exercise.pattern,
      cues: best.exercise.cues,
      stepKg: best.exercise.stepKg || 1,
      muscles: PATTERN_MUSCLES[best.exercise.pattern],
      matched: true,
      catalogId: best.exercise.id,
      via: "tokens",
      score: best.score,
    });
  }
  return unmatched;
}

export function resolveExercise(name: string, customs: CustomExercise[] = []): ExerciseMatch {
  return explainMatch(name, customs);
}

export function customFromMatch(name: string, match: ExerciseMatch): CustomExercise {
  const slug = normalizeExerciseKey(name).replace(/ /g, "-").slice(0, 56) || "exercice";
  return {
    id: `custom-${slug}`,
    name: name.trim() || "Exercice",
    pattern: match.pattern,
    cues: match.cues,
  };
}
