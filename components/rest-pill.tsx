"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app-context";
import type { Session } from "@/lib/types";

export function RestPill({ session, bare = false, chip = false }: { session: Session; bare?: boolean; chip?: boolean }) {
  const app = useApp();
  const [now, setNow] = useState(() => Date.now());
  const ends = session.restEndsAt ?? 0;
  useEffect(() => {
    if (!ends || ends <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [ends]);
  if (!ends || ends <= now) return null;
  const left = Math.max(0, Math.ceil((ends - now) / 1000));
  const label = `Repos ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (bare) return <span className="num">{label}</span>;
  if (chip) return <span className="restchip num" data-testid="rest-pill">{label}</span>;
  return (
    <button type="button" className="restpill" data-testid="rest-pill" onClick={() => app.openSession(session.id)}>
      <span className="num">{label}</span>
      <span>Reprendre</span>
    </button>
  );
}
