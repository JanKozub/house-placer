import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Site } from '../geo/site';
import { useGarden, useGates, useStore, useTrees, type Tree, type TreeKind } from '../store';
import { pointInPolygon, type P2 } from '../placement/geom2d';
import { carvedHeight, type PlatformSpec } from './Terrain';
import type { Gate } from './sitePlan';

function rng(seedStr: string) {
  let s = 0;
  for (const c of seedStr) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function blob(r: number, detail: number, rand: () => number) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.8 + rand() * 0.4;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function treeGeometry(t: Tree) {
  const r = rng(t.id);
  const H = t.height;
  const trunk: THREE.BufferGeometry[] = [];
  const crown: THREE.BufferGeometry[] = [];
  const add = (arr: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    arr.push(g.index ? g.toNonIndexed() : g);
  };
  switch (t.kind as TreeKind) {
    case 'deciduous': {
      add(trunk, new THREE.CylinderGeometry(0.06 * H * 0.25, 0.1 * H * 0.25, H * 0.5, 7), 0, H * 0.25, 0);
      const cr = H * 0.28;
      for (let i = 0; i < 6; i++) {
        const a = r() * Math.PI * 2, d = r() * cr * 0.6;
        add(crown, blob(cr * (0.55 + r() * 0.35), 1, r), Math.cos(a) * d, H * 0.62 + (r() - 0.3) * cr * 0.8, Math.sin(a) * d);
      }
      break;
    }
    case 'birch': {
      add(trunk, new THREE.CylinderGeometry(0.06, 0.1, H * 0.7, 7), 0, H * 0.35, 0);
      const cr = H * 0.18;
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, d = r() * cr * 0.7;
        add(crown, blob(cr * (0.45 + r() * 0.3), 1, r), Math.cos(a) * d, H * (0.5 + r() * 0.42), Math.sin(a) * d);
      }
      break;
    }
    case 'conifer': {
      add(trunk, new THREE.CylinderGeometry(0.06, 0.1, H * 0.2, 6), 0, H * 0.1, 0);
      const rad = H * 0.2;
      for (let i = 0; i < 4; i++) {
        const f = i / 4;
        const c = new THREE.ConeGeometry(rad * (1 - f * 0.55), H * 0.42, 9);
        add(crown, c, 0, H * (0.3 + f * 0.48), 0);
      }
      break;
    }
    case 'shrub': {
      for (let i = 0; i < 3; i++) {
        const a = r() * Math.PI * 2, d = r() * H * 0.3;
        add(crown, blob(H * (0.35 + r() * 0.2), 1, r), Math.cos(a) * d, H * 0.35, Math.sin(a) * d);
      }
      break;
    }
  }
  return {
    trunk: trunk.length ? mergeGeometries(trunk.map(stripAttrs)) : null,
    crown: mergeGeometries(crown.map(stripAttrs)),
  };
}

function stripAttrs(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g;
}

const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 0.95 });
const birchMat = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.8 });
const leafMats: Partial<Record<TreeKind, THREE.MeshStandardMaterial>> = {
  deciduous: new THREE.MeshStandardMaterial({ color: '#4f7a2e', roughness: 0.85, flatShading: true }),
  birch: new THREE.MeshStandardMaterial({ color: '#7ea04a', roughness: 0.85, flatShading: true }),
  conifer: new THREE.MeshStandardMaterial({ color: '#2f5230', roughness: 0.9, flatShading: true }),
  shrub: new THREE.MeshStandardMaterial({ color: '#557f35', roughness: 0.9, flatShading: true }),
};

/** kinds drawn one mesh per tree (few, large); every other kind goes into one merged mesh */
const BIG = new Set<TreeKind>(['deciduous', 'birch', 'conifer', 'shrub']);
export const isBigTree = (k: TreeKind) => BIG.has(k);

/** one material for all small plants and garden objects: colours are per vertex */
const plantMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true, vertexColors: true });

/** paint a geometry: one colour, or a gradient from `c0` at the bottom to `c1` at the top */
function tint(g: THREE.BufferGeometry, c0: string, c1 = c0, shade = 0) {
  const ng = stripAttrs(g.index ? g.toNonIndexed() : g);
  const p = ng.getAttribute('position');
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) { y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); }
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, y1 > y0 ? (p.getY(i) - y0) / (y1 - y0) : 0).offsetHSL(0, 0, shade);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

