"use client";

import { useApp, type HistFilter } from "@/components/app-context";
import { hardSetCount, tonnage } from "@/lib/calc";
import type { Session } from "@/lib/types";
import { formatKg, mondayOf, parseISODate, stripAccents } from "@/lib/utils";

const FILTERS: { id: HistFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "push", label: "Poussée" },
  { id: "back", label: "Dos" },
  { id: "legs", label: "Jambes" },
  { id: "other", label: "Autre" },
];

export function HistoryScreen() {
  const app = useApp();
  const list = app.sessions
    .filter((session) => app.filter === "all" || bucket(session.title) === app.filter)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.time ?? "").localeCompare(a.time ?? "")));
  const weeks = new Map<string, Session[]>();
  for (const session of list) {
    const key = mondayOf(session.date);
    weeks.set(key, [...(weeks.get(key) ?? []), session]);
  }

  return (
    <div className="screen" data-screen="history">
      <div className="eyebrow">Séances notées</div>
      <h1 className="title">Carnet</h1>
      <div className="chips">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={app.filter === item.id ? "on" : ""} data-testid={`filter-${item.id}`} onClick={() => app.setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {app.sessions.length === 0 ? (
        <article className="card">
          <div className="empty">
            <h2>Le carnet est vide.</h2>
            <p>Une séance terminée, ou encore prévue, apparaîtra ici. Vous pouvez importer le plan de Chef sport depuis Aujourd’hui.</p>
          </div>
        </article>
      ) : list.length === 0 ? (
        <p className="quiet">Aucune séance dans ce filtre.</p>
      ) : (
        [...weeks.entries()].map(([week, sessions]) => (
          <section key={week}>
            <div className="weeklabel">{week === mondayOf(app.today) ? "Cette semaine" : `Semaine du ${dayMonth(week)}`}</div>
            {sessions.map((session) => (
              <button
                type="button"
                className="session"
                key={session.id}
                onClick={() => {
                  if (session.status === "done") app.openBilan(session.id);
                  else if (session.status === "active") app.openSession(session.id);
                  else {
                    app.setSelectedDate(session.date);
                    app.setTab("today");
                  }
                }}
              >
                <div className="sdate">
                  <b className="num">{parseISODate(session.date).getDate()}</b>
                  <span>{weekday(session.date)}</span>
                </div>
                <div>
                  <h3>{session.title}</h3>
                  <p>{session.exercises.map((exercise) => exercise.name).join(" · ")}</p>
                  <div className="smeta num">
                    {session.status === "planned" ? "Prévue" : volumeLine(session)}
                  </div>
                  {session.status === "planned" ? <div className="tag">Prévu</div> : null}
                </div>
              </button>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function volumeLine(session: Session) {
  const count = hardSetCount(session.exercises);
  return `${count} série${count > 1 ? "s" : ""} · ${formatKg(tonnage(session.exercises))} kg`;
}

function bucket(title: string): HistFilter {
  const value = stripAccents(title);
  if (value.includes("pouss")) return "push";
  if (value.includes("dos") || value.includes("tirage")) return "back";
  if (value.includes("jambe") || value.includes("squat")) return "legs";
  return "other";
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(parseISODate(iso)).replace(".", "");
}

function dayMonth(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(parseISODate(iso));
}
