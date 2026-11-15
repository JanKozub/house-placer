/**
 * Parked cars. The body is lofted from cross-sections along the car, so it has curved flanks, a
 * rounded nose and tail, wheel arches, a cabin that leans in towards the roof, and separate glass
 * for the windscreen, the side windows (between pillars) and the rear window. Around it: alloy
 * wheels in dark wells, lights, grille, number plates, mirrors, door handles and roof rails.
 * Two body styles (a compact SUV and a hatchback) are picked per car. Car front = local +x.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { Site } from '../geo/site';
import { useCars, type Car } from '../store';
import { carvedHeight, type PlatformSpec } from './Terrain';

const L = 4.6, W = 1.82;
const HW = W / 2;
/** axle positions along the car and half the track */
const AXLE_F = 1.42, AXLE_R = -1.45, TRACK = HW - 0.14;
const WHEEL_R = 0.335, ARCH_R = 0.41;

export interface CarStyle {
  name: 'suv' | 'hatch';
  roofH: number;
  clearance: number;
  /** nose and tail height of the body, belt line at the windscreen base and at the rear */
  noseH: number;
  tailH: number;
  cowlH: number;
  beltRear: number;
  /** x of: windscreen base, front and rear end of the roof, rear-window base */
  cowl: number;
  roofF: number;
  roofR: number;
  tailBase: number;
  /** x of the pillars between the side windows */
  pillars: number[];
  rails: boolean;
}

export const CAR_STYLES: CarStyle[] = [
  { name: 'suv', roofH: 1.62, clearance: 0.24, noseH: 0.86, tailH: 1.0, cowlH: 1.06, beltRear: 1.12, cowl: 0.98, roofF: 0.32, roofR: -1.45, tailBase: -2.08, pillars: [-0.22, -1.32], rails: true },
  { name: 'hatch', roofH: 1.46, clearance: 0.17, noseH: 0.74, tailH: 0.92, cowlH: 0.96, beltRear: 1.02, cowl: 1.02, roofF: 0.28, roofR: -1.25, tailBase: -2.0, pillars: [-0.25, -1.22], rails: false },
];

/** which style a car gets: by its id, so it is the same on every visit */
export function carStyle(id: string): CarStyle {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CAR_STYLES[h % CAR_STYLES.length];
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** the cross-section at x: ten points from the middle of the floor, round the flank, to the middle of the roof (z, y) */
export function carSection(st: CarStyle, x: number): [number, number][] {
  const hl = L / 2, ax = Math.abs(x);
  // plan: slightly barrel-shaped, with rounded corners at both ends
  let w = HW * (1 - 0.09 * Math.pow(clamp((ax - 1.2) / 1.1), 2));
  const u = clamp((ax - (hl - 0.32)) / 0.32);
  w *= 0.6 + 0.4 * Math.sqrt(1 - u * u);
  // top of the lower body: bonnet, belt line, tail
  let belt: number;
  if (x > st.cowl) belt = st.noseH + (st.cowlH - st.noseH) * (1 - Math.pow((x - st.cowl) / (hl - st.cowl), 2.2));
  else if (x > st.tailBase) belt = mix(st.cowlH, st.beltRear, (st.cowl - x) / (st.cowl - st.tailBase));
  else belt = mix(st.beltRear, st.tailH, smooth(st.tailBase, -hl, x));
  // cabin: windscreen, roof, rear window
  let top = belt;
  if (x < st.cowl && x > st.tailBase) {
    if (x > st.roofF) top = belt + (st.roofH - belt) * (1 - Math.pow(1 - (st.cowl - x) / (st.cowl - st.roofF), 1.7));
    else if (x > st.roofR) top = st.roofH - 0.035 * Math.pow((st.roofF - x) / (st.roofF - st.roofR), 2);
    else top = belt + (st.roofH - 0.035 - belt) * (1 - Math.pow(1 - (x - st.tailBase) / (st.roofR - st.tailBase), 1.9));
  }
  const hc = top - belt, cab = smooth(0, 0.14, hc);
  // underside, lifted into an arch over each wheel
  let yb = st.clearance + 0.05 * u;
  for (const xw of [AXLE_F, AXLE_R]) {
    const d = Math.abs(x - xw);
    if (d < ARCH_R) yb = Math.max(yb, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - d * d));
  }
  const wcb = w - 0.065, wct = wcb - 0.2 * clamp(hc / 0.5);
  const p7: [number, number] = [mix(w - 0.2, wct + 0.03, cab), mix(belt + 0.015, top - 0.06, cab)];
  const p8: [number, number] = [mix(w - 0.36, wct - 0.1, cab), mix(belt + 0.03, top - 0.006, cab)];
  const p9: [number, number] = [0, mix(belt + 0.045, top + 0.02, cab)];
  const side = Math.min(yb + 0.16, belt - 0.2);
  return [
    [0, yb], [w * 0.7, yb], [w * 0.95, yb + 0.06], [w, side], [w * 1.005, (side + belt) / 2], [w * 0.985, belt - 0.05], [wcb, belt], p7, p8, p9,
  ];
}

