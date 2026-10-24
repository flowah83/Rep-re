import { explainMatch, normalizeExerciseKey } from "./exercises";
import type { Muscle, Pattern } from "./types";

export type MotionId =
  | "squat"
  | "bench"
  | "incline"
  | "fly"
  | "ohp"
  | "lateral"
  | "pushdown"
  | "overhead-ext"
  | "dips"
  | "legpress"
  | "deadlift"
  | "rdl"
  | "lunge"
  | "split"
  | "row"
  | "seated-row"
  | "chest-row"
  | "pulldown"
  | "pullup"
  | "facepull"
  | "curl"
  | "incline-curl"
  | "calf"
  | "calf-press"
  | "plank"
  | "reverse-fly"
  | "legcurl"
  | "hipthrust"
  | "crunch"
  | "deadbug"
  | "quiet";

export type Tool = "bar" | "dumbbell" | "cable" | "none";

export type Phase = { dur: number; a: number; b: number; label: string };

export type Cam = { theta: number; phi: number; dist: number; target: [number, number, number] };

export type MotionPlan = {
  id: MotionId;
  tool: Tool;
  /** `pattern` : geste principal de la famille. `quiet` : pas un geste de salle. */
  fallback: "none" | "pattern" | "quiet";
  phases: Phase[];
  cam: Cam;
};

const PRESS: Phase[] = [
  { dur: 2.5, a: 0, b: 1, label: "Descente" },
  { dur: 0.75, a: 1, b: 1, label: "En bas" },
  { dur: 1.5, a: 1, b: 0, label: "Montée" },
  { dur: 0.9, a: 0, b: 0, label: "En haut" },
];

const SQUAT_CLOCK: Phase[] = [
  { dur: 3.0, a: 0, b: 1, label: "Descente" },
  { dur: 0.85, a: 1, b: 1, label: "En bas" },
  { dur: 1.55, a: 1, b: 0, label: "Montée" },
  { dur: 1.1, a: 0, b: 0, label: "En haut" },
];

const PULL: Phase[] = [
  { dur: 1.5, a: 0, b: 1, label: "Tirage" },
  { dur: 0.7, a: 1, b: 1, label: "Serré" },
  { dur: 2.3, a: 1, b: 0, label: "Retour" },
  { dur: 0.8, a: 0, b: 0, label: "Allongé" },
];

const PULLUP_CLOCK: Phase[] = [
  { dur: 1.45, a: 0, b: 1, label: "Montée" },
  { dur: 0.8, a: 1, b: 1, label: "Menton" },
  { dur: 2.9, a: 1, b: 0, label: "Descente" },
  { dur: 0.9, a: 0, b: 0, label: "Suspension" },
];

const RAISE: Phase[] = [
  { dur: 1.6, a: 0, b: 1, label: "Montée" },
  { dur: 0.7, a: 1, b: 1, label: "En haut" },
  { dur: 2.2, a: 1, b: 0, label: "Descente" },
  { dur: 0.8, a: 0, b: 0, label: "En bas" },
];

const HOLD: Phase[] = [{ dur: 6, a: 1, b: 1, label: "Tenu" }];

const STAND: Cam = { theta: 0.58, phi: 1.16, dist: 3.35, target: [0, 0.9, 0.02] };
const BENCH_CAM: Cam = { theta: 1.15, phi: 1.22, dist: 3.4, target: [0, 0.72, -0.45] };
const PULL_CAM: Cam = { theta: 0.7, phi: 1.18, dist: 3.65, target: [0, 1.32, 0.04] };
const HINGE_CAM: Cam = { theta: 0.95, phi: 1.14, dist: 3.45, target: [0, 0.78, 0.08] };
const FLOOR_CAM: Cam = { theta: 1.05, phi: 1.18, dist: 3.55, target: [0, 0.42, 0] };
const SEAT_CAM: Cam = { theta: 0.72, phi: 1.2, dist: 3.4, target: [0, 0.85, 0.15] };

type Meta = { phases: Phase[]; cam: Cam; tool: Tool };

