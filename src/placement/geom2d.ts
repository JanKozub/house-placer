export type P2 = [number, number];

export interface Placement {
  /** house centre in site-local plan coords (x east, z south), metres */
  x: number;
  z: number;
  /** compass bearing (grid) the house front (entrance/garage side) faces, degrees */
  bearing: number;
  mirror: boolean;
}

/** three.js rotation.y for a given front bearing (front = +z in house-local) */
export const rotationY = (bearingDeg: number) => Math.PI - (bearingDeg * Math.PI) / 180;

/** house-local (x,z) → site-local (x,z) */
export function toSite(p: P2, pl: Placement): P2 {
  const lx = pl.mirror ? -p[0] : p[0];
  const lz = p[1];
  const phi = rotationY(pl.bearing);
  const c = Math.cos(phi), s = Math.sin(phi);
  return [lx * c + lz * s + pl.x, -lx * s + lz * c + pl.z];
}

/** site-local → house-local (inverse of toSite) */
export function toHouse(p: P2, pl: Placement): P2 {
  const dx = p[0] - pl.x, dz = p[1] - pl.z;
  const phi = rotationY(pl.bearing);
  const c = Math.cos(phi), s = Math.sin(phi);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return [pl.mirror ? -lx : lx, lz];
}

export function polygonArea(poly: P2[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a) / 2;
}

export function centroid(poly: P2[]): P2 {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    a += f;
    cx += (poly[j][0] + poly[i][0]) * f;
    cz += (poly[j][1] + poly[i][1]) * f;
  }
  a /= 2;
  return [cx / (6 * a), cz / (6 * a)];
}

export function pointInPolygon(p: P2, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function closestOnSegment(p: P2, a: P2, b: P2): P2 {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dz];
}

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segIntersect(a: P2, b: P2, c: P2, d: P2) {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** shortest distance between two segments, with the closest points */
export function segSegDistance(a: P2, b: P2, c: P2, d: P2): { d: number; p: P2; q: P2 } {
  if (segIntersect(a, b, c, d)) {
    return { d: 0, p: a, q: a };
  }
  const cands: { d: number; p: P2; q: P2 }[] = [];
  for (const [p, s0, s1, flip] of [
    [a, c, d, false],
    [b, c, d, false],
    [c, a, b, true],
    [d, a, b, true],
  ] as [P2, P2, P2, boolean][]) {
    const q = closestOnSegment(p, s0, s1);
    cands.push(flip ? { d: dist(p, q), p: q, q: p } : { d: dist(p, q), p, q });
  }
  return cands.reduce((m, c2) => (c2.d < m.d ? c2 : m));
}

/** distance from segment to closed polygon boundary */
export function segToPolygon(a: P2, b: P2, poly: P2[]) {
  let best = { d: Infinity, p: a, q: a, edge: -1 };
  for (let i = 0; i < poly.length; i++) {
    const r = segSegDistance(a, b, poly[i], poly[(i + 1) % poly.length]);
    if (r.d < best.d) best = { ...r, edge: i };
  }
  return best;
}

export function polylineLength(pts: P2[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}
