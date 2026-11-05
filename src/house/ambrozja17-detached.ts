/**
 * Ambrozja 17 with a detached garage: the same house, but the garage wing (garage + carport) is
 * removed and the garage stands on its own as an annex that can be placed independently.
 *
 * House: the bedroom wing now ends at the living wing's front line (Y = 15.65), so the front is one
 * straight wall. Its gable overhangs 1.00 m at the front (instead of 0.50), which brings its verge
 * level with the living wing's eave and covers the entrance. The carport is dropped.
 *
 * Garage: the original room 1/17 (5.55 × 7.00 m inside, 38.9 m²) with 45 cm walls, the Hörmann
 * 450×225 door in the front gable and its own 30° gable roof. ±0.00 of the garage is its floor
 * (0.27 below the house floor in the drawings, so the eave line matches the house's when both
 * stand on the same ground). The side door is an assumption: in the drawings the garage was
 * entered from the house.
 */
import { ambrozja17, AMB } from './ambrozja17';
import type { HouseDef } from './types';

const { T, MAIN_X0: x0, MAIN_X1: x1, LIV_Y0: L0, LIV_Y1: L1, EAVE_O: o, GABLE_O: g, SOFFIT, TOP_AT_WALL, RIDGE_TOP } = AMB;
const YF = L1; // new front wall of the bedroom wing

// ---------------- garage ----------------
const GW = 6.45; // 5.55 + 2 × 0.45
const GD = 7.9; // 7.00 + 2 × 0.45
const G_DROP = 0.27; // garage floor below the house floor in the drawings
const G_TOP_AT_WALL = TOP_AT_WALL + G_DROP;
const G_SOFFIT = SOFFIT + G_DROP;

export const detachedGarage: HouseDef = {
  id: 'ambrozja17-garage',
  name: 'Garaż (Ambrozja 17)',
  code: 'BSA2409',
  designer: 'Domy w Stylu (wydzielony z projektu)',
  width: GW,
  depth: GD,
  usableArea: 38.85,
  footprintArea: Math.round(GW * GD * 100) / 100,
  heightTotal: Math.round((0.62 - G_DROP + G_TOP_AT_WALL + (GW / 2) * T) * 100) / 100,
  pitchDeg: AMB.PITCH_DEG,
  plinth: 0.62 - G_DROP,
  wallThickness: 0.45,
  innerWallThickness: 0.12,
  ceilingHeight: 2.62 + G_DROP,
  wallTop: 2.76 + G_DROP,
  roof: (() => {
    const edgeTop = G_TOP_AT_WALL - o * T;
    return {
      pitchDeg: AMB.PITCH_DEG,
      thickness: 0.3,
      ridgeTop: G_TOP_AT_WALL + (GW / 2) * T,
      topAtWall: G_TOP_AT_WALL,
      eaveOverhang: o,
      soffit: G_SOFFIT,
      volumes: [{ kind: 'gable', ridge: 'y', x0: -o, x1: GW + o, y0: -g, y1: GD + g, edgeTop }],
      outline: [[-o, -g], [GW + o, -g], [GW + o, GD + g], [-o, GD + g]],
      chimneys: [],
      soffits: [
        [[GW, -g], [GW + o, -g], [GW + o, GD + g], [GW, GD + g]],
        [[-o, -g], [0, -g], [0, GD + g], [-o, GD + g]],
      ],
      fasciae: [
        [[GW + o, -g], [GW + o, GD + g]],
        [[-o, -g], [-o, GD + g]],
      ],
      caps: [
        { at: [GW, -g], out: [1, 0] },
        { at: [GW, GD + g], out: [1, 0] },
        { at: [0, -g], out: [-1, 0] },
        { at: [0, GD + g], out: [-1, 0] },
      ],
      gutters: [
        [[GW + o + 0.08, -g], [GW + o + 0.08, GD + g]],
        [[-o - 0.08, -g], [-o - 0.08, GD + g]],
      ],
      pipes: [
        { wall: [GW + 0.08, 0.4], gutter: [GW + o + 0.08, 0.4] },
        { wall: [-0.08, GD - 0.4], gutter: [-o - 0.08, GD - 0.4] },
      ],
      gables: [
        { a: [0, 0], b: [GW, 0], base: G_SOFFIT - 0.02 },
        { a: [GW, GD], b: [0, GD], base: G_SOFFIT - 0.02 },
      ],
    };
  })(),
  outline: [[0, 0], [GW, 0], [GW, GD], [0, GD]],
  walls: [
    { id: 'gBack', label: 'Garaż · szczyt tylny', a: [0, 0], b: [GW, 0] },
    { id: 'gRight', label: 'Garaż · bok', a: [GW, 0], b: [GW, GD] },
    { id: 'gFront', label: 'Garaż · brama', a: [GW, GD], b: [0, GD] },
    { id: 'gLeft', label: 'Garaż · bok z drzwiami', a: [0, GD], b: [0, 0] },
  ],
  openings: [
    // Hörmann 450×225, off-centre as in the original garage gable (13.525 − 10.40)
    { wall: 'gFront', at: 3.125, width: 4.5, height: 2.25, sill: 0, kind: 'garage', ref: 'DG' },
    // assumed service door
    { wall: 'gLeft', at: 1.6, width: 0.9, height: 2.07, sill: 0, kind: 'door', ref: 'drzwi boczne (założenie)' },
  ],
  partitions: [],
  rooms: [{ name: 'Garaż', area: 38.85, at: [GW / 2, GD / 2] }],
  paving: [],
  porches: [],
  terraceCorners: [],
  unmeasuredCorners: [],
  twoEdgeCorners: [],
  lights: [],
  wallLamps: [[-0.03, 2.4]],
  // never shown (the eye-level views are the house's); kept for the shared type
  views: ambrozja17.views,
};

