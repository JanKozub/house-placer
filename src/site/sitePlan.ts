/**
 * Where the house stands according to the land-development plan for plot 664/2:
 * "PZT koncepcja" (2026-11-10, on the surveyor's map for design purposes by POMIAR, 1:500).
 *
 * Measured from the drawing: the plot outline on the map was fitted to the GUGiK parcel (vertices
 * agree to 5–10 cm; the map's PL-2000 grid is rotated 1.43° against PL-1992), then Dom w
 * Arganiach's outer walls were fitted to the drawn walls. Check: the back-left corner is 10.87 m
 * from the south-west boundary, as labelled on the map. Floor ±0.00 = 357.00 m a.s.l. (PZT).
 */
import type { Placement } from '../placement/geom2d';

export const PZT: { projectId: string; placement: Placement; floorLevel: number; source: string } = {
  projectId: 'argania2',
  placement: { x: -3.95, z: -12.29, bearing: 51.3, mirror: false },
  floorLevel: 357.0,
  source: 'PZT koncepcja 2026-11-10',
};

/** is this placement / floor level the PZT one (to the cm / 0.1°)? */
export const isPztPlacement = (pl: Placement, floorLevel: number | null) =>
  Math.abs(pl.x - PZT.placement.x) < 0.005 &&
  Math.abs(pl.z - PZT.placement.z) < 0.005 &&
  Math.abs(pl.bearing - PZT.placement.bearing) < 0.05 &&
  pl.mirror === PZT.placement.mirror &&
  floorLevel !== null &&
  Math.abs(floorLevel - PZT.floorLevel) < 0.005;
