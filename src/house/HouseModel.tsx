import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildHouse, toLocal, type PartName } from './geometry';
import { createMaterials } from './materials';
import { useHouse } from './projects';
import { rotationY, type Placement } from '../placement/geom2d';

export function HouseModel({ placement, floorY, night }: { placement: Placement; floorY: number; night: number }) {
  const palette = useStore((s) => s.palette);
  const interiorLights = useStore((s) => s.layers.interiorLights);
  const house = useHouse();
  const parts = useMemo(() => buildHouse(house), [house]);
  useEffect(() => () => Object.values(parts).forEach((g) => g?.dispose()), [parts]);
  const mats = useMemo(() => createMaterials(palette), []); // eslint-disable-line react-hooks/exhaustive-deps
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    mats.update(palette);
    invalidate();
  }, [palette, mats, invalidate]);
  useEffect(() => () => mats.all.forEach((m) => m.dispose()), [mats]);

  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffd59a', emissiveIntensity: 0 }), []);
  lampMat.emissiveIntensity = night * 6;
  const lit = night > 0.05 && interiorLights;

  return (
    <group position={[placement.x, floorY, placement.z]} rotation={[0, rotationY(placement.bearing), 0]} scale={[placement.mirror ? -1 : 1, 1, 1]}>
      {(Object.keys(parts) as PartName[]).map((k) => (
        <mesh
          key={k}
          geometry={parts[k]}
          material={mats.get(k)}
          castShadow={k !== 'glass' && k !== 'floor' && k !== 'interior'}
          receiveShadow
          name={`house-${k}`}
        />
      ))}
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
