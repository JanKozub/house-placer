/**
 * Staking plan: where to drive wooden stakes on the plot to see the house at full size.
 *
 * Everything outside the house (house corners, terrace, gate posts) is measured from the
 * plot borders, the way it is done with two tapes: walk `along` metres along a border from one of
 * its corners, square off, and measure `d` metres straight into the plot. Every point is given
 * against its two nearest borders, so the second one checks the first.
 * The inside walls are measured from the house's own walls once its corners are staked: the
 * distance from wall A–B and from the other wall meeting at corner A (strings between the stakes).
 *
 * Labels: plot corners I–VI (corner i starts border i + 1, as the app numbers the borders), house
 * corners A, B, … by outline index (as on the plan view), T1… terrace, B1/B2 sliding
 * gate posts, F1/F2 wicket posts, 1…N ends of the inside walls.
 */
import type { HouseDef, Vec2 } from '../house/types';
import { toLocal } from '../house/geometry';
import type { Gate } from '../site/sitePlan';
import { centroid, closestOnSegment, pointInPolygon, toSite, type P2, type Placement } from './geom2d';
import { cornerLabel } from './setbacks';
import { simplePlan } from './simplePlan';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const plotCornerName = (i: number) => ROMAN[i] ?? String(i + 1);

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** a border of the plot: corner `edge` → corner `edge + 1`, unit direction and inward normal */
export function border(parcel: P2[], edge: number) {
  const a = parcel[edge], b = parcel[(edge + 1) % parcel.length];
  const L = dist(a, b);
  const dir: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n: P2 = [-dir[1], dir[0]];
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (!pointInPolygon([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], parcel)) n = [-n[0], -n[1]];
  return { a, b, L, dir, n };
}

/** how to reach a point from one border: `along` metres from plot corner `corner`, then `d` metres in */
export interface BorderRef {
  /** border index (0-based; shown as edge + 1) */
  edge: number;
  /** perpendicular distance from the border into the plot */
  d: number;
  /** metres along the border from its first corner */
  s: number;
  /** the plot corner the measurement along the border starts at (the nearer end) */
  corner: number;
  along: number;
  /** where the measurement meets the border */
  foot: P2;
  /** the measurement runs across a building (fine on an empty plot, but not drawn on the sketch) */
  through?: boolean;
  /** not square to the border: from `foot` the stake is `d` metres away in direction `dir` (a line parallel to a house wall) */
  dir?: P2;
}

/** a stake drawn on the sketches with a line to a border: parallel to the house walls (page 1) and square to that border (page 2) */
export interface StakeLine {
  label: string;
  wall: BorderRef;
  square: BorderRef;
}

/**
 * The borders a point can be measured from: those whose perpendicular foot lies on the border
 * (between its two corners), nearest first, at most `count`.
 */
export function borderOffsets(p: P2, parcel: P2[], count = 2): BorderRef[] {
  const out: BorderRef[] = [];
  for (let e = 0; e < parcel.length; e++) {
    const { a, L, dir, n } = border(parcel, e);
    const s = dot(sub(p, a), dir);
    if (s < -0.005 || s > L + 0.005) continue;
    const d = dot(sub(p, a), n);
    if (d < -0.005) continue; // the border's own outside
    const sc = Math.max(0, Math.min(L, s));
    const fromEnd = sc > L / 2;
    out.push({ edge: e, d: Math.max(0, d), s: sc, corner: fromEnd ? (e + 1) % parcel.length : e, along: fromEnd ? L - sc : sc, foot: [a[0] + dir[0] * sc, a[1] + dir[1] * sc] });
  }
  return out.sort((x, y) => x.d - y.d).slice(0, count);
}

