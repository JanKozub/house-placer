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
  buildings?: { file: string; source: string; radius: number; count: number } | null;
  /** surveyed spot heights (public/site/survey.json) the terrain is fitted to */
  survey?: string | null;
  heightDatum?: string;
}

/** spot heights from the surveyor's map (PZT); site-local x, z and height in PL-EVRF2007-NH */
export interface Survey {
  datum: string;
  datumShift: number;
  points: [number, number, number][];
  /**
   * slope bands (skarpy) along plot edges: offsets inside the boundary (m) of the band's outer and
   * inner line; optional from / to = metres along the edge from its first vertex (default: all of it)
   */
  slopes?: { edge: number; outer: number; inner: number; from?: number; to?: number }[];
  /** the plot levelled to one height inside the slope bands (design ground) */
  design?: { level: number; source: string };
}

/**
 * The plot levelled to one height (design ground): flat at `level` inside the slope bands; inside
 * each band the ground runs straight from the existing level at the band's outer line to `level`
 * at its inner line; between the boundary and the outer line, and outside the plot, it stays as
 * surveyed. Where bands meet at a corner the lower one wins, so the slopes join without a seam.
 */
export function levelPlot(dem: Dem, parcel: P2[], slopes: NonNullable<Survey['slopes']>, level: number) {
  if (!slopes.length) return;
  const n = parcel.length;
  let cx = 0, cz = 0;
  for (const [x, z] of parcel) { cx += x; cz += z; }
  cx /= n; cz /= n;
  const edges = slopes.map((b) => {
    const a = parcel[b.edge], c = parcel[(b.edge + 1) % n];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const d: P2 = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
    let nn: P2 = [-d[1], d[0]];
    if ((cx - (a[0] + c[0]) / 2) * nn[0] + (cz - (a[1] + c[1]) / 2) * nn[1] < 0) nn = [-nn[0], -nn[1]];
    return { ...b, a, L, d, n: nn };
  });
  const read = new Dem(new Float32Array(dem.data), dem.width, dem.height, dem.x0, dem.z0, dem.res);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of parcel) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  for (let j = 0; j < dem.height; j++) {
    const z = dem.z0 + (j + 0.5) * dem.res;
    if (z < z0 - 1 || z > z1 + 1) continue;
    for (let i = 0; i < dem.width; i++) {
      const x = dem.x0 + (i + 0.5) * dem.res;
      if (x < x0 - 1 || x > x1 + 1) continue;
      if (!inPolygon([x, z], parcel)) continue;
      // the band furthest from being level decides (smallest progress t across its slope)
      let t = 1, base = level;
      for (const e of edges) {
        const dx = x - e.a[0], dz = z - e.a[1];
        const s = dx * e.d[0] + dz * e.d[1], off = dx * e.n[0] + dz * e.n[1];
        if (s < (e.from ?? -e.inner) || s > (e.to ?? e.L + e.inner)) continue;
        const te = Math.max(0, Math.min(1, (off - e.outer) / (e.inner - e.outer)));
        if (te < t) {
          t = te;
          const sc = Math.max(e.from ?? 0, Math.min(e.to ?? e.L, s));
          base = read.heightAt(e.a[0] + e.d[0] * sc + e.n[0] * e.outer, e.a[1] + e.d[1] * sc + e.n[1] * e.outer);
        }
      }
      // between the boundary and the band's outer line the surveyed ground stays
      if (t <= 0) continue;
      dem.data[j * dem.width + i] = base + (level - base) * t;
    }
  }
}

function inPolygon(p: P2, poly: P2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}


/**
 * Fit the GUGiK terrain (PL-KRON86-NH) to the survey: shift it to PL-EVRF2007-NH everywhere, bend
 * it locally so it passes through every surveyed spot height, then apply the design levelling. The local correction is an
 * inverse-distance blend of the remaining differences, fading out within ~8 m of the last point.
 */
export function fitDemToSurvey(dem: Dem, survey: Survey, parcel: P2[] = []) {
  const d = dem.data;
  for (let i = 0; i < d.length; i++) d[i] += survey.datumShift;

  const pts = survey.points.map(([x, z, h]) => ({ x, z, r: h - dem.heightAt(x, z) }));
  if (!pts.length) return;
  const FADE0 = 2, FADE1 = 8;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const corr = new Float32Array(d.length);
  for (let j = 0; j < dem.height; j++) {
    const z = dem.z0 + (j + 0.5) * dem.res;
    if (z < z0 - FADE1 || z > z1 + FADE1) continue;
    for (let i = 0; i < dem.width; i++) {
      const x = dem.x0 + (i + 0.5) * dem.res;
      if (x < x0 - FADE1 || x > x1 + FADE1) continue;
      let sw = 0, sr = 0, dmin = Infinity;
      for (const p of pts) {
        const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
        dmin = Math.min(dmin, dd);
        const w = 1 / (dd + 0.05) ** 1.5;
        sw += w; sr += w * p.r;
      }
      dmin = Math.sqrt(dmin);
      const t = dmin <= FADE0 ? 1 : dmin >= FADE1 ? 0 : 1 - (dmin - FADE0) / (FADE1 - FADE0);
      corr[j * dem.width + i] = (sr / sw) * t * t * (3 - 2 * t);
    }
  }
  for (let i = 0; i < d.length; i++) d[i] += corr[i];
  // design ground: the plot levelled inside the PZT's slope bands
  if (survey.design && survey.slopes && parcel.length) levelPlot(dem, parcel, survey.slopes, survey.design.level);
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

/** neighbouring building from BDOT10k: kind (h house, o outbuilding, c commercial/public, r church), storeys */
export interface Building { kind: 'h' | 'o' | 'c' | 'r'; levels: number; underConstruction: boolean; ring: P2[] }

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
  /** existing buildings around the parcel (rough 3D context) */
  buildings: Building[];
  /** slope bands (skarpy) from the PZT, as quads along the plot edges: outer line a0→a1, inner line b0→b1 */
  slopes: { a0: P2; a1: P2; b0: P2; b1: P2 }[];
}

