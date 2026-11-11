import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Site } from '../geo/site';
import { useStore, type Tree, type TreeKind } from '../store';
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
const leafMats: Record<TreeKind, THREE.MeshStandardMaterial> = {
  deciduous: new THREE.MeshStandardMaterial({ color: '#4f7a2e', roughness: 0.85, flatShading: true }),
  birch: new THREE.MeshStandardMaterial({ color: '#7ea04a', roughness: 0.85, flatShading: true }),
  conifer: new THREE.MeshStandardMaterial({ color: '#2f5230', roughness: 0.9, flatShading: true }),
  shrub: new THREE.MeshStandardMaterial({ color: '#557f35', roughness: 0.9, flatShading: true }),
};

export function Trees({ site, platform }: { site: Site; platform: PlatformSpec | PlatformSpec[] | null }) {
  const trees = useStore((s) => s.trees);
  const geoms = useMemo(() => new Map(trees.map((t) => [t.id + t.kind + t.height, treeGeometry(t)])), [trees]);
  return (
    <group name="trees">
      {trees.map((t) => {
        const g = geoms.get(t.id + t.kind + t.height)!;
        const y = carvedHeight(site, t.x, t.z, platform) - site.baseH;
        return (
          <group key={t.id} position={[t.x, y - 0.05, t.z]}>
            {g.trunk && <mesh geometry={g.trunk} material={t.kind === 'birch' ? birchMat : trunkMat} castShadow receiveShadow />}
            <mesh geometry={g.crown} material={leafMats[t.kind]} castShadow receiveShadow />
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
  const garden = useStore((s) => s.garden);
  const gateList = useStore((s) => s.gates);
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
