"use client";

import { useState } from "react";
import { useApp } from "@/components/app-context";
import { applySuggestion, suggestionsForSession, type Suggestion } from "@/lib/progression";
import type { Session } from "@/lib/types";
import { formatKg } from "@/lib/utils";

const SKIP_KEY = "repere-progression-skip";

export function ProgressionBlock({ session, exerciseId }: { session: Session; exerciseId?: string }) {
  const app = useApp();
  const [skip, setSkip] = useState<string[]>(() => readSkip());
  if (session.status === "done" || session.cardio) return null;
  const items = suggestionsForSession(session, app.sessions).filter((item) => {
    if (exerciseId && item.exerciseId !== exerciseId) return false;
    return !skip.includes(keyOf(session.id, item.exerciseId));
  });
  if (!items.length) return null;

  const hide = (item: Suggestion) => {
    const next = [...skip, keyOf(session.id, item.exerciseId)];
    setSkip(next);
    writeSkip(next);
  };

  return (
    <div className="progressions" data-testid="progression">
      {items.map((item) => (
        <div className="progression" key={item.exerciseId} data-testid="progression-suggestion">
          <b>{item.name}</b>
          <p className="num">{suggestionLine(item)}</p>
          <p className="fine">{item.reason}</p>
          <div className="choice">
            <button
              type="button"
              className="btn small"
              data-testid="progression-accept"
              onClick={() => {
                void app.updateSession(session.id, (current) => applySuggestion(current, item)).then(() => hide(item));
              }}
            >
              Accepter
            </button>
            <button type="button" className="btn ghost small" data-testid="progression-ignore" onClick={() => hide(item)}>
              Ignorer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function suggestionLine(item: Suggestion): string {
  if (item.loadKg == null) return `${item.reps ?? "—"} répétitions`;
  const unit = item.unit === "kg/main" ? " kg/main" : item.unit === "kg/jambe" ? " kg/jambe" : " kg";
  return `${formatKg(item.loadKg)}${unit} × ${item.reps ?? "—"}`;
}

function keyOf(sessionId: string, exerciseId: string) {
  return `${sessionId}:${exerciseId}`;
}

function readSkip(): string[] {
  try {
    const raw = sessionStorage.getItem(SKIP_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSkip(keys: string[]) {
  try {
    sessionStorage.setItem(SKIP_KEY, JSON.stringify(keys.slice(-80)));
  } catch {
    /* stockage privé */
  }
}
