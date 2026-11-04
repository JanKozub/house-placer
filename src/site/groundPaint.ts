/**
 * Ground textures: a base layer (orthophoto or a synthetic field) for the whole DEM area,
 * and a high-resolution overlay around the parcel with lawn, paths, driveways, etc.
 */
import * as THREE from 'three';
import type { GardenArea, GardenKind } from '../store';
import type { P2 } from '../placement/geom2d';
import type { Road } from '../geo/site';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** synthetic field / meadow base (when no orthophoto is available) */
export function makeFallbackBase(size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#6f8448';
  ctx.fillRect(0, 0, size, size);
  const r = rng(42);
  for (let i = 0; i < 2600; i++) {
    const x = r() * size, y = r() * size, rad = 4 + r() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() > 0.5 ? '120,140,70' : '90,110,55';
    g.addColorStop(0, `rgba(${tone},0.25)`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** tiling grayscale detail used to break up blurry ground textures up close */
export function makeDetailTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  const r = rng(9);
  for (let i = 0; i < 9000; i++) {
    const v = Math.floor(90 + r() * 90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    const x = r() * s, y = r() * s;
    ctx.fillRect(x, y, 1, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

type PatternKind = GardenKind | 'lawn' | 'apron' | 'asphalt' | 'dirtRoad' | 'pavers';
const PATTERN_COLORS: Record<PatternKind, { base: string; joint?: string; module?: [number, number]; noise: number }> = {
  lawn: { base: '#5f8f3a', noise: 0.22 },
  driveway: { base: '#9d9a95', joint: 'rgba(60,58,55,0.55)', module: [0.2, 0.1], noise: 0.1 },
  path: { base: '#cdc6b8', joint: 'rgba(80,75,70,0.45)', module: [0.6, 0.3], noise: 0.08 },
  patio: { base: '#c9c2b4', joint: 'rgba(80,75,70,0.45)', module: [0.6, 0.6], noise: 0.08 },
  flowerbed: { base: '#4d3a2a', noise: 0.35 },
  gravel: { base: '#b9b2a6', noise: 0.45 },
  apron: { base: '#a9a49b', noise: 0.45 },
  asphalt: { base: '#5a5c5f', noise: 0.16 },
  dirtRoad: { base: '#a2967f', noise: 0.4 },
  pavers: { base: '#b9b1a3', joint: 'rgba(80,75,70,0.4)', module: [0.2, 0.1], noise: 0.1 },
};

function pattern(ctx: CanvasRenderingContext2D, kind: PatternKind, pxPerM: number) {
  const spec = PATTERN_COLORS[kind];
  const tileM = 1.2;
  const s = Math.max(8, Math.round(tileM * pxPerM));
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = spec.base;
  g.fillRect(0, 0, s, s);
  const r = rng(kind.length * 31);
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * spec.noise * 255;
    img.data[i] += n;
    img.data[i + 1] += n * (kind === 'lawn' ? 1.1 : 1);
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (kind === 'flowerbed') {
    const cols = ['#c46aa8', '#e9d36b', '#7aa6d9', '#5f8f3a', '#4e7a32', '#f0f0f0'];
    for (let i = 0; i < 160; i++) {
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      const rad = (0.05 + r() * 0.12) * pxPerM;
      g.beginPath();
      g.arc(r() * s, r() * s, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (spec.module) {
    const [mw, mh] = spec.module;
    g.strokeStyle = spec.joint!;
    g.lineWidth = Math.max(1, pxPerM * 0.012);
    const rows = Math.round(tileM / mh);
    for (let row = 0; row < rows; row++) {
      const y = (row * s) / rows;
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      const off = row % 2 ? (mw * pxPerM) / 2 : 0;
      const cols = Math.round(tileM / mw);
      for (let k = 0; k <= cols; k++) {
        const x = (k * s) / cols + off;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s / rows); g.stroke();
      }
    }
  }
  return ctx.createPattern(c, 'repeat')!;
}

export interface OverlaySpec {
  /** site-local rect covered by the overlay */
  x0: number;
  z0: number;
  size: number;
  px: number;
}

export function paintOverlay(
  canvas: HTMLCanvasElement,
  spec: OverlaySpec,
  opts: { parcel: P2[]; lawn: boolean; garden: GardenArea[]; apron: P2[] | null; roads: Road[] },
) {
  canvas.width = canvas.height = spec.px;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, spec.px, spec.px);
  const k = spec.px / spec.size;
  const tr = ([x, z]: P2): [number, number] => [(x - spec.x0) * k, (z - spec.z0) * k];
  const path = (pts: P2[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...tr(p)) : ctx.moveTo(...tr(p))));
    ctx.closePath();
  };
  paintRoads(ctx, tr, k, opts.roads);
  if (opts.lawn) {
    path(opts.parcel);
    ctx.fillStyle = pattern(ctx, 'lawn', k);
    ctx.fill();
  }
  if (opts.apron) {
    path(opts.apron);
    ctx.fillStyle = pattern(ctx, 'apron', k);
    ctx.fill();
  }
  const order: GardenKind[] = ['flowerbed', 'gravel', 'patio', 'path', 'driveway'];
  for (const kind of order) {
    for (const a of opts.garden.filter((g) => g.kind === kind)) {
      if (a.points.length < 3) continue;
      path(a.points);
      ctx.fillStyle = pattern(ctx, kind, k);
      ctx.fill();
      if (kind !== 'flowerbed' && kind !== 'gravel') {
        ctx.strokeStyle = 'rgba(70,68,64,0.9)';
        ctx.lineWidth = Math.max(1, 0.08 * k); // curb
        ctx.stroke();
      }
    }
  }
}

/** OSM roads as surfaced ribbons: asphalt with a gravel shoulder, dirt tracks, paved footways */
export function paintRoads(ctx: CanvasRenderingContext2D, tr: (p: P2) => [number, number], k: number, roads: Road[]) {
  const order = (r: Road) => (r.surface === 'asphalt' ? 2 : r.surface === 'paving_stones' ? 1 : 0);
  const stroke = (r: Road, w: number, style: string | CanvasPattern) => {
    ctx.beginPath();
    r.pts.forEach((p, i) => (i ? ctx.lineTo(...tr(p)) : ctx.moveTo(...tr(p))));
    ctx.strokeStyle = style;
    ctx.lineWidth = Math.max(1, w * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const sorted = [...roads].sort((a, b) => order(a) - order(b));
  for (const r of sorted) {
    if (r.surface === 'asphalt') {
      stroke(r, r.width + 1.0, 'rgba(150,141,124,0.95)'); // gravel shoulder
      stroke(r, r.width, pattern(ctx, 'asphalt', k));
    } else if (r.surface === 'paving_stones' || r.surface === 'paved' || r.surface === 'concrete') {
      stroke(r, r.width, pattern(ctx, 'pavers', k));
    } else {
      stroke(r, r.width + 0.4, 'rgba(120,130,80,0.5)'); // grassy verge
      stroke(r, r.width, pattern(ctx, 'dirtRoad', k));
    }
  }
}

/**
 * The close-up satellite photo is a different capture than the wide-area imagery around it (paler,
 * other date), so it would show as a light square. Match its colours to the wide imagery of the same
 * area (per-channel mean and spread) and fade its border into that imagery.
 */
export function matchImagery(img: CanvasImageSource & { width: number; height: number }, ref: HTMLCanvasElement, featherFrac = 0.12): HTMLCanvasElement {
  const W = img.width, H = img.height;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H);
  const d = px.data;
  const stats = (data: Uint8ClampedArray, stride: number) => {
    const m = [0, 0, 0], q = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * stride) {
      for (let ch = 0; ch < 3; ch++) { m[ch] += data[i + ch]; q[ch] += data[i + ch] * data[i + ch]; }
      n++;
    }
    return m.map((v, ch) => ({ mean: v / n, sd: Math.sqrt(Math.max(1, q[ch] / n - (v / n) ** 2)) }));
  };
  const rctx = ref.getContext('2d', { willReadFrequently: true })!;
  const rs = stats(rctx.getImageData(0, 0, ref.width, ref.height).data, 1);
  const ss = stats(d, 7);
  const a = rs.map((r, ch) => r.sd / ss[ch].sd), b = rs.map((r, ch) => r.mean - ss[ch].mean * a[ch]);
  const F = Math.max(1, Math.round(Math.min(W, H) * featherFrac));
  for (let y = 0, i = 0; y < H; y++) {
    const ey = Math.min(y, H - 1 - y);
    for (let x = 0; x < W; x++, i += 4) {
      d[i] = d[i] * a[0] + b[0];
      d[i + 1] = d[i + 1] * a[1] + b[1];
      d[i + 2] = d[i + 2] * a[2] + b[2];
      const e = Math.min(ey, x, W - 1 - x);
      if (e < F) { const t = e / F; d[i + 3] = 255 * t * t * (3 - 2 * t); }
    }
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

/** base ground texture: satellite image (or a synthetic field) with roads painted on top; `under` is
 * the wide-area imagery of the same extent, drawn first so a matched, feathered `img` blends into it */
export function paintBase(canvas: HTMLCanvasElement, img: CanvasImageSource | null, fallback: HTMLCanvasElement, bounds: { x0: number; z0: number; sizeX: number; sizeZ: number }, roads: Road[], under: HTMLCanvasElement | null = null) {
  const S = 4096;
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  if (img && under) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(under, 0, 0, S, S);
  }
  ctx.drawImage(img ?? fallback, 0, 0, S, S);
  const kx = S / bounds.sizeX;
  paintRoads(ctx, ([x, z]) => [(x - bounds.x0) * kx, (z - bounds.z0) * (S / bounds.sizeZ)], kx, roads);
}