type Part = 'paint' | 'glass' | 'trim';

/** which material a strip of the body gets: `seg` = between section points seg and seg + 1, xm = middle of the strip along the car */
export function carPart(st: CarStyle, seg: number, xm: number): Part {
  if (seg <= 2) return 'trim'; // underside, sill and the cladding that follows the wheel arches
  const inCabin = xm < st.cowl && xm > st.tailBase;
  if (seg === 6 && inCabin && xm < st.cowl - 0.34 && xm > st.tailBase + 0.42 && !st.pillars.some((p) => Math.abs(xm - p) < 0.055)) return 'glass';
  if (seg === 8 && ((xm > st.roofF + 0.03 && xm < st.cowl - 0.05) || (xm > st.tailBase + 0.06 && xm < st.roofR - 0.04))) return 'glass';
  return 'paint';
}

/** the body as three geometries (paint, glass, dark trim), lofted from the cross-sections */
export function carBody(st: CarStyle): Record<Part, THREE.BufferGeometry> {
  // stations: every 8 cm, finer round the wheel arches, and exactly at every change of material
  const xs = new Set<number>();
  const add = (x: number) => xs.add(Math.round(clamp(x, -L / 2, L / 2) * 1000) / 1000);
  for (let x = -L / 2; x <= L / 2 + 1e-6; x += 0.08) add(x);
  for (const xw of [AXLE_F, AXLE_R]) for (let d = -ARCH_R; d <= ARCH_R + 1e-6; d += ARCH_R / 8) add(xw + d);
  for (const b of [st.cowl, st.roofF, st.roofR, st.tailBase, st.cowl - 0.34, st.tailBase + 0.42, st.roofF + 0.03, st.cowl - 0.05, st.tailBase + 0.06, st.roofR - 0.04, ...st.pillars.flatMap((p) => [p - 0.055, p + 0.055])]) add(b);
  const stations = [...xs].sort((a, b) => a - b);
  const R = 18; // points round a section
  const pos: number[] = [];
  for (const x of stations) {
    const half = carSection(st, x);
    const ring = [...half, ...half.slice(1, 9).reverse().map(([z, y]): [number, number] => [-z, y])];
    for (const [z, y] of ring) pos.push(x, y, z);
  }
  const idx: Record<Part, number[]> = { paint: [], glass: [], trim: [] };
  for (let i = 0; i + 1 < stations.length; i++) {
    const xm = (stations[i] + stations[i + 1]) / 2;
    for (let j = 0; j < R; j++) {
      const a = i * R + j, b = i * R + ((j + 1) % R), c = (i + 1) * R + j, d = (i + 1) * R + ((j + 1) % R);
      idx[carPart(st, j < 9 ? j : 17 - j, xm)].push(a, b, c, b, d, c);
    }
  }
  // close both ends
  for (const [i, flip] of [[0, false], [stations.length - 1, true]] as [number, boolean][]) {
    const c = pos.length / 3;
    let y = 0;
    for (let j = 0; j < R; j++) y += pos[(i * R + j) * 3 + 1] / R;
    pos.push(stations[i], y, 0);
    for (let j = 0; j < R; j++) {
      const a = i * R + j, b = i * R + ((j + 1) % R);
      idx.paint.push(...(flip ? [c, a, b] : [c, b, a]));
    }
  }
  const out = {} as Record<Part, THREE.BufferGeometry>;
  for (const k of ['paint', 'glass', 'trim'] as Part[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx[k]);
    g.computeVertexNormals();
    out[k] = g;
  }
  // faces must look outwards: the roof's normal points up
  const roofTri = idx.paint.length ? out.paint : out.glass;
  const n = roofTri.getAttribute('normal'), p = roofTri.getAttribute('position');
  let up = 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > st.roofH - 0.05) up += n.getY(i);
  if (up < 0) for (const k of ['paint', 'glass', 'trim'] as Part[]) {
    const ix = out[k].getIndex()!;
    for (let i = 0; i < ix.count; i += 3) { const t = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, t); }
    out[k].computeVertexNormals();
  }
  return out;
}

