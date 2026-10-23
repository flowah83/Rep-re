import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  BoxGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  Matrix4,
  MathUtils,
  WebGLRenderer,
  Group,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/meshopt_decoder.module.js";

const started = performance.now();
const PULL_BAR_Y = 2.18;
const PULL_BAR_Z = 0.05;

const EX = {
  squat: {
    title: "Squat barre",
    primary: [4, 5],
    secondary: [8, 9],
    motor: "Quadriceps, fessiers",
    aide: "Ischio-jambiers, dos",
    cues: [
      "Les pieds bien à plat, les genoux suivent les orteils.",
      "Les hanches reculent, le buste se penche avec elles.",
      "La barre reste sur les trapèzes, le regard devant.",
    ],
    cam: { theta: 0.58, phi: 1.16, dist: 3.2, target: [0, 0.84, 0] },
  },
  bench: {
    title: "Développé couché",
    primary: [1],
    secondary: [2, 7],
    motor: "Pectoraux",
    aide: "Épaules, triceps",
    cues: [
      "Omoplates serrées, pieds ancrés au sol.",
      "La barre descend vers le bas des pectoraux.",
      "Les poignets restent droits, les coudes pas trop ouverts.",
    ],
    cam: { theta: 1.15, phi: 1.22, dist: 3.35, target: [0, 0.72, -0.55] },
  },
  pullup: {
    title: "Tractions",
    primary: [3],
    secondary: [6, 2],
    motor: "Dos",
    aide: "Biceps, épaules",
    cues: [
      "On part bras tendus, épaules loin des oreilles.",
      "On tire jusqu’à passer le menton au-dessus de la barre.",
      "La descente est plus lente que la montée.",
    ],
    cam: { theta: 0.7, phi: 1.18, dist: 3.55, target: [0, 1.35, 0.05] },
  },
};

const CLOCK = {
  squat: [
    { dur: 3.0, a: 0, b: 1, label: "Descente" },
    { dur: 0.85, a: 1, b: 1, label: "En bas" },
    { dur: 1.55, a: 1, b: 0, label: "Montée" },
    { dur: 1.1, a: 0, b: 0, label: "En haut" },
  ],
  bench: [
    { dur: 3.0, a: 0, b: 1, label: "Descente" },
    { dur: 0.85, a: 1, b: 1, label: "En bas" },
    { dur: 1.55, a: 1, b: 0, label: "Montée" },
    { dur: 1.1, a: 0, b: 0, label: "En haut" },
  ],
  pullup: [
    { dur: 1.45, a: 0, b: 1, label: "Montée" },
    { dur: 0.8, a: 1, b: 1, label: "En haut" },
    { dur: 2.9, a: 1, b: 0, label: "Descente" },
    { dur: 0.9, a: 0, b: 0, label: "Suspension" },
  ],
};

const canvas = document.getElementById("c");
const titleEl = document.getElementById("title");
const phaseEl = document.getElementById("phase");
const legendEl = document.getElementById("legend");
const cuesEl = document.getElementById("cues");
const hintEl = document.getElementById("hint");
const themeBtn = document.getElementById("theme");

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(location.search);
const debugMuscles = params.get("debug") === "1";

const scene = new Scene();
const camera = new PerspectiveCamera(30, 1, 0.08, 30);
const renderer = new WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const actor = new Group();
scene.add(actor);

const hemi = new HemisphereLight(0xf6f1ea, 0xc4b5a4, 0.55);
scene.add(hemi);
const key = new DirectionalLight(0xfff3e8, 3.3);
key.position.set(1.5, 4.4, 2.1);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.4;
key.shadow.camera.far = 12;
key.shadow.camera.left = -2.4;
key.shadow.camera.right = 2.4;
key.shadow.camera.top = 2.4;
key.shadow.camera.bottom = -2.4;
key.shadow.bias = -0.00018;
key.shadow.normalBias = 0.028;
scene.add(key);
scene.add(key.target);
const fill = new DirectionalLight(0xd5e0ea, 1.05);
fill.position.set(-2.4, 2.2, 1.4);
scene.add(fill);
const rim = new DirectionalLight(0xf0d0bc, 1.45);
rim.position.set(-0.6, 2.6, -2.6);
scene.add(rim);

const steel = new MeshStandardMaterial({ color: 0x8e949b, metalness: 0.86, roughness: 0.28 });
const steelDark = new MeshStandardMaterial({ color: 0x5c6168, metalness: 0.8, roughness: 0.4 });
const iron = new MeshStandardMaterial({ color: 0x2e3238, metalness: 0.72, roughness: 0.46 });
const padMat = new MeshStandardMaterial({ color: 0x3a342f, metalness: 0.02, roughness: 0.72 });
const groundMat = new MeshStandardMaterial({ color: 0xd5cdc2, metalness: 0, roughness: 1 });

function cylinderX(radius, length, material, segs) {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segs), material);
  mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function makeBarbell() {
  const group = new Group();
  group.add(cylinderX(0.014, 1.62, steel, 12));
  group.add(cylinderX(0.0155, 0.46, steelDark, 12));
  for (const side of [-1, 1]) {
    const inner = cylinderX(0.2, 0.03, iron, 18);
    inner.position.x = side * 0.5;
    const mid = cylinderX(0.2, 0.03, iron, 18);
    mid.position.x = side * 0.536;
    const outer = cylinderX(0.16, 0.024, iron, 16);
    outer.position.x = side * 0.572;
    group.add(inner, mid, outer);
  }
  return group;
}

