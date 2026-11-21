/**
 * The ground floor as lines, without wall thickness, for staking the rooms with strings: the outer
 * walls on their outer face (the house outline, as staked), the inner walls on their axis, and every
 * room filling the space up to those lines. No wall widths to add or take off on the plot.
 *
 * From the plan's partitions (axis-aligned walls, in plan coords):
 * 1. walls a few centimetres apart on one line become one line (the longest wall's);
 * 2. a wall end that stops short of a line (the inner face of an outer wall, the face of a crossing
 *    wall) runs on to it;
 * 3. at an inner corner of the outline, the outer wall's line runs on into the house to a wall within
 *    0.5 m (the front wall at F up to the garage wall), so the rooms on either side stay apart;
 * 4. rooms are cells of a grid through every line: inside a room's own outline where the project has
 *    them (the thin bands of former wall then join the room beside them), else flooded from its label.
 */
import type { HouseDef, Vec2 } from '../house/types';
import { pointInPolygon, type P2 } from './geom2d';

interface Line { vert: boolean; c: number; lo: number; hi: number; len: number; extra?: boolean }

/** an inner wall as a line; `extra` = not a wall of the plan but an outer wall's line run on into the house (step 3) */
export interface SimpleWall { a: Vec2; b: Vec2; extra?: boolean }
export interface SimpleRoom { name: string; area: number; at: Vec2; cells: [number, number, number, number][] }

const SAME_LINE = 0.12;
const OUTER_REACH = 0.5; // an outer wall's thickness and a little more
const INNER_REACH = 0.3;
const BAND = 0.5; // a strip of former wall at most this wide joins the room beside it

