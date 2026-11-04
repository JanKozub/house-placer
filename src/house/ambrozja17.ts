/**
 * Ambrozja 17 (BSA2409), Domy w Stylu, as parametric data.
 *
 * Source: the project's dimensioned ground-floor plan (rzut parteru) and section (przekrój)
 * — dimension chains in cm, levels in m. The PDF plan is drawn rotated: its horizontal axis
 * is our Y (0 → 22.85) and its top edge is our east wall (X = 16.85).
 *
 * Plan coordinates: X → right, Y → down (as in the marketing plan), metres, origin at the
 * top-left corner of the outer wall outline. "Front" (entrance + garage) is +Y.
 * ±0.00 = finished ground floor level; surrounding ground at −0.62.
 */

export type Vec2 = [number, number];

export type OpeningKind = 'window' | 'door' | 'terraceDoor' | 'hs' | 'fixed' | 'garage' | 'entrance';

export interface Opening {
  /** id of the exterior wall edge */
  wall: string;
  /** centre position along the wall, as the absolute plan coordinate (X for horizontal walls, Y for vertical) */
  at: number;
  width: number;
  height: number;
  sill: number;
  kind: OpeningKind;
  /** number of glazed panes (mullions = panes − 1) */
  panes?: number;
  /** project symbol, for reference */
  ref?: string;
}

export interface WallEdge {
  id: string;
  a: Vec2;
  b: Vec2;
}

export interface Slab { x0: number; x1: number; y0: number; y1: number; top: number }

export const PITCH_DEG = 30;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const WING_W = 9.05; // both wings (plan chains: 905)
const MAIN_X0 = 7.8; // bedroom-wing west face (1685 − 905)
const MAIN_X1 = 16.85;
const LIV_Y0 = 6.6; // living wing (chain 660 | 905 | 720)
const LIV_Y1 = 15.65;
const GAR_X0 = 10.4; // garage west wall face (chain 20+25+575+25)
const RIDGE_X = (MAIN_X0 + MAIN_X1) / 2; // 12.325
const RIDGE_Y = (LIV_Y0 + LIV_Y1) / 2; // 11.125
const HEAD = 2.35; // window/door head level (section)

