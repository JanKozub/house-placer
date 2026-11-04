import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildHouse, toLocal, type PartName } from './geometry';
import { createMaterials } from './materials';
import { house } from './ambrozja17';
import { rotationY, type Placement } from '../placement/geom2d';

// a few broad lights (each point light costs every fragment of every lit material)
const LIGHTS: [number, number][] = [
  [3.2, 9.3], [9.6, 12.0], [14.5, 7.2],
];
const WALL_LAMPS: [number, number, number][] = [
  // X, Y, rotation (plan) — just outside the façade
  [9.25 + 0.9, house.walls[6].a[1] + 0.03, 0],
  [house.porch.x1 - 0.03, 20.2, 0],
  [2.9, house.walls[0].a[1] - 0.03, 0],
  [house.walls[1].a[0] - 0.03, 1.4, 0],
];

export function HouseModel({ placement, floorY, night }: { placement: Placement; floorY: number; night: number }) {
  const palette = useStore((s) => s.palette);
  const interiorLights = useStore((s) => s.layers.interiorLights);
  const parts = useMemo(() => buildHouse(), []);
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
      {WALL_LAMPS.map(([X, Y], i) => {
        const [x, z] = toLocal(X, Y);
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
        LIGHTS.map(([X, Y], i) => {
          const [x, z] = toLocal(X, Y);
          return <pointLight key={i} position={[x, 2.4, z]} color="#ffd9a8" intensity={night * 25} distance={9} decay={2} />;
        })}
    </group>
  );
}
