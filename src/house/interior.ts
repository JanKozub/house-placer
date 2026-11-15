/**
 * Interiors: partition walls with door openings and leaves, stairs, floor finishes and furniture,
 * built from `HouseDef.interior`. Pure geometry (no DOM / materials), like geometry.ts.
 *
 * Everything is emitted through `add(part, geometry, layer)`: the ground storey and the stairs go to
 * the 'base' layer, the upper storey to 'upper', so the roof and the upper storey can be hidden.
 * Under a roof the walls and tall furniture are cut to the sloped ceiling.
 */
import * as THREE from 'three';
import type { Facing, FurnitureItem, HouseDef, InteriorDoor, InteriorWall, Storey, Vec2 } from './types';
import type { Layer, PartName } from './geometry';
import { roofTopAt, tanPitch } from './roof';

export type Add = (part: PartName, g: THREE.BufferGeometry, layer: Layer) => void;

const DIR: Record<Facing, Vec2> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const TURN: Record<Facing, number> = { S: 0, E: 1, N: 2, W: 3 };
const DOOR_H = 2.05;

/** gap between the roof's underside and the plasterboard of the sloped ceiling */
const CEILING_GAP = 0.03;

/**
 * Vertical distance from the roof's top surface to the sloped ceiling under it: set by the knee
 * wall's height where the storey gives one (rafters, insulation and boards together), otherwise
 * the roof slab plus a small gap.
 */
export function ceilingDrop(house: HouseDef) {
  const up = house.interior?.upper;
  if (up?.knee !== undefined) return house.roof.topAtWall + house.wallThickness * tanPitch(house) - (up.level + up.knee);
  return house.roof.thickness / Math.cos(Math.atan(tanPitch(house))) + CEILING_GAP;
}

/** ceiling height above ±0.00 at a plan point of a storey: flat, or cut by the roof slope in an attic */
export function storeyCeiling(house: HouseDef, st: Storey, underRoof: boolean): (X: number, Y: number) => number {
  const flat = st.level + st.height;
  if (!underRoof) return () => flat;
  const drop = ceilingDrop(house);
  return (X, Y) => Math.min(flat, (roofTopAt(house, X, Y) ?? Infinity) - drop);
}

/** UVs in metres, so tiled textures keep their scale */
function metricUV(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return g;
}

/** axis-aligned box in plan coords (house-local 3D output) */
function planBox(h: HouseDef, x0: number, x1: number, y0: number, y1: number, h0: number, h1: number) {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(h1 - h0), Math.abs(y1 - y0));
  g.translate((x0 + x1) / 2 - h.width / 2, (h0 + h1) / 2, (y0 + y1) / 2 - h.depth / 2);
  return metricUV(g);
}

// ---------------------------------------------------------------------------------------------
// A furniture item's own frame: x across its front, y up from the storey floor, z towards its front.
// ---------------------------------------------------------------------------------------------
class Frame {
  constructor(private m: THREE.Matrix4, private add: Add, private layer: Layer, private ceilAbs: (X: number, Y: number) => number, private house: HouseDef, private level: number) {}
  child(dx: number, dz: number, quarterTurns = 0) {
    const m = this.m.clone().multiply(new THREE.Matrix4().makeTranslation(dx, 0, dz)).multiply(new THREE.Matrix4().makeRotationY((quarterTurns * Math.PI) / 2));
    return new Frame(m, this.add, this.layer, this.ceilAbs, this.house, this.level);
  }
  put(part: PartName, g: THREE.BufferGeometry) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.applyMatrix4(this.m);
    this.add(part, ng, this.layer);
  }
  /** box: x range, height range, z range */
  box(part: PartName, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.put(part, metricUV(g));
  }
  /** upright cylinder (or cone: r1 at the top) */
  cyl(part: PartName, x: number, z: number, r: number, y0: number, y1: number, r1 = r, seg = 20) {
    if (y1 - y0 < 1e-4) return;
    const g = new THREE.CylinderGeometry(r1, r, y1 - y0, seg);
    g.translate(x, (y0 + y1) / 2, z);
    this.put(part, g);
  }
  /** ellipsoid */
  blob(part: PartName, x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(rx, ry, rz);
    g.translate(x, y, z);
    this.put(part, g);
  }
  /** clear height under the ceiling at a point of the item (above the storey floor) */
  ceil(x: number, z: number) {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(this.m);
    return this.ceilAbs(v.x + this.house.width / 2, v.z + this.house.depth / 2) - this.level;
  }
  /** clear height over a whole rectangle of the item: the ceiling is lowest at one of its corners */
  ceilOver(x0: number, x1: number, z0: number, z1: number) {
    return Math.min(this.ceil(x0, z0), this.ceil(x1, z0), this.ceil(x0, z1), this.ceil(x1, z1));
  }
}

