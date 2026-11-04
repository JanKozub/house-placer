import { createContext, useContext, useMemo } from 'react';
import type { Site } from './geo/site';
import { useStore } from './store';
import { house } from './house/ambrozja17';
import { toLocal } from './house/geometry';
import { toSite, type P2, type Placement } from './placement/geom2d';
import { computeEarthwork, offsetPolygon } from './placement/earthwork';
import { computeSetbacks, footprintSite } from './placement/setbacks';
import { sunState } from './site/sun';
import type { PlatformSpec } from './site/Terrain';

export const SiteContext = createContext<Site | null>(null);
export const useSite = () => {
  const s = useContext(SiteContext);
  if (!s) throw new Error('site not loaded');
  return s;
};

/** house bounding rectangle (incl. terrace & porch) in site coords — building platform */
export function platformPolygon(pl: Placement, margin = 1.0): P2[] {
  const rect: P2[] = [
    [-margin, -margin], [house.width + margin, -margin], [house.width + margin, house.depth + margin], [-margin, house.depth + margin],
  ];
  return rect.map(([X, Y]) => toSite(toLocal(X, Y), pl));
}

export function autoFloorLevel(site: Site, pl: Placement) {
  const ew = computeEarthwork(platformPolygon(pl), 0, (x, z) => site.dem.heightAt(x, z), 1);
  // balanced cut/fill: platform at mean terrain height
  return Math.round((ew.terrainMean + house.plinth) * 100) / 100;
}

export function useDerived() {
  const site = useSite();
  const placement = useStore((s) => s.placement);
  const floorLevelSetting = useStore((s) => s.floorLevel);
  const buildingLine = useStore((s) => s.buildingLine);
  const sun = useStore((s) => s.sun);

  return useMemo(() => {
    const autoFloor = autoFloorLevel(site, placement);
    const floorH = floorLevelSetting ?? autoFloor;
    const platformH = floorH - house.plinth;
    const platformPoly = platformPolygon(placement);
    const platform: PlatformSpec = { polygon: platformPoly, h: platformH };
    const fp = footprintSite(placement);
    const apron = offsetPolygon(fp, 0.5);
    const earthwork = computeEarthwork(platformPoly, platformH, (x, z) => site.dem.heightAt(x, z), 0.5);
    const setbacks = computeSetbacks(placement, site.parcel, buildingLine);
    const sunS = sunState(sun, site.meta.origin.lat, site.meta.origin.lon, site.trueNorth);
    return { autoFloor, floorH, platformH, platform, footprint: fp, apron, earthwork, setbacks, sun: sunS, floorY: floorH - site.baseH };
  }, [site, placement, floorLevelSetting, buildingLine, sun]);
}