/** the point a BorderRef leads to (to check that the table brings you to the right spot) */
export function pointFromRef(parcel: P2[], r: BorderRef): P2 {
  const { a, b, dir, n } = border(parcel, r.edge);
  const base: P2 = r.corner === r.edge ? [a[0] + dir[0] * r.along, a[1] + dir[1] * r.along] : [b[0] - dir[0] * r.along, b[1] - dir[1] * r.along];
  const m = r.dir ?? n;
  return [base[0] + m[0] * r.d, base[1] + m[1] * r.d];
}

/** where the line from p in direction d first meets the plot boundary, as a measurement from the border back to p */
export function lineToBorder(parcel: P2[], p: P2, d: P2): BorderRef | null {
  let best: BorderRef | null = null;
  for (let e = 0; e < parcel.length; e++) {
    const a = parcel[e], b = parcel[(e + 1) % parcel.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const den = d[0] * ez - d[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / den, q = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
    if (t <= 1e-6 || q < -1e-9 || q > 1 + 1e-9 || (best && t >= best.d)) continue;
    const L = Math.hypot(ex, ez), sv = q * L, fromEnd = sv > L / 2;
    best = { edge: e, d: t, s: sv, corner: fromEnd ? (e + 1) % parcel.length : e, along: fromEnd ? L - sv : sv, foot: [a[0] + ex * q, a[1] + ez * q], dir: [-d[0], -d[1]] };
  }
  return best;
}

export type StakeKind = 'house' | 'annex' | 'terrace' | 'gate' | 'wicket';

export interface BorderStake {
  label: string;
  kind: StakeKind;
  /** what the stake marks (Polish) */
  what: string;
  p: P2;
  /** nearest border first; the second is the check */
  refs: BorderRef[];
  /** when no border can be measured square from: the nearest plot corner */
  nearestCorner?: { corner: number; d: number };
  inside: boolean;
  /** unit direction (site) to put the label on the sketch */
  out: P2;
}

/** an end of an inside wall, measured from the house's own walls */
export interface InsideStake {
  n: number;
  /** plan coordinates */
  plan: Vec2;
  /** site coordinates */
  p: P2;
  /** distance from the line of wall A–B (outline[0] → outline[1]) */
  fromAB: number;
  /** distance from the line of the other wall meeting at A (outline[last] → outline[0]) */
  fromSide: number;
}

/** a vertex where the outline runs straight through (no corner to stake) */
export const straightThrough = (poly: Vec2[] | P2[], i: number) => {
  const n = poly.length, a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
  const u = sub(b as P2, a as P2), v = sub(c as P2, b as P2);
  const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1]);
  if (lu < 1e-6 || lv < 1e-6) return true;
  return Math.abs(u[0] * v[1] - u[1] * v[0]) / (lu * lv) < 1e-3;
};

/** is vertex i an outer (convex) corner of the polygon? */
function convex(poly: Vec2[], i: number) {
  const n = poly.length;
  let area = 0;
  for (let k = 0; k < n; k++) area += poly[k][0] * poly[(k + 1) % n][1] - poly[(k + 1) % n][0] * poly[k][1];
  const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
  const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  return cross * area > 0;
}

/** distance from point p to the polygon's boundary */
function distToOutline(p: Vec2, poly: Vec2[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, dist(p, closestOnSegment(p, poly[i], poly[(i + 1) % poly.length])));
  return best;
}

/** distance from p to the infinite line through a and b */
const lineDist = (p: Vec2, a: Vec2, b: Vec2) => {
  const L = dist(a, b);
  return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / L;
};

const unit = (v: P2): P2 => {
  const L = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / L, v[1] / L];
};

/** one point per group of points closer than `tol` to each other: their mean (walls meeting at one spot) */
function cluster(pts: Vec2[], tol: number): Vec2[] {
  const groups: Vec2[][] = [];
  for (const p of pts) {
    const g = groups.find((gg) => gg.some((q) => dist(p, q) < tol));
    if (g) g.push(p);
    else groups.push([p]);
  }
  // groups that grew towards each other
  for (let i = 0; i < groups.length; i++)
    for (let j = groups.length - 1; j > i; j--)
      if (groups[i].some((p) => groups[j].some((q) => dist(p, q) < tol))) groups[i].push(...groups.splice(j, 1)[0]);
  return groups.map((g) => [g.reduce((s, p) => s + p[0], 0) / g.length, g.reduce((s, p) => s + p[1], 0) / g.length]);
}

