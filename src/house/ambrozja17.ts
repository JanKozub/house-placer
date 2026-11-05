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

import type { HouseDef } from './types';

const PITCH_DEG = 30;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const WING_W = 9.05; // both wings (plan chains: 905)
const MAIN_X0 = 7.8; // bedroom-wing west face (1685 − 905)
const MAIN_X1 = 16.85;
const LIV_Y0 = 6.6; // living wing (chain 660 | 905 | 720)
const LIV_Y1 = 15.65;
const GAR_X0 = 10.4; // garage west wall face (chain 20+25+575+25)
const RIDGE_X = (MAIN_X0 + MAIN_X1) / 2; // 12.325

const HEAD = 2.35; // window/door head level (section)
const RIDGE_TOP = 6.32;
const TOP_AT_WALL = RIDGE_TOP - (WING_W / 2) * T;
const EAVE_O = 1.0; // eave overhang
const GABLE_O = 0.5; // gable overhang
const SOFFIT = 2.73;
const Y1 = 22.85;

export const ambrozja17: HouseDef = {
  id: 'ambrozja17',
  name: 'Ambrozja 17',
  code: 'BSA2409',
  designer: 'Domy w Stylu',
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

  roof: (() => {
    const o = EAVE_O, g = GABLE_O;
    const x0 = MAIN_X0, x1 = MAIN_X1, y1 = Y1, L0 = LIV_Y0, L1 = LIV_Y1, R = RIDGE_X;
    const edgeTop = TOP_AT_WALL - o * T;
    return {
      pitchDeg: PITCH_DEG,
      thickness: 0.3,
      ridgeTop: RIDGE_TOP,
      topAtWall: TOP_AT_WALL,
      eaveOverhang: o,
      soffit: SOFFIT,
      // two gable wings meeting at a common ridge height, with valleys in the inner corners
      volumes: [
        { kind: 'gable', ridge: 'y', x0: x0 - o, x1: x1 + o, y0: -g, y1: y1 + g, edgeTop },
        { kind: 'gable', ridge: 'x', x0: -g, x1: R, y0: L0 - o, y1: L1 + o, edgeTop },
      ],
      outline: [[-g, L0 - o], [x0 - o, L0 - o], [x0 - o, -g], [x1 + o, -g], [x1 + o, y1 + g], [x0 - o, y1 + g], [x0 - o, L1 + o], [-g, L1 + o]],
      chimneys: [{ x: 8.6, y: 9.88, w: 0.58, d: 0.84, top: 6.7 }],
      soffits: [
        [[x1, -g], [x1 + o, -g], [x1 + o, y1 + g], [x1, y1 + g]],
        [[x0, -g], [x0 - o, -g], [x0 - o, L0 - o], [x0, L0]],
        [[x0, L1], [x0 - o, L1 + o], [x0 - o, y1 + g], [x0, y1 + g]],
        [[-g, L0 - o], [x0 - o, L0 - o], [x0, L0], [-g, L0]],
        [[-g, L1], [x0, L1], [x0 - o, L1 + o], [-g, L1 + o]],
      ],
      fasciae: [
        [[x1 + o, -g], [x1 + o, y1 + g]],
        [[x0 - o, -g], [x0 - o, L0 - o]],
        [[x0 - o, L1 + o], [x0 - o, y1 + g]],
        [[-g, L0 - o], [x0 - o, L0 - o]],
        [[-g, L1 + o], [x0 - o, L1 + o]],
      ],
      caps: [
        { at: [x1, -g], out: [1, 0] },
        { at: [x1, y1 + g], out: [1, 0] },
        { at: [x0, -g], out: [-1, 0] },
        { at: [x0, y1 + g], out: [-1, 0] },
        { at: [-g, L0], out: [0, -1] },
        { at: [-g, L1], out: [0, 1] },
      ],
      gutters: [
        [[x1 + o + 0.08, -g], [x1 + o + 0.08, y1 + g]],
        [[x0 - o - 0.08, -g], [x0 - o - 0.08, L0 - o]],
        [[x0 - o - 0.08, L1 + o], [x0 - o - 0.08, y1 + g]],
        [[-g, L0 - o - 0.08], [x0 - o, L0 - o - 0.08]],
        [[-g, L1 + o + 0.08], [x0 - o, L1 + o + 0.08]],
      ],
      pipes: [
        { wall: [x1 + 0.08, 0.4], gutter: [x1 + o + 0.08, 0.4] },
        { wall: [x1 + 0.08, y1 - 0.4], gutter: [x1 + o + 0.08, y1 - 0.4] },
        { wall: [x0 - 0.08, 0.4], gutter: [x0 - o - 0.08, 0.4] },
        { wall: [0.4, L0 - 0.08], gutter: [0.4, L0 - o - 0.08] },
        { wall: [0.4, L1 + 0.08], gutter: [0.4, L1 + o + 0.08] },
      ],
      gables: [
        { a: [x0, 0], b: [x1, 0], base: SOFFIT - 0.02 },
        { a: [x1, y1], b: [x0, y1], base: SOFFIT },
        { a: [0, L1], b: [0, L0], base: SOFFIT - 0.02 },
      ],
    };
  })(),

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
  ],

  walls: [
    { id: 'livN', label: 'Salon → taras', a: [0, LIV_Y0], b: [MAIN_X0, LIV_Y0] },
    { id: 'bedW', label: 'Sypialnia → taras', a: [MAIN_X0, LIV_Y0], b: [MAIN_X0, 0] },
    { id: 'gableN', label: 'Szczyt tylny', a: [MAIN_X0, 0], b: [MAIN_X1, 0] },
    { id: 'east', label: 'Strona pokoi', a: [MAIN_X1, 0], b: [MAIN_X1, 22.85] },
    { id: 'gableS', label: 'Szczyt garażu (front)', a: [MAIN_X1, 22.85], b: [GAR_X0, 22.85] },
    { id: 'garW', label: 'Garaż / wiata', a: [GAR_X0, 22.85], b: [GAR_X0, LIV_Y1], top: SOFFIT }, // carport side: up to the soffit
    { id: 'front', label: 'Front (kuchnia, wejście)', a: [GAR_X0, LIV_Y1], b: [0, LIV_Y1] },
    { id: 'gableW', label: 'Szczyt salonu', a: [0, LIV_Y1], b: [0, LIV_Y0] },
  ],

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
  ],

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
  ],

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
  ],

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
  ],

  /** terrace corner measured to the boundary it faces (the north-west corner of the lowest step), with its outward sides */
  terraceCorners: [{ at: [0.14, 0.29], faces: [[0, -1], [-1, 0]] }],
  /** house corners (outline indices) not dimensioned on the plan — B, the inner terrace corner */
  unmeasuredCorners: [1],
  /** house corners dimensioned to both boundaries they face — D and E, the garage-wing corners */
  twoEdgeCorners: [3, 4],

  /** carport (wiata) west of the garage, under the main roof, with two clad posts */
  porches: [{ x0: MAIN_X0, x1: GAR_X0, y0: LIV_Y1, y1: 22.85, posts: [[8.125, 17.7], [8.125, 22.575]], postSize: 0.55, ceiling: SOFFIT }],

  // a few broad lights (each point light costs every fragment of every lit material)
  lights: [[3.2, 9.3], [9.6, 12.0], [14.5, 7.2]],
  wallLamps: [[9.25 + 0.9, LIV_Y1 + 0.03], [GAR_X0 - 0.03, 20.2], [2.9, LIV_Y0 - 0.03], [MAIN_X0 - 0.03, 1.4]],
  views: {
    valley: { at: 'valleyWindow', h: 1.6, look: 'valley', label: 'Na dolinę' },
    terrace: { at: [4.6, 2.6], h: 1.6, look: [-0.7, -0.7], label: 'Z tarasu' },
    living: { at: [1.3, 10.25], h: 1.6, look: [-1, 0], label: 'Z salonu' },
    kitchen: { at: [5.44, 14.5], h: 1.6, look: [0, 1], label: 'Z kuchni' },
    bedroom: { at: [15.3, 7.15], h: 1.6, look: [1, 0], label: 'Z pokoju' },
  },
};

/** plan dimensions and levels, shared with the detached-garage variant (ambrozja17-detached.ts) */
export const AMB = { PITCH_DEG, T, MAIN_X0, MAIN_X1, LIV_Y0, LIV_Y1, GAR_X0, RIDGE_X, HEAD, RIDGE_TOP, TOP_AT_WALL, EAVE_O, GABLE_O, SOFFIT } as const;
