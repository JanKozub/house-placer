/**
 * Dom w Arganiach 2 with the garage on a lower floor: two split-level variants for plot 664/2.
 *
 * The plot falls about 2 m from the road behind the house to the gate in the north-east fence.
 *
 * "garaż niżej" (argania2Low): the house floor sits at road level and the garage floor 1.50 m below
 * it (356.30): flat for 2.4 m in front of the garage door, then about 5% down to the surveyed ground
 * at the gate. Nine steps (9 × 16.7 cm) lead from the forecourt up to the covered entrance. (With
 * the garage only 1.00 m lower the drive came out at 11%, hardly gentler than the 12% of the project
 * on the PZT.) The ground follows the same rules as Dom w Arganiach 2 on the PZT (see GROUND_DESIGN
 * in src/site/sitePlan.ts), so the two can be compared like for like.
 *
 * "kompromis" (argania2Mid): half-way between the PZT and the variant above. The house floor is
 * 0.40 m above the PZT's (357.40) and the garage floor 0.50 m below it (356.90, about the PZT's
 * forecourt level), so three steps lead up to the entrance and the drive is about as steep as on
 * the PZT: level for 1 m, then 11.5%. The garage door is 25 cm taller (500/250), which leaves 25 cm
 * more wall above it than in the catalogue. The plot is not levelled: only the house, its terrace
 * and 2 m of lawn behind it stand on a platform, and the house stands 2.5 m further from the
 * north-west boundary (see src/site/sitePlan.ts).
 *
 * In both the garage floor really is lower, and the boiler room with it (it is entered from the
 * garage): the floor slab is cut out there, the walls around go down to the lower floor, the door
 * from the vestibule opens towards the vestibule and has steps behind it, the ground under the
 * house steps down with the floor, and what stands in the garage stands on the lower floor. In the
 * compromise the side door from the covered entrance has three steps inside as well; with a 1.5 m
 * drop that door is left out. Everything above the garage door is unchanged: same walls, roof and
 * attic. They are the
 * user's variants of the ARCHON+ project, not catalogue versions: the levels, steps and retaining
 * walls are assumptions, to be designed by an architect.
 */
import { argania2 } from './argania2';
import type { ExtraBox, HouseDef, Interior, StairFlight, Vec2 } from './types';

const W = argania2.width, DW = argania2.depth; // 14.30 × 12.40
const D = 8.7; // main body depth
const XW = 7.4; // garage wing west face
const TREAD = 0.3;
const X_STAIR = 4.9; // west edge of the covered entrance and the stairs
const X_YARD = 3.04; // west edge of the forecourt (the drawn curb)
const GROUND = -argania2.plinth; // ground around the house, as in the project it is compared with

interface SplitLevel {
  id: string;
  name: string;
  /** garage floor below ±0.00 */
  drop: number;
  /** equal risers from the forecourt up to the covered entrance */
  risers: number;
  /** level part of the forecourt in front of the garage door, m */
  flat: number;
  /** fall of the drive beyond the level part, down to the surveyed ground at the gate */
  driveFall: number;
  /** garage door height (catalogue: 2.25) */
  doorHeight?: number;
  /** how far behind the back wall the building platform reaches (default 1 m) */
  platformBack?: number;
  /** the forecourt's two corners on the north-east boundary line, in plan coords: at X = XW and at the north-west end */
  yardNE: [Vec2, Vec2];
}

