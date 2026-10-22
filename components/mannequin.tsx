"use client";

import type { Muscle, Pattern } from "@/lib/types";

type P = [number, number];

type Pose = {
  head: P;
  neck: P;
  chest: P;
  hip: P;
  shoulder: P;
  elbow: P;
  hand: P;
  knee: P;
  ankle: P;
  bar?: [P, P];
  bench?: boolean;
  pulley?: P;
};

const POSES: Record<Pattern, { move: string; lock: string; a: Pose; b: Pose }> = {
  hpush: {
    move: "Descente",
    lock: "Poussée",
    a: pose({ head: [300, 86], neck: [274, 96], chest: [214, 104], hip: [132, 112], shoulder: [236, 96], elbow: [236, 52], hand: [234, 28], knee: [78, 118], ankle: [34, 124], bar: [[196, 24], [274, 24]], bench: true }),
    b: pose({ head: [300, 86], neck: [274, 96], chest: [214, 104], hip: [132, 112], shoulder: [236, 96], elbow: [252, 132], hand: [228, 148], knee: [78, 118], ankle: [34, 124], bar: [[190, 154], [276, 150]], bench: true }),
  },
  hpull: {
    move: "Allonge",
    lock: "Tirage",
    a: pose({ head: [250, 70], neck: [228, 84], chest: [188, 108], hip: [120, 150], shoulder: [196, 96], elbow: [168, 124], hand: [150, 156], knee: [96, 188], ankle: [78, 226] }),
    b: pose({ head: [250, 78], neck: [228, 92], chest: [186, 118], hip: [118, 156], shoulder: [196, 108], elbow: [214, 150], hand: [236, 168], knee: [96, 190], ankle: [78, 226] }),
  },
  vpush: {
    move: "Descente",
    lock: "Poussée",
    a: pose({ head: [176, 78], neck: [176, 98], chest: [176, 124], hip: [176, 176], shoulder: [150, 112], elbow: [132, 78], hand: [150, 42], knee: [168, 214], ankle: [164, 248], bar: [[112, 36], [196, 36]] }),
    b: pose({ head: [176, 78], neck: [176, 98], chest: [176, 124], hip: [176, 176], shoulder: [150, 112], elbow: [118, 130], hand: [146, 156], knee: [168, 214], ankle: [164, 248], bar: [[108, 160], [196, 156]] }),
  },
  vpull: {
    move: "Montée",
    lock: "Tirage",
    a: pose({ head: [180, 86], neck: [180, 106], chest: [180, 132], hip: [180, 186], shoulder: [148, 118], elbow: [132, 92], hand: [150, 64], knee: [172, 220], ankle: [168, 250], pulley: [150, 18] }),
    b: pose({ head: [180, 86], neck: [180, 106], chest: [180, 132], hip: [180, 186], shoulder: [148, 118], elbow: [118, 150], hand: [150, 176], knee: [172, 220], ankle: [168, 250], pulley: [150, 18] }),
  },
  squat: {
    move: "Descente",
    lock: "Remontée",
    a: pose({ head: [180, 36], neck: [180, 56], chest: [180, 84], hip: [180, 138], shoulder: [154, 72], elbow: [132, 96], hand: [164, 64], knee: [176, 188], ankle: [172, 236], bar: [[118, 58], [214, 58]] }),
    b: pose({ head: [188, 78], neck: [184, 98], chest: [180, 122], hip: [168, 168], shoulder: [156, 110], elbow: [124, 128], hand: [160, 102], knee: [118, 196], ankle: [150, 238], bar: [[112, 96], [214, 96]] }),
  },
  hinge: {
    move: "Descente",
    lock: "Remontée",
    a: pose({ head: [196, 42], neck: [190, 62], chest: [184, 90], hip: [176, 142], shoulder: [168, 86], elbow: [176, 132], hand: [184, 176], knee: [168, 188], ankle: [164, 236], bar: [[150, 186], [230, 186]] }),
    b: pose({ head: [250, 108], neck: [228, 118], chest: [196, 132], hip: [150, 156], shoulder: [186, 124], elbow: [176, 160], hand: [168, 196], knee: [138, 196], ankle: [150, 236], bar: [[132, 204], [214, 204]] }),
  },
  lunge: {
    move: "Descente",
    lock: "Poussée",
    a: pose({ head: [150, 36], neck: [150, 56], chest: [150, 84], hip: [150, 136], shoulder: [176, 74], elbow: [196, 108], hand: [188, 142], knee: [132, 186], ankle: [128, 234] }),
    b: pose({ head: [156, 52], neck: [156, 72], chest: [156, 100], hip: [150, 150], shoulder: [182, 92], elbow: [202, 126], hand: [194, 158], knee: [168, 196], ankle: [196, 236] }),
  },
  curl: {
    move: "Descente",
    lock: "Montée",
    a: pose({ head: [180, 40], neck: [180, 60], chest: [180, 90], hip: [180, 146], shoulder: [150, 82], elbow: [146, 124], hand: [164, 100], knee: [176, 192], ankle: [174, 236] }),
    b: pose({ head: [180, 40], neck: [180, 60], chest: [180, 90], hip: [180, 146], shoulder: [150, 82], elbow: [146, 124], hand: [132, 156], knee: [176, 192], ankle: [174, 236] }),
  },
  tricep: {
    move: "Montée",
    lock: "Extension",
    a: pose({ head: [180, 42], neck: [180, 62], chest: [180, 92], hip: [180, 148], shoulder: [206, 84], elbow: [214, 122], hand: [214, 164], knee: [176, 194], ankle: [174, 236], pulley: [250, 20] }),
    b: pose({ head: [180, 42], neck: [180, 62], chest: [180, 92], hip: [180, 148], shoulder: [206, 84], elbow: [214, 122], hand: [188, 112], knee: [176, 194], ankle: [174, 236], pulley: [250, 20] }),
  },
  lateral: {
    move: "Descente",
    lock: "Montée",
    a: pose({ head: [180, 40], neck: [180, 60], chest: [180, 90], hip: [180, 146], shoulder: [150, 82], elbow: [112, 78], hand: [74, 74], knee: [176, 192], ankle: [174, 236] }),
    b: pose({ head: [180, 40], neck: [180, 60], chest: [180, 90], hip: [180, 146], shoulder: [150, 82], elbow: [132, 118], hand: [118, 154], knee: [176, 192], ankle: [174, 236] }),
  },
  calf: {
    move: "Descente",
    lock: "Montée",
    a: pose({ head: [180, 28], neck: [180, 48], chest: [180, 76], hip: [180, 128], shoulder: [154, 68], elbow: [140, 104], hand: [168, 92], knee: [176, 176], ankle: [176, 214] }),
    b: pose({ head: [180, 48], neck: [180, 68], chest: [180, 96], hip: [180, 148], shoulder: [154, 88], elbow: [140, 124], hand: [168, 112], knee: [176, 196], ankle: [176, 236] }),
  },
  core: {
    move: "Entrée",
    lock: "Tenu",
    a: pose({ head: [292, 118], neck: [266, 122], chest: [210, 126], hip: [140, 128], shoulder: [228, 122], elbow: [214, 146], hand: [188, 150], knee: [78, 130], ankle: [36, 132] }),
    b: pose({ head: [292, 112], neck: [266, 118], chest: [210, 122], hip: [140, 124], shoulder: [228, 118], elbow: [214, 140], hand: [188, 144], knee: [78, 126], ankle: [36, 128] }),
  },
};

