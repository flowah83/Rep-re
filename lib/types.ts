export type Pattern =
  | "hpush"
  | "hpull"
  | "vpush"
  | "vpull"
  | "squat"
  | "hinge"
  | "lunge"
  | "curl"
  | "tricep"
  | "lateral"
  | "calf"
  | "core";

export type Muscle =
  | "pectoraux"
  | "epaules"
  | "triceps"
  | "biceps"
  | "dos"
  | "quadriceps"
  | "ischios"
  | "fessiers"
  | "mollets"
  | "abdos";

export type SetLog = {
  id: string;
  loadKg: number | null;
  reps: number | null;
  rpe: number | null;
  /** Répétitions en réserve, si elles ont été notées. */
  rir?: number | null;
  /** Côté, pour un unilatéral noté droite / gauche. */
  side?: "D" | "G" | null;
  /** `kg`, `kg/main`, `kg/jambe`, corps, lest ou assistance. */
  unit?: string | null;
  /** Présent quand l’unité de la série a été déduite. */
  unitSource?: "inferred";
  restRealSec?: number | null;
  precision?: string | null;
  warmup: boolean;
  done: boolean;
  /** `plan` : valeur copiée de la cible. `saisie` : la personne ou une série faite l’a écrite. */
  origin?: "plan" | "saisie";
  /** Série laissée de côté : elle ne compte pas, et elle ne bloque pas la fin. */
  skipped?: boolean;
};

export type Planned = {
  sets: number;
  reps: number | null;
  loadKg: number | null;
  restSec: number;
  rpe: number | null;
};

export type ExerciseLog = {
  id: string;
  name: string;
  pattern: Pattern;
  stepKg: number;
  cues: string[];
  muscles: Muscle[];
  note?: string;
  /** Charge par main, par jambe, poids du corps, lest ou assistance. */
  unit?: string | null;
  /** Présent quand l’unité a été déduite, pour pouvoir revenir en arrière. */
  unitSource?: "inferred";
  /** L’exercice a été fait, mais le détail des séries n’est pas connu. */
  detailUnknown?: boolean;
  planned: Planned;
  sets: SetLog[];
};

export type CardioLog = {
  sport: string;
  label?: string;
  durationMin: number | null;
  distanceKm: number | null;
  rpe: number | null;
  pace: string | null;
  hrAvg: number | null;
  hrMax: number | null;
  elevationM: number | null;
  kcal: number | null;
};

export type SessionStatus = "planned" | "active" | "done";

export type Session = {
  id: string;
  date: string;
  time?: string;
  title: string;
  intention?: string;
  coachNote?: string;
  noteForMe?: string;
  noteForCoach?: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  source: "coach" | "manual" | "demo";
  restEndsAt?: number | null;
  exercises: ExerciseLog[];
  /** Présent pour une séance de course, vélo, natation ou assimilée. */
  cardio?: CardioLog;
  /** Durée connue sans détail de séries, par exemple les élastiques. */
  durationMin?: number | null;
  /** Séance close pour de bon, ou rangée avec seulement ce qui était noté. */
  closed?: "full" | "partial";
  /**
   * Fait partie du programme de la semaine.
   * Absent sur une ancienne séance : une séance manuelle déjà notée reste hors du plan.
   * `false` : un historique importé, qui ne devient pas le programme de cette semaine.
   */
  scheduled?: boolean;
};

export type CustomExercise = {
  id: string;
  name: string;
  pattern: Pattern;
  cues: string[];
};

export type Settings = {
  onboarded: boolean;
  theme: "system" | "light" | "dark";
  barKg: number;
  /** Ancien horodatage. Ce n’est pas la preuve qu’un fichier existe encore. */
  lastBackupAt?: string;
  /** Dernier téléchargement lancé, pas une copie confirmée. */
  lastDownloadAt?: string;
  /** Résultat de la demande de conservation. Ce n’est pas une garantie. */
  storagePersistent?: boolean;
  /** Version des données déjà migrées sur ce téléphone. */
  schemaVersion?: number;
};

export type BackupFile = {
  app: "repere";
  version: 1;
  exportedAt: string;
  settings: Settings;
  sessions: Session[];
  customExercises: CustomExercise[];
  /** Choix de charges déjà faits, pour ne pas les perdre au retour d’une copie. */
  progression?: string | null;
  /** Plans d’avant le départ, pour pouvoir encore annuler. */
  planSnapshots?: Record<string, Session> | null;
  /** Présent seulement si la copie a été enregistrée en l’incluant. */
  coachToken?: string | null;
};
