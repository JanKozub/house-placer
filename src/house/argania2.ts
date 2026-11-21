/**
 * Dom w Arganiach 2 (G2E), ARCHON+, as parametric data.
 *
 * Source: archon.pl project page (mf0c296e59a4b2): dimensioned interactive ground-floor and attic
 * plans (dimension chains and window labels width/height in cm), the section and the four
 * elevations. A usable attic over the whole house; L-shaped, the double garage projects 3.75 m.
 *
 * Plan coordinates: X → right, Y → down as drawn, metres, origin at the top-left (north-west in the
 * drawing) corner of the outer walls. Front (entrance, garage) is +Y, the garden (terrace) is −Y.
 * ±0.00 = finished ground floor. The catalogue has the surrounding ground at −0.32; as adapted for
 * plot 664/2 the house stands on the levelled plot, with the ground 5 cm below the floor (see PLINTH).
 *
 * From the drawings: overall 14.30 × 12.45 (chains 7.40 + 6.90, 8.70 + 3.75), walls 25 cm
 * Porotherm + 20 cm EPS, ceiling 2.68, attic slab +3.06, knee wall 1.25, roof 38°, ridge +7.98.
 * Read off the elevations / assumed (not dimensioned on the web drawings): eave overhang 0.80,
 * gable overhang 0.80, eave soffit +3.53 (section), attic window sills (French windows from the
 * attic floor, 80/140 at +0.80), the gable glazing sill +3.20, chimney positions and tops,
 * pergola and entrance canopy heights, and the extent of the façade colour zones.
 */
import type { ExtraBox, Facing, FurnitureItem, FurnitureKind, HouseDef, Interior, Vec2 } from './types';
import { groundPartitions } from './interior';

const PITCH_DEG = 38;
const T = Math.tan((PITCH_DEG * Math.PI) / 180);

const W = 14.3; // overall width (740 + 690)
const D = 8.7; // main body depth
const XW = 7.4; // garage wing west face
// garage wing front face: 12.40 as adapted on the PZT (2026-11-10: chains 8.70 / 12.40 and 13.85 /
// 10.15 to the same line); the ARCHON+ catalogue plan has 12.45 (870 + 375)
const DW = 12.4;

// Floor above the ground around the house. The PZT (2026-11-10) sets ±0.00 = 357.00 and the plot is
// levelled to about that height (slopes of 0.7 m below the road and 1.5 m at the east corner, per
// the investor), so the house, the entrance and the forecourt are on one level: no plinth, no steps.
// The ARCHON+ catalogue section has the ground at −0.32.
const PLINTH = 0.05;

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

// ---------------------------------------------------------------------------------------------
// Interior, measured from archon.pl's interactive plans (ground floor and attic, 49 px/m at 2×):
// partition walls, doors and their swing, the dog-leg stairs (12 + 4 risers of 19.1 cm with a
// landing over the ground-floor wardrobe), the void over the living room, and the furniture as
// drawn. Finishes follow ARCHON+'s interior visualisations: cream walls, oak, beige stone on the
// fireplace wall and the worktops, graphite tall units. Heights from the section: 2.68 on the
// ground floor, 2.55 under the attic's flat ceiling, knee wall 1.25.
// ---------------------------------------------------------------------------------------------
const item = (kind: FurnitureKind, at: Vec2, face: Facing = 'S', w?: number, d?: number, more: Partial<FurnitureItem> = {}): FurnitureItem => ({ kind, at, face, w, d, ...more });
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const RISE = ATTIC / 16, GOING = 0.272;
const LANDING = 12 * RISE; // +2.295

