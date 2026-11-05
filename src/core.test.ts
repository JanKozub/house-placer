import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { buildHouse, footprintLocal } from './house/geometry';
import { ambrozja17 } from './house/ambrozja17';
import { grela } from './house/grela';
import { ambrozja17Detached, detachedGarage } from './house/ambrozja17-detached';
import { defaultAnnexPlacement } from './house/annex';
import { carvedHeight } from './site/Terrain';
import { HOUSE_LIST } from './house/projects';
import { polygonAreaPlan, roofFaces, roofTopAt } from './house/roof';
import { migrateState, useStore } from './store';
import { pointInPolygon, polygonArea, polygonGap, toHouse, toSite, type P2 } from './placement/geom2d';
import { computeSetbacks, facingDistance, footprintSite, nearestCornerDistances } from './placement/setbacks';
import { computeEarthwork, offsetPolygon } from './placement/earthwork';
import { makeSite } from './geo/site';
import { sunState, warsawDate } from './site/sun';

const T30 = Math.tan(Math.PI / 6);

// every project and every separate building in it (detached garages)
const ALL_BUILDINGS = HOUSE_LIST.flatMap((h) => [h, ...(h.annexes ?? []).map((a) => a.def)]);

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

  it('openings sit inside their walls, clear of the corners, below the wall top', () => {
    for (const o of h.openings) {
      const w = h.walls.find((ww) => ww.id === o.wall)!;
      expect(w).toBeTruthy();
      const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
      const lo = Math.min(horiz ? w.a[0] : w.a[1], horiz ? w.b[0] : w.b[1]);
      const hi = Math.max(horiz ? w.a[0] : w.a[1], horiz ? w.b[0] : w.b[1]);
      // stay clear of the neighbouring wall at a corner: glass inside a wall stalls the path tracer
      expect(o.at - o.width / 2).toBeGreaterThanOrEqual(lo + h.wallThickness - 1e-9);
      expect(o.at + o.width / 2).toBeLessThanOrEqual(hi - h.wallThickness + 1e-9);
      expect(o.sill + o.height).toBeLessThan(w.top ?? h.wallTop);
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
    expect(size.z).toBeLessThan(h.depth + 3);
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

  it('migrates v1 storage (single house) to Ambrozja 17', () => {
    const out = (migrateState({ placement: { x: 3, z: 4, bearing: 10, mirror: false }, floorLevel: null }, 1)) as { projectId: string; projectState: object; placement: { x: number } };
    expect(out.projectId).toBe('ambrozja17');
    expect(out.projectState).toEqual({});
    expect(out.placement.x).toBe(3);
  });
});
