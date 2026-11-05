/**
 * Separate buildings of a project (detached garage): where they stand and which one the
 * placement controls act on.
 */
import { useStore, type AnnexState } from '../store';
import { toSite, type Placement } from '../placement/geom2d';
import { toLocal } from './geometry';
import { useHouse } from './projects';
import type { Annex, HouseDef } from './types';

/** where an annex starts when it has never been moved: its default spot next to the house */
export function defaultAnnexPlacement(house: HouseDef, annex: Annex, main: Placement): Placement {
  const [ax, ay] = annex.defaultAt;
  const c = toSite(toLocal(house, ax + annex.def.width / 2, ay + annex.def.depth / 2), main);
  return { x: Math.round(c[0] * 100) / 100, z: Math.round(c[1] * 100) / 100, bearing: main.bearing, mirror: main.mirror };
}

/** an annex's placement and floor-level setting (stored, or its default spot on auto level) */
export function annexState(house: HouseDef, annex: Annex, main: Placement, stored: Record<string, AnnexState>): AnnexState {
  return stored[annex.id] ?? { placement: defaultAnnexPlacement(house, annex, main), floorLevel: null };
}

/** the building the placement controls act on: 'main' or an annex of the active project */
export function useTarget(): { id: string; annex: Annex | null; def: HouseDef; placement: Placement; floorLevel: number | null } {
  const house = useHouse();
  const target = useStore((s) => s.target);
  const main = useStore((s) => s.placement);
  const mainFloor = useStore((s) => s.floorLevel);
  const stored = useStore((s) => s.annexes);
  const annex = house.annexes?.find((a) => a.id === target) ?? null;
  if (!annex) return { id: 'main', annex: null, def: house, placement: main, floorLevel: mainFloor };
  const st = annexState(house, annex, main, stored);
  return { id: annex.id, annex, def: annex.def, ...st };
}

/** move / rotate / mirror one building of the active project ('main' or an annex id) */
export function setBuildingPlacement(house: HouseDef, id: string, p: Partial<Placement>) {
  const s = useStore.getState();
  const annex = house.annexes?.find((a) => a.id === id);
  if (!annex) return s.setPlacement(p);
  const cur = annexState(house, annex, s.placement, s.annexes);
  s.set({ annexes: { ...s.annexes, [id]: { ...cur, placement: { ...cur.placement, ...p } } } });
}

/** set one building's floor level (null = auto) */
export function setBuildingFloor(house: HouseDef, id: string, floorLevel: number | null) {
  const s = useStore.getState();
  const annex = house.annexes?.find((a) => a.id === id);
  if (!annex) return s.set({ floorLevel });
  const cur = annexState(house, annex, s.placement, s.annexes);
  s.set({ annexes: { ...s.annexes, [id]: { ...cur, floorLevel } } });
}

/** current placement of one building, read outside React (event handlers) */
export function buildingPlacement(house: HouseDef, id: string): Placement {
  const s = useStore.getState();
  const annex = house.annexes?.find((a) => a.id === id);
  return annex ? annexState(house, annex, s.placement, s.annexes).placement : s.placement;
}
