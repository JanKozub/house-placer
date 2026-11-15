import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildHouse, footprintLocal, gableEaveUnder, gableOfWall, openingPolygon, openingSpan } from './house/geometry';
import { ambrozja17 } from './house/ambrozja17';
import { grela } from './house/grela';
import { ambrozja17Detached, detachedGarage } from './house/ambrozja17-detached';
import { buildingDef, defaultAnnexPlacement } from './house/annex';
import { carvedHeight } from './site/Terrain';
import { argania2 } from './house/argania2';
import { accessRoads, GROUND_DESIGN, isPztPlacement, layoutCars, layoutGarden, layoutGates, LOW_FLOOR_LEVEL, MID_FLOOR_LEVEL, MID_PLACEMENT, MID_SHIFT, PROJECT_LAYOUT, PZT, PZT_CARS, PZT_DRIVEWAY, PZT_GATES } from './site/sitePlan';
import { argania2Low, argania2Mid, DRIVE_FALL, GARAGE_DROP, MID_DRIVE_FALL, MID_FLAT, MID_GARAGE_DROP, MID_RISERS, RISERS } from './house/argania2-low';
import { lowerGroundPlatform, platformPolygon } from './derived';
import { fenceOpenings } from './site/Garden';
import { toLocal } from './house/geometry';
import { DEFAULT_HOUSE_ID } from './house/projects';
import { OUTBUILDINGS, wiataGaraz } from './house/outbuildings';
import { HOUSE_LIST } from './house/projects';
import { polygonAreaPlan, roofFaces, roofTopAt } from './house/roof';
import { migrateState, useStore } from './store';
import { closestOnSegment, pointInPolygon, polygonArea, polygonGap, toHouse, toSite, type P2 } from './placement/geom2d';
import { computeSetbacks, facingDistance, footprintSite, nearestCornerDistances } from './placement/setbacks';
import { computeEarthwork, offsetPolygon } from './placement/earthwork';
import { makeSite, withGround, type Road, type Survey } from './geo/site';
import { sunState, warsawDate } from './site/sun';

const T30 = Math.tan(Math.PI / 6);

// every project and every separate building in it (detached garages)
const ALL_BUILDINGS = [...HOUSE_LIST.flatMap((h) => [h, ...(h.annexes ?? []).map((a) => a.def)]), ...OUTBUILDINGS.map((k) => k.def)];

