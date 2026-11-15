/**
 * The built parts of the garden that are more than paint on the ground:
 * - kerbs along the outer edge of paved areas (drive, forecourt, patio, paths), so the paving ends
 *   in a clean line against lawn and beds;
 * - raised vegetable beds: a timber frame filled with soil, with rows of vegetables.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Site } from '../geo/site';
import { useGarden, useGates, type GardenArea, type GardenKind } from '../store';
import { closestOnSegment, pointInPolygon, type P2 } from '../placement/geom2d';
import { carvedHeight, type PlatformSpec } from './Terrain';
import type { Gate } from './sitePlan';

const PAVED = new Set<GardenKind>(['driveway', 'patio', 'path']);
export const KERB = { width: 0.1, above: 0.045, step: 0.25 };

const signedArea = (poly: P2[]) => poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0) / 2;
const distToPolygon = (p: P2, poly: P2[]) => Math.min(...poly.map((a, i) => { const q = closestOnSegment(p, a, poly[(i + 1) % poly.length]); return Math.hypot(p[0] - q[0], p[1] - q[1]); }));

/**
 * Where a kerb runs: short pieces of the edges of paved areas that have paving on one side only.
 * Left out: edges inside or against another paved area (a drive joining the forecourt), edges at a
 * building (the wall is the edge there), gate openings, and anything outside the plot.
 * Each piece is [a, b, outward normal].
 */
export function kerbPieces(areas: GardenArea[], footprints: P2[][], parcel: P2[], gates: Gate[], step = KERB.step): [P2, P2, P2][] {
  const paved = areas.filter((a) => PAVED.has(a.kind) && a.points.length >= 3);
  const out: [P2, P2, P2][] = [];
  for (const a of paved) {
    const ccw = signedArea(a.points) > 0;
    a.points.forEach((p, i) => {
      const q = a.points[(i + 1) % a.points.length];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1e-6) return;
      const d: P2 = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
      const n: P2 = ccw ? [d[1], -d[0]] : [-d[1], d[0]]; // pointing out of the area
      const count = Math.max(1, Math.round(L / step));
      for (let k = 0; k < count; k++) {
        const s0 = (L * k) / count, s1 = (L * (k + 1)) / count, sm = (s0 + s1) / 2;
        const m: P2 = [p[0] + d[0] * sm, p[1] + d[1] * sm];
        const beyond: P2 = [m[0] + n[0] * 0.08, m[1] + n[1] * 0.08];
        if (!pointInPolygon(beyond, parcel)) continue;
        if (paved.some((b) => b !== a && pointInPolygon(beyond, b.points))) continue;
        if (footprints.some((f) => pointInPolygon(beyond, f) || distToPolygon(m, f) < 0.3)) continue;
        if (gates.some((g) => {
          const e0 = parcel[g.edge], e1 = parcel[(g.edge + 1) % parcel.length];
          const c = closestOnSegment(m, e0, e1);
          const along = Math.hypot(c[0] - e0[0], c[1] - e0[1]);
          return Math.hypot(m[0] - c[0], m[1] - c[1]) < 0.8 && along > g.from - 0.05 && along < g.to + 0.05;
        })) continue;
        out.push([[p[0] + d[0] * s0, p[1] + d[1] * s0], [p[0] + d[0] * s1, p[1] + d[1] * s1], n]);
      }
    });
  }
  return out;
}

function coloured(g: THREE.BufferGeometry, color: string) {
  const ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  const c = new THREE.Color(color), n = ng.getAttribute('position').count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

/** a box lying along a→b on the ground: `w` wide, centred `side` to the left of a→b, from y0 to y1 at each end */
function bar(a: P2, b: P2, w: number, side: number, ya: [number, number], yb: [number, number]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
  const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: P2 = [-d[1], d[0]];
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, k = p.getZ(i) * w + side; // along, up, across
    const x = a[0] + d[0] * L * u + n[0] * k, z = a[1] + d[1] * L * u + n[1] * k;
    const y0 = ya[0] + (yb[0] - ya[0]) * u, y1 = ya[1] + (yb[1] - ya[1]) * u;
    p.setXYZ(i, x, y0 + (y1 - y0) * v, z);
  }
  g.computeVertexNormals();
  return g;
}

