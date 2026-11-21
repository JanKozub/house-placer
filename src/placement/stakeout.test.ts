import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { makeStakeoutPlan, pickScale, pointFromRef, type StakeoutInput } from './stakeout';
import { nearestCornerDistances } from './setbacks';
import { toSite, type P2, type Placement } from './geom2d';
import { toLocal } from '../house/geometry';
import { argania2 } from '../house/argania2';
import { argania2Mid } from '../house/argania2-low';
import { grela } from '../house/grela';
import { MID_FLOOR_LEVEL, PLOT, PROJECT_LAYOUT, PZT, PZT_DRIVEWAY, PZT_GATES } from '../site/sitePlan';
import { buildStakeoutPdf } from '../ui/stakeoutPdf';

const meta = JSON.parse(readFileSync('public/site/site.json', 'utf8'));
const ring: [number, number][] = JSON.parse(readFileSync('public/site/parcel.json', 'utf8')).ring;
// site-local coords exactly as the app has them (x east, z south)
const parcel: P2[] = ring.map(([e, n]) => [e - meta.origin.E, -(n - meta.origin.N)]);

const input = (over: Partial<StakeoutInput> = {}): StakeoutInput => ({
  parcel,
  parcelNumber: '664/2',
  house: argania2Mid,
  placement: PZT.placement,
  floorLevel: MID_FLOOR_LEVEL,
  gates: PZT_GATES,
  driveways: [PROJECT_LAYOUT[argania2Mid.id].driveway.points],
  date: '20.11.2026',
  ...over,
});

