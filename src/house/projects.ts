/**
 * The house projects the app can switch between. To add one, write a HouseDef in
 * src/house/<id>.ts (see types.ts) and list it here.
 */
import { useStore } from '../store';
import { ambrozja17 } from './ambrozja17';
import { grela } from './grela';
import { ambrozja17Detached } from './ambrozja17-detached';
import type { HouseDef } from './types';

export const HOUSE_LIST: HouseDef[] = [ambrozja17, ambrozja17Detached, grela];
export const HOUSES: Record<string, HouseDef> = Object.fromEntries(HOUSE_LIST.map((h) => [h.id, h]));
export const DEFAULT_HOUSE_ID = ambrozja17.id;

export const houseById = (id: string | undefined): HouseDef => HOUSES[id ?? ''] ?? HOUSES[DEFAULT_HOUSE_ID];

/** the active house project */
export const useHouse = (): HouseDef => houseById(useStore((s) => s.projectId));
