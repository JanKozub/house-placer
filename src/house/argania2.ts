/**
 * Dom w Arganiach 2 (G2E), ARCHON+, as parametric data.
 *
 * Source: archon.pl project page (mf0c296e59a4b2): dimensioned interactive ground-floor and attic
 * plans (dimension chains and window labels width/height in cm), the section and the four
 * elevations. A usable attic over the whole house; L-shaped, the double garage projects 3.75 m.
 *
 * Plan coordinates: X → right, Y → down as drawn, metres, origin at the top-left (north-west in the
 * drawing) corner of the outer walls. Front (entrance, garage) is +Y, the garden (terrace) is −Y.
 * ±0.00 = finished ground floor; surrounding ground −0.32.
 *
 * From the drawings: overall 14.30 × 12.45 (chains 7.40 + 6.90, 8.70 + 3.75), walls 25 cm
 * Porotherm + 20 cm EPS, ceiling 2.68, attic slab +3.06, knee wall 1.25, roof 38°, ridge +7.98.
 * Read off the elevations / assumed (not dimensioned on the web drawings): eave overhang 0.80,
 * gable overhang 0.80, eave soffit +3.53 (section), attic window sills (French windows from the
 * attic floor, 80/140 at +0.80), the gable glazing sill +3.20, chimney positions and tops,
 * pergola and entrance canopy heights, and the extent of the façade colour zones.
 */
import type { ExtraBox, HouseDef } from './types';

const PITCH_DEG = 38;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const W = 14.3; // overall width (740 + 690)
const D = 8.7; // main body depth
const XW = 7.4; // garage wing west face
const DW = 12.45; // garage wing front face (870 + 375)

const RIDGE_TOP = 7.98; // section
const TOP_AT_WALL = RIDGE_TOP - (D / 2) * T; // roof top surface at the eave walls
const O = 0.8; // eave overhang
const G = 0.8; // gable overhang
const SOFFIT = 3.53; // section: underside of the eave
const ATTIC = 3.06; // attic floor
const HEAD = 2.3; // ground-floor window / door heads (labels …/230)

// pergola over the terrace: 2 × 3 posts, beams along X, slats along Y
const pergola: ExtraBox[] = (() => {
  const xs = [0.56, 4.19, 7.78], ys = [-2.84, -0.15];
  const out: ExtraBox[] = [];
  for (const x of xs) for (const y of ys) out.push({ x0: x - 0.075, x1: x + 0.075, y0: y - 0.075, y1: y + 0.075, h0: -0.02, h1: 2.75, part: 'frame' });
  for (const y of ys) out.push({ x0: 0.45, x1: 7.89, y0: y - 0.075, y1: y + 0.075, h0: 2.75, h1: 2.95, part: 'frame' });
  for (let x = 0.75; x < 7.7; x += 0.45) out.push({ x0: x - 0.025, x1: x + 0.025, y0: -2.95, y1: -0.05, h0: 2.95, h1: 3.03, part: 'frame' });
  return out;
})();

