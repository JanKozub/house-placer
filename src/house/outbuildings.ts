/**
 * Extra buildings that can be added to the plot next to any house project (shared by all
 * projects, like the garden). Each is a HouseDef placed, rotated and levelled on its own.
 */
import type { ExtraBox, HouseDef, HouseView } from './types';

export interface OutbuildingKind {
  kind: string;
  /** name in the UI */
  label: string;
  /** corner labels in the plan view: W1, W2… */
  letter: string;
  def: HouseDef;
}

// ---------------------------------------------------------------------------------------------
// Wiata + magazyn + garaż: the user's own drawings (plan + section A-A), 12.11 × 7.10 m.
//
// Plan coordinates: the drawing rotated 180°, so the front (+Y) is the drawing's north side with
// the garage door, and "front bearing" is where the garage door faces. X runs east → west of the
// drawing: garage 0–4.10, storage 4.10–7.61, open wiata 7.61–12.11. Y = 0 is the full south wall.
//
// From the drawings: 24 cm walls, inside depth 6.62, garage 3.62 and storage 3.27 wide inside,
// garage door 3.00, doors 90, three 14×14 wooden posts along the wiata front, movable wooden
// shutters on its west side, brick smoker + bread oven in its south-west corner with a chimney
// 0.50 above the ridge, walls +2.80, 30° roof, ridge +5.40, floor level with the ground.
// The section's 2.80 walls, 30° and +5.40 only fit with the roof starting higher than the walls:
// the roof surface at the wall face is +3.35 and the eave box closes the gap (user's choice).
// Assumed: east window 190/80 at +1.40, eave overhang 0.50, gable overhang 0.30, beam and
// shutter heights, oven size and the chimney position.
// ---------------------------------------------------------------------------------------------

const W = 12.11, D = 7.1, t = 0.24;
const XG = 4.1; // garage | storage (partition centre 3.98)
const XS = 7.61; // storage | wiata (wall 7.37–7.61)
const PITCH = 30;
const T = Math.tan((PITCH * Math.PI) / 180);
const RIDGE = 5.4;
const TOP_AT_WALL = RIDGE - (D / 2) * T;
const O = 0.5, G = 0.3, SOFFIT = 2.8;

const NO_VIEWS: Record<'valley' | 'terrace' | 'living' | 'kitchen' | 'bedroom', HouseView> = {
  valley: { at: [W / 2, D / 2], h: 1.6, look: [0, 1], label: '' },
  terrace: { at: [W / 2, D / 2], h: 1.6, look: [0, 1], label: '' },
  living: { at: [W / 2, D / 2], h: 1.6, look: [0, 1], label: '' },
  kitchen: { at: [W / 2, D / 2], h: 1.6, look: [0, 1], label: '' },
  bedroom: { at: [W / 2, D / 2], h: 1.6, look: [0, 1], label: '' },
};

const wiataExtras: ExtraBox[] = (() => {
  const out: ExtraBox[] = [];
  // wall between the wiata and the storage room, with its 90 door (drawing: 1.28–2.18 from the north)
  const d0 = D - 2.18, d1 = D - 1.28;
  out.push({ x0: XS - t, x1: XS, y0: t, y1: d0, h0: 0, h1: 2.8, part: 'plaster' });
  out.push({ x0: XS - t, x1: XS, y0: d1, y1: D - t, h0: 0, h1: 2.8, part: 'plaster' });
  out.push({ x0: XS - t, x1: XS, y0: d0, y1: d1, h0: 2.07, h1: 2.8, part: 'plaster' });
  out.push({ x0: XS - 0.08, x1: XS - 0.04, y0: d0 + 0.02, y1: d1 - 0.02, h0: 0, h1: 2.05, part: 'wood' });
  // three 14×14 posts along the open front and the beams on top of the open sides
  for (const x of [7.91, 9.86, 11.97]) out.push({ x0: x - 0.07, x1: x + 0.07, y0: D - 0.14, y1: D, h0: 0, h1: 2.66, part: 'wood' });
  out.push({ x0: XS, x1: W, y0: D - 0.14, y1: D, h0: 2.66, h1: 2.8, part: 'wood' });
  out.push({ x0: W - 0.14, x1: W, y0: t, y1: D, h0: 2.66, h1: 2.8, part: 'wood' });
  // movable wooden shutters along the west side (louvres), from the oven to the front post
  for (let h = 0.15; h < 2.55; h += 0.16) out.push({ x0: W - 0.1, x1: W - 0.04, y0: 1.45, y1: D - 0.16, h0: h, h1: h + 0.09, part: 'wood' });
  // brick smoker + bread oven in the south-west corner, chimney above it
  out.push({ x0: 10.1, x1: W - 0.04, y0: t, y1: 1.44, h0: 0, h1: 1.9, part: 'plinth' });
  out.push({ x0: 10.5, x1: 11.6, y0: t, y1: 1.2, h0: 1.9, h1: 2.62, part: 'plinth' });
  return out;
})();

