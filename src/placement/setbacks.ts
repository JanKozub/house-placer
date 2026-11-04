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
    const r = facingDistance(a, b, fp, parcel);
    const status: WallSetback['status'] = r.d >= required ? 'ok' : r.d >= required - 0.5 ? 'warn' : 'fail';
    return { wallId: w.id, hasOpenings, required, distance: r.d, from: r.p, to: r.q, status };
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

/** perpendicular distance from wall (a→b) to boundary parts lying in the strip in front of it */
export function facingDistance(a: P2, b: P2, footprint: P2[], parcel: P2[]): { d: number; p: P2; q: P2 } {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n: P2 = [-d[1], d[0]];
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pointInPolygon([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], footprint)) n = [-n[0], -n[1]];

  const along = (q: P2) => (q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1];
  const out = (q: P2) => (q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1];

  let best = { d: Infinity, p: mid, q: mid };
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
    if (empty || t0 > t1) continue;
    for (const t of [t0, t1]) {
      const q: P2 = [s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t];
      const dd = out(q);
      if (dd < best.d) {
        const s = along(q);
        best = { d: dd, p: [a[0] + d[0] * s, a[1] + d[1] * s], q };
      }
    }
  }
  if (!isFinite(best.d)) {
    const r = segToPolygon(a, b, parcel);
    return { d: r.d, p: r.p, q: r.q };
  }
  return best;
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