/** a terrace corner closer than this to the house is not staked on its own (the house corner shows it) */
const NEAR_HOUSE = 0.3;
/** the second (check) measurement is left out when it is longer than this (a 30 m tape) */
const MAX_CHECK = 30;
/** ends of inside walls closer than this are one stake (the plans dimension each wall face separately) */
const SAME_SPOT = 0.15;

export interface StakeoutBuilding {
  label: string;
  /** first letter for corner labels of a separate building (G1, G2…) */
  letter: string;
  def: HouseDef;
  placement: Placement;
  floorLevel: number;
}

export interface StakeoutInput {
  parcel: P2[];
  parcelNumber: string;
  house: HouseDef;
  placement: Placement;
  floorLevel: number;
  /** separate buildings of the project (a detached garage), not the extra buildings on the plot */
  annexes?: StakeoutBuilding[];
  gates: Gate[];
  /** driveway outlines (site coords): drawn on the sketch, not staked */
  driveways: P2[][];
  /** shown on the sheet */
  date?: string;
}

const COMPASS = ['północna', 'północno-wschodnia', 'wschodnia', 'południowo-wschodnia', 'południowa', 'południowo-zachodnia', 'zachodnia', 'północno-zachodnia'];

/** the corners of a building to stake (site), with their labels; straight-through vertices are left out */
function buildingCorners(def: HouseDef, pl: Placement, label: (i: number) => string) {
  const fp = def.outline.map(([X, Y]) => toSite(toLocal(def, X, Y), pl));
  return fp.flatMap((p, i) => (straightThrough(def.outline, i) ? [] : [{ i, label: label(i), p }]));
}