const interior: Interior = {
  ground: {
    level: 0,
    height: 2.68,
    walls: [
      // stair core: the flight runs along the living-room wall, the wardrobe (5) lies under its landing
      { a: [7.51, 0.45], b: [7.51, 4.41], t: 0.14 },
      { a: [9.7, 0.45], b: [9.7, 2.42], t: 0.25 },
      { a: [8.56, 2.36], b: [9.58, 2.36], doors: [{ at: 0.54, width: 0.7, hinge: 'a', opens: 'S' }] },
      { a: [8.51, 2.36], b: [8.51, 3.23], t: 0.1 },
      // room 7
      { a: [9.72, 2.42], b: [9.72, 3.45], doors: [{ at: 0.46, width: 0.85, hinge: 'b', opens: 'E' }] },
      { id: 'room7South', a: [9.64, 3.51], b: [13.85, 3.51], t: 0.14 },
      // bathroom 8 and the boiler room 9
      { a: [9.64, 3.45], b: [9.64, 5.7], doors: [{ at: 1.42, width: 0.8, hinge: 'b', opens: 'W' }] },
      { id: 'boilerBath', a: [11.14, 3.58], b: [11.14, 5.7], t: 0.18 },
      // garage back wall: the doorway from the vestibule (sliding door) and the boiler-room door
      { id: 'garageBack', a: [6.15, 5.84], b: [13.85, 5.84], t: 0.28, doors: [{ at: 0.45, width: 0.9, kind: 'sliding', hinge: 'b', opens: 'N' }, { id: 'boiler', at: 5.68, width: 0.9, hinge: 'b', opens: 'S' }] },
      // fridge niche; kitchen | pantry | vestibule | garage
      { a: [3.89, 5.76], b: [4.6, 5.76] },
      { a: [4.55, 5.82], b: [4.55, 8.25], doors: [{ at: 1.38, width: 0.7, hinge: 'a', opens: 'W' }] },
      { a: [5.83, 6.45], b: [5.83, 8.25] },
      { id: 'garageVest', a: [7.77, 5.98], b: [7.77, 8.25], t: 0.16, doors: [{ id: 'garage', at: 1.77, width: 0.8, hinge: 'a', opens: 'E' }] },
    ],
    floors: [
      { rect: [0.45, 5.7, 4.49, 8.25], finish: 'tile' }, // kitchen
      { rect: [4.61, 6.45, 5.77, 8.25], finish: 'tile' }, // pantry
      { rect: [5.89, 5.98, 7.69, 8.25], finish: 'tile' }, // vestibule
      { rect: [9.7, 3.58, 11.05, 5.7], finish: 'tile' }, // bathroom
      { rect: [11.23, 3.58, 13.85, 5.7], finish: 'concrete' }, // boiler room
      { rect: [7.85, 5.98, 13.85, DW - 0.45], finish: 'concrete' }, // garage
    ],
    items: [
      // 4. living room + dining
      item('rug', [5.3, 2.85], 'S', 3.3, 3.2),
      item('dining', [1.87, 2.97], 'E', 2.0, 1.0, { opt: 8 }),
      item('pendant', [1.87, 2.45]), item('pendant', [1.87, 3.5]),
      item('sofa', [4.45, 2.865], 'E', 2.99, 0.96),
      item('ottoman', [5.49, 3.745], 'S', 1.12, 0.87),
      item('coffeeTable', [6.06, 2.3], 'S', 0.64, 0.92),
      item('console', [7.215, 2.3], 'W', 2.4, 0.45),
      item('tv', [7.415, 2.3], 'W', 1.4),
      item('fireplace', [5.375, 6.075], 'N', 1.55, 0.75),
      item('plant', [0.85, 4.95], 'S', 0.44, undefined, { h: 1.7 }),
      item('plant', [7.08, 0.82], 'S', 0.36, undefined, { h: 1.35 }),
      // 3. kitchen: peninsula with three stools, hob on the side run, sink under the window
      item('island', [1.66, 5.8], 'N', 2.4, 1.0),
      item('stool', [0.95, 5.12]), item('stool', [1.66, 5.12]), item('stool', [2.37, 5.12]),
      item('pendant', [1.0, 5.8], 'S', undefined, undefined, { h: 1.75 }), item('pendant', [1.66, 5.8], 'S', undefined, undefined, { h: 1.75 }), item('pendant', [2.32, 5.8], 'S', undefined, undefined, { h: 1.75 }),
      item('counter', [0.755, 7.275], 'E', 1.95, 0.6, { opt: 'hob upper' }),
      item('counter', [2.475, 7.945], 'N', 2.83, 0.61, { opt: 'sink' }),
      item('tall', [4.19, 7.945], 'N', 0.6, 0.61, { opt: 'oven', dark: true }),
      item('tall', [4.19, 6.21], 'W', 0.78, 0.6, { opt: 'fridge', dark: true }),
      // 2. pantry
      item('shelf', [5.56, 7.47], 'W', 1.55, 0.41),
      item('shelf', [5.19, 6.58], 'S', 1.16, 0.25),
      item('appliance', [4.9, 7.945], 'N', 0.58, 0.6),
      // 1. vestibule
      item('wardrobe', [7.385, 6.56], 'W', 1.16, 0.61),
      item('bench', [6.1, 7.7], 'E', 0.71, 0.4),
      item('rug', [6.75, 7.85], 'S', 0.9, 0.6),
      // 5. wardrobe under the landing, 6. hall
      item('shelf', [8.57, 0.745], 'S', 2.0, 0.59, { h: 1.95 }),
      item('plant', [9.22, 5.32], 'S', 0.36, undefined, { h: 1.3 }),
      // 7. room
      item('wardrobe', [10.125, 1.35], 'E', 1.8, 0.59),
      item('rug', [11.9, 1.9], 'S', 2.0, 1.4),
      item('sofa', [12.85, 2.995], 'N', 2.0, 0.89, { dark: true }),
      item('desk', [13.55, 1.155], 'W', 1.41, 0.6),
      // 8. bathroom
      item('shower', [10.375, 3.975], 'S', 1.35, 0.79),
      item('wc', [10.77, 4.87], 'W', 0.5, 0.56),
      item('basin', [10.11, 5.475], 'N', 0.6, 0.45),
      // 9. boiler room
      item('tank', [11.6, 4.0], 'S', 0.6),
      item('boiler', [12.99, 5.45], 'N', 0.72, 0.5),
      // 10. garage: units and a sink along the back wall
      item('counter', [8.775, 6.24], 'S', 1.73, 0.52, { dark: true }),
      item('counter', [10.49, 6.24], 'S', 1.42, 0.52, { opt: 'sink', dark: true }),
      item('wardrobe', [12.875, 6.24], 'S', 0.89, 0.52, { dark: true, h: 2.0 }),
      item('shelf', [13.62, 9.6], 'W', 2.4, 0.45, { dark: true }),
    ],
  },
  upper: {
    level: ATTIC,
    height: 2.55,
    knee: 1.25,
    walls: [
      // garden side: room 9 | void over the living room | stairs | room 2
      { a: [5.27, 0.45], b: [5.27, 4.19], t: 0.14 },
      { a: [0.45, 4.19], b: [5.34, 4.19], doors: [{ at: 3.63, width: 0.8, hinge: 'b', opens: 'N' }] },
      { a: [5.34, 4.19], b: [7.45, 4.19], h: 1.05, glass: true },
      { a: [7.58, 4.19], b: [8.55, 4.19], h: 1.05, glass: true },
      { a: [7.51, 0.45], b: [7.51, 4.24], t: 0.14 },
      { a: [8.575, 1.42], b: [8.575, 4.19], h: 1.05, glass: true },
      { a: [9.64, 0.45], b: [9.64, 4.24], t: 0.14 },
      { a: [9.57, 4.19], b: [13.85, 4.19], doors: [{ at: 1.23, width: 0.8, hinge: 'a', opens: 'N' }] },
      // corridor: room 8, bathroom 7 and the master suite open off its front side
      { a: [3.34, 4.25], b: [3.34, 5.44] },
      { a: [3.34, 5.44], b: [11.3, 5.44], doors: [{ at: 0.6, width: 0.8, hinge: 'b', opens: 'S' }, { at: 2.87, width: 0.8, hinge: 'a', opens: 'N' }, { at: 7.03, width: 0.85, hinge: 'a', opens: 'S' }] },
      { a: [5.16, 5.5], b: [5.16, 8.25] },
      { a: [7.69, 5.5], b: [7.69, 8.25] },
      // master suite: bathroom 6 and the wardrobe 4 off its own lobby
      { a: [9.76, 5.5], b: [9.76, 7.75], doors: [{ at: 1.04, width: 0.8, hinge: 'b', opens: 'E' }] },
      { a: [7.75, 7.75], b: [9.82, 7.75] },
      { a: [10.96, 5.5], b: [10.96, 8.22] },
      // laundry 3 and the wardrobe 4
      { a: [11.3, 4.25], b: [11.3, 5.5], doors: [{ at: 0.56, width: 0.8, hinge: 'a', opens: 'E' }] },
      { a: [10.96, 6.55], b: [13.85, 6.55] },
      { a: [10.96, 8.16], b: [13.85, 8.16], doors: [{ at: 0.94, width: 0.6, kind: 'fold', hinge: 'a', opens: 'S' }] },
    ],
    floors: [
      { rect: [5.23, 5.5, 7.63, 8.25], finish: 'tile' }, // bathroom 7
      { rect: [7.76, 5.5, 9.7, 7.69], finish: 'tile' }, // bathroom 6
      { rect: [11.36, 4.25, 13.85, 5.5], finish: 'tile' }, // laundry
      { rect: [11.03, 5.5, 13.85, 6.49], finish: 'tile' },
    ],
    items: [
      // 1. hall and corridor
      item('rug', [7.3, 4.82], 'S', 5.4, 0.8),
      item('plant', [9.1, 3.75], 'S', 0.34, undefined, { h: 1.2 }),
      item('block', [11.2, 5.72], 'S', 0.34, 0.44), // shaft
      // 9. room (garden side, west)
      item('bed', [1.485, 0.94], 'E', 0.97, 1.99),
      item('nightstand', [0.69, 1.65], 'E', 0.42, 0.42),
      item('armchair', [3.58, 1.37], 'S', 0.9),
      item('rug', [2.5, 2.45], 'S', 2.0, 1.3),
      item('wardrobe', [4.895, 2.135], 'W', 3.37, 0.61),
      item('desk', [1.87, 3.84], 'N', 2.82, 0.6),
      // 2. room (garden side, east)
      item('wardrobe', [9.995, 2.3], 'E', 3.6, 0.59),
      item('bed', [12.85, 0.94], 'W', 0.97, 1.99),
      item('nightstand', [13.63, 1.65], 'W', 0.42, 0.42),
      item('armchair', [11.15, 1.37], 'S', 0.9),
      item('rug', [12.2, 2.45], 'S', 2.0, 1.3),
      item('desk', [12.26, 3.84], 'N', 1.5, 0.6),
      // 8. room (front, west)
      item('desk', [1.87, 4.55], 'S', 2.82, 0.6),
      item('bed', [1.485, 7.7], 'E', 0.97, 1.99),
      item('nightstand', [0.69, 6.98], 'E', 0.42, 0.42),
      item('armchair', [3.58, 7.25], 'S', 0.9),
      item('rug', [2.5, 6.3], 'S', 2.0, 1.3),
      item('wardrobe', [4.795, 7.29], 'W', 1.83, 0.61),
      // 7. bathroom: double vanity, shower, bath under the roof window
      item('basin', [5.445, 6.47], 'E', 1.94, 0.43, { opt: 'double' }),
      item('shower', [7.17, 5.96], 'W', 0.92, 0.92),
      item('wc', [7.35, 6.95], 'W', 0.5, 0.56),
      item('bathtub', [6.555, 7.84], 'N', 1.79, 0.72),
      // 6. bathroom of the master suite
      item('bathtub', [8.145, 6.6], 'E', 1.79, 0.77),
      item('basin', [9.115, 5.725], 'S', 0.6, 0.45),
      item('wc', [9.11, 7.41], 'N', 0.5, 0.56),
      // 3. laundry
      item('counter', [11.98, 6.21], 'N', 1.24, 0.56, { opt: 'sink' }),
      item('washer', [12.91, 6.2], 'N', 0.6, 0.58, { opt: 'stack' }),
      item('rack', [13.45, 5.3], 'S', 0.5, 0.9),
      item('shelf', [13.325, 4.585], 'S', 1.05, 0.5),
      // 4. wardrobe
      item('wardrobe', [11.3, 7.36], 'E', 1.48, 0.53),
      item('rail', [12.48, 6.85], 'S', 1.84, 0.45),
      item('shelf', [13.625, 7.36], 'W', 1.48, 0.45),
      // 5. master bedroom in the garage wing, under the glazed gable
      item('wardrobe', [8.8, 8.0], 'S', 1.96, 0.4),
      item('rug', [11.6, 10.05], 'S', 3.0, 2.6),
      item('dresser', [8.14, 10.3], 'E', 3.3, 0.55),
      item('tv', [8.36, 10.05], 'E', 1.2, undefined, { h: 0.82 }),
      item('armchair', [9.08, 9.06], 'S', 0.9), item('armchair', [9.83, 11.33], 'S', 0.9),
      item('bed', [12.445, 10.045], 'W', 1.8, 2.0, { dark: true }),
      item('bench', [11.15, 10.045], 'W', 1.77, 0.5),
      item('nightstand', [13.2, 8.87], 'W', 0.45, 0.45), item('nightstand', [13.2, 11.22], 'W', 0.45, 0.45),
      item('dresser', [13.65, 10.07], 'W', 3.7, 0.4, { h: 1.0 }),
      item('plant', [10.5, 11.5], 'S', 0.36, undefined, { h: 1.25 }),
    ],
  },
  // dog-leg: 12 risers up along the living-room wall to a landing by the garden wall, 4 more back to the attic
  stairs: {
    flights: [
      { from: [8.07, 4.41], dir: 'N', width: 0.98, treads: 11, going: GOING, rise: RISE, startLevel: 0, solid: 5 },
      { from: [9.085, 1.42], dir: 'S', width: 0.97, treads: 3, going: GOING, rise: RISE, startLevel: LANDING },
    ],
    landings: [{ x0: 7.58, x1: 9.57, y0: 0.45, y1: 1.42, level: LANDING }],
  },
};

