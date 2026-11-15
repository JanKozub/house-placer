import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Site } from '../geo/site';
import { closestOnSegment, pointInPolygon, type P2 } from '../placement/geom2d';
import { makeDetailTexture, makeFallbackBase, matchImagery, paintBase, paintOverlay, type OverlaySpec } from './groundPaint';
import { ringImage } from './Landscape';
import { useStore } from '../store';

export interface PlatformSpec {
  polygon: P2[];
  /** platform height, m a.s.l. */
  h: number;
  /** a sloping platform (a drive): its height at a point; default `h` everywhere */
  at?: (x: number, z: number) => number;
  /** polyline along which the ground steps down vertically (retaining walls, a garage front):
   *  the terrain mesh gets a sharp edge there instead of a slope one grid cell wide */
  hard?: P2[];
}

const platformH = (pl: PlatformSpec, x: number, z: number) => (pl.at ? pl.at(x, z) : pl.h);

/** closest point of a polyline (closed = polygon outline) and its distance */
function closestOnLine(p: P2, line: P2[], closed: boolean) {
  let d = Infinity, q: P2 = line[0];
  for (let i = 0; i < line.length - (closed ? 0 : 1); i++) {
    const c = closestOnSegment(p, line[i], line[(i + 1) % line.length]);
    const dc = Math.hypot(p[0] - c[0], p[1] - c[1]);
    if (dc < d) { d = dc; q = c; }
  }
  return { d, q };
}

/**
 * terrain height after the building platform(s) are carved in (m a.s.l.). With several buildings
 * (house + detached garage) a point on a platform takes that platform's height; otherwise the
 * embankment of the nearest platform that reaches it.
 */
export function carvedHeight(site: Site, x: number, z: number, platforms: PlatformSpec | PlatformSpec[] | null) {
  const h = site.dem.heightAt(x, z);
  if (!platforms) return h;
  const list = Array.isArray(platforms) ? platforms : [platforms];
  const p: P2 = [x, z];
  for (const pl of list) if (pointInPolygon(p, pl.polygon)) return platformH(pl, x, z);
  let best = h, bestD = Infinity;
  for (const pl of list) {
    const { d, q } = closestOnLine(p, pl.polygon, true);
    const ph = platformH(pl, q[0], q[1]);
    const delta = h - ph;
    const w = THREE.MathUtils.clamp(Math.abs(delta) * 2, 0.3, 10); // 1:2 embankment
    if (d >= w || d >= bestD) continue;
    const t = d / w;
    best = ph + delta * (t * t * (3 - 2 * t));
    bestD = d;
  }
  return best;
}

export function overlaySpec(site: Site): OverlaySpec {
  let cx = 0, cz = 0;
  for (const [x, z] of site.parcel) { cx += x; cz += z; }
  cx /= site.parcel.length; cz /= site.parcel.length;
  const size = 120;
  return { x0: cx - size / 2, z0: cz - size / 2, size, px: 4096 };
}