function splitLevel(o: SplitLevel): HouseDef {
  const rise = o.drop / o.risers;
  // stairs in front of the covered entrance, down to the forecourt
  const stairs: ExtraBox[] = Array.from({ length: o.risers - 1 }, (_, i) => ({
    x0: X_STAIR, x1: XW, y0: DW + i * TREAD, y1: DW + (i + 1) * TREAD, h0: -o.drop - 0.6, h1: -0.02 - (i + 1) * rise, part: 'paving' as const,
  }));
  // retaining walls where the garden meets the forecourt: west of the stairs and east of the garage
  const retaining: ExtraBox[] = [
    { x0: X_YARD - 0.25, x1: X_STAIR, y0: DW - 0.25, y1: DW, h0: -o.drop - 0.6, h1: GROUND + 0.1, part: 'plinth' },
    { x0: W, x1: W + 1.5, y0: DW - 0.25, y1: DW, h0: -o.drop - 0.6, h1: GROUND + 0.1, part: 'plinth' },
  ];
  const back = o.platformBack ?? 1;

  // ---- the lowered part of the house: garage and boiler room ----
  // outline of the lowered floor: inside the walls around it, and out to the façade at the front,
  // so the upper floor does not run through the garage doorway
  const lowered: Vec2[] = [[7.77, 5.84], [11.14, 5.84], [11.14, 3.51], [W - 0.3, 3.51], [W - 0.3, DW], [7.77, DW]];
  const inLowered = ([X, Y]: Vec2) => (X > 7.77 && X < W - 0.3 && Y > 5.84 && Y < DW - 0.3) || (X > 11.14 && X < W - 0.3 && Y > 3.51 && Y <= 5.84);
  const from = argania2.interior!;
  const STEP = 0.28, GARAGE_X = 7.85; // going of the inside steps; the garage's west wall face
  const stepsAt = (Y: number): StairFlight => ({ from: [GARAGE_X + (o.risers - 1) * STEP, Y], dir: 'W', width: 0.9, treads: o.risers - 1, going: STEP, rise, startLevel: -o.drop, solid: o.risers });
  const sideDoor = o.drop <= 0.6 ? argania2.openings.find((op) => op.kind === 'door' && op.wall === 'wingWest') : undefined;
  const interior: Interior = {
    ...from,
    lowered: { outline: lowered, level: -o.drop },
    ground: {
      ...from.ground,
      walls: from.ground.walls.map((w) =>
        w.id && ['room7South', 'boilerBath', 'garageBack', 'garageVest'].includes(w.id)
          ? {
              ...w,
              base: -o.drop,
              // boiler room and garage are on one level; the vestibule door opens away from the steps
              doors: w.doors?.map((d) => (d.id === 'boiler' ? { ...d, sill: -o.drop } : d.id === 'garage' ? { ...d, opens: 'W' as const } : d)),
            }
          : w,
      ),
      floors: from.ground.floors.filter((f) => f.finish !== 'concrete'), // the lowered slab is the concrete floor
      items: from.ground.items.map((it) => (inLowered(it.at) ? { ...it, level: -o.drop } : it)),
    },
    stairs: {
      landings: from.stairs!.landings,
      flights: [...from.stairs!.flights, stepsAt(7.75), ...(sideDoor ? [stepsAt(sideDoor.at)] : [])],
    },
  };
  // the ground under the house steps down with the floor: along the inside of the garage's walls
  const step: Vec2[] = [
    [X_YARD, DW - 0.1], [XW + 0.1, DW - 0.1], [XW + 0.1, DW - 0.4], [7.8, DW - 0.4], [7.8, 5.87], [11.17, 5.87], [11.17, 3.54], [W - 0.33, 3.54], [W - 0.33, DW - 0.4],
    [W - 0.1, DW - 0.4], [W - 0.1, DW - 0.1], [W + 1.3, DW - 0.1],
  ];

  return {
    ...argania2,
    id: o.id,
    name: o.name,
    // the walls round the garage and the boiler room stand on the lower floor
    walls: argania2.walls.map((w) => (['wingFront', 'eastWing', 'wingWest', 'eastMain'].includes(w.id) ? { ...w, base: -o.drop } : w)),
    openings: argania2.openings
      .filter((op) => !(op.kind === 'door' && op.wall === 'wingWest') || !!sideDoor)
      .map((op) => (op.kind === 'garage' ? { ...op, sill: -o.drop, ...(o.doorHeight ? { height: o.doorHeight, ref: `brama ${op.width * 100}/${o.doorHeight * 100}` } : {}) } : op)),
    interior,
    paving: [
      ...argania2.paving.filter((s) => s.y0 < D), // terrace
      { x0: X_STAIR, x1: XW, y0: D, y1: DW, top: -0.02 }, // covered entrance: the landing
    ],
    extras: [...(argania2.extras ?? []), ...stairs, ...retaining],
    facadeZones: argania2.facadeZones?.map((z) => (z.wall === 'wingFront' ? { ...z, h0: -o.drop } : z)),

    // building platform up to the garage front; the forecourt beyond it is lower
    platform: [[-1, -back], [W + 1, -back], [W + 1, DW], [-1, DW]],
    apron: [[-0.5, -0.5], [W + 0.5, -0.5], [W + 0.5, DW - 0.25], [W, DW - 0.25], [W, 0], [0, 0], [0, D], [X_STAIR, D], [X_STAIR, D + 0.5], [-0.5, D + 0.5]],
    lowerGround: {
      outline: [...step, [19.27, DW], o.yardNE[1], o.yardNE[0], [XW, 19.88], [X_YARD, 19.88]],
      top: -o.drop - 0.02,
      fallFromY: DW + o.flat, // flat in front of the garage door and at the foot of the stairs
      fall: o.driveFall,
      hardEdge: step,
    },
  };
}

/** garage floor below ±0.00 */
export const GARAGE_DROP = 1.5;
export const RISERS = 9;
/**
 * Fall of the drive beyond the level part: it comes down to the surveyed ground at the gate
 * (355.9, 7.3 m on), with no step at the fence — the same rule as in the project it is compared with.
 */
export const DRIVE_FALL = 0.052;

export const argania2Low: HouseDef = splitLevel({
  id: 'argania2-low',
  name: 'Dom w Arganiach 2 (garaż niżej)',
  drop: GARAGE_DROP,
  risers: RISERS,
  flat: (RISERS - 1) * TREAD,
  driveFall: DRIVE_FALL,
  yardNE: [[XW, 22.15], [18.2, 21.35]],
});

/** the compromise: garage floor 0.50 m below ±0.00, three risers */
export const MID_GARAGE_DROP = 0.5;
export const MID_RISERS = 3;
/** level for 1 m in front of the garage door, then down to the surveyed ground at the gate (355.85–355.9, 8.8 m on) */
export const MID_FLAT = 1;
export const MID_DRIVE_FALL = 0.115;

export const argania2Mid: HouseDef = splitLevel({
  id: 'argania2-mid',
  name: 'Dom w Arganiach 2 (kompromis)',
  drop: MID_GARAGE_DROP,
  risers: MID_RISERS,
  flat: MID_FLAT,
  driveFall: MID_DRIVE_FALL,
  doorHeight: 2.5,
  // the terrace (3.85 m deep) and 2 m of lawn behind it are level; from there the lawn rises to the road as surveyed
  platformBack: 6,
  // 2.5 m further from the north-west boundary than on the PZT: the north-east line as seen from there
  yardNE: [[XW, 22.34], [18.18, 21.54]],
});
