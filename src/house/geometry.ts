/**
 * Pure geometry builders for the house (no DOM / materials), so they are unit-testable.
 * Output is in house-local 3D: x = X - cx, y = height above ±0.00, z = Y - cy.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { house, HOUSE_CENTER, TAN_PITCH as T, type Opening, type Vec2, type WallEdge } from './ambrozja17';

const [CX, CY] = HOUSE_CENTER;
export const toLocal = (X: number, Y: number): Vec2 => [X - CX, Y - CY];

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
  | 'gutter';

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
export function planBox(x0: number, x1: number, y0: number, y1: number, h0: number, h1: number) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(h1 - h0), Math.abs(y1 - y0));
  const [lx, lz] = toLocal((x0 + x1) / 2, (y0 + y1) / 2);
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
function wallMatrix(a: Vec2, b: Vec2) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: Vec2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: Vec2 = [-d[1], d[0]]; // inward normal for this outline orientation
  const [ax, az] = toLocal(a[0], a[1]);
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

export function buildHouse(): HouseParts {
  const B = new Bucket();
  const t = house.wallThickness;
  const r = house.roof;
  const Hw = r.topAtWall;
  const th = r.thickness;
  const wallTop = house.wallTop;
  const porchCeil = r.soffit;
  const gableBase = r.soffit - 0.02;
  const P = house.plinth;
  const walls = house.walls;

  // ---------- exterior walls ----------
  walls.forEach((w, i) => {
    const prev = walls[(i + walls.length - 1) % walls.length];
    const next = walls[(i + 1) % walls.length];
    const extA = isReflex(prev.a, w.a, w.b) ? t : 0;
    const extB = isReflex(w.a, w.b, next.b) ? t : 0;
    const { m, L } = wallMatrix(w.a, w.b);
    const top = w.id === 'garW' ? porchCeil : wallTop;

    const shape = new THREE.Shape();
    const u0 = -extA, u1 = L + extB, v0 = -0.02, v1 = top;
    shape.moveTo(u0, v0);
    shape.lineTo(u1, v0);
    shape.lineTo(u1, v1);
    shape.lineTo(u0, v1);
    shape.closePath();

    const ops = house.openings.filter((o) => o.wall === w.id);
    for (const o of ops) {
      const { u0: a0, u1: a1 } = openingSpan(o, w);
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
  const gables: { a: Vec2; b: Vec2; base: number }[] = [
    { a: [r.main.x0, 0], b: [r.main.x1, 0], base: gableBase },
    { a: [r.main.x1, r.main.y1], b: [r.main.x0, r.main.y1], base: porchCeil },
    { a: [0, r.living.y1], b: [0, r.living.y0], base: gableBase },
  ];
  for (const gb of gables) {
    const { m, L } = wallMatrix(gb.a, gb.b);
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
  buildRoof(B);

  // ---------- floor, ceiling, partitions ----------
  const outlineShape = new THREE.Shape(house.outline.map(([X, Y]) => new THREE.Vector2(...toLocal(X, Y))));
  {
    // ShapeGeometry is in XY; swap Y/Z so it lies in XZ (plan Y → +z), facing up
    const g = transform(
      new THREE.ShapeGeometry(outlineShape),
      new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1),
    );
    for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
    B.add('floor', g.clone().translate(0, 0.005, 0));
    const ceil = g.clone().translate(0, house.ceilingHeight, 0);
    flipWinding(ceil);
    for (let i = 0; i < ceil.attributes.normal.count; i++) ceil.attributes.normal.setXYZ(i, 0, -1, 0);
    B.add('interior', ceil);
  }
  for (const [x1, y1, x2, y2] of house.partitions) {
    const it = house.innerWallThickness / 2;
    const xa = Math.min(x1, x2) - (x1 === x2 ? it : 0), xb = Math.max(x1, x2) + (x1 === x2 ? it : 0);
    const ya = Math.min(y1, y2) - (y1 === y2 ? it : 0), yb = Math.max(y1, y2) + (y1 === y2 ? it : 0);
    B.add('interior', planBox(xa, xb, ya, yb, 0, house.ceilingHeight));
  }

  // ---------- terrace, steps, carport ----------
  for (const sl of house.paving) B.add('paving', planBox(sl.x0, sl.x1, sl.y0, sl.y1, -P - 0.3, sl.top));
  const pc = house.porch;
  for (const [px, py] of pc.posts) {
    const h = pc.postSize / 2;
    B.add('plaster', planBox(px - h, px + h, py - h, py + h, -P, porchCeil + 0.02));
  }
  // carport ceiling, flush with the eave soffit
  B.add('soffit', planBox(pc.x0 - 0.01, pc.x1, pc.y0, pc.y1, porchCeil, porchCeil + 0.06));

  // ---------- chimneys ----------
  for (const c of r.chimneys) {
    B.add('plaster', planBox(c.x - c.w / 2, c.x + c.w / 2, c.y - c.d / 2, c.y + c.d / 2, house.ceilingHeight, c.top));
    B.add('trim', planBox(c.x - c.w / 2 - 0.05, c.x + c.w / 2 + 0.05, c.y - c.d / 2 - 0.05, c.y + c.d / 2 + 0.05, c.top, c.top + 0.06));
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

/** roof plane polygons (plan coords) with their height functions */
export function roofPlanes() {
  const r = house.roof;
  const o = r.eaveOverhang, g = r.gableOverhang;
  const Hw = r.topAtWall, half = r.wingWidth / 2;
  const R = r.ridgeX, RY = r.ridgeY;
  const { x0, x1, y1 } = r.main;
  const L0 = r.living.y0, L1 = r.living.y1;
  const hMain = (X: number) => Hw + (half - Math.abs(X - R)) * T;
  const hLiv = (_X: number, Y: number) => Hw + (half - Math.abs(Y - RY)) * T;
  return [
    { id: 'mainE', axis: 'y' as const, poly: [[R, -g], [x1 + o, -g], [x1 + o, y1 + g], [R, y1 + g]] as Vec2[], h: (X: number) => hMain(X) },
    {
      id: 'mainW', axis: 'y' as const,
      poly: [[x0 - o, -g], [R, -g], [R, y1 + g], [x0 - o, y1 + g], [x0 - o, L1 + o], [R, RY], [x0 - o, L0 - o]] as Vec2[],
      h: (X: number) => hMain(X),
    },
    { id: 'livN', axis: 'x' as const, poly: [[-g, L0 - o], [x0 - o, L0 - o], [R, RY], [-g, RY]] as Vec2[], h: (X: number, Y: number) => hLiv(X, Y) },
    { id: 'livS', axis: 'x' as const, poly: [[-g, RY], [R, RY], [x0 - o, L1 + o], [-g, L1 + o]] as Vec2[], h: (X: number, Y: number) => hLiv(X, Y) },
  ];
}