export function Terrain({ site, platforms }: { site: Site; platforms: PlatformSpec[] }) {
  const garden = useStore((s) => s.garden);
  const lawn = useStore((s) => s.layers.parcelLawn);
  const useOrtho = useStore((s) => s.layers.ortho);
  const showRoads = useStore((s) => s.layers.roads !== false);
  // the planned access road is part of the design, so it stays when the OpenStreetMap roads are off
  const roads = useMemo(() => (showRoads ? [...site.roads, ...site.access] : site.access), [showRoads, site.roads, site.access]);
  const dem = site.dem;
  const invalidate = useThree((s) => s.invalidate);

  const geom = useMemo(() => {
    const W = dem.width, H = dem.height, r = dem.res;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(W * H * 3);
    const uv = new Float32Array(W * H * 2);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const x = dem.x0 + (i + 0.5) * r, z = dem.z0 + (j + 0.5) * r;
        pos[k * 3] = x;
        pos[k * 3 + 1] = dem.data[k] - site.baseH;
        pos[k * 3 + 2] = z;
        uv[k * 2] = (x - dem.x0) / dem.sizeX;
        uv[k * 2 + 1] = 1 - (z - dem.z0) / dem.sizeZ;
      }
    const idx: number[] = [];
    for (let j = 0; j < H - 1; j++)
      for (let i = 0; i < W - 1; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [dem, site.baseH]);

  // carve platform
  const carvedRef = useRef<number[]>([]);
  const dirtyRef = useRef<[number, number, number, number] | null>(null);
  useEffect(() => {
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const uv = geom.getAttribute('uv') as THREE.BufferAttribute;
    const W = dem.width;
    const gridX = (k: number) => dem.x0 + ((k % W) + 0.5) * dem.res, gridZ = (k: number) => dem.z0 + (Math.floor(k / W) + 0.5) * dem.res;
    const place = (k: number, x: number, y: number, z: number) => {
      pos.setXYZ(k, x, y, z);
      uv.setXY(k, (x - dem.x0) / dem.sizeX, 1 - (z - dem.z0) / dem.sizeZ);
    };
    for (const k of carvedRef.current) place(k, gridX(k), dem.data[k] - site.baseH, gridZ(k));
    carvedRef.current = [];
    // vertical steps: every vertex within a triangle's reach of a hard edge moves onto it (2 cm to
    // its own side), so the step is a sharp face along the wall instead of a ramp one cell wide
    const hard = platforms.flatMap((pl) => (pl.hard && pl.hard.length > 1 ? [pl.hard] : []));
    const SNAP = dem.res * 1.45, EPS = 0.02;
    const snappedSet = new Set<number>();
    // region whose normals must be recomputed: last carve ∪ this carve
    let box = dirtyRef.current;
    if (platforms.length) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const pl of platforms)
        for (const [x, z] of pl.polygon) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
      const m = 11;
      const i0 = Math.max(0, Math.floor((minX - m - dem.x0) / dem.res)), i1 = Math.min(W - 1, Math.ceil((maxX + m - dem.x0) / dem.res));
      const j0 = Math.max(0, Math.floor((minZ - m - dem.z0) / dem.res)), j1 = Math.min(dem.height - 1, Math.ceil((maxZ + m - dem.z0) / dem.res));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * W + i;
          let x = gridX(k), z = gridZ(k), snapped = false;
          for (const line of hard) {
            const { d, q } = closestOnLine([x, z], line, false);
            const end = line[0], end2 = line[line.length - 1];
            // past the free ends of the edge the step fades into a slope again: leave those alone
            const atEnd = Math.hypot(q[0] - end[0], q[1] - end[1]) < 1e-6 || Math.hypot(q[0] - end2[0], q[1] - end2[1]) < 1e-6;
            if (d < SNAP && d > 1e-6 && !atEnd) {
              const gx = x, gz = z;
              x = q[0] + ((gx - q[0]) / d) * EPS;
              z = q[1] + ((gz - q[1]) / d) * EPS;
              snapped = true;
              break;
            }
          }
          const h = carvedHeight(site, x, z, platforms);
          if (snapped || Math.abs(h - dem.data[k]) > 1e-4) {
            // keep the mesh slightly under the platform so slabs never z-fight
            place(k, x, h - site.baseH - (platforms.some((pl) => pointInPolygon([x, z], pl.polygon)) ? 0.03 : 0), z);
            carvedRef.current.push(k);
            if (snapped) snappedSet.add(k);
          }
        }
      dirtyRef.current = [i0, i1, j0, j1];
      box = box ? [Math.min(box[0], i0), Math.max(box[1], i1), Math.min(box[2], j0), Math.max(box[3], j1)] : [i0, i1, j0, j1];
    } else dirtyRef.current = null;
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    // regular grid: per-vertex normals from central height differences, only where heights changed
    // (recomputing the whole 100k-vertex mesh on every house drag was the main stall)
    if (box) {
      const nrm = geom.getAttribute('normal') as THREE.BufferAttribute;
      const H = dem.height, r2 = 2 * dem.res;
      const y = (i: number, j: number) => pos.getY(Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i)));
      for (let j = Math.max(0, box[2] - 1); j <= Math.min(H - 1, box[3] + 1); j++)
        for (let i = Math.max(0, box[0] - 1); i <= Math.min(W - 1, box[1] + 1); i++) {
          const dx = (y(i + 1, j) - y(i - 1, j)) / r2, dz = (y(i, j + 1) - y(i, j - 1)) / r2;
          const l = Math.hypot(dx, 1, dz);
          // vertices on a hard edge sit at the top / foot of a vertical face: keep the ground beside it flat-shaded
          if (snappedSet.has(j * W + i)) nrm.setXYZ(j * W + i, 0, 1, 0);
          else nrm.setXYZ(j * W + i, -dx / l, 1 / l, -dz / l);
        }
      nrm.needsUpdate = true;
    }
    invalidate();
  }, [geom, platforms, dem, site, invalidate]);

  // textures
  const [orthoTex, setOrthoTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!site.orthoUrl) return;
    new THREE.TextureLoader().load(site.orthoUrl, setOrthoTex, undefined, () => setOrthoTex(null));
  }, [site.orthoUrl]);
  // the wide-area imagery cropped to this terrain, and the close-up photo colour-matched to it
  const [matched, setMatched] = useState<{ img: HTMLCanvasElement; under: HTMLCanvasElement | null } | null>(null);
  useEffect(() => {
    if (!orthoTex) return;
    let alive = true;
    const img = orthoTex.image as HTMLImageElement;
    const wide = [...site.land].sort((a, b) => a.meta.size - b.meta.size)[0];
    (wide ? ringImage(wide) : Promise.resolve(null)).then((ring) => {
      if (!alive) return;
      let under: HTMLCanvasElement | null = null;
      if (ring && wide) {
        const k = ring.width / wide.meta.size;
        const sx = (dem.x0 - wide.x0) * k, sy = (dem.z0 - wide.z0) * k, sw = dem.sizeX * k, sh = dem.sizeZ * k;
        under = document.createElement('canvas');
        under.width = Math.round(sw);
        under.height = Math.round(sh);
        under.getContext('2d')!.drawImage(ring, sx, sy, sw, sh, 0, 0, under.width, under.height);
      }
      setMatched({ img: under ? matchImagery(img, under) : (img as unknown as HTMLCanvasElement), under });
    });
    return () => {
      alive = false;
    };
  }, [orthoTex, site.land, dem]);
  const fallback = useMemo(() => makeFallbackBase(), []);
  const detail = useMemo(() => makeDetailTexture(), []);
  const spec = useMemo(() => overlaySpec(site), [site]);
  const overlay = useMemo(() => {
    const c = document.createElement('canvas');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    return t;
  }, []);
  useEffect(() => {
    // the gravel strip around the house is a separate mesh (ApronMesh), so dragging the house
    // doesn't repaint and re-upload this 4096² texture every frame
    paintOverlay(overlay.image as HTMLCanvasElement, spec, { parcel: site.parcel, lawn, garden, apron: null, roads, slopes: site.slopes });
    overlay.needsUpdate = true;
    invalidate();
  }, [overlay, spec, site, lawn, garden, roads, invalidate]);

  // base: satellite (or synthetic field) + roads, composited once per change
  const baseTex = useMemo(() => {
    const t = new THREE.CanvasTexture(document.createElement('canvas'));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => {
    const on = site.orthoUrl && useOrtho && matched;
    paintBase(baseTex.image as HTMLCanvasElement, on ? matched.img : null, fallback.image as HTMLCanvasElement, { x0: dem.x0, z0: dem.z0, sizeX: dem.sizeX, sizeZ: dem.sizeZ }, roads, on ? matched.under : null);
    baseTex.needsUpdate = true;
    invalidate();
  }, [baseTex, matched, useOrtho, site.orthoUrl, fallback, dem, roads, invalidate]);

  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.97, metalness: 0 });
    const uniforms = {
      overlayMap: { value: overlay },
      overlayRect: { value: new THREE.Vector4() },
      detailMap: { value: detail },
      detailRepeat: { value: dem.sizeX / 1.7 },
    };
    m.userData.uniforms = uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform sampler2D overlayMap; uniform vec4 overlayRect; uniform sampler2D detailMap; uniform float detailRepeat;',
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 ouv = (vMapUv - overlayRect.xy) / (overlayRect.zw - overlayRect.xy);
          if (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) {
            vec4 o = texture2D(overlayMap, ouv);
            diffuseColor.rgb = mix(diffuseColor.rgb, o.rgb, o.a);
          }
          float dt = texture2D(detailMap, vMapUv * detailRepeat).r;
          diffuseColor.rgb *= 0.86 + 0.28 * dt;`,
        );
    };
    return m;
  }, [overlay, detail, dem.sizeX]);

  useEffect(() => {
    const u = mat.userData.uniforms;
    // overlay rect in base-uv space: u = (x - x0)/sizeX, v = 1 - (z - z0)/sizeZ  (v flipped)
    const u0 = (spec.x0 - dem.x0) / dem.sizeX, u1 = (spec.x0 + spec.size - dem.x0) / dem.sizeX;
    const v1 = 1 - (spec.z0 - dem.z0) / dem.sizeZ, v0 = 1 - (spec.z0 + spec.size - dem.z0) / dem.sizeZ;
    u.overlayRect.value.set(u0, v0, u1, v1);
    overlay.flipY = true;
    mat.map = baseTex;
    mat.needsUpdate = true;
  }, [mat, spec, dem, overlay, baseTex]);

  return <mesh geometry={geom} material={mat} receiveShadow name="terrain" />;
}
