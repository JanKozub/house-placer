/**
 * The drive between the entrance gate and the garage: the two levels and the average slope
 * ("nachylenie wjazdu") a car climbs or descends between them.
 */
import type { HouseDef } from '../house/types';
import { toLocal } from '../house/geometry';
import { toSite, type P2, type Placement } from '../placement/geom2d';
import type { Gate } from './sitePlan';

export interface DriveSlope {
  /** middle of the sliding gate, on the plot boundary (site coords) */
  gate: P2;
  /** middle of the garage door (site coords) */
  door: P2;
  /** ground at the gate, m a.s.l. */
  gateLevel: number;
  /** garage floor at the door, m a.s.l. */
  garageLevel: number;
  /** garage above the gate (negative: the garage lies lower), m */
  rise: number;
  /** horizontal distance from the gate to the garage door, m */
  length: number;
  /** rise / length: the average slope of the drive (0.12 = 12%) */
  slope: number;
}

/**
 * Average slope of the drive: from the ground in the middle of the sliding gate to the garage
 * floor in the middle of the garage door, over the straight distance between them. Null when the
 * house has no garage door or the plot no sliding gate.
 */
export function driveSlope(house: HouseDef, pl: Placement, floorH: number, gates: Gate[], parcel: P2[], groundAt: (x: number, z: number) => number): DriveSlope | null {
  const door = house.openings.find((o) => o.kind === 'garage');
  const gate = gates.find((g) => g.kind === 'sliding');
  const wall = door && house.walls.find((w) => w.id === door.wall);
  if (!door || !gate || !wall) return null;
  // `at` is the plan X for a wall along X, the plan Y for a wall along Y
  const alongX = Math.abs(wall.a[1] - wall.b[1]) < Math.abs(wall.a[0] - wall.b[0]);
  const at = toSite(toLocal(house, alongX ? door.at : wall.a[0], alongX ? wall.a[1] : door.at), pl);
  const a = parcel[gate.edge], b = parcel[(gate.edge + 1) % parcel.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = (gate.from + gate.to) / 2;
  const g: P2 = [a[0] + ((b[0] - a[0]) * m) / L, a[1] + ((b[1] - a[1]) * m) / L];
  const length = Math.hypot(at[0] - g[0], at[1] - g[1]);
  if (length < 0.5) return null;
  const gateLevel = groundAt(g[0], g[1]), garageLevel = floorH + door.sill;
  const rise = garageLevel - gateLevel;
  return { gate: g, door: at, gateLevel, garageLevel, rise, length, slope: rise / length };
}
