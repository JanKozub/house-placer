/**
 * Generic roof surface from rectangular hip / gable volumes (see RoofVolume).
 *
 * Each volume's top is the lowest of its slope planes; the roof is the highest volume at each
 * point. Face polygons are found with half-plane clipping only: a plane's region inside its
 * volume is convex, and the region where another volume rises above it is convex too, so
 * "convex minus convex" splits into convex pieces.
 */
import type { HouseDef, RoofVolume, Vec2 } from './types';

/** slope plane: h(X,Y) = edgeTop + T · (n · (p − p0)), n = inward unit normal from the eave edge */
export interface RoofPlane {
  p0: Vec2;
  n: Vec2;
  edgeTop: number;
  /** plan axis along the eave (texture u direction) */
  u: 'x' | 'y';
}

export interface RoofFace {
  volume: number;
  plane: RoofPlane;
  /** convex polygon, plan coords */
  poly: Vec2[];
  h: (X: number, Y: number) => number;
}

export const tanPitch = (h: HouseDef) => Math.tan((h.roof.pitchDeg * Math.PI) / 180);

export function volumePlanes(v: RoofVolume): RoofPlane[] {
  const sx: RoofPlane[] = [
    { p0: [v.x0, 0], n: [1, 0], edgeTop: v.edgeTop, u: 'y' },
    { p0: [v.x1, 0], n: [-1, 0], edgeTop: v.edgeTop, u: 'y' },
  ];
  const sy: RoofPlane[] = [
    { p0: [0, v.y0], n: [0, 1], edgeTop: v.edgeTop, u: 'x' },
    { p0: [0, v.y1], n: [0, -1], edgeTop: v.edgeTop, u: 'x' },
  ];
  if (v.kind === 'hip') return [...sx, ...sy];
  // gable: ridge along Y → slopes towards ±X
  return v.ridge === 'y' ? sx : sy;
}

const planeH = (p: RoofPlane, T: number, X: number, Y: number) => p.edgeTop + T * (p.n[0] * (X - p.p0[0]) + p.n[1] * (Y - p.p0[1]));

const inRect = (v: RoofVolume, X: number, Y: number, eps = 1e-9) => X >= v.x0 - eps && X <= v.x1 + eps && Y >= v.y0 - eps && Y <= v.y1 + eps;

function volumeH(v: RoofVolume, T: number, X: number, Y: number) {
  let h = Infinity;
  for (const p of volumePlanes(v)) h = Math.min(h, planeH(p, T, X, Y));
  return h;
}

/** roof top-surface height (relative to ±0.00) at a plan point, or null outside the roof */
export function roofTopAt(h: HouseDef, X: number, Y: number): number | null {
  const T = tanPitch(h);
  let best: number | null = null;
  for (const v of h.roof.volumes) {
    if (!inRect(v, X, Y)) continue;
    const z = volumeH(v, T, X, Y);
    best = best === null ? z : Math.max(best, z);
  }
  return best;
}

/** half-plane a·X + b·Y + c ≥ 0 */
type HP = [number, number, number];

function clip(poly: Vec2[], [a, b, c]: HP): Vec2[] {
  const out: Vec2[] = [];
  const f = (p: Vec2) => a * p[0] + b * p[1] + c;
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = f(P), fq = f(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}

const area = (poly: Vec2[]) => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

/** plane difference p − q as a half-plane (≥ 0 where p is higher) */
function diff(p: RoofPlane, q: RoofPlane, T: number): HP {
  const a = T * (p.n[0] - q.n[0]);
  const b = T * (p.n[1] - q.n[1]);
  const c = p.edgeTop - q.edgeTop - T * (p.n[0] * p.p0[0] + p.n[1] * p.p0[1]) + T * (q.n[0] * q.p0[0] + q.n[1] * q.p0[1]);
  return [a, b, c];
}

const rectHPs = (v: RoofVolume): HP[] => [
  [1, 0, -v.x0],
  [-1, 0, v.x1],
  [0, 1, -v.y0],
  [0, -1, v.y1],
];

/** drop repeated and collinear vertices (clipping leaves them; they make zero-area triangles) */
function tidy(poly: Vec2[]): Vec2[] {
  let pts = poly;
  for (let changed = true; changed && pts.length >= 3; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(cross) < 1e-9 || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** pieces of a convex polygon outside the convex region ∩hps */
function subtract(poly: Vec2[], hps: HP[]): Vec2[][] {
  const out: Vec2[][] = [];
  let rest = poly;
  for (const [a, b, c] of hps) {
    if (rest.length < 3) break;
    const outside = clip(rest, [-a, -b, -c]);
    if (outside.length >= 3 && Math.abs(area(outside)) > 1e-6) out.push(outside);
    rest = clip(rest, [a, b, c]);
  }
  return out;
}

/** the visible roof faces: convex pieces of each slope plane, tiling the roof outline */
export function roofFaces(h: HouseDef): RoofFace[] {
  const T = tanPitch(h);
  const vols = h.roof.volumes;
  const faces: RoofFace[] = [];
  vols.forEach((v, vi) => {
    const planes = volumePlanes(v);
    planes.forEach((p, pi) => {
      let poly: Vec2[] = [[v.x0, v.y0], [v.x1, v.y0], [v.x1, v.y1], [v.x0, v.y1]];
      // this plane is the lowest of its volume (ties go to the earlier plane)
      planes.forEach((q, qi) => {
        if (qi === pi) return;
        const [a, b, c] = diff(q, p, T); // q − p ≥ 0
        poly = clip(poly, qi < pi ? [a, b, c - 1e-9] : [a, b, c]);
      });
      if (poly.length < 3 || Math.abs(area(poly)) < 1e-6) return;
      // remove where another volume is higher (ties go to the earlier volume)
      let pieces = [poly];
      vols.forEach((w, wi) => {
        if (wi === vi) return;
        const higher: HP[] = [
          ...rectHPs(w),
          ...volumePlanes(w).map((q) => {
            const [a, b, c] = diff(q, p, T);
            return [a, b, wi < vi ? c + 1e-9 : c - 1e-9] as HP; // q above p
          }),
        ];
        pieces = pieces.flatMap((pc) => subtract(pc, higher));
      });
      for (const raw of pieces) {
        const pc = tidy(raw);
        if (pc.length >= 3) faces.push({ volume: vi, plane: p, poly: pc, h: (X, Y) => planeH(p, T, X, Y) });
      }
    });
  });
  return faces;
}

/** is the segment a→b on the outer rectangle of volume v (an eave or verge edge)? */
export function onVolumeEdge(v: RoofVolume, a: Vec2, b: Vec2, eps = 1e-6) {
  return (
    (Math.abs(a[0] - v.x0) < eps && Math.abs(b[0] - v.x0) < eps) ||
    (Math.abs(a[0] - v.x1) < eps && Math.abs(b[0] - v.x1) < eps) ||
    (Math.abs(a[1] - v.y0) < eps && Math.abs(b[1] - v.y0) < eps) ||
    (Math.abs(a[1] - v.y1) < eps && Math.abs(b[1] - v.y1) < eps)
  );
}

export const polygonAreaPlan = (poly: Vec2[]) => Math.abs(area(poly));
