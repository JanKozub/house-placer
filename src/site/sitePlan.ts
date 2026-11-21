/**
 * Where the house stands according to the land-development plan for plot 664/2:
 * "PZT koncepcja" (2026-11-10, on the surveyor's map for design purposes by POMIAR, 1:500).
 *
 * Measured from the drawing: the plot outline on the map was fitted to the GUGiK parcel (vertices
 * agree to 5–10 cm; the map's PL-2000 grid is rotated 1.43° against PL-1992). The designer's own
 * drawing (house, dimension chains) is 1.5% smaller than that map — e.g. the 14.30 chain measures
 * 14.06 — so the house is placed true to size with its back wall on the drawn back wall (10.87 m
 * from the south-west boundary, as labelled) and centred on the drawn side walls. Depth 12.40 as
 * on the PZT. Floor ±0.00 = 357.00 m a.s.l. (PL-EVRF2007-NH).
 */
import { toSite, type P2, type Placement } from '../placement/geom2d';
import { toLocal } from '../house/geometry';
import { argania2 } from '../house/argania2';
import { argania2Low, argania2Mid, argania2MidRaised, argania2MidRect } from '../house/argania2-low';
import { wiataGaraz } from '../house/outbuildings';
import type { GroundDesign, Road } from '../geo/site';
import type { Car, GardenArea, Outbuilding, Tree } from '../store';

export const PZT: { projectId: string; placement: Placement; floorLevel: number; source: string } = {
  projectId: 'argania2',
  placement: { x: -4.03, z: -12.35, bearing: 51.3, mirror: false },
  floorLevel: 357.0,
  source: 'PZT koncepcja 2026-11-10',
};

/**
 * The lowered-garage variant: same spot as on the PZT, but the house floor at the level of the road
 * behind it (≈ 357.80 along the south-west boundary) instead of 0.8 m below it.
 */
export const LOW_FLOOR_LEVEL = 357.8;

/**
 * The compromise variant: same spot as on the PZT (the user's decision, 2026-11-15: every variant
 * of Dom w Arganiach stands exactly where the PZT draws the house; the variants differ in their
 * levels and in the house itself), with the house floor 0.40 m above the PZT's — level with the
 * surveyed ground at the back wall (357.3–357.4) and 0.4 m below the road behind.
 */
export const MID_FLOOR_LEVEL = 357.4;
/** the compromise and its versions that differ only in the house itself: they share its level, ground, forecourt and entrance */
const COMPROMISE = [argania2Mid.id, argania2MidRect.id, argania2MidRaised.id];
const r2 = (v: number) => Math.round(v * 100) / 100;
/**
 * The frame the shared garden was drawn in: parallel to the house, 2.5 m along its back wall from
 * the PZT position, away from the north-west neighbour. (The compromise variant stood there when
 * the garden was planned.) What belongs to the plot keeps its place in this frame; what belongs to
 * the house is written in the house's own plan coordinates and stands with it.
 */
export const GARDEN_SHIFT = 2.5;
export const GARDEN_FRAME: Placement = (() => {
  const c = toSite([-GARDEN_SHIFT, 0], PZT.placement);
  return { ...PZT.placement, x: r2(c[0]), z: r2(c[1]) };
})();

/** the project a new visitor sees first */
export const DEFAULT_PROJECT = argania2Mid.id;

/** where a project starts when it has never been placed (others start where the last house stood) */
export const PROJECT_START: Record<string, { placement: Placement; floorLevel: number }> = {
  [PZT.projectId]: { placement: PZT.placement, floorLevel: PZT.floorLevel },
  [argania2Low.id]: { placement: PZT.placement, floorLevel: LOW_FLOOR_LEVEL },
  ...Object.fromEntries(COMPROMISE.map((id) => [id, { placement: PZT.placement, floorLevel: MID_FLOOR_LEVEL }])),
};

/** the compromise's ground (see below), one object so its fitted ground is cached once */
const MID_GROUND: GroundDesign = { level: MID_FLOOR_LEVEL - argania2Mid.plinth, slopes: [] };

/**
 * Design ground of projects that don't use the PZT's (public/site/survey.json).
 * Lowered-garage variant: the same rules as the PZT ground, so the two solutions compare like for
 * like — the garden and the ground at the house 5 cm below the floor, slopes shaped as the PZT draws
 * them (wedges, highest at the east corner, running out to nothing by the gate) and the front
 * falling to the surveyed ground at the north corner. What differs is what the variant is about:
 * the floor at 357.80, and every slope 2 m inside the boundary instead of 0.3–1.25 m, so there is a
 * strip of untouched ground along the fence. Widths ≈ 1.5 × the height of the slope.
 * Compromise variant: no slopes at all. The plot keeps its surveyed ground, so there is no bank at
 * the road and no embankment at the east corner; only the house platform (house, terrace and 2 m
 * of lawn behind it) and the forecourt are shaped, each meeting the ground around it with a 1:2 bank.
 */
