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
import { argania2Low } from '../house/argania2-low';
import type { GroundDesign, Road } from '../geo/site';
import type { Car, GardenArea } from '../store';

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

/** where a project starts when it has never been placed (others start where the last house stood) */
export const PROJECT_START: Record<string, { placement: Placement; floorLevel: number }> = {
  [PZT.projectId]: { placement: PZT.placement, floorLevel: PZT.floorLevel },
  [argania2Low.id]: { placement: PZT.placement, floorLevel: LOW_FLOOR_LEVEL },
};

/**
 * Design ground of projects that don't use the PZT's (public/site/survey.json).
 * Lowered-garage variant: the same rules as the PZT ground, so the two solutions compare like for
 * like — the garden and the ground at the house 5 cm below the floor, slopes shaped as the PZT draws
 * them (wedges, highest at the east corner, running out to nothing by the gate) and the front
 * falling to the surveyed ground at the north corner. What differs is what the variant is about:
 * the floor at 357.80, and every slope 2 m inside the boundary instead of 0.3–1.25 m, so there is a
 * strip of untouched ground along the fence. Widths ≈ 1.5 × the height of the slope.
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
const fromPlan = ([X, Y]: P2): P2 => {
  const p = toSite(toLocal(argania2, X, Y), PZT.placement);
  return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
};

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

/** gates set into the fence: plot edge, metres along it from its first vertex, kind */
export interface Gate { id: string; edge: number; from: number; to: number; kind: 'sliding' | 'wicket' }

/** north-east edge (from the east corner): sliding gate centred on the garage door, wicket by the lane */
export const PZT_GATES: Gate[] = [
  { id: 'pzt-gate', edge: 0, from: 35.49, to: 39.99, kind: 'sliding' },
  { id: 'pzt-wicket', edge: 0, from: 34.24, to: 35.24, kind: 'wicket' },
];

/** two cars parked nose-in in front of the garage door */
export const PZT_CARS: Car[] = (() => {
  const c0 = fromPlan([0, 0]), c1 = fromPlan([0, -1]); // plan −Y (towards the garage) in site coords
  const rot = Math.round(Math.atan2(-(c1[1] - c0[1]), c1[0] - c0[0]) * 1000) / 1000;
  return [
    { id: 'pzt-car-1', x: fromPlan([9.55, 15.4])[0], z: fromPlan([9.55, 15.4])[1], rot, color: '#2e3338' },
    { id: 'pzt-car-2', x: fromPlan([12.1, 15.4])[0], z: fromPlan([12.1, 15.4])[1], rot, color: '#d8dbde' },
  ];
})();

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
