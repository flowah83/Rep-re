"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app-context";
import {
  applyAppTool,
  buildCoachContext,
  calendarBodyForTool,
  chefSportNotice,
  describeAction,
  parseToolArgs,
  partitionToolCalls,
  type ToolCall,
} from "@/lib/coach";
import {
  coachIsReady,
  loadCoachChat,
  loadCoachConfig,
  recordCoachNotice,
  saveCoachChat,
  type StoredTurn,
} from "@/lib/coach-store";
import { uid } from "@/lib/utils";

export function CoachLayer() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? null : (
        <button type="button" className="coach-fab" data-testid="coach-button" aria-label="Ouvrir le coach" onClick={() => setOpen(true)}>
          <Bubble />
        </button>
      )}
      {open ? <CoachSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CoachSheet({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [turns, setTurns] = useState<StoredTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  useEffect(() => {
    setTurns(loadCoachChat());
    setReady(coachIsReady());
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, error, busy]);

  const remember = (next: StoredTurn[]) => {
    const trimmed = next.slice(-40);
    turnsRef.current = trimmed;
    setTurns(trimmed);
    saveCoachChat(trimmed);
  };

  const pending = turns.some((turn) => turn.pending);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || pending || !ready) return;
    setDraft("");
    setError("");
    const next = [...turnsRef.current, { id: uid(), role: "user" as const, content: text }];
    remember(next);
    await complete(next);
  };

  const complete = async (history: StoredTurn[], depth = 0, sessions = app.sessions) => {
    if (depth > 3) return;
    setBusy(true);
    try {
      const data = await postJson("/coach", {
        context: buildCoachContext(sessions, app.today),
        messages: toApi(history),
      });
      const message = data.message as { content?: string; tool_calls?: ToolCall[] } | undefined;
      const calls = Array.isArray(message?.tool_calls) ? message.tool_calls.slice(0, 8) : [];
      const groups = partitionToolCalls(calls);
      const assistant: StoredTurn = {
        id: uid(),
        role: "assistant",
        content: message?.content || (groups.writes.length ? "Voici ce que je propose." : ""),
        toolCalls: calls,
        pending: groups.writes.length > 0,
      };
      let next = [...history, assistant];
      if (!groups.writes.length && groups.reads.length) {
        const results = await Promise.all(groups.reads.map((call) => readCalendar(call)));
        next = [...next, ...results];
        remember(next);
        setBusy(false);
        await complete(next, depth + 1, sessions);
        return;
      }
      if (!groups.writes.length && groups.unknown.length) {
        next = [
          ...next,
          ...groups.unknown.map((call) => toolTurn(call.id, "Cette action n’existe pas.")),
        ];
      }
      remember(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le coach n’a pas pu répondre.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (turn: StoredTurn, apply: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const calls = turn.toolCalls ?? [];
    const groups = partitionToolCalls(calls);
    const results: StoredTurn[] = [];
    const lines: string[] = [];
    let state = { sessions: app.sessions, customs: app.customs };
    try {
      if (apply) {
        for (const call of groups.writes) {
          if (call.name === "create_event" || call.name === "update_event" || call.name === "delete_event") {
            const prepared = calendarBodyForTool(call);
            if (!prepared.ok) {
              results.push(toolTurn(call.id, prepared.error));
              lines.push(prepared.error);
              continue;
            }
            try {
              await postJson("/calendar", prepared.body);
              const args = parseToolArgs(call.arguments);
              const notice = chefSportNotice(call.name, args);
              if (notice) recordCoachNotice(notice);
              const summary = describeAction(call, state.sessions).summary;
              results.push(toolTurn(call.id, `Appliqué. ${summary}`));
              lines.push(summary);
            } catch (caught) {
              const message = caught instanceof Error ? caught.message : "Le calendrier n’a pas répondu.";
              results.push(toolTurn(call.id, message));
              lines.push(message);
            }
          } else {
            const result = applyAppTool(state, call);
            if (result.error) {
              results.push(toolTurn(call.id, result.error));
              lines.push(result.error);
            } else {
              state = result.state;
              results.push(toolTurn(call.id, result.summary));
              lines.push(result.summary);
            }
          }
        }
        await app.replaceSessions(state.sessions, state.customs);
      } else {
        for (const call of groups.writes) results.push(toolTurn(call.id, "Annulé. Rien n’a été modifié."));
        lines.push("Annulé. Rien n’a été modifié.");
      }
      const cleared = turnsRef.current.map((item) => (item.id === turn.id ? { ...item, pending: false } : item));
      const next = [...cleared, ...results, { id: uid(), role: "assistant" as const, content: lines.filter(Boolean).join("\n") }];
      remember(next);
      setBusy(false);
      if (apply && ready) await complete(next, 0, state.sessions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La modification n’a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coach-sheet" role="dialog" aria-modal="true" aria-label="Coach" data-testid="coach-sheet">
      <div className="coach-sheet-in">
        <header className="coach-head">
          <button type="button" className="navline" onClick={onClose}>
            Fermer
          </button>
          <strong>Coach</strong>
          <span />
        </header>
        <div className="coach-log" ref={scroller}>
          {!ready ? (
            <div className="coach-note" data-testid="coach-inactive">
              <h2>Le coach n’est pas encore activé.</h2>
              <p>
                Dans Réglages, indiquez l’adresse du service et le code secret. Tant que ce n’est pas fait, vous continuez à noter vos
                séances normalement. Les suggestions de charge, avant une séance, marchent sans le coach.
              </p>
            </div>
          ) : null}
          {turns.filter((turn) => turn.role !== "tool").map((turn) => (
            <div key={turn.id} className={`coach-msg ${turn.role}`}>
              {turn.content ? <p>{turn.content}</p> : null}
              {turn.pending && turn.toolCalls?.length ? (
                <ConfirmCard turn={turn} busy={busy} onApply={() => void resolve(turn, true)} onCancel={() => void resolve(turn, false)} />
              ) : null}
            </div>
          ))}
          {busy ? <p className="coach-wait">Le coach réfléchit…</p> : null}
          {error ? <p className="err">{error}</p> : null}
        </div>
        <form
          className="coach-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            className="field"
            data-testid="coach-input"
            value={draft}
            placeholder={ready ? "Écrire au coach" : "Le coach n’est pas activé"}
            disabled={!ready || busy || pending}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="coach-send" data-testid="coach-send" disabled={!ready || busy || pending || !draft.trim()} aria-label="Envoyer">
            Envoyer
          </button>
        </form>
      </div>
    </div>
  );
}

function ConfirmCard({
  turn,
  busy,
  onApply,
  onCancel,
}: {
  turn: StoredTurn;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const described = (turn.toolCalls ?? []).filter((call) => call.name !== "list_events").map((call) => describeAction(call, app.sessions));
  const chef = described.some((item) => item.chefSport);
  return (
    <article className="coach-card" data-testid="coach-confirm">
      <h3>Appliquer ces changements ?</h3>
      <ul>
        {described.map((item, index) => (
          <li key={index}>{item.summary}</li>
        ))}
      </ul>
      {chef ? <p className="fine">Chef sport en sera informé au prochain « Envoyer à Chef sport ».</p> : null}
      <div className="coach-actions">
        <button type="button" className="btn" data-testid="coach-apply" disabled={busy} onClick={onApply}>
          Appliquer
        </button>
        <button type="button" className="btn ghost" data-testid="coach-cancel" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </article>
  );
}

async function readCalendar(call: ToolCall): Promise<StoredTurn> {
  const prepared = calendarBodyForTool(call);
  if (!prepared.ok) return toolTurn(call.id, prepared.error);
  try {
    const data = await postJson("/calendar", prepared.body);
    const events = Array.isArray(data.events) ? data.events : [];
    return toolTurn(call.id, JSON.stringify({ evenements: events }).slice(0, 8000));
  } catch (caught) {
    return toolTurn(call.id, caught instanceof Error ? caught.message : "Le calendrier n’a pas répondu.");
  }
}

function toolTurn(id: string, content: string): StoredTurn {
  return { id: uid(), role: "tool", toolCallId: id, content };
}

function toApi(turns: StoredTurn[]) {
  return turns.map((turn) => {
    if (turn.role === "tool") return { role: "tool", tool_call_id: turn.toolCallId, content: turn.content };
    if (turn.role === "assistant" && turn.toolCalls?.length) {
      return {
        role: "assistant",
        content: turn.content,
        tool_calls: turn.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        })),
      };
    }
    return { role: turn.role, content: turn.content };
  });
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const config = loadCoachConfig();
  if (!config.url || !config.token) throw new Error("Le coach n’est pas encore activé.");
  let response: Response;
  try {
    response = await fetch(`${config.url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Le coach n’est pas joignable.");
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("La réponse du coach est illisible.");
  }
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Le coach n’a pas pu répondre.");
  return data;
}

function Bubble() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M6.2 6.5h13.6A2.7 2.7 0 0 1 22.5 9.2v7.2a2.7 2.7 0 0 1-2.7 2.7H12l-4.2 3.1v-3.1H6.2A2.7 2.7 0 0 1 3.5 16.4V9.2A2.7 2.7 0 0 1 6.2 6.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
