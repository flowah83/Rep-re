"use client";

import { useState } from "react";
import { useApp, type HistFilter } from "@/components/app-context";
import { hardSetCount, tonnage } from "@/lib/calc";
import { historyBucket } from "@/lib/display";
import { cardioSummary, formatMinutes } from "@/lib/history";
import type { Session } from "@/lib/types";
import { formatKg, mondayOf, parseISODate, stripAccents } from "@/lib/utils";

const FILTERS: { id: HistFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "upper", label: "Upper" },
  { id: "lower", label: "Lower" },
  { id: "cardio", label: "Course" },
  { id: "other", label: "Autre" },
];

export function HistoryScreen() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const needle = stripAccents(query.trim());
  const list = app.sessions
    .filter((session) => app.filter === "all" || historyBucket(session) === app.filter)
    .filter((session) => {
      if (!needle) return true;
      const hay = stripAccents(`${session.title} ${session.exercises.map((exercise) => exercise.name).join(" ")}`);
      return hay.includes(needle);
    })
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
      <input
        className="searchfield"
        data-testid="history-search"
        value={query}
        placeholder="Chercher une séance ou un geste"
        onChange={(event) => setQuery(event.target.value)}
      />
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
              <div className="session" key={session.id}>
                <button
                  type="button"
                  className="sessionhit"
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
                    <div className="exnames">
                      {session.exercises.map((exercise) => (
                        <span key={exercise.id}>{exercise.name}</span>
                      ))}
                    </div>
                    <div className="smeta num">{statusLine(session)}</div>
                    {session.status === "planned" ? <div className="tag">Prévu</div> : null}
                  </div>
                </button>
                {session.status === "done" ? (
                  <button type="button" className="linkish correct" data-testid="correct-session" onClick={() => app.openSession(session.id)}>
                    Corriger
                  </button>
                ) : null}
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function statusLine(session: Session) {
  if (session.status === "planned") return "Prévue";
  const line = volumeLine(session);
  if (session.status !== "active") return line;
  return line === "durée non notée" ? "En cours" : `En cours · ${line}`;
}

function volumeLine(session: Session) {
  if (session.cardio) return cardioSummary(session.cardio);
  const unknown = session.exercises.some((exercise) => exercise.detailUnknown);
  const count = hardSetCount(session.exercises);
  if (count === 0 && session.durationMin != null) {
    return `${formatMinutes(session.durationMin)}${unknown ? " · séries non détaillées" : ""}`;
  }
  if (count === 0 && unknown) return "séries non détaillées";
  if (count === 0) return "durée non notée";
  const line = `${count <= 1 ? "1 série" : `${count} séries`} · ${formatKg(tonnage(session.exercises))} kg`;
  return unknown ? `${line} · séries non détaillées` : line;
}

function weekday(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(parseISODate(iso)).replace(".", "");
}

function dayMonth(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(parseISODate(iso));
}
