/**
 * Wider landscape around the detailed site terrain, for long views from the house: an 8 km ring
 * (8 m grid, forests/buildings as relief) and a 30 km horizon ring (60 m grid), each draped with
 * satellite imagery. Earth curvature (with standard refraction) is applied, and each ring tucks
 * itself under the more detailed one inside it.
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { LandRing, Site } from '../geo/site';

const EARTH_R = 6_371_000;
const REFRACTION_K = 0.13;
const curvatureDrop = (d2: number) => (d2 / (2 * EARTH_R)) * (1 - REFRACTION_K);

interface Rect { x0: number; z0: number; x1: number; z1: number }

/** decimated heights for a ring (max over each step×step block so ridges keep their height) */
function decimate(ring: LandRing, step: number) {
  const N = ring.meta.px, n = Math.floor(N / step);
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      let m = -Infinity;
      for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) m = Math.max(m, ring.heights[(j * step + dj) * N + i * step + di]);
      h[j * n + i] = m;
    }
  return { h, n, res: ring.meta.res * step };
}

/**
 * Geometry for one tile [i0..i1]×[j0..j1] (inclusive vertex range, tiles share their border rows so
 * there are no cracks). Separate tiles let the renderer frustum-cull what's behind the camera.
 */
function tileGeometry(ring: LandRing, d: { h: Float32Array; n: number; res: number }, baseH: number, hole: Rect | null, i0: number, i1: number, j0: number, j1: number) {
  const { h, n, res } = d;
  const w = i1 - i0 + 1, hh = j1 - j0 + 1;
  const pos = new Float32Array(w * hh * 3);
  const uv = new Float32Array(w * hh * 2);
  const inHole = new Uint8Array(w * hh);
  for (let j = 0; j < hh; j++)
    for (let i = 0; i < w; i++) {
      const gi = i0 + i, gj = j0 + j, k = j * w + i;
      const x = ring.x0 + (gi + 0.5) * res, z = ring.z0 + (gj + 0.5) * res;
      const hole1 = !!hole && x > hole.x0 && x < hole.x1 && z > hole.z0 && z < hole.z1;
      inHole[k] = hole1 ? 1 : 0;
      pos[k * 3] = x;
      // tuck under the inner, more detailed terrain; apply earth curvature
      pos[k * 3 + 1] = h[gj * n + gi] - baseH - curvatureDrop(x * x + z * z) - (hole1 ? 12 : 0);
      pos[k * 3 + 2] = z;
      uv[k * 2] = (gi + 0.5) / n;
      uv[k * 2 + 1] = 1 - (gj + 0.5) / n;
    }
  const idx: number[] = [];
  for (let j = 0; j < hh - 1; j++)
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
      if (inHole[a] && inHole[b] && inHole[c] && inHole[e]) continue; // fully under the inner terrain
      idx.push(a, c, b, b, c, e);
    }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(w * hh > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function ringTiles(ring: LandRing, baseH: number, inner: Rect | null, step: number, tiles: number) {
  const d = decimate(ring, step);
  // shrink the hole by one cell so the rings overlap slightly instead of leaving a crack
  const hole = inner && { x0: inner.x0 + d.res, z0: inner.z0 + d.res, x1: inner.x1 - d.res, z1: inner.z1 - d.res };
  const out: THREE.BufferGeometry[] = [];
  const span = (d.n - 1) / tiles;
  for (let tj = 0; tj < tiles; tj++)
    for (let ti = 0; ti < tiles; ti++) {
      const i0 = Math.round(ti * span), i1 = Math.round((ti + 1) * span);
      const j0 = Math.round(tj * span), j1 = Math.round((tj + 1) * span);
      const g = tileGeometry(ring, d, baseH, hole, i0, i1, j0, j1);
      if (g) out.push(g);
    }
  return out;
}

/** stitch n×n imagery tiles (row-major from the north-west) into one texture */
function useRingTexture(ring: LandRing) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    const urls = ring.imageryUrls;
    if (!urls) return;
    let alive = true;
    const n = ring.meta.tiles;
    Promise.all(
      urls.map(
        (u) =>
          new Promise<HTMLImageElement>((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = u;
          }),
      ),
    )
      .then((imgs) => {
        if (!alive) return;
        const tile = imgs[0].width;
        const c = document.createElement('canvas');
        c.width = c.height = Math.min(4096, tile * n);
        const ctx = c.getContext('2d')!;
        const ts = c.width / n;
        imgs.forEach((im, k) => ctx.drawImage(im, (k % n) * ts, Math.floor(k / n) * ts, ts, ts));
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTex(t);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ring]);
  return tex;
}

function Ring({ ring, baseH, inner, name, step, tiles }: { ring: LandRing; baseH: number; inner: Rect | null; name: string; step: number; tiles: number }) {
  const geoms = useMemo(() => ringTiles(ring, baseH, inner, step, tiles), [ring, baseH, inner, step, tiles]);
  const tex = useRingTexture(ring);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7d9254', roughness: 1, metalness: 0 }), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (tex) {
      mat.map = tex;
      mat.color.set('#ffffff');
      mat.needsUpdate = true;
      invalidate();
    }
  }, [tex, mat, invalidate]);
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms]);
  return (
    <group name={name}>
      {geoms.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
    </group>
  );
}

export function Landscape({ site }: { site: Site }) {
  const d = site.dem;
  const near: Rect = { x0: d.x0, z0: d.z0, x1: d.x0 + d.sizeX, z1: d.z0 + d.sizeZ };
  const wide = site.land.find((r) => r.meta.size < 20000);
  const far = site.land.find((r) => r.meta.size >= 20000);
  const wideRect: Rect | null = wide ? { x0: wide.x0, z0: wide.z0, x1: wide.x0 + wide.meta.size, z1: wide.z0 + wide.meta.size } : null;
  const nearMemo = useMemo(() => near, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const wideMemo = useMemo(() => wideRect, [wide]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group name="landscape">
      {wide && <Ring ring={wide} baseH={site.baseH} inner={nearMemo} name="landscape-wide" step={2} tiles={6} />}
      {far && <Ring ring={far} baseH={site.baseH} inner={wideMemo ?? nearMemo} name="landscape-far" step={3} tiles={4} />}
    </group>
  );
}

/** height (m a.s.l.) of the landscape at site-local x,z, from the finest ring covering it */
export function landHeightAt(site: Site, x: number, z: number): number | null {
  for (const r of [...site.land].sort((a, b) => a.meta.size - b.meta.size)) {
    const n = r.meta.px, res = r.meta.res;
    const i = Math.floor((x - r.x0) / res), j = Math.floor((z - r.z0) / res);
    if (i >= 0 && j >= 0 && i < n && j < n) return r.heights[j * n + i];
  }
  return null;
}

/**
 * Compass (grid) bearing of the valley as seen from (x,z): the direction whose terrain 1–4 km away
 * is lowest on average.
 */
export function valleyBearing(site: Site, x: number, z: number): number | null {
  if (!site.land.length) return null;
  let best: number | null = null, bestH = Infinity;
  for (let b = 0; b < 360; b += 5) {
    const r = (b * Math.PI) / 180;
    let sum = 0, cnt = 0;
    for (let dist = 1000; dist <= 4000; dist += 250) {
      const h = landHeightAt(site, x + Math.sin(r) * dist, z - Math.cos(r) * dist);
      if (h !== null) { sum += h; cnt++; }
    }
    if (cnt && sum / cnt < bestH) { bestH = sum / cnt; best = b; }
  }
  return best;
}
