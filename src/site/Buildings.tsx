/**
 * Neighbouring buildings (GUGiK BDOT10k outlines + storey counts) as rough 3D blocks, so the views
 * from the house show what is in the way. Walls follow the real outline; roofs are a gable or hip
 * over the outline's minimum bounding rectangle (flat for large or irregular footprints).
 *
 * Everything is merged into one vertex-coloured mesh per 400 m cell: few draw calls, and cells
 * behind the camera or outside the shadow frustum are culled.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { Building, Site } from '../geo/site';
import type { P2 } from '../placement/geom2d';
import { surfaceY } from './Landscape';

const CELL = 400;

const WALLS = ['#f2efe8', '#ece5d6', '#e6e2da', '#efe6cf', '#e8dcc6', '#f4f1ea', '#dcd8d0', '#efe4d2'];
const WALLS_OUT = ['#8a7560', '#77685a', '#9a9288', '#6f5c48'];
const ROOFS = ['#3a3c40', '#2f3134', '#4a3429', '#7d3a2b', '#5b4a42', '#454a4f', '#8d4632'];

/** deterministic pseudo-random in [0,1) from the outline */
function hash(ring: P2[], salt: number) {
  let h = 2166136261 ^ salt;
  for (const [x, z] of ring) h = Math.imul(h ^ Math.round(x * 10), 16777619) ^ Math.round(z * 10);
  return ((h >>> 0) % 10007) / 10007;
}

function signedArea(r: P2[]) {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, z0] = r[i], [x1, z1] = r[(i + 1) % r.length];
    a += x0 * z1 - x1 * z0;
  }
  return a / 2;
}

/** minimum-area bounding rectangle, aligned with one of the outline's edges */
export function minRect(r: P2[]) {
  let best = { area: Infinity, c: [0, 0] as P2, u: [1, 0] as P2, L: 0, W: 0 };
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, z] of r) {
      const u = x * ux + z * uz, v = -x * uz + z * ux;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const c: P2 = [cu * ux - cv * uz, cu * uz + cv * ux];
      // u = long axis
      best = u1 - u0 >= v1 - v0
        ? { area, c, u: [ux, uz], L: u1 - u0, W: v1 - v0 }
        : { area, c, u: [-uz, ux], L: v1 - v0, W: u1 - u0 };
    }
  }
  return best;
}

/** wall height above the highest ground at the outline, from BDOT10k's storey count */
export function eaveHeight(b: Building) {
  const L = Math.max(1, b.levels);
  switch (b.kind) {
    case 'h': return L === 1 ? 3.1 : L === 2 ? 4.8 : 2.9 * L - 1.2; // a 2-storey house is usually ground floor + attic
    case 'o': return 2.6 + 2.6 * (L - 1);
    case 'r': return 11;
    default: return 3.6 * L;
  }
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  /** flat-shaded triangle (normal from the winding) */
  tri(a: number[], b: number[], c: number[], color: string) {
    this.tmp.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.tmp2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.tmp.cross(this.tmp2).normalize();
    this.c.set(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(this.tmp.x, this.tmp.y, this.tmp.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
  }
  /** quad a-b-c-d (counter-clockwise seen from the front) */
  quad(a: number[], b: number[], c: number[], d: number[], color: string) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function addBuilding(B: Builder, site: Site, b: Building) {
  let ring = b.ring;
  if (signedArea(ring) < 0) ring = [...ring].reverse(); // counter-clockwise in (x, z)
  const area = Math.abs(signedArea(ring));
  if (area < 6) return; // sheds and noise

  // ground: lowest point (walls go down to it) and highest point (storeys count from it)
  let gMin = Infinity, gMax = -Infinity;
  const ground = ring.map(([x, z]) => surfaceY(site, x, z));
  for (const g of ground) { gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); }
  const y0 = gMin - 0.5;
  const ye = gMax + eaveHeight(b);

  const r = hash(ring, 1);
  const wall = b.kind === 'o' && r < 0.5 ? WALLS_OUT[Math.floor(hash(ring, 2) * WALLS_OUT.length)] : WALLS[Math.floor(hash(ring, 3) * WALLS.length)];
  const roofC = b.underConstruction ? '#9b9b96' : ROOFS[Math.floor(hash(ring, 4) * ROOFS.length)];

  // walls (outward normal of edge a→b is (dz, −dx) for a counter-clockwise ring)
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    B.quad([ax, y0, az], [ax, ye, az], [bx, ye, bz], [bx, y0, bz], wall);
  }

  const rect = minRect(ring);
  const fill = area / rect.area;
  const flat = b.underConstruction || fill < 0.62 || (b.kind === 'c' && area > 250) || rect.W > 22;
  if (flat) {
    const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) {
      const p = (n: number) => [ring[n][0], ye + 0.25, ring[n][1]];
      B.tri(p(i), p(k), p(j), roofC);
    }
    return;
  }

  const pitchDeg = b.kind === 'h' ? 35 + hash(ring, 5) * 10 : b.kind === 'r' ? 50 : b.kind === 'o' ? 25 + hash(ring, 6) * 10 : 15;
  const t = Math.tan((pitchDeg * Math.PI) / 180);
  const ov = b.kind === 'h' ? 0.5 : 0.25;
  const hip = b.kind === 'h' && rect.L / rect.W < 1.7 && hash(ring, 7) < 0.45;
  const [cx, cz] = rect.c, [ux, uz] = rect.u;
  const vx = -uz, vz = ux;
  const at = (u: number, v: number, y: number) => [cx + ux * u + vx * v, y, cz + uz * u + vz * v];
  const hu = rect.L / 2, hv = rect.W / 2;
  const yEave = ye - ov * t;
  const yRidge = ye + hv * t;
  const ru = hip ? Math.max(0, hu - hv) : hu + ov; // ridge half-length
  const eu = hu + ov, ev = hv + ov;
  // two long slopes (v− and v+)
  B.quad(at(-eu, -ev, yEave), at(eu, -ev, yEave), at(ru, 0, yRidge), at(-ru, 0, yRidge), roofC);
  B.quad(at(eu, ev, yEave), at(-eu, ev, yEave), at(-ru, 0, yRidge), at(ru, 0, yRidge), roofC);
  if (hip) {
    B.tri(at(eu, -ev, yEave), at(eu, ev, yEave), at(ru, 0, yRidge), roofC);
    B.tri(at(-eu, ev, yEave), at(-eu, -ev, yEave), at(-ru, 0, yRidge), roofC);
  } else {
    // gable walls in the plane of the end walls
    B.tri(at(hu, -hv, ye), at(hu, hv, ye), at(hu, 0, yRidge), wall);
    B.tri(at(-hu, hv, ye), at(-hu, -hv, ye), at(-hu, 0, yRidge), wall);
  }
}

export function buildNeighbourCells(site: Site) {
  const cells = new Map<string, Builder>();
  for (const b of site.buildings) {
    const [x, z] = b.ring[0];
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let B = cells.get(key);
    if (!B) cells.set(key, (B = new Builder()));
    addBuilding(B, site, b);
  }
  return [...cells.values()].filter((B) => B.pos.length).map((B) => B.geometry());
}

export function Buildings({ site, visible }: { site: Site; visible: boolean }) {
  const geoms = useMemo(() => buildNeighbourCells(site), [site]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => () => { geoms.forEach((g) => g.dispose()); }, [geoms]);
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => invalidate(), [visible, invalidate]);
  return (
    <group name="neighbour-buildings" visible={visible}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} castShadow receiveShadow />
      ))}
    </group>
  );
}