export const argania2: HouseDef = {
  id: 'argania2',
  name: 'Dom w Arganiach 2',
  code: 'G2E',
  designer: 'ARCHON+',
  width: W,
  depth: DW,
  usableArea: 204.08,
  footprintArea: 150.82,
  heightTotal: Math.round((RIDGE_TOP + PLINTH) * 100) / 100, // ground to the ridge (catalogue: 8.30 with the ground at −0.32)
  pitchDeg: PITCH_DEG,

  plinth: PLINTH,
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
        { x: 4.8, y: 5.94, w: 0.6, d: 0.86, top: 8.05 }, // fireplace flue (attic plan: the pier between room 8 and bathroom 7)
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
    // kitchen window 250/140, entrance door 140/210 (door + side light) next to the garage wing
    { wall: 'front', at: 2.48, width: 2.5, height: 1.4, sill: HEAD - 1.4, kind: 'window', panes: 2, ref: '250/140' },
    { wall: 'front', at: 6.57, width: 1.4, height: 2.1, sill: 0, kind: 'entrance', ref: '140/210' },
  ],

  /** ground-floor partitions for the plan view: the real walls (see `interior`) */
  partitions: groundPartitions(interior.ground.walls),
  // outlines: inside the walls of `interior` (the tiled / concrete floors are the `floors` rects);
  // where rooms are open to each other (kitchen, living room, hall) the line runs on from the walls
  rooms: [
    { name: '1. Wiatrołap', area: 4.07, at: [6.6, 7.4], outline: rect(5.89, 5.98, 7.69, 8.25) },
    { name: '2. Spiżarnia', area: 1.99, at: [5.12, 7.6], outline: rect(4.61, 6.45, 5.77, 8.25) },
    { name: '3. Kuchnia', area: 10.02, at: [2.4, 7.3], outline: rect(0.45, 5.76, 4.49, 8.25) },
    {
      name: '4. Salon + jadalnia', area: 36.61, at: [3.4, 2.8],
      // with the passage past the pantry to the vestibule
      outline: [[0.45, 0.45], [7.44, 0.45], [7.44, 5.7], [5.83, 5.7], [5.83, 6.45], [4.61, 6.45], [4.61, 5.76], [0.45, 5.76]],
    },
    { name: '5. Garderoba', area: 1.8, at: [8.3, 1.2], outline: rect(7.58, 0.45, 9.57, 1.42) },
    // the stairs (7.58–8.55 × 1.42–4.41 and the top flight) are not a room
    { name: '6. Hol', area: 4.74, at: [8.9, 4.6], outline: [[8.56, 2.41], [9.57, 2.41], [9.57, 5.7], [7.58, 5.7], [7.58, 4.41], [8.56, 4.41]] },
    { name: '7. Pokój', area: 11.94, at: [11.9, 1.8], outline: rect(9.83, 0.45, 13.85, 3.44) },
    { name: '8. Łazienka', area: 2.8, at: [10.3, 4.8], outline: rect(9.71, 3.58, 11.05, 5.7) },
    { name: '9. Kotłownia', area: 5.58, at: [12.6, 4.8], outline: rect(11.23, 3.58, 13.85, 5.7) },
    { name: '10. Garaż', area: 35.2, at: [10.8, 9.3], outline: rect(7.85, 5.98, 13.85, DW - 0.45) },
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
      [[5.34, 0.45], [7.44, 0.45], [7.44, 4.13], [5.34, 4.13]], // double-height living room (antresola)
      [[7.58, 0.45], [9.57, 0.45], [9.57, 1.42 + 3 * GOING], [8.55, 1.42 + 3 * GOING], [8.55, 4.13], [7.58, 4.13]], // stairwell
    ],
  },
  interior,
  roofWindows: [
    { at: [9.1, 1.3], width: 0.78, length: 1.4 }, // stairs, garden slope
    { at: [6.2, 7.5], width: 0.78, length: 1.4 }, // bathroom, front slope
    { at: [8.4, 10.2], width: 0.78, length: 1.4 }, // master bedroom, garage-wing west slope
  ],

  paving: [
    // terrace under and beside the pergola
    { x0: -0.2, x1: 9.6, y0: -3.85, y1: 0, top: -0.02 },
    { x0: 9.6, x1: W, y0: -3.0, y1: 0, top: -0.02 },
    // covered entrance, level with the forecourt (the catalogue has one step down, to −0.32)
    { x0: 4.9, x1: XW, y0: D, y1: DW, top: -0.02 },
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
  // the two terrace slabs above as one outline (the pergola part 3.85 m deep, the rest 3.00 m)
  terrace: [[-0.2, -3.85], [9.6, -3.85], [9.6, -3.0], [W, -3.0], [W, 0], [-0.2, 0]],
  /** (W, D) is a straight-through vertex; (XW, D) the inner corner by the entrance */
  unmeasuredCorners: [2, 5],
  twoEdgeCorners: [3, 4],

  lights: [[3.5, 3.5], [12.0, 2.0], [10.8, 9.5]],
  wallLamps: [[5.55, D + 0.03], [XW - 0.03, 11.2], [4.2, -0.03]],
  views: {
    valley: { at: 'valleyWindow', h: 1.6, look: 'valley', label: 'Na dolinę' },
    terrace: { at: [4.2, -1.6], h: 1.6, look: [0, -1], label: 'Z tarasu' },
    living: { at: [3.3, 2.9], h: 1.6, look: [-1, 0], label: 'Z salonu' },
    kitchen: { at: [2.48, 7.2], h: 1.6, look: [0, 1], label: 'Z kuchni' },
    bedroom: { at: [10.82, 10.6], h: ATTIC + 1.6, look: [0, 1], label: 'Z sypialni (poddasze)' },
  },
};
