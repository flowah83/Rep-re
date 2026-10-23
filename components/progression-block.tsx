"use client";

import { useState } from "react";
import { adjustmentSummary, type Adjustment, type ProgressionRecord } from "@/lib/progression";
import { formatKg } from "@/lib/utils";

export function ProgressionSummary({
  record,
  asking,
  onRevertPlan,
  onKeep,
  onIgnore,
  onRevert,
  onAdjust,
}: {
  record: ProgressionRecord | null;
  asking: boolean;
  onRevertPlan: () => void;
  onKeep: () => void;
  onIgnore: () => void;
  onRevert: (exerciseId: string) => void;
  onAdjust: (exerciseId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!asking || !record || record.choice !== "pending" || record.items.length === 0) return null;
  if (record.mode === "hold") {
    return (
      <section className="progression-card" data-testid="progression">
        <h2>Le plan de reprise de Chef sport est gardé</h2>
        <p className="count">Les charges prévues restent celles du plan.</p>
        <button type="button" className="btn ghost" data-testid="progression-increases" onClick={() => setOpen((value) => !value)}>
          {open ? "Masquer les hausses" : "Voir les hausses possibles"}
        </button>
        <button type="button" className="detail-toggle" data-testid="progression-ignore" onClick={onIgnore}>
          Ignorer
        </button>
        {open ? <AdjustmentList items={record.items} onRevert={onRevert} onAdjust={onAdjust} applyLabel="Appliquer" /> : null}
      </section>
    );
  }
  const count = record.items.filter((item) => item.active).length;
  return (
    <section className="progression-card" data-testid="progression">
      <h2>Charges ajustées selon vos dernières performances</h2>
      <p className="count">{count > 0 ? adjustmentSummary(count) : "Toutes les charges sont revenues au plan."}</p>
      <div className="choice">
        <button type="button" className="btn" data-testid="progression-revert-plan" onClick={onRevertPlan}>
          Revenir au plan
        </button>
        <button type="button" className="btn ghost" data-testid="progression-keep" onClick={onKeep}>
          Garder
        </button>
      </div>
      <button type="button" className="detail-toggle" data-testid="progression-detail" onClick={() => setOpen((value) => !value)}>
        {open ? "Masquer le détail" : "Voir le détail"}
      </button>
      {open ? <AdjustmentList items={record.items} onRevert={onRevert} onAdjust={onAdjust} applyLabel="Ajuster" /> : null}
    </section>
  );
}

function AdjustmentList({
  items,
  onRevert,
  onAdjust,
  applyLabel,
}: {
  items: Adjustment[];
  onRevert: (exerciseId: string) => void;
  onAdjust: (exerciseId: string) => void;
  applyLabel: string;
}) {
  return (
    <ul className="progression-list">
      {items.map((item) => (
        <li key={item.exerciseId} data-testid="progression-suggestion">
          <b>{item.name}</b>
          <p className="shift num">{shiftLine(item)}</p>
          <p className="fine">{item.reason}</p>
          <button
            type="button"
            className="linkish"
            data-testid={item.active ? "progression-revert" : "progression-adjust"}
            onClick={() => (item.active ? onRevert(item.exerciseId) : onAdjust(item.exerciseId))}
          >
            {item.active ? "Revenir" : applyLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}

function shiftLine(item: Adjustment): string {
  const unit = item.unit === "kg/main" ? " kg/main" : item.unit === "kg/jambe" ? " kg/jambe" : " kg";
  if (item.fromLoadKg == null && item.toLoadKg == null) {
    return `${item.fromReps ?? "—"} → ${item.toReps ?? "—"} répétitions`;
  }
  const from = item.fromLoadKg == null ? "—" : `${formatKg(item.fromLoadKg)}${unit}`;
  const to = item.toLoadKg == null ? "—" : `${formatKg(item.toLoadKg)}${unit}`;
  return `${from} → ${to}`;
}
