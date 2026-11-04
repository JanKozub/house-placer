/**
 * Dom Grela (Biłgoraj, dz. 95/9), TE-DE Sp. z o.o., projekt 12.2025, as parametric data.
 *
 * Source: docs/Biłgoraj Andersena Grela rysunki.pdf — rzut parteru (rys. 1, 1:100), przekrój A-A
 * (rys. 4, 1:50), rzut połaci dachowej (rys. 19). Dimension chains in cm, levels in m.
 * The plan is used as drawn (no rotation): X → right, Y → down, origin at the top-left corner of
 * the outer wall outline's bounding box; the entrance and the garage door face +Y.
 *
 * Main block 15.81 × 12.58 m (axes 656 | 514 | 346 + 2 × 32.5), garage wing 6.69 × 10.98 m set in
 * 0.80 m at front and back. Covered terrace 6.56 × 2.86 in the north-west corner with post S-1,
 * entrance recessed 0.80 m (2.57 wide). Two hipped roofs at 30°, eaves 0.80 m beyond the façade:
 * fascia top +3.07, soffit +2.77, main ridge +7.16; the lower garage roof runs into the main
 * roof's east hip with valleys. Ground −0.32.
 *
 * No elevations in the set: window heights come from the plan's width/height labels (150/150,
 * 280/235, 400/235, 130+240/145, 90/150) with sill heights (hp); heads are at +2.35. Interior
 * partitions are approximate (they are only seen through the glass).
 */

import type { HouseDef } from './types';

const PITCH_DEG = 30;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const W = 22.5; // outer width (chain 2250)
const D = 12.58; // outer depth (chain 1258)
const MX1 = 15.81; // main block east face (32.5 + 656 + 514 + 346 + 32.5)
const GY0 = 0.8; // garage wing set in (chain 80 | 1098 | 80)
const GY1 = 11.78;
const TX1 = 6.56; // covered terrace (chain 656)
const TY1 = 2.86; // (chain 286)
const RX0 = 9.13; // entrance recess (chain 913 | 257)
const RX1 = 11.7;
const RY0 = 11.78; // recess depth 80

const O = 0.8; // eave overhang beyond the façade (112.5 from the axes)
const EDGE_TOP = 3.07; // roof top at the eave edge (section)
const SOFFIT = 2.77;
const HEAD = 2.35;
const WIN = HEAD - 1.5; // hp = 0.85

