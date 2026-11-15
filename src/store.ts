import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { P2, Placement } from './placement/geom2d';
import { GARDEN_AREAS, GARDEN_PLANTS } from './site/gardenPlan';
import { DEFAULT_PROJECT, DEFAULT_SHED, layoutCars, layoutGarden, layoutGates, PROJECT_START, PZT, PZT_CARS, PZT_DRIVEWAY, PZT_FENCE_EDGES, PZT_GATES, SHED_DRIVE, THUJA_HEDGE, type Gate } from './site/sitePlan';

/** painted areas; 'vegbed' is a raised vegetable bed (a timber frame filled with soil) */
export type GardenKind = 'driveway' | 'path' | 'patio' | 'flowerbed' | 'gravel' | 'vegbed';
export interface GardenArea { id: string; kind: GardenKind; points: P2[] }
/** trees, and the smaller plants and objects of a garden (all are points with a height) */
export type TreeKind = 'deciduous' | 'conifer' | 'shrub' | 'birch' | 'thuja' | 'grass' | 'lavender' | 'hydrangea' | 'boxwood' | 'globe' | 'maple' | 'rock' | 'firepit';
export interface Tree { id: string; kind: TreeKind; x: number; z: number; height: number }
/** a parked car: centre in site coords, rot = three.js rotation about Y (car front = local +x) */
export interface Car { id: string; x: number; z: number; rot: number; color: string }

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
  | 'thuja'
  | 'grass'
  | 'lavender'
  | 'hydrangea'
  | 'boxwood'
  | 'globe'
  | 'maple'
  | 'fence'
  | 'buildingLine'
  | 'measure'
  | 'car';

export interface Palette {
  plaster: string;
  roof: string;
  frames: string;
  wood: string;
  plinth: string;
  paving: string;
  /** second render colour of façade zones (e.g. a dark ground-floor band); optional in older saves */
  accent?: string;
}

export const DEFAULT_PALETTE: Palette = {
  plaster: '#f2efe9',
  roof: '#8d9093',
  frames: '#3a3d40',
  wood: '#b07a45',
  plinth: '#55585b',
  paving: '#cfc8bb',
  accent: '#4b4f54',
};

export interface Sun {
  month: number; // 1-12
  day: number;
  minutes: number; // local time (Europe/Warsaw) minutes after midnight
}

/** a separate building of the project (detached garage): its own placement and floor level */
export interface AnnexState { placement: Placement; floorLevel: number | null }

/** an extra building on the plot (shed, garage…), shared by every house project */
export interface Outbuilding { id: string; kind: string; placement: Placement; floorLevel: number | null }

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
  /** which building the placement controls act on: 'main', an annex id or an outbuilding id */
  target: string;
  /** extra buildings on the plot (src/house/outbuildings.ts), shared by all projects */
  outbuildings: Outbuilding[];
  sun: Sun;
  palette: Palette;
  garden: GardenArea[];
  trees: Tree[];
  cars: Car[];
  /** gates set into the fence (an edge without fence shows none) */
  gates: Gate[];
  fenceEdges: number[];
  fenceHeight: number;
  buildingLine: P2[] | null;
  layers: {
    parcelLawn: boolean; neighbors: boolean; ao: boolean; interiorLights: boolean; ortho: boolean; dims: boolean; plan: boolean; roads?: boolean; buildings?: boolean; dimsMode?: DimsMode;
    /** look inside: hide the roof, or the upper storey together with the roof */
    hideRoof?: boolean; hideUpper?: boolean;
  };
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
  addCar: (c: Car) => void;
  removeSelected: () => void;
  toggleFenceEdge: (i: number) => void;
  /** add an extra building of a catalog kind; it becomes the building the controls act on */
  addOutbuilding: (kind: string, placement: Placement) => string;
  removeOutbuilding: (id: string) => void;
}

