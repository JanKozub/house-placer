import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildHouseLayers, LAYERS, toLocal, type PartName } from './geometry';
import { CEILING_GLOW, createMaterials } from './materials';
import type { HouseDef } from './types';
import { rotationY, type Placement } from '../placement/geom2d';

export type HouseMaterials = ReturnType<typeof createMaterials>;

/** one set of house materials shared by every building of the project, following the palette */
export function useHouseMaterials(): HouseMaterials {
  const palette = useStore((s) => s.palette);
  const mats = useMemo(() => createMaterials(palette), []); // eslint-disable-line react-hooks/exhaustive-deps
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    mats.update(palette);
    invalidate();
  }, [palette, mats, invalidate]);
  useEffect(() => () => mats.all.forEach((m) => m.dispose()), [mats]);
  return mats;
}

/** parts that cast no shadow: glass, and flat finishes lying on a floor */
const NO_SHADOW = new Set<PartName>(['glass', 'floor', 'ceiling', 'tile', 'tileDark', 'concrete', 'rug', 'fire']);

/** one building (the house, or a detached garage) at its placement */
export function HouseModel({ house, placement, floorY, night, mats, name = 'house' }: { house: HouseDef; placement: Placement; floorY: number; night: number; mats: HouseMaterials; name?: string }) {
  const interiorLights = useStore((s) => s.layers.interiorLights);
  // looking inside: the roof can be hidden, and the upper storey with it
  const hideUpper = useStore((s) => !!s.layers.hideUpper);
  const hideRoof = useStore((s) => !!s.layers.hideRoof) || hideUpper;
  const layers = useMemo(() => buildHouseLayers(house), [house]);
  useEffect(() => () => LAYERS.forEach((l) => Object.values(layers[l]).forEach((g) => g?.dispose())), [layers]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [hideRoof, hideUpper, invalidate]);
  const shown = { base: true, upper: !hideUpper, roof: !hideRoof };

  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffd59a', emissiveIntensity: 0 }), []);
  lampMat.emissiveIntensity = night * 6;
  const lit = night > 0.05 && interiorLights;
  // ceilings: bounced daylight by day, lamp light at night, dark when the lights are off
  (mats.get('ceiling') as THREE.MeshStandardMaterial).emissiveIntensity = CEILING_GLOW * (1 - night) + (lit ? 0.3 * night : 0);

  return (
    <group position={[placement.x, floorY, placement.z]} rotation={[0, rotationY(placement.bearing), 0]} scale={[placement.mirror ? -1 : 1, 1, 1]}>
      {LAYERS.map((l) =>
        (Object.keys(layers[l]) as PartName[]).map((k) => (
          <mesh
            key={`${l}-${k}`}
            geometry={layers[l][k]}
            material={mats.get(k)}
            visible={shown[l]}
            castShadow={!NO_SHADOW.has(k)}
            receiveShadow
            name={`${name}-${k}`}
          />
        )),
      )}
      {house.wallLamps.map(([X, Y], i) => {
        const [x, z] = toLocal(house, X, Y);
        return (
          <group key={i} position={[x, 2.25, z]}>
            <mesh material={lampMat}>
              <boxGeometry args={[0.12, 0.2, 0.12]} />
            </mesh>
            {lit && <pointLight color="#ffcf8a" intensity={night * 3} distance={6} decay={2} />}
          </group>
        );
      })}
      {lit &&
        house.lights.map(([X, Y], i) => {
          const [x, z] = toLocal(house, X, Y);
          return <pointLight key={i} position={[x, 2.4, z]} color="#ffd9a8" intensity={night * 25} distance={9} decay={2} />;
        })}
    </group>
  );
}
