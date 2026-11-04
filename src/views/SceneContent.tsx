import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useDerived, useSite } from '../derived';
import { useStore } from '../store';
import { HouseModel } from '../house/HouseModel';
import { Terrain } from '../site/Terrain';
import { Fence, Trees } from '../site/Garden';
import { makeSkyTexture } from '../site/sun';

function SkyAndSun({ dir, night, target, shadows }: { dir: THREE.Vector3; night: number; target: THREE.Vector3; shadows: boolean }) {
  const scene = useThree((s) => s.scene);
  const light = useRef<THREE.DirectionalLight>(null!);
  const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
  const sky = useMemo(() => makeSkyTexture(dir), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = 1;
    return () => sky.dispose();
  }, [scene, sky]);

  const alt = Math.asin(dir.y);
  const intensity = THREE.MathUtils.clamp((alt + 0.02) / 0.2, 0, 1) * 3.2;
  const warm = THREE.MathUtils.clamp(1 - alt / 0.35, 0, 1);
  const color = new THREE.Color('#fff6ea').lerp(new THREE.Color('#ffb070'), warm * 0.8);
  const pos = target.clone().addScaledVector(dir.clone().setY(Math.max(dir.y, 0.02)).normalize(), 180);

  useEffect(() => {
    light.current.target.position.copy(target);
    light.current.target.updateMatrixWorld();
  }, [target]);

  return (
    <>
      <directionalLight
        ref={light}
        position={pos}
        intensity={intensity}
        color={color}
        castShadow={shadows && intensity > 0.01}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-near={50}
        shadow-camera-far={320}
      />
      <hemisphereLight args={['#bcd4ff', '#4b5a33', 0.15 * (1 - night) + 0.02]} />
    </>
  );
}

export function SceneContent({ shadows = true, fixedSun }: { shadows?: boolean; fixedSun?: THREE.Vector3 }) {
  const site = useSite();
  const d = useDerived();
  const placement = useStore((s) => s.placement);
  const target = useMemo(() => new THREE.Vector3(placement.x, d.floorY, placement.z), [placement.x, placement.z, d.floorY]);
  const dir = fixedSun ?? d.sun.dir;
  const night = fixedSun ? 0 : d.sun.night;

  return (
    <>
      <SkyAndSun dir={dir} night={night} target={target} shadows={shadows} />
      <Terrain site={site} platform={d.platform} apron={d.apron} />
      <HouseModel placement={placement} floorY={d.floorY} night={night} />
      <Trees site={site} platform={d.platform} />
      <Fence site={site} platform={d.platform} />
    </>
  );
}
