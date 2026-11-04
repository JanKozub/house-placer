/**
 * Setback check against the parcel boundary.
 * WT 2002 §12 ust. 1: a building wall facing the plot boundary must be ≥ 4 m from it if it
 * has windows or doors, ≥ 3 m if it is a blank wall.
 *
 * "Facing" is modelled as the strip directly in front of the wall (perpendicular projection
 * onto the wall falls within the wall's length, on its outer side). The absolute minimum
 * distance from any part of the house to the boundary is reported separately.
 */
import { house } from '../house/ambrozja17';
import { toLocal } from '../house/geometry';
import { centroid, pointInPolygon, segSegDistance, segToPolygon, toSite, type P2, type Placement } from './geom2d';

export const LIMIT_WITH_OPENINGS = 4;
export const LIMIT_BLANK = 3;

export interface WallSetback {
  wallId: string;
  hasOpenings: boolean;
  required: number;
  /** perpendicular distance to the nearest boundary in front of the wall */
  distance: number;
  from: P2;
  to: P2;
  status: 'ok' | 'warn' | 'fail';
  /** distance to every boundary edge this wall faces (nearest first) */
  all: EdgeDistance[];
}

export interface SetbackResult {
  walls: WallSetback[];
  insideParcel: boolean;
  /** smallest distance from the outline to the boundary in any direction */
  minDistance: number;
  ok: boolean;
  buildingLine?: { distance: number; from: P2; to: P2; ok: boolean };
}

export function footprintSite(pl: Placement): P2[] {
  return house.outline.map(([X, Y]) => toSite(toLocal(X, Y), pl));
}

export function computeSetbacks(pl: Placement, parcel: P2[], buildingLine?: P2[] | null): SetbackResult {
  const fp = footprintSite(pl);

  const walls: WallSetback[] = house.walls.map((w) => {
    const a = toSite(toLocal(...w.a), pl);
    const b = toSite(toLocal(...w.b), pl);
    const hasOpenings = house.openings.some((o) => o.wall === w.id);
    const required = hasOpenings ? LIMIT_WITH_OPENINGS : LIMIT_BLANK;
    const all = facingDistances(a, b, fp, parcel);
    const r = all[0] ?? (() => { const x = segToPolygon(a, b, parcel); return { d: x.d, p: x.p, q: x.q }; })();
    const status: WallSetback['status'] = r.d >= required ? 'ok' : r.d >= required - 0.5 ? 'warn' : 'fail';
    return { wallId: w.id, hasOpenings, required, distance: r.d, from: r.p, to: r.q, status, all };
  });

  const insideParcel = fp.every((c) => pointInPolygon(c, parcel));
  let minDistance = Infinity;
  for (let i = 0; i < fp.length; i++) minDistance = Math.min(minDistance, segToPolygon(fp[i], fp[(i + 1) % fp.length], parcel).d);
  if (!insideParcel) minDistance = 0;

  let bl: SetbackResult['buildingLine'];
  if (buildingLine && buildingLine.length >= 2) {
    let best = { distance: Infinity, from: fp[0], to: fp[0] };
    for (const c of fp) {
      for (let i = 1; i < buildingLine.length; i++) {
        const r = segSegDistance(c, c, buildingLine[i - 1], buildingLine[i]);
        if (r.d < best.distance) best = { distance: r.d, from: c, to: r.q };
      }
    }
    let crosses = false;
    for (let i = 0; i < fp.length && !crosses; i++)
      for (let k = 1; k < buildingLine.length; k++)
        if (segSegDistance(fp[i], fp[(i + 1) % fp.length], buildingLine[k - 1], buildingLine[k]).d < 1e-6) crosses = true;
    const ok = !crosses && sideOf(centroid(parcel), buildingLine) === sideOf(fp[0], buildingLine);
    bl = { ...best, ok };
  }

  return {
    walls,
    insideParcel,
    minDistance,
    ok: insideParcel && walls.every((w) => w.status === 'ok') && (bl ? bl.ok : true),
    buildingLine: bl,
  };
}

export interface EdgeDistance {
  /** parcel boundary edge index */
  edge: number;
  d: number;
  /** foot on the wall */
  p: P2;
  /** point on the boundary */
  q: P2;
}

/**
 * Perpendicular distances from wall (a→b) to every parcel edge that lies (at least partly) in the
 * strip in front of the wall — one per edge, at its closest point. Measurements whose line would
 * run through or along the house itself (e.g. from an inner-corner wall across the other wing)
 * are skipped.
 */
export function facingDistances(a: P2, b: P2, footprint: P2[], parcel: P2[]): EdgeDistance[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n: P2 = [-d[1], d[0]];
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pointInPolygon([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], footprint)) n = [-n[0], -n[1]];

  const along = (q: P2) => (q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1];
  const out = (q: P2) => (q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1];
  const blocked = (p: P2, q: P2) => {
    const p2: P2 = [p[0] + n[0] * 0.02, p[1] + n[1] * 0.02];
    for (let k = 0; k < footprint.length; k++) {
      if (segSegDistance(p2, q, footprint[k], footprint[(k + 1) % footprint.length]).d < 1e-6) return true;
    }
    return pointInPolygon([(p2[0] + q[0]) / 2, (p2[1] + q[1]) / 2], footprint);
  };

  const res: EdgeDistance[] = [];
  for (let i = 0; i < parcel.length; i++) {
    const s0 = parcel[i], s1 = parcel[(i + 1) % parcel.length];
    // Liang–Barsky clip of s0→s1 against 0 ≤ along ≤ L and out ≥ 0
    let t0 = 0, t1 = 1;
    const fns: [number, number][] = [
      [along(s0), along(s1) - along(s0)], // along ≥ 0
      [L - along(s0), -(along(s1) - along(s0))], // along ≤ L
      [out(s0), out(s1) - out(s0)], // out ≥ 0
    ];
    let empty = false;
    for (const [f0, df] of fns) {
      // f0 + df * t ≥ 0
      if (Math.abs(df) < 1e-12) {
        if (f0 < 0) { empty = true; break; }
      } else {
        const t = -f0 / df;
        if (df > 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (empty || t0 > t1 + 1e-9) continue;
    // distance is linear along the clipped piece: try both ends, then pull the foot away from the
    // wall ends if the end measurement is blocked (it would run along an adjacent wall)
    let best: EdgeDistance | null = null;
    const cands = [t0, t1, (t0 + t1) / 2];
    for (const t of cands) {
      const q: P2 = [s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t];
      const s = Math.max(0, Math.min(L, along(q)));
      const p: P2 = [a[0] + d[0] * s, a[1] + d[1] * s];
      const dd = out(q);
      if (dd < -1e-9 || blocked(p, q)) continue;
      if (!best || dd < best.d) best = { edge: i, d: dd, p, q };
    }
    if (best) res.push(best);
  }
  return res.sort((x, y) => x.d - y.d);
}

/** distance from wall (a→b) to the nearest boundary in front of it (WT §12 check) */
export function facingDistance(a: P2, b: P2, footprint: P2[], parcel: P2[]): { d: number; p: P2; q: P2 } {
  const all = facingDistances(a, b, footprint, parcel);
  if (all.length) return all[0];
  const r = segToPolygon(a, b, parcel);
  return { d: r.d, p: r.p, q: r.q };
}

/** which side of a polyline a point is on (sign of cross product with nearest segment) */
function sideOf(p: P2, line: P2[]) {
  let best = Infinity, sign = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const r = segSegDistance(p, p, a, b);
    if (r.d < best) {
      best = r.d;
      sign = Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    }
  }
  return sign;
}