export const grela: HouseDef = {
  id: 'grela-bilgoraj',
  name: 'Dom Grela',
  code: 'TE-DE 12.2025',
  designer: 'TE-DE Sp. z o.o. (Biłgoraj, dz. 95/9)',
  width: W,
  depth: D,
  usableArea: 204.7,
  footprintArea: 272.35, // incl. covered terrace and entrance recess
  heightTotal: 7.48, // −0.32 → +7.16
  pitchDeg: PITCH_DEG,

  plinth: 0.32,
  wallThickness: 0.45, // 25 cm aerated concrete + 20 cm EPS
  innerWallThickness: 0.12,
  ceilingHeight: 3.01,
  wallTop: 3.19,

  roof: {
    pitchDeg: PITCH_DEG,
    thickness: 0.25,
    ridgeTop: 7.16,
    topAtWall: EDGE_TOP + O * T,
    eaveOverhang: O,
    soffit: SOFFIT,
    volumes: [
      // main hip 17.41 × 14.18
      { kind: 'hip', ridge: 'x', x0: -O, x1: MX1 + O, y0: -O, y1: D + O, edgeTop: EDGE_TOP },
      // garage hip, 12.58 deep (ridge +6.70); its west end is buried under the main roof
      { kind: 'hip', ridge: 'x', x0: 4.0, x1: W + O, y0: GY0 - O, y1: GY1 + O, edgeTop: EDGE_TOP },
    ],
    outline: [
      [-O, -O], [MX1 + O, -O], [MX1 + O, GY0 - O], [W + O, GY0 - O], [W + O, GY1 + O], [MX1 + O, GY1 + O], [MX1 + O, D + O], [-O, D + O],
    ],
    chimneys: [
      { x: 6.64, y: 3.59, w: 0.45, d: 0.75, top: 6.6 },
      { x: 15.0, y: 9.15, w: 0.45, d: 0.75, top: 6.2 },
    ],
    // boxed eaves all round (the terrace and entrance recess have their own porch ceilings)
    soffits: [
      [[-O, -O], [MX1 + O, -O], [MX1 + O, 0], [-O, 0]],
      [[-O, 0], [0, 0], [0, D], [-O, D]],
      [[-O, D], [MX1 + O, D], [MX1 + O, D + O], [-O, D + O]],
      [[MX1, 0], [MX1 + O, 0], [MX1 + O, GY0], [MX1, GY0]],
      [[MX1, GY1], [MX1 + O, GY1], [MX1 + O, D], [MX1, D]],
      [[MX1 + O, GY0 - O], [W + O, GY0 - O], [W + O, GY0], [MX1 + O, GY0]],
      [[W, GY0], [W + O, GY0], [W + O, GY1], [W, GY1]],
      [[MX1 + O, GY1], [W + O, GY1], [W + O, GY1 + O], [MX1 + O, GY1 + O]],
    ],
    fasciae: [
      [[-O, -O], [MX1 + O, -O]],
      [[MX1 + O, -O], [MX1 + O, GY0 - O]],
      [[MX1 + O, GY0 - O], [W + O, GY0 - O]],
      [[W + O, GY0 - O], [W + O, GY1 + O]],
      [[MX1 + O, GY1 + O], [W + O, GY1 + O]],
      [[MX1 + O, GY1 + O], [MX1 + O, D + O]],
      [[-O, D + O], [MX1 + O, D + O]],
      [[-O, -O], [-O, D + O]],
    ],
    caps: [],
    gutters: [
      [[-O, -O - 0.08], [MX1 + O, -O - 0.08]],
      [[MX1 + O + 0.08, -O], [MX1 + O + 0.08, GY0 - O]],
      [[MX1 + O, GY0 - O - 0.08], [W + O, GY0 - O - 0.08]],
      [[W + O + 0.08, GY0 - O], [W + O + 0.08, GY1 + O]],
      [[MX1 + O, GY1 + O + 0.08], [W + O, GY1 + O + 0.08]],
      [[MX1 + O + 0.08, GY1 + O], [MX1 + O + 0.08, D + O]],
      [[-O, D + O + 0.08], [MX1 + O, D + O + 0.08]],
      [[-O - 0.08, -O], [-O - 0.08, D + O]],
    ],
    pipes: [
      { wall: [-0.08, 12.18], gutter: [-O - 0.08, 12.18] },
      { wall: [4.0, D + 0.08], gutter: [4.0, D + O + 0.08] },
      { wall: [7.2, -0.08], gutter: [7.2, -O - 0.08] },
      { wall: [15.41, -0.08], gutter: [15.41, -O - 0.08] },
      { wall: [W + 0.08, 1.2], gutter: [W + O + 0.08, 1.2] },
      { wall: [W + 0.08, 11.38], gutter: [W + O + 0.08, 11.38] },
    ],
    gables: [],
  },

  /** exterior wall outline, clockwise as drawn (Y down) */
  outline: [
    [0, TY1], [TX1, TY1], [TX1, 0], [MX1, 0], [MX1, GY0], [W, GY0], [W, GY1], [MX1, GY1],
    [MX1, D], [RX1, D], [RX1, RY0], [RX0, RY0], [RX0, D], [0, D],
  ],

  walls: [
    { id: 'terrS', label: 'Salon → taras', a: [0, TY1], b: [TX1, TY1] },
    { id: 'terrE', label: 'Pokój 9 → taras', a: [TX1, TY1], b: [TX1, 0] },
    { id: 'north', label: 'Tył (pokoje 9, 10)', a: [TX1, 0], b: [MX1, 0] },
    { id: 'stepN', label: 'Uskok garażu (tył)', a: [MX1, 0], b: [MX1, GY0] },
    { id: 'garN', label: 'Tył skrzydła garażu (pokój 12)', a: [MX1, GY0], b: [W, GY0] },
    { id: 'east', label: 'Bok garażu', a: [W, GY0], b: [W, GY1] },
    { id: 'garS', label: 'Brama garażowa', a: [W, GY1], b: [MX1, GY1] },
    { id: 'stepS', label: 'Uskok garażu (front)', a: [MX1, GY1], b: [MX1, D] },
    { id: 'southE', label: 'Front (kotłownia)', a: [MX1, D], b: [RX1, D] },
    { id: 'recE', label: 'Wnęka wejścia (wsch.)', a: [RX1, D], b: [RX1, RY0] },
    { id: 'recN', label: 'Drzwi wejściowe', a: [RX1, RY0], b: [RX0, RY0] },
    { id: 'recW', label: 'Wnęka wejścia (zach.)', a: [RX0, RY0], b: [RX0, D] },
    { id: 'southW', label: 'Front (kuchnia, biuro)', a: [RX0, D], b: [0, D] },
    { id: 'west', label: 'Bok salonu i kuchni', a: [0, D], b: [0, TY1] },
  ],

  openings: [
    // salon → terrace: 400/235, hp 0 (chain 128 | 400 | 128)
    { wall: 'terrS', at: 3.28, width: 4.0, height: HEAD, sill: 0, kind: 'hs', panes: 4, ref: 'HS 400/235' },
    // north: rooms 9 and 10, 150/150 hp 0.85 (chain 135 | 150 | 355 | 150 | 135)
    { wall: 'north', at: 8.66, width: 1.5, height: 1.5, sill: WIN, kind: 'window', panes: 2, ref: '150/150' },
    { wall: 'north', at: 13.71, width: 1.5, height: 1.5, sill: WIN, kind: 'window', panes: 2, ref: '150/150' },
    // garage wing north: room 12 (chain 135 | 150 | 384)
    { wall: 'garN', at: 17.91, width: 1.5, height: 1.5, sill: WIN, kind: 'window', panes: 2, ref: '150/150' },
    // garage door 500/235 (chain 84.5 | 500 | 84.5), garage floor taken as −0.15
    { wall: 'garS', at: 19.155, width: 5.0, height: 2.35, sill: -0.15, kind: 'garage', ref: 'Brama 500/235' },
    // boiler room 90/150 hp 0.85 (chain 90 | 90 | 231)
    { wall: 'southE', at: 13.05, width: 0.9, height: 1.5, sill: WIN, kind: 'window', ref: '90/150' },
    // entrance in the recess: sidelight 40/210 + door 100/210 (chain 58.5 | 40 | 100 | 58.5)
    { wall: 'recN', at: 10.615, width: 1.0, height: 2.1, sill: 0, kind: 'entrance', ref: 'Drzwi 100/210' },
    { wall: 'recN', at: 9.915, width: 0.4, height: 2.1, sill: 0, kind: 'fixed', panes: 1, ref: 'FIX 40/210' },
    // office 150/150 hp 0.85 (chain 260 | 413 | 150)
    { wall: 'southW', at: 7.48, width: 1.5, height: 1.5, sill: WIN, kind: 'window', panes: 2, ref: '150/150' },
    // kitchen corner window 130+240/145, hp 0.90 — drawn without glass in the corner: each leg
    // stops at the other wall's inner face (glass inside a wall stalls the path tracer)
    { wall: 'southW', at: 1.525, width: 2.15, height: 1.45, sill: 0.9, kind: 'window', panes: 2, ref: 'Narożne 240/145' },
    { wall: 'west', at: 11.605, width: 1.05, height: 1.45, sill: 0.9, kind: 'window', ref: 'Narożne 130/145' },
    // salon west glazing 280/235, hp 0 (chain 286 | 210 | 280)
    { wall: 'west', at: 6.36, width: 2.8, height: HEAD, sill: 0, kind: 'fixed', panes: 3, ref: 'FIX 280/235' },
  ],

  /** interior partitions [x1,y1,x2,y2] (approximate) */
  partitions: [
    [6.79, TY1, 6.79, 7.49], // terrace/room 9 wall down to the bathroom
    [10.44, 0.45, 10.44, 4.77], // rooms 9 | 10
    [10.5, 3.55, 15.36, 3.55], // room 10 / hall
    [7.01, 4.77, 10.53, 4.77], // room 9 / bath 7, wardrobe 8
    [8.75, 4.77, 8.75, 7.49], // bath 7 | wardrobe 8
    [7.01, 7.49, 10.53, 7.49], // → corridor
    [10.53, 3.55, 10.53, 7.49], // corridor west side
    [12.03, 4.78, 12.03, 12.13], // corridor / utility column
    [12.03, 4.78, 15.36, 4.78], // hall / laundry 11
    [12.03, 6.08, 15.36, 6.08], // laundry / bath 15
    [12.03, 8.96, 15.36, 8.96], // bath 15 / boiler room 16
    [4.12, 8.94, 12.03, 8.94], // corridor / office, pantry, vestibule
    [4.12, 8.87, 4.12, 12.13], // kitchen | pantry
    [5.35, 8.94, 5.35, 12.13], // pantry | office
    [8.76, 8.94, 8.76, 11.33], // office | vestibule
    [15.58, 0.45, 15.58, 12.13], // main block east wall (inside)
    [19.49, 1.25, 19.49, 4.92], // room 12 | wardrobe 13
    [19.49, 3.5, 22.05, 3.5], // wardrobe 13 / garage
    [15.81, 4.92, 19.49, 4.92], // room 12 / garage
  ],

  rooms: [
    { name: '1 Wiatrołap', area: 6.8, at: [10.4, 10.2] },
    { name: '2 Biuro', area: 9.8, at: [7.0, 10.6] },
    { name: '3 Spiżarnia', area: 3.3, at: [4.73, 10.9] },
    { name: '4 Kuchnia', area: 11.7, at: [2.2, 10.7] },
    { name: '5 Salon', area: 36.5, at: [3.4, 5.6] },
    { name: '6 Korytarz', area: 16.2, at: [7.2, 8.2] },
    { name: '7 Łazienka', area: 3.7, at: [7.9, 6.1] },
    { name: '8 Garderoba', area: 4.0, at: [9.6, 6.1] },
    { name: '9 Pokój', area: 14.1, at: [8.7, 2.3] },
    { name: '10 Pokój', area: 14.6, at: [12.9, 1.9] },
    { name: '11 Pralnia', area: 3.7, at: [13.7, 5.4] },
    { name: '12 Pokój', area: 13.9, at: [17.6, 3.0] },
    { name: '13 Garderoba', area: 5.3, at: [20.8, 2.3] },
    { name: '14 Garaż', area: 43.0, at: [19.0, 8.0] },
    { name: '15 Łazienka', area: 6.6, at: [13.7, 7.5] },
    { name: '16 Kotłownia', area: 11.5, at: [13.7, 10.6] },
  ],

  paving: [
    // covered terrace (terakota) and a step down to the garden
    { x0: 0, x1: TX1, y0: 0, y1: TY1, top: -0.02 },
    { x0: -0.3, x1: TX1, y0: -0.3, y1: 0, top: -0.17 },
    { x0: -0.3, x1: 0, y0: 0, y1: TY1, top: -0.17 },
    // entrance: recess, landing and the step around it
    { x0: RX0, x1: RX1, y0: RY0, y1: D, top: -0.02 },
    { x0: 9.01, x1: 11.98, y0: D, y1: 13.51, top: -0.02 },
    { x0: 8.62, x1: 12.31, y0: D, y1: 13.87, top: -0.17 },
    // apron in front of the garage door
    { x0: 16.4, x1: 21.9, y0: GY1, y1: 12.9, top: -0.3 },
  ],

  porches: [
    // terrace under the main roof, post S-1 at the outer corner
    { x0: 0, x1: TX1, y0: 0, y1: TY1, posts: [[0.25, 0.25]], postSize: 0.45, ceiling: SOFFIT },
    { x0: RX0, x1: RX1, y0: RY0, y1: D, posts: [], postSize: 0, ceiling: SOFFIT },
  ],

  terraceCorners: [{ at: [0, 0], faces: [[0, -1], [-1, 0]] }],
  /** inner corners: B (terrace), E and H (garage wing), K and L (entrance recess) */
  unmeasuredCorners: [1, 4, 7, 10, 11],
  /** F and G, the garage-wing corners */
  twoEdgeCorners: [5, 6],

  lights: [[3.4, 6.0], [9.8, 8.2], [13.0, 2.0]],
  wallLamps: [[9.45, RY0 + 0.03], [3.3, TY1 - 0.03], [16.3, GY1 + 0.03], [-0.03, 4.5]],
  views: {
    valley: { at: 'valleyWindow', h: 1.6, look: 'valley', label: 'Na dolinę' },
    terrace: { at: [3.3, 1.4], h: 1.6, look: [-0.5, -1], label: 'Z tarasu' },
    living: { at: [1.0, 6.36], h: 1.6, look: [-1, 0], label: 'Z salonu' },
    kitchen: { at: [1.4, 11.6], h: 1.6, look: [0, 1], label: 'Z kuchni' },
    bedroom: { at: [13.71, 1.0], h: 1.6, look: [0, -1], label: 'Z pokoju' },
  },
};