/** the slope bands of a survey as quads in site-local coords */
export function slopeQuads(parcel: P2[], slopes: NonNullable<Survey['slopes']>) {
  const n = parcel.length;
  let cx = 0, cz = 0;
  for (const [x, z] of parcel) { cx += x; cz += z; }
  cx /= n; cz /= n;
  return slopes.map((b) => {
    const a = parcel[b.edge], c = parcel[(b.edge + 1) % n];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const d: P2 = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
    let nn: P2 = [-d[1], d[0]];
    if ((cx - (a[0] + c[0]) / 2) * nn[0] + (cz - (a[1] + c[1]) / 2) * nn[1] < 0) nn = [-nn[0], -nn[1]];
    const at = (s: number, o: number): P2 => [a[0] + d[0] * s + nn[0] * o, a[1] + d[1] * s + nn[1] * o];
    const s0 = b.from ?? 0, s1 = b.to ?? L;
    return { a0: at(s0, b.outer), a1: at(s1, b.outer), b0: at(s0, b.inner), b1: at(s1, b.inner) };
  });
}

export function makeSite(
  meta: SiteMeta,
  parcelRing: [number, number][],
  neighbors: { id: string; parcel: string; ring: [number, number][] }[],
  demBuf: ArrayBuffer,
  hasOrtho: boolean,
  roads: Road[] = [],
  land: LandRing[] = [],
  buildings: Building[] = [],
  survey: Survey | null = null,
): Site {
  const { E, N } = meta.origin;
  const toLocal = ([e, n]: [number, number]): P2 => [e - E, -(n - N)];
  const parcel = parcelRing.map(toLocal);
  const dem = new Dem(new Float32Array(demBuf), meta.dem.width, meta.dem.height, meta.bbox.minE - E, -(meta.bbox.maxN - N), meta.dem.res);
  if (survey) fitDemToSurvey(dem, survey, parcelRing.map(toLocal));
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
    buildings,
    slopes: survey?.slopes ? slopeQuads(parcel, survey.slopes) : [],
  };
}

export async function loadSite(): Promise<Site> {
  const meta: SiteMeta = await fetch(`${SITE}/site.json`).then((r) => r.json());
  const [parcel, neighbors, demBuf, roads, rawBuildings, survey] = await Promise.all([
    fetch(`${SITE}/parcel.json`).then((r) => r.json()),
    fetch(`${SITE}/neighbors.json`).then((r) => r.json()),
    fetch(`${SITE}/dem.bin`).then((r) => r.arrayBuffer()),
    meta.roads ? fetch(`${SITE}/${meta.roads}`).then((r) => r.json()).catch(() => []) : Promise.resolve([]),
    meta.buildings
      ? (fetch(`${SITE}/${meta.buildings.file}`).then((r) => r.json()).catch(() => []) as Promise<{ k: Building['kind']; l: number; u?: 1; p: number[] }[]>)
      : Promise.resolve([]),
    meta.survey ? (fetch(`${SITE}/${meta.survey}`).then((r) => r.json()).catch(() => null) as Promise<Survey | null>) : Promise.resolve(null),
  ]);
  const buildings: Building[] = rawBuildings.map((b) => {
    const ring: P2[] = [];
    for (let i = 0; i + 1 < b.p.length; i += 2) ring.push([b.p[i], b.p[i + 1]]);
    return { kind: b.k, levels: b.l, underConstruction: !!b.u, ring };
  });
  const land: LandRing[] = [];
  for (const key of ['wide', 'far'] as const) {
    const lm = meta.landscape?.[key];
    if (!lm) continue;
    try {
      const buf: ArrayBuffer = await fetch(`${SITE}/${lm.file}`).then((r) => r.arrayBuffer());
      const u = new Uint16Array(buf);
      const heights = new Float32Array(u.length);
      // the wider landscape gets the same height-system shift as the site terrain
      const shift = survey?.datumShift ?? 0;
      for (let i = 0; i < u.length; i++) heights[i] = lm.base + u[i] * lm.scale + shift;
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
  return makeSite(meta, parcel.ring, neighbors, demBuf, !!meta.imagery, roads, land, buildings, survey);
}
