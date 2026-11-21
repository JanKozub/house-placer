import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildHouse, buildHouseLayers, footprintLocal, gableEaveUnder, gableOfWall, LAYERS, openingPolygon, openingSpan, outlineRects, storeySplit, subtractRect, type PartName } from './house/geometry';
import { ceilingDrop, storeyCeiling } from './house/interior';
import { ambrozja17 } from './house/ambrozja17';
import { grela } from './house/grela';
import { ambrozja17Detached, detachedGarage } from './house/ambrozja17-detached';
import { buildingDef, defaultAnnexPlacement } from './house/annex';
import { carvedHeight } from './site/Terrain';
import { driveSlope } from './site/drive';
import { CAR_SIZE, CAR_STYLES } from './site/Cars';
import { argania2 } from './house/argania2';
import { accessRoads, DEFAULT_PROJECT, DEFAULT_SHED, FRONT, GARAGE_CARS, GROUND_DESIGN, layoutTrees, MID_DRIVE, midDriveLeft, midFenceLine, HEDGE, HEDGE_EDGES, isPztPlacement, layoutCars, layoutGarden, layoutGates, LOW_FLOOR_LEVEL, MID_FLOOR_LEVEL, PLOT, PROJECT_LAYOUT, PROJECT_START, PZT, PZT_CARS, PZT_DRIVEWAY, PZT_GATES, SHED_DRIVE, SHED_FLOOR_LEVEL, THUJA_HEDGE } from './site/sitePlan';
import { argania2Low, argania2Mid, DRIVE_FALL, GARAGE_DROP, MID_DRIVE_FALL, MID_FLAT, MID_GARAGE_DROP, MID_RISERS, RISERS } from './house/argania2-low';
import { lowerGroundPlatform, platformPolygon } from './derived';
import { fenceOpenings, isBigTree, plantGeometry } from './site/Garden';
import { buildFeatures, KERB, kerbPieces, RAISED_BED, SEAT_WALL } from './site/GardenFeatures';
import { FIRE_PIT, GARDEN_AREAS, GARDEN_PLANTS, WALK } from './site/gardenPlan';
import { toLocal } from './house/geometry';
import { DEFAULT_HOUSE_ID } from './house/projects';
import { APRON_FALL, APRON_FLAT, APRON_LENGTH, OUTBUILDINGS, wiataGaraz } from './house/outbuildings';
import { HOUSE_LIST } from './house/projects';
import { polygonAreaPlan, roofFaces, roofTopAt } from './house/roof';
import { migrateState, useStore } from './store';
import { closestOnSegment, pointInPolygon, polygonArea, polygonGap, toHouse, toSite, type P2 } from './placement/geom2d';
import { computeSetbacks, facingDistance, footprintSite, nearestCornerDistances } from './placement/setbacks';
import { computeEarthwork, offsetPolygon } from './placement/earthwork';
import { makeSite, surveyedHeightAt, withGround, type Road, type Survey } from './geo/site';
import { sunState, warsawDate } from './site/sun';

