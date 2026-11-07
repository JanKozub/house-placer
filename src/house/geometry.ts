/**
 * Pure geometry builders for the house (no DOM / materials), so they are unit-testable.
 * Output is in house-local 3D: x = X - cx, y = height above ±0.00, z = Y - cy.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HouseDef, Opening, Vec2, WallEdge } from './types';
import { onVolumeEdge, roofFaces, tanPitch, type RoofFace } from './roof';

/** plan coords → house-local (origin at the outline bbox centre) */
export const toLocal = (h: HouseDef, X: number, Y: number): Vec2 => [X - h.width / 2, Y - h.depth / 2];

export type PartName =
  | 'plaster'
  | 'plinth'
  | 'roof'
  | 'soffit'
  | 'trim'
  | 'frame'
  | 'glass'
  | 'wood'
  | 'garageDoor'
  | 'sill'
  | 'floor'
  | 'interior'
  | 'paving'
  | 'gutter'
  | 'accent';

export type HouseParts = Partial<Record<PartName, THREE.BufferGeometry>>;

class Bucket {
  parts = new Map<PartName, THREE.BufferGeometry[]>();
  add(name: PartName, g: THREE.BufferGeometry) {
    const ng = g.index ? g.toNonIndexed() : g;
    // normalise attributes so everything can merge
    for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
    if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((ng.attributes.position.count) * 2), 2));
    if (!ng.attributes.normal) ng.computeVertexNormals();
    ng.groups = [];
    if (!this.parts.has(name)) this.parts.set(name, []);
    this.parts.get(name)!.push(ng);
  }
  build(): HouseParts {
    const out: HouseParts = {};
    for (const [k, list] of this.parts) {
      const m = mergeGeometries(list, false);
      if (m) {
        m.computeBoundingBox();
        m.computeBoundingSphere();
        out[k] = m;
      }
    }
    return out;
  }
}

/** flip triangle winding of a non-indexed geometry (after a mirroring transform) */
function flipWinding(g: THREE.BufferGeometry) {
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const s = a.itemSize;
    const arr = a.array as Float32Array;
    for (let t = 0; t < a.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const i1 = (t + 1) * s + k, i2 = (t + 2) * s + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    a.needsUpdate = true;
  }
}

function transform(g: THREE.BufferGeometry, m: THREE.Matrix4) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.applyMatrix4(m);
  if (m.determinant() < 0) flipWinding(ng);
  return ng;
}

/** box in plan coords: X range, Y range, height range */
export function planBox(h: HouseDef, x0: number, x1: number, y0: number, y1: number, h0: number, h1: number) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(h1 - h0), Math.abs(y1 - y0));
  const [lx, lz] = toLocal(h, (x0 + x1) / 2, (y0 + y1) / 2);
  g.translate(lx, (h0 + h1) / 2, lz);
  boxUVsMetric(g);
  return g;
}

/** re-map box UVs to metres so tiled textures keep their scale */
function boxUVsMetric(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let u: number, v: number;
    if (ay > 0.5) { u = p.getX(i); v = p.getZ(i); }
    else if (ax > 0.5) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u, v);
  }
}

/** matrix mapping wall-local (u along wall, v up, w inward) to house-local 3D */
function wallMatrix(h: HouseDef, a: Vec2, b: Vec2) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Vec2 = [-d[1], d[0]]; // inward normal for this outline orientation
  const [ax, az] = toLocal(h, a[0], a[1]);
  const m = new THREE.Matrix4().set(
    d[0], 0, n[0], ax,
    0, 1, 0, 0,
    d[1], 0, n[1], az,
    0, 0, 0, 1,
  );
  return { m, L, d, n };
}

function rectPath(p: THREE.Path, u0: number, v0: number, u1: number, v1: number) {
  p.moveTo(u0, v0);
  p.lineTo(u0, v1);
  p.lineTo(u1, v1);
  p.lineTo(u1, v0);
  p.closePath();
}