function buildRoof(B: Bucket) {
  const r = house.roof;
  const th = r.thickness;
  const cosP = Math.cos(Math.atan(T));
  for (const pl of roofPlanes()) {
    const pts2 = pl.poly.map(([X, Y]) => new THREE.Vector2(X, Y));
    const tris = THREE.ShapeUtils.triangulateShape(pts2, []);
    const top: number[] = [], bot: number[] = [], uvTop: number[] = [], uvBot: number[] = [];
    const v3 = pl.poly.map(([X, Y]) => {
      const [lx, lz] = toLocal(X, Y);
      return { lx, lz, h: pl.h(X, Y), X, Y };
    });
    // uv: u along eave (metres), v along slope (metres)
    const uvOf = (p: (typeof v3)[number]) => (pl.axis === 'y' ? [p.Y, p.h / Math.sin(Math.atan(T))] : [p.X, p.h / Math.sin(Math.atan(T))]);
    // orientation: ensure top faces up
    for (const [a, b, c] of tris) {
      const A = v3[a], Bv = v3[b], C = v3[c];
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
    // edge faces (fascia)
    const side: number[] = [];
    for (let i = 0; i < v3.length; i++) {
      const p = v3[i], q = v3[(i + 1) % v3.length];
      const pb = p.h - th / cosP, qb = q.h - th / cosP;
      side.push(p.lx, p.h, p.lz, q.lx, q.h, q.lz, q.lx, qb, q.lz);
      side.push(p.lx, p.h, p.lz, q.lx, qb, q.lz, p.lx, pb, p.lz);
    }
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    gs.computeVertexNormals();
    B.add('trim', gs);
  }

  // ---------- boxed eaves: horizontal soffit at r.soffit, fascia, end caps ----------
  const o = r.eaveOverhang, g = r.gableOverhang;
  const thv = th / Math.cos(Math.atan(T));
  const Hw = r.topAtWall;
  const eaveTop = Hw - o * T;
  const S = r.soffit;
  const { x0, x1, y1 } = r.main;
  const L0 = r.living.y0, L1 = r.living.y1;
  const soffits: Vec2[][] = [
    [[x1, -g], [x1 + o, -g], [x1 + o, y1 + g], [x1, y1 + g]],
    [[x0, -g], [x0 - o, -g], [x0 - o, L0 - o], [x0, L0]],
    [[x0, L1], [x0 - o, L1 + o], [x0 - o, y1 + g], [x0, y1 + g]],
    [[-g, L0 - o], [x0 - o, L0 - o], [x0, L0], [-g, L0]],
    [[-g, L1], [x0, L1], [x0 - o, L1 + o], [-g, L1 + o]],
  ];
  for (const poly of soffits) B.add('soffit', horizontalPolygon(poly, S, true));
  // fascia boards along the eave edges
  const fasciae: [Vec2, Vec2][] = [
    [[x1 + o, -g], [x1 + o, y1 + g]],
    [[x0 - o, -g], [x0 - o, L0 - o]],
    [[x0 - o, L1 + o], [x0 - o, y1 + g]],
    [[-g, L0 - o], [x0 - o, L0 - o]],
    [[-g, L1 + o], [x0 - o, L1 + o]],
  ];
  for (const [a, b] of fasciae) {
    const alongX = Math.abs(b[1] - a[1]) < 1e-6;
    const xa = alongX ? Math.min(a[0], b[0]) : a[0] - 0.015, xb = alongX ? Math.max(a[0], b[0]) : a[0] + 0.015;
    const ya = alongX ? a[1] - 0.015 : Math.min(a[1], b[1]), yb = alongX ? a[1] + 0.015 : Math.max(a[1], b[1]);
    B.add('trim', planBox(xa, xb, ya, yb, S, eaveTop - 0.01));
  }
  // end caps closing the eave boxes at the gable overhangs
  const caps: { at: Vec2; out: Vec2; along: 'x' | 'y' }[] = [
    { at: [x1, -g], out: [1, 0], along: 'x' },
    { at: [x1, y1 + g], out: [1, 0], along: 'x' },
    { at: [x0, -g], out: [-1, 0], along: 'x' },
    { at: [x0, y1 + g], out: [-1, 0], along: 'x' },
    { at: [-g, L0], out: [0, -1], along: 'y' },
    { at: [-g, L1], out: [0, 1], along: 'y' },
  ];
  for (const c of caps) {
    const p0 = c.at, p1: Vec2 = [c.at[0] + c.out[0] * o, c.at[1] + c.out[1] * o];
    const [ax, az] = toLocal(...p0), [bx, bz] = toLocal(...p1);
    const pos = [ax, S, az, bx, S, bz, bx, eaveTop - thv, bz, ax, S, az, bx, eaveTop - thv, bz, ax, Hw - thv, az];
    const gc = new THREE.BufferGeometry();
    gc.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gc.computeVertexNormals();
    B.add('trim', gc);
  }

  // gutters hung on the fascia
  const gy = eaveTop - 0.12;
  const gutters: [Vec2, Vec2][] = [
    [[x1 + o + 0.08, -g], [x1 + o + 0.08, y1 + g]],
    [[x0 - o - 0.08, -g], [x0 - o - 0.08, L0 - o]],
    [[x0 - o - 0.08, L1 + o], [x0 - o - 0.08, y1 + g]],
    [[-g, L0 - o - 0.08], [x0 - o, L0 - o - 0.08]],
    [[-g, L1 + o + 0.08], [x0 - o, L1 + o + 0.08]],
  ];
  for (const [a, b] of gutters) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cyl = new THREE.CylinderGeometry(0.07, 0.07, len, 10, 1, true, Math.PI / 2, Math.PI);
    const [ax, az] = toLocal((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
    const mtx = alongX ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    mtx.premultiply(new THREE.Matrix4().makeTranslation(ax, gy, az));
    B.add('gutter', transform(cyl, mtx));
  }
  // downpipes: run down the wall at corners, with a swan-neck under the soffit to the gutter
  const pipes: { wall: Vec2; gutter: Vec2 }[] = [
    { wall: [x1 + 0.08, 0.4], gutter: [x1 + o + 0.08, 0.4] },
    { wall: [x1 + 0.08, y1 - 0.4], gutter: [x1 + o + 0.08, y1 - 0.4] },
    { wall: [x0 - 0.08, 0.4], gutter: [x0 - o - 0.08, 0.4] },
    { wall: [0.4, L0 - 0.08], gutter: [0.4, L0 - o - 0.08] },
    { wall: [0.4, L1 + 0.08], gutter: [0.4, L1 + o + 0.08] },
  ];
  for (const p of pipes) {
    const [wx, wz] = toLocal(...p.wall), [gx, gz] = toLocal(...p.gutter);
    const yTop = S - 0.15;
    const v = new THREE.CylinderGeometry(0.05, 0.05, yTop + house.plinth, 8);
    v.translate(wx, (yTop - house.plinth) / 2, wz);
    B.add('gutter', v);
    const len = Math.hypot(gx - wx, gz - wz);
    const h = new THREE.CylinderGeometry(0.045, 0.045, len, 8);
    const mtx = Math.abs(gx - wx) > Math.abs(gz - wz) ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2);
    mtx.premultiply(new THREE.Matrix4().makeTranslation((wx + gx) / 2, yTop, (wz + gz) / 2));
    B.add('gutter', transform(h, mtx));
    const rise = new THREE.CylinderGeometry(0.045, 0.045, gy - yTop, 8);
    rise.translate(gx, (gy + yTop) / 2, gz);
    B.add('gutter', rise);
  }
}

/** horizontal polygon (plan coords) at height y; faceDown → visible from below */
function horizontalPolygon(poly: Vec2[], y: number, faceDown: boolean) {
  const pts = poly.map(([X, Y]) => new THREE.Vector2(...toLocal(X, Y)));
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
export function footprintLocal(): Vec2[] {
  return house.outline.map(([X, Y]) => toLocal(X, Y));
}

/** roof outline (eaves) in house-local plan coords — used for plan view */
export function roofOutlineLocal(): Vec2[] {
  const r = house.roof;
  const o = r.eaveOverhang, g = r.gableOverhang;
  const { x0, x1, y1 } = r.main;
  const L0 = r.living.y0, L1 = r.living.y1;
  return (
    [
      [-g, L0 - o], [x0 - o, L0 - o], [x0 - o, -g], [x1 + o, -g], [x1 + o, y1 + g], [x0 - o, y1 + g], [x0 - o, L1 + o], [-g, L1 + o],
    ] as Vec2[]
  ).map(([X, Y]) => toLocal(X, Y));
}