/** everything the staking sheet shows, in site coords (sketch, table) and the house's plan coords (inside walls) */
export function makeStakeoutPlan(inp: StakeoutInput) {
  const { parcel, house, placement: pl } = inp;
  const site = (X: number, Y: number) => toSite(toLocal(house, X, Y), pl);
  const footprint = house.outline.map(([X, Y]) => site(X, Y));
  const hc = centroid(footprint);
  const plotC = centroid(parcel);
  const annexFootprints = (inp.annexes ?? []).map((a) => a.def.outline.map(([X, Y]) => toSite(toLocal(a.def, X, Y), a.placement)));
  const blocks = [footprint, ...annexFootprints];
  /** does the line p → q run across a building? */
  const crosses = (p: P2, q: P2) => {
    const L = dist(p, q);
    for (let s = 0.1; s < L - 0.05; s += 0.2) {
      const x: P2 = [p[0] + ((q[0] - p[0]) * s) / L, p[1] + ((q[1] - p[1]) * s) / L];
      if (blocks.some((b) => pointInPolygon(x, b))) return true;
    }
    return false;
  };
  const stakes: BorderStake[] = [];
  const add = (label: string, kind: StakeKind, what: string, p: P2, out: P2, refs?: BorderRef[]) => {
    let r = refs;
    if (!r) {
      // nearest borders first, but a measurement that does not run across the house before one that does
      const all = borderOffsets(p, parcel, parcel.length).map((x) => ({ ...x, through: crosses(p, x.foot) }));
      r = [...all.filter((x) => !x.through), ...all.filter((x) => x.through)].slice(0, 2);
      // a check longer than a usual tape is no help
      if (r.length > 1 && r[1].d > MAX_CHECK) r = r.slice(0, 1);
    }
    let nearestCorner: BorderStake['nearestCorner'];
    if (!r.length) {
      let best = 0;
      parcel.forEach((c, i) => { if (dist(c, p) < dist(parcel[best], p)) best = i; });
      nearestCorner = { corner: best, d: dist(parcel[best], p) };
    }
    // on the boundary (gate posts) counts as inside
    const inside = pointInPolygon(p, parcel) || distToOutline(p, parcel) < 0.01;
    stakes.push({ label, kind, what, p, refs: r, nearestCorner, inside, out: unit(out) });
  };

  // house corners
  const corners = buildingCorners(house, pl, cornerLabel);
  for (const c of corners) add(c.label, 'house', 'narożnik domu', c.p, sub(c.p, hc));

  // separate buildings of the project (a detached garage)
  const buildings = (inp.annexes ?? []).map((a, ai) => {
    const fp = annexFootprints[ai];
    const ac = centroid(fp);
    for (const c of buildingCorners(a.def, a.placement, (i) => `${a.letter}${i + 1}`)) add(c.label, 'annex', `narożnik: ${a.label.toLowerCase()}`, c.p, sub(c.p, ac));
    return { label: a.label, footprint: fp, partitions: a.def.partitions.map(([x1, y1, x2, y2]) => [toSite(toLocal(a.def, x1, y1), a.placement), toSite(toLocal(a.def, x2, y2), a.placement)] as [P2, P2]) };
  });

  // terrace: its own outline where the project has one, else the measured terrace corner(s)
  const terracePlan: Vec2[] | null = house.terrace ?? null;
  // its outer corners only: an inner corner (where the deeper part steps back) adds nothing to see
  const terracePts: Vec2[] = terracePlan
    ? terracePlan.filter((v, i) => convex(terracePlan, i) && distToOutline(v, house.outline) > NEAR_HOUSE)
    : house.terraceCorners.map((t) => t.at);
  terracePts.forEach((v, i) => {
    const p = site(v[0], v[1]);
    add(terracePts.length > 1 ? `T${i + 1}` : 'T', 'terrace', 'narożnik tarasu', p, sub(p, hc));
  });

  // gate and wicket posts: on the border itself
  // the sliding gate only: the user left the wicket out of the sheet (2026-11-20)
  const gates = inp.gates.filter((g) => g.kind === 'sliding').map((g) => {
    const { a, L, dir, n } = border(parcel, g.edge);
    const at = (s: number): P2 => [a[0] + dir[0] * s, a[1] + dir[1] * s];
    const ref = (s: number): BorderRef => {
      const fromEnd = s > L / 2;
      return { edge: g.edge, d: 0, s, corner: fromEnd ? (g.edge + 1) % parcel.length : g.edge, along: fromEnd ? L - s : s, foot: at(s) };
    };
    const letter = g.kind === 'sliding' ? 'B' : 'F';
    const name = g.kind === 'sliding' ? 'brama' : 'furtka';
    // posts: the one nearer the plot corner the measurement starts at first
    const [s1, s2] = ref(g.from).corner === g.edge ? [g.from, g.to] : [g.to, g.from];
    // on the sketch: gate post labels outside the fence, wicket post labels inside (the posts are close)
    const out: P2 = g.kind === 'sliding' ? [-n[0], -n[1]] : n;
    add(`${letter}1`, g.kind === 'sliding' ? 'gate' : 'wicket', `${name} – słupek`, at(s1), out, [ref(s1)]);
    add(`${letter}2`, g.kind === 'sliding' ? 'gate' : 'wicket', `${name} – słupek`, at(s2), out, [ref(s2)]);
    return { kind: g.kind, name, a: at(g.from), b: at(g.to), width: g.to - g.from, edge: g.edge };
  });

  // the driveway is drawn on the sketch but not staked (the user's choice, 2026-11-20)
  // table order: house, its separate buildings, terrace, gate, wicket
  const ORDER: StakeKind[] = ['house', 'annex', 'terrace', 'gate', 'wicket'];
  stakes.sort((u, v) => ORDER.indexOf(u.kind) - ORDER.indexOf(v.kind));

  // ---- the stakes drawn with a line to a border, two ways: parallel to the house walls (the wall
  // line run on to the border, page 1) and square to that border (page 2). Which stakes: every
  // house corner whose square line does not cross the house, and every terrace corner in line with a
  // house corner on the back wall (within 0.5 m along it); a house corner whose wall-parallel line
  // would run beside such a terrace corner's (A beside T1) is left to the terrace's. ----
  const hA = footprint[0], hB = footprint[1], hab = dist(hA, hB);
  const hX: P2 = [(hB[0] - hA[0]) / hab, (hB[1] - hA[1]) / hab];
  let hN: P2 = [-hX[1], hX[0]];
  if ((hc[0] - hA[0]) * hN[0] + (hc[1] - hA[1]) * hN[1] < 0) hN = [-hN[0], -hN[1]];
  const axes: P2[] = [hX, [-hX[0], -hX[1]], hN, [-hN[0], -hN[1]]];
  const nearestAxis = (d: P2) => axes.reduce((m, a) => (dot(a, d) > dot(m, d) ? a : m));
  const uOf = (p: P2) => dot(sub(p, hA), hX), vOf = (p: P2) => dot(sub(p, hA), hN);
  const backWall = stakes.filter((st) => st.kind === 'house' && Math.abs(vOf(st.p)) < 0.01);
  const terraceLines = !terracePlan || !backWall.length ? [] : stakes.filter((st) => st.kind === 'terrace').flatMap((t) => {
    const c = backWall.reduce((m, h) => (Math.abs(uOf(h.p) - uOf(t.p)) < Math.abs(uOf(m.p) - uOf(t.p)) ? h : m));
    return Math.abs(uOf(c.p) - uOf(t.p)) > 0.5 ? [] : [{ st: t, dir: nearestAxis(unit(sub(t.p, c.p))), from: c }];
  });
  // (a terrace without an outline has its single corner treated like a house corner)
  const houseLines = stakes.filter((st) => st.kind === 'house' || st.kind === 'annex' || (st.kind === 'terrace' && !terracePlan)).flatMap((st) => {
    const r = st.refs.find((rr) => !rr.through);
    if (!r) return [];
    const dir = nearestAxis(unit(sub(r.foot, st.p)));
    return terraceLines.some((t) => t.from === st && t.dir === dir) ? [] : [{ st, dir }];
  });
  const lines: StakeLine[] = [...houseLines, ...terraceLines].flatMap(({ st, dir }) => {
    const wall = lineToBorder(parcel, st.p, dir);
    if (!wall) return [];
    const square = borderOffsets(st.p, parcel, parcel.length).find((r) => r.edge === wall.edge) ?? st.refs.find((r) => !r.through);
    return square ? [{ label: st.label, wall, square }] : [];
  });

  // inside walls: ends of the partitions, measured from wall A–B and the other wall meeting at A
  const o = house.outline;
  const A = o[0], B = o[1], Z = o[o.length - 1];
  // name the reference walls by their staked corners (a straight-through vertex is not one)
  const realBefore = (i: number, step: number) => {
    let k = i;
    for (let guard = 0; guard < o.length && straightThrough(o, k); guard++) k = (k + step + o.length) % o.length;
    return k;
  };
  const refAB = [cornerLabel(0), cornerLabel(realBefore(1, 1))] as const;
  const refSide = [cornerLabel(realBefore(o.length - 1, -1)), cornerLabel(0)] as const;
  // the walls as lines, without their thickness (see simplePlan): simple to set out with strings
  const simple = simplePlan(house);
  const ends = cluster(simple.walls.filter((w) => !w.extra).flatMap((w) => [w.a, w.b]), SAME_SPOT);
  // reading order: rows from the A–B wall inwards, then along it
  ends.sort((u, v) => lineDist(u, A, B) - lineDist(v, A, B));
  const rows: Vec2[][] = [];
  for (const e of ends) {
    const row = rows.at(-1);
    if (row && Math.abs(lineDist(e, A, B) - lineDist(row[0], A, B)) < SAME_SPOT) row.push(e);
    else rows.push([e]);
  }
  const inside: InsideStake[] = rows
    .flatMap((r) => r.sort((u, v) => lineDist(u, Z, A) - lineDist(v, Z, A)))
    .map((v, i) => ({ n: i + 1, plan: v, p: site(v[0], v[1]), fromAB: lineDist(v, A, B), fromSide: lineDist(v, Z, A) }));

  // checks for squaring up: wall lengths between staked corners and A to every other corner
  const walls = corners.map((c, i) => {
    const nx = corners[(i + 1) % corners.length];
    return { a: c.label, b: nx.label, d: dist(c.p, nx.p) };
  });
  const a0 = corners.find((c) => c.i === 0) ?? corners[0];
  const fromA = corners.filter((c) => c !== a0 && !walls.some((w) => (w.a === a0.label && w.b === c.label) || (w.b === a0.label && w.a === c.label))).map((c) => ({ a: a0.label, b: c.label, d: dist(a0.p, c.p) }));

  const borders = parcel.map((_, e) => {
    const { L, n } = border(parcel, e);
    // compass direction the border faces, seen from inside the plot (grid north = −z)
    const bearing = ((Math.atan2(-n[0], n[1]) * 180) / Math.PI + 360) % 360;
    return { edge: e, length: L, from: e, to: (e + 1) % parcel.length, side: COMPASS[Math.round(bearing / 45) % 8], gates: gates.filter((g) => g.edge === e).map((g) => g.name) };
  });

  return {
    parcel,
    parcelNumber: inp.parcelNumber,
    plotCentre: plotC,
    /** unit direction (site) the house front faces: the sketch is turned so that it points down the page */
    frontDir: unit(sub(site(house.width / 2, house.depth), site(house.width / 2, 0))),
    borders,
    date: inp.date ?? new Date().toLocaleDateString('pl-PL'),
    floorLevel: inp.floorLevel,
    footprint,
    partitions: simple.walls.map((w) => [site(...w.a), site(...w.b)] as [P2, P2]),
    buildings,
    terrace: terracePlan ? terracePlan.map((v) => site(v[0], v[1])) : null,
    driveways: inp.driveways,
    gates,
    stakes,
    lines,
    inside,
    checks: { walls, fromA },
    house: {
      name: house.name,
      code: house.code,
      outline: house.outline,
      width: house.width,
      depth: house.depth,
      /** inner walls as lines (axes, run on to the outer walls' outer face): see simplePlan */
      walls: simple.walls,
      /** rooms with the grid cells they fill up to those lines */
      rooms: simple.rooms,
      /** the middle of the first stair flight, for a "schody" label (the stairs are not a room) */
      stairsAt: ((): Vec2 | null => {
        const fl = house.interior?.stairs?.flights[0];
        if (!fl) return null;
        const d: Vec2 = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[fl.dir] as Vec2;
        const half = (fl.treads * fl.going) / 2;
        return [fl.from[0] + d[0] * half, fl.from[1] + d[1] * half];
      })(),
      terrace: terracePlan,
      /** the plan view's letter for each outline vertex, or null where the outline runs straight through */
      cornerLabels: house.outline.map((_, i) => (straightThrough(house.outline, i) ? null : cornerLabel(i))),
      refAB,
      refSide,
      mirrored: pl.mirror,
      /** the partitions are the real walls (from the interior), not an approximation */
      exactPartitions: !!house.interior,
    },
  };
}

export type StakeoutPlan = ReturnType<typeof makeStakeoutPlan>;

/** the first usual drawing scale (1:n) at which w × h metres fit a box of boxW × boxH millimetres */
export function pickScale(w: number, h: number, boxW: number, boxH: number, scales = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000]) {
  return scales.find((s) => (w * 1000) / s <= boxW && (h * 1000) / s <= boxH) ?? scales[scales.length - 1];
}