export function openingSpan(o: Opening, w: WallEdge) {
  const horizontal = Math.abs(w.a[1] - w.b[1]) < 1e-6;
  const start = horizontal ? w.a[0] : w.a[1];
  const end = horizontal ? w.b[0] : w.b[1];
  const dir = Math.sign(end - start);
  const c = (o.at - start) * dir; // distance along wall from a
  return { u0: c - o.width / 2, u1: c + o.width / 2, c };
}

function isReflex(prev: Vec2, cur: Vec2, next: Vec2) {
  const d1 = [cur[0] - prev[0], cur[1] - prev[1]];
  const d2 = [next[0] - cur[0], next[1] - cur[1]];
  return d1[0] * d2[1] - d1[1] * d2[0] < 0;
}

const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** the gable triangle standing on wall w (same end points), if any */
export function gableOfWall(house: HouseDef, w: WallEdge) {
  return house.roof.gables.find((g) => same(g.a, w.a) && same(g.b, w.b)) ?? null;
}

/** underside of the roof where it meets a gable wall's ends (height above ±0.00) */
export function gableEaveUnder(house: HouseDef) {
  const T = tanPitch(house);
  return house.roof.topAtWall - house.roof.thickness / Math.cos(Math.atan(T)) + 0.02;
}

/** opening outline in wall-local (u, v): a rectangle, or a pentagon following the roof slopes */
export function openingPolygon(house: HouseDef, o: Opening, u0: number, u1: number): Vec2[] {
  const v0 = Math.max(o.sill, 0), v1 = o.sill + o.height;
  if (o.shape !== 'gable') return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const half = (u1 - u0) / 2;
  const side = Math.max(0.05, o.height - half * tanPitch(house));
  return [[u0, v0], [u1, v0], [u1, v0 + side], [u0 + half, v1], [u0, v0 + side]];
}

/** convex polygon shrunk by d (counter-clockwise or clockwise) */
function insetConvex(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1];
  const sgn = area > 0 ? 1 : -1;
  // offset each edge inward, then intersect neighbouring offset lines
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = (-(q[1] - p[1]) / L) * sgn, ny = ((q[0] - p[0]) / L) * sgn;
    return { p: [p[0] + nx * d, p[1] + ny * d] as Vec2, dx: q[0] - p[0], dy: q[1] - p[1] };
  });
  return lines.map((l, i) => {
    const k = lines[(i + n - 1) % n];
    const den = k.dx * l.dy - k.dy * l.dx;
    if (Math.abs(den) < 1e-12) return l.p;
    const t = ((l.p[0] - k.p[0]) * l.dy - (l.p[1] - k.p[1]) * l.dx) / den;
    return [k.p[0] + k.dx * t, k.p[1] + k.dy * t] as Vec2;
  });
}

const shapeOf = (pts: Vec2[]) => new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
const pathOf = (pts: Vec2[]) => new THREE.Path(pts.map(([u, v]) => new THREE.Vector2(u, v)));

