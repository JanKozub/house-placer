import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Site } from '../geo/site';
import { closestOnSegment, pointInPolygon, type P2 } from '../placement/geom2d';
import { makeDetailTexture, makeFallbackBase, paintOverlay, type OverlaySpec } from './groundPaint';
import { useStore } from '../store';

export interface PlatformSpec {
  polygon: P2[];
  /** platform height, m a.s.l. */
  h: number;
}

function distToPolygon(p: P2, poly: P2[]) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  return d;
}

/** terrain height after the building platform is carved in (m a.s.l.) */
export function carvedHeight(site: Site, x: number, z: number, platform: PlatformSpec | null) {
  const h = site.dem.heightAt(x, z);
  if (!platform) return h;
  const p: P2 = [x, z];
  if (pointInPolygon(p, platform.polygon)) return platform.h;
  const d = distToPolygon(p, platform.polygon);
  const delta = h - platform.h;
  const w = THREE.MathUtils.clamp(Math.abs(delta) * 2, 0.3, 10); // 1:2 embankment
  if (d >= w) return h;
  const t = d / w;
  return platform.h + delta * (t * t * (3 - 2 * t));
}

export function overlaySpec(site: Site): OverlaySpec {
  let cx = 0, cz = 0;
  for (const [x, z] of site.parcel) { cx += x; cz += z; }
  cx /= site.parcel.length; cz /= site.parcel.length;
  const size = 120;
  return { x0: cx - size / 2, z0: cz - size / 2, size, px: 4096 };
}

export function Terrain({ site, platform, apron }: { site: Site; platform: PlatformSpec | null; apron: P2[] | null }) {
  const garden = useStore((s) => s.garden);
  const lawn = useStore((s) => s.layers.parcelLawn);
  const useOrtho = useStore((s) => s.layers.ortho);
  const dem = site.dem;

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
  useEffect(() => {
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    const W = dem.width;
    for (const k of carvedRef.current) pos.setY(k, dem.data[k] - site.baseH);
    carvedRef.current = [];
    if (platform) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of platform.polygon) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      const m = 11;
      const i0 = Math.max(0, Math.floor((minX - m - dem.x0) / dem.res)), i1 = Math.min(W - 1, Math.ceil((maxX + m - dem.x0) / dem.res));
      const j0 = Math.max(0, Math.floor((minZ - m - dem.z0) / dem.res)), j1 = Math.min(dem.height - 1, Math.ceil((maxZ + m - dem.z0) / dem.res));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * W + i;
          const x = pos.getX(k), z = pos.getZ(k);
          const h = carvedHeight(site, x, z, platform);
          if (Math.abs(h - dem.data[k]) > 1e-4) {
            // keep the mesh slightly under the platform so slabs never z-fight
            pos.setY(k, h - site.baseH - (pointInPolygon([x, z], platform.polygon) ? 0.03 : 0));
            carvedRef.current.push(k);
          }
        }
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
  }, [geom, platform, dem, site]);

  // textures
  const [orthoTex, setOrthoTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!site.orthoUrl) return;
    new THREE.TextureLoader().load(site.orthoUrl, setOrthoTex, undefined, () => setOrthoTex(null));
  }, [site.orthoUrl]);
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
    paintOverlay(overlay.image as HTMLCanvasElement, spec, { parcel: site.parcel, lawn, garden, apron });
    overlay.needsUpdate = true;
  }, [overlay, spec, site, lawn, garden, apron]);

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
          diffuseColor.rgb *= 0.78 + 0.44 * dt;`,
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
    const base = site.orthoUrl && useOrtho && orthoTex ? orthoTex : fallback;
    base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = 8;
    mat.map = base;
    mat.needsUpdate = true;
  }, [mat, spec, dem, overlay, orthoTex, fallback, site.orthoUrl, useOrtho]);

  return <mesh geometry={geom} material={mat} receiveShadow name="terrain" />;
}