/**
 * Small plants and garden objects, in their own frame (standing at the origin), coloured per vertex:
 * thuja 'Smaragd' (a narrow cone, dense to the ground), ornamental grass, lavender, hydrangea,
 * clipped box ball, ball-headed tree on a stem, red Japanese maple, boulder, fire bowl.
 * Slightly different from plant to plant, the same on every visit.
 */
export function plantGeometry(t: Tree): THREE.BufferGeometry {
  const r = rng(t.id), H = t.height, parts: THREE.BufferGeometry[] = [];
  const shade = (r() - 0.5) * 0.05;
  const jitter = (g: THREE.BufferGeometry, k = 0.14) => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const f = 1 - k / 2 + r() * k; p.setXYZ(i, p.getX(i) * f, p.getY(i), p.getZ(i) * f); }
    return g;
  };
  const ball = (rad: number, x: number, y: number, z: number, sy = 1, detail = 1) => new THREE.IcosahedronGeometry(rad, detail).scale(1, sy, 1).translate(x, y, z);
  const lathe = (profile: [number, number][], R: number, seg = 8) => new THREE.LatheGeometry(profile.map(([k, y]) => new THREE.Vector2(R * k, H * y)), seg, r() * Math.PI);
  switch (t.kind) {
    case 'thuja': {
      const R = Math.min(0.42, H * 0.18) * (0.92 + r() * 0.16);
      parts.push(tint(jitter(lathe([[0.55, 0.02], [0.95, 0.12], [1, 0.3], [0.86, 0.55], [0.55, 0.8], [0.2, 0.95], [0.001, 1]], R)), '#3a6a3b', '#4a7d45', shade));
      break;
    }
    case 'grass': {
      // a tuft of long blades arching outwards, green at the base and straw-coloured at the tips
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + r() * 0.6, lean = i < 3 ? 0.06 + r() * 0.08 : 0.22 + r() * 0.26, h = H * (0.72 + r() * 0.3);
        parts.push(tint(new THREE.ConeGeometry(H * 0.055, h, 4).translate(0, h / 2, 0).rotateZ(lean).rotateY(a), '#4f8038', '#cfc587', shade));
      }
      break;
    }
    case 'lavender':
      parts.push(tint(jitter(ball(H * 0.75, 0, H * 0.45, 0, 0.7), 0.2), '#58764a', '#7a5fb0', shade));
      break;
    case 'fescue': {
      // a low blue-grey tuft (kostrzewa sina)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r() * 0.6, lean = 0.25 + r() * 0.45, h = H * (0.8 + r() * 0.35);
        parts.push(tint(new THREE.ConeGeometry(H * 0.09, h, 4).translate(0, h / 2, 0).rotateZ(lean).rotateY(a), '#7f989c', '#c3d0cf', shade));
      }
      break;
    }
    case 'perennial': {
      // a mound of leaves with pink daisy heads over it (jeżówka)
      parts.push(tint(jitter(ball(H * 0.55, 0, H * 0.4, 0, 0.75), 0.2), '#466f39', '#5a8744', shade));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r(), d = i < 2 ? H * 0.1 : H * 0.42;
        parts.push(tint(ball(H * 0.13, Math.cos(a) * d, H * (i < 2 ? 0.98 : 0.78), Math.sin(a) * d, 0.55), '#c96a9c', '#e79bbd'));
      }
      break;
    }
    case 'pot': {
      // a tall dark planter with a clipped ball in it
      const w = Math.min(0.55, H * 0.55), ph = H * 0.52;
      parts.push(tint(new THREE.BoxGeometry(w, ph, w).translate(0, ph / 2, 0), '#33363a', '#3f4347'));
      parts.push(tint(new THREE.BoxGeometry(w * 0.86, 0.02, w * 0.86).translate(0, ph + 0.005, 0), '#2a2018'));
      parts.push(tint(ball(H * 0.3, 0, ph + H * 0.24, 0, 1, 2), '#2f5a2c', '#3f7437', shade));
      break;
    }
    case 'bollard': {
      // a lantern on a short post: dark frame, warm light
      parts.push(tint(new THREE.BoxGeometry(0.07, H * 0.62, 0.07).translate(0, H * 0.31, 0), '#25282b'));
      parts.push(tint(new THREE.BoxGeometry(0.15, H * 0.3, 0.15).translate(0, H * 0.77, 0), '#ffd27a', '#fff0c4'));
      parts.push(tint(new THREE.BoxGeometry(0.19, H * 0.06, 0.19).translate(0, H * 0.95, 0), '#25282b'));
      parts.push(tint(new THREE.BoxGeometry(0.17, H * 0.03, 0.17).translate(0, H * 0.615, 0), '#25282b'));
      break;
    }
    case 'boxwood':
      parts.push(tint(ball(H * 0.5, 0, H * 0.5, 0, 1, 2), '#2f5a2c', '#3b6d35', shade));
      break;
    case 'hydrangea': {
      parts.push(tint(jitter(ball(H * 0.5, 0, H * 0.45, 0, 0.85), 0.2), '#3f6a35', '#4f7d3d', shade));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r(), d = i ? H * 0.32 : 0;
        parts.push(tint(ball(H * 0.17, Math.cos(a) * d, H * (i ? 0.72 : 0.9), Math.sin(a) * d), '#f1eddf', '#fbf9f1'));
      }
      break;
    }
    case 'globe': {
      // a clipped ball on a clear stem (klon kulisty)
      parts.push(tint(new THREE.CylinderGeometry(0.045, 0.06, H * 0.56, 7).translate(0, H * 0.28, 0), '#5b4632'));
      parts.push(tint(ball(H * 0.26, 0, H * 0.74, 0, 1, 2), '#3f6d30', '#5a8d3e', shade));
      break;
    }
    case 'maple': {
      // low and wide, red-leaved (klon palmowy)
      parts.push(tint(new THREE.CylinderGeometry(0.03, 0.06, H * 0.5, 6).translate(0, H * 0.25, 0), '#4a3626'));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + r(), d = i ? H * 0.3 : 0;
        parts.push(tint(jitter(ball(H * (i ? 0.26 : 0.3), Math.cos(a) * d, H * (i ? 0.62 : 0.78), Math.sin(a) * d, 0.7), 0.2), '#8c2a26', '#b8433a', shade));
      }
      break;
    }
    case 'rock':
      parts.push(tint(jitter(ball(H * 0.75, 0, H * 0.35, 0, 0.62), 0.35), '#84827d', '#a3a19b', shade));
      break;
    case 'firepit': {
      // a ring of stone with a steel bowl and embers
      parts.push(tint(new THREE.CylinderGeometry(H * 1.5, H * 1.6, H, 14).translate(0, H / 2, 0), '#8d8a84', '#a09d96'));
      parts.push(tint(new THREE.CylinderGeometry(H * 1.2, H * 1.2, 0.02, 14).translate(0, H + 0.011, 0), '#26221f'));
      parts.push(tint(new THREE.ConeGeometry(H * 0.5, H * 0.9, 6).translate(0, H * 1.45, 0), '#e2571c', '#ffc24a'));
      break;
    }
    default:
      parts.push(tint(ball(Math.max(0.2, H * 0.4), 0, H * 0.4, 0), '#557f35'));
  }
  return mergeGeometries(parts)!;
}

