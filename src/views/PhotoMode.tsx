import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

export interface PhotoProgress { samples: number; target: number; done: boolean; url?: string }

/**
 * Progressive path tracing of the current scene/camera. Mount inside <Canvas> only while active;
 * useFrame priority 1 takes over rendering from R3F.
 */
export function PhotoRenderer({ target, onProgress }: { target: number; onProgress: (p: PhotoProgress) => void }) {
  const { gl, scene, camera } = useThree();
  const pt = useRef<WebGLPathTracer | null>(null);
  const finished = useRef(false);
  const swapped = useRef<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[]>([]);

  useEffect(() => {
    // the terrain uses a custom shader (overlay blending) the path tracer can't read: bake it
    const terrain = scene.getObjectByName('terrain') as THREE.Mesh | undefined;
    if (terrain) {
      const baked = bakeTerrainMaterial(terrain.material as THREE.MeshStandardMaterial);
      if (baked) {
        swapped.current.push({ mesh: terrain, mat: terrain.material });
        terrain.material = baked;
      }
    }
    // physically transmissive glass for the path tracer
    const glassMats: THREE.MeshPhysicalMaterial[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
      if (o.name === 'house-glass' && m && 'transmission' in m) { m.transmission = 0.95; m.opacity = 1; m.transparent = false; m.needsUpdate = true; glassMats.push(m); }
    });
    // hide raster-only helpers (overlays/labels)
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (o.userData.rasterOnly && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });

    const tracer = new WebGLPathTracer(gl);
    tracer.tiles.set(2, 2);
    tracer.renderDelay = 0;
    tracer.fadeDuration = 0;
    tracer.minSamples = 1;
    tracer.bounces = 6;
    tracer.filterGlossyFactor = 0.5;
    tracer.textureSize.set(2048, 2048);
    tracer.setScene(scene, camera);
    pt.current = tracer;
    finished.current = false;
    onProgress({ samples: 0, target, done: false });
    return () => {
      tracer.dispose();
      pt.current = null;
      for (const s of swapped.current) {
        const m = s.mesh.material as THREE.Material;
        if (m !== s.mat) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
        s.mesh.material = s.mat;
      }
      swapped.current = [];
      hidden.forEach((o) => (o.visible = true));
      glassMats.forEach((m) => { m.transmission = 0; m.opacity = 0.28; m.transparent = true; m.needsUpdate = true; });
    };
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const tracer = pt.current;
    if (!tracer) return;
    if (finished.current) {
      tracer.renderToCanvas = true;
      tracer.renderSample(); // keep the final image displayed (no new samples beyond target are wasted much)
      return;
    }
    tracer.renderSample();
    const s = Math.floor(tracer.samples);
    if (s >= target) {
      finished.current = true;
      const url = gl.domElement.toDataURL('image/png');
      onProgress({ samples: s, target, done: true, url });
    } else if (s % 2 === 0) {
      onProgress({ samples: s, target, done: false });
    }
  }, 1);

  return null;
}

function bakeTerrainMaterial(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial | null {
  const u = m.userData.uniforms;
  if (!u || !m.map) return null;
  const S = 4096;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const baseImg = m.map.image as CanvasImageSource;
  ctx.drawImage(baseImg, 0, 0, S, S);
  const rect = u.overlayRect.value as THREE.Vector4; // u0, v0, u1, v1 (v up)
  const ov = (u.overlayMap.value as THREE.Texture).image as CanvasImageSource;
  const x = rect.x * S, w = (rect.z - rect.x) * S;
  const y = (1 - rect.w) * S, h = (rect.w - rect.y) * S;
  ctx.drawImage(ov, x, y, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1, metalness: 0 });
}
