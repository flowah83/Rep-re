import { exerciseFromPlan } from "./plan";
import type { Session } from "./types";
import { addDays, localDate, uid } from "./utils";

function doneSet(load: number, reps: number, rpe: number | null, warmup = false) {
  return { id: uid(), loadKg: load, reps, rpe: warmup ? null : rpe, warmup, done: true };
}

function finish(session: Session, minutes: number): Session {
  const start = new Date(`${session.date}T18:00:00`);
  const end = new Date(start.getTime() + minutes * 60000);
  return { ...session, status: "done", startedAt: start.toISOString(), endedAt: end.toISOString(), source: "demo" };
}

/** Séances fictives, datées à partir d’aujourd’hui, pour regarder l’application avant d’avoir son historique. */
export function buildDemo(today = new Date()): Session[] {
  const day = localDate(today);
  const sessions: Session[] = [];

  for (let w = 12; w >= 2; w--) {
    const date = addDays(day, -7 * w);
    const load = Math.round((75 + (12 - w) * 1.5) * 2) / 2;
    const bench = exerciseFromPlan({
      nom: "Développé couché barre",
      series: 1,
      repetitions: 5,
      charge_kg: load,
      repos_secondes: 180,
    });
    bench.sets = [doneSet(load, 5, 8)];
    const push = finish(
      {
        id: uid(),
        date,
        title: "Poussée",
        intention: "force",
        status: "planned",
        source: "demo",
        exercises: [bench],
      },
      50,
    );
    sessions.push(push);
  }

  const lightDate = addDays(day, -7);
  const light = exerciseFromPlan({
    nom: "Développé couché barre",
    series: 4,
    repetitions: 6,
    charge_kg: 80,
    repos_secondes: 180,
    echauffement: [{ charge_kg: 60, repetitions: 8 }],
  });
  light.sets = [
    doneSet(60, 8, null, true),
    doneSet(80, 6, 8),
    doneSet(80, 6, 8),
    doneSet(80, 6, 8),
    doneSet(80, 5, 9),
  ];
  sessions.push(
    finish(
      {
        id: uid(),
        date: lightDate,
        time: "10:30",
        title: "Poussée",
        intention: "hypertrophie",
        status: "planned",
        source: "demo",
        exercises: [
          light,
          withDone("Développé incliné haltères", 3, 28, 10, 8),
          withDone("Écarté poulie", 3, 15, 12, 8),
          withDone("Développé militaire barre", 3, 50, 8, 8),
          withDone("Élévations latérales", 3, 10, 15, 8),
          withDone("Extension triceps poulie", 3, 25, 12, 8),
        ],
      },
      57,
    ),
  );

  sessions.push(
    finish(
      {
        id: uid(),
        date: addDays(day, -2),
        title: "Jambes",
        intention: "hypertrophie",
        status: "planned",
        source: "demo",
        exercises: [
          withDone("Squat barre", 4, 100, 5, 8),
          withDone("Presse à cuisses", 3, 120, 10, 8),
          withDone("Fentes haltères", 3, 22, 10, 8),
          withDone("Soulevé de terre roumain", 3, 80, 8, 8),
          withDone("Mollets debout", 4, 60, 12, 8),
        ],
      },
      61,
    ),
  );

  sessions.push(
    finish(
      {
        id: uid(),
        date: addDays(day, -4),
        title: "Dos",
        intention: "hypertrophie",
        status: "planned",
        source: "demo",
        exercises: [
          withDone("Tractions", 4, 10, 6, 8),
          withDone("Rowing barre", 4, 70, 8, 8),
          withDone("Tirage vertical", 3, 55, 10, 8),
          withDone("Face pull", 3, 20, 15, 7),
          withDone("Curl haltères", 3, 12, 10, 8),
        ],
      },
      54,
    ),
  );

  const todayPush = {
    id: uid(),
    date: day,
    time: "18:15",
    title: "Poussée",
    intention: "hypertrophie",
    coachNote: "On garde le couché à 80 kg. Si les quatre séries passent à 6, on montera à 82,5 kg.",
    status: "planned" as const,
    source: "demo" as const,
    exercises: [
      exerciseFromPlan({
        nom: "Développé couché barre",
        series: 4,
        repetitions: 6,
        charge_kg: 80,
        repos_secondes: 180,
        rpe_vise: 8,
        echauffement: [{ charge_kg: 60, repetitions: 8 }],
      }),
      exerciseFromPlan({ nom: "Développé incliné haltères", series: 3, repetitions: 10, charge_kg: 28, repos_secondes: 120, rpe_vise: 8 }),
      exerciseFromPlan({ nom: "Écarté poulie", series: 3, repetitions: 12, charge_kg: 15, repos_secondes: 90, rpe_vise: 8 }),
      exerciseFromPlan({ nom: "Développé militaire barre", series: 3, repetitions: 8, charge_kg: 50, repos_secondes: 150, rpe_vise: 8 }),
      exerciseFromPlan({ nom: "Élévations latérales", series: 3, repetitions: 15, charge_kg: 10, repos_secondes: 75, rpe_vise: 8 }),
      exerciseFromPlan({ nom: "Extension triceps poulie", series: 3, repetitions: 12, charge_kg: 25, repos_secondes: 90, rpe_vise: 8 }),
    ],
  };
  sessions.push(todayPush);
  return sessions;
}

function withDone(name: string, sets: number, load: number, reps: number, rpe: number) {
  const ex = exerciseFromPlan({ nom: name, series: sets, repetitions: reps, charge_kg: load, repos_secondes: 90, rpe_vise: rpe });
  ex.sets = Array.from({ length: sets }, () => doneSet(load, reps, rpe));
  return ex;
}