const META: Record<MotionId, Meta> = {
  squat: { phases: SQUAT_CLOCK, cam: { theta: 0.58, phi: 1.16, dist: 3.25, target: [0, 0.82, 0] }, tool: "bar" },
  bench: { phases: SQUAT_CLOCK, cam: BENCH_CAM, tool: "bar" },
  incline: { phases: PRESS, cam: { theta: 1.05, phi: 1.18, dist: 3.4, target: [0, 0.85, -0.15] }, tool: "dumbbell" },
  fly: { phases: PULL, cam: STAND, tool: "cable" },
  ohp: { phases: PRESS, cam: { theta: 0.5, phi: 1.12, dist: 3.4, target: [0, 1.15, 0] }, tool: "bar" },
  lateral: { phases: RAISE, cam: STAND, tool: "dumbbell" },
  pushdown: { phases: PRESS, cam: { theta: 0.7, phi: 1.15, dist: 3.3, target: [0, 1.05, 0.1] }, tool: "cable" },
  "overhead-ext": { phases: PRESS, cam: { theta: 0.85, phi: 1.12, dist: 3.25, target: [0, 1.25, 0] }, tool: "dumbbell" },
  dips: { phases: PRESS, cam: { theta: 0.85, phi: 1.16, dist: 3.4, target: [0, 0.95, 0] }, tool: "none" },
  legpress: { phases: PRESS, cam: { theta: 0.95, phi: 1.15, dist: 3.6, target: [0, 0.7, 0.2] }, tool: "none" },
  deadlift: { phases: PRESS, cam: HINGE_CAM, tool: "bar" },
  rdl: { phases: PRESS, cam: HINGE_CAM, tool: "bar" },
  lunge: { phases: PRESS, cam: { theta: 0.85, phi: 1.16, dist: 3.4, target: [0, 0.8, 0.05] }, tool: "dumbbell" },
  split: { phases: PRESS, cam: { theta: 0.9, phi: 1.16, dist: 3.4, target: [0, 0.75, 0.05] }, tool: "dumbbell" },
  row: { phases: PULL, cam: HINGE_CAM, tool: "bar" },
  "seated-row": { phases: PULL, cam: SEAT_CAM, tool: "cable" },
  "chest-row": { phases: PULL, cam: { theta: 1.15, phi: 1.2, dist: 3.35, target: [0, 0.85, 0.05] }, tool: "dumbbell" },
  pulldown: { phases: PULL, cam: SEAT_CAM, tool: "cable" },
  pullup: { phases: PULLUP_CLOCK, cam: PULL_CAM, tool: "none" },
  facepull: { phases: PULL, cam: { theta: 0.55, phi: 1.14, dist: 3.2, target: [0, 1.25, 0.12] }, tool: "cable" },
  curl: { phases: RAISE, cam: { theta: 0.62, phi: 1.16, dist: 3.15, target: [0, 1.05, 0.05] }, tool: "dumbbell" },
  "incline-curl": { phases: RAISE, cam: { theta: 1.0, phi: 1.16, dist: 3.3, target: [0, 0.95, -0.05] }, tool: "dumbbell" },
  calf: { phases: RAISE, cam: { theta: 0.7, phi: 1.2, dist: 3.2, target: [0, 0.75, 0.05] }, tool: "none" },
  "calf-press": { phases: RAISE, cam: { theta: 1.0, phi: 1.16, dist: 3.5, target: [0, 0.7, 0.25] }, tool: "none" },
  plank: { phases: HOLD, cam: FLOOR_CAM, tool: "none" },
  "reverse-fly": { phases: RAISE, cam: HINGE_CAM, tool: "dumbbell" },
  legcurl: { phases: PULL, cam: { theta: 1.2, phi: 1.18, dist: 3.4, target: [0, 0.7, -0.1] }, tool: "none" },
  hipthrust: { phases: PRESS, cam: { theta: 1.15, phi: 1.2, dist: 3.45, target: [0, 0.45, 0.05] }, tool: "none" },
  crunch: { phases: PRESS, cam: { theta: 0.8, phi: 1.15, dist: 3.3, target: [0, 0.85, 0.05] }, tool: "cable" },
  deadbug: { phases: PRESS, cam: FLOOR_CAM, tool: "none" },
  quiet: { phases: [{ dur: 6, a: 0, b: 0, label: "Debout" }], cam: STAND, tool: "none" },
};

const CATALOG: Record<string, { id: MotionId; tool?: Tool }> = {
  bench: { id: "bench" },
  "incline-db": { id: "incline", tool: "dumbbell" },
  fly: { id: "fly" },
  ohp: { id: "ohp" },
  lateral: { id: "lateral" },
  pushdown: { id: "pushdown" },
  dips: { id: "dips" },
  squat: { id: "squat" },
  legpress: { id: "legpress" },
  deadlift: { id: "deadlift" },
  rdl: { id: "rdl" },
  lunge: { id: "lunge" },
  row: { id: "row" },
  pulldown: { id: "pulldown" },
  pullup: { id: "pullup" },
  facepull: { id: "facepull" },
  curl: { id: "curl" },
  calf: { id: "calf" },
  plank: { id: "plank" },
  "reverse-fly": { id: "reverse-fly" },
};

const PATTERN: Record<Pattern, { id: MotionId; tool?: Tool }> = {
  hpush: { id: "bench" },
  hpull: { id: "row" },
  vpush: { id: "ohp" },
  vpull: { id: "pulldown" },
  squat: { id: "squat" },
  hinge: { id: "rdl" },
  lunge: { id: "lunge" },
  curl: { id: "curl" },
  tricep: { id: "pushdown" },
  lateral: { id: "lateral" },
  calf: { id: "calf" },
  core: { id: "plank" },
};

