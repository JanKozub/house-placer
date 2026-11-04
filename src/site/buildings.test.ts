import { describe, expect, it } from 'vitest';
import { eaveHeight, minRect } from './Buildings';
import type { P2 } from '../placement/geom2d';

describe('neighbour buildings', () => {
  it('finds the bounding rectangle of a rotated outline', () => {
    const a = Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const rect: P2[] = [[0, 0], [12, 0], [12, 8], [0, 8]].map(([x, z]) => [x * c - z * s, x * s + z * c]);
    const r = minRect(rect);
    expect(r.L).toBeCloseTo(12, 5);
    expect(r.W).toBeCloseTo(8, 5);
    expect(r.area).toBeCloseTo(96, 4);
    expect(Math.abs(r.u[0] * c + r.u[1] * s)).toBeCloseTo(1, 5); // long axis along the 12 m side
  });
  it('maps storeys to plausible wall heights', () => {
    const b = (kind: 'h' | 'o' | 'c' | 'r', levels: number) => eaveHeight({ kind, levels, underConstruction: false, ring: [] });
    expect(b('h', 1)).toBeCloseTo(3.1);
    expect(b('h', 2)).toBeGreaterThan(b('h', 1));
    expect(b('o', 1)).toBeLessThan(b('h', 1));
  });
});