function itemFrame(house: HouseDef, st: Storey, it: FurnitureItem, add: Add, layer: Layer, ceilAbs: (X: number, Y: number) => number) {
  const m = new THREE.Matrix4()
    .makeTranslation(it.at[0] - house.width / 2, st.level, it.at[1] - house.depth / 2)
    .multiply(new THREE.Matrix4().makeRotationY((TURN[it.face ?? 'S'] * Math.PI) / 2));
  return new Frame(m, add, layer, ceilAbs, house, st.level);
}

// ---------------------------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------------------------
function chair(f: Frame, part: PartName = 'fabric') {
  f.box(part, -0.23, 0.23, 0.4, 0.47, -0.22, 0.22);
  f.box(part, -0.23, 0.23, 0.47, 0.82, -0.25, -0.19);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.19], [0.2, 0.19]]) f.box('black', x - 0.012, x + 0.012, 0, 0.4, z - 0.012, z + 0.012);
}

function officeChair(f: Frame) {
  f.cyl('black', 0, 0, 0.26, 0, 0.04);
  f.cyl('steel', 0, 0, 0.025, 0.04, 0.42);
  f.box('fabricDark', -0.23, 0.23, 0.42, 0.5, -0.22, 0.22);
  f.box('fabricDark', -0.21, 0.21, 0.55, 0.95, -0.26, -0.21);
}

/** fronts with shadow gaps every `bay` metres, on the +z face of a cabinet */
function fronts(f: Frame, x0: number, x1: number, y0: number, y1: number, z: number, bay = 0.6, handles = true) {
  const n = Math.max(1, Math.round((x1 - x0) / bay));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    f.box('black', x - 0.003, x + 0.003, y0, y1, z - 0.004, z + 0.002);
  }
  if (!handles) return;
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
    f.box('steel', x - 0.07, x + 0.07, y1 - 0.07, y1 - 0.055, z, z + 0.02);
  }
}

const has = (it: FurnitureItem, token: string) => typeof it.opt === 'string' && it.opt.split(' ').includes(token);