function pose(value: Pose): Pose {
  return value;
}

function mid(a: P, b: P, t = 0.5): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function Mannequin({ pattern, muscles }: { pattern: Pattern; muscles: Muscle[] }) {
  const scene = POSES[pattern];
  const hot = new Set(muscles);
  return (
    <div className="stage" data-testid="mannequin">
      <div className="tools">
        <span className="loopchip">En boucle</span>
      </div>
      <div style={{ position: "relative", height: 236 }}>
        <Figure pose={scene.a} hot={hot} className="pose pose-a" />
        <Figure pose={scene.b} hot={hot} className="pose pose-b" />
      </div>
      <div className="phases">
        <span className="phase-move">{scene.move}</span>
        <span className="phase-lock">{scene.lock}</span>
      </div>
      <div className="play" aria-hidden="true">
        <i />
        <b />
      </div>
      <p className="caption">Les muscles en cuivre travaillent sur ce geste. La boucle dure huit secondes, sans son.</p>
    </div>
  );
}

function Figure({ pose, hot, className }: { pose: Pose; hot: Set<Muscle>; className: string }) {
  const torso = hot.has("pectoraux") || hot.has("abdos") || hot.has("dos");
  const arm = hot.has("biceps") || hot.has("triceps") || hot.has("epaules");
  const thigh = hot.has("quadriceps") || hot.has("ischios") || hot.has("fessiers");
  const calf = hot.has("mollets");
  const shoulder = hot.has("epaules") ? "fill-hot" : "fill-stone";
  return (
    <svg className={`mann ${className}`} viewBox="0 0 360 260" aria-hidden="true">
      {pose.bench ? <rect x="48" y="124" width="230" height="14" rx="5" className="fill-stone" opacity="0.45" /> : null}
      {pose.pulley ? <line x1={pose.pulley[0]} y1={pose.pulley[1]} x2={pose.hand[0]} y2={pose.hand[1]} className="prop" strokeWidth="2" /> : null}
      <Limb a={pose.hip} b={pose.knee} hot={thigh} width={20} />
      <Limb a={pose.knee} b={pose.ankle} hot={calf} width={14} />
      <Limb a={pose.neck} b={pose.hip} hot={torso} width={26} />
      <Limb a={pose.shoulder} b={pose.elbow} hot={arm} width={16} />
      <Limb a={pose.elbow} b={pose.hand} hot={arm} width={13} />
      <circle cx={pose.shoulder[0]} cy={pose.shoulder[1]} r="9" className={shoulder} />
      <circle cx={pose.head[0]} cy={pose.head[1]} r="16" className="fill-stone" />
      {pose.bar ? (
        <line x1={pose.bar[0][0]} y1={pose.bar[0][1]} x2={pose.bar[1][0]} y2={pose.bar[1][1]} className="prop" strokeWidth="4" strokeLinecap="round" />
      ) : (
        <circle cx={pose.hand[0]} cy={pose.hand[1]} r="5" className="fill-stone" />
      )}
      {hot.has("pectoraux") ? <Hot at={mid(pose.chest, pose.shoulder, 0.35)} rx={16} ry={10} /> : null}
      {hot.has("abdos") ? <Hot at={mid(pose.chest, pose.hip, 0.45)} rx={12} ry={16} /> : null}
      {hot.has("dos") ? <Hot at={mid(pose.chest, pose.hip, 0.25)} rx={14} ry={12} /> : null}
    </svg>
  );
}

function Limb({ a, b, hot, width }: { a: P; b: P; hot: boolean; width: number }) {
  return (
    <line
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      className={hot ? "hot" : "stone"}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

function Hot({ at, rx, ry }: { at: P; rx: number; ry: number }) {
  return <ellipse cx={at[0]} cy={at[1]} rx={rx} ry={ry} className="fill-hot" opacity="0.9" />;
}
