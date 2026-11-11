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
import type { Car, GardenArea } from '../store';

export const PZT: { projectId: string; placement: Placement; floorLevel: number; source: string } = {
  projectId: 'argania2',
  placement: { x: -4.03, z: -12.35, bearing: 51.3, mirror: false },
  floorLevel: 357.0,
  source: 'PZT koncepcja 2026-11-10',
};

/** is this placement / floor level the PZT one (to the cm / 0.1°)? */
export const isPztPlacement = (pl: Placement, floorLevel: number | null) =>
  Math.abs(pl.x - PZT.placement.x) < 0.005 &&
  Math.abs(pl.z - PZT.placement.z) < 0.005 &&
  Math.abs(pl.bearing - PZT.placement.bearing) < 0.05 &&
  pl.mirror === PZT.placement.mirror &&
  floorLevel !== null &&
  Math.abs(floorLevel - PZT.floorLevel) < 0.005;

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