const T30 = Math.tan(Math.PI / 6);
const G_IDS = GARDEN_AREAS.map((g) => g.id);

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
    // none of their own: since v7 the shed stands where the family planned it
    expect(out.outbuildings).toEqual([DEFAULT_SHED]);
    expect(out.projectId).toBe('argania2'); // nothing placed yet, so nothing to carry over
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
    // two cars stand on the drive, clear of the house; two more inside the garage
    const outside = PZT_CARS.filter((c) => !c.id.startsWith('garage-'));
    expect(outside).toHaveLength(2);
    for (const c of outside) {
      expect(pointInPolygon([c.x, c.z], PZT_DRIVEWAY.points)).toBe(true);
      expect(pointInPolygon([c.x, c.z], fp)).toBe(false);
    }
  });

  it('two cars in the garage: nose to the back wall, clear of the walls, the units, the steps and each other', () => {
    for (const [house, pl] of [[argania2, PZT.placement], [argania2Mid, PZT.placement]] as const) {
      const cars = (house === argania2 ? PZT_CARS : PROJECT_LAYOUT[argania2Mid.id].cars).filter((c) => c.id.startsWith('garage-'));
      expect(cars).toHaveLength(2);
      const plan = cars.map((c) => { const l = toHouse([c.x, c.z], pl); return [l[0] + house.width / 2, l[1] + house.depth / 2]; });
      plan.forEach((p, i) => { expect(p[0]).toBeCloseTo(GARAGE_CARS[i][0], 1); expect(p[1]).toBeCloseTo(GARAGE_CARS[i][1], 1); });
      const hw = CAR_SIZE.width / 2, hl = CAR_SIZE.length / 2;
      for (const [X, Y] of plan) {
        expect(X - hw).toBeGreaterThan(7.85 + 0.56 + 0.15); // west wall and the two steps at the doors
        expect(X + hw).toBeLessThan(13.85 - 0.45 - 0.1); // east wall and its shelf
        expect(Y - hl).toBeGreaterThan(5.98 + 0.52 + 0.3); // back wall and its units
        expect(Y + hl).toBeLessThan(house.depth - 0.45 - 0.15); // the door
      }
      expect(plan[1][0] - plan[0][0] - CAR_SIZE.width).toBeGreaterThan(0.45); // room to open a door between them
      // both fit through the door: its width takes them side by side
      const door = house.openings.find((o) => o.kind === 'garage')!;
      expect(plan[0][0] - hw).toBeGreaterThan(door.at - door.width / 2);
      expect(plan[1][0] + hw).toBeLessThan(door.at + door.width / 2);
      for (const c of cars) expect(c.lift).toBe(0.03); // on the floor, which lies over the ground
      expect(Math.max(...CAR_STYLES.map((st) => st.roofH)) + 0.1).toBeLessThan(door.height); // and under its head
      // parked the same way as the cars outside
      expect(cars[0].rot).toBe(PZT_CARS[0].rot);
    }
    // another house has no garage there: its cars are only the ones outside
    expect(layoutCars('ambrozja17', PZT_CARS).map((c) => c.id)).toEqual(['pzt-car-1', 'pzt-car-2']);
    expect(layoutCars('argania2-low', PZT_CARS)).toBe(PZT_CARS);
    expect(layoutCars('argania2-mid', PZT_CARS)).toEqual(PROJECT_LAYOUT[argania2Mid.id].cars);
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
      // the walls round the garage and the boiler room stand on the lower floor
      expect(argania2Low.walls.filter((w) => w.base !== undefined).map((w) => w.id).sort()).toEqual(['eastMain', 'eastWing', 'wingFront', 'wingWest']);
      for (const w of argania2Low.walls) if (w.base !== undefined) expect(w.base).toBe(-GARAGE_DROP);
      // stairs: landing −0.02, eight treads, forecourt −1.52: nine risers of 1/6 m
      expect([GARAGE_DROP, RISERS]).toEqual([1.5, 9]);
      const treads = argania2Low.extras!.filter((e) => e.part === 'paving').map((e) => e.h1).sort((a, b) => b - a);
      const levels = [-0.02, ...treads, argania2Low.lowerGround!.top];
      expect(levels).toHaveLength(RISERS + 1);
      for (let i = 1; i < levels.length; i++) expect(levels[i - 1] - levels[i]).toBeCloseTo(GARAGE_DROP / RISERS, 6);
      // it builds; the side door from the covered entrance is left out, so there is one opening fewer
      expect(buildHouse(argania2Low).plaster!.attributes.position.count).toBeGreaterThan(1000);
      expect(argania2Low.openings).toHaveLength(argania2.openings.length - 1);
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
      expect(ground(10.8, 11.5)).toBeCloseTo(G, 6); // inside the garage: the ground steps down with the floor
      expect(ground(3.5, 4.0)).toBeCloseTo(LOW_FLOOR_LEVEL - 0.05, 6); // under the living room: the building platform
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

  describe('the garden: shed in the east corner with its drive, thuja hedges on three sides', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    const mid = withGround(base, GROUND_DESIGN[argania2Mid.id]);
    const off = (p: P2, e: number) => { const a = base.parcel[e], b = base.parcel[(e + 1) % base.parcel.length]; const q = closestOnSegment(p, a, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    const shed = DEFAULT_SHED.placement;
    const sp = (X: number, Y: number) => toSite(toLocal(wiataGaraz, X, Y), shed);
    const shedLower = lowerGroundPlatform(wiataGaraz, shed, SHED_FLOOR_LEVEL)!;
    const platforms = [
      lowerGroundPlatform(argania2Mid, PZT.placement, MID_FLOOR_LEVEL)!, { polygon: platformPolygon(argania2Mid, PZT.placement), h: MID_FLOOR_LEVEL - argania2Mid.plinth },
      shedLower, { polygon: platformPolygon(wiataGaraz, shed), h: SHED_FLOOR_LEVEL - wiataGaraz.plinth },
    ];
    const ground = (p: P2) => carvedHeight(mid, p[0], p[1], platforms);

    it('the plot outline used for the garden is the parcel, to the centimetre', () => {
      expect(PLOT).toHaveLength(base.parcel.length);
      PLOT.forEach((p, i) => expect(Math.hypot(p[0] - base.parcel[i][0], p[1] - base.parcel[i][1])).toBeLessThan(0.01));
    });

    it('shed: where the family put it (2.02 / 1.38 m from the south-east boundary, 1.04 m from the north-east one, 16.63 m from the house)', () => {
      expect(off(sp(0, 0), 5)).toBeCloseTo(2.02, 2);
      expect(off(sp(wiataGaraz.width, 0), 5)).toBeCloseTo(1.38, 2);
      expect(off(sp(0, wiataGaraz.depth), 0)).toBeCloseTo(1.04, 2);
      const fp = footprintSite(wiataGaraz, shed);
      expect(fp.every((p) => pointInPolygon(p, base.parcel))).toBe(true);
      expect(polygonGap(footprintSite(argania2Mid, PZT.placement), fp).d).toBeCloseTo(16.63, 1);
      // closer to the boundary than the 3 m a building of this size needs: the setback table says so
      const sb = computeSetbacks(wiataGaraz, shed, base.parcel);
      expect(sb.ok).toBe(false);
    });

    it('shed level 356.10: between the ground at its two ends, 10 cm above balanced cut and fill, little fill at the fence', () => {
      const ew = computeEarthwork(platformPolygon(wiataGaraz, shed), SHED_FLOOR_LEVEL - wiataGaraz.plinth, (x, z) => mid.dem.heightAt(x, z), 0.5);
      expect(ew.terrainMin).toBeLessThan(355.7); // garage end, the lowest corner of the plot
      expect(ew.terrainMax).toBeGreaterThan(356.3); // wiata end
      expect(SHED_FLOOR_LEVEL - (ew.terrainMean + wiataGaraz.plinth)).toBeCloseTo(0.1, 1);
      expect(SHED_FLOOR_LEVEL - ew.terrainMin).toBeLessThan(0.6);
      expect(ew.cut + ew.fill).toBeLessThan(35);
    });

    it('apron and drive: level at the garage door and never lower than it nearby, then along the fence to the forecourt on the surveyed ground', () => {
      expect([APRON_FLAT, APRON_FALL, APRON_LENGTH]).toEqual([1, 0.01, 9]);
      const D = wiataGaraz.depth, top = SHED_FLOOR_LEVEL - 0.02;
      expect(ground(sp(2.17, D + 0.5))).toBeCloseTo(top, 6);
      expect(ground(sp(2.17, D + 4))).toBeCloseTo(top - APRON_FALL * 3, 6);
      // the dip in front of the door (355.6–355.7 as surveyed) is filled: the approach is not lower than the threshold by more than the 1% fall
      expect(mid.dem.heightAt(...sp(2.17, D + 3))).toBeLessThan(355.75);
      expect(ground(sp(2.17, D + 3))).toBeGreaterThan(top - 0.03);
      // at its end the apron is within 10 cm of the ground beyond it
      expect(Math.abs(ground(sp(2.17, D + APRON_LENGTH - 0.05)) - mid.dem.heightAt(...sp(2.17, D + APRON_LENGTH + 1.5)))).toBeLessThan(0.1);
      // the drive: 3.5 m wide, from the door (which it spans) to beyond both forecourts' ends
      const pts = SHED_DRIVE.points;
      expect(SHED_DRIVE.kind).toBe('driveway');
      expect(pts.every((p) => pointInPolygon(p, base.parcel))).toBe(true);
      expect(Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1])).toBeCloseTo(3.5, 2);
      const door = wiataGaraz.openings.find((o) => o.kind === 'garage')!;
      for (const X of [door.at - door.width / 2, door.at, door.at + door.width / 2]) expect(pointInPolygon(sp(X, D + 0.2), pts)).toBe(true);
      expect(pointInPolygon(sp(2.17, D + 0.3), shedLower.polygon)).toBe(true);
      const mids = (t: number): P2 => [(pts[0][0] + pts[3][0]) / 2 + ((pts[1][0] + pts[2][0] - pts[0][0] - pts[3][0]) / 2) * t, (pts[0][1] + pts[3][1]) / 2 + ((pts[1][1] + pts[2][1] - pts[0][1] - pts[3][1]) / 2) * t];
      expect(pointInPolygon(mids(0.97), PROJECT_LAYOUT[argania2Mid.id].driveway.points)).toBe(true);
      expect(pointInPolygon(mids(0.97), PZT_DRIVEWAY.points)).toBe(true);
      // it stays inside the fence, and the fence does not open for it
      expect(fenceOpenings(base.parcel, 0, [pts], [])).toEqual([]);
      expect(pts.every((p) => off(p, 0) > 1)).toBe(true);
      // gentle all the way: no more than 8% between points 2 m apart (the steepest bit is the edge of the forecourt)
      const L = Math.hypot(mids(1)[0] - mids(0)[0], mids(1)[1] - mids(0)[1]);
      for (let d = 0; d + 2 <= L; d += 1) expect(Math.abs(ground(mids((d + 2) / L)) - ground(mids(d / L))) / 2).toBeLessThanOrEqual(0.08);
    });

    it('thuja hedges: every 75 cm, 75 cm inside the road boundary and both neighbours, none on the gate side', () => {
      expect(HEDGE_EDGES).toEqual([1, 2, 3, 4, 5]);
      expect(THUJA_HEDGE.length).toBeGreaterThan(130);
      expect(THUJA_HEDGE.length).toBeLessThan(160);
      expect(new Set(THUJA_HEDGE.map((t) => t.id)).size).toBe(THUJA_HEDGE.length);
      const house = footprintSite(argania2Mid, PZT.placement), shedFp = footprintSite(wiataGaraz, shed), yard = PROJECT_LAYOUT[argania2Mid.id].driveway.points;
      for (const t of THUJA_HEDGE) {
        const p: P2 = [t.x, t.z], e = +t.id.split('-')[1];
        expect(pointInPolygon(p, base.parcel)).toBe(true);
        expect(off(p, e)).toBeCloseTo(HEDGE.inset, 1);
        expect(off(p, 0)).toBeGreaterThan(0.5); // clear of the gate side
        expect(t.height).toBeGreaterThan(2);
        expect(t.height).toBeLessThan(2.4);
        // clear of the buildings, the forecourt and the shed's drive
        for (const poly of [house, shedFp, yard, SHED_DRIVE.points]) expect(pointInPolygon(p, poly)).toBe(false);
      }
      // neighbours in a row stand about 75 cm apart
      for (const e of HEDGE_EDGES) {
        const row = THUJA_HEDGE.filter((t) => t.id.startsWith(`tuja-${e}-`));
        for (let i = 1; i < row.length; i++) {
          const d = Math.hypot(row[i].x - row[i - 1].x, row[i].z - row[i - 1].z);
          expect(d).toBeGreaterThan(0.68);
          expect(d).toBeLessThan(0.82);
        }
      }
      // a narrow cone standing on the ground, as tall as the tree, under a metre across
      const g = plantGeometry(THUJA_HEDGE[0]);
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeCloseTo(THUJA_HEDGE[0].height, 6);
      expect(g.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
      expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeLessThan(1);
      expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeGreaterThan(0.6);
    });
  });

  describe('the designed garden: borders along the paving, beds, paths, fire pit, vegetable beds', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    const off = (p: P2, e: number) => { const a = base.parcel[e], b = base.parcel[(e + 1) % base.parcel.length]; const q = closestOnSegment(p, a, b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
    const lay = PROJECT_LAYOUT[argania2Mid.id];
    const house = footprintSite(argania2Mid, PZT.placement), shed = footprintSite(wiataGaraz, DEFAULT_SHED.placement);
    const paved = [lay.driveway, SHED_DRIVE, ...GARDEN_AREAS];
    const byId = (id: string) => GARDEN_AREAS.find((g) => g.id === id)!;

    it('every plant stands on the plot, clear of the buildings, the paving and the hedge', () => {
      expect(GARDEN_PLANTS.length).toBeGreaterThan(140);
      expect(new Set(GARDEN_PLANTS.map((t) => t.id)).size).toBe(GARDEN_PLANTS.length);
      const hard = [house, shed, lay.driveway.points, SHED_DRIVE.points, ...GARDEN_AREAS.filter((g) => ['path', 'patio', 'vegbed', 'wall'].includes(g.kind)).map((g) => g.points)];
      GARDEN_PLANTS.forEach((t, i) => {
        const p: P2 = [t.x, t.z];
        expect(pointInPolygon(p, base.parcel)).toBe(true);
        for (const poly of hard) expect(pointInPolygon(p, poly)).toBe(false);
        for (const h of THUJA_HEDGE) expect(Math.hypot(h.x - t.x, h.z - t.z)).toBeGreaterThan(0.55);
        for (const u of GARDEN_PLANTS.slice(i + 1)) expect(Math.hypot(u.x - t.x, u.z - t.z)).toBeGreaterThan(0.3);
        expect(t.height).toBeGreaterThan(0.25);
      });
      // what a designed garden of this kind has
      const n = (k: string) => GARDEN_PLANTS.filter((t) => t.kind === k).length;
      expect(n('grass')).toBeGreaterThan(30);
      expect(n('hydrangea')).toBeGreaterThan(20);
      expect(n('lavender')).toBeGreaterThan(20);
      expect(n('globe')).toBe(4);
      expect(n('birch')).toBe(3);
      expect(n('firepit')).toBe(1);
      // tall trees keep their distance from the house (crown ≈ a third of the height)
      for (const t of GARDEN_PLANTS.filter((q) => isBigTree(q.kind) && q.height > 4)) expect(polygonGap(house, [[t.x, t.z], [t.x + 0.01, t.z], [t.x, t.z + 0.01]]).d).toBeGreaterThan(t.height * 0.3 + 1);
    });

    it('beds and paths lie on the plot and off the buildings; the paving has a planted border on both sides of the drive', () => {
      expect(new Set(G_IDS).size).toBe(G_IDS.length);
      for (const a of GARDEN_AREAS) {
        expect(a.points.length).toBeGreaterThanOrEqual(4);
        for (const p of a.points) {
          expect(pointInPolygon(p, base.parcel)).toBe(true);
          expect(pointInPolygon(p, house) || pointInPolygon(p, shed)).toBe(false);
        }
      }
      // between the fence and the shed's drive, and along its garden side
      for (const p of byId('g-bed-fence').points) { expect(off(p, 0)).toBeGreaterThan(0.3); expect(off(p, 0)).toBeLessThan(1.46); }
      for (const p of byId('g-bed-avenue').points) expect(off(p, 0)).toBeGreaterThan(4.94);
      // where the PZT had paving up to the north-west neighbour, there is a pebble garden beside the drive
      for (const p of byId('g-front-garden').points) { expect(pointInPolygon(p, lay.driveway.points)).toBe(false); expect(off(p, 1)).toBeGreaterThan(1.1); }
      expect(polygonArea(byId('g-front-garden').points)).toBeGreaterThan(20); // 3 m wide at the house, 2 m at the fence
      // four raised beds of 1.2 × 3.3 m on a gravel pad
      const veg = GARDEN_AREAS.filter((g) => g.kind === 'vegbed');
      expect(veg).toHaveLength(4);
      for (const v of veg) {
        expect(polygonArea(v.points)).toBeCloseTo(1.2 * 3.3, 1);
        for (const p of v.points) expect(pointInPolygon(p, byId('g-veg-pad').points)).toBe(true);
      }
      // the fire bowl sits in the middle of its gravel circle, with the paths leading to it
      const pit = GARDEN_PLANTS.find((t) => t.kind === 'firepit')!, circle = byId('g-fire-circle');
      expect(pointInPolygon([pit.x, pit.z], circle.points)).toBe(true);
      expect(polygonArea(circle.points)).toBeGreaterThan(15);
      expect(FIRE_PIT).toHaveLength(2);
      for (const id of ['g-path-terrace', 'g-path-wiata']) expect(polygonGap(byId(id).points, circle.points).d).toBeLessThan(0.3);
      expect(polygonGap(byId('g-path-wiata').points, byId('g-patio-wiata').points).d).toBeLessThan(0.3);
    });

    it('the entrance: a path from the wicket beside the gate to a court at the front steps, a seat wall towards the drive', () => {
      const plan = (p: P2) => { const l = toHouse(p, PZT.placement); return [l[0] + argania2Mid.width / 2, l[1] + argania2Mid.depth / 2]; };
      const walk = byId('g-front-walk'), walkGate = byId('g-front-walk-gate'), court = byId('g-front-court'), wall = byId('g-front-seat-wall'), pebbles = byId('g-front-walk-pebbles');
      expect([walk.kind, walkGate.kind]).toEqual(['path', 'path']);
      const wp = walk.points.map(plan), gp = walkGate.points.map(plan);
      // 1.4 m wide; at the house it is centred on the steps (plan X 4.9–7.4)
      expect(wp[1][0] - wp[0][0]).toBeCloseTo(1.4, 2);
      expect(gp[2][0] - gp[3][0]).toBeCloseTo(1.4, 2);
      expect((wp[0][0] + wp[1][0]) / 2).toBeCloseTo((4.9 + 7.4) / 2, 2);
      expect(WALK.y0).toBe(14.3);
      // it joins the court, which lies at the foot of the steps (plan Y 13.0) as wide as the steps and on to the drive
      expect(polygonGap(court.points, walk.points).d).toBeLessThan(0.03);
      const cp = court.points.map(plan);
      expect(Math.min(...cp.map((p) => p[1]))).toBeCloseTo(13.0, 1);
      expect(Math.min(...cp.map((p) => p[0]))).toBeCloseTo(4.9, 1);
      expect(Math.max(...cp.map((p) => p[0]))).toBeCloseTo(midDriveLeft(WALK.y0), 1);
      // and it ends at the wicket, which stands right beside the sliding gate
      const a = base.parcel[0], b = base.parcel[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const wicket = lay.gates.find((g) => g.kind === 'wicket')!, gate = lay.gates.find((g) => g.kind === 'sliding')!;
      expect(gate.from - wicket.to).toBeCloseTo(0.25, 6);
      for (const sEnd of [wicket.from, wicket.to]) {
        const q = plan([a[0] + ((b[0] - a[0]) / L) * sEnd, a[1] + ((b[1] - a[1]) / L) * sEnd]);
        expect(q[0]).toBeGreaterThan(gp[3][0] - 0.05);
        expect(q[0]).toBeLessThan(gp[2][0] + 0.05);
      }
      expect(off(walkGate.points[2], 0)).toBeCloseTo(0.3, 1);
      expect(off(walkGate.points[3], 0)).toBeCloseTo(0.3, 1);
      // the fence opens only at the two gates
      const open = fenceOpenings(base.parcel, 0, [lay.driveway.points, walk.points, walkGate.points, court.points, byId('g-front-path-kitchen').points], lay.gates);
      expect(open.map(([, , k]) => k)).toEqual(['wicket', 'sliding']);
      expect(midFenceLine(7.4)).toBe(22.156);
      // it is laid in two pieces that stop at the drive to the shed: the cobbles run through, the path does not cross them
      for (const piece of [walk, walkGate]) {
        expect(polygonGap(piece.points, SHED_DRIVE.points).d).toBe(0); // they meet
        // …with no more than a 2 cm overlap: the piece's edge lies on the drive's edge
        for (const p of piece.points) if (pointInPolygon(p, SHED_DRIVE.points)) expect(Math.min(Math.abs(off(p, 0) - 1.45), Math.abs(off(p, 0) - 4.95))).toBeLessThan(0.03);
      }
      // the two pieces are in line, 3.5 m apart (the width of that drive)
      expect(polygonGap(walk.points, walkGate.points).d).toBeCloseTo(3.5 - 0.04, 1);
      expect(off(walk.points[2], 0)).toBeCloseTo(4.93, 1);
      expect(off(walkGate.points[0], 0)).toBeCloseTo(1.47, 1);
      // neither piece lies on the drive to the garage
      for (const p of [...walk.points, ...walkGate.points]) expect(pointInPolygon(p, lay.driveway.points)).toBe(false);
      // pebbles edge it on both sides
      for (const p of walk.points.slice(0, 2)) expect(pointInPolygon([p[0], p[1] - 0.05] as P2, pebbles.points) || polygonGap([p, [p[0] + 0.01, p[1]], [p[0], p[1] + 0.01]], pebbles.points).d < 0.1).toBe(true);
      expect(polygonArea(pebbles.points)).toBeGreaterThan((polygonArea(walk.points) + polygonArea(walkGate.points)) * 1.3);
      // the seat wall stands on the edge of the drive, between it and the path
      const wl = wall.points.map(plan);
      for (const q of wl) { expect(q[0]).toBeLessThanOrEqual(midDriveLeft(q[1])); expect(q[0]).toBeGreaterThan(wp[1][0]); }
      expect(Math.max(...wl.map((p) => p[1])) - Math.min(...wl.map((p) => p[1]))).toBeGreaterThan(2.5);
      // planters flank the steps, lanterns stand on both sides of the path
      const front = GARDEN_PLANTS.filter((t) => t.id.startsWith(FRONT));
      const pots = front.filter((t) => t.kind === 'pot').map((t) => plan([t.x, t.z]));
      expect(pots).toHaveLength(2);
      expect(pots[0][0]).toBeLessThan(4.9);
      expect(pots[1][0]).toBeGreaterThan(7.4);
      for (const p of pots) expect(Math.abs(p[1] - 12.75)).toBeLessThan(0.1);
      const lamps = front.filter((t) => t.kind === 'bollard');
      expect(lamps).toHaveLength(5);
      for (const t of lamps) {
        const dot: P2[] = [[t.x, t.z], [t.x + 0.01, t.z], [t.x, t.z + 0.01]];
        expect(pointInPolygon([t.x, t.z], walk.points) || pointInPolygon([t.x, t.z], walkGate.points)).toBe(false);
        expect(Math.min(polygonGap(walk.points, dot).d, polygonGap(walkGate.points, dot).d)).toBeLessThan(0.6);
      }
      // much more is planted here than before
      expect(front.length).toBeGreaterThan(65);
      for (const k of ['grass', 'fescue', 'perennial', 'hydrangea', 'boxwood', 'lavender']) expect(front.some((t) => t.kind === k)).toBe(true);
    });

    it('the entrance belongs to the compromise variant: with another house it is left out', () => {
      const garden = [PZT_DRIVEWAY, SHED_DRIVE, ...GARDEN_AREAS], trees = [...THUJA_HEDGE, ...GARDEN_PLANTS];
      const nFrontAreas = GARDEN_AREAS.filter((g) => g.id.startsWith(FRONT)).length, nFrontPlants = GARDEN_PLANTS.filter((t) => t.id.startsWith(FRONT)).length;
      expect(nFrontAreas).toBeGreaterThan(8);
      expect(layoutTrees('argania2-mid', trees)).toBe(trees);
      expect(layoutGarden('argania2-mid', garden)).toHaveLength(garden.length);
      for (const id of ['argania2', 'argania2-low', 'ambrozja17']) {
        expect(layoutTrees(id, trees)).toHaveLength(trees.length - nFrontPlants);
        expect(layoutGarden(id, garden)).toHaveLength(garden.length - nFrontAreas);
        expect(layoutGarden(id, garden).some((g) => g.id.startsWith(FRONT))).toBe(false);
        // on the PZT's forecourt nothing of the garden stands in the way
        if (id !== 'ambrozja17') for (const t of layoutTrees(id, trees)) if (t.id.startsWith('g-')) expect(pointInPolygon([t.x, t.z], PZT_DRIVEWAY.points)).toBe(false);
      }
      expect(layoutTrees('argania2', THUJA_HEDGE)).toBe(THUJA_HEDGE); // nothing to leave out: the same list
    });

    it('kerbs: along every free edge of the paving; none across it, at the walls or in the gateways', () => {
      const pieces = kerbPieces(paved, [house, shed], base.parcel, lay.gates);
      const total = pieces.reduce((s2, [a, b]) => s2 + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
      expect(total).toBeGreaterThan(110);
      const kinds = new Set(['driveway', 'patio', 'path']);
      const hard = paved.filter((g) => kinds.has(g.kind));
      const a0 = base.parcel[0], a1 = base.parcel[1], L0 = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      for (const [a, b, n] of pieces) {
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(KERB.step * 1.6);
        const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], beyond: P2 = [m[0] + n[0] * 0.08, m[1] + n[1] * 0.08];
        // paving on one side only
        expect(hard.filter((g) => pointInPolygon(beyond, g.points))).toHaveLength(0);
        expect(pointInPolygon(beyond, base.parcel)).toBe(true);
        // not at a wall
        for (const f of [house, shed]) expect(polygonGap(f, [m, [m[0] + 0.001, m[1]], [m[0], m[1] + 0.001]]).d).toBeGreaterThanOrEqual(0.29);
        // not in a gateway
        const s = ((m[0] - a0[0]) * (a1[0] - a0[0]) + (m[1] - a0[1]) * (a1[1] - a0[1])) / L0;
        if (off(m, 0) < 0.8) for (const g of lay.gates) expect(s < g.from || s > g.to).toBe(true);
      }
      // the drive to the shed has its kerb on both long sides, but no line where it runs over the forecourt
      const onDrive = pieces.filter(([a]) => SHED_DRIVE.points.some((p, i) => { const q = SHED_DRIVE.points[(i + 1) % 4]; const c = closestOnSegment(a, p, q); return Math.hypot(a[0] - c[0], a[1] - c[1]) < 0.01; }));
      const len = onDrive.reduce((s2, [a, b]) => s2 + Math.hypot(b[0] - a[0], b[1] - a[1]), 0);
      expect(len).toBeGreaterThan(30);
      expect(len).toBeLessThan(2 * 27.4 - 3); // short of its full outline: none over the forecourt's drive
      // without the other areas the forecourt's own outline is kerbed all round except the house and the gates
      expect(kerbPieces([lay.driveway], [house], base.parcel, []).length).toBeGreaterThan(kerbPieces([lay.driveway], [house], base.parcel, lay.gates).length);
    });

    it('kerbs and raised beds are built on the ground: 4.5 cm proud of it, the beds 30 cm high', () => {
      const flat = () => 10;
      const g = buildFeatures(paved, [house, shed], base.parcel, lay.gates, flat)!;
      expect(g.getAttribute('color')).toBeDefined();
      g.computeBoundingBox();
      expect(g.boundingBox!.max.y).toBeGreaterThan(10 + RAISED_BED.height); // vegetables stand over the frame
      expect(g.boundingBox!.max.y).toBeLessThan(10 + RAISED_BED.height + 0.45);
      const onlyKerbs = buildFeatures([lay.driveway], [house], base.parcel, lay.gates, flat)!;
      onlyKerbs.computeBoundingBox();
      expect(onlyKerbs.boundingBox!.max.y).toBeCloseTo(10 + KERB.above, 6);
      expect(buildFeatures([byId('g-bed-fence')], [], base.parcel, [], flat)).toBeNull(); // beds are paint only
      // the seat wall is 45 cm high with a 4 cm timber seat
      const wallGeo = buildFeatures([byId('g-front-seat-wall')], [], base.parcel, [], flat)!;
      wallGeo.computeBoundingBox();
      expect(wallGeo.boundingBox!.max.y).toBeCloseTo(10 + SEAT_WALL.height + 0.04, 6);
    });

    it('every small plant has its own coloured shape, standing on the ground and about as tall as planted', () => {
      const kinds = ['thuja', 'grass', 'lavender', 'hydrangea', 'boxwood', 'globe', 'maple', 'rock', 'firepit', 'perennial', 'fescue', 'pot', 'bollard'] as const;
      for (const kind of kinds) {
        const t = { id: `x-${kind}`, kind, x: 0, z: 0, height: kind === 'firepit' ? 0.35 : 1.2 };
        expect(isBigTree(kind)).toBe(false);
        const g = plantGeometry(t);
        expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
        g.computeBoundingBox();
        expect(g.boundingBox!.min.y).toBeGreaterThan(-0.2 * t.height); // mounds and boulders sit a little into the ground
        expect(g.boundingBox!.max.y).toBeGreaterThan(t.height * 0.55);
        expect(g.boundingBox!.max.y).toBeLessThan(t.height * 2.1);
        // the same every time
        expect(Array.from(plantGeometry(t).getAttribute('position').array)).toEqual(Array.from(g.getAttribute('position').array));
      }
      for (const kind of ['deciduous', 'birch', 'conifer', 'shrub'] as const) expect(isBigTree(kind)).toBe(true);
    });
  });

  describe('interior of Dom w Arganiach 2 and the layers that can be hidden', () => {
    const h = argania2, inr = h.interior!, uf = h.upperFloor!;
    const layers = buildHouseLayers(h);
    const inOutline = (p: number[], m = 0) => outlineRects(h.outline).some(([x0, y0, x1, y1]) => p[0] >= x0 - m && p[0] <= x1 + m && p[1] >= y0 - m && p[1] <= y1 + m);
    const yRange = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return [g.boundingBox!.min.y, g.boundingBox!.max.y]; };

    it('the three layers together are the whole house: nothing lost, nothing doubled', () => {
      const whole = buildHouse(h);
      for (const k of Object.keys(whole) as PartName[]) {
        const n = LAYERS.reduce((sum, l) => sum + (layers[l][k]?.attributes.position.count ?? 0), 0);
        expect(n).toBe(whole[k]!.attributes.position.count);
      }
      // the roof layer holds the roof, its gutters and the attic's ceiling; the others hold none of it
      expect(layers.roof.roof).toBeDefined();
      expect(layers.roof.gutter).toBeDefined();
      expect(layers.roof.ceiling).toBeDefined();
      expect(layers.base.roof ?? layers.upper.roof).toBeUndefined();
      expect(layers.base.ceiling).toBeUndefined();
    });

    it('outer walls are split at the underside of the attic slab: no opening crosses it', () => {
      const split = storeySplit(h)!;
      expect(split).toBeCloseTo(uf.level - uf.thickness, 9);
      expect(split).toBeGreaterThan(h.ceilingHeight);
      for (const o of h.openings) expect(o.sill + o.height <= split || o.sill >= split).toBe(true);
      // the upper layer starts there (slab, walls, attic rooms); ground-floor glass stays in the base layer
      for (const k of Object.keys(layers.upper) as PartName[]) expect(yRange(layers.upper[k]!)[0]).toBeGreaterThan(h.ceilingHeight - 0.01);
      expect(yRange(layers.base.glass!)[1]).toBeLessThan(split);
      expect(yRange(layers.upper.glass!)[0]).toBeGreaterThan(uf.level);
      // single-storey houses have no upper layer; their ceiling hides with the roof
      expect(storeySplit(ambrozja17)).toBeNull();
      const a = buildHouseLayers(ambrozja17);
      expect(Object.keys(a.upper)).toHaveLength(0);
      expect(a.roof.ceiling).toBeDefined();
      expect(a.base.interior).toBeDefined(); // partitions stay
    });

    it('partition walls are axis-aligned and inside the house, with every door inside its wall', () => {
      for (const st of [inr.ground, inr.upper!]) {
        expect(st.walls.length).toBeGreaterThan(10);
        for (const w of st.walls) {
          expect(w.a[0] === w.b[0] || w.a[1] === w.b[1]).toBe(true);
          expect(inOutline(w.a) && inOutline(w.b)).toBe(true);
          const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
          const doors = [...(w.doors ?? [])].sort((p, q) => p.at - q.at);
          doors.forEach((d, i) => {
            expect(d.at - d.width / 2).toBeGreaterThanOrEqual(0);
            expect(d.at + d.width / 2).toBeLessThanOrEqual(L);
            if (i) expect(d.at - d.width / 2).toBeGreaterThan(doors[i - 1].at + doors[i - 1].width / 2);
            // a leaf opens across its wall, not along it
            expect(w.a[0] === w.b[0] ? ['E', 'W'] : ['N', 'S']).toContain(d.opens);
          });
        }
        for (const f of st.items) expect(inOutline(f.at)).toBe(true);
      }
      // the plan view draws the same walls
      expect(h.partitions).toHaveLength(inr.ground.walls.length);
      // rooms on both storeys: 9 doors on the ground floor (one sliding), 8 in the attic (one folding)
      const kinds = (st: typeof inr.ground) => st.walls.flatMap((w) => w.doors ?? []).map((d) => d.kind ?? 'swing');
      expect(kinds(inr.ground).filter((k) => k === 'sliding')).toHaveLength(1);
      expect(kinds(inr.ground)).toHaveLength(7);
      expect(kinds(inr.upper!).filter((k) => k === 'fold')).toHaveLength(1);
      expect(kinds(inr.upper!)).toHaveLength(8);
    });

    it('stairs: 16 equal risers of 19.1 cm, 12 to the landing over the wardrobe and 4 back up to the attic floor', () => {
      const [f1, f2] = inr.stairs!.flights, land = inr.stairs!.landings[0];
      expect(f1.rise).toBeCloseTo(uf.level / 16, 9);
      expect(f1.rise).toBeCloseTo(0.191, 3);
      expect((f1.treads + 1) * f1.rise).toBeCloseTo(land.level, 9);
      expect(f2.startLevel).toBe(land.level);
      expect(land.level + (f2.treads + 1) * f2.rise).toBeCloseTo(uf.level, 9);
      // comfortable: 2 × rise + going between 60 and 65 cm
      expect(2 * f1.rise + f1.going).toBeGreaterThan(0.6);
      expect(2 * f1.rise + f1.going).toBeLessThan(0.66);
      // the first flight ends at the landing, the second starts from it and ends at the edge of the slab
      expect(f1.from[1] - f1.treads * f1.going).toBeCloseTo(land.y1, 2);
      expect(f2.from[1]).toBeCloseTo(land.y1, 9);
      const end = f2.from[1] + f2.treads * f2.going;
      const well = uf.voids![1];
      expect(well.some((p) => Math.abs(p[1] - end) < 1e-9)).toBe(true);
      // both flights and the landing lie inside the stairwell opening
      const xs = well.map((p) => p[0]), ys = well.map((p) => p[1]);
      for (const f of [f1, f2]) { expect(f.from[0] - f.width / 2).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9); expect(f.from[0] + f.width / 2).toBeLessThanOrEqual(Math.max(...xs) + 0.01); }
      expect(land.y0).toBeCloseTo(Math.min(...ys), 9);
      // headroom over the wardrobe under the landing
      expect(land.level - 0.2).toBeGreaterThan(2.0);
    });

    it('voids: the living room is open to the roof and the stairwell is cut out of the slab', () => {
      expect(uf.voids).toHaveLength(2);
      for (const v of uf.voids!) for (const p of v) expect(inOutline(p)).toBe(true);
      const area = (v: number[][]) => Math.abs(v.reduce((s2, p, i) => s2 + p[0] * v[(i + 1) % v.length][1] - v[(i + 1) % v.length][0] * p[1], 0)) / 2;
      expect(area(uf.voids![0])).toBeCloseTo(2.1 * 3.68, 2);
      // slab area = outline − voids
      const slab = layers.upper.floor!;
      let a = 0;
      const pos = slab.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        if (Math.abs(pos.getY(i) - (uf.level + 0.005)) > 1e-6) continue;
        a += Math.abs((pos.getX(i + 1) - pos.getX(i)) * (pos.getZ(i + 2) - pos.getZ(i)) - (pos.getX(i + 2) - pos.getX(i)) * (pos.getZ(i + 1) - pos.getZ(i))) / 2;
      }
      expect(a).toBeCloseTo(polygonAreaPlan(h.outline) - area(uf.voids![0]) - area(uf.voids![1]), 2);
    });

    it('attic: a flat ceiling 2.55 m up, sloped under the roof down to the 1.25 m knee wall; walls and furniture stay under it', () => {
      const st = inr.upper!, ceil = storeyCeiling(h, st, true);
      expect(st.height).toBe(2.55);
      expect(ceil(3, 4.35)).toBeCloseTo(uf.level + 2.55, 9); // under the ridge: flat
      // at the inner face of the garden wall and of the garage wing's side wall: the knee wall
      expect(ceil(3, h.wallThickness) - uf.level).toBeCloseTo(1.25, 9);
      expect(ceil(h.width - h.wallThickness, 10.5) - uf.level).toBeCloseTo(1.25, 9);
      expect(ceil(3, 2) - ceil(3, 1)).toBeCloseTo(Math.tan((38 * Math.PI) / 180), 6); // 38° in between
      expect(ceilingDrop(h)).toBeGreaterThan(h.roof.thickness);
      // the ceiling mesh: nowhere above the flat ceiling, nowhere below the eaves
      const [c0, c1] = yRange(layers.roof.ceiling!);
      expect(c1).toBeCloseTo(uf.level + 2.55, 6);
      expect(c0).toBeCloseTo(h.wallTop, 6); // the lining starts on top of the eaves walls
      // partition walls, cupboards and beds of the attic do not poke through it
      for (const k of ['interior', 'cabinet', 'oak', 'linen', 'door'] as PartName[]) {
        const pos = layers.upper[k]!.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const X = pos.getX(i) + h.width / 2, Y = pos.getZ(i) + h.depth / 2;
          if (!inOutline([X, Y])) continue;
          expect(pos.getY(i)).toBeLessThanOrEqual(ceil(X, Y) + 0.03);
        }
      }
      // on the ground floor everything stands under the 2.68 m ceiling
      const g = storeyCeiling(h, inr.ground, false);
      expect(g(1, 1)).toBe(2.68);
      for (const k of ['cabinet', 'cabinetDark', 'stone', 'door'] as PartName[]) expect(yRange(layers.base[k]!)[1]).toBeLessThanOrEqual(2.68 + 1e-6);
    });

    it('rooms are furnished as on the plans: kitchen, bathrooms, five beds, and the variants share it', () => {
      const count = (st: typeof inr.ground, kind: string) => st.items.filter((f) => f.kind === kind).length;
      expect(count(inr.ground, 'dining') + count(inr.ground, 'sofa') + count(inr.ground, 'island') + count(inr.ground, 'fireplace')).toBe(5);
      expect(count(inr.ground, 'stool')).toBe(3);
      expect(count(inr.ground, 'wc') + count(inr.upper!, 'wc')).toBe(3);
      expect(count(inr.upper!, 'bed')).toBe(4);
      expect(count(inr.upper!, 'bathtub')).toBe(2);
      // tiles in the kitchen and the bathrooms, concrete in the garage and the boiler room
      expect(inr.ground.floors.filter((f) => f.finish === 'concrete')).toHaveLength(2);
      for (const k of ['tile', 'concrete', 'steel', 'ceramic', 'glass', 'fabric', 'plant'] as PartName[]) expect(layers.base[k]).toBeDefined();
      // the variants have the same rooms and furniture; only their garage and boiler room are lowered
      for (const v of [argania2Low, argania2Mid]) {
        expect(v.interior!.upper).toBe(inr.upper);
        expect(v.interior!.ground.items).toHaveLength(inr.ground.items.length);
        expect(v.interior!.ground.walls).toHaveLength(inr.ground.walls.length);
      }
      expect(inr.lowered).toBeUndefined();
      // the fireplace's flue is the chimney: it stands over the fireplace block
      const fp = inr.ground.items.find((f) => f.kind === 'fireplace')!, ch = h.roof.chimneys[0];
      expect(Math.abs(ch.x - fp.at[0])).toBeLessThan(fp.w! / 2);
      expect(Math.abs(ch.y - fp.at[1])).toBeLessThan(fp.d! / 2 + ch.d / 2);
    });
  });

  describe('split-level garage: the floor of the garage and the boiler room really is lower', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    const cases = [
      { h: argania2Mid, drop: MID_GARAGE_DROP, risers: MID_RISERS, floor: MID_FLOOR_LEVEL, pl: PZT.placement },
      { h: argania2Low, drop: GARAGE_DROP, risers: RISERS, floor: LOW_FLOOR_LEVEL, pl: PZT.placement },
    ];
    const area = (v: number[][]) => Math.abs(v.reduce((s2, p, i) => s2 + p[0] * v[(i + 1) % v.length][1] - v[(i + 1) % v.length][0] * p[1], 0)) / 2;
    const yRange = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); return [g.boundingBox!.min.y, g.boundingBox!.max.y]; };

    it('the floor slab is cut out over garage and boiler room, with a concrete floor one drop lower', () => {
      for (const { h, drop } of cases) {
        const low = h.interior!.lowered!;
        expect(low.level).toBe(-drop);
        // garage 5.95 × 5.97 and boiler room 2.61 × 2.21, measured to the middle of the walls round them
        expect(area(low.outline)).toBeGreaterThan(35.2 + 5.58);
        expect(area(low.outline)).toBeLessThan(35.2 + 5.58 + 8);
        // inside the house, reaching the façade only at the garage front
        for (const p of low.outline) { expect(p[0]).toBeGreaterThan(h.wallThickness); expect(p[0]).toBeLessThan(h.width - 0.2); expect(p[1]).toBeLessThanOrEqual(h.depth); }
        expect(Math.max(...low.outline.map((p) => p[1]))).toBe(h.depth);
        // no upper floor in the garage doorway: nothing of the boards within the door's width in the front wall's thickness
        const door = h.openings.find((o) => o.kind === 'garage')!, fl = buildHouseLayers(h).base.floor!.attributes.position;
        for (let i = 0; i < fl.count; i += 3) {
          const cx = (fl.getX(i) + fl.getX(i + 1) + fl.getX(i + 2)) / 3 + h.width / 2, cy = (fl.getZ(i) + fl.getZ(i + 1) + fl.getZ(i + 2)) / 3 + h.depth / 2;
          expect(Math.abs(cx - door.at) < door.width / 2 && cy > h.depth - h.wallThickness).toBe(false);
        }
        const parts = buildHouseLayers(h).base;
        const [c0, c1] = yRange(parts.concrete!);
        expect(c0).toBeCloseTo(-drop + 0.005, 6);
        expect(c1).toBeCloseTo(-drop + 0.005, 6);
        // the boards stop at its edge
        const pos = parts.floor!.attributes.position;
        let a = 0;
        for (let i = 0; i < pos.count; i += 3) a += Math.abs((pos.getX(i + 1) - pos.getX(i)) * (pos.getZ(i + 2) - pos.getZ(i)) - (pos.getX(i + 2) - pos.getX(i)) * (pos.getZ(i + 1) - pos.getZ(i))) / 2;
        expect(a).toBeCloseTo(polygonAreaPlan(h.outline) - area(low.outline), 1);
        // the catalogue house keeps one floor: its garage and boiler room are concrete at ±0.00
        expect(yRange(buildHouseLayers(argania2).base.concrete!)[0]).toBeGreaterThan(0);
      }
    });

    it('rectangle subtraction, used to cut the floor: the pieces tile what is left', () => {
      const a: [number, number, number, number] = [0, 0, 10, 8];
      const ar = (rs: number[][]) => rs.reduce((s2, r) => s2 + (r[2] - r[0]) * (r[3] - r[1]), 0);
      expect(subtractRect(a, [20, 0, 30, 5])).toEqual([a]); // apart
      expect(ar(subtractRect(a, [2, 2, 5, 6]))).toBeCloseTo(80 - 12, 9); // a hole in the middle: four pieces
      expect(subtractRect(a, [2, 2, 5, 6])).toHaveLength(4);
      expect(ar(subtractRect(a, [6, 3, 12, 9]))).toBeCloseTo(80 - 4 * 5, 9); // over a corner
      expect(subtractRect(a, [-1, -1, 11, 9])).toEqual([]); // covered
    });

    it('walls round it go down to the lower floor; the boiler-room door is on it, the vestibule door opens away from the steps', () => {
      for (const { h, drop } of cases) {
        const walls = h.interior!.ground.walls, lowWalls = walls.filter((w) => w.base !== undefined);
        expect(lowWalls.map((w) => w.id).sort()).toEqual(['boilerBath', 'garageBack', 'garageVest', 'room7South']);
        for (const w of lowWalls) expect(w.base).toBe(-drop);
        const doors = walls.flatMap((w) => w.doors ?? []);
        expect(doors.find((d) => d.id === 'boiler')!.sill).toBe(-drop);
        expect(doors.find((d) => d.id === 'garage')!).toMatchObject({ opens: 'W' });
        expect(doors.find((d) => d.id === 'garage')!.sill).toBeUndefined(); // at the house's floor
        expect(argania2.interior!.ground.walls.flatMap((w) => w.doors ?? []).find((d) => d.id === 'garage')!.opens).toBe('E');
        // partition walls and the outer walls reach the lower floor, not below it
        const parts = buildHouseLayers(h).base;
        expect(yRange(parts.interior!)[0]).toBeCloseTo(-drop, 6);
        expect(yRange(parts.door!)[0]).toBeCloseTo(-drop, 2); // the boiler-room door's lining stands on the lower floor
      }
    });

    it('steps inside: as many risers as outside, from the lower floor up to the doors', () => {
      for (const { h, drop, risers } of cases) {
        const flights = h.interior!.stairs!.flights.slice(2), low = h.interior!.lowered!;
        const side = h.openings.filter((o) => o.kind === 'door' && o.wall === 'wingWest');
        // the compromise keeps the side door from the covered entrance (three steps); with 1.5 m it is left out
        expect(side).toHaveLength(drop <= 0.6 ? 1 : 0);
        expect(flights).toHaveLength(1 + side.length);
        for (const f of flights) {
          expect(f.treads).toBe(risers - 1);
          expect(f.rise * risers).toBeCloseTo(drop, 9);
          expect(f.startLevel).toBe(-drop);
          expect(f.startLevel + f.treads * f.rise).toBeCloseTo(-f.rise, 9); // one riser below the threshold
          expect(f.dir).toBe('W');
          // the whole flight stands on the lowered floor and ends at the garage's west wall
          expect(pointInPolygon([f.from[0], f.from[1]], low.outline as P2[])).toBe(true);
          expect(f.from[0] - f.treads * f.going).toBeCloseTo(7.85, 6);
          expect(f.rise).toBeLessThan(0.19);
        }
        if (side.length) expect(flights[1].from[1]).toBe(side[0].at);
      }
    });

    it('what stands in the garage and the boiler room stands on the lower floor', () => {
      for (const { h, drop } of cases) {
        const items = h.interior!.ground.items, lowItems = items.filter((f) => f.level !== undefined);
        expect(lowItems.map((f) => f.kind).sort()).toEqual(['boiler', 'counter', 'counter', 'shelf', 'tank', 'wardrobe']);
        for (const f of lowItems) expect(f.level).toBe(-drop);
        expect(items.find((f) => f.kind === 'sofa')!.level).toBeUndefined();
        // the concrete finish rectangles of the one-level house are replaced by the lowered slab
        expect(h.interior!.ground.floors.some((f) => f.finish === 'concrete')).toBe(false);
        expect(yRange(buildHouseLayers(h).base.cabinetDark!)[0]).toBeLessThan(-drop + 0.2);
      }
    });

    it('the ground under the house steps down with the floor, inside the walls', () => {
      for (const { h, drop, floor, pl } of cases) {
        const site2 = withGround(base, GROUND_DESIGN[h.id]);
        const lower = lowerGroundPlatform(h, pl, floor)!;
        const platforms = [lower, { polygon: platformPolygon(h, pl), h: floor - h.plinth }];
        const ground = (X: number, Y: number) => carvedHeight(site2, ...toSite(toLocal(h, X, Y), pl), platforms);
        const G = floor - drop - 0.02;
        for (const [X, Y] of [[10.8, 9], [8.2, 6.3], [13.5, 11.5], [12.5, 4.6]]) expect(ground(X, Y)).toBeCloseTo(G, 6); // garage, boiler room
        for (const [X, Y] of [[12, 2], [10.4, 4.6], [6.8, 7], [3, 3]]) expect(ground(X, Y)).toBeCloseTo(floor - h.plinth, 6); // room 7, bathroom, vestibule, living room
        // under the floor everywhere: the lowered floor is 2 cm above its ground
        expect(G).toBeLessThan(floor - drop);
        // the step runs inside the house's walls: every point of it lies inside the outline
        for (const q of h.lowerGround!.hardEdge!.slice(2, -2)) expect(pointInPolygon([q[0], q[1]], h.outline as P2[])).toBe(true);
      }
    });
  });

  describe('drive slope (nachylenie wjazdu): from the ground at the entrance gate to the garage floor', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, [], [], [], survey);
    const slopeOf = (h: typeof argania2) => {
      const st = PROJECT_START[h.id], s = withGround(base, GROUND_DESIGN[h.id]);
      return driveSlope(h, st.placement, st.floorLevel, layoutGates(h.id, PZT_GATES), s.parcel, surveyedHeightAt(s))!;
    };

    it('all three variants of Dom w Arganiach: the same gate (355.88) and the same 9.8 m, the garage at its own level', () => {
      const pzt = slopeOf(argania2), low = slopeOf(argania2Low), mid = slopeOf(argania2Mid);
      for (const d of [pzt, low, mid]) {
        expect(d.gateLevel).toBeCloseTo(355.88, 1); // the surveyed ground on the boundary, whatever the plot's design
        expect(d.length).toBeCloseTo(9.79, 1);
        expect(d.rise).toBeCloseTo(d.garageLevel - d.gateLevel, 9);
        expect(d.slope).toBeCloseTo(d.rise / d.length, 9);
      }
      // on the PZT the garage floor is the house floor
      expect(pzt.garageLevel).toBe(357);
      expect(pzt.slope).toBeCloseTo(0.115, 2);
      // compromise: the garage 0.50 m under the floor of 357.40
      expect(mid.garageLevel).toBeCloseTo(MID_FLOOR_LEVEL - MID_GARAGE_DROP, 9);
      expect(mid.slope).toBeCloseTo(0.105, 2);
      // lowered garage: 1.50 m under the floor of 357.80, nearly level with the gate
      expect(low.garageLevel).toBeCloseTo(LOW_FLOOR_LEVEL - GARAGE_DROP, 9);
      expect(low.slope).toBeCloseTo(0.043, 2);
      // the gate is in the middle of the sliding gate, on the boundary; the door in the garage front
      const a = base.parcel[0], b = base.parcel[1], g = PZT_GATES[0];
      expect(closestOnSegment(pzt.gate, a, b)).toEqual([expect.closeTo(pzt.gate[0], 6), expect.closeTo(pzt.gate[1], 6)]);
      expect(Math.hypot(pzt.gate[0] - a[0], pzt.gate[1] - a[1])).toBeCloseTo((g.from + g.to) / 2, 6);
      const doorPlan = toHouse(pzt.door, PZT.placement);
      expect([doorPlan[0] + argania2.width / 2, doorPlan[1] + argania2.depth / 2]).toEqual([expect.closeTo(10.82, 6), expect.closeTo(12.4, 6)]);
    });

    it('a garage below the gate gives a negative slope; no garage door or no sliding gate gives none', () => {
      const st = PROJECT_START.argania2, flat = () => 358;
      const down = driveSlope(argania2, st.placement, 357, PZT_GATES, base.parcel, flat)!;
      expect(down.rise).toBeCloseTo(-1, 9);
      expect(down.slope).toBeLessThan(0);
      expect(driveSlope(argania2, st.placement, 357, PZT_GATES.filter((g) => g.kind !== 'sliding'), base.parcel, flat)).toBeNull();
      expect(driveSlope({ ...argania2, openings: argania2.openings.filter((o) => o.kind !== 'garage') }, st.placement, 357, PZT_GATES, base.parcel, flat)).toBeNull();
      // a door in a wall along Y (Ambrozja 17, Dom Grela): `at` is then the plan Y
      for (const h of HOUSE_LIST) {
        const door = h.openings.find((o) => o.kind === 'garage');
        if (!door) continue;
        const d = driveSlope(h, st.placement, 357, PZT_GATES, base.parcel, flat)!;
        expect(d.garageLevel).toBeCloseTo(357 + door.sill, 9);
        expect(pointInPolygon(d.door, offsetPolygon(footprintSite(h, st.placement), 0.05))).toBe(true);
      }
    });
  });

  describe('compromise variant: floor 357.40, garage three steps lower, on the PZT position, plot not levelled', () => {
    const survey = JSON.parse(readFileSync('public/site/survey.json', 'utf8')) as Survey;
    const roads = JSON.parse(readFileSync('public/site/roads.json', 'utf8')) as Road[];
    const base = makeSite(meta, parcel.ring, [], dem.buffer.slice(dem.byteOffset, dem.byteOffset + dem.byteLength), false, roads, [], [], survey);
    const mid = withGround(base, GROUND_DESIGN[argania2Mid.id]);
    const pl = PZT.placement, lay = PROJECT_LAYOUT[argania2Mid.id];
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

    it('stands exactly where the PZT draws the house, like every variant of Dom w Arganiach: 5.2 m from the north-west boundary, 10.9 m from the road behind', () => {
      for (const id of ['argania2', 'argania2-low', 'argania2-mid']) expect(PROJECT_START[id].placement).toBe(PZT.placement);
      expect(PROJECT_START['argania2-mid'].floorLevel).toBe(MID_FLOOR_LEVEL);
      const nearest = (p: typeof pl, e: number) => Math.min(...footprintSite(argania2Mid, p).map((c) => off(c, e)));
      expect(nearest(pl, 1)).toBeCloseTo(5.2, 1);
      expect(nearest(pl, 2)).toBeCloseTo(10.87, 1); // as labelled on the map
      expect(nearest(pl, 5)).toBeGreaterThan(20);
      useStore.getState().set({ projectId: 'ambrozja17', projectState: {}, placement: { x: 9, z: 9, bearing: 10, mirror: false }, floorLevel: 350 });
      useStore.getState().setProject('argania2-mid');
      expect(useStore.getState().placement).toEqual(PZT.placement);
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

    it('forecourt: level for 1 m at the garage door, then about 12.5% down to the surveyed ground at the gate', () => {
      const G = MID_FLOOR_LEVEL - MID_GARAGE_DROP - 0.02;
      expect(ground(10.8, 12.6)).toBeCloseTo(G, 6);
      expect(ground(6.0, 13.2)).toBeCloseTo(G, 6); // foot of the stairs
      expect(ground(10.8, 11.5)).toBeCloseTo(G, 6); // inside the garage: the ground steps down with the floor
      expect(ground(3.5, 4.0)).toBeCloseTo(MID_FLOOR_LEVEL - 0.05, 6); // under the living room: the building platform
      expect((ground(10.8, 15.0) - ground(10.8, 21.0)) / 6).toBeCloseTo(MID_DRIVE_FALL, 2);
      expect(MID_FLAT).toBe(1);
      expect(MID_DRIVE_FALL).toBeLessThan(0.13); // about as steep as on the PZT (12%)
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
      // the drive: only as wide as the garage door needs (7 m), from the garage front to 0.3 m inside the north-east boundary
      expect(lay.driveway.points).toHaveLength(4);
      const drivePlan = lay.driveway.points.map((p) => { const l = toHouse(p, pl); return [l[0] + argania2Mid.width / 2, l[1] + argania2Mid.depth / 2]; });
      expect(drivePlan[0][1]).toBeCloseTo(argania2Mid.depth, 1);
      expect(drivePlan[1][0] - drivePlan[0][0]).toBeCloseTo(7.0, 1);
      expect([drivePlan[0][0], drivePlan[1][0], drivePlan[3][0]].map((v) => Math.round(v * 100) / 100)).toEqual([MID_DRIVE.left, MID_DRIVE.right, MID_DRIVE.leftAtFence]);
      expect(midDriveLeft(12.4)).toBe(MID_DRIVE.left);
      expect(off(lay.driveway.points[2], 0)).toBeCloseTo(0.3, 1);
      expect(off(lay.driveway.points[3], 0)).toBeCloseTo(0.3, 1);
      expect(off(lay.driveway.points[2], 1)).toBeGreaterThan(3); // the rest, 3 m up to the north-west neighbour, is garden
      expect(lay.driveway.points.every((p) => pointInPolygon(p, base.parcel))).toBe(true);
      expect(polygonArea(lay.driveway.points)).toBeLessThan(polygonArea(PZT_DRIVEWAY.points) * 0.6);
      // it covers the garage door with room on both sides, and lies on the lowered forecourt
      const door = argania2Mid.openings.find((o) => o.kind === 'garage')!;
      expect(MID_DRIVE.left).toBeLessThan(door.at - door.width / 2 - 0.1);
      expect(MID_DRIVE.right).toBeGreaterThan(door.at + door.width / 2 + 1.5);
      for (const [X, Y] of [[8.5, 13], [14.9, 13], [14.9, 21], [8.8, 21.5]]) expect(pointInPolygon(at(X, Y), lower.polygon)).toBe(true);
      // the fence opens only at the gates; the sliding gate is centred on the garage door
      const open = fenceOpenings(base.parcel, 0, [lay.driveway.points], lay.gates);
      expect(open.map(([o, c, k]) => [Math.round((c - o) * 100) / 100, k])).toEqual([[1, 'wicket'], [4.5, 'sliding']]);
      const doorMid = at(10.82, 22.0);
      expect(Math.abs((open[1][0] + open[1][1]) / 2 - ((doorMid[0] - a[0]) * d[0] + (doorMid[1] - a[1]) * d[1]))).toBeLessThan(0.15);
      const fp = footprintSite(argania2Mid, pl);
      for (const c of lay.cars.filter((q) => !q.id.startsWith('garage-'))) {
        expect(pointInPolygon([c.x, c.z], lay.driveway.points)).toBe(true);
        expect(pointInPolygon([c.x, c.z], fp)).toBe(false);
      }
      for (const c of lay.cars.filter((q) => q.id.startsWith('garage-'))) expect(pointInPolygon([c.x, c.z], fp)).toBe(true);
      // swapped in by id; the visitor's own items and the other projects are untouched
      const garden = [PZT_DRIVEWAY, { id: 'mine', kind: 'patio' as const, points: [] }], cars = [...PZT_CARS, { id: 'c9', x: 5, z: 5, rot: 1, color: '#000' }];
      expect(layoutGarden('argania2-mid', garden).map((g) => g.points)).toEqual([lay.driveway.points, []]);
      expect(layoutCars('argania2-mid', cars).map((c) => c.x)).toEqual([...lay.cars.map((c) => c.x), 5]);
      expect(layoutCars('argania2-mid', cars.slice(1)).map((c) => c.id)).toEqual(['pzt-car-2', 'garage-car-1', 'garage-car-2', 'c9']); // a removed car stays removed
      expect(layoutGates('argania2-mid', PZT_GATES)).toEqual(lay.gates);
      for (const id of ['argania2', 'argania2-low', 'ambrozja17']) {
        expect(layoutGarden(id, garden)).toBe(garden);
        if (id !== 'ambrozja17') expect(layoutCars(id, cars)).toBe(cars);
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
    const out = migrateState({ projectId: 'grela-bilgoraj', projectState: {}, placement: { x: 1, z: 1, bearing: 0, mirror: false } }, 2) as { annexes: object; target: string; projectId: string; projectState: Record<string, { placement: { x: number }; annexes: object }> };
    expect(out.annexes).toEqual({});
    expect(out.target).toBe('main');
    // v7 opens the compromise variant; the house they had is kept under its own project
    expect(out.projectId).toBe('argania2-mid');
    expect(out.projectState['grela-bilgoraj'].placement.x).toBe(1);
    expect(out.projectState['grela-bilgoraj'].annexes).toEqual({});
  });

  it('new visitors start on the compromise variant at its own position, ±0.00 = 357.40', () => {
    expect(DEFAULT_HOUSE_ID).toBe('argania2-mid');
    expect(DEFAULT_PROJECT).toBe(argania2Mid.id);
    const init = useStore.getInitialState();
    expect(init.projectId).toBe('argania2-mid');
    expect(init.placement).toEqual(PZT.placement);
    expect(init.floorLevel).toBe(MID_FLOOR_LEVEL);
    expect(isPztPlacement(init.placement, init.floorLevel, PROJECT_START[init.projectId])).toBe(true);
    expect(init.placementInitialised).toBe(true);
    // and with the garden: the shed in the east corner, its drive, and the thuja hedges
    expect(init.outbuildings).toEqual([DEFAULT_SHED]);
    expect(init.trees).toEqual([...THUJA_HEDGE, ...GARDEN_PLANTS]);
    expect(init.trees.filter((t) => t.kind === 'thuja')).toHaveLength(THUJA_HEDGE.length);
  });

  it('new visitors also get the PZT layout: forecourt, gate and wicket, fence all round, two cars', () => {
    const init = useStore.getInitialState();
    expect(init.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', ...G_IDS]);
    expect(init.gates.map((g) => g.kind)).toEqual(['sliding', 'wicket']);
    expect(init.cars.map((c) => c.id)).toEqual(['pzt-car-1', 'pzt-car-2', 'garage-car-1', 'garage-car-2']);
    expect(init.fenceEdges).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('migrates v4 storage: adds the PZT layout unless a drive / fence was already laid out', () => {
    const fresh = migrateState({ projectId: 'argania2', garden: [], fenceEdges: [] }, 4) as { cars: unknown[]; garden: { id: string }[]; fenceEdges: number[] };
    expect(fresh.cars).toHaveLength(4); // two outside, two in the garage
    expect(fresh.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', ...G_IDS]);
    expect(fresh.fenceEdges).toHaveLength(6);
    const own = migrateState({ garden: [{ id: 'mine', kind: 'driveway', points: [] }], fenceEdges: [2] }, 4) as { garden: { id: string }[]; fenceEdges: number[] };
    expect(own.garden.map((g) => g.id)).toEqual(['mine', 'shed-drive', ...G_IDS]);
    expect(own.fenceEdges).toEqual([2]);
  });

  it('migrates v5 storage: exact forecourt, explicit gates, the PZT house and cars moved onto the drawing', () => {
    const old = { x: -3.95, z: -12.29, bearing: 51.3, mirror: false };
    const v5 = {
      projectId: 'argania2', placement: old, projectState: {},
      garden: [{ id: 'pzt-driveway', kind: 'driveway', points: [[0, 0]] }, { id: 'pzt-wicket', kind: 'path', points: [[0, 0]] }, { id: 'lawn1', kind: 'lawn', points: [] }],
      cars: [{ id: 'pzt-car-1', x: 0, z: 0, rot: 0, color: '#ff0000' }, { id: 'c9', x: 5, z: 5, rot: 1, color: '#000' }],
    };
    const out = migrateState(v5, 5) as { placement: typeof old; projectState: Record<string, { placement: typeof old }>; garden: { id: string; points: P2[] }[]; gates: unknown[]; cars: { id: string; x: number; color: string }[] };
    // (v7 then opens the compromise variant; the PZT house is kept under its own project)
    expect(out.projectState.argania2.placement).toEqual(PZT.placement);
    expect(out.placement).toEqual(PZT.placement);
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'lawn1', 'shed-drive', ...G_IDS]);
    expect(out.garden[0].points).toEqual(PZT_DRIVEWAY.points);
    expect(out.gates).toEqual(PZT_GATES);
    expect(out.cars[0]).toMatchObject({ x: PZT_CARS[0].x, color: '#ff0000' });
    expect(out.cars[1].x).toBe(5);
    // a Dom w Arganiach the user had moved is put back as well (v13: every variant stands on the PZT position)
    const moved = migrateState({ ...v5, placement: { ...old, x: 2 } }, 5) as { projectState: Record<string, { placement: typeof old }> };
    expect(moved.projectState.argania2.placement).toEqual(PZT.placement);
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
    const out = (migrateState({ placement: { x: 3, z: 4, bearing: 10, mirror: false }, floorLevel: null }, 1)) as { projectId: string; projectState: Record<string, { placement: { x: number }; floorLevel: number | null }>; placement: { x: number } };
    // the single house was Ambrozja 17: kept as that project, while v7 opens the compromise variant
    expect(Object.keys(out.projectState)).toEqual(['ambrozja17']);
    expect(out.projectState.ambrozja17.placement.x).toBe(3);
    expect(out.projectState.ambrozja17.floorLevel).toBeNull();
    expect(out.projectId).toBe('argania2-mid');
    expect(out.placement).toEqual(PZT.placement);
  });

  it('migrates v6 storage: thuja hedges replace what was planted, the shed and its drive arrive, the compromise variant opens', () => {
    const mine = { x: 1, z: 2, bearing: 40, mirror: false };
    const v6 = {
      projectId: 'argania2', placement: mine, floorLevel: 357.1, annexes: {}, projectState: { 'argania2-mid': { placement: { ...PZT.placement, x: 0 }, floorLevel: 357.5 } },
      garden: [PZT_DRIVEWAY, { id: 'bed', kind: 'flowerbed', points: [] }], outbuildings: [],
      trees: [{ id: 't1', kind: 'shrub', x: 0, z: 0, height: 1.3 }, { id: 't2', kind: 'shrub', x: 1, z: 1, height: 1.2 }],
    };
    const out = migrateState(v6, 6) as ReturnType<typeof useStore.getState>;
    expect(out.trees).toEqual([...THUJA_HEDGE, ...GARDEN_PLANTS]); // the bushes are gone
    expect(out.trees.some((t) => t.id === 't1' || t.kind === 'shrub')).toBe(false);
    expect(out.outbuildings).toEqual([DEFAULT_SHED]);
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'bed', 'shed-drive', ...G_IDS]);
    // the compromise variant opens; v13 puts it and the house they were on back on the PZT position, each at its own level
    expect(out.projectId).toBe('argania2-mid');
    expect(out.placement).toEqual(PZT.placement);
    expect(out.floorLevel).toBe(MID_FLOOR_LEVEL);
    expect(out.projectState.argania2).toMatchObject({ placement: PZT.placement, floorLevel: PZT.floorLevel });
    // a shed they placed themselves stays; at the planned spot it gets the recommended level and the drive
    const there = migrateState({ ...v6, outbuildings: [{ id: 'ob-x', kind: 'wiata-garaz', placement: { ...DEFAULT_SHED.placement, x: DEFAULT_SHED.placement.x + 0.2 }, floorLevel: null }] }, 6) as ReturnType<typeof useStore.getState>;
    expect(there.outbuildings).toHaveLength(1);
    expect(there.outbuildings[0]).toMatchObject({ id: 'ob-x', floorLevel: SHED_FLOOR_LEVEL });
    expect(there.garden.some((g) => g.id === 'shed-drive')).toBe(true);
    const elsewhere = migrateState({ ...v6, outbuildings: [{ id: 'ob-y', kind: 'wiata-garaz', placement: { x: -15, z: -5, bearing: 0, mirror: false }, floorLevel: null }] }, 6) as ReturnType<typeof useStore.getState>;
    expect(elsewhere.outbuildings[0]).toMatchObject({ id: 'ob-y', floorLevel: null });
    expect(elsewhere.garden.some((g) => g.id === 'shed-drive')).toBe(false);
    // already on the current version: untouched
    expect(migrateState(v6, 13)).toBe(v6);
  });

  it('migrates v12 storage: every Dom w Arganiach is put back on the PZT position at its own floor level; other houses and the visitor\'s own planting stay', () => {
    const moved = { x: -2.47, z: -10.4, bearing: 51.3, mirror: false }; // where the compromise variant used to start
    const other = { x: 5, z: 6, bearing: 20, mirror: true };
    const own = { id: 'mine', kind: 'birch', x: 0, z: 0, height: 8 }, bed = { id: 'my-bed', kind: 'flowerbed', points: [] };
    const oldDrive = { ...SHED_DRIVE, points: SHED_DRIVE.points.map(([x, z]) => [x + 1, z]) };
    const v12 = {
      projectId: 'argania2-mid', placement: moved, floorLevel: 357.4, annexes: { a: 1 },
      projectState: { argania2: { placement: { ...moved, x: 1 }, floorLevel: 357.2 }, 'argania2-low': { placement: PZT.placement, floorLevel: 357.8 }, ambrozja17: { placement: other, floorLevel: 356.2 } },
      trees: [...THUJA_HEDGE, own, { id: 'g-front-grass-99', kind: 'grass', x: 99, z: 99, height: 1 }],
      garden: [PZT_DRIVEWAY, oldDrive, bed, { id: 'g-front-garden', kind: 'gravel', points: [] }],
    };
    const out = migrateState(v12, 12) as ReturnType<typeof useStore.getState>;
    expect(out.projectId).toBe('argania2-mid');
    expect(out.placement).toEqual(PZT.placement);
    expect(out.floorLevel).toBe(MID_FLOOR_LEVEL);
    expect(out.annexes).toEqual({ a: 1 });
    expect(out.projectState.argania2).toMatchObject({ placement: PZT.placement, floorLevel: PZT.floorLevel });
    expect(out.projectState['argania2-low']).toMatchObject({ placement: PZT.placement, floorLevel: LOW_FLOOR_LEVEL });
    expect(out.projectState.ambrozja17).toEqual({ placement: other, floorLevel: 356.2 });
    // the garden is redrawn around the house where it stands now; their own tree and bed stay
    expect(out.trees.map((t) => t.id)).toEqual([...THUJA_HEDGE.map((t) => t.id), 'mine', ...GARDEN_PLANTS.map((t) => t.id)]);
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', 'my-bed', ...G_IDS]);
    expect(out.garden.find((g) => g.id === 'shed-drive')).toEqual(SHED_DRIVE);
    expect(out.garden.find((g) => g.id === 'g-front-garden')!.points).toHaveLength(4);
    // another house that is open keeps its position
    const amb = migrateState({ ...v12, projectId: 'ambrozja17', placement: other, floorLevel: 356.2 }, 12) as ReturnType<typeof useStore.getState>;
    expect(amb.placement).toEqual(other);
    expect(amb.projectState['argania2-mid']).toBeUndefined();
    expect(migrateState(v12, 13)).toBe(v12);
  });

  it('"Tylko dom" hides everything but the house without deleting anything, and puts the controls back on the house', () => {
    const before = useStore.getState();
    before.set({ target: before.outbuildings[0]?.id ?? 'main', selected: 'x', tool: 'tree' });
    const kept = { garden: before.garden, trees: before.trees, cars: before.cars, gates: before.gates, fenceEdges: before.fenceEdges, outbuildings: before.outbuildings };
    useStore.getState().setHouseOnly(true);
    let st = useStore.getState();
    expect(st.layers.houseOnly).toBe(true);
    expect([st.target, st.selected, st.tool]).toEqual(['main', null, 'select']);
    for (const k of Object.keys(kept) as (keyof typeof kept)[]) expect(st[k]).toBe(kept[k]);
    useStore.getState().setHouseOnly(false);
    st = useStore.getState();
    expect(st.layers.houseOnly).toBe(false);
    for (const k of Object.keys(kept) as (keyof typeof kept)[]) expect(st[k]).toBe(kept[k]);
    // the other layer switches are left alone
    expect(st.layers.roads).toBe(true);
  });

  it('migrates v8 storage: two cars are parked in the garage, once', () => {
    const mine = { id: 'c9', x: 5, z: 5, rot: 1, color: '#000' };
    const out = migrateState({ projectId: 'argania2-mid', cars: [PZT_CARS[0], mine] }, 8) as ReturnType<typeof useStore.getState>;
    expect(out.cars.map((c) => c.id)).toEqual(['pzt-car-1', 'c9', 'garage-car-1', 'garage-car-2']);
    const again = migrateState({ projectId: 'argania2-mid', cars: out.cars }, 8) as ReturnType<typeof useStore.getState>;
    expect(again.cars).toHaveLength(4);
  });

  it('migrates v9 storage: the redrawn garden replaces the earlier design, the visitor\'s own planting stays', () => {
    const own = { id: 'mine', kind: 'birch', x: 0, z: 0, height: 8 }, bed = { id: 'my-bed', kind: 'flowerbed', points: [] };
    const v9 = {
      projectId: 'argania2-mid', placement: PZT.placement,
      trees: [...THUJA_HEDGE, own, { id: 'g-grass-3', kind: 'grass', x: 99, z: 99, height: 1 }, { id: 'g-boxwood-40', kind: 'boxwood', x: 98, z: 98, height: 1 }],
      garden: [PZT_DRIVEWAY, SHED_DRIVE, bed, { id: 'g-bed-forecourt', kind: 'gravel', points: [] }, { id: 'g-bed-entrance', kind: 'flowerbed', points: [] }],
    };
    const out = migrateState(v9, 9) as ReturnType<typeof useStore.getState>;
    expect(out.trees.map((t) => t.id)).toEqual([...THUJA_HEDGE.map((t) => t.id), 'mine', ...GARDEN_PLANTS.map((t) => t.id)]);
    expect(out.trees.some((t) => t.x > 90)).toBe(false); // the old design's plants are gone
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', 'my-bed', ...G_IDS]);
    expect(out.garden.find((g) => g.id === 'g-front-bed-entrance')!.points.length).toBeGreaterThan(4);
    expect(out.garden.some((g) => g.id === 'g-bed-forecourt')).toBe(false);
    // data saved by the unfinished version 10 (stepping slabs, no path) is replaced the same way
    const v10 = { ...v9, garden: [...v9.garden, { id: 'g-front-slab-1', kind: 'slab', points: [] }, { id: 'g-front-walk', kind: 'gravel', points: [] }] };
    const fixed = migrateState(v10, 10) as ReturnType<typeof useStore.getState>;
    expect(fixed.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', 'my-bed', ...G_IDS]);
    expect((migrateState(v10, 11) as ReturnType<typeof useStore.getState>).garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', 'my-bed', ...G_IDS]);
    expect(fixed.garden.find((g) => g.id === 'g-front-walk')!.kind).toBe('path');
    expect(fixed.garden.some((g) => (g.kind as string) === 'slab')).toBe(false);
  });

  it('migrates v7 storage: the designed garden is added to what is there, nothing twice', () => {
    const own = { id: 'mine', kind: 'birch', x: 0, z: 0, height: 8 };
    const v7 = { projectId: 'argania2-mid', placement: PZT.placement, trees: [...THUJA_HEDGE, own, GARDEN_PLANTS[0]], garden: [PZT_DRIVEWAY, SHED_DRIVE, GARDEN_AREAS[0]], outbuildings: [DEFAULT_SHED] };
    const out = migrateState(v7, 7) as ReturnType<typeof useStore.getState>;
    expect(out.trees).toHaveLength(THUJA_HEDGE.length + 1 + GARDEN_PLANTS.length);
    expect(out.trees.filter((t) => t.id === 'mine')).toHaveLength(1);
    expect(new Set(out.trees.map((t) => t.id)).size).toBe(out.trees.length);
    expect(out.garden.map((g) => g.id)).toEqual(['pzt-driveway', 'shed-drive', ...G_IDS]);
    expect(out.outbuildings).toEqual([DEFAULT_SHED]);
    expect(out.projectId).toBe('argania2-mid');
  });
});
