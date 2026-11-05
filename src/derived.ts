import { createContext, createElement, useContext, useMemo } from 'react';
import type { Site } from './geo/site';
import { useStore } from './store';
import { useHouse } from './house/projects';
import type { HouseDef } from './house/types';
import { toLocal } from './house/geometry';
import { polygonGap, toSite, type P2, type Placement } from './placement/geom2d';
import { annexState } from './house/annex';
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
        const prefix = a.label.charAt(0).toUpperCase();
        return { ...g, corners: g.corners.map((c) => ({ ...c, label: `${prefix}${c.corner + 1}` })), id: a.id, label: a.label, def: a.def, placement: st.placement, floorLevel: st.floorLevel };
      }),
    [site, house, placement, annexStore, buildingLine],
  );
  const geo = useMemo(() => {
    const platforms = [main.platform, ...annexes.map((a) => a.platform)];
    // house ↔ first separate building
    const gap = annexes.length ? { ...polygonGap(main.footprint, annexes[0].footprint), label: annexes[0].label } : null;
    return { ...main, annexes, platforms, gap };
  }, [main, annexes]);
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
