/**
 * The designed garden of plot 664/2, laid out around the compromise variant of Dom w Arganiach and
 * the shed in the east corner. It follows what modern Polish garden visualisations keep returning
 * to: beds of ornamental grass and lavender flanking the paving, ball-headed trees along a drive,
 * white hydrangeas in front of a clipped hedge, a gravel bed with boulders on a bank, a fire-pit
 * circle, and raised vegetable beds. None of it is on the PZT.
 *
 * Positions are written in the house's plan coordinates as the compromise variant stands
 * (`gardenPoint`: X along the back wall towards the north-west neighbour, Y towards the gate; the
 * house is X 0–14.3, Y 0–8.7 with the garage wing to Y 12.4), or along a plot edge (`onEdge`).
 */
import type { GardenArea, GardenKind, Tree, TreeKind } from '../store';
import type { P2 } from '../placement/geom2d';
import { FRONT, gardenPoint, MID_DRIVE, midDriveLeft, midFenceLine, onEdge } from './sitePlan';

const areas: GardenArea[] = [];
const plants: Tree[] = [];
let seq = 0;

/** 'g' for the garden every project shares, FRONT for the entrance designed around the compromise variant */
let group = 'g';
const area = (id: string, kind: GardenKind, points: P2[]) => areas.push({ id: `${group}-${id}`, kind, points });
/** a polygon given in the house's plan coordinates */
const G = (pts: P2[]) => pts.map(gardenPoint);
const plant = (kind: TreeKind, at: P2, height: number) => {
  const i = seq++;
  // a little variety in size, the same on every visit
  const h = height * (0.9 + 0.2 * (((i * 37) % 11) / 10));
  plants.push({ id: `${group}-${kind}-${i}`, kind, x: at[0], z: at[1], height: Math.round(h * 100) / 100 });
};
const P = (kind: TreeKind, X: number, Y: number, height: number) => plant(kind, gardenPoint([X, Y]), height);
/** plants along a plot edge: every `step` metres from `from` to `to`, `off` metres inside the boundary */
const alongEdge = (kind: TreeKind, e: number, from: number, to: number, step: number, off: number, height: number) => {
  for (let s = from; s <= to + 1e-6; s += step) plant(kind, onEdge(e, s, off), height);
};
/** a strip along a plot edge */
const strip = (e: number, from: number, to: number, off0: number, off1: number): P2[] => [onEdge(e, from, off0), onEdge(e, to, off0), onEdge(e, to, off1), onEdge(e, from, off1)];

const H = { grass: 1.25, lavender: 0.45, hydrangea: 1.1, boxwood: 0.7, globe: 3.4, maple: 2.6, rock: 0.5, perennial: 0.55, fescue: 0.35, pot: 1.0, bollard: 0.6 };

// ---------------------------------------------------------------------------------------------
// Along the drive to the shed
// ---------------------------------------------------------------------------------------------
// between the north-east fence and the drive: grasses with lavender between them
area('bed-fence', 'flowerbed', strip(0, 11.4, 29.75, 0.4, 1.4));
alongEdge('grass', 0, 12.2, 29.0, 1.82, 0.9, H.grass);
alongEdge('lavender', 0, 13.11, 28.6, 1.82, 0.9, H.lavender);
// its garden side: an avenue of ball-headed trees over a band of lavender
area('bed-avenue', 'flowerbed', strip(0, 12.4, 25.6, 5.0, 6.1));
alongEdge('globe', 0, 13.4, 25.4, 4.0, 5.55, H.globe);
for (let d = 14.0; d <= 24.9; d += 0.7) if (Math.abs(((d - 13.4 + 2) % 4) - 2) > 0.55) plant('lavender', onEdge(0, d, 5.55), H.lavender); // not under the stems