export const GROUND_DESIGN: Record<string, GroundDesign> = {
  [argania2Low.id]: {
    level: LOW_FLOOR_LEVEL - argania2Low.plinth,
    slopes: [
      { edge: 0, outer: 2, inner: [5.3, 2], to: 35.5, heights: [null, 0], flat: 9.2 }, // north-east: 2.2 m at the east corner, nothing by the gate
      { edge: 1, outer: 2, inner: [4, 2.3], from: 8.6 }, // north-west: beside the garage front (1.3 m) to the west corner (level with the road)
      { edge: 2, outer: 2, inner: 2.6 }, // south-west (road): the garden is level with it
      { edge: 3, outer: 2, inner: [2.3, 3] },
      { edge: 4, outer: 2, inner: 3 },
      { edge: 5, outer: 2, inner: [3, 5.3] }, // south-east: 0.6 m at the south corner to 2.2 m at the east corner
    ],
  },
  ...Object.fromEntries(COMPROMISE.map((id) => [id, MID_GROUND])),
};

/** is this placement / floor level the project's reference one (to the cm / 0.1°)? Default: the PZT's. */
export const isPztPlacement = (pl: Placement, floorLevel: number | null, ref: { placement: Placement; floorLevel: number } = PZT) =>
  Math.abs(pl.x - ref.placement.x) < 0.005 &&
  Math.abs(pl.z - ref.placement.z) < 0.005 &&
  Math.abs(pl.bearing - ref.placement.bearing) < 0.05 &&
  pl.mirror === ref.placement.mirror &&
  floorLevel !== null &&
  Math.abs(floorLevel - ref.floorLevel) < 0.005;

// ---------------------------------------------------------------------------------------------
// Front yard from the PZT, measured from the drawing. The curb line is the designer's: in the
// house's plan coordinates (X along the back wall, Y towards the front; garage wing X 7.40–14.30)
// it runs from the north-east boundary line along X 7.40 (in line with the garage wing's inner
// wall) to Y 19.88 (7.50 m in front of the garage door), across to X 3.04, back to Y 9.90 and as a
// 1.20 m path along the kitchen front to X −0.85. The yard fills the rest up to the north-east and
// north-west boundary lines (drawn 0.3 m inside the boundary) and the house.
// The PZT draws no gate: the 4.5 m sliding gate (centred on the garage door) and the 1 m wicket
// next to it are the user's, set into the fence on the north-east boundary.
// ---------------------------------------------------------------------------------------------
const fromPlanAt = ([X, Y]: P2, pl: Placement): P2 => {
  const p = toSite(toLocal(argania2, X, Y), pl);
  return [r2(p[0]), r2(p[1])];
};
const fromPlan = (p: P2): P2 => fromPlanAt(p, PZT.placement);
/** a point given in the plan coordinates of Dom w Arganiach where the PZT puts it (X along the back wall towards the north-west neighbour, Y towards the gate) */
export const housePoint = (p: P2): P2 => fromPlan(p);
/** a point of the plot's garden, given in the garden frame (the house's plan coordinates moved by GARDEN_SHIFT; see GARDEN_FRAME) */
export const gardenPoint = (p: P2): P2 => fromPlanAt(p, GARDEN_FRAME);

export const PZT_DRIVEWAY: GardenArea = {
  id: 'pzt-driveway',
  kind: 'driveway',
  // site coords of plan (−0.85, 8.70) (−0.85, 9.90) (3.04, 9.90) (3.04, 19.88) (7.40, 19.88)
  // (7.40, 22.15)* (18.20, 21.35)* (19.27, 12.40)* (14.30, 12.40) (7.40, 12.40) (7.40, 8.70); * on the boundary lines
  points: [
    [2.92, -7.67], [3.86, -8.42], [1.43, -11.46], [9.22, -17.7], [6.49, -21.1], [8.26, -22.52],
    [0.89, -30.44], [-6.77, -25.69], [-3.66, -21.81], [0.65, -16.42], [-2.24, -14.11],
  ],
};

