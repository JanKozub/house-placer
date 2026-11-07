/**
 * Separate buildings of a project (detached garage): where they stand and which one the
 * placement controls act on.
 */
import { useStore, type AnnexState } from '../store';
import { toSite, type Placement } from '../placement/geom2d';
import { toLocal } from './geometry';
import { useHouse } from './projects';
import type { Annex, HouseDef } from './types';
import { outbuildingKind } from './outbuildings';

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

/** where a newly added extra building starts: 4 m beside the house (its local +x side), same bearing */
export function defaultOutbuildingPlacement(house: HouseDef, def: HouseDef, main: Placement): Placement {
  const c = toSite([house.width / 2 + 4 + def.width / 2, 0], main);
  return { x: Math.round(c[0] * 100) / 100, z: Math.round(c[1] * 100) / 100, bearing: main.bearing, mirror: false };
}

/** the building the placement controls act on: the house, an annex of the active project, or an extra building */
export function useTarget(): { id: string; label: string; annex: Annex | null; def: HouseDef; placement: Placement; floorLevel: number | null } {
  const house = useHouse();
  const target = useStore((s) => s.target);
  const main = useStore((s) => s.placement);
  const mainFloor = useStore((s) => s.floorLevel);
  const stored = useStore((s) => s.annexes);
  const obs = useStore((s) => s.outbuildings);
  const annex = house.annexes?.find((a) => a.id === target) ?? null;
  if (annex) return { id: annex.id, label: annex.label, annex, def: annex.def, ...annexState(house, annex, main, stored) };
  const ob = obs.find((o) => o.id === target);
  const kind = ob && outbuildingKind(ob.kind);
  if (ob && kind) return { id: ob.id, label: kind.label, annex: null, def: kind.def, placement: ob.placement, floorLevel: ob.floorLevel };
  return { id: 'main', label: 'Dom', annex: null, def: house, placement: main, floorLevel: mainFloor };
}

/** move / rotate / mirror one building ('main', an annex id or an extra building id) */
export function setBuildingPlacement(house: HouseDef, id: string, p: Partial<Placement>) {
  const s = useStore.getState();
  if (s.outbuildings.some((o) => o.id === id)) {
    s.set({ outbuildings: s.outbuildings.map((o) => (o.id === id ? { ...o, placement: { ...o.placement, ...p } } : o)) });
    return;
  }
  const annex = house.annexes?.find((a) => a.id === id);
  if (!annex) return s.setPlacement(p);
  const cur = annexState(house, annex, s.placement, s.annexes);
  s.set({ annexes: { ...s.annexes, [id]: { ...cur, placement: { ...cur.placement, ...p } } } });
}

/** set one building's floor level (null = auto) */
export function setBuildingFloor(house: HouseDef, id: string, floorLevel: number | null) {
  const s = useStore.getState();
  if (s.outbuildings.some((o) => o.id === id)) {
    s.set({ outbuildings: s.outbuildings.map((o) => (o.id === id ? { ...o, floorLevel } : o)) });
    return;
  }
  const annex = house.annexes?.find((a) => a.id === id);
  if (!annex) return s.set({ floorLevel });
  const cur = annexState(house, annex, s.placement, s.annexes);
  s.set({ annexes: { ...s.annexes, [id]: { ...cur, floorLevel } } });
}

/** the definition (plan, size) of one building: the house, a project annex or an extra building */
export function buildingDef(house: HouseDef, id: string): HouseDef {
  const annex = house.annexes?.find((a) => a.id === id);
  if (annex) return annex.def;
  const ob = useStore.getState().outbuildings.find((o) => o.id === id);
  return (ob && outbuildingKind(ob.kind)?.def) ?? house;
}

/** current placement of one building, read outside React (event handlers) */
export function buildingPlacement(house: HouseDef, id: string): Placement {
  const s = useStore.getState();
  const ob = s.outbuildings.find((o) => o.id === id);
  if (ob) return ob.placement;
  const annex = house.annexes?.find((a) => a.id === id);
  return annex ? annexState(house, annex, s.placement, s.annexes).placement : s.placement;
}