export const wiataGaraz: HouseDef = {
  id: 'wiata-garaz',
  name: 'Wiata + magazyn + garaż',
  code: 'projekt własny',
  designer: 'rysunki własne',
  width: W,
  depth: D,
  usableArea: 45.6, // storage ~21.6 + garage ~24.0 (wiata ~32.0 roofed, open)
  footprintArea: Math.round(W * D * 100) / 100,
  heightTotal: Math.round((RIDGE + 0.05) * 100) / 100,
  pitchDeg: PITCH,
  plinth: 0.05, // floor level with the ground (P.T. = P.P. ±0.00)
  wallThickness: t,
  innerWallThickness: t,
  ceilingHeight: 2.6,
  wallTop: 2.8,
  roof: (() => {
    const edgeTop = TOP_AT_WALL - O * T;
    return {
      pitchDeg: PITCH,
      thickness: 0.25,
      ridgeTop: RIDGE,
      topAtWall: TOP_AT_WALL,
      eaveOverhang: O,
      soffit: SOFFIT,
      volumes: [{ kind: 'gable', ridge: 'x', x0: -G, x1: W + G, y0: -O, y1: D + O, edgeTop }],
      outline: [[-G, -O], [W + G, -O], [W + G, D + O], [-G, D + O]],
      chimneys: [{ x: 11.05, y: 0.72, w: 0.6, d: 0.6, top: RIDGE + 0.5 }],
      soffits: [
        [[-G, -O], [W + G, -O], [W + G, 0], [-G, 0]],
        [[-G, D], [W + G, D], [W + G, D + O], [-G, D + O]],
      ],
      fasciae: [
        [[-G, -O], [W + G, -O]],
        [[-G, D + O], [W + G, D + O]],
      ],
      caps: [
        { at: [-G, 0], out: [0, -1] },
        { at: [W + G, 0], out: [0, -1] },
        { at: [-G, D], out: [0, 1] },
        { at: [W + G, D], out: [0, 1] },
      ],
      gutters: [
        [[-G, -O - 0.08], [W + G, -O - 0.08]],
        [[-G, D + O + 0.08], [W + G, D + O + 0.08]],
      ],
      pipes: [
        { wall: [0.3, -0.08], gutter: [0.3, -O - 0.08] },
        { wall: [0.3, D + 0.08], gutter: [0.3, D + O + 0.08] },
        { wall: [W - 0.1, D + 0.08], gutter: [W - 0.1, D + O + 0.08] },
      ],
      gables: [
        { a: [0, D], b: [0, 0], base: SOFFIT - 0.02 },
        { a: [W, 0], b: [W, D], base: SOFFIT - 0.02 },
      ],
    };
  })(),
  // (XS, D) is a straight-through vertex where the closed front ends and the open wiata begins
  outline: [[0, 0], [W, 0], [W, D], [XS, D], [0, D]],
  walls: [
    { id: 'south', label: 'Wiata/garaż · ściana pełna (płd.)', a: [0, 0], b: [W, 0] },
    { id: 'west', label: 'Wiata/garaż · wiata, żaluzje', a: [W, 0], b: [W, D], open: true },
    { id: 'frontOpen', label: 'Wiata/garaż · wiata, front', a: [W, D], b: [XS, D], open: true },
    { id: 'front', label: 'Wiata/garaż · brama i drzwi', a: [XS, D], b: [0, D] },
    { id: 'east', label: 'Wiata/garaż · ściana z oknem', a: [0, D], b: [0, 0] },
  ],
  openings: [
    // garage door 3.00 (drawing: x 8.54–11.32 incl. frame) and the 90 door into the storage room
    { wall: 'front', at: 2.17, width: 3.0, height: 2.25, sill: 0, kind: 'garage', ref: 'brama 3,00' },
    { wall: 'front', at: 5.79, width: 0.9, height: 2.05, sill: 0, kind: 'door', ref: 'drzwi 90' },
    // east window (assumed 190/80)
    { wall: 'east', at: 3.57, width: 1.9, height: 0.8, sill: 1.4, kind: 'window', panes: 2, ref: 'okno (wsch.)' },
  ],
  partitions: [[3.98, t, 3.98, D - t]],
  rooms: [
    { name: 'Garaż', area: 24.0, at: [2.05, 3.55] },
    { name: 'Magazyn', area: 21.6, at: [5.75, 3.55] },
    { name: 'Wiata / kuchnia letnia', area: 32.0, at: [9.86, 3.55] },
  ],
  ceilingOutline: [[0, 0], [XS, 0], [XS, D], [0, D]],
  paving: [{ x0: XS, x1: W, y0: t, y1: D, top: 0.01 }],
  porches: [],
  extras: wiataExtras,
  terraceCorners: [],
  unmeasuredCorners: [3],
  twoEdgeCorners: [],
  lights: [[9.9, 3.5]],
  wallLamps: [[XG + 0.3, D + 0.03]],
  views: NO_VIEWS,
};

export const OUTBUILDINGS: OutbuildingKind[] = [{ kind: 'wiata-garaz', label: 'Wiata + garaż', letter: 'W', def: wiataGaraz }];

export const outbuildingKind = (kind: string) => OUTBUILDINGS.find((k) => k.kind === kind) ?? null;
