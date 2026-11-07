import { createContext, createElement, useContext, useMemo } from 'react';
import type { Site } from './geo/site';
import { useStore } from './store';
import { useHouse } from './house/projects';
import type { HouseDef } from './house/types';
import { toLocal } from './house/geometry';
import { polygonGap, toSite, type P2, type Placement } from './placement/geom2d';
import { annexState } from './house/annex';
import { outbuildingKind } from './house/outbuildings';
import { computeEarthwork, offsetPolygon } from './placement/earthwork';
import { computeSetbacks, footprintSite, nearestCornerDistances, type CornerDistance } from './placement/setbacks';
import { sunState } from './site/sun';
import type { PlatformSpec } from './site/Terrain';

export const SiteContext = createContext<Site | null>(null);
export const useSite = () => {
  const s = useContext(SiteContext);
  if (!s) throw new Error('site not loaded');
  return s;
};

/** house bounding rectangle (incl. terrace & porch) in site coords — building platform */
export function platformPolygon(house: HouseDef, pl: Placement, margin = 1.0): P2[] {
  const rect: P2[] = [
    [-margin, -margin], [house.width + margin, -margin], [house.width + margin, house.depth + margin], [-margin, house.depth + margin],
  ];
  return rect.map(([X, Y]) => toSite(toLocal(house, X, Y), pl));
}

export function autoFloorLevel(site: Site, house: HouseDef, pl: Placement) {
  const ew = computeEarthwork(platformPolygon(house, pl), 0, (x, z) => site.dem.heightAt(x, z), 1);
  // balanced cut/fill: platform at mean terrain height
  return Math.round((ew.terrainMean + house.plinth) * 100) / 100;
}

/** platform, setbacks, corners and earthwork of one building at its placement */
function buildingGeo(site: Site, house: HouseDef, placement: Placement, floorLevelSetting: number | null, buildingLine: P2[] | null, patios: P2[][]) {
  const autoFloor = autoFloorLevel(site, house, placement);
  const floorH = floorLevelSetting ?? autoFloor;
  const platformH = floorH - house.plinth;
  const platformPoly = platformPolygon(house, placement);
  const platform: PlatformSpec = { polygon: platformPoly, h: platformH };
  const fp = footprintSite(house, placement);
  const apron = offsetPolygon(fp, 0.5);
  const earthwork = computeEarthwork(platformPoly, platformH, (x, z) => site.dem.heightAt(x, z), 0.5);
  const setbacks = computeSetbacks(house, placement, site.parcel, buildingLine);
  const corners: CornerDistance[] = nearestCornerDistances(house, placement, site.parcel, patios);
  return { autoFloor, floorH, platformH, platform, footprint: fp, apron, earthwork, setbacks, corners, floorY: floorH - site.baseH };
}

export type BuildingGeo = ReturnType<typeof buildingGeo>;

/** computes everything derived from the store once; provided via <DerivedProvider> */
function useComputeDerived() {
  const site = useSite();
  const house = useHouse();
  const placement = useStore((s) => s.placement);
  const floorLevelSetting = useStore((s) => s.floorLevel);
  const annexStore = useStore((s) => s.annexes);
  const outbuildings = useStore((s) => s.outbuildings);
  const buildingLine = useStore((s) => s.buildingLine);
  const sun = useStore((s) => s.sun);
  const garden = useStore((s) => s.garden);

  const patios = useMemo(() => garden.filter((g) => g.kind === 'patio').map((g) => g.points), [garden]);
  const main = useMemo(() => buildingGeo(site, house, placement, floorLevelSetting, buildingLine, patios), [site, house, placement, floorLevelSetting, buildingLine, patios]);
  // separate buildings (detached garage): own placement, platform and floor level; corners G1, G2…
  const annexes = useMemo(
    () =>
      (house.annexes ?? []).map((a) => {
        const st = annexState(house, a, placement, annexStore);
        const g = buildingGeo(site, a.def, st.placement, st.floorLevel, buildingLine, []);
        const letter = a.label.charAt(0).toUpperCase();
        return { ...g, corners: g.corners.map((c) => ({ ...c, label: `${letter}${c.corner + 1}` })), id: a.id, label: a.label, letter, def: a.def, placement: st.placement, floorLevel: st.floorLevel, outbuilding: false };
      }),
    [site, house, placement, annexStore, buildingLine],
  );
  // extra buildings on the plot (shared by all projects): W1, W2…; a second copy W2·1, W2·2…
  const extra = useMemo(() => {
    const seen = new Map<string, number>();
    return outbuildings.flatMap((o) => {
      const k = outbuildingKind(o.kind);
      if (!k) return [];
      const n = (seen.get(o.kind) ?? 0) + 1;
      seen.set(o.kind, n);
      const letter = n > 1 ? `${k.letter}${n}·` : k.letter;
      const g = buildingGeo(site, k.def, o.placement, o.floorLevel, buildingLine, []);
      return [{ ...g, corners: g.corners.map((c) => ({ ...c, label: `${letter}${c.corner + 1}` })), id: o.id, label: n > 1 ? `${k.label} ${n}` : k.label, letter, def: k.def, placement: o.placement, floorLevel: o.floorLevel, outbuilding: true }];
    });
  }, [site, outbuildings, buildingLine]);
  const geo = useMemo(() => {
    const all = [...annexes, ...extra];
    const platforms = [main.platform, ...all.map((a) => a.platform)];
    // house ↔ each separate building: shortest distance between the walls
    const gaps = all.map((a) => ({ ...polygonGap(main.footprint, a.footprint), id: a.id, label: a.label }));
    return { ...main, annexes: all, platforms, gaps };
  }, [main, annexes, extra]);
  // the sun doesn't depend on the house: don't recompute it on every drag
  const sunS = useMemo(() => sunState(sun, site.meta.origin.lat, site.meta.origin.lon, site.trueNorth), [sun, site]);
  return useMemo(() => ({ ...geo, house, sun: sunS }), [geo, house, sunS]);
}

export type Derived = ReturnType<typeof useComputeDerived>;
export const DerivedContext = createContext<Derived | null>(null);

/** compute derived values once per state change and share them with every consumer */
export function DerivedProvider({ children }: { children: React.ReactNode }) {
  const d = useComputeDerived();
  return createElement(DerivedContext.Provider, { value: d }, children);
}

export const useDerived = (): Derived => {
  const d = useContext(DerivedContext);
  if (!d) throw new Error('DerivedProvider missing');
  return d;
};