// ---------------------------------------------------------------------------------------------
// The entrance, redrawn around the compromise variant (shown with that project only).
// The cobbles are kept to the drive in front of the garage. People get their own way in: the
// wicket stands right beside the sliding gate, and from it a path of light slabs, edged with
// pebbles, runs straight to a small paved court at the foot of the front steps. On the way it
// crosses the drive to the shed, whose cobbles run through. Ornamental grasses and
// lanterns stand on both sides, and a low seat wall keeps the cars off it. Left of the path a bed
// with a feature tree runs up to the kitchen window; right of the drive, where the PZT had paving
// up to the neighbour's fence, is a pebble garden.
// ---------------------------------------------------------------------------------------------
group = FRONT;
/** the path, in plan coordinates: 1.4 m wide, from the court (Y 14.3, in line with the steps) to the wicket at the fence */
export const WALK = { y0: 14.3, at0: [5.45, 6.85] as [number, number], atFence: [7.05, 8.45] as [number, number] };
const walkEnd = midFenceLine((WALK.atFence[0] + WALK.atFence[1]) / 2);
/** X of the path's left / right edge at plan Y */
const walkL = (Y: number) => WALK.at0[0] + ((WALK.atFence[0] - WALK.at0[0]) * (Y - WALK.y0)) / (walkEnd - WALK.y0);
const walkR = (Y: number) => WALK.at0[1] + ((WALK.atFence[1] - WALK.at0[1]) * (Y - WALK.y0)) / (walkEnd - WALK.y0);
const PEBBLE = 0.3; // pebble band on both sides of the path
// paved in light slabs: the path along the kitchen with the landing beside the porch, the court, the walk
area('path-kitchen', 'path', G([[-0.85, 8.72], [4.9, 8.72], [4.9, 12.3], [3.04, 12.3], [3.04, 9.9], [-0.85, 9.9]]));
area('court', 'path', G([[4.9, 13.0], [midDriveLeft(13.0), 13.0], [midDriveLeft(WALK.y0), WALK.y0], [4.9, WALK.y0]]));
area('walk-pebbles', 'gravel', G([[WALK.at0[0] - PEBBLE, WALK.y0], [WALK.at0[1] + PEBBLE, WALK.y0], [WALK.atFence[1] + PEBBLE, midFenceLine(WALK.atFence[1])], [WALK.atFence[0] - PEBBLE, midFenceLine(WALK.atFence[0])]]));
// the path is laid in two pieces: it stops at the drive to the shed and goes on beyond it, so the
// drive's cobbles run through unbroken (the family's choice). `meet` = plan Y where an edge of the
// path reaches the drive's edge `off` metres inside the boundary.
const FENCE_COS = 1 / Math.hypot(1, 0.0742); // the fence runs 4° off the house's X axis
const meet = (edge: (Y: number) => number, off: number) => {
  let Y = 18;
  for (let i = 0; i < 8; i++) Y = midFenceLine(edge(Y)) + (0.3 - off) / FENCE_COS;
  return Y;
};
const [nearL, nearR, farL, farR] = [meet(walkL, 4.93), meet(walkR, 4.93), meet(walkL, 1.47), meet(walkR, 1.47)];
area('walk', 'path', G([[WALK.at0[0], WALK.y0 - 0.02], [WALK.at0[1], WALK.y0 - 0.02], [walkR(nearR), nearR], [walkL(nearL), nearL]]));
area('walk-gate', 'path', G([[walkL(farL), farL], [walkR(farR), farR], [WALK.atFence[1], midFenceLine(WALK.atFence[1])], [WALK.atFence[0], midFenceLine(WALK.atFence[0])]]));
// between the path and the drive: a planted wedge with a seat wall on the edge of the drive
const CROSS = 17.55; // from here to the fence the drive to the shed crosses
area('bed-wall', 'flowerbed', G([[walkR(14.35) + PEBBLE, 14.35], [midDriveLeft(14.35) - 0.02, 14.35], [midDriveLeft(CROSS) - 0.02, CROSS], [walkR(CROSS) + PEBBLE, CROSS]]));
area('seat-wall', 'wall', G([[midDriveLeft(14.5) - 0.38, 14.5], [midDriveLeft(14.5) - 0.01, 14.5], [midDriveLeft(17.4) - 0.01, 17.4], [midDriveLeft(17.4) - 0.38, 17.4]]));
// the bed left of the path, up to the kitchen path; a small one at the porch and one by the wicket
area('bed-entrance', 'flowerbed', G([[-1, 9.95], [3.0, 9.95], [3.0, 12.45], [4.85, 12.45], [4.85, 14.35], [walkL(14.35) - PEBBLE, 14.35], [walkL(CROSS) - PEBBLE, CROSS], [1.9, CROSS], [1.9, 11.5], [-1, 11.5]]));
area('bed-porch', 'flowerbed', G([[7.42, 12.45], [MID_DRIVE.left - 0.05, 12.45], [MID_DRIVE.left - 0.05, 12.98], [7.42, 12.98]]));
area('bed-wicket', 'flowerbed', strip(0, 29.75, 30.95, 0.4, 1.4));
// planters at the foot of the steps
P('pot', 4.55, 12.75, H.pot); P('pot', 7.72, 12.72, H.pot);
// lanterns and grasses on both sides of the path
for (const Y of [14.75, 16.7]) { P('bollard', walkL(Y) - PEBBLE - 0.12, Y, H.bollard); P('bollard', walkR(Y) + PEBBLE + 0.1, Y, H.bollard); }
P('bollard', walkL(21.7) - PEBBLE - 0.12, 21.7, H.bollard);
for (const Y of [15.4, 16.05, 17.3]) P('grass', walkL(Y) - PEBBLE - 0.38, Y, H.grass);
for (const Y of [15.45, 16.1]) P('grass', (walkR(Y) + PEBBLE + midDriveLeft(Y) - 0.4) / 2, Y, H.grass * 0.9);
P('fescue', walkR(17.25) + PEBBLE + 0.12, 17.25, H.fescue);
plant('grass', onEdge(0, 30.35, 0.9), H.grass * 0.9);
// the entrance bed: a feature tree over blue fescue, box balls, hydrangeas, pink coneflowers, boulders
P('maple', 0.3, 10.75, H.maple);
for (let X = -0.7; X <= 1.75; X += 0.55) if (Math.abs(X - 0.3) > 0.5) P('lavender', X, 10.3, H.lavender);
P('hydrangea', 2.35, 10.9, H.hydrangea); P('hydrangea', 3.45, 13.0, H.hydrangea);
P('deciduous', 3.5, 15.9, 4.6);
for (const [X, Y] of [[2.85, 15.45], [4.15, 15.5], [3.5, 16.75], [2.95, 16.4], [4.05, 16.45]]) P('fescue', X, Y, H.fescue);
for (const [X, Y] of [[4.3, 13.75], [2.55, 13.3], [2.4, 14.7], [4.6, 17.0], [2.45, 17.05]]) P('boxwood', X, Y, H.boxwood);
for (const [X, Y] of [[4.1, 14.6], [3.2, 14.2], [2.3, 15.9], [3.6, 17.25]]) P('perennial', X, Y, H.perennial);
P('rock', 3.9, 13.35, 0.5); P('rock', 2.35, 16.45, 0.45);
// right of the drive: a pebble garden, with a row of box balls along the paving, pines, a tree,
// drifts of grass and coneflowers, and hydrangeas in front of the neighbour's hedge
const DRIVE_R = MID_DRIVE.right;
area('garden', 'gravel', G([[DRIVE_R + 0.05, 12.45], [20.85, 12.45], [19.7, 21.3], [DRIVE_R + 0.05, midFenceLine(DRIVE_R + 0.05) - 0.02]]));
for (let Y = 13.2; Y <= 20.8; Y += 1.5) P('boxwood', DRIVE_R + 0.55, Y, H.boxwood);
for (let i = 0; i < 5; i++) P('hydrangea', 20.1 - i * 0.25, 13.3 + i * 1.85, H.hydrangea);
P('conifer', 18.6, 13.7, 3.2); P('conifer', 16.9, 20.2, 2.4);
P('deciduous', 17.6, 16.7, 5);
for (const [X, Y] of [[17.0, 13.6], [18.0, 15.0], [16.7, 15.4], [18.9, 16.3], [16.9, 18.4], [18.4, 18.6], [17.8, 20.0]]) P('grass', X, Y, H.grass);
for (const [X, Y] of [[16.6, 14.4], [16.5, 17.0], [18.3, 17.5], [17.4, 19.2]]) P('perennial', X, Y, H.perennial);
for (const [X, Y] of [[17.1, 16.0], [18.2, 16.3], [17.2, 17.5], [16.4, 16.2]]) P('fescue', X, Y, H.fescue);
for (const X of [16.2, 16.8, 17.4]) P('lavender', X, 21.05, H.lavender);
P('rock', 17.3, 14.6, 0.7); P('rock', 18.7, 19.6, 0.55); P('rock', 16.3, 19.3, 0.4); P('rock', 19.3, 14.5, 0.5);
group = 'g';

