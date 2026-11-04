import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { motion } from './motion';

/**
 * Ground-truth AO + SMAA using three's own postprocessing (tone mapping applied in OutputPass).
 * Mounted once for the lifetime of the canvas (its shaders take seconds to compile); `enabled`
 * switches it off for the plan view / photo mode, and it renders plainly while the camera moves.
 */
export function PostFX({ enabled, active = true }: { enabled: boolean; active?: boolean }) {
  const { gl, scene, camera, size } = useThree();
  const { composer, renderPass, ao } = useMemo(() => {
    const c = new EffectComposer(gl);
    const rp = new RenderPass(scene, camera);
    c.addPass(rp);
    const a = new GTAOPass(scene, camera, size.width, size.height);
    a.output = GTAOPass.OUTPUT.Default;
    a.blendIntensity = 0.9;
    a.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1, samples: 12 });
    a.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    c.addPass(a);
    c.addPass(new OutputPass());
    c.addPass(new SMAAPass());
    return { composer: c, renderPass: rp, ao: a };
  }, [gl, scene]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, size, gl]);
  useEffect(() => () => composer.dispose(), [composer]);

  useFrame(() => {
    if (!active) return; // someone else (photo mode) renders this frame
    if (!enabled || motion.active) {
      gl.render(scene, camera);
      return;
    }
    // the default camera changes between tabs: keep the passes pointed at the current one
    renderPass.camera = camera;
    ao.camera = camera;
    const persp = (camera as { isPerspectiveCamera?: boolean }).isPerspectiveCamera ? 1 : 0;
    for (const m of [ao.gtaoMaterial, ao.pdMaterial, (ao as unknown as { depthRenderMaterial?: THREE.ShaderMaterial }).depthRenderMaterial]) {
      if (m && m.defines && 'PERSPECTIVE_CAMERA' in m.defines && m.defines.PERSPECTIVE_CAMERA !== persp) {
        m.defines.PERSPECTIVE_CAMERA = persp;
        m.needsUpdate = true;
      }
    }
    composer.render();
  }, 1);
  return null;
}
