/**
 * One persistent <Canvas> shared by both tabs: the scene (terrain, landscape, house, garden) is
 * built once and kept; switching tabs only swaps camera, controls and overlays.
 *
 * Performance:
 *  - frameloop="demand": nothing renders while idle; controls/edits invalidate.
 *  - shadows are re-rendered only when something that casts them changes.
 *  - while the camera is moving, resolution drops and post-processing is skipped (see `motion`).
 */
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { DerivedContext, SiteContext, useDerived, useSite } from '../derived';
import { useStore } from '../store';
import { SceneContent } from './SceneContent';
import { PLAN_SUN, PlacementOverlay, PlacementScene } from './PlacementView';
import { PreviewOverlay, PreviewScene, usePreviewUi } from './PreviewView';

import { holdMotion, motion } from './motion';
import { PostFX } from './PostFX';

const DPR_IDLE = Math.min(window.devicePixelRatio || 1, 2);
const DPR_MOVING = 1;

/** drops resolution and post-processing while the user drags the view */
function AdaptiveQuality() {
  const controls = useThree((s) => s.controls) as unknown as THREE.EventDispatcher<{ start: object; end: object }> | null;
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!controls) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      clearTimeout(t);
      if (!motion.active) setDpr(DPR_MOVING);
      holdMotion(true);
    };
    const end = () => {
      clearTimeout(t);
      // wait for damping to settle, then render one full-quality frame
      t = setTimeout(() => {
        holdMotion(false);
        motion.active = false;
        setDpr(DPR_IDLE);
        invalidate();
      }, 250);
    };
    controls.addEventListener('start', start);
    controls.addEventListener('end', end);
    return () => {
      clearTimeout(t);
      controls.removeEventListener('start', start);
      controls.removeEventListener('end', end);
    };
  }, [controls, setDpr, invalidate]);
  return null;
}

/** re-render the (static) shadow map only when shadow casters or the sun change */
function ShadowCache() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const d = useDerived();
  const tab = useStore((s) => s.tab);
  const placement = useStore((s) => s.placement);
  const annexes = useStore((s) => s.annexes);
  const trees = useStore((s) => s.trees);
  const fenceEdges = useStore((s) => s.fenceEdges);
  const fenceHeight = useStore((s) => s.fenceHeight);
  const garden = useStore((s) => s.garden);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
  }, [gl]);
  // throttled: while the house is dragged, refresh shadows at most every 150 ms (and once at the end)
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const fire = () => {
      last.current = performance.now();
      gl.shadowMap.needsUpdate = true;
      invalidate();
    };
    clearTimeout(timer.current);
    if (performance.now() - last.current > 150) fire();
    else timer.current = setTimeout(fire, 150);
  }, [gl, invalidate, d.sun.dir.x, d.sun.dir.y, d.sun.dir.z, d.floorY, tab, placement, annexes, d.annexes, trees, fenceEdges, fenceHeight, garden]);
  return null;
}

/** dev only: expose the R3F state for profiling from the console */
function DevHandle() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window as object, { __r3f: get, __store: useStore });
  }, [get]);
  return null;
}

export function Viewport() {
  const site = useSite();
  const tab = useStore((s) => s.tab);
  const tool = useStore((s) => s.tool);
  const photo = usePreviewUi((s) => s.photo);
  const derived = useDerived();
  const ao = useStore((s) => s.layers.ao);
  return (
    <div className={`viewport ${tab === 'placement' ? `tool-${tool}` : ''}`}>
      <Canvas
        frameloop={photo ? 'always' : 'demand'}
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={DPR_IDLE}
        camera={{ fov: 50, near: 0.2, far: 90000, position: [40, 20, 40] }}
        gl={{ antialias: false, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1, powerPreference: 'high-performance' }}
      >
        <SiteContext.Provider value={site}>
        <DerivedContext.Provider value={derived}>
          <Suspense fallback={null}>
            <SceneContent fixedSun={tab === 'placement' ? PLAN_SUN : undefined} />
          </Suspense>
          {tab === 'preview' ? <PreviewScene /> : <PlacementScene />}
          <PostFX enabled={tab === 'preview' && ao} active={!photo} />
          <AdaptiveQuality />
          <ShadowCache />
          <DevHandle />
        </DerivedContext.Provider>
        </SiteContext.Provider>
      </Canvas>
      {tab === 'preview' ? <PreviewOverlay /> : <PlacementOverlay />}
    </div>
  );
}