export function buildHouse(house: HouseDef): HouseParts {
  const B = new Bucket();
  const T = tanPitch(house);
  const t = house.wallThickness;
  const r = house.roof;
  const Hw = r.topAtWall;
  const th = r.thickness;
  const P = house.plinth;
  const walls = house.walls;
  const box = (x0: number, x1: number, y0: number, y1: number, h0: number, h1: number) => planBox(house, x0, x1, y0, y1, h0, h1);

  // ---------- exterior walls ----------
  const mergedGables = new Set<(typeof r.gables)[number]>();
  walls.forEach((w, i) => {
    if (w.open) return; // open side (wiata): posts and screens come from `extras`
    const prev = walls[(i + walls.length - 1) % walls.length];
    const next = walls[(i + 1) % walls.length];
    const extA = isReflex(prev.a, w.a, w.b) ? t : 0;
    const extB = isReflex(w.a, w.b, next.b) ? t : 0;
    const { m, L } = wallMatrix(house, w.a, w.b);
    const top = w.top ?? house.wallTop;

    const ops = house.openings.filter((o) => o.wall === w.id);
    // a gable wall with openings above the wall top (attic windows) is built as one pentagon with
    // its gable triangle, so those openings can be cut through it
    const gb = gableOfWall(house, w);
    const merged = !!gb && ops.some((o) => o.sill + o.height > top - 1e-9);
    if (merged) mergedGables.add(gb!);

    const shape = new THREE.Shape();
    const u0 = -extA, u1 = L + extB, v0 = -0.02, v1 = top;
    shape.moveTo(u0, v0);
    shape.lineTo(u1, v0);
    if (merged) {
      const eu = gableEaveUnder(house);
      shape.lineTo(u1, eu);
      shape.lineTo(L / 2, eu + (L / 2) * T);
      shape.lineTo(u0, eu);
    } else {
      shape.lineTo(u1, v1);
      shape.lineTo(u0, v1);
    }
    shape.closePath();

    for (const o of ops) {
      const { u0: a0, u1: a1 } = openingSpan(o, w);
      if (o.shape === 'gable') {
        const poly = openingPolygon(house, o, a0, a1);
        shape.holes.push(pathOf(poly));
        buildGableGlazing(B, poly, m);
        continue;
      }
      const hole = new THREE.Path();
      rectPath(hole, a0, Math.max(o.sill, 0), a1, o.sill + o.height);
      shape.holes.push(hole);
      buildOpening(B, o, w, m, a0, a1);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    B.add('plaster', transform(g, m));

    // plinth band (slightly proud of the façade), split around openings that go below ±0
    const cuts = ops
      .filter((o) => o.sill < 0)
      .map((o) => openingSpan(o, w))
      .sort((a, b) => a.u0 - b.u0);
    let s = u0 - 0.03;
    const segs: [number, number][] = [];
    for (const c of cuts) { segs.push([s, c.u0]); s = c.u1; }
    segs.push([s, u1 + 0.03]);
    for (const [a0, a1] of segs) {
      if (a1 - a0 < 0.01) continue;
      const pb = new THREE.BoxGeometry(a1 - a0, P + 0.5, t + 0.06);
      pb.translate((a0 + a1) / 2, -(P + 0.5) / 2 + 0.0, t / 2 - 0.03);
      boxUVsMetric(pb);
      B.add('plinth', transform(pb, m));
    }
  });

  // ---------- gable triangles ----------
  for (const gb of r.gables) {
    if (mergedGables.has(gb)) continue; // built with its wall
    const { m, L } = wallMatrix(house, gb.a, gb.b);
    const half = L / 2;
    const s = new THREE.Shape();
    const eaveUnder = Hw - th / Math.cos(Math.atan(T)) + 0.02;
    s.moveTo(0, gb.base);
    s.lineTo(L, gb.base);
    s.lineTo(L, eaveUnder);
    s.lineTo(half, eaveUnder + half * T);
    s.lineTo(0, eaveUnder);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    B.add('plaster', transform(g, m));
  }

  // ---------- roof ----------
  buildRoof(B, house);

  // ---------- floor, ceiling, partitions ----------
  const outlineShape = new THREE.Shape(house.outline.map(([X, Y]) => new THREE.Vector2(...toLocal(house, X, Y))));
  const uf = house.upperFloor;
  // double-height spaces and the stairwell cut through the ceiling and the upper slab
  const withVoids = () => {
    const s = new THREE.Shape(house.outline.map(([X, Y]) => new THREE.Vector2(...toLocal(house, X, Y))));
    for (const vd of uf?.voids ?? []) {
      const [ax, az] = toLocal(house, vd.x0, vd.y0), [bx, bz] = toLocal(house, vd.x1, vd.y1);
      const h = new THREE.Path();
      rectPath(h, ax, az, bx, bz);
      s.holes.push(h);
    }
    return s;
  };
  const flat = (s: THREE.Shape, y: number, up: boolean) => {
    // ShapeGeometry is in XY; swap Y/Z so it lies in XZ (plan Y → +z)
    const g = transform(new THREE.ShapeGeometry(s), new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    if (!up) flipWinding(g);
    for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, up ? 1 : -1, 0);
    return g.translate(0, y, 0);
  };
  if (uf) {
    const cut = withVoids();
    B.add('floor', flat(cut, uf.level + 0.005, true));
    B.add('interior', flat(cut, uf.level - uf.thickness, false));
  }
  {
    // ShapeGeometry is in XY; swap Y/Z so it lies in XZ (plan Y → +z), facing up
    const g = transform(
      new THREE.ShapeGeometry(outlineShape),
      new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1),
    );
    for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
    B.add('floor', g.clone().translate(0, 0.005, 0));
    if (uf) B.add('interior', flat(withVoids(), house.ceilingHeight, false));
    else if (house.ceilingOutline) {
      const cs = new THREE.Shape(house.ceilingOutline.map(([X, Y]) => new THREE.Vector2(...toLocal(house, X, Y))));
      B.add('interior', flat(cs, house.ceilingHeight, false));
    } else {
      const ceil = g.clone().translate(0, house.ceilingHeight, 0);
      flipWinding(ceil);
      for (let i = 0; i < ceil.attributes.normal.count; i++) ceil.attributes.normal.setXYZ(i, 0, -1, 0);
      B.add('interior', ceil);
    }
  }
  for (const [x1, y1, x2, y2] of house.partitions) {
    const it = house.innerWallThickness / 2;
    const xa = Math.min(x1, x2) - (x1 === x2 ? it : 0), xb = Math.max(x1, x2) + (x1 === x2 ? it : 0);
    const ya = Math.min(y1, y2) - (y1 === y2 ? it : 0), yb = Math.max(y1, y2) + (y1 === y2 ? it : 0);
    B.add('interior', box(xa, xb, ya, yb, 0, house.ceilingHeight));
  }

  // ---------- terrace, steps, porches ----------
  for (const sl of house.paving) B.add('paving', box(sl.x0, sl.x1, sl.y0, sl.y1, -P - 0.3, sl.top));
  for (const pc of house.porches) {
    for (const [px, py] of pc.posts) {
      const hs = pc.postSize / 2;
      B.add('plaster', box(px - hs, px + hs, py - hs, py + hs, -P, pc.ceiling + 0.02));
    }
    // porch ceiling, flush with the eave soffit
    if (pc.soffit !== false) B.add('soffit', box(pc.x0 - 0.01, pc.x1, pc.y0, pc.y1, pc.ceiling, pc.ceiling + 0.06));
  }

  // ---------- chimneys ----------
  for (const c of r.chimneys) {
    B.add('plaster', box(c.x - c.w / 2, c.x + c.w / 2, c.y - c.d / 2, c.y + c.d / 2, house.ceilingHeight, c.top));
    B.add('trim', box(c.x - c.w / 2 - 0.05, c.x + c.w / 2 + 0.05, c.y - c.d / 2 - 0.05, c.y + c.d / 2 + 0.05, c.top, c.top + 0.06));
  }

  // ---------- pergolas, canopies, posts ----------
  for (const e of house.extras ?? []) B.add(e.part, box(e.x0, e.x1, e.y0, e.y1, e.h0, e.h1));

  // ---------- façade zones (render colour band, wood cladding), cut around openings ----------
  for (const z of house.facadeZones ?? []) buildZone(B, house, z);

  // ---------- roof windows ----------
  if (house.roofWindows?.length) {
    const faces = roofFaces(house);
    for (const rw of house.roofWindows) buildRoofWindow(B, house, faces, rw.at, rw.width, rw.length);
  }

  return B.build();
}

