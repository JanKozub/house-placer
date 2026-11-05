import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { create } from 'zustand';
import { OrbitControls } from '@react-three/drei';
import { Attribution } from '../ui/Attribution';
import { useDerived, useSite } from '../derived';
import { useStore } from '../store';
import { PhotoRenderer, type PhotoProgress } from './PhotoMode';
import { carvedHeight } from '../site/Terrain';
import { valleyBearing } from '../site/Landscape';
import { openingSpan, toLocal } from '../house/geometry';
import { useHouse } from '../house/projects';
import type { HouseDef } from '../house/types';
import { footprintSite } from '../placement/setbacks';
import { toSite, closestOnSegment, pointInPolygon, type P2, type Placement } from '../placement/geom2d';
import { compassPl, localToLatLon, trueBearing } from '../geo/proj';
import { f } from '../ui/format';

export type ViewPreset = 'street' | 'entrance' | 'garden' | 'aerial' | 'side' | 'valley' | 'terrace' | 'living' | 'kitchen' | 'bedroom';

type HouseViewKey = keyof HouseDef['views'];
const HOUSE_VIEW_KEYS: HouseViewKey[] = ['valley', 'terrace', 'living', 'kitchen', 'bedroom'];
const isHouseView = (p: ViewPreset): p is HouseViewKey => (HOUSE_VIEW_KEYS as string[]).includes(p);