describe('staking sheet', () => {
  it('uses the same plot as the app', () => {
    parcel.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(PLOT[i][0], 1);
      expect(p[1]).toBeCloseTo(PLOT[i][1], 1);
    });
  });

  for (const mirror of [false, true]) {
    it(`every border measurement leads back to its stake${mirror ? ' (mirrored house)' : ''}`, () => {
      const plan = makeStakeoutPlan(input({ placement: { ...PZT.placement, mirror } }));
      expect(plan.stakes.length).toBeGreaterThan(10);
      for (const s of plan.stakes) {
        expect(s.refs.length, s.label).toBeGreaterThan(0);
        for (const r of s.refs) {
          const q = pointFromRef(parcel, r);
          expect(Math.hypot(q[0] - s.p[0], q[1] - s.p[1]), `${s.label} via border ${r.edge + 1}`).toBeLessThan(0.001);
          expect(r.along).toBeGreaterThanOrEqual(0);
          expect(r.d).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  it('stakes the real house corners, the terrace and the gate posts, not the driveway', () => {
    const plan = makeStakeoutPlan(input());
    const labels = plan.stakes.map((s) => s.label);
    // C is where the gable wall runs straight on into the garage side: no corner there
    expect(labels.filter((l) => /^[A-Z]$/.test(l))).toEqual(['A', 'B', 'D', 'E', 'F', 'G']);
    // the terrace's outer corners, without those at the house (B, and 20 cm beside A) and without
    // the inner corner where its deeper part steps back
    expect(labels.filter((l) => l.startsWith('T'))).toEqual(['T1', 'T2', 'T3']);
    const t3 = plan.stakes.find((s) => s.label === 'T3')!.p, want3 = toSite(toLocal(argania2Mid, argania2.width, -3.0), PZT.placement);
    expect(Math.hypot(t3[0] - want3[0], t3[1] - want3[1])).toBeLessThan(1e-9);
    expect(labels.filter((l) => /^P\d/.test(l))).toEqual([]);
    // the sliding gate's posts; the wicket is left out
    expect(labels.filter((l) => /^[BF]\d$/.test(l))).toEqual(['B1', 'B2']);
    expect(plan.gates.map((g) => g.kind)).toEqual(['sliding']);
    expect(plan.stakes.every((s) => s.inside)).toBe(true);
    // the inner corner by the entrance is staked too
    const f = plan.stakes.find((s) => s.label === 'F')!.p;
    const want = toSite(toLocal(argania2Mid, 7.4, 8.7), PZT.placement);
    expect(Math.hypot(f[0] - want[0], f[1] - want[1])).toBeLessThan(1e-9);
  });

  it('gate posts stand on the gate border, measured from its nearer corner', () => {
    const plan = makeStakeoutPlan(input());
    const sliding = PZT_GATES.find((g) => g.kind === 'sliding')!;
    const posts = plan.stakes.filter((s) => s.kind === 'gate');
    expect(posts).toHaveLength(2);
    const L = Math.hypot(parcel[1][0] - parcel[0][0], parcel[1][1] - parcel[0][1]);
    for (const s of posts) {
      expect(s.refs).toHaveLength(1);
      expect(s.refs[0].edge).toBe(sliding.edge);
      expect(s.refs[0].d).toBe(0);
      // the gate is near corner II: measured from there
      expect(s.refs[0].corner).toBe(1);
    }
    expect(posts.map((s) => s.refs[0].along).sort((a, b) => a - b)).toEqual([L - sliding.to, L - sliding.from].sort((a, b) => a - b));
  });

  it('draws the same stakes with lines parallel to the house walls and square to a border', () => {
    const plan = makeStakeoutPlan(input());
    // A's line would run beside T1's, F's would cross the house, T2 lines up with no house corner
    expect(plan.lines.map((l) => l.label)).toEqual(['B', 'D', 'E', 'G', 'T1', 'T3']);
    const [A, B] = [[0, 0], [argania2.width, 0]].map(([X, Y]) => toSite(toLocal(argania2Mid, X, Y), PZT.placement));
    const ab = Math.hypot(B[0] - A[0], B[1] - A[1]), wall: P2 = [(B[0] - A[0]) / ab, (B[1] - A[1]) / ab];
    for (const l of plan.lines) {
      const p = plan.stakes.find((s) => s.label === l.label)!.p;
      // page 1: along a house wall's direction (or square to it)
      const d = l.wall.dir!;
      expect(Math.min(Math.abs(d[0] * wall[1] - d[1] * wall[0]), Math.abs(d[0] * wall[0] + d[1] * wall[1])), l.label).toBeLessThan(1e-9);
      // page 2: square to the border
      expect(l.square.dir).toBeUndefined();
      // both measurements lead back to the stake
      for (const r of [l.wall, l.square]) {
        const q = pointFromRef(parcel, r);
        expect(Math.hypot(q[0] - p[0], q[1] - p[1]), `${l.label} → border ${r.edge + 1}`).toBeLessThan(0.001);
      }
    }
    // the wall line from B runs on along A–B to the north-west border, the square one meets it at 6,72 m
    const b = plan.lines.find((l) => l.label === 'B')!;
    expect(b.wall.edge).toBe(1);
    expect(b.square.edge).toBe(1);
  });

  it('house corners are as far from their borders as the plan view says', () => {
    const plan = makeStakeoutPlan(input());
    let same = 0;
    for (const app of nearestCornerDistances(argania2Mid, PZT.placement, parcel)) {
      // the plan view may measure to a border's end; the sheet only measures square to a border
      const r = plan.stakes.find((s) => s.label === app.label)?.refs.find((rr) => rr.edge === app.edge);
      if (!r) continue;
      expect(r.d, `${app.label} → border ${app.edge + 1}`).toBeCloseTo(app.d, 6);
      same++;
    }
    expect(same).toBeGreaterThanOrEqual(4);
  });

  it('inside points are the plan coordinates from the back and west walls, mirrored or not', () => {
    for (const mirror of [false, true]) {
      const pl: Placement = { ...PZT.placement, mirror };
      const plan = makeStakeoutPlan(input({ placement: pl }));
      expect(plan.house.refAB).toEqual(['A', 'B']);
      expect(plan.house.refSide).toEqual(['G', 'A']);
      expect(plan.inside.length).toBeGreaterThan(10);
      // walls are lines without thickness: the stair-core wall starts on the back wall's line
      const p = plan.inside.find((s) => Math.hypot(s.plan[0] - 7.51, s.plan[1]) < 1e-6)!;
      expect(p.fromAB).toBeCloseTo(0, 9);
      expect(p.fromSide).toBeCloseTo(7.51, 9);
      // wall ends a few cm apart (two faces of one junction) are one stake
      for (const a of plan.inside) for (const b of plan.inside) if (a !== b) expect(Math.hypot(a.plan[0] - b.plan[0], a.plan[1] - b.plan[1])).toBeGreaterThan(0.15);
      // measured in the site: from the staked wall lines A–B and G–A
      const [A, B, G] = [[0, 0], [argania2.width, 0], [0, 8.7]].map(([X, Y]) => toSite(toLocal(argania2Mid, X, Y), pl));
      const lineDist = (q: P2, a: P2, b: P2) => Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const s of plan.inside) {
        expect(lineDist(s.p, A, B)).toBeCloseTo(s.fromAB, 9);
        expect(lineDist(s.p, G, A)).toBeCloseTo(s.fromSide, 9);
      }
      // numbered from the back wall forwards, no point twice
      for (let i = 1; i < plan.inside.length; i++) expect(plan.inside[i].fromAB).toBeGreaterThanOrEqual(plan.inside[i - 1].fromAB - 0.15);
    }
  });

  it('works for a project without a terrace outline (Dom Grela)', () => {
    const plan = makeStakeoutPlan(input({ house: grela, driveways: [PZT_DRIVEWAY.points] }));
    expect(plan.stakes.filter((s) => s.kind === 'terrace').map((s) => s.label)).toEqual(['T']);
    expect(plan.house.exactPartitions).toBe(false);
  });

  it('picks the largest usual scale that fits', () => {
    expect(pickScale(62, 48, 210, 165)).toBe(300);
    expect(pickScale(62, 48, 200, 165)).toBe(400);
    expect(pickScale(14.3, 16.25, 170, 200)).toBe(100);
    expect(pickScale(14.3, 16.25, 120, 120)).toBe(150);
  });

  it('builds the PDF (set STAKEOUT_PDF_OUT to keep it)', () => {
    const fonts = {
      regular: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf'),
      bold: readFileSync('node_modules/dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf'),
    };
    const doc = buildStakeoutPdf(makeStakeoutPlan(input()), fonts);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    if (process.env.STAKEOUT_PDF_OUT) writeFileSync(process.env.STAKEOUT_PDF_OUT, Buffer.from(bytes));
  });
});