/** window/door frame, glass, sill — built in wall-local space then transformed */
function buildOpening(B: Bucket, o: Opening, _w: WallEdge, m: THREE.Matrix4, u0: number, u1: number) {
  const fw = 0.07; // frame width
  const fd = 0.08; // frame depth
  const set = 0.14; // set back from façade
  const v0 = Math.max(o.sill, o.kind === 'garage' ? o.sill : 0), v1 = o.sill + o.height;
  const W = u1 - u0;
  const box = (a0: number, a1: number, b0: number, b1: number, w0: number, w1: number) => {
    const g = new THREE.BoxGeometry(a1 - a0, b1 - b0, w1 - w0);
    g.translate((a0 + a1) / 2, (b0 + b1) / 2, (w0 + w1) / 2);
    boxUVsMetric(g);
    return transform(g, m);
  };

  if (o.kind === 'garage') {
    B.add('garageDoor', box(u0, u1, o.sill, v1, set, set + 0.05));
    B.add('frame', box(u0 - 0.02, u1 + 0.02, v1 - 0.06, v1, set - 0.01, set + 0.07));
    return;
  }
  if (o.kind === 'entrance') {
    B.add('wood', box(u0 + fw, u1 - fw, v0, v1 - fw, set + 0.02, set + 0.07));
    B.add('frame', box(u0, u0 + fw, v0, v1, set, set + fd));
    B.add('frame', box(u1 - fw, u1, v0, v1, set, set + fd));
    B.add('frame', box(u0, u1, v1 - fw, v1, set, set + fd));
    B.add('trim', box(u0 + fw + 0.12, u0 + fw + 0.15, v0 + 0.9, v0 + 1.6, set - 0.02, set + 0.02)); // handle bar
    return;
  }
  // frame
  B.add('frame', box(u0, u0 + fw, v0, v1, set, set + fd));
  B.add('frame', box(u1 - fw, u1, v0, v1, set, set + fd));
  B.add('frame', box(u0, u1, v1 - fw, v1, set, set + fd));
  B.add('frame', box(u0, u1, v0, v0 + fw, set, set + fd));
  // mullions
  const panes = o.panes ?? (o.kind === 'hs' || o.kind === 'terraceDoor' || W > 1.6 ? 2 : 1);
  for (let k = 1; k < panes; k++) {
    const um = u0 + (W * k) / panes;
    B.add('frame', box(um - fw / 2, um + fw / 2, v0, v1, set, set + fd));
  }
  // glass
  B.add('glass', box(u0 + fw, u1 - fw, v0 + fw, v1 - fw, set + fd / 2 - 0.005, set + fd / 2 + 0.005));
  // external sill for windows with a parapet
  if (o.sill > 0.2) B.add('sill', box(u0 - 0.03, u1 + 0.03, v0 - 0.03, v0, -0.05, set + 0.02));
  // interior shades on bedroom/bath windows (visual depth)
}