export const house = {
  name: 'Ambrozja 17',
  code: 'BSA2409',
  width: 16.85,
  depth: 22.85,
  usableArea: 167.84,
  footprintArea: 260.7,
  heightTotal: 6.94, // −0.62 → +6.32
  pitchDeg: PITCH_DEG,

  /** finished floor above surrounding ground */
  plinth: 0.62,
  wallThickness: 0.45, // 25 cm hollow brick + 20 cm EPS
  innerWallThickness: 0.12,
  ceilingHeight: 2.62,
  /** top of ring beam (wieniec) */
  wallTop: 2.76,
  slabThickness: 0.3,
  garageFloor: -0.27,

  roof: {
    ridgeTop: 6.32,
    thickness: 0.3,
    eaveOverhang: 1.0,
    gableOverhang: 0.5,
    /** underside of the boxed eave soffit */
    soffit: 2.73,
    /** roof top-surface height at the outer wall face */
    get topAtWall() {
      return house.roof.ridgeTop - (WING_W / 2) * T;
    },
    ridgeX: RIDGE_X,
    ridgeY: RIDGE_Y,
    wingWidth: WING_W,
    main: { x0: MAIN_X0, x1: MAIN_X1, y0: 0, y1: 22.85 },
    living: { x0: 0, y0: LIV_Y0, y1: LIV_Y1 },
    chimneys: [{ x: 8.6, y: 9.88, w: 0.58, d: 0.84, top: 6.7 }],
  },

  /** exterior wall outline, clockwise as drawn (Y down) */
  outline: [
    [0, LIV_Y0],
    [MAIN_X0, LIV_Y0],
    [MAIN_X0, 0],
    [MAIN_X1, 0],
    [MAIN_X1, 22.85],
    [GAR_X0, 22.85],
    [GAR_X0, LIV_Y1],
    [0, LIV_Y1],
  ] as Vec2[],

  walls: [
    { id: 'livN', a: [0, LIV_Y0], b: [MAIN_X0, LIV_Y0] },
    { id: 'bedW', a: [MAIN_X0, LIV_Y0], b: [MAIN_X0, 0] },
    { id: 'gableN', a: [MAIN_X0, 0], b: [MAIN_X1, 0] },
    { id: 'east', a: [MAIN_X1, 0], b: [MAIN_X1, 22.85] },
    { id: 'gableS', a: [MAIN_X1, 22.85], b: [GAR_X0, 22.85] },
    { id: 'garW', a: [GAR_X0, 22.85], b: [GAR_X0, LIV_Y1] },
    { id: 'front', a: [GAR_X0, LIV_Y1], b: [0, LIV_Y1] },
    { id: 'gableW', a: [0, LIV_Y1], b: [0, LIV_Y0] },
  ] as WallEdge[],

  openings: [
    // living room → terrace: OBD17 180×235 door + FIX1 90×235 (one 270 unit), FIX2 180×235
    { wall: 'livN', at: 2.1, width: 2.7, height: HEAD, sill: 0, kind: 'terraceDoor', panes: 3, ref: 'OBD17 + FIX1' },
    { wall: 'livN', at: 6.15, width: 1.8, height: HEAD, sill: 0, kind: 'fixed', panes: 2, ref: 'FIX2' },
    // bedroom 1/9 → terrace (OBD17 180×235), bathroom 1/7 (O31 90×150)
    { wall: 'bedW', at: 2.7, width: 1.8, height: HEAD, sill: 0, kind: 'terraceDoor', panes: 2, ref: 'OBD17' },
    { wall: 'bedW', at: 4.83, width: 0.9, height: 1.5, sill: HEAD - 1.5, kind: 'window', ref: 'O31' },
    // east: three bedrooms (O37s 180×150) + boiler-room door (Dz2 80/200)
    { wall: 'east', at: 3.7, width: 1.8, height: 1.5, sill: HEAD - 1.5, kind: 'window', panes: 2, ref: 'O37s' },
    { wall: 'east', at: 7.15, width: 1.8, height: 1.5, sill: HEAD - 1.5, kind: 'window', panes: 2, ref: 'O37s' },
    { wall: 'east', at: 10.5, width: 1.8, height: 1.5, sill: HEAD - 1.5, kind: 'window', panes: 2, ref: 'O37s' },
    { wall: 'east', at: 14.545, width: 0.91, height: 2.07, sill: 0, kind: 'door', ref: 'Dz2' },
    // front gable: garage door DG Hörmann 450×225
    { wall: 'gableS', at: 13.525, width: 4.5, height: 2.25, sill: -0.27, kind: 'garage', ref: 'DG' },
    // front of living wing: kitchen window Oind1 270×150 + entrance door Dz1 90/200
    { wall: 'front', at: 5.44, width: 2.7, height: 1.5, sill: HEAD - 1.5, kind: 'window', panes: 3, ref: 'Oind1' },
    { wall: 'front', at: 9.295, width: 1.01, height: 2.1, sill: 0, kind: 'entrance', ref: 'Dz1' },
    // west gable: FIX3 270×235 living-room glazing
    { wall: 'gableW', at: 10.25, width: 2.7, height: HEAD, sill: 0, kind: 'fixed', panes: 3, ref: 'FIX3' },
  ] as Opening[],

  /** interior partitions [x1,y1,x2,y2] (approximate, for views through glass) */
  partitions: [
    [MAIN_X0, 4.2, 10.5, 4.2],
    [10.5, 4.2, 10.5, 10.2],
    [MAIN_X0, 7.05, 10.5, 7.05],
    [MAIN_X0, 10.2, 10.5, 10.2],
    [MAIN_X0, LIV_Y0, MAIN_X0, 10.2],
    [12.45, 0, 12.45, 11.6],
    [12.45, 1.95, 16.85, 1.95],
    [12.45, 5.3, 16.85, 5.3],
    [12.45, 8.75, 16.85, 8.75],
    [11.0, 11.6, 16.85, 11.6],
    [0, 12.6, 2.6, 12.6],
    [2.6, 12.6, 2.6, LIV_Y1],
    [8.3, 12.8, 8.3, LIV_Y1],
    [9.95, 13.9, 9.95, LIV_Y1],
    [GAR_X0, 15.0, 16.85, 15.0],
    [12.9, 11.6, 12.9, 15.0],
    [11.0, 11.6, 11.0, 15.0],
  ] as [number, number, number, number][],

  /** room labels for the plan view (numbers as in the project) */
  rooms: [
    { name: '1/5 Salon + jadalnia', area: 38.5, at: [3.6, 9.3] },
    { name: '1/3 Kuchnia', area: 15.36, at: [5.4, 14.0] },
    { name: '1/4 Spiżarnia', area: 5.77, at: [1.3, 14.1] },
    { name: '1/2 Komunikacja', area: 11.98, at: [9.6, 12.0] },
    { name: '1/1 Wiatrołap', area: 3.58, at: [9.1, 14.8] },
    { name: '1/9 Sypialnia', area: 14.11, at: [10.1, 2.1] },
    { name: '1/7 Łazienka', area: 7.83, at: [9.1, 5.6] },
    { name: '1/6 Łazienka', area: 5.04, at: [9.1, 8.6] },
    { name: '1/8 Korytarz', area: 8.92, at: [11.45, 6.8] },
    { name: '1/10 Garderoba', area: 5.76, at: [14.6, 0.95] },
    { name: '1/11 Sypialnia', area: 12.47, at: [14.6, 3.6] },
    { name: '1/12 Pokój', area: 13.6, at: [14.6, 7.0] },
    { name: '1/13 Pokój', area: 10.63, at: [14.6, 10.2] },
    { name: '1/15 Pralnia', area: 4.35, at: [11.95, 13.3] },
    { name: '1/14 Kotłownia', area: 7.52, at: [14.9, 13.3] },
    { name: '1/17 Garaż', area: 38.87, at: [13.6, 19.0] },
  ] as { name: string; area: number; at: Vec2 }[],

  /** paved slabs: terrace levels (−0.02 / −0.17 / −0.32), entrance & boiler-room steps, carport */
  paving: [
    // terrace in the inner corner
    { x0: 4.43, x1: MAIN_X0, y0: 0.0, y1: LIV_Y0, top: -0.02 },
    { x0: 0.14, x1: 4.43, y0: 3.59, y1: LIV_Y0, top: -0.02 },
    { x0: 2.27, x1: 4.43, y0: -0.52, y1: 3.59, top: -0.17 },
    { x0: 0.14, x1: 2.27, y0: 0.29, y1: 3.59, top: -0.32 },
    // entrance landing + 3 steps (4 × 15 cm risers) under the carport roof
    { x0: 8.4, x1: GAR_X0, y0: LIV_Y1, y1: 17.1, top: -0.02 },
    { x0: 8.4, x1: GAR_X0, y0: 17.1, y1: 17.4, top: -0.17 },
    { x0: 8.4, x1: GAR_X0, y0: 17.4, y1: 17.7, top: -0.32 },
    { x0: 8.4, x1: GAR_X0, y0: 17.7, y1: 18.0, top: -0.47 },
    // carport paving
    { x0: 7.85, x1: GAR_X0, y0: LIV_Y1, y1: 23.1, top: -0.6 },
    // boiler-room door landing + steps
    { x0: MAIN_X1, x1: MAIN_X1 + 0.45, y0: 13.95, y1: 15.15, top: -0.02 },
    { x0: MAIN_X1 + 0.45, x1: MAIN_X1 + 0.75, y0: 13.95, y1: 15.15, top: -0.17 },
    { x0: MAIN_X1 + 0.75, x1: MAIN_X1 + 1.05, y0: 13.95, y1: 15.15, top: -0.32 },
    { x0: MAIN_X1 + 1.05, x1: MAIN_X1 + 1.35, y0: 13.95, y1: 15.15, top: -0.47 },
  ] as Slab[],

  /** terrace corner measured to the boundary it faces (the north-west corner of the lowest step), with its outward sides */
  terraceCorners: [{ at: [0.14, 0.29] as Vec2, faces: [[0, -1], [-1, 0]] as Vec2[] }],
  /** house corners (outline indices) not dimensioned on the plan — B, the inner terrace corner */
  unmeasuredCorners: [1] as number[],
  /** house corners dimensioned to both boundaries they face — D and E, the garage-wing corners */
  twoEdgeCorners: [3, 4] as number[],

  /** carport (wiata) west of the garage, under the main roof, with two clad posts */
  porch: { x0: MAIN_X0, x1: GAR_X0, y0: LIV_Y1, y1: 22.85, posts: [[8.125, 17.7], [8.125, 22.575]] as Vec2[], postSize: 0.55 },
} as const;

/** centre of the outline bbox; house-local origin */
export const HOUSE_CENTER: Vec2 = [house.width / 2, house.depth / 2];

/** roof top-surface height (relative to ±0.00) at plan point, or null outside the roof */
export function roofTopAt(X: number, Y: number): number | null {
  const r = house.roof;
  const Hw = r.topAtWall;
  const o = r.eaveOverhang, g = r.gableOverhang;
  let h: number | null = null;
  // main wing: ridge along Y
  if (X >= r.main.x0 - o && X <= r.main.x1 + o && Y >= r.main.y0 - g && Y <= r.main.y1 + g) {
    h = Hw + (r.wingWidth / 2 - Math.abs(X - r.ridgeX)) * T;
  }
  // living wing: ridge along X
  if (X >= r.living.x0 - g && X <= r.ridgeX && Y >= r.living.y0 - o && Y <= r.living.y1 + o) {
    const hl = Hw + (r.wingWidth / 2 - Math.abs(Y - r.ridgeY)) * T;
    h = h === null ? hl : Math.max(h, hl);
  }
  return h;
}

export const TAN_PITCH = T;
