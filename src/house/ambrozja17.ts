/**
 * Ambrozja 17 (BSA2409), Domy w Stylu, as parametric data.
 *
 * Source: extradom.pl floor plan (scaled at 43.8 px/m against the 16.85 × 22.85 m
 * dimension lines), site plan, renders and the technical data sheet.
 * TODO: refine openings and heights against the PDF drawings in /docs once available.
 *
 * Plan coordinates: X → right, Y → down (as on the drawing), metres, origin at the
 * top-left corner of the outer wall outline. "Front" (entrance + garage) is +Y.
 * ±0.00 = finished ground floor level.
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
}

export interface WallEdge {
  id: string;
  a: Vec2;
  b: Vec2;
  /** gable walls rise to the roof underside */
  gable?: { ridgeAt: number; halfSpan: number };
}

export const PITCH_DEG = 30;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const WING_W = 9.09; // both wings
const MAIN_X0 = 7.76;
const MAIN_X1 = 16.85;
const LIV_Y0 = 6.62;
const LIV_Y1 = 15.7;
const RIDGE_X = (MAIN_X0 + MAIN_X1) / 2; // 12.305
const RIDGE_Y = (LIV_Y0 + LIV_Y1) / 2; // 11.16

export const house = {
  name: 'Ambrozja 17',
  code: 'BSA2409',
  width: 16.85,
  depth: 22.85,
  usableArea: 167.84,
  footprintArea: 260.7,
  heightTotal: 6.94,
  pitchDeg: PITCH_DEG,

  /** finished floor above surrounding platform (cokół) */
  plinth: 0.45,
  wallThickness: 0.44,
  innerWallThickness: 0.12,
  ceilingHeight: 2.8,
  slabThickness: 0.3,

  roof: {
    thickness: 0.25,
    eaveOverhang: 0.6,
    gableOverhang: 0.4,
    /** roof top surface height at the outer wall face, derived so the ridge = 6.94 m above terrain */
    get topAtWall() {
      return house.heightTotal - house.plinth - (WING_W / 2) * T;
    },
    ridgeX: RIDGE_X,
    ridgeY: RIDGE_Y,
    wingWidth: WING_W,
    main: { x0: MAIN_X0, x1: MAIN_X1, y0: 0, y1: 22.85 },
    living: { x0: 0, y0: LIV_Y0, y1: LIV_Y1 },
    chimneys: [
      { x: 7.95, y: 9.0, w: 0.55, d: 0.55, top: 6.0 }, // fireplace (living)
      { x: 13.2, y: 12.4, w: 0.55, d: 0.75, top: 7.0 }, // boiler room
    ],
  },

  /** exterior wall outline, clockwise as drawn (Y down) */
  outline: [
    [0, LIV_Y0],
    [MAIN_X0, LIV_Y0],
    [MAIN_X0, 0],
    [MAIN_X1, 0],
    [MAIN_X1, 22.85],
    [10.23, 22.85],
    [10.23, LIV_Y1],
    [0, LIV_Y1],
  ] as Vec2[],

  walls: [
    { id: 'livN', a: [0, LIV_Y0], b: [MAIN_X0, LIV_Y0] },
    { id: 'bedW', a: [MAIN_X0, LIV_Y0], b: [MAIN_X0, 0] },
    { id: 'gableN', a: [MAIN_X0, 0], b: [MAIN_X1, 0], gable: { ridgeAt: RIDGE_X, halfSpan: WING_W / 2 } },
    { id: 'east', a: [MAIN_X1, 0], b: [MAIN_X1, 22.85] },
    { id: 'gableS', a: [MAIN_X1, 22.85], b: [10.23, 22.85], gable: { ridgeAt: RIDGE_X, halfSpan: WING_W / 2 } },
    { id: 'garW', a: [10.23, 22.85], b: [10.23, LIV_Y1] },
    { id: 'front', a: [10.23, LIV_Y1], b: [0, LIV_Y1] },
    { id: 'gableW', a: [0, LIV_Y1], b: [0, LIV_Y0], gable: { ridgeAt: RIDGE_Y, halfSpan: WING_W / 2 } },
  ] as WallEdge[],

  openings: [
    // terrace side (north of living wing)
    { wall: 'livN', at: 1.6, width: 1.3, height: 2.3, sill: 0, kind: 'terraceDoor' },
    { wall: 'livN', at: 4.4, width: 2.4, height: 2.3, sill: 0, kind: 'hs' },
    // bedroom wing, terrace side
    { wall: 'bedW', at: 2.6, width: 1.4, height: 2.3, sill: 0, kind: 'terraceDoor' },
    { wall: 'bedW', at: 4.85, width: 0.9, height: 0.9, sill: 1.4, kind: 'window' },
    // east: three bedrooms + utility door
    { wall: 'east', at: 3.7, width: 1.5, height: 1.5, sill: 0.85, kind: 'window' },
    { wall: 'east', at: 7.2, width: 1.5, height: 1.5, sill: 0.85, kind: 'window' },
    { wall: 'east', at: 10.6, width: 1.5, height: 1.5, sill: 0.85, kind: 'window' },
    { wall: 'east', at: 14.55, width: 1.0, height: 2.2, sill: 0, kind: 'door' },
    // front gable: garage door
    { wall: 'gableS', at: 13.6, width: 4.6, height: 2.3, sill: -0.3, kind: 'garage' },
    // front of living wing: kitchen window + entrance
    { wall: 'front', at: 5.3, width: 2.0, height: 1.2, sill: 1.05, kind: 'window' },
    { wall: 'front', at: 9.25, width: 1.1, height: 2.3, sill: 0, kind: 'entrance' },
    // west gable: tall living-room glazing
    { wall: 'gableW', at: 10.35, width: 1.8, height: 2.3, sill: 0, kind: 'fixed' },
  ] as Opening[],

  /** interior partitions [x1,y1,x2,y2] (approximate, for views through glass) */
  partitions: [
    [7.76, 4.18, 10.46, 4.18],
    [10.46, 4.18, 10.46, 10.2],
    [7.76, 7.85, 10.46, 7.85],
    [7.76, 10.2, 10.46, 10.2],
    [7.76, 6.62, 7.76, 10.2],
    [12.25, 0, 12.25, 11.7],
    [12.25, 2.0, 16.85, 2.0],
    [12.25, 5.2, 16.85, 5.2],
    [12.25, 9.1, 16.85, 9.1],
    [11.0, 11.7, 16.85, 11.7],
    [0, 12.85, 2.75, 12.85],
    [2.75, 12.85, 2.75, 15.7],
    [8.17, 13.0, 8.17, 15.7],
    [9.9, 14.0, 9.9, 15.7],
    [10.23, 15.37, 16.85, 15.37],
    [12.9, 11.7, 12.9, 15.37],
    [11.0, 11.7, 11.0, 15.37],
  ] as [number, number, number, number][],

  /** room labels for the plan view */
  rooms: [
    { name: 'Salon + jadalnia', area: 38.5, at: [3.2, 9.3] },
    { name: 'Kuchnia', area: 15.36, at: [5.3, 14.2] },
    { name: 'Spiżarnia', area: 5.77, at: [1.3, 14.2] },
    { name: 'Hol', area: 11.98, at: [9.6, 12.0] },
    { name: 'Sypialnia', area: 14.11, at: [9.9, 2.1] },
    { name: 'Łazienka', area: 7.83, at: [9.1, 6.0] },
    { name: 'Łazienka', area: 5.04, at: [9.1, 9.0] },
    { name: 'Korytarz', area: 8.92, at: [11.35, 7.0] },
    { name: 'Garderoba', area: 5.76, at: [14.5, 1.0] },
    { name: 'Pokój', area: 12.47, at: [14.5, 3.6] },
    { name: 'Pokój', area: 13.6, at: [14.5, 7.2] },
    { name: 'Pokój', area: 10.63, at: [14.5, 10.4] },
    { name: 'Pralnia', area: 4.35, at: [11.95, 13.5] },
    { name: 'Kotłownia', area: 7.52, at: [14.9, 13.5] },
    { name: 'Garaż', area: 38.87, at: [13.55, 19.2] },
  ] as { name: string; area: number; at: Vec2 }[],

  /** terrace in the inner corner, at floor level, with steps on the garden side */
  terrace: { x0: 0, x1: MAIN_X0, y0: 0.6, y1: LIV_Y0, stepsSide: 'north' as const, steps: 3 },
  /** entrance steps in front of the door */
  entranceSteps: { x0: 8.2, x1: 10.23, y0: LIV_Y1, y1: 17.2 },
  /** covered porch / carport under the main roof, west of the garage */
  porch: { x0: MAIN_X0, x1: 10.23, y0: LIV_Y1, y1: 22.85, column: { x: 8.05, y: 22.6, size: 0.4 } },
  utilitySteps: { x0: MAIN_X1, x1: MAIN_X1 + 0.9, y0: 14.0, y1: 15.1 },
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
