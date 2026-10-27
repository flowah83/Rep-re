/** Faits courts, justes, sans conseil médical et sans mythe d’entraînement. */
export const FACTS: readonly string[] = [
  "Définition : l’estimation d’Epley, charge × (1 + répétitions / 30), est une opération. Elle n’est pas une garantie pour une personne.",
  "80 kg × 6 donnent environ 96 kg selon Epley. Ce n’est pas un max testé sur une répétition.",
  "82,5 kg × 6 donnent environ 99 kg selon Epley. Le record de charge, lui, reste 82,5 × 6.",
  "100 kg × 5 donnent environ 117 kg selon Epley, une fois arrondi. La décimale ne rend pas l’estimation plus sûre.",
  "Un record de charge et une estimation de force ne disent pas la même chose.",
  "Règle de Repère : au-delà de 10 répétitions, Epley n’est plus utilisée. On garde la charge tenue.",
  "Tenir la même charge une répétition de plus est déjà une progression.",
  "Passer de 80 à 82,5 kg, c’est un peu plus de 3 % sur la barre.",
  "Règle de Repère : la double progression monte d’abord les répétitions dans la fourchette, puis la charge. Ce n’est pas la seule façon de progresser.",
  "Règle de Repère : deux séances de suite sans l’objectif de répétitions proposent d’alléger une fois. Ce n’est pas une obligation.",
  "Règle de Repère : après trois séances réussies à charge stable, une séance plus légère est proposée. L’ACSM 2026 ne fixe pas cette cadence.",
  "Proposition : une semaine plus légère peut soulager les articulations. Sept jours ne font pas disparaître le muscle, et ce n’est pas une prescription.",
  "Repère général : les tendons s’adaptent souvent plus lentement que le muscle. Monter la charge très vite augmente la contrainte. Ce n’est pas une mesure.",
  "Une séance plus légère ne fait pas baisser le record tenu : la courbe garde le meilleur niveau.",
  "Un seul point ne fait pas une pente. Il faut plusieurs séances pour dessiner une courbe.",
  "La semaine n’est pas finie le jeudi. Comparer son volume à une semaine complète trop tôt donne un faux retard.",
  "Définition : le tonnage est une somme charge × répétitions des séries de travail, hors échauffement. Ce n’est ni un score de qualité, ni une mesure de fatigue.",
  "Définition : une charge notée « kg par main » est celle d’une seule main. Elle ne se compare pas à une charge en kg total.",
  "Une séance fermée en cours de route ne contient que ce qui a été noté. Ce volume est un plancher.",
  "Une série laissée de côté ne compte ni dans le volume, ni dans le record.",
  "Le développé couché charge surtout les pectoraux, les épaules et les triceps.",
  "Le squat barre charge surtout les quadriceps et les fessiers. Le tronc stabilise.",
  "Le soulevé de terre roumain charge les ischios, les fessiers et le dos, ce n’est pas un soulevé classique.",
  "Une prise plus serrée au couché augmente la part des triceps.",
  "Les élévations latérales sont un petit volume qui compte beaucoup pour le deltoïde moyen.",
  "Les épaules travaillent déjà dans la poussée et dans le tirage. Viser un 50/50 parfait n’est pas une loi.",
  "Les ischios sont souvent moins sollicités que les quadriceps dans un programme centré sur le squat.",
  "Le premier exercice de la séance reçoit la force la plus fraîche.",
  "Descendre la barre en contrôle fait partie du travail. Laisser tomber la charge n’entraîne pas la descente.",
  "L’amplitude complète, si les articulations la supportent, étire le muscle sous charge.",
  "Le repos entre séries lourdes, souvent deux à cinq minutes, permet de mieux répéter la charge.",
  "Un échauffement du mouvement, en séries légères, prépare mieux qu’un échauffement général seul.",
  "Un échauffement trop long peut fatiguer avant la série qui compte.",
  "Le RPE 8 veut dire qu’il restait environ deux répétitions possibles. Encore faut-il l’avoir noté.",
  "Un RPE manquant n’est pas un effort faible. Une moyenne avec des trous ne veut rien dire.",
  "Garder une à trois répétitions en réserve permet souvent de progresser sans aller à l’échec à chaque série.",
  "Repère général : la force dépend aussi de la coordination, pas seulement de la taille du muscle. Les parts varient d’une personne à l’autre.",
  "Le muscle se reconstruit entre les séances. La série n’est que le signal.",
  "Repère général : on décrit souvent des fibres rapides pour les charges lourdes et des fibres lentes pour les efforts longs. Repère ne les mesure pas.",
  "Repère général : le type de fibres ne se réécrit pas en quelques séances. Ce n’est pas une promesse de transformation.",
  "La barre olympique standard pèse 20 kg, avant les disques.",
  "Deux disques de 2,5 kg, un de chaque côté, ajoutent 5 kg à la barre.",
  "Noter les séries le jour même évite d’inventer les charges le lendemain.",
  "Deux séances le même jour ne font pas deux jours de fréquence.",
  "Une séance manquée n’efface pas les semaines d’avant.",
  "S’entraîner à heure fixe n’est pas obligatoire. La régularité de la semaine compte davantage.",
  "Le sommeil court, plusieurs nuits de suite, dégrade souvent la force et l’attention du lendemain.",
  "Les muscles utilisent les protéines des repas de la journée. Il n’y a pas de fenêtre magique de 30 minutes après la séance.",
  "Boire pendant l’effort aide, surtout quand il fait chaud.",
  "La chaleur augmente la fréquence cardiaque pour un même effort. L’été à Toulon, la séance peut sembler plus dure.",
  "Le froid du matin raidit un peu. L’échauffement compte davantage en hiver.",
  "Marcher entre deux séances de fonte ne casse pas la récupération du muscle.",
  "Une course ou une nage fatigue le corps même si le tonnage de barre ne bouge pas.",
  "Une mauvaise nuit se voit souvent sur la séance du lendemain, sans que la courbe de force soit cassée.",
  "Proposition : la barre peut plafonner avant que le muscle semble épuisé. Repère ne mesure pas le système nerveux.",
  "Le gainage transmet la force au squat et au soulevé. Il ne sert pas seulement à dessiner les abdos.",
  "La presse à cuisses charge les jambes avec moins de contrainte sur le dos que le squat.",
  "Le développé militaire charge surtout les épaules et les triceps.",
  "Le magnésie améliore la prise. Il ne rend pas la barre plus légère.",
  "Changer la largeur des mains change les muscles les plus sollicités, pas le nom de la courbe.",
  "Définition : une séance de jambes pèse lourd dans le tonnage parce que les charges sont hautes. Cela ne la rend pas plus utile qu’une poussée.",
  "Proposition : un jour entre deux séances du même muscle suffit souvent. Ce n’est pas une règle pour tout le monde.",
  "Les Jeux olympiques modernes s’ouvrent en 1896 à Athènes, et l’haltérophilie y est déjà au programme.",
  "La légende de Milon de Crotone, qui aurait porté un veau chaque jour, est l’image ancienne de la progression graduelle.",
  "Le premier mouvement noté d’une séance nouvelle n’a pas encore de courbe. Le niveau vient avec les séances suivantes.",
];

export function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(year, (month || 1) - 1, day || 1) / 86400000);
}

/** Un fait par jour, dans l’ordre, sans répétition avant d’avoir épuisé la liste. */
export type FactKind = "definition" | "regle" | "source" | "proposition";

export const FACT_LABEL: Record<FactKind, string> = {
  definition: "Définition",
  regle: "Règle de Repère",
  source: "Repère général",
  proposition: "Proposition",
};

/** Le préfixe dit de quelle nature est la phrase. Le reste est le fait. */
export function factKind(text: string): FactKind {
  if (text.startsWith("Règle de Repère")) return "regle";
  if (text.startsWith("Repère général")) return "source";
  if (text.startsWith("Proposition")) return "proposition";
  return "definition";
}

export function factBody(text: string): string {
  return text.replace(/^(Définition|Règle de Repère|Repère général|Proposition)\s*:\s*/, "");
}

export function factForDate(iso: string, shift = 0): string {
  const count = FACTS.length;
  const index = ((dayNumber(iso) + shift) % count + count) % count;
  return FACTS[index];
}
