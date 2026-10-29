"use client";

import type { E1Point } from "@/lib/calc";
import { formatKg, parseISODate } from "@/lib/utils";

const GAP_DAYS = 19;

export function BestSetChart({
  points,
  from,
  to,
  note,
}: {
  points: { date: string; loadKg: number; reps: number }[];
  from: string;
  to: string;
  note: string;
}) {
  const width = 360;
  const height = 168;
  const pad = { l: 36, r: 12, t: 16, b: 32 };
  if (points.length === 0) {
    return <p className="chartnote">Pas encore de série de travail sur cette période.</p>;
  }
  const values = points.map((point) => point.loadKg);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 8) {
    const mid = (max + min) / 2;
    min = mid - 4;
    max = mid + 4;
  }
  min = Math.max(0, min - 2);
  max += 2;
  const t0 = parseISODate(from).getTime();
  const t1 = Math.max(parseISODate(to).getTime(), t0 + 86400000);
  const xOf = (date: string) => pad.l + ((parseISODate(date).getTime() - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const yOf = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const ticks = [min, (min + max) / 2, max];
  const last = points[points.length - 1];
  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Meilleure série de chaque séance. Une séance plus légère n’est pas un recul.">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--line)" />
            <text x={0} y={yOf(tick) + 4} fill="var(--ink-soft)" fontSize="11">
              {formatKg(Math.round(tick))}
            </text>
          </g>
        ))}
        {points.slice(1).map((point, index) => {
          const prev = points[index];
          return (
            <line
              key={`${point.date}-${index}`}
              x1={xOf(prev.date)}
              y1={yOf(prev.loadKg)}
              x2={xOf(point.date)}
              y2={yOf(point.loadKg)}
              stroke="var(--copper-bright)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          );
        })}
        {points.map((point) => (
          <g key={point.date}>
            <circle cx={xOf(point.date)} cy={yOf(point.loadKg)} r={point === last ? 4.5 : 3} fill={point === last ? "var(--copper-bright)" : "var(--bg-elev)"} stroke="var(--copper-bright)" strokeWidth="2" />
            <text x={xOf(point.date)} y={yOf(point.loadKg) - 8} textAnchor="middle" fill="var(--ink-soft)" fontSize="11">
              {point === last || point.loadKg === Math.max(...values) ? `${formatKg(point.loadKg)} × ${point.reps}` : ""}
            </text>
          </g>
        ))}
        {[from, midDate(from, to), to].map((iso, index) => (
          <text
            key={iso + index}
            x={index === 0 ? pad.l : index === 2 ? width - pad.r : (pad.l + width - pad.r) / 2}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            fill="var(--ink-soft)"
            fontSize="11"
          >
            {axisDate(iso)}
          </text>
        ))}
      </svg>
      <p className="chartnote" data-testid="dip-note">{note}</p>
      <ul className="vh">
        {points.map((point) => (
          <li key={point.date}>
            {axisDate(point.date)} : {formatKg(point.loadKg)} kg × {point.reps}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function E1Chart({
  points,
  from,
  to,
}: {
  points: (E1Point & { synthetic?: boolean; gapDays?: number })[];
  from: string;
  to: string;
}) {
  const width = 360;
  const height = 168;
  const pad = { l: 36, r: 12, t: 12, b: 32 };
  if (points.length === 0) {
    return <p className="chartnote">Pas encore de série entre 1 et 10 répétitions pour tracer la courbe.</p>;
  }
  const values = points.map((point) => point.bestSoFar);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 8) {
    const mid = (max + min) / 2;
    min = mid - 4;
    max = mid + 4;
  }
  min = Math.max(0, min - 2);
  max += 2;
  const t0 = parseISODate(from).getTime();
  const t1 = Math.max(parseISODate(to).getTime(), t0 + 86400000);
  const xOf = (date: string) => pad.l + ((parseISODate(date).getTime() - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const yOf = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const ticks = [min, (min + max) / 2, max];
  const lastReal = [...points].reverse().find((point) => !point.synthetic);

  return (
    <div className="chartwrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe du record estimé">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--line)" />
            <text x={0} y={yOf(tick) + 4} fill="var(--ink-soft)" fontSize="11">
              {formatKg(Math.round(tick))}
            </text>
          </g>
        ))}
        {points.slice(1).map((point, index) => {
          const prev = points[index];
          const dotted = (point.gapDays ?? 0) >= GAP_DAYS;
          return (
            <line
              key={`${point.date}-${index}`}
              x1={xOf(prev.date)}
              y1={yOf(prev.bestSoFar)}
              x2={xOf(point.date)}
              y2={yOf(point.bestSoFar)}
              stroke="var(--copper-bright)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray={dotted ? "4 5" : undefined}
            />
          );
        })}
        {points
          .filter((point) => !point.synthetic)
          .map((point) => (
            <circle
              key={point.date}
              cx={xOf(point.date)}
              cy={yOf(point.bestSoFar)}
              r={point === lastReal ? 4.5 : 3}
              fill={point === lastReal ? "var(--copper-bright)" : "var(--bg-elev)"}
              stroke="var(--copper-bright)"
              strokeWidth="2"
            />
          ))}
        {[from, midDate(from, to), to].map((iso, index) => (
          <text
            key={iso + index}
            x={index === 0 ? pad.l : index === 2 ? width - pad.r : (pad.l + width - pad.r) / 2}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}
            fill="var(--ink-soft)"
            fontSize="11"
          >
            {axisDate(iso)}
          </text>
        ))}
      </svg>
      <p className="chartnote">
        {points.filter((point) => !point.synthetic).length < 2
          ? "Un seul point ne fait pas une tendance. La courbe suit le record tenu et ne baisse pas."
          : "Courbe de record : elle suit le meilleur niveau tenu. Une séance plus légère ne la fait pas descendre. Trait pointillé : plus de deux semaines sans ce mouvement."}
      </p>
      <ul className="vh">
        {points
          .filter((point) => !point.synthetic)
          .map((point) => (
            <li key={point.date}>
              {axisDate(point.date)} : record {formatKg(point.bestSoFar)} kg, estimation du jour {formatKg(point.dayEstimate)} kg
            </li>
          ))}
      </ul>
    </div>
  );
}

