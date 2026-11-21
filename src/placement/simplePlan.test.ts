import { describe, expect, it } from 'vitest';
import { simplePlan } from './simplePlan';
import { argania2 } from '../house/argania2';
import { argania2Mid } from '../house/argania2-low';
import { grela } from '../house/grela';
import { ambrozja17 } from '../house/ambrozja17';
import { polygonArea, type P2 } from './geom2d';

const area = (cells: [number, number, number, number][]) => cells.reduce((s, [x0, y0, x1, y1]) => s + (x1 - x0) * (y1 - y0), 0);

describe('ground floor as lines (no wall thickness)', () => {
  it('runs the walls on to the outer face and fills every room up to the lines', () => {
    const sp = simplePlan(argania2Mid);
    const footprint = polygonArea(argania2.outline as P2[]);
    // every room is there, the stairs (about 4 m²) stay out
    for (const r of sp.rooms) expect(r.cells.length, r.name).toBeGreaterThan(0);
    const total = sp.rooms.reduce((s, r) => s + area(r.cells), 0);
    expect(total).toBeGreaterThan(footprint - 6);
    expect(total).toBeLessThanOrEqual(footprint + 1e-6);
    // the stair-core wall from the back wall's line; the walls by the bathroom (9.64 / 9.70 / 9.72) are one line
    expect(sp.walls.some((w) => w.a[0] === 7.51 && w.a[1] === 0)).toBe(true);
    expect(sp.walls.filter((w) => w.a[0] === w.b[0] && Math.abs(w.a[0] - 9.67) < 0.06).every((w) => w.a[0] === 9.64)).toBe(true);
    // the garage reaches the wing's outer face; the vestibule stops at its wall to the garage
    const garage = sp.rooms.find((r) => r.name.includes('Garaż'))!, vest = sp.rooms.find((r) => r.name.includes('Wiatrołap'))!;
    expect(Math.min(...garage.cells.map((c) => c[0]))).toBeCloseTo(7.4, 9);
    expect(Math.max(...vest.cells.map((c) => c[2]))).toBeCloseTo(7.77, 9);
    // the front wall's line runs on from F to that wall, so the two stay apart
    expect(sp.walls.some((w) => w.extra && w.a[1] === 8.7 && w.b[1] === 8.7)).toBe(true);
    // rooms are roughly as large as the catalogue's (they now include half of every wall)
    for (const r of sp.rooms) expect(area(r.cells), r.name).toBeGreaterThan(r.area * 0.95);
  });

  it('floods rooms from their labels where a project has no room outlines', () => {
    for (const h of [grela, ambrozja17]) {
      const sp = simplePlan(h);
      expect(sp.rooms.filter((r) => r.cells.length).length, h.name).toBeGreaterThan(h.rooms.length / 2);
    }
  });
});