function CameraRig({ preset, nonce, valley }: { preset: ViewPreset; nonce: number; valley: number | null }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const site = useSite();
  const d = useDerived();
  const pl = useStore((s) => s.placement);
  const house = useHouse();
  useEffect(() => {
    if (!controls) return;
    if (isHouseView(preset)) {
      const v = house.views[preset];
      const eye = v.at === 'valleyWindow' ? valleyWindow(house, pl, valley ?? pl.bearing).eye : toSite(toLocal(house, ...v.at), pl);
      let dir: P2;
      if (v.look === 'valley') {
        dir = valleyWindow(house, pl, valley ?? pl.bearing).look;
      } else {
        const at = v.at as P2;
        const p2 = toSite(toLocal(house, at[0] + v.look[0], at[1] + v.look[1]), pl);
        dir = [p2[0] - eye[0], p2[1] - eye[1]];
      }
      const y = d.floorY + v.h;
      camera.position.set(eye[0], y, eye[1]);
      controls.target.set(eye[0] + dir[0] * 0.05, y - 0.004, eye[1] + dir[1] * 0.05);
      camera.fov = 70;
      camera.updateProjectionMatrix();
      controls.update();
      return;
    }
    camera.fov = 50;
    camera.updateProjectionMatrix();
    const b = (pl.bearing * Math.PI) / 180;
    const f = new THREE.Vector2(Math.sin(b), -Math.cos(b)); // front direction in (x,z)
    const side = new THREE.Vector2(-f.y, f.x);
    const c = new THREE.Vector2(pl.x, pl.z);
    const ground = (p: THREE.Vector2) => carvedHeight(site, p.x, p.y, d.platforms) - site.baseH;
    let eye: THREE.Vector2, h: number, tgtH = d.floorY + 2.2;
    switch (preset) {
      case 'street': eye = c.clone().addScaledVector(f, 26).addScaledVector(side, -9); h = 1.7; break;
      case 'entrance': eye = c.clone().addScaledVector(f, 15).addScaledVector(side, 4); h = 1.7; break;
      case 'garden': eye = c.clone().addScaledVector(f, -24).addScaledVector(side, 8); h = 1.7; break;
      case 'side': eye = c.clone().addScaledVector(side, 26).addScaledVector(f, 4); h = 1.7; break;
      case 'aerial': default: eye = c.clone().addScaledVector(f, 32).addScaledVector(side, -22); h = 28; tgtH = d.floorY; break;
    }
    camera.position.set(eye.x, ground(eye) + h, eye.y);
    controls.target.set(c.x, tgtH, c.y);
    controls.update();
  }, [preset, nonce, controls, house]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The window / glazed door whose wall faces the valley most directly; the eye is placed 0.8 m
 * inside it, so the view is what you'd see standing at that window.
 */
function valleyWindow(house: HouseDef, pl: Placement, valleyDeg: number) {
  const fp = footprintSite(house, pl);
  const vr = (valleyDeg * Math.PI) / 180;
  const vdir: P2 = [Math.sin(vr), -Math.cos(vr)];
  let best = { score: -Infinity, eye: [pl.x, pl.z] as P2, ref: '', look: vdir };
  for (const o of house.openings) {
    if (o.kind === 'garage' || o.kind === 'door' || o.kind === 'entrance') continue;
    const w = house.walls.find((ww) => ww.id === o.wall)!;
    const a = toSite(toLocal(house, ...w.a), pl), b = toSite(toLocal(house, ...w.b), pl);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let n: P2 = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (pointInPolygon([mid[0] + n[0] * 0.05, mid[1] + n[1] * 0.05], fp)) n = [-n[0], -n[1]];
    const score = n[0] * vdir[0] + n[1] * vdir[1] + (o.height > 2 ? 0.05 : 0); // prefer tall glazing on ties
    if (score > best.score) {
      const { c } = openingSpan(o, w);
      const p: P2 = [a[0] + ((b[0] - a[0]) / L) * c, a[1] + ((b[1] - a[1]) / L) * c];
      // look towards the valley, but no more than 35° off the window's own facing
      const ang = Math.atan2(n[0] * vdir[1] - n[1] * vdir[0], n[0] * vdir[0] + n[1] * vdir[1]);
      const cl = Math.max(-0.61, Math.min(0.61, ang));
      const look: P2 = [n[0] * Math.cos(cl) - n[1] * Math.sin(cl), n[0] * Math.sin(cl) + n[1] * Math.cos(cl)];
      best = { score, eye: [p[0] - n[0] * 0.8, p[1] - n[1] * 0.8], ref: o.ref ?? o.kind, look };
    }
  }
  return best;
}

/** live compass heading of the camera, written straight into a DOM node (no re-renders) */
function HeadingProbe({ out }: { out: React.RefObject<HTMLSpanElement | null> }) {
  const site = useSite();
  const v = useRef(new THREE.Vector3());
  const last = useRef('');
  useFrame(({ camera }) => {
    if (!out.current) return;
    camera.getWorldDirection(v.current);
    const grid = ((Math.atan2(v.current.x, -v.current.z) * 180) / Math.PI + 360) % 360;
    const t = trueBearing(site, camera.position.x, camera.position.z, grid);
    const txt = `${t.toFixed(0)}° (${compassPl(t)})`;
    if (txt !== last.current) { out.current.textContent = txt; last.current = txt; }
  });
  return null;
}

/** preview-tab UI state shared between the in-canvas rig and the HTML overlay */
export const usePreviewUi = create<{
  preset: ViewPreset;
  nonce: number;
  photo: { target: number } | null;
  progress: PhotoProgress | null;
  go: (p: ViewPreset) => void;
  setPhoto: (p: { target: number } | null) => void;
  setProgress: (p: PhotoProgress | null) => void;
}>((set) => ({
  preset: 'street',
  nonce: 0,
  photo: null,
  progress: null,
  go: (preset) => set((s) => ({ preset, nonce: s.nonce + 1 })),
  setPhoto: (photo) => set({ photo }),
  setProgress: (progress) => set({ progress }),
}));

const headingRef: React.RefObject<HTMLSpanElement | null> = { current: null };

function useValley() {
  const site = useSite();
  const pl = useStore((s) => s.placement);
  return useMemo(() => valleyBearing(site, pl.x, pl.z), [site, pl.x, pl.z]);
}

/** everything the 3D-preview tab adds inside the shared <Canvas> */
export function PreviewScene() {
  const { preset, nonce, photo, setProgress } = usePreviewUi();
  const valley = useValley();
  const inside = isHouseView(preset);
  return (
    <>
      {inside ? (
        // look-around from a fixed eye point: orbit a target 5 cm ahead, inverted drag
        <OrbitControls key="look" makeDefault enabled={!photo} enableDamping dampingFactor={0.15} enableZoom={false} enablePan={false} rotateSpeed={-0.35} minDistance={0.01} maxDistance={0.1} minPolarAngle={Math.PI * 0.15} maxPolarAngle={Math.PI * 0.85} />
      ) : (
        <OrbitControls key="orbit" makeDefault enabled={!photo} enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} minDistance={2} maxDistance={3000} />
      )}
      <CameraRig preset={preset} nonce={nonce} valley={valley} />
      <HeadingProbe out={headingRef} />
      {photo && <PhotoRenderer target={photo.target} onProgress={setProgress} />}
    </>
  );
}

/** HTML on top of the canvas for the 3D-preview tab */
export function PreviewOverlay() {
  const site = useSite();
  const { preset, photo, progress, go, setPhoto, setProgress } = usePreviewUi();
  const pl = useStore((s) => s.placement);
  const valley = useValley();
  const house = useHouse();
  const inside = isHouseView(preset);

  // Google Street View from the nearest public road, facing the valley (a plain link — no API key)
  const streetView = useMemo(() => {
    const roads = site.roads.filter((r) => r.surface === 'asphalt' || r.name);
    let best: P2 | null = null, bd = Infinity;
    for (const r of roads)
      for (let i = 1; i < r.pts.length; i++) {
        const q = closestOnSegment([pl.x, pl.z], r.pts[i - 1], r.pts[i]);
        const dd = Math.hypot(q[0] - pl.x, q[1] - pl.z);
        if (dd < bd) { bd = dd; best = q; }
      }
    if (!best) return null;
    const [lat, lon] = localToLatLon(site, best[0], best[1]);
    const heading = valley !== null ? trueBearing(site, best[0], best[1], valley) : 0;
    return { url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}&heading=${heading.toFixed(0)}&pitch=0&fov=90`, dist: bd };
  }, [site, pl.x, pl.z, valley]);

  return (
    <>
      <div className="view-toolbar">
        {(['street', 'entrance', 'side', 'garden', 'aerial'] as ViewPreset[]).map((p) => (
          <button key={p} className={preset === p ? 'on' : ''} onClick={() => go(p)}>
            {{ street: 'Od drogi', entrance: 'Wejście', side: 'Z boku', garden: 'Ogród', aerial: 'Z lotu ptaka' }[p as 'street']}
          </button>
        ))}
        <span className="sep" />
        <span className="toolbar-label">Widok z domu:</span>
        {HOUSE_VIEW_KEYS.map((p) => (
          <button key={p} className={preset === p ? 'on' : ''} onClick={() => go(p)}>{house.views[p].label}</button>
        ))}
        <span className="sep" />
        {!photo ? (
          <button className="primary" onClick={() => { setProgress(null); setPhoto({ target: 400 }); }}>
            Zdjęcie fotorealistyczne
          </button>
        ) : (
          <button onClick={() => setPhoto(null)}>Zamknij zdjęcie</button>
        )}
      </div>

      <div className="view-hud">
        Kierunek widoku: <span ref={(el) => { headingRef.current = el; }}>—</span>
        {valley !== null && <> · dolina: {f(trueBearing(site, pl.x, pl.z, valley), 0)}° ({compassPl(trueBearing(site, pl.x, pl.z, valley))})</>}
        {preset === 'valley' && valley !== null && <> · okno: {valleyWindow(house, pl, valley).ref}</>}
        {inside && <> · przeciągnij, aby się rozejrzeć</>}
        {streetView && (
          <>
            {' · '}
            <a href={streetView.url} target="_blank" rel="noreferrer" title={`Najbliższa droga: ${f(streetView.dist, 0)} m od domu`}>Street View z drogi ↗</a>
          </>
        )}
      </div>
      <Attribution />
      {photo && (
        <div className="photo-hud">
          {progress?.done ? (
            <>
              <span>Gotowe · próbek: {progress.samples}</span>
              <a className="btn primary" href={progress.url} download={`${house.id}-dz${site.meta.parcelNumber.replace('/', '-')}-${Date.now()}.png`}>Pobierz PNG</a>
            </>
          ) : (
            <span>Renderowanie… {progress?.samples ?? 0} / {photo.target} próbek (nie ruszaj kamerą)</span>
          )}
          <div className="bar"><div style={{ width: `${Math.min(100, ((progress?.samples ?? 0) / photo.target) * 100)}%` }} /></div>
        </div>
      )}
    </>
  );
}