// ---------------- house ----------------
const front = YF + o; // front roof edge, level with the living wing's eave

export const ambrozja17Detached: HouseDef = {
  ...ambrozja17,
  id: 'ambrozja17-detached',
  name: 'Ambrozja 17 (garaż wolnostojący)',
  code: 'BSA2409',
  designer: 'Domy w Stylu (wariant z wydzielonym garażem)',
  depth: YF,
  footprintArea: Math.round((x1 * YF - x0 * L0) * 100) / 100,
  // the boiler room and laundry gain the 0.65 m strip up to the new front wall
  usableArea: 171.3,
  roof: (() => {
    const edgeTop = TOP_AT_WALL - o * T;
    return {
      ...ambrozja17.roof,
      ridgeTop: RIDGE_TOP,
      volumes: [
        { kind: 'gable', ridge: 'y', x0: x0 - o, x1: x1 + o, y0: -g, y1: front, edgeTop },
        { kind: 'gable', ridge: 'x', x0: -g, x1: AMB.RIDGE_X, y0: L0 - o, y1: L1 + o, edgeTop },
      ],
      outline: [[-g, L0 - o], [x0 - o, L0 - o], [x0 - o, -g], [x1 + o, -g], [x1 + o, front], [-g, front]],
      soffits: [
        [[x1, -g], [x1 + o, -g], [x1 + o, front], [x1, front]],
        [[x0, -g], [x0 - o, -g], [x0 - o, L0 - o], [x0, L0]],
        [[x0, L1], [x0 - o, front], [x0, front]],
        [[-g, L0 - o], [x0 - o, L0 - o], [x0, L0], [-g, L0]],
        [[-g, L1], [x0, L1], [x0 - o, L1 + o], [-g, L1 + o]],
      ],
      fasciae: [
        [[x1 + o, -g], [x1 + o, front]],
        [[x0 - o, -g], [x0 - o, L0 - o]],
        [[-g, L0 - o], [x0 - o, L0 - o]],
        [[-g, L1 + o], [x0 - o, L1 + o]],
      ],
      caps: [
        { at: [x1, -g], out: [1, 0] },
        { at: [x1, front], out: [1, 0] },
        { at: [x0, -g], out: [-1, 0] },
        { at: [x0, front], out: [-1, 0] },
        { at: [-g, L0], out: [0, -1] },
        { at: [-g, L1], out: [0, 1] },
      ],
      gutters: [
        [[x1 + o + 0.08, -g], [x1 + o + 0.08, front]],
        [[x0 - o - 0.08, -g], [x0 - o - 0.08, L0 - o]],
        [[-g, L0 - o - 0.08], [x0 - o, L0 - o - 0.08]],
        [[-g, L1 + o + 0.08], [x0 - o, L1 + o + 0.08]],
      ],
      pipes: [
        { wall: [x1 + 0.08, 0.4], gutter: [x1 + o + 0.08, 0.4] },
        { wall: [x1 + 0.08, YF - 0.4], gutter: [x1 + o + 0.08, YF - 0.4] },
        { wall: [x0 - 0.08, 0.4], gutter: [x0 - o - 0.08, 0.4] },
        { wall: [0.4, L0 - 0.08], gutter: [0.4, L0 - o - 0.08] },
        { wall: [0.4, L1 + 0.08], gutter: [0.4, L1 + o + 0.08] },
      ],
      gables: [
        { a: [x0, 0], b: [x1, 0], base: SOFFIT - 0.02 },
        { a: [x1, YF], b: [x0, YF], base: SOFFIT - 0.02 },
        { a: [0, L1], b: [0, L0], base: SOFFIT - 0.02 },
      ],
    };
  })(),
  outline: [[0, L0], [x0, L0], [x0, 0], [x1, 0], [x1, YF], [0, YF]],
  walls: [
    { id: 'livN', label: 'Salon → taras', a: [0, L0], b: [x0, L0] },
    { id: 'bedW', label: 'Sypialnia → taras', a: [x0, L0], b: [x0, 0] },
    { id: 'gableN', label: 'Szczyt tylny', a: [x0, 0], b: [x1, 0] },
    { id: 'east', label: 'Strona pokoi', a: [x1, 0], b: [x1, YF] },
    { id: 'front', label: 'Front (kuchnia, wejście)', a: [x1, YF], b: [0, YF] },
    { id: 'gableW', label: 'Szczyt salonu', a: [0, YF], b: [0, L0] },
  ],
  // same openings minus the garage door
  openings: ambrozja17.openings.filter((op) => op.kind !== 'garage'),
  partitions: ambrozja17.partitions
    .filter(([ax, ay, bx, by]) => !(ay === 15.0 && by === 15.0 && ax === AMB.GAR_X0)) // garage / boiler-room wall
    .map(([ax, ay, bx, by]) => [ax, ay, bx, by === 15.0 ? YF : by] as [number, number, number, number]),
  rooms: ambrozja17.rooms
    .filter((r) => !r.name.includes('Garaż'))
    .map((r) => (r.name.includes('Pralnia') ? { ...r, area: 5.5 } : r.name.includes('Kotłownia') ? { ...r, area: 9.8 } : r)),
  // terrace, entrance landing + steps and boiler-room steps; no carport paving
  paving: ambrozja17.paving.filter((sl) => sl.y1 <= 18.0 || sl.x0 >= x1),
  porches: [],
  wallLamps: [[9.25 + 0.9, YF + 0.03], [2.9, L0 - 0.03], [x0 - 0.03, 1.4]],
  annexes: [{ id: 'garage', label: 'Garaż', def: detachedGarage, defaultAt: [AMB.GAR_X0, YF + 3] }],
};
