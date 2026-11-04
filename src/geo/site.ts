/**
 * Site data loaded from /public/site (see scripts/fetch-site.ts).
 * Site-local frame: x = E − E0 (east), z = −(N − N0) (south), heights in m a.s.l. (PL-KRON86-NH).
 */
import type { P2 } from '../placement/geom2d';

/** site data folder, respecting Vite's base path (e.g. /house-placer/ on GitHub Pages) */
const SITE = `${(import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '')}/site`;

export interface SiteMeta {
  parcelId: string;
  parcelNumber: string;
  region: string;
  commune: string;
  origin: { E: number; N: number; lat: number; lon: number };
  bbox: { minE: number; minN: number; maxE: number; maxN: number };
  dem: { width: number; height: number; res: number; min: number; max: number };
  imagery?: { file: string; source: string } | null;
  roads?: string | null;
  landscape?: Record<'wide' | 'far', LandscapeMeta>;
}

export interface LandscapeMeta {
  bbox: { minE: number; minN: number; maxE: number; maxN: number };
  size: number;
  px: number;
  res: number;
  base: number;
  scale: number;
  file: string;
  tiles: number;
  imagery: string[] | null;
  surface: string;
}

/** a ring of wider terrain around the detailed site DEM (site-local coords) */
export interface LandRing {
  meta: LandscapeMeta;
  heights: Float32Array;
  /** site-local x of the west edge, z of the north edge */
  x0: number;
  z0: number;
  imageryUrls: string[] | null;
}

export class Dem {
  constructor(
    public data: Float32Array,
    public width: number,
    public height: number,
    /** site-local x of the west edge, z of the north edge */
    public x0: number,
    public z0: number,
    public res: number,
  ) {}

  /** bilinear height (m a.s.l.) at site-local x,z */
  heightAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.res - 0.5;
    const fz = (z - this.z0) / this.res - 0.5;
    const c0 = Math.max(0, Math.min(this.width - 1, Math.floor(fx)));
    const r0 = Math.max(0, Math.min(this.height - 1, Math.floor(fz)));
    const c1 = Math.min(this.width - 1, c0 + 1), r1 = Math.min(this.height - 1, r0 + 1);
    const tx = Math.max(0, Math.min(1, fx - c0)), tz = Math.max(0, Math.min(1, fz - r0));
    const d = this.data, W = this.width;
    const h00 = d[r0 * W + c0], h10 = d[r0 * W + c1], h01 = d[r1 * W + c0], h11 = d[r1 * W + c1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  get sizeX() { return this.width * this.res; }
  get sizeZ() { return this.height * this.res; }
}

export interface Neighbor { id: string; parcel: string; ring: P2[] }

/** road centreline from OpenStreetMap, in site-local coords */
export interface Road { id: number; highway: string; name: string | null; surface: string; width: number; pts: P2[] }

export interface Site {
  meta: SiteMeta;
  parcel: P2[];
  neighbors: Neighbor[];
  dem: Dem;
  /** reference height: scene y = H − baseH */
  baseH: number;
  /** unit vector of true north in site-local (x,z) */
  trueNorth: P2;
  orthoUrl: string | null;
  /** imagery provider, for attribution */
  imagerySource: string | null;
  roads: Road[];
  /** wider landscape for long views (8 km, 30 km), when downloaded */
  land: LandRing[];
}

export function makeSite(
  meta: SiteMeta,
  parcelRing: [number, number][],
  neighbors: { id: string; parcel: string; ring: [number, number][] }[],
  demBuf: ArrayBuffer,
  hasOrtho: boolean,
  roads: Road[] = [],
  land: LandRing[] = [],
): Site {
  const { E, N } = meta.origin;
  const toLocal = ([e, n]: [number, number]): P2 => [e - E, -(n - N)];
  const parcel = parcelRing.map(toLocal);
  const dem = new Dem(new Float32Array(demBuf), meta.dem.width, meta.dem.height, meta.bbox.minE - E, -(meta.bbox.maxN - N), meta.dem.res);
  let minH = Infinity;
  for (const [x, z] of parcel) minH = Math.min(minH, dem.heightAt(x, z));
  // meridian convergence for PUWG 1992 (central meridian 19°E)
  const gamma = ((meta.origin.lon - 19) * Math.PI) / 180 * Math.sin((meta.origin.lat * Math.PI) / 180);
  // grid north = −z; true north is rotated by −γ (west of grid north, east of CM)
  const trueNorth: P2 = [-Math.sin(gamma), -Math.cos(gamma)];
  return {
    meta,
    parcel,
    neighbors: neighbors.map((nb) => ({ ...nb, ring: nb.ring.map(toLocal) })),
    dem,
    baseH: Math.floor(minH),
    trueNorth,
    orthoUrl: hasOrtho ? `${SITE}/${meta.imagery?.file ?? 'ortho.jpg'}` : null,
    imagerySource: hasOrtho ? meta.imagery?.source ?? 'GUGiK' : null,
    roads,
    land,
  };
}

export async function loadSite(): Promise<Site> {
  const meta: SiteMeta = await fetch(`${SITE}/site.json`).then((r) => r.json());
  const [parcel, neighbors, demBuf, roads] = await Promise.all([
    fetch(`${SITE}/parcel.json`).then((r) => r.json()),
    fetch(`${SITE}/neighbors.json`).then((r) => r.json()),
    fetch(`${SITE}/dem.bin`).then((r) => r.arrayBuffer()),
    meta.roads ? fetch(`${SITE}/${meta.roads}`).then((r) => r.json()).catch(() => []) : Promise.resolve([]),
  ]);
  const land: LandRing[] = [];
  for (const key of ['wide', 'far'] as const) {
    const lm = meta.landscape?.[key];
    if (!lm) continue;
    try {
      const buf: ArrayBuffer = await fetch(`${SITE}/${lm.file}`).then((r) => r.arrayBuffer());
      const u = new Uint16Array(buf);
      const heights = new Float32Array(u.length);
      for (let i = 0; i < u.length; i++) heights[i] = lm.base + u[i] * lm.scale;
      land.push({
        meta: lm,
        heights,
        x0: lm.bbox.minE - meta.origin.E,
        z0: -(lm.bbox.maxN - meta.origin.N),
        imageryUrls: lm.imagery ? lm.imagery.map((f) => `${SITE}/${f}`) : null,
      });
    } catch {
      /* landscape is optional */
    }
  }
  return makeSite(meta, parcel.ring, neighbors, demBuf, !!meta.imagery, roads, land);
}