function buildItem(f: Frame, it: FurnitureItem) {
  const w = it.w ?? 1, d = it.d ?? 0.6, hw = w / 2, hd = d / 2;
  const body: PartName = it.dark ? 'cabinetDark' : 'cabinet';
  switch (it.kind) {
    case 'dining': {
      // table along x, chairs on both long sides and at the ends
      f.box('oak', -hw, hw, 0.71, 0.75, -hd, hd);
      for (const x of [-hw + 0.35, hw - 0.35]) f.box('oak', x - 0.04, x + 0.04, 0, 0.71, -hd + 0.15, hd - 0.15);
      f.box('oak', -hw + 0.35, hw - 0.35, 0.1, 0.16, -0.03, 0.03);
      const seats = typeof it.opt === 'number' ? it.opt : 6, side = Math.max(1, Math.floor((seats - (seats > 6 ? 2 : 0)) / 2));
      for (let i = 0; i < side; i++) {
        const x = -hw + (w * (i + 0.5)) / side;
        chair(f.child(x, hd + 0.12, 2));
        chair(f.child(x, -hd - 0.12, 0));
      }
      if (seats > 6) { chair(f.child(hw + 0.12, 0, 3)); chair(f.child(-hw - 0.12, 0, 1)); }
      // something on the table
      f.cyl('ceramic', 0, 0, 0.09, 0.75, 0.93, 0.06);
      f.blob('plant', 0, 1.05, 0, 0.16, 0.16, 0.16);
      break;
    }
    case 'sofa': {
      const up: PartName = it.dark ? 'fabricDark' : 'fabric';
      f.box(up, -hw, hw, 0.08, 0.42, -hd, hd);
      f.box(up, -hw, hw, 0.42, 0.8, -hd, -hd + 0.24);
      for (const s of [-1, 1]) f.box(up, s > 0 ? hw - 0.2 : -hw, s > 0 ? hw : -hw + 0.2, 0.42, 0.62, -hd + 0.24, hd);
      const n = Math.max(2, Math.round((w - 0.4) / 0.85));
      for (let i = 0; i < n; i++) {
        const x0 = -hw + 0.2 + ((w - 0.4) * i) / n, x1 = -hw + 0.2 + ((w - 0.4) * (i + 1)) / n;
        f.box(up, x0 + 0.01, x1 - 0.01, 0.42, 0.5, -hd + 0.24, hd - 0.02); // seat cushions
        f.box(i % 2 ? 'fabricDark' : 'linen', (x0 + x1) / 2 - 0.22, (x0 + x1) / 2 + 0.22, 0.5, 0.86, -hd + 0.24, -hd + 0.36); // pillows
      }
      for (const [x, z] of [[-hw + 0.06, -hd + 0.06], [hw - 0.06, -hd + 0.06], [-hw + 0.06, hd - 0.06], [hw - 0.06, hd - 0.06]]) f.box('black', x - 0.02, x + 0.02, 0, 0.08, z - 0.02, z + 0.02);
      break;
    }
    case 'ottoman':
      f.box(it.dark ? 'fabricDark' : 'fabric', -hw, hw, 0.08, it.h ?? 0.42, -hd, hd);
      f.box('black', -hw + 0.05, hw - 0.05, 0, 0.08, -hd + 0.05, hd - 0.05);
      break;
    case 'bench':
      f.box('oak', -hw, hw, 0, 0.36, -hd, hd);
      f.box(it.dark ? 'fabricDark' : 'fabric', -hw + 0.01, hw - 0.01, 0.36, it.h ?? 0.46, -hd + 0.01, hd - 0.01);
      break;
    case 'coffeeTable':
      f.box('black', -hw + 0.08, hw - 0.08, 0, 0.06, -hd + 0.08, hd - 0.08);
      f.box('stone', -hw, hw, 0.06, 0.34, -hd, hd);
      f.box('oak', -0.14, 0.1, 0.34, 0.38, -0.1, 0.12);
      f.cyl('ceramic', hw * 0.45, -hd * 0.3, 0.07, 0.34, 0.46, 0.09);
      break;
    case 'rug':
      f.box('rug', -hw, hw, 0.006, 0.02, -hd, hd);
      break;
    case 'tv': {
      const y0 = it.h ?? 1.0;
      f.box('black', -hw, hw, y0, y0 + w * 0.57, -0.025, 0.025);
      break;
    }
    case 'console':
      f.box('oak', -hw, hw, 0.14, it.h ?? 0.5, -hd, hd);
      f.box('black', -hw + 0.04, hw - 0.04, 0, 0.14, -hd + 0.04, hd - 0.04);
      fronts(f, -hw, hw, 0.16, (it.h ?? 0.5) - 0.02, hd, 0.8, false);
      break;
    case 'fireplace': {
      // a stone-clad chimney breast to the ceiling with a wide insert in its front
      const top = Math.min(f.ceilOver(-hw, hw, -hd, hd), it.h ?? 9);
      f.box('stone', -hw, hw, 0, top, -hd, hd);
      const cx = typeof it.opt === 'number' ? it.opt : 0;
      f.box('black', cx - 0.55, cx + 0.55, 0.42, 0.9, hd, hd + 0.012);
      f.box('fire', cx - 0.45, cx + 0.45, 0.47, 0.6, hd + 0.012, hd + 0.016);
      f.box('stone', -hw, hw, 0, 0.32, hd, hd + 0.3); // hearth bench
      break;
    }
    case 'plant': {
      const h = it.h ?? 1.5, r = (it.w ?? 0.4) / 2;
      f.cyl('ceramic', 0, 0, r * 0.8, 0, 0.42, r);
      f.cyl('oak', 0, 0, 0.018, 0.42, h * 0.62);
      for (const [x, y, z, s] of [[0, 0.72, 0, 1], [0.16, 0.56, 0.1, 0.75], [-0.15, 0.6, -0.08, 0.8], [0.04, 0.9, -0.1, 0.7], [-0.08, 0.84, 0.14, 0.65]])
        f.blob('plant', x * h * 0.6, y * h, z * h * 0.6, 0.3 * s * h * 0.55, 0.26 * s * h * 0.55, 0.3 * s * h * 0.55);
      break;
    }
    case 'pendant': {
      const y = it.h ?? 1.7, top = f.ceil(0, 0);
      f.cyl('black', 0, 0, 0.13, y, y + 0.22, 0.03, 16);
      f.cyl('black', 0, 0, 0.006, y + 0.22, top, 0.006, 6);
      f.blob('fire', 0, y + 0.03, 0, 0.05, 0.04, 0.05);
      break;
    }
    case 'island': {
      // timber-clad body with a stone top that overhangs the front, where the stools stand
      const over = 0.32;
      f.box('oak', -hw, hw, 0.08, 0.88, -hd, hd - over);
      f.box('black', -hw + 0.05, hw - 0.05, 0, 0.08, -hd + 0.05, hd - over - 0.05);
      f.box('stone', -hw - 0.02, hw + 0.02, 0.88, 0.94, -hd - 0.02, hd);
      f.box('stone', hw - 0.04, hw + 0.02, 0, 0.88, -hd - 0.02, hd); // waterfall end
      break;
    }
    case 'stool': {
      const y = it.h ?? 0.68;
      f.cyl('fabricDark', 0, 0, 0.19, y - 0.05, y, 0.2);
      f.box('fabricDark', -0.17, 0.17, y, y + 0.2, -0.19, -0.16);
      for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) f.box('black', x - 0.012, x + 0.012, 0, y - 0.05, z - 0.012, z + 0.012);
      f.box('black', -0.14, 0.14, 0.24, 0.26, 0.128, 0.152);
      break;
    }
    case 'counter': {
      // base units with a stone worktop; tokens: sink, hob, upper (wall units), splash (stone splashback)
      const top = it.h ?? 0.87;
      f.box('black', -hw, hw, 0, 0.1, -hd, hd - 0.06);
      f.box(body, -hw, hw, 0.1, top, -hd, hd - 0.02);
      fronts(f, -hw, hw, 0.12, top - 0.01, hd - 0.02);
      f.box('stone', -hw, hw, top, top + 0.04, -hd, hd);
      if (has(it, 'splash') || has(it, 'upper')) f.box('stone', -hw, hw, top + 0.04, 1.45, -hd, -hd + 0.015);
      if (has(it, 'upper')) {
        f.box(body, -hw, hw, 1.45, 2.2, -hd, -hd + 0.36);
        fronts(f, -hw, hw, 1.47, 2.18, -hd + 0.36, 0.6, false);
      }
      if (has(it, 'sink')) {
        f.box('steel', -0.27, 0.27, top + 0.04, top + 0.048, -0.22, 0.2);
        f.box('black', -0.22, 0.22, top + 0.048, top + 0.05, -0.17, 0.15);
        f.cyl('steel', 0, -hd + 0.09, 0.014, top + 0.04, top + 0.34);
        f.box('steel', -0.012, 0.012, top + 0.32, top + 0.345, -hd + 0.09, -hd + 0.26);
      }
      if (has(it, 'hob')) {
        f.box('black', -0.29, 0.29, top + 0.04, top + 0.048, -0.24, 0.24);
        if (has(it, 'upper')) f.box('steel', -0.3, 0.3, 1.4, 1.45, -hd, -hd + 0.4); // extractor
      }
      break;
    }
    case 'tall': {
      // full-height units cut to the ceiling; opt: fridge, oven
      const top = Math.min(it.h ?? 2.2, f.ceilOver(-hw, hw, -hd, hd) - 0.02);
      f.box('black', -hw, hw, 0, 0.1, -hd, hd - 0.06);
      f.box(body, -hw, hw, 0.1, top, -hd, hd - 0.02);
      fronts(f, -hw, hw, 0.12, top - 0.02, hd - 0.02, 0.6, false);
      if (has(it, 'oven')) {
        f.box('black', -hw + 0.03, hw - 0.03, 0.95, 1.52, hd - 0.02, hd - 0.012);
        f.box('steel', -hw + 0.07, hw - 0.07, 1.44, 1.46, hd - 0.012, hd + 0.02);
      } else {
        f.box('steel', hw - 0.07, hw - 0.055, 0.9, 1.5, hd - 0.02, hd + 0.01);
        f.box('black', -hw, hw, 1.0 - 0.003, 1.0 + 0.003, hd - 0.024, hd - 0.018);
      }
      break;
    }
    case 'appliance':
      f.box('ceramic', -hw, hw, 0, it.h ?? 0.85, -hd, hd);
      f.box('steel', -hw + 0.05, hw - 0.05, (it.h ?? 0.85) - 0.1, (it.h ?? 0.85) - 0.085, hd, hd + 0.02);
      break;
    case 'wardrobe': {
      // floor-to-ceiling cupboards in bays, each cut to the ceiling above it
      const n = Math.max(1, Math.round(w / 0.55));
      for (let i = 0; i < n; i++) {
        const x0 = -hw + (w * i) / n, x1 = -hw + (w * (i + 1)) / n;
        const top = Math.min(it.h ?? 2.4, f.ceilOver(x0, x1, -hd, hd) - 0.02);
        if (top < 0.4) continue;
        f.box(body, x0, x1, 0.06, top, -hd, hd - 0.02);
        f.box('black', x0 + 0.01, x1 - 0.01, 0, 0.06, -hd, hd - 0.05);
        if (i) f.box('black', x0 - 0.003, x0 + 0.003, 0.06, top, hd - 0.024, hd - 0.018);
        if (top > 1.2) f.box('steel', x1 - 0.06, x1 - 0.045, 0.95, 1.25, hd - 0.02, hd + 0.01);
      }
      break;
    }
    case 'shelf': {
      // open shelving, cut to the ceiling
      const top = Math.min(it.h ?? 2.0, f.ceilOver(-hw, hw, -hd, hd) - 0.03);
      if (top < 0.4) break;
      const n = Math.max(1, Math.round(w / 0.8));
      for (let i = 0; i <= n; i++) {
        const x = -hw + (w * i) / n;
        f.box(body, Math.max(-hw, x - 0.012), Math.min(hw, x + 0.012), 0, top, -hd, hd);
      }
      let k = 0;
      for (let y = 0.08; y < top - 0.05; y += 0.4) {
        f.box(body, -hw, hw, y, y + 0.022, -hd, hd);
        for (let i = 0; i < n; i++) {
          const x0 = -hw + (w * i) / n + 0.05, x1 = -hw + (w * (i + 1)) / n - 0.05, hh = Math.min(0.26, top - y - 0.06);
          if (hh < 0.08) continue;
          const kind = (k++ * 7) % 4;
          if (kind < 3) f.box((['fabric', 'oak', 'fabricDark'] as const)[kind], x0, x0 + (x1 - x0) * (0.55 + 0.15 * kind), y + 0.022, y + 0.022 + hh * (0.7 + 0.1 * kind), -hd + 0.03, hd - 0.04);
        }
      }
      break;
    }
    case 'rail': {
      // hanging rail with clothes and a shelf above
      const top = Math.min(1.85, f.ceilOver(-hw, hw, -hd, hd) - 0.08);
      f.box(body, -hw, hw, top, top + 0.025, -hd, hd);
      f.box('steel', -hw, hw, top - 0.1, top - 0.08, -0.01, 0.01);
      const n = Math.floor(w / 0.09);
      for (let i = 0; i < n; i++) {
        const x = -hw + 0.06 + i * 0.09, len = 0.75 + ((i * 5) % 4) * 0.12;
        f.box((['fabric', 'fabricDark', 'linen', 'black', 'oak'] as const)[(i * 3) % 5], x - 0.03, x + 0.03, top - 0.12 - len, top - 0.12, -hd + 0.04, hd - 0.04);
      }
      break;
    }
    case 'desk': {
      // the front is the side one sits at
      f.box('oak', -hw, hw, 0.72, 0.75, -hd, hd);
      f.box(body, -hw, -hw + 0.03, 0, 0.72, -hd, hd);
      f.box(body, hw - 0.45, hw, 0.12, 0.72, -hd, hd - 0.03);
      fronts(f, hw - 0.45, hw, 0.14, 0.7, hd - 0.03, 0.45);
      f.box('black', -0.3, 0.3, 0.86, 1.22, -hd + 0.1, -hd + 0.125); // monitor
      f.box('black', -0.02, 0.02, 0.75, 0.9, -hd + 0.08, -hd + 0.1);
      f.box('black', -0.1, 0.1, 0.75, 0.76, -hd + 0.04, -hd + 0.16);
      officeChair(f.child(Math.min(0, hw - 0.9), hd + 0.22, 2));
      break;
    }
    case 'armchair': {
      const r = w / 2, up: PartName = it.dark ? 'fabricDark' : 'fabric';
      f.cyl(up, 0, 0, r * 0.92, 0.1, 0.42, r);
      f.cyl('black', 0, 0, r * 0.5, 0, 0.1);
      for (let i = -2; i <= 2; i++) {
        const a = (i * Math.PI) / 5.2, x = Math.sin(a) * r * 0.86, z = -Math.cos(a) * r * 0.86;
        f.blob(up, x, 0.6, z, 0.17, 0.26, 0.17);
      }
      break;
    }
    case 'bed': {
      // head at the back (−z), foot at the front; w = width, d = length
      f.box('oak', -hw, hw, 0.08, 0.3, -hd, hd);
      f.box('black', -hw + 0.08, hw - 0.08, 0, 0.08, -hd + 0.08, hd - 0.08);
      f.box(it.dark ? 'fabricDark' : 'oak', -hw, hw, 0.3, Math.min(1.05, f.ceilOver(-hw, hw, -hd, -hd + 0.07) - 0.03), -hd, -hd + 0.07);
      f.box('linen', -hw + 0.03, hw - 0.03, 0.3, 0.5, -hd + 0.07, hd - 0.03);
      f.box('fabric', -hw + 0.01, hw - 0.01, 0.5, 0.56, -hd + 0.75, hd - 0.02); // duvet
      f.box('fabricDark', -hw + 0.01, hw - 0.01, 0.56, 0.585, hd - 0.75, hd - 0.02); // throw at the foot
      const n = w > 1.3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const xc = -hw + (w * (i + 0.5)) / n;
        f.box('linen', xc - 0.3, xc + 0.3, 0.5, 0.62, -hd + 0.12, -hd + 0.52);
      }
      break;
    }
    case 'nightstand':
      f.box('oak', -hw, hw, 0.1, 0.48, -hd, hd);
      f.box('black', -hw + 0.03, hw - 0.03, 0, 0.1, -hd + 0.03, hd - 0.03);
      f.cyl('black', 0, 0, 0.05, 0.48, 0.5);
      f.cyl('steel', 0, 0, 0.008, 0.5, 0.72);
      f.cyl('linen', 0, 0, 0.11, 0.7, 0.88, 0.08, 14);
      break;
    case 'dresser': {
      const top = Math.min(it.h ?? 0.78, f.ceilOver(-hw, hw, -hd, hd) - 0.02);
      if (top < 0.3) break;
      f.box('oak', -hw, hw, 0.1, top, -hd, hd - 0.02);
      f.box('black', -hw + 0.03, hw - 0.03, 0, 0.1, -hd + 0.03, hd - 0.05);
      fronts(f, -hw, hw, 0.12, top - 0.02, hd - 0.02, 0.8, false);
      break;
    }
    case 'wc':
      // wall-hung: the back (−z) is at the wall
      f.box('interior', -0.25, 0.25, 0, 1.15, -hd, -hd + 0.14); // frame casing
      f.box('steel', -0.1, 0.1, 0.98, 1.08, -hd + 0.14, -hd + 0.15);
      f.box('ceramic', -0.18, 0.18, 0.2, 0.42, -hd + 0.14, -hd + 0.4);
      f.cyl('ceramic', 0, -hd + 0.4, 0.18, 0.2, 0.42, 0.18);
      f.box('linen', -0.185, 0.185, 0.42, 0.44, -hd + 0.16, -hd + 0.42);
      f.cyl('linen', 0, -hd + 0.4, 0.185, 0.42, 0.44);
      break;
    case 'basin': {
      // floating vanity with a basin slab and a mirror on the wall behind; opt 'double' = two taps
      f.box('oak', -hw, hw, 0.45, 0.82, -hd, hd - 0.02);
      fronts(f, -hw, hw, 0.47, 0.8, hd - 0.02, 0.6, false);
      f.box('ceramic', -hw - 0.01, hw + 0.01, 0.82, 0.86, -hd, hd);
      const n = has(it, 'double') ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const xc = -hw + (w * (i + 0.5)) / n;
        f.box('ceramic', xc - 0.24, xc + 0.24, 0.86, 0.94, -hd + 0.06, hd - 0.02);
        f.box('black', xc - 0.2, xc + 0.2, 0.94, 0.942, -hd + 0.1, hd - 0.06);
        f.cyl('steel', xc, -hd + 0.07, 0.012, 0.94, 1.12);
        f.box('steel', xc - 0.01, xc + 0.01, 1.1, 1.12, -hd + 0.07, -hd + 0.2);
      }
      const mt = Math.min(1.95, f.ceilOver(-hw, hw, -hd, -hd + 0.02) - 0.05);
      if (mt > 1.4) f.box('mirror', -hw + 0.04, hw - 0.04, 1.15, mt, -hd, -hd + 0.015);
      break;
    }
    case 'shower': {
      // tray with glass on the front and on the right-hand side; the back and the left are walls
      const top = Math.min(2.0, f.ceilOver(-hw, hw, -hd, hd) - 0.05);
      f.box('ceramic', -hw, hw, 0.012, 0.04, -hd, hd);
      f.box('steel', -0.06, 0.06, 0.04, 0.045, -0.06, 0.06);
      f.box('glass', -hw + 0.3, hw, 0.04, top, hd - 0.012, hd);
      f.box('glass', hw - 0.012, hw, 0.04, top, -hd, hd - 0.012);
      f.cyl('steel', -hw + 0.12, -hd + 0.06, 0.012, 1.0, Math.min(2.1, top + 0.1));
      f.box('steel', -hw + 0.11, -hw + 0.13, Math.min(2.08, top + 0.08), Math.min(2.1, top + 0.1), -hd + 0.06, -hd + 0.4);
      f.cyl('steel', -hw + 0.12, -hd + 0.4, 0.11, Math.min(2.06, top + 0.06), Math.min(2.08, top + 0.08));
      break;
    }
    case 'bathtub': {
      const top = it.h ?? 0.58, rim = 0.07;
      f.box('ceramic', -hw, hw, 0, 0.16, -hd, hd);
      f.box('ceramic', -hw, hw, 0.16, top, -hd, -hd + rim);
      f.box('ceramic', -hw, hw, 0.16, top, hd - rim, hd);
      f.box('ceramic', -hw, -hw + rim, 0.16, top, -hd + rim, hd - rim);
      f.box('ceramic', hw - rim, hw, 0.16, top, -hd + rim, hd - rim);
      f.cyl('steel', -hw + 0.2, -hd + 0.035, 0.014, top, top + 0.2);
      f.box('steel', -hw + 0.19, -hw + 0.21, top + 0.18, top + 0.2, -hd + 0.035, -hd + 0.2);
      break;
    }
    case 'boiler': {
      const y0 = 0.95, top = Math.min(it.h ?? 1.75, f.ceil(0, 0) - 0.1);
      f.box('ceramic', -hw, hw, y0, top, -hd, hd);
      f.box('black', -0.1, 0.1, y0 + 0.12, y0 + 0.2, hd, hd + 0.005);
      for (const x of [-hw + 0.1, -0.05, 0.1, hw - 0.1]) f.cyl('steel', x, 0, 0.015, 0.05, y0);
      f.cyl('steel', 0, 0, 0.05, top, Math.max(top, f.ceil(0, 0)));
      break;
    }
    case 'tank':
      f.cyl('ceramic', 0, 0, hw, 0.08, it.h ?? 1.7);
      f.cyl('black', 0, 0, hw * 0.8, 0, 0.08);
      f.cyl('steel', 0, 0, 0.02, it.h ?? 1.7, Math.min((it.h ?? 1.7) + 0.4, f.ceil(0, 0)));
      break;
    case 'washer': {
      const n = has(it, 'stack') ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const y = i * 0.86;
        f.box('ceramic', -hw, hw, y, y + 0.85, -hd, hd);
        const g = new THREE.CylinderGeometry(0.19, 0.19, 0.02, 20);
        g.rotateX(Math.PI / 2);
        g.translate(0, y + 0.42, hd + 0.008);
        f.put('black', g);
        f.box('black', -hw + 0.04, hw - 0.04, y + 0.74, y + 0.8, hd, hd + 0.004);
      }
      break;
    }
    case 'rack': {
      for (const x of [-hw, hw]) for (const z of [-hd, hd]) f.box('steel', x - 0.01, x + 0.01, 0, 0.95, z - 0.01, z + 0.01);
      const n = Math.max(2, Math.round(w / 0.1));
      for (let i = 0; i <= n; i++) {
        const x = -hw + (w * i) / n;
        f.box('steel', x - 0.006, x + 0.006, 0.94, 0.952, -hd, hd);
      }
      f.box('linen', -hw + 0.08, -hw + 0.3, 0.6, 0.955, -hd + 0.02, hd - 0.02);
      f.box('fabric', -0.05, 0.2, 0.5, 0.955, -hd + 0.02, hd - 0.02);
      break;
    }
    case 'block': {
      const top = Math.min(it.h ?? 9, f.ceilOver(-hw, hw, -hd, hd));
      f.box('interior', -hw, hw, 0, top, -hd, hd);
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Walls and doors
// ---------------------------------------------------------------------------------------------
function buildWall(house: HouseDef, st: Storey, w: InteriorWall, ceilAbs: (X: number, Y: number) => number, layer: Layer, add: Add) {
  const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  if (L < 1e-6) return;
  const d: Vec2 = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const n: Vec2 = [-d[1], d[0]];
  const t = w.glass ? 0.012 : w.t ?? house.innerWallThickness;
  const at = (s: number, off = 0): Vec2 => [w.a[0] + d[0] * s + n[0] * off, w.a[1] + d[1] * s + n[1] * off];
  // wall-local (u along the wall, v = height above ±0.00, k across the thickness) → house-local 3D
  const o = at(0, -t / 2);
  const m = new THREE.Matrix4().set(
    d[0], 0, n[0], o[0] - house.width / 2,
    0, 1, 0, 0,
    d[1], 0, n[1], o[1] - house.depth / 2,
    0, 0, 0, 1,
  );
  const lvl = st.level;

  if (w.h !== undefined) {
    // a low wall or a glass balustrade with a handrail
    const g = new THREE.BoxGeometry(L, w.h - (w.glass ? 0.06 : 0), t);
    g.translate(L / 2, lvl + (w.glass ? 0.06 : 0) + (w.h - (w.glass ? 0.06 : 0)) / 2, t / 2);
    add(w.glass ? 'glass' : 'interior', metricUV(g).applyMatrix4(m), layer);
    if (w.glass) {
      const rail = new THREE.BoxGeometry(L, 0.035, 0.05);
      rail.translate(L / 2, lvl + w.h + 0.017, t / 2);
      add('steel', rail.applyMatrix4(m), layer);
      const foot = new THREE.BoxGeometry(L, 0.06, 0.04);
      foot.translate(L / 2, lvl + 0.03, t / 2);
      add('steel', foot.applyMatrix4(m), layer);
    }
    return;
  }

  const top = (s: number) => Math.min(ceilAbs(...at(s, -t / 2)), ceilAbs(...at(s, t / 2))) - 0.004;
  const doors = [...(w.doors ?? [])].sort((p, q) => p.at - q.at).map((dr) => {
    const s0 = Math.max(0.02, dr.at - dr.width / 2), s1 = Math.min(L - 0.02, dr.at + dr.width / 2);
    const head = Math.min(lvl + DOOR_H, Math.min(top(s0), top(s1)) - 0.06);
    return { dr, s0, s1, head };
  }).filter((q) => q.head - lvl > 1.2 && q.s1 - q.s0 > 0.3);

  // outline: along the floor with a notch per door, back along the (possibly sloped) top
  const pts: Vec2[] = [[0, lvl]];
  for (const q of doors) pts.push([q.s0, lvl], [q.s0, q.head], [q.s1, q.head], [q.s1, lvl]);
  pts.push([L, lvl]);
  const steps = Math.max(1, Math.ceil(L / 0.12));
  for (let i = steps; i >= 0; i--) {
    const s = (L * i) / steps, v = top(s);
    pts.push([s, Math.max(v, lvl + 0.01)]);
  }
  if (Math.max(...pts.map((p) => p[1])) - lvl < 0.05) return;
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  add('interior', (g.index ? g.toNonIndexed() : g).applyMatrix4(m), layer);

  for (const q of doors) buildDoor(house, w, q.dr, q.s0, q.s1, q.head, lvl, d, n, t, layer, add);
}

function buildDoor(house: HouseDef, w: InteriorWall, dr: InteriorDoor, s0: number, s1: number, head: number, lvl: number, d: Vec2, n: Vec2, t: number, layer: Layer, add: Add) {
  const P = (s: number, off: number): Vec2 => [w.a[0] + d[0] * s + n[0] * off, w.a[1] + d[1] * s + n[1] * off];
  const box = (part: PartName, p: Vec2, q: Vec2, h0: number, h1: number) =>
    add(part, planBox(house, Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), h0, h1), layer);
  // lining: two jambs and the head
  const e = t / 2 + 0.012;
  box('door', P(s0, -e), P(s0 + 0.03, e), lvl, head);
  box('door', P(s1 - 0.03, -e), P(s1, e), lvl, head);
  box('door', P(s0, -e), P(s1, e), head - 0.03, head);
  const kind = dr.kind ?? 'swing';
  if (kind === 'open') return;
  const o = DIR[dr.opens];
  const side = Math.sign(o[0] * n[0] + o[1] * n[1]) || 1; // which face of the wall the leaf is on
  const width = s1 - s0 - 0.06, lh = head - 0.035;
  if (kind === 'sliding') {
    // parked beside the opening, on a rail
    const a0 = dr.hinge === 'a' ? s0 - width - 0.02 : s1 + 0.02, a1 = a0 + width;
    box('cabinetDark', P(a0, side * (t / 2 + 0.02)), P(a1, side * (t / 2 + 0.06)), lvl + 0.01, lh);
    box('steel', P(Math.min(a0, s0), side * (t / 2 + 0.015)), P(Math.max(a1, s1), side * (t / 2 + 0.065)), lh, lh + 0.04);
    return;
  }
  const leaves = kind === 'fold' ? 2 : 1, len = width / leaves;
  for (let i = 0; i < leaves; i++) {
    // open at 90°: the leaf stands across the wall at the hinge side
    const sh = dr.hinge === 'b' ? s1 - 0.03 - i * 0.07 : s0 + 0.03 + i * 0.07;
    const dirIn = dr.hinge === 'b' ? -1 : 1; // towards the opening
    box(kind === 'fold' ? 'cabinet' : 'door', P(sh, side * (t / 2)), P(sh + dirIn * 0.04, side * (t / 2 + len)), lvl + 0.01, lh);
    if (!i) box('steel', P(sh - dirIn * 0.03, side * (t / 2 + len - 0.14)), P(sh + dirIn * 0.07, side * (t / 2 + len - 0.06)), lvl + 1.0, lvl + 1.02);
  }
}

