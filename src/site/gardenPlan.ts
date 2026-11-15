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
import { gardenPoint, onEdge } from './sitePlan';

const areas: GardenArea[] = [];
const plants: Tree[] = [];
let seq = 0;

const area = (id: string, kind: GardenKind, points: P2[]) => areas.push({ id: `g-${id}`, kind, points });
/** a polygon given in the house's plan coordinates */
const G = (pts: P2[]) => pts.map(gardenPoint);
const plant = (kind: TreeKind, at: P2, height: number) => {
  const i = seq++;
  // a little variety in size, the same on every visit
  const h = height * (0.9 + 0.2 * (((i * 37) % 11) / 10));
  plants.push({ id: `g-${kind}-${i}`, kind, x: at[0], z: at[1], height: Math.round(h * 100) / 100 });
};
const P = (kind: TreeKind, X: number, Y: number, height: number) => plant(kind, gardenPoint([X, Y]), height);
/** plants along a plot edge: every `step` metres from `from` to `to`, `off` metres inside the boundary */
const alongEdge = (kind: TreeKind, e: number, from: number, to: number, step: number, off: number, height: number) => {
  for (let s = from; s <= to + 1e-6; s += step) plant(kind, onEdge(e, s, off), height);
};
/** a strip along a plot edge */
const strip = (e: number, from: number, to: number, off0: number, off1: number): P2[] => [onEdge(e, from, off0), onEdge(e, to, off0), onEdge(e, to, off1), onEdge(e, from, off1)];

const H = { grass: 1.25, lavender: 0.45, hydrangea: 1.1, boxwood: 0.7, globe: 3.4, maple: 2.6, rock: 0.5 };

// ---------------------------------------------------------------------------------------------
// Around the paving: every edge of the forecourt and of the drive to the shed gets a planted border
// ---------------------------------------------------------------------------------------------
// between the north-east fence and the drive to the shed: grasses with lavender between them
area('bed-fence', 'flowerbed', strip(0, 11.4, 31.2, 0.4, 1.4));
alongEdge('grass', 0, 12.2, 30.4, 1.82, 0.9, H.grass);
alongEdge('lavender', 0, 13.11, 29.5, 1.82, 0.9, H.lavender);
// the garden side of that drive: an avenue of ball-headed trees over a band of lavender
area('bed-avenue', 'flowerbed', strip(0, 12.4, 25.6, 5.0, 6.1));
alongEdge('globe', 0, 13.4, 25.4, 4.0, 5.55, H.globe);
for (let d = 14.0; d <= 24.9; d += 0.7) if (Math.abs(((d - 13.4 + 2) % 4) - 2) > 0.55) plant('lavender', onEdge(0, d, 5.55), H.lavender); // not under the stems
// along the lane to the entrance and under the kitchen window: box balls, grasses, a red maple
area('bed-entrance', 'flowerbed', G([[-1, 9.95], [3.0, 9.95], [3.0, 17.3], [1.9, 17.3], [1.9, 11.5], [-1, 11.5]]));
P('maple', 0.3, 10.75, H.maple);
for (let Y = 10.7, i = 0; Y <= 16.6; Y += 0.98, i++) P(i % 2 ? 'grass' : 'boxwood', 2.45, Y, i % 2 ? H.grass * 0.85 : H.boxwood);
for (let X = -0.7; X <= 1.75; X += 0.55) if (Math.abs(X - 0.3) > 0.5) P('lavender', X, 10.3, H.lavender);
// between the forecourt and the hedge on the north-west side: gravel with hydrangeas, grasses and boulders
area('bed-forecourt', 'gravel', G([[19.4, 12.45], [18.3, 21.45], [19.7, 21.3], [20.85, 12.45]]));
for (let i = 0; i < 5; i++) P('hydrangea', 20.1 - i * 0.26, 13.3 + i * 1.9, H.hydrangea);
for (let i = 0; i < 4; i++) P('grass', 19.75 - i * 0.26, 14.25 + i * 1.9, H.grass);
P('rock', 19.55, 12.95, 0.45);
P('rock', 19.0, 20.6, 0.6);

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