/** one wheel, axle along z, outer face at +z: a rounded tyre, an alloy rim with five spokes, a brake disc */
function wheelGeometries() {
  const tyre = new THREE.LatheGeometry(
    ([[0.2, -0.115], [0.3, -0.12], [0.328, -0.09], [WHEEL_R, 0], [0.328, 0.09], [0.3, 0.12], [0.2, 0.115]] as [number, number][]).map(([r, z]) => new THREE.Vector2(r, z)),
    28,
  );
  tyre.rotateX(Math.PI / 2);
  const rim: THREE.BufferGeometry[] = [];
  const barrel = new THREE.CylinderGeometry(0.215, 0.215, 0.2, 24, 1, true).rotateX(Math.PI / 2);
  rim.push(barrel);
  rim.push(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 14).rotateX(Math.PI / 2).translate(0, 0, 0.1));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    rim.push(new THREE.BoxGeometry(0.2, 0.045, 0.03).translate(0.115, 0, 0.095).rotateZ(a));
  }
  const disc = new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20).rotateX(Math.PI / 2).translate(0, 0, 0.03);
  return { tyre, rim: mergeAll(rim), disc };
}

function mergeAll(list: THREE.BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nrm.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}

/** everything bolted onto the body, grouped by material */
function carDetails(st: CarStyle) {
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0) => new THREE.BoxGeometry(sx, sy, sz).rotateY(ry).translate(x, y, z);
  const hl = L / 2, dark: THREE.BufferGeometry[] = [], head: THREE.BufferGeometry[] = [], tail: THREE.BufferGeometry[] = [], chrome: THREE.BufferGeometry[] = [], white: THREE.BufferGeometry[] = [], paint: THREE.BufferGeometry[] = [];
  const noseW = carSection(st, hl - 0.06)[3][0], tailW = carSection(st, -hl + 0.06)[3][0];
  // front: grille, lower intake, headlamps wrapping the corners, plate
  dark.push(box(0.05, 0.17, noseW * 1.25, hl - 0.015, st.noseH - 0.2, 0));
  dark.push(box(0.05, 0.12, noseW * 1.6, hl - 0.03, st.clearance + 0.17, 0));
  for (const s of [-1, 1]) head.push(box(0.1, 0.085, 0.4, hl - 0.11, st.noseH - 0.09, s * (noseW - 0.05), s * -0.5));
  white.push(box(0.02, 0.11, 0.5, hl + 0.012, st.clearance + 0.33, 0));
  // rear: lamps wrapping the corners with a strip between them, plate, dark bumper insert
  for (const s of [-1, 1]) tail.push(box(0.1, 0.11, 0.38, -hl + 0.1, st.tailH - 0.07, s * (tailW - 0.06), s * 0.5));
  tail.push(box(0.03, 0.03, tailW * 1.3, -hl + 0.02, st.tailH - 0.05, 0));
  white.push(box(0.02, 0.11, 0.5, -hl - 0.012, st.tailH - 0.32, 0));
  dark.push(box(0.05, 0.14, tailW * 1.5, -hl + 0.03, st.clearance + 0.16, 0));
  // dark wells behind the wheels, so nothing shows through the arches
  for (const xw of [AXLE_F, AXLE_R]) dark.push(box(ARCH_R * 2 - 0.04, WHEEL_R + ARCH_R - st.clearance, (TRACK - 0.13) * 2, xw, (st.clearance + WHEEL_R + ARCH_R) / 2, 0));
  // mirrors, door handles, roof rails, a shark-fin aerial
  const beltAt = (x: number) => carSection(st, x)[6];
  for (const s of [-1, 1]) {
    const [mz, my] = beltAt(st.cowl - 0.2);
    paint.push(box(0.09, 0.1, 0.2, st.cowl - 0.2, my + 0.07, s * (mz + 0.13)));
    dark.push(box(0.05, 0.03, 0.1, st.cowl - 0.2, my + 0.03, s * (mz + 0.04)));
    for (const x of [st.pillars[0] + 0.72, st.pillars[0] - 0.3]) {
      const [hz, hy] = carSection(st, x)[5];
      chrome.push(box(0.16, 0.025, 0.02, x, hy - 0.06, s * (hz + 0.012)));
    }
    if (st.rails) dark.push(box(st.roofF - st.roofR - 0.25, 0.035, 0.04, (st.roofF + st.roofR) / 2, st.roofH + 0.012, s * 0.5));
  }
  dark.push(box(0.16, 0.05, 0.04, st.roofR + 0.2, st.roofH + 0.01, 0));
  return { dark: mergeAll(dark), head: mergeAll(head), tail: mergeAll(tail), chrome: mergeAll(chrome), white: mergeAll(white), paint: mergeAll(paint) };
}

function makeGeometries() {
  return { wheel: wheelGeometries(), styles: new Map(CAR_STYLES.map((st) => [st.name, { body: carBody(st), details: carDetails(st) }])) };
}