export function simplePlan(house: HouseDef): { walls: SimpleWall[]; rooms: SimpleRoom[] } {
  const o = house.outline;
  const outer: Line[] = o.map((a, i) => {
    const b = o[(i + 1) % o.length], vert = Math.abs(a[0] - b[0]) < 1e-6;
    const [p, q] = vert ? [a[1], b[1]] : [a[0], b[0]];
    return { vert, c: vert ? a[0] : a[1], lo: Math.min(p, q), hi: Math.max(p, q), len: Math.abs(q - p) };
  });
  const walls: Line[] = house.partitions.flatMap(([x1, y1, x2, y2]): Line[] => {
    if (Math.abs(x1 - x2) < 1e-6) return [{ vert: true, c: x1, lo: Math.min(y1, y2), hi: Math.max(y1, y2), len: Math.abs(y2 - y1) }];
    if (Math.abs(y1 - y2) < 1e-6) return [{ vert: false, c: y1, lo: Math.min(x1, x2), hi: Math.max(x1, x2), len: Math.abs(x2 - x1) }];
    return []; // not axis-aligned: left out of the simple plan
  });

  // 1. one line for walls a few cm apart
  for (const vert of [true, false]) {
    const list = walls.filter((w) => w.vert === vert).sort((a, b) => a.c - b.c);
    let group: Line[] = [];
    const flush = () => {
      if (!group.length) return;
      const c = group.reduce((m, w) => (w.len > m.len ? w : m)).c;
      for (const w of group) w.c = c;
      group = [];
    };
    for (const w of list) {
      if (group.length && w.c - group[group.length - 1].c >= SAME_LINE) flush();
      group.push(w);
    }
    flush();
  }

  // 2. ends run on to the line they stop short of
  for (let pass = 0; pass < 2; pass++)
    for (const w of walls) {
      const lines = [
        ...outer.filter((e) => e.vert !== w.vert && w.c >= e.lo - OUTER_REACH && w.c <= e.hi + OUTER_REACH).map((e) => ({ c: e.c, reach: OUTER_REACH })),
        ...walls.filter((x) => x !== w && x.vert !== w.vert && w.c >= x.lo - 0.15 && w.c <= x.hi + 0.15).map((x) => ({ c: x.c, reach: INNER_REACH })),
      ];
      for (const end of ['lo', 'hi'] as const) {
        let best = { d: Infinity, c: w[end] };
        for (const l of lines) {
          const d = Math.abs(l.c - w[end]);
          if (d <= l.reach && d < best.d) best = { d, c: l.c };
        }
        w[end] = best.c;
      }
      if (w.lo > w.hi) [w.lo, w.hi] = [w.hi, w.lo];
    }

  // 3. at an inner corner, the outer wall's line on into the house to a wall within reach
  let area2 = 0;
  for (let i = 0; i < o.length; i++) area2 += o[i][0] * o[(i + 1) % o.length][1] - o[(i + 1) % o.length][0] * o[i][1];
  o.forEach((p, i) => {
    const prev = o[(i + o.length - 1) % o.length], next = o[(i + 1) % o.length];
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0]);
    if (cross * area2 >= 0) return; // a convex corner
    for (const from of [prev, next]) {
      const d: Vec2 = [Math.sign(p[0] - from[0]), Math.sign(p[1] - from[1])];
      const vert = d[0] === 0; // the run-on line's direction
      const at = vert ? p[0] : p[1], along = vert ? p[1] : p[0], dir = vert ? d[1] : d[0];
      const hit = walls
        .filter((w) => w.vert !== vert && (w.c - along) * dir > 1e-6 && Math.abs(w.c - along) <= OUTER_REACH && at >= w.lo - 0.05 && at <= w.hi + 0.05)
        .sort((a, b) => Math.abs(a.c - along) - Math.abs(b.c - along))[0];
      if (hit) walls.push({ vert, c: at, lo: Math.min(along, hit.c), hi: Math.max(along, hit.c), len: Math.abs(hit.c - along), extra: true });
    }
  });

  // 4. rooms: cells of a grid through every line
  const uniq = (v: number[]) => [...v].sort((a, b) => a - b).filter((x, i, s) => i === 0 || x - s[i - 1] > 1e-6);
  const xs = uniq([...o.map((p) => p[0]), ...walls.filter((w) => w.vert).map((w) => w.c), ...house.rooms.flatMap((r) => r.outline?.map((p) => p[0]) ?? [])]);
  const ys = uniq([...o.map((p) => p[1]), ...walls.filter((w) => !w.vert).map((w) => w.c), ...house.rooms.flatMap((r) => r.outline?.map((p) => p[1]) ?? [])]);
  const nx = xs.length - 1, ny = ys.length - 1;
  const inside = (i: number, j: number) => pointInPolygon([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], o as P2[]);
  const covers = (vert: boolean, c: number, lo: number, hi: number) =>
    walls.some((w) => w.vert === vert && Math.abs(w.c - c) < 1e-6 && w.lo <= lo + 1e-6 && w.hi >= hi - 1e-6);
  // neighbours not split by a wall: [i, j, thickness of this cell towards it]
  const neighbours = (i: number, j: number): [number, number, number][] => {
    const out: [number, number, number][] = [];
    if (i + 1 < nx && !covers(true, xs[i + 1], ys[j], ys[j + 1])) out.push([i + 1, j, xs[i + 1] - xs[i]]);
    if (i > 0 && !covers(true, xs[i], ys[j], ys[j + 1])) out.push([i - 1, j, xs[i + 1] - xs[i]]);
    if (j + 1 < ny && !covers(false, ys[j + 1], xs[i], xs[i + 1])) out.push([i, j + 1, ys[j + 1] - ys[j]]);
    if (j > 0 && !covers(false, ys[j], xs[i], xs[i + 1])) out.push([i, j - 1, ys[j + 1] - ys[j]]);
    return out.filter(([a, b]) => inside(a, b));
  };
  const room: number[][] = Array.from({ length: nx }, () => Array(ny).fill(-1));
  // rooms with an outline: the cells inside it
  house.rooms.forEach((r, k) => {
    if (!r.outline) return;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        if (room[i][j] < 0 && inside(i, j) && pointInPolygon([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], r.outline as P2[])) room[i][j] = k;
  });
  // rooms without one: flooded from the cell of their label, nearest room first
  const queue: [number, number][] = [];
  house.rooms.forEach((r, k) => {
    if (r.outline) return;
    const i = xs.findIndex((x, n) => n < nx && r.at[0] >= x && r.at[0] <= xs[n + 1]);
    const j = ys.findIndex((y, n) => n < ny && r.at[1] >= y && r.at[1] <= ys[n + 1]);
    if (i >= 0 && j >= 0 && inside(i, j) && room[i][j] < 0) { room[i][j] = k; queue.push([i, j]); }
  });
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q];
    for (const [a, b] of neighbours(i, j)) if (room[a][b] < 0) { room[a][b] = room[i][j]; queue.push([a, b]); }
  }
  // the thin bands where the walls were join the room beside them
  for (let changed = true, pass = 0; changed && pass < 100; pass++) {
    changed = false;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++) {
        if (room[i][j] >= 0 || !inside(i, j)) continue;
        const n = neighbours(i, j).find(([a, b, t]) => t <= BAND && room[a][b] >= 0);
        if (n) { room[i][j] = room[n[0]][n[1]]; changed = true; }
      }
  }

  return {
    walls: walls.map((w) => (w.vert ? { a: [w.c, w.lo], b: [w.c, w.hi] } : { a: [w.lo, w.c], b: [w.hi, w.c] }) as SimpleWall).map((w, i) => (walls[i].extra ? { ...w, extra: true } : w)),
    rooms: house.rooms.map((r, k) => ({
      name: r.name, area: r.area, at: r.at,
      cells: room.flatMap((col, i) => col.flatMap((v, j) => (v === k ? [[xs[i], ys[j], xs[i + 1], ys[j + 1]] as [number, number, number, number]] : []))),
    })),
  };
}