const bar = makeBarbell();
scene.add(bar);

const squatRack = new Group();
for (const side of [-1, 1]) {
  const post = new Mesh(new BoxGeometry(0.055, 1.62, 0.055), steelDark);
  post.position.set(side * 0.82, 0.81, -0.32);
  post.castShadow = true;
  post.receiveShadow = true;
  squatRack.add(post);
}
scene.add(squatRack);

const benchRig = new Group();
const pad = new Mesh(new BoxGeometry(0.32, 0.07, 1.08), padMat);
pad.position.set(0, 0.46, -0.58);
pad.castShadow = true;
pad.receiveShadow = true;
benchRig.add(pad);
for (const x of [-0.12, 0.12]) {
  for (const z of [-1.0, -0.16]) {
    const leg = new Mesh(new BoxGeometry(0.04, 0.42, 0.04), steelDark);
    leg.position.set(x, 0.21, z);
    leg.castShadow = true;
    benchRig.add(leg);
  }
}
for (const side of [-1, 1]) {
  const post = new Mesh(new BoxGeometry(0.05, 1.15, 0.05), steelDark);
  post.position.set(side * 0.48, 0.78, -1.22);
  post.castShadow = true;
  benchRig.add(post);
}
scene.add(benchRig);

const pullRig = new Group();
for (const side of [-1, 1]) {
  const post = new Mesh(new BoxGeometry(0.05, 2.32, 0.05), steelDark);
  post.position.set(side * 0.58, 1.16, -0.22);
  post.castShadow = true;
  pullRig.add(post);
}
const pullBar = cylinderX(0.016, 1.28, steel, 12);
pullBar.position.set(0, PULL_BAR_Y, PULL_BAR_Z);
pullRig.add(pullBar);
const brace = new Mesh(new BoxGeometry(1.16, 0.04, 0.04), steelDark);
brace.position.set(0, 2.28, -0.22);
brace.castShadow = true;
pullRig.add(brace);
scene.add(pullRig);

const markerGeo = new SphereGeometry(0.035, 8, 6);
const markerHand = new Mesh(markerGeo, new MeshBasicMaterial({ color: 0xff2040 }));
const markerTarget = new Mesh(markerGeo, new MeshBasicMaterial({ color: 0xffe14a }));
const markerPole = new Mesh(markerGeo, new MeshBasicMaterial({ color: 0x3dff7a }));
markerHand.visible = markerTarget.visible = markerPole.visible = params.get("markers") === "1";
scene.add(markerHand, markerTarget, markerPole);

