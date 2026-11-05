import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useDerived, useSite } from '../derived';
import { useStore } from '../store';
import { HouseModel, useHouseMaterials } from '../house/HouseModel';
import { Terrain } from '../site/Terrain';
import { Fence, Trees } from '../site/Garden';
import { fillSkyTexture, horizonColor, makeSkyTexture } from '../site/sun';
import { Landscape } from '../site/Landscape';
import { Buildings } from '../site/Buildings';
import { bumpMotion } from './motion';

function SkyAndSun({ dir, night, target, shadows }: { dir: THREE.Vector3; night: number; target: THREE.Vector3; shadows: boolean }) {
  const scene = useThree((s) => s.scene);
  const light = useRef<THREE.DirectionalLight>(null!);
  const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
  // one sky texture and one fog object for the lifetime of the scene, updated in place — replacing
  // them would make three.js recompile every shader on each sun-slider step
  const sky = useMemo(() => makeSkyTexture(dir), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fog = useMemo(() => new THREE.FogExp2('#bcd0e6', 0.00006), []);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    scene.background = sky;
    scene.environment = sky;
    scene.environmentIntensity = 1;
    scene.fog = fog;
    return () => sky.dispose();
  }, [scene, sky, fog]);
  useEffect(() => {
    fillSkyTexture(sky, dir);
    // aerial perspective: distant hills fade into the horizon colour (≈30% at 10 km, ≈75% at 20 km)
    const hc = horizonColor(dir);
    fog.color.setRGB(Math.min(hc.r, 1), Math.min(hc.g, 1), Math.min(hc.b, 1));
    bumpMotion(invalidate); // cheap frames while the slider moves, full quality when it stops
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

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

/** gravel strip around the house — flat on the building platform, so a cheap separate mesh */
function ApronMesh({ apron, footprint, y }: { apron: [number, number][]; footprint: [number, number][]; y: number }) {
  const geom = useMemo(() => {
    const shape = new THREE.Shape(apron.map(([x, z]) => new THREE.Vector2(x, z)));
    shape.holes.push(new THREE.Path(footprint.map(([x, z]) => new THREE.Vector2(x, z))));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2); // XY → XZ (y = z)
    g.translate(0, y, 0);
    return g;
  }, [apron, footprint, y]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial color="#a9a49b" roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function SceneContent({ shadows = true, fixedSun }: { shadows?: boolean; fixedSun?: THREE.Vector3 }) {
  const site = useSite();
  const d = useDerived();
  const placement = useStore((s) => s.placement);
  const showBuildings = useStore((s) => s.layers.buildings !== false);
  const target = useMemo(() => new THREE.Vector3(placement.x, d.floorY, placement.z), [placement.x, placement.z, d.floorY]);
  const dir = fixedSun ?? d.sun.dir;
  const night = fixedSun ? 0 : d.sun.night;
  const mats = useHouseMaterials();

  return (
    <>
      <SkyAndSun dir={dir} night={night} target={target} shadows={shadows} />
      <Terrain site={site} platforms={d.platforms} />
      <Landscape site={site} />
      <Buildings site={site} visible={showBuildings} />
      <ApronMesh apron={d.apron} footprint={d.footprint} y={d.platformH - site.baseH + 0.015} />
      <HouseModel house={d.house} placement={placement} floorY={d.floorY} night={night} mats={mats} />
      {d.annexes.map((a) => (
        <group key={a.id}>
          <ApronMesh apron={a.apron} footprint={a.footprint} y={a.platformH - site.baseH + 0.015} />
          <HouseModel house={a.def} placement={a.placement} floorY={a.floorY} night={night} mats={mats} name={a.id} />
        </group>
      ))}
      <Trees site={site} platform={d.platforms} />
      <Fence site={site} platform={d.platforms} />
    </>
  );
}
