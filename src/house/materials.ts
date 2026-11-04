/**
 * Procedural PBR-ish materials (canvas textures), so the app has no external asset dependencies.
 * UVs throughout the model are in metres; each texture tile covers `tile` metres.
 */
import * as THREE from 'three';
import type { Palette } from '../store';
import type { PartName } from './geometry';

type Draw = (ctx: CanvasRenderingContext2D, s: number) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(size: number, draw: Draw, tile: number, color = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

function noise(ctx: CanvasRenderingContext2D, s: number, base: string, amp: number, seed = 1, grain = 1) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  const img = ctx.getImageData(0, 0, s, s);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amp * 255 * grain;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const greyNoise = (amp: number, seed: number): Draw => (ctx, s) => noise(ctx, s, '#808080', amp, seed);

export const textures = {
  plasterBump: () => canvasTex(512, greyNoise(0.5, 3), 1.5, false),
  roofBump: () =>
    canvasTex(
      256,
      (ctx, s) => {
        ctx.fillStyle = '#707070';
        ctx.fillRect(0, 0, s, s);
        // 2 seams per metre along u
        for (const x of [0, s / 2]) {
          const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
          g.addColorStop(0, '#707070');
          g.addColorStop(0.5, '#ffffff');
          g.addColorStop(1, '#707070');
          ctx.fillStyle = g;
          ctx.fillRect(x - 6, 0, 12, s);
          ctx.fillRect(x - 6 + s, 0, 12, s);
        }
        // subtle panel micro-ribs
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        for (const x of [s / 6, s / 3, (2 * s) / 3, (5 * s) / 6]) ctx.fillRect(x, 0, 2, s);
      },
      1,
      false,
    ),
  wood: (base: string) =>
    canvasTex(
      512,
      (ctx, s) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        const r = rng(7);
        const planks = 8; // 12.5 cm boards per metre
        for (let p = 0; p < planks; p++) {
          const y = (p * s) / planks;
          const shade = (r() - 0.5) * 0.18;
          ctx.fillStyle = shade > 0 ? `rgba(255,240,220,${shade})` : `rgba(40,20,0,${-shade})`;
          ctx.fillRect(0, y, s, s / planks);
          for (let k = 0; k < 14; k++) {
            ctx.strokeStyle = `rgba(60,30,10,${0.05 + r() * 0.08})`;
            ctx.lineWidth = 1 + r() * 1.5;
            ctx.beginPath();
            const yy = y + r() * (s / planks);
            ctx.moveTo(0, yy);
            for (let x = 0; x <= s; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + k) * 2);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(30,15,5,0.55)';
          ctx.fillRect(0, y, s, 2);
        }
      },
      1,
    ),
  garage: (base: string) =>
    canvasTex(
      512,
      (ctx, s) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        const r = rng(11);
        for (let k = 0; k < 60; k++) {
          ctx.strokeStyle = `rgba(60,30,10,${0.04 + r() * 0.08})`;
          ctx.lineWidth = 1 + r() * 2;
          const y = r() * s;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(s, y + (r() - 0.5) * 6);
          ctx.stroke();
        }
        // sectional panel joints every 0.5 m
        ctx.fillStyle = 'rgba(20,10,0,0.6)';
        ctx.fillRect(0, 0, s, 4);
        ctx.fillRect(0, s / 2, s, 4);
      },
      1,
    ),
  paving: (base: string, size = 0.6) =>
    canvasTex(
      512,
      (ctx, s) => {
        noise(ctx, s, base, 0.12, 5);
        const n = Math.round(1.2 / size);
        ctx.strokeStyle = 'rgba(60,55,50,0.45)';
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          const p = (i * s) / n;
          ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(s, p); ctx.stroke();
        }
      },
      1.2,
    ),
};

export interface MaterialSet {
  get: (p: PartName) => THREE.Material;
  update: (palette: Palette) => void;
  all: THREE.Material[];
}

export function createMaterials(palette: Palette): MaterialSet {
  const plasterBump = textures.plasterBump();
  const roofBump = textures.roofBump();
  const m: Record<PartName, THREE.Material> = {
    plaster: new THREE.MeshStandardMaterial({ color: palette.plaster, roughness: 0.92, bumpMap: plasterBump, bumpScale: 0.6 }),
    plinth: new THREE.MeshStandardMaterial({ color: palette.plinth, roughness: 0.85, bumpMap: plasterBump, bumpScale: 0.8 }),
    roof: new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.55, metalness: 0.25, bumpMap: roofBump, bumpScale: 2.5, envMapIntensity: 0.45 }),
    soffit: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, map: textures.wood(palette.wood) }),
    trim: new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.45, metalness: 0.6, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: palette.frames, roughness: 0.45, metalness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#d9e4ea', metalness: 0, roughness: 0.02, transmission: 0.92, thickness: 0.02, ior: 1.52, transparent: true, opacity: 0.35, envMapIntensity: 1.4,
    }),
    wood: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, map: textures.wood(palette.wood) }),
    garageDoor: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, map: textures.garage(palette.wood) }),
    sill: new THREE.MeshStandardMaterial({ color: palette.frames, roughness: 0.4, metalness: 0.5 }),
    floor: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, map: textures.wood('#c9a57a') }),
    interior: new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 0.95 }),
    paving: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, map: textures.paving(palette.paving) }),
    gutter: new THREE.MeshStandardMaterial({ color: palette.roof, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }),
  };
  return {
    get: (p) => m[p],
    all: Object.values(m),
    update(pal) {
      (m.plaster as THREE.MeshStandardMaterial).color.set(pal.plaster);
      (m.plinth as THREE.MeshStandardMaterial).color.set(pal.plinth);
      (m.roof as THREE.MeshStandardMaterial).color.set(pal.roof);
      (m.trim as THREE.MeshStandardMaterial).color.set(pal.roof);
      (m.gutter as THREE.MeshStandardMaterial).color.set(pal.roof);
      (m.frame as THREE.MeshStandardMaterial).color.set(pal.frames);
      (m.sill as THREE.MeshStandardMaterial).color.set(pal.frames);
      for (const k of ['soffit', 'wood'] as const) {
        const mm = m[k] as THREE.MeshStandardMaterial;
        mm.map?.dispose();
        mm.map = textures.wood(pal.wood);
        mm.needsUpdate = true;
      }
      const gd = m.garageDoor as THREE.MeshStandardMaterial;
      gd.map?.dispose();
      gd.map = textures.garage(pal.wood);
      gd.needsUpdate = true;
      const pv = m.paving as THREE.MeshStandardMaterial;
      pv.map?.dispose();
      pv.map = textures.paving(pal.paving);
      pv.needsUpdate = true;
    },
  };
}