export const argania2: HouseDef = {
  id: 'argania2',
  name: 'Dom w Arganiach 2',
  code: 'G2E',
  designer: 'ARCHON+',
  width: W,
  depth: DW,
  usableArea: 204.08,
  footprintArea: 150.82,
  heightTotal: Math.round((RIDGE_TOP + 0.32) * 100) / 100, // 8.30 to the ridge (spec 8.33 incl. ridge capping)
  pitchDeg: PITCH_DEG,

  plinth: 0.32,
  wallThickness: 0.45,
  innerWallThickness: 0.12,
  ceilingHeight: 2.68,
  // walls run up to just under the roof at the outer face (knee wall 1.25 above the attic floor)
  wallTop: 4.15,

  roof: (() => {
    const edgeTop = TOP_AT_WALL - O * T;
    return {
      pitchDeg: PITCH_DEG,
      thickness: 0.3,
      ridgeTop: RIDGE_TOP,
      topAtWall: TOP_AT_WALL,
      eaveOverhang: O,
      soffit: SOFFIT,
      // main gable (ridge along X, eaves front and back) and the cross gable over the garage wing
      // (ridge along Y, glazed gable at the front); the wing ridge (+7.28) dies into the main front slope
      volumes: [
        { kind: 'gable', ridge: 'x', x0: -G, x1: W + G, y0: -O, y1: D + O, edgeTop },
        { kind: 'gable', ridge: 'y', x0: XW - O, x1: W + O, y0: D / 2, y1: DW + G, edgeTop },
      ],
      outline: [[-G, -O], [W + G, -O], [W + G, DW + G], [XW - O, DW + G], [XW - O, D + O], [-G, D + O]],
      chimneys: [
        { x: 5.15, y: 6.2, w: 0.6, d: 0.6, top: 8.05 }, // fireplace (kitchen side)
        { x: 12.45, y: 4.5, w: 0.6, d: 0.6, top: 8.3 }, // boiler room
      ],
      soffits: [
        [[-G, -O], [W + G, -O], [W + G, 0], [-G, 0]], // back eave
        [[-G, D], [XW, D], [XW - O, D + O], [-G, D + O]], // front eave of the main body
        [[XW, D], [XW, DW + G], [XW - O, DW + G], [XW - O, D + O]], // wing, west
        [[W, D], [W + O, D], [W + O, DW + G], [W, DW + G]], // wing, east
      ],
      fasciae: [
        [[-G, -O], [W + G, -O]],
        [[-G, D + O], [XW - O, D + O]],
        [[XW - O, D + O], [XW - O, DW + G]],
        [[W + O, D], [W + O, DW + G]],
      ],
      caps: [
        { at: [-G, 0], out: [0, -1] },
        { at: [W + G, 0], out: [0, -1] },
        { at: [-G, D], out: [0, 1] },
        { at: [XW, DW + G], out: [-1, 0] },
        { at: [W, DW + G], out: [1, 0] },
        { at: [W, D], out: [1, 0] },
      ],
      gutters: [
        [[-G, -O - 0.08], [W + G, -O - 0.08]],
        [[-G, D + O + 0.08], [XW - O, D + O + 0.08]],
        [[XW - O - 0.08, D + O], [XW - O - 0.08, DW + G]],
        [[W + O + 0.08, D], [W + O + 0.08, DW + G]],
      ],
      pipes: [
        { wall: [0.4, -0.08], gutter: [0.4, -O - 0.08] },
        { wall: [W - 0.4, -0.08], gutter: [W - 0.4, -O - 0.08] },
        { wall: [0.4, D + 0.08], gutter: [0.4, D + O + 0.08] },
        { wall: [XW - 0.08, DW - 0.4], gutter: [XW - O - 0.08, DW - 0.4] },
        { wall: [W + 0.08, DW - 0.4], gutter: [W + O + 0.08, DW - 0.4] },
      ],
      gables: [
        { a: [0, D], b: [0, 0], base: 4.15 },
        { a: [W, 0], b: [W, D], base: 4.15 },
        { a: [W, DW], b: [XW, DW], base: 4.15 },
      ],
    };
  })(),

  /** exterior wall outline, clockwise as drawn (Y down); (W, D) is a straight-through vertex where
   *  the east gable wall of the main body meets the side wall of the garage wing */
  outline: [[0, 0], [W, 0], [W, D], [W, DW], [XW, DW], [XW, D], [0, D]],
  walls: [
    { id: 'back', label: 'Ogród (salon, pokój)', a: [0, 0], b: [W, 0] },
    { id: 'eastMain', label: 'Szczyt wschodni', a: [W, 0], b: [W, D] },
    { id: 'eastWing', label: 'Bok garażu', a: [W, D], b: [W, DW] },
    { id: 'wingFront', label: 'Szczyt garażu (front)', a: [W, DW], b: [XW, DW] },
    { id: 'wingWest', label: 'Wejście / bok garażu', a: [XW, DW], b: [XW, D] },
    { id: 'front', label: 'Front (kuchnia, wejście)', a: [XW, D], b: [0, D] },
    { id: 'west', label: 'Szczyt zachodni (salon)', a: [0, D], b: [0, 0] },
  ],

  openings: [
    // garden side: living room 330/230 + 110/230, ground-floor room 220/230
    { wall: 'back', at: 2.41, width: 3.3, height: HEAD, sill: 0, kind: 'hs', panes: 3, ref: '330/230' },
    { wall: 'back', at: 6.17, width: 1.1, height: HEAD, sill: 0, kind: 'terraceDoor', panes: 1, ref: '110/230' },
    { wall: 'back', at: 11.62, width: 2.2, height: HEAD, sill: 0, kind: 'terraceDoor', panes: 2, ref: '220/230' },
    // west gable: living room 320/230; attic rooms 8 and 9, French windows 160/220
    { wall: 'west', at: 3.51, width: 3.2, height: HEAD, sill: 0, kind: 'fixed', panes: 3, ref: '320/230' },
    { wall: 'west', at: 2.78, width: 1.6, height: 2.2, sill: ATTIC, kind: 'window', panes: 2, ref: '160/220', level: ATTIC },
    { wall: 'west', at: 5.97, width: 1.6, height: 2.2, sill: ATTIC, kind: 'window', panes: 2, ref: '160/220', level: ATTIC },
    // east gable: boiler room and garage 90/140; attic room 2 (160/220) and laundry (80/140)
    { wall: 'eastMain', at: 4.33, width: 0.9, height: 1.4, sill: HEAD - 1.4, kind: 'window', ref: '90/140' },
    { wall: 'eastMain', at: 6.94, width: 0.9, height: 1.4, sill: HEAD - 1.4, kind: 'window', ref: '90/140' },
    { wall: 'eastMain', at: 2.78, width: 1.6, height: 2.2, sill: ATTIC, kind: 'window', panes: 2, ref: '160/220', level: ATTIC },
    { wall: 'eastMain', at: 5.48, width: 0.8, height: 1.4, sill: ATTIC + 0.8, kind: 'window', ref: '80/140', level: ATTIC },
    // front: garage door 500/225; the glazed gable of attic room 5 (560/280)
    { wall: 'wingFront', at: 10.82, width: 5.0, height: 2.25, sill: 0, kind: 'garage', ref: 'Hörmann 500/225' },
    { wall: 'wingFront', at: 10.82, width: 5.6, height: 2.8, sill: 3.2, kind: 'fixed', shape: 'gable', ref: '560/280', level: ATTIC },
    // side door into the garage from the covered entrance
    { wall: 'wingWest', at: 9.92, width: 0.9, height: 2.1, sill: 0, kind: 'door', ref: '90/210' },
    // kitchen window 250/140, entrance door 150/210 (door + side light) next to the garage wing
    { wall: 'front', at: 2.48, width: 2.5, height: 1.4, sill: HEAD - 1.4, kind: 'window', panes: 2, ref: '250/140' },
    { wall: 'front', at: 6.48, width: 1.5, height: 2.1, sill: 0, kind: 'entrance', ref: '150/210' },
  ],

  /** ground-floor partitions (approximate, for views through the glass) */
  partitions: [
    [7.6, 0, 7.6, 4.3], // living room | wardrobe, stairs
    [9.95, 0, 9.95, 3.6], // hall | room 7
    [9.95, 3.6, W, 3.6],
    [11.05, 3.6, 11.05, 5.95], // bathroom | boiler room
    [7.6, 5.95, W, 5.95], // garage back wall
    [7.6, 5.95, 7.6, D], // vestibule | garage
    [4.55, 6.1, 4.55, D], // kitchen | pantry
    [5.7, 6.1, 5.7, D], // pantry | vestibule
    [4.55, 6.1, 5.7, 6.1],
  ],
  rooms: [
    { name: '1. Wiatrołap', area: 4.07, at: [6.6, 7.4] },
    { name: '2. Spiżarnia', area: 1.99, at: [5.12, 7.6] },
    { name: '3. Kuchnia', area: 10.02, at: [2.4, 7.3] },
    { name: '4. Salon + jadalnia', area: 36.61, at: [3.4, 2.8] },
    { name: '5. Garderoba', area: 1.8, at: [8.3, 1.2] },
    { name: '6. Hol', area: 4.74, at: [8.9, 4.6] },
    { name: '7. Pokój', area: 11.94, at: [11.9, 1.8] },
    { name: '8. Łazienka', area: 2.8, at: [10.3, 4.8] },
    { name: '9. Kotłownia', area: 5.58, at: [12.6, 4.8] },
    { name: '10. Garaż', area: 35.2, at: [10.8, 9.3] },
  ],
  upperRooms: [
    { name: 'Hol', area: 10.83 },
    { name: 'Pokój', area: 12.35 },
    { name: 'Pralnia', area: 4.82 },
    { name: 'Garderoba', area: 3.98 },
    { name: 'Pokój (apartament)', area: 17.3 },
    { name: 'Łazienka', area: 3.48 },
    { name: 'Łazienka', area: 4.69 },
    { name: 'Pokój', area: 11.96 },
    { name: 'Pokój', area: 13.95 },
    { name: 'Schody', area: 5.97 },
  ],
  upperFloor: {
    level: ATTIC,
    thickness: 0.24,
    voids: [
      { x0: 5.2, x1: 7.5, y0: 0.5, y1: 4.3 }, // double-height living room (antresola)
      { x0: 7.72, x1: 8.7, y0: 1.9, y1: 4.3 }, // stairwell
    ],
  },
  roofWindows: [
    { at: [9.1, 1.3], width: 0.78, length: 1.4 }, // stairs, garden slope
    { at: [6.2, 7.5], width: 0.78, length: 1.4 }, // bathroom, front slope
    { at: [8.4, 10.2], width: 0.78, length: 1.4 }, // master bedroom, garage-wing west slope
  ],

  paving: [
    // terrace under and beside the pergola
    { x0: -0.2, x1: 9.6, y0: -3.85, y1: 0, top: -0.02 },
    { x0: 9.6, x1: W, y0: -3.0, y1: 0, top: -0.02 },
    // covered entrance and one step
    { x0: 4.9, x1: XW, y0: D, y1: DW, top: -0.02 },
    { x0: 4.9, x1: XW, y0: DW, y1: DW + 0.3, top: -0.17 },
  ],
  porches: [],
  extras: [
    // flat entrance canopy beside the garage wing, on one dark post
    { x0: 4.9, x1: XW, y0: D, y1: DW, h0: 2.75, h1: 3.05, part: 'plaster' },
    { x0: 5.0, x1: 5.3, y0: DW - 0.35, y1: DW - 0.05, h0: -0.02, h1: 2.75, part: 'accent' },
    ...pergola,
  ],
  // dark render on the ground floor, wood cladding at the back and by the entrance
  facadeZones: [
    { wall: 'west', from: D, to: 0, h0: 0, h1: 2.75, finish: 'accent' },
    { wall: 'front', from: XW, to: 0, h0: 0, h1: 2.75, finish: 'accent' },
    { wall: 'eastMain', from: 0, to: D, h0: 0, h1: 2.75, finish: 'accent' },
    { wall: 'eastWing', from: D, to: DW, h0: 0, h1: 2.75, finish: 'accent' },
    { wall: 'wingFront', from: W, to: XW, h0: 0, h1: 2.25, finish: 'accent' },
    { wall: 'wingWest', from: DW, to: D, h0: 0, h1: 2.75, finish: 'wood' },
    { wall: 'back', from: 0.45, to: W - 0.45, h0: 0, h1: 2.75, finish: 'wood' },
  ],

  terraceCorners: [{ at: [-0.2, -3.85], faces: [[0, -1], [-1, 0]] }],
  /** (W, D) is a straight-through vertex; (XW, D) the inner corner by the entrance */
  unmeasuredCorners: [2, 5],
  twoEdgeCorners: [3, 4],

  lights: [[3.5, 3.5], [12.0, 2.0], [10.8, 9.5]],
  wallLamps: [[5.55, D + 0.03], [XW - 0.03, 11.2], [4.2, -0.03]],
  views: {
    valley: { at: 'valleyWindow', h: 1.6, look: 'valley', label: 'Na dolinę' },
    terrace: { at: [4.2, -1.6], h: 1.6, look: [0, -1], label: 'Z tarasu' },
    living: { at: [1.6, 3.5], h: 1.6, look: [-1, 0], label: 'Z salonu' },
    kitchen: { at: [2.48, 7.6], h: 1.6, look: [0, 1], label: 'Z kuchni' },
    bedroom: { at: [10.82, 10.6], h: ATTIC + 1.6, look: [0, 1], label: 'Z sypialni (poddasze)' },
  },
};
