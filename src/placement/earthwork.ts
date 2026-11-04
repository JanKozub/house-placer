import { pointInPolygon, type P2 } from './geom2d';

export interface Earthwork {
  /** m³ of soil removed above platform level */
  cut: number;
  /** m³ of fill needed below platform level */
  fill: number;
  area: number;
  terrainMin: number;
  terrainMax: number;
  terrainMean: number;
}

/**
 * Cut/fill for a flat platform at `platformH` (m a.s.l.) over `polygon`, sampled on a `step` grid.
 * `heightAt` returns terrain height at site-local (x,z).
 */
export function computeEarthwork(polygon: P2[], platformH: number, heightAt: (x: number, z: number) => number, step = 0.5): Earthwork {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  let cut = 0, fill = 0, n = 0, sum = 0, tMin = Infinity, tMax = -Infinity;
  const cell = step * step;
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let z = minZ + step / 2; z < maxZ; z += step) {
      if (!pointInPolygon([x, z], polygon)) continue;
      const h = heightAt(x, z);
      const d = h - platformH;
      if (d > 0) cut += d * cell;
      else fill -= d * cell;
      n++;
      sum += h;
      tMin = Math.min(tMin, h);
      tMax = Math.max(tMax, h);
    }
  }
  return { cut, fill, area: n * cell, terrainMin: tMin, terrainMax: tMax, terrainMean: n ? sum / n : NaN };
}

/** offset a simple polygon outward by `d` (miter, for orthogonal-ish outlines) */
export function offsetPolygon(poly: P2[], d: number): P2[] {
  // orientation
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  const s = a > 0 ? 1 : -1;
  const n = poly.length;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
    const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]), e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    const n1: P2 = [e1[1] * s, -e1[0] * s], n2: P2 = [e2[1] * s, -e2[0] * s];
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    const k = d / Math.max(cos, 0.2);
    out.push([p1[0] + bis[0] * k, p1[1] + bis[1] * k]);
  }
  return out;
}

const norm = (v: P2): P2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