// ---------------------------------------------------------------------------------------------
// Terrace and the garden behind the house
// ---------------------------------------------------------------------------------------------
// beds at both ends of the terrace
area('bed-terrace-east', 'flowerbed', G([[-1.6, -1.4], [-0.25, -1.4], [-0.25, 0.3], [-1.6, 0.3]]));
P('grass', -0.95, -0.95, H.grass); P('lavender', -0.7, -0.3, H.lavender); P('boxwood', -1.2, 0.0, H.boxwood);
area('bed-terrace-west', 'flowerbed', G([[14.35, -3.0], [15.5, -3.0], [15.5, 0.3], [14.35, 0.3]]));
for (let Y = -2.6, i = 0; Y <= 0; Y += 0.85, i++) P(i % 2 ? 'grass' : 'hydrangea', 14.92, Y, i % 2 ? H.grass : H.hydrangea * 0.9);
// the bank where the levelled lawn behind the terrace meets the rising ground: a rock garden
area('rockery', 'gravel', G([[-1, -7.4], [15.3, -7.4], [15.3, -5.7], [-1, -5.7]]));
for (let X = -0.3, i = 0; X <= 14.9; X += 1.27, i++) {
  const Y = -6.55 + (i % 3 ? (i % 2 ? 0.45 : -0.4) : 0);
  P(i % 4 === 0 ? 'rock' : i % 4 === 1 ? 'lavender' : i % 4 === 2 ? 'grass' : 'boxwood', X, Y, i % 4 === 0 ? 0.55 : i % 4 === 1 ? H.lavender : i % 4 === 2 ? H.grass * 0.8 : H.boxwood * 0.8);
}
P('rock', 3.2, -6.2, 0.4); P('rock', 9.4, -6.9, 0.7); P('conifer', 12.6, -6.3, 1.7); P('conifer', 1.4, -6.9, 1.4);
// in front of the hedge along the road: white hydrangeas with grasses between them
area('bed-road-1', 'flowerbed', strip(2, 1.6, 22.4, 1.3, 2.6));
alongEdge('hydrangea', 2, 2.6, 21.6, 2.7, 1.95, H.hydrangea);
alongEdge('grass', 2, 3.95, 20.4, 2.7, 1.95, H.grass);
area('bed-road-2', 'flowerbed', strip(3, 1.2, 19.6, 1.3, 2.6));
alongEdge('hydrangea', 3, 2.0, 18.8, 2.7, 1.95, H.hydrangea);
alongEdge('grass', 3, 3.35, 17.6, 2.7, 1.95, H.grass);
// a group of birches in the west corner, a red maple by the terrace
P('birch', 21.4, -11.0, 8.5); P('birch', 19.9, -11.9, 7.5); P('birch', 21.9, -9.2, 9);
P('maple', -3.2, -5.0, H.maple * 1.15);

