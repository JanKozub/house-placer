import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Site } from '../geo/site';
import { useStore, type Tree, type TreeKind } from '../store';
import { pointInPolygon, type P2 } from '../placement/geom2d';
import { carvedHeight, type PlatformSpec } from './Terrain';

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

export function Trees({ site, platform }: { site: Site; platform: PlatformSpec | null }) {
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

export function Fence({ site, platform }: { site: Site; platform: PlatformSpec | null }) {
  const edges = useStore((s) => s.fenceEdges);
  const H = useStore((s) => s.fenceHeight);
  const garden = useStore((s) => s.garden);
  const geo = useMemo(() => {
    const posts: THREE.BufferGeometry[] = [];
    const panels: THREE.BufferGeometry[] = [];
    const gaps = garden.filter((g) => g.kind === 'driveway' || g.kind === 'path').map((g) => g.points);
    const P = site.parcel;
    // inward offset direction
    let cx = 0, cz = 0;
    for (const [x, z] of P) { cx += x; cz += z; }
    cx /= P.length; cz /= P.length;
    for (const e of edges) {
      const a = P[e], b = P[(e + 1) % P.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n: P2 = [-d[1], d[0]];
      const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if ((cx - mid[0]) * n[0] + (cz - mid[1]) * n[1] < 0) n = [-n[0], -n[1]];
      const spans = Math.max(1, Math.round(L / 2.5));
      const at = (t: number): P2 => [a[0] + d[0] * L * t + n[0] * 0.15, a[1] + d[1] * L * t + n[1] * 0.15];
      const hAt = (p: P2) => carvedHeight(site, p[0], p[1], platform) - site.baseH;
      const angle = Math.atan2(-d[1], d[0]);
      for (let s = 0; s <= spans; s++) {
        const p = at(s / spans);
        const g = new THREE.BoxGeometry(0.25, H + 0.1, 0.25);
        g.rotateY(angle);
        g.translate(p[0], hAt(p) + (H + 0.1) / 2 - 0.05, p[1]);
        posts.push(g);
        if (s === spans) break;
        const q = at((s + 0.5) / spans);
        if (gaps.some((poly) => pointInPolygon(q, poly))) continue;
        const len = L / spans - 0.25;
        const pg = new THREE.BoxGeometry(len, H - 0.25, 0.05);
        pg.rotateY(angle);
        pg.translate(q[0], hAt(q) + 0.15 + (H - 0.25) / 2, q[1]);
        panels.push(pg);
      }
    }
    return { posts: posts.length ? mergeGeometries(posts) : null, panels: panels.length ? mergeGeometries(panels) : null };
  }, [edges, H, garden, site, platform]);
  return (
    <group name="fence">
      {geo.posts && <mesh geometry={geo.posts} material={postMat} castShadow receiveShadow />}
      {geo.panels && <mesh geometry={geo.panels} material={panelMat} castShadow receiveShadow />}
    </group>
  );
}