const VEG = ['#86b44e', '#3f6f3a', '#5d9a45', '#a8c257'];
export const RAISED_BED = { height: 0.3, board: 0.05 };

/** kerbs and raised beds as one geometry (site-local x/z, heights relative to the site's base) */
export function buildFeatures(areas: GardenArea[], footprints: P2[][], parcel: P2[], gates: Gate[], ground: (x: number, z: number) => number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const [a, b, n] of kerbPieces(areas, footprints, parcel, gates)) {
    const ha = ground(a[0], a[1]), hb = ground(b[0], b[1]);
    // just outside the paving; the sign of `side` follows the outward normal
    const d: P2 = [b[0] - a[0], b[1] - a[1]], left = -d[1] * n[0] + d[0] * n[1] > 0 ? 1 : -1;
    parts.push(coloured(bar(a, b, KERB.width, (left * KERB.width) / 2, [ha - 0.12, ha + KERB.above], [hb - 0.12, hb + KERB.above]), '#b4b1ab'));
  }
  for (const bed of areas.filter((g) => g.kind === 'vegbed' && g.points.length >= 3)) {
    const pts = bed.points, h = Math.max(...pts.map((p) => ground(p[0], p[1]))), top = h + RAISED_BED.height;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      parts.push(coloured(bar(p, q, RAISED_BED.board, 0, [h - 0.25, top], [h - 0.25, top]), '#8a6a45'));
    });
    const v2 = pts.map(([x, z]) => new THREE.Vector2(x, z)), soilPos: number[] = [];
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v2, [])) {
      const A = v2[i], B = v2[j], C = v2[k];
      const up = (B.y - A.y) * (C.x - A.x) - (B.x - A.x) * (C.y - A.y) > 0;
      for (const P of up ? [A, B, C] : [A, C, B]) soilPos.push(P.x, top - 0.04, P.y);
    }
    const soil = new THREE.BufferGeometry();
    soil.setAttribute('position', new THREE.Float32BufferAttribute(soilPos, 3));
    soil.computeVertexNormals();
    parts.push(coloured(soil, '#3a2a1c'));
    // rows of vegetables across the bed, 35 cm apart
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    const c: P2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    const e0: P2 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]], e1: P2 = [pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]];
    const [long, short] = Math.hypot(...e0) >= Math.hypot(...e1) ? [e0, e1] : [e1, e0];
    const LL = Math.hypot(...long), LS = Math.hypot(...short);
    const rows = Math.max(1, Math.floor((LL - 0.3) / 0.35)), per = Math.max(1, Math.floor((LS - 0.25) / 0.3));
    for (let r = 0; r <= rows; r++)
      for (let k = 0; k <= per; k++) {
        const u = rows ? (r / rows - 0.5) * (LL - 0.3) : 0, v = per ? (k / per - 0.5) * (LS - 0.25) : 0;
        const x = c[0] + (long[0] / LL) * u + (short[0] / LS) * v, z = c[1] + (long[1] / LL) * u + (short[1] / LS) * v;
        if (!pointInPolygon([x, z], pts)) continue;
        const size = 0.09 + ((r * 7 + k * 3) % 5) * 0.012 + (r % 4 === 1 ? 0.05 : 0);
        parts.push(coloured(new THREE.IcosahedronGeometry(size, 0).scale(1, r % 4 === 1 ? 1.6 : 0.8, 1).translate(x, top - 0.04 + size * 0.6, z), VEG[r % VEG.length]));
      }
  }
  if (!parts.length) return null;
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  g?.computeVertexNormals();
  return g;
}

const featureMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true, vertexColors: true });

export function GardenFeatures({ site, platforms, footprints }: { site: Site; platforms: PlatformSpec[]; footprints: P2[][] }) {
  const garden = useGarden();
  const gates = useGates();
  const geo = useMemo(
    () => buildFeatures(garden, footprints, site.parcel, gates, (x, z) => carvedHeight(site, x, z, platforms) - site.baseH),
    [garden, footprints, gates, site, platforms],
  );
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo ? <mesh geometry={geo} material={featureMat} castShadow receiveShadow name="garden-features" /> : null;
}
