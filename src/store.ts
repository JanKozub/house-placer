import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { P2, Placement } from './placement/geom2d';

export type GardenKind = 'driveway' | 'path' | 'patio' | 'flowerbed' | 'gravel';
export interface GardenArea { id: string; kind: GardenKind; points: P2[] }
export type TreeKind = 'deciduous' | 'conifer' | 'shrub' | 'birch';
export interface Tree { id: string; kind: TreeKind; x: number; z: number; height: number }

/** what the plan view dimensions: corner → every plot edge, wall → facing edges (WT §12), or nothing */
export type DimsMode = 'corners' | 'walls' | 'off';

export type Tool =
  | 'select'
  | 'driveway'
  | 'path'
  | 'patio'
  | 'flowerbed'
  | 'gravel'
  | 'deciduous'
  | 'conifer'
  | 'birch'
  | 'shrub'
  | 'fence'
  | 'buildingLine'
  | 'measure';

export interface Palette {
  plaster: string;
  roof: string;
  frames: string;
  wood: string;
  plinth: string;
  paving: string;
}

export const DEFAULT_PALETTE: Palette = {
  plaster: '#f2efe9',
  roof: '#8d9093',
  frames: '#3a3d40',
  wood: '#b07a45',
  plinth: '#55585b',
  paving: '#cfc8bb',
};

export interface Sun {
  month: number; // 1-12
  day: number;
  minutes: number; // local time (Europe/Warsaw) minutes after midnight
}

/** a separate building of the project (detached garage): its own placement and floor level */
export interface AnnexState { placement: Placement; floorLevel: number | null }

/** per-house state: where each project stands on the plot */
export interface ProjectState { placement: Placement; floorLevel: number | null; annexes?: Record<string, AnnexState> }

export interface AppState {
  tab: 'preview' | 'placement';
  /** active house project (src/house/projects.ts) */
  projectId: string;
  /** saved placement / floor level of the inactive projects */
  projectState: Record<string, ProjectState>;
  placement: Placement;
  placementInitialised: boolean;
  /** finished floor ±0.00 in m a.s.l.; null = auto (balanced cut/fill) */
  floorLevel: number | null;
  /** the active project's separate buildings, by annex id (missing = default spot, auto level) */
  annexes: Record<string, AnnexState>;
  /** which building the placement controls act on: 'main' or an annex id */
  target: string;
  sun: Sun;
  palette: Palette;
  garden: GardenArea[];
  trees: Tree[];
  fenceEdges: number[];
  fenceHeight: number;
  buildingLine: P2[] | null;
  layers: { parcelLawn: boolean; neighbors: boolean; ao: boolean; interiorLights: boolean; ortho: boolean; dims: boolean; plan: boolean; roads?: boolean; buildings?: boolean; dimsMode?: DimsMode };
  tool: Tool;
  selected: string | null;

  set: (p: Partial<AppState>) => void;
  /** switch house: keeps each project's placement and floor level; garden etc. are shared */
  setProject: (id: string) => void;
  setPlacement: (p: Partial<Placement>) => void;
  setSun: (p: Partial<Sun>) => void;
  setPalette: (p: Partial<Palette>) => void;
  setLayers: (p: Partial<AppState['layers']>) => void;
  addGarden: (a: GardenArea) => void;
  addTree: (t: Tree) => void;
  removeSelected: () => void;
  toggleFenceEdge: (i: number) => void;
}

/** persisted state migration — v1 (single house): everything belonged to Ambrozja 17 */
export function migrateState(state: unknown, version: number) {
  const s = (state ?? {}) as Partial<AppState>;
  let out: Partial<AppState> = s;
  if (version < 2) out = { ...out, projectId: 'ambrozja17', projectState: {} };
  if (version < 3) out = { ...out, annexes: {}, target: 'main' };
  return out;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      tab: 'preview',
      projectId: 'ambrozja17',
      projectState: {},
      placement: { x: 0, z: 0, bearing: 222, mirror: false },
      placementInitialised: false,
      floorLevel: null,
      annexes: {},
      target: 'main',
      sun: { month: 6, day: 21, minutes: 17 * 60 },
      palette: DEFAULT_PALETTE,
      garden: [],
      trees: [],
      fenceEdges: [],
      fenceHeight: 1.5,
      buildingLine: null,
      layers: { parcelLawn: true, neighbors: true, ao: true, interiorLights: true, ortho: true, dims: true, plan: true, roads: true, buildings: true, dimsMode: 'corners' },
      tool: 'select',
      selected: null,

      set: (p) => set(p),
      setProject: (id) => {
        const s = get();
        if (id === s.projectId) return;
        const saved = { ...s.projectState, [s.projectId]: { placement: s.placement, floorLevel: s.floorLevel, annexes: s.annexes } };
        const next = saved[id] ?? { placement: { ...s.placement, mirror: false }, floorLevel: null };
        set({ projectId: id, projectState: saved, placement: next.placement, floorLevel: next.floorLevel, annexes: next.annexes ?? {}, target: 'main', selected: null });
      },
      setPlacement: (p) => set({ placement: { ...get().placement, ...p } }),
      setSun: (p) => set({ sun: { ...get().sun, ...p } }),
      setPalette: (p) => set({ palette: { ...get().palette, ...p } }),
      setLayers: (p) => set({ layers: { ...get().layers, ...p } }),
      addGarden: (a) => set({ garden: [...get().garden, a] }),
      addTree: (t) => set({ trees: [...get().trees, t] }),
      removeSelected: () => {
        const id = get().selected;
        if (!id) return;
        set({ garden: get().garden.filter((g) => g.id !== id), trees: get().trees.filter((t) => t.id !== id), selected: null });
      },
      toggleFenceEdge: (i) => {
        const e = get().fenceEdges;
        set({ fenceEdges: e.includes(i) ? e.filter((x) => x !== i) : [...e, i] });
      },
    }),
    {
      name: 'house-placer-v1',
      version: 3,
      migrate: (state, version) => migrateState(state, version) as AppState,
      partialize: (s) => ({
        tab: s.tab,
        projectId: s.projectId,
        projectState: s.projectState,
        placement: s.placement,
        placementInitialised: s.placementInitialised,
        floorLevel: s.floorLevel,
        annexes: s.annexes,
        target: s.target,
        sun: s.sun,
        palette: s.palette,
        garden: s.garden,
        trees: s.trees,
        fenceEdges: s.fenceEdges,
        fenceHeight: s.fenceHeight,
        buildingLine: s.buildingLine,
        layers: s.layers,
      }),
    },
  ),
);

export const PERSIST_KEYS = ['projectId', 'projectState', 'placement', 'floorLevel', 'annexes', 'sun', 'palette', 'garden', 'trees', 'fenceEdges', 'fenceHeight', 'buildingLine', 'layers'] as const;