/** where the two cars in the garage stand, in the house's plan coordinates (the garage is X 7.85–13.85, Y 5.98–11.95) */
export const GARAGE_CARS: P2[] = [[9.55, 9.4], [11.9, 9.4]];
/** house projects that have this garage */
const WITH_GARAGE = new Set([argania2.id, argania2Low.id, ...COMPROMISE]);

/** gates set into the fence: plot edge, metres along it from its first vertex, kind */
export interface Gate { id: string; edge: number; from: number; to: number; kind: 'sliding' | 'wicket' }

/** north-east edge (from the east corner): sliding gate centred on the garage door, wicket by the lane */
export const PZT_GATES: Gate[] = [
  { id: 'pzt-gate', edge: 0, from: 35.49, to: 39.99, kind: 'sliding' },
  { id: 'pzt-wicket', edge: 0, from: 34.24, to: 35.24, kind: 'wicket' },
];

/**
 * Two cars parked nose-in in front of the garage door, and two more inside the garage, where the
 * catalogue plan draws them (nose to the back wall, 0.5 m between them, clear of the steps at the
 * doors). Those stand on the garage floor, which lies 3 cm over the ground under it.
 */
const carsAt = (pl: Placement): Car[] => {
  const c0 = fromPlanAt([0, 0], pl), c1 = fromPlanAt([0, -1], pl); // plan −Y (towards the garage) in site coords
  const rot = Math.round(Math.atan2(-(c1[1] - c0[1]), c1[0] - c0[0]) * 1000) / 1000;
  const car = (id: string, X: number, Y: number, color: string, lift?: number): Car => ({ id, x: fromPlanAt([X, Y], pl)[0], z: fromPlanAt([X, Y], pl)[1], rot, color, ...(lift ? { lift } : {}) });
  return [
    car('pzt-car-1', 9.55, 15.4, '#2e3338'),
    car('pzt-car-2', 12.1, 15.4, '#d8dbde'),
    car('garage-car-1', GARAGE_CARS[0][0], GARAGE_CARS[0][1], '#7d1f1f', 0.03),
    car('garage-car-2', GARAGE_CARS[1][0], GARAGE_CARS[1][1], '#35506e', 0.03),
  ];
};
export const PZT_CARS: Car[] = carsAt(PZT.placement);

// ---------------------------------------------------------------------------------------------
// A project can have its own forecourt, gates and cars. They replace the PZT ones (same ids) while
// that project is shown; everything else in the garden is shared by all projects.
// Compromise variant: it stands where the PZT puts the house, but its entrance is redrawn (see
// src/site/gardenPlan.ts). The cobbled drive is only as wide as two cars and a turn need: 7 m in
// front of the garage door, straight to the sliding gate, its far corners 0.3 m inside the
// north-east boundary. The gate and the wicket are where the PZT layout has them (the gate centred
// on the garage door, the wicket right beside it), and people walk on their own path from the
// wicket to the front steps; the rest of the PZT's yard is garden.
// ---------------------------------------------------------------------------------------------
export interface SiteLayout { driveway: GardenArea; gates: Gate[]; cars: Car[] }

/** plan Y of the line 0.3 m inside the north-east boundary, in the house's plan coordinates */
export const midFenceLine = (X: number) => 22.156 - 0.0742 * (X - 7.4);
/**
 * The drive of the compromise variant, in its plan coordinates: its left edge runs from the garage
 * door's jamb (X 8.2) to the sliding gate's post (X 8.55 at the fence), its right edge is X 15.2.
 */
export const MID_DRIVE = { left: 8.2, leftAtFence: 8.55, right: 15.2 };
/** X of the drive's left edge at plan Y */
export const midDriveLeft = (Y: number) => MID_DRIVE.left + ((MID_DRIVE.leftAtFence - MID_DRIVE.left) * (Y - 12.4)) / (midFenceLine(MID_DRIVE.leftAtFence) - 12.4);
const MID_YARD: P2[] = [[MID_DRIVE.left, 12.4], [MID_DRIVE.right, 12.4], [MID_DRIVE.right, midFenceLine(MID_DRIVE.right)], [MID_DRIVE.leftAtFence, midFenceLine(MID_DRIVE.leftAtFence)]];

const MID_LAYOUT: SiteLayout = {
  driveway: { id: PZT_DRIVEWAY.id, kind: 'driveway', points: MID_YARD.map(fromPlan) },
  gates: PZT_GATES, // the sliding gate's post is at plan X 8.70, the wicket (X 7.45–8.45) right beside it
  cars: PZT_CARS,
};
export const PROJECT_LAYOUT: Record<string, SiteLayout> = Object.fromEntries(COMPROMISE.map((id) => [id, MID_LAYOUT]));