describe.each(ALL_BUILDINGS.map((h) => [h.name, h] as const))('house project %s', (_name, h) => {
  it('outline is clockwise, matches width × depth, and each wall is an outline edge', () => {
    const fp = footprintLocal(h);
    const xs = fp.map((p) => p[0]), zs = fp.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(h.width, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(h.depth, 6);
    expect(h.walls).toHaveLength(h.outline.length);
    h.walls.forEach((w, i) => {
      expect(w.a).toEqual(h.outline[i]);
      expect(w.b).toEqual(h.outline[(i + 1) % h.outline.length]);
    });
  });

  it('openings sit inside their walls, clear of the corners, below the wall top or inside its gable', () => {
    const n = h.outline.length;
    // turn at outline vertex i: > 0 convex corner, < 0 inner corner, 0 straight through
    const turn = (i: number) => {
      const p = h.outline[(i + n - 1) % n], c = h.outline[i], q = h.outline[(i + 1) % n];
      return (c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]);
    };
    for (const o of h.openings) {
      const wi = h.walls.findIndex((ww) => ww.id === o.wall);
      const w = h.walls[wi];
      expect(w).toBeTruthy();
      const { u0, u1 } = openingSpan(o, w);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      // stay clear of the neighbouring wall at a convex corner: glass inside a wall stalls the path
      // tracer (at an inner corner or a straight-through vertex the other wall is not in the way)
      expect(u0).toBeGreaterThanOrEqual((turn(wi) > 1e-9 ? h.wallThickness : 0) - 1e-9);
      expect(u1).toBeLessThanOrEqual(L - (turn((wi + 1) % n) > 1e-9 ? h.wallThickness : 0) + 1e-9);
      const top = o.sill + o.height;
      if (top < (w.top ?? h.wallTop)) continue;
      // above the wall top only within the gable standing on this wall, under the roof's underside
      expect(gableOfWall(h, w)).toBeTruthy();
      const under = (u: number) => gableEaveUnder(h) + Math.min(u, L - u) * Math.tan((h.roof.pitchDeg * Math.PI) / 180);
      for (const [u, v] of openingPolygon(h, o, u0, u1)) expect(v).toBeLessThan(under(u) - 0.1);
    }
  });

  it('roof faces tile the roof outline and the surface is continuous', () => {
    const faces = roofFaces(h);
    const sum = faces.reduce((s, f) => s + polygonAreaPlan(f.poly), 0);
    expect(sum).toBeCloseTo(polygonAreaPlan(h.roof.outline), 3);
    // every face vertex is on the surface (no steps between faces)
    for (const f of faces) for (const [X, Y] of f.poly) expect(f.h(X, Y)).toBeCloseTo(roofTopAt(h, X, Y)!, 6);
    // ridge height from the section
    let top = -Infinity;
    for (const f of faces) for (const [X, Y] of f.poly) top = Math.max(top, f.h(X, Y));
    expect(top).toBeCloseTo(h.roof.ridgeTop, 2);
    expect(top + h.plinth).toBeCloseTo(h.heightTotal, 2);
  });

  it('roof covers the whole house, above the walls and the eave soffit', () => {
    for (const [X, Y] of h.outline) {
      const r = roofTopAt(h, X, Y);
      expect(r).not.toBeNull();
      expect(r! - h.roof.thickness / Math.cos(Math.PI / 6)).toBeGreaterThan(h.roof.soffit);
    }
  });

  it('builds geometry whose bounds match the outline + overhangs', () => {
    const parts = buildHouse(h);
    const box = new THREE.Box3();
    for (const g of Object.values(parts)) box.union(g!.boundingBox!);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(h.width);
    expect(size.x).toBeLessThan(h.width + 3);
    expect(size.z).toBeGreaterThan(h.depth);
    expect(size.z).toBeLessThan(h.depth + 7); // incl. a terrace / pergola and outside stairs
    if (h.roof.chimneys.length) expect(box.max.y).toBeGreaterThan(h.roof.ridgeTop); // chimneys above the ridge line
    else expect(box.max.y).toBeCloseTo(h.roof.ridgeTop, 2);
    expect(parts.glass).toBeTruthy();
    expect(parts.roof!.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('Ambrozja 17', () => {
  const h = ambrozja17;
  it('footprint matches the drawing (16.85 × 22.85 m; ≈ 258.7 m² of walls, spec 260.7 incl. carport posts/rounding)', () => {
    const fp = footprintLocal(h);
    expect(polygonArea(fp)).toBeGreaterThan(257.5);
    expect(polygonArea(fp)).toBeLessThan(261);
  });

  it('ridge is +6.32 / 6.94 m above terrain (section), both wings share it', () => {
    const R = (7.8 + 16.85) / 2;
    expect(roofTopAt(h, R, 5)!).toBeCloseTo(6.32, 3);
    expect(roofTopAt(h, R, 5)! + h.plinth).toBeCloseTo(6.94, 2);
    expect(roofTopAt(h, 3, (6.6 + 15.65) / 2)!).toBeCloseTo(6.32, 6);
  });

  it('generic roof volumes reproduce the original two-wing formula', () => {
    const Hw = 6.32 - (9.05 / 2) * T30;
    const old = (X: number, Y: number) => {
      let r: number | null = null;
      if (X >= 6.8 && X <= 17.85 && Y >= -0.5 && Y <= 23.35) r = Hw + (4.525 - Math.abs(X - 12.325)) * T30;
      if (X >= -0.5 && X <= 12.325 && Y >= 5.6 && Y <= 16.65) {
        const l = Hw + (4.525 - Math.abs(Y - 11.125)) * T30;
        r = r === null ? l : Math.max(r, l);
      }
      return r;
    };
    for (let X = -0.6; X <= 18; X += 0.37)
      for (let Y = -0.6; Y <= 23.5; Y += 0.41) {
        const a = old(X, Y), b = roofTopAt(h, X, Y);
        if (a === null) expect(b).toBeNull();
        else expect(b!).toBeCloseTo(a, 6);
      }
  });

  it('openings match the project schedule', () => {
    expect(h.openings).toHaveLength(12);
    for (const o of h.openings) expect(o.sill + o.height).toBeLessThanOrEqual(2.35 + 1e-9); // all heads at +2.35 or lower
  });
});

describe('Dom Grela (TE-DE)', () => {
  const h = grela;
  it('walls + covered terrace + entrance recess = pow. zabudowy 272.35 m²', () => {
    const walls = polygonArea(footprintLocal(h));
    expect(walls).toBeCloseTo(15.81 * 12.58 - 6.56 * 2.86 - 2.57 * 0.8 + 6.69 * 10.98, 6);
    expect(walls + 6.56 * 2.86 + 2.57 * 0.8).toBeCloseTo(272.35, 1);
  });

  it('main ridge +7.16 over 30° hips from +3.07 eaves; garage ridge lower, meeting the main hip', () => {
    expect(roofTopAt(h, 8, 6.29)!).toBeCloseTo(7.16, 2);
    expect(roofTopAt(h, -0.8, 6)!).toBeCloseTo(3.07, 6);
    expect(roofTopAt(h, 15, 6.29)!).toBeCloseTo(3.07 + 6.29 * T30, 6); // garage ridge ≈ +6.70
    expect(roofTopAt(h, 15, 6.29)!).toBeLessThan(7.16);
    expect(roofTopAt(h, 23.3, 6.29)!).toBeCloseTo(3.07, 6); // garage hip end
    // the garage ridge comes out of the main roof's east hip at X ≈ 10.3 (roof plan)
    const emerge = 16.61 - 6.29;
    expect(roofTopAt(h, emerge - 0.2, 6.29)!).toBeCloseTo(3.07 + (16.61 - (emerge - 0.2)) * T30, 6);
    expect(roofTopAt(h, emerge + 0.2, 6.29)!).toBeCloseTo(3.07 + 6.29 * T30, 6);
  });

  it('has every room of the schedule (16) summing to the usable area', () => {
    expect(h.rooms).toHaveLength(16);
    const sum = h.rooms.reduce((s, r) => s + r.area, 0);
    expect(sum).toBeCloseTo(204.7, 1);
  });
});

describe('Ambrozja 17 with a detached garage', () => {
  const h = ambrozja17Detached, g = detachedGarage;
  it('house is the original without the garage wing: 16.85 × 15.65 m, straight front, no garage door or carport', () => {
    expect([h.width, h.depth]).toEqual([16.85, 15.65]);
    expect(polygonArea(h.outline)).toBeCloseTo(16.85 * 15.65 - 7.8 * 6.6, 6);
    expect(h.openings.some((o) => o.kind === 'garage')).toBe(false);
    expect(h.openings).toHaveLength(ambrozja17.openings.length - 1);
    expect(h.porches).toHaveLength(0);
    expect(h.rooms.some((r) => r.name.includes('Garaż'))).toBe(false);
    // the front roof edge is level: living-wing eave and the bedroom wing's 1 m gable overhang meet
    const eave = h.roof.topAtWall - h.roof.eaveOverhang * T30;
    for (const X of [-0.5, 3, 6.8]) expect(roofTopAt(h, X, 15.65 + 1.0)).toBeCloseTo(eave, 6);
    expect(h.roof.ridgeTop).toBeCloseTo(ambrozja17.roof.ridgeTop, 6);
  });

  it('garage is the original room 1/17 standing alone, lower than the house', () => {
    expect([g.width, g.depth]).toEqual([6.45, 7.9]);
    expect((g.width - 2 * g.wallThickness) * (g.depth - 2 * g.wallThickness)).toBeCloseTo(38.85, 2);
    expect(g.openings.find((o) => o.kind === 'garage')).toMatchObject({ width: 4.5, height: 2.25 });
    // on the same ground the garage ridge stays below the house ridge, and the eaves line up
    expect(g.roof.ridgeTop + g.plinth).toBeLessThan(h.roof.ridgeTop + h.plinth);
    expect(g.roof.topAtWall + g.plinth).toBeCloseTo(h.roof.topAtWall + h.plinth, 6);
    expect(h.annexes?.[0].def).toBe(g);
  });

  it('starts 3 m in front of the house, wherever the house stands', () => {
    for (const bearing of [0, 137, 222]) {
      const pl = { x: 5, z: -3, bearing, mirror: false };
      const gp = defaultAnnexPlacement(h, h.annexes![0], pl);
      expect(gp.bearing).toBe(bearing);
      const gap = polygonGap(footprintSite(h, pl), footprintSite(g, gp));
      expect(gap.overlap).toBe(false);
      expect(gap.d).toBeCloseTo(3, 1);
    }
  });

  it('measures the gap between two buildings and flags overlap', () => {
    const a: P2[] = [[0, 0], [10, 0], [10, 8], [0, 8]];
    const b: P2[] = [[13, 2], [18, 2], [18, 6], [13, 6]];
    expect(polygonGap(a, b)).toMatchObject({ d: 3, overlap: false });
    expect(polygonGap(a, b.map(([x, z]) => [x - 5, z] as P2)).overlap).toBe(true);
  });
});

describe('Dom w Arganiach 2 (G2E)', () => {
  const h = argania2;
  const T38 = Math.tan((38 * Math.PI) / 180);
  it('L-shaped 14.30 × 12.40 m as adapted on the PZT (7.40 + 6.90, 8.70 + 3.70); catalogue 150.82 m² had 3.75', () => {
    expect([h.width, h.depth]).toEqual([14.3, 12.4]);
    expect(polygonArea(h.outline)).toBeCloseTo(14.3 * 8.7 + 6.9 * 3.7, 2);
    // the catalogue area (12.45 deep, with the 1 cm render) minus the 5 cm the PZT takes off the wing
    expect(Math.abs(polygonArea(h.outline) + 6.9 * 0.05 - h.footprintArea)).toBeLessThan(0.8);
  });

  it('room schedules: ground floor 114.75 m² (garage 35.20), attic 89.33 m², together the usable 204.08', () => {
    const gf = h.rooms.reduce((s, r) => s + r.area, 0), up = h.upperRooms!.reduce((s, r) => s + r.area, 0);
    expect(gf).toBeCloseTo(114.75, 2);
    expect(up).toBeCloseTo(89.33, 2);
    expect(gf + up).toBeCloseTo(h.usableArea, 2);
    expect(h.rooms.find((r) => r.name.includes('Garaż'))!.area).toBe(35.2);
  });

  it('38° roof, ridge +7.98 (section); the garage-wing ridge is lower and meets the main front slope', () => {
    expect(h.roof.pitchDeg).toBe(38);
    expect(roofTopAt(h, 7, 4.35)).toBeCloseTo(7.98, 6);
    const wing = roofTopAt(h, 10.85, 11)!;
    expect(wing).toBeCloseTo(h.roof.topAtWall + (6.9 / 2) * T38, 6);
    expect(wing).toBeLessThan(7.98 - 0.5);
  });

  it('attic windows open from the attic floor, inside their gables; the glazed gable follows the roof', () => {
    const attic = h.openings.filter((o) => o.level);
    expect(attic).toHaveLength(5);
    for (const o of attic) {
      expect(o.level).toBe(h.upperFloor!.level);
      expect(o.sill).toBeGreaterThanOrEqual(h.upperFloor!.level);
    }
    const g = h.openings.find((o) => o.shape === 'gable')!;
    const w = h.walls.find((ww) => ww.id === g.wall)!;
    const { u0, u1 } = openingSpan(g, w);
    const poly = openingPolygon(h, g, u0, u1);
    expect(poly).toHaveLength(5);
    // sloped edges parallel to the roof
    expect((poly[3][1] - poly[2][1]) / (poly[3][0] - poly[2][0])).toBeCloseTo(-T38, 6);
  });

  it('builds roof windows on the slopes, façade zones, the upper floor and the pergola', () => {
    const parts = buildHouse(h);
    expect(parts.accent!.getAttribute('position').count).toBeGreaterThan(0);
    expect(parts.wood!.getAttribute('position').count).toBeGreaterThan(0);
    const faces = roofFaces(h);
    for (const rw of h.roofWindows!) expect(faces.some((f) => pointInPolygon(rw.at, f.poly))).toBe(true);
    // the attic floor is drawn at +3.06
    parts.floor!.computeBoundingBox();
    expect(parts.floor!.boundingBox!.max.y).toBeCloseTo(3.065, 3);
  });
});

describe('extra buildings: wiata + magazyn + garaż', () => {
  const h = wiataGaraz;
  it('12.11 × 7.10 m (4.50 + 3.51 + 4.10), 30° roof with the ridge at +5.40 (section A-A)', () => {
    expect([h.width, h.depth]).toEqual([12.11, 7.1]);
    expect(h.roof.pitchDeg).toBe(30);
    expect(roofTopAt(h, 6, 3.55)).toBeCloseTo(5.4, 6);
    expect(h.roof.chimneys[0].top).toBeCloseTo(5.9, 6); // 0.50 above the ridge
    expect(h.rooms.reduce((s, r) => s + r.area, 0)).toBeCloseTo(77.6, 2);
  });

  it('open wiata sides build no wall but still count for setbacks, as open (4 m)', () => {
    const open = h.walls.filter((w) => w.open).map((w) => w.id);
    expect(open).toEqual(['west', 'frontOpen']);
    // a closed copy builds more plaster than the one with the open wiata
    const plaster = (d: typeof h) => buildHouse(d).plaster!.getAttribute('position').count;
    expect(plaster({ ...h, walls: h.walls.map((w) => ({ ...w, open: false })) })).toBeGreaterThan(plaster(h));
    const parcel: P2[] = [[-50, -50], [50, -50], [50, 50], [-50, 50]];
    const sb = computeSetbacks(h, { x: 0, z: 0, bearing: 180, mirror: false }, parcel);
    const byId = Object.fromEntries(sb.walls.map((w) => [w.wallId, w]));
    expect(byId.west.required).toBe(4);
    expect(byId.frontOpen.hasOpenings).toBe(true);
    expect(byId.south.required).toBe(3); // the full south wall has no openings
  });

  it('are shared by all projects; adding selects it, removing hands control back to the house', () => {
    const s = useStore.getState();
    s.set({ projectId: 'ambrozja17', projectState: {}, outbuildings: [], target: 'main' });
    const id = useStore.getState().addOutbuilding('wiata-garaz', { x: 10, z: 5, bearing: 90, mirror: false });
    expect(useStore.getState().target).toBe(id);
    useStore.getState().setProject('argania2');
    expect(useStore.getState().outbuildings.map((o) => o.id)).toEqual([id]);
    expect(useStore.getState().target).toBe('main');
    useStore.getState().set({ target: id });
    useStore.getState().removeOutbuilding(id);
    expect(useStore.getState().outbuildings).toHaveLength(0);
    expect(useStore.getState().target).toBe('main');
  });

  it('resolves an extra building\'s own size for the plan tools (rotate handle)', () => {
    useStore.getState().set({ projectId: 'ambrozja17', outbuildings: [] });
    const id = useStore.getState().addOutbuilding('wiata-garaz', { x: 0, z: 0, bearing: 0, mirror: false });
    expect(buildingDef(ambrozja17, id)).toBe(wiataGaraz);
    expect(buildingDef(ambrozja17Detached, 'garage')).toBe(detachedGarage);
    expect(buildingDef(ambrozja17, 'main')).toBe(ambrozja17);
    useStore.getState().removeOutbuilding(id);
  });

  it('migrates v3 storage (no extra buildings)', () => {
    const out = migrateState({ projectId: 'argania2', annexes: {}, target: 'main' }, 3) as { outbuildings: unknown[]; projectId: string };
    expect(out.outbuildings).toEqual([]);
    expect(out.projectId).toBe('argania2');
  });
});

describe('placement transforms', () => {
  it('toSite / toHouse round-trip incl. mirror', () => {
    for (const mirror of [false, true]) {
      const pl = { x: 3, z: -4, bearing: 222, mirror };
      const p: P2 = [1.5, -7];
      const q = toHouse(toSite(p, pl), pl);
      expect(q[0]).toBeCloseTo(p[0], 9);
      expect(q[1]).toBeCloseTo(p[1], 9);
    }
  });

  it('front (+z local) points along the bearing', () => {
    const pl = { x: 0, z: 0, bearing: 90, mirror: false }; // facing east
    const f = toSite([0, 1], pl);
    expect(f[0]).toBeCloseTo(1, 9);
    expect(f[1]).toBeCloseTo(0, 9);
    const n = toSite([0, 1], { ...pl, bearing: 0 }); // north = −z
    expect(n[1]).toBeCloseTo(-1, 9);
  });

  it('mirroring keeps area and bounding size', () => {
    const a = footprintLocal(ambrozja17).map((p) => toSite(p, { x: 0, z: 0, bearing: 30, mirror: true }));
    expect(polygonArea(a)).toBeCloseTo(polygonArea(footprintLocal(ambrozja17)), 6);
  });
});

describe('setbacks', () => {
  const big: P2[] = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
  it('measures perpendicular distance to the boundary in front of each wall', () => {
    // house centred, front facing south; east wall at x = 8.425 → 21.575 m from x=30
    const r = computeSetbacks(ambrozja17, { x: 0, z: 0, bearing: 180, mirror: false }, big);
    const east = r.walls.find((w) => w.wallId === 'east')!;
    expect(east.distance).toBeCloseTo(30 - 16.85 / 2, 2);
    expect(r.insideParcel).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('flags walls closer than 4 m (with windows) / 3 m (blank)', () => {
    // shift east so the east wall (windows) is 3.0 m from the boundary
    const x = 30 - 3 - 16.85 / 2;
    const r = computeSetbacks(ambrozja17, { x, z: 0, bearing: 180, mirror: false }, big);
    const east = r.walls.find((w) => w.wallId === 'east')!;
    expect(east.distance).toBeCloseTo(3, 2);
    expect(east.status).toBe('fail');
    expect(r.ok).toBe(false);
  });

  it('measures every wall to each boundary edge it faces, never through the house', () => {
    const r = computeSetbacks(ambrozja17, { x: 0, z: 0, bearing: 180, mirror: false }, big);
    const fp = footprintSite(ambrozja17, { x: 0, z: 0, bearing: 180, mirror: false });
    for (const w of r.walls) {
      expect(w.all.length).toBe(1); // axis-aligned house in a square plot: one facing edge per wall
      for (const e of w.all) {
        const mid: P2 = [(e.p[0] + e.q[0]) / 2, (e.p[1] + e.q[1]) / 2];
        expect(pointInPolygon(mid, fp)).toBe(false);
      }
    }
    // a pentagon with an oblique edge: some walls face two boundary edges
    const pent: P2[] = [[-30, -30], [30, -30], [30, 10], [10, 30], [-30, 30]];
    const r2 = computeSetbacks(ambrozja17, { x: 0, z: 0, bearing: 180, mirror: false }, pent);
    expect(r2.walls.some((w) => w.all.length >= 2)).toBe(true);
  });

  it('gives each house corner its distance to the nearest plot edge', () => {
    const pl = { x: 0, z: 0, bearing: 180, mirror: false };
    const r = nearestCornerDistances(ambrozja17, pl, big);
    // axis-aligned in a square plot, the two inner corners of the L could only be measured
    // along a wall, so they are skipped; the six outer corners all get a distance
    expect(r.filter((c) => c.corner >= 0).map((c) => c.label)).toEqual(['A', 'C', 'D', 'D', 'E', 'E', 'F', 'H']);
    // D and E get both faced edges, distinct and nearest first
    for (const L of ['D', 'E']) {
      const two = r.filter((c) => c.label === L);
      expect(two[0].edge).not.toBe(two[1].edge);
      expect(two[0].d).toBeLessThanOrEqual(two[1].d);
    }
    // the terrace corner is measured too
    expect(r.filter((c) => c.label === 'T').length).toBe(1);
    // corner A = plan (0, 6.60) → site (−8.425, −4.825): nearest edge is x = −30
    const A = r.find((c) => c.corner === 0)!;
    expect(A.d).toBeCloseTo(30 - 8.425, 6);
    // no measurement may pass through the house
    const fp = footprintSite(ambrozja17, pl);
    for (const c of r) {
      const mid: P2 = [(c.p[0] + c.q[0]) / 2, (c.p[1] + c.q[1]) / 2];
      expect(pointInPolygon(mid, fp)).toBe(false);
    }
  });

  it('measures corners to the plot edges they face, not simply the closest', () => {
    // corner D (plan 16.85, 0 → site 8.425, −11.425) is closest to the diagonal cut (≈15.7 m),
    // but its walls face north (top edge) and east (right edge)
    const cut: P2[] = [[-30, -30], [12, -30], [30, -12], [30, 30], [-30, 30]];
    const r = nearestCornerDistances(ambrozja17, { x: 0, z: 0, bearing: 180, mirror: false }, cut);
    const D = r.filter((c) => c.label === 'D');
    expect(D.map((c) => c.edge).sort()).toEqual([0, 2]);
    expect(D.find((c) => c.edge === 0)!.d).toBeCloseTo(30 - 11.425, 6);
    expect(D.find((c) => c.edge === 2)!.d).toBeCloseTo(30 - 8.425, 6);
  });

  it('ignores boundaries that are only diagonal from a wall end', () => {
    // wall along x from 0..10 at z=0, outward is −z; boundary corner at (12,-1)…(20,-1) lies outside the strip
    const fp: P2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const parcel: P2[] = [[-5, -6], [11, -6], [11, -1], [20, -1], [20, 20], [-5, 20]];
    const r = facingDistance([0, 0], [10, 0], fp, parcel);
    expect(r.d).toBeCloseTo(6, 6);
  });
});

describe('earthwork', () => {
  it('balanced cut/fill on a uniform slope', () => {
    const sq: P2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const slope = (x: number) => 100 + 0.1 * x; // 1 m over 10 m
    const e = computeEarthwork(sq, 100.5, (x) => slope(x), 0.25);
    expect(e.area).toBeCloseTo(100, 0);
    expect(e.cut).toBeCloseTo(12.5, 0); // ½·5·0.5·10
    expect(e.fill).toBeCloseTo(12.5, 0);
  });
  it('offsetPolygon grows a square outward', () => {
    const sq: P2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(polygonArea(offsetPolygon(sq, 1))).toBeCloseTo(144, 6);
    expect(polygonArea(offsetPolygon([...sq].reverse(), 1))).toBeCloseTo(144, 6);
  });
});

describe('site data (public/site)', () => {
  const meta = JSON.parse(readFileSync('public/site/site.json', 'utf8'));
  const parcel = JSON.parse(readFileSync('public/site/parcel.json', 'utf8'));
  const dem = readFileSync('public/site/dem.bin');
  const site = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false);

  it('parcel 664/2 area ≈ 1503 m²', () => {
    expect(polygonArea(site.parcel)).toBeGreaterThan(1490);
    expect(polygonArea(site.parcel)).toBeLessThan(1515);
  });

  it('DEM heights at parcel corners match GUGiK point queries (355–358 m)', () => {
    for (const [x, z] of site.parcel) {
      const h = site.dem.heightAt(x, z);
      expect(h).toBeGreaterThan(354.5);
      expect(h).toBeLessThan(358.5);
    }
    // first vertex: GetHByPointList returned 355.4
    expect(site.dem.heightAt(...site.parcel[0])).toBeCloseTo(355.4, 0);
  });

  it('carves a platform for every building (house + detached garage)', () => {
    const sq = (x: number, z: number, r: number): P2[] => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
    const house = { polygon: sq(0, 0, 8), h: 350 }, garage = { polygon: sq(25, 0, 4), h: 360 };
    expect(carvedHeight(site, 0, 0, [house, garage])).toBe(350);
    expect(carvedHeight(site, 25, 0, [house, garage])).toBe(360);
    // far from both platforms the terrain is untouched
    expect(carvedHeight(site, -60, 40, [house, garage])).toBeCloseTo(site.dem.heightAt(-60, 40), 6);
    // just outside the garage: on its embankment, between its platform and the terrain
    const t = site.dem.heightAt(29.5, 0);
    const e = carvedHeight(site, 29.5, 0, [house, garage]);
    expect(e).toBeGreaterThan(Math.min(t, 360) - 1e-6);
    expect(e).toBeLessThan(Math.max(t, 360) + 1e-6);
  });

  it('PZT position: Dom w Arganiach\'s back-left corner is 10.87 m from the south-west boundary, as on the map', () => {
    const fp = footprintSite(argania2, PZT.placement);
    const [a, b] = [site.parcel[2], site.parcel[3]];
    const q = closestOnSegment(fp[0], a, b);
    expect(Math.hypot(fp[0][0] - q[0], fp[0][1] - q[1])).toBeCloseTo(10.87, 1);
    expect(fp.every((c) => pointInPolygon(c, site.parcel))).toBe(true);
  });

  it('terrain is shifted to EVRF2007 and passes through the surveyed spot heights (PZT)', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const fitted = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    expect(survey.datumShift).toBeCloseTo(0.15, 2);
    expect(survey.points.length).toBeGreaterThan(50);
    // outside the plot the ground is as surveyed; inside it is the design levelling
    const outside = survey.points.filter(([x, z]) => !pointInPolygon([x, z], fitted.parcel));
    expect(outside.length).toBeGreaterThan(20);
    for (const [x, z, hh] of outside) expect(Math.abs(fitted.dem.heightAt(x, z) - hh)).toBeLessThan(0.06);
    // far from the survey only the height-system shift applies
    expect(fitted.dem.heightAt(-140, 140) - site.dem.heightAt(-140, 140)).toBeCloseTo(0.15, 3);
  });

  it('the plot is levelled 5 cm below the PZT floor (356.95): a ~0.7–0.9 m cut below the road, an embankment over 1 m at the east corner fading to the gate', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const f = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    const P = f.parcel;
    const cen = P.reduce((m, p) => [m[0] + p[0] / P.length, m[1] + p[1] / P.length], [0, 0]);
    expect(f.dem.heightAt(cen[0], cen[1])).toBeCloseTo(356.95, 2);
    // the house of the PZT stands on that ground: floor − plinth is the plot level, so nothing is dug out around it
    expect(PZT.floorLevel - argania2.plinth).toBeCloseTo(survey.design!.level, 6);
    const ew = computeEarthwork(platformPolygon(argania2, PZT.placement), PZT.floorLevel - argania2.plinth, (x, z) => f.dem.heightAt(x, z), 0.5);
    expect(ew.cut).toBeLessThan(0.5);
    expect(ew.fill).toBeLessThan(0.5);
    const step = (e: number, t: number, outer: number, inner: number) => {
      const a = P[e], b = P[(e + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      let n = [-d[1], d[0]];
      if ((cen[0] - (a[0] + b[0]) / 2) * n[0] + (cen[1] - (a[1] + b[1]) / 2) * n[1] < 0) n = [-n[0], -n[1]];
      const at = (o: number) => f.dem.heightAt(a[0] + (b[0] - a[0]) * t + n[0] * o, a[1] + (b[1] - a[1]) * t + n[1] * o);
      return at(inner) - at(outer);
    };
    expect(step(2, 0.5, 1.0, 3.0)).toBeLessThan(-0.6); // road side: cut down from the road
    expect(step(0, 0.1, 0, 3.0)).toBeGreaterThan(1.0); // north-east, near the east corner: embankment
    expect(step(0, 0.75, 0, 3.0)).toBeLessThan(0.5); // the same embankment runs out towards the gate, as the PZT draws it
  });

  it('PZT slope bands sit along all six plot edges at the drawn widths, inside the plot', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const fitted = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    expect(fitted.slopes).toHaveLength(6);
    fitted.slopes.forEach((q, i) => {
      const b = survey.slopes![i];
      // drawn as wedges: the width at the band's start and at its end
      const [w0, w1] = Array.isArray(b.inner) ? b.inner : [b.inner, b.inner];
      expect(Math.hypot(q.b0[0] - q.a0[0], q.b0[1] - q.a0[1])).toBeCloseTo(w0 - b.outer, 6);
      expect(Math.hypot(q.b1[0] - q.a1[0], q.b1[1] - q.a1[1])).toBeCloseTo(w1 - b.outer, 6);
      const mid: P2 = [(q.a0[0] + q.a1[0] + q.b0[0] + q.b1[0]) / 4, (q.a0[1] + q.a1[1] + q.b0[1] + q.b1[1]) / 4];
      expect(pointInPolygon(mid, fitted.parcel)).toBe(true);
    });
  });

  it('PZT forecourt: the drawn curb (plan X 7.40 / Y 19.88 / X 3.04 / Y 9.90), out to the NE and NW boundary lines 0.3 m inside', () => {
    const plan = PZT_DRIVEWAY.points.map((p) => {
      const l = toHouse(p, PZT.placement);
      const q = toLocal(argania2, 0, 0); // plan origin in house-local coords
      return [l[0] - q[0], l[1] - q[1]];
    });
    const drawn = [[-0.85, 8.7], [-0.85, 9.9], [3.04, 9.9], [3.04, 19.88], [7.4, 19.88], [7.4, 22.15], [18.2, 21.35], [19.27, 12.4], [14.3, 12.4], [7.4, 12.4], [7.4, 8.7]];
    // plan axes may be flipped against house-local ones: compare via distances between vertices
    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) expect(Math.abs(dist(plan[i], plan[j]) - dist(drawn[i], drawn[j]))).toBeLessThan(0.03);
    // the garage door front (plan Y 12.40, X 7.40–14.30) is the yard's edge
    const fp = footprintSite(argania2, PZT.placement);
    expect(fp.some((c) => Math.hypot(c[0] - PZT_DRIVEWAY.points[9][0], c[1] - PZT_DRIVEWAY.points[9][1]) < 0.02)).toBe(true);
    // the two far corners sit on the boundary lines: 0.3 m inside the NE (edge 0) and NW (edge 1) boundary
    const off = (p: P2, e: number) => { const a = site.parcel[e], b = site.parcel[(e + 1) % site.parcel.length]; const q = closestOnSegment(p, a, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    expect(off(PZT_DRIVEWAY.points[5], 0)).toBeCloseTo(0.3, 1);
    expect(off(PZT_DRIVEWAY.points[6], 0)).toBeCloseTo(0.3, 1);
    expect(off(PZT_DRIVEWAY.points[7], 1)).toBeCloseTo(0.3, 1);
  });

  it('PZT entrance: 4.5 m sliding gate centred on the garage door and a 1 m wicket in the north-east fence', () => {
    const [a, b] = [site.parcel[0], site.parcel[1]]; // north-east edge
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const open = fenceOpenings(site.parcel, 0, [PZT_DRIVEWAY.points], PZT_GATES);
    expect(open.map(([o, c, k]) => [Math.round((c - o) * 100) / 100, k])).toEqual([[1, 'wicket'], [4.5, 'sliding']]);
    // the forecourt stops at the boundary line, so the fence only opens at the gates
    expect(fenceOpenings(site.parcel, 0, [PZT_DRIVEWAY.points], [])).toEqual([]);
    const fp = footprintSite(argania2, PZT.placement);
    // straight out from the garage door (plan X 10.82) along the house axis to the fence line (plan Y ≈ 22.0)
    const doorMid = toSite(toLocal(argania2, 10.82, 22.0), PZT.placement);
    const sDoor = (doorMid[0] - a[0]) * d[0] + (doorMid[1] - a[1]) * d[1];
    expect(Math.abs((open[1][0] + open[1][1]) / 2 - sDoor)).toBeLessThan(0.15);
    // the wicket opens onto the forecourt's lane (plan X 3.04–7.40), the sliding gate onto the yard
    expect(open[0][0]).toBeGreaterThan(34.1);
    // both cars stand on the drive, clear of the house
    for (const c of PZT_CARS) {
      expect(pointInPolygon([c.x, c.z], PZT_DRIVEWAY.points)).toBe(true);
      expect(pointInPolygon([c.x, c.z], fp)).toBe(false);
    }
  });

  describe('lowered-garage variant and the access road', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const roads = JSON.parse(readFileSync('public/site/roads.json', 'utf8')) as Road[];
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, roads, [], [], survey);
    const low = withGround(base, GROUND_DESIGN[argania2Low.id]);
    const pl = PZT.placement;
    const at = (X: number, Y: number) => toSite(toLocal(argania2Low, X, Y), pl);
    const lower = lowerGroundPlatform(argania2Low, pl, LOW_FLOOR_LEVEL)!;
    const platforms = [lower, { polygon: platformPolygon(argania2Low, pl), h: LOW_FLOOR_LEVEL - argania2Low.plinth }];
    const ground = (X: number, Y: number) => carvedHeight(low, ...at(X, Y), platforms);

    it('the house is the same; only the garage door and its wall reach 1.5 m lower, with 9 equal risers to the entrance', () => {
      expect(argania2Low.outline).toEqual(argania2.outline);
      expect(argania2Low.roof).toBe(argania2.roof);
      const door = argania2Low.openings.find((o) => o.kind === 'garage')!;
      expect(door.sill).toBe(-GARAGE_DROP);
      expect(argania2Low.walls.find((w) => w.id === door.wall)!.base).toBe(-GARAGE_DROP);
      expect(argania2Low.walls.filter((w) => w.base !== undefined)).toHaveLength(1);
      // stairs: landing −0.02, eight treads, forecourt −1.52: nine risers of 1/6 m
      expect([GARAGE_DROP, RISERS]).toEqual([1.5, 9]);
      const treads = argania2Low.extras!.filter((e) => e.part === 'paving').map((e) => e.h1).sort((a, b) => b - a);
      const levels = [-0.02, ...treads, argania2Low.lowerGround!.top];
      expect(levels).toHaveLength(RISERS + 1);
      for (let i = 1; i < levels.length; i++) expect(levels[i - 1] - levels[i]).toBeCloseTo(GARAGE_DROP / RISERS, 6);
      expect(buildHouse(argania2Low).plaster.attributes.position.count).toBeGreaterThan(buildHouse(argania2).plaster.attributes.position.count - 1);
    });

    it('design ground: the plot at the house\'s ground level, every slope 2 m inside the fence; the PZT ground is untouched', () => {
      const cen = base.parcel.reduce((m, p) => [m[0] + p[0] / base.parcel.length, m[1] + p[1] / base.parcel.length], [0, 0]);
      expect(base.dem.heightAt(cen[0], cen[1])).toBeCloseTo(356.95, 2);
      // the same rule as the PZT ground: 5 cm below the floor
      expect(argania2Low.plinth).toBe(argania2.plinth);
      expect(low.dem.heightAt(cen[0], cen[1])).toBeCloseTo(LOW_FLOOR_LEVEL - 0.05, 2);
      expect(withGround(base, GROUND_DESIGN[argania2Low.id])).toBe(low); // cached
      expect(withGround(base, GROUND_DESIGN.argania2)).toBe(base); // no own design: the survey's
      expect(low.slopes).toHaveLength(6);
      const off = (p: P2, e: number) => { const a = low.parcel[e], b = low.parcel[(e + 1) % low.parcel.length]; const q = closestOnSegment(p, a, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
      low.slopes.forEach((q, e) => expect(off(q.a0, e)).toBeCloseTo(2, 6));
      // 1.5 m inside the fence the ground is still as surveyed (the level strip the user asked for)
      const a = low.parcel[5], b = low.parcel[0], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L].map((v) => v * Math.sign((cen[0] - a[0]) * -(b[1] - a[1]) + (cen[1] - a[1]) * (b[0] - a[0])));
      const p: P2 = [(a[0] + b[0]) / 2 + n[0] * 1.5, (a[1] + b[1]) / 2 + n[1] * 1.5];
      const raw = new Float32Array(base.surveyed!);
      const i = Math.floor((p[0] - low.dem.x0) / low.dem.res - 0.5), j = Math.floor((p[1] - low.dem.z0) / low.dem.res - 0.5);
      expect(low.dem.data[j * low.dem.width + i]).toBeCloseTo(raw[j * low.dem.width + i], 5);
    });

    it('forecourt: garage level at the door, a sharp 1.5 m step at the garage front, about 5% down to the surveyed ground at the gate', () => {
      const G = LOW_FLOOR_LEVEL - GARAGE_DROP - 0.02;
      expect(ground(10.8, 12.6)).toBeCloseTo(G, 6); // in front of the garage door
      expect(ground(10.8, 14.7)).toBeCloseTo(G, 6); // still flat 2.3 m out
      expect(ground(10.8, 11.5)).toBeCloseTo(LOW_FLOOR_LEVEL - 0.05, 6); // under the house: the building platform
      expect(ground(2.0, 11.0)).toBeCloseTo(LOW_FLOOR_LEVEL - 0.05, 6); // by the kitchen: upper ground
      expect(ground(6.0, 15.1)).toBeCloseTo(G - DRIVE_FALL * 0.3, 6); // foot of the stairs, 0.3 m past the flat part
      expect((ground(10.8, 15.0) - ground(10.8, 21.0)) / 6).toBeCloseTo(DRIVE_FALL, 2);
      expect(DRIVE_FALL).toBeLessThan(0.06);
      // at the gate the drive meets the surveyed ground, with no step (as in the PZT project)
      const gate = PZT_GATES[0], a = low.parcel[0], b = low.parcel[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = (gate.from + gate.to) / 2, d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      const inside: P2 = [a[0] + d[0] * m + d[1] * 0.4, a[1] + d[1] * m - d[0] * 0.4], outside: P2 = [a[0] + d[0] * m - d[1] * 0.5, a[1] + d[1] * m + d[0] * 0.5];
      expect(pointInPolygon(inside, lower.polygon)).toBe(true);
      expect(Math.abs(carvedHeight(low, inside[0], inside[1], platforms) - low.dem.heightAt(outside[0], outside[1]))).toBeLessThan(0.1);
      // the vertical step runs inside the garage wall and the retaining walls
      expect(lower.hard!.length).toBeGreaterThan(3);
      for (const q of lower.hard!) expect(pointInPolygon(q, lower.polygon) || lower.polygon.some((v) => Math.hypot(v[0] - q[0], v[1] - q[1]) < 1e-9)).toBe(true);
    });

    it('access road: from the gate along the outside of the north-east boundary, past the north corner to the asphalt road', () => {
      const [road, toGate, toWicket] = accessRoads(base.parcel, roads);
      expect(road.name).toBe('dojazd do bramy');
      const [s, e] = road.pts;
      const a = base.parcel[0], b = base.parcel[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      expect(Math.abs((e[0] - s[0]) * d[1] - (e[1] - s[1]) * d[0])).toBeLessThan(1e-6); // parallel to the boundary
      expect((e[0] - s[0]) * d[0] + (e[1] - s[1]) * d[1]).toBeGreaterThan(50); // towards and past the north corner
      for (const t of [0, 0.1, 0.2]) expect(pointInPolygon([s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t], base.parcel)).toBe(false);
      const q = closestOnSegment(s, a, b);
      expect(Math.hypot(s[0] - q[0], s[1] - q[1])).toBeCloseTo(road.width / 2 + 0.6, 6);
      // it ends on the asphalt road
      const asphalt = roads.filter((r) => r.surface === 'asphalt');
      const gap = Math.min(...asphalt.flatMap((r) => r.pts.slice(1).map((p, i) => { const c = closestOnSegment(e, r.pts[i], p); return Math.hypot(c[0] - e[0], c[1] - e[1]); })));
      expect(gap).toBeLessThan(0.01);
      // links: road axis → the gate and the wicket in the fence line
      expect(toGate.width).toBeCloseTo(4.5, 6);
      expect(toWicket.width).toBe(1.2);
      expect(pointInPolygon(toGate.pts[1], base.parcel)).toBe(true);
      expect(pointInPolygon(toGate.pts[0], base.parcel)).toBe(false);
    });
  });

  describe('compromise variant: floor 357.40, garage three steps lower, 2.5 m further from the north-west boundary, plot not levelled', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const roads = JSON.parse(readFileSync('public/site/roads.json', 'utf8')) as Road[];
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, roads, [], [], survey);
    const mid = withGround(base, GROUND_DESIGN[argania2Mid.id]);
    const pl = MID_PLACEMENT, lay = PROJECT_LAYOUT[argania2Mid.id];
    const at = (X: number, Y: number) => toSite(toLocal(argania2Mid, X, Y), pl);
    const lower = lowerGroundPlatform(argania2Mid, pl, MID_FLOOR_LEVEL)!;
    const platforms = [lower, { polygon: platformPolygon(argania2Mid, pl), h: MID_FLOOR_LEVEL - argania2Mid.plinth }];
    const ground = (X: number, Y: number) => carvedHeight(mid, ...at(X, Y), platforms);
    const surveyed = (X: number, Y: number) => mid.dem.heightAt(...at(X, Y));
    const off = (p: P2, e: number) => { const a = base.parcel[e], b = base.parcel[(e + 1) % base.parcel.length]; const q = closestOnSegment(p, a, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };

    it('the same house; the garage door reaches 0.5 m lower and is 25 cm taller, with 3 equal risers to the entrance', () => {
      expect(argania2Mid.outline).toEqual(argania2.outline);
      expect(argania2Mid.roof).toBe(argania2.roof);
      expect(argania2Mid.plinth).toBe(argania2.plinth);
      const door = argania2Mid.openings.find((o) => o.kind === 'garage')!, cat = argania2.openings.find((o) => o.kind === 'garage')!;
      expect([MID_GARAGE_DROP, MID_RISERS]).toEqual([0.5, 3]);
      expect(door.sill).toBe(-MID_GARAGE_DROP);
      expect(door.height).toBe(2.5);
      expect(door.ref).toBe('brama 500/250');
      // wall above the door, up to the catalogue's door head: 25 cm more than in the catalogue
      expect(cat.sill + cat.height - (door.sill + door.height)).toBeCloseTo(0.25, 6);
      expect(argania2Mid.walls.find((w) => w.id === door.wall)!.base).toBe(-MID_GARAGE_DROP);
      const treads = argania2Mid.extras!.filter((e) => e.part === 'paving').map((e) => e.h1).sort((a, b) => b - a);
      const levels = [-0.02, ...treads, argania2Mid.lowerGround!.top];
      expect(levels).toHaveLength(MID_RISERS + 1);
      for (let i = 1; i < levels.length; i++) expect(levels[i - 1] - levels[i]).toBeCloseTo(MID_GARAGE_DROP / MID_RISERS, 6);
      // the lowered-garage variant is built by the same code and is unchanged
      expect(argania2Low.openings.find((o) => o.kind === 'garage')!.height).toBe(cat.height);
      expect(argania2Low.platform![0]).toEqual([-1, -1]);
    });

    it('starts 2.5 m along the back wall from the PZT spot: 7.7 m from the north-west boundary instead of 5.2 m, over 20 m left on the other side', () => {
      expect(Math.hypot(pl.x - PZT.placement.x, pl.z - PZT.placement.z)).toBeCloseTo(MID_SHIFT, 2);
      expect(pl.bearing).toBe(PZT.placement.bearing);
      const nearest = (p: typeof pl, e: number) => Math.min(...footprintSite(argania2Mid, p).map((c) => off(c, e)));
      expect(nearest(PZT.placement, 1)).toBeCloseTo(5.2, 1);
      expect(nearest(pl, 1)).toBeCloseTo(7.7, 1);
      expect(nearest(pl, 5)).toBeGreaterThan(20);
      // front to back it stays where the PZT has it
      expect(Math.abs(nearest(pl, 0) - nearest(PZT.placement, 0))).toBeLessThan(0.25);
      useStore.getState().set({ projectId: 'ambrozja17', projectState: {}, placement: { x: 9, z: 9, bearing: 10, mirror: false }, floorLevel: 350 });
      useStore.getState().setProject('argania2-mid');
      expect(useStore.getState().placement).toEqual(MID_PLACEMENT);
      expect(useStore.getState().floorLevel).toBe(MID_FLOOR_LEVEL);
      expect(isPztPlacement(pl, MID_FLOOR_LEVEL)).toBe(false);
    });

    it('ground: the plot stays as surveyed (no bank at the road, no embankment at the east corner); only the house platform is level', () => {
      expect(mid.slopes).toHaveLength(0);
      expect(Array.from(mid.dem.data)).toEqual(Array.from(new Float32Array(base.surveyed!)));
      // the PZT ground has 1.4 m of embankment at the east corner; here the ground there is the surveyed one
      const e = base.parcel[0], cen = base.parcel.reduce((m, p) => [m[0] + p[0] / base.parcel.length, m[1] + p[1] / base.parcel.length], [0, 0]);
      const inE: P2 = [e[0] + (cen[0] - e[0]) * 0.12, e[1] + (cen[1] - e[1]) * 0.12];
      expect(base.dem.heightAt(inE[0], inE[1]) - mid.dem.heightAt(inE[0], inE[1])).toBeGreaterThan(0.8);
      expect(carvedHeight(mid, inE[0], inE[1], platforms)).toBeCloseTo(mid.dem.heightAt(inE[0], inE[1]), 6);
      // the floor is level with the surveyed ground at the back wall and 0.3–0.5 m below the road boundary
      expect(Math.abs(surveyed(4, -0.3) - MID_FLOOR_LEVEL)).toBeLessThan(0.1);
      expect(surveyed(4, -10.3) - MID_FLOOR_LEVEL).toBeGreaterThan(0.3);
      expect(surveyed(4, -10.3) - MID_FLOOR_LEVEL).toBeLessThan(0.5);
      // terrace and 2 m of lawn behind it are level, 5 cm under the floor; beyond, the lawn rises to the road as surveyed
      for (const Y of [-1, -3.8, -5.5]) expect(ground(4, Y)).toBeCloseTo(MID_FLOOR_LEVEL - 0.05, 6);
      expect(ground(4, -8)).toBeCloseTo(surveyed(4, -8), 6);
      expect(surveyed(4, -6) - (MID_FLOOR_LEVEL - 0.05)).toBeLessThan(0.4); // the cut behind the terrace
    });

    it('forecourt: level for 1 m at the garage door, then about 11.5% down to the surveyed ground at its own gate', () => {
      const G = MID_FLOOR_LEVEL - MID_GARAGE_DROP - 0.02;
      expect(ground(10.8, 12.6)).toBeCloseTo(G, 6);
      expect(ground(6.0, 13.2)).toBeCloseTo(G, 6); // foot of the stairs
      expect(ground(10.8, 11.5)).toBeCloseTo(MID_FLOOR_LEVEL - 0.05, 6); // under the house
      expect((ground(10.8, 15.0) - ground(10.8, 21.0)) / 6).toBeCloseTo(MID_DRIVE_FALL, 2);
      expect(MID_FLAT).toBe(1);
      expect(MID_DRIVE_FALL).toBeLessThan(0.12); // no steeper than on the PZT
      const gate = lay.gates[0], a = mid.parcel[0], b = mid.parcel[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      for (const m of [gate.from, (gate.from + gate.to) / 2, gate.to]) {
        const inside: P2 = [a[0] + d[0] * m + d[1] * 0.4, a[1] + d[1] * m - d[0] * 0.4], outside: P2 = [a[0] + d[0] * m - d[1] * 0.5, a[1] + d[1] * m + d[0] * 0.5];
        expect(pointInPolygon(inside, lower.polygon)).toBe(true);
        expect(Math.abs(carvedHeight(mid, inside[0], inside[1], platforms) - mid.dem.heightAt(outside[0], outside[1]))).toBeLessThan(0.1);
      }
    });

    it('its own forecourt, gate and cars replace the PZT ones while it is shown; the other projects keep the PZT layout', () => {
      const a = base.parcel[0], b = base.parcel[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      // the same drawn yard, moved with the house: its far corners 0.3 m inside the north-east boundary, 2.8 m from the north-west one
      expect(lay.driveway.points).toHaveLength(PZT_DRIVEWAY.points.length);
      expect(off(lay.driveway.points[5], 0)).toBeCloseTo(0.3, 1);
      expect(off(lay.driveway.points[6], 0)).toBeCloseTo(0.3, 1);
      expect(off(lay.driveway.points[7], 1)).toBeCloseTo(0.3 + MID_SHIFT, 1);
      expect(lay.driveway.points.every((p) => pointInPolygon(p, base.parcel))).toBe(true);
      // the lowered forecourt lies on that yard
      for (const q of lower.polygon.slice(-5)) expect(lay.driveway.points.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02)).toBe(true);
      // the fence opens only at the gates; the sliding gate is centred on the garage door
      const open = fenceOpenings(base.parcel, 0, [lay.driveway.points], lay.gates);
      expect(open.map(([o, c, k]) => [Math.round((c - o) * 100) / 100, k])).toEqual([[1, 'wicket'], [4.5, 'sliding']]);
      const doorMid = at(10.82, 22.0);
      expect(Math.abs((open[1][0] + open[1][1]) / 2 - ((doorMid[0] - a[0]) * d[0] + (doorMid[1] - a[1]) * d[1]))).toBeLessThan(0.15);
      const fp = footprintSite(argania2Mid, pl);
      for (const c of lay.cars) {
        expect(pointInPolygon([c.x, c.z], lay.driveway.points)).toBe(true);
        expect(pointInPolygon([c.x, c.z], fp)).toBe(false);
      }
      // swapped in by id; the visitor's own items and the other projects are untouched
      const garden = [PZT_DRIVEWAY, { id: 'mine', kind: 'patio' as const, points: [] }], cars = [...PZT_CARS, { id: 'c9', x: 5, z: 5, rot: 1, color: '#000' }];
      expect(layoutGarden('argania2-mid', garden).map((g) => g.points)).toEqual([lay.driveway.points, []]);
      expect(layoutCars('argania2-mid', cars).map((c) => c.x)).toEqual([lay.cars[0].x, lay.cars[1].x, 5]);
      expect(layoutCars('argania2-mid', cars.slice(1)).map((c) => c.id)).toEqual(['pzt-car-2', 'c9']); // a removed car stays removed
      expect(layoutGates('argania2-mid', PZT_GATES)).toEqual(lay.gates);
      for (const id of ['argania2', 'argania2-low', 'ambrozja17']) {
        expect(layoutGarden(id, garden)).toBe(garden);
        expect(layoutCars(id, cars)).toBe(cars);
        expect(layoutGates(id, PZT_GATES)).toBe(PZT_GATES);
      }
      // the access road reaches its gate
      const [road, toGate] = accessRoads(base.parcel, roads, lay.gates);
      expect(toGate.width).toBeCloseTo(4.5, 6);
      expect(pointInPolygon(toGate.pts[1], base.parcel)).toBe(true);
      expect((road.pts[0][0] - a[0]) * d[0] + (road.pts[0][1] - a[1]) * d[1]).toBeCloseTo(lay.gates[1].from - 1.5, 6);
    });
  });

  it('the drive: level at the garage door and the entrance, then falling to the surveyed ground at the gate; the road outside stays on the field', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const roads = JSON.parse(readFileSync('public/site/roads.json', 'utf8')) as Road[];
    const s = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, roads, [], [], survey);
    const field = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, roads, [], [], { ...survey, design: undefined });
    const level = survey.design!.level;
    const at = (X: number, Y: number) => toSite(toLocal(argania2, X, Y), PZT.placement);
    const h = (X: number, Y: number) => s.dem.heightAt(...at(X, Y));
    // level in front of the garage door (plan Y 12.40) and at the covered entrance
    for (const X of [6, 8, 10.85, 13.5]) expect(Math.abs(h(X, 12.6) - level)).toBeLessThan(0.02); // 1 m terrain grid
    // then one steady fall to the fence line (plan Y ≈ 22.1 on the garage axis): about 1.1 m, 11–12%
    const ys = [14, 15, 16, 17, 18, 19, 20, 21];
    for (let k = 1; k < ys.length; k++) {
      const g = h(10.85, ys[k - 1]) - h(10.85, ys[k]);
      expect(g).toBeGreaterThan(0.1);
      expect(g).toBeLessThan(0.13);
    }
    // no step at the gate: the drive meets the field, which is where the gate and the road are
    const [, toGate] = accessRoads(s.parcel, roads);
    const [o, i] = toGate.pts, len = Math.hypot(i[0] - o[0], i[1] - o[1]);
    const u = [(i[0] - o[0]) / len, (i[1] - o[1]) / len];
    const along = (t: number): P2 => [i[0] + u[0] * t, i[1] + u[1] * t]; // t > 0: into the plot
    expect(Math.abs(s.dem.heightAt(...along(0.5)) - s.dem.heightAt(...along(-0.5)))).toBeLessThan(0.15);
    expect(level - s.dem.heightAt(...along(0))).toBeGreaterThan(0.95); // the PZT's own heights: ±0.00 357.00, 355.9–356.0 at the gate
    // outside the plot nothing is built up: the access road lies on the ground as surveyed
    const [road] = accessRoads(s.parcel, roads);
    const [a, b] = road.pts;
    for (let t = 0; t <= 1; t += 0.05) { const p: P2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; expect(s.dem.heightAt(...p)).toBeCloseTo(field.dem.heightAt(...p), 6); }
    // the garden behind and beside the house is level; the lawn in front falls with the drive, with no bank along its curb
    for (const [X, Y] of [[5, -6], [-3, 4], [12, -5]]) expect(h(X, Y)).toBeCloseTo(level, 2);
    expect(Math.abs(h(2.5, 18) - h(3.6, 18))).toBeLessThan(0.1);
    expect(h(0, 18)).toBeLessThan(level - 0.3);
  });

  it('noon sun is due south and high in June', () => {
    const s = sunState({ month: 6, day: 21, minutes: 12 * 60 + 47 }, meta.origin.lat, meta.origin.lon, site.trueNorth);
    expect(s.altitude * 180 / Math.PI).toBeGreaterThan(62);
    expect(s.dir.z).toBeGreaterThan(0.4); // towards south (+z)
    expect(Math.abs(s.dir.x)).toBeLessThan(0.05);
  });

  it('Warsaw time handles DST', () => {
    expect(warsawDate(7, 1, 12 * 60).toISOString()).toBe('2027-07-01T10:00:00.000Z');
    expect(warsawDate(1, 15, 12 * 60).toISOString()).toBe('2027-01-15T11:00:00.000Z');
  });
});

describe('project switching', () => {
  it('keeps placement and floor level per house, shares the garden', () => {
    const s = useStore.getState();
    s.set({ projectId: 'ambrozja17', projectState: {}, placement: { x: 1, z: 2, bearing: 200, mirror: true }, floorLevel: 356.2, trees: [{ id: 't', kind: 'birch', x: 0, z: 0, height: 9 }] });
    useStore.getState().setProject('grela-bilgoraj');
    let st = useStore.getState();
    expect(st.projectId).toBe('grela-bilgoraj');
    // a house never placed before starts where the previous one stood, unmirrored, on auto level
    expect(st.placement).toEqual({ x: 1, z: 2, bearing: 200, mirror: false });
    expect(st.floorLevel).toBeNull();
    st.setPlacement({ x: 5 });
    st.setProject('ambrozja17');
    st = useStore.getState();
    expect(st.placement).toEqual({ x: 1, z: 2, bearing: 200, mirror: true });
    expect(st.floorLevel).toBe(356.2);
    expect(st.trees).toHaveLength(1);
    st.setProject('grela-bilgoraj');
    expect(useStore.getState().placement.x).toBe(5);
  });

  it('keeps the detached garage where it was when switching projects', () => {
    const s = useStore.getState();
    s.set({ projectId: 'ambrozja17-detached', projectState: {}, placement: { x: 0, z: 0, bearing: 222, mirror: false }, floorLevel: null, annexes: {}, target: 'main' });
    useStore.getState().set({ annexes: { garage: { placement: { x: 20, z: 5, bearing: 267, mirror: false }, floorLevel: 357.1 } }, target: 'garage' });
    useStore.getState().setProject('ambrozja17');
    expect(useStore.getState().annexes).toEqual({});
    expect(useStore.getState().target).toBe('main');
    useStore.getState().setProject('ambrozja17-detached');
    expect(useStore.getState().annexes.garage).toEqual({ placement: { x: 20, z: 5, bearing: 267, mirror: false }, floorLevel: 357.1 });
  });

  it('migrates v2 storage (no separate buildings)', () => {
    const out = migrateState({ projectId: 'grela-bilgoraj', projectState: {}, placement: { x: 1, z: 1, bearing: 0, mirror: false } }, 2) as { annexes: object; target: string; projectId: string };
    expect(out.annexes).toEqual({});
    expect(out.target).toBe('main');
    expect(out.projectId).toBe('grela-bilgoraj');
  });

  it('new visitors start on Dom w Arganiach at the PZT position, ±0.00 = 357.00', () => {
    expect(DEFAULT_HOUSE_ID).toBe('argania2');
    const init = useStore.getInitialState();
    expect(init.projectId).toBe('argania2');
    expect(isPztPlacement(init.placement, init.floorLevel)).toBe(true);
    expect(init.placementInitialised).toBe(true);
  });

  it('new visitors also get the PZT layout: forecourt, gate and wicket, fence all round, two cars', () => {
    const init = useStore.getInitialState();
    expect(init.garden.map((g) => g.id)).toEqual(['pzt-driveway']);
    expect(init.gates.map((g) => g.kind)).toEqual(['sliding', 'wicket']);
    expect(init.cars).toHaveLength(2);
    expect(init.fenceEdges).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('migrates v4 storage: adds the PZT layout unless a drive / fence was already laid out', () => {
    const fresh = migrateState({ projectId: 'argania2', garden: [], fenceEdges: [] }, 4) as { cars: unknown[]; garden: { id: string }[]; fenceEdges: number[] };
    expect(fresh.cars).toHaveLength(2);
    expect(fresh.garden.map((g) => g.id)).toEqual(['pzt-driveway']);
    expect(fresh.fenceEdges).toHaveLength(6);
    const own = migrateState({ garden: [{ id: 'mine', kind: 'driveway', points: [] }], fenceEdges: [2] }, 4) as { garden: { id: string }[]; fenceEdges: number[] };
    expect(own.garden.map((g) => g.id)).toEqual(['mine']);
    expect(own.fenceEdges).toEqual([2]);
  });

  it('migrates v5 storage: exact forecourt, explicit gates, the PZT house and cars moved onto the drawing', () => {
    const old = { x: -3.95, z: -12.29, bearing: 51.3, mirror: false };
    const v5 = {
      projectId: 'argania2', placement: old, projectState: {},
      garden: [{ id: 'pzt-driveway', kind: 'driveway', points: [[0, 0]] }, { id: 'pzt-wicket', kind: 'path', points: [[0, 0]] }, { id: 'lawn1', kind: 'lawn', points: [] }],
      cars: [{ id: 'pzt-car-1', x: 0, z: 0, rot: 0, color: '#ff0000' }, { id: 'c9', x: 5, z: 5, rot: 1, color: '#000' }],
    };
    const out = migrateState(v5, 5) as { placement: typeof old; garden: { id: string; points: P2[] }[]; gates: unknown[]; cars: { id: string; x: number; color: string }[] };
    expect(out.placement).toEqual(PZT.placement);
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'lawn1']);
    expect(out.garden[0].points).toEqual(PZT_DRIVEWAY.points);
    expect(out.gates).toEqual(PZT_GATES);
    expect(out.cars[0]).toMatchObject({ x: PZT_CARS[0].x, color: '#ff0000' });
    expect(out.cars[1].x).toBe(5);
    // a house the user moved stays where it is
    const moved = migrateState({ ...v5, placement: { ...old, x: 2 } }, 5) as { placement: typeof old };
    expect(moved.placement.x).toBe(2);
  });

  it('a never-placed Dom w Arganiach starts at the PZT position', () => {
    useStore.getState().set({ projectId: 'ambrozja17', projectState: {}, placement: { x: 9, z: 9, bearing: 10, mirror: false }, floorLevel: 350 });
    useStore.getState().setProject('argania2');
    const st = useStore.getState();
    expect(isPztPlacement(st.placement, st.floorLevel)).toBe(true);
    // once moved, switching away and back keeps the visitor's own position
    st.setPlacement({ x: 1 });
    st.setProject('ambrozja17');
    useStore.getState().setProject('argania2');
    expect(useStore.getState().placement.x).toBe(1);
  });

  it('a never-placed lowered-garage variant starts at the PZT position with its floor at road level', () => {
    useStore.getState().set({ projectId: 'ambrozja17', projectState: {}, placement: { x: 9, z: 9, bearing: 10, mirror: false }, floorLevel: 350 });
    useStore.getState().setProject('argania2-low');
    const st = useStore.getState();
    expect(st.placement).toEqual(PZT.placement);
    expect(st.floorLevel).toBe(LOW_FLOOR_LEVEL);
  });

  it('migrates v1 storage (single house) to Ambrozja 17', () => {
    const out = (migrateState({ placement: { x: 3, z: 4, bearing: 10, mirror: false }, floorLevel: null }, 1)) as { projectId: string; projectState: object; placement: { x: number } };
    expect(out.projectId).toBe('ambrozja17');
    expect(out.projectState).toEqual({});
    expect(out.placement.x).toBe(3);
  });
});
