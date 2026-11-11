/**
 * Parked cars (simple hatchback / estate shapes): a body extruded from a side profile, a dark
 * glass band, four wheels and lights. Car front = local +x.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { Site } from '../geo/site';
import { useStore, type Car } from '../store';
import { carvedHeight, type PlatformSpec } from './Terrain';

const L = 4.6, W = 1.82;

function profile(pts: [number, number][]) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

// side profile (x along the car, front at +x; y up), metres
const BODY = profile([
  [-2.3, 0.32], [2.3, 0.32], [2.32, 0.62], [2.18, 0.84], [1.0, 0.98], [0.3, 1.44], [-1.15, 1.47], [-1.95, 1.08], [-2.3, 1.0],
]);
const GLASS = profile([[0.92, 1.0], [0.34, 1.4], [-1.1, 1.43], [-1.86, 1.07]]);

function makeGeometries() {
  const body = new THREE.ExtrudeGeometry(BODY, { depth: W, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, steps: 1 });
  body.translate(0, 0, -W / 2);
  const glass = new THREE.ExtrudeGeometry(GLASS, { depth: W - 0.06, bevelEnabled: false });
  glass.translate(0, 0, -(W - 0.06) / 2);
  glass.scale(1, 1, 1.02);
  const tyre = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20);
  tyre.rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 14);
  rim.rotateX(Math.PI / 2);
  const lamp = new THREE.BoxGeometry(0.06, 0.1, 0.36);
  return { body, glass, tyre, rim, lamp };
}

const WHEELS: [number, number][] = [[1.42, W / 2 - 0.06], [1.42, -W / 2 + 0.06], [-1.45, W / 2 - 0.06], [-1.45, -W / 2 + 0.06]];

function CarModel({ car, site, platforms, geo, mats }: { car: Car; site: Site; platforms: PlatformSpec[]; geo: ReturnType<typeof makeGeometries>; mats: Record<string, THREE.Material> }) {
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: car.color, metalness: 0.6, roughness: 0.32, envMapIntensity: 1.1 }), [car.color]);
  useEffect(() => () => paint.dispose(), [paint]);
  // stand on the ground under the wheels
  const c = Math.cos(car.rot), s = Math.sin(car.rot);
  const hs = WHEELS.map(([wx, wz]) => carvedHeight(site, car.x + wx * c + wz * s, car.z - wx * s + wz * c, platforms));
  const y = hs.reduce((a, b) => a + b, 0) / hs.length - site.baseH;
  return (
    <group position={[car.x, y, car.z]} rotation={[0, car.rot, 0]} name={`car-${car.id}`}>
      <mesh geometry={geo.body} material={paint} castShadow receiveShadow />
      <mesh geometry={geo.glass} material={mats.glass} />
      {WHEELS.map(([wx, wz], i) => (
        <group key={i} position={[wx, 0.33, wz]}>
          <mesh geometry={geo.tyre} material={mats.tyre} castShadow />
          <mesh geometry={geo.rim} material={mats.rim} />
        </group>
      ))}
      <mesh geometry={geo.lamp} material={mats.head} position={[2.33, 0.72, 0.6]} />
      <mesh geometry={geo.lamp} material={mats.head} position={[2.33, 0.72, -0.6]} />
      <mesh geometry={geo.lamp} material={mats.tail} position={[-2.33, 0.86, 0.62]} />
      <mesh geometry={geo.lamp} material={mats.tail} position={[-2.33, 0.86, -0.62]} />
    </group>
  );
}

export function Cars({ site, platforms }: { site: Site; platforms: PlatformSpec[] }) {
  const cars = useStore((s) => s.cars);
  const invalidate = useThree((s) => s.invalidate);
  const geo = useMemo(makeGeometries, []);
  const mats = useMemo(
    () => ({
      glass: new THREE.MeshStandardMaterial({ color: '#1b2229', metalness: 0.4, roughness: 0.08, envMapIntensity: 1.4 }),
      tyre: new THREE.MeshStandardMaterial({ color: '#151617', roughness: 0.9 }),
      rim: new THREE.MeshStandardMaterial({ color: '#b9bdc2', metalness: 0.8, roughness: 0.3 }),
      head: new THREE.MeshStandardMaterial({ color: '#f4f6f8', emissive: '#30343a', roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: '#8f1414', emissive: '#2a0505', roughness: 0.3 }),
    }),
    [],
  );
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); Object.values(mats).forEach((m) => m.dispose()); }, [geo, mats]);
  useEffect(() => invalidate(), [cars, invalidate]);
  return (
    <group name="cars">
      {cars.map((c) => (
        <CarModel key={c.id} car={c} site={site} platforms={platforms} geo={geo} mats={mats} />
      ))}
    </group>
  );
}

/** car length / width, for picking in the plan view */
export const CAR_SIZE = { length: L, width: W };