const swap = <T extends { id: string }>(items: T[], own: T[] | undefined): T[] => (own ? items.map((i) => own.find((o) => o.id === i.id) ?? i) : items);
/** the garden areas, cars and gates as laid out for a project (see PROJECT_LAYOUT) */
export const layoutGarden = (projectId: string, garden: GardenArea[]) => swap(frontOf(projectId, garden), PROJECT_LAYOUT[projectId] && [PROJECT_LAYOUT[projectId].driveway]);
/** the trees and plants as shown for a project */
export const layoutTrees = (projectId: string, trees: Tree[]) => frontOf(projectId, trees);
/**
 * The redrawn entrance (ids starting with FRONT) is designed around the compromise variant's house,
 * drive and wicket: with another house project it is left out, and the PZT's forecourt stays clear.
 */
export const FRONT = 'g-front';
const frontOf = <T extends { id: string }>(projectId: string, items: T[]): T[] => {
  if (COMPROMISE.includes(projectId) || !items.some((i) => i.id.startsWith(FRONT))) return items;
  return items.filter((i) => !i.id.startsWith(FRONT));
};
export const layoutCars = (projectId: string, cars: Car[]) => {
  // the cars in the garage belong to Dom w Arganiach: another house has no garage there
  const own = WITH_GARAGE.has(projectId) ? cars : cars.filter((c) => !c.id.startsWith('garage-'));
  return own.length === cars.length ? swap(cars, PROJECT_LAYOUT[projectId]?.cars) : swap(own, PROJECT_LAYOUT[projectId]?.cars);
};
export const layoutGates = (projectId: string, gates: Gate[]) => swap(gates, PROJECT_LAYOUT[projectId]?.gates);