/** wheels: front left / right, rear left / right (x along the car, z across) */
const WHEELS: [number, number][] = [[AXLE_F, TRACK], [AXLE_F, -TRACK], [AXLE_R, TRACK], [AXLE_R, -TRACK]];

type Mats = Record<'glass' | 'tyre' | 'rim' | 'head' | 'tail' | 'dark' | 'chrome' | 'white' | 'disc', THREE.Material>;

function CarModel({ car, site, platforms, geo, mats }: { car: Car; site: Site; platforms: PlatformSpec[]; geo: ReturnType<typeof makeGeometries>; mats: Mats }) {
  // metallic paint under a clear coat
  const paint = useMemo(() => new THREE.MeshPhysicalMaterial({ color: car.color, metalness: 0.75, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 }), [car.color]);
  useEffect(() => () => paint.dispose(), [paint]);
  const { body, details } = geo.styles.get(carStyle(car.id).name)!;
  // stand on the ground under the wheels
  const c = Math.cos(car.rot), s = Math.sin(car.rot);
  const hs = WHEELS.map(([wx, wz]) => carvedHeight(site, car.x + wx * c + wz * s, car.z - wx * s + wz * c, platforms));
  const y = hs.reduce((a, b) => a + b, 0) / hs.length - site.baseH + (car.lift ?? 0);
  // and tilt with it (a sloping drive): pitch from front vs rear axle, roll from left vs right
  const pitch = Math.atan2((hs[0] + hs[1] - hs[2] - hs[3]) / 2, WHEELS[0][0] - WHEELS[2][0]);
  const roll = -Math.atan2((hs[0] + hs[2] - hs[1] - hs[3]) / 2, WHEELS[0][1] - WHEELS[1][1]);
  return (
    <group position={[car.x, y, car.z]} rotation={[0, car.rot, 0]} name={`car-${car.id}`}>
     <group rotation={[roll, 0, pitch]}>
      <mesh geometry={body.paint} material={paint} castShadow receiveShadow />
      <mesh geometry={body.glass} material={mats.glass} />
      <mesh geometry={body.trim} material={mats.dark} castShadow />
      <mesh geometry={details.paint} material={paint} castShadow />
      <mesh geometry={details.dark} material={mats.dark} />
      <mesh geometry={details.head} material={mats.head} />
      <mesh geometry={details.tail} material={mats.tail} />
      <mesh geometry={details.chrome} material={mats.chrome} />
      <mesh geometry={details.white} material={mats.white} />
      {WHEELS.map(([wx, wz], i) => (
        <group key={i} position={[wx, WHEEL_R, wz]} rotation={[0, wz < 0 ? Math.PI : 0, 0]}>
          <mesh geometry={geo.wheel.tyre} material={mats.tyre} castShadow />
          <mesh geometry={geo.wheel.rim} material={mats.rim} />
          <mesh geometry={geo.wheel.disc} material={mats.disc} />
        </group>
      ))}
     </group>
    </group>
  );
}

export function Cars({ site, platforms }: { site: Site; platforms: PlatformSpec[] }) {
  const cars = useCars();
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(makeGeometries, []);
  const mats = useMemo<Mats>(
    () => ({
      glass: new THREE.MeshStandardMaterial({ color: '#0f151a', metalness: 0.7, roughness: 0.05, envMapIntensity: 1.6 }),
      tyre: new THREE.MeshStandardMaterial({ color: '#131415', roughness: 0.92 }),
      rim: new THREE.MeshStandardMaterial({ color: '#c3c7cb', metalness: 0.9, roughness: 0.28, side: THREE.DoubleSide }),
      disc: new THREE.MeshStandardMaterial({ color: '#4a4d50', metalness: 0.7, roughness: 0.5 }),
      head: new THREE.MeshStandardMaterial({ color: '#eef3f7', emissive: '#59606a', roughness: 0.15, metalness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: '#a11212', emissive: '#3a0606', roughness: 0.25 }),
      dark: new THREE.MeshStandardMaterial({ color: '#191b1d', roughness: 0.75 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#d8dbde', metalness: 1, roughness: 0.15 }),
      white: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.6 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geo.wheel).forEach((g) => g.dispose());
      geo.styles.forEach((s) => { Object.values(s.body).forEach((g) => g.dispose()); Object.values(s.details).forEach((g) => g.dispose()); });
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geo, mats],
  );
  useEffect(() => invalidate(), [cars, invalidate]);
  return (
    <group name="cars">
      {cars.map((c) => (
        <CarModel key={c.id} car={c} site={site} platforms={platforms} geo={geo} mats={mats} />
      ))}
    </group>
  );
}

/** car length / width, for picking in the plan view */
export const CAR_SIZE = { length: L, width: W };
