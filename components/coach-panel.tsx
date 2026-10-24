"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CoachFace } from "@/components/coach-face";
import { coachErrorText } from "@/lib/display";
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
  loadCoachMemo,
  recordCoachNotice,
  rememberCoachLine,
  requestCoach,
  requestCoachStream,
  saveCoachChat,
  type StoredTurn,
} from "@/lib/coach-store";
import { uid } from "@/lib/utils";

const OFFLINE = "Vous êtes hors ligne. Le carnet marche. Le coach répondra avec le réseau.";
const RATE = "Le coach souffle un peu. Réessayez dans une minute.";

export function CoachLayer() {
  const app = useApp();
  return (
    <>
      {app.coachOpen || app.tab === "home" ? null : (
        <button type="button" className="coach-fab" data-testid="coach-button" aria-label="Ouvrir le coach" onClick={() => app.setCoachOpen(true)}>
          <CoachFace />
        </button>
      )}
      {app.coachOpen ? <CoachSheet onClose={() => app.setCoachOpen(false)} /> : null}
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
  const [partial, setPartial] = useState("");
  const [face, setFace] = useState<"idle" | "thinking" | "speaking">("idle");
  const [online, setOnline] = useState(true);
  const [muted, setMuted] = useState(false);
  const [slow, setSlow] = useState(false);
  const [drag, setDrag] = useState(0);
  const [closing, setClosing] = useState(false);
  const [detail, setDetail] = useState(false);
  const [stuck, setStuck] = useState(true);
  const [logEdge, setLogEdge] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const turnsRef = useRef(turns);
  const partialRef = useRef("");
  const dragRef = useRef<{ y: number; t: number; dy: number } | null>(null);
  const lastHistory = useRef<StoredTurn[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  turnsRef.current = turns;
  partialRef.current = partial;

  useEffect(() => {
    setTurns(loadCoachChat());
    setReady(coachIsReady());
    setOnline(navigator.onLine);
    dialog.current?.focus();
  }, []);

  useEffect(() => {
    if (!stuck) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, error, busy, partial, stuck]);

  useEffect(() => {
    const y = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, y);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const readInset = (edge: "top" | "bottom") => {
      const probe = document.createElement("div");
      probe.style.cssText = `position:fixed;${edge}:0;height:env(safe-area-inset-${edge});pointer-events:none;visibility:hidden;`;
      document.body.appendChild(probe);
      const size = probe.offsetHeight;
      probe.remove();
      return size;
    };
    const topInset = readInset("top");
    const bottomInset = readInset("bottom");
    const apply = () => {
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const keyboard = Math.max(0, window.innerHeight - visibleHeight - visibleTop) > 80;
      const top = keyboard ? visibleTop + 6 : Math.max(visibleTop + 8, topInset + 8);
      const bottomPad = keyboard ? 0 : bottomInset;
      const height = Math.max(240, visibleTop + visibleHeight - top - bottomPad);
      root.style.setProperty("--sheet-top", `${top}px`);
      root.style.setProperty("--sheet-height", `${height}px`);
      root.style.setProperty("--compose-safe", keyboard ? "0px" : `${bottomInset}px`);
    };
    apply();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--sheet-top");
      root.style.removeProperty("--sheet-height");
      root.style.removeProperty("--compose-safe");
    };
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 20000);
    return () => window.clearTimeout(id);
  }, [busy]);

  const remember = (next: StoredTurn[]) => {
    const trimmed = next.slice(-40);
    turnsRef.current = trimmed;
    setTurns(trimmed);
    saveCoachChat(trimmed);
  };

  const close = () => {
    if (closing) return;
    setClosing(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onClose, reduce ? 120 : 280);
  };

  const sendText = async (text: string) => {
    if (!text || busy || !ready || muted) return;
    if (!navigator.onLine) {
      setError(OFFLINE);
      return;
    }
    setDraft("");
    if (field.current) field.current.style.height = "44px";
    setError("");
    let history = turnsRef.current;
    const pendingTurn = history.find((turn) => turn.pending);
    if (pendingTurn) {
      const ignored = (pendingTurn.toolCalls ?? []).map((call) => toolTurn(call.id, "Ignoré. Rien n’a été modifié."));
      history = [
        ...history.map((item) => (item.id === pendingTurn.id ? { ...item, pending: false } : item)),
        ...ignored,
        { id: uid(), role: "assistant" as const, content: "On garde le plan." },
      ];
      rememberCoachLine("Ignoré. On garde le plan.");
    }
    const next = [...history, { id: uid(), role: "user" as const, content: text }];
    remember(next);
    await complete(next);
  };

  const complete = async (history: StoredTurn[], depth = 0, sessions = app.sessions) => {
    if (depth > 3) return;
    setBusy(true);
    setPartial("");
    setFace("thinking");
    lastHistory.current = history;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const data = await requestCoachStream(
        {
          context: buildCoachContext(sessions, app.today, { focus: app.readSportFocus(), memoire: loadCoachMemo() }),
          messages: toApi(history),
        },
        (text) => {
          setPartial(text);
          setFace("speaking");
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const message = data.message as { content?: string; tool_calls?: ToolCall[] } | undefined;
      const calls = Array.isArray(message?.tool_calls) ? message.tool_calls.slice(0, 8) : [];
      const groups = partitionToolCalls(calls);
      const content = (message?.content || partialRef.current || (groups.writes.length ? "Voici ce que je propose." : "")).trim();
      const assistant: StoredTurn = {
        id: uid(),
        role: "assistant",
        content: content || (calls.length ? "" : "Le coach n’a rien répondu."),
        toolCalls: calls,
        pending: groups.writes.length > 0,
      };
      let next = [...history, assistant];
      setPartial("");
      if (!groups.writes.length && groups.reads.length) {
        const results = await Promise.all(groups.reads.map((call) => readCalendar(call)));
        next = [...next, ...results];
        remember(next);
        setBusy(false);
        setFace("idle");
        await complete(next, depth + 1, sessions);
        return;
      }
      if (!groups.writes.length && groups.unknown.length) {
        next = [...next, ...groups.unknown.map((call) => toolTurn(call.id, "Cette action n’existe pas."))];
      }
      remember(next);
    } catch (caught) {
      if (controller.signal.aborted) {
        if (partialRef.current) remember([...history, { id: uid(), role: "assistant", content: partialRef.current }]);
        setPartial("");
        return;
      }
      const message = caught instanceof Error ? caught.message : "Le coach n’a pas pu répondre.";
      const shown = presentError(message);
      setError(shown.text);
      if (shown.mute) {
        setMuted(true);
        window.setTimeout(() => setMuted(false), 60_000);
      }
    } finally {
      setBusy(false);
      setFace("idle");
      abortRef.current = null;
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
              await requestCoach("/calendar", prepared.body);
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
        for (const call of groups.writes) results.push(toolTurn(call.id, "Ignoré. Rien n’a été modifié."));
      }
      const cleared = turnsRef.current.map((item) => (item.id === turn.id ? { ...item, pending: false } : item));
      const note = apply ? "C’est noté." : "On garde le plan.";
      rememberCoachLine(apply ? lines.filter(Boolean).join(" · ") : "Ignoré. On garde le plan.");
      remember([...cleared, ...results, { id: uid(), role: "assistant" as const, content: note }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La modification n’a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  };

  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const el = scroller.current;
    const veil = scrim.current;
    if (!el) return;
    let startY = 0;
    let pulling = false;
    let pulled = 0;
    const onStart = (event: TouchEvent) => {
      startY = event.touches[0]?.clientY ?? 0;
      pulling = el.scrollTop <= 1;
    };
    const onMove = (event: TouchEvent) => {
      if (!pulling) return;
      const dy = (event.touches[0]?.clientY ?? startY) - startY;
      if (dy > 0 && el.scrollTop <= 1) {
        event.preventDefault();
        pulled = dy;
        setDrag(dy);
      } else {
        pulling = false;
        setDrag(0);
      }
    };
    const onEnd = () => {
      if (!pulling && pulled === 0) return;
      const dy = pulled;
      pulling = false;
      pulled = 0;
      setDrag(0);
      if (dy > 120) closeRef.current();
    };
    const block = (event: TouchEvent) => event.preventDefault();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    veil?.addEventListener("touchmove", block, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      veil?.removeEventListener("touchmove", block);
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { y: event.clientY, t: performance.now(), dy: 0 };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.dy = dy;
    if (dy > 0) setDrag(dy);
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    const dy = dragRef.current.dy;
    const dt = Math.max(1, performance.now() - dragRef.current.t);
    dragRef.current = null;
    if (dy > 0 && (dy > window.innerHeight / 3 || dy / dt > 0.8)) {
      close();
      return;
    }
    setDrag(0);
  };

  const onLogScroll = () => {
    const node = scroller.current;
    if (!node) return;
    setStuck(node.scrollHeight - node.scrollTop - node.clientHeight < 80);
    setLogEdge(Math.max(0, Math.min(1, node.scrollTop / 16)));
  };

  const chips = chipList(app.overlay, app.sessions);
  const visible = turns.filter((turn) => turn.role !== "tool");
  const lastId = visible.at(-1)?.id;
  const trailing = Boolean(partial) || (busy && !partial);
  const status = !online ? "Hors ligne" : busy ? "Écrit…" : "En ligne";

  return (
    <>
      <button ref={scrim} type="button" className={`coach-scrim${closing ? " out" : ""}`} data-testid="coach-scrim" aria-label="Fermer le coach" onClick={close} />
      <div
        className={`coach-bubble${drag > 0 ? " drag" : ""}${closing ? " out" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Coach"
        data-testid="coach-sheet"
        tabIndex={-1}
        ref={dialog}
        style={drag > 0 ? { transform: `translateY(${drag}px)` } : undefined}
      >
        <div className="coach-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <i />
        </div>
        <header className="coach-head">
          <CoachFace state={face} />
          <div className="coach-id">
            <strong>Coach</strong>
            <span>{status}</span>
          </div>
          <button type="button" className="coach-close" data-testid="coach-close" aria-label="Fermer" onClick={close}>
            <CloseMark />
          </button>
        </header>
        <div className="coach-log-wrap">
          <div className="coach-fade" aria-hidden="true" style={{ opacity: logEdge }} />
          <div className="coach-log" ref={scroller} onScroll={onLogScroll}>
            {!ready ? (
              <div className="coach-note" data-testid="coach-inactive">
                <h2>Le coach n’est pas encore activé.</h2>
                <p>
                  Dans Réglages, indiquez le code secret. L’adresse est déjà remplie. Tant que le code n’est pas enregistré, vous continuez à
                  noter vos séances normalement. Les suggestions de charge, avant une séance, marchent sans le coach.
                </p>
              </div>
            ) : null}
            {visible.map((turn, index) => {
              const prev = visible[index - 1];
              const next = visible[index + 1];
              const withPrev = prev?.role === turn.role;
              const withNext = next?.role === turn.role || (turn.role === "assistant" && trailing && index === visible.length - 1);
              const showFace = turn.role === "assistant" && !withNext;
              return (
                <div key={turn.id} className={`coach-msg ${turn.role}${withPrev ? " cont" : ""}${withNext ? " more" : ""}`}>
                  {turn.role === "assistant" ? <span className="coach-gutter">{showFace ? <CoachFace state="idle" /> : null}</span> : null}
                  <div className="coach-stack">
                    {turn.content ? (
                      <div className="coach-copy" aria-live={turn.id === lastId ? "polite" : undefined}>
                        <RichText text={turn.content} />
                      </div>
                    ) : null}
                    {turn.pending && turn.toolCalls?.length ? (
                      <ConfirmCard
                        turn={turn}
                        busy={busy}
                        open={detail}
                        onToggle={() => setDetail((value) => !value)}
                        onApply={() => void resolve(turn, true)}
                        onCancel={() => void resolve(turn, false)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
            {busy && !partial ? (
              <div className={`coach-msg assistant${visible.at(-1)?.role === "assistant" ? " cont" : ""}`} aria-live="polite">
                <span className="coach-gutter">
                  <CoachFace state="thinking" />
                </span>
                <p className="coach-dots" aria-label="Le coach réfléchit">
                  <i /><i /><i />
                </p>
              </div>
            ) : null}
            {partial ? (
              <div className={`coach-msg assistant${visible.at(-1)?.role === "assistant" ? " cont" : ""}`}>
                <span className="coach-gutter">
                  <CoachFace state="speaking" />
                </span>
                <div className="coach-copy" aria-live="polite">
                  <RichText text={partial} />
                </div>
              </div>
            ) : null}
            {slow && busy ? (
              <p className="coach-wait">
                Ça prend trop de temps.{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    abortRef.current?.abort();
                    const history = lastHistory.current;
                    if (history) void complete(history);
                  }}
                >
                  Réessayer
                </button>
              </p>
            ) : null}
            {error ? (
              <p className="err">
                {error}{" "}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    close();
                    app.setSheet("settings");
                  }}
                >
                  Ouvrir les réglages
                </button>
              </p>
            ) : null}
          </div>
          {stuck ? null : (
            <button
              type="button"
              className="coach-jump"
              aria-label="Aller en bas"
              onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}
            >
              <Arrow />
            </button>
          )}
        </div>
        {!online ? <p className="coach-offline" data-testid="coach-offline">{OFFLINE}</p> : null}
        {ready && chips.length ? (
          <div className="coach-chips-wrap">
            <div className="coach-chips">
              {chips.map((chip) => (
                <button key={chip} type="button" data-testid="coach-chip" disabled={busy || muted} onClick={() => void sendText(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <form
          className="coach-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void sendText(draft.trim());
          }}
        >
          <textarea
            ref={field}
            className="field"
            data-testid="coach-input"
            rows={1}
            value={draft}
            placeholder={ready ? "Écrire au coach" : "Le coach n’est pas activé"}
            disabled={!ready || busy || muted}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="send"
            onChange={(event) => {
              setDraft(event.target.value);
              const node = event.target;
              node.style.height = "auto";
              node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
            }}
          />
          {busy ? (
            <button type="button" className="coach-send" data-testid="coach-stop" aria-label="Arrêter" onClick={() => abortRef.current?.abort()}>
              <span className="stopmark" />
            </button>
          ) : (
            <button type="submit" className="coach-send" data-testid="coach-send" disabled={!ready || muted || !draft.trim()} aria-label="Envoyer">
              <Arrow />
            </button>
          )}
        </form>
      </div>
    </>
  );
}

function ConfirmCard({
  turn,
  busy,
  open,
  onToggle,
  onApply,
  onCancel,
}: {
  turn: StoredTurn;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const app = useApp();
  const described = (turn.toolCalls ?? []).filter((call) => call.name !== "list_events").map((call) => describeAction(call, app.sessions));
  const chef = described.some((item) => item.chefSport);
  const hidden = described.length > 3 && !open;
  const shown = hidden ? described.slice(0, 3) : described;
  return (
    <article className="coach-card" data-testid="coach-confirm">
      <h3>{changeTitle(described.length)}</h3>
      <ul>
        {shown.map((item, index) => (
          <li key={index}>{item.summary}</li>
        ))}
      </ul>
      {described.length > 3 ? (
        <button type="button" className="linkish" onClick={onToggle}>
          {open ? "Réduire" : "Voir le détail"}
        </button>
      ) : null}
      {chef ? <p className="fine">Chef sport en sera informé au prochain « Envoyer à Chef sport ».</p> : null}
      <div className="coach-actions">
        <button type="button" className="btn" data-testid="coach-apply" disabled={busy} onClick={onApply}>
          Tout accepter
        </button>
        <button type="button" className="btn ghost" data-testid="coach-cancel" disabled={busy} onClick={onCancel}>
          Ignorer
        </button>
      </div>
    </article>
  );
}

function changeTitle(count: number): string {
  if (count <= 1) return "Un changement";
  if (count === 2) return "Deux changements";
  return `${count} changements`;
}

function chipList(overlay: { kind: string; id?: string } | null, sessions: { id: string; cardio?: unknown }[]): string[] {
  if (overlay?.kind === "bilan") return ["Résume pour Chef sport"];
  if (overlay?.kind === "session" || overlay?.kind === "gesture") {
    const session = sessions.find((item) => item.id === overlay.id || ("sessionId" in overlay && item.id === (overlay as { sessionId?: string }).sessionId));
    if (session?.cardio) return ["Quelle allure ?", "Je coupe court"];
    return ["Cette charge me va", "Je suis fatigué", "Rappelle le conseil"];
  }
  return ["Adapter ma séance du jour", "Pourquoi cette charge ?", "J’ai une garde"];
}

function presentError(message: string): { text: string; mute: boolean } {
  if (/429|souffle/i.test(message)) return { text: RATE, mute: true };
  if (/401|accès refusé|code refusé/i.test(message)) return { text: "Le code secret est refusé.", mute: false };
  if (/hors ligne|failed to fetch|network|joignable/i.test(message)) return { text: OFFLINE, mute: false };
  return { text: coachErrorText(message), mute: false };
}

async function readCalendar(call: ToolCall): Promise<StoredTurn> {
  const prepared = calendarBodyForTool(call);
  if (!prepared.ok) return toolTurn(call.id, prepared.error);
  try {
    const data = await requestCoach("/calendar", prepared.body);
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
  const slice = turns.slice(-14);
  const start = slice.findIndex((turn) => turn.role === "user");
  const kept = start > 0 ? slice.slice(start) : slice;
  return kept.map((turn) => {
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

function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const listLike = lines.some((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line));
  if (!listLike) return <>{inlineNodes(text)}</>;
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items;
    const ordered = list.ordered;
    list = null;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length}>
        {items.map((item, index) => (
          <li key={index}>{inlineNodes(item)}</li>
        ))}
      </Tag>,
    );
  };
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (bullet || ordered) {
      const nextOrdered = Boolean(ordered);
      if (!list || list.ordered !== nextOrdered) flush();
      list = list ?? { ordered: nextOrdered, items: [] };
      list.items.push((bullet ?? ordered)?.[1] ?? "");
      continue;
    }
    flush();
    if (!line) {
      blocks.push(<br key={blocks.length} />);
      continue;
    }
    blocks.push(<span key={blocks.length}>{inlineNodes(line)}</span>);
    blocks.push(<br key={`b-${blocks.length}`} />);
  }
  flush();
  return <>{blocks}</>;
}

function inlineNodes(text: string): ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(<strong key={index++}>{match[1] || match[2]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CloseMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 14V4M9 4l-4 4M9 4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
