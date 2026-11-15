/**
 * Dom w Arganiach 2 with the garage on a lower floor (a split-level variant for plot 664/2).
 *
 * The plot falls about 2 m from the road behind the house to the gate in the north-east fence. Here
 * the house floor sits at road level and the garage floor 1.50 m below it (356.30): flat for 2.4 m
 * in front of the garage door, then about 5% down to the surveyed ground at the gate. Nine steps
 * (9 × 16.7 cm) lead from the forecourt up to the covered entrance. (With the garage only 1.00 m
 * lower the drive came out at 11%, hardly gentler than the 12% of the project on the PZT.) Everything above the garage door is
 * unchanged: same walls, roof and attic. The ground follows the same rules as Dom w Arganiach 2 on
 * the PZT (see GROUND_DESIGN in src/site/sitePlan.ts), so the two can be compared like for like.
 *
 * This is the user's variant of the ARCHON+ project, not a catalogue version: the levels, steps and
 * retaining walls are assumptions, to be designed by an architect.
 */
import { argania2 } from './argania2';
import type { ExtraBox, HouseDef, Vec2 } from './types';

const W = argania2.width, DW = argania2.depth; // 14.30 × 12.40
const D = 8.7; // main body depth
const XW = 7.4; // garage wing west face
/** garage floor below ±0.00 */
export const GARAGE_DROP = 1.5;
export const RISERS = 9;
const RISE = GARAGE_DROP / RISERS, TREAD = 0.3;
/**
 * Fall of the drive beyond the level part: it comes down to the surveyed ground at the gate
 * (355.9, 7.3 m on), with no step at the fence — the same rule as in the project it is compared with.
 */
export const DRIVE_FALL = 0.052;
const X_STAIR = 4.9; // west edge of the covered entrance and the stairs
const X_YARD = 3.04; // west edge of the forecourt (the drawn curb)
const GROUND = -argania2.plinth; // ground around the house, as in the project it is compared with

// stairs in front of the covered entrance, down to the forecourt
const stairs: ExtraBox[] = Array.from({ length: RISERS - 1 }, (_, i) => ({
  x0: X_STAIR, x1: XW, y0: DW + i * TREAD, y1: DW + (i + 1) * TREAD, h0: -GARAGE_DROP - 0.6, h1: -0.02 - (i + 1) * RISE, part: 'paving' as const,
}));
// retaining walls where the garden meets the forecourt: west of the stairs and east of the garage
const retaining: ExtraBox[] = [
  { x0: X_YARD - 0.25, x1: X_STAIR, y0: DW - 0.25, y1: DW, h0: -GARAGE_DROP - 0.6, h1: GROUND + 0.1, part: 'plinth' },
  { x0: W, x1: W + 1.5, y0: DW - 0.25, y1: DW, h0: -GARAGE_DROP - 0.6, h1: GROUND + 0.1, part: 'plinth' },
];

/** the forecourt: the drawn yard of the PZT in front of the garage (see src/site/sitePlan.ts) */
const hardEdge: Vec2[] = [[X_YARD, DW - 0.1], [XW + 0.1, DW - 0.1], [XW + 0.1, DW - 0.4], [W - 0.1, DW - 0.4], [W - 0.1, DW - 0.1], [W + 1.3, DW - 0.1]];

export const argania2Low: HouseDef = {
  ...argania2,
  id: 'argania2-low',
  name: 'Dom w Arganiach 2 (garaż niżej)',
  walls: argania2.walls.map((w) => (w.id === 'wingFront' ? { ...w, base: -GARAGE_DROP } : w)),
  openings: argania2.openings.map((o) => (o.kind === 'garage' ? { ...o, sill: -GARAGE_DROP } : o)),
  paving: [
    ...argania2.paving.filter((s) => s.y0 < D), // terrace
    { x0: X_STAIR, x1: XW, y0: D, y1: DW, top: -0.02 }, // covered entrance: the landing
  ],
  extras: [...(argania2.extras ?? []), ...stairs, ...retaining],
  facadeZones: argania2.facadeZones?.map((z) => (z.wall === 'wingFront' ? { ...z, h0: -GARAGE_DROP } : z)),

  // building platform up to the garage front; the forecourt beyond it is 1.5 m lower
  platform: [[-1, -1], [W + 1, -1], [W + 1, DW], [-1, DW]],
  apron: [[-0.5, -0.5], [W + 0.5, -0.5], [W + 0.5, DW - 0.25], [W, DW - 0.25], [W, 0], [0, 0], [0, D], [X_STAIR, D], [X_STAIR, D + 0.5], [-0.5, D + 0.5]],
  lowerGround: {
    outline: [...hardEdge, [19.27, DW], [18.2, 21.35], [XW, 22.15], [XW, 19.88], [X_YARD, 19.88]],
    top: -GARAGE_DROP - 0.02,
    fallFromY: DW + (RISERS - 1) * TREAD, // flat in front of the garage door and at the foot of the stairs
    fall: DRIVE_FALL,
    hardEdge,
  },
};