/** fence along every edge of plot 664/2 */
export const PZT_FENCE_EDGES = [0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------------------------
// Access road to the gate. Not on the PZT and not in OpenStreetMap: the user's choice (2026-11-14)
// is a road along the outside of the north-east boundary, on past the north corner — the same line
// as the east edge of the neighbouring plot — up to the asphalt road (Pakuz), about 50 m away.
// ---------------------------------------------------------------------------------------------
const ACCESS_WIDTH = 3.5;

/** the planned road from the nearest asphalt road to the gate, and the short links to gate and wicket */
export function accessRoads(parcel: P2[], roads: Road[], gates: Gate[] = PZT_GATES): Road[] {
  const gate = gates.find((g) => g.kind === 'sliding'), wicket = gates.find((g) => g.kind === 'wicket');
  if (!gate) return [];
  const a = parcel[gate.edge], b = parcel[(gate.edge + 1) % parcel.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let cx = 0, cz = 0;
  for (const [x, z] of parcel) { cx += x / parcel.length; cz += z / parcel.length; }
  let out: P2 = [d[1], -d[0]];
  if ((cx - (a[0] + b[0]) / 2) * out[0] + (cz - (a[1] + b[1]) / 2) * out[1] > 0) out = [-out[0], -out[1]];
  const off = ACCESS_WIDTH / 2 + 0.6; // road axis outside the boundary, with a verge at the fence
  const at = (s: number, o: number): P2 => [a[0] + d[0] * s + out[0] * o, a[1] + d[1] * s + out[1] * o];
  const start = at((wicket ? Math.min(wicket.from, gate.from) : gate.from) - 1.5, off);
  // on along the boundary line to the first asphalt road it meets (at most 150 m; else a 40 m stub)
  let reach = 40;
  for (const r of roads) {
    if (r.surface !== 'asphalt') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const p = r.pts[i - 1], q = r.pts[i];
      const ex = q[0] - p[0], ez = q[1] - p[1];
      const den = d[0] * ez - d[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((p[0] - start[0]) * ez - (p[1] - start[1]) * ex) / den;
      const u = ((p[0] - start[0]) * d[1] - (p[1] - start[1]) * d[0]) / den;
      if (t > 0 && t < 150 && u >= 0 && u <= 1) reach = reach === 40 ? t : Math.min(reach, t);
    }
  }
  const end: P2 = [start[0] + d[0] * reach, start[1] + d[1] * reach];
  const link = (g: Gate, id: number, width: number): Road => {
    const m = (g.from + g.to) / 2;
    return { id, highway: 'service', name: null, surface: 'gravel', width, pts: [at(m, off), at(m, -0.1)] };
  };
  return [
    { id: -1, highway: 'service', name: 'dojazd do bramy', surface: 'gravel', width: ACCESS_WIDTH, pts: [start, end] },
    link(gate, -2, gate.to - gate.from),
    ...(wicket ? [link(wicket, -3, 1.2)] : []),
  ];
}

// ---------------------------------------------------------------------------------------------
// The garden, as the family planned it in November 2026 (none of it is on the PZT):
// the wiata + garage in the east corner with a drive along the north-east fence, and thuja hedges
// along the road behind the house and along both neighbours.
// ---------------------------------------------------------------------------------------------

/** plot 664/2 in site-local metres (public/site/parcel.json, to the centimetre): east, north, west, …, south corners */
export const PLOT: P2[] = [[31.8, 2.31], [0.94, -30.83], [-30.08, -11.56], [-12.69, 4.15], [4, 16.87], [7.38, 17.36]];

/** a point `s` metres along plot edge `e` from its first vertex, `off` metres inside the boundary */
export function onEdge(e: number, s: number, off: number): P2 {
  const a = PLOT[e], b = PLOT[(e + 1) % PLOT.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), d: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let n: P2 = [-d[1], d[0]];
  const c = PLOT.reduce((m, p) => [m[0] + p[0] / PLOT.length, m[1] + p[1] / PLOT.length], [0, 0]);
  if ((c[0] - a[0]) * n[0] + (c[1] - a[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return [r2(a[0] + d[0] * s + n[0] * off), r2(a[1] + d[1] * s + n[1] * off)];
}

/**
 * Wiata + garage where the family placed it: in the east corner, its back 1.4–2.0 m from the
 * south-east boundary and its garage end 1.0 m from the north-east one, the garage door facing
 * along the fence towards the gate. (Read off the plan view: corner distances 2.02 / 1.38 / 1.04 m.)
 * Floor at 356.10: the ground under it falls from 356.4 at the wiata end to 355.6 at the garage
 * end, the lowest pocket of the plot, where rainwater collects. 356.10 is the level of the ground
 * the drive arrives on (356.0–356.2), 10 cm above balanced cut and fill and 0.45 m above that
 * pocket, which the apron in front of the door fills; the fill at the fence stays under 0.5 m.
 */
export const SHED_FLOOR_LEVEL = 356.1;
export const DEFAULT_SHED: Outbuilding = { id: 'ob-wiata', kind: 'wiata-garaz', placement: { x: 21.6, z: 2.43, bearing: 325.3, mirror: false }, floorLevel: SHED_FLOOR_LEVEL };

/**
 * Drive to the shed's garage door: a 3.5 m strip along the inside of the north-east fence, from
 * the forecourt at the gate straight to the door (which faces along the fence). It runs on the
 * ground as surveyed, 356.0–356.2, and the shed's own apron carries it level over the dip in front
 * of the door. It overlaps the forecourt, so it meets both the PZT's and the compromise variant's.
 */
export const SHED_DRIVE: GardenArea = (() => {
  const door = (X: number): P2 => {
    const p = toSite(toLocal(wiataGaraz, X, wiataGaraz.depth), DEFAULT_SHED.placement);
    return [r2(p[0]), r2(p[1])];
  };
  return { id: 'shed-drive', kind: 'driveway', points: [door(0.3), onEdge(0, 37, 1.45), onEdge(0, 37, 4.95), door(4.05)] };
})();

/** plot edges with a hedge: the north-west neighbour, the road behind (three edges) and the south-east neighbour */
export const HEDGE_EDGES = [1, 2, 3, 4, 5];
export const HEDGE = { inset: 0.75, spacing: 0.75, height: 2.2 };

/**
 * Thuja hedges ('Smaragd', the usual Polish tuje): one tree every 75 cm, 75 cm inside the boundary,
 * about 2.2 m tall, along the road behind the house and along both neighbours. The gate side
 * stays open. Rows stop 0.9 m short of the corners so neighbouring rows do not grow into each other.
 */
export const THUJA_HEDGE: Tree[] = HEDGE_EDGES.flatMap((e) => {
  const a = PLOT[e], b = PLOT[(e + 1) % PLOT.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const end = 0.9, n = Math.max(1, Math.round((L - 2 * end) / HEDGE.spacing));
  const step = (L - 2 * end) / n;
  return Array.from({ length: n + 1 }, (_, i) => {
    const [x, z] = onEdge(e, end + i * step, HEDGE.inset);
    // a little variety in height, the same on every visit
    const h = HEDGE.height * (0.93 + 0.14 * (((e * 31 + i * 17) % 10) / 9));
    return { id: `tuja-${e}-${i}`, kind: 'thuja' as const, x, z, height: Math.round(h * 100) / 100 };
  });
});