// ---------------------------------------------------------------------------------------------
// The service side (north-west): hydrangeas in front of the hedge
// ---------------------------------------------------------------------------------------------
area('bed-neighbour', 'flowerbed', strip(1, 10.6, 32.6, 1.3, 2.5));
alongEdge('hydrangea', 1, 11.4, 31.8, 2.55, 1.9, H.hydrangea);
alongEdge('grass', 1, 12.67, 30.6, 2.55, 1.9, H.grass * 0.9);

// ---------------------------------------------------------------------------------------------
// The big garden on the south-east side: lawn, a path to the fire pit and the wiata, vegetables, fruit
// ---------------------------------------------------------------------------------------------
/** a straight path `w` wide from a to b (house plan coordinates) */
const pathBetween = (a: P2, b: P2, w: number): P2[] => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n: P2 = [(-(b[1] - a[1]) / L) * (w / 2), ((b[0] - a[0]) / L) * (w / 2)];
  return G([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]);
};
export const FIRE_PIT: P2 = [-8.5, 7.0];
const FIRE_R = 2.3;
area('fire-circle', 'gravel', G(Array.from({ length: 20 }, (_, i): P2 => [FIRE_PIT[0] + Math.cos((i / 20) * Math.PI * 2) * FIRE_R, FIRE_PIT[1] + Math.sin((i / 20) * Math.PI * 2) * FIRE_R])));
P('firepit', FIRE_PIT[0], FIRE_PIT[1], 0.35);
for (let i = 0; i < 5; i++) {
  const a = 0.5 + (i / 5) * Math.PI * 2;
  P('rock', FIRE_PIT[0] + Math.cos(a) * 1.55, FIRE_PIT[1] + Math.sin(a) * 1.55, 0.5); // sitting stones
}
area('path-terrace', 'path', pathBetween([-0.45, -2.75], [-6.95, 5.35], 1.2)); // from the end of the terrace
area('path-wiata', 'path', pathBetween([-10.0, 8.75], [-12.2, 11.2], 1.2));
// paving in front of the open side of the wiata (the summer kitchen)
area('patio-wiata', 'patio', G([[-13.95, 10.75], [-11.3, 10.75], [-11.3, 16.2], [-14.25, 16.2]]));
P('hydrangea', -10.6, 16.0, H.hydrangea); P('hydrangea', -10.4, 14.7, H.hydrangea * 0.9); P('grass', -10.7, 13.4, H.grass);
// a shade tree for the fire pit, a tree on the front lawn
P('deciduous', -12.2, 3.2, 7); P('deciduous', -6.0, 13.6, 5.5);
// raised vegetable beds on gravel, in full sun by the south-east hedge
area('veg-pad', 'gravel', G([[-19.9, 0.2], [-15.4, 0.2], [-15.4, 8.6], [-19.9, 8.6]]));
[[-19.5, 0.8], [-17.3, 0.8], [-19.5, 4.9], [-17.3, 4.9]].forEach(([X, Y], i) => area(`veg-${i + 1}`, 'vegbed', G([[X, Y], [X + 1.2, Y], [X + 1.2, Y + 3.3], [X, Y + 3.3]])));
// three fruit trees towards the road, a pine and grasses in the south corner
P('deciduous', -8.6, -3.4, 4.2); P('deciduous', -12.8, -2.3, 4.4); P('deciduous', -16.6, -1.0, 4);
P('conifer', -17.0, -3.9, 4.5); P('grass', -15.4, -3.5, H.grass); P('grass', -18.4, -2.6, H.grass); P('rock', -16.0, -4.3, 0.6);

/** garden areas (beds, paths, patio, gravel, raised vegetable beds) of the designed garden */
export const GARDEN_AREAS: GardenArea[] = areas;
/** its trees, shrubs, perennials and objects (boulders, the fire bowl); the thuja hedges are THUJA_HEDGE */
export const GARDEN_PLANTS: Tree[] = plants;