function midDate(from: string, to: string) {
  const t0 = parseISODate(from).getTime();
  const t1 = parseISODate(to).getTime();
  return new Date(t0 + (t1 - t0) / 2).toISOString().slice(0, 10);
}

function axisDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(parseISODate(iso)).replace(".", "");
}

export function heatFill(count: number): string {
  if (count <= 0) return "var(--heat-0)";
  if (count < 8) return "#E0C2A8";
  if (count < 12) return "#E0A67A";
  if (count < 16) return "#E08A4A";
  return "#F0B27A";
}

export function BodyMap({
  side,
  fill,
}: {
  side: "front" | "back";
  fill: (muscle: "epaules" | "pectoraux" | "abdos" | "biceps" | "triceps" | "dos" | "quadriceps" | "ischios" | "fessiers" | "mollets") => string;
}) {
  const skin = "var(--heat-0)";
  if (side === "front") {
    return (
      <svg viewBox="0 0 140 250" aria-hidden="true">
        <circle cx="70" cy="28" r="16" fill={skin} />
        <path d="M42 58 Q70 46 98 58 L94 76 Q70 68 46 76 Z" fill={fill("epaules")} />
        <path d="M48 74 Q70 70 92 74 L88 106 Q70 112 52 106 Z" fill={fill("pectoraux")} />
        <path d="M54 108 H86 L82 150 H58 Z" fill={fill("abdos")} />
        <path d="M42 60 L30 70 L26 118 L40 120 L46 74 Z" fill={fill("biceps")} />
        <path d="M98 60 L110 70 L114 118 L100 120 L94 74 Z" fill={fill("biceps")} />
        <path d="M26 118 L22 158 L36 160 L40 120 Z" fill={skin} />
        <path d="M114 118 L118 158 L104 160 L100 120 Z" fill={skin} />
        <path d="M56 150 L50 204 L66 206 L70 150 Z" fill={fill("quadriceps")} />
        <path d="M84 150 L90 204 L74 206 L70 150 Z" fill={fill("quadriceps")} />
        <path d="M50 208 L48 240 L64 240 L66 208 Z" fill={fill("mollets")} />
        <path d="M90 208 L92 240 L76 240 L74 208 Z" fill={fill("mollets")} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 140 250" aria-hidden="true">
      <circle cx="70" cy="28" r="16" fill={skin} />
      <path d="M44 56 Q70 48 96 56 L100 78 Q70 70 40 78 Z" fill={fill("epaules")} />
      <path d="M46 76 H94 L90 132 H50 Z" fill={fill("dos")} />
      <path d="M52 132 H88 L82 154 H58 Z" fill={fill("fessiers")} />
      <path d="M40 62 L28 74 L24 122 L38 120 L46 76 Z" fill={fill("triceps")} />
      <path d="M100 62 L112 74 L116 122 L102 120 L94 76 Z" fill={fill("triceps")} />
      <path d="M24 122 L20 160 L34 160 L38 122 Z" fill={skin} />
      <path d="M116 122 L120 160 L106 160 L102 122 Z" fill={skin} />
      <path d="M56 154 L50 206 L66 206 L70 156 Z" fill={fill("ischios")} />
      <path d="M84 154 L90 206 L74 206 L70 156 Z" fill={fill("ischios")} />
      <path d="M50 208 L48 240 L64 240 L66 208 Z" fill={fill("mollets")} />
      <path d="M90 208 L92 240 L76 240 L74 208 Z" fill={fill("mollets")} />
    </svg>
  );
}
