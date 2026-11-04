import { Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PostFX } from './PostFX';
import { SceneContent } from './SceneContent';
import { useDerived, useSite } from '../derived';
import { useStore } from '../store';
import { PhotoRenderer, type PhotoProgress } from './PhotoMode';
import { SiteContext } from '../derived';
import { carvedHeight } from '../site/Terrain';

export type ViewPreset = 'street' | 'entrance' | 'garden' | 'aerial' | 'side';

function CameraRig({ preset, nonce }: { preset: ViewPreset; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const site = useSite();
  const d = useDerived();
  const pl = useStore((s) => s.placement);
  useEffect(() => {
    if (!controls) return;
    const b = (pl.bearing * Math.PI) / 180;
    const f = new THREE.Vector2(Math.sin(b), -Math.cos(b)); // front direction in (x,z)
    const side = new THREE.Vector2(-f.y, f.x);
    const c = new THREE.Vector2(pl.x, pl.z);
    const ground = (p: THREE.Vector2) => carvedHeight(site, p.x, p.y, d.platform) - site.baseH;
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
  }, [preset, nonce, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function PreviewView() {
  const site = useSite();
  const ao = useStore((s) => s.layers.ao);
  const [preset, setPreset] = useState<ViewPreset>('street');
  const [nonce, setNonce] = useState(0);
  const [photo, setPhoto] = useState<{ target: number } | null>(null);
  const [progress, setProgress] = useState<PhotoProgress | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const go = (p: ViewPreset) => { setPreset(p); setNonce((n) => n + 1); };

  return (
    <div className="viewport">
      <Canvas
        ref={canvasRef}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 2]}
        camera={{ fov: 50, near: 0.1, far: 2000, position: [40, 20, 40] }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1 }}
      >
        <SiteContext.Provider value={site}>
          <Suspense fallback={null}>
            <SceneContent />
          </Suspense>
          <OrbitControls makeDefault enabled={!photo} enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.495} minDistance={2} maxDistance={400} />
          <CameraRig preset={preset} nonce={nonce} />
          {!photo && ao && <PostFX />}
          {photo && <PhotoRenderer target={photo.target} onProgress={setProgress} />}
        </SiteContext.Provider>
      </Canvas>

      <div className="view-toolbar">
        {(['street', 'entrance', 'side', 'garden', 'aerial'] as ViewPreset[]).map((p) => (
          <button key={p} className={preset === p ? 'on' : ''} onClick={() => go(p)}>
            {{ street: 'From road', entrance: 'Entrance', side: 'Side', garden: 'Garden', aerial: 'Aerial' }[p]}
          </button>
        ))}
        <span className="sep" />
        {!photo ? (
          <button className="primary" onClick={() => { setProgress(null); setPhoto({ target: 400 }); }}>
            Photo (path traced)
          </button>
        ) : (
          <button onClick={() => setPhoto(null)}>Exit photo</button>
        )}
      </div>

      {photo && (
        <div className="photo-hud">
          {progress?.done ? (
            <>
              <span>Done · {progress.samples} samples</span>
              <a className="btn primary" href={progress.url} download={`ambrozja17-dz664-2-${Date.now()}.png`}>Download PNG</a>
            </>
          ) : (
            <span>Path tracing… {progress?.samples ?? 0} / {photo.target} samples (don’t move the camera)</span>
          )}
          <div className="bar"><div style={{ width: `${Math.min(100, ((progress?.samples ?? 0) / photo.target) * 100)}%` }} /></div>
        </div>
      )}
    </div>
  );
}