// ---------------------------------------------------------------------------------------------
// Storeys and stairs
// ---------------------------------------------------------------------------------------------
function buildStorey(house: HouseDef, st: Storey, layer: Layer, underRoof: boolean, add: Add) {
  const ceilAbs = storeyCeiling(house, st, underRoof);
  for (const fl of st.floors) {
    const [x0, y0, x1, y1] = fl.rect;
    add(fl.finish, planBox(house, x0, x1, y0, y1, st.level + 0.006, st.level + 0.014), layer);
  }
  for (const w of st.walls) buildWall(house, st, w, ceilAbs, layer, add);
  for (const it of st.items) buildItem(itemFrame(house, st, it, add, layer, ceilAbs), it);
}

function buildStairs(house: HouseDef, add: Add) {
  const s = house.interior?.stairs;
  if (!s) return;
  for (const fl of s.flights) {
    const d = DIR[fl.dir], p: Vec2 = [-d[1], d[0]], hw = fl.width / 2;
    for (let i = 0; i < fl.treads; i++) {
      const top = fl.startLevel + (i + 1) * fl.rise;
      const a: Vec2 = [fl.from[0] + d[0] * i * fl.going, fl.from[1] + d[1] * i * fl.going];
      const b: Vec2 = [a[0] + d[0] * (fl.going + 0.02), a[1] + d[1] * (fl.going + 0.02)];
      const xs = [a[0] - p[0] * hw, a[0] + p[0] * hw, b[0] - p[0] * hw, b[0] + p[0] * hw], ys = [a[1] - p[1] * hw, a[1] + p[1] * hw, b[1] - p[1] * hw, b[1] + p[1] * hw];
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      add('oak', planBox(house, x0, x1, y0, y1, top - 0.04, top), 'base');
      add('interior', planBox(house, x0, x1, y0, y1, i < (fl.solid ?? 0) ? fl.startLevel : Math.max(fl.startLevel, top - fl.rise - 0.16), top - 0.04), 'base');
    }
  }
  for (const l of s.landings) {
    add('oak', planBox(house, l.x0, l.x1, l.y0, l.y1, l.level - 0.04, l.level), 'base');
    add('interior', planBox(house, l.x0, l.x1, l.y0, l.y1, l.level - 0.2, l.level - 0.04), 'base');
  }
}

export function buildInterior(house: HouseDef, add: Add) {
  const it = house.interior;
  if (!it) return;
  buildStorey(house, it.ground, 'base', false, add);
  if (it.upper) buildStorey(house, it.upper, 'upper', true, add);
  buildStairs(house, add);
}

/** every partition wall of the ground floor as a plan segment [x1, y1, x2, y2] (for the plan view) */
export const groundPartitions = (walls: InteriorWall[]): [number, number, number, number][] =>
  walls.filter((w) => w.h === undefined).map((w) => [w.a[0], w.a[1], w.b[0], w.b[1]]);
