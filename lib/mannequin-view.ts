import {
  ACESFilmicToneMapping,
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SkinnedMesh,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer/meshopt_decoder.module.js";
import { motionById, muscleRoles, type MotionPlan, type MotionId, type Tool } from "./mannequin-motion";
import type { Muscle } from "./types";

declare global {
  interface Window {
    __audit?: {
      ready: boolean;
      firstFrameMs: number | null;
      triangles: number;
      calls: number;
      pixelRatio: number;
      fps: number;
      exercise: string;
      theme: string;
      glbBytes: number;
      theta: number;
      frozenK?: number;
      override: MotionPlan | null;
      contextLost: number;
      pose?: { headY: number; handY: number; hipY: number; shoulderY: number; reach: number; footY: number };
      setMotion: (id: MotionId, tool?: Tool) => void;
      poseAt: (k: number) => void;
    };
  }
}

export type MannequinState = {
  plan: MotionPlan;
  muscles: Muscle[];
  title: string;
};

export type MannequinHooks = {
  getState: () => MannequinState;
  onFrame: (info: { label: string; progress: number }) => void;
  onReady: () => void;
  onFail: () => void;
};

const PULL_BAR_Y = 2.18;
const PULL_BAR_Z = 0.05;
const bodyCache = new Map<string, Promise<ArrayBuffer>>();

function loadBodyBytes(url: string): Promise<ArrayBuffer> {
  const hit = bodyCache.get(url);
  if (hit) return hit;
  const pending = fetch(url).then((res) => {
    if (!res.ok) throw new Error("corps");
    return res.arrayBuffer();
  });
  bodyCache.set(url, pending);
  pending.catch(() => bodyCache.delete(url));
  return pending;
}

export async function mountMannequin(canvas: HTMLCanvasElement, hooks: MannequinHooks, modelUrl: string) {
  let alive = true;
  let stopped = false;
  const started = performance.now();
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reducedQuery.matches;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    hooks.onFail();
    return { stop() {} };
  }
  if (!renderer.getContext()) {
    hooks.onFail();
    return { stop() {} };
  }

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.08, 30);
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
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
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

  function cylinderX(radius: number, length: number, material: MeshStandardMaterial, segs = 12) {
    const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segs), material);
    mesh.rotation.z = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }

  function makeBarbell(length: number, plates: boolean) {
    const group = new Group();
    group.add(cylinderX(plates ? 0.014 : 0.012, length, steel));
    if (plates) {
      group.add(cylinderX(0.0155, 0.46, steelDark));
      for (const side of [-1, 1]) {
        for (const [radius, x, depth] of [
          [0.2, 0.5, 0.03],
          [0.2, 0.536, 0.03],
          [0.16, 0.572, 0.024],
        ] as const) {
          const plate = cylinderX(radius, depth, iron, 16);
          plate.position.x = side * x * (length / 1.62);
          group.add(plate);
        }
      }
    }
    return group;
  }

  function makeDumbbell() {
    const group = new Group();
    group.add(cylinderX(0.012, 0.28, steelDark));
    for (const side of [-1, 1]) {
      const head = cylinderX(0.055, 0.04, iron, 12);
      head.position.x = side * 0.15;
      group.add(head);
    }
    return group;
  }

  const bar = makeBarbell(1.62, true);
  const latBar = makeBarbell(0.95, false);
  const dbL = makeDumbbell();
  const dbR = makeDumbbell();
  scene.add(bar, latBar, dbL, dbR);

  const cableGeo = new CylinderGeometry(0.006, 0.006, 1, 6);
  const cableMat = new MeshStandardMaterial({ color: 0x24272c, metalness: 0.4, roughness: 0.55 });
  const cableA = new Mesh(cableGeo, cableMat);
  const cableB = new Mesh(cableGeo, cableMat);
  scene.add(cableA, cableB);

  const squatRack = new Group();
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.055, 1.62, 0.055), steelDark);
    post.position.set(side * 0.82, 0.81, -0.32);
    post.castShadow = true;
    squatRack.add(post);
  }
  scene.add(squatRack);

  const bench = new Group();
  const pad = new Mesh(new BoxGeometry(0.32, 0.07, 1.08), padMat);
  pad.position.set(0, 0.46, -0.58);
  pad.castShadow = true;
  pad.receiveShadow = true;
  bench.add(pad);
  for (const x of [-0.12, 0.12]) {
    for (const z of [-1.0, -0.16]) {
      const leg = new Mesh(new BoxGeometry(0.04, 0.42, 0.04), steelDark);
      leg.position.set(x, 0.21, z);
      leg.castShadow = true;
      bench.add(leg);
    }
  }
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.05, 0.7, 0.05), steelDark);
    post.position.set(side * 0.42, 0.78, -1.05);
    bench.add(post);
  }
  scene.add(bench);

  const pullRig = new Group();
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.05, 2.32, 0.05), steelDark);
    post.position.set(side * 0.58, 1.16, -0.22);
    post.castShadow = true;
    pullRig.add(post);
  }
  const pullBar = cylinderX(0.016, 1.28, steel);
  pullBar.position.set(0, PULL_BAR_Y, PULL_BAR_Z);
  pullRig.add(pullBar);
  const brace = new Mesh(new BoxGeometry(1.16, 0.04, 0.04), steelDark);
  brace.position.set(0, 2.28, -0.22);
  pullRig.add(brace);
  scene.add(pullRig);

  const station = new Group();
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.05, 2.2, 0.05), steelDark);
    post.position.set(side * 0.78, 1.1, 0.55);
    post.castShadow = true;
    station.add(post);
  }
  const topBar = new Mesh(new BoxGeometry(1.62, 0.04, 0.04), steelDark);
  topBar.position.set(0, 2.18, 0.55);
  station.add(topBar);
  scene.add(station);

  const dipRig = new Group();
  for (const side of [-1, 1]) {
    const post = new Mesh(new BoxGeometry(0.04, 1.05, 0.04), steelDark);
    post.position.set(side * 0.32, 0.52, 0.02);
    dipRig.add(post);
    const grip = cylinderX(0.016, 0.46, steel);
    grip.rotation.z = 0;
    grip.rotation.x = Math.PI / 2;
    grip.position.set(side * 0.32, 1.02, 0.08);
    dipRig.add(grip);
  }
  scene.add(dipRig);

  const seat = new Mesh(new BoxGeometry(0.46, 0.08, 0.42), padMat);
  seat.position.set(0, 0.4, -0.02);
  seat.castShadow = true;
  seat.receiveShadow = true;
  scene.add(seat);
  const footPlate = new Mesh(new BoxGeometry(0.42, 0.28, 0.06), steelDark);
  footPlate.position.set(0, 0.28, 0.72);
  scene.add(footPlate);

  const sled = new Group();
  const sledBack = new Mesh(new BoxGeometry(0.46, 0.7, 0.08), padMat);
  sledBack.position.set(0, 0.55, -0.15);
  sledBack.rotation.x = -0.35;
  sled.add(sledBack);
  const sledPad = new Mesh(new BoxGeometry(0.42, 0.06, 0.36), steelDark);
  sled.add(sledPad);
  for (const side of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.04, 0.04, 1.1), steel);
    rail.position.set(side * 0.24, 0.7, 0.35);
    rail.rotation.x = -0.7;
    sled.add(rail);
  }
  scene.add(sled);

  const roller = cylinderX(0.035, 0.36, padMat, 10);
  scene.add(roller);
  const block = new Mesh(new BoxGeometry(0.5, 0.14, 0.32), steelDark);
  block.position.set(0, 0.07, 0.1);
  block.receiveShadow = true;
  scene.add(block);
  const mat = new Mesh(new BoxGeometry(0.7, 0.015, 1.7), padMat);
  mat.position.set(0, 0.008, 0);
  mat.receiveShadow = true;
  scene.add(mat);

  const ground = new Mesh(new CircleGeometry(1.9, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const staticGear = [squatRack, bench, pullRig, station, dipRig, seat, footPlate, sled, block, mat, roller];
  for (const item of [bar, latBar, dbL, dbR, cableA, cableB, ...staticGear]) item.visible = false;
  ground.visible = true;

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
    a: new Vector3(),
    b: new Vector3(),
  };

  const bones: Record<string, Bone> = {};
  const bindLocal = new Map<string, { p: Vector3; q: Quaternion }>();
  const bindPos: Record<string, Vector3> = {};
  const footBindQ: Record<string, Quaternion> = {};
  let bodyMesh: SkinnedMesh | null = null;
  let shortsMesh: SkinnedMesh | null = null;
  let skeleton: { bones: Bone[] } | null = null;
  let armLen = 0.5;
  let legLen = 0.78;
  let shoulderBindY = 1.34;
  const muscleIds: { body: Float32Array | null; shorts: Float32Array | null } = { body: null, shorts: null };
  let scapula: Record<string, Record<string, { axis: Vector3; sign: number }>> | null = null;
  const shaderBags: Record<string, { value: Color | number } | undefined>[] = [];
  let theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
  let layoutKey = "";

  function distSeg(px: number, py: number, pz: number, a: Vector3, b: Vector3) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const len2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + abx * t;
    const y = a.y + aby * t;
    const z = a.z + abz * t;
    return { d: Math.hypot(px - x, py - y, pz - z), t, y, z };
  }

  function muscleAt(x: number, y: number, z: number) {
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

  function hookMaterial(material: MeshStandardMaterial, cacheKey: string) {
    const bag: Record<string, { value: Color | number }> = {};
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBase = { value: new Color("#c6b3a2") };
      shader.uniforms.uCopper = { value: new Color("#c4622d") };
      shader.uniforms.uPrimMix = { value: 0.78 };
      shader.uniforms.uSecMix = { value: 0.4 };
      shader.uniforms.uPrimGlow = { value: 0.16 };
      shader.uniforms.uSecGlow = { value: 0.05 };
      Object.assign(bag, shader.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aRole;\nattribute float aId;\nvarying float vRole;\nvarying float vId;")
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
uniform float uSecGlow;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
float prim = 1.0 - min(abs(vRole - 1.0), 1.0);
float sec = 1.0 - min(abs(vRole - 2.0), 1.0);
diffuseColor.rgb = mix(uBase, uCopper, prim * uPrimMix + sec * uSecMix);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
float primE = 1.0 - min(abs(vRole - 1.0), 1.0);
float secE = 1.0 - min(abs(vRole - 2.0), 1.0);
totalEmissiveRadiance += uCopper * (primE * uPrimGlow + secE * uSecGlow);`,
        );
    };
    material.customProgramCacheKey = () => cacheKey;
    shaderBags.push(bag);
    return bag;
  }

  const skinMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0 });
  const clothMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const skinBag = hookMaterial(skinMat, "repere-skin");
  const clothBag = hookMaterial(clothMat, "repere-cloth");

  function paintRoles(geometry: BufferGeometry, ids: Float32Array, planMuscles: Muscle[]) {
    const role = geometry.getAttribute("aRole") as BufferAttribute;
    const { primary, secondary } = muscleRoles(planMuscles);
    const prim = new Set(primary);
    const sec = new Set(secondary);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      role.setX(i, prim.has(id) ? 1 : sec.has(id) ? 2 : 0);
    }
    role.needsUpdate = true;
  }

  function applyTheme() {
    const dark = theme === "dark";
    const skin = dark ? "#9a8d82" : "#c6b3a2";
    const copper = dark ? "#e8925a" : "#c4622d";
    const cloth = dark ? "#2c3036" : "#34383e";
    const paint = (bag: Record<string, { value: Color | number } | undefined>, base: string, prim: number, sec: number, glow: number, secGlow: number) => {
      const uBase = bag.uBase;
      const uCopper = bag.uCopper;
      if (!uBase || !uCopper || !(uBase.value instanceof Color) || !(uCopper.value instanceof Color)) return;
      uBase.value.set(base);
      uCopper.value.set(copper);
      if (bag.uPrimMix) bag.uPrimMix.value = prim;
      if (bag.uSecMix) bag.uSecMix.value = sec;
      if (bag.uPrimGlow) bag.uPrimGlow.value = glow;
      if (bag.uSecGlow) bag.uSecGlow.value = secGlow;
    };
    paint(skinBag, skin, dark ? 0.7 : 0.78, dark ? 0.38 : 0.42, dark ? 0.28 : 0.14, dark ? 0.08 : 0.04);
    paint(clothBag, cloth, dark ? 0.62 : 0.7, 0.28, dark ? 0.16 : 0.06, 0.02);
    groundMat.color.set(dark ? "#16181d" : "#d5cdc2");
    hemi.color.set(dark ? "#8e97a6" : "#f6f1ea");
    hemi.groundColor.set(dark ? "#2a241e" : "#c4b5a4");
    hemi.intensity = dark ? 0.38 : 0.55;
    key.intensity = dark ? 2.5 : 3.3;
    fill.intensity = dark ? 0.7 : 1.05;
    rim.intensity = dark ? 1.15 : 1.45;
    renderer.toneMappingExposure = dark ? 0.94 : 1.06;
  }

  function bone(name: string) {
    const found = bones[name];
    if (!found) throw new Error(name);
    return found;
  }

  function updateAxes() {
    actor.updateMatrixWorld(true);
    charRight.set(1, 0, 0).transformDirection(actor.matrixWorld);
    charUp.set(0, 1, 0).transformDirection(actor.matrixWorld);
    charForward.set(0, 0, 1).transformDirection(actor.matrixWorld);
  }

  function resetBones() {
    if (!skeleton) return;
    for (const item of skeleton.bones) {
      const saved = bindLocal.get(item.name);
      if (!saved) continue;
      item.position.copy(saved.p);
      item.quaternion.copy(saved.q);
    }
  }

  function movePelvis(dx: number, dy: number, dz: number) {
    const saved = bindLocal.get("pelvis");
    if (!saved) return;
    bones.pelvis.position.set(saved.p.x + dx, saved.p.y - dz, saved.p.z + dy);
  }

  function addWorldRotation(target: Bone | undefined, axis: Vector3, angle: number) {
    if (!target || !target.parent || Math.abs(angle) < 1e-5) return;
    target.parent.updateWorldMatrix(true, false);
    target.updateMatrix();
    target.matrixWorld.multiplyMatrices(target.parent.matrixWorld, target.matrix);
    tmp.q1.setFromRotationMatrix(target.parent.matrixWorld);
    tmp.q2.setFromRotationMatrix(target.matrixWorld);
    tmp.q3.setFromAxisAngle(axis, angle);
    tmp.q2.premultiply(tmp.q3);
    target.quaternion.copy(tmp.q1.invert()).multiply(tmp.q2);
  }

  function rotLocalX(target: Bone | undefined, angle: number) {
    if (!target || Math.abs(angle) < 1e-5) return;
    tmp.q3.setFromAxisAngle(LOCAL_X, angle);
    target.quaternion.multiply(tmp.q3);
  }

  function aimBone(target: Bone, dirWorld: Vector3, hingeWorld: Vector3) {
    if (!target.parent) return;
    target.parent.updateWorldMatrix(true, false);
    aim.parentQ.setFromRotationMatrix(target.parent.matrixWorld).invert();
    aim.dir.copy(dirWorld).normalize();
    aim.x.copy(hingeWorld);
    aim.x.addScaledVector(aim.dir, -aim.x.dot(aim.dir));
    if (aim.x.lengthSq() < 1e-8) aim.x.set(1, 0, 0);
    else aim.x.normalize();
    aim.z.crossVectors(aim.x, aim.dir).normalize();
    aim.x.crossVectors(aim.dir, aim.z).normalize();
    aim.basis.makeBasis(aim.x, aim.dir, aim.z);
    aim.worldQ.setFromRotationMatrix(aim.basis);
    target.quaternion.copy(aim.parentQ).multiply(aim.worldQ);
  }

  function solveLimb(upper: Bone, lower: Bone, end: Bone, target: Vector3, pole: Vector3) {
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
    const shoulder = Math.acos(MathUtils.clamp((lenA * lenA + dist * dist - lenB * lenB) / (2 * lenA * dist), -1, 1));
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

  function setWorldQuaternion(target: Bone, worldQ: Quaternion) {
    if (!target.parent) return;
    target.parent.updateWorldMatrix(true, false);
    aim.parentQ.setFromRotationMatrix(target.parent.matrixWorld).invert();
    target.quaternion.copy(aim.parentQ).multiply(worldQ);
  }

  function plantFoot(target: Bone, yaw: number) {
    const saved = footBindQ[target.name];
    if (!saved) return;
    tmp.q3.setFromAxisAngle(WORLD_UP, yaw);
    tmp.q2.copy(saved).premultiply(tmp.q3);
    setWorldQuaternion(target, tmp.q2);
  }

  function worldPos(target: Bone, out: Vector3) {
    target.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(target.matrixWorld);
  }

  function curlFingers(side: string, amount: number) {
    for (const name of ["index", "middle", "ring", "pinky"]) {
      rotLocalX(bones[`${name}_01_${side}`], 0.9 * amount);
      rotLocalX(bones[`${name}_02_${side}`], 1.15 * amount);
      rotLocalX(bones[`${name}_03_${side}`], 0.75 * amount);
    }
    rotLocalX(bones[`thumb_01_${side}`], 0.4 * amount);
    rotLocalX(bones[`thumb_02_${side}`], 0.55 * amount);
    rotLocalX(bones[`thumb_03_${side}`], 0.35 * amount);
  }

  function scapulaRotate(side: string, action: string, amount: number) {
    const info = scapula?.[side]?.[action];
    if (!info) return;
    tmp.a.copy(info.axis).transformDirection(actor.matrixWorld);
    addWorldRotation(bones[`clavicle_${side}`], tmp.a, info.sign * amount);
  }

  function aimGroupX(group: Object3D, axis: Vector3) {
    tmp.a.copy(axis).normalize();
    tmp.d.set(0, 1, 0);
    if (Math.abs(tmp.a.dot(tmp.d)) > 0.92) tmp.d.set(0, 0, 1);
    tmp.c.crossVectors(tmp.d, tmp.a).normalize();
    tmp.b.crossVectors(tmp.a, tmp.c).normalize();
    aim.basis.makeBasis(tmp.a, tmp.b, tmp.c);
    group.quaternion.setFromRotationMatrix(aim.basis);
  }

  function placeCable(mesh: Mesh, from: Vector3, to: Vector3) {
    mesh.visible = true;
    const len = Math.max(0.05, from.distanceTo(to));
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.set(1, len, 1);
    tmp.a.copy(to).sub(from).multiplyScalar(1 / len);
    mesh.quaternion.setFromUnitVectors(LOCAL_Y, tmp.a);
  }

  function placeDb(mesh: Object3D, hand: Vector3) {
    mesh.visible = true;
    mesh.position.copy(hand);
    aimGroupX(mesh, charRight);
  }

  function solveArm(side: "l" | "r", hand: Vector3, elbow: Vector3, grip = 0.9) {
    solveLimb(bone(`upperarm_${side}`), bone(`lowerarm_${side}`), bone(`hand_${side}`), hand, elbow);
    curlFingers(side, grip);
  }

  function solveLeg(side: "l" | "r", foot: Vector3, knee: Vector3, yaw: number | null) {
    const sign = side === "l" ? 1 : -1;
    solveLimb(bone(`thigh_${side}`), bone(`calf_${side}`), bone(`foot_${side}`), foot, knee);
    if (yaw != null) plantFoot(bone(`foot_${side}`), sign * yaw);
  }

  function lowerHipsToFloor(ahead: number) {
    worldPos(bone("pelvis"), work.hip);
    const floorY = 0.07;
    const reach = Math.max(0.62, legLen * 0.96);
    const span = Math.min(Math.abs(ahead), 0.46);
    const maxHip = floorY + Math.sqrt(Math.max(0.04, reach * reach - span * span));
    if (work.hip.y > maxHip) {
      actor.position.y -= work.hip.y - maxHip;
      actor.updateMatrixWorld(true);
    }
  }

  function plantOnFloor(side: "l" | "r", forward: number) {
    const sign = side === "l" ? 1 : -1;
    worldPos(bone("pelvis"), work.hip);
    const floorY = 0.07;
    const reach = Math.max(0.62, legLen * 0.96);
    const ahead = Math.min(Math.abs(forward), 0.46);
    const drop = Math.max(0, work.hip.y - floorY);
    const room = Math.sqrt(Math.max(0, reach * reach - drop * drop));
    const dz = Math.min(ahead, room * 0.92);
    work.a.set(work.hip.x + sign * 0.13, floorY, work.hip.z + dz);
    work.b.set(work.hip.x + sign * 0.18, floorY + Math.min(0.46, drop * 0.46), work.hip.z + dz * 0.38);
    solveLeg(side, work.a, work.b, 0.08);
  }

  function supportBench(tilt: number) {
    worldPos(bone("pelvis"), work.hip);
    worldPos(bone("spine_03"), work.neck);
    const midY = (work.hip.y + work.neck.y) * 0.5 - 0.06;
    const midZ = (work.hip.z + work.neck.z) * 0.5;
    const c = Math.cos(tilt);
    const s = Math.sin(tilt);
    const padY = 0.46 * c + 0.58 * s;
    const padZ = 0.46 * s - 0.58 * c;
    bench.rotation.set(tilt, 0, 0);
    bench.position.set(0, midY - padY, midZ - padZ);
    bench.visible = true;
  }

  function standFeet(yaw = 0.12) {
    for (const side of ["l", "r"] as const) {
      const sign = side === "l" ? 1 : -1;
      const foot = bindPos[`foot_${side}`];
      work.a.copy(foot);
      work.b.set(foot.x + sign * 0.12, 0.48, foot.z + 0.36);
      solveLeg(side, work.a, work.b, yaw);
    }
  }

  function shoulders() {
    worldPos(bone("upperarm_l"), work.left);
    worldPos(bone("upperarm_r"), work.right);
    work.mid.copy(work.left).add(work.right).multiplyScalar(0.5);
  }

  function holdBar(origin: Vector3, half: number, grip = 0.9) {
    bar.visible = true;
    bar.position.copy(origin);
    aimGroupX(bar, charRight);
    for (const side of ["l", "r"] as const) {
      const sign = side === "l" ? 1 : -1;
      work.hand.copy(origin).addScaledVector(charRight, sign * half);
      work.elbow.copy(work.hand).addScaledVector(charForward, -0.16).addScaledVector(charUp, 0.12).addScaledVector(charRight, sign * 0.08);
      solveArm(side, work.hand, work.elbow, grip);
    }
  }

  function eachHand(fn: (side: "l" | "r", sign: number) => void) {
    fn("l", 1);
    fn("r", -1);
  }

  function layout(id: MotionId, tool: Tool) {
    const key = `${id}:${tool}`;
    if (key === layoutKey) return;
    layoutKey = key;
    for (const item of staticGear) item.visible = false;
    bench.rotation.set(0, 0, 0);
    bench.position.set(0, 0, 0);
    if (id === "squat") squatRack.visible = true;
    if (id === "bench") bench.visible = true;
    if (id === "incline" || id === "incline-curl") {
      bench.visible = true;
    }
    if (id === "chest-row") {
      bench.visible = true;
      bench.rotation.x = 0.4;
      bench.position.set(0, 0.08, 0.12);
    }
    if (id === "pullup") pullRig.visible = true;
    if (tool === "cable" || id === "crunch" || id === "fly") station.visible = true;
    if (id === "dips") dipRig.visible = true;
    if (id === "pulldown" || id === "seated-row") seat.visible = true;
    if (id === "seated-row") footPlate.visible = true;
    if (id === "legpress" || id === "calf-press") sled.visible = true;
    if (id === "legcurl") {
      bench.visible = true;
      bench.position.set(0, 0.16, 0.05);
      roller.visible = true;
    }
    if (id === "calf") block.visible = true;
    if (id === "plank" || id === "deadbug" || id === "hipthrust") mat.visible = true;
    if (id === "hipthrust" || id === "split") {
      bench.visible = true;
      bench.rotation.set(0, 0, 0);
      bench.position.set(0, id === "split" ? -0.12 : -0.02, id === "split" ? -0.05 : -0.42);
    }
  }

  function placeActor(id: MotionId, k: number) {
    actor.rotation.set(0, 0, 0);
    actor.position.set(0, 0, 0);
    if (id === "bench") {
      actor.rotation.x = -Math.PI / 2;
      actor.position.set(0, 0.6, 0.02);
    } else if (id === "incline") {
      actor.rotation.x = -1.02;
      actor.position.set(0, 0.28, 0.18);
    } else if (id === "incline-curl") {
      actor.rotation.x = -0.78;
      actor.position.set(0, 0.16, 0.12);
    } else if (id === "pullup") {
      const hangY = PULL_BAR_Y - 0.02 - armLen * 0.985 - shoulderBindY;
      actor.position.set(0, hangY + k * 0.43, 0);
      actor.rotation.x = -0.14 * k;
    } else if (id === "dips") {
      actor.position.y = -0.12 * k;
      actor.rotation.x = 0.1 + 0.16 * k;
    } else if (id === "legpress" || id === "calf-press") {
      actor.rotation.x = -1.12;
      actor.position.set(0, 0.48, 0.1);
    } else if (id === "plank") {
      actor.rotation.x = Math.PI / 2;
      actor.position.set(0, 0.34, 0);
    } else if (id === "legcurl") {
      actor.rotation.x = Math.PI / 2;
      actor.position.set(0, 0.64, 0.08);
    } else if (id === "deadbug") {
      actor.rotation.x = -Math.PI / 2;
      actor.position.set(0, 0.2, 0);
    } else if (id === "chest-row") {
      actor.rotation.x = 0.72;
      actor.position.set(0, 0.48, 0.02);
    } else if (id === "calf") {
      actor.position.y = 0.1 + 0.07 * k;
    }
  }

  function poseBody(id: MotionId, k: number, now: number) {
    const breath = reduced ? 0 : Math.sin(now * 0.00135) * 0.016;
    const settle = reduced ? 0 : Math.sin(now * 0.0007 + 0.6) * 0.008;
    if (id === "squat") {
      movePelvis(0, -0.43 * k, -0.17 * k);
      addWorldRotation(bones.pelvis, charRight, 0.12 * k);
      addWorldRotation(bones.spine_01, charRight, 0.2 * k + breath * 0.45);
      addWorldRotation(bones.spine_02, charRight, 0.12 * k + breath);
      addWorldRotation(bones.spine_03, charRight, 0.06 * k + breath * 0.55 + settle);
      addWorldRotation(bones.neck_01, charRight, -0.22 * k);
      addWorldRotation(bones.head, charRight, -0.2 * k);
      return;
    }
    if (id === "bench" || id === "incline") {
      addWorldRotation(bones.spine_01, charRight, -0.05);
      addWorldRotation(bones.spine_02, charRight, -0.04 + breath * 0.7);
      addWorldRotation(bones.spine_03, charRight, breath * 0.4);
      scapulaRotate("l", "retract", 0.42);
      scapulaRotate("r", "retract", 0.42);
      scapulaRotate("l", "depress", 0.12);
      scapulaRotate("r", "depress", 0.12);
      addWorldRotation(bones.head, charRight, 0.08);
      return;
    }
    if (id === "pullup") {
      const depress = 0.38 - 0.12 * k;
      scapulaRotate("l", "depress", depress);
      scapulaRotate("r", "depress", depress);
      scapulaRotate("l", "retract", 0.18 * k);
      scapulaRotate("r", "retract", 0.18 * k);
      addWorldRotation(bones.spine_01, charRight, -0.16 * k + breath * 0.35);
      addWorldRotation(bones.spine_02, charRight, -0.08 * k + breath);
      addWorldRotation(bones.head, charRight, 0.12 * k);
      return;
    }
    addWorldRotation(bones.spine_02, charRight, breath);
    addWorldRotation(bones.spine_03, charRight, breath * 0.45 + settle);
    if (id === "deadlift") {
      movePelvis(0, -0.42 * k, -0.22 * k);
      addWorldRotation(bones.pelvis, charRight, 0.48 * k);
      addWorldRotation(bones.spine_01, charRight, 0.52 * k);
      addWorldRotation(bones.spine_02, charRight, 0.26 * k);
      addWorldRotation(bones.neck_01, charRight, -0.28 * k);
      addWorldRotation(bones.head, charRight, -0.18 * k);
    } else if (id === "rdl" || id === "row" || id === "reverse-fly") {
      const hinge = id === "rdl" ? 0.2 + 1.05 * k : 0.9;
      movePelvis(0, id === "rdl" ? -0.1 * k : -0.06, id === "rdl" ? -0.26 * k : -0.08);
      addWorldRotation(bones.pelvis, charRight, hinge * (id === "rdl" ? 0.62 : 0.85));
      addWorldRotation(bones.spine_01, charRight, hinge * (id === "rdl" ? 0.5 : 0.45));
      addWorldRotation(bones.spine_02, charRight, hinge * 0.2);
      addWorldRotation(bones.neck_01, charRight, -hinge * 0.4);
      addWorldRotation(bones.head, charRight, -hinge * 0.32);
      if (id === "row") {
        scapulaRotate("l", "retract", 0.12 + 0.28 * k);
        scapulaRotate("r", "retract", 0.12 + 0.28 * k);
      }
    } else if (id === "lunge" || id === "split") {
      movePelvis(0, -0.32 * k, 0.02 * k);
      addWorldRotation(bones.spine_01, charRight, 0.06 * k);
    } else if (id === "ohp") {
      addWorldRotation(bones.spine_01, charRight, -0.1 * k);
      addWorldRotation(bones.head, charRight, 0.08 * k);
    } else if (id === "pulldown" || id === "seated-row") {
      movePelvis(0, -0.48, 0.02);
      addWorldRotation(bones.spine_01, charRight, id === "pulldown" ? -0.14 - 0.18 * k : 0.08);
      scapulaRotate("l", "depress", 0.22);
      scapulaRotate("r", "depress", 0.22);
      scapulaRotate("l", "retract", 0.3 * k);
      scapulaRotate("r", "retract", 0.3 * k);
    } else if (id === "hipthrust") {
      movePelvis(0, -0.62 + 0.3 * k, 0.04);
      addWorldRotation(bones.pelvis, charRight, -1.2 + 0.28 * k);
      addWorldRotation(bones.spine_01, charRight, -0.42 + 0.1 * k);
      addWorldRotation(bones.spine_02, charRight, -0.16);
      addWorldRotation(bones.head, charRight, 0.08);
    } else if (id === "crunch") {
      movePelvis(0, -0.56, 0);
      addWorldRotation(bones.spine_01, charRight, 0.25 + 0.4 * k);
      addWorldRotation(bones.spine_02, charRight, 0.2 + 0.35 * k);
      addWorldRotation(bones.head, charRight, 0.15 + 0.35 * k);
    } else if (id === "fly") {
      addWorldRotation(bones.spine_01, charRight, 0.1);
    } else if (id === "dips") {
      scapulaRotate("l", "depress", 0.28);
      scapulaRotate("r", "depress", 0.28);
    }
  }

  function limbsSquat() {
    worldPos(bone("neck_01"), work.neck);
    work.bar.copy(work.neck).addScaledVector(charUp, -0.015).addScaledVector(charForward, -0.055);
    work.bar.x = 0;
    work.bar.z = work.bar.z * 0.72 + 0.02 * 0.28;
    bar.position.copy(work.bar);
    bar.quaternion.identity();
    bar.visible = true;
    for (const side of ["l", "r"] as const) {
      const sign = side === "l" ? 1 : -1;
      const foot = bindPos[`foot_${side}`];
      work.foot.copy(foot);
      work.knee.set(foot.x + sign * 0.14, 0.5, foot.z + 0.4);
      solveLeg(side, work.foot, work.knee, 0.18);
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.32).addScaledVector(charUp, -0.02);
      work.elbow.copy(work.hand).addScaledVector(charForward, 0.22).addScaledVector(charUp, -0.38).addScaledVector(charRight, sign * 0.12);
      solveArm(side, work.hand, work.elbow, 1);
    }
  }

  function limbsBench(k: number, tool: Tool, incline: boolean) {
    if (incline) lowerHipsToFloor(0.36);
    shoulders();
    work.top.copy(work.mid).addScaledVector(charForward, armLen * 0.96).addScaledVector(charUp, 0.02);
    work.bottom.copy(work.mid).addScaledVector(charForward, 0.11).addScaledVector(charUp, -0.09);
    work.bar.copy(work.top).lerp(work.bottom, k);
    work.bar.addScaledVector(charUp, Math.sin(k * Math.PI) * 0.025);
    if (tool === "bar") {
      bar.position.copy(work.bar);
      bar.quaternion.identity();
      bar.visible = true;
    }
    for (const side of ["l", "r"] as const) {
      const sign = side === "l" ? 1 : -1;
      const half = tool === "dumbbell" ? 0.28 : 0.22;
      work.hand.copy(work.bar).addScaledVector(charRight, sign * half).addScaledVector(charForward, -0.012);
      work.elbow.copy(side === "l" ? work.left : work.right).addScaledVector(charRight, sign * 0.2).addScaledVector(charForward, -0.28).addScaledVector(charUp, -0.08);
      solveArm(side, work.hand, work.elbow, 1);
      if (tool === "dumbbell") placeDb(side === "l" ? dbL : dbR, work.hand);
      if (incline) {
        plantOnFloor(side, 0.36);
      } else {
        worldPos(bone("pelvis"), work.hip);
        work.a.set(sign * 0.17, 0.07, work.hip.z + 0.62);
        work.b.set(sign * 0.22, 0.48, work.hip.z + 0.28);
      }
      solveLeg(side, work.a, work.b, 0.1);
    }
    if (incline) supportBench(0.48);
  }

  function limbsPullup() {
    for (const side of ["l", "r"] as const) {
      const sign = side === "l" ? 1 : -1;
      work.hand.set(sign * 0.24, PULL_BAR_Y - 0.018, PULL_BAR_Z);
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.elbow.copy(work.shoulder).addScaledVector(charForward, 0.38).addScaledVector(charUp, -0.42).addScaledVector(charRight, sign * 0.04);
      solveArm(side, work.hand, work.elbow, 1);
      worldPos(bone("pelvis"), work.hip);
      work.foot.set(work.hip.x + sign * 0.03, work.hip.y - 0.7, work.hip.z + 0.06);
      work.knee.set(work.foot.x + sign * 0.02, work.foot.y + 0.25, work.foot.z + 0.28);
      solveLeg(side, work.foot, work.knee, null);
    }
  }

  function limbsOhp(k: number) {
    standFeet(0.08);
    shoulders();
    worldPos(bone("neck_01"), work.neck);
    work.top.copy(work.mid).addScaledVector(charUp, armLen * 0.98).addScaledVector(charForward, 0.03);
    work.bottom.copy(work.neck).addScaledVector(charForward, 0.18).addScaledVector(charUp, -0.02);
    work.bar.copy(work.top).lerp(work.bottom, k);
    bar.visible = true;
    bar.position.copy(work.bar);
    aimGroupX(bar, charRight);
    eachHand((side, sign) => {
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.2);
      work.elbow.copy(work.hand).addScaledVector(charRight, sign * 0.18).addScaledVector(charForward, 0.16).addScaledVector(charUp, -0.18);
      solveArm(side, work.hand, work.elbow, 1);
    });
  }

  function limbsHinge(k: number, floorY: number) {
    standFeet(0.08);
    const y = 0.7 + (floorY - 0.7) * k;
    work.bar.set(0, y, 0.14);
    holdBar(work.bar, 0.22, 1);
  }

  function limbsLunge(k: number, rearUp: boolean) {
    work.a.set(0.1, 0.03, 0.38);
    work.b.set(0.16, 0.36, 0.62);
    solveLeg("l", work.a, work.b, 0.12);
    if (rearUp) {
      work.a.set(-0.08, 0.4, -0.28);
      work.b.set(-0.04, 0.22, -0.02);
    } else {
      work.a.set(-0.08, 0.03, -0.36);
      work.b.set(-0.04, 0.22 - 0.08 * k, -0.08);
    }
    solveLeg("r", work.a, work.b, 0.08);
    worldPos(bone("pelvis"), work.hip);
    eachHand((side, sign) => {
      work.hand.copy(work.hip).addScaledVector(charUp, -0.12).addScaledVector(charRight, sign * 0.24);
      work.elbow.copy(work.hand).addScaledVector(charUp, 0.18).addScaledVector(charRight, sign * 0.06);
      solveArm(side, work.hand, work.elbow, 0.8);
      placeDb(side === "l" ? dbL : dbR, work.hand);
    });
  }

  function limbsRow(k: number) {
    standFeet(0.06);
    shoulders();
    work.bottom.copy(work.mid).addScaledVector(charUp, -0.52).addScaledVector(charForward, 0.1);
    work.top.copy(work.mid).addScaledVector(charUp, -0.16).addScaledVector(charForward, 0.16);
    work.bar.copy(work.bottom).lerp(work.top, k);
    bar.visible = true;
    bar.position.copy(work.bar);
    aimGroupX(bar, charRight);
    eachHand((side, sign) => {
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.22);
      work.elbow.copy(work.mid).addScaledVector(charRight, sign * 0.22).addScaledVector(charForward, -0.22).addScaledVector(charUp, -0.08);
      solveArm(side, work.hand, work.elbow, 1);
    });
  }

  function limbsSeatedRow(k: number) {
    eachHand((side, sign) => {
      work.a.set(sign * 0.12, 0.08, 0.58);
      work.b.set(sign * 0.14, 0.42, 0.32);
      solveLeg(side, work.a, work.b, 0.04);
    });
    shoulders();
    eachHand((side, sign) => {
      const shoulder = side === "l" ? work.left : work.right;
      work.hand.copy(shoulder).addScaledVector(charForward, 0.5 - 0.32 * k).addScaledVector(charUp, -0.08).addScaledVector(charRight, sign * 0.16);
      work.elbow.copy(shoulder).addScaledVector(charForward, -0.16).addScaledVector(charUp, -0.08).addScaledVector(charRight, sign * 0.18);
      solveArm(side, work.hand, work.elbow, 0.85);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    work.mid.copy(work.a).add(work.b).multiplyScalar(0.5);
    work.top.set(0, 0.48, 0.86);
    placeCable(cableA, work.top, work.mid);
  }

  function limbsPulldown(k: number) {
    eachHand((side, sign) => {
      work.a.set(sign * 0.14, 0.06, 0.52);
      work.b.set(sign * 0.16, 0.4, 0.28);
      solveLeg(side, work.a, work.b, 0.05);
    });
    shoulders();
    work.top.set(0, 1.98, 0.12);
    work.bottom.copy(work.mid).addScaledVector(charForward, 0.2).addScaledVector(charUp, -0.02);
    work.bar.copy(work.top).lerp(work.bottom, k);
    latBar.visible = true;
    latBar.position.copy(work.bar);
    aimGroupX(latBar, charRight);
    eachHand((side, sign) => {
      work.hand.copy(work.bar).addScaledVector(charRight, sign * 0.24);
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.elbow.copy(work.shoulder).addScaledVector(charUp, -0.2).addScaledVector(charForward, -0.12).addScaledVector(charRight, sign * 0.16);
      solveArm(side, work.hand, work.elbow, 0.9);
    });
    work.a.set(0, 2.2, 0.2);
    placeCable(cableA, work.a, work.bar);
  }

  function limbsFacepull(k: number) {
    standFeet(0.06);
    eachHand((side, sign) => {
      work.a.set(sign * 0.08, 1.5, 0.46);
      work.b.set(sign * 0.16, 1.52, 0.12);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.set(sign * 0.28, 1.58, 0.24);
      solveArm(side, work.hand, work.elbow, 0.7);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    work.top.set(0, 1.58, 0.72);
    placeCable(cableA, work.top, work.a);
    placeCable(cableB, work.top, work.b);
  }

  function limbsCurl(k: number, tool: Tool) {
    standFeet(0.06);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(charUp, -0.5).addScaledVector(charRight, sign * 0.18);
      work.b.copy(work.shoulder).addScaledVector(charUp, -0.02).addScaledVector(charForward, 0.16).addScaledVector(charRight, sign * 0.14);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.shoulder).addScaledVector(charForward, 0.32).addScaledVector(charUp, -0.18);
      solveArm(side, work.hand, work.elbow, 0.75);
      if (tool === "dumbbell") placeDb(side === "l" ? dbL : dbR, work.hand);
    });
    if (tool === "cable") {
      worldPos(bone("hand_l"), work.a);
      worldPos(bone("hand_r"), work.b);
      work.top.set(0, 0.32, 0.48);
      placeCable(cableA, work.top, work.a);
      placeCable(cableB, work.top, work.b);
    }
  }

  function limbsInclineCurl(k: number) {
    lowerHipsToFloor(0.32);
    eachHand((side) => {
      plantOnFloor(side, 0.32);
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.top.copy(work.shoulder).addScaledVector(charUp, -0.46).addScaledVector(charForward, -0.06);
      work.bottom.copy(work.shoulder).addScaledVector(charUp, -0.05).addScaledVector(charForward, 0.12);
      work.hand.copy(work.top).lerp(work.bottom, k);
      work.elbow.copy(work.shoulder).addScaledVector(charForward, 0.28).addScaledVector(charUp, -0.2);
      solveArm(side, work.hand, work.elbow, 0.75);
      placeDb(side === "l" ? dbL : dbR, work.hand);
    });
    supportBench(0.72);
  }

  function limbsLateral(k: number) {
    standFeet(0.06);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(charUp, -0.46).addScaledVector(charRight, sign * 0.16).addScaledVector(charForward, 0.04);
      work.b.copy(work.shoulder).addScaledVector(charRight, sign * 0.52).addScaledVector(charUp, 0.04).addScaledVector(charForward, 0.06);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.shoulder).addScaledVector(charUp, -0.12).addScaledVector(charForward, 0.22).addScaledVector(charRight, sign * 0.2);
      solveArm(side, work.hand, work.elbow, 0.45);
      placeDb(side === "l" ? dbL : dbR, work.hand);
    });
  }

  function limbsChestRow(k: number) {
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(WORLD_UP, -0.4);
      work.b.copy(work.shoulder).addScaledVector(WORLD_UP, -0.08).addScaledVector(charRight, sign * 0.1).addScaledVector(charForward, -0.12);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.shoulder).addScaledVector(charRight, sign * 0.22).addScaledVector(WORLD_UP, 0.02);
      solveArm(side, work.hand, work.elbow, 0.8);
      placeDb(side === "l" ? dbL : dbR, work.hand);
      worldPos(bone("pelvis"), work.hip);
      work.foot.copy(work.hip).addScaledVector(charUp, -0.5);
      work.foot.y = 0.1;
      work.knee.copy(work.foot).lerp(work.hip, 0.45);
      solveLeg(side, work.foot, work.knee, null);
    });
  }

  function limbsReverse(k: number, tool: Tool) {
    standFeet(0.05);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(charUp, -0.42).addScaledVector(charForward, 0.06);
      work.b.copy(work.shoulder).addScaledVector(charRight, sign * 0.48).addScaledVector(charForward, -0.02).addScaledVector(charUp, 0.02);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.shoulder).addScaledVector(charUp, -0.16).addScaledVector(charRight, sign * 0.16);
      solveArm(side, work.hand, work.elbow, 0.4);
      if (tool === "dumbbell") placeDb(side === "l" ? dbL : dbR, work.hand);
    });
    if (tool === "cable") {
      worldPos(bone("hand_l"), work.a);
      worldPos(bone("hand_r"), work.b);
      placeCable(cableA, work.left.set(-0.15, 1.15, 0.7), work.a);
      placeCable(cableB, work.right.set(0.15, 1.15, 0.7), work.b);
    }
  }

  function limbsFly(k: number) {
    standFeet(0.06);
    shoulders();
    eachHand((side, sign) => {
      const shoulder = side === "l" ? work.left : work.right;
      work.a.copy(shoulder).addScaledVector(charRight, sign * 0.48).addScaledVector(charForward, 0.2).addScaledVector(charUp, -0.06);
      work.b.copy(work.mid).addScaledVector(charForward, 0.34).addScaledVector(charRight, sign * 0.06).addScaledVector(charUp, 0.04);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.hand).addScaledVector(charUp, -0.22).addScaledVector(charForward, 0.08);
      solveArm(side, work.hand, work.elbow, 0.35);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    placeCable(cableA, tmp.a.set(-0.9, 1.65, 0.2), work.a);
    placeCable(cableB, tmp.b.set(0.9, 1.65, 0.2), work.b);
  }

  function limbsPushdown(k: number) {
    standFeet(0.05);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(charUp, -0.48).addScaledVector(charRight, sign * 0.12).addScaledVector(charForward, 0.06);
      work.b.copy(work.shoulder).addScaledVector(charUp, -0.16).addScaledVector(charRight, sign * 0.12).addScaledVector(charForward, 0.2);
      work.hand.copy(work.b).lerp(work.a, k);
      work.elbow.copy(work.shoulder).addScaledVector(charForward, -0.12).addScaledVector(charUp, -0.22).addScaledVector(charRight, sign * 0.1);
      solveArm(side, work.hand, work.elbow, 0.7);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    work.top.set(0, 2.05, 0.48);
    placeCable(cableA, work.top, work.a);
    placeCable(cableB, work.top, work.b);
  }

  function limbsOverhead(k: number, tool: Tool) {
    standFeet(0.05);
    worldPos(bone("head"), work.neck);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(charUp, 0.48).addScaledVector(charRight, sign * 0.07);
      work.b.copy(work.neck).addScaledVector(charUp, -0.02).addScaledVector(charForward, -0.14).addScaledVector(charRight, sign * 0.07);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.shoulder).addScaledVector(charUp, 0.28).addScaledVector(charRight, sign * 0.14).addScaledVector(charForward, -0.08);
      solveArm(side, work.hand, work.elbow, 0.7);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    work.mid.copy(work.a).add(work.b).multiplyScalar(0.5);
    if (tool === "cable") {
      work.top.set(0, 2.12, 0.15);
      placeCable(cableA, work.top, work.mid);
    } else {
      placeDb(dbL, work.mid);
      dbR.visible = false;
    }
  }

  function limbsDips() {
    eachHand((side, sign) => {
      work.hand.set(sign * 0.3, 1.02, 0.08);
      work.elbow.set(sign * 0.46, 0.62, -0.34);
      solveArm(side, work.hand, work.elbow, 0.85);
      work.a.set(sign * 0.12, 0.05, -0.32);
      work.b.set(sign * 0.18, 0.32, 0.02);
      solveLeg(side, work.a, work.b, null);
    });
  }

  function limbsLegPress(k: number, ankles: boolean) {
    worldPos(bone("pelvis"), work.hip);
    const reach = ankles ? 0.78 : 0.82 - 0.3 * k;
    eachHand((side, sign) => {
      work.foot.copy(work.hip).addScaledVector(charForward, reach).addScaledVector(charRight, sign * 0.12).addScaledVector(charUp, -0.02);
      work.knee.copy(work.hip).addScaledVector(charForward, reach * 0.45).addScaledVector(charRight, sign * 0.16).addScaledVector(WORLD_UP, 0.08);
      solveLeg(side, work.foot, work.knee, null);
      if (ankles) addWorldRotation(bone(`foot_${side}`), charRight, -0.2 + 0.55 * k);
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.hand.copy(work.shoulder).addScaledVector(charUp, -0.2).addScaledVector(charRight, sign * 0.2);
      work.elbow.copy(work.hand).addScaledVector(charUp, 0.12);
      solveArm(side, work.hand, work.elbow, 0.6);
    });
    worldPos(bone("foot_l"), work.a);
    worldPos(bone("foot_r"), work.b);
    sledPad.position.copy(work.a).add(work.b).multiplyScalar(0.5).addScaledVector(charForward, 0.08);
    sledPad.scale.set(1.5, 1.4, 1.8);
  }

  function limbsCalf(k: number) {
    eachHand((side, sign) => {
      work.foot.set(sign * 0.1, 0.2, 0.16);
      work.knee.set(sign * 0.12, 0.58, 0.28);
      solveLeg(side, work.foot, work.knee, null);
      addWorldRotation(bone(`foot_${side}`), charRight, -0.55 * (1 - k));
      worldPos(bone("pelvis"), work.hip);
      work.hand.copy(work.hip).addScaledVector(charUp, 0.12).addScaledVector(charRight, sign * 0.16);
      work.elbow.copy(work.hand).addScaledVector(charUp, 0.16).addScaledVector(charForward, 0.08);
      solveArm(side, work.hand, work.elbow, 0.4);
    });
  }

  function limbsPlank() {
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.hand.copy(work.shoulder).addScaledVector(charUp, 0.26);
      work.hand.y = 0.07;
      work.elbow.copy(work.shoulder);
      work.elbow.y = 0.1;
      solveArm(side, work.hand, work.elbow, 0.35);
      worldPos(bone("pelvis"), work.hip);
      work.foot.copy(work.hip).addScaledVector(charUp, -0.72);
      work.foot.x += sign * 0.06;
      work.foot.y = 0.05;
      work.knee.copy(work.foot).addScaledVector(charUp, 0.25).addScaledVector(WORLD_UP, 0.08);
      solveLeg(side, work.foot, work.knee, null);
    });
  }

  function limbsLegCurl(k: number) {
    worldPos(bone("pelvis"), work.hip);
    eachHand((side, sign) => {
      work.foot.copy(work.hip).addScaledVector(charUp, -0.58 + 0.3 * k).addScaledVector(WORLD_UP, 0.04 + 0.38 * k).addScaledVector(charRight, sign * 0.08);
      work.knee.copy(work.hip).addScaledVector(charUp, -0.28).addScaledVector(charRight, sign * 0.16);
      solveLeg(side, work.foot, work.knee, null);
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.hand.copy(work.shoulder).addScaledVector(charUp, 0.22);
      work.hand.y = Math.min(work.hand.y, 0.7);
      work.elbow.copy(work.hand).addScaledVector(WORLD_UP, 0.08);
      solveArm(side, work.hand, work.elbow, 0.45);
    });
    worldPos(bone("foot_l"), work.a);
    worldPos(bone("foot_r"), work.b);
    roller.position.copy(work.a).add(work.b).multiplyScalar(0.5);
    roller.quaternion.identity();
    roller.rotation.z = Math.PI / 2;
  }

  function limbsHip() {
    eachHand((side, sign) => {
      work.foot.set(sign * 0.14, 0.04, 0.52);
      work.knee.set(sign * 0.16, 0.32, 0.28);
      solveLeg(side, work.foot, work.knee, 0.06);
      worldPos(bone("pelvis"), work.hip);
      work.hand.copy(work.hip).addScaledVector(charUp, 0.08).addScaledVector(charRight, sign * 0.16);
      work.elbow.copy(work.hand).addScaledVector(charUp, 0.14);
      solveArm(side, work.hand, work.elbow, 0.4);
    });
  }

  function limbsCrunch(k: number) {
    eachHand((side, sign) => {
      work.foot.set(sign * 0.1, 0.05, -0.05);
      work.knee.set(sign * 0.12, 0.28, 0.22);
      solveLeg(side, work.foot, work.knee, null);
    });
    worldPos(bone("head"), work.neck);
    eachHand((side, sign) => {
      work.a.set(sign * 0.08, 1.55, 0.08);
      work.b.copy(work.neck).addScaledVector(charForward, 0.16).addScaledVector(charUp, 0.08).addScaledVector(charRight, sign * 0.08);
      work.hand.copy(work.a).lerp(work.b, k);
      work.elbow.copy(work.hand).addScaledVector(charRight, sign * 0.1).addScaledVector(WORLD_UP, 0.08);
      solveArm(side, work.hand, work.elbow, 0.65);
    });
    worldPos(bone("hand_l"), work.a);
    worldPos(bone("hand_r"), work.b);
    work.mid.copy(work.a).add(work.b).multiplyScalar(0.5);
    work.top.set(0, 2.08, 0.4);
    placeCable(cableA, work.top, work.mid);
  }

  function limbsDeadbug(k: number) {
    worldPos(bone("pelvis"), work.hip);
    eachHand((side, sign) => {
      const armK = side === "l" ? k : 0;
      const legK = side === "r" ? k : 0;
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.a.copy(work.shoulder).addScaledVector(WORLD_UP, 0.32);
      work.b.copy(work.shoulder).addScaledVector(charUp, 0.48).addScaledVector(WORLD_UP, 0.04);
      work.hand.copy(work.a).lerp(work.b, armK);
      work.elbow.copy(work.shoulder).addScaledVector(WORLD_UP, 0.12).addScaledVector(charRight, sign * 0.08);
      solveArm(side, work.hand, work.elbow, 0.25);
      work.top.copy(work.hip).addScaledVector(WORLD_UP, 0.42).addScaledVector(charRight, sign * 0.08);
      work.bottom.copy(work.hip).addScaledVector(charUp, -0.62).addScaledVector(WORLD_UP, 0.06).addScaledVector(charRight, sign * 0.08);
      work.foot.copy(work.top).lerp(work.bottom, legK);
      work.knee.copy(work.hip).addScaledVector(WORLD_UP, 0.16).addScaledVector(charRight, sign * 0.12).addScaledVector(charUp, -0.12);
      solveLeg(side, work.foot, work.knee, null);
    });
  }

  function limbsQuiet() {
    standFeet(0.08);
    eachHand((side, sign) => {
      worldPos(bone(`upperarm_${side}`), work.shoulder);
      work.hand.copy(work.shoulder).addScaledVector(charUp, -0.5).addScaledVector(charRight, sign * 0.16).addScaledVector(charForward, 0.04);
      work.elbow.copy(work.shoulder).addScaledVector(charUp, -0.22).addScaledVector(charRight, sign * 0.14).addScaledVector(charForward, 0.06);
      solveArm(side, work.hand, work.elbow, 0.25);
    });
  }

  function poseLimbs(id: MotionId, tool: Tool, k: number) {
    bar.visible = false;
    latBar.visible = false;
    dbL.visible = false;
    dbR.visible = false;
    cableA.visible = false;
    cableB.visible = false;
    if (id === "squat") return limbsSquat();
    if (id === "bench" || id === "incline") return limbsBench(k, id === "incline" ? tool : "bar", id === "incline");
    if (id === "pullup") return limbsPullup();
    if (id === "ohp") return limbsOhp(k);
    if (id === "deadlift") return limbsHinge(k, 0.23);
    if (id === "rdl") return limbsHinge(k, 0.36);
    if (id === "lunge") return limbsLunge(k, false);
    if (id === "split") return limbsLunge(k, true);
    if (id === "row") return limbsRow(k);
    if (id === "seated-row") return limbsSeatedRow(k);
    if (id === "chest-row") return limbsChestRow(k);
    if (id === "pulldown") return limbsPulldown(k);
    if (id === "facepull") return limbsFacepull(k);
    if (id === "curl") return limbsCurl(k, tool);
    if (id === "incline-curl") return limbsInclineCurl(k);
    if (id === "lateral") return limbsLateral(k);
    if (id === "reverse-fly") return limbsReverse(k, tool);
    if (id === "fly") return limbsFly(k);
    if (id === "pushdown") return limbsPushdown(k);
    if (id === "overhead-ext") return limbsOverhead(k, tool);
    if (id === "dips") return limbsDips();
    if (id === "legpress") return limbsLegPress(k, false);
    if (id === "calf-press") return limbsLegPress(k, true);
    if (id === "calf") return limbsCalf(k);
    if (id === "plank") return limbsPlank();
    if (id === "legcurl") return limbsLegCurl(k);
    if (id === "hipthrust") return limbsHip();
    if (id === "crunch") return limbsCrunch(k);
    if (id === "deadbug") return limbsDeadbug(k);
    return limbsQuiet();
  }

  function smoother(value: number) {
    const x = Math.min(1, Math.max(0, value));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  function sampleClock(now: number, phases: MotionPlan["phases"]) {
    const total = phases.reduce((sum, part) => sum + part.dur, 0) || 1;
    let t = ((now / 1000) % total + total) % total;
    const elapsed = t;
    for (const part of phases) {
      if (t <= part.dur) {
        const u = part.dur === 0 ? 1 : t / part.dur;
        return { k: part.a + (part.b - part.a) * smoother(u), label: part.label, progress: elapsed / total };
      }
      t -= part.dur;
    }
    return { k: 0, label: phases[0]?.label ?? "", progress: 0 };
  }

  let theta = 0.6;
  let phi = 1.15;
  let dist = 3.4;
  const lookTarget = new Vector3(0, 0.9, 0);
  const lookFrom = new Vector3();
  const lookTo = new Vector3();
  let camLerp = 1;
  let camFrom = { theta, phi, dist };
  let camTo = { theta, phi, dist };
  let vTheta = 0;
  let vPhi = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let painted = "";

  function updateCamera() {
    camera.position.setFromSphericalCoords(dist, phi, theta).add(lookTarget);
    camera.lookAt(lookTarget);
    key.target.position.copy(lookTarget);
  }

  function resize() {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 350;
    const height = canvas.clientHeight || 252;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function currentPlan() {
    return audit.override ?? hooks.getState().plan;
  }

  function applyCamera(plan: MotionPlan, instant: boolean) {
    camTo = { theta: plan.cam.theta, phi: plan.cam.phi, dist: plan.cam.dist };
    lookTo.set(plan.cam.target[0], plan.cam.target[1], plan.cam.target[2]);
    if (instant || reduced) {
      theta = camTo.theta;
      phi = camTo.phi;
      dist = camTo.dist;
      lookTarget.copy(lookTo);
      camLerp = 1;
    } else {
      camFrom = { theta, phi, dist };
      lookFrom.copy(lookTarget);
      camLerp = 0;
    }
    vTheta = 0;
    vPhi = 0;
  }

  const audit = {
    ready: false,
    firstFrameMs: null as number | null,
    triangles: 0,
    calls: 0,
    pixelRatio: 1,
    fps: 0,
    exercise: "",
    theme,
    glbBytes: 0,
    theta: 0,
    frozenK: undefined as number | undefined,
    override: null as MotionPlan | null,
    contextLost: 0,
    pose: undefined as { headY: number; handY: number; hipY: number; shoulderY: number; reach: number; footY: number } | undefined,
    setMotion(id: MotionId, tool?: Tool) {
      audit.override = motionById(id, tool);
      layoutKey = "";
      applyCamera(audit.override, true);
    },
    poseAt(k: number) {
      audit.frozenK = k;
    },
  };
  window.__audit = audit;

  function onLost(event: Event) {
    event.preventDefault();
    audit.contextLost += 1;
    fail();
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    camLerp = 1;
    canvas.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent) {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    theta -= dx * 0.01;
    phi = MathUtils.clamp(phi + dy * 0.008, 0.45, 1.7);
    vTheta = -dx * 0.01;
    vPhi = dy * 0.008;
    event.preventDefault();
  }
  function endDrag() {
    dragging = false;
  }

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(canvas);
  const themeObserver = new MutationObserver(() => {
    const next = document.documentElement.classList.contains("dark") ? "dark" : "light";
    if (next !== theme) {
      theme = next;
      audit.theme = theme;
      applyTheme();
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const onReduce = () => {
    reduced = reducedQuery.matches;
  };
  reducedQuery.addEventListener("change", onReduce);

  function calibrateScapula() {
    resetBones();
    actor.position.set(0, 0, 0);
    actor.rotation.set(0, 0, 0);
    updateAxes();
    const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
    const result: Record<string, Record<string, { axis: Vector3; sign: number }>> = { l: {}, r: {} };
    for (const side of ["l", "r"]) {
      const sign = side === "l" ? 1 : -1;
      const goals = {
        depress: new Vector3(0, -1, 0),
        retract: new Vector3(-sign * 0.25, -0.15, -1).normalize(),
      };
      for (const action of Object.keys(goals) as ("depress" | "retract")[]) {
        const clav = bone(`clavicle_${side}`);
        const shoulder = bone(`upperarm_${side}`);
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

  function buildShorts(mesh: SkinnedMesh) {
    const src = mesh.geometry;
    const pos = src.attributes.position;
    const nrm = src.attributes.normal;
    const idx = src.index;
    const si = src.attributes.skinIndex;
    const sw = src.attributes.skinWeight;
    if (!pos || !nrm || !idx || !si || !sw) return null;
    const map = new Map<number, number>();
    const positions: number[] = [];
    const normals: number[] = [];
    const ids: number[] = [];
    const skinI: number[] = [];
    const skinW: number[] = [];
    const take = (vertex: number) => {
      const y = pos.getY(vertex);
      const x = pos.getX(vertex);
      if (y < 0.73 || y > 0.995 || Math.abs(x) > 0.23) return -1;
      const known = map.get(vertex);
      if (known != null) return known;
      const id = positions.length / 3;
      map.set(vertex, id);
      const nx = nrm.getX(vertex);
      const ny = nrm.getY(vertex);
      const nz = nrm.getZ(vertex);
      positions.push(x + nx * 0.008, y + ny * 0.008, pos.getZ(vertex) + nz * 0.008);
      normals.push(nx, ny, nz);
      ids.push(muscleAt(x, y, pos.getZ(vertex)));
      skinI.push(si.getX(vertex), si.getY(vertex), si.getZ(vertex), si.getW(vertex));
      skinW.push(sw.getX(vertex), sw.getY(vertex), sw.getZ(vertex), sw.getW(vertex));
      return id;
    };
    const indices: number[] = [];
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
    shorts.frustumCulled = false;
    mesh.parent?.add(shorts);
    return { mesh: shorts, ids: new Float32Array(ids) };
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    alive = false;
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", endDrag);
    canvas.removeEventListener("pointercancel", endDrag);
    window.removeEventListener("resize", onResize);
    reducedQuery.removeEventListener("change", onReduce);
    resizeObserver.disconnect();
    themeObserver.disconnect();
    renderer.dispose();
    renderer.forceContextLoss();
    if (window.__audit === audit) delete window.__audit;
  }

  function fail() {
    if (!alive) return;
    hooks.onFail();
    stop();
  }

  resize();
  applyTheme();
  updateCamera();

  try {
    await MeshoptDecoder.ready;
    const bytes = await loadBodyBytes(modelUrl);
    if (!alive) {
      stop();
      return { stop };
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (!alive) {
      stop();
      return { stop };
    }
    const meshes: SkinnedMesh[] = [];
    gltf.scene.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) meshes.push(object as SkinnedMesh);
      if ((object as Bone).isBone) bones[object.name] = object as Bone;
    });
    const mesh = meshes[0];
    if (!mesh || !bones.pelvis) throw new Error("squelette");
    bodyMesh = mesh;
    bodyMesh.material = skinMat;
    bodyMesh.castShadow = true;
    bodyMesh.frustumCulled = false;
    const rig = bodyMesh.skeleton;
    skeleton = rig;
    actor.add(gltf.scene);
    actor.updateMatrixWorld(true);
    for (const item of rig.bones) {
      bindLocal.set(item.name, { p: item.position.clone(), q: item.quaternion.clone() });
      bindPos[item.name] = item.getWorldPosition(new Vector3());
    }
    for (const side of ["l", "r"]) {
      bone(`foot_${side}`).getWorldQuaternion((footBindQ[`foot_${side}`] = new Quaternion()));
    }
    armLen = bindPos.upperarm_l.distanceTo(bindPos.lowerarm_l) + bindPos.lowerarm_l.distanceTo(bindPos.hand_l);
    legLen = bindPos.thigh_l.distanceTo(bindPos.calf_l) + bindPos.calf_l.distanceTo(bindPos.foot_l);
    shoulderBindY = bindPos.upperarm_l.y;
    const pos = bodyMesh.geometry.attributes.position;
    const ids = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) ids[i] = muscleAt(pos.getX(i), pos.getY(i), pos.getZ(i));
    bodyMesh.geometry.setAttribute("aId", new BufferAttribute(ids, 1));
    bodyMesh.geometry.setAttribute("aRole", new BufferAttribute(new Float32Array(pos.count), 1));
    muscleIds.body = ids;
    const shorts = buildShorts(bodyMesh);
    if (shorts) {
      shortsMesh = shorts.mesh;
      muscleIds.shorts = shorts.ids;
    }
    scapula = calibrateScapula();
    audit.glbBytes = bytes.byteLength;
    const plan = currentPlan();
    applyCamera(plan, true);
    layout(plan.id, plan.tool);
    canvas.setAttribute("aria-label", `${hooks.getState().title}. Glissez pour tourner.`);
    hooks.onReady();
  } catch (error) {
    console.error(error);
    fail();
    return { stop };
  }

  const fpsWindow: number[] = [];
  let lastNow = performance.now();
  let visible = true;
  const onVisibility = () => {
    visible = document.visibilityState !== "hidden";
    if (visible) lastNow = performance.now();
  };
  document.addEventListener("visibilitychange", onVisibility);

  function frame(now: number) {
    if (!alive) return;
    requestAnimationFrame(frame);
    if (!visible || !bodyMesh || !muscleIds.body) return;
    const dt = now - lastNow;
    lastNow = now;
    if (dt > 0 && dt < 80) {
      fpsWindow.push(1000 / dt);
      if (fpsWindow.length > 60) fpsWindow.shift();
      audit.fps = fpsWindow.reduce((sum, value) => sum + value, 0) / fpsWindow.length;
    }
    const state = hooks.getState();
    const plan = audit.override ?? state.plan;
    layout(plan.id, plan.tool);
    const muscleKey = `${plan.id}:${state.muscles.join(",")}`;
    if (muscleKey !== painted) {
      painted = muscleKey;
      paintRoles(bodyMesh.geometry, muscleIds.body, state.muscles);
      if (shortsMesh && muscleIds.shorts) paintRoles(shortsMesh.geometry, muscleIds.shorts, state.muscles);
      if (audit.exercise !== plan.id) {
        audit.exercise = plan.id;
        applyCamera(plan, false);
      }
    }
    let k = 1;
    let label = plan.phases[1]?.label ?? plan.phases[0]?.label ?? "";
    let progress = 1;
    if (typeof audit.frozenK === "number" && !Number.isNaN(audit.frozenK)) {
      k = audit.frozenK;
    } else if (!reduced) {
      const sample = sampleClock(now, plan.phases);
      k = sample.k;
      label = sample.label;
      progress = sample.progress;
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
      phi = MathUtils.clamp(phi + vPhi, 0.45, 1.7);
      vTheta *= 0.9;
      vPhi *= 0.9;
    }
    placeActor(plan.id, k);
    updateAxes();
    resetBones();
    poseBody(plan.id, k, now);
    actor.updateMatrixWorld(true);
    poseLimbs(plan.id, plan.tool, k);
    if (bones.head) {
      worldPos(bones.head, tmp.a);
      worldPos(bone("hand_l"), tmp.b);
      worldPos(bone("pelvis"), tmp.c);
      worldPos(bone("upperarm_l"), tmp.d);
      audit.pose = {
        headY: +tmp.a.y.toFixed(3),
        handY: +tmp.b.y.toFixed(3),
        hipY: +tmp.c.y.toFixed(3),
        shoulderY: +tmp.d.y.toFixed(3),
        reach: +tmp.b.distanceTo(tmp.d).toFixed(3),
        footY: +bone("foot_l").getWorldPosition(work.foot).y.toFixed(3),
      };
    }
    updateCamera();
    applyTheme();
    renderer.render(scene, camera);
    audit.triangles = renderer.info.render.triangles;
    audit.calls = renderer.info.render.calls;
    audit.pixelRatio = renderer.getPixelRatio();
    audit.theta = theta;
    audit.theme = theme;
    if (!audit.ready) {
      audit.ready = true;
      audit.firstFrameMs = Math.round(performance.now() - started);
    }
    hooks.onFrame({ label, progress });
  }

  requestAnimationFrame(frame);

  const wrappedStop = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    stop();
  };
  return { stop: wrappedStop };
}
