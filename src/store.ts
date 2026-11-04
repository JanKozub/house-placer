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

export interface AppState {
  tab: 'preview' | 'placement';
  placement: Placement;
  placementInitialised: boolean;
  /** finished floor ±0.00 in m a.s.l.; null = auto (balanced cut/fill) */
  floorLevel: number | null;
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
  setPlacement: (p: Partial<Placement>) => void;
  setSun: (p: Partial<Sun>) => void;
  setPalette: (p: Partial<Palette>) => void;
  setLayers: (p: Partial<AppState['layers']>) => void;
  addGarden: (a: GardenArea) => void;
  addTree: (t: Tree) => void;
  removeSelected: () => void;
  toggleFenceEdge: (i: number) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      tab: 'preview',
      placement: { x: 0, z: 0, bearing: 222, mirror: false },
      placementInitialised: false,
      floorLevel: null,
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
      partialize: (s) => ({
        tab: s.tab,
        placement: s.placement,
        placementInitialised: s.placementInitialised,
        floorLevel: s.floorLevel,
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

export const PERSIST_KEYS = ['placement', 'floorLevel', 'sun', 'palette', 'garden', 'trees', 'fenceEdges', 'fenceHeight', 'buildingLine', 'layers'] as const;
