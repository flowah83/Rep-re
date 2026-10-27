export type ApplyStep = {
  scope: "phone" | "calendar";
  ok: boolean;
  conflict?: boolean;
};

export type ApplyKind = "ok" | "partial" | "conflict" | "failed" | "ignored";

export function settleApply(steps: ApplyStep[], applied: boolean): { kind: ApplyKind; headline: string } {
  if (!applied) return { kind: "ignored", headline: "On garde le plan." };
  if (steps.some((step) => step.conflict)) {
    return { kind: "conflict", headline: "Le calendrier a changé." };
  }
  const phoneOk = steps.some((step) => step.scope === "phone" && step.ok);
  const calendarFailed = steps.some((step) => step.scope === "calendar" && !step.ok);
  if (phoneOk && calendarFailed) return { kind: "partial", headline: "Une moitié a réussi." };
  if (steps.some((step) => !step.ok)) return { kind: "failed", headline: "Ça n’a pas été écrit." };
  return { kind: "ok", headline: "C’est noté." };
}

/** Même clé, même fichier. Un réessai ne crée pas un second événement. */
export function calendarObjectName(idempotencyKey: string): string {
  const safe = idempotencyKey.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  return safe || "seance";
}