const ground = new Mesh(new CircleGeometry(1.8, 40), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const charRight = new Vector3();
const charUp = new Vector3();
const charForward = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const LOCAL_X = new Vector3(1, 0, 0);
const LOCAL_Y = new Vector3(0, 1, 0);

const tmp = {
  a: new Vector3(),
  b: new Vector3(),
  c: new Vector3(),
  d: new Vector3(),
  q1: new Quaternion(),
  q2: new Quaternion(),
  q3: new Quaternion(),
};
const ik = {
  upperPos: new Vector3(),
  midPos: new Vector3(),
  endPos: new Vector3(),
  toTarget: new Vector3(),
  poleDir: new Vector3(),
  axis: new Vector3(),
  upperDir: new Vector3(),
  lowerDir: new Vector3(),
  mid2: new Vector3(),
};
const aim = {
  parentQ: new Quaternion(),
  dir: new Vector3(),
  x: new Vector3(),
  z: new Vector3(),
  basis: new Matrix4(),
  worldQ: new Quaternion(),
};

let theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
let exercise = "squat";
let bodyMesh = null;
let shortsMesh = null;
let skeleton = null;
const bones = {};
const bindLocal = new Map();
const bindPos = {};
const footBindQ = {};
let armLen = 0.5;
let shoulderBindY = 1.34;
const muscleIds = { body: null, shorts: null };
const shaderBags = [];
let scapula = null;

function distSeg(px, py, pz, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  let t = ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + abx * t;
  const y = a.y + aby * t;
  const z = a.z + abz * t;
  return { d: Math.hypot(px - x, py - y, pz - z), t, x, y, z };
}

function muscleAt(x, y, z) {
  const ax = Math.abs(x);
  const side = x >= 0 ? "l" : "r";
  const ua = bindPos["upperarm_" + side];
  const la = bindPos["lowerarm_" + side];
  const ha = bindPos["hand_" + side];
  const th = bindPos["thigh_" + side];
  const ca = bindPos["calf_" + side];
  const ft = bindPos["foot_" + side];
  const arm = distSeg(x, y, z, ua, la);
  const fore = distSeg(x, y, z, la, ha);
  const thigh = distSeg(x, y, z, th, ca);
  const shin = distSeg(x, y, z, ca, ft);
  if (y > 1.52 || (y > 1.46 && ax < 0.11)) return 0;
  if (fore.d < 0.06 && fore.t > 0.62) return 0;
  if (y < 0.08) return 0;
  if (y > 0.76 && y < 1.0 && ax > 0.02 && ax < 0.17 && z < -0.03) return 5;
  if (shin.d < 0.075 && shin.t > 0.15 && shin.t < 0.85 && z < shin.z - 0.004) return 11;
  if (thigh.d < 0.115 && thigh.t > 0.08 && thigh.t < 0.92 && z > thigh.z - 0.012 && y < 0.92 && y > 0.42) return 4;
  if (thigh.d < 0.105 && thigh.t > 0.12 && thigh.t < 0.9 && z < thigh.z - 0.004 && y < 0.9) return 8;
  if (y > 1.14 && y < 1.4 && ax > 0.015 && ax < 0.16 && z > 0.045) return 1;
  if (Math.hypot(x - ua.x, y - ua.y, z - ua.z) < 0.085 && y > 1.24 && z < 0.08) return 2;
  if (arm.d < 0.06 && arm.t > 0.18 && arm.t < 0.92 && z > arm.z) return 6;
  if (arm.d < 0.06 && arm.t > 0.12 && arm.t < 0.95 && z < arm.z + 0.004) return 7;
  if (y > 0.98 && y < 1.36 && ax > 0.06 && ax < 0.22 && z < 0.02 && arm.d > 0.05) return 3;
  if (ax < 0.07 && z < -0.015 && y > 0.95 && y < 1.46) return 9;
  if (ax < 0.09 && z > 0.04 && y > 0.97 && y < 1.16) return 10;
  return 0;
}

function hookMaterial(material, cacheKey) {
  const bag = {};
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBase = { value: new Color("#c6b3a2") };
    shader.uniforms.uCopper = { value: new Color("#c4622d") };
    shader.uniforms.uPrimMix = { value: 0.78 };
    shader.uniforms.uSecMix = { value: 0.4 };
    shader.uniforms.uPrimGlow = { value: 0.16 };
    shader.uniforms.uSecGlow = { value: 0.05 };
    shader.uniforms.uDebug = { value: debugMuscles ? 1 : 0 };
    Object.assign(bag, shader.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aRole;\nattribute float aId;\nvarying float vRole;\nvarying float vId;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRole = aRole;\nvId = aId;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vRole;
varying float vId;
uniform vec3 uBase;
uniform vec3 uCopper;
uniform float uPrimMix;
uniform float uSecMix;
uniform float uPrimGlow;
uniform float uSecGlow;
uniform float uDebug;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
float prim = 1.0 - min(abs(vRole - 1.0), 1.0);
float sec = 1.0 - min(abs(vRole - 2.0), 1.0);
if (uDebug > 0.5) {
  float h = fract(sin(vId * 12.9898) * 43758.5453);
  diffuseColor.rgb = vec3(fract(h + 0.17), fract(h * 1.7 + 0.33), fract(h * 2.9 + 0.55));
} else {
  diffuseColor.rgb = mix(uBase, uCopper, prim * uPrimMix + sec * uSecMix);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
float primE = 1.0 - min(abs(vRole - 1.0), 1.0);
float secE = 1.0 - min(abs(vRole - 2.0), 1.0);
if (uDebug < 0.5) totalEmissiveRadiance += uCopper * (primE * uPrimGlow + secE * uSecGlow);`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
  shaderBags.push(bag);
  return bag;
}

const skinMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 });
const clothMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
const skinBag = hookMaterial(skinMat, "repere-skin-v2");
const clothBag = hookMaterial(clothMat, "repere-cloth-v2");

function paintRoles(geometry, ids) {
  const spec = EX[exercise];
  const role = geometry.attributes.aRole;
  const primary = new Set(spec.primary);
  const secondary = new Set(spec.secondary);
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    role.setX(i, primary.has(id) ? 1 : secondary.has(id) ? 2 : 0);
  }
  role.needsUpdate = true;
}

function applyTheme() {
  const dark = theme === "dark";
  const skin = dark ? "#9a8d82" : "#c6b3a2";
  const copper = dark ? "#e8925a" : "#c4622d";
  const cloth = dark ? "#2c3036" : "#34383e";
  if (skinBag.uBase) {
    skinBag.uBase.value.set(skin);
    skinBag.uCopper.value.set(copper);
    skinBag.uPrimMix.value = dark ? 0.7 : 0.78;
    skinBag.uSecMix.value = dark ? 0.38 : 0.42;
    skinBag.uPrimGlow.value = dark ? 0.28 : 0.14;
    skinBag.uSecGlow.value = dark ? 0.08 : 0.04;
  }
  if (clothBag.uBase) {
    clothBag.uBase.value.set(cloth);
    clothBag.uCopper.value.set(copper);
    clothBag.uPrimMix.value = dark ? 0.62 : 0.7;
    clothBag.uSecMix.value = 0.28;
    clothBag.uPrimGlow.value = dark ? 0.16 : 0.06;
    clothBag.uSecGlow.value = 0.02;
  }
  groundMat.color.set(dark ? "#16181d" : "#d5cdc2");
  hemi.color.set(dark ? "#8e97a6" : "#f6f1ea");
  hemi.groundColor.set(dark ? "#2a241e" : "#c4b5a4");
  hemi.intensity = dark ? 0.38 : 0.55;
  key.intensity = dark ? 2.5 : 3.3;
  fill.intensity = dark ? 0.7 : 1.05;
  rim.intensity = dark ? 1.15 : 1.45;
  renderer.toneMappingExposure = dark ? 0.94 : 1.06;
}

function updateCopy() {
  const spec = EX[exercise];
  titleEl.textContent = spec.title;
  legendEl.innerHTML = `<p><i class="dot primary"></i><span><b>Moteur.</b> ${spec.motor}</span></p><p><i class="dot secondary"></i><span><b>Aide.</b> ${spec.aide}</span></p>`;
  cuesEl.innerHTML = spec.cues.map((cue) => `<li>${cue}</li>`).join("");
  canvas.setAttribute(
    "aria-label",
    `${spec.title}. Corps en boucle, muscles moteurs en cuivre. Glissez pour tourner.`,
  );
  document.querySelectorAll(".switch button").forEach((button) => {
    button.setAttribute("aria-selected", button.dataset.ex === exercise ? "true" : "false");
  });
  hintEl.textContent = reduced
    ? "Mouvement réduit. Glissez pour tourner. La pose montrée est celle à lire."
    : "Glissez pour tourner. La boucle dure environ 6,5 secondes, sans son.";
}

function showGear() {
  squatRack.visible = exercise === "squat";
  benchRig.visible = exercise === "bench";
  pullRig.visible = exercise === "pullup";
  bar.visible = exercise !== "pullup";
}

function updateAxes() {
  actor.updateMatrixWorld(true);
  charRight.set(1, 0, 0).transformDirection(actor.matrixWorld);
  charUp.set(0, 1, 0).transformDirection(actor.matrixWorld);
  charForward.set(0, 0, 1).transformDirection(actor.matrixWorld);
}

function resetBones() {
  for (const bone of skeleton.bones) {
    const saved = bindLocal.get(bone.name);
    bone.position.copy(saved.p);
    bone.quaternion.copy(saved.q);
  }
}

function movePelvis(dx, dy, dz) {
  const saved = bindLocal.get("pelvis").p;
  bones.pelvis.position.set(saved.x + dx, saved.y - dz, saved.z + dy);
}

function addWorldRotation(bone, axis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.updateMatrix();
  bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
  tmp.q1.setFromRotationMatrix(bone.parent.matrixWorld);
  tmp.q2.setFromRotationMatrix(bone.matrixWorld);
  tmp.q3.setFromAxisAngle(axis, angle);
  tmp.q2.premultiply(tmp.q3);
  bone.quaternion.copy(tmp.q1.invert()).multiply(tmp.q2);
}

function rotLocalX(bone, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  tmp.q3.setFromAxisAngle(LOCAL_X, angle);
  bone.quaternion.multiply(tmp.q3);
}

function aimBone(bone, dirWorld, hingeWorld) {
  bone.parent.updateWorldMatrix(true, false);
  aim.parentQ.setFromRotationMatrix(bone.parent.matrixWorld).invert();
  aim.dir.copy(dirWorld).normalize();
  aim.x.copy(hingeWorld);
  aim.x.addScaledVector(aim.dir, -aim.x.dot(aim.dir));
  if (aim.x.lengthSq() < 1e-8) aim.x.set(1, 0, 0);
  else aim.x.normalize();
  aim.z.crossVectors(aim.x, aim.dir).normalize();
  aim.x.crossVectors(aim.dir, aim.z).normalize();
  aim.basis.makeBasis(aim.x, aim.dir, aim.z);
  aim.worldQ.setFromRotationMatrix(aim.basis);
  bone.quaternion.copy(aim.parentQ).multiply(aim.worldQ);
}

function solveLimb(upper, lower, end, target, pole) {
  upper.updateWorldMatrix(true, true);
  ik.upperPos.setFromMatrixPosition(upper.matrixWorld);
  ik.midPos.setFromMatrixPosition(lower.matrixWorld);
  ik.endPos.setFromMatrixPosition(end.matrixWorld);
  const lenA = Math.max(0.02, ik.upperPos.distanceTo(ik.midPos));
  const lenB = Math.max(0.02, ik.midPos.distanceTo(ik.endPos));
  ik.toTarget.copy(target).sub(ik.upperPos);
  const raw = ik.toTarget.length();
  if (raw < 1e-5) return;
  ik.toTarget.multiplyScalar(1 / raw);
  const dist = MathUtils.clamp(raw, Math.abs(lenA - lenB) + 0.001, lenA + lenB - 0.001);
  const shoulder = Math.acos(
    MathUtils.clamp((lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist), -1, 1),
  );
  ik.poleDir.copy(pole).sub(ik.upperPos);
  ik.axis.crossVectors(ik.toTarget, ik.poleDir);
  if (ik.axis.lengthSq() < 1e-8) ik.axis.copy(charRight);
  ik.axis.normalize();
  ik.upperDir.copy(ik.toTarget).applyAxisAngle(ik.axis, shoulder);
  aimBone(upper, ik.upperDir, ik.axis);
  upper.updateWorldMatrix(true, true);
  ik.mid2.setFromMatrixPosition(lower.matrixWorld);
  ik.lowerDir.copy(target).sub(ik.mid2);
  if (ik.lowerDir.lengthSq() < 1e-8) ik.lowerDir.copy(ik.upperDir);
  else ik.lowerDir.normalize();
  aimBone(lower, ik.lowerDir, ik.axis);
}

function setWorldQuaternion(bone, worldQ) {
  bone.parent.updateWorldMatrix(true, false);
  aim.parentQ.setFromRotationMatrix(bone.parent.matrixWorld).invert();
  bone.quaternion.copy(aim.parentQ).multiply(worldQ);
}

function plantFoot(bone, yaw) {
  tmp.q3.setFromAxisAngle(WORLD_UP, yaw);
  tmp.q2.copy(footBindQ[bone.name]).premultiply(tmp.q3);
  setWorldQuaternion(bone, tmp.q2);
}

function worldPos(bone, out) {
  bone.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(bone.matrixWorld);
}

function curlFingers(side, amount) {
  for (const name of ["index", "middle", "ring", "pinky"]) {
    rotLocalX(bones[`${name}_01_${side}`], 0.9 * amount);
    rotLocalX(bones[`${name}_02_${side}`], 1.15 * amount);
    rotLocalX(bones[`${name}_03_${side}`], 0.75 * amount);
  }
  rotLocalX(bones[`thumb_01_${side}`], 0.4 * amount);
  rotLocalX(bones[`thumb_02_${side}`], 0.55 * amount);
  rotLocalX(bones[`thumb_03_${side}`], 0.35 * amount);
}

function scapulaRotate(side, action, amount) {
  const info = scapula[side][action];
  tmp.a.copy(info.axis).transformDirection(actor.matrixWorld);
  addWorldRotation(bones[`clavicle_${side}`], tmp.a, info.sign * amount);
}

function calibrateScapula() {
  resetBones();
  actor.position.set(0, 0, 0);
  actor.rotation.set(0, 0, 0);
  updateAxes();
  const axes = [
    new Vector3(1, 0, 0),
    new Vector3(0, 1, 0),
    new Vector3(0, 0, 1),
  ];
  const result = { l: {}, r: {} };
  for (const side of ["l", "r"]) {
    const sign = side === "l" ? 1 : -1;
    const goals = {
      depress: new Vector3(0, -1, 0),
      retract: new Vector3(-sign * 0.25, -0.15, -1).normalize(),
    };
    for (const action of Object.keys(goals)) {
      const clav = bones[`clavicle_${side}`];
      const shoulder = bones[`upperarm_${side}`];
      const origin = worldPos(clav, tmp.a).clone();
      const before = worldPos(shoulder, tmp.b).clone().sub(origin);
      let bestScore = -Infinity;
      let best = { axis: axes[0], sign: 1 };
      const saved = clav.quaternion.clone();
      for (const axis of axes) {
        for (const spin of [1, -1]) {
          clav.quaternion.copy(saved);
          addWorldRotation(clav, axis, spin * 0.25);
          const after = worldPos(shoulder, tmp.c).clone().sub(origin);
          const score = after.sub(before).dot(goals[action]);
          if (score > bestScore) {
            bestScore = score;
            best = { axis: axis.clone(), sign: spin };
          }
        }
      }
      clav.quaternion.copy(saved);
      result[side][action] = best;
    }
  }
  resetBones();
  return result;
}

function placeActor(k) {
  if (exercise === "bench") {
    actor.rotation.set(-Math.PI / 2, 0, 0);
    actor.position.set(0, 0.6, 0.02);
    return;
  }
  if (exercise === "pullup") {
    const gripY = PULL_BAR_Y - 0.02;
    const hangY = gripY - armLen * 0.985 - shoulderBindY;
    actor.position.set(0, hangY + k * 0.43, 0);
    actor.rotation.set(-0.14 * k, 0, 0);
    return;
  }
  actor.position.set(0, 0, 0);
  actor.rotation.set(0, 0, 0);
}

function poseBody(k, now) {
  const breath = reduced ? 0 : Math.sin(now * 0.00135) * 0.016;
  const settle = reduced ? 0 : Math.sin(now * 0.0007 + 0.6) * 0.008;
  if (exercise === "squat") {
    movePelvis(0, -0.43 * k, -0.17 * k);
    addWorldRotation(bones.pelvis, charRight, 0.12 * k);
    addWorldRotation(bones.spine_01, charRight, 0.2 * k + breath * 0.45);
    addWorldRotation(bones.spine_02, charRight, 0.12 * k + breath);
    addWorldRotation(bones.spine_03, charRight, 0.06 * k + breath * 0.55 + settle);
    addWorldRotation(bones.neck_01, charRight, -0.22 * k);
    addWorldRotation(bones.head, charRight, -0.2 * k);
  } else if (exercise === "bench") {
    addWorldRotation(bones.spine_01, charRight, -0.05);
    addWorldRotation(bones.spine_02, charRight, -0.04 + breath * 0.7);
    addWorldRotation(bones.spine_03, charRight, breath * 0.4);
    scapulaRotate("l", "retract", 0.42);
    scapulaRotate("r", "retract", 0.42);
    scapulaRotate("l", "depress", 0.12);
    scapulaRotate("r", "depress", 0.12);
    addWorldRotation(bones.head, charRight, 0.08);
  } else {
    const depress = 0.38 - 0.12 * k;
    scapulaRotate("l", "depress", depress);
    scapulaRotate("r", "depress", depress);
    scapulaRotate("l", "retract", 0.18 * k);
    scapulaRotate("r", "retract", 0.18 * k);
    addWorldRotation(bones.spine_01, charRight, -0.16 * k + breath * 0.35);
    addWorldRotation(bones.spine_02, charRight, -0.08 * k + breath);
    addWorldRotation(bones.head, charRight, 0.12 * k);
  }
}

const work = {
  bar: new Vector3(),
  neck: new Vector3(),
  left: new Vector3(),
  right: new Vector3(),
  mid: new Vector3(),
  top: new Vector3(),
  bottom: new Vector3(),
  hand: new Vector3(),
  elbow: new Vector3(),
  foot: new Vector3(),
  knee: new Vector3(),
  hip: new Vector3(),
  shoulder: new Vector3(),
};

function poseLimbs(k) {
  const grip = params.has("grip") ? Number(params.get("grip")) : 1;
  if (exercise === "squat") {
    worldPos(bones.neck_01, work.neck);
    work.bar.copy(work.neck).addScaledVector(charUp, -0.015).addScaledVector(charForward, -0.055);
    work.bar.x = 0;
    work.bar.z = work.bar.z * 0.72 + 0.02 * 0.28;
    bar.position.copy(work.bar);
    bar.quaternion.identity();
    for (const side of ["l", "r"]) {
      const sign = side === "l" ? 1 : -1;
      const foot = bindPos["foot_" + side];
      work.foot.copy(foot);
      work.knee.set(foot.x + sign * 0.14, 0.5, foot.z + 0.4);
      solveLimb(bones["thigh_" + side], bones["calf_" + side], bones["foot_" + side], work.foot, work.knee);
      plantFoot(bones["foot_" + side], sign * 0.18);
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.32).addScaledVector(charUp, -0.02);
      work.elbow.copy(work.hand).addScaledVector(charForward, 0.22).addScaledVector(charUp, -0.38).addScaledVector(charRight, sign * 0.12);
      solveLimb(bones["upperarm_" + side], bones["lowerarm_" + side], bones["hand_" + side], work.hand, work.elbow);
      curlFingers(side, grip);
      if (side === "l") {
        worldPos(bones.hand_l, markerHand.position);
        markerTarget.position.copy(work.hand);
        markerPole.position.copy(work.elbow);
      }
    }
    return;
  }
  if (exercise === "bench") {
    worldPos(bones.upperarm_l, work.left);
    worldPos(bones.upperarm_r, work.right);
    work.mid.copy(work.left).add(work.right).multiplyScalar(0.5);
    work.top.copy(work.mid).addScaledVector(charForward, armLen * 0.96).addScaledVector(charUp, 0.02);
    work.bottom.copy(work.mid).addScaledVector(charForward, 0.11).addScaledVector(charUp, -0.09);
    work.bar.copy(work.top).lerp(work.bottom, k);
    work.bar.addScaledVector(charUp, Math.sin(k * Math.PI) * 0.025);
    bar.position.copy(work.bar);
    bar.quaternion.identity();
    for (const side of ["l", "r"]) {
      const sign = side === "l" ? 1 : -1;
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.22).addScaledVector(charForward, -0.012);
      work.elbow.copy(side === "l" ? work.left : work.right)
        .addScaledVector(charRight, sign * 0.2)
        .addScaledVector(charForward, -0.28)
        .addScaledVector(charUp, -0.08);
      solveLimb(bones["upperarm_" + side], bones["lowerarm_" + side], bones["hand_" + side], work.hand, work.elbow);
      curlFingers(side, grip);
      worldPos(bones.pelvis, work.hip);
      work.foot.set(sign * 0.17, 0.07, work.hip.z + 0.62);
      work.knee.set(sign * 0.22, 0.48, work.hip.z + 0.28);
      solveLimb(bones["thigh_" + side], bones["calf_" + side], bones["foot_" + side], work.foot, work.knee);
      plantFoot(bones["foot_" + side], sign * 0.1);
    }
    return;
  }
  for (const side of ["l", "r"]) {
    const sign = side === "l" ? 1 : -1;
    work.hand.set(sign * 0.24, PULL_BAR_Y - 0.018, PULL_BAR_Z);
    worldPos(bones["upperarm_" + side], work.shoulder);
    work.elbow.copy(work.shoulder).addScaledVector(charForward, 0.38).addScaledVector(charUp, -0.42).addScaledVector(charRight, sign * 0.04);
    solveLimb(bones["upperarm_" + side], bones["lowerarm_" + side], bones["hand_" + side], work.hand, work.elbow);
    curlFingers(side, grip);
    worldPos(bones.pelvis, work.hip);
    work.foot.set(work.hip.x + sign * 0.03, work.hip.y - 0.7, work.hip.z + 0.06);
    work.knee.set(work.foot.x + sign * 0.02, work.foot.y + 0.25, work.foot.z + 0.28);
    solveLimb(bones["thigh_" + side], bones["calf_" + side], bones["foot_" + side], work.foot, work.knee);
  }
}

function smoother(value) {
  const x = Math.min(1, Math.max(0, value));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function sampleClock(now, name) {
  const seq = CLOCK[name];
  const total = seq.reduce((sum, part) => sum + part.dur, 0);
  let t = ((now / 1000) % total + total) % total;
  for (const part of seq) {
    if (t <= part.dur) {
      const u = part.dur === 0 ? 1 : t / part.dur;
      return { k: part.a + (part.b - part.a) * smoother(u), label: part.label };
    }
    t -= part.dur;
  }
  return { k: 0, label: seq[0].label };
}

let theta = EX.squat.cam.theta;
let phi = EX.squat.cam.phi;
let dist = EX.squat.cam.dist;
const lookTarget = new Vector3(0, 0.84, 0);
const lookFrom = new Vector3();
const lookTo = new Vector3();
let camLerp = 1;
let camFrom = { theta, phi, dist };
let camTo = { ...EX.squat.cam };
let vTheta = 0;
let vPhi = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let phaseLabel = "";

function updateCamera() {
  camera.position.setFromSphericalCoords(dist, phi, theta).add(lookTarget);
  camera.lookAt(lookTarget);
  key.target.position.set(lookTarget.x, lookTarget.y, lookTarget.z);
}

function resize() {
  const width = canvas.clientWidth || 358;
  const height = canvas.clientHeight || 472;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  if (window.__audit) window.__audit.pixelRatio = renderer.getPixelRatio();
}

function setExercise(next, instant = false) {
  if (!EX[next]) return;
  exercise = next;
  audit.exercise = next;
  const cam = EX[next].cam;
  camTo = cam;
  lookTo.set(cam.target[0], cam.target[1], cam.target[2]);
  if (instant) {
    theta = cam.theta;
    phi = cam.phi;
    dist = cam.dist;
    lookTarget.copy(lookTo);
    camLerp = 1;
  } else {
    camFrom = { theta, phi, dist };
    lookFrom.copy(lookTarget);
    camLerp = 0;
  }
  vTheta = 0;
  vPhi = 0;
  if (bodyMesh) {
    paintRoles(bodyMesh.geometry, muscleIds.body);
    if (shortsMesh) paintRoles(shortsMesh.geometry, muscleIds.shorts);
  }
  showGear();
  updateCopy();
}

function setTheme(next) {
  theme = next === "dark" ? "dark" : "light";
  audit.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme !== "dark");
  try {
    localStorage.setItem("proto-theme", theme);
  } catch (error) {
    /* ignore */
  }
  applyTheme();
}

const audit = {
  ready: false,
  firstFrameMs: null,
  triangles: 0,
  calls: 0,
  pixelRatio: 1,
  fps: 0,
  dragFps: 0,
  dragging: false,
  dragSamples: [],
  contextLost: 0,
  exercise: "squat",
  theme,
  glbBytes: 0,
};
window.__audit = audit;
window.__audit.setExercise = setExercise;
window.__audit.setTheme = setTheme;
window.__audit.poseAt = (k) => {
  audit.frozenK = k;
};

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  audit.contextLost += 1;
});

document.querySelectorAll(".switch button").forEach((button) => {
  button.addEventListener("click", () => setExercise(button.dataset.ex));
});
themeBtn.addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"));

canvas.addEventListener("pointerdown", (event) => {
  dragging = true;
  audit.dragging = true;
  audit.dragSamples = [];
  lastX = event.clientX;
  lastY = event.clientY;
  camLerp = 1;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastX;
  const dy = event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;
  theta -= dx * 0.01;
  phi = MathUtils.clamp(phi + dy * 0.008, 0.55, 1.65);
  vTheta = -dx * 0.01;
  vPhi = dy * 0.008;
});
function endDrag() {
  dragging = false;
  audit.dragging = false;
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function buildShorts(mesh) {
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const nrm = src.attributes.normal;
  const idx = src.index;
  const si = src.attributes.skinIndex;
  const sw = src.attributes.skinWeight;
  const map = new Map();
  const positions = [];
  const normals = [];
  const ids = [];
  const skinI = [];
  const skinW = [];
  function take(vertex) {
    const y = pos.getY(vertex);
    const x = pos.getX(vertex);
    const z = pos.getZ(vertex);
    if (y < 0.73 || y > 0.995 || Math.abs(x) > 0.23) return -1;
    const known = map.get(vertex);
    if (known != null) return known;
    const id = positions.length / 3;
    map.set(vertex, id);
    const nx = nrm.getX(vertex);
    const ny = nrm.getY(vertex);
    const nz = nrm.getZ(vertex);
    const lift = 0.008;
    positions.push(x + nx * lift, y + ny * lift, z + nz * lift);
    normals.push(nx, ny, nz);
    ids.push(muscleAt(x, y, z));
    skinI.push(si.getX(vertex), si.getY(vertex), si.getZ(vertex), si.getW(vertex));
    skinW.push(sw.getX(vertex), sw.getY(vertex), sw.getZ(vertex), sw.getW(vertex));
    return id;
  }
  const indices = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = take(idx.getX(i));
    const b = take(idx.getY(i));
    const c = take(idx.getZ(i));
    if (a < 0 || b < 0 || c < 0) continue;
    indices.push(a, b, c);
  }
  if (!indices.length) return null;
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute("skinIndex", new BufferAttribute(new Uint16Array(skinI), 4));
  geo.setAttribute("skinWeight", new BufferAttribute(new Float32Array(skinW), 4));
  geo.setAttribute("aRole", new BufferAttribute(new Float32Array(ids.length), 1));
  geo.setAttribute("aId", new BufferAttribute(new Float32Array(ids), 1));
  geo.setIndex(indices);
  const shorts = new SkinnedMesh(geo, clothMat);
  shorts.bind(mesh.skeleton, mesh.bindMatrix);
  shorts.castShadow = true;
  shorts.receiveShadow = true;
  shorts.frustumCulled = false;
  mesh.parent.add(shorts);
  return { mesh: shorts, ids };
}

function tagMuscles(mesh) {
  const pos = mesh.geometry.attributes.position;
  const ids = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) ids[i] = muscleAt(pos.getX(i), pos.getY(i), pos.getZ(i));
  mesh.geometry.setAttribute("aId", new BufferAttribute(ids, 1));
  mesh.geometry.setAttribute("aRole", new BufferAttribute(new Float32Array(pos.count), 1));
  return ids;
}

async function loadBody() {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync("./models/body.glb");
  let found = null;
  gltf.scene.traverse((object) => {
    if (object.isSkinnedMesh) found = object;
    if (object.isBone) bones[object.name] = object;
  });
  if (!found || !bones.pelvis) throw new Error("Le corps chargé n’a pas de squelette.");
  bodyMesh = found;
  bodyMesh.material = skinMat;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  skeleton = bodyMesh.skeleton;
  actor.add(gltf.scene);
  actor.updateMatrixWorld(true);
  for (const bone of skeleton.bones) {
    bindLocal.set(bone.name, { p: bone.position.clone(), q: bone.quaternion.clone() });
    bindPos[bone.name] = bone.getWorldPosition(new Vector3());
  }
  for (const side of ["l", "r"]) {
    bones["foot_" + side].getWorldQuaternion((footBindQ["foot_" + side] = new Quaternion()));
  }
  armLen = bindPos.upperarm_l.distanceTo(bindPos.lowerarm_l) + bindPos.lowerarm_l.distanceTo(bindPos.hand_l);
  shoulderBindY = bindPos.upperarm_l.y;
  muscleIds.body = tagMuscles(bodyMesh);
  const shorts = buildShorts(bodyMesh);
  if (shorts) {
    shortsMesh = shorts.mesh;
    muscleIds.shorts = shorts.ids;
  }
  scapula = calibrateScapula();
  const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes("body.glb"));
  audit.glbBytes = resource ? resource.encodedBodySize || resource.decodedBodySize || resource.transferSize || 0 : 0;
}

function poseAt(k, now) {
  placeActor(k);
  updateAxes();
  resetBones();
  poseBody(k, now);
  actor.updateMatrixWorld(true);
  poseLimbs(k);
}

resize();
addEventListener("resize", resize);
applyTheme();
updateCopy();
showGear();
updateCamera();

if (params.get("theme") === "dark" || params.get("theme") === "light") setTheme(params.get("theme"));
if (params.get("k") != null && params.get("k") !== "") audit.frozenK = Number(params.get("k"));

const fpsWindow = [];
let lastNow = performance.now();
let visible = true;
document.addEventListener("visibilitychange", () => {
  visible = document.visibilityState !== "hidden";
  if (visible) lastNow = performance.now();
});

loadBody()
  .then(() => {
    if (params.get("ex")) setExercise(params.get("ex"), true);
    if (params.get("theta")) theta = Number(params.get("theta"));
    if (params.get("phi")) phi = Number(params.get("phi"));
    if (params.get("dist")) dist = Number(params.get("dist"));
    paintRoles(bodyMesh.geometry, muscleIds.body);
    if (shortsMesh) paintRoles(shortsMesh.geometry, muscleIds.shorts);
    showGear();
    requestAnimationFrame(frame);
  })
  .catch((error) => {
    phaseEl.textContent = "Chargement impossible";
    console.error(error);
  });

function frame(now) {
  requestAnimationFrame(frame);
  if (!visible) return;
  const dt = now - lastNow;
  lastNow = now;
  if (dt > 0 && dt < 80) {
    fpsWindow.push(1000 / dt);
    if (fpsWindow.length > 90) fpsWindow.shift();
    audit.fps = fpsWindow.reduce((sum, value) => sum + value, 0) / fpsWindow.length;
    if (dragging) {
      audit.dragSamples.push(1000 / dt);
      const recent = audit.dragSamples.slice(-45);
      audit.dragFps = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    }
  }

  let k;
  let label;
  if (typeof audit.frozenK === "number" && !Number.isNaN(audit.frozenK)) {
    k = audit.frozenK;
    if (exercise === "pullup") label = k > 0.66 ? "Menton" : k > 0.33 ? "Milieu" : "Suspension";
    else label = k > 0.66 ? "En bas" : k > 0.33 ? "Milieu" : "En haut";
  } else if (reduced) {
    k = 1;
    label = "Pose tenue";
  } else {
    const sample = sampleClock(now, exercise);
    k = sample.k;
    label = sample.label;
  }

  if (camLerp < 1 && !dragging) {
    camLerp = Math.min(1, camLerp + dt / 420);
    const s = smoother(camLerp);
    theta = camFrom.theta + (camTo.theta - camFrom.theta) * s;
    phi = camFrom.phi + (camTo.phi - camFrom.phi) * s;
    dist = camFrom.dist + (camTo.dist - camFrom.dist) * s;
    lookTarget.lerpVectors(lookFrom, lookTo, s);
  } else if (!dragging) {
    theta += vTheta;
    phi = MathUtils.clamp(phi + vPhi, 0.55, 1.65);
    vTheta *= 0.9;
    vPhi *= 0.9;
  }

  poseAt(k, now);
  if (bones.head) {
    worldPos(bones.head, tmp.a);
    worldPos(bones.hand_l, tmp.b);
    worldPos(bones.pelvis, tmp.c);
    worldPos(bones.upperarm_l, tmp.d);
    audit.pose = {
      headY: +tmp.a.y.toFixed(3),
      handY: +tmp.b.y.toFixed(3),
      hipY: +tmp.c.y.toFixed(3),
      shoulderY: +tmp.d.y.toFixed(3),
      reach: +tmp.b.distanceTo(tmp.d).toFixed(3),
    };
  }
  updateCamera();
  renderer.render(scene, camera);
  audit.triangles = renderer.info.render.triangles;
  audit.calls = renderer.info.render.calls;
  audit.pixelRatio = renderer.getPixelRatio();
  audit.k = k;
  if (!audit.ready) {
    audit.ready = true;
    audit.firstFrameMs = Math.round(performance.now() - started);
    audit.devicePixelRatio = window.devicePixelRatio || 1;
  }
  if (label !== phaseLabel) {
    phaseLabel = label;
    phaseEl.textContent = label;
  }
}