const MUSCLE_IDS: Record<Muscle, number[]> = {
  pectoraux: [1],
  epaules: [2],
  triceps: [7],
  biceps: [6],
  dos: [3, 9],
  quadriceps: [4],
  ischios: [8],
  fessiers: [5],
  mollets: [11],
  abdos: [10],
};

function make(id: MotionId, tool: Tool | undefined, fallback: MotionPlan["fallback"]): MotionPlan {
  const meta = META[id];
  return { id, tool: tool ?? meta.tool, fallback, phases: meta.phases, cam: meta.cam };
}

function fromKeyword(key: string): MotionPlan | null {
  if (/\b(course|footing|natation|nage|velo|cyclisme)\b|lignes droites|\bwod\b|\bamrap\b/.test(key)) return make("quiet", "none", "quiet");
  if (/leg curl|ischio|flexion des jambes/.test(key)) return make("legcurl", "none", "none");
  if (/hip thrust/.test(key)) return make("hipthrust", "none", "none");
  if (/dead bug/.test(key)) return make("deadbug", "none", "none");
  if (/crunch/.test(key)) return make("crunch", "cable", "none");
  if (/gainage|planche/.test(key)) return make("plank", "none", "none");
  if (/mollet/.test(key) && /presse/.test(key)) return make("calf-press", "none", "none");
  if (/mollet/.test(key)) return make("calf", "none", "none");
  if (/split squat|bulgare/.test(key)) return make("split", "dumbbell", "none");
  if (/fente|lunge/.test(key)) return make("lunge", /barre/.test(key) ? "bar" : "dumbbell", "none");
  if (/oiseau|reverse pec|pec deck|pec-deck/.test(key)) {
    return make("reverse-fly", /poulie|pec/.test(key) ? "cable" : "dumbbell", "none");
  }
  if (/face pull/.test(key)) return make("facepull", "cable", "none");
  if (/poitrine appuy/.test(key)) return make("chest-row", "dumbbell", "none");
  if (/row assis|rowing machine|assis machine|poulie assis|tirage horizontal/.test(key)) return make("seated-row", "cable", "none");
  if (/rowing|\brow\b/.test(key)) return make("row", "bar", "none");
  if (/tirage vertical|pulldown|pull down/.test(key)) return make("pulldown", "cable", "none");
  if (/traction|pull up|pullup/.test(key)) return make("pullup", "none", "none");
  if (/au dessus/.test(key) && /triceps|extension/.test(key)) {
    return make("overhead-ext", /poulie|corde/.test(key) ? "cable" : "dumbbell", "none");
  }
  if (/extension triceps|pushdown|triceps poulie|triceps corde/.test(key)) return make("pushdown", "cable", "none");
  if (/\bdips\b|repulsion/.test(key)) return make("dips", "none", "none");
  if (/curl incline/.test(key)) return make("incline-curl", "dumbbell", "none");
  if (/curl/.test(key)) return make("curl", /poulie/.test(key) ? "cable" : "dumbbell", "none");
  if (/elevation|lateral/.test(key)) return make("lateral", "dumbbell", "none");
  if (/ecarte|\bfly\b/.test(key)) return make("fly", "cable", "none");
  if (/militaire|developpe militaire|\bohp\b/.test(key)) return make("ohp", "bar", "none");
  if (/developpe incline|\bincline\b/.test(key)) return make("incline", /halt/.test(key) ? "dumbbell" : "bar", "none");
  if (/developpe|couche|\bbench\b/.test(key)) return make("bench", "bar", "none");
  if (/roumain|\brdl\b|good morning/.test(key)) return make("rdl", "bar", "none");
  if (/souleve|deadlift/.test(key)) return make("deadlift", "bar", "none");
  if (/presse/.test(key)) return make("legpress", "none", "none");
  if (/squat/.test(key)) return make("squat", "bar", "none");
  return null;
}

export function motionById(id: MotionId, tool?: Tool): MotionPlan {
  return make(id, tool, "none");
}

export function motionForExercise(name: string, pattern: Pattern): MotionPlan {
  const match = explainMatch(name);
  if (match.matched && match.catalogId && CATALOG[match.catalogId]) {
    const spec = CATALOG[match.catalogId];
    return make(spec.id, spec.tool, "none");
  }
  const keyword = fromKeyword(normalizeExerciseKey(name));
  if (keyword) return keyword;
  const family = PATTERN[pattern] ?? PATTERN.hpush;
  return make(family.id, family.tool, "pattern");
}

export function muscleRoles(muscles: Muscle[]): { primary: number[]; secondary: number[] } {
  const primary = new Set<number>();
  const secondary = new Set<number>();
  muscles.forEach((muscle, index) => {
    const ids = MUSCLE_IDS[muscle] ?? [];
    for (const id of ids) {
      if (index === 0) primary.add(id);
      else if (!primary.has(id)) secondary.add(id);
    }
  });
  return { primary: [...primary], secondary: [...secondary] };
}