export function Trees({ site, platform }: { site: Site; platform: PlatformSpec | PlatformSpec[] | null }) {
  const all = useTrees();
  const trees = useMemo(() => all.filter((t) => isBigTree(t.kind)), [all]);
  const geoms = useMemo(() => new Map(trees.map((t) => [t.id + t.kind + t.height, treeGeometry(t)])), [trees]);
  // hedges, perennials and garden objects are many and small: one merged mesh for all of them,
  // standing on the shaped ground. Their own shapes are kept, only the placing is redone on a move.
  const shapes = useMemo(() => new Map(all.filter((t) => !isBigTree(t.kind)).map((t) => [t, plantGeometry(t)])), [all]);
  useEffect(() => () => shapes.forEach((g) => g.dispose()), [shapes]);
  const hedge = useMemo(() => {
    const parts = [...shapes].map(([t, g]) => g.clone().translate(t.x, carvedHeight(site, t.x, t.z, platform) - site.baseH - 0.04, t.z));
    if (!parts.length) return null;
    const g = mergeGeometries(parts);
    parts.forEach((q) => q.dispose());
    g?.computeVertexNormals();
    return g;
  }, [shapes, site, platform]);
  useEffect(() => () => hedge?.dispose(), [hedge]);
  return (
    <group name="trees">
      {hedge && <mesh geometry={hedge} material={plantMat} castShadow receiveShadow name="plants" />}
      {trees.map((t) => {
        const g = geoms.get(t.id + t.kind + t.height)!;
        const y = carvedHeight(site, t.x, t.z, platform) - site.baseH;
        return (
          <group key={t.id} position={[t.x, y - 0.05, t.z]}>
            {g.trunk && <mesh geometry={g.trunk} material={t.kind === 'birch' ? birchMat : trunkMat} castShadow receiveShadow />}
            <mesh geometry={g.crown} material={leafMats[t.kind]!} castShadow receiveShadow />
          </group>
        );
      })}
    </group>
  );
}