/** triangular / pentagonal glazing in a gable: frame ring, glass, three mullions */
function buildGableGlazing(B: Bucket, poly: Vec2[], m: THREE.Matrix4) {
  const fw = 0.07, fd = 0.08, set = 0.14;
  const inner = insetConvex(poly, fw);
  const ring = shapeOf(poly);
  ring.holes.push(pathOf(inner));
  B.add('frame', transform(new THREE.ExtrudeGeometry(ring, { depth: fd, bevelEnabled: false }).translate(0, 0, set), m));
  B.add('glass', transform(new THREE.ExtrudeGeometry(shapeOf(inner), { depth: 0.01, bevelEnabled: false }).translate(0, 0, set + fd / 2 - 0.005), m));
  // mullions: vertical bars dividing the width in four, up to the sloped top
  const u0 = Math.min(...poly.map((p) => p[0])), u1 = Math.max(...poly.map((p) => p[0]));
  const v0 = Math.min(...poly.map((p) => p[1]));
  const topAt = (u: number) => {
    let t = -Infinity;
    for (let i = 0; i < inner.length; i++) {
      const a = inner[i], b = inner[(i + 1) % inner.length];
      if ((a[0] - u) * (b[0] - u) <= 0 && a[0] !== b[0]) t = Math.max(t, a[1] + ((u - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
    }
    return t;
  };
  for (let k = 1; k < 4; k++) {
    const u = u0 + ((u1 - u0) * k) / 4;
    const g = new THREE.BoxGeometry(fw, topAt(u) - v0 - fw, fd);
    g.translate(u, (topAt(u) + v0 + fw) / 2, set + fd / 2);
    B.add('frame', transform(g, m));
  }
}

/** cladding panels 2 cm proud of a wall, split into pieces around the openings they meet */
function buildZone(B: Bucket, house: HouseDef, z: NonNullable<HouseDef['facadeZones']>[number]) {
  const w = house.walls.find((ww) => ww.id === z.wall);
  if (!w) return;
  const { m, L } = wallMatrix(house, w.a, w.b);
  const along = (coord: number) => openingSpan({ at: coord, width: 0 } as Opening, w).c;
  let za = along(z.from), zb = along(z.to);
  if (za > zb) [za, zb] = [zb, za];
  za = Math.max(0, za); zb = Math.min(L, zb);
  // openings overlapping the zone, merged where they overlap along the wall
  const holes = house.openings
    .filter((o) => o.wall === w.id)
    .map((o) => {
      const s = openingSpan(o, w);
      return { a: Math.max(za, s.u0 - 0.02), b: Math.min(zb, s.u1 + 0.02), lo: Math.max(z.h0, o.sill), hi: Math.min(z.h1, o.sill + o.height + 0.02) };
    })
    .filter((h) => h.b > h.a && h.hi > h.lo)
    .sort((p, q) => p.a - q.a);
  const piece = (a: number, b: number, lo: number, hi: number) => {
    if (b - a < 0.005 || hi - lo < 0.005) return;
    const g = new THREE.BoxGeometry(b - a, hi - lo, 0.02);
    g.translate((a + b) / 2, (lo + hi) / 2, -0.01);
    boxUVsMetric(g);
    B.add(z.finish, transform(g, m));
  };
  let u = za;
  for (const h of holes) {
    piece(u, Math.max(u, h.a), z.h0, z.h1);
    const a = Math.max(u, h.a);
    piece(a, h.b, z.h0, h.lo);
    piece(a, h.b, h.hi, z.h1);
    u = Math.max(u, h.b);
  }
  piece(u, zb, z.h0, z.h1);
}

/** a roof window lying in the slope of the roof face under `at` */
function buildRoofWindow(B: Bucket, house: HouseDef, faces: RoofFace[], at: Vec2, width: number, length: number) {
  const face = faces.find((f) => inConvex(at, f.poly));
  if (!face) return;
  const T = tanPitch(house);
  const [nx, ny] = face.plane.n; // up-slope direction in plan
  // local frame in house-local 3D: u along the eave, s up the slope, k out of the roof
  const toL = (X: number, Y: number) => toLocal(house, X, Y);
  const [cx, cz] = toL(at[0], at[1]);
  const [ex, ez] = toL(at[0] + nx, at[1] + ny);
  const s = new THREE.Vector3(ex - cx, T, ez - cz).normalize();
  const u = new THREE.Vector3(-(ez - cz), 0, ex - cx).normalize();
  const k = new THREE.Vector3().crossVectors(u, s);
  if (k.y < 0) { u.negate(); k.negate(); }
  const c = new THREE.Vector3(cx, face.h(at[0], at[1]), cz);
  const basis = new THREE.Matrix4().makeBasis(u, k, s).setPosition(c);
  const frame = new THREE.BoxGeometry(width, 0.1, length).translate(0, 0.03, 0);
  B.add('trim', transform(frame, basis));
  const glass = new THREE.BoxGeometry(width - 0.14, 0.012, length - 0.14).translate(0, 0.085, 0);
  B.add('glass', transform(glass, basis));
}

function inConvex(p: Vec2, poly: Vec2[]) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(c) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

function buildRoof(B: Bucket, house: HouseDef) {
  const r = house.roof;
  const T = tanPitch(house);
  const th = r.thickness;
  const cosP = Math.cos(Math.atan(T));
  const sinP = Math.sin(Math.atan(T));
  for (const face of roofFaces(house)) {
    const vol = r.volumes[face.volume];
    const top: number[] = [], bot: number[] = [], uvTop: number[] = [], uvBot: number[] = [];
    const v3 = face.poly.map(([X, Y]) => {
      const [lx, lz] = toLocal(house, X, Y);
      return { lx, lz, h: face.h(X, Y), X, Y };
    });
    // uv: u along eave (metres), v along slope (metres)
    const uvOf = (p: (typeof v3)[number]) => (face.plane.u === 'y' ? [p.Y, p.h / sinP] : [p.X, p.h / sinP]);
    // convex: fan triangulation; orientation: ensure top faces up
    for (let k = 1; k + 1 < v3.length; k++) {
      const A = v3[0], Bv = v3[k], C = v3[k + 1];
      const n = new THREE.Vector3().crossVectors(
        new THREE.Vector3(Bv.lx - A.lx, Bv.h - A.h, Bv.lz - A.lz),
        new THREE.Vector3(C.lx - A.lx, C.h - A.h, C.lz - A.lz),
      );
      const order = n.y > 0 ? [A, Bv, C] : [A, C, Bv];
      for (const p of order) { top.push(p.lx, p.h, p.lz); uvTop.push(...uvOf(p)); }
      for (const p of [...order].reverse()) { bot.push(p.lx, p.h - th / cosP, p.lz); uvBot.push(p.lx, p.lz); }
    }
    const gt = new THREE.BufferGeometry();
    gt.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    gt.setAttribute('uv', new THREE.Float32BufferAttribute(uvTop, 2));
    gt.computeVertexNormals();
    B.add('roof', gt);
    const gbm = new THREE.BufferGeometry();
    gbm.setAttribute('position', new THREE.Float32BufferAttribute(bot, 3));
    gbm.setAttribute('uv', new THREE.Float32BufferAttribute(uvBot, 2));
    gbm.computeVertexNormals();
    B.add('soffit', gbm);
    // edge faces (fascia / verge) on the volume's outer edges
    const side: number[] = [];
    for (let i = 0; i < v3.length; i++) {
      const p = v3[i], q = v3[(i + 1) % v3.length];
      if (!onVolumeEdge(vol, [p.X, p.Y], [q.X, q.Y])) continue;
      const pb = p.h - th / cosP, qb = q.h - th / cosP;
      side.push(p.lx, p.h, p.lz, q.lx, q.h, q.lz, q.lx, qb, q.lz);
      side.push(p.lx, p.h, p.lz, q.lx, qb, q.lz, p.lx, pb, p.lz);
    }
    if (side.length) {
      const gs = new THREE.BufferGeometry();
      gs.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
      gs.computeVertexNormals();
      B.add('trim', gs);
    }
  }

  // ---------- boxed eaves: horizontal soffit at r.soffit, fascia, end caps ----------
  const o = r.eaveOverhang;
  const thv = th / Math.cos(Math.atan(T));
  const Hw = r.topAtWall;
  const eaveTop = Hw - o * T;
  const S = r.soffit;
  for (const poly of r.soffits) B.add('soffit', horizontalPolygon(house, poly, S, true));
  // fascia boards along the eave edges
  for (const [a, b] of r.fasciae) {
    const alongX = Math.abs(b[1] - a[1]) < 1e-6;
    const xa = alongX ? Math.min(a[0], b[0]) : a[0] - 0.015, xb = alongX ? Math.max(a[0], b[0]) : a[0] + 0.015;
    const ya = alongX ? a[1] - 0.015 : Math.min(a[1], b[1]), yb = alongX ? a[1] + 0.015 : Math.max(a[1], b[1]);
    B.add('trim', planBox(house, xa, xb, ya, yb, S, eaveTop - 0.01));
  }
  // end caps closing the eave boxes at the gable overhangs
  for (const c of r.caps) {
    const p0 = c.at, p1: Vec2 = [c.at[0] + c.out[0] * o, c.at[1] + c.out[1] * o];
    const [ax, az] = toLocal(house, ...p0), [bx, bz] = toLocal(house, ...p1);
    const pos = [ax, S, az, bx, S, bz, bx, eaveTop - thv, bz, ax, S, az, bx, eaveTop - thv, bz, ax, Hw - thv, az];
    const gc = new THREE.BufferGeometry();
    gc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gc.computeVertexNormals();
    B.add('trim', gc);
  }

  // gutters hung on the fascia
  const gy = eaveTop - 0.12;
  for (const [a, b] of r.gutters) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cyl = new THREE.CylinderGeometry(0.07, 0.07, len, 10, 1, true, Math.PI / 2, Math.PI);
    const [ax, az] = toLocal(house, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const mtx = alongX ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    mtx.premultiply(new THREE.Matrix4().makeTranslation(ax, gy, az));
    B.add('gutter', transform(cyl, mtx));
  }
  // downpipes: run down the wall at corners, with a swan-neck under the soffit to the gutter
  for (const p of r.pipes) {
    const [wx, wz] = toLocal(house, ...p.wall), [gx, gz] = toLocal(house, ...p.gutter);
    const yTop = S - 0.15;
    const v = new THREE.CylinderGeometry(0.05, 0.05, yTop + house.plinth, 8);
    v.translate(wx, (yTop - house.plinth) / 2, wz);
    B.add('gutter', v);
    const len = Math.hypot(gx - wx, gz - wz);
    const hc = new THREE.CylinderGeometry(0.045, 0.045, len, 8);
    const mtx = Math.abs(gx - wx) > Math.abs(gz - wz) ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    mtx.premultiply(new THREE.Matrix4().makeTranslation((wx + gx) / 2, yTop, (wz + gz) / 2));
    B.add('gutter', transform(hc, mtx));
    const rise = new THREE.CylinderGeometry(0.045, 0.045, gy - yTop, 8);
    rise.translate(gx, (gy + yTop) / 2, gz);
    B.add('gutter', rise);
  }
}

/** horizontal polygon (plan coords) at height y; faceDown → visible from below */
function horizontalPolygon(house: HouseDef, poly: Vec2[], y: number, faceDown: boolean) {
  const pts = poly.map(([X, Y]) => new THREE.Vector2(...toLocal(house, X, Y)));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []);
  const pos: number[] = [], uv: number[] = [];
  for (const [a, b, c] of tris) {
    const A = pts[a], Bp = pts[b], C = pts[c];
    // cross in (x,z): sign of y component of (B−A)×(C−A) = (Bz−Az)(Cx−Ax) − (Bx−Ax)(Cz−Az)
    const ny = (Bp.y - A.y) * (C.x - A.x) - (Bp.x - A.x) * (C.y - A.y);
    const order = (ny < 0) === faceDown ? [A, Bp, C] : [A, C, Bp];
    for (const p of order) { pos.push(p.x, y, p.y); uv.push(p.x, p.y); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** exterior footprint polygon in house-local plan coords (x, z) */
export function footprintLocal(house: HouseDef): Vec2[] {
  return house.outline.map(([X, Y]) => toLocal(house, X, Y));
}

/** roof outline (eaves) in house-local plan coords — used for plan view */
export function roofOutlineLocal(house: HouseDef): Vec2[] {
  return house.roof.outline.map(([X, Y]) => toLocal(house, X, Y));
}