/** persisted state migration — v1 (single house): everything belonged to Ambrozja 17 */
export function migrateState(state: unknown, version: number) {
  const s = (state ?? {}) as Partial<AppState>;
  let out: Partial<AppState> = s;
  if (version < 2) out = { ...out, projectId: 'ambrozja17', projectState: {} };
  if (version < 3) out = { ...out, annexes: {}, target: 'main' };
  if (version < 4) out = { ...out, outbuildings: [] };
  if (version < 5) {
    // the PZT site layout arrives for everyone who hasn't laid out their own drive / fence yet
    const garden = out.garden ?? [];
    out = {
      ...out,
      cars: out.cars ?? PZT_CARS,
      garden: garden.some((g) => g.kind === 'driveway') ? garden : [...garden, PZT_DRIVEWAY],
      gates: PZT_GATES,
      fenceEdges: out.fenceEdges?.length ? out.fenceEdges : PZT_FENCE_EDGES,
    };
  } else if (version < 6) {
    // v5 had a guessed forecourt with gate necks: the PZT one is the exact drawn outline, and the
    // gates are explicit; the PZT house moved 8 cm onto the drawn walls (depth 12.40)
    const OLD = { x: -3.95, z: -12.29 };
    const wasPzt = (pl?: Placement) => !!pl && Math.abs(pl.x - OLD.x) < 0.005 && Math.abs(pl.z - OLD.z) < 0.005 && Math.abs(pl.bearing - 51.3) < 0.05;
    const carAt = new Map(PZT_CARS.map((c) => [c.id, c]));
    out = {
      ...out,
      garden: (out.garden ?? []).filter((g) => g.id !== 'pzt-wicket').map((g) => (g.id === PZT_DRIVEWAY.id ? PZT_DRIVEWAY : g)),
      gates: out.gates ?? PZT_GATES,
      cars: (out.cars ?? []).map((c) => (carAt.has(c.id) ? { ...c, ...carAt.get(c.id)!, color: c.color } : c)),
    };
    if (out.projectId === PZT.projectId && wasPzt(out.placement)) out.placement = { ...PZT.placement };
    const ps = out.projectState?.[PZT.projectId];
    if (ps && wasPzt(ps.placement)) out.projectState = { ...out.projectState, [PZT.projectId]: { ...ps, placement: { ...PZT.placement } } };
  }
  if (version < 7) {
    // the garden as planned in November 2026: thuja hedges instead of whatever was planted before,
    // the shed with its drive where the family put it, and the compromise variant opens first
    const near = (o: Outbuilding) => o.kind === DEFAULT_SHED.kind && Math.hypot(o.placement.x - DEFAULT_SHED.placement.x, o.placement.z - DEFAULT_SHED.placement.z) < 0.5;
    const had = out.outbuildings ?? [];
    const outbuildings = had.length ? had.map((o) => (near(o) ? { ...o, floorLevel: DEFAULT_SHED.floorLevel } : o)) : [DEFAULT_SHED];
    const garden = (out.garden ?? []).filter((g) => g.id !== SHED_DRIVE.id);
    out = { ...out, trees: THUJA_HEDGE, outbuildings, garden: outbuildings.some(near) ? [...garden, SHED_DRIVE] : garden };
    const id = DEFAULT_PROJECT;
    if (out.projectId && out.projectId !== id && out.placement) {
      const saved = { ...(out.projectState ?? {}), [out.projectId]: { placement: out.placement, floorLevel: out.floorLevel ?? null, annexes: out.annexes } };
      const next = saved[id] ?? { placement: { ...PROJECT_START[id].placement }, floorLevel: PROJECT_START[id].floorLevel };
      out = { ...out, projectId: id, projectState: saved, placement: next.placement, floorLevel: next.floorLevel, annexes: next.annexes ?? {}, target: 'main' };
    }
  }
  if (version < 8) {
    // the designed garden: beds, paths, the fire-pit circle, raised vegetable beds and their plants,
    // added to whatever is there (same ids are not added twice)
    const trees = out.trees ?? [], garden = out.garden ?? [];
    const hasT = new Set(trees.map((t) => t.id)), hasG = new Set(garden.map((g) => g.id));
    out = { ...out, trees: [...trees, ...GARDEN_PLANTS.filter((t) => !hasT.has(t.id))], garden: [...garden, ...GARDEN_AREAS.filter((g) => !hasG.has(g.id))] };
  }
  return out;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      tab: 'preview',
      // new visitors start on the compromise variant of Dom w Arganiach (returning visitors keep their own positions)
      projectId: DEFAULT_PROJECT,
      projectState: {},
      placement: { ...PROJECT_START[DEFAULT_PROJECT].placement },
      placementInitialised: true,
      floorLevel: PROJECT_START[DEFAULT_PROJECT].floorLevel,
      annexes: {},
      target: 'main',
      outbuildings: [DEFAULT_SHED],
      sun: { month: 6, day: 21, minutes: 17 * 60 },
      palette: DEFAULT_PALETTE,
      // the PZT layout: the drawn forecourt, gate and wicket in the north-east fence, fence all round, two cars at the garage;
      // plus the garden: the shed's drive and thuja hedges along the road and both neighbours
      garden: [PZT_DRIVEWAY, SHED_DRIVE, ...GARDEN_AREAS],
      trees: [...THUJA_HEDGE, ...GARDEN_PLANTS],
      cars: PZT_CARS,
      gates: PZT_GATES,
      fenceEdges: PZT_FENCE_EDGES,
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
        const next =
          saved[id] ??
          // a house never placed before starts where the previous one stood — the PZT houses at their PZT spot
          (PROJECT_START[id] ? { placement: { ...PROJECT_START[id].placement }, floorLevel: PROJECT_START[id].floorLevel } : { placement: { ...s.placement, mirror: false }, floorLevel: null });
        set({ projectId: id, projectState: saved, placement: next.placement, floorLevel: next.floorLevel, annexes: next.annexes ?? {}, target: 'main', selected: null });
      },
      setPlacement: (p) => set({ placement: { ...get().placement, ...p } }),
      setSun: (p) => set({ sun: { ...get().sun, ...p } }),
      setPalette: (p) => set({ palette: { ...get().palette, ...p } }),
      setLayers: (p) => set({ layers: { ...get().layers, ...p } }),
      addGarden: (a) => set({ garden: [...get().garden, a] }),
      addTree: (t) => set({ trees: [...get().trees, t] }),
      addCar: (c) => set({ cars: [...get().cars, c] }),
      removeSelected: () => {
        const id = get().selected;
        if (!id) return;
        set({ garden: get().garden.filter((g) => g.id !== id), trees: get().trees.filter((t) => t.id !== id), cars: get().cars.filter((c) => c.id !== id), selected: null });
      },
      addOutbuilding: (kind, placement) => {
        const id = `ob-${uid()}`;
        set({ outbuildings: [...get().outbuildings, { id, kind, placement, floorLevel: null }], target: id, selected: null });
        return id;
      },
      removeOutbuilding: (id) => {
        const s = get();
        set({ outbuildings: s.outbuildings.filter((o) => o.id !== id), target: s.target === id ? 'main' : s.target });
      },
      toggleFenceEdge: (i) => {
        const e = get().fenceEdges;
        set({ fenceEdges: e.includes(i) ? e.filter((x) => x !== i) : [...e, i] });
      },
    }),
    {
      name: 'house-placer-v1',
      version: 8,
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
        outbuildings: s.outbuildings,
        sun: s.sun,
        palette: s.palette,
        garden: s.garden,
        trees: s.trees,
        cars: s.cars,
        gates: s.gates,
        fenceEdges: s.fenceEdges,
        fenceHeight: s.fenceHeight,
        buildingLine: s.buildingLine,
        layers: s.layers,
      }),
    },
  ),
);

// The garden areas, cars and gates as shown for the active project: a project that stands elsewhere
// than the PZT house has its own forecourt, gates and cars (PROJECT_LAYOUT in src/site/sitePlan.ts).
export const useGarden = (): GardenArea[] => {
  const garden = useStore((s) => s.garden), id = useStore((s) => s.projectId);
  return useMemo(() => layoutGarden(id, garden), [id, garden]);
};
export const useCars = (): Car[] => {
  const cars = useStore((s) => s.cars), id = useStore((s) => s.projectId);
  return useMemo(() => layoutCars(id, cars), [id, cars]);
};
export const useGates = (): Gate[] => {
  const gates = useStore((s) => s.gates), id = useStore((s) => s.projectId);
  return useMemo(() => layoutGates(id, gates), [id, gates]);
};

export const PERSIST_KEYS = ['projectId', 'projectState', 'placement', 'floorLevel', 'annexes', 'outbuildings', 'sun', 'palette', 'garden', 'trees', 'cars', 'gates', 'fenceEdges', 'fenceHeight', 'buildingLine', 'layers'] as const;