const postMat = new THREE.MeshStandardMaterial({ color: '#c9c5bd', roughness: 0.9 });
const panelMat = new THREE.MeshStandardMaterial({ color: '#3b3e42', roughness: 0.5, metalness: 0.4 });
const gateMat = new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.45, metalness: 0.55 });

/**
 * Fence along the chosen plot edges, 15 cm inside the boundary. Where a driveway or path crosses
 * it, the fence opens exactly there and a gate fills the opening: a sliding gate for a drive, a
 * wicket gate (furtka) for anything up to 1.6 m.
 */
/** an opening in the fence: metres along the edge from its first vertex; kind for explicit gates */
export type FenceOpening = [number, number, Gate['kind'] | null];

/**
 * Openings in the fence along one plot edge: where a driveway / path crosses the fence line
 * (0.15 m inside the boundary, 5 cm resolution) plus the explicit gates on that edge, merged.
 */
export function fenceOpenings(parcel: P2[], edge: number, polys: P2[][], gates: Gate[]): FenceOpening[] {
  const a = parcel[edge], b = parcel[(edge + 1) % parcel.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let cx = 0, cz = 0;
  for (const [x, z] of parcel) { cx += x; cz += z; }
  cx /= parcel.length; cz /= parcel.length;
  let n: P2 = [-d[1], d[0]];
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if ((cx - mid[0]) * n[0] + (cz - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
  const at = (s: number): P2 => [a[0] + d[0] * s + n[0] * 0.15, a[1] + d[1] * s + n[1] * 0.15];
  const raw: FenceOpening[] = [];
  const STEP = 0.05;
  let o0: number | null = null;
  for (let s = 0; s <= L + 1e-9; s += STEP) {
    const inside = polys.some((poly) => pointInPolygon(at(s), poly));
    if (inside && o0 === null) o0 = s;
    if (!inside && o0 !== null) { raw.push([o0, s, null]); o0 = null; }
  }
  if (o0 !== null) raw.push([o0, L, null]);
  for (const g of gates) if (g.edge === edge) raw.push([Math.max(0, g.from), Math.min(L, g.to), g.kind]);
  raw.sort((p, q) => p[0] - q[0]);
  const out: FenceOpening[] = [];
  for (const o of raw) {
    const last = out[out.length - 1];
    if (last && o[0] < last[1]) { last[1] = Math.max(last[1], o[1]); last[2] = last[2] ?? o[2]; }
    else out.push([...o]);
  }
  return out;
}

export function Fence({ site, platform }: { site: Site; platform: PlatformSpec | PlatformSpec[] | null }) {
  const edges = useStore((s) => s.fenceEdges);
  const H = useStore((s) => s.fenceHeight);
  const garden = useGarden();
  const gateList = useGates();
  const geo = useMemo(() => {
    const posts: THREE.BufferGeometry[] = [];
    const panels: THREE.BufferGeometry[] = [];
    const gates: THREE.BufferGeometry[] = [];
    const openings = garden.filter((g) => g.kind === 'driveway' || g.kind === 'path').map((g) => g.points);
    const P = site.parcel;
    let cx = 0, cz = 0;
    for (const [x, z] of P) { cx += x; cz += z; }
    cx /= P.length; cz /= P.length;
    const hAt = (p: P2) => carvedHeight(site, p[0], p[1], platform) - site.baseH;
    for (const e of edges) {
      const a = P[e], b = P[(e + 1) % P.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n: P2 = [-d[1], d[0]];
      const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if ((cx - mid[0]) * n[0] + (cz - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
      const at = (s: number): P2 => [a[0] + d[0] * s + n[0] * 0.15, a[1] + d[1] * s + n[1] * 0.15];
      const angle = Math.atan2(-d[1], d[0]);
      const open = fenceOpenings(P, e, openings, gateList);
      const post = (s: number, h = H + 0.1, w = 0.25) => {
        const p = at(s);
        const g = new THREE.BoxGeometry(w, h, w);
        g.rotateY(angle);
        g.translate(p[0], hAt(p) + h / 2 - 0.05, p[1]);
        posts.push(g);
      };
      const box = (s0: number, s1: number, y0: number, y1: number, depth: number, arr: THREE.BufferGeometry[]) => {
        const q = at((s0 + s1) / 2);
        const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, depth);
        g.rotateY(angle);
        g.translate(q[0], hAt(q) + (y0 + y1) / 2, q[1]);
        arr.push(g);
      };
      // fence runs between the openings
      const solid: [number, number][] = [];
      let s0 = 0;
      for (const [o, c] of open) { if (o - s0 > 0.05) solid.push([s0, o]); s0 = c; }
      if (L - s0 > 0.05) solid.push([s0, L]);
      for (const [r0, r1] of solid) {
        const spans = Math.max(1, Math.round((r1 - r0) / 2.5));
        for (let k = 0; k <= spans; k++) {
          const sp = r0 + ((r1 - r0) * k) / spans;
          post(sp);
          if (k < spans && (r1 - r0) / spans > 0.35) box(sp + 0.125, r0 + ((r1 - r0) * (k + 1)) / spans - 0.125, 0.15, H - 0.1, 0.05, panels);
        }
      }
      // a gate in every opening: frame + vertical bars
      for (const [o, c, kind] of open) {
        const w = c - o;
        if (w < 0.4) continue;
        const wicket = kind ? kind === 'wicket' : w <= 1.6;
        const g0 = o + 0.14, g1 = c - 0.14;
        box(g0, g1, 0.08, 0.16, 0.06, gates); // bottom rail
        box(g0, g1, H - 0.08, H, 0.06, gates); // top rail
        box(g0, g0 + 0.06, 0.08, H, 0.06, gates);
        box(g1 - 0.06, g1, 0.08, H, 0.06, gates);
        const bars = Math.max(2, Math.floor((g1 - g0) / 0.12));
        for (let k = 1; k < bars; k++) {
          const sb = g0 + ((g1 - g0) * k) / bars;
          box(sb - 0.015, sb + 0.015, 0.16, H - 0.08, 0.03, gates);
        }
        if (wicket) box(g1 - 0.2, g1 - 0.12, H * 0.5, H * 0.5 + 0.12, 0.09, gates); // handle
        else box(o - 0.4, c + 0.2, -0.04, 0.0, 0.12, gates); // sliding gate track
      }
    }
    const m = (arr: THREE.BufferGeometry[]) => (arr.length ? mergeGeometries(arr) : null);
    return { posts: m(posts), panels: m(panels), gates: m(gates) };
  }, [edges, H, garden, gateList, site, platform]);
  return (
    <group name="fence">
      {geo.posts && <mesh geometry={geo.posts} material={postMat} castShadow receiveShadow />}
      {geo.panels && <mesh geometry={geo.panels} material={panelMat} castShadow receiveShadow />}
      {geo.gates && <mesh geometry={geo.gates} material={gateMat} castShadow receiveShadow />}
    </group>
  );
}
